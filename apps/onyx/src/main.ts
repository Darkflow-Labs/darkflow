import { Connection } from "@solana/web3.js";
import { watchFile } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotEnvFile } from "dotenv";
import { createLogger } from "./telemetry/logger.js";
import { loadEnv, type OnyxEnv } from "./config/env.js";
import { createNotificationHub } from "./integrations/notificationHub.js";
import { createDiscordWebhookSink } from "./integrations/discordWebhookSink.js";
import { MetricsRegistry } from "./telemetry/metrics.js";
import { AlertBus } from "./telemetry/alerts.js";
import {
  DrpcLogsSubscriber,
  GrpcSubscriber,
  SourceHealthTracker
} from "@darkflow/engine/solana/connectors";
import {
  DrpcPriceStream,
  ExternalQuotePriceStream,
  GrpcPriceStream,
  HybridPriceMux,
  PumpApiPriceStream,
  type PriceTick
} from "@darkflow/engine/solana/ingest";
import { RiskEngine } from "./risk/riskEngine.js";
import { RugSignalProvider } from "./risk/rugSignalProvider.js";
import {
  buildBuyIntent,
  ExecutionEngine,
  ExitExecutor,
  JitoClient,
  PumpApiClient
} from "@darkflow/engine/solana/adapters/pump";
import { resolveExecutionConfig } from "@darkflow/engine/config";
import { mapOnyxEnvToExecutionDefaultsPartial } from "./config/mapOnyxEnvToExecutionDefaults.js";
import { RiskController } from "./runtime/riskController.js";
import { SignerService } from "@darkflow/engine/solana/runtime";
import { PositionManager } from "./strategy/positionManager.js";
import { ExitEngine } from "./strategy/exitEngine.js";
import { modeProfileFor, resolveTradingMode } from "./strategy/modes/tradingMode.js";
import {
  allowsLaunchSource,
  allowsSweepDetectorSource,
  parseSectionModeFromArgv
} from "./strategy/modes/sectionMode.js";
import { SweepDetector, type SweepProfile } from "./strategy/sweep/sweepDetector.js";
import type { LaunchSignal } from "./types/domain.js";
import { prisma } from "@darkflow/db";
import { createMarketSyncWriter } from "@darkflow/engine/market";
import { createInterestWatchRegistry } from "@darkflow/sync/interest";
import { createTickPublisher } from "@darkflow/sync/pubsub";
import { createGuardianBilling, createGuardianClient } from "@darkflow/guardian";
import { createLaunchStreamServer } from "./stream/launchStreamServer.js";
import { startPythProSolUsdFeed } from "./market/pythProSolUsdFeed.js";

const env = loadEnv();
const resolvedGrpcEndpoint = env.ONYX_INTERNAL_GEYSER_ENDPOINT ?? env.ONYX_GRPC_ENDPOINT;
const resolvedGrpcToken = env.ONYX_INTERNAL_GEYSER_X_TOKEN ?? env.ONYX_GRPC_X_TOKEN;
const logger = createLogger({
  component: "onyx-runtime",
  level: env.ONYX_TELEMETRY_LEVEL,
  logToFileEnabled: env.ONYX_LOG_TO_FILE_ENABLED,
  logFilePath: env.ONYX_LOG_FILE_PATH,
  logPretty: env.ONYX_LOG_PRETTY
});
const marketSyncWriter = createMarketSyncWriter({
  barBucketMs: env.ONYX_MARKET_SYNC_BAR_BUCKET_MS,
  throttleBarMs: env.ONYX_MARKET_SYNC_BAR_THROTTLE_MS
});
const redisTickPublisher = createTickPublisher({
  adapter: env.REDIS_PUBSUB_ADAPTER,
  channel: env.REDIS_PRICE_TICK_CHANNEL,
  logger,
  redisUrl: env.REDIS_PUBSUB_URL,
  upstashUrl: env.UPSTASH_REDIS_REST_URL,
  upstashToken: env.UPSTASH_REDIS_REST_TOKEN
});
const tickInterestWatch = env.ONYX_TICK_INTEREST_WATCH_ENABLED
  ? createInterestWatchRegistry({
      adapter: env.REDIS_PUBSUB_ADAPTER,
      redisUrl: env.REDIS_PUBSUB_URL,
      upstashUrl: env.UPSTASH_REDIS_REST_URL,
      upstashToken: env.UPSTASH_REDIS_REST_TOKEN,
      logger,
      watchTtlMs: env.ONYX_TICK_WATCH_TTL_MS
    })
  : undefined;
const executionCfg = resolveExecutionConfig({
  envPartial: mapOnyxEnvToExecutionDefaultsPartial(env)
});
const sectionMode = parseSectionModeFromArgv(process.argv.slice(2));
const tradingEnabled = sectionMode !== "observe";
const hotReloadEnvPath = resolve(process.cwd(), ".env");
const alerts = new AlertBus(logger);
const guardianBilling =
  env.ONYX_BILLING_STREAM_ENABLED || env.ONYX_BILLING_TRADE_ENABLED
    ? createGuardianBilling({
        findUserById: (userId) => prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
        autumnSecretKey: env.AUTUMN_SECRET_KEY!,
        launchStreamFeatureId: env.AUTUMN_FEATURE_LAUNCH_STREAM,
        tradeEntryFeatureId: env.AUTUMN_FEATURE_TRADE_ENTRY,
        tradeFeeFeatureId: env.AUTUMN_FEATURE_PLATFORM_TRADE_FEE
      })
    : undefined;
let launchStreamServer =
  env.ONYX_PUBLIC_LAUNCH_STREAM_ENABLED && env.ONYX_UNKEY_VERIFY_ROOT_KEY
    ? createLaunchStreamServer({
        guardian: createGuardianClient({ rootKey: env.ONYX_UNKEY_VERIFY_ROOT_KEY }),
        ...(env.ONYX_BILLING_STREAM_ENABLED && guardianBilling ? { billing: guardianBilling } : {}),
        host: env.ONYX_PUBLIC_LAUNCH_STREAM_HOST,
        port: env.ONYX_PUBLIC_LAUNCH_STREAM_PORT,
        maxClients: env.ONYX_PUBLIC_LAUNCH_STREAM_MAX_CLIENTS,
        logger,
        requirePurpose: env.ONYX_PUBLIC_LAUNCH_STREAM_REQUIRE_META_PURPOSE
      })
    : undefined;
const notificationHub = createNotificationHub({
  logger,
  cooldownMs: env.ONYX_DISCORD_ALERT_COOLDOWN_MS,
  minQualityScore: env.ONYX_DISCORD_ALERT_MIN_QUALITY_SCORE,
  sinks:
    env.ONYX_DISCORD_ALERTS_ENABLED && env.ONYX_DISCORD_WEBHOOK_URL
      ? [createDiscordWebhookSink({ webhookUrl: env.ONYX_DISCORD_WEBHOOK_URL })]
      : []
});
const metrics = new MetricsRegistry();
const startingWalletUsd = (env.ONYX_MICRO_WALLET_MIN_USD + env.ONYX_MICRO_WALLET_MAX_USD) / 2;
const configuredStartingWalletSol = startingWalletUsd / env.ONYX_ESTIMATED_SOL_USD;
const growthMilestonesUsd = [50, 75, 100];
const reachedMilestones = new Set<number>();
let lastConcurrentSkipAlertAt = 0;
let lastBlockedEntryAlertAt = 0;
let lastEdgeBlockedEntryAlertAt = 0;
let lastQualityBlockedEntryAlertAt = 0;
let lastVolumeBlockedEntryAlertAt = 0;
let entryExecutionInFlight = false;
const exitInFlightMints = new Set<string>();
const inflightEntryMints = new Set<string>();
const queuedEntryMints = new Set<string>();
const entryQueue: LaunchSignal[] = [];
const queuedEntryEnqueuedAtByMint = new Map<string, number>();
let entryQueueWorkerRunning = false;
const pendingEntries = new Map<
  string,
  {
    launch: import("./types/domain.js").LaunchSignal;
    intent: import("./types/domain.js").TradeIntent;
    expiresAt: number;
  }
>();
const staleExitFirstSeenAtByMint = new Map<string, number>();
const exitRetryNotBeforeByMint = new Map<string, number>();
const creatorCooldownUntilByCreator = new Map<string, number>();
let globalEntryCooldownUntilMs = 0;
const launchSeenAtByMint = new Map<string, number>();
const creatorByMint = new Map<string, string>();
const highVolumeEntryCooldownUntilByMint = new Map<string, number>();
const highVolumePriceSeriesByMint = new Map<string, Array<{ ts: number; priceSol: number }>>();
let fastStopoutCircuitActive = false;
let fastStopoutCircuitActiveAt = 0;
const EXIT_RETRY_BACKOFF_MS = 8_000;
const EXIT_CONFIRM_TIMEOUT_BACKOFF_MS = 30_000;
/** Wallet sync can round to ~0 while price-based exit PnL is large; use price for risk/metrics in that band. */
const RISK_PNL_NEUTRAL_DEADZONE_BPS = 50;
const RISK_PRICE_PNLL_FALLBACK_MIN_BPS = 200;

logger.info({ trade: sectionMode }, "Onyx trade mode selected");

if (!tradingEnabled) {
  const drpcPriceStream = new DrpcPriceStream({
    wsUrl: env.ONYX_RPC_WS_URL,
    programId: env.ONYX_NEW_LAUNCH_PROGRAM_ID,
    logger
  });
  const grpcPriceStream =
    env.ONYX_GRPC_ENABLED && resolvedGrpcEndpoint
      ? new GrpcPriceStream({
          endpoint: resolvedGrpcEndpoint,
          xToken: resolvedGrpcToken,
          programId: env.ONYX_NEW_LAUNCH_PROGRAM_ID,
          logger
        })
      : undefined;
  const pumpApiPriceStream = new PumpApiPriceStream({
    wsUrl: env.ONYX_PUMP_API_STREAM_URL,
    logger
  });
  const priceMux = new HybridPriceMux({
    primary:
      env.ONYX_PRIMARY_PRICE_SOURCE === "pumpapi"
        ? pumpApiPriceStream
        : env.ONYX_PRIMARY_PRICE_SOURCE === "grpc" && grpcPriceStream
          ? grpcPriceStream
          : drpcPriceStream,
    staleTimeoutMs: env.ONYX_PRICE_STALE_TIMEOUT_MS,
    logger
  });

  if (env.ONYX_SOL_USD_FEED_ENABLED && env.ONYX_PYTH_PRO_ACCESS_TOKEN) {
    await startPythProSolUsdFeed({
      enabled: true,
      token: env.ONYX_PYTH_PRO_ACCESS_TOKEN,
      feedId: env.ONYX_PYTH_PRO_SOL_USD_FEED_ID,
      exponent: env.ONYX_PYTH_PRO_SOL_USD_EXPONENT,
      channel: env.ONYX_PYTH_PRO_CHANNEL,
      logger,
      publish: (tick) => redisTickPublisher.publish(tick),
      persist: (tick) => marketSyncWriter.flushPriceTick(tick)
    });
  }

  priceMux.onTick(async (tick) => {
    redisTickPublisher?.publish(tick);
    if (env.ONYX_MARKET_SYNC_ENABLED && (tick.source === "drpc-primary" || tick.source === "grpc-primary")) {
      void marketSyncWriter.flushPriceTick({
        mint: tick.tokenMint,
        priceSol: tick.priceSol,
        receivedAtMs: tick.receivedAt,
        source: tick.source,
        eventType: tick.eventType
      });
    }
  });
  priceMux.start();

  setInterval(() => {
    logger.info({ metrics: metrics.snapshot() }, "Onyx observe heartbeat");
  }, 30_000);

  await new Promise<void>(() => void 0);
}

