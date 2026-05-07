import { createGuardianClient } from "@darkflow/guardian";
import { createTickSubscriber } from "@darkflow/sync/pubsub";
import { loadEnv } from "./config/env.js";
import { createLogger } from "./logger.js";
import { createTickStreamServer } from "./tickStreamServer.js";

const env = loadEnv();
const logger = createLogger(env);
const guardian = createGuardianClient({ rootKey: env.SYNC_UNKEY_VERIFY_ROOT_KEY });

const tickServer = createTickStreamServer({
  guardian,
  host: env.SYNC_WS_HOST,
  port: env.SYNC_WS_PORT,
  maxClients: env.SYNC_WS_MAX_CLIENTS,
  logger,
  requirePurpose: env.SYNC_REQUIRE_META_PURPOSE
});

const tickSubscriber = createTickSubscriber({
  adapter: env.REDIS_PUBSUB_ADAPTER,
  channel: env.REDIS_PRICE_TICK_CHANNEL,
  logger,
  redisUrl: env.REDIS_URL,
  upstashUrl: env.UPSTASH_REDIS_REST_URL,
  upstashToken: env.UPSTASH_REDIS_REST_TOKEN
});

let shuttingDown = false;

const run = async () => {
  await tickServer.start();
  logger.info(
    { host: env.SYNC_WS_HOST, port: env.SYNC_WS_PORT, maxClients: env.SYNC_WS_MAX_CLIENTS },
    "Price tick WebSocket listening"
  );

  await tickSubscriber.subscribe((message) => {
    tickServer.dispatchRedisPayload(message);
  });
  logger.info({ channel: env.REDIS_PRICE_TICK_CHANNEL }, "Subscribed to Redis tick channel");
};

const shutdown = async () => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  try {
    await tickSubscriber.unsubscribe();
  } catch {
    /* ignore */
  }
  try {
    await tickSubscriber.close();
  } catch {
    /* ignore */
  }
  await tickServer.stop();
  logger.info("Sync tick stream shut down");
};

void run().catch((err: unknown) => {
  logger.error({ err }, "Sync service failed to start");
  process.exit(1);
});

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
