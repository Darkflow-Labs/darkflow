/**
 * Rocicorp Zero logical schema mirrored to Drizzle tables under Postgres schema `sync.*`.
 */
import { createBuilder, createSchema, number, string, table } from "@rocicorp/zero";

const price_bar = table("price_bar")
  .from("sync.price_bar")
  .columns({
    mint: string(),
    bucketStart: number().from("bucket_start"),
    bucketInterval: string().from("bucket_interval"),
    openSol: number().from("open_sol"),
    highSol: number().from("high_sol"),
    lowSol: number().from("low_sol"),
    closeSol: number().from("close_sol"),
    volumeSol: number().optional().from("volume_sol"),
    source: string(),
    createdAt: number().from("created_at")
  })
  .primaryKey("mint", "bucketStart", "bucketInterval");

const price_latest = table("price_latest")
  .from("sync.price_latest")
  .columns({
    mint: string(),
    priceSol: number().from("price_sol"),
    slot: string().optional(),
    source: string(),
    updatedAt: number().from("updated_at")
  })
  .primaryKey("mint");

export const schema = createSchema({
  tables: [price_bar, price_latest]
});

export const zql = createBuilder(schema);

export type SyncZeroSchema = typeof schema;

