import pino from "pino";
import type { SyncServiceEnv } from "./config/env.js";

export const createLogger = (env: SyncServiceEnv) =>
  pino({
    level: "info",
    ...(env.SYNC_LOG_PRETTY ? { transport: { target: "pino-pretty" } } : {})
  });
