export type VerifyApiKeyResult = {
  valid: boolean;
  /** Unkey machine-readable status when valid is false */
  code?: string;
  keyId?: string;
  name?: string;
  /** Custom metadata from the key (JSON-serializable) */
  meta?: Record<string, unknown>;
};

export type GuardianClientConfig = {
  /**
   * Unkey root key with verify permission (`api.*.verify_key` or scoped).
   * Use a dedicated key for production; never expose to browsers.
   */
  rootKey: string;
  /** Optional Unkey API override */
  serverURL?: string;
  timeoutMs?: number;
};
