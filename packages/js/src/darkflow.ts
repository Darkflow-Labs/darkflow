import { createHttpClient } from "./http/createHttpClient.js";
import { LaunchStreamResource } from "./resources/launchStream.js";
import { SyncStreamResource } from "./resources/syncStream.js";
import type { DarkflowConfig } from "./types.js";

export type HttpClient = ReturnType<typeof createHttpClient>;

export class Darkflow {
  public readonly http: HttpClient;
  public readonly launches: LaunchStreamResource;
  public readonly sync: SyncStreamResource | null;

  public constructor(config: DarkflowConfig) {
    this.http = createHttpClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      debug: config.debug
    });
    this.launches = new LaunchStreamResource({
      apiKey: config.apiKey,
      launchStreamUrl: config.launchStreamUrl,
      debug: config.debug,
      launchStreamAuth: config.launchStreamAuth ?? "query"
    });
    this.sync = config.syncStreamUrl
      ? new SyncStreamResource({
          apiKey: config.apiKey,
          syncStreamUrl: config.syncStreamUrl
        })
      : null;
  }
}

export const createClient = (config: DarkflowConfig): Darkflow => new Darkflow(config);
