import type { Stream } from "effect";
import { streamSyncTicks } from "../sync/wsStream.js";
import type { SyncTickMessage } from "../sync/types.js";

export type SyncStreamResourceConfig = {
  apiKey: string;
  syncStreamUrl: string | URL;
};

export class SyncStreamResource {
  public constructor(private readonly config: SyncStreamResourceConfig) {}

  public priceTicks(mints: readonly string[]): Stream.Stream<SyncTickMessage, Error> {
    return streamSyncTicks({
      wsUrl: this.config.syncStreamUrl,
      apiKey: this.config.apiKey,
      mints
    });
  }
}
