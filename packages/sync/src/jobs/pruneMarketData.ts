import { closeSyncDb, getOrCreateSyncDb, loadSyncDatabaseUrl } from "@darkflow/db/sync";
import {
  pruneLiquiditySnapshotsOlderThan,
  prunePriceBarsOlderThan,
  prunePriceTicksOlderThan,
  pruneTradeEventsOlderThan
} from "../writers/market-writers.js";

const intFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const run = async () => {
  const syncDbUrl = loadSyncDatabaseUrl();
  const { db } = getOrCreateSyncDb(syncDbUrl);

  const tickRetentionDays = intFromEnv("SYNC_PRICE_TICK_RETENTION_DAYS", 3);
  const barRetentionDays = intFromEnv("SYNC_PRICE_BAR_RETENTION_DAYS", 30);
  const tradeRetentionDays = intFromEnv("SYNC_TRADE_EVENT_RETENTION_DAYS", 30);
  const liquidityRetentionDays = intFromEnv("SYNC_LIQUIDITY_RETENTION_DAYS", 30);

  await prunePriceTicksOlderThan(db, tickRetentionDays);
  await prunePriceBarsOlderThan(db, barRetentionDays);
  await pruneTradeEventsOlderThan(db, tradeRetentionDays);
  await pruneLiquiditySnapshotsOlderThan(db, liquidityRetentionDays);
};

void run()
  .catch((error) => {
    console.error("Market data prune failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSyncDb();
  });
