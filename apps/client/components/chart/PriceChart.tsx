"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import type { ChartPoint, MockTrade } from "@/lib/data/mockData";
import {
  forkChartHold,
  interruptChartFiber,
  syncLightweightChartData,
  type LightweightChartHandles,
} from "@/lib/chart/lightweightChartRuntime";

type ChartFiber = ReturnType<typeof forkChartHold>;
import { cn } from "@/lib/utils";

type PriceChartProps = {
  symbol: string;
  data: ChartPoint[];
  trades?: MockTrade[];
  className?: string;
  compact?: boolean;
  showVolume?: boolean;
  /** Hide symbol/price strip so the series fills the panel */
  flush?: boolean;
};

export const PriceChart = ({
  symbol,
  data,
  trades,
  className,
  compact = false,
  showVolume = true,
  flush = false,
}: PriceChartProps) => {
  const handlesRef = useRef<LightweightChartHandles | null>(null);
  const fiberRef = useRef<ChartFiber | null>(null);

  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastDataSigRef = useRef<string>("");

  const [lastPx, setLastPx] = useState("—");
  const [pulse, setPulse] = useState(false);
  const [chartEpoch, setChartEpoch] = useState(0);

  const setContainerNode = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        interruptChartFiber(fiberRef.current);
        fiberRef.current = null;
        handlesRef.current = null;
        lastDataSigRef.current = "";
        fiberRef.current = forkChartHold(
          el,
          { compact, showVolume },
          handlesRef,
          () => {
            lastDataSigRef.current = "";
            setChartEpoch((n) => n + 1);
          },
        );
      } else {
        if (pulseTimerRef.current !== undefined) {
          clearTimeout(pulseTimerRef.current);
          pulseTimerRef.current = undefined;
        }
        interruptChartFiber(fiberRef.current);
        fiberRef.current = null;
        handlesRef.current = null;
      }
    },
    [compact, showVolume],
  );

  const h = handlesRef.current;
  if (h) {
    const sig = `${data.length}:${data.at(-1)?.time ?? ""}:${data.at(-1)?.value ?? ""}:${symbol}:${trades?.length ?? 0}`;
    if (sig !== lastDataSigRef.current) {
      lastDataSigRef.current = sig;
      const r = syncLightweightChartData(h, { data, trades, symbol });
      queueMicrotask(() => {
        setLastPx(r.lastLabel);
        setPulse(r.pulse);
        if (pulseTimerRef.current !== undefined) {
          clearTimeout(pulseTimerRef.current);
          pulseTimerRef.current = undefined;
        }
        if (r.pulse) {
          pulseTimerRef.current = setTimeout(() => {
            setPulse(false);
            pulseTimerRef.current = undefined;
          }, 450);
        }
      });
    }
  }

  return (
    <div className={cn("relative flex h-full min-h-0 w-full flex-col", className)}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {!flush ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-border-subtle border-b bg-black/40 px-2 py-1.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                {symbol}
              </span>
              <span className="rounded border border-border-subtle bg-black/30 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground uppercase">
                1m
              </span>
              <span className="rounded border border-border-subtle bg-black/30 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground uppercase">
                Indicators
              </span>
            </div>
            <AnimatePresence mode="wait">
              <motion.span
                key={lastPx}
                initial={{ opacity: 0.4, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "font-mono text-sm font-semibold tabular-nums text-foreground",
                  pulse && "text-signal",
                )}
              >
                {lastPx}
              </motion.span>
            </AnimatePresence>
          </div>
        ) : null}
        <div
          key={`${compact}-${showVolume}`}
          ref={setContainerNode}
          className="min-h-0 flex-1"
          aria-label={`Price chart for ${symbol}, last ${lastPx}`}
          data-chart-epoch={chartEpoch}
          role="img"
        />
      </div>
    </div>
  );
};
