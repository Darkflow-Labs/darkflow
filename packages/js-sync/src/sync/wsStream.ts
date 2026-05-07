import { Effect, Stream } from "effect";
import type { PriceTickMessage } from "./types.js";

export const buildAuthenticatedWsUrl = (baseUrl: string, apiKey: string): string => {
  const url = new URL(baseUrl);
  if (!url.searchParams.has("key")) {
    url.searchParams.set("key", apiKey);
  }
  return url.toString();
};

const openWebSocket = (url: string): Effect.Effect<WebSocket, Error, never> =>
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
        }, 20_000);
        ws.onopen = () => {
          clearTimeout(timer);
          resolve(ws);
        };
        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error("WebSocket connection error"));
        };
      }),
    catch: (e) => (e instanceof Error ? e : new Error(String(e)))
  });

const sendSubscribe = (ws: WebSocket, mints: readonly string[]): void => {
  ws.send(JSON.stringify({ op: "subscribe", mints: [...mints] }));
};

const sendUnsubscribe = (ws: WebSocket, mints: readonly string[]): void => {
  ws.send(JSON.stringify({ op: "unsubscribe", mints: [...mints] }));
};

const isTick = (x: unknown): x is PriceTickMessage =>
  typeof x === "object" &&
  x !== null &&
  (x as PriceTickMessage).v === 1 &&
  (x as PriceTickMessage).type === "tick" &&
  typeof (x as PriceTickMessage).tokenMint === "string";

type WsResource = { readonly ws: WebSocket; readonly handler: (event: MessageEvent) => void };

/**
 * Live tick stream from `apps/sync` WebSocket — **Effect / Stream only** (no React `useEffect`).
 * Interrupt the stream scope to unsubscribe and close the socket.
 */
export const priceTicksFromSyncWs = (input: {
  readonly wsUrl: string;
  readonly apiKey: string;
  readonly mints: readonly string[];
}): Stream.Stream<PriceTickMessage, Error, never> =>
  Stream.asyncScoped((emit) =>
    Effect.acquireRelease(
      Effect.gen(function* () {
        const url = buildAuthenticatedWsUrl(input.wsUrl, input.apiKey);
        const ws = yield* openWebSocket(url);
        sendSubscribe(ws, input.mints);
        const handler = (event: MessageEvent) => {
          try {
            const parsed: unknown = JSON.parse(String(event.data));
            if (isTick(parsed)) {
              void emit.single(parsed);
            }
          } catch {
            /* ignore */
          }
        };
        ws.addEventListener("message", handler);
        return { ws, handler } satisfies WsResource;
      }),
      ({ ws, handler }) =>
        Effect.sync(() => {
          ws.removeEventListener("message", handler as EventListener);
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
