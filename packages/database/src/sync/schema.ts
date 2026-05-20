import {
  doublePrecision,
  index,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  varchar
} from "drizzle-orm/pg-core";

/** Postgres schema for Zero upstream / sync market data (separate DB from Prisma app). */
export const syncSchema = pgSchema("sync");

/**
 * Bucketed SOL spot price OHLC derived from ingest (Yellowstone/on-chain).
 * Composite PK avoids duplicate buckets per mint. Retention: prune rows older than 7d via job/SQL cron.
 */
export const priceBars = syncSchema.table(
  "price_bar",
  {
    mint: varchar("mint", { length: 64 }).notNull(),
    bucketStart: timestamp("bucket_start", { withTimezone: true, mode: "date" }).notNull(),
    bucketInterval: varchar("bucket_interval", { length: 16 }).notNull(),
    openSol: doublePrecision("open_sol").notNull(),
    highSol: doublePrecision("high_sol").notNull(),
    lowSol: doublePrecision("low_sol").notNull(),
    closeSol: doublePrecision("close_sol").notNull(),
    volumeSol: doublePrecision("volume_sol"),
    source: varchar("source", { length: 32 }).notNull().default("yellowstone-grpc"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
  },
  (t) => [
    primaryKey({ columns: [t.mint, t.bucketStart, t.bucketInterval] }),
    index("price_bar_mint_interval_start_idx").on(t.mint, t.bucketInterval, t.bucketStart),
    index("price_bar_bucket_start_idx").on(t.bucketStart)
  ]
);

/**
 * Narrow row for Zero-friendly “latest”; optional companion to bars.
 * Upsert one row per mint.
 */
export const priceLatest = syncSchema.table("price_latest", {
  mint: varchar("mint", { length: 64 }).primaryKey(),
  priceSol: doublePrecision("price_sol").notNull(),
  slot: text("slot"),
  source: varchar("source", { length: 32 }).notNull().default("yellowstone-grpc"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
});

/**
 * Raw tick history used for short retention replay/backfill and bar/metric recomputation.
 */
export const priceTicks = syncSchema.table(
  "price_tick",
  {
    mint: varchar("mint", { length: 64 }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }).notNull(),
    priceSol: doublePrecision("price_sol").notNull(),
    slot: text("slot"),
    source: varchar("source", { length: 32 }).notNull().default("yellowstone-grpc"),
    eventType: varchar("event_type", { length: 32 })
  },
  (t) => [
    primaryKey({ columns: [t.mint, t.receivedAt] }),
    index("price_tick_mint_received_idx").on(t.mint, t.receivedAt),
    index("price_tick_received_idx").on(t.receivedAt)
  ]
);

/**
 * Point-in-time liquidity metrics per mint/pool pair.
 */
export const liquiditySnapshots = syncSchema.table(
  "liquidity_snapshot",
  {
    mint: varchar("mint", { length: 64 }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" }).notNull(),
    poolAddress: varchar("pool_address", { length: 64 }).notNull(),
    liquiditySol: doublePrecision("liquidity_sol").notNull(),
    liquidityUsd: doublePrecision("liquidity_usd"),
    source: varchar("source", { length: 32 }).notNull().default("yellowstone-grpc")
  },
  (t) => [
    primaryKey({ columns: [t.mint, t.poolAddress, t.capturedAt] }),
    index("liquidity_snapshot_mint_captured_idx").on(t.mint, t.capturedAt),
    index("liquidity_snapshot_pool_captured_idx").on(t.poolAddress, t.capturedAt)
  ]
);

/**
 * Rolling token-level metrics used by screeners and charts.
 */
export const tokenMetrics = syncSchema.table("token_metrics", {
  mint: varchar("mint", { length: 64 }).primaryKey(),
  priceChange1mBps: doublePrecision("price_change_1m_bps"),
  priceChange5mBps: doublePrecision("price_change_5m_bps"),
  priceChange1hBps: doublePrecision("price_change_1h_bps"),
  priceChange24hBps: doublePrecision("price_change_24h_bps"),
  volume1mSol: doublePrecision("volume_1m_sol"),
  volume5mSol: doublePrecision("volume_5m_sol"),
  volume1hSol: doublePrecision("volume_1h_sol"),
  volatility1hBps: doublePrecision("volatility_1h_bps"),
  momentum5mBps: doublePrecision("momentum_5m_bps"),
  source: varchar("source", { length: 32 }).notNull().default("derived"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
});

/**
 * Durable trade-level event log for analytics/alerts.
 */
export const tradeEvents = syncSchema.table(
  "trade_event",
  {
    mint: varchar("mint", { length: 64 }).notNull(),
    txSignature: varchar("tx_signature", { length: 128 }).notNull(),
    eventAt: timestamp("event_at", { withTimezone: true, mode: "date" }).notNull(),
    side: varchar("side", { length: 8 }).notNull(),
    sizeToken: doublePrecision("size_token"),
    sizeSol: doublePrecision("size_sol"),
    priceSol: doublePrecision("price_sol").notNull(),
    source: varchar("source", { length: 32 }).notNull().default("yellowstone-grpc")
  },
  (t) => [
    primaryKey({ columns: [t.txSignature, t.eventAt] }),
    index("trade_event_mint_event_idx").on(t.mint, t.eventAt),
    index("trade_event_event_idx").on(t.eventAt)
  ]
);

export type PriceBarRow = typeof priceBars.$inferSelect;
export type PriceBarInsert = typeof priceBars.$inferInsert;
export type PriceLatestRow = typeof priceLatest.$inferSelect;
export type PriceLatestInsert = typeof priceLatest.$inferInsert;
export type PriceTickRow = typeof priceTicks.$inferSelect;
export type PriceTickInsert = typeof priceTicks.$inferInsert;
export type LiquiditySnapshotRow = typeof liquiditySnapshots.$inferSelect;
export type LiquiditySnapshotInsert = typeof liquiditySnapshots.$inferInsert;
export type TokenMetricsRow = typeof tokenMetrics.$inferSelect;
export type TokenMetricsInsert = typeof tokenMetrics.$inferInsert;
export type TradeEventRow = typeof tradeEvents.$inferSelect;
export type TradeEventInsert = typeof tradeEvents.$inferInsert;
