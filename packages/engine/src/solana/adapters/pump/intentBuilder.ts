import type { LaunchSignal, TradeIntent } from "../../../core/types/domain.js";

type BuildIntentInput = {
  launch: LaunchSignal;
  buySol: number;
  expectedSlippageBps: number;
  maxSlippageBps: number;
  baseTipLamports: number;
  maxTipLamports: number;
  minTipLamports: number;
  dynamicTipEnabled: boolean;
  edgeNetBps: number;
  expectedAlphaBps: number;
  dynamicTipEdgeFactorBps: number;
  dynamicTipLatencyFactorBps: number;
  executionLatencyDegradeMs: number;
  observedMedianLatencyMs: number;
};

export const buildBuyIntent = ({
  launch,
  buySol,
  expectedSlippageBps,
  maxSlippageBps,
  baseTipLamports,
  maxTipLamports,
  minTipLamports,
  dynamicTipEnabled,
  edgeNetBps,
  expectedAlphaBps,
  dynamicTipEdgeFactorBps,
  dynamicTipLatencyFactorBps,
  executionLatencyDegradeMs,
  observedMedianLatencyMs
}: BuildIntentInput): TradeIntent => {
  const cappedSlippage = Math.min(maxSlippageBps, expectedSlippageBps);
  const scaledTip = baseTipLamports + Math.floor((cappedSlippage / Math.max(maxSlippageBps, 1)) * baseTipLamports);
  const edgePressureRatio = Math.max(0, Math.min(1, edgeNetBps / Math.max(expectedAlphaBps, 1)));
  const latencyPressureRatio = Math.max(0, Math.min(1, observedMedianLatencyMs / Math.max(executionLatencyDegradeMs, 1)));
  const dynamicEdgeTip = Math.floor(baseTipLamports * edgePressureRatio * (dynamicTipEdgeFactorBps / 10_000));
  const dynamicLatencyTip = Math.floor(baseTipLamports * latencyPressureRatio * (dynamicTipLatencyFactorBps / 10_000));
  const tipLamports = dynamicTipEnabled
    ? Math.min(maxTipLamports, Math.max(minTipLamports, scaledTip + dynamicEdgeTip + dynamicLatencyTip))
    : Math.min(maxTipLamports, Math.max(minTipLamports, scaledTip));

  return {
    tokenMint: launch.tokenMint,
    side: "buy",
    amountSol: buySol,
    maxSlippageBps: cappedSlippage,
    tipLamports,
    denominatedInQuote: true,
    launchSignal: launch
  };
};
