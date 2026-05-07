import { defineMutator, defineMutators } from "@rocicorp/zero";
import { z } from "zod";

/**
 * Client-side mutators (optional). Most market writes go through Onyx + Drizzle directly;
 * server mutators here are for admin/maintenance or future user-scoped features.
 */
export const mutators = defineMutators({
  health: {
    ping: defineMutator(z.object({}), async () => Promise.resolve()),
  },
});
