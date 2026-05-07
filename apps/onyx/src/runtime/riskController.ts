type RiskControllerInput = {
  startingWalletSol: number;
  minTradeNotionalUsd: number;
  estimatedSolUsd: number;
  minNetEdgeBps: number;
  maxRiskPerTradeBps: number;
  dailyMaxDrawdownBps: number;
  drawdownMinClosedTrades: number;
  maxConsecutiveLosses: number;
  maxFailureRateBps: number;
  minAttemptsBeforeFailureRateKillSwitch: number;
  killSwitchCooldownMs: number;
  autoUnblockDrawdownBufferBps: number;
  autoUnblockFailureBufferBps: number;
  streakRiskReductionBps: number;
  streakRiskFloorBps: number;
  executionFailureDegradeBps: number;
  adaptiveEdgeReliefMaxBps: number;
  adaptiveEdgeReliefFloorBps: number;
};

export type ViabilityCheckResult = {
  viable: boolean;
  reason: "ok" | "below-min-notional" | "cost-too-high";
  decisionClass: "hard-block" | "soft-block" | "promotable" | "pass";
  positionUsd: number;
  minTradeNotionalUsd: number;
  expectedSlippageBps: number;
  estimatedCostsBps: number;
  costComponentsBps: {
    expectedSlippageBps: number;
    feeBps: number;
    impactBps: number;
    fixedFrictionBps: number;
  };
  minNetEdgeBps: number;
  adaptiveMinNetEdgeBps: number;
  edgeNetBps: number;
};

type TradeOutcome =
  | { type: "win"; pnlBps: number }
  | { type: "loss"; pnlBps: number }
  | { type: "neutral"; pnlBps: number }
  | { type: "execution-failed" };

export class RiskController {
  private readonly startingWalletSol: number;
  private walletBalanceSol: number;
  private minTradeNotionalUsd: number;
  private estimatedSolUsd: number;
  private minNetEdgeBps: number;
  private maxRiskPerTradeBps: number;
  private dailyMaxDrawdownBps: number;
  private drawdownMinClosedTrades: number;
  private maxConsecutiveLosses: number;
  private maxFailureRateBps: number;
  private minAttemptsBeforeFailureRateKillSwitch: number;
  private killSwitchCooldownMs: number;
  private autoUnblockDrawdownBufferBps: number;
  private autoUnblockFailureBufferBps: number;
  private streakRiskReductionBps: number;
  private streakRiskFloorBps: number;
  private executionFailureDegradeBps: number;
  private adaptiveEdgeReliefMaxBps: number;
  private adaptiveEdgeReliefFloorBps: number;
  private consecutiveLosses = 0;
  private totalAttempts = 0;
  private totalFailures = 0;
  private closedTradeCount = 0;
  private realizedDrawdownBps = 0;
  private equityHwmSol: number;
  private blocked = false;
  private blockedAtMs?: number;

  public constructor(input: RiskControllerInput) {
    this.startingWalletSol = input.startingWalletSol;
    this.walletBalanceSol = input.startingWalletSol;
    this.minTradeNotionalUsd = input.minTradeNotionalUsd;
    this.estimatedSolUsd = input.estimatedSolUsd;
    this.minNetEdgeBps = input.minNetEdgeBps;
    this.maxRiskPerTradeBps = input.maxRiskPerTradeBps;
    this.dailyMaxDrawdownBps = input.dailyMaxDrawdownBps;
    this.drawdownMinClosedTrades = input.drawdownMinClosedTrades;
    this.maxConsecutiveLosses = input.maxConsecutiveLosses;
    this.maxFailureRateBps = input.maxFailureRateBps;
    this.minAttemptsBeforeFailureRateKillSwitch = input.minAttemptsBeforeFailureRateKillSwitch;
    this.killSwitchCooldownMs = input.killSwitchCooldownMs;
    this.autoUnblockDrawdownBufferBps = input.autoUnblockDrawdownBufferBps;
    this.autoUnblockFailureBufferBps = input.autoUnblockFailureBufferBps;
    this.streakRiskReductionBps = input.streakRiskReductionBps;
    this.streakRiskFloorBps = input.streakRiskFloorBps;
    this.executionFailureDegradeBps = input.executionFailureDegradeBps;
    this.adaptiveEdgeReliefMaxBps = input.adaptiveEdgeReliefMaxBps;
    this.adaptiveEdgeReliefFloorBps = input.adaptiveEdgeReliefFloorBps;
    this.equityHwmSol = input.startingWalletSol;
  }

