import type { Metrics } from "../types/domain.js";

const defaultMetrics = (): Metrics => ({
  totalSignals: 0,
  riskRejected: 0,
  executed: 0,
  executionFailed: 0,
  wins: 0,
  losses: 0,
  neutralOutcomes: 0,
  maxDrawdownBps: 0,
  medianExecutionLatencyMs: 0,
  stopLossExits: 0,
  trailingStopExits: 0,
  takeProfitExits: 0,
  maxHoldExits: 0,
  staleTickExits: 0,
  killSwitchExits: 0,
  skippedMinNotional: 0,
  gainBandHits: 0,
  gainBandAbove: 0,
  creatorRiskUnknownCount: 0,
  costTooHighCount: 0,
  volumeGateBlockedCount: 0,
  qualityGateBlockedCount: 0,
  staleQueueSkipCount: 0,
  staleHardCapSkipCount: 0,
  fastStopoutCount: 0,
  queueDecisionLatenciesMs: {
    riskEvalP50Ms: 0,
    riskEvalP95Ms: 0,
    queueToDecisionP95Ms: 0,
    decisionToSubmitP95Ms: 0
  },
  creatorRiskScoreBuckets: {
    lt40: 0,
    gte40lt60: 0,
    gte60lt80: 0,
    gte80: 0
  }
});

export class MetricsRegistry {
  private readonly metrics = defaultMetrics();
  private readonly executionLatencies: number[] = [];
  private readonly closedTradePnls: number[] = [];
  private readonly riskEvalLatenciesMs: number[] = [];
  private readonly queueToDecisionLatenciesMs: number[] = [];
  private readonly decisionToSubmitLatenciesMs: number[] = [];
  private readonly entryToExitDurationsSec: number[] = [];
  private runningPnlSumBps = 0;
  private runningWinPnlSumBps = 0;
  private runningLossPnlSumBps = 0;
  private static readonly neutralOutcomeThresholdBps = 50;

  public recordSignal() {
    this.metrics.totalSignals += 1;
  }

  public recordRiskReject() {
    this.metrics.riskRejected += 1;
  }

  public recordCreatorRisk(score: number, isUnknown: boolean) {
    if (isUnknown) {
      this.metrics.creatorRiskUnknownCount += 1;
    }
    if (score < 40) {
      this.metrics.creatorRiskScoreBuckets.lt40 += 1;
      return;
    }
    if (score < 60) {
      this.metrics.creatorRiskScoreBuckets.gte40lt60 += 1;
      return;
    }
    if (score < 80) {
      this.metrics.creatorRiskScoreBuckets.gte60lt80 += 1;
      return;
    }
    this.metrics.creatorRiskScoreBuckets.gte80 += 1;
  }

  public recordExecution(latencyMs: number) {
    this.metrics.executed += 1;
    this.executionLatencies.push(latencyMs);
    this.executionLatencies.sort((a, b) => a - b);

    const midpoint = Math.floor(this.executionLatencies.length / 2);
    if (this.executionLatencies.length % 2 === 0) {
      const left = this.executionLatencies[midpoint - 1] ?? 0;
      const right = this.executionLatencies[midpoint] ?? 0;
      this.metrics.medianExecutionLatencyMs = Math.round((left + right) / 2);
      return;
    }
    this.metrics.medianExecutionLatencyMs = this.executionLatencies[midpoint] ?? 0;
  }

  public recordExecutionFailure() {
    this.metrics.executionFailed += 1;
  }

  public recordCostTooHighSkip() {
    this.metrics.costTooHighCount += 1;
  }

  public recordVolumeGateBlocked() {
    this.metrics.volumeGateBlockedCount += 1;
  }

  public recordQualityGateBlocked() {
    this.metrics.qualityGateBlockedCount += 1;
  }

  public recordStaleQueueSkip() {
    this.metrics.staleQueueSkipCount += 1;
  }

  public recordStaleHardCapSkip() {
    this.metrics.staleHardCapSkipCount += 1;
  }

  public recordFastStopout() {
    this.metrics.fastStopoutCount += 1;
  }

  public recordRiskEvalLatency(latencyMs: number) {
    this.riskEvalLatenciesMs.push(Math.max(0, Math.floor(latencyMs)));
    this.metrics.queueDecisionLatenciesMs.riskEvalP50Ms = this.percentile(this.riskEvalLatenciesMs, 50);
    this.metrics.queueDecisionLatenciesMs.riskEvalP95Ms = this.percentile(this.riskEvalLatenciesMs, 95);
  }

  public recordQueueToDecisionLatency(latencyMs: number) {
    this.queueToDecisionLatenciesMs.push(Math.max(0, Math.floor(latencyMs)));
    this.metrics.queueDecisionLatenciesMs.queueToDecisionP95Ms = this.percentile(this.queueToDecisionLatenciesMs, 95);
  }