const sweepProfile: SweepProfile = env.ONYX_SWEEP_PROFILE;
const sweepDetector = new SweepDetector({
  profile: sweepProfile,
  minMoonMomentumBps: env.ONYX_SWEEP_MIN_MOON_MOMENTUM_BPS,
  moonWindowMs: env.ONYX_SWEEP_MOON_WINDOW_MS,
  minMoonTicks: env.ONYX_SWEEP_MIN_MOON_TICKS,
  minMoonBuyRatioBps: env.ONYX_SWEEP_MIN_MOON_BUY_RATIO_BPS,
  minDipBps: env.ONYX_SWEEP_MIN_DIP_BPS,
  maxDipBps: env.ONYX_SWEEP_MAX_DIP_BPS,
  minStabilizationMs: env.ONYX_SWEEP_MIN_STABILIZATION_MS,
  reversalBuyRatioBps: env.ONYX_SWEEP_REVERSAL_BUY_RATIO_BPS,
  reversalMinTicks: env.ONYX_SWEEP_REVERSAL_MIN_TICKS,
  maxWatchMs: env.ONYX_SWEEP_MAX_WATCH_MS,
  minPriceFloorSol: env.ONYX_SWEEP_MIN_PRICE_FLOOR_SOL
});
logger.info(
  {
    sectionMode,
    sweepProfile: sectionMode === "sweep" ? sweepProfile : undefined
  },
  "Onyx section mode selected"
);

if (!env.ONYX_PRIVATE_KEY_BASE58) {
  alerts.emit("error", "ONYX_PRIVATE_KEY_BASE58 is required when trading is enabled.");
  process.exit(1);
}
if (!env.ONYX_WALLET_ADDRESS) {
  alerts.emit("error", "ONYX_WALLET_ADDRESS is required when trading is enabled.");
  process.exit(1);
}
if (!env.ONYX_JITO_TX_URL) {
  alerts.emit("error", "ONYX_JITO_TX_URL is required when trading is enabled.");
  process.exit(1);
}

const signer = new SignerService({
  privateKeyBase58: env.ONYX_PRIVATE_KEY_BASE58,
  logger
});

if (!signer.healthCheck()) {
  alerts.emit("error", "Signer health check failed at startup.");
  process.exit(1);
}
const signerKeypair = signer.getKeypair();
if (!signerKeypair) {
  alerts.emit("error", "Signer keypair unavailable after health check.");
  process.exit(1);
}
const signerWalletAddress = signer.getWalletAddress();
if (!signerWalletAddress) {
  alerts.emit("error", "Signer public key unavailable.");
  process.exit(1);
}
if (env.ONYX_WALLET_ADDRESS !== signerWalletAddress) {
  alerts.emit("warn", "ONYX_WALLET_ADDRESS does not match signer keypair; using signer address for execution.", {
    configuredWallet: env.ONYX_WALLET_ADDRESS,
    signerWallet: signerWalletAddress
  });
}

const rpcConnection = new Connection(env.ONYX_RPC_HTTP_URL, "processed");
const signerPublicKey = signerKeypair.publicKey;
const loadStartingWalletSol = async () => {
  if (env.ONYX_MODE !== "live") {
    return configuredStartingWalletSol;
  }
  try {
    const lamports = await rpcConnection.getBalance(signerPublicKey, "processed");
    return lamports / 1_000_000_000;
  } catch (error: unknown) {
    logger.warn({ error }, "Failed to fetch live starting wallet balance; using configured micro-wallet baseline.");
    return configuredStartingWalletSol;
  }
};
const startingWalletSol = await loadStartingWalletSol();

const riskController = new RiskController({
  startingWalletSol,
  minTradeNotionalUsd: env.ONYX_MIN_TRADE_NOTIONAL_USD,
  estimatedSolUsd: env.ONYX_ESTIMATED_SOL_USD,
  minNetEdgeBps: env.ONYX_MIN_NET_EDGE_BPS,
  maxRiskPerTradeBps: env.ONYX_MAX_RISK_PER_TRADE_BPS,
  dailyMaxDrawdownBps: env.ONYX_DAILY_MAX_DRAWDOWN_BPS,
  drawdownMinClosedTrades: env.ONYX_DRAWDOWN_MIN_CLOSED_TRADES,
  maxConsecutiveLosses: env.ONYX_MAX_CONSECUTIVE_LOSSES,
  maxFailureRateBps: env.ONYX_MAX_FAILURE_RATE_BPS,
  minAttemptsBeforeFailureRateKillSwitch: env.ONYX_KILL_SWITCH_MIN_ATTEMPTS,
  killSwitchCooldownMs: env.ONYX_KILL_SWITCH_COOLDOWN_MS,
  autoUnblockDrawdownBufferBps: env.ONYX_KILL_SWITCH_AUTO_UNBLOCK_DRAWDOWN_BUFFER_BPS,
  autoUnblockFailureBufferBps: env.ONYX_KILL_SWITCH_AUTO_UNBLOCK_FAILURE_BUFFER_BPS,
  streakRiskReductionBps: env.ONYX_STREAK_RISK_REDUCTION_BPS,
  streakRiskFloorBps: env.ONYX_STREAK_RISK_FLOOR_BPS,
  executionFailureDegradeBps: env.ONYX_EXECUTION_FAILURE_DEGRADE_BPS,
  adaptiveEdgeReliefMaxBps: env.ONYX_ADAPTIVE_EDGE_RELIEF_MAX_BPS,
  adaptiveEdgeReliefFloorBps: env.ONYX_ADAPTIVE_EDGE_RELIEF_FLOOR_BPS
});
const syncWalletBalance = async (reason: string, options?: { forceDrawdownUpdate?: boolean }) => {
  if (env.ONYX_MODE !== "live") {
    return;
  }
  try {
    const lamports = await rpcConnection.getBalance(signerPublicKey, "processed");
    const shouldUpdateDrawdown = options?.forceDrawdownUpdate ?? false;
    riskController.syncWalletBalanceSol(lamports / 1_000_000_000, {
      updateDrawdown: shouldUpdateDrawdown
    });
    if (!shouldUpdateDrawdown) {
      logger.debug({ reason }, "Skipped drawdown update from passive wallet sync.");
    }
  } catch (error: unknown) {
    logger.debug({ error, reason }, "Failed to sync wallet balance from RPC.");
  }
};
const riskEngine = new RiskEngine({
  config: {
    maxSignalAgeMs: env.ONYX_ENTRY_MAX_SIGNAL_AGE_MS,
    confidenceCooldownMs: 15_000,
    maxTopHolderConcentrationBps:
      env.ONYX_MODE === "paper" && env.ONYX_PAPER_RELAX_FILTERS
        ? Math.max(env.ONYX_MAX_HOLDER_CONCENTRATION_BPS, 7000)
        : env.ONYX_MAX_HOLDER_CONCENTRATION_BPS,
    maxCreatorSupplyShareBps:
      env.ONYX_MODE === "paper" && env.ONYX_PAPER_RELAX_FILTERS
        ? Math.max(env.ONYX_MAX_CREATOR_SUPPLY_SHARE_BPS, 3500)
        : env.ONYX_MAX_CREATOR_SUPPLY_SHARE_BPS,
    maxCreatorRiskScore:
      env.ONYX_MODE === "paper" && env.ONYX_PAPER_RELAX_FILTERS
        ? Math.max(env.ONYX_MAX_CREATOR_RISK_SCORE, 95)
        : env.ONYX_MAX_CREATOR_RISK_SCORE,
    maxSlippageBps:
      env.ONYX_MODE === "paper" && env.ONYX_PAPER_RELAX_FILTERS
        ? Math.max(env.ONYX_MAX_SLIPPAGE_BPS, 3000)
        : env.ONYX_MAX_SLIPPAGE_BPS,
    defaultSlippageBps: env.ONYX_DEFAULT_SLIPPAGE_BPS,
    latencyDegradeMs: env.ONYX_EXECUTION_LATENCY_DEGRADE_MS
  },
  rugSignalProvider: new RugSignalProvider({
    connection: rpcConnection,
    pumpProgramId: env.ONYX_NEW_LAUNCH_PROGRAM_ID,
    unknownCreatorRiskScore: env.ONYX_UNKNOWN_CREATOR_RISK_SCORE,
    minCreatorHistorySignals: env.ONYX_CREATOR_RISK_MIN_HISTORY_SIGNALS,
    logger
  }),
  logger
});

const HOT_RELOAD_ENV_KEYS: Array<keyof OnyxEnv> = [
  "ONYX_MAX_RISK_PER_TRADE_BPS",
  "ONYX_MIN_TRADE_NOTIONAL_USD",
  "ONYX_MIN_NET_EDGE_BPS",
  "ONYX_DAILY_MAX_DRAWDOWN_BPS",
  "ONYX_DRAWDOWN_MIN_CLOSED_TRADES",
  "ONYX_MAX_CONSECUTIVE_LOSSES",
  "ONYX_MAX_FAILURE_RATE_BPS",
  "ONYX_KILL_SWITCH_MIN_ATTEMPTS",
  "ONYX_KILL_SWITCH_COOLDOWN_MS",
  "ONYX_KILL_SWITCH_AUTO_UNBLOCK_DRAWDOWN_BUFFER_BPS",
  "ONYX_KILL_SWITCH_AUTO_UNBLOCK_FAILURE_BUFFER_BPS",
  "ONYX_STREAK_RISK_REDUCTION_BPS",
  "ONYX_STREAK_RISK_FLOOR_BPS",
  "ONYX_EXECUTION_FAILURE_DEGRADE_BPS",
  "ONYX_ADAPTIVE_EDGE_RELIEF_MAX_BPS",
  "ONYX_ADAPTIVE_EDGE_RELIEF_FLOOR_BPS",
  "ONYX_MAX_CONCURRENT_POSITIONS",
  "ONYX_MAX_HOLDER_CONCENTRATION_BPS",
  "ONYX_MAX_CREATOR_SUPPLY_SHARE_BPS",
  "ONYX_MAX_CREATOR_RISK_SCORE",
  "ONYX_MAX_SLIPPAGE_BPS",
  "ONYX_ENTRY_MAX_SIGNAL_AGE_MS",
  "ONYX_ENTRY_MIN_PRIMARY_TICKS",
  "ONYX_ENTRY_TICK_WARMUP_MS",
  "ONYX_VOLUME_GATE_ENABLED",
  "ONYX_VOLUME_GATE_WINDOW_MS",
  "ONYX_VOLUME_GATE_MIN_TICKS",
  "ONYX_VOLUME_GATE_MIN_BUY_TICKS",
  "ONYX_HIGH_VOLUME_LANE_ENABLED",
  "ONYX_HIGH_VOLUME_MIN_TICKS",
  "ONYX_HIGH_VOLUME_MIN_BUY_TICKS",
  "ONYX_HIGH_VOLUME_WINDOW_MS",
  "ONYX_HIGH_VOLUME_MIN_MOMENTUM_BPS",
  "ONYX_HIGH_VOLUME_ENTRY_COOLDOWN_MS",
  "ONYX_HIGH_VOLUME_EXCLUDE_NEW_LAUNCH_MS",
  "ONYX_HIGH_VOLUME_SIZING_MULTIPLIER_BPS",
  "ONYX_HIGH_VOLUME_MIN_EDGE_BONUS_BPS",
  "ONYX_HIGH_VOLUME_QUALITY_MIN_SCORE",
  "ONYX_HIGH_VOLUME_LANE_ENABLED",
  "ONYX_HIGH_VOLUME_MIN_TICKS",
  "ONYX_HIGH_VOLUME_MIN_BUY_TICKS",
  "ONYX_HIGH_VOLUME_WINDOW_MS",
  "ONYX_HIGH_VOLUME_MIN_MOMENTUM_BPS",
  "ONYX_HIGH_VOLUME_ENTRY_COOLDOWN_MS",
  "ONYX_HIGH_VOLUME_EXCLUDE_NEW_LAUNCH_MS",
  "ONYX_HIGH_VOLUME_SIZING_MULTIPLIER_BPS",
  "ONYX_HIGH_VOLUME_MIN_EDGE_BONUS_BPS",
  "ONYX_HIGH_VOLUME_QUALITY_MIN_SCORE",
  "ONYX_QUALITY_SNIPE_ENABLED",
  "ONYX_QUALITY_SNIPE_MIN_SCORE",
  "ONYX_DYNAMIC_ENTRY_QUALITY_ENABLED",
  "ONYX_DYNAMIC_ENTRY_QUALITY_DEGRADE_BPS",
  "ONYX_DYNAMIC_ENTRY_QUALITY_MAX_ADD",
  "ONYX_ENTRY_COOLDOWN_BASE_MS",
  "ONYX_ENTRY_COOLDOWN_MAX_MS",
  "ONYX_ENTRY_CREATOR_COOLDOWN_MS",
  "ONYX_STOP_LOSS_BPS",
  "ONYX_TRADING_MODE",
  "ONYX_MODE_TRANSITION_MIN_TRADES",
  "ONYX_MODE_TRANSITION_MIN_MEDIAN_REALIZED_BPS",
  "ONYX_REALIZED_EDGE_WINDOW_TRADES",
  "ONYX_REALIZED_EDGE_MIN_CLOSED_TRADES",
  "ONYX_REALIZED_EDGE_MIN_MEDIAN_BPS",
  "ONYX_CONCURRENT_SKIP_ALERT_COOLDOWN_MS",
  "ONYX_DYNAMIC_TIP_ENABLED",
  "ONYX_MIN_TIP_LAMPORTS",
  "ONYX_DYNAMIC_TIP_EDGE_FACTOR_BPS",
  "ONYX_DYNAMIC_TIP_LATENCY_FACTOR_BPS",
  "ONYX_EXECUTION_LATENCY_DEGRADE_MS"
  ,"ONYX_ENTRY_QUEUE_TTL_MS"
  ,"ONYX_ENTRY_FALLBACK_MAX_SIGNAL_AGE_MS"
  ,"ONYX_FAST_STOPOUT_WINDOW_TRADES"
  ,"ONYX_FAST_STOPOUT_RATE_BPS"
  ,"ONYX_FAST_STOPOUT_HOLD_THRESHOLD_MS"
  ,"ONYX_FAST_STOPOUT_COOLDOWN_MS"
  ,"ONYX_EXECUTION_REQUEST_TIMEOUT_MS"
  ,"ONYX_JITO_USE_NATIVE_BUILDER"
];

