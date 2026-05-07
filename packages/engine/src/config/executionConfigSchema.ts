import { z } from "zod";
import builtinDefaults from "./defaults.engine.json" with { type: "json" };

/** Serializable execution / connector defaults merged with env and caller overrides. */
export const executionDefaultsSchema = z.object({
  jitoBundleOnly: z.boolean().default(true),
  maxExecutionRetries: z.number().int().min(0).max(5).default(2),
  jitoMinSubmitIntervalMs: z.number().int().min(500).default(1200),
  executionRequestTimeoutMs: z.number().int().min(100).max(30_000).default(3500),
  executionConfirmTimeoutMs: z.number().int().min(500).max(60_000).default(12_000),
  executionConfirmPollMs: z.number().int().min(100).max(5_000).default(200),
  jitoUseNativeBuilder: z.boolean().default(false),
  launchTxFetchTimeoutMs: z.number().int().min(100).default(700),
  launchTxFetchConcurrency: z.number().int().min(1).max(20).default(6),
  priceStaleTimeoutMs: z.number().int().min(500).default(5000),
  drpcMaxDecodeQueueSize: z.number().int().min(1).max(10_000).default(400)
});

export type ExecutionDefaults = z.infer<typeof executionDefaultsSchema>;

/** Built-in defaults (see `defaults.engine.json`). */
export const BUILTIN_EXECUTION_DEFAULTS = builtinDefaults as Partial<ExecutionDefaults>;

/**
 * Shallow merge: later objects override earlier for top-level keys only.
 * Undefined values in a partial do not erase prior keys.
 */
export const shallowMergeExecutionPartials = (
  ...partials: Array<Partial<ExecutionDefaults> | undefined>
): Partial<ExecutionDefaults> => {
  const out: Partial<ExecutionDefaults> = {};
  for (const p of partials) {
    if (!p) continue;
    for (const key of Object.keys(p) as (keyof ExecutionDefaults)[]) {
      const v = p[key];
      if (v !== undefined) {
        (out as Record<string, unknown>)[key as string] = v;
      }
    }
  }
  return out;
};

export type ResolveExecutionConfigInput = {
  /** Lowest priority — omit to use `BUILTIN_EXECUTION_DEFAULTS` */
  defaults?: Partial<ExecutionDefaults>;
  /** Middle — e.g. map from deployment env */
  envPartial?: Partial<ExecutionDefaults>;
  /** Highest — DB / user preferences */
  overrides?: Partial<ExecutionDefaults>;
};

export const resolveExecutionConfig = (input: ResolveExecutionConfigInput): ExecutionDefaults => {
  const merged = shallowMergeExecutionPartials(
    BUILTIN_EXECUTION_DEFAULTS,
    input.defaults,
    input.envPartial,
    input.overrides
  );
  return executionDefaultsSchema.parse(merged);
};
