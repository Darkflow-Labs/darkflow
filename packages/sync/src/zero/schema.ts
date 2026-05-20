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

const price_tick = table("price_tick")
  .from("sync.price_tick")
  .columns({
    mint: string(),
    receivedAt: number().from("received_at"),
    priceSol: number().from("price_sol"),
    slot: string().optional(),
    source: string(),
    eventType: string().optional().from("event_type")
  })
  .primaryKey("mint", "receivedAt");

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

const token_metrics = table("token_metrics")
  .from("sync.token_metrics")
  .columns({
    mint: string(),
    priceChange1mBps: number().optional().from("price_change_1m_bps"),
    priceChange5mBps: number().optional().from("price_change_5m_bps"),
    priceChange1hBps: number().optional().from("price_change_1h_bps"),
    priceChange24hBps: number().optional().from("price_change_24h_bps"),
    volume1mSol: number().optional().from("volume_1m_sol"),
    volume5mSol: number().optional().from("volume_5m_sol"),
    volume1hSol: number().optional().from("volume_1h_sol"),
    volatility1hBps: number().optional().from("volatility_1h_bps"),
    momentum5mBps: number().optional().from("momentum_5m_bps"),
    source: string(),
    updatedAt: number().from("updated_at")
  })
  .primaryKey("mint");

const liquidity_snapshot = table("liquidity_snapshot")
  .from("sync.liquidity_snapshot")
  .columns({
    mint: string(),
    capturedAt: number().from("captured_at"),
    poolAddress: string().from("pool_address"),
    liquiditySol: number().from("liquidity_sol"),
    liquidityUsd: number().optional().from("liquidity_usd"),
    source: string()
  })
  .primaryKey("mint", "poolAddress", "capturedAt");

const trade_event = table("trade_event")
  .from("sync.trade_event")
  .columns({
    mint: string(),
    txSignature: string().from("tx_signature"),
    eventAt: number().from("event_at"),
    side: string(),
    sizeToken: number().optional().from("size_token"),
    sizeSol: number().optional().from("size_sol"),
    priceSol: number().from("price_sol"),
    source: string()
  })
  .primaryKey("txSignature", "eventAt");

export const schema = createSchema({
  tables: [price_bar, price_latest, price_tick, token_metrics, liquidity_snapshot, trade_event]
});

export const zql = createBuilder(schema);

export type SyncZeroSchema = typeof schema;