  public getPositionSizeSol() {
    const reducedRiskBps = this.maxRiskPerTradeBps - this.consecutiveLosses * this.streakRiskReductionBps;
    const minRiskForNotionalBps =
      this.walletBalanceSol > 0
        ? Math.ceil(((this.minTradeNotionalUsd / this.estimatedSolUsd) / this.walletBalanceSol) * 10_000)
        : this.streakRiskFloorBps;
    const dynamicRiskFloorBps = Math.max(this.streakRiskFloorBps, minRiskForNotionalBps);
    const effectiveRiskBps = Math.min(this.maxRiskPerTradeBps, Math.max(dynamicRiskFloorBps, reducedRiskBps));
    return Number(((this.walletBalanceSol * effectiveRiskBps) / 10_000).toFixed(6));
  }

  public getWalletBalanceSol() {
    return this.walletBalanceSol;
  }

  public getWalletBalanceUsd() {
    return Number((this.walletBalanceSol * this.estimatedSolUsd).toFixed(2));
  }

  public isTradeEconomicallyViable(
    positionSizeSol: number,
    expectedSlippageBps: number,
    expectedAlphaBps: number,
    feeBps: number,
    impactBps: number
  ): ViabilityCheckResult {
    const positionUsd = positionSizeSol * this.estimatedSolUsd;
    const fixedFrictionBps = this.computeFixedFrictionBps(positionUsd);
    const estimatedCostsBps =
      Math.max(0, expectedSlippageBps) + Math.max(0, feeBps) + Math.max(0, impactBps) + fixedFrictionBps;
    const edgeNetBps = expectedAlphaBps - estimatedCostsBps;
    const adaptiveMinNetEdgeBps = this.computeAdaptiveMinNetEdgeBps(positionUsd);
    const viabilityGapBps = adaptiveMinNetEdgeBps - edgeNetBps;
    const decisionClass =
      edgeNetBps >= adaptiveMinNetEdgeBps
        ? "pass"
        : viabilityGapBps <= 75 && positionUsd >= this.minTradeNotionalUsd * 1.15
          ? "promotable"
          : viabilityGapBps <= 180
            ? "soft-block"
            : "hard-block";
    if (positionUsd < this.minTradeNotionalUsd) {
      return {
        viable: false,
        reason: "below-min-notional",
        decisionClass: "hard-block",
        positionUsd: Number(positionUsd.toFixed(2)),
        minTradeNotionalUsd: this.minTradeNotionalUsd,
        expectedSlippageBps,
        estimatedCostsBps,
        costComponentsBps: {
          expectedSlippageBps: Math.max(0, expectedSlippageBps),
          feeBps: Math.max(0, feeBps),
          impactBps: Math.max(0, impactBps),
          fixedFrictionBps
        },
        minNetEdgeBps: this.minNetEdgeBps,
        adaptiveMinNetEdgeBps,
        edgeNetBps
      };
    }

    if (edgeNetBps < adaptiveMinNetEdgeBps) {
      return {
        viable: false,
        reason: "cost-too-high",
        decisionClass,
        positionUsd: Number(positionUsd.toFixed(2)),
        minTradeNotionalUsd: this.minTradeNotionalUsd,
        expectedSlippageBps,
        estimatedCostsBps,
        costComponentsBps: {
          expectedSlippageBps: Math.max(0, expectedSlippageBps),
          feeBps: Math.max(0, feeBps),
          impactBps: Math.max(0, impactBps),
          fixedFrictionBps
        },
        minNetEdgeBps: this.minNetEdgeBps,
        adaptiveMinNetEdgeBps,
        edgeNetBps
      };
    }
    return {
      viable: true,
      reason: "ok",
      decisionClass,
      positionUsd: Number(positionUsd.toFixed(2)),
      minTradeNotionalUsd: this.minTradeNotionalUsd,
      expectedSlippageBps,
      estimatedCostsBps,
      costComponentsBps: {
        expectedSlippageBps: Math.max(0, expectedSlippageBps),
        feeBps: Math.max(0, feeBps),
        impactBps: Math.max(0, impactBps),
        fixedFrictionBps
      },
      minNetEdgeBps: this.minNetEdgeBps,
      adaptiveMinNetEdgeBps,
      edgeNetBps
    };
  }

