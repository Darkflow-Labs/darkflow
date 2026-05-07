import { createHash } from "node:crypto";
import { Autumn } from "autumn-js";
import { createCache, DefaultStatefulContext, Namespace } from "@unkey/cache";
import { MemoryStore } from "@unkey/cache/stores";
import { GuardianAccessError } from "./policy.js";
import type { VerifyApiKeyResult } from "./types.js";

export type GuardianBillingConfig = {
  /** Resolve Better Auth users (e.g. `prisma.user.findUnique`). */
  findUserById: (userId: string) => Promise<{ id: string } | null>;
  autumnSecretKey: string;
  /** Metered / credit feature consumed per WS message (e.g. `launch_stream_message`). */
  launchStreamFeatureId?: string;
  /** Boolean or entitlement feature checked before Onyx entries (e.g. `onyx_live_trading`). */
  tradeEntryFeatureId?: string;
  /** Metered USD feature for post-buy platform fee (e.g. `platform_trade_fee_usd`). */
  tradeFeeFeatureId?: string;
  /** Fresh window for cached `check` hits (default 10s). */
  autumnCheckFreshMs?: number;
  /** Stale-while-revalidate tail (default 45s). */
  autumnCheckStaleMs?: number;
  /** In-memory cache for Unkey verify (keyed by SHA-256 of raw key). */
  unkeyVerifyFreshMs?: number;
  unkeyVerifyStaleMs?: number;
  /** How long to trust `User` existence without re-querying Prisma (default 5m). */
  userExistsTtlMs?: number;
};

export type GuardianBilling = {
  /** After Unkey verification: require DB user + Autumn credits for the stream feature. */
  assertLaunchStreamAccess(verified: VerifyApiKeyResult): Promise<void>;
  /** Per broadcast message: DB user + Autumn `check` (no Unkey round-trip). */
  assertLaunchStreamCreditsForCustomer(customerId: string): Promise<void>;
  trackLaunchStreamMessage(customerId: string): Promise<void>;
  assertTradeEntryAllowed(customerId: string): Promise<void>;
  trackTradeFee(customerId: string, feeUsd: number): Promise<void>;
  /** Cache Unkey verify by hashed key (optional hot-path optimization). */
  getCachedUnkeyVerifyKey(
    rawKey: string,
    loader: () => Promise<VerifyApiKeyResult>
  ): Promise<VerifyApiKeyResult>;
};

const isAutumnCheckAllowed = (response: unknown): boolean => {
  if (response && typeof response === "object" && "allowed" in response) {
    return (response as { allowed?: boolean }).allowed === true;
  }
  return false;
};

const readMetaUserId = (verified: VerifyApiKeyResult): string | undefined => {
  const raw = verified.meta?.userId;
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
};

const autumnCheckKey = (customerId: string, featureId: string, requiredBalance: number) =>
  `${customerId}:${featureId}:${requiredBalance}`;

