import { DarkflowGeyserConnectionError } from "../errors.js";
import { GeyserStreamResource } from "../resources/stream.js";
import type { ConnectGeyserStreamWithRetryOptions, GeyserEvent } from "../types.js";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const connectGeyserStreamWithRetry = async (
  stream: GeyserStreamResource,
  options?: ConnectGeyserStreamWithRetryOptions
): Promise<GeyserStreamResource> => {
  const maxAttempts = options?.maxAttempts ?? 8;
  const initialBackoffMs = options?.initialBackoffMs ?? 400;
  const maxBackoffMs = options?.maxBackoffMs ?? 15_000;
  let attempt = 0;

  while (true) {
    if (options?.signal?.aborted) {
      throw new DarkflowGeyserConnectionError("Aborted before stream connected", "ABORTED");
    }
    try {
      await stream.connect();
      return stream;
    } catch (err) {
      attempt += 1;
      if (attempt >= maxAttempts) {
        throw err;
      }
      const exponential = Math.min(maxBackoffMs, initialBackoffMs * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * 250);
      await delay(exponential + jitter);
    }
  }
};

export const watchGeyserEvents = async (
  stream: GeyserStreamResource,
  onEvent: (event: GeyserEvent) => void | Promise<void>,
  signal?: AbortSignal
): Promise<void> => {
  for await (const event of stream.subscribe({ signal })) {
    await onEvent(event);
  }
};
