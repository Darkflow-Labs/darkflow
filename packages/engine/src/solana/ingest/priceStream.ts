import WebSocket from "ws";
import { createRequire } from "node:module";
import type { Logger } from "pino";
import type {
  CommitmentLevel as CommitmentLevelType,
  SubscribeRequest,
  SubscribeUpdate
} from "@triton-one/yellowstone-grpc";
import type { ClientDuplexStream } from "@grpc/grpc-js";

// v4 ships CJS-only types that don't map cleanly to NodeNext ESM imports;
// load the CJS bundle directly to avoid TypeScript module resolution issues.
const _require = createRequire(import.meta.url);
const { default: Client, CommitmentLevel } = _require("@triton-one/yellowstone-grpc") as {
  default: new (endpoint: string, xToken?: string, channelOptions?: unknown) => {
    subscribe(): Promise<ClientDuplexStream<SubscribeRequest, SubscribeUpdate>>;
  };
  CommitmentLevel: typeof CommitmentLevelType;
};

export type PriceTick = {
  tokenMint: string;
  priceSol: number;
  receivedAt: number;
  source: "drpc-primary" | "grpc-primary" | "external-confirmation";
  eventType?: string;
};

type PriceStreamListener = (tick: PriceTick) => void;

export interface PriceStream {
  onTick(listener: PriceStreamListener): void;
  start(): void;
  stop(): void;
}

type StreamHealth = {
  stale: boolean;
  lastTickAt: number;
};

type StreamHealthPair = {
  primary: StreamHealth;
  external: StreamHealth;
  fallbackActive: boolean;
};

type DrpcPriceStreamInput = {
  wsUrl: string;
  programId: string;
  logger: Logger;
};

type PumpApiPriceStreamInput = {
  wsUrl: string;
  logger: Logger;
};

type GrpcPriceStreamInput = {
  endpoint: string;
  xToken?: string;
  programId: string;
  logger: Logger;
};

const normalizeGrpcEndpoint = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const protocol = url.protocol || "https:";
      const hostname = url.hostname;
      if (!hostname) {
        return trimmed;
      }
      const port = url.port && url.port.length > 0 ? url.port : "443";
      return `${protocol}//${hostname}:${port}`;
    } catch {
      return trimmed;
    }
  }
  const noTrail = trimmed.replace(/\/+$/, "");
  if (noTrail.startsWith("dns:")) {
    return noTrail;
  }
  const hasScheme = noTrail.includes("://");
  if (hasScheme) {
    return noTrail;
  }
  // Default to TLS when a bare hostname is provided.
  return `https://${noTrail}`;
};

const extractPriceFromLogs = (logs: string[]) => {
  for (const log of logs) {
    const match = log.match(/price[:=]\s*([0-9]*\.?[0-9]+)/i);
    if (match?.[1]) {
      return Number(match[1]);
    }
  }
  return undefined;
};

