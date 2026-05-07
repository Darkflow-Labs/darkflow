import { PublicKey, type Connection } from "@solana/web3.js";
import type { Logger } from "pino";
import { parsePriceData } from "@pythnetwork/client";

export const SOL_MINT = "So11111111111111111111111111111111111111112";

// Pyth SOL/USD price account (mainnet) — from Solana program-examples docs.
export const DEFAULT_PYTH_SOL_USD_PRICE_ACCOUNT =
  "H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG";

export const fetchPythSolUsd = async (input: {
  connection: Connection;
  priceAccount: string;
}): Promise<number | null> => {
  const pubkey = new PublicKey(input.priceAccount);
  const info = await input.connection.getAccountInfo(pubkey, "processed");
  const data = info?.data;
  if (!data) {
    return null;
  }
  const parsed = parsePriceData(data);
  const price = parsed.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return null;
  }
  return price;
};

export const startPythSolUsdFeed = (input: {
  enabled: boolean;
  intervalMs: number;
  priceAccount: string;
  connection: Connection;
  logger: Logger;
  publish: (tick: { tokenMint: string; priceSol: number; receivedAt: number; source: string }) => void;
  persist: (tick: { mint: string; priceSol: number; receivedAtMs: number; source: string }) => Promise<void>;
}) => {
  if (!input.enabled) {
    return { stop: () => void 0 };
  }

  let timer: NodeJS.Timeout | undefined;
  let inflight = false;

  const pollOnce = async () => {
    if (inflight) {
      return;
    }
    inflight = true;
    try {
      const usd = await fetchPythSolUsd({
        connection: input.connection,
        priceAccount: input.priceAccount,
      });
      if (usd === null) {
        return;
      }
      const now = Date.now();
      input.publish({
        tokenMint: SOL_MINT,
        priceSol: usd,
        receivedAt: now,
        source: "pyth-sol-usd",
      });
      await input.persist({
        mint: SOL_MINT,
        priceSol: usd,
        receivedAtMs: now,
        source: "pyth-sol-usd",
      });
    } catch (err: unknown) {
      input.logger.debug({ err }, "Pyth SOL/USD poll failed");
    } finally {
      inflight = false;
    }
  };

  void pollOnce();
  timer = setInterval(() => void pollOnce(), input.intervalMs);

  return {
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
};

