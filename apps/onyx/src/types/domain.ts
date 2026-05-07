import type { BasisPoints, Position } from "@darkflow/engine/core";

export type { BasisPoints, LaunchSignal, TradeIntent, ExecutionResult, Position } from "@darkflow/engine/core";

export type RugChecks = {
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  topHoldersConcentrationBps: BasisPoints;
  creatorSupplyShareBps: BasisPoints;
  creatorRiskScore: number;
  creatorRiskUnknown: boolean;
  creatorHistorySignals: number;
  migrationState: "bonding" | "migrating" | "migrated";
};

export type RiskDecision = {
  passed: boolean;
  score: number;
  reasons: string[];
  staleSignalMs: number;
  expectedSlippageBps: BasisPoints;
  creatorRiskScore: number;
  creatorRiskUnknown: boolean;
  scoreBreakdown: {
    stale: number;
    concentration: number;
    creatorSupply: number;
    creatorRisk: number;
    authority: number;
    migration: number;
  };
};

export type ClosedPosition = Position & {
  exitTime: number;
  pnlBps: BasisPoints;
  reason: "stop-loss" | "trailing-stop" | "take-profit" | "max-hold" | "stale-tick" | "kill-switch";
};

export type ReplayEvent = {
  type: "launch" | "price";
  timestamp: number;
  tokenMint: string;
  creator?: string;
  signature?: string;
  slot?: number;
  priceSol?: number;
  source?: "drpc-primary" | "external-confirmation";
};

export type Metrics = {
  totalSignals: number;
  riskRejected: number;
  executed: number;
  executionFailed: number;
  wins: number;
  losses: number;
  neutralOutcomes: number;
  maxDrawdownBps: number;
  medianExecutionLatencyMs: number;
  stopLossExits: number;
  trailingStopExits: number;
  takeProfitExits: number;
  maxHoldExits: number;
  staleTickExits: number;
  killSwitchExits: number;
  skippedMinNotional: number;
  gainBandHits: number;
  gainBandAbove: number;
  creatorRiskUnknownCount: number;
  costTooHighCount: number;
  volumeGateBlockedCount: number;
  qualityGateBlockedCount: number;
  staleQueueSkipCount: number;
  staleHardCapSkipCount: number;
  fastStopoutCount: number;
  queueDecisionLatenciesMs: {
    riskEvalP50Ms: number;
    riskEvalP95Ms: number;
    queueToDecisionP95Ms: number;
    decisionToSubmitP95Ms: number;
  };
  creatorRiskScoreBuckets: {
    lt40: number;
    gte40lt60: number;
    gte60lt80: number;
    gte80: number;
  };
};