const extractFieldFromLogs = (logs: string[], key: string) => {
  for (const log of logs) {
    const match = log.match(new RegExp(`${key}[:=]\\s*([1-9A-HJ-NP-Za-km-z]{32,44})`, "i"));
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
};

export class DrpcPriceStream implements PriceStream {
  private readonly wsUrl: string;
  private readonly programId: string;
  private readonly logger: Logger;
  private readonly listeners: PriceStreamListener[] = [];
  private ws?: WebSocket;

  public constructor({ wsUrl, programId, logger }: DrpcPriceStreamInput) {
    this.wsUrl = wsUrl;
    this.programId = programId;
    this.logger = logger;
  }

  public onTick(listener: PriceStreamListener) {
    this.listeners.push(listener);
  }

  public start() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.on("open", () => {
      const request = {
        jsonrpc: "2.0",
        id: "onyx-price-stream",
        method: "logsSubscribe",
        params: [{ mentions: [this.programId] }, { commitment: "processed" }]
      };
      this.ws?.send(JSON.stringify(request));
    });

    this.ws.on("message", (data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on("error", (error) => {
      this.logger.warn({ error }, "dRPC price stream websocket error");
    });
  }

  public stop() {
    this.ws?.close();
  }

  private handleMessage(raw: string) {
    try {
      const payload = JSON.parse(raw) as {
        params?: { result?: { value?: { logs?: string[] } } };
      };
      const logs = payload.params?.result?.value?.logs ?? [];
      const tokenMint = extractFieldFromLogs(logs, "mint");
      const price = extractPriceFromLogs(logs);
      if (!tokenMint || !price) {
        return;
      }
      const tick: PriceTick = {
        tokenMint,
        priceSol: price,
        receivedAt: Date.now(),
        source: "drpc-primary"
      };
      for (const listener of this.listeners) {
        listener(tick);
      }
    } catch {
      // ignore malformed ws payloads
    }
  }
}

export class PumpApiPriceStream implements PriceStream {
  private readonly wsUrl: string;
  private readonly logger: Logger;
  private readonly listeners: PriceStreamListener[] = [];
  private ws?: WebSocket;

  public constructor({ wsUrl, logger }: PumpApiPriceStreamInput) {
    this.wsUrl = wsUrl;
    this.logger = logger;
  }

  public onTick(listener: PriceStreamListener) {
    this.listeners.push(listener);
  }

  public start() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.on("message", (data) => {
      this.handleMessage(data.toString());
    });
    this.ws.on("error", (error) => {
      this.logger.warn({ error }, "PumpAPI stream websocket error");
    });
    this.ws.on("close", () => {
      this.logger.warn("PumpAPI stream websocket closed, reconnecting in 1s.");
      setTimeout(() => this.start(), 1000);
    });
  }

  public stop() {
    this.ws?.close();
  }

  private handleMessage(raw: string) {
    try {
      const payload = JSON.parse(raw) as {
        mint?: string;
        price?: number | string;
        quoteMint?: string;
        timestamp?: number;
        txType?: string;
      };
      if (!payload.mint) {
        return;
      }
      const price =
        typeof payload.price === "number"
          ? payload.price
          : typeof payload.price === "string"
            ? Number(payload.price)
            : Number.NaN;
      if (Number.isNaN(price) || price <= 0) {
        return;
      }
      if (payload.quoteMint && !this.isSolQuoteMint(payload.quoteMint)) {
        return;
      }
      const tick: PriceTick = {
        tokenMint: payload.mint,
        priceSol: price,
        receivedAt:
          typeof payload.timestamp === "number" && payload.timestamp > 0 ? payload.timestamp : Date.now(),
        source: "drpc-primary",
        eventType: typeof payload.txType === "string" ? payload.txType.toLowerCase() : undefined
      };
      for (const listener of this.listeners) {
        listener(tick);
      }
    } catch {
      // ignore malformed ws payloads
    }
  }

  private isSolQuoteMint(quoteMint: string) {
    return (
      quoteMint === "So11111111111111111111111111111111111111112" ||
      quoteMint === "11111111111111111111111111111111"
    );
  }
}

function buildGrpcSubscribeRequest(programId: string): SubscribeRequest {
  return {
    slots: {},
    accounts: {},
    transactions: {
      pumpfun: {
        vote: false,
        failed: false,
        accountInclude: [programId],
        accountExclude: [],
        accountRequired: []
      }
    },
    blocks: {},
    blocksMeta: {},
    accountsDataSlice: [],
    commitment: CommitmentLevel.PROCESSED,
    entry: {},
    transactionsStatus: {}
  };
}

const MAX_GRPC_RECONNECT_DELAY_MS = 30_000;

export class GrpcPriceStream implements PriceStream {
  private readonly endpoint: string;
  private readonly xToken: string | undefined;
  private readonly programId: string;
  private readonly logger: Logger;
  private readonly listeners: PriceStreamListener[] = [];
  private stopped = false;
  private reconnectDelayMs = 1_000;
  private stream?: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>;

  public constructor({ endpoint, xToken, programId, logger }: GrpcPriceStreamInput) {
    this.endpoint = normalizeGrpcEndpoint(endpoint);
    this.xToken = xToken;
    this.programId = programId;
    this.logger = logger;
  }

  public onTick(listener: PriceStreamListener) {
    this.listeners.push(listener);
  }

  public start() {
    this.stopped = false;
    this.reconnectDelayMs = 1_000;
    void this.connect();
  }

  public stop() {
    this.stopped = true;
    try {
      this.stream?.end();
    } catch {
      /* ignore */
    }
    this.stream = undefined;
  }

  private async connect(): Promise<void> {
    const connectStartedAt = Date.now();
    const subscribeRequest = buildGrpcSubscribeRequest(this.programId);
    try {
      const client = new Client(this.endpoint, this.xToken, undefined);
      const stream = await client.subscribe();
      this.stream = stream;

      this.logger.info(
        { endpoint: this.endpoint, connectLatencyMs: Date.now() - connectStartedAt },
        "Connected to gRPC price stream."
      );

      this.reconnectDelayMs = 1_000;

      await new Promise<void>((resolve, reject) => {
        stream.on("data", (data: SubscribeUpdate) => {
          const pingId = (data as unknown as { ping?: { id?: number } }).ping?.id;
          if (pingId !== undefined) {
            // Resend the full subscription alongside the pong so the server
            // does not treat empty filter maps as "clear subscriptions".
            stream.write({ ...subscribeRequest, ping: { id: pingId } });
            return;
          }
          try {
            this.handleUpdate(data);
          } catch (err: unknown) {
            this.logger.debug({ err }, "Error processing gRPC price update.");
          }
        });
        stream.on("error", reject);
        stream.on("end", resolve);
        stream.on("close", resolve);
        stream.write(subscribeRequest);
      });
    } catch (err: unknown) {
      this.logger.warn(
        {
          err,
          endpoint: this.endpoint,
          connectLatencyMs: Date.now() - connectStartedAt,
          nextRetryMs: this.reconnectDelayMs
        },
        "gRPC price stream disconnected, reconnecting."
      );
    }

    if (!this.stopped) {
      const delay = this.reconnectDelayMs;
      this.reconnectDelayMs = Math.min(
        MAX_GRPC_RECONNECT_DELAY_MS,
        this.reconnectDelayMs * 2 + Math.random() * 500
      );
      setTimeout(() => void this.connect(), delay);
    }
  }

  private handleUpdate(data: SubscribeUpdate): void {
    const txUpdate = data.transaction;
    if (!txUpdate) {
      return;
    }
    const txInfo = txUpdate.transaction;
    if (!txInfo) {
      return;
    }
    const logMessages: string[] = (txInfo.meta?.logMessages ?? []) as string[];
    if (!logMessages || logMessages.length === 0) {
      return;
    }
    const tokenMint = extractFieldFromLogs(logMessages, "mint");
    const price = extractPriceFromLogs(logMessages);
    if (!tokenMint || !price) {
      return;
    }

    const tick: PriceTick = {
      tokenMint,
      priceSol: price,
      receivedAt: Date.now(),
      source: "grpc-primary"
    };

    for (const listener of this.listeners) {
      listener(tick);
    }
  }
}

type ExternalQuotePriceStreamInput = {
  quoteUrlTemplate: string;
  trackedMints: () => string[];
  pollIntervalMs: number;
  logger: Logger;
};

export class ExternalQuotePriceStream implements PriceStream {
  private readonly quoteUrlTemplate: string;
  private readonly trackedMints: () => string[];
  private readonly pollIntervalMs: number;
  private readonly logger: Logger;
  private readonly listeners: PriceStreamListener[] = [];
  private timer?: NodeJS.Timeout;

  public constructor(input: ExternalQuotePriceStreamInput) {
    this.quoteUrlTemplate = input.quoteUrlTemplate;
    this.trackedMints = input.trackedMints;
    this.pollIntervalMs = input.pollIntervalMs;
    this.logger = input.logger;
  }

  public onTick(listener: PriceStreamListener) {
    this.listeners.push(listener);
  }

  public start() {
    this.timer = setInterval(() => void this.poll(), this.pollIntervalMs);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async poll() {
    for (const mint of this.trackedMints()) {
      const url = this.quoteUrlTemplate.replace("{mint}", mint);
      try {
        const response = await fetch(url);
        if (!response.ok) {
          continue;
        }
        const payload = (await response.json()) as { priceSol?: number; price?: number };
        const priceSol = payload.priceSol ?? payload.price;
        if (!priceSol || Number.isNaN(priceSol)) {
          continue;
        }
        const tick: PriceTick = {
          tokenMint: mint,
          priceSol,
          receivedAt: Date.now(),
          source: "external-confirmation"
        };
        for (const listener of this.listeners) {
          listener(tick);
        }
      } catch (error: unknown) {
        this.logger.debug({ mint, error }, "External quote poll failed");
      }
    }
  }
}

type HybridPriceMuxInput = {
  primary: PriceStream;
  external?: PriceStream;
  staleTimeoutMs: number;
  logger: Logger;
};

export class HybridPriceMux implements PriceStream {
  private readonly primary: PriceStream;
  private readonly external?: PriceStream;
  private readonly staleTimeoutMs: number;
  private readonly logger: Logger;
  private readonly listeners: PriceStreamListener[] = [];
  private primaryLastTickAt = 0;
  private externalLastTickAt = 0;

  public constructor({ primary, external, staleTimeoutMs, logger }: HybridPriceMuxInput) {
    this.primary = primary;
    this.external = external;
    this.staleTimeoutMs = staleTimeoutMs;
    this.logger = logger;
  }

  public onTick(listener: PriceStreamListener) {
    this.listeners.push(listener);
  }

  public start() {
    this.primary.onTick((tick) => {
      this.primaryLastTickAt = tick.receivedAt;
      this.emit(tick);
    });
    this.primary.start();

    if (this.external) {
      this.external.onTick((tick) => {
        this.externalLastTickAt = tick.receivedAt;
        this.emit(tick);
      });
      this.external.start();
    }
  }

  public stop() {
    this.primary.stop();
    this.external?.stop();
  }

  public healthSnapshot(): StreamHealthPair {
    const now = Date.now();
    const primaryStale = now - this.primaryLastTickAt > this.staleTimeoutMs;
    const externalStale =
      !this.external || this.externalLastTickAt === 0
        ? true
        : now - this.externalLastTickAt > this.staleTimeoutMs;
    return {
      primary: { stale: primaryStale, lastTickAt: this.primaryLastTickAt },
      external: { stale: externalStale, lastTickAt: this.externalLastTickAt },
      fallbackActive: !externalStale
    };
  }

  private emit(tick: PriceTick) {
    for (const listener of this.listeners) {
      listener(tick);
    }
  }
}
