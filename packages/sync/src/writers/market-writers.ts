import { desc, gte, lt, sql } from "drizzle-orm";
import {
  liquiditySnapshots,
  priceBars,
  priceLatest,
  priceTicks,
  tokenMetrics,
  tradeEvents,
  type SyncDb
} from "@darkflow/db/sync";

export type PriceTickSnapshot = {
  mint: string;
  priceSol: number;
  slot?: string | null;
  source?: string;
  eventType?: string;
  receivedAtMs: number;
};

export type PriceBarInterval = "1s" | "5s" | "1m" | "5m" | "1h";

const BAR_INTERVALS: ReadonlyArray<{ label: PriceBarInterval; bucketMs: number }> = [
  { label: "1s", bucketMs: 1_000 },
  { label: "5s", bucketMs: 5_000 },
  { label: "1m", bucketMs: 60_000 },
  { label: "5m", bucketMs: 300_000 },
  { label: "1h", bucketMs: 3_600_000 }
];

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
  const bucketInterval = opts?.intervalLabel ?? "1s";
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

/** Insert one raw price tick into `sync.price_tick`. */
export const insertPriceTick = async (db: SyncDb, tick: PriceTickSnapshot) => {
  const source = tick.source ?? "yellowstone-grpc";
  await db.insert(priceTicks).values({
    mint: tick.mint,
    receivedAt: new Date(tick.receivedAtMs),
    priceSol: tick.priceSol,
    slot: tick.slot ?? null,
    source,
    eventType: tick.eventType
  });
};

