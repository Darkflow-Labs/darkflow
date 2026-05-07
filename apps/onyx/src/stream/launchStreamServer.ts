import http from "node:http";
import type { Logger } from "pino";
import { WebSocketServer, WebSocket } from "ws";
import type { GuardianBilling, GuardianClient } from "@darkflow/guardian";
import type { LaunchSignal } from "../types/domain.js";

export type LaunchStreamServer = {
  start(): Promise<void>;
  stop(): Promise<void>;
  broadcast(launch: LaunchSignal): void;
};

export type LaunchStreamServerConfig = {
  guardian: GuardianClient;
  /** When set, each WS message runs Autumn check → send → track; upgrade path also enforces credits. */
  billing?: GuardianBilling;
  host: string;
  port: number;
  maxClients: number;
  logger: Logger;
  /** When set, verified key metadata must include `{ purpose: <value> }` as a string match */
  requirePurpose?: string;
};

const launchToDto = (launch: LaunchSignal) => ({
  type: "launch" as const,
  signature: launch.signature,
  tokenMint: launch.tokenMint,
  creator: launch.creator,
  receivedAt: launch.receivedAt,
  slot: launch.slot,
  source: launch.source,
  ...(launch.name !== undefined ? { name: launch.name } : {}),
  ...(launch.symbol !== undefined ? { symbol: launch.symbol } : {}),
  ...(launch.uri !== undefined ? { uri: launch.uri } : {}),
  ...(launch.bondingCurve !== undefined ? { bondingCurve: launch.bondingCurve } : {}),
  ...(launch.user !== undefined ? { user: launch.user } : {})
});

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

const wsCustomerBySocket = new WeakMap<WebSocket, string>();

export const createLaunchStreamServer = (cfg: LaunchStreamServerConfig): LaunchStreamServer => {
  const clients = new Set<WebSocket>();
  let httpServer: http.Server | undefined;
  let wss: WebSocketServer | undefined;

  const verifyKey = async (rawKey: string) => {
    if (cfg.billing) {
      return cfg.billing.getCachedUnkeyVerifyKey(rawKey, () => cfg.guardian.verifyApiKey(rawKey));
    }
    return cfg.guardian.verifyApiKey(rawKey);
  };

  const broadcast: LaunchStreamServer["broadcast"] = (launch) => {
    void (async () => {
      const payload = JSON.stringify(launchToDto(launch));
      for (const ws of clients) {
        if (ws.readyState !== WebSocket.OPEN) {
          continue;
        }
        if (ws.bufferedAmount > 512_000) {
          continue;
        }
        const customerId = wsCustomerBySocket.get(ws);
        if (cfg.billing) {
          if (!customerId) {
            continue;
          }
          try {
            await cfg.billing.assertLaunchStreamCreditsForCustomer(customerId);
          } catch (err: unknown) {
            cfg.logger.debug({ err, customerId }, "Launch stream message blocked by billing check.");
            continue;
          }
        }
        try {
          ws.send(payload);
        } catch {
          clients.delete(ws);
          continue;
        }
        if (cfg.billing && customerId) {
          try {
            await cfg.billing.trackLaunchStreamMessage(customerId);
          } catch (err: unknown) {
            cfg.logger.warn({ err, customerId }, "Autumn track failed after launch stream send.");
          }
        }
      }
    })().catch((err: unknown) => {
      cfg.logger.warn({ err }, "Launch stream broadcast failed.");
    });
  };

  const start: LaunchStreamServer["start"] = async () => {
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
        if (cfg.billing) {
          try {
            await cfg.billing.assertLaunchStreamAccess(verified);
          } catch {
            socket.write("HTTP/1.1 402 Payment Required\r\nConnection: close\r\n\r\n");
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
          const metaUser = verified.meta?.userId;
          if (typeof metaUser === "string" && metaUser.length > 0) {
            wsCustomerBySocket.set(ws, metaUser);
          }
          clients.add(ws);
          ws.on("close", () => {
            clients.delete(ws);
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

  const stop: LaunchStreamServer["stop"] = async () => {
    for (const ws of clients) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    clients.clear();
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

  return { start, stop, broadcast };
};
