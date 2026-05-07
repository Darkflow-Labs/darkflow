import { Pool } from "pg";

const SOL_MINT = "So11111111111111111111111111111111111111112";

let poolRef: Pool | undefined;

const getPool = () => {
  if (poolRef) {
    return poolRef;
  }
  const url = process.env.SYNC_DATABASE_URL ?? process.env.ZERO_UPSTREAM_DATABASE_URL;
  if (!url) {
    throw new Error("SYNC_DATABASE_URL or ZERO_UPSTREAM_DATABASE_URL must be set");
  }
  poolRef = new Pool({ connectionString: url });
  return poolRef;
};

export const getLatestSolSyncPrice = async (): Promise<number | null> => {
  const pool = getPool();
  const res = await pool.query<{ price_sol: number }>(
    `select price_sol
     from sync.price_latest
     where mint = $1
     order by updated_at desc
     limit 1`,
    [SOL_MINT],
  );
  const price = res.rows[0]?.price_sol;
  return typeof price === "number" && Number.isFinite(price) && price > 0 ? price : null;
};
