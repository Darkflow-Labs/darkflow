import { describe, expect, it } from "vitest";
import { connectGeyserStreamWithRetry } from "./stream.js";

describe("connectGeyserStreamWithRetry", () => {
  it("retries until connection succeeds", async () => {
    let attempt = 0;
    const stream = {
      connect: async () => {
        attempt += 1;
        if (attempt < 3) {
          throw new Error("not ready");
        }
      }
    };

    const result = await connectGeyserStreamWithRetry(stream as never, {
      maxAttempts: 4,
      initialBackoffMs: 1,
      maxBackoffMs: 2
    });
    expect(result).toBe(stream);
    expect(attempt).toBe(3);
  });
});