const applyHotReloadedEnv = (nextEnv: OnyxEnv) => {
  const changed: Array<{ key: keyof OnyxEnv; from: unknown; to: unknown }> = [];
  for (const key of HOT_RELOAD_ENV_KEYS) {
    const previousValue = env[key];
    const nextValue = nextEnv[key];
    if (previousValue !== nextValue) {
      changed.push({ key, from: previousValue, to: nextValue });
      (env as Record<keyof OnyxEnv, unknown>)[key] = nextValue;
    }
  }
  if (changed.length === 0) {
    return;
  }
  riskController.updateRuntimeConfig({
    minTradeNotionalUsd: env.ONYX_MIN_TRADE_NOTIONAL_USD,
    minNetEdgeBps: env.ONYX_MIN_NET_EDGE_BPS,
    maxRiskPerTradeBps: env.ONYX_MAX_RISK_PER_TRADE_BPS,
    dailyMaxDrawdownBps: env.ONYX_DAILY_MAX_DRAWDOWN_BPS,
    drawdownMinClosedTrades: env.ONYX_DRAWDOWN_MIN_CLOSED_TRADES,
    maxConsecutiveLosses: env.ONYX_MAX_CONSECUTIVE_LOSSES,
    maxFailureRateBps: env.ONYX_MAX_FAILURE_RATE_BPS,
    minAttemptsBeforeFailureRateKillSwitch: env.ONYX_KILL_SWITCH_MIN_ATTEMPTS,
    killSwitchCooldownMs: env.ONYX_KILL_SWITCH_COOLDOWN_MS,
    autoUnblockDrawdownBufferBps: env.ONYX_KILL_SWITCH_AUTO_UNBLOCK_DRAWDOWN_BUFFER_BPS,
    autoUnblockFailureBufferBps: env.ONYX_KILL_SWITCH_AUTO_UNBLOCK_FAILURE_BUFFER_BPS,
    streakRiskReductionBps: env.ONYX_STREAK_RISK_REDUCTION_BPS,
    streakRiskFloorBps: env.ONYX_STREAK_RISK_FLOOR_BPS,
    executionFailureDegradeBps: env.ONYX_EXECUTION_FAILURE_DEGRADE_BPS,
    adaptiveEdgeReliefMaxBps: env.ONYX_ADAPTIVE_EDGE_RELIEF_MAX_BPS,
    adaptiveEdgeReliefFloorBps: env.ONYX_ADAPTIVE_EDGE_RELIEF_FLOOR_BPS
  });
  riskEngine.updateRuntimeConfig({
    maxSignalAgeMs: env.ONYX_ENTRY_MAX_SIGNAL_AGE_MS,
    maxTopHolderConcentrationBps: env.ONYX_MAX_HOLDER_CONCENTRATION_BPS,
    maxCreatorSupplyShareBps: env.ONYX_MAX_CREATOR_SUPPLY_SHARE_BPS,
    maxCreatorRiskScore: env.ONYX_MAX_CREATOR_RISK_SCORE,
    maxSlippageBps: env.ONYX_MAX_SLIPPAGE_BPS,
    latencyDegradeMs: env.ONYX_EXECUTION_LATENCY_DEGRADE_MS
  });
  alerts.emit("info", "Hot-reloaded runtime .env keys.", {
    envPath: hotReloadEnvPath,
    changed
  });
};

watchFile(hotReloadEnvPath, { interval: 1_500 }, (curr, prev) => {
  if (curr.mtimeMs === prev.mtimeMs) {
    return;
  }
  try {
    loadDotEnvFile({ path: hotReloadEnvPath, override: true });
    const nextEnv = loadEnv();
    applyHotReloadedEnv(nextEnv);
  } catch (error: unknown) {
    logger.warn({ error, envPath: hotReloadEnvPath }, "Failed to hot-reload .env; keeping previous runtime config.");
  }
});

const jitoClient = new JitoClient({
  txUrl: env.ONYX_JITO_TX_URL,
  fallbackTxUrl: env.ONYX_JITO_TX_FALLBACK_URL,
  authKey: env.ONYX_JITO_AUTH_KEY,
  bundleOnly: executionCfg.jitoBundleOnly,
  maxRetries: executionCfg.maxExecutionRetries,
  minSubmitIntervalMs: executionCfg.jitoMinSubmitIntervalMs,
  logger,
  mode: env.ONYX_MODE
});
const pumpApiClient = env.ONYX_PUMP_API_TRADE_URL
  ? new PumpApiClient({
      tradeUrl: env.ONYX_PUMP_API_TRADE_URL,
      userPrivateKeyBase58: signer.getPrivateKeyBase58(),
      requestTimeoutMs: executionCfg.executionRequestTimeoutMs,
      logger
    })
  : undefined;

const executionEngine = new ExecutionEngine({
  rpcHttpUrl: env.ONYX_RPC_HTTP_URL,
  walletAddress: signerWalletAddress,
  mode: env.ONYX_MODE,
  backend: env.ONYX_EXECUTION_BACKEND,
  jitoClient,
  pumpApiClient,
  signerKeypair,
  maxIntentAgeMs: env.ONYX_ENTRY_MAX_SIGNAL_AGE_MS + env.ONYX_ENTRY_TICK_WARMUP_MS + 2_000,
  requestTimeoutMs: executionCfg.executionRequestTimeoutMs,
  confirmTimeoutMs: executionCfg.executionConfirmTimeoutMs,
  confirmPollMs: executionCfg.executionConfirmPollMs,
  fallbackMaxIntentAgeMs: env.ONYX_ENTRY_FALLBACK_MAX_SIGNAL_AGE_MS,
  useNativeJitoBuilder: executionCfg.jitoUseNativeBuilder,
  logger
});

const sweepSizingMultiplierBps =
  sweepProfile === "safer"
    ? env.ONYX_SWEEP_SAFER_SIZING_MULTIPLIER_BPS
    : env.ONYX_SWEEP_AGGRESSIVE_SIZING_MULTIPLIER_BPS;
const sweepPartialTakeProfitBps =
  sweepProfile === "safer" ? env.ONYX_SWEEP_SAFER_PARTIAL_TP_BPS : env.ONYX_SWEEP_AGGRESSIVE_PARTIAL_TP_BPS;
const effectiveStopLossBps =
  sectionMode === "sweep"
    ? sweepProfile === "safer"
      ? env.ONYX_SWEEP_SAFER_STOP_LOSS_BPS
      : env.ONYX_SWEEP_AGGRESSIVE_STOP_LOSS_BPS
    : env.ONYX_STOP_LOSS_BPS;
const effectiveTrailingStopBps =
  sectionMode === "sweep"
    ? sweepProfile === "safer"
      ? env.ONYX_SWEEP_SAFER_TRAILING_STOP_BPS
      : env.ONYX_SWEEP_AGGRESSIVE_TRAILING_STOP_BPS
    : env.ONYX_TRAILING_STOP_BPS;

const positionManager = new PositionManager({
  stopLossBps: effectiveStopLossBps,
  takeProfitBps: env.ONYX_TAKE_PROFIT_MAX_BPS,
  maxHoldMs: env.ONYX_MAX_HOLD_MS
});
const exitEngine = new ExitEngine({
  stopLossBps: effectiveStopLossBps,
  exitArmingDelayMs: env.ONYX_EXIT_ARMING_DELAY_MS,
  takeProfitMinBps: env.ONYX_TAKE_PROFIT_MIN_BPS,
  takeProfitMaxBps: env.ONYX_TAKE_PROFIT_MAX_BPS,
  trailingStopBps: effectiveTrailingStopBps,
  maxHoldMs: env.ONYX_MAX_HOLD_MS,
  maxSourceDivergenceBps: env.ONYX_MAX_SOURCE_DIVERGENCE_BPS,
  externalGraceMs: env.ONYX_EXTERNAL_QUOTE_GRACE_MS,
  assumedExitSlippageBps: env.ONYX_DEFAULT_SLIPPAGE_BPS,
  baseExecutionFrictionBps: 120,
  earlyFastFailStopLossRatioBps: env.ONYX_EARLY_FAST_FAIL_STOP_LOSS_RATIO_BPS,
  earlyFastFailStopLossMinBps: env.ONYX_EARLY_FAST_FAIL_STOP_LOSS_MIN_BPS
});

const subscriber = env.ONYX_GRPC_ENABLED && resolvedGrpcEndpoint
  ? new GrpcSubscriber({
      endpoint: resolvedGrpcEndpoint,
      xToken: resolvedGrpcToken,
      programId: env.ONYX_NEW_LAUNCH_PROGRAM_ID,
      logger
    })
  : new DrpcLogsSubscriber({
      wsUrl: env.ONYX_RPC_WS_URL,
      rpcHttpUrl: env.ONYX_RPC_HTTP_URL,
      programId: env.ONYX_NEW_LAUNCH_PROGRAM_ID,
      logger,
      txFetchTimeoutMs: executionCfg.launchTxFetchTimeoutMs,
      txFetchConcurrency: executionCfg.launchTxFetchConcurrency,
      logPayloadDetails: env.ONYX_DRPC_LOG_PAYLOAD_DETAILS,
      maxDecodeQueueSize: executionCfg.drpcMaxDecodeQueueSize
    });
