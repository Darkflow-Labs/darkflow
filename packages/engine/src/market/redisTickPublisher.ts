import { createClient } from "redis";
import type { Logger } from "pino";

/** Wire format for Redis pub/sub; matches what `apps/sync` forwards to browsers. */
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
  ...(tick.eventType !== undefined ? { eventType: tick.eventType } : {})
});

export type RedisTickPublisher = {
  publish: (tick: {
    tokenMint: string;
    priceSol: number;
    receivedAt: number;
    source: string;
    eventType?: string;
  }) => void;
  close: () => Promise<void>;
};

export const createRedisTickPublisher = (input: {
  url: string;
  channel: string;
  logger: Logger;
}): RedisTickPublisher => {
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
      const c = createClient({ url: input.url });
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
    }
  };
};
