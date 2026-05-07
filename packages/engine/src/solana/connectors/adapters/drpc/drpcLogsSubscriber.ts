import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import type { LaunchSignal } from "../../../../core/types/domain.js";
import type { LaunchSignalSource } from "../../../../core/ports/launchSignalSource.js";
import {
  looksLikePumpfunCreateLogs,
  parsePumpCreateFromGetTransactionJson,
  parsePumpCreateFromLogs
} from "../../parsers/pumpCreateParser.js";

type DrpcLogsSubscriberInput = {
  wsUrl: string;
  rpcHttpUrl: string;
  programId: string;
  logger: Logger;
  txFetchTimeoutMs?: number;
  txFetchConcurrency?: number;
  logPayloadDetails?: boolean;
  maxDecodeQueueSize?: number;
};

type LaunchHandler = (signal: LaunchSignal) => void;

type RpcLogNotification = {
  params?: {
    result?: {
      context?: { slot?: number };
      value?: {
        signature?: string;
        logs?: string[];
      };
    };
  };
};

export class DrpcLogsSubscriber implements LaunchSignalSource {
  private readonly wsUrl: string;
  private readonly rpcHttpUrl: string;
  private readonly programId: string;
  private readonly logger: Logger;
  private readonly txFetchTimeoutMs: number;
  private readonly txFetchConcurrency: number;
  private readonly logPayloadDetails: boolean;
  private readonly maxDecodeQueueSize: number;
  private ws: WebSocket | undefined;
  private launchHandlers: LaunchHandler[] = [];
  private readonly seenSignatures = new Set<string>();
  private readonly pendingDecodeQueue: string[] = [];
  private activeDecodeWorkers = 0;

  public constructor({
    wsUrl,
    rpcHttpUrl,
    programId,
    logger,
    txFetchTimeoutMs = 700,
    txFetchConcurrency = 6,
    logPayloadDetails = false,
    maxDecodeQueueSize = 400
  }: DrpcLogsSubscriberInput) {
    this.wsUrl = wsUrl;
    this.rpcHttpUrl = rpcHttpUrl;
    this.programId = programId;
    this.logger = logger;
    this.txFetchTimeoutMs = txFetchTimeoutMs;
    this.txFetchConcurrency = txFetchConcurrency;
    this.logPayloadDetails = logPayloadDetails;
    this.maxDecodeQueueSize = maxDecodeQueueSize;
  }

  public onLaunch(handler: LaunchHandler) {
    this.launchHandlers.push(handler);
  }

  public start(): void {
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on("open", () => {
      this.logger.info({ wsUrl: this.wsUrl }, "Connected to dRPC websocket.");
      this.subscribeToLogs();
    });

    this.ws.on("message", (payload) => {
      this.handleMessage(payload.toString());
    });

    this.ws.on("error", (error) => {
      this.logger.error({ error }, "dRPC websocket error.");
    });

    this.ws.on("close", () => {
      this.logger.warn("dRPC websocket closed, reconnecting in 1s.");
      setTimeout(() => this.start(), 1000);
    });
  }

  public stop(): void {
    this.ws?.close();
  }

  private subscribeToLogs() {
    const request = {
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "logsSubscribe",
      params: [{ mentions: [this.programId] }, { commitment: "processed" }]
    };

    this.ws?.send(JSON.stringify(request));
  }

