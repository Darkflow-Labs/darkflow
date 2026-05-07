import { Redis as UpstashRedis } from "@upstash/redis";
import { createClient } from "redis";

type LogLike = {
  warn: (meta: unknown, message?: string) => void;
  debug: (meta: unknown, message?: string) => void;
};

export type PriceTickPubPayload = {
  v: 1;
  type: "tick";
  tokenMint: string;
  priceSol: number;
  receivedAt: number;
  source: string;
  eventType?: string;
};

export const toTickPubPayload = (tick: {
  tokenMint: string;
  priceSol: number;
  receivedAt: number;
  source: string;
  eventType?: string;
}): PriceTickPubPayload => ({
  v: 1,
  type: "tick",
  tokenMint: tick.tokenMint,
  priceSol: tick.priceSol,
  receivedAt: tick.receivedAt,
  source: tick.source,
  ...(tick.eventType !== undefined ? { eventType: tick.eventType } : {}),
});

export type TickPubSubAdapter = "redis" | "upstash";

export type TickPublisher = {
  publish: (tick: {
    tokenMint: string;
    priceSol: number;
    receivedAt: number;
    source: string;
    eventType?: string;
  }) => void;
  close: () => Promise<void>;
};

export type TickSubscriber = {
  subscribe: (onMessage: (payload: string) => void) => Promise<void>;
  unsubscribe: () => Promise<void>;
  close: () => Promise<void>;
};

type AdapterInput = {
  adapter: TickPubSubAdapter;
  channel: string;
  logger: LogLike;
  redisUrl?: string;
  upstashUrl?: string;
  upstashToken?: string;
};

export const createTickPublisher = (input: AdapterInput): TickPublisher => {
  if (input.adapter === "upstash") {
    const { upstashUrl, upstashToken } = input;
    if (!upstashUrl || !upstashToken) {
      throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for upstash adapter");
    }
    const client = new UpstashRedis({ url: upstashUrl, token: upstashToken });
    return {
      publish: (tick) => {
        void client.publish(input.channel, JSON.stringify(toTickPubPayload(tick))).catch((err) => {
          input.logger.debug({ err }, "Upstash tick publish failed");
        });
      },
      close: async () => Promise.resolve(),
    };
  }

  const { redisUrl } = input;
  if (!redisUrl) {
    throw new Error("REDIS_PUBSUB_URL is required for redis adapter");
  }
  let client: ReturnType<typeof createClient> | undefined;
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
        input.logger.warn({ err }, "Redis tick publisher connection error");
      });
      await c.connect();
      client = c;
    })();
    await connectPromise;
  };

  return {
    publish: (tick) => {
      void (async () => {
        try {
          await ensureConnected();
          if (!client?.isOpen) {
            return;
          }
          await client.publish(input.channel, JSON.stringify(toTickPubPayload(tick)));
        } catch (err: unknown) {
          input.logger.debug({ err }, "Redis tick publish failed");
        }
      })();
    },
    close: async () => {
      connectPromise = undefined;
      if (client?.isOpen) {
        await client.quit();
      }
      client = undefined;
    },
  };
};

export const createTickSubscriber = (input: AdapterInput): TickSubscriber => {
  if (input.adapter === "upstash") {
    const { upstashUrl, upstashToken } = input;
    if (!upstashUrl || !upstashToken) {
      throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for upstash adapter");
    }
    const client = new UpstashRedis({ url: upstashUrl, token: upstashToken });
    let active = false;
    let subscriber:
      | {
          on: (type: string, listener: (event: { channel: string; message: unknown }) => void) => void;
          unsubscribe: (channels?: string[]) => Promise<void>;
          removeAllListeners: () => void;
        }
      | undefined;

    return {
      subscribe: async (onMessage) => {
        if (active) {
          return;
        }
        active = true;
        const created = (await (client as unknown as { subscribe: (ch: string) => Promise<unknown> }).subscribe(
          input.channel
        )) as {
          on: (type: string, listener: (event: { channel: string; message: unknown }) => void) => void;
          unsubscribe: (channels?: string[]) => Promise<void>;
          removeAllListeners: () => void;
        };
        subscriber = created;
        subscriber.on("message", (event) => {
          if (typeof event?.message === "string") {
            onMessage(event.message);
          }
        });
      },
      unsubscribe: async () => {
        active = false;
        if (subscriber) {
          await subscriber.unsubscribe([input.channel]);
          subscriber.removeAllListeners();
          subscriber = undefined;
        }
      },
      close: async () => {
        active = false;
        if (subscriber) {
          await subscriber.unsubscribe([input.channel]);
          subscriber.removeAllListeners();
          subscriber = undefined;
        }
      },
    };
  }

  const { redisUrl } = input;
  if (!redisUrl) {
    throw new Error("REDIS_URL/REDIS_PUBSUB_URL is required for redis adapter");
  }
  const client = createClient({ url: redisUrl });
  client.on("error", (err: unknown) => {
    input.logger.warn({ err }, "Redis subscriber error");
  });

  return {
    subscribe: async (onMessage) => {
      if (!client.isOpen) {
        await client.connect();
      }
      await client.subscribe(input.channel, (message) => {
        if (typeof message === "string") {
          onMessage(message);
        }
      });
    },
    unsubscribe: async () => {
      if (client.isOpen) {
        await client.unsubscribe(input.channel);
      }
    },
    close: async () => {
      if (client.isOpen) {
        await client.quit();
      }
    },
  };
};
