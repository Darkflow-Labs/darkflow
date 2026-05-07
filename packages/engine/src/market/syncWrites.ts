import { getOrCreateSyncDb, type SyncDb } from "@darkflow/db/sync";
import {
  upsertPriceBarBucket,
  upsertPriceLatest,
  type PriceTickSnapshot
} from "@darkflow/sync/writers";
import { createPriceCacheFromEnv, type PriceCachePort } from "@darkflow/sync/redis";

export type EnginePriceTick = {
  mint: string;
  priceSol: number;
  receivedAtMs: number;
  source: string;
  slot?: string | null;
};

export type MarketSyncWriterOptions = {
  /** Defaults to `process.env.SYNC_DATABASE_URL ?? process.env.ZERO_UPSTREAM_DATABASE_URL`. */
  syncDatabaseUrl?: string | undefined;
  cache?: PriceCachePort | undefined;
  /** OHLC bucket width (ms). */
  barBucketMs?: number;
  /** Minimum time between bar upserts per mint. */
  throttleBarMs?: number;
};

/**
 * Throttled writers to the Zero upstream DB + optional Upstash last-price cache.
 * No-ops when neither Postgres nor Redis is configured.
 */
export const createMarketSyncWriter = (opts: MarketSyncWriterOptions = {}) => {
  const url =
    opts.syncDatabaseUrl ??
    process.env.SYNC_DATABASE_URL ??
    process.env.ZERO_UPSTREAM_DATABASE_URL;
  const cache = opts.cache ?? createPriceCacheFromEnv();
  const barBucketMs = opts.barBucketMs ?? 500;
  const throttleBarMs = opts.throttleBarMs ?? 450;

  let db: SyncDb | undefined;
  const getDb = (): SyncDb | undefined => {
    if (!url) {
      return undefined;
    }
    if (!db) {
      db = getOrCreateSyncDb(url).db;
    }
    return db;
  };

  const lastBarWriteByMint = new Map<string, number>();

  const toSnapshot = (tick: EnginePriceTick): PriceTickSnapshot => ({
    mint: tick.mint,
    priceSol: tick.priceSol,
    receivedAtMs: tick.receivedAtMs,
    source: tick.source,
    slot: tick.slot ?? null
  });

  return {
    flushPriceTick: async (tick: EnginePriceTick): Promise<void> => {
      const drizzle = getDb();
      const snapshot = toSnapshot(tick);
      if (!drizzle && !cache) {
        return;
      }
      const tasks: Promise<unknown>[] = [];
      if (drizzle) {
        tasks.push(upsertPriceLatest(drizzle, snapshot));
      }
      if (cache) {
        tasks.push(
          cache.setLastPrice(tick.mint, {
            priceSol: tick.priceSol,
            slot: tick.slot ?? undefined,
            source: tick.source,
            updatedAt: tick.receivedAtMs
          })
        );
      }
      await Promise.allSettled(tasks);

      if (!drizzle) {
        return;
      }
      const now = tick.receivedAtMs;
      const last = lastBarWriteByMint.get(tick.mint) ?? 0;
      if (now - last < throttleBarMs) {
        return;
      }
      lastBarWriteByMint.set(tick.mint, now);
      await upsertPriceBarBucket(drizzle, snapshot, { bucketMs: barBucketMs }).catch(() => undefined);
    }
  };
};
