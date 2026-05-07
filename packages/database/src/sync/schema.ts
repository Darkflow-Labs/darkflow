import {
  doublePrecision,
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
  (t) => [primaryKey({ columns: [t.mint, t.bucketStart, t.bucketInterval] })]
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

export type PriceBarRow = typeof priceBars.$inferSelect;
export type PriceBarInsert = typeof priceBars.$inferInsert;
export type PriceLatestRow = typeof priceLatest.$inferSelect;
export type PriceLatestInsert = typeof priceLatest.$inferInsert;
