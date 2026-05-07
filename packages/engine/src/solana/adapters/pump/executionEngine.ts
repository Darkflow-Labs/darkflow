import { Connection, PublicKey, VersionedTransaction, type Keypair } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import type { Logger } from "pino";
import type { ExecutionResult, TradeIntent } from "../../../core/types/domain.js";
import { JitoClient } from "./jitoClient.js";
import { PumpApiClient } from "./pumpApiClient.js";
import { buildEntryTransaction } from "./txBuilder.js";

type ExecutionEngineInput = {
  rpcHttpUrl: string;
  walletAddress: string;
  mode: "live" | "paper";
  backend: "jito" | "pumpapi";
  jitoClient: JitoClient;
  pumpApiClient?: PumpApiClient;
  signerKeypair?: Keypair;
  maxIntentAgeMs: number;
  requestTimeoutMs: number;
  confirmTimeoutMs: number;
  confirmPollMs: number;
  fallbackMaxIntentAgeMs: number;
  useNativeJitoBuilder?: boolean;
  logger: Logger;
};

export class ExecutionEngine {
  private readonly connection: Connection;
  private readonly walletAddress: string;
  private readonly jitoClient: JitoClient;
  private readonly pumpApiClient?: PumpApiClient;
  private readonly signerKeypair?: Keypair;
  private readonly maxIntentAgeMs: number;
  private readonly logger: Logger;
  private readonly requestTimeoutMs: number;
  private readonly fallbackMaxIntentAgeMs: number;
  private readonly confirmTimeoutMs: number;
  private readonly confirmPollMs: number;
  private readonly useNativeJitoBuilder: boolean;
  private readonly mode: "live" | "paper";
  private readonly backend: "jito" | "pumpapi";
  private cachedBlockhash: string | null = null;
  private blockhashTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor({
    rpcHttpUrl,
    walletAddress,
    mode,
    backend,
    jitoClient,
    pumpApiClient,
    signerKeypair,
    maxIntentAgeMs,
    requestTimeoutMs,
    confirmTimeoutMs,
    confirmPollMs,
    fallbackMaxIntentAgeMs,
    useNativeJitoBuilder = false,
    logger
  }: ExecutionEngineInput) {
    this.connection = new Connection(rpcHttpUrl, "processed");
    this.walletAddress = walletAddress;
    this.mode = mode;
    this.backend = backend;
    this.jitoClient = jitoClient;
    this.pumpApiClient = pumpApiClient;
    this.signerKeypair = signerKeypair;
    this.maxIntentAgeMs = maxIntentAgeMs;
    this.requestTimeoutMs = requestTimeoutMs;
    this.confirmTimeoutMs = confirmTimeoutMs;
    this.confirmPollMs = confirmPollMs;
    this.fallbackMaxIntentAgeMs = fallbackMaxIntentAgeMs;
    this.useNativeJitoBuilder = useNativeJitoBuilder;
    this.logger = logger;
    if (this.mode === "live" && this.backend === "jito" && this.useNativeJitoBuilder) {
      void this.refreshBlockhashCache();
    }
  }

