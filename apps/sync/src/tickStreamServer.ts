import http from "node:http";
import type { Logger } from "pino";
import { WebSocketServer, WebSocket } from "ws";
import type { GuardianClient } from "@darkflow/guardian";

export type TickStreamServer = {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Forward a Redis payload string (JSON) to subscribed WebSocket clients. */
  dispatchRedisPayload(payload: string): void;
};

export type TickStreamServerConfig = {
  guardian: GuardianClient;
  host: string;
  port: number;
  maxClients: number;
  logger: Logger;
  /** When set, verified key metadata must include `{ purpose: <value> }` as a string match */
  requirePurpose?: string;
  /** Max mints tracked per socket (subscribe + unsubscribe). */
  maxMintsPerSocket?: number;
};

const extractClientKey = (req: http.IncomingMessage): string | undefined => {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  try {
    const base = `http://${req.headers.host ?? "localhost"}`;
    const url = new URL(req.url ?? "/", base);
    const q = url.searchParams.get("key");
    return q?.trim() || undefined;
  } catch {
    return undefined;
  }
};

const MAX_MINTS_DEFAULT = 30;

export const createTickStreamServer = (cfg: TickStreamServerConfig): TickStreamServer => {
  const clients = new Set<WebSocket>();
  const mintToSockets = new Map<string, Set<WebSocket>>();
  const socketMints = new WeakMap<WebSocket, Set<string>>();
  const maxMints = cfg.maxMintsPerSocket ?? MAX_MINTS_DEFAULT;

  const verifyKey = async (rawKey: string) => cfg.guardian.verifyApiKey(rawKey);

  const removeSocketFromMint = (mint: string, ws: WebSocket) => {
    const set = mintToSockets.get(mint);
    if (!set) {
      return;
    }
    set.delete(ws);
    if (set.size === 0) {
      mintToSockets.delete(mint);
    }
  };

  const handleControlMessage = (ws: WebSocket, raw: string) => {
    let msg: { op?: string; mints?: unknown };
    try {
      msg = JSON.parse(raw) as { op?: string; mints?: unknown };
    } catch {
      return;
    }
    if (msg.op !== "subscribe" && msg.op !== "unsubscribe") {
      return;
    }
    if (!Array.isArray(msg.mints) || msg.mints.length === 0) {
      return;
    }
    const mints = msg.mints.filter((m): m is string => typeof m === "string" && m.length >= 32 && m.length <= 64);
    if (mints.length === 0) {
      return;
    }

    let tracked = socketMints.get(ws);
    if (!tracked) {
      tracked = new Set();
      socketMints.set(ws, tracked);
    }

    if (msg.op === "subscribe") {
      const room = Math.min(mints.length, Math.max(0, maxMints - tracked.size));
      for (let i = 0; i < room; i++) {
        const mint = mints[i]!;
        tracked.add(mint);
        let set = mintToSockets.get(mint);
        if (!set) {
          set = new Set();
          mintToSockets.set(mint, set);
        }
        set.add(ws);
      }
      return;
    }

    for (const mint of mints) {
      if (tracked.has(mint)) {
        tracked.delete(mint);
        removeSocketFromMint(mint, ws);
      }
    }
  };

  const dispatchRedisPayload: TickStreamServer["dispatchRedisPayload"] = (payload) => {
    let parsed: { v?: number; type?: string; tokenMint?: string };
    try {
      parsed = JSON.parse(payload) as { v?: number; type?: string; tokenMint?: string };
    } catch {
      return;
    }
    if (parsed.v !== 1 || parsed.type !== "tick" || typeof parsed.tokenMint !== "string") {
      return;
    }
    const mint = parsed.tokenMint;
    const targets = mintToSockets.get(mint);
    if (!targets || targets.size === 0) {
      return;
    }
    for (const ws of targets) {
      if (ws.readyState !== WebSocket.OPEN) {
        continue;
      }
      if (ws.bufferedAmount > 512_000) {
        continue;
      }
      try {
        ws.send(payload);
      } catch {
        clients.delete(ws);
      }
    }
  };

  let httpServer: http.Server | undefined;
  let wss: WebSocketServer | undefined;

  const start: TickStreamServer["start"] = async () => {
    if (httpServer) {
      return;
    }
    httpServer = http.createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    wss = new WebSocketServer({ noServer: true });

    httpServer.on("upgrade", (req, socket, head) => {
      void (async () => {
        const key = extractClientKey(req);
        if (!key) {
          socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
          socket.destroy();
          return;
        }
        let verified: Awaited<ReturnType<GuardianClient["verifyApiKey"]>>;
        try {
          verified = await verifyKey(key);
        } catch {
          socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
          socket.destroy();
          return;
        }
        if (!verified.valid) {
          socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
          socket.destroy();
          return;
        }
        if (cfg.requirePurpose !== undefined && cfg.requirePurpose.length > 0) {
          const purpose = verified.meta?.purpose;
          if (typeof purpose !== "string" || purpose !== cfg.requirePurpose) {
            socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
            socket.destroy();
            return;
          }
        }
        if (clients.size >= cfg.maxClients) {
          socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
          socket.destroy();
          return;
        }
        wss!.handleUpgrade(req, socket, head, (ws) => {
          clients.add(ws);
          ws.on("message", (data) => {
            try {
              handleControlMessage(ws, data.toString());
            } catch {
              /* ignore */
            }
          });
          ws.on("close", () => {
            clients.delete(ws);
            const mints = socketMints.get(ws);
            if (mints) {
              for (const mint of mints) {
                removeSocketFromMint(mint, ws);
              }
              mints.clear();
            }
          });
          ws.on("error", () => {
            clients.delete(ws);
          });
        });
      })().catch(() => {
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      httpServer!.once("error", reject);
      httpServer!.listen(cfg.port, cfg.host, () => {
        httpServer!.off("error", reject);
        resolve();
      });
    });
  };

  const stop: TickStreamServer["stop"] = async () => {
    for (const ws of clients) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    clients.clear();
    mintToSockets.clear();
    await new Promise<void>((resolve) => {
      if (wss) {
        const server = wss;
        wss = undefined;
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
    await new Promise<void>((resolve, reject) => {
      if (httpServer) {
        httpServer.close((err) => (err ? reject(err) : resolve()));
        httpServer = undefined;
      } else {
        resolve();
      }
    });
  };

  return { start, stop, dispatchRedisPayload };
};
