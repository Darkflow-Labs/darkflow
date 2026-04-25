"use client";

import {
  AreaSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartPoint, MockTrade } from "@/lib/data/mockData";
import { getVolumeForPoints } from "@/lib/data/mockData";
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

const buildTradeMarkers = (
  trades: MockTrade[] | undefined,
  points: ChartPoint[],
): SeriesMarker<Time>[] => {
  if (!trades?.length || !points.length) return [];
  const markers: SeriesMarker<Time>[] = [];
  const times = points.map((p) => p.time as number);
  for (const tr of trades.slice(0, 40)) {
    const target = Math.floor(tr.at / 1000);
    let best = times[0]!;
    let bestDiff = Infinity;
    for (const t of times) {
      const d = Math.abs(t - target);
      if (d < bestDiff) {
        bestDiff = d;
        best = t;
      }
    }
    if (bestDiff > 240) continue;
    markers.push({
      time: best as Time,
      position: "inBar",
      shape: tr.side === "buy" ? "arrowUp" : "arrowDown",
      color: tr.side === "buy" ? "#00ffa3" : "#ff3b30",
      size: 0.9,
    });
  }
  return markers;
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaRef = useRef<ISeriesApi<"Area", Time> | null>(null);
  const histRef = useRef<ISeriesApi<"Histogram", Time> | null>(null);
  const markersRef = useRef<ReturnType<typeof createSeriesMarkers<Time>> | null>(null);
  const [lastPx, setLastPx] = useState<string>("—");
  const [pulse, setPulse] = useState(false);

  const volume = useMemo(() => getVolumeForPoints(data), [data]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b8b8b",
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)", visible: true },
        horzLines: { color: "rgba(255,255,255,0.03)", visible: true },
      },
      crosshair: { mode: CrosshairMode.Magnet },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      localization: { locale: "en-US" },
    });

    const area = chart.addSeries(AreaSeries, {
      lineColor: "#00ffa3",
      topColor: "rgba(0, 255, 163, 0.28)",
      bottomColor: "rgba(0, 255, 163, 0.02)",
      relativeGradient: true,
      lineWidth: compact ? 2 : 3,
      crosshairMarkerVisible: true,
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineColor: "rgba(0,255,163,0.45)",
    });

    areaRef.current = area;
    markersRef.current = createSeriesMarkers(area, []);

    if (showVolume) {
      const volPane = chart.addPane();
      volPane.setStretchFactor(compact ? 0.28 : 0.32);
      chart.panes()[0]?.setStretchFactor(compact ? 0.72 : 0.68);
      const hist = chart.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: "volume" },
          priceScaleId: "",
          color: "rgba(0,255,163,0.32)",
        },
        1,
      );
      histRef.current = hist;
    }

    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      chart.applyOptions({ width, height });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      markersRef.current = null;
      chart.remove();
      chartRef.current = null;
      areaRef.current = null;
      histRef.current = null;
    };
  }, [compact, showVolume]);

  useEffect(() => {
    const area = areaRef.current;
    const hist = histRef.current;
    const chart = chartRef.current;
    if (!area) return;
    if (data.length === 0) {
      area.setData([]);
      hist?.setData([]);
      markersRef.current?.setMarkers([]);
      queueMicrotask(() => {
        setLastPx("—");
      });
      return;
    }
    area.setData(data);
    hist?.setData(volume);
    chart?.timeScale().fitContent();
    markersRef.current?.setMarkers(buildTradeMarkers(trades, data));
    const v = data[data.length - 1]!.value;
    const label = v < 1 ? v.toPrecision(6) : v.toFixed(4);
    queueMicrotask(() => {
      setLastPx(label);
      setPulse(true);
    });
    const t = window.setTimeout(() => setPulse(false), 450);
    return () => window.clearTimeout(t);
  }, [data, symbol, trades, volume]);

  return (
    <div className={cn("relative flex h-full min-h-0 w-full flex-col", className)}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {!flush ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-border-subtle border-b px-2 pb-1">
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              {symbol}
            </span>
            <AnimatePresence mode="wait">
              <motion.span
                key={lastPx}
                initial={{ opacity: 0.4, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "font-mono text-sm font-semibold tabular-nums text-neon-up",
                  pulse && "text-signal",
                )}
              >
                {lastPx}
              </motion.span>
            </AnimatePresence>
          </div>
        ) : null}
        <div
          ref={containerRef}
          className="min-h-0 flex-1"
          aria-label={`Price chart for ${symbol}, last ${lastPx}`}
          role="img"
        />
      </div>
    </div>
  );
};
