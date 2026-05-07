import type { Logger } from "pino";
import type { NotificationSink, SnipeOpportunityPayload } from "./notificationTypes.js";

type NotificationHubInput = {
  logger: Logger;
  sinks: NotificationSink[];
  /** Skip repeat alerts for the same mint within this window. */
  cooldownMs: number;
  /** When set, only notify if `payload.qualityScore` is defined and >= this value. */
  minQualityScore?: number;
};

export type NotificationHub = {
  notifySnipeOpportunity(payload: SnipeOpportunityPayload): void;
};

export const createNotificationHub = ({
  logger,
  sinks,
  cooldownMs,
  minQualityScore
}: NotificationHubInput): NotificationHub => {
  const lastNotifiedAtByMint = new Map<string, number>();

  const deliver = async (payload: SnipeOpportunityPayload) => {
    if (sinks.length === 0) {
      return;
    }
    if (
      minQualityScore !== undefined &&
      payload.qualityScore !== undefined &&
      payload.qualityScore < minQualityScore
    ) {
      return;
    }
    const now = Date.now();
    const last = lastNotifiedAtByMint.get(payload.tokenMint) ?? 0;
    if (now - last < cooldownMs) {
      return;
    }
    lastNotifiedAtByMint.set(payload.tokenMint, now);

    for (const sink of sinks) {
      try {
        await sink.notifySnipeOpportunity(payload);
      } catch (error: unknown) {
        logger.warn(
          { err: error, sink: sink.name, tokenMint: payload.tokenMint },
          "Notification sink failed (non-fatal)"
        );
      }
    }
  };

  return {
    notifySnipeOpportunity(payload: SnipeOpportunityPayload): void {
      void deliver(payload);
    }
  };
};
