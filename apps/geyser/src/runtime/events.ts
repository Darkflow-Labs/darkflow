import type { LaunchSignal } from "@darkflow/engine/core";
import type { PriceTick } from "@darkflow/engine/solana/ingest";

export type GeyserLaunchEvent = {
  v: 1;
  type: "launch";
  signature: string;
  tokenMint: string;
  creator: string;
  slot: number;
  source: string;
  receivedAt: number;
  name?: string;
  symbol?: string;
  uri?: string;
  bondingCurve?: string;
};

export type GeyserTickEvent = {
  v: 1;
  type: "tick";
  tokenMint: string;
  priceSol: number;
  receivedAt: number;
  source: string;
  eventType?: string;
};

export const toLaunchEvent = (signal: LaunchSignal): GeyserLaunchEvent => ({
  v: 1,
  type: "launch",
  signature: signal.signature,
  tokenMint: signal.tokenMint,
  creator: signal.creator,
  slot: signal.slot,
  source: signal.source,
  receivedAt: signal.receivedAt,
  ...(signal.name ? { name: signal.name } : {}),
  ...(signal.symbol ? { symbol: signal.symbol } : {}),
  ...(signal.uri ? { uri: signal.uri } : {}),
  ...(signal.bondingCurve ? { bondingCurve: signal.bondingCurve } : {})
});

export const toTickEvent = (tick: PriceTick): GeyserTickEvent => ({
  v: 1,
  type: "tick",
  tokenMint: tick.tokenMint,
  priceSol: tick.priceSol,
  receivedAt: tick.receivedAt,
  source: tick.source,
  ...(tick.eventType ? { eventType: tick.eventType } : {})
});
