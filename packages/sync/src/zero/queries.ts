import { defineQueries, defineQuery } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "./schema";

const mintValidator = z.object({
  mint: z.string().min(32).max(64),
  limit: z.number().int().positive().max(800).optional()
});

export const queries = defineQueries({
  prices: {
    barsByMint: defineQuery(
      mintValidator.extend({
        interval: z.enum(["1s", "5s", "1m", "5m", "1h"]).optional()
      }),
      ({ args: { mint, limit, interval } }) => {
        const lim = limit ?? 400;
        const base = zql.price_bar.where("mint", mint);
        const scoped = interval ? base.where("bucketInterval", interval) : base;
        return scoped.orderBy("bucketStart", "desc").limit(lim);
      }
    ),
    ticksByMint: defineQuery(mintValidator, ({ args: { mint, limit } }) => {
      const lim = limit ?? 400;
      return zql.price_tick.where("mint", mint).orderBy("receivedAt", "desc").limit(lim);
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
    allLatest: defineQuery(z.object({}), () => zql.price_latest.limit(250)),
    metricsByMint: defineQuery(
      z.object({ mint: z.string().min(32).max(64) }),
      ({ args: { mint } }) => zql.token_metrics.where("mint", mint).one()
    ),
    recentLiquidityByMint: defineQuery(
      mintValidator,
      ({ args: { mint, limit } }) =>
        zql.liquidity_snapshot.where("mint", mint).orderBy("capturedAt", "desc").limit(limit ?? 200)
    ),
    recentTradesByMint: defineQuery(
      mintValidator,
      ({ args: { mint, limit } }) =>
        zql.trade_event.where("mint", mint).orderBy("eventAt", "desc").limit(limit ?? 300)
    )
  }
});
