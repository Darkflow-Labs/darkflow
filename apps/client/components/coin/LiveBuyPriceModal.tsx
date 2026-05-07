"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Runtime, Stream, Effect, Fiber } from "effect";
import { streamSyncTicks } from "@darkflow/js/sync";
import { Button } from "@darkflow/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@darkflow/ui/dialog";

const runtime = Runtime.defaultRuntime;

type TickSnapshot = {
  status: "idle" | "connecting" | "live" | "error";
  lastPriceSol?: number;
  lastReceivedAt?: number;
  source?: string;
  error?: string;
};

const initialSnapshot: TickSnapshot = { status: "idle" };

const fmtPrice = (value: number) => {
  if (value >= 1) return value.toFixed(6);
  if (value >= 0.01) return value.toFixed(8);
  return value.toPrecision(6);
};

const isMintLike = (value: string) => /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(value);

const createTickStore = () => {
  let snapshot: TickSnapshot = initialSnapshot;
  let fiber: Fiber.RuntimeFiber<void, unknown> | undefined;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const setSnapshot = (next: TickSnapshot) => {
    snapshot = next;
    emit();
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    start: (input: { wsUrl: string; apiKey: string; mint: string }) => {
      if (fiber) {
        return;
      }

      setSnapshot({ status: "connecting" });

      fiber = Runtime.runFork(runtime)(
        Stream.runForEach(
          streamSyncTicks({
            wsUrl: input.wsUrl,
            apiKey: input.apiKey,
            mints: [input.mint],
          }),
          (tick) =>
            Effect.sync(() => {
              setSnapshot({
                status: "live",
                lastPriceSol: tick.priceSol,
                lastReceivedAt: tick.receivedAt,
                source: tick.source,
              });
            }),
        ).pipe(
          Effect.catchAll((error) =>
            Effect.sync(() => {
              setSnapshot({
                status: "error",
                error: error instanceof Error ? error.message : String(error),
              });
            }),
          ),
          Effect.ensuring(
            Effect.sync(() => {
              fiber = undefined;
            }),
          ),
        ),
      );
    },
    stop: () => {
      if (!fiber) {
        setSnapshot(initialSnapshot);
        return;
      }
      Fiber.interrupt(fiber);
      fiber = undefined;
      setSnapshot(initialSnapshot);
    },
  };
};

type LiveBuyPriceModalProps = {
  symbol: string;
};

export const LiveBuyPriceModal = ({ symbol }: LiveBuyPriceModalProps) => {
  const [open, setOpen] = useState(false);
  const tickStore = useMemo(() => createTickStore(), []);
  const snapshot = useSyncExternalStore(tickStore.subscribe, tickStore.getSnapshot, tickStore.getSnapshot);

  const wsUrl = process.env.NEXT_PUBLIC_SYNC_WS_URL;
  const apiKey = process.env.NEXT_PUBLIC_SYNC_STREAM_KEY;
  const mint = symbol.trim();
  const mintValid = isMintLike(mint);
  const streamReady = Boolean(wsUrl && apiKey && mintValid);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      if (streamReady) {
        tickStore.start({ wsUrl: wsUrl!, apiKey: apiKey!, mint });
      }
      return;
    }
    tickStore.stop();
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 rounded-sm border-border-subtle font-mono text-[9px] uppercase"
        onClick={() => handleOpenChange(true)}
        aria-label="Open live buy price"
      >
        Live buy price
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono text-xs uppercase tracking-wider">
              Live price · {mint}
            </DialogTitle>
          </DialogHeader>
          {!streamReady ? (
            <p className="font-mono text-xs text-muted-foreground">
              Set `NEXT_PUBLIC_SYNC_WS_URL` and `NEXT_PUBLIC_SYNC_STREAM_KEY`, and open a mint address route.
            </p>
          ) : snapshot.status === "error" ? (
            <p className="font-mono text-xs text-neon-down">{snapshot.error ?? "Stream connection failed."}</p>
          ) : (
            <div className="space-y-2 font-mono text-xs">
              <p className="text-muted-foreground uppercase">{snapshot.status === "live" ? "live" : "connecting"}</p>
              <p className="text-2xl tabular-nums text-foreground">
                {snapshot.lastPriceSol !== undefined ? `${fmtPrice(snapshot.lastPriceSol)} SOL` : "--"}
              </p>
              <p className="text-muted-foreground">
                Source: {snapshot.source ?? "--"} · Updated:{" "}
                {snapshot.lastReceivedAt ? new Date(snapshot.lastReceivedAt).toLocaleTimeString() : "--"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
