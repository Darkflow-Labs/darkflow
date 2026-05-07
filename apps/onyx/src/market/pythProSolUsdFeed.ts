import type { Logger } from "pino";
import { PythLazerClient } from "@pythnetwork/pyth-lazer-sdk";

export const SOL_MINT = "So11111111111111111111111111111111111111112";

const DEFAULT_URLS = [
  "wss://pyth-lazer-0.dourolabs.app/v1/stream",
  "wss://pyth-lazer-1.dourolabs.app/v1/stream",
  "wss://pyth-lazer-2.dourolabs.app/v1/stream",
] as const;

type StreamUpdatedMessage = {
  type: "streamUpdated";
  subscriptionId?: number;
  parsed?: {
    timestampUs?: string;
    priceFeeds?: Array<{
      priceFeedId: number;
      price?: string;
      feedUpdateTimestamp?: number;
    }>;
  };
};

const parseScaledPrice = (raw: string, exponent: number): number | null => {
  const asBigInt = (() => {
    try {
      return BigInt(raw);
    } catch {
      return null;
    }
  })();
  if (asBigInt === null) {
    return null;
  }
  const asNumber = Number(asBigInt);
  if (!Number.isFinite(asNumber)) {
    return null;
  }
  const price = asNumber * Math.pow(10, exponent);
  return Number.isFinite(price) && price > 0 ? price : null;
};

export const startPythProSolUsdFeed = async (input: {
  enabled: boolean;
  token: string;
  feedId: number;
  exponent: number;
  channel: string;
  logger: Logger;
  publish: (tick: { tokenMint: string; priceSol: number; receivedAt: number; source: string }) => void;
  persist: (tick: { mint: string; priceSol: number; receivedAtMs: number; source: string }) => Promise<void>;
}) => {
  if (!input.enabled) {
    return { stop: async () => void 0 };
  }

  const client = await PythLazerClient.create({
    token: input.token,
    webSocketPoolConfig: { urls: [...DEFAULT_URLS] },
  });

  let stopped = false;
  let lastFeedUpdateTimestampUs: number | undefined;

  const handleMessage = (msg: unknown) => {
    if (stopped) {
      return;
    }
    const message = msg as Partial<StreamUpdatedMessage> | undefined;
    if (message?.type !== "streamUpdated") {
      return;
    }
    const feeds = message.parsed?.priceFeeds;
    if (!feeds || feeds.length === 0) {
      return;
    }
    const match = feeds.find((feed) => feed.priceFeedId === input.feedId);
    const raw = match?.price;
    if (!raw) {
      return;
    }
    const nextTimestamp = match?.feedUpdateTimestamp;
    if (typeof nextTimestamp === "number") {
      // drop repeats
      if (lastFeedUpdateTimestampUs !== undefined && nextTimestamp <= lastFeedUpdateTimestampUs) {
        return;
      }
      lastFeedUpdateTimestampUs = nextTimestamp;
    }

    const usd = parseScaledPrice(raw, input.exponent);
    if (usd === null) {
      return;
    }
    const now = Date.now();
    input.publish({ tokenMint: SOL_MINT, priceSol: usd, receivedAt: now, source: "pyth-pro-lazer" });
    void input.persist({ mint: SOL_MINT, priceSol: usd, receivedAtMs: now, source: "pyth-pro-lazer" });
  };

  client.addMessageListener(handleMessage);
  client.subscribe({
    type: "subscribe",
    subscriptionId: 1,
    priceFeedIds: [input.feedId],
    properties: ["price", "feedUpdateTimestamp"],
    formats: [],
    channel: input.channel as never,
    ignoreInvalidFeedIds: true,
  });

  input.logger.info(
    { feedId: input.feedId, channel: input.channel },
    "Pyth Pro Lazer SOL/USD stream subscribed"
  );

  return {
    stop: async () => {
      stopped = true;
      try {
        // SDK exposes destroy/close in newer versions; best-effort.
        await (client as unknown as { destroy?: () => Promise<void> }).destroy?.();
      } catch (err: unknown) {
        input.logger.debug({ err }, "Failed to close Pyth Lazer client");
      }
    },
  };
};

