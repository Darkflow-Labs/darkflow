import type { ExecutionDefaults } from "@darkflow/engine/config";
import type { OnyxEnv } from "./env.js";

/** Maps deployment `ONYX_*` env (already parsed) into engine execution-defaults partial. */
export const mapOnyxEnvToExecutionDefaultsPartial = (env: OnyxEnv): Partial<ExecutionDefaults> => ({
  jitoBundleOnly: env.ONYX_JITO_BUNDLE_ONLY,
  maxExecutionRetries: env.ONYX_MAX_EXECUTION_RETRIES,
  jitoMinSubmitIntervalMs: env.ONYX_JITO_MIN_SUBMIT_INTERVAL_MS,
  executionRequestTimeoutMs: env.ONYX_EXECUTION_REQUEST_TIMEOUT_MS,
  executionConfirmTimeoutMs: env.ONYX_EXECUTION_CONFIRM_TIMEOUT_MS,
  executionConfirmPollMs: env.ONYX_EXECUTION_CONFIRM_POLL_MS,
  jitoUseNativeBuilder: env.ONYX_JITO_USE_NATIVE_BUILDER,
  launchTxFetchTimeoutMs: env.ONYX_LAUNCH_TX_FETCH_TIMEOUT_MS,
  launchTxFetchConcurrency: env.ONYX_LAUNCH_TX_FETCH_CONCURRENCY,
  priceStaleTimeoutMs: env.ONYX_PRICE_STALE_TIMEOUT_MS
});
