import { Effect, Stream } from "effect";
import type { SyncTickMessage } from "./types.js";

const CONNECT_TIMEOUT_MS = 20_000;

export const buildAuthenticatedSyncWsUrl = (baseUrl: string | URL, apiKey: string): string => {
  const url = new URL(baseUrl);
  if (!url.searchParams.has("key")) {
    url.searchParams.set("key", apiKey);
  }
  return url.toString();
};

const openWebSocket = (url: string): Effect.Effect<WebSocket, Error> =>
  Effect.tryPromise({
    try: () =>
      new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(url);
        const timer = setTimeout(() => {
          reject(new Error("WebSocket connect timeout"));
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        }, CONNECT_TIMEOUT_MS);

        ws.onopen = () => {
          clearTimeout(timer);
          resolve(ws);
        };
        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error("WebSocket connection error"));
        };
      }),
    catch: (error) => (error instanceof Error ? error : new Error(String(error)))
  });

const sendSubscribe = (ws: WebSocket, mints: readonly string[]): void => {
  ws.send(JSON.stringify({ op: "subscribe", mints: [...mints] }));
};

const sendUnsubscribe = (ws: WebSocket, mints: readonly string[]): void => {
  ws.send(JSON.stringify({ op: "unsubscribe", mints: [...mints] }));
};

const isTickMessage = (value: unknown): value is SyncTickMessage =>
  typeof value === "object" &&
  value !== null &&
  (value as SyncTickMessage).v === 1 &&
  (value as SyncTickMessage).type === "tick" &&
  typeof (value as SyncTickMessage).tokenMint === "string";

type WsState = { readonly ws: WebSocket; readonly onMessage: (event: MessageEvent) => void };

/**
 * Effect/Stream-only tick transport from `apps/sync` websocket.
 * Interrupting stream scope will unsubscribe and close the socket.
 */
export const streamSyncTicks = (input: {
  wsUrl: string | URL;
  apiKey: string;
  mints: readonly string[];
}): Stream.Stream<SyncTickMessage, Error> =>
  Stream.asyncScoped((emit) =>
    Effect.acquireRelease(
      Effect.gen(function* () {
        const ws = yield* openWebSocket(buildAuthenticatedSyncWsUrl(input.wsUrl, input.apiKey));
        sendSubscribe(ws, input.mints);

        const onMessage = (event: MessageEvent) => {
          try {
            const parsed = JSON.parse(String(event.data)) as unknown;
            if (isTickMessage(parsed)) {
              void emit.single(parsed);
            }
          } catch {
            /* ignore malformed payload */
          }
        };

        ws.addEventListener("message", onMessage);
        return { ws, onMessage } satisfies WsState;
      }),
      ({ ws, onMessage }) =>
        Effect.sync(() => {
          ws.removeEventListener("message", onMessage as EventListener);
          try {
            sendUnsubscribe(ws, input.mints);
          } catch {
            /* ignore */
          }
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        })
    ).pipe(Effect.flatMap(() => Effect.never))
  );
