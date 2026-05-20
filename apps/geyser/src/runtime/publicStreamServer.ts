import { createServer } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import type { Logger } from "pino";
import type { InterestWatchRegistry } from "@darkflow/sync/interest";
import type { GeyserLaunchEvent, GeyserTickEvent } from "./events.js";

type PublicStreamServerInput = {
  host: string;
  port: number;
  maxClients: number;
  authToken?: string;
  logger: Logger;
  /** Register Redis keys used by `GEYSER_INTEREST_FILTER_ENABLED` on core. */
  interestWatch?: InterestWatchRegistry;
  /** Watch TTL for Redis SET keys (default `60000`). */
  interestWatchTtlMs?: number;
  /** Refresh interval while subscribers connected (default `interestWatchTtlMs / 2`). */
  interestWatchRefreshMs?: number;
};

type GeyserControlMessage = {
  op: "subscribe" | "unsubscribe";
  stream: "launches" | "ticks";
};

type ClientState = {
  launches: boolean;
  ticks: boolean;
};

const WS_OPEN = 1;
const MAX_BUFFERED_BYTES = 1_000_000;

export class PublicStreamServer {
  private readonly host: string;
  private readonly port: number;
  private readonly maxClients: number;
  private readonly authToken?: string;
  private readonly logger: Logger;
  private readonly interestWatch?: InterestWatchRegistry;
  private readonly interestWatchRefreshMs: number;
  private readonly server = createServer();
  private readonly wss: WebSocketServer;
  private readonly clients = new Map<WebSocket, ClientState>();

  private launchInterestCount = 0;
  private tickFanoutInterestCount = 0;
  private launchRefreshTimer?: ReturnType<typeof setInterval>;
  private tickFanoutRefreshTimer?: ReturnType<typeof setInterval>;

