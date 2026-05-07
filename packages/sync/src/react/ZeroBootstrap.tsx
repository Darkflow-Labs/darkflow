"use client";

import type { Zero } from "@rocicorp/zero";
import { Runtime } from "effect";
import { useRef, useSyncExternalStore, type JSX } from "react";
import { preloadSyncDataEffect } from "../effect/preload";
import type { SyncZeroSchema } from "../zero/schema";

const defaultRuntime = Runtime.defaultRuntime;

/** Subscribe to Zero connection transitions and preload shared queries when connected — no React `useEffect`. */
export const ZeroBootstrap = ({ zero }: { zero: Zero<SyncZeroSchema> }): JSX.Element | null => {
  const preloadedRef = useRef(false);

  const state = useSyncExternalStore(
    (cb) => zero.connection.state.subscribe(cb),
    () => zero.connection.state.current,
    () => ({ name: "connecting" as const }),
  );

  if (state.name !== "connected") {
    preloadedRef.current = false;
  }

  if (state.name === "connected" && !preloadedRef.current) {
    preloadedRef.current = true;
    Runtime.runFork(defaultRuntime)(preloadSyncDataEffect(zero));
  }

  return null;
};
