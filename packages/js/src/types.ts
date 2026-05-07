/**
 * Launch payload broadcast by Onyx public stream (see `launchToDto` in apps/onyx).
 */
export type LaunchSource = "drpc-logs" | "grpc" | "high-volume-lane" | "sweep-detector";

export type LaunchMessage = {
  type: "launch";
  signature: string;
  tokenMint: string;
  creator: string;
  receivedAt: number;
  slot: number;
  source: LaunchSource;
  name?: string;
  symbol?: string;
  uri?: string;
  bondingCurve?: string;
  user?: string;
};

export type LaunchStreamAuthMode = "query" | "bearer";

export type DarkflowConfig = {
  /** Unkey API key (verify-capable key string). */
  apiKey: string;
  /**
   * Base URL for future HTTP APIs (`ofetch` client).
   * @default https://api.darkflow.io
   */
  baseUrl?: string;
  /** WebSocket URL for the public launch stream (scheme `ws` or `wss`). */
  launchStreamUrl: string | URL;
  /** WebSocket URL for the sync tick stream exposed by `apps/sync`. */
  syncStreamUrl?: string | URL;
  /** Log requests/responses when HTTP is used. */
  debug?: boolean;
  /**
   * How the key is sent on the WebSocket upgrade.
   * - `query`: appends `?key=` (works in browsers; default).
   * - `bearer`: sends `Authorization: Bearer` (requires `ws` on Node; not available in browser WebSocket).
   * @default "query"
   */
  launchStreamAuth?: LaunchStreamAuthMode;
};

export type SubscribeLaunchesOptions = {
  signal?: AbortSignal;
};

export type ConnectLaunchStreamWithRetryOptions = {
  signal?: AbortSignal;
  /** Maximum connection attempts (default 8). */
  maxAttempts?: number;
  /** Initial backoff in ms (default 400). */
  initialBackoffMs?: number;
  /** Max backoff cap in ms (default 15_000). */
  maxBackoffMs?: number;
};
