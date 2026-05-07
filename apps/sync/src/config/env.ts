import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  SYNC_WS_HOST: z.string().min(1).default("127.0.0.1"),
  SYNC_WS_PORT: z.coerce.number().int().min(1).max(65_535).default(8791),
  SYNC_WS_MAX_CLIENTS: z.coerce.number().int().min(1).max(10_000).default(200),
  /** Unkey root key — same style as Onyx launch stream */
  SYNC_UNKEY_VERIFY_ROOT_KEY: z.string().min(1),
  /** Optional: require `meta.purpose` on API keys */
  SYNC_REQUIRE_META_PURPOSE: z.string().min(1).optional(),
  /** Pub/sub backend adapter for incoming ticks from Onyx. */
  REDIS_PUBSUB_ADAPTER: z.enum(["redis", "upstash"]).default("redis"),
  /** TCP Redis URL (must match Onyx `REDIS_PUBSUB_URL` for tick publish). */
  REDIS_URL: z.string().min(1).optional(),
  /** Upstash REST URL used when `REDIS_PUBSUB_ADAPTER=upstash`. */
  UPSTASH_REDIS_REST_URL: z.string().min(1).optional(),
  /** Upstash REST token used when `REDIS_PUBSUB_ADAPTER=upstash`. */
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  REDIS_PRICE_TICK_CHANNEL: z.string().min(1).default("df:price:tick"),
  SYNC_LOG_PRETTY: z.coerce.boolean().optional().default(false)
}).superRefine((data, ctx) => {
  if (data.REDIS_PUBSUB_ADAPTER === "redis" && !data.REDIS_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "REDIS_URL is required when REDIS_PUBSUB_ADAPTER is redis",
      path: ["REDIS_URL"]
    });
  }
  if (data.REDIS_PUBSUB_ADAPTER === "upstash") {
    if (!data.UPSTASH_REDIS_REST_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "UPSTASH_REDIS_REST_URL is required when REDIS_PUBSUB_ADAPTER is upstash",
        path: ["UPSTASH_REDIS_REST_URL"]
      });
    }
    if (!data.UPSTASH_REDIS_REST_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "UPSTASH_REDIS_REST_TOKEN is required when REDIS_PUBSUB_ADAPTER is upstash",
        path: ["UPSTASH_REDIS_REST_TOKEN"]
      });
    }
  }
});

export type SyncServiceEnv = z.infer<typeof envSchema>;

export const loadEnv = (): SyncServiceEnv => envSchema.parse(process.env);
