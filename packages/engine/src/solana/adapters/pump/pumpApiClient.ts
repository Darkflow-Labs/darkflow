import type { Logger } from "pino";
import type { ExecutionResult, TradeIntent } from "../../../core/types/domain.js";

type PumpApiClientInput = {
  tradeUrl: string;
  userPrivateKeyBase58: string;
  logger: Logger;
  requestTimeoutMs?: number;
};

export class PumpApiClient {
  private readonly tradeUrl: string;
  private readonly userPrivateKeyBase58: string;
  private readonly logger: Logger;
  private readonly requestTimeoutMs: number;

  public constructor({ tradeUrl, userPrivateKeyBase58, logger, requestTimeoutMs = 3500 }: PumpApiClientInput) {
    this.tradeUrl = tradeUrl;
    this.userPrivateKeyBase58 = userPrivateKeyBase58;
    this.logger = logger;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  public async execute(intent: TradeIntent): Promise<ExecutionResult> {
    const started = Date.now();
    // Official PumpAPI expects slippage in percent and priority fee in SOL.
    const slippagePercent = Math.max(1, Math.ceil(intent.maxSlippageBps / 100));
    const priorityFeeSol = Math.max(0.00001, intent.tipLamports / 1_000_000_000);
    const amount = intent.amountOverride ?? intent.amountSol;
    const denominatedInQuote = intent.denominatedInQuote ?? intent.side === "buy";

    try {
      const response = await this.fetchWithTimeout({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          privateKey: this.userPrivateKeyBase58,
          action: intent.side,
          mint: intent.tokenMint,
          amount,
          denominatedInQuote,
          slippage: slippagePercent,
          priorityFee: priorityFeeSol
        })
      });

      const payload = (await response.json()) as {
        signature?: string;
        signatures?: string[];
        createdMints?: string[];
        err?: string;
        error?: string;
        message?: string;
      };
      const apiError = payload.err || payload.error || payload.message;
      if (!response.ok || apiError) {
        const error = apiError || `HTTP ${response.status}`;
        return { ok: false, error, latencyMs: Date.now() - started };
      }

      const signature = payload.signature ?? payload.signatures?.[0];
      if (!signature) {
        return { ok: false, error: "pumpapi response missing signature", latencyMs: Date.now() - started };
      }

      return { ok: true, signature, latencyMs: Date.now() - started };
    } catch (error: unknown) {
      this.logger.warn({ error }, "Pump API execution request failed.");
      return { ok: false, error: "pumpapi-request-failed", latencyMs: Date.now() - started };
    }
  }

  public async buildUnsignedTransaction(intent: TradeIntent, publicKey: string): Promise<Buffer> {
    const slippagePercent = Math.max(1, Math.ceil(intent.maxSlippageBps / 100));
    const priorityFeeSol = Math.max(0.00001, intent.tipLamports / 1_000_000_000);
    const amount = intent.amountOverride ?? intent.amountSol;
    const denominatedInQuote = intent.denominatedInQuote ?? intent.side === "buy";

    const response = await this.fetchWithTimeout({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        publicKey,
        action: intent.side,
        mint: intent.tokenMint,
        amount,
        denominatedInQuote,
        slippage: slippagePercent,
        priorityFee: priorityFeeSol
      })
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const payload = (await response.json()) as { err?: string; error?: string; message?: string };
        message = payload.err || payload.error || payload.message || message;
      } catch {
        // ignore json parse failure
      }
      throw new Error(`pumpapi local tx build failed: ${message}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error("pumpapi local tx build returned empty payload");
    }
    return bytes;
  }

  private async fetchWithTimeout(init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      return await fetch(this.tradeUrl, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}
