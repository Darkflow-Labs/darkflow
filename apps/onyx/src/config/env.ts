import "dotenv/config";
import { z } from "zod";

const envBool = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }
  return value;
}, z.boolean());

const envSchema = z.object({
  ONYX_MODE: z.enum(["live", "paper"]).default("live"),
  ONYX_RPC_HTTP_URL: z.string().url(),
  ONYX_RPC_WS_URL: z.string().url(),
  /** When true, use Yellowstone gRPC (Geyser) for launch signals. */
  ONYX_GRPC_ENABLED: envBool.default(false),
  ONYX_GRPC_ENDPOINT: z.string().min(1).optional(),
  ONYX_GRPC_X_TOKEN: z.string().min(1).optional(),
  /** Prefer internal Darkflow geyser node before external provider endpoint when set. */
  ONYX_INTERNAL_GEYSER_ENDPOINT: z.string().min(1).optional(),
  ONYX_INTERNAL_GEYSER_X_TOKEN: z.string().min(1).optional(),
  ONYX_PRIMARY_PRICE_SOURCE: z.enum(["drpc", "pumpapi", "grpc"]).default("pumpapi"),
  ONYX_PUMP_API_STREAM_URL: z.string().url().default("wss://stream.pumpapi.io/"),
  ONYX_JITO_TX_URL: z.string().url().optional(),
  ONYX_JITO_TX_FALLBACK_URL: z.string().url().optional(),
  ONYX_JITO_AUTH_KEY: z.string().min(1).optional(),
  ONYX_JITO_BUNDLE_ONLY: envBool.default(true),
  ONYX_EXECUTION_BACKEND: z.enum(["jito", "pumpapi"]).default("jito"),
  ONYX_PUMP_API_TRADE_URL: z.string().url().optional(),
  ONYX_MAX_EXECUTION_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  ONYX_JITO_MIN_SUBMIT_INTERVAL_MS: z.coerce.number().int().min(500).default(1200),
  ONYX_PRIVATE_KEY_BASE58: z.string().min(1).optional(),
  ONYX_WALLET_ADDRESS: z.string().min(1).optional(),
  ONYX_MAX_RISK_PER_TRADE_BPS: z.coerce.number().int().min(1).max(5_000).default(200),
  ONYX_MICRO_WALLET_MIN_USD: z.coerce.number().positive().default(25),
  ONYX_MICRO_WALLET_MAX_USD: z.coerce.number().positive().default(30),
  ONYX_ESTIMATED_SOL_USD: z.coerce.number().positive().default(150),
  ONYX_MIN_TRADE_NOTIONAL_USD: z.coerce.number().positive().default(3),
  ONYX_MIN_NET_EDGE_BPS: z.coerce.number().int().min(1).default(250),
  ONYX_ADAPTIVE_EDGE_RELIEF_MAX_BPS: z.coerce.number().int().min(0).max(2000).default(90),
  ONYX_ADAPTIVE_EDGE_RELIEF_FLOOR_BPS: z.coerce.number().int().min(0).max(5000).default(150),
  ONYX_MAX_CONCURRENT_POSITIONS: z.coerce.number().int().min(1).max(3).default(1),
  ONYX_DAILY_MAX_DRAWDOWN_BPS: z.coerce.number().int().min(50).max(3_000).default(2500),
  ONYX_DRAWDOWN_MIN_CLOSED_TRADES: z.coerce.number().int().min(1).max(20).default(2),
  ONYX_REALIZED_EDGE_WINDOW_TRADES: z.coerce.number().int().min(1).max(20).default(3),
  ONYX_REALIZED_EDGE_MIN_CLOSED_TRADES: z.coerce.number().int().min(1).max(50).default(3),
  ONYX_REALIZED_EDGE_MIN_MEDIAN_BPS: z.coerce.number().int().min(-5000).max(5000).default(0),
  ONYX_MAX_CONSECUTIVE_LOSSES: z.coerce.number().int().min(1).max(20).default(4),
  ONYX_MAX_FAILURE_RATE_BPS: z.coerce.number().int().min(100).max(10_000).default(3000),
  ONYX_KILL_SWITCH_MIN_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(3),
  ONYX_MAX_HOLDER_CONCENTRATION_BPS: z.coerce.number().int().min(1000).max(10_000).default(4000),
  ONYX_MAX_CREATOR_SUPPLY_SHARE_BPS: z.coerce.number().int().min(100).max(10_000).default(1500),
  ONYX_MAX_CREATOR_RISK_SCORE: z.coerce.number().int().min(1).max(99).default(90),
  ONYX_UNKNOWN_CREATOR_RISK_SCORE: z.coerce.number().int().min(1).max(99).default(60),
  ONYX_CREATOR_RISK_MIN_HISTORY_SIGNALS: z.coerce.number().int().min(1).max(100).default(8),
  ONYX_DEFAULT_SLIPPAGE_BPS: z.coerce.number().int().min(100).max(5_000).default(1200),
  ONYX_MAX_SLIPPAGE_BPS: z.coerce.number().int().min(200).max(8_000).default(2200),
  ONYX_BASE_TIP_LAMPORTS: z.coerce.number().int().min(1_000).default(2_000_000),
  ONYX_MAX_TIP_LAMPORTS: z.coerce.number().int().min(1_000).default(10_000_000),
  ONYX_DYNAMIC_TIP_ENABLED: envBool.default(true),
  ONYX_MIN_TIP_LAMPORTS: z.coerce.number().int().min(1_000).default(250_000),
  ONYX_DYNAMIC_TIP_EDGE_FACTOR_BPS: z.coerce.number().int().min(0).max(20_000).default(3_500),
  ONYX_DYNAMIC_TIP_LATENCY_FACTOR_BPS: z.coerce.number().int().min(0).max(20_000).default(2_500),
  ONYX_EXECUTION_LATENCY_DEGRADE_MS: z.coerce.number().int().min(100).max(60_000).default(1_800),
  ONYX_EXECUTION_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(3_500),
  ONYX_EXECUTION_CONFIRM_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(12_000),
  ONYX_EXECUTION_CONFIRM_POLL_MS: z.coerce.number().int().min(100).max(5_000).default(200),
  ONYX_JITO_USE_NATIVE_BUILDER: envBool.default(false),
  ONYX_TARGET_BUY_SOL: z.coerce.number().positive().default(0.05),
  ONYX_NEW_LAUNCH_PROGRAM_ID: z.string().min(1),
  ONYX_DRPC_LOG_PAYLOAD_DETAILS: envBool.default(false),
  ONYX_LAUNCH_TX_FETCH_TIMEOUT_MS: z.coerce.number().int().min(100).default(700),
  ONYX_LAUNCH_TX_FETCH_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(6),
  ONYX_PRICE_STALE_TIMEOUT_MS: z.coerce.number().int().min(500).default(5000),
  ONYX_MAX_SOURCE_DIVERGENCE_BPS: z.coerce.number().int().min(10).default(400),
  ONYX_TRAILING_STOP_BPS: z.coerce.number().int().min(100).default(1200),
  ONYX_STOP_LOSS_BPS: z.coerce.number().int().min(100).max(5_000).default(2000),
  ONYX_EARLY_FAST_FAIL_STOP_LOSS_RATIO_BPS: z.coerce.number().int().min(1000).max(10000).default(7000),
  ONYX_EARLY_FAST_FAIL_STOP_LOSS_MIN_BPS: z.coerce.number().int().min(100).max(5000).default(250),
  ONYX_EXIT_ARMING_DELAY_MS: z.coerce.number().int().min(0).max(30_000).default(1500),
  ONYX_TAKE_PROFIT_MIN_BPS: z.coerce.number().int().min(500).default(1500),
  ONYX_TAKE_PROFIT_MAX_BPS: z.coerce.number().int().min(1000).default(2500),
  ONYX_MAX_HOLD_MS: z.coerce.number().int().min(5000).default(20000),
  ONYX_POSITION_STALE_EXIT_MS: z.coerce.number().int().min(1000).default(16000),
  ONYX_STALE_EXIT_GRACE_MS: z.coerce.number().int().min(0).max(30_000).default(2000),
  ONYX_ENABLE_EXTERNAL_QUOTE_STREAM: envBool.default(false),
  ONYX_EXTERNAL_QUOTE_URL_TEMPLATE: z.string().optional(),
  ONYX_EXTERNAL_QUOTE_POLL_MS: z.coerce.number().int().min(250).default(2000),
  ONYX_EXTERNAL_QUOTE_GRACE_MS: z.coerce.number().int().min(500).default(7000),
  ONYX_PAPER_RELAX_FILTERS: envBool.default(true),
  ONYX_PAPER_PRICE_TICK_MS: z.coerce.number().int().min(250).default(1500),
  ONYX_PAPER_PRICE_DRIFT_BPS: z.coerce.number().int().min(-1000).max(1000).default(80),
  ONYX_PAPER_PRICE_VOL_BPS: z.coerce.number().int().min(10).max(2500).default(500),
  ONYX_PAPER_SUMMARY_INTERVAL_MS: z.coerce.number().int().min(10_000).default(120_000),
  ONYX_CONCURRENT_SKIP_ALERT_COOLDOWN_MS: z.coerce.number().int().min(1_000).default(15_000),
  ONYX_ENTRY_MAX_SIGNAL_AGE_MS: z.coerce.number().int().min(100).default(2_600),
  ONYX_ENTRY_MIN_PRIMARY_TICKS: z.coerce.number().int().min(1).max(10).default(2),
  ONYX_ENTRY_TICK_WARMUP_MS: z.coerce.number().int().min(50).max(15_000).default(1_800),
  ONYX_ENTRY_QUEUE_TTL_MS: z.coerce.number().int().min(250).max(20_000).default(4_500),
  ONYX_ENTRY_FALLBACK_MAX_SIGNAL_AGE_MS: z.coerce.number().int().min(100).max(20_000).default(2_800),
  ONYX_FAST_STOPOUT_WINDOW_TRADES: z.coerce.number().int().min(1).max(50).default(6),
  ONYX_FAST_STOPOUT_RATE_BPS: z.coerce.number().int().min(0).max(10_000).default(5_000),
  ONYX_FAST_STOPOUT_HOLD_THRESHOLD_MS: z.coerce.number().int().min(200).max(30_000).default(4_000),
  ONYX_FAST_STOPOUT_COOLDOWN_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(120_000),
  ONYX_VOLUME_GATE_ENABLED: envBool.default(true),
  ONYX_VOLUME_GATE_WINDOW_MS: z.coerce.number().int().min(500).max(120_000).default(15_000),
  ONYX_VOLUME_GATE_MIN_TICKS: z.coerce.number().int().min(1).max(500).default(8),
  ONYX_VOLUME_GATE_MIN_BUY_TICKS: z.coerce.number().int().min(0).max(500).default(4),
  ONYX_HIGH_VOLUME_LANE_ENABLED: envBool.default(false),
  ONYX_HIGH_VOLUME_MIN_TICKS: z.coerce.number().int().min(1).max(1000).default(25),
  ONYX_HIGH_VOLUME_MIN_BUY_TICKS: z.coerce.number().int().min(0).max(1000).default(12),
  ONYX_HIGH_VOLUME_WINDOW_MS: z.coerce.number().int().min(1000).max(300_000).default(45_000),
  ONYX_HIGH_VOLUME_MIN_MOMENTUM_BPS: z.coerce.number().int().min(0).max(10_000).default(250),
  ONYX_HIGH_VOLUME_ENTRY_COOLDOWN_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  ONYX_HIGH_VOLUME_EXCLUDE_NEW_LAUNCH_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(180_000),
  ONYX_HIGH_VOLUME_SIZING_MULTIPLIER_BPS: z.coerce.number().int().min(500).max(20_000).default(8_000),
  ONYX_HIGH_VOLUME_MIN_EDGE_BONUS_BPS: z.coerce.number().int().min(0).max(5_000).default(150),
  ONYX_HIGH_VOLUME_QUALITY_MIN_SCORE: z.coerce.number().int().min(0).max(100).default(55),
  ONYX_QUALITY_SNIPE_ENABLED: envBool.default(true),
  ONYX_QUALITY_SNIPE_MIN_SCORE: z.coerce.number().int().min(0).max(100).default(58),
  ONYX_DYNAMIC_ENTRY_QUALITY_ENABLED: envBool.default(true),
  ONYX_DYNAMIC_ENTRY_QUALITY_DEGRADE_BPS: z.coerce.number().int().min(0).max(50).default(8),
  ONYX_DYNAMIC_ENTRY_QUALITY_MAX_ADD: z.coerce.number().int().min(0).max(30).default(20),
  ONYX_ENTRY_COOLDOWN_BASE_MS: z.coerce.number().int().min(0).max(600_000).default(12_000),
  ONYX_ENTRY_COOLDOWN_MAX_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(180_000),
  ONYX_ENTRY_CREATOR_COOLDOWN_MS: z.coerce.number().int().min(0).max(3_600_000).default(45_000),
  ONYX_STREAK_RISK_REDUCTION_BPS: z.coerce.number().int().min(0).max(5_000).default(1_300),
  ONYX_STREAK_RISK_FLOOR_BPS: z.coerce.number().int().min(100).max(5_000).default(250),
  ONYX_KILL_SWITCH_COOLDOWN_MS: z.coerce.number().int().min(1_000).max(86_400_000).default(90_000),
  ONYX_KILL_SWITCH_AUTO_UNBLOCK_DRAWDOWN_BUFFER_BPS: z.coerce.number().int().min(0).max(3_000).default(400),
  ONYX_KILL_SWITCH_AUTO_UNBLOCK_FAILURE_BUFFER_BPS: z.coerce.number().int().min(0).max(3_000).default(800),
  ONYX_EXECUTION_FAILURE_DEGRADE_BPS: z.coerce.number().int().min(100).max(10_000).default(4_200),
  ONYX_SWEEP_PROFILE: z.enum(["safer", "aggressive"]).default("safer"),
  ONYX_SWEEP_MOON_WINDOW_MS: z.coerce.number().int().min(5_000).max(300_000).default(60_000),
  ONYX_SWEEP_MIN_MOON_MOMENTUM_BPS: z.coerce.number().int().min(100).max(20_000).default(3_000),
  ONYX_SWEEP_MIN_MOON_TICKS: z.coerce.number().int().min(1).max(2_000).default(18),
  ONYX_SWEEP_MIN_MOON_BUY_RATIO_BPS: z.coerce.number().int().min(0).max(10_000).default(6_200),
  ONYX_SWEEP_MIN_DIP_BPS: z.coerce.number().int().min(100).max(8_000).default(2_000),
  ONYX_SWEEP_MAX_DIP_BPS: z.coerce.number().int().min(500).max(9_500).default(4_500),
  ONYX_SWEEP_MIN_STABILIZATION_MS: z.coerce.number().int().min(500).max(30_000).default(4_000),
  ONYX_SWEEP_REVERSAL_BUY_RATIO_BPS: z.coerce.number().int().min(0).max(10_000).default(7_000),
  ONYX_SWEEP_REVERSAL_MIN_TICKS: z.coerce.number().int().min(1).max(2_000).default(10),
  ONYX_SWEEP_MAX_WATCH_MS: z.coerce.number().int().min(10_000).max(3_600_000).default(600_000),
  ONYX_SWEEP_MIN_PRICE_FLOOR_SOL: z.coerce.number().positive().default(0.00000001),
  ONYX_SWEEP_SAFER_SIZING_MULTIPLIER_BPS: z.coerce.number().int().min(1_000).max(20_000).default(9_000),
  ONYX_SWEEP_AGGRESSIVE_SIZING_MULTIPLIER_BPS: z.coerce.number().int().min(1_000).max(20_000).default(11_000),
  ONYX_SWEEP_SAFER_PARTIAL_TP_BPS: z.coerce.number().int().min(100).max(10_000).default(1_500),
  ONYX_SWEEP_AGGRESSIVE_PARTIAL_TP_BPS: z.coerce.number().int().min(100).max(10_000).default(1_000),
  ONYX_SWEEP_PARTIAL_TP_PCT_BPS: z.coerce.number().int().min(1_000).max(9_000).default(5_000),
  ONYX_SWEEP_SAFER_TRAILING_STOP_BPS: z.coerce.number().int().min(100).max(5_000).default(1_200),
  ONYX_SWEEP_AGGRESSIVE_TRAILING_STOP_BPS: z.coerce.number().int().min(100).max(5_000).default(800),
  ONYX_SWEEP_SAFER_STOP_LOSS_BPS: z.coerce.number().int().min(100).max(5_000).default(1_800),
  ONYX_SWEEP_AGGRESSIVE_STOP_LOSS_BPS: z.coerce.number().int().min(100).max(5_000).default(1_300),
  ONYX_TRADING_MODE: z.enum(["aggressiveSpray", "balanced", "auto"]).default("auto"),
  ONYX_MODE_TRANSITION_MIN_TRADES: z.coerce.number().int().min(1).max(100).default(10),
  ONYX_MODE_TRANSITION_MIN_MEDIAN_REALIZED_BPS: z.coerce.number().int().min(-5000).max(5000).default(50),
  ONYX_EXIT_STRATEGY: z.enum(["tp_sl", "time_based", "manual"]).default("tp_sl"),
  ONYX_LOG_TO_FILE_ENABLED: envBool.default(false),
  ONYX_LOG_FILE_PATH: z.string().default("logs/onyx-runtime.log"),
  ONYX_LOG_PRETTY: envBool.default(false),
  ONYX_TELEMETRY_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  ONYX_DISCORD_ALERTS_ENABLED: envBool.default(false),
  ONYX_DISCORD_WEBHOOK_URL: z.string().url().optional(),
  ONYX_DISCORD_ALERT_MIN_QUALITY_SCORE: z.coerce.number().int().min(0).max(100).optional(),
  ONYX_DISCORD_ALERT_COOLDOWN_MS: z.coerce.number().int().min(5_000).max(3_600_000).default(60_000),
  ONYX_PUBLIC_LAUNCH_STREAM_ENABLED: envBool.default(false),
  ONYX_PUBLIC_LAUNCH_STREAM_HOST: z.string().min(1).default("127.0.0.1"),
  ONYX_PUBLIC_LAUNCH_STREAM_PORT: z.coerce.number().int().min(1).max(65_535).default(8790),
  ONYX_PUBLIC_LAUNCH_STREAM_MAX_CLIENTS: z.coerce.number().int().min(1).max(10_000).default(50),
  /** Unkey root key with `api.*.verify_key` (or scoped verify) — never expose to clients */
  ONYX_UNKEY_VERIFY_ROOT_KEY: z.string().min(1).optional(),
  /** When set, client keys must carry `meta.purpose` equal to this string */
  ONYX_PUBLIC_LAUNCH_STREAM_REQUIRE_META_PURPOSE: z.string().min(1).optional(),
  /** Shared Postgres URL (Better Auth users) — required when Onyx billing gates are enabled */
  DATABASE_URL: z.string().min(1).optional(),
  AUTUMN_SECRET_KEY: z.string().min(1).optional(),
  /** Must match `launch_stream_message` (or credit pool) in `autumn.config.ts` after `atmn push` */
  AUTUMN_FEATURE_LAUNCH_STREAM: z.string().min(1).optional(),
  /** Boolean-style entitlement checked before live/paper entries (e.g. `onyx_live_trading`) */
  AUTUMN_FEATURE_TRADE_ENTRY: z.string().min(1).optional(),
  /** Metered USD balance consumed after each successful buy (e.g. `platform_trade_fee_usd`) */
  AUTUMN_FEATURE_PLATFORM_TRADE_FEE: z.string().min(1).optional(),
  /** Better Auth `User.id` for the trading operator (must exist in DB + Autumn) */
  ONYX_BILLING_CUSTOMER_ID: z.string().min(1).optional(),
  /** Enforce Autumn + DB on the public launch WebSocket (requires Unkey + billing env) */
  ONYX_BILLING_STREAM_ENABLED: envBool.default(false),
  /** Enforce Autumn + DB before entries and meter fees after buys */
  ONYX_BILLING_TRADE_ENABLED: envBool.default(false),
  /** Default 1500 = 15% of buy notional (USD) */
  ONYX_PLATFORM_TRADE_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(1500),
  /** When true, push primary price ticks to `SYNC_DATABASE_URL` / Upstash (if configured). */
  ONYX_MARKET_SYNC_ENABLED: envBool.default(true),
  /** Min interval between aggregated bar writes per mint (ms). */
  ONYX_MARKET_SYNC_BAR_THROTTLE_MS: z.coerce.number().int().min(50).max(120_000).default(450),
  /** OHLC bucket width passed to Drizzle writer (ms). */
  ONYX_MARKET_SYNC_BAR_BUCKET_MS: z.coerce.number().int().min(100).max(120_000).default(500),
  /** Pub/sub backend adapter for sync tick fan-out. */
  REDIS_PUBSUB_ADAPTER: z.enum(["redis", "upstash"]).default("redis"),
  /** When set, Onyx publishes mux price ticks to Redis for `apps/sync` WebSocket fan-out (TCP Redis URL). */
  REDIS_PUBSUB_URL: z.string().min(1).optional(),
  /** Upstash REST URL used when `REDIS_PUBSUB_ADAPTER=upstash`. */
  UPSTASH_REDIS_REST_URL: z.string().min(1).optional(),
  /** Upstash REST token used when `REDIS_PUBSUB_ADAPTER=upstash`. */
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  /** Redis channel for `PriceTickPubPayload` JSON (default `df:price:tick`). */
  REDIS_PRICE_TICK_CHANNEL: z.string().min(1).default("df:price:tick"),
  /** Register Redis mint watch keys while positions are open (pairs with Geyser interest filter). */
  ONYX_TICK_INTEREST_WATCH_ENABLED: envBool.default(false),
  /** TTL for mint watch keys while positions are open (default 60s); refreshed on ticks for open mints. */
  ONYX_TICK_WATCH_TTL_MS: z.coerce.number().int().min(5_000).max(3_600_000).default(60_000),
  /** When true, Onyx polls SOL/USD from Pyth via RPC and writes to sync DB + cache as SOL mint. */
  ONYX_SOL_USD_FEED_ENABLED: envBool.default(true),
  /** Pyth Pro Lazer access token (server-side only). When set, uses Lazer instead of RPC polling. */
  ONYX_PYTH_PRO_ACCESS_TOKEN: z.string().min(1).optional(),
  /** Pyth Pro Lazer numeric feed id for SOL/USD (see Symbols List API). */
  ONYX_PYTH_PRO_SOL_USD_FEED_ID: z.coerce.number().int().min(1).default(6),
  /** Exponent for SOL/USD in Lazer payload (default -8). */
  ONYX_PYTH_PRO_SOL_USD_EXPONENT: z.coerce.number().int().min(-18).max(18).default(-8),
  /** Lazer channel; `real_time` or fixed rate (defaults to 200ms). */
  ONYX_PYTH_PRO_CHANNEL: z.string().min(1).default("fixed_rate@200ms")
})
  .superRefine((data, ctx) => {
    if (data.ONYX_GRPC_ENABLED && !data.ONYX_GRPC_ENDPOINT && !data.ONYX_INTERNAL_GEYSER_ENDPOINT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "ONYX_GRPC_ENDPOINT or ONYX_INTERNAL_GEYSER_ENDPOINT is required when ONYX_GRPC_ENABLED is true",
        path: ["ONYX_GRPC_ENDPOINT"]
      });
    }
    if (data.ONYX_PRIMARY_PRICE_SOURCE === "grpc" && !data.ONYX_GRPC_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ONYX_GRPC_ENABLED must be true when ONYX_PRIMARY_PRICE_SOURCE is grpc",
        path: ["ONYX_GRPC_ENABLED"]
      });
    }
    if (
      data.ONYX_PRIMARY_PRICE_SOURCE === "grpc" &&
      !data.ONYX_GRPC_ENDPOINT &&
      !data.ONYX_INTERNAL_GEYSER_ENDPOINT
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "ONYX_GRPC_ENDPOINT or ONYX_INTERNAL_GEYSER_ENDPOINT is required when ONYX_PRIMARY_PRICE_SOURCE is grpc",
        path: ["ONYX_GRPC_ENDPOINT"]
      });
    }
    if (data.REDIS_PUBSUB_ADAPTER === "redis" && !data.REDIS_PUBSUB_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "REDIS_PUBSUB_URL is required when REDIS_PUBSUB_ADAPTER is redis",
        path: ["REDIS_PUBSUB_URL"]
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
    if (data.ONYX_DISCORD_ALERTS_ENABLED && !data.ONYX_DISCORD_WEBHOOK_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ONYX_DISCORD_WEBHOOK_URL is required when ONYX_DISCORD_ALERTS_ENABLED is true",
        path: ["ONYX_DISCORD_WEBHOOK_URL"]
      });
    }
    if (data.ONYX_PUBLIC_LAUNCH_STREAM_ENABLED && !data.ONYX_UNKEY_VERIFY_ROOT_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ONYX_UNKEY_VERIFY_ROOT_KEY is required when ONYX_PUBLIC_LAUNCH_STREAM_ENABLED is true",
        path: ["ONYX_UNKEY_VERIFY_ROOT_KEY"]
      });
    }
    if (data.ONYX_BILLING_STREAM_ENABLED) {
      if (!data.ONYX_PUBLIC_LAUNCH_STREAM_ENABLED) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ONYX_PUBLIC_LAUNCH_STREAM_ENABLED must be true when ONYX_BILLING_STREAM_ENABLED is true",
          path: ["ONYX_BILLING_STREAM_ENABLED"]
        });
      }
      if (!data.AUTUMN_SECRET_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AUTUMN_SECRET_KEY is required when ONYX_BILLING_STREAM_ENABLED is true",
          path: ["AUTUMN_SECRET_KEY"]
        });
      }
      if (!data.AUTUMN_FEATURE_LAUNCH_STREAM) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AUTUMN_FEATURE_LAUNCH_STREAM is required when ONYX_BILLING_STREAM_ENABLED is true",
          path: ["AUTUMN_FEATURE_LAUNCH_STREAM"]
        });
      }
      if (!data.DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "DATABASE_URL is required when ONYX_BILLING_STREAM_ENABLED is true",
          path: ["DATABASE_URL"]
        });
      }
    }
    if (data.ONYX_BILLING_TRADE_ENABLED) {
      if (!data.AUTUMN_SECRET_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AUTUMN_SECRET_KEY is required when ONYX_BILLING_TRADE_ENABLED is true",
          path: ["AUTUMN_SECRET_KEY"]
        });
      }
      if (!data.DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "DATABASE_URL is required when ONYX_BILLING_TRADE_ENABLED is true",
          path: ["DATABASE_URL"]
        });
      }
      if (!data.ONYX_BILLING_CUSTOMER_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ONYX_BILLING_CUSTOMER_ID is required when ONYX_BILLING_TRADE_ENABLED is true",
          path: ["ONYX_BILLING_CUSTOMER_ID"]
        });
      }
      if (!data.AUTUMN_FEATURE_TRADE_ENTRY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AUTUMN_FEATURE_TRADE_ENTRY is required when ONYX_BILLING_TRADE_ENABLED is true",
          path: ["AUTUMN_FEATURE_TRADE_ENTRY"]
        });
      }
    }
  });

export type OnyxEnv = z.infer<typeof envSchema>;

export const loadEnv = (): OnyxEnv => envSchema.parse(process.env);
