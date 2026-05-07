import type { VerifyApiKeyResult } from "./types.js";

export class GuardianAccessError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "GuardianAccessError";
  }
}

/**
 * Ensures verification succeeded and metadata contains expected string fields.
 * Throws GuardianAccessError when policy fails.
 */
export const requireMetadata = (
  result: VerifyApiKeyResult,
  rules: { purpose?: string; [key: string]: string | undefined }
): void => {
  if (!result.valid) {
    throw new GuardianAccessError(result.code ?? "INVALID_KEY");
  }
  const meta = result.meta ?? {};
  for (const [k, expected] of Object.entries(rules)) {
    if (expected === undefined) {
      continue;
    }
    const actual = meta[k];
    if (typeof actual !== "string" || actual !== expected) {
      throw new GuardianAccessError(`metadata_mismatch:${k}`);
    }
  }
};