  public recordDecisionToSubmitLatency(latencyMs: number) {
    this.decisionToSubmitLatenciesMs.push(Math.max(0, Math.floor(latencyMs)));
    this.metrics.queueDecisionLatenciesMs.decisionToSubmitP95Ms = this.percentile(this.decisionToSubmitLatenciesMs, 95);
  }

  public recordEntryToExitDuration(seconds: number) {
    this.entryToExitDurationsSec.push(Math.max(0, Number(seconds.toFixed(2))));
  }

  public recordClosedTrade(pnlBps: number) {
    this.closedTradePnls.push(pnlBps);
    this.runningPnlSumBps += pnlBps;

    if (Math.abs(pnlBps) < MetricsRegistry.neutralOutcomeThresholdBps) {
      this.metrics.neutralOutcomes += 1;
      return;
    }

    if (pnlBps >= 0) {
      this.metrics.wins += 1;
      this.runningWinPnlSumBps += pnlBps;
      return;
    }

    this.metrics.losses += 1;
    this.runningLossPnlSumBps += pnlBps;
  }

  public recordExitReason(
    reason: "stop-loss" | "trailing-stop" | "take-profit" | "max-hold" | "stale-tick" | "kill-switch"
  ) {
    if (reason === "stop-loss") {
      this.metrics.stopLossExits += 1;
      return;
    }
    if (reason === "trailing-stop") {
      this.metrics.trailingStopExits += 1;
      return;
    }
    if (reason === "take-profit") {
      this.metrics.takeProfitExits += 1;
      return;
    }
    if (reason === "max-hold") {
      this.metrics.maxHoldExits += 1;
      return;
    }
    if (reason === "stale-tick") {
      this.metrics.staleTickExits += 1;
      return;
    }
    this.metrics.killSwitchExits += 1;
  }

  public recordSkippedMinNotional() {
    this.metrics.skippedMinNotional += 1;
  }

  public recordGainBand(pnlBps: number, minBps: number, maxBps: number) {
    if (pnlBps >= minBps && pnlBps <= maxBps) {
      this.metrics.gainBandHits += 1;
      return;
    }
    if (pnlBps > maxBps) {
      this.metrics.gainBandAbove += 1;
    }
  }

  public recordDrawdown(drawdownBps: number) {
    this.metrics.maxDrawdownBps = Math.max(this.metrics.maxDrawdownBps, drawdownBps);
  }

  public snapshot(): Metrics {
    return { ...this.metrics };
  }

  public closedTradeCount() {
    return this.closedTradePnls.length;
  }

  public recentMedianPnlBps(windowSize: number) {
    if (windowSize <= 0 || this.closedTradePnls.length === 0) {
      return undefined;
    }
    const slice = this.closedTradePnls.slice(-windowSize).sort((a, b) => a - b);
    const midpoint = Math.floor(slice.length / 2);
    if (slice.length % 2 === 0) {
      const left = slice[midpoint - 1] ?? 0;
      const right = slice[midpoint] ?? 0;
      return Math.round((left + right) / 2);
    }
    return slice[midpoint] ?? 0;
  }

  public paperSummary() {
    const trades = this.closedTradePnls.length;
    const wins = this.metrics.wins;
    const losses = this.metrics.losses;
    const neutralOutcomes = this.metrics.neutralOutcomes;
    const decisiveTrades = wins + losses;
    const winRateBps = decisiveTrades === 0 ? 0 : Math.floor((wins * 10_000) / decisiveTrades);
    const avgPnlBps = trades === 0 ? 0 : Number((this.runningPnlSumBps / trades).toFixed(2));
    const avgWinBps = wins === 0 ? 0 : Number((this.runningWinPnlSumBps / wins).toFixed(2));
    const avgLossBps = losses === 0 ? 0 : Number((this.runningLossPnlSumBps / losses).toFixed(2));
    const expectancyBps = Number(
      ((winRateBps / 10_000) * avgWinBps + ((10_000 - winRateBps) / 10_000) * avgLossBps).toFixed(2)
    );

    return {
      trades,
      wins,
      losses,
      neutralOutcomes,
      winRateBps,
      avgPnlBps,
      avgWinBps,
      avgLossBps,
      expectancyBps,
      gainBandHits: this.metrics.gainBandHits,
      gainBandAbove: this.metrics.gainBandAbove,
      skippedMinNotional: this.metrics.skippedMinNotional,
      costTooHighCount: this.metrics.costTooHighCount,
      fastStopoutCount: this.metrics.fastStopoutCount
    };
  }

  private percentile(values: number[], percentile: number) {
    if (values.length === 0) {
      return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((percentile / 100) * sorted.length) - 1));
    return sorted[idx] ?? 0;
  }
}
