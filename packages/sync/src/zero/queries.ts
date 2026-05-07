import { defineQueries, defineQuery } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "./schema";

const mintValidator = z.object({
  mint: z.string().min(32).max(64),
  limit: z.number().int().positive().max(800).optional()
});

export const queries = defineQueries({
  prices: {
    barsByMint: defineQuery(mintValidator, ({ args: { mint, limit } }) => {
      const lim = limit ?? 400;
      return zql.price_bar.where("mint", mint).orderBy("bucketStart", "desc").limit(lim);
    }),
    recentBars: defineQuery(
      z.object({
        limit: z.number().int().positive().max(1200).optional()
      }),
      ({ args: { limit } }) => zql.price_bar.orderBy("bucketStart", "desc").limit(limit ?? 500)
    ),
    latestByMint: defineQuery(
      z.object({ mint: z.string().min(32).max(64) }),
      ({ args: { mint } }) => zql.price_latest.where("mint", mint).one()
    ),
    allLatest: defineQuery(z.object({}), () => zql.price_latest.limit(250))
  }
});