const sourceHealth = new SourceHealthTracker({ staleTimeoutMs: executionCfg.priceStaleTimeoutMs });
const latestPrimaryTicks = new Map<string, PriceTick>();
const latestExternalTicks = new Map<string, PriceTick>();
const primaryTickStats = new Map<string, { count: number; firstSeenAt: number; lastSeenAt: number }>();
const primaryFlowStats = new Map<string, { tickTimes: number[]; buyTimes: number[] }>();

const drpcPriceStream = new DrpcPriceStream({
  wsUrl: env.ONYX_RPC_WS_URL,
  programId: env.ONYX_NEW_LAUNCH_PROGRAM_ID,
  logger
});
const grpcPriceStream =
  env.ONYX_GRPC_ENABLED && resolvedGrpcEndpoint
    ? new GrpcPriceStream({
        endpoint: resolvedGrpcEndpoint,
        xToken: resolvedGrpcToken,
        programId: env.ONYX_NEW_LAUNCH_PROGRAM_ID,
        logger
      })
    : undefined;
const pumpApiPriceStream = new PumpApiPriceStream({
  wsUrl: env.ONYX_PUMP_API_STREAM_URL,
  logger
});
const externalQuoteStream = env.ONYX_ENABLE_EXTERNAL_QUOTE_STREAM && env.ONYX_EXTERNAL_QUOTE_URL_TEMPLATE
  ? new ExternalQuotePriceStream({
      quoteUrlTemplate: env.ONYX_EXTERNAL_QUOTE_URL_TEMPLATE,
      trackedMints: () => positionManager.getOpenMints(),
      pollIntervalMs: env.ONYX_EXTERNAL_QUOTE_POLL_MS,
      logger
    })
  : undefined;
const priceMux = new HybridPriceMux({
  primary:
    env.ONYX_PRIMARY_PRICE_SOURCE === "pumpapi"
      ? pumpApiPriceStream
      : env.ONYX_PRIMARY_PRICE_SOURCE === "grpc" && grpcPriceStream
        ? grpcPriceStream
        : drpcPriceStream,
  external: externalQuoteStream,
  staleTimeoutMs: env.ONYX_PRICE_STALE_TIMEOUT_MS,
  logger
});

// SOL/USD feed (Pyth Pro Lazer) → persist into sync DB + hot cache and broadcast to tick pubsub.
if (env.ONYX_SOL_USD_FEED_ENABLED && env.ONYX_PYTH_PRO_ACCESS_TOKEN) {
  await startPythProSolUsdFeed({
    enabled: true,
    token: env.ONYX_PYTH_PRO_ACCESS_TOKEN,
    feedId: env.ONYX_PYTH_PRO_SOL_USD_FEED_ID,
    exponent: env.ONYX_PYTH_PRO_SOL_USD_EXPONENT,
    channel: env.ONYX_PYTH_PRO_CHANNEL,
    logger,
    publish: (tick) => redisTickPublisher.publish(tick),
    persist: (tick) => marketSyncWriter.flushPriceTick(tick),
  });
} else {
  logger.info(
    { enabled: env.ONYX_SOL_USD_FEED_ENABLED, hasToken: Boolean(env.ONYX_PYTH_PRO_ACCESS_TOKEN) },
    "SOL/USD feed disabled (missing Pyth Pro token or disabled)"
  );
}
const exitExecutor = new ExitExecutor({
  executionEngine,
  maxSlippageBps: env.ONYX_MAX_SLIPPAGE_BPS,
  baseTipLamports: env.ONYX_BASE_TIP_LAMPORTS
});
await syncWalletBalance("startup");