  public constructor(input: PublicStreamServerInput) {
    this.host = input.host;
    this.port = input.port;
    this.maxClients = input.maxClients;
    this.authToken = input.authToken;
    this.logger = input.logger;
    this.interestWatch = input.interestWatch;
    const ttlMs = input.interestWatchTtlMs ?? 60_000;
    this.interestWatchRefreshMs = input.interestWatchRefreshMs ?? Math.max(5_000, Math.floor(ttlMs / 2));
    this.wss = new WebSocketServer({ noServer: true });
    this.server.on("request", (req, res) => {
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, service: "darkflow-geyser" }));
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, message: "not_found" }));
    });
    this.server.on("upgrade", (req, socket, head) => {
      if (!this.isAuthorized(req.headers.authorization)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      if (this.clients.size >= this.maxClients) {
        socket.write("HTTP/1.1 503 Too Many Clients\r\n\r\n");
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit("connection", ws);
      });
    });
    this.wss.on("connection", (ws) => {
      this.clients.set(ws, { launches: true, ticks: true });
      this.adjustLaunchInterest(+1);
      this.adjustTickFanoutInterest(+1);
      ws.on("message", (payload) => this.handleClientMessage(ws, payload.toString()));
      ws.on("close", () => this.handleClientDisconnected(ws));
      ws.on("error", () => this.handleClientDisconnected(ws));
    });
  }

  public async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, this.host, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.launchRefreshTimer) {
      clearInterval(this.launchRefreshTimer);
      this.launchRefreshTimer = undefined;
    }
    if (this.tickFanoutRefreshTimer) {
      clearInterval(this.tickFanoutRefreshTimer);
      this.tickFanoutRefreshTimer = undefined;
    }
    void this.interestWatch?.releaseLaunchWatch();
    void this.interestWatch?.releaseTickFanoutWatch();

    for (const client of this.clients.keys()) {
      try {
        client.close(1001, "server_shutdown");
      } catch {
        /* ignore */
      }
    }
    this.clients.clear();
    this.launchInterestCount = 0;
    this.tickFanoutInterestCount = 0;
    this.wss.close();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  public broadcastLaunch(event: GeyserLaunchEvent): void {
    const payload = JSON.stringify(event);
    for (const [client, state] of this.clients.entries()) {
      if (!state.launches) {
        continue;
      }
      this.send(client, payload);
    }
  }

  public broadcastTick(event: GeyserTickEvent): void {
    const payload = JSON.stringify(event);
    for (const [client, state] of this.clients.entries()) {
      if (!state.ticks) {
        continue;
      }
      this.send(client, payload);
    }
  }

  private adjustLaunchInterest(delta: number): void {
    if (!this.interestWatch) {
      return;
    }
    const prev = this.launchInterestCount;
    this.launchInterestCount = Math.max(0, prev + delta);
    if (prev === 0 && this.launchInterestCount > 0) {
      void this.interestWatch.touchLaunchWatch();
      if (!this.launchRefreshTimer) {
        this.launchRefreshTimer = setInterval(() => {
          void this.interestWatch?.touchLaunchWatch();
        }, this.interestWatchRefreshMs);
      }
    }
    if (prev > 0 && this.launchInterestCount === 0) {
      if (this.launchRefreshTimer) {
        clearInterval(this.launchRefreshTimer);
        this.launchRefreshTimer = undefined;
      }
      void this.interestWatch.releaseLaunchWatch();
    }
  }

  private adjustTickFanoutInterest(delta: number): void {
    if (!this.interestWatch) {
      return;
    }
    const prev = this.tickFanoutInterestCount;
    this.tickFanoutInterestCount = Math.max(0, prev + delta);
    if (prev === 0 && this.tickFanoutInterestCount > 0) {
      void this.interestWatch.touchTickFanoutWatch();
      if (!this.tickFanoutRefreshTimer) {
        this.tickFanoutRefreshTimer = setInterval(() => {
          void this.interestWatch?.touchTickFanoutWatch();
        }, this.interestWatchRefreshMs);
      }
    }
    if (prev > 0 && this.tickFanoutInterestCount === 0) {
      if (this.tickFanoutRefreshTimer) {
        clearInterval(this.tickFanoutRefreshTimer);
        this.tickFanoutRefreshTimer = undefined;
      }
      void this.interestWatch.releaseTickFanoutWatch();
    }
  }

  private handleClientDisconnected(ws: WebSocket): void {
    const state = this.clients.get(ws);
    this.clients.delete(ws);
    if (!state) {
      return;
    }
    if (state.launches) {
      this.adjustLaunchInterest(-1);
    }
    if (state.ticks) {
      this.adjustTickFanoutInterest(-1);
    }
  }

  private send(client: WebSocket, payload: string): void {
    if (client.readyState !== WS_OPEN) {
      return;
    }
    if (client.bufferedAmount > MAX_BUFFERED_BYTES) {
      this.logger.debug({ bufferedAmount: client.bufferedAmount }, "Dropping stream message");
      return;
    }
    client.send(payload);
  }

  private handleClientMessage(client: WebSocket, raw: string): void {
    let parsed: GeyserControlMessage;
    try {
      parsed = JSON.parse(raw) as GeyserControlMessage;
    } catch {
      return;
    }
    if (parsed.stream !== "launches" && parsed.stream !== "ticks") {
      return;
    }
    const state = this.clients.get(client);
    if (!state) {
      return;
    }
    const nextValue = parsed.op === "subscribe";
    if (parsed.stream === "launches") {
      const before = state.launches;
      if (before === nextValue) {
        return;
      }
      state.launches = nextValue;
      this.adjustLaunchInterest(nextValue ? +1 : -1);
      return;
    }
    const beforeTicks = state.ticks;
    if (beforeTicks === nextValue) {
      return;
    }
    state.ticks = nextValue;
    this.adjustTickFanoutInterest(nextValue ? +1 : -1);
  }

  private isAuthorized(authHeader: string | undefined): boolean {
    if (!this.authToken) {
      return true;
    }
    const raw = authHeader ?? "";
    const token = raw.startsWith("Bearer ") ? raw.slice("Bearer ".length) : raw;
    return token.length > 0 && token === this.authToken;
  }
}
