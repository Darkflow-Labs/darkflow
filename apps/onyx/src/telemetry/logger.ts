import pino, { type LoggerOptions } from "pino";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

type CreateLoggerInput = {
  level: "debug" | "info" | "warn" | "error";
  component: string;
  logFilePath?: string;
  logToFileEnabled?: boolean;
  /** Pretty-print to stdout (dev). JSON lines still go to file when file logging is on. */
  logPretty?: boolean;
};

const redactPaths = [
  "privateKey",
  "privateKeyBase58",
  "userPrivateKeyBase58",
  "authKey",
  "ONYX_PRIVATE_KEY_BASE58",
  "ONYX_JITO_AUTH_KEY",
  "*.privateKey",
  "*.privateKeyBase58",
  "*.userPrivateKeyBase58",
  "*.authKey"
];

export const createLogger = ({
  level,
  component,
  logFilePath,
  logToFileEnabled = false,
  logPretty = false
}: CreateLoggerInput) => {
  const options: LoggerOptions = {
    level,
    base: { component },
    redact: {
      paths: redactPaths,
      remove: true
    }
  };

  const fileEnabled = Boolean(logToFileEnabled && logFilePath);

  if (logPretty) {
    const prettyStream = pino.transport({
      target: "pino-pretty",
      options: {
        colorize: true
      }
    });
    if (fileEnabled && logFilePath) {
      mkdirSync(dirname(logFilePath), { recursive: true });
      return pino(
        options,
        pino.multistream([
          { level: "trace", stream: prettyStream },
          { level: "trace", stream: pino.destination({ dest: logFilePath, sync: false }) }
        ])
      );
    }
    return pino(options, prettyStream);
  }

  if (fileEnabled && logFilePath) {
    mkdirSync(dirname(logFilePath), { recursive: true });
    return pino(
      options,
      pino.multistream([
        { level: "trace", stream: pino.destination(1) },
        { level: "trace", stream: pino.destination({ dest: logFilePath, sync: false }) }
      ])
    );
  }

  return pino(options, pino.destination(1));
};
