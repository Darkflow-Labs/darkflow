import type { Logger } from "pino";
import type { ExecutionResult } from "../../../core/types/domain.js";

type JitoClientInput = {
  txUrl: string;
  fallbackTxUrl?: string;
  maxRetries: number;
  minSubmitIntervalMs?: number;
  authKey?: string;
  bundleOnly?: boolean;
  logger: Logger;
  mode: "live" | "paper";
};

export class JitoClient {
  private readonly txUrl: string;
  private readonly fallbackTxUrl?: string;
  private readonly maxRetries: number;
  private readonly minSubmitIntervalMs: number;
  private readonly authKey?: string;
  private readonly bundleOnly: boolean;
  private readonly logger: Logger;
  private readonly mode: "live" | "paper";
  private queue: Promise<void> = Promise.resolve();
  private nextSubmitAt = 0;

  public constructor({
    txUrl,
    fallbackTxUrl,
    maxRetries,
    minSubmitIntervalMs = 1200,
    authKey,
    bundleOnly = true,
    logger,
    mode
  }: JitoClientInput) {
    this.txUrl = txUrl;
    this.fallbackTxUrl = fallbackTxUrl;
    this.maxRetries = maxRetries;
    this.minSubmitIntervalMs = minSubmitIntervalMs;
    this.authKey = authKey;
    this.bundleOnly = bundleOnly;
    this.logger = logger;
    this.mode = mode;
  }

  public async sendTransaction(base64Tx: string): Promise<ExecutionResult> {
    return this.enqueue(() => this.sendTransactionInternal(base64Tx));
  }

  private async sendTransactionInternal(base64Tx: string): Promise<ExecutionResult> {
    const started = Date.now();

    if (this.mode === "paper") {
      return {
        ok: true,
        signature: `paper-${Date.now()}`,
        latencyMs: Date.now() - started
      };
    }

    const endpoints = [this.txUrl, this.fallbackTxUrl].filter((value): value is string => !!value);
    let lastError = "submission-failed";
    await this.paceSubmissions();
    for (const endpoint of endpoints) {
      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        const result = await this.sendToEndpoint(endpoint, base64Tx);
        if (result.ok) {
          return result;
        }
        lastError = result.error ?? lastError;
        if (this.isNonRetryableError(lastError)) {
          break;
        }
        const retryDelayMs = this.retryDelayFromError(lastError);
        if (retryDelayMs > 0) {
          await this.sleep(retryDelayMs);
        }
      }
      if (this.isNonRetryableError(lastError)) {
        break;
      }
    }

    this.logger.error({ lastError }, "All Jito send attempts failed.");
    return { ok: false, error: lastError, latencyMs: Date.now() - started };
  }

  private async sendToEndpoint(endpoint: string, base64Tx: string): Promise<ExecutionResult> {
    const started = Date.now();
    try {
      const url = this.appendJitoQueryParams(endpoint);
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (this.authKey) {
        headers["x-jito-auth"] = this.authKey;
      }
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sendTransaction",
          params: [base64Tx, { encoding: "base64" }]
        })
      });

      const payload = (await response.json()) as { result?: string; error?: { message?: string } };
      if (!response.ok || payload.error) {
        const error = payload.error?.message ?? `HTTP ${response.status}`;
        this.logger.warn({ endpoint, error }, "Jito sendTransaction failed.");
        return { ok: false, error, latencyMs: Date.now() - started };
      }
      const resultValue = payload.result;
      if (!resultValue || !this.looksLikeSolanaSignature(resultValue)) {
        this.logger.warn(
          { endpoint, result: resultValue },
          "Jito response did not return a tx signature."
        );
        return { ok: false, error: "jito-missing-signature", latencyMs: Date.now() - started };
      }
      return { ok: true, signature: resultValue, latencyMs: Date.now() - started };
    } catch (error: unknown) {
      this.logger.warn({ endpoint, error }, "Failed to submit transaction to Jito.");
      return { ok: false, error: "submission-failed", latencyMs: Date.now() - started };
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async paceSubmissions() {
    const waitMs = Math.max(0, this.nextSubmitAt - Date.now());
    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
    this.nextSubmitAt = Date.now() + this.minSubmitIntervalMs;
  }

  private retryDelayFromError(error: string) {
    const match = error.match(/Retry after (\d+)ms/i);
    if (match?.[1]) {
      return Number(match[1]);
    }
    return 0;
  }

  private isNonRetryableError(error: string) {
    const normalized = error.toLowerCase();
    return (
      normalized.includes("failed to deserialize packet") ||
      normalized.includes("invalid transaction") ||
      normalized.includes("signature verification failed")
    );
  }

  private appendJitoQueryParams(endpoint: string) {
    const url = new URL(endpoint);
    if (this.bundleOnly) {
      url.searchParams.set("bundleOnly", "true");
    }
    return url.toString();
  }

  private looksLikeSolanaSignature(value: string) {
    if (value.length < 64 || value.length > 120) {
      return false;
    }
    return /^[1-9A-HJ-NP-Za-km-z]+$/.test(value);
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