  public async execute(intent: TradeIntent): Promise<ExecutionResult> {
    const signalAgeMs = intent.launchSignal ? Date.now() - intent.launchSignal.receivedAt : 0;
    if (intent.launchSignal && signalAgeMs > this.maxIntentAgeMs) {
      return {
        ok: false,
        error: `intent-stale-${signalAgeMs}ms`,
        latencyMs: 0
      };
    }
    if (this.mode === "live" && this.backend === "pumpapi") {
      if (!this.pumpApiClient) {
        return { ok: false, error: "pumpapi backend selected but not configured", latencyMs: 0 };
      }
      const result = await this.withTimeout(
        this.pumpApiClient.execute(intent),
        this.requestTimeoutMs,
        "pumpapi-timeout"
      );
      this.logger.info(
        { tokenMint: intent.tokenMint, side: intent.side, backend: "pumpapi", ok: result.ok, latencyMs: result.latencyMs },
        "Execution attempt finished."
      );
      return result;
    }

    if (this.mode === "live" && this.backend === "jito") {
      if (!this.signerKeypair) {
        return { ok: false, error: "missing signer keypair for jito backend", latencyMs: 0 };
      }

      const started = Date.now();
      let buildMs = 0;
      try {
        const buildStarted = Date.now();
        const nativeRpcPath = this.useNativeJitoBuilder;
        const payload = await this.buildJitoPayload(intent);
        buildMs = Date.now() - buildStarted;
        const preSubmitAgeMs = intent.launchSignal ? Date.now() - intent.launchSignal.receivedAt : 0;
        if (intent.launchSignal && preSubmitAgeMs > this.maxIntentAgeMs) {
          return {
            ok: false,
            error: `intent-stale-before-submit-${preSubmitAgeMs}ms`,
            latencyMs: Date.now() - started
          };
        }
        const submitStarted = Date.now();
        const result = nativeRpcPath
          ? await this.sendViaRpc(payload.encoded)
          : await this.jitoClient.sendTransaction(payload.encoded);
        const submitMs = Date.now() - submitStarted;
        const confirmation = result.ok && result.signature
          ? await this.awaitSignatureConfirmation(result.signature)
          : { confirmed: false, reason: "missing-signature" };
        let finalResult = result;
        let finalConfirmation = confirmation;
        let retriedSellVariant = false;
        if (
          nativeRpcPath &&
          intent.side === "sell" &&
          !confirmation.confirmed &&
          (confirmation.reason.includes("Custom\":101") || confirmation.reason.includes("Custom\":6022"))
        ) {
          const retryBuilt = await this.buildJitoPayload(intent, "alternate");
          const retrySubmitted = await this.sendViaRpc(retryBuilt.encoded);
          const retryConfirmation = retrySubmitted.ok && retrySubmitted.signature
            ? await this.awaitSignatureConfirmation(retrySubmitted.signature)
            : { confirmed: false, reason: "missing-signature" };
          finalResult = retrySubmitted;
          finalConfirmation = retryConfirmation;
          retriedSellVariant = true;
          this.logger.info(
            {
              tokenMint: intent.tokenMint,
              sellRetryVariant: "alternate",
              buildDebug: retryBuilt.debug,
              firstAttemptReason: confirmation.reason,
              retryReason: retryConfirmation.reason,
              retrySignature: retrySubmitted.signature
            },
            "Retried native sell with alternate variant."
          );
          if (!retryConfirmation.confirmed && this.pumpApiClient) {
            const pumpApiPayload = await this.buildJitoPayload(intent, "primary", true);
            const pumpApiSubmitted = await this.jitoClient.sendTransaction(pumpApiPayload.encoded);
            const pumpApiConfirmation = pumpApiSubmitted.ok && pumpApiSubmitted.signature
              ? await this.awaitSignatureConfirmation(pumpApiSubmitted.signature)
              : { confirmed: false, reason: "missing-signature" };
            finalResult = pumpApiSubmitted;
            finalConfirmation = pumpApiConfirmation;
            this.logger.info(
              {
                tokenMint: intent.tokenMint,
                sellRetryVariant: "pumpapi-fallback",
                firstAttemptReason: confirmation.reason,
                secondAttemptReason: retryConfirmation.reason,
                finalReason: pumpApiConfirmation.reason,
                fallbackSignature: pumpApiSubmitted.signature
              },
              "Retried sell through PumpAPI fallback after native variants failed."
            );
          }
        }
        const endToEndMs = Date.now() - started;
        const effectiveResult =
          finalResult.ok && finalResult.signature && finalConfirmation.confirmed
            ? finalResult
            : {
                ok: false,
                error: finalResult.ok ? `tx-not-confirmed:${finalConfirmation.reason}` : finalResult.error,
                latencyMs: finalResult.latencyMs
              };
        const buySettledByBalance =
          intent.side === "buy" && !effectiveResult.ok
            ? await this.wasBuySettledByBalance(intent.tokenMint)
            : false;
        const sellSettledByBalance =
          intent.side === "sell" && !effectiveResult.ok
            ? await this.wasSellSettledByBalance(intent.tokenMint)
            : false;
        const reconciledResult =
          (buySettledByBalance || sellSettledByBalance) && finalResult.signature
            ? {
                ok: true as const,
                signature: finalResult.signature,
                latencyMs: Date.now() - started
              }
            : effectiveResult;
        this.logger.info(
          {
            tokenMint: intent.tokenMint,
            side: intent.side,
            backend: nativeRpcPath ? "rpc-native" : "jito",
            ok: reconciledResult.ok,
            signature: finalResult.signature,
            confirmed: finalConfirmation.confirmed,
            confirmationReason: finalConfirmation.reason,
            buySettledByBalance,
            sellSettledByBalance,
            retriedSellVariant,
            buildDebug: payload.debug,
            latencyMs: reconciledResult.latencyMs,
            buildMs,
            submitMs,
            endToEndMs,
            nativeBuilderUsed: nativeRpcPath
          },
          "Execution attempt finished."
        );
        return { ...reconciledResult, signature: finalResult.signature, latencyMs: endToEndMs };
      } catch (error: unknown) {
        const ageMs = intent.launchSignal ? Date.now() - intent.launchSignal.receivedAt : 0;
        if (ageMs > this.fallbackMaxIntentAgeMs) {
          return {
            ok: false,
            error: `fallback-skipped-intent-stale-${ageMs}ms`,
            latencyMs: Date.now() - started
          };
        }
        return {
          ok: false,
          error: error instanceof Error ? error.message : "jito-build-sign-submit-failed",
          latencyMs: Date.now() - started
        };
      }
    }

    const recentBlockhash = this.mode === "paper" ? "paper-blockhash" : await this.fetchBlockhash();
    const built = await buildEntryTransaction({
      connection: this.connection,
      signerKeypair: this.signerKeypair!,
      recentBlockhash,
      intent
    });
    const tx = Buffer.from(built.serialized).toString("base64");

    const result = await this.jitoClient.sendTransaction(tx);
    this.logger.info(
      { tokenMint: intent.tokenMint, ok: result.ok, latencyMs: result.latencyMs },
      "Execution attempt finished."
    );
    return result;
  }

