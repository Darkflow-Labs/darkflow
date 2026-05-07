"use client";

import {
  mutators,
  schema,
  type SyncZeroSchema,
  ZeroBootstrap
} from "@darkflow/sync/client";
import type { Zero } from "@rocicorp/zero";
import { ZeroProvider, useZero } from "@rocicorp/zero/react";
import type { ReactNode } from "react";
import { authClient } from "@darkflow/auth/client";

/** Matches {@link Zero.LOGGED_OUT_STORAGE_USER_ID} (Rocicorp anon storage bucket). */
const LOGGED_OUT_ZERO_USER_ID = "__anonymous__";

const appOrigin = (): string => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
};

const ZeroWarmup = () => {
  const zero = useZero();
  return <ZeroBootstrap zero={zero as unknown as Zero<SyncZeroSchema>} />;
};

type ZeroSyncProviderProps = {
  children: ReactNode;
};

/**
 * Wraps the console in Rocicorp Zero — **no-op** when `NEXT_PUBLIC_ZERO_CACHE_URL` is unset (local dev without zero-cache).
 */
export const ZeroSyncProvider = ({ children }: ZeroSyncProviderProps) => {
  const cacheURL = process.env.NEXT_PUBLIC_ZERO_CACHE_URL;
  const session = authClient.useSession();
  const userId = session.data?.user?.id;
  const context = userId ? { userId } : undefined;

  if (!cacheURL) {
    return children;
  }

  return (
    <ZeroProvider
      cacheURL={cacheURL}
      mutateURL={`${appOrigin()}/api/zero/mutate`}
      queryURL={`${appOrigin()}/api/zero/query`}
      schema={schema}
      mutators={mutators}
      userID={userId ?? LOGGED_OUT_ZERO_USER_ID}
      context={context}
    >
      <ZeroWarmup />
      {children}
    </ZeroProvider>
  );
};
