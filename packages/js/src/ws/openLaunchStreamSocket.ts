import { DarkflowConnectionError } from "../errors.js";
import type { LaunchStreamAuthMode } from "../types.js";

const isLikelyBrowser = (): boolean =>
  typeof globalThis !== "undefined" &&
  typeof (globalThis as { document?: unknown }).document !== "undefined";

export const openLaunchStreamSocket = async (
  launchStreamUrl: string | URL,
  apiKey: string,
  auth: LaunchStreamAuthMode
): Promise<unknown> => {
  const url = typeof launchStreamUrl === "string" ? new URL(launchStreamUrl) : new URL(launchStreamUrl.toString());

  if (auth === "bearer") {
    if (isLikelyBrowser()) {
      throw new DarkflowConnectionError(
        'Bearer WebSocket auth is not supported in browsers. Use launchStreamAuth: "query" (default) so the key is sent via ?key=.',
        "BEARER_UNSUPPORTED_IN_BROWSER"
      );
    }
    try {
      const { default: WS } = await import("ws");
      return new WS(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` }
      }) as unknown;
    } catch (e) {
      throw new DarkflowConnectionError(
        'Failed to load optional peer dependency "ws" for bearer auth.',
        "WS_MODULE_MISSING",
        { cause: String(e) }
      );
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
  } catch (e) {
    throw new DarkflowConnectionError(
      'No WebSocket implementation: use Node 22+ (global WebSocket), or install optional peer "ws".',
      "WEBSOCKET_UNAVAILABLE",
      { cause: String(e) }
    );
  }
};
