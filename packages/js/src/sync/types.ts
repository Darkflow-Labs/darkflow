export type SyncTickMessage = {
  v: 1;
  type: "tick";
  tokenMint: string;
  priceSol: number;
  receivedAt: number;
  source: string;
  eventType?: string;
};

export type SyncControlMessage =
  | { op: "subscribe"; mints: readonly string[] }
  | { op: "unsubscribe"; mints: readonly string[] };
