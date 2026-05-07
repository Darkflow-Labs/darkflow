import { describe, expect, it, vi } from "vitest";
import { createGeyserHttpClient } from "./createGeyserHttpClient.js";
import { DarkflowGeyserApiError } from "../errors.js";

describe("createGeyserHttpClient", () => {
  it("adds bearer auth header", async () => {
    const client = createGeyserHttpClient({
      apiKey: "test-key",
      baseUrl: "https://example.com"
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
      text: async () => '{"ok":true}',
      headers: new Headers({ "content-type": "application/json" })
    }) as unknown as typeof fetch;

    await client("/health", { method: "GET" });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.any(Headers)
      })
    );
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-key");
  });

  it("maps API errors to DarkflowGeyserApiError", async () => {
    const client = createGeyserHttpClient({
      apiKey: "test-key",
      baseUrl: "https://example.com"
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      json: async () => ({ message: "Rate limited", code: "RATE_LIMITED" }),
      text: async () => '{"message":"Rate limited","code":"RATE_LIMITED"}',
      headers: new Headers({ "content-type": "application/json" })
    }) as unknown as typeof fetch;

    await expect(client("/health", { method: "GET" })).rejects.toBeInstanceOf(DarkflowGeyserApiError);
  });
});
