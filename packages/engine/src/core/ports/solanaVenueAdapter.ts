import type { Keypair } from "@solana/web3.js";
import type { TradeIntent } from "../types/domain.js";

/**
 * Minimal port for a Solana execution venue (e.g. pump.fun native build vs future Jupiter).
 * Implementations live under `solana/adapters/*`.
 */
export type SolanaVenueTxBuildContext = {
  connectionRpcHttpUrl: string;
  signerKeypair: Keypair;
  recentBlockhash: string;
};

export type SolanaVenueAdapter = {
  readonly id: string;
  buildEntryTransaction(
    input: SolanaVenueTxBuildContext & {
      intent: TradeIntent;
      sellVariant?: "primary" | "alternate";
    }
  ): Promise<{
    serialized: Uint8Array;
    signature?: string;
    debug?: { side: TradeIntent["side"]; sell?: unknown };
  }>;
};