  private handleMessage(raw: string) {
    let parsed: RpcLogNotification | undefined;
    try {
      parsed = JSON.parse(raw) as RpcLogNotification;
    } catch {
      this.logger.debug({ raw }, "Skipping non-json ws payload.");
      return;
    }

    const result = parsed.params?.result;
    const signature = result?.value?.signature;
    const logs = result?.value?.logs ?? [];
    const slot = result?.context?.slot ?? 0;

    if (!signature || !looksLikePumpfunCreateLogs(logs)) {
      return;
    }

    if (this.logPayloadDetails) {
      this.logger.debug(
        {
          signature,
          slot,
          logsCount: logs.length,
          logsPreview: logs.slice(0, 8)
        },
        "dRPC logsSubscribe candidate payload"
      );
    }

    if (this.seenSignatures.has(signature)) {
      return;
    }
    this.seenSignatures.add(signature);
    if (this.seenSignatures.size > 8_000) {
      // Simple bounded cache to avoid unbounded growth.
      this.seenSignatures.clear();
    }

    const fromProgramData = parsePumpCreateFromLogs(logs);
    if (fromProgramData) {
      this.emitLaunch(signature, slot, fromProgramData);
      return;
    }

    const tokenMint = this.extractMintFromLogs(logs);
    const creator = this.extractCreatorFromLogs(logs);
    if (tokenMint && creator) {
      this.emitLaunch(signature, slot, { tokenMint, creator });
      return;
    }

    this.logger.debug({ signature }, "Signal missing token mint or creator in logs; queued tx decode.");
    if (this.pendingDecodeQueue.length >= this.maxDecodeQueueSize) {
      return;
    }
    this.pendingDecodeQueue.push(signature);
    this.drainDecodeQueue();
  }

  private emitLaunch(signature: string, slot: number, parsed: { tokenMint: string; creator: string; bondingCurve?: string; user?: string; name?: string; symbol?: string; uri?: string }) {
    const signal: LaunchSignal = {
      signature,
      tokenMint: parsed.tokenMint,
      creator: parsed.creator,
      slot,
      source: "drpc-logs",
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

  private extractMintFromLogs(logs: string[]) {
    for (const line of logs) {
      const match = line.match(/mint[:=]\s*([1-9A-HJ-NP-Za-km-z]{32,44})/i);
      if (match?.[1]) {
        return match[1];
      }
    }

    return undefined;
  }

  private extractCreatorFromLogs(logs: string[]) {
    for (const line of logs) {
      const match = line.match(/creator[:=]\s*([1-9A-HJ-NP-Za-km-z]{32,44})/i);
      if (match?.[1]) {
        return match[1];
      }
    }

    return undefined;
  }

  private drainDecodeQueue() {
    while (this.activeDecodeWorkers < this.txFetchConcurrency && this.pendingDecodeQueue.length > 0) {
      const signature = this.pendingDecodeQueue.shift();
      if (!signature) {
        return;
      }
      this.activeDecodeWorkers += 1;
      void this.decodeFromTransaction(signature)
        .catch((error: unknown) => {
          this.logger.debug({ signature, error }, "Failed tx decode for candidate signature.");
        })
        .finally(() => {
          this.activeDecodeWorkers -= 1;
          this.drainDecodeQueue();
        });
    }
  }

  private async decodeFromTransaction(signature: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.txFetchTimeoutMs);
    try {
      const response = await fetch(this.rpcHttpUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: signature,
          method: "getTransaction",
          params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]
        })
      });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { result?: unknown };
      const tx = payload.result;
      if (!tx || typeof tx !== "object") {
        return;
      }
      const slot = (tx as { slot?: number }).slot ?? 0;
      const parsed = parsePumpCreateFromGetTransactionJson(tx, this.programId);
      if (parsed) {
        this.logger.debug(
          { signature, tokenMint: parsed.tokenMint, creator: parsed.creator },
          "Recovered launch signal via pump create ix decode."
        );
        this.emitLaunch(signature, slot, parsed);
        return;
      }

      const keys = (tx as { transaction?: { message?: { accountKeys?: Array<{ pubkey?: string; signer?: boolean; writable?: boolean }> } } })
        .transaction?.message?.accountKeys ?? [];
      const tokenMint = keys.find((key) => key.writable && !key.signer)?.pubkey;
      const creator = keys.find((key) => key.signer)?.pubkey;
      if (!tokenMint || !creator) {
        return;
      }

      this.logger.debug({ signature, tokenMint, creator }, "Recovered launch signal via tx account-key heuristic.");
      this.emitLaunch(signature, slot, { tokenMint, creator });
    } finally {
      clearTimeout(timeout);
    }
  }
}
