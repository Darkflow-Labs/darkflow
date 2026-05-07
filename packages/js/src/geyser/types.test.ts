import { describe, expect, it } from "vitest";
import type { DarkflowGeyserConfig, GeyserEvent } from "./types.js";

describe("geyser types", () => {
  it("supports typed config and union events", () => {
    const config: DarkflowGeyserConfig = {
      apiKey: "key",
      httpBaseUrl: "http://localhost:8792",
      streamUrl: "ws://localhost:8792"
    };
    const event: GeyserEvent = {
      v: 1,
      type: "tick",
      tokenMint: "mint",
      priceSol: 0.123,
      receivedAt: Date.now(),
      source: "grpc-primary"
    };
    expect(config.apiKey).toBe("key");
    expect(event.type).toBe("tick");
  });
});
