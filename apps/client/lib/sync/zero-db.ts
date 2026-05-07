import { createZeroDbProvider } from "@darkflow/sync/db-provider";

let singleton: ReturnType<typeof createZeroDbProvider> | undefined;

/** Shared Postgres+Drizzle pool for Zero mutate handler (Node runtime route only). */
export const getSyncZeroDbProvider = () => {
  if (singleton) {
    return singleton;
  }
  const url = process.env.SYNC_DATABASE_URL ?? process.env.ZERO_UPSTREAM_DATABASE_URL;
  if (!url) {
    throw new Error("SYNC_DATABASE_URL or ZERO_UPSTREAM_DATABASE_URL must be set for Zero mutate");
  }
  singleton = createZeroDbProvider(url);
  return singleton;
};
