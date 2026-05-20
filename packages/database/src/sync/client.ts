import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  liquiditySnapshots,
  priceBars,
  priceLatest,
  priceTicks,
  tokenMetrics,
  tradeEvents
} from "./schema.js";

const syncTables = { priceBars, priceLatest, priceTicks, liquiditySnapshots, tokenMetrics, tradeEvents };

export type SyncDb = NodePgDatabase<typeof syncTables>;

let poolRef: Pool | undefined;

/**
 * Node pg pool for the **sync / Zero upstream** database only.
 * Use `SYNC_DATABASE_URL` (or `ZERO_UPSTREAM_DATABASE_URL`).
 */
export const createSyncDb = (connectionString: string): { db: SyncDb; pool: Pool } => {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema: syncTables });
  return { db, pool };
};

/**
 * Singleton pool for long-lived processes (Onyx). Call `closeSyncDb` on shutdown.
 */
export const getOrCreateSyncDb = (connectionString: string): { db: SyncDb; pool: Pool } => {
  if (!poolRef) {
    poolRef = new Pool({ connectionString });
  }
  const db = drizzle(poolRef, { schema: syncTables });
  return { db, pool: poolRef };
};

export const closeSyncDb = async () => {
  if (poolRef) {
    await poolRef.end();
    poolRef = undefined;
  }
};

export const loadSyncDatabaseUrl = (): string => {
  const url = process.env.SYNC_DATABASE_URL ?? process.env.ZERO_UPSTREAM_DATABASE_URL;
  if (!url) {
    throw new Error("SYNC_DATABASE_URL or ZERO_UPSTREAM_DATABASE_URL is required for sync DB");
  }
  return url;
};
