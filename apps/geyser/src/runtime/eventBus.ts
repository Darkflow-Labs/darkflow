import { Redis as UpstashRedis } from "@upstash/redis";
import { createClient } from "redis";
import type { Logger } from "pino";
import type { TickPubSubAdapter } from "@darkflow/sync/pubsub";
import type { GeyserLaunchEvent, GeyserTickEvent } from "./events.js";

type EventBusInput = {
  adapter: TickPubSubAdapter;
  launchChannel: string;
  tickChannel: string;
  logger: Logger;
  redisUrl?: string;
  upstashUrl?: string;
  upstashToken?: string;
};

type EventHandler = (event: GeyserLaunchEvent | GeyserTickEvent) => void;

export type GeyserEventBus = {
  publishLaunch: (event: GeyserLaunchEvent) => void;
  publishTick: (event: GeyserTickEvent) => void;
  subscribe: (handler: EventHandler) => Promise<void>;
  unsubscribe: () => Promise<void>;
  close: () => Promise<void>;
};

export const createGeyserEventBus = (input: EventBusInput): GeyserEventBus => {
  if (input.adapter === "upstash") {
    const upstash = new UpstashRedis({
      url: input.upstashUrl as string,
      token: input.upstashToken as string
    });
    let launchSub:
      | {
          on: (type: string, listener: (event: { message: unknown }) => void) => void;
          unsubscribe: (channels?: string[]) => Promise<void>;
          removeAllListeners: () => void;
        }
      | undefined;
    let tickSub:
      | {
          on: (type: string, listener: (event: { message: unknown }) => void) => void;
          unsubscribe: (channels?: string[]) => Promise<void>;
          removeAllListeners: () => void;
        }
      | undefined;
    return {
      publishLaunch: (event) => {
        void upstash.publish(input.launchChannel, JSON.stringify(event)).catch((err) => {
          input.logger.debug({ err }, "Failed to publish launch event");
        });
      },
      publishTick: (event) => {
        void upstash.publish(input.tickChannel, JSON.stringify(event)).catch((err) => {
          input.logger.debug({ err }, "Failed to publish tick event");
        });
      },
      subscribe: async (handler) => {
        launchSub = (await (upstash as unknown as { subscribe: (ch: string) => Promise<unknown> }).subscribe(
          input.launchChannel
        )) as typeof launchSub;
        tickSub = (await (upstash as unknown as { subscribe: (ch: string) => Promise<unknown> }).subscribe(
          input.tickChannel
        )) as typeof tickSub;
        launchSub?.on("message", (event) => {
          if (typeof event.message === "string") {
            handler(JSON.parse(event.message) as GeyserLaunchEvent);
          }
        });
        tickSub?.on("message", (event) => {
          if (typeof event.message === "string") {
            handler(JSON.parse(event.message) as GeyserTickEvent);
          }
        });
      },
      unsubscribe: async () => {
        await launchSub?.unsubscribe([input.launchChannel]);
        await tickSub?.unsubscribe([input.tickChannel]);
        launchSub?.removeAllListeners();
        tickSub?.removeAllListeners();
        launchSub = undefined;
        tickSub = undefined;
      },
      close: async () => Promise.resolve()
    };
  }

  const redisClient = createClient({ url: input.redisUrl });
  const subClient = createClient({ url: input.redisUrl });
  redisClient.on("error", (err) => input.logger.warn({ err }, "Redis event publisher error"));
  subClient.on("error", (err) => input.logger.warn({ err }, "Redis event subscriber error"));
  return {
    publishLaunch: (event) => {
      void (async () => {
        if (!redisClient.isOpen) {
          await redisClient.connect();
        }
        await redisClient.publish(input.launchChannel, JSON.stringify(event));
      })().catch((err) => input.logger.debug({ err }, "Failed to publish launch event"));
    },
    publishTick: (event) => {
      void (async () => {
        if (!redisClient.isOpen) {
          await redisClient.connect();
        }
        await redisClient.publish(input.tickChannel, JSON.stringify(event));
      })().catch((err) => input.logger.debug({ err }, "Failed to publish tick event"));
    },
    subscribe: async (handler) => {
      if (!subClient.isOpen) {
        await subClient.connect();
      }
      await subClient.subscribe(input.launchChannel, (message) => {
        handler(JSON.parse(message) as GeyserLaunchEvent);
      });
      await subClient.subscribe(input.tickChannel, (message) => {
        handler(JSON.parse(message) as GeyserTickEvent);
      });
    },
    unsubscribe: async () => {
      if (!subClient.isOpen) {
        return;
      }
      await subClient.unsubscribe(input.launchChannel);
      await subClient.unsubscribe(input.tickChannel);
    },
    close: async () => {
      if (subClient.isOpen) {
        await subClient.quit();
      }
      if (redisClient.isOpen) {
        await redisClient.quit();
      }
    }
  };
};
