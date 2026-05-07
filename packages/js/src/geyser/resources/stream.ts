import { DarkflowGeyserConnectionError } from "../errors.js";
import { parseGeyserMessage } from "../parse/parseGeyserMessage.js";
import type { GeyserEvent, GeyserStreamAuthMode, GeyserSubscribeOptions } from "../types.js";
import { openGeyserSocket } from "../ws/openGeyserSocket.js";

const WS_OPEN = 1;

const getReadyState = (socket: unknown): number => {
  if (socket && typeof socket === "object" && "readyState" in socket) {
    const state = (socket as { readyState: unknown }).readyState;
    return typeof state === "number" ? state : 0;
  }
  return 0;
};

type StreamConfig = {
  streamUrl: string | URL;
  apiKey: string;
  streamAuth: GeyserStreamAuthMode;
};

type ControlMessage = {
  op: "subscribe" | "unsubscribe";
  stream: "launches" | "ticks";
};

export class GeyserStreamResource {
  private socket: unknown | null = null;
  private detachHandlers: (() => void) | null = null;
  private closed = false;

  public constructor(private readonly config: StreamConfig) {}

  public async connect(): Promise<void> {
    if (this.closed) {
      throw new DarkflowGeyserConnectionError("Stream is closed", "STREAM_CLOSED");
    }
    if (this.socket && getReadyState(this.socket) === WS_OPEN) {
      return;
    }
    this.closeSocketOnly();
    const socket = await openGeyserSocket(
      this.config.streamUrl,
      this.config.apiKey,
      this.config.streamAuth
    );
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      if (getReadyState(socket) === WS_OPEN) {
        resolve();
        return;
      }
      const maybeNodeSocket = socket as {
        once?: (ev: string, fn: (...args: unknown[]) => void) => void;
        addEventListener?: (ev: string, fn: (event: unknown) => void, options?: { once?: boolean }) => void;
      };
      const handleOpen = () => resolve();
      const handleError = (err: unknown) =>
        reject(
          new DarkflowGeyserConnectionError("WebSocket connection failed", "WS_CONNECT_ERROR", {
            err: String(err)
          })
        );
      if (typeof maybeNodeSocket.once === "function") {
        maybeNodeSocket.once("open", handleOpen);
        maybeNodeSocket.once("error", handleError);
        return;
      }
      if (typeof maybeNodeSocket.addEventListener === "function") {
        maybeNodeSocket.addEventListener("open", handleOpen, { once: true });
        maybeNodeSocket.addEventListener("error", handleError, { once: true });
        return;
      }
      reject(new DarkflowGeyserConnectionError("Unsupported socket implementation", "WS_UNSUPPORTED"));
    });
  }

  public async *subscribe(options?: GeyserSubscribeOptions): AsyncGenerator<GeyserEvent> {
    await this.connect();
    const signal = options?.signal;
    const queue: GeyserEvent[] = [];
    let pending: (() => void) | null = null;
    const wake = () => {
      pending?.();
      pending = null;
    };
    const wait = () =>
      new Promise<void>((resolve) => {
        pending = resolve;
        if (signal) {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener("abort", () => resolve(), { once: true });
        }
      });

    if (!this.socket) {
      throw new DarkflowGeyserConnectionError("Socket not initialized", "WS_INTERNAL");
    }

    const shouldIncludeLaunches = options?.includeLaunches ?? true;
    const shouldIncludeTicks = options?.includeTicks ?? true;
    this.sendControl({
      op: shouldIncludeLaunches ? "subscribe" : "unsubscribe",
      stream: "launches"
    });
    this.sendControl({
      op: shouldIncludeTicks ? "subscribe" : "unsubscribe",
      stream: "ticks"
    });

    this.detachHandlers = this.attachSocketHandlers(this.socket, {
      onMessage: (message) => {
        try {
          const event = parseGeyserMessage(message);
          queue.push(event);
          wake();
        } catch {
          // ignore unknown frames
        }
      },
      onClose: () => {
        this.closed = true;
        wake();
      },
      onError: () => wake()
    });

    try {
      while (true) {
        if (signal?.aborted || this.closed) {
          return;
        }
        if (queue.length > 0) {
          yield queue.shift() as GeyserEvent;
          continue;
        }
        await wait();
      }
    } finally {
      this.detachHandlers?.();
      this.detachHandlers = null;
    }
  }

  public close(): void {
    this.closed = true;
    this.closeSocketOnly();
  }

  private sendControl(message: ControlMessage): void {
    if (!this.socket) {
      return;
    }
    const payload = JSON.stringify(message);
    const maybeNodeSocket = this.socket as { send?: (data: string) => void };
    maybeNodeSocket.send?.(payload);
  }

  private closeSocketOnly(): void {
    this.detachHandlers?.();
    this.detachHandlers = null;
    try {
      const maybeNodeSocket = this.socket as { close?: (code?: number, reason?: string) => void } | null;
      maybeNodeSocket?.close?.();
    } catch {
      // ignore
    }
    this.socket = null;
  }

  private attachSocketHandlers(
    socket: unknown,
    handlers: {
      onMessage: (text: string) => void;
      onClose: () => void;
      onError: () => void;
    }
  ): () => void {
    const maybeNodeSocket = socket as {
      on?: (event: string, listener: (...args: unknown[]) => void) => void;
      off?: (event: string, listener: (...args: unknown[]) => void) => void;
      addEventListener?: (event: string, listener: (event: Event) => void) => void;
      removeEventListener?: (event: string, listener: (event: Event) => void) => void;
    };
    if (typeof maybeNodeSocket.on === "function" && typeof maybeNodeSocket.off === "function") {
      const onMessage = (raw: unknown) => handlers.onMessage(raw?.toString?.() ?? "");
      const onClose = () => handlers.onClose();
      const onError = () => handlers.onError();
      maybeNodeSocket.on("message", onMessage);
      maybeNodeSocket.on("close", onClose);
      maybeNodeSocket.on("error", onError);
      return () => {
        maybeNodeSocket.off?.("message", onMessage);
        maybeNodeSocket.off?.("close", onClose);
        maybeNodeSocket.off?.("error", onError);
      };
    }
    if (
      typeof maybeNodeSocket.addEventListener === "function" &&
      typeof maybeNodeSocket.removeEventListener === "function"
    ) {
      const onMessage = (event: Event) => {
        const payload = (event as MessageEvent).data;
        handlers.onMessage(typeof payload === "string" ? payload : String(payload));
      };
      const onClose = () => handlers.onClose();
      const onError = () => handlers.onError();
      maybeNodeSocket.addEventListener("message", onMessage);
      maybeNodeSocket.addEventListener("close", onClose);
      maybeNodeSocket.addEventListener("error", onError);
      return () => {
        maybeNodeSocket.removeEventListener?.("message", onMessage);
        maybeNodeSocket.removeEventListener?.("close", onClose);
        maybeNodeSocket.removeEventListener?.("error", onError);
      };
    }
    throw new DarkflowGeyserConnectionError("Unsupported socket implementation", "WS_UNSUPPORTED");
  }
}
