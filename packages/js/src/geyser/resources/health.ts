import type { GeyserHealthResponse } from "../types.js";

export type GeyserHttpClient = (request: string, options?: Record<string, unknown>) => Promise<unknown>;

export class GeyserHealthResource {
  public constructor(private readonly http: GeyserHttpClient) {}

  public async get(): Promise<GeyserHealthResponse> {
    const payload = (await this.http("/health", { method: "GET" })) as GeyserHealthResponse;
    return payload;
  }
}
