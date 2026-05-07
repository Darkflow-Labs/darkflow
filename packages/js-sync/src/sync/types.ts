/** Wire tick from `apps/sync` / Onyx Redis publisher (`PriceTickPubPayload`). */
export type PriceTickMessage = {
  v: 1;
  type: "tick";
  tokenMint: string;
  priceSol: number;
  receivedAt: number;
  source: string;
  eventType?: string;
};

export type SyncStreamControl =
  | { op: "subscribe"; mints: readonly string[] }
  | { op: "unsubscribe"; mints: readonly string[] };
