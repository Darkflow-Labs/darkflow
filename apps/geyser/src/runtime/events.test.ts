import { describe, expect, it } from "vitest";
import { toLaunchEvent, toTickEvent } from "./events.js";

describe("geyser event mapping", () => {
  it("maps launch signal to normalized launch event", () => {
    const event = toLaunchEvent({
      signature: "sig",
      tokenMint: "mint",
      creator: "creator",
      slot: 123,
      source: "grpc",
      receivedAt: 1000
    });
    expect(event.type).toBe("launch");
    expect(event.v).toBe(1);
    expect(event.tokenMint).toBe("mint");
  });

  it("maps price tick to normalized tick event", () => {
    const event = toTickEvent({
      tokenMint: "mint",
      priceSol: 0.42,
      receivedAt: 1000,
      source: "grpc-primary"
    });
    expect(event.type).toBe("tick");
    expect(event.v).toBe(1);
    expect(event.priceSol).toBe(0.42);
  });
});
