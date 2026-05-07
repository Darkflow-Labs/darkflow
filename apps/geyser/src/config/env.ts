import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    GEYSER_ROLE: z.enum(["core", "edge"]).default("core"),
    GEYSER_PROGRAM_ID: z.string().min(1),
    GEYSER_UPSTREAM_ENDPOINT: z.string().min(1).optional(),
    GEYSER_UPSTREAM_X_TOKEN: z.string().min(1).optional(),
    GEYSER_REDIS_ADAPTER: z.enum(["redis", "upstash"]).default("redis"),
    GEYSER_REDIS_URL: z.string().min(1).optional(),
    GEYSER_UPSTASH_REDIS_REST_URL: z.string().min(1).optional(),
    GEYSER_UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    GEYSER_REDIS_LAUNCH_CHANNEL: z.string().min(1).default("df:launch:tick"),
    GEYSER_REDIS_PRICE_TICK_CHANNEL: z.string().min(1).default("df:price:tick"),
    GEYSER_WS_ENABLED: z.coerce.boolean().default(true),
    GEYSER_WS_HOST: z.string().min(1).default("127.0.0.1"),
    GEYSER_WS_PORT: z.coerce.number().int().min(1).max(65_535).default(8792),
    GEYSER_WS_MAX_CLIENTS: z.coerce.number().int().min(1).max(10_000).default(200),
    GEYSER_WS_AUTH_TOKEN: z.string().min(1).optional(),
    GEYSER_LOG_PRETTY: z.coerce.boolean().default(false)
  })
  .superRefine((data, ctx) => {
    if (data.GEYSER_ROLE === "core" && !data.GEYSER_UPSTREAM_ENDPOINT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GEYSER_UPSTREAM_ENDPOINT is required when GEYSER_ROLE is core",
        path: ["GEYSER_UPSTREAM_ENDPOINT"]
      });
    }
    if (data.GEYSER_REDIS_ADAPTER === "redis" && !data.GEYSER_REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GEYSER_REDIS_URL is required when GEYSER_REDIS_ADAPTER is redis",
        path: ["GEYSER_REDIS_URL"]
      });
    }
    if (data.GEYSER_REDIS_ADAPTER === "upstash") {
      if (!data.GEYSER_UPSTASH_REDIS_REST_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "GEYSER_UPSTASH_REDIS_REST_URL is required when GEYSER_REDIS_ADAPTER is upstash",
          path: ["GEYSER_UPSTASH_REDIS_REST_URL"]
        });
      }
      if (!data.GEYSER_UPSTASH_REDIS_REST_TOKEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "GEYSER_UPSTASH_REDIS_REST_TOKEN is required when GEYSER_REDIS_ADAPTER is upstash",
          path: ["GEYSER_UPSTASH_REDIS_REST_TOKEN"]
        });
      }
    }
  });

export type GeyserServiceEnv = z.infer<typeof envSchema>;

export const loadEnv = (): GeyserServiceEnv => envSchema.parse(process.env);
