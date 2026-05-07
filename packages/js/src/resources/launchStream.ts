import { DarkflowConnectionError } from "../errors.js";
import { parseLaunchMessage } from "../parse/launchMessage.js";
import type { DarkflowConfig, LaunchMessage, SubscribeLaunchesOptions } from "../types.js";
import { attachSocketHandlers } from "../ws/attachSocketHandlers.js";
import { openLaunchStreamSocket } from "../ws/openLaunchStreamSocket.js";

const WS_OPEN = 1;

const getReadyState = (socket: unknown): number => {
  if (socket && typeof socket === "object" && "readyState" in socket) {
    const rs = (socket as { readyState: unknown }).readyState;
    return typeof rs === "number" ? rs : 0;
  }
  return 0;
};

export type LaunchStreamResourceConfig = Pick<
  DarkflowConfig,
  "apiKey" | "launchStreamUrl" | "launchStreamAuth" | "debug"
>;

export class LaunchStreamResource {
  private socket: unknown | null = null;
  private detachHandlers: (() => void) | null = null;
  private closed = false;

  public constructor(private readonly streamConfig: LaunchStreamResourceConfig) {}

  public async connect(): Promise<void> {
    if (this.closed) {
      throw new DarkflowConnectionError("Launch stream is closed", "ALREADY_CLOSED");
    }
    if (this.socket && getReadyState(this.socket) === WS_OPEN) {
      return;
    }
    this.closeSocketOnly();
    const auth = this.streamConfig.launchStreamAuth ?? "query";
    const socket = await openLaunchStreamSocket(
      this.streamConfig.launchStreamUrl,
      this.streamConfig.apiKey,
      auth
    );
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      if (getReadyState(socket) === WS_OPEN) {
        resolve();
        return;
      }
      const s = socket as {
        once?: (ev: string, fn: (...args: unknown[]) => void) => void;
        addEventListener?: (ev: string, fn: (e: unknown) => void, opts?: { once?: boolean }) => void;
      };
      const onOpen = () => {
        resolve();
      };
      const onError = (err: unknown) => {
        reject(
          new DarkflowConnectionError(
            "WebSocket connection error",
            "WS_CONNECT_ERROR",
            { err: String(err) }
          )
        );
      };
      if (typeof s.once === "function") {
        s.once("open", onOpen);
        s.once("error", onError);
      } else if (typeof s.addEventListener === "function") {
        s.addEventListener("open", onOpen, { once: true });
        s.addEventListener("error", onError, { once: true });
      } else {
        reject(new DarkflowConnectionError("WebSocket has no open/error hooks", "WS_UNSUPPORTED"));
        return;
      }
      if (getReadyState(socket) === WS_OPEN) {
        resolve();
      }
    });

    if (this.streamConfig.debug) {
      // eslint-disable-next-line no-console
      console.log("[@darkflow/js] launch stream connected");
    }
  }

  /**
   * Async iterator of parsed `launch` messages until `close()` or abort.
   */
  public async *subscribe(opts?: SubscribeLaunchesOptions): AsyncGenerator<LaunchMessage> {
    await this.connect();
    const signal = opts?.signal;
    const queue: LaunchMessage[] = [];
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
      throw new DarkflowConnectionError("Socket not initialized", "WS_INTERNAL");
    }

    this.detachHandlers = attachSocketHandlers(this.socket, {
      onMessage: (text) => {
        try {
          queue.push(parseLaunchMessage(text));
          wake();
        } catch {
          /* ignore malformed frames */
        }
      },
      onClose: () => {
        this.closed = true;
        wake();
      },
      onError: () => {
        wake();
      }
    });

    try {
      while (true) {
        if (signal?.aborted) {
          return;
        }
        if (queue.length > 0) {
          yield queue.shift()!;
          continue;
        }
        if (this.closed) {
          return;
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
    this.detachHandlers?.();
    this.detachHandlers = null;
    try {
      const s = this.socket as { close?: (code?: number, reason?: string) => void } | null;
      s?.close?.();
    } catch {
      /* ignore */
    }
    this.socket = null;
  }

  private closeSocketOnly(): void {
    this.detachHandlers?.();
    this.detachHandlers = null;
    try {
      const s = this.socket as { close?: (code?: number, reason?: string) => void } | null;
      s?.close?.();
    } catch {
      /* ignore */
    }
    this.socket = null;
  }
}
