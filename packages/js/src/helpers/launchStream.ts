import { DarkflowConnectionError } from "../errors.js";
import type { ConnectLaunchStreamWithRetryOptions } from "../types.js";
import { LaunchStreamResource, type LaunchStreamResourceConfig } from "../resources/launchStream.js";
import type { LaunchMessage } from "../types.js";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const watchLaunches = async (
  stream: LaunchStreamResource,
  onLaunch: (launch: LaunchMessage) => void | Promise<void>,
  opts?: { signal?: AbortSignal }
): Promise<void> => {
  for await (const launch of stream.subscribe(opts)) {
    await onLaunch(launch);
  }
};

export const connectLaunchStreamWithRetry = async (
  config: LaunchStreamResourceConfig,
  options?: ConnectLaunchStreamWithRetryOptions
): Promise<LaunchStreamResource> => {
  const maxAttempts = options?.maxAttempts ?? 8;
  const initialBackoffMs = options?.initialBackoffMs ?? 400;
  const maxBackoffMs = options?.maxBackoffMs ?? 15_000;
  const signal = options?.signal;

  let attempt = 0;
  while (true) {
    if (signal?.aborted) {
      throw new DarkflowConnectionError("Aborted before launch stream connected", "ABORTED");
    }
    const stream = new LaunchStreamResource(config);
    try {
      await stream.connect();
      return stream;
    } catch (err) {
      stream.close();
      attempt += 1;
      if (attempt >= maxAttempts) {
        throw err;
      }
      const exp = Math.min(maxBackoffMs, initialBackoffMs * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * 250);
      await delay(exp + jitter);
    }
  }
};