/** Upsert bars across all target intervals for one tick. */
export const upsertPriceBars = async (
  db: SyncDb,
  tick: PriceTickSnapshot,
  intervals: ReadonlyArray<{ label: PriceBarInterval; bucketMs: number }> = BAR_INTERVALS
) => {
  for (const interval of intervals) {
    await upsertPriceBarBucket(db, tick, { bucketMs: interval.bucketMs, intervalLabel: interval.label });
  }
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

export type LiquiditySnapshotInput = {
  mint: string;
  poolAddress: string;
  capturedAtMs: number;
  liquiditySol: number;
  liquidityUsd?: number;
  source?: string;
};

export const insertLiquiditySnapshot = async (db: SyncDb, input: LiquiditySnapshotInput) => {
  await db.insert(liquiditySnapshots).values({
    mint: input.mint,
    poolAddress: input.poolAddress,
    capturedAt: new Date(input.capturedAtMs),
    liquiditySol: input.liquiditySol,
    liquidityUsd: input.liquidityUsd ?? null,
    source: input.source ?? "yellowstone-grpc"
  });
};

export type TradeEventInput = {
  mint: string;
  txSignature: string;
  eventAtMs: number;
  side: "buy" | "sell" | "unknown";
  sizeToken?: number;
  sizeSol?: number;
  priceSol: number;
  source?: string;
};

export const insertTradeEvent = async (db: SyncDb, input: TradeEventInput) => {
  await db.insert(tradeEvents).values({
    mint: input.mint,
    txSignature: input.txSignature,
    eventAt: new Date(input.eventAtMs),
    side: input.side,
    sizeToken: input.sizeToken ?? null,
    sizeSol: input.sizeSol ?? null,
    priceSol: input.priceSol,
    source: input.source ?? "yellowstone-grpc"
  });
};

const bpsFrom = (current: number, previous: number): number | null => {
  if (!Number.isFinite(previous) || previous <= 0) {
    return null;
  }
  return ((current - previous) / previous) * 10_000;
};

/** Lightweight rolling metrics using recent tick windows. */
export const upsertTokenMetrics = async (db: SyncDb, tick: PriceTickSnapshot) => {
  const now = new Date(tick.receivedAtMs);
  const w1m = new Date(tick.receivedAtMs - 60_000);
  const w5m = new Date(tick.receivedAtMs - 300_000);
  const w1h = new Date(tick.receivedAtMs - 3_600_000);
  const w24h = new Date(tick.receivedAtMs - 86_400_000);

  const [p1m, p5m, p1h, p24h] = await Promise.all([
    db
      .select({ priceSol: priceTicks.priceSol })
      .from(priceTicks)
      .where(gte(priceTicks.receivedAt, w1m))
      .orderBy(priceTicks.receivedAt)
      .limit(1),
    db
      .select({ priceSol: priceTicks.priceSol })
      .from(priceTicks)
      .where(gte(priceTicks.receivedAt, w5m))
      .orderBy(priceTicks.receivedAt)
      .limit(1),
    db
      .select({ priceSol: priceTicks.priceSol })
      .from(priceTicks)
      .where(gte(priceTicks.receivedAt, w1h))
      .orderBy(priceTicks.receivedAt)
      .limit(1),
    db
      .select({ priceSol: priceTicks.priceSol })
      .from(priceTicks)
      .where(gte(priceTicks.receivedAt, w24h))
      .orderBy(priceTicks.receivedAt)
      .limit(1)
  ]);

  const [vol1m, vol5m, vol1h] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(priceTicks)
      .where(gte(priceTicks.receivedAt, w1m)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(priceTicks)
      .where(gte(priceTicks.receivedAt, w5m)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(priceTicks)
      .where(gte(priceTicks.receivedAt, w1h))
  ]);

  await db
    .insert(tokenMetrics)
    .values({
      mint: tick.mint,
      priceChange1mBps: bpsFrom(tick.priceSol, p1m[0]?.priceSol ?? Number.NaN),
      priceChange5mBps: bpsFrom(tick.priceSol, p5m[0]?.priceSol ?? Number.NaN),
      priceChange1hBps: bpsFrom(tick.priceSol, p1h[0]?.priceSol ?? Number.NaN),
      priceChange24hBps: bpsFrom(tick.priceSol, p24h[0]?.priceSol ?? Number.NaN),
      volume1mSol: Number(vol1m[0]?.count ?? 0),
      volume5mSol: Number(vol5m[0]?.count ?? 0),
      volume1hSol: Number(vol1h[0]?.count ?? 0),
      momentum5mBps: bpsFrom(tick.priceSol, p5m[0]?.priceSol ?? Number.NaN),
      source: "derived",
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: tokenMetrics.mint,
      set: {
        priceChange1mBps: bpsFrom(tick.priceSol, p1m[0]?.priceSol ?? Number.NaN),
        priceChange5mBps: bpsFrom(tick.priceSol, p5m[0]?.priceSol ?? Number.NaN),
        priceChange1hBps: bpsFrom(tick.priceSol, p1h[0]?.priceSol ?? Number.NaN),
        priceChange24hBps: bpsFrom(tick.priceSol, p24h[0]?.priceSol ?? Number.NaN),
        volume1mSol: Number(vol1m[0]?.count ?? 0),
        volume5mSol: Number(vol5m[0]?.count ?? 0),
        volume1hSol: Number(vol1h[0]?.count ?? 0),
        momentum5mBps: bpsFrom(tick.priceSol, p5m[0]?.priceSol ?? Number.NaN),
        source: "derived",
        updatedAt: now
      }
    });
};

export const persistMarketTick = async (db: SyncDb, tick: PriceTickSnapshot) => {
  await insertPriceTick(db, tick);
  await upsertPriceLatest(db, tick);
  await upsertPriceBars(db, tick);
  await upsertTokenMetrics(db, tick);
};

/** Remove ticks older than `retentionDays` (default 3). */
export const prunePriceTicksOlderThan = async (db: SyncDb, retentionDays: number = 3) => {
  const cutoff = new Date(Date.now() - retentionDays * 86400_000);
  await db.delete(priceTicks).where(lt(priceTicks.receivedAt, cutoff));
};

/** Remove bars older than `retentionDays` (default 7). */
export const prunePriceBarsOlderThan = async (
  db: SyncDb,
  retentionDays: number = 7
) => {
  const cutoff = new Date(Date.now() - retentionDays * 86400_000);
  await db.delete(priceBars).where(lt(priceBars.bucketStart, cutoff));
};

export const pruneTradeEventsOlderThan = async (db: SyncDb, retentionDays: number = 30) => {
  const cutoff = new Date(Date.now() - retentionDays * 86400_000);
  await db.delete(tradeEvents).where(lt(tradeEvents.eventAt, cutoff));
};

export const pruneLiquiditySnapshotsOlderThan = async (db: SyncDb, retentionDays: number = 30) => {
  const cutoff = new Date(Date.now() - retentionDays * 86400_000);
  await db.delete(liquiditySnapshots).where(lt(liquiditySnapshots.capturedAt, cutoff));
};
