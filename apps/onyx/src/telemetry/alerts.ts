import type { Logger } from "pino";

type AlertLevel = "info" | "warn" | "error";

export class AlertBus {
  private readonly logger: Logger;

  public constructor(logger: Logger) {
    this.logger = logger;
  }

  public emit(level: AlertLevel, message: string, details?: Record<string, unknown>) {
    const payload = { alert: true, ...details };
    if (level === "info") {
      this.logger.info(payload, message);
      return;
    }
    if (level === "warn") {
      this.logger.warn(payload, message);
      return;
    }
    this.logger.error(payload, message);
  }
}
