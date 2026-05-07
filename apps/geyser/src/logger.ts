import { pino } from "pino";
import type { GeyserServiceEnv } from "./config/env.js";

export const createLogger = (env: GeyserServiceEnv) =>
  pino({
    name: "darkflow-geyser",
    level: "info",
    transport: env.GEYSER_LOG_PRETTY
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            singleLine: true
          }
        }
      : undefined
  });
