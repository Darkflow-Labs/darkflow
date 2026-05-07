import { describe, expect, it, vi } from "vitest";
import { LaunchStreamResource } from "../resources/launchStream.js";
import { connectLaunchStreamWithRetry } from "./launchStream.js";

describe("connectLaunchStreamWithRetry", () => {
  it("retries then returns a connected stream", async () => {
    let attempts = 0;
    const spy = vi.spyOn(LaunchStreamResource.prototype, "connect").mockImplementation(async function (this: LaunchStreamResource) {
      attempts += 1;
      if (attempts < 2) {
        throw new Error("transient");
      }
      return undefined;
    });
    const closeSpy = vi.spyOn(LaunchStreamResource.prototype, "close").mockImplementation(() => {});

    const stream = await connectLaunchStreamWithRetry(
      {
        apiKey: "k",
        launchStreamUrl: "ws://localhost:1",
        launchStreamAuth: "query"
      },
      { maxAttempts: 4, initialBackoffMs: 1, maxBackoffMs: 5 }
    );

    expect(attempts).toBe(2);
    expect(stream).toBeInstanceOf(LaunchStreamResource);
    spy.mockRestore();
    closeSpy.mockRestore();
    stream.close();
  });
});
