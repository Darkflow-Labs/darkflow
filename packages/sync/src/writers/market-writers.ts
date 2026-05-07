import { and, eq, lt, sql } from "drizzle-orm";
import { priceBars, priceLatest, type SyncDb } from "@darkflow/db/sync";

export type PriceTickSnapshot = {
  mint: string;
  priceSol: number;
  slot?: string | null;
  source?: string;
  receivedAtMs: number;
};

const DEFAULT_INTERVAL = "500ms";

const bucketFloor = (receivedAtMs: number, bucketMs: number) =>
  Math.floor(receivedAtMs / bucketMs) * bucketMs;

/**
 * Upsert rolling OHLC bucket in `sync.price_bar` (throttle caller externally).
 */
export const upsertPriceBarBucket = async (
  db: SyncDb,
  tick: PriceTickSnapshot,
  opts?: { bucketMs?: number; intervalLabel?: string }
) => {
  const bucketMs = opts?.bucketMs ?? 500;
  const bucketStartMs = bucketFloor(tick.receivedAtMs, bucketMs);
  const bucketInterval = opts?.intervalLabel ?? DEFAULT_INTERVAL;
  const bucketStart = new Date(bucketStartMs);

  const source = tick.source ?? "yellowstone-grpc";

  // Single-statement upsert avoids race conditions across processes.
  await db
    .insert(priceBars)
    .values({
      mint: tick.mint,
      bucketStart,
      bucketInterval,
      openSol: tick.priceSol,
      highSol: tick.priceSol,
      lowSol: tick.priceSol,
      closeSol: tick.priceSol,
      volumeSol: null,
      source
    })
    .onConflictDoUpdate({
      target: [priceBars.mint, priceBars.bucketStart, priceBars.bucketInterval],
      set: {
        highSol: sql`greatest(${priceBars.highSol}, excluded.high_sol)`,
        lowSol: sql`least(${priceBars.lowSol}, excluded.low_sol)`,
        closeSol: sql`excluded.close_sol`,
        source
      }
    });
};

export const upsertPriceLatest = async (db: SyncDb, tick: PriceTickSnapshot) => {
  const source = tick.source ?? "yellowstone-grpc";
  await db
    .insert(priceLatest)
    .values({
      mint: tick.mint,
      priceSol: tick.priceSol,
      slot: tick.slot ?? null,
      source,
      updatedAt: new Date(tick.receivedAtMs)
    })
    .onConflictDoUpdate({
      target: priceLatest.mint,
      set: {
        priceSol: tick.priceSol,
        slot: tick.slot ?? null,
        source,
        updatedAt: new Date(tick.receivedAtMs)
      }
    });
};

/** Remove bars older than `retentionDays` (default 7). */
export const prunePriceBarsOlderThan = async (
  db: SyncDb,
  retentionDays: number = 7
) => {
  const cutoff = new Date(Date.now() - retentionDays * 86400_000);
  await db.delete(priceBars).where(lt(priceBars.bucketStart, cutoff));
};
