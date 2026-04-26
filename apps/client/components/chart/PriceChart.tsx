"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  type CandlestickData,
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

const buildCandlesFromLine = (points: ChartPoint[]): CandlestickData<Time>[] => {
  if (points.length === 0) return [];
  const out: CandlestickData<Time>[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = i > 0 ? points[i - 1]!.value : points[i]!.value;
    const cur = points[i]!.value;
    const next = i < points.length - 1 ? points[i + 1]!.value : cur;
    const open = prev;
    const close = cur;
    const localHigh = Math.max(open, close, next);
    const localLow = Math.min(open, close, next);
    const spread = Math.max(Math.abs(close - open) * 0.14, close * 0.0012);
    out.push({
      time: points[i]!.time as Time,
      open,
      high: localHigh + spread,
      low: Math.max(1e-8, localLow - spread),
      close,
    });
  }
  return out;
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
  const candleRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const histRef = useRef<ISeriesApi<"Histogram", Time> | null>(null);
  const markersRef = useRef<ReturnType<typeof createSeriesMarkers<Time>> | null>(null);
  const [lastPx, setLastPx] = useState<string>("—");
  const [pulse, setPulse] = useState(false);

  const volume = useMemo(() => getVolumeForPoints(data), [data]);
  const candles = useMemo(() => buildCandlesFromLine(data), [data]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "#070b12" },
        textColor: "#8f9ab0",
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(143,154,176,0.08)", visible: true, style: LineStyle.Solid },
        horzLines: { color: "rgba(143,154,176,0.08)", visible: true, style: LineStyle.Solid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: showVolume ? 0.26 : 0.08 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      localization: { locale: "en-US" },
    });

    const candlesSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#16c784",
      downColor: "#ea3943",
      wickUpColor: "#16c784",
      wickDownColor: "#ea3943",
      borderVisible: false,
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineColor: "rgba(142,152,173,0.6)",
    });

    candleRef.current = candlesSeries;
    markersRef.current = createSeriesMarkers(candlesSeries, []);

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
      candleRef.current = null;
      histRef.current = null;
    };
  }, [compact, showVolume]);

  useEffect(() => {
    const series = candleRef.current;
    const hist = histRef.current;
    const chart = chartRef.current;
    if (!series) return;
    if (data.length === 0) {
      series.setData([]);
      hist?.setData([]);
      markersRef.current?.setMarkers([]);
      queueMicrotask(() => {
        setLastPx("—");
      });
      return;
    }
    series.setData(candles);
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
  }, [candles, data, symbol, trades, volume]);

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
          ref={containerRef}
          className="min-h-0 flex-1"
          aria-label={`Price chart for ${symbol}, last ${lastPx}`}
          role="img"
        />
      </div>
    </div>
  );
};
