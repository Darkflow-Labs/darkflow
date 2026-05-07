import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";
import { priceBars, priceLatest } from "@darkflow/db/sync";
import { schema } from "../zero/schema";

const syncDrizzleSchema = { priceBars, priceLatest };

export type SyncDrizzleDb = NodePgDatabase<typeof syncDrizzleSchema>;

export const createZeroDbProvider = (connectionString: string) => {
  const pool = new Pool({ connectionString });
  const drizzleDb = drizzle(pool, { schema: syncDrizzleSchema });
  const dbProvider = zeroDrizzle(schema, drizzleDb);
  return { dbProvider, pool, drizzleDb };
};
