import { Redis as UpstashRedis } from "@upstash/redis";
import { createClient, type RedisClientType } from "redis";

type LogLike = {
  warn: (meta: unknown, message?: string) => void;
  debug: (meta: unknown, message?: string) => void;
};

export type InterestWatchAdapter = "redis" | "upstash";

/** Per-mint tick fanout interest (Sync WS mint subscribe, Onyx open position). */
export const mintTickWatchKey = (mint: string): string => `df:tick:watch:${mint}`;

/** Global: at least one Geyser WS client wants all tick payloads on Redis. */
export const TICK_FANOUT_WATCH_KEY = "df:tick:fanout_watch";

/** Global: at least one consumer wants launch events on Redis. */
export const LAUNCH_WATCH_KEY = "df:launch:watch";

export type InterestPublisherGateConfig = {
  adapter: InterestWatchAdapter;
  redisUrl?: string;
  upstashUrl?: string;
  upstashToken?: string;
  logger: LogLike;
  /** When false, always allows publish (pass-through). */
  filterEnabled: boolean;
  /**
   * When true (and filterEnabled), launch publishes require `LAUNCH_WATCH_KEY`.
   * Default false so launch channel keeps working when no Geyser WS client has registered interest yet.
   */
  filterLaunches?: boolean;
};

export type InterestPublisherGate = {
  shouldPublishTick(tokenMint: string): Promise<boolean>;
  shouldPublishLaunch(): Promise<boolean>;
  close: () => Promise<void>;
};

export type InterestWatchRegistryConfig = {
  adapter: InterestWatchAdapter;
  redisUrl?: string;
  upstashUrl?: string;
  upstashToken?: string;
  logger: LogLike;
  /** TTL for SET keys; refreshed by callers while interest remains. */
  watchTtlMs: number;
};

export type InterestWatchRegistry = {
  touchMintWatch(mint: string): Promise<void>;
  releaseMintWatch(mint: string): Promise<void>;
  touchLaunchWatch(): Promise<void>;
  releaseLaunchWatch(): Promise<void>;
  touchTickFanoutWatch(): Promise<void>;
  releaseTickFanoutWatch(): Promise<void>;
  close: () => Promise<void>;
};

export const createInterestPublisherGate = (input: InterestPublisherGateConfig): InterestPublisherGate => {
  if (!input.filterEnabled) {
    return {
      shouldPublishTick: async () => true,
      shouldPublishLaunch: async () => true,
      close: async () => Promise.resolve()
    };
  }

  const filterLaunches = input.filterLaunches === true;

  if (input.adapter === "upstash") {
    const { upstashUrl, upstashToken } = input;
    if (!upstashUrl || !upstashToken) {
      throw new Error("Upstash URL/token required for interest publisher gate");
    }
    const client = new UpstashRedis({ url: upstashUrl, token: upstashToken });

    return {
      async shouldPublishTick(tokenMint: string) {
        try {
          const mintKey = mintTickWatchKey(tokenMint);
          const [wMint, wFan] = await Promise.all([
            client.exists(mintKey),
            client.exists(TICK_FANOUT_WATCH_KEY)
          ]);
          return wMint === 1 || wFan === 1;
        } catch (err: unknown) {
          input.logger.warn({ err }, "Interest gate EXISTS failed; fail-open tick publish");
          return true;
        }
      },
      async shouldPublishLaunch() {
        if (!filterLaunches) {
          return true;
        }
        try {
          return (await client.exists(LAUNCH_WATCH_KEY)) === 1;
        } catch (err: unknown) {
          input.logger.warn({ err }, "Interest gate EXISTS failed; fail-open launch publish");
          return true;
        }
      },
      close: async () => Promise.resolve()
    };
  }

  const redisUrl = input.redisUrl;
  if (!redisUrl) {
    throw new Error("redisUrl required for tcp interest publisher gate");
  }

  let client: RedisClientType | undefined;
  let connectPromise: Promise<void> | undefined;

  const ensureConnected = async () => {
    if (client?.isOpen) {
      return;
    }
    if (connectPromise) {
      await connectPromise;
      return;
    }
    connectPromise = (async () => {
      const c = createClient({ url: redisUrl });
      c.on("error", (err: unknown) => {
        input.logger.warn({ err }, "Redis interest gate connection error");
      });
      await c.connect();
      client = c as RedisClientType;
    })();
    await connectPromise;
  };

  return {
    async shouldPublishTick(tokenMint: string) {
      try {
        await ensureConnected();
        if (!client?.isOpen) {
          return true;
        }
        const mintKey = mintTickWatchKey(tokenMint);
        const wMint = await client.exists(mintKey);
        const wFan = await client.exists(TICK_FANOUT_WATCH_KEY);
        return wMint === 1 || wFan === 1;
      } catch (err: unknown) {
        input.logger.warn({ err }, "Interest gate EXISTS failed; fail-open tick publish");
        return true;
      }
    },
    async shouldPublishLaunch() {
      if (!filterLaunches) {
        return true;
      }
      try {
        await ensureConnected();
        if (!client?.isOpen) {
          return true;
        }
        return (await client.exists(LAUNCH_WATCH_KEY)) === 1;
      } catch (err: unknown) {
        input.logger.warn({ err }, "Interest gate EXISTS failed; fail-open launch publish");
        return true;
      }
    },
    close: async () => {
      connectPromise = undefined;
      if (client?.isOpen) {
        await client.quit();
      }
      client = undefined;
    }
  };
};

