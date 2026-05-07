import { defineConfig } from "drizzle-kit";

const url =
  process.env.SYNC_DATABASE_URL ??
  process.env.ZERO_UPSTREAM_DATABASE_URL ??
  "postgresql://localhost:5432/darkflow_sync";

export default defineConfig({
  schema: "./src/sync/schema.ts",
  out: "./drizzle/sync",
  dialect: "postgresql",
  dbCredentials: { url },
  casing: "snake_case"
});
