export type BasisPoints = number;

export type LaunchSignal = {
  signature: string;
  tokenMint: string;
  creator: string;
  receivedAt: number;
  slot: number;
  source: "drpc-logs" | "grpc" | "high-volume-lane" | "sweep-detector";
  name?: string;
  symbol?: string;
  uri?: string;
  bondingCurve?: string;
  user?: string;
};

export type TradeIntent = {
  tokenMint: string;
  side: "buy" | "sell";
  amountSol: number;
  maxSlippageBps: BasisPoints;
  tipLamports: number;
  amountOverride?: number | string;
  bondingCurveHint?: string;
  denominatedInQuote?: boolean;
  launchSignal?: LaunchSignal;
};

export type ExecutionResult = {
  ok: boolean;
  signature?: string;
  error?: string;
  latencyMs: number;
};

export type Position = {
  tokenMint: string;
  entrySignature: string;
  entryTime: number;
  entrySol: number;
  quantity: number;
  entryPriceSol: number;
  highestObservedPrice: number;
  lastPrice: number;
  openedAt: number;
  lastUpdateAt: number;
  walletBalanceSolAtEntry: number;
  partialTakeProfitCount: number;
  expectedEntrySlippageBps: number;
  creator?: string;
  bondingCurve?: string;
};
