import type { SyncZeroSchema } from "./schema";

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    schema: SyncZeroSchema;
    /** Optional user context from Better Auth (`userId`). */
    context: { userId: string } | undefined;
  }
}

export {};
