import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import readline from "node:readline";

type RuntimeLog = {
  level?: number;
  time?: number;
  component?: string;
  msg?: string;
  passed?: boolean;
  reasons?: string[];
  viabilityReason?: "ok" | "below-min-notional" | "cost-too-high";
  recentMedianRealizedPnlBps?: number;
  metrics?: {
    totalSignals?: number;
    riskRejected?: number;
    executed?: number;
    skippedMinNotional?: number;
    wins?: number;
    losses?: number;
  };
  walletBalanceUsd?: number;
  reason?: "stop-loss" | "trailing-stop" | "take-profit" | "max-hold" | "stale-tick" | "kill-switch";
  fastStopoutCircuitBreakerActive?: boolean;
};

type Decision = {
  key: string;
  from: string;
  to: string;
  reason: string;
};

type ParsedEnv = {
  values: Map<string, string>;
  lines: string[];
};

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const envArg = argv.find((arg) => arg.startsWith("--env="));
const envPath = resolve(process.cwd(), envArg ? envArg.slice("--env=".length) : ".env");
const cooldownArg = argv.find((arg) => arg.startsWith("--cooldown-ms="));
const decisionCooldownMs = Number(cooldownArg ? cooldownArg.slice("--cooldown-ms=".length) : 60_000);
const verbose = !argv.includes("--quiet");
const passthrough = !argv.includes("--no-passthrough");

const BOUNDS = {
  ONYX_MAX_RISK_PER_TRADE_BPS: { min: 100, max: 1200, step: 100 },
  ONYX_MIN_TRADE_NOTIONAL_USD: { min: 1.25, max: 5, step: 0.25 },
  ONYX_MIN_NET_EDGE_BPS: { min: 200, max: 2600, step: 100 },
  ONYX_MAX_SLIPPAGE_BPS: { min: 1200, max: 3200, step: 50 },
  ONYX_ADAPTIVE_EDGE_RELIEF_MAX_BPS: { min: 20, max: 220, step: 10 },
  ONYX_MAX_HOLDER_CONCENTRATION_BPS: { min: 3000, max: 9000, step: 250 },
  ONYX_MAX_CREATOR_SUPPLY_SHARE_BPS: { min: 1000, max: 3500, step: 100 },
  ONYX_QUALITY_SNIPE_MIN_SCORE: { min: 40, max: 75, step: 1 },
  ONYX_VOLUME_GATE_MIN_TICKS: { min: 2, max: 25, step: 1 },
  ONYX_VOLUME_GATE_MIN_BUY_TICKS: { min: 1, max: 12, step: 1 }
} as const;

const DEFAULTS: Record<keyof typeof BOUNDS, number> = {
  ONYX_MAX_RISK_PER_TRADE_BPS: 200,
  ONYX_MIN_TRADE_NOTIONAL_USD: 3,
  ONYX_MIN_NET_EDGE_BPS: 250,
  ONYX_MAX_SLIPPAGE_BPS: 2200,
  ONYX_ADAPTIVE_EDGE_RELIEF_MAX_BPS: 90,
  ONYX_MAX_HOLDER_CONCENTRATION_BPS: 4000,
  ONYX_MAX_CREATOR_SUPPLY_SHARE_BPS: 1500,
  ONYX_QUALITY_SNIPE_MIN_SCORE: 58,
  ONYX_VOLUME_GATE_MIN_TICKS: 8,
  ONYX_VOLUME_GATE_MIN_BUY_TICKS: 4
};

const stats = {
  signalPassed: 0,
  signalRejected: 0,
  riskRejectSlippage: 0,
  riskRejectConcentration: 0,
  skipNotional: 0,
  skipBelowNotional: 0,
  skipCostTooHigh: 0,
  volumeGateBlocks: 0,
  executedFromHeartbeat: 0,
  winsFromHeartbeat: 0,
  lossesFromHeartbeat: 0,
  recentMedianRealizedPnlBps: 0,
  walletBalanceUsdFromHeartbeat: 0,
  totalExits: 0,
  stopLossExits: 0,
  fastStopoutCircuitBreakerActive: false
};