const recordWalletMilestones = () => {
  const walletUsd = riskController.getWalletBalanceUsd();
  for (const milestone of growthMilestonesUsd) {
    if (walletUsd >= milestone && !reachedMilestones.has(milestone)) {
      reachedMilestones.add(milestone);
      alerts.emit("info", "Micro wallet milestone reached.", { milestoneUsd: milestone, walletUsd });
    }
  }
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const pruneFlowSeries = (series: number[], minAllowedTs: number) => {
  while (series.length > 0 && (series[0] ?? 0) < minAllowedTs) {
    series.shift();
  }
};
const snapshotPrimaryFlow = (tokenMint: string, now: number) => {
  const stats = primaryFlowStats.get(tokenMint);
  if (!stats) {
    return { tickCount: 0, buyTickCount: 0 };
  }
  const minAllowedTs = now - env.ONYX_VOLUME_GATE_WINDOW_MS;
  pruneFlowSeries(stats.tickTimes, minAllowedTs);
  pruneFlowSeries(stats.buyTimes, minAllowedTs);
  return {
    tickCount: stats.tickTimes.length,
    buyTickCount: stats.buyTimes.length
  };
};
const snapshotHighVolumeFlow = (tokenMint: string, now: number) => {
  const stats = primaryFlowStats.get(tokenMint);
  if (!stats) {
    return { tickCount: 0, buyTickCount: 0 };
  }
  const minAllowedTs = now - env.ONYX_HIGH_VOLUME_WINDOW_MS;
  pruneFlowSeries(stats.tickTimes, minAllowedTs);
  pruneFlowSeries(stats.buyTimes, minAllowedTs);
  return {
    tickCount: stats.tickTimes.length,
    buyTickCount: stats.buyTimes.length
  };
};
const updateHighVolumePriceSeries = (tokenMint: string, priceSol: number, now: number) => {
  const series = highVolumePriceSeriesByMint.get(tokenMint) ?? [];
  series.push({ ts: now, priceSol });
  const minAllowedTs = now - env.ONYX_HIGH_VOLUME_WINDOW_MS;
  while (series.length > 0 && (series[0]?.ts ?? 0) < minAllowedTs) {
    series.shift();
  }
  highVolumePriceSeriesByMint.set(tokenMint, series);
};
const computeHighVolumeMomentumBps = (tokenMint: string) => {
  const series = highVolumePriceSeriesByMint.get(tokenMint);
  if (!series || series.length < 2) {
    return 0;
  }
  const first = series[0];
  const last = series[series.length - 1];
  if (!first || !last || first.priceSol <= 0) {
    return 0;
  }
  return Math.floor(((last.priceSol - first.priceSol) / first.priceSol) * 10_000);
};
const getActiveModeProfile = () => {
  const recentMedianRealizedPnlBps = metrics.recentMedianPnlBps(env.ONYX_REALIZED_EDGE_WINDOW_TRADES);
  const mode = resolveTradingMode({
    preference: env.ONYX_TRADING_MODE,
    closedTrades: metrics.closedTradeCount(),
    recentMedianRealizedPnlBps,
    minTradesBeforeBalance: env.ONYX_MODE_TRANSITION_MIN_TRADES,
    minMedianRealizedPnlBps: env.ONYX_MODE_TRANSITION_MIN_MEDIAN_REALIZED_BPS
  });
  return modeProfileFor(mode, env.ONYX_QUALITY_SNIPE_MIN_SCORE, env.ONYX_MAX_CONCURRENT_POSITIONS);
};

const computeExpectedAlphaBps = ({
  decisionScore,
  flowTickCount,
  flowBuyTickCount
}: {
  decisionScore: number;
  flowTickCount: number;
  flowBuyTickCount: number;
}) => {
  const qualityBoostBps = Math.max(0, 100 - decisionScore) * 18;
  const flowBoostBps = clamp(flowTickCount, 0, 25) * 50 + clamp(flowBuyTickCount, 0, 16) * 70;
  return Math.floor(qualityBoostBps + flowBoostBps);
};

const computeExpectedImpactBps = ({
  slippageBps,
  candidateBuySol
}: {
  slippageBps: number;
  candidateBuySol: number;
}) => {
  const notionalImpactBps = Math.min(260, candidateBuySol * 5_400);
  const residualImpactFromSlippageBps = Math.floor(slippageBps * 0.12);
  return Math.floor(notionalImpactBps + residualImpactFromSlippageBps);
};

const computeEntryAgeThresholdMs = (source: LaunchSignal["source"]) =>
  source === "high-volume-lane" || source === "sweep-detector"
    ? env.ONYX_ENTRY_MAX_SIGNAL_AGE_MS + env.ONYX_SWEEP_MOON_WINDOW_MS
    : env.ONYX_ENTRY_MAX_SIGNAL_AGE_MS;

const computeEntryHardAgeCapMs = (source: LaunchSignal["source"]) => {
  const thresholdMs = computeEntryAgeThresholdMs(source);
  const queueGraceMs = env.ONYX_ENTRY_TICK_WARMUP_MS + 2_000;
  return thresholdMs + queueGraceMs;
};

const buildActiveExposureSnapshot = () => {
  const openMints = new Set(positionManager.getOpenMints());
  const inflightMints = new Set(inflightEntryMints);
  const queuedMints = new Set(queuedEntryMints);
  const pendingMints = new Set(pendingEntries.keys());
  // Only count capital-at-risk/near-risk buckets against concurrent exposure.
  // Queued mints are discovery backlog and can spike during bursty launch periods.
  const exposureTrackedMints = new Set<string>([...openMints, ...inflightMints, ...pendingMints]);

  return {
    activeExposureCount: exposureTrackedMints.size,
    openPositionsCount: openMints.size,
    inflightEntriesCount: inflightMints.size,
    queuedEntriesCount: queuedMints.size,
    pendingEntriesCount: pendingMints.size,
    overlapCounts: {
      openAndInflight: [...openMints].filter((mint) => inflightMints.has(mint)).length,
      openAndQueued: [...openMints].filter((mint) => queuedMints.has(mint)).length,
      inflightAndQueued: [...inflightMints].filter((mint) => queuedMints.has(mint)).length
    },
    sampleMints: {
      open: [...openMints].slice(0, 5),
      inflight: [...inflightMints].slice(0, 5),
      queued: [...queuedMints].slice(0, 5),
      pending: [...pendingMints].slice(0, 5)
    }
  };
};

const computeDynamicQualityMinScore = () => {
  if (!env.ONYX_DYNAMIC_ENTRY_QUALITY_ENABLED) {
    return env.ONYX_QUALITY_SNIPE_MIN_SCORE;
  }
  const failureRateBps = riskController.getFailureRateBps();
  const qualityPenalty = Math.floor(failureRateBps / Math.max(1, env.ONYX_DYNAMIC_ENTRY_QUALITY_DEGRADE_BPS * 100));
  return env.ONYX_QUALITY_SNIPE_MIN_SCORE + Math.min(env.ONYX_DYNAMIC_ENTRY_QUALITY_MAX_ADD, qualityPenalty);
};

const shouldAllowFastPathBypass = () => {
  if (!fastStopoutCircuitActive) {
    return true;
  }
  const elapsed = Date.now() - fastStopoutCircuitActiveAt;
  if (elapsed < env.ONYX_FAST_STOPOUT_COOLDOWN_MS) {
    return false;
  }
  fastStopoutCircuitActive = false;
  return true;
};

const pruneExpiredPendingEntries = (now: number) => {
  for (const [mint, pending] of pendingEntries.entries()) {
    if (pending.expiresAt <= now) {
      pendingEntries.delete(mint);
    }
  }
};

const finalizeClosedPosition = (
  closed: import("./types/domain.js").ClosedPosition,
  signalToSubmitMs: number,
  realizedWalletPnlBps: number
) => {
  const pricePnlBps = closed.pnlBps;
  const riskAccountingPnlBps =
    Math.abs(realizedWalletPnlBps) < RISK_PNL_NEUTRAL_DEADZONE_BPS &&
    Math.abs(pricePnlBps) >= RISK_PRICE_PNLL_FALLBACK_MIN_BPS
      ? pricePnlBps
      : realizedWalletPnlBps;

  const holdMs = Date.now() - closed.entryTime;
  metrics.recordEntryToExitDuration(holdMs / 1000);
  if (holdMs <= env.ONYX_FAST_STOPOUT_HOLD_THRESHOLD_MS && riskAccountingPnlBps < 0) {
    metrics.recordFastStopout();
    const snapshot = metrics.snapshot();
    const totalClosed = snapshot.wins + snapshot.losses + snapshot.neutralOutcomes;
    if (totalClosed >= env.ONYX_FAST_STOPOUT_WINDOW_TRADES) {
      const fastStopoutRateBps = Math.floor((snapshot.fastStopoutCount * 10_000) / Math.max(1, totalClosed));
      if (fastStopoutRateBps >= env.ONYX_FAST_STOPOUT_RATE_BPS) {
        fastStopoutCircuitActive = true;
        fastStopoutCircuitActiveAt = Date.now();
      }
    }
  }
  metrics.recordClosedTrade(riskAccountingPnlBps);
  metrics.recordExitReason(closed.reason);
  if (Math.abs(riskAccountingPnlBps) < RISK_PNL_NEUTRAL_DEADZONE_BPS) {
    riskController.applyTradeOutcome({ type: "neutral", pnlBps: riskAccountingPnlBps });
  } else if (riskAccountingPnlBps >= 0) {
    riskController.applyTradeOutcome({ type: "win", pnlBps: riskAccountingPnlBps });
    globalEntryCooldownUntilMs = 0;
  } else {
    riskController.applyTradeOutcome({ type: "loss", pnlBps: riskAccountingPnlBps });
    const streak = riskController.getConsecutiveLosses();
    const streakMultiplier = Math.pow(2, Math.max(0, streak - 1));
    const globalCooldownMs = Math.min(env.ONYX_ENTRY_COOLDOWN_MAX_MS, env.ONYX_ENTRY_COOLDOWN_BASE_MS * streakMultiplier);
    globalEntryCooldownUntilMs = Date.now() + globalCooldownMs;
    if (closed.creator) {
      creatorCooldownUntilByCreator.set(closed.creator, Date.now() + env.ONYX_ENTRY_CREATOR_COOLDOWN_MS);
    }
  }
  metrics.recordGainBand(riskAccountingPnlBps, env.ONYX_TAKE_PROFIT_MIN_BPS, env.ONYX_TAKE_PROFIT_MAX_BPS);
  alerts.emit("info", "Position exited.", {
    tokenMint: closed.tokenMint,
    reason: closed.reason,
    pricePnlBps,
    realizedWalletPnlBps,
    riskAccountingPnlBps,
    signalToSubmitMs
  });
  metrics.recordDrawdown(riskController.getDrawdownBps());
  recordWalletMilestones();
  void tickInterestWatch?.releaseMintWatch(closed.tokenMint);
};

const sanitizeRealizedWalletPnlBps = ({
  position,
  closedPricePnlBps,
  postExitWalletSol
}: {
  position: import("./types/domain.js").Position;
  closedPricePnlBps: number;
  postExitWalletSol: number;
}) => {
  if (position.walletBalanceSolAtEntry <= 0) {
    return closedPricePnlBps;
  }

  const rawRealizedWalletPnlBps = Math.floor(
    ((postExitWalletSol - position.walletBalanceSolAtEntry) / position.walletBalanceSolAtEntry) * 10_000
  );

  // Guard against balance-snapshot noise causing implausible wallet deltas for one close.
  const notionalToWalletRatio = position.entrySol / Math.max(position.walletBalanceSolAtEntry, 0.00000001);
  const maxReasonableLossBps = Math.floor(notionalToWalletRatio * 10_000 * 1.35 + 300);
  const maxReasonableGainBps = Math.floor(notionalToWalletRatio * 10_000 * 2.5 + 500);
  if (
    rawRealizedWalletPnlBps < -maxReasonableLossBps ||
    rawRealizedWalletPnlBps > maxReasonableGainBps
  ) {
    logger.warn(
      {
        tokenMint: position.tokenMint,
        rawRealizedWalletPnlBps,
        fallbackPricePnlBps: closedPricePnlBps,
        maxReasonableLossBps,
        maxReasonableGainBps,
        entrySol: position.entrySol,
        walletBalanceSolAtEntry: position.walletBalanceSolAtEntry
      },
      "Implausible realized wallet PnL delta detected; using price-based PnL for risk accounting."
    );
    return closedPricePnlBps;
  }

  const contradictoryTakeProfitClose =
    closedPricePnlBps >= env.ONYX_TAKE_PROFIT_MIN_BPS &&
    (rawRealizedWalletPnlBps <= 0 ||
      rawRealizedWalletPnlBps < Math.floor(closedPricePnlBps * 0.15)) &&
    closedPricePnlBps - rawRealizedWalletPnlBps >= Math.max(250, Math.floor(closedPricePnlBps * 0.35));
  if (contradictoryTakeProfitClose) {
    logger.warn(
      {
        tokenMint: position.tokenMint,
        rawRealizedWalletPnlBps,
        fallbackPricePnlBps: closedPricePnlBps,
        entrySol: position.entrySol,
        walletBalanceSolAtEntry: position.walletBalanceSolAtEntry
      },
      "Contradictory take-profit close detected from wallet sync timing; using price-based PnL for risk accounting."
    );
    return closedPricePnlBps;
  }

  return rawRealizedWalletPnlBps;
};

const executeEntry = async ({
  launch,
  intent,
  entryPriceSol
}: {
  launch: import("./types/domain.js").LaunchSignal;
  intent: import("./types/domain.js").TradeIntent;
  entryPriceSol: number;
}) => {
  if (entryExecutionInFlight || positionManager.hasOpenPosition(launch.tokenMint)) {
    return;
  }
  const modeProfileForEntry = getActiveModeProfile();
  if (positionManager.getOpenMints().length >= modeProfileForEntry.maxConcurrentPositions) {
    return;
  }
  entryExecutionInFlight = true;
  let result: Awaited<ReturnType<ExecutionEngine["execute"]>>;
  try {
    result = await executionEngine.execute(intent);
  } finally {
    entryExecutionInFlight = false;
  }

  if (!result.ok || !result.signature) {
    const errorText = String(result.error ?? "");
    const isIntentStale = errorText.toLowerCase().includes("intent-stale");
    const isRateLimited = errorText.toLowerCase().includes("rate limit exceeded");
    if (!isIntentStale) {
      metrics.recordExecutionFailure();
    }
    if (!isRateLimited && !isIntentStale) {
      riskController.applyTradeOutcome({ type: "execution-failed" });
    }
    alerts.emit("warn", "Execution failed.", { tokenMint: launch.tokenMint, error: result.error });
    return;
  }

  const walletBalanceSolAtEntry = riskController.getWalletBalanceSol();
  metrics.recordExecution(result.latencyMs);
  void syncWalletBalance(`post-entry-${launch.tokenMint}`);
  positionManager.open({
    tokenMint: launch.tokenMint,
    entrySignature: result.signature,
    entryTime: Date.now(),
    entrySol: intent.amountSol,
    quantity: 1,
    entryPriceSol,
    highestObservedPrice: entryPriceSol,
    lastPrice: entryPriceSol,
    openedAt: Date.now(),
    lastUpdateAt: Date.now(),
    walletBalanceSolAtEntry,
    partialTakeProfitCount: 0,
    expectedEntrySlippageBps: intent.maxSlippageBps,
    creator: launch.creator,
    bondingCurve: launch.bondingCurve
  });
  void tickInterestWatch?.touchMintWatch(launch.tokenMint);
  pendingEntries.delete(launch.tokenMint);
  if (env.ONYX_BILLING_TRADE_ENABLED && guardianBilling && env.ONYX_BILLING_CUSTOMER_ID) {
    const buyNotionalUsd = intent.amountSol * env.ONYX_ESTIMATED_SOL_USD;
    const feeUsd = (buyNotionalUsd * env.ONYX_PLATFORM_TRADE_FEE_BPS) / 10_000;
    if (feeUsd > 0) {
      try {
        await guardianBilling.trackTradeFee(env.ONYX_BILLING_CUSTOMER_ID, feeUsd);
      } catch (err: unknown) {
        logger.warn({ err, tokenMint: launch.tokenMint, feeUsd }, "Autumn trade fee track failed after entry.");
      }
    }
  }
};

const tryExecuteExit = async ({
  position,
  reason,
  pnlBps
}: {
  position: import("./types/domain.js").Position;
  reason: import("./types/domain.js").ClosedPosition["reason"];
  pnlBps: number;
}) => {
  const now = Date.now();
  const retryNotBeforeAt = exitRetryNotBeforeByMint.get(position.tokenMint) ?? 0;
  if (now < retryNotBeforeAt) {
    return;
  }
  if (exitInFlightMints.has(position.tokenMint)) {
    return;
  }
  exitInFlightMints.add(position.tokenMint);
  try {
    const exitResult = await exitExecutor.execute(position);
    if (!exitResult.ok) {
      if (exitResult.error?.includes("no-token-balance-to-sell")) {
        const closed = positionManager.evaluateForExit(position.tokenMint, pnlBps, Date.now(), reason);
        if (closed) {
          staleExitFirstSeenAtByMint.delete(position.tokenMint);
          exitRetryNotBeforeByMint.delete(position.tokenMint);
          finalizeClosedPosition(closed, exitResult.latencyMs, closed.pnlBps);
          alerts.emit("warn", "Exit skipped because no token balance remained; position closed locally.", {
            tokenMint: position.tokenMint,
            reason
          });
        }
        return;
      }
      const confirmationTimeout = exitResult.error?.includes("timeout-before-confirmed-status");
      exitRetryNotBeforeByMint.set(
        position.tokenMint,
        Date.now() + (confirmationTimeout ? EXIT_CONFIRM_TIMEOUT_BACKOFF_MS : EXIT_RETRY_BACKOFF_MS)
      );
      metrics.recordExecutionFailure();
      riskController.applyTradeOutcome({ type: "execution-failed" });
      alerts.emit("warn", "Exit execution failed.", {
        tokenMint: position.tokenMint,
        reason,
        error: exitResult.error
      });
      return;
    }
    metrics.recordExecution(exitResult.latencyMs);
    const closed = positionManager.evaluateForExit(position.tokenMint, pnlBps, Date.now(), reason);
    if (!closed) {
      return;
    }
    await syncWalletBalance(`post-exit-${position.tokenMint}`, { forceDrawdownUpdate: true });
    const postExitWalletSol = riskController.getWalletBalanceSol();
    const realizedWalletPnlBps = sanitizeRealizedWalletPnlBps({
      position,
      closedPricePnlBps: closed.pnlBps,
      postExitWalletSol
    });
    staleExitFirstSeenAtByMint.delete(position.tokenMint);
    exitRetryNotBeforeByMint.delete(position.tokenMint);
    finalizeClosedPosition(closed, exitResult.latencyMs, realizedWalletPnlBps);
  } finally {
    exitInFlightMints.delete(position.tokenMint);
  }
};

const tryExecutePartialExit = async ({
  position,
  pnlBps,
  sellPctBps
}: {
  position: import("./types/domain.js").Position;
  pnlBps: number;
  sellPctBps: number;
}) => {
  if (exitInFlightMints.has(position.tokenMint)) {
    return;
  }
  exitInFlightMints.add(position.tokenMint);
  try {
    const exitResult = await exitExecutor.execute(position, sellPctBps);
    if (!exitResult.ok) {
      metrics.recordExecutionFailure();
      riskController.applyTradeOutcome({ type: "execution-failed" });
      alerts.emit("warn", "Partial exit execution failed.", { tokenMint: position.tokenMint, sellPctBps });
      return;
    }
    metrics.recordExecution(exitResult.latencyMs);
    positionManager.markPartialTakeProfit(position.tokenMint, sellPctBps, Date.now());
    await syncWalletBalance(`post-partial-exit-${position.tokenMint}`);
    alerts.emit("info", "Partial take-profit executed.", {
      tokenMint: position.tokenMint,
      soldPctBps: sellPctBps,
      pricePnlBps: pnlBps,
      signalToSubmitMs: exitResult.latencyMs
    });
  } finally {
    exitInFlightMints.delete(position.tokenMint);
  }
};

const processLaunchSignal = async (
  launch: LaunchSignal,
  queueContext?: {
    enqueuedAt?: number;
  }
) => {
  const log = logger.child({ tokenMint: launch.tokenMint });
  const decisionStartedAt = Date.now();
  if (launch.source === "drpc-logs") {
    launchSeenAtByMint.set(launch.tokenMint, Date.now());
  }
  const now = Date.now();
  if (now < globalEntryCooldownUntilMs) {
    return;
  }
  const creatorCooldownUntil = creatorCooldownUntilByCreator.get(launch.creator) ?? 0;
  if (creatorCooldownUntil > now) {
    return;
  }
  sourceHealth.record(launch.signature, Date.now() - launch.receivedAt);
  const sourceSnapshot = sourceHealth.snapshot();
  if (!sourceSnapshot.healthy) {
    alerts.emit("warn", "Source quality unhealthy; skipping signal.", sourceSnapshot);
    return;
  }

  metrics.recordSignal();
  pruneExpiredPendingEntries(Date.now());
  const closedTradeCount = metrics.closedTradeCount();
  const recentMedianRealizedPnlBps = metrics.recentMedianPnlBps(env.ONYX_REALIZED_EDGE_WINDOW_TRADES);
  if (
    closedTradeCount >= env.ONYX_REALIZED_EDGE_MIN_CLOSED_TRADES &&
    recentMedianRealizedPnlBps !== undefined &&
    recentMedianRealizedPnlBps < env.ONYX_REALIZED_EDGE_MIN_MEDIAN_BPS
  ) {
    const now = Date.now();
    if (now - lastEdgeBlockedEntryAlertAt >= env.ONYX_CONCURRENT_SKIP_ALERT_COOLDOWN_MS) {
      lastEdgeBlockedEntryAlertAt = now;
      alerts.emit("warn", "Entry blocked by realized-edge guard.", {
        closedTradeCount,
        minClosedTrades: env.ONYX_REALIZED_EDGE_MIN_CLOSED_TRADES,
        recentMedianRealizedPnlBps,
        thresholdBps: env.ONYX_REALIZED_EDGE_MIN_MEDIAN_BPS,
        windowTrades: env.ONYX_REALIZED_EDGE_WINDOW_TRADES
      });
    }
    return;
  }

  if (riskController.shouldBlockEntries()) {
    const now = Date.now();
    if (now - lastBlockedEntryAlertAt >= env.ONYX_CONCURRENT_SKIP_ALERT_COOLDOWN_MS) {
      lastBlockedEntryAlertAt = now;
      alerts.emit("warn", "Entry blocked due to kill switch.", {
        mode: getActiveModeProfile().mode,
        drawdownBps: riskController.getDrawdownBps(),
        drawdownLimitBps: env.ONYX_DAILY_MAX_DRAWDOWN_BPS,
        failureRateBps: riskController.getFailureRateBps(),
        failureRateLimitBps: env.ONYX_MAX_FAILURE_RATE_BPS
      });
    }
    return;
  }

  const nowAtAgeGate = Date.now();
  const queuedAt = queueContext?.enqueuedAt;
  const effectiveSignalReceivedAt = Math.max(launch.receivedAt, queuedAt ?? launch.receivedAt);
  const signalAgeMs = nowAtAgeGate - effectiveSignalReceivedAt;
  const rawSignalAgeMs = nowAtAgeGate - launch.receivedAt;
  const signalAgeThresholdMs = computeEntryAgeThresholdMs(launch.source);
  const signalAgeHardCapMs = Math.min(
    computeEntryHardAgeCapMs(launch.source),
    env.ONYX_ENTRY_QUEUE_TTL_MS + signalAgeThresholdMs
  );
  metrics.recordQueueToDecisionLatency(nowAtAgeGate - (queuedAt ?? launch.receivedAt));
  if (rawSignalAgeMs > signalAgeHardCapMs) {
    metrics.recordStaleHardCapSkip();
    alerts.emit("info", "Entry skipped due to stale launch signal before execution.", {
      tokenMint: launch.tokenMint,
      rawSignalAgeMs,
      signalAgeMs,
      thresholdMs: signalAgeThresholdMs,
      hardCapMs: signalAgeHardCapMs
    });
    return;
  }
  if (signalAgeMs > signalAgeThresholdMs) {
    metrics.recordStaleQueueSkip();
    alerts.emit("info", "Entry skipped due to stale queued signal before execution.", {
      tokenMint: launch.tokenMint,
      rawSignalAgeMs,
      signalAgeMs,
      thresholdMs: signalAgeThresholdMs
    });
    return;
  }

  if (positionManager.hasOpenPosition(launch.tokenMint)) {
    log.debug("Skipping existing open position.");
    return;
  }
  if (
    inflightEntryMints.has(launch.tokenMint) ||
    queuedEntryMints.has(launch.tokenMint) ||
    pendingEntries.has(launch.tokenMint)
  ) {
    log.debug("Skipping duplicate queued/in-flight/pending entry.");
    return;
  }
  const modeProfile = getActiveModeProfile();
  const exposureSnapshot = buildActiveExposureSnapshot();
  const { activeExposureCount } = exposureSnapshot;
  if (activeExposureCount >= modeProfile.maxConcurrentPositions) {
    const now = Date.now();
    if (now - lastConcurrentSkipAlertAt >= env.ONYX_CONCURRENT_SKIP_ALERT_COOLDOWN_MS) {
      lastConcurrentSkipAlertAt = now;
      alerts.emit("info", "Entry skipped by concurrent position cap.", {
        maxConcurrent: modeProfile.maxConcurrentPositions,
        mode: modeProfile.mode,
        activeExposureCount,
        pendingEntries: pendingEntries.size,
        exposureBreakdown: exposureSnapshot
      });
    }
    return;
  }
  inflightEntryMints.add(launch.tokenMint);
  try {
    if (env.ONYX_BILLING_TRADE_ENABLED && guardianBilling && env.ONYX_BILLING_CUSTOMER_ID) {
      try {
        await guardianBilling.assertTradeEntryAllowed(env.ONYX_BILLING_CUSTOMER_ID);
      } catch (err: unknown) {
        alerts.emit("warn", "Entry blocked by billing or entitlement gate.", {
          tokenMint: launch.tokenMint,
          err
        });
        return;
      }
    }
    const freshnessAdjustedLaunch: LaunchSignal =
      effectiveSignalReceivedAt === launch.receivedAt
        ? launch
        : {
            ...launch,
            receivedAt: effectiveSignalReceivedAt
          };
    const riskEvalStartedAt = Date.now();
    const decision = await riskEngine.evaluate(freshnessAdjustedLaunch);
    metrics.recordRiskEvalLatency(Date.now() - riskEvalStartedAt);
    metrics.recordCreatorRisk(decision.creatorRiskScore, decision.creatorRiskUnknown);
    if (!decision.passed) {
      creatorCooldownUntilByCreator.set(launch.creator, Date.now() + env.ONYX_ENTRY_CREATOR_COOLDOWN_MS);
      metrics.recordRiskReject();
      alerts.emit("info", "Signal rejected by risk engine.", {
        tokenMint: launch.tokenMint,
        reasons: decision.reasons
      });
      return;
    }

    const laneSizingMultiplierBps =
      launch.source === "sweep-detector"
        ? Math.floor((modeProfile.sizingMultiplierBps * sweepSizingMultiplierBps) / 10_000)
        : launch.source === "high-volume-lane"
          ? Math.floor((modeProfile.sizingMultiplierBps * env.ONYX_HIGH_VOLUME_SIZING_MULTIPLIER_BPS) / 10_000)
        : modeProfile.sizingMultiplierBps;
    const modeAdjustedTargetBuySol = Number(((env.ONYX_TARGET_BUY_SOL * laneSizingMultiplierBps) / 10_000).toFixed(6));
    const candidateBuySol = Math.min(modeAdjustedTargetBuySol, riskController.getPositionSizeSol());
    const flow = snapshotPrimaryFlow(launch.tokenMint, Date.now());
    const expectedAlphaBps = computeExpectedAlphaBps({
      decisionScore: decision.score,
      flowTickCount: flow.tickCount,
      flowBuyTickCount: flow.buyTickCount
    });
    const expectedImpactBps = computeExpectedImpactBps({
      slippageBps: decision.expectedSlippageBps,
      candidateBuySol
    });
    const dynamicFeeBps = env.ONYX_DYNAMIC_TIP_ENABLED
      ? Math.floor((env.ONYX_DYNAMIC_TIP_EDGE_FACTOR_BPS + env.ONYX_DYNAMIC_TIP_LATENCY_FACTOR_BPS) / 100)
      : 120;
    const viability = riskController.isTradeEconomicallyViable(
      candidateBuySol,
      decision.expectedSlippageBps,
      expectedAlphaBps,
      dynamicFeeBps,
      expectedImpactBps
    );
    const downsideSafetyBufferBps = Math.min(240, riskController.getConsecutiveLosses() * 60);
    const laneMinEdgeRequired =
      launch.source === "high-volume-lane" || launch.source === "sweep-detector"
        ? viability.adaptiveMinNetEdgeBps + env.ONYX_HIGH_VOLUME_MIN_EDGE_BONUS_BPS + downsideSafetyBufferBps
        : viability.adaptiveMinNetEdgeBps + downsideSafetyBufferBps;
    const viabilityNearMiss =
      viability.decisionClass === "promotable" || viability.decisionClass === "soft-block";
    const nearThresholdPromoteBandBps = 80;
    const nearThresholdPromote =
      modeProfile.mode === "balanced" &&
      viabilityNearMiss &&
      viability.edgeNetBps >= laneMinEdgeRequired - nearThresholdPromoteBandBps &&
      decision.score <= 45;
    const promoteSlackBps = nearThresholdPromote ? nearThresholdPromoteBandBps : 0;
    if ((!viability.viable && !nearThresholdPromote) || viability.edgeNetBps < laneMinEdgeRequired - promoteSlackBps) {
      metrics.recordSkippedMinNotional();
      if (viability.reason === "cost-too-high") {
        metrics.recordCostTooHighSkip();
      }
      const viabilityMessage =
        viability.reason === "below-min-notional"
          ? "Entry skipped: below minimum trade notional."
          : "Entry skipped: edge net below configured threshold.";
      alerts.emit("info", viabilityMessage, {
        candidateBuySol,
        expectedSlippageBps: decision.expectedSlippageBps,
        viabilityReason: viability.reason,
        positionUsd: viability.positionUsd,
        minTradeNotionalUsd: viability.minTradeNotionalUsd,
        estimatedCostsBps: viability.estimatedCostsBps,
        configuredMinNetEdgeBps: viability.minNetEdgeBps,
        adaptiveMinNetEdgeBps: viability.adaptiveMinNetEdgeBps,
        viabilityDecisionClass: viability.decisionClass,
        costComponentsBps: viability.costComponentsBps,
        downsideSafetyBufferBps,
        minNetEdgeBps: laneMinEdgeRequired,
        edgeNetBps: viability.edgeNetBps,
        expectedAlphaBps,
        expectedImpactBps
      });
      return;
    }

    let snipeQualityScore: number | undefined;
    let snipeQualityThreshold: number | undefined;
    if (env.ONYX_QUALITY_SNIPE_ENABLED) {
      const warmupStats = primaryTickStats.get(launch.tokenMint);
      const tickCountRatio = clamp01((warmupStats?.count ?? 0) / env.ONYX_ENTRY_MIN_PRIMARY_TICKS);
      const warmupMs = (warmupStats?.lastSeenAt ?? 0) - (warmupStats?.firstSeenAt ?? 0);
      const tickWarmupRatio = clamp01(warmupMs / env.ONYX_ENTRY_TICK_WARMUP_MS);
      const tickQuality = Math.round(100 * Math.min(tickCountRatio, tickWarmupRatio));
      const riskQuality = Math.round(100 * (1 - clamp01(decision.score / 100)));
      const slippageQuality = Math.round(
        100 * (1 - clamp01(decision.expectedSlippageBps / Math.max(env.ONYX_MAX_SLIPPAGE_BPS, 1)))
      );
      const stalenessQuality = Math.round(
        100 * (1 - clamp01(decision.staleSignalMs / Math.max(env.ONYX_ENTRY_MAX_SIGNAL_AGE_MS, 1)))
      );
      const qualityScore = Math.round(
        riskQuality * 0.35 +
          slippageQuality * 0.2 +
          tickQuality * 0.2 +
          stalenessQuality * 0.1 +
          Math.round(100 * clamp01(flow.buyTickCount / Math.max(1, flow.tickCount))) * 0.15
      );
      const laneQualityThreshold =
        launch.source === "high-volume-lane" || launch.source === "sweep-detector"
          ? env.ONYX_HIGH_VOLUME_QUALITY_MIN_SCORE
          : modeProfile.qualityScoreMin;
      const effectiveQualityThreshold = Math.max(laneQualityThreshold, computeDynamicQualityMinScore());
      if (qualityScore < effectiveQualityThreshold) {
        metrics.recordQualityGateBlocked();
        const now = Date.now();
        if (now - lastQualityBlockedEntryAlertAt >= env.ONYX_CONCURRENT_SKIP_ALERT_COOLDOWN_MS) {
          lastQualityBlockedEntryAlertAt = now;
          alerts.emit("info", "Entry blocked by quality-snipe score gate.", {
            tokenMint: launch.tokenMint,
            qualityScore,
            minScore: effectiveQualityThreshold,
            mode: modeProfile.mode,
            riskQuality,
            slippageQuality,
            tickQuality,
            stalenessQuality
          });
        }
        return;
      }
      snipeQualityScore = qualityScore;
      snipeQualityThreshold = effectiveQualityThreshold;
    }

    notificationHub.notifySnipeOpportunity({
      tokenMint: launch.tokenMint,
      qualityScore: snipeQualityScore,
      qualityThreshold: snipeQualityThreshold,
      riskScore: decision.score,
      edgeNetBps: viability.edgeNetBps,
      source: launch.source,
      creator: launch.creator
    });

    if (env.ONYX_VOLUME_GATE_ENABLED) {
      const laneMinTicks =
        launch.source === "high-volume-lane" || launch.source === "sweep-detector"
          ? env.ONYX_HIGH_VOLUME_MIN_TICKS
          : env.ONYX_VOLUME_GATE_MIN_TICKS;
      const laneMinBuyTicks =
        launch.source === "high-volume-lane" || launch.source === "sweep-detector"
          ? env.ONYX_HIGH_VOLUME_MIN_BUY_TICKS
          : env.ONYX_VOLUME_GATE_MIN_BUY_TICKS;
      const flowImbalanceStrong = flow.tickCount > 0 && flow.buyTickCount / flow.tickCount >= 0.72;
      const canBypassVolumeGate = flowImbalanceStrong && shouldAllowFastPathBypass() && decision.score <= 35;
      if (!canBypassVolumeGate && (flow.tickCount < laneMinTicks || flow.buyTickCount < laneMinBuyTicks)) {
        metrics.recordVolumeGateBlocked();
        const now = Date.now();
        if (now - lastVolumeBlockedEntryAlertAt >= env.ONYX_CONCURRENT_SKIP_ALERT_COOLDOWN_MS) {
          lastVolumeBlockedEntryAlertAt = now;
          alerts.emit("info", "Entry blocked by volume-flow gate.", {
            tokenMint: launch.tokenMint,
            windowMs: env.ONYX_VOLUME_GATE_WINDOW_MS,
            tickCount: flow.tickCount,
            minTicks: laneMinTicks,
            buyTickCount: flow.buyTickCount,
            minBuyTicks: laneMinBuyTicks
          });
        }
        return;
      }
    }

    const intent = buildBuyIntent({
      launch: freshnessAdjustedLaunch,
      buySol: candidateBuySol,
      expectedSlippageBps: decision.expectedSlippageBps,
      maxSlippageBps: env.ONYX_MAX_SLIPPAGE_BPS,
      baseTipLamports: env.ONYX_BASE_TIP_LAMPORTS,
      maxTipLamports: env.ONYX_MAX_TIP_LAMPORTS,
      minTipLamports: env.ONYX_MIN_TIP_LAMPORTS,
      dynamicTipEnabled: env.ONYX_DYNAMIC_TIP_ENABLED,
      edgeNetBps: viability.edgeNetBps,
      expectedAlphaBps,
      executionLatencyDegradeMs: env.ONYX_EXECUTION_LATENCY_DEGRADE_MS,
      dynamicTipEdgeFactorBps: env.ONYX_DYNAMIC_TIP_EDGE_FACTOR_BPS,
      dynamicTipLatencyFactorBps: env.ONYX_DYNAMIC_TIP_LATENCY_FACTOR_BPS,
      observedMedianLatencyMs: metrics.snapshot().medianExecutionLatencyMs
    });
    metrics.recordDecisionToSubmitLatency(Date.now() - decisionStartedAt);

    const observedEntryPrice =
      latestPrimaryTicks.get(launch.tokenMint)?.priceSol ??
      latestExternalTicks.get(launch.tokenMint)?.priceSol;
    const warmupStats = primaryTickStats.get(launch.tokenMint);
    const hasTickWarmup =
      env.ONYX_MODE === "paper" ||
      (warmupStats !== undefined &&
        warmupStats.count >= env.ONYX_ENTRY_MIN_PRIMARY_TICKS &&
        warmupStats.lastSeenAt - warmupStats.firstSeenAt >= env.ONYX_ENTRY_TICK_WARMUP_MS);
    if (env.ONYX_MODE !== "paper" && (!hasTickWarmup || observedEntryPrice === undefined)) {
      pendingEntries.set(launch.tokenMint, {
        launch,
        intent,
        expiresAt: Date.now() + 8_000
      });
      if (observedEntryPrice === undefined) {
        alerts.emit("info", "Entry queued until first live price tick for mint.", {
          tokenMint: launch.tokenMint
        });
      } else {
        alerts.emit("info", "Entry queued until primary tick warmup completes.", {
          tokenMint: launch.tokenMint,
          tickCount: warmupStats?.count ?? 0,
          requiredTicks: env.ONYX_ENTRY_MIN_PRIMARY_TICKS,
          warmupMs: (warmupStats?.lastSeenAt ?? 0) - (warmupStats?.firstSeenAt ?? 0),
          requiredWarmupMs: env.ONYX_ENTRY_TICK_WARMUP_MS
        });
      }
      return;
    }
    const entryPriceSol = observedEntryPrice ?? 1;

    await executeEntry({ launch, intent, entryPriceSol });
  } finally {
    inflightEntryMints.delete(launch.tokenMint);
  }
};

const processEntryQueue = async () => {
  if (entryQueueWorkerRunning) {
    return;
  }
  entryQueueWorkerRunning = true;
  try {
    while (entryQueue.length > 0) {
      entryQueue.sort((a, b) => b.receivedAt - a.receivedAt);
      const launch = entryQueue.shift();
      if (!launch) {
        continue;
      }
      const enqueuedAt = queuedEntryEnqueuedAtByMint.get(launch.tokenMint);
      queuedEntryEnqueuedAtByMint.delete(launch.tokenMint);
      queuedEntryMints.delete(launch.tokenMint);
      await processLaunchSignal(launch, { enqueuedAt });
    }
  } finally {
    entryQueueWorkerRunning = false;
  }
};

const processPriceTick = async (tick: PriceTick) => {
  if (
    env.ONYX_MARKET_SYNC_ENABLED &&
    (tick.source === "drpc-primary" || tick.source === "grpc-primary")
  ) {
    void marketSyncWriter.flushPriceTick({
      mint: tick.tokenMint,
      priceSol: tick.priceSol,
      receivedAtMs: tick.receivedAt,
      source: tick.source,
      eventType: tick.eventType
    });
  }
  updateHighVolumePriceSeries(tick.tokenMint, tick.priceSol, tick.receivedAt);
  if (tick.source === "drpc-primary" || tick.source === "grpc-primary") {
    latestPrimaryTicks.set(tick.tokenMint, tick);
    const currentStats = primaryTickStats.get(tick.tokenMint);
    if (!currentStats) {
      primaryTickStats.set(tick.tokenMint, {
        count: 1,
        firstSeenAt: tick.receivedAt,
        lastSeenAt: tick.receivedAt
      });
    } else {
      primaryTickStats.set(tick.tokenMint, {
        count: currentStats.count + 1,
        firstSeenAt: currentStats.firstSeenAt,
        lastSeenAt: tick.receivedAt
      });
    }
    const flow = primaryFlowStats.get(tick.tokenMint) ?? { tickTimes: [], buyTimes: [] };
    flow.tickTimes.push(tick.receivedAt);
    if (tick.eventType?.includes("buy")) {
      flow.buyTimes.push(tick.receivedAt);
    }
    const minAllowedTs = tick.receivedAt - env.ONYX_VOLUME_GATE_WINDOW_MS;
    pruneFlowSeries(flow.tickTimes, minAllowedTs);
    pruneFlowSeries(flow.buyTimes, minAllowedTs);
    primaryFlowStats.set(tick.tokenMint, flow);
  } else {
    latestExternalTicks.set(tick.tokenMint, tick);
  }

  if (
    allowsSweepDetectorSource(sectionMode) &&
    (tick.source === "drpc-primary" || tick.source === "grpc-primary")
  ) {
    const now = Date.now();
    const laneCooldownUntil = highVolumeEntryCooldownUntilByMint.get(tick.tokenMint) ?? 0;
    const isEligibleForSweepSignal =
      laneCooldownUntil <= now &&
      !positionManager.hasOpenPosition(tick.tokenMint) &&
      !inflightEntryMints.has(tick.tokenMint) &&
      !queuedEntryMints.has(tick.tokenMint) &&
      !pendingEntries.has(tick.tokenMint);
    if (isEligibleForSweepSignal) {
      const sweepSignal = sweepDetector.processTick(tick);
      if (sweepSignal) {
        highVolumeEntryCooldownUntilByMint.set(tick.tokenMint, now + env.ONYX_HIGH_VOLUME_ENTRY_COOLDOWN_MS);
        const detectorLaunchSignal: LaunchSignal = {
          signature: `sweep-${tick.tokenMint}-${now}`,
          tokenMint: tick.tokenMint,
          creator: creatorByMint.get(tick.tokenMint) ?? tick.tokenMint,
          receivedAt: now,
          slot: 0,
          source: "sweep-detector"
        };
        queuedEntryMints.add(tick.tokenMint);
        queuedEntryEnqueuedAtByMint.set(tick.tokenMint, now);
        entryQueue.push(detectorLaunchSignal);
        alerts.emit("info", "Sweep detector triggered momentum-dip entry.", {
          tokenMint: tick.tokenMint,
          dipFromAthBps: sweepSignal.dipFromAthBps,
          momentumBps: sweepSignal.momentumBps,
          buyRatioBps: sweepSignal.buyRatioBps,
          profile: sweepProfile
        });
        void processEntryQueue();
      }
    }
    sweepDetector.evictExpired(now);
  }

  const pending = pendingEntries.get(tick.tokenMint);
  if (pending && env.ONYX_MODE !== "paper") {
    if (pending.expiresAt <= Date.now()) {
      pendingEntries.delete(tick.tokenMint);
      alerts.emit("info", "Pending entry expired before first live tick.", { tokenMint: tick.tokenMint });
    } else if (
      !riskController.shouldBlockEntries() &&
      !positionManager.hasOpenPosition(tick.tokenMint) &&
      !entryExecutionInFlight
    ) {
      const warmupStats = primaryTickStats.get(tick.tokenMint);
      const hasTickWarmup =
        warmupStats !== undefined &&
        warmupStats.count >= env.ONYX_ENTRY_MIN_PRIMARY_TICKS &&
        warmupStats.lastSeenAt - warmupStats.firstSeenAt >= env.ONYX_ENTRY_TICK_WARMUP_MS;
      if (!hasTickWarmup) {
        return;
      }
      await executeEntry({
        launch: pending.launch,
        intent: pending.intent,
        entryPriceSol: tick.priceSol
      });
    }
  }

  const position = positionManager.getOpenPosition(tick.tokenMint);
  if (!position) {
    staleExitFirstSeenAtByMint.delete(tick.tokenMint);
    return;
  }
  staleExitFirstSeenAtByMint.delete(tick.tokenMint);

  positionManager.updatePrice(tick.tokenMint, tick.priceSol, tick.receivedAt);
  const modeProfile = getActiveModeProfile();
  const partialTpConfig =
    sectionMode === "sweep"
      ? {
          takeProfitPartialBps: sweepPartialTakeProfitBps,
          takeProfitPartialPctBps: env.ONYX_SWEEP_PARTIAL_TP_PCT_BPS
        }
      : modeProfile.mode === "aggressiveSpray" &&
          modeProfile.takeProfitPartialBps !== undefined &&
          modeProfile.takeProfitPartialPctBps !== undefined
        ? {
            takeProfitPartialBps: modeProfile.takeProfitPartialBps,
            takeProfitPartialPctBps: modeProfile.takeProfitPartialPctBps
          }
        : undefined;
  if (partialTpConfig) {
    const pnlBps = position.entryPriceSol > 0
      ? Math.floor(((tick.priceSol - position.entryPriceSol) / position.entryPriceSol) * 10_000)
      : 0;
    if (position.partialTakeProfitCount === 0 && pnlBps >= partialTpConfig.takeProfitPartialBps) {
      await tryExecutePartialExit({
        position,
        pnlBps,
        sellPctBps: partialTpConfig.takeProfitPartialPctBps
      });
      return;
    }
  }
  if (tick.eventType === "remove") {
    const pnlBps = position.entryPriceSol > 0
      ? Math.floor(((tick.priceSol - position.entryPriceSol) / position.entryPriceSol) * 10_000)
      : 0;
    alerts.emit("warn", "Liquidity removal detected for open mint; forcing emergency exit.", {
      tokenMint: tick.tokenMint
    });
    await tryExecuteExit({ position, reason: "kill-switch", pnlBps });
    return;
  }
  const decision = exitEngine.evaluate({
    position,
    tick,
    externalTick: latestExternalTicks.get(tick.tokenMint),
    now: Date.now()
  });
  if (!decision.shouldExit || !decision.reason || decision.pnlBps === undefined) {
    if (decision.deferredByDivergence) {
      alerts.emit("warn", "Exit deferred due to source divergence.", { tokenMint: tick.tokenMint });
    }
    return;
  }
  if (env.ONYX_EXIT_STRATEGY === "manual" || env.ONYX_EXIT_STRATEGY === "time_based") {
    return;
  }
  await tryExecuteExit({ position, reason: decision.reason, pnlBps: decision.pnlBps });
};

subscriber.onLaunch((launch) => {
  launchStreamServer?.broadcast(launch);
  launchSeenAtByMint.set(launch.tokenMint, Date.now());
  creatorByMint.set(launch.tokenMint, launch.creator);
  if (!allowsLaunchSource(sectionMode)) {
    return;
  }
  if (queuedEntryMints.has(launch.tokenMint)) {
    logger.debug({ tokenMint: launch.tokenMint }, "Skipping duplicate queued launch signal.");
    return;
  }
  queuedEntryMints.add(launch.tokenMint);
  queuedEntryEnqueuedAtByMint.set(launch.tokenMint, Date.now());
  entryQueue.push(launch);
  void processEntryQueue();
});

try {
  if (launchStreamServer) {
    await launchStreamServer.start();
    logger.info(
      {
        host: env.ONYX_PUBLIC_LAUNCH_STREAM_HOST,
        port: env.ONYX_PUBLIC_LAUNCH_STREAM_PORT,
        maxClients: env.ONYX_PUBLIC_LAUNCH_STREAM_MAX_CLIENTS
      },
      "Public launch WebSocket stream listening"
    );
  }
} catch (error: unknown) {
  logger.error({ err: error }, "Failed to start public launch stream; continuing without it.");
  launchStreamServer = undefined;
}
subscriber.start();
priceMux.onTick(async (tick) => {
  redisTickPublisher?.publish(tick);
  if (tickInterestWatch && positionManager.hasOpenPosition(tick.tokenMint)) {
    void tickInterestWatch.touchMintWatch(tick.tokenMint);
  }
  await processPriceTick(tick);
});
priceMux.start();

setInterval(() => {
  const now = Date.now();
  for (const mint of positionManager.getOpenMints()) {
    const position = positionManager.getOpenPosition(mint);
    if (!position) {
      continue;
    }
    const isStaleForExit = env.ONYX_MODE === "live" && now - position.lastUpdateAt >= env.ONYX_POSITION_STALE_EXIT_MS;
    const reachedMaxHold =
      env.ONYX_EXIT_STRATEGY !== "manual" && now - position.openedAt >= env.ONYX_MAX_HOLD_MS;
    if (!isStaleForExit && !reachedMaxHold) {
      staleExitFirstSeenAtByMint.delete(position.tokenMint);
      exitRetryNotBeforeByMint.delete(position.tokenMint);
      continue;
    }
    const retryNotBeforeAt = exitRetryNotBeforeByMint.get(position.tokenMint) ?? 0;
    if (now < retryNotBeforeAt) {
      continue;
    }
    const pnlBps = position.entryPriceSol > 0
      ? Math.floor(((position.lastPrice - position.entryPriceSol) / position.entryPriceSol) * 10_000)
      : 0;
    if (isStaleForExit) {
      const firstSeenAt = staleExitFirstSeenAtByMint.get(position.tokenMint);
      if (!firstSeenAt) {
        staleExitFirstSeenAtByMint.set(position.tokenMint, now);
        continue;
      }
      const staleElapsedMs = now - firstSeenAt;
      if (staleElapsedMs < env.ONYX_STALE_EXIT_GRACE_MS) {
        continue;
      }
      staleExitFirstSeenAtByMint.delete(position.tokenMint);
      alerts.emit("warn", "Position stale without fresh mint ticks; forcing emergency exit.", {
        tokenMint: position.tokenMint,
        staleMs: now - position.lastUpdateAt,
        thresholdMs: env.ONYX_POSITION_STALE_EXIT_MS,
        graceMs: env.ONYX_STALE_EXIT_GRACE_MS
      });
    }
    void tryExecuteExit({ position, reason: isStaleForExit ? "stale-tick" : "max-hold", pnlBps });
  }
  for (const [mint, pending] of pendingEntries.entries()) {
    if (pending.expiresAt > now) {
      continue;
    }
    pendingEntries.delete(mint);
  }
}, 1000);

if (env.ONYX_MODE === "paper") {
  setInterval(() => {
    for (const mint of positionManager.getOpenMints()) {
      const position = positionManager.getOpenPosition(mint);
      if (!position) {
        continue;
      }
      const drift = env.ONYX_PAPER_PRICE_DRIFT_BPS / 10_000;
      const randComponent = ((Math.random() * 2 - 1) * env.ONYX_PAPER_PRICE_VOL_BPS) / 10_000;
      const nextPrice = Math.max(0.00000001, position.lastPrice * (1 + drift + randComponent));
      const tick: PriceTick = {
        tokenMint: mint,
        priceSol: Number(nextPrice.toFixed(10)),
        receivedAt: Date.now(),
        source: "drpc-primary"
      };
      void processPriceTick(tick);
    }
  }, env.ONYX_PAPER_PRICE_TICK_MS);
}

setInterval(() => {
  if (riskController.shouldBlockEntries()) {
    const closed = positionManager.forceCloseAll();
    for (const position of closed) {
      metrics.recordClosedTrade(position.pnlBps);
      metrics.recordExitReason(position.reason);
      riskController.applyTradeOutcome({ type: "loss", pnlBps: position.pnlBps });
      alerts.emit("warn", "Force-closed position due to kill switch.", {
        tokenMint: position.tokenMint,
        reason: position.reason
      });
    }
  }

  logger.info(
    {
      metrics: metrics.snapshot(),
      sectionMode,
      sweepProfile: sectionMode === "sweep" ? sweepProfile : undefined,
      mode: getActiveModeProfile().mode,
      drawdownBps: riskController.getDrawdownBps(),
      drawdownLimitBps: env.ONYX_DAILY_MAX_DRAWDOWN_BPS,
      realizedEdgeWindowTrades: env.ONYX_REALIZED_EDGE_WINDOW_TRADES,
      realizedEdgeMinClosedTrades: env.ONYX_REALIZED_EDGE_MIN_CLOSED_TRADES,
      recentMedianRealizedPnlBps: metrics.recentMedianPnlBps(env.ONYX_REALIZED_EDGE_WINDOW_TRADES),
      realizedEdgeMinMedianBps: env.ONYX_REALIZED_EDGE_MIN_MEDIAN_BPS,
      walletBalanceUsd: riskController.getWalletBalanceUsd(),
      failureRateBps: riskController.getFailureRateBps(),
      failureRateLimitBps: env.ONYX_MAX_FAILURE_RATE_BPS,
      sourceHealth: sourceHealth.snapshot(),
      priceStreamHealth: priceMux.healthSnapshot(),
      blocked: riskController.shouldBlockEntries(),
      fastStopoutCircuitBreakerActive: fastStopoutCircuitActive
    },
    "Onyx heartbeat"
  );
  void syncWalletBalance("heartbeat");
}, 30_000);

if (env.ONYX_MODE === "paper") {
  setInterval(() => {
    logger.info(
      {
        summary: metrics.paperSummary(),
        walletBalanceUsd: riskController.getWalletBalanceUsd(),
        drawdownBps: riskController.getDrawdownBps()
      },
      "Onyx paper session summary"
    );
  }, env.ONYX_PAPER_SUMMARY_INTERVAL_MS);
}

const logFinalSessionSummaryAndExit = async (signal: "SIGINT" | "SIGTERM") => {
  try {
    await launchStreamServer?.stop();
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error stopping public launch stream during shutdown.");
  }
  await syncWalletBalance(`final-${signal}`);
  process.stdout.write("\n\n");
  logger.info(
    {
      signal,
      summary: metrics.paperSummary(),
      walletBalanceUsd: riskController.getWalletBalanceUsd(),
      drawdownBps: riskController.getDrawdownBps(),
      failureRateBps: riskController.getFailureRateBps()
    },
    "Onyx final session summary"
  );
  process.exit(0);
};

process.on("SIGINT", () => {
  void logFinalSessionSummaryAndExit("SIGINT");
});

process.on("SIGTERM", () => {
  void logFinalSessionSummaryAndExit("SIGTERM");
});