export const createGuardianBilling = (config: GuardianBillingConfig): GuardianBilling => {
  if (!config.autumnSecretKey) {
    throw new Error("GuardianBillingConfig.autumnSecretKey is required");
  }
  if (!config.launchStreamFeatureId && !config.tradeEntryFeatureId && !config.tradeFeeFeatureId) {
    throw new Error(
      "GuardianBillingConfig requires at least one of launchStreamFeatureId, tradeEntryFeatureId, tradeFeeFeatureId"
    );
  }

  const autumn = new Autumn({
    secretKey: config.autumnSecretKey,
    failOpen: false
  });

  const ctx = new DefaultStatefulContext();
  const autumnFresh = config.autumnCheckFreshMs ?? 10_000;
  const autumnStale = config.autumnCheckStaleMs ?? 45_000;
  const unkeyFresh = config.unkeyVerifyFreshMs ?? 45_000;
  const unkeyStale = config.unkeyVerifyStaleMs ?? 120_000;
  const userExistsTtl = config.userExistsTtlMs ?? 300_000;

  type AutumnCheckPayload = { allowed: boolean };

  const cache = createCache({
    autumnCheck: new Namespace<AutumnCheckPayload>(ctx, {
      stores: [new MemoryStore({ persistentMap: new Map() })],
      fresh: autumnFresh,
      stale: autumnStale
    }),
    unkeyVerify: new Namespace<VerifyApiKeyResult>(ctx, {
      stores: [new MemoryStore({ persistentMap: new Map() })],
      fresh: unkeyFresh,
      stale: unkeyStale
    })
  });

  const userExistsUntilById = new Map<string, number>();

  const invalidateAutumnCheck = async (customerId: string, featureId: string, requiredBalance = 1) => {
    const key = autumnCheckKey(customerId, featureId, requiredBalance);
    await cache.autumnCheck.remove(key);
  };

  const ensureUserExists = async (userId: string) => {
    const now = Date.now();
    const until = userExistsUntilById.get(userId) ?? 0;
    if (until > now) {
      return;
    }
    const row = await config.findUserById(userId);
    if (!row) {
      throw new GuardianAccessError("USER_NOT_FOUND");
    }
    userExistsUntilById.set(userId, now + userExistsTtl);
  };

  const checkAutumnCached = async (customerId: string, featureId: string, requiredBalance = 1) => {
    const key = autumnCheckKey(customerId, featureId, requiredBalance);
    const res = await cache.autumnCheck.swr(key, async () => {
      const out = await autumn.check({
        customerId,
        featureId,
        requiredBalance
      });
      return { allowed: isAutumnCheckAllowed(out) };
    });
    if ("err" in res && res.err) {
      throw new GuardianAccessError("AUTUMN_CHECK_ERROR");
    }
    const payload = res.val;
    if (!payload?.allowed) {
      throw new GuardianAccessError("INSUFFICIENT_CREDITS");
    }
  };

  return {
    async assertLaunchStreamAccess(verified) {
      if (!config.launchStreamFeatureId) {
        throw new GuardianAccessError("BILLING_NOT_CONFIGURED");
      }
      if (!verified.valid) {
        throw new GuardianAccessError(verified.code ?? "INVALID_KEY");
      }
      const userId = readMetaUserId(verified);
      if (!userId) {
        throw new GuardianAccessError("metadata_mismatch:userId");
      }
      await ensureUserExists(userId);
      await checkAutumnCached(userId, config.launchStreamFeatureId, 1);
    },

    async assertLaunchStreamCreditsForCustomer(customerId) {
      if (!config.launchStreamFeatureId) {
        throw new GuardianAccessError("BILLING_NOT_CONFIGURED");
      }
      await ensureUserExists(customerId);
      await checkAutumnCached(customerId, config.launchStreamFeatureId, 1);
    },

    async trackLaunchStreamMessage(customerId) {
      if (!config.launchStreamFeatureId) {
        return;
      }
      await autumn.track({
        customerId,
        featureId: config.launchStreamFeatureId,
        value: 1
      });
      await invalidateAutumnCheck(customerId, config.launchStreamFeatureId, 1);
    },

    async assertTradeEntryAllowed(customerId) {
      if (!config.tradeEntryFeatureId) {
        return;
      }
      await ensureUserExists(customerId);
      await checkAutumnCached(customerId, config.tradeEntryFeatureId, 1);
    },

    async trackTradeFee(customerId, feeUsd) {
      if (!config.tradeFeeFeatureId || feeUsd <= 0) {
        return;
      }
      await autumn.track({
        customerId,
        featureId: config.tradeFeeFeatureId,
        value: feeUsd
      });
      await invalidateAutumnCheck(customerId, config.tradeFeeFeatureId, 1);
      if (config.tradeEntryFeatureId) {
        await invalidateAutumnCheck(customerId, config.tradeEntryFeatureId, 1);
      }
    },

    async getCachedUnkeyVerifyKey(rawKey, loader) {
      const trimmed = rawKey.trim();
      if (!trimmed) {
        return { valid: false, code: "EMPTY_KEY" };
      }
      const hash = createHash("sha256").update(trimmed).digest("hex");
      const res = await cache.unkeyVerify.swr(hash, async () => loader());
      if ("err" in res && res.err) {
        return { valid: false, code: "VERIFY_CACHE_ERROR" };
      }
      return res.val ?? { valid: false, code: "VERIFY_CACHE_MISS" };
    }
  };
};
