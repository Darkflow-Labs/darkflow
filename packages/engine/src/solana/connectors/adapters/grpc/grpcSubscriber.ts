import { createRequire } from "node:module";
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

import bs58 from "bs58";
import type { Logger } from "pino";
import type { LaunchSignal } from "../../../../core/types/domain.js";
import type { LaunchSignalSource } from "../../../../core/ports/launchSignalSource.js";
import {
  looksLikePumpfunCreateLogs,
  parsePumpCreateFromLogs,
  parsePumpCreateFromRawInstruction
} from "../../parsers/pumpCreateParser.js";

type GrpcSubscriberInput = {
  endpoint: string;
  xToken?: string;
  programId: string;
  logger: Logger;
};

type LaunchHandler = (signal: LaunchSignal) => void;

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

function buildSubscribeRequest(programId: string): SubscribeRequest {
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

const MAX_RECONNECT_DELAY_MS = 30_000;

export class GrpcSubscriber implements LaunchSignalSource {
  private readonly endpoint: string;
  private readonly xToken: string | undefined;
  private readonly programId: string;
  private readonly logger: Logger;
  private readonly launchHandlers: LaunchHandler[] = [];
  private readonly seenSignatures = new Set<string>();
  private stopped = false;
  private reconnectDelayMs = 1_000;

  public constructor({ endpoint, xToken, programId, logger }: GrpcSubscriberInput) {
    this.endpoint = normalizeGrpcEndpoint(endpoint);
    this.xToken = xToken;
    this.programId = programId;
    this.logger = logger;
  }

  public onLaunch(handler: LaunchHandler): void {
    this.launchHandlers.push(handler);
  }

  public start(): void {
    this.stopped = false;
    this.reconnectDelayMs = 1_000;
    void this.connect();
  }

  public stop(): void {
    this.stopped = true;
  }

  private async connect(): Promise<void> {
    const connectStartedAt = Date.now();
    try {
      // v4 uses @grpc/grpc-js — no connect() needed, subscribe() returns immediately.
      const client = new Client(this.endpoint, this.xToken, undefined);
      const stream = await client.subscribe();

      this.logger.info(
        {
          endpoint: this.endpoint,
          connectLatencyMs: Date.now() - connectStartedAt
        },
        "Connected to gRPC stream."
      );

      this.reconnectDelayMs = 1_000;

      const subscribeRequest = buildSubscribeRequest(this.programId);

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
          } catch (err) {
            this.logger.debug({ err }, "Error processing gRPC update.");
          }
        });
        stream.on("error", reject);
        stream.on("end", resolve);
        stream.on("close", resolve);

        stream.write(subscribeRequest);
      });
    } catch (err) {
      this.logger.warn(
        {
          err,
          endpoint: this.endpoint,
          connectLatencyMs: Date.now() - connectStartedAt,
          nextRetryMs: this.reconnectDelayMs
        },
        "gRPC stream disconnected, reconnecting."
      );
    }

    if (!this.stopped) {
      const delay = this.reconnectDelayMs;
      this.reconnectDelayMs = Math.min(
        MAX_RECONNECT_DELAY_MS,
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

    const sigBytes = txInfo.signature;
    if (!sigBytes || sigBytes.length === 0) {
      return;
    }
    const signature = bs58.encode(sigBytes);

    if (this.seenSignatures.has(signature)) {
      return;
    }
    this.seenSignatures.add(signature);
    if (this.seenSignatures.size > 8_000) {
      this.seenSignatures.clear();
    }

    const slot = Number((txUpdate as unknown as { slot: unknown }).slot ?? 0);
    const logMessages: string[] = (txInfo.meta?.logMessages ?? []) as string[];

    if (looksLikePumpfunCreateLogs(logMessages)) {
      const fromLogs = parsePumpCreateFromLogs(logMessages);
      if (fromLogs) {
        this.emitLaunch(signature, slot, fromLogs);
        return;
      }
    } else {
      return;
    }

    const message = txInfo.transaction?.message;
    if (!message) {
      return;
    }

    const accountKeys = (message.accountKeys ?? []).map((kb: Uint8Array) => bs58.encode(kb));

    type RawIx = { programIdIndex?: number; accounts?: Uint8Array; data?: Uint8Array; stackHeight?: number };
    const flattenInstructions = (ixList: RawIx[]) =>
      ixList.map((ix) => ({
        programId: accountKeys[ix.programIdIndex ?? 0] ?? "",
        accountIndices: Array.from(ix.accounts ?? new Uint8Array()),
        data: Buffer.from(ix.data ?? new Uint8Array())
      }));

    const topLevelIxs = flattenInstructions((message.instructions ?? []) as RawIx[]);
    const innerIxs = (txInfo.meta?.innerInstructions ?? []).flatMap(
      (inner: { instructions?: RawIx[] }) => flattenInstructions(inner.instructions ?? [])
    );

    for (const ix of [...topLevelIxs, ...innerIxs]) {
      if (ix.programId !== this.programId) {
        continue;
      }
      const parsed = parsePumpCreateFromRawInstruction(
        this.programId,
        accountKeys,
        ix.accountIndices,
        ix.data
      );
      if (parsed) {
        this.emitLaunch(signature, slot, parsed);
        return;
      }
    }
  }

  private emitLaunch(
    signature: string,
    slot: number,
    parsed: {
      tokenMint: string;
      creator: string;
      bondingCurve?: string;
      user?: string;
      name?: string;
      symbol?: string;
      uri?: string;
    }
  ): void {
    const signal: LaunchSignal = {
      signature,
      tokenMint: parsed.tokenMint,
      creator: parsed.creator,
      slot,
      source: "grpc",
      receivedAt: Date.now(),
      ...(parsed.bondingCurve !== undefined ? { bondingCurve: parsed.bondingCurve } : {}),
      ...(parsed.user !== undefined ? { user: parsed.user } : {}),
      ...(parsed.name !== undefined ? { name: parsed.name } : {}),
      ...(parsed.symbol !== undefined ? { symbol: parsed.symbol } : {}),
      ...(parsed.uri !== undefined ? { uri: parsed.uri } : {})
    };
    for (const handler of this.launchHandlers) {
      handler(signal);
    }
  }
}