let lastDecisionAt = 0;
let lastStatusAt = 0;
const recentDirectionByKey = new Map<string, { direction: "up" | "down"; at: number }>();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseEnvFile = (filePath: string): ParsedEnv => {
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const values = new Map<string, string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const idx = line.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    values.set(key, value);
  }
  return { values, lines };
};

const setEnvValue = (parsed: ParsedEnv, key: string, value: string) => {
  parsed.values.set(key, value);
  const prefix = `${key}=`;
  const lineIndex = parsed.lines.findIndex((line) => line.startsWith(prefix));
  if (lineIndex >= 0) {
    parsed.lines[lineIndex] = `${key}=${value}`;
    return;
  }
  parsed.lines.push(`${key}=${value}`);
};

const numberFromEnv = (parsed: ParsedEnv, key: string, fallback: number) => {
  const raw = parsed.values.get(key);
  if (!raw) {
    return fallback;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

const formatNumber = (value: number) => {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
};

const proposeStep = (
  parsed: ParsedEnv,
  key: keyof typeof BOUNDS,
  direction: "up" | "down",
  reason: string,
  decisions: Decision[]
) => {
  const previous = recentDirectionByKey.get(key);
  if (previous && previous.direction === direction) {
    const holdMs = Math.max(decisionCooldownMs * 3, 150_000);
    if (Date.now() - previous.at < holdMs) {
      return;
    }
  }
  const cfg = BOUNDS[key];
  const current = numberFromEnv(parsed, key, DEFAULTS[key]);
  const delta = direction === "up" ? cfg.step : -cfg.step;
  const next = clamp(current + delta, cfg.min, cfg.max);
  if (next === current) {
    return;
  }
  if (direction === "up" && next < current) {
    return;
  }
  if (direction === "down" && next > current) {
    return;
  }
  const nextRaw = formatNumber(next);
  setEnvValue(parsed, key, nextRaw);
  decisions.push({
    key,
    from: formatNumber(current),
    to: nextRaw,
    reason
  });
  recentDirectionByKey.set(key, { direction, at: Date.now() });
};

const proposeMinNetEdgeDownAdaptive = (parsed: ParsedEnv, decisions: Decision[], reason: string) => {
  const key: keyof typeof BOUNDS = "ONYX_MIN_NET_EDGE_BPS";
  const previous = recentDirectionByKey.get(key);
  if (previous && previous.direction === "down") {
    const holdMs = Math.max(decisionCooldownMs * 3, 150_000);
    if (Date.now() - previous.at < holdMs) {
      return;
    }
  }
  const cfg = BOUNDS[key];
  const current = numberFromEnv(parsed, key, DEFAULTS[key]);
  let adaptiveStep = cfg.step;
  if (current > 1200) {
    adaptiveStep = 300;
  } else if (current > 700) {
    adaptiveStep = 200;
  } else if (current > 400) {
    adaptiveStep = 100;
  } else {
    adaptiveStep = 50;
  }
  const next = clamp(current - adaptiveStep, cfg.min, cfg.max);
  if (next === current) {
    return;
  }
  const nextRaw = formatNumber(next);
  setEnvValue(parsed, key, nextRaw);
  decisions.push({
    key,
    from: formatNumber(current),
    to: nextRaw,
    reason
  });
  recentDirectionByKey.set(key, { direction: "down", at: Date.now() });
};

const normalizeDecisions = (decisions: Decision[]) => {
  const byKey = new Map<string, Decision>();
  for (const decision of decisions) {
    byKey.set(decision.key, decision);
  }
  return [...byKey.values()];
};

const proposeRiskDownSafely = ({
  parsed,
  decisions,
  reason,
  minRiskBpsForNotional
}: {
  parsed: ParsedEnv;
  decisions: Decision[];
  reason: string;
  minRiskBpsForNotional: number;
}) => {
  const key: keyof typeof BOUNDS = "ONYX_MAX_RISK_PER_TRADE_BPS";
  const cfg = BOUNDS[key];
  const current = numberFromEnv(parsed, key, DEFAULTS[key]);
  const next = Math.max(cfg.min, current - cfg.step);
  if (next === current) {
    return;
  }
  if (next < minRiskBpsForNotional) {
    return;
  }
  const nextRaw = formatNumber(next);
  setEnvValue(parsed, key, nextRaw);
  decisions.push({
    key,
    from: formatNumber(current),
    to: nextRaw,
    reason
  });
};

const maybeTune = () => {
  const now = Date.now();
  const emitStatus = (status: string, extra?: Record<string, unknown>) => {
    if (!verbose) {
      return;
    }
    process.stdout.write(
      `${JSON.stringify({
        level: 30,
        component: "onyx-autotune",
        apply,
        status,
        totalSignals: stats.signalPassed + stats.signalRejected,
        signalPassed: stats.signalPassed,
        signalRejected: stats.signalRejected,
        skipNotional: stats.skipNotional,
        skipBelowNotional: stats.skipBelowNotional,
        skipCostTooHigh: stats.skipCostTooHigh,
        executed: stats.executedFromHeartbeat,
        ...(extra ?? {})
      })}\n`
    );
  };

  if (now - lastStatusAt >= 20_000) {
    lastStatusAt = now;
    emitStatus("observing");
  }

  if (now - lastDecisionAt < decisionCooldownMs) {
    emitStatus("cooldown", { cooldownRemainingMs: decisionCooldownMs - (now - lastDecisionAt) });
    return;
  }
  const totalSignals = stats.signalPassed + stats.signalRejected;
  const executions = stats.executedFromHeartbeat;
  const wins = stats.winsFromHeartbeat;
  const losses = stats.lossesFromHeartbeat;
  const closedTrades = wins + losses;
  const stopLossExitRate = stats.stopLossExits / Math.max(1, stats.totalExits);
  const medianRealizedPnlBps = stats.recentMedianRealizedPnlBps;
  const minimumExecutionSamples = 4;
  const minimumCloseSamples = 3;
  if (stats.fastStopoutCircuitBreakerActive) {
    emitStatus("fast-stopout-circuit-active");
    return;
  }
  const allowOutcomeDrivenTuning = executions > 0 && losses > 0;
  const allowEarlyCostRegimeTuning =
    executions === 0 &&
    stats.skipCostTooHigh >= 3 &&
    stats.skipBelowNotional === 0 &&
    totalSignals >= 6;
  if (totalSignals < 12 && !allowOutcomeDrivenTuning && !allowEarlyCostRegimeTuning) {
    emitStatus("waiting-min-signals", { minSignalsRequired: 12 });
    return;
  }

  const parsed = parseEnvFile(envPath);
  const decisions: Decision[] = [];
  const minTradeNotionalUsd = numberFromEnv(parsed, "ONYX_MIN_TRADE_NOTIONAL_USD", 1.25);
  const walletBalanceUsd = Math.max(stats.walletBalanceUsdFromHeartbeat, minTradeNotionalUsd);
  const minRiskBpsForNotional = Math.ceil((minTradeNotionalUsd / walletBalanceUsd) * 10_000);

  const skipRate = stats.skipNotional / Math.max(1, totalSignals);
  const belowNotionalRate = stats.skipBelowNotional / Math.max(1, stats.skipNotional);
  const costTooHighRate = stats.skipCostTooHigh / Math.max(1, stats.skipNotional);
  const costTooHighDominatesSkips =
    stats.skipNotional >= 6 &&
    costTooHighRate >= 0.65 &&
    stats.skipCostTooHigh >= Math.max(4, stats.skipBelowNotional * 2);
  const persistentVolumeGateBlocks =
    stats.volumeGateBlocks >= 6 && stats.volumeGateBlocks / Math.max(1, totalSignals) >= 0.25;
  const rejectRate = stats.signalRejected / Math.max(1, totalSignals);
  const slippageRejectRate = stats.riskRejectSlippage / Math.max(1, totalSignals);
  const concentrationRejectRate = stats.riskRejectConcentration / Math.max(1, totalSignals);
  let loweredSlippageForCostRegime = false;

  if (
    executions >= minimumExecutionSamples &&
    losses > 0 &&
    closedTrades >= minimumCloseSamples &&
    medianRealizedPnlBps <= -900
  ) {
    proposeRiskDownSafely({
      parsed,
      decisions,
      minRiskBpsForNotional,
      reason: "realized edge is negative after live executions; reduce risk per trade"
    });
    if (belowNotionalRate < 0.35 && !costTooHighDominatesSkips) {
      proposeStep(
        parsed,
        "ONYX_MIN_NET_EDGE_BPS",
        "up",
        "realized edge is negative after live executions; require stronger edge",
        decisions
      );
    }
    if (stats.volumeGateBlocks <= 2 && belowNotionalRate < 0.45 && !costTooHighDominatesSkips) {
      proposeStep(
        parsed,
        "ONYX_QUALITY_SNIPE_MIN_SCORE",
        "up",
        "realized edge is negative after live executions; tighten quality gate",
        decisions
      );
      proposeStep(
        parsed,
        "ONYX_VOLUME_GATE_MIN_TICKS",
        "up",
        "realized edge is negative after live executions; require stronger flow confirmation",
        decisions
      );
      proposeStep(
        parsed,
        "ONYX_VOLUME_GATE_MIN_BUY_TICKS",
        "up",
        "realized edge is negative after live executions; require stronger buy-side flow",
        decisions
      );
    }
  }

  if (executions >= minimumExecutionSamples && stats.totalExits >= minimumCloseSamples && stopLossExitRate >= 0.6) {
    proposeStep(
      parsed,
      "ONYX_QUALITY_SNIPE_MIN_SCORE",
      "up",
      "stop-loss exits dominate live closes; tighten pre-entry quality to avoid immediate downside",
      decisions
    );
    proposeStep(
      parsed,
      "ONYX_MIN_NET_EDGE_BPS",
      "up",
      "stop-loss exits dominate live closes; require stronger net edge before entry",
      decisions
    );
    proposeStep(
      parsed,
      "ONYX_ADAPTIVE_EDGE_RELIEF_MAX_BPS",
      "down",
      "stop-loss exits dominate closes; reduce adaptive edge relief near micro-notional floor",
      decisions
    );
  }

  if (executions > 0 && costTooHighDominatesSkips) {
    proposeMinNetEdgeDownAdaptive(
      parsed,
      decisions,
      "cost-too-high skips dominate despite executions; avoid ratcheting edge floor into no-trade regime"
    );
    if (persistentVolumeGateBlocks && stats.volumeGateBlocks >= 4) {
      proposeStep(
        parsed,
        "ONYX_VOLUME_GATE_MIN_TICKS",
        "down",
        "cost-too-high skip mix plus frequent volume blocks; avoid over-tightening flow gate",
        decisions
      );
      proposeStep(
        parsed,
        "ONYX_VOLUME_GATE_MIN_BUY_TICKS",
        "down",
        "cost-too-high skip mix plus frequent volume blocks; avoid over-tightening buy-flow gate",
        decisions
      );
    }
    if (rejectRate < 0.55) {
      proposeStep(
        parsed,
        "ONYX_QUALITY_SNIPE_MIN_SCORE",
        "down",
        "cost-too-high dominates while executions exist; mildly loosen quality to prevent no-trade lock",
        decisions
      );
    }
    proposeStep(
      parsed,
      "ONYX_ADAPTIVE_EDGE_RELIEF_MAX_BPS",
      "up",
      "cost-too-high dominates despite executions; allow more adaptive edge relief at micro notionals",
      decisions
    );
  }

  if (executions > 0 && closedTrades < 5) {
    const currentRisk = numberFromEnv(parsed, "ONYX_MAX_RISK_PER_TRADE_BPS", DEFAULTS.ONYX_MAX_RISK_PER_TRADE_BPS);
    if (currentRisk > 900) {
      proposeRiskDownSafely({
        parsed,
        decisions,
        reason: "first executions observed; cap risk-per-trade during initial outcome discovery window",
        minRiskBpsForNotional
      });
    }
  }

  const currentRisk = numberFromEnv(parsed, "ONYX_MAX_RISK_PER_TRADE_BPS", DEFAULTS.ONYX_MAX_RISK_PER_TRADE_BPS);
  if (currentRisk < minRiskBpsForNotional) {
    const boundedFloor = clamp(minRiskBpsForNotional, BOUNDS.ONYX_MAX_RISK_PER_TRADE_BPS.min, BOUNDS.ONYX_MAX_RISK_PER_TRADE_BPS.max);
    setEnvValue(parsed, "ONYX_MAX_RISK_PER_TRADE_BPS", formatNumber(boundedFloor));
    decisions.push({
      key: "ONYX_MAX_RISK_PER_TRADE_BPS",
      from: formatNumber(currentRisk),
      to: formatNumber(boundedFloor),
      reason: "risk-per-trade fell below minimum needed to satisfy configured trade notional"
    });
  }

  if (
    executions === 0 &&
    costTooHighRate < 0.35 &&
    ((skipRate >= 0.45 && belowNotionalRate >= 0.3) || (stats.skipBelowNotional >= 4 && totalSignals >= 16))
  ) {
    proposeStep(
      parsed,
      "ONYX_MAX_RISK_PER_TRADE_BPS",
      "up",
      "many skips from below-min-notional; increase position sizing",
      decisions
    );
    proposeStep(
      parsed,
      "ONYX_MIN_TRADE_NOTIONAL_USD",
      "down",
      "many skips from below-min-notional; lower notional floor",
      decisions
    );
  }

  if (executions === 0 && skipRate >= 0.4 && costTooHighRate >= 0.5) {
    const currentMinEdge = numberFromEnv(parsed, "ONYX_MIN_NET_EDGE_BPS", DEFAULTS.ONYX_MIN_NET_EDGE_BPS);
    if (currentMinEdge > 250) {
      proposeMinNetEdgeDownAdaptive(
        parsed,
        decisions,
        "many skips from cost-too-high viability rule before any executions; lower edge floor quickly to discover executable regime"
      );
    }
    proposeStep(
      parsed,
      "ONYX_QUALITY_SNIPE_MIN_SCORE",
      "down",
      "cost-too-high dominates with zero executions; slightly loosen quality gate to gather live execution samples",
      decisions
    );
    if (stats.skipCostTooHigh >= 6) {
      proposeStep(
        parsed,
        "ONYX_MAX_SLIPPAGE_BPS",
        "down",
        "persistent cost-too-high regime implies slippage estimates are expensive; tighten slippage ceiling",
        decisions
      );
      loweredSlippageForCostRegime = true;
    }
    proposeStep(
      parsed,
      "ONYX_ADAPTIVE_EDGE_RELIEF_MAX_BPS",
      "up",
      "zero-execution cost regime persists; increase adaptive edge relief to escape no-trade lock",
      decisions
    );
    if (currentMinEdge <= 300 && rejectRate >= 0.4 && concentrationRejectRate >= 0.2) {
      proposeStep(
        parsed,
        "ONYX_MAX_HOLDER_CONCENTRATION_BPS",
        "up",
        "cost regime persists near edge-floor and concentration rejects remain elevated; slightly relax concentration cap",
        decisions
      );
    }
  }

  if (
    executions === 0 &&
    slippageRejectRate >= 0.2 &&
    costTooHighRate < 0.5 &&
    !loweredSlippageForCostRegime
  ) {
    proposeStep(
      parsed,
      "ONYX_MAX_SLIPPAGE_BPS",
      "up",
      "frequent slippage-based risk rejects",
      decisions
    );
  }

  if (
    executions === 0 &&
    rejectRate >= 0.55 &&
    concentrationRejectRate >= 0.25 &&
    persistentVolumeGateBlocks
  ) {
    proposeStep(
      parsed,
      "ONYX_MAX_HOLDER_CONCENTRATION_BPS",
      "up",
      "concentration rejects dominate while execution remains zero",
      decisions
    );
    proposeStep(
      parsed,
      "ONYX_MAX_CREATOR_SUPPLY_SHARE_BPS",
      "up",
      "creator supply concentration blocking many entries with zero executions",
      decisions
    );
    proposeStep(
      parsed,
      "ONYX_VOLUME_GATE_MIN_TICKS",
      "down",
      "high concentration rejects and no executions; reduce strictness of flow warmup",
      decisions
    );
    proposeStep(
      parsed,
      "ONYX_VOLUME_GATE_MIN_BUY_TICKS",
      "down",
      "high concentration rejects and no executions; reduce buy-flow threshold",
      decisions
    );
    proposeStep(
      parsed,
      "ONYX_QUALITY_SNIPE_MIN_SCORE",
      "down",
      "high reject pressure and zero executions; loosen quality gate slightly",
      decisions
    );
  }

  const normalizedDecisions = normalizeDecisions(decisions);
  if (normalizedDecisions.length === 0) {
    emitStatus("no-adjustment");
    return;
  }

  lastDecisionAt = now;
  if (apply) {
    writeFileSync(envPath, `${parsed.lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
  }

  process.stdout.write(
    `${JSON.stringify({
      level: 30,
      component: "onyx-autotune",
      apply,
      envPath,
      decisions: normalizedDecisions
    })}\n`
  );
};

const handleLog = (line: string) => {
  if (passthrough) {
    process.stdout.write(`${line}\n`);
  }
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return;
  }
  let parsed: RuntimeLog;
  try {
    parsed = JSON.parse(trimmed) as RuntimeLog;
  } catch {
    return;
  }
  if (parsed.component !== "onyx-runtime") {
    return;
  }

  if (typeof parsed.passed === "boolean") {
    if (parsed.passed) {
      stats.signalPassed += 1;
    } else {
      stats.signalRejected += 1;
      const reasons = parsed.reasons ?? [];
      if (reasons.some((r) => r.toLowerCase().includes("slippage"))) {
        stats.riskRejectSlippage += 1;
      }
      if (reasons.some((r) => r.toLowerCase().includes("top holder concentration"))) {
        stats.riskRejectConcentration += 1;
      }
    }
  }

  if (
    parsed.msg === "Entry skipped: notional/edge below micro threshold." ||
    parsed.msg === "Entry skipped: below minimum trade notional." ||
    parsed.msg === "Entry skipped: edge net below configured threshold."
  ) {
    stats.skipNotional += 1;
    if (parsed.viabilityReason === "below-min-notional") {
      stats.skipBelowNotional += 1;
    } else if (parsed.viabilityReason === "cost-too-high") {
      stats.skipCostTooHigh += 1;
    }
  }
  if (parsed.msg === "Entry blocked by volume-flow gate.") {
    stats.volumeGateBlocks += 1;
  }

  if (parsed.msg === "Onyx heartbeat") {
    stats.executedFromHeartbeat = parsed.metrics?.executed ?? stats.executedFromHeartbeat;
    stats.winsFromHeartbeat = parsed.metrics?.wins ?? stats.winsFromHeartbeat;
    stats.lossesFromHeartbeat = parsed.metrics?.losses ?? stats.lossesFromHeartbeat;
    if (typeof parsed.recentMedianRealizedPnlBps === "number") {
      stats.recentMedianRealizedPnlBps = parsed.recentMedianRealizedPnlBps;
    }
    if (typeof parsed.walletBalanceUsd === "number") {
      stats.walletBalanceUsdFromHeartbeat = parsed.walletBalanceUsd;
    }
    if (typeof parsed.fastStopoutCircuitBreakerActive === "boolean") {
      stats.fastStopoutCircuitBreakerActive = parsed.fastStopoutCircuitBreakerActive;
    }
    maybeTune();
  }
  if (parsed.msg === "Position exited." && parsed.reason) {
    stats.totalExits += 1;
    if (parsed.reason === "stop-loss") {
      stats.stopLossExits += 1;
    }
  }
};

process.stdout.write(
  `${JSON.stringify({
    level: 30,
    component: "onyx-autotune",
    msg: "autotuner started",
    apply,
    verbose,
    passthrough,
    envPath,
    decisionCooldownMs
  })}\n`
);

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", handleLog);

const exitGracefully = (signal: "SIGINT" | "SIGTERM") => {
  process.stdout.write(
    `${JSON.stringify({
      level: 30,
      component: "onyx-autotune",
      msg: "autotuner interrupted; exiting cleanly",
      signal
    })}\n`
  );
  rl.close();
  process.exit(0);
};

process.on("SIGINT", () => {
  exitGracefully("SIGINT");
});

process.on("SIGTERM", () => {
  exitGracefully("SIGTERM");
});

rl.on("close", () => {
  process.exit(0);
});

