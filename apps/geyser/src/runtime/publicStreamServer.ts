import { createServer } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import type { Logger } from "pino";
import type { GeyserLaunchEvent, GeyserTickEvent } from "./events.js";

type PublicStreamServerInput = {
  host: string;
  port: number;
  maxClients: number;
  authToken?: string;
  logger: Logger;
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
  private readonly server = createServer();
  private readonly wss: WebSocketServer;
  private readonly clients = new Map<WebSocket, ClientState>();

  public constructor(input: PublicStreamServerInput) {
    this.host = input.host;
    this.port = input.port;
    this.maxClients = input.maxClients;
    this.authToken = input.authToken;
    this.logger = input.logger;
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
      ws.on("message", (payload) => this.handleClientMessage(ws, payload.toString()));
      ws.on("close", () => this.clients.delete(ws));
      ws.on("error", () => this.clients.delete(ws));
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
    for (const client of this.clients.keys()) {
      try {
        client.close(1001, "server_shutdown");
      } catch {
        /* ignore */
      }
    }
    this.clients.clear();
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
      state.launches = nextValue;
      return;
    }
    state.ticks = nextValue;
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
