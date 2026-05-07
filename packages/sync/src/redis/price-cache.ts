import { Redis } from "@upstash/redis";

export type LastPriceRecord = {
  priceSol: number;
  slot?: string;
  source?: string;
  updatedAt: number;
};

export type PriceCachePort = {
  setLastPrice: (mint: string, record: LastPriceRecord) => Promise<void>;
  getLastPrice: (mint: string) => Promise<LastPriceRecord | null>;
};

const keyForMint = (mint: string) => `df:lastPrice:${mint}`;

export const createUpstashPriceCache = (redis: Redis): PriceCachePort => ({
  setLastPrice: async (mint, record) => {
    await redis.set(keyForMint(mint), JSON.stringify(record), { ex: 86_400 });
  },
  getLastPrice: async (mint) => {
    const raw = await redis.get<string>(keyForMint(mint));
    if (!raw || typeof raw !== "string") {
      return null;
    }
    try {
      return JSON.parse(raw) as LastPriceRecord;
    } catch {
      return null;
    }
  }
});

/** Build Upstash Redis from env (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`). */
export const createPriceCacheFromEnv = (): PriceCachePort | undefined => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return undefined;
  }
  return createUpstashPriceCache(new Redis({ url, token }));
};
