export type GeyserStreamAuthMode = "query" | "bearer";

export type GeyserEventType = "launch" | "tick";

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

export type GeyserEvent = GeyserLaunchEvent | GeyserTickEvent;

export type GeyserHealthResponse = {
  ok: boolean;
  service: string;
};

export type DarkflowGeyserConfig = {
  apiKey: string;
  httpBaseUrl: string;
  streamUrl: string | URL;
  debug?: boolean;
  streamAuth?: GeyserStreamAuthMode;
  timeout?: number;
  retry?: number;
};

export type GeyserSubscribeOptions = {
  signal?: AbortSignal;
  includeLaunches?: boolean;
  includeTicks?: boolean;
};

export type ConnectGeyserStreamWithRetryOptions = {
  signal?: AbortSignal;
  maxAttempts?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
};
