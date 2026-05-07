import { Unkey } from "@unkey/api";
import type { GuardianClientConfig, VerifyApiKeyResult } from "./types.js";

export type GuardianClient = {
  verifyApiKey(key: string, options?: { permissions?: string }): Promise<VerifyApiKeyResult>;
};

export const createGuardianClient = (config: GuardianClientConfig): GuardianClient => {
  const unkey = new Unkey({
    rootKey: config.rootKey,
    ...(config.serverURL ? { serverURL: config.serverURL } : {}),
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {})
  });

  return {
    async verifyApiKey(key: string, options?: { permissions?: string }): Promise<VerifyApiKeyResult> {
      const trimmed = key.trim();
      if (!trimmed) {
        return { valid: false, code: "EMPTY_KEY" };
      }
      try {
        const res = await unkey.keys.verifyKey({
          key: trimmed,
          ...(options?.permissions ? { permissions: options.permissions } : {})
        });
        const data = res.data;
        if (!data) {
          return { valid: false, code: "NO_DATA" };
        }
        return {
          valid: data.valid === true,
          code: typeof data.code === "string" ? data.code : undefined,
          keyId: data.keyId,
          name: data.name,
          meta: data.meta as Record<string, unknown> | undefined
        };
      } catch {
        return { valid: false, code: "VERIFY_ERROR" };
      }
    }
  };
};