export const createInterestWatchRegistry = (input: InterestWatchRegistryConfig): InterestWatchRegistry => {
  const px = input.watchTtlMs;

  if (input.adapter === "upstash") {
    const { upstashUrl, upstashToken } = input;
    if (!upstashUrl || !upstashToken) {
      throw new Error("Upstash URL/token required for interest watch registry");
    }
    const client = new UpstashRedis({ url: upstashUrl, token: upstashToken });
    const setOpts = { px: px };

    return {
      touchMintWatch: async (mint: string) => {
        try {
          await client.set(mintTickWatchKey(mint), "1", setOpts);
        } catch (err: unknown) {
          input.logger.debug({ err, mint }, "touchMintWatch failed");
        }
      },
      releaseMintWatch: async (mint: string) => {
        try {
          await client.del(mintTickWatchKey(mint));
        } catch (err: unknown) {
          input.logger.debug({ err, mint }, "releaseMintWatch failed");
        }
      },
      touchLaunchWatch: async () => {
        try {
          await client.set(LAUNCH_WATCH_KEY, "1", setOpts);
        } catch (err: unknown) {
          input.logger.debug({ err }, "touchLaunchWatch failed");
        }
      },
      releaseLaunchWatch: async () => {
        try {
          await client.del(LAUNCH_WATCH_KEY);
        } catch (err: unknown) {
          input.logger.debug({ err }, "releaseLaunchWatch failed");
        }
      },
      touchTickFanoutWatch: async () => {
        try {
          await client.set(TICK_FANOUT_WATCH_KEY, "1", setOpts);
        } catch (err: unknown) {
          input.logger.debug({ err }, "touchTickFanoutWatch failed");
        }
      },
      releaseTickFanoutWatch: async () => {
        try {
          await client.del(TICK_FANOUT_WATCH_KEY);
        } catch (err: unknown) {
          input.logger.debug({ err }, "releaseTickFanoutWatch failed");
        }
      },
      close: async () => Promise.resolve()
    };
  }

  const redisUrl = input.redisUrl;
  if (!redisUrl) {
    throw new Error("redisUrl required for tcp interest watch registry");
  }

  let client: RedisClientType | undefined;
  let connectPromise: Promise<void> | undefined;

  const ensureConnected = async () => {
    if (client?.isOpen) {
      return;
    }
    if (connectPromise) {
      await connectPromise;
      return;
    }
    connectPromise = (async () => {
      const c = createClient({ url: redisUrl });
      c.on("error", (err: unknown) => {
        input.logger.warn({ err }, "Redis interest registry connection error");
      });
      await c.connect();
      client = c as RedisClientType;
    })();
    await connectPromise;
  };

  const setKey = async (key: string) => {
    await ensureConnected();
    if (!client?.isOpen) {
      return;
    }
    await client.set(key, "1", { PX: px });
  };

  const delKey = async (key: string) => {
    await ensureConnected();
    if (!client?.isOpen) {
      return;
    }
    await client.del(key);
  };

  return {
    touchMintWatch: async (mint: string) => setKey(mintTickWatchKey(mint)),
    releaseMintWatch: async (mint: string) => delKey(mintTickWatchKey(mint)),
    touchLaunchWatch: async () => setKey(LAUNCH_WATCH_KEY),
    releaseLaunchWatch: async () => delKey(LAUNCH_WATCH_KEY),
    touchTickFanoutWatch: async () => setKey(TICK_FANOUT_WATCH_KEY),
    releaseTickFanoutWatch: async () => delKey(TICK_FANOUT_WATCH_KEY),
    close: async () => {
      connectPromise = undefined;
      if (client?.isOpen) {
        await client.quit();
      }
      client = undefined;
    }
  };
};
