import type { Zero } from "@rocicorp/zero";
import { Effect } from "effect";
import { queries } from "../zero/queries";
import type { SyncZeroSchema } from "../zero/schema";

/**
 * Preload hot queries into Zero (cheap: avoids materializing full rows where possible).
 * Call once after `connected` (see `ZeroBootstrap`).
 */
export const preloadSyncDataEffect = (zero: Zero<SyncZeroSchema>) =>
  Effect.sync(() => {
    zero.preload(
      queries.prices.recentBars({
        limit: 600
      }) as never
    );
    zero.preload(queries.prices.allLatest({}) as never);
  });
