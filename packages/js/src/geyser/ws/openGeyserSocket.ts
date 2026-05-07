import { DarkflowGeyserConnectionError } from "../errors.js";
import type { GeyserStreamAuthMode } from "../types.js";

const isLikelyBrowser = (): boolean =>
  typeof globalThis !== "undefined" &&
  typeof (globalThis as { document?: unknown }).document !== "undefined";

export const openGeyserSocket = async (
  streamUrl: string | URL,
  apiKey: string,
  auth: GeyserStreamAuthMode
): Promise<unknown> => {
  const url = typeof streamUrl === "string" ? new URL(streamUrl) : new URL(streamUrl.toString());

  if (auth === "bearer") {
    if (isLikelyBrowser()) {
      throw new DarkflowGeyserConnectionError(
        'Bearer WebSocket auth is not supported in browsers; use streamAuth: "query".',
        "BEARER_UNSUPPORTED_IN_BROWSER"
      );
    }
    try {
      const { default: WS } = await import("ws");
      return new WS(url.toString(), { headers: { Authorization: `Bearer ${apiKey}` } }) as unknown;
    } catch (err) {
      throw new DarkflowGeyserConnectionError("Failed to load ws peer dependency", "WS_MODULE_MISSING", {
        cause: String(err)
      });
    }
  }

  if (!url.searchParams.has("key")) {
    url.searchParams.set("key", apiKey);
  }
  const target = url.toString();
  if (typeof globalThis.WebSocket !== "undefined") {
    return new globalThis.WebSocket(target);
  }
  try {
    const { default: WS } = await import("ws");
    return new WS(target) as unknown;
  } catch (err) {
    throw new DarkflowGeyserConnectionError("No WebSocket implementation is available", "WEBSOCKET_UNAVAILABLE", {
      cause: String(err)
    });
  }
};
