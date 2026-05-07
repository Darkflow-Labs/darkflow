import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "./createHttpClient.js";

describe("createHttpClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sends Authorization bearer on requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const client = createHttpClient({
      apiKey: "test-key",
      baseUrl: "https://api.example.test",
      debug: false,
      retry: 0
    });

    await client("/hello", { method: "GET" });

    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [RequestInfo, RequestInit | undefined];
    const headers = init?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-key");
  });
});
