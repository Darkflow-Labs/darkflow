import { loadEnv } from "./config/env.js";
import { createLogger } from "./logger.js";
import { toLaunchEvent, toTickEvent } from "./runtime/events.js";
import { createGeyserEventBus } from "./runtime/eventBus.js";
import { GeyserIngestor } from "./runtime/geyserIngestor.js";
import { PublicStreamServer } from "./runtime/publicStreamServer.js";

const env = loadEnv();
const logger = createLogger(env);

const eventBus = createGeyserEventBus({
  adapter: env.GEYSER_REDIS_ADAPTER,
  launchChannel: env.GEYSER_REDIS_LAUNCH_CHANNEL,
  tickChannel: env.GEYSER_REDIS_PRICE_TICK_CHANNEL,
  logger,
  redisUrl: env.GEYSER_REDIS_URL,
  upstashUrl: env.GEYSER_UPSTASH_REDIS_REST_URL,
  upstashToken: env.GEYSER_UPSTASH_REDIS_REST_TOKEN
});

const ingestor =
  env.GEYSER_ROLE === "core"
    ? new GeyserIngestor({
        endpoint: env.GEYSER_UPSTREAM_ENDPOINT as string,
        xToken: env.GEYSER_UPSTREAM_X_TOKEN,
        programId: env.GEYSER_PROGRAM_ID,
        logger
      })
    : undefined;

const streamServer = env.GEYSER_WS_ENABLED
  ? new PublicStreamServer({
      host: env.GEYSER_WS_HOST,
      port: env.GEYSER_WS_PORT,
      maxClients: env.GEYSER_WS_MAX_CLIENTS,
      authToken: env.GEYSER_WS_AUTH_TOKEN,
      logger
    })
  : undefined;

let shuttingDown = false;

const run = async () => {
  if (streamServer) {
    await streamServer.start();
    logger.info(
      {
        host: env.GEYSER_WS_HOST,
        port: env.GEYSER_WS_PORT,
        maxClients: env.GEYSER_WS_MAX_CLIENTS
      },
      "Darkflow Geyser WS stream listening"
    );
  }

  await eventBus.subscribe((event) => {
    if (event.type === "launch") {
      streamServer?.broadcastLaunch(event);
      return;
    }
    streamServer?.broadcastTick(event);
  });

  if (ingestor) {
    ingestor.onLaunch((signal) => {
      eventBus.publishLaunch(toLaunchEvent(signal));
    });
    ingestor.onTick((tick) => {
      eventBus.publishTick(toTickEvent(tick));
    });
    ingestor.start();
    logger.info(
      {
        role: env.GEYSER_ROLE,
        endpoint: env.GEYSER_UPSTREAM_ENDPOINT,
        redisAdapter: env.GEYSER_REDIS_ADAPTER,
        launchChannel: env.GEYSER_REDIS_LAUNCH_CHANNEL,
        tickChannel: env.GEYSER_REDIS_PRICE_TICK_CHANNEL
      },
      "Darkflow Geyser core started"
    );
    return;
  }

  logger.info(
    {
      role: env.GEYSER_ROLE,
      redisAdapter: env.GEYSER_REDIS_ADAPTER,
      launchChannel: env.GEYSER_REDIS_LAUNCH_CHANNEL,
      tickChannel: env.GEYSER_REDIS_PRICE_TICK_CHANNEL
    },
    "Darkflow Geyser edge relay started"
  );
};

const shutdown = async () => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  ingestor?.stop();
  await eventBus.unsubscribe();
  await eventBus.close();
  if (streamServer) {
    await streamServer.stop();
  }
  logger.info("Darkflow Geyser service shut down");
};

void run().catch((err: unknown) => {
  logger.error({ err }, "Darkflow Geyser failed to start");
  process.exit(1);
});

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
