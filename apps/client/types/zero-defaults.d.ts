import type { SyncZeroSchema } from "@darkflow/sync/zero-schema";

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    schema: SyncZeroSchema;
    context: { userId: string } | undefined;
  }
}

export {};