  private async fetchBlockhash() {
    if (this.cachedBlockhash) {
      return this.cachedBlockhash;
    }
    await this.refreshBlockhashCache();
    if (this.cachedBlockhash) {
      return this.cachedBlockhash;
    }
    const response = await this.connection.getLatestBlockhash("processed");
    return response.blockhash;
  }

  private scheduleBlockhashRefresh() {
    if (this.blockhashTimer) {
      clearTimeout(this.blockhashTimer);
    }
    // Keep a fresh processed blockhash available to avoid per-build fetch latency.
    this.blockhashTimer = setTimeout(() => {
      void this.refreshBlockhashCache();
    }, 12_000);
  }

  private async refreshBlockhashCache() {
    try {
      const response = await this.connection.getLatestBlockhash("processed");
      this.cachedBlockhash = response.blockhash;
    } catch (error: unknown) {
      this.logger.debug(
        { error: error instanceof Error ? error.message : "unknown-error" },
        "Failed to prewarm latest blockhash cache."
      );
    } finally {
      this.scheduleBlockhashRefresh();
    }
  }

  private async buildJitoPayload(
    intent: TradeIntent,
    sellVariant: "primary" | "alternate" = "primary",
    forcePumpApi = false
  ) {
    if (this.useNativeJitoBuilder && !forcePumpApi) {
      try {
        const recentBlockhash = await this.fetchBlockhash();
        const built = await buildEntryTransaction({
          connection: this.connection,
          signerKeypair: this.signerKeypair!,
          recentBlockhash,
          intent,
          sellVariant
        });
        const encoded = Buffer.from(built.serialized).toString("base64");
        this.validateSerializedTransaction(encoded);
        return { encoded, debug: built.debug };
      } catch (error: unknown) {
        this.logger.warn(
          {
            tokenMint: intent.tokenMint,
            side: intent.side,
            error: error instanceof Error ? error.message : "native-builder-invalid-payload"
          },
          "Native builder payload invalid; falling back to PumpAPI unsigned build."
        );
      }
    }
    if (!this.pumpApiClient) {
      throw new Error("jito backend requires pumpapi tx builder when native builder is disabled");
    }
    const rawUnsigned = await this.withTimeout(
      this.pumpApiClient.buildUnsignedTransaction(intent, this.signerKeypair!.publicKey.toBase58()),
      this.requestTimeoutMs,
      "pumpapi-build-timeout"
    );
    const tx = VersionedTransaction.deserialize(new Uint8Array(rawUnsigned));
    tx.sign([this.signerKeypair!]);
    return { encoded: Buffer.from(tx.serialize()).toString("base64"), debug: undefined };
  }

