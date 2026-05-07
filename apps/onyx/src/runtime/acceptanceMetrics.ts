export type AcceptanceThresholds = {
  simulation: {
    maxDrawdownBps: number;
    minWinRateBps: number;
    maxMedianExecutionLatencyMs: number;
  };
  paper: {
    maxFailureRateBps: number;
    maxMissedSignalRateBps: number;
  };
  microLive: {
    maxDailyLossBps: number;
    maxConsecutiveLosses: number;
    maxExecutionFailureRateBps: number;
    maxSkippedMinNotionalBps: number;
  };
};

export const acceptanceThresholds: AcceptanceThresholds = {
  simulation: {
    maxDrawdownBps: 700,
    minWinRateBps: 4500,
    maxMedianExecutionLatencyMs: 900
  },
  paper: {
    maxFailureRateBps: 2500,
    maxMissedSignalRateBps: 2000
  },
  microLive: {
    maxDailyLossBps: 500,
    maxConsecutiveLosses: 4,
    maxExecutionFailureRateBps: 3000,
    maxSkippedMinNotionalBps: 3500
  }
};
