import { createGeyserHttpClient } from "./http/createGeyserHttpClient.js";
import { GeyserHealthResource, type GeyserHttpClient as GeyserHealthHttpClient } from "./resources/health.js";
import { GeyserStreamResource } from "./resources/stream.js";
import type { DarkflowGeyserConfig } from "./types.js";

export type GeyserHttpClient = ReturnType<typeof createGeyserHttpClient>;

export class DarkflowGeyserClient {
  public readonly http: GeyserHttpClient;
  public readonly health: GeyserHealthResource;
  public readonly stream: GeyserStreamResource;

  public constructor(config: DarkflowGeyserConfig) {
    this.http = createGeyserHttpClient({
      apiKey: config.apiKey,
      baseUrl: config.httpBaseUrl,
      debug: config.debug,
      timeout: config.timeout,
      retry: config.retry
    });
    this.health = new GeyserHealthResource(this.http as unknown as GeyserHealthHttpClient);
    this.stream = new GeyserStreamResource({
      streamUrl: config.streamUrl,
      apiKey: config.apiKey,
      streamAuth: config.streamAuth ?? "query"
    });
  }
}

export const createGeyserClient = (config: DarkflowGeyserConfig): DarkflowGeyserClient =>
  new DarkflowGeyserClient(config);

export const createClient = createGeyserClient;
