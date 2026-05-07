export type TradingMode = "aggressiveSpray" | "balanced";

export type TradingModePreference = TradingMode | "auto";

export type ModeTransitionInput = {
  preference: TradingModePreference;
  closedTrades: number;
  recentMedianRealizedPnlBps?: number;
  minTradesBeforeBalance: number;
  minMedianRealizedPnlBps: number;
};

export type TradingModeProfile = {
  mode: TradingMode;
  qualityScoreMin: number;
  sizingMultiplierBps: number;
  maxConcurrentPositions: number;
  takeProfitPartialBps?: number;
  takeProfitPartialPctBps?: number;
};

export const resolveTradingMode = ({
  preference,
  closedTrades,
  recentMedianRealizedPnlBps,
  minTradesBeforeBalance,
  minMedianRealizedPnlBps
}: ModeTransitionInput): TradingMode => {
  if (preference !== "auto") {
    return preference;
  }
  if (closedTrades < minTradesBeforeBalance) {
    return "aggressiveSpray";
  }
  if ((recentMedianRealizedPnlBps ?? -10_000) < minMedianRealizedPnlBps) {
    return "aggressiveSpray";
  }
  return "balanced";
};

export const modeProfileFor = (
  mode: TradingMode,
  baseQualityScoreMin: number,
  baseMaxConcurrentPositions: number
): TradingModeProfile => {
  if (mode === "aggressiveSpray") {
    return {
      mode,
      qualityScoreMin: Math.max(0, baseQualityScoreMin - 8),
      sizingMultiplierBps: 7500,
      maxConcurrentPositions: Math.max(baseMaxConcurrentPositions, 2),
      takeProfitPartialBps: 1600,
      takeProfitPartialPctBps: 5000
    };
  }

  return {
    mode,
    qualityScoreMin: baseQualityScoreMin,
    sizingMultiplierBps: 10000,
    maxConcurrentPositions: baseMaxConcurrentPositions
  };
};