  private computeFixedFrictionBps(positionUsd: number) {
    if (positionUsd <= 0) {
      return 0;
    }
    if (positionUsd < 3) {
      return 65;
    }
    if (positionUsd < 6) {
      return 35;
    }
    if (positionUsd < 12) {
      return 20;
    }
    return 8;
  }

  private computeAdaptiveMinNetEdgeBps(positionUsd: number) {
    if (this.minTradeNotionalUsd <= 0) {
      return this.minNetEdgeBps;
    }
    const notionalRatio = positionUsd / this.minTradeNotionalUsd;
    if (notionalRatio >= 2) {
      return this.minNetEdgeBps;
    }
    // Keep a strict edge floor at larger notionals, but relax slightly near micro floor.
    const reliefRatio = Math.max(0, Math.min(1, (2 - notionalRatio) / 1.2));
    const reliefBps = Math.floor(reliefRatio * this.adaptiveEdgeReliefMaxBps);
    return Math.max(this.adaptiveEdgeReliefFloorBps, this.minNetEdgeBps - reliefBps);
  }

  public shouldBlockEntries() {
    this.tryAutoUnblock();
    return this.blocked;
  }

  public updateRuntimeConfig(input: Partial<Omit<RiskControllerInput, "startingWalletSol">>) {
    if (input.minTradeNotionalUsd !== undefined) {
      this.minTradeNotionalUsd = input.minTradeNotionalUsd;
    }
    if (input.estimatedSolUsd !== undefined) {
      this.estimatedSolUsd = input.estimatedSolUsd;
    }
    if (input.minNetEdgeBps !== undefined) {
      this.minNetEdgeBps = input.minNetEdgeBps;
    }
    if (input.maxRiskPerTradeBps !== undefined) {
      this.maxRiskPerTradeBps = input.maxRiskPerTradeBps;
    }
    if (input.dailyMaxDrawdownBps !== undefined) {
      this.dailyMaxDrawdownBps = input.dailyMaxDrawdownBps;
    }
    if (input.drawdownMinClosedTrades !== undefined) {
      this.drawdownMinClosedTrades = input.drawdownMinClosedTrades;
    }
    if (input.maxConsecutiveLosses !== undefined) {
      this.maxConsecutiveLosses = input.maxConsecutiveLosses;
    }
    if (input.maxFailureRateBps !== undefined) {
      this.maxFailureRateBps = input.maxFailureRateBps;
    }
    if (input.minAttemptsBeforeFailureRateKillSwitch !== undefined) {
      this.minAttemptsBeforeFailureRateKillSwitch = input.minAttemptsBeforeFailureRateKillSwitch;
    }
    if (input.killSwitchCooldownMs !== undefined) {
      this.killSwitchCooldownMs = input.killSwitchCooldownMs;
    }
    if (input.autoUnblockDrawdownBufferBps !== undefined) {
      this.autoUnblockDrawdownBufferBps = input.autoUnblockDrawdownBufferBps;
    }
    if (input.autoUnblockFailureBufferBps !== undefined) {
      this.autoUnblockFailureBufferBps = input.autoUnblockFailureBufferBps;
    }
    if (input.streakRiskReductionBps !== undefined) {
      this.streakRiskReductionBps = input.streakRiskReductionBps;
    }
    if (input.streakRiskFloorBps !== undefined) {
      this.streakRiskFloorBps = input.streakRiskFloorBps;
    }
    if (input.executionFailureDegradeBps !== undefined) {
      this.executionFailureDegradeBps = input.executionFailureDegradeBps;
    }
    if (input.adaptiveEdgeReliefMaxBps !== undefined) {
      this.adaptiveEdgeReliefMaxBps = input.adaptiveEdgeReliefMaxBps;
    }
    if (input.adaptiveEdgeReliefFloorBps !== undefined) {
      this.adaptiveEdgeReliefFloorBps = input.adaptiveEdgeReliefFloorBps;
    }
    this.evaluateKillSwitches();
  }