  private validateSerializedTransaction(base64Tx: string) {
    const serialized = Buffer.from(base64Tx, "base64");
    if (serialized.length < 200) {
      throw new Error(`serialized transaction too small: ${serialized.length} bytes`);
    }
    VersionedTransaction.deserialize(new Uint8Array(serialized));
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorCode: string): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeout = setTimeout(() => reject(new Error(errorCode)), timeoutMs);
        })
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private async awaitSignatureConfirmation(signature: string): Promise<{ confirmed: boolean; reason: string }> {
    const started = Date.now();
    while (Date.now() - started < this.confirmTimeoutMs) {
      try {
        const status = await this.connection.getSignatureStatuses([signature]);
        const value = status.value[0];
        if (value?.confirmationStatus === "processed") {
          await new Promise<void>((resolve) => setTimeout(resolve, this.confirmPollMs));
          continue;
        }
        if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") {
          const tx = await this.connection.getTransaction(signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0
          });
          if (!tx) {
            await new Promise<void>((resolve) => setTimeout(resolve, this.confirmPollMs));
            continue;
          }
          if (tx.meta?.err == null) {
            return { confirmed: true, reason: "confirmed-no-program-error" };
          }
          return { confirmed: false, reason: `meta-err:${JSON.stringify(tx.meta.err)}` };
        }
        if (value?.err) {
          return { confirmed: false, reason: `status-err:${JSON.stringify(value.err)}` };
        }
      } catch {
        // Ignore transient RPC errors during confirmation polling.
      }
      await new Promise<void>((resolve) => setTimeout(resolve, this.confirmPollMs));
    }
    try {
      const tx = await this.connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0
      });
      if (!tx) {
        return { confirmed: false, reason: "timeout-before-confirmed-status" };
      }
      if (tx.meta?.err == null) {
        return { confirmed: true, reason: "confirmed-no-program-error-after-timeout" };
      }
      return { confirmed: false, reason: `meta-err:${JSON.stringify(tx.meta.err)}` };
    } catch {
      return { confirmed: false, reason: "get-transaction-fetch-failed" };
    }
  }

  private async sendViaRpc(base64Tx: string): Promise<ExecutionResult> {
    const started = Date.now();
    try {
      const serialized = Buffer.from(base64Tx, "base64");
      const signature = await this.connection.sendRawTransaction(serialized, {
        skipPreflight: true,
        maxRetries: 2,
        preflightCommitment: "processed"
      });
      return { ok: true, signature, latencyMs: Date.now() - started };
    } catch (error: unknown) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "rpc-send-failed",
        latencyMs: Date.now() - started
      };
    }
  }

  private async wasSellSettledByBalance(tokenMint: string): Promise<boolean> {
    if (!this.signerKeypair) {
      return false;
    }
    try {
      const mint = new PublicKey(tokenMint);
      const mintInfo = await this.connection.getAccountInfo(mint, "processed");
      if (!mintInfo) {
        return false;
      }
      const tokenProgram = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      const userAta = getAssociatedTokenAddressSync(
        mint,
        this.signerKeypair.publicKey,
        false,
        tokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const ataInfo = await this.connection.getAccountInfo(userAta, "processed");
      if (!ataInfo) {
        // ATA absent usually means no remaining token balance.
        return true;
      }
      const balance = await this.connection.getTokenAccountBalance(userAta, "processed");
      return BigInt(balance.value.amount) === 0n;
    } catch {
      return false;
    }
  }

  private async wasBuySettledByBalance(tokenMint: string): Promise<boolean> {
    if (!this.signerKeypair) {
      return false;
    }
    try {
      const mint = new PublicKey(tokenMint);
      const mintInfo = await this.connection.getAccountInfo(mint, "processed");
      if (!mintInfo) {
        return false;
      }
      const tokenProgram = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      const userAta = getAssociatedTokenAddressSync(
        mint,
        this.signerKeypair.publicKey,
        false,
        tokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const ataInfo = await this.connection.getAccountInfo(userAta, "processed");
      if (!ataInfo) {
        return false;
      }
      const balance = await this.connection.getTokenAccountBalance(userAta, "processed");
      return BigInt(balance.value.amount) > 0n;
    } catch {
      return false;
    }
  }
}