  public getFailureRateBps() {
    if (this.totalAttempts === 0) {
      return 0;
    }
    return Math.floor((this.totalFailures * 10_000) / this.totalAttempts);
  }

  public getDrawdownBps() {
    return this.realizedDrawdownBps;
  }

  public getConsecutiveLosses() {
    return this.consecutiveLosses;
  }

  public syncWalletBalanceSol(walletBalanceSol: number, options?: { updateDrawdown?: boolean }) {
    const shouldUpdateDrawdown = options?.updateDrawdown ?? false;
    this.walletBalanceSol = Number(Math.max(0, walletBalanceSol).toFixed(8));
    if (!shouldUpdateDrawdown) {
      return;
    }
    if (this.startingWalletSol <= 0) {
      this.realizedDrawdownBps = 0;
      this.evaluateKillSwitches();
      return;
    }
    if (this.walletBalanceSol > this.equityHwmSol) {
      this.equityHwmSol = this.walletBalanceSol;
    }
    const hwm = Math.max(this.equityHwmSol, 0.00000001);
    const currentDrawdownBps = Math.max(0, Math.floor(((hwm - this.walletBalanceSol) / hwm) * 10_000));
    this.realizedDrawdownBps = currentDrawdownBps;
    this.evaluateKillSwitches();
  }

  public applyTradeOutcome(outcome: TradeOutcome) {
    this.totalAttempts += 1;

    if (outcome.type === "execution-failed") {
      this.totalFailures += 1;
      this.evaluateKillSwitches();
      return;
    }

    if (outcome.type === "loss") {
      this.consecutiveLosses += 1;
    } else if (outcome.type === "neutral") {
      // Neutral outcomes should not contribute to streak pressure.
      this.consecutiveLosses = 0;
    } else {
      this.consecutiveLosses = 0;
    }
    this.closedTradeCount += 1;

    this.evaluateKillSwitches();
  }

  private evaluateKillSwitches() {
    if (
      this.closedTradeCount >= this.drawdownMinClosedTrades &&
      this.realizedDrawdownBps >= this.dailyMaxDrawdownBps
    ) {
      this.setBlocked();
      return;
    }

    if (this.consecutiveLosses >= this.maxConsecutiveLosses) {
      this.setBlocked();
      return;
    }

    if (this.totalAttempts < this.minAttemptsBeforeFailureRateKillSwitch) {
      return;
    }

    if (this.getFailureRateBps() >= this.maxFailureRateBps) {
      this.setBlocked();
      return;
    }

    if (this.getFailureRateBps() >= this.executionFailureDegradeBps) {
      this.consecutiveLosses = Math.max(this.consecutiveLosses, 1);
    }
  }

  private setBlocked() {
    if (this.blocked) {
      return;
    }
    this.blocked = true;
    this.blockedAtMs = Date.now();
  }

  private tryAutoUnblock() {
    if (!this.blocked || this.blockedAtMs === undefined) {
      return;
    }
    if (Date.now() - this.blockedAtMs < this.killSwitchCooldownMs) {
      return;
    }
    const drawdownRecoveryFloor = Math.max(0, this.dailyMaxDrawdownBps - this.autoUnblockDrawdownBufferBps);
    const failureRecoveryFloor = Math.max(0, this.maxFailureRateBps - this.autoUnblockFailureBufferBps);
    if (this.realizedDrawdownBps > drawdownRecoveryFloor) {
      return;
    }
    if (this.getFailureRateBps() > failureRecoveryFloor) {
      return;
    }
    this.blocked = false;
    this.blockedAtMs = undefined;
    this.consecutiveLosses = Math.min(this.consecutiveLosses, Math.max(0, this.maxConsecutiveLosses - 1));
  }
}
