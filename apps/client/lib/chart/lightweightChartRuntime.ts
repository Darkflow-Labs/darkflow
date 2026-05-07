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
import { Effect, Fiber, Runtime } from "effect";

const defaultRuntime = Runtime.defaultRuntime;
import type { ChartPoint, MockTrade } from "@/lib/data/mockData";
import { getVolumeForPoints } from "@/lib/data/mockData";

export type LightweightChartHandles = {
  chart: IChartApi;
  candle: ISeriesApi<"Candlestick", Time>;
  markers: ReturnType<typeof createSeriesMarkers<Time>>;
  hist: ISeriesApi<"Histogram", Time> | null;
};

type ChartOptions = {
  compact: boolean;
  showVolume: boolean;
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

type Bundle = LightweightChartHandles & { ro: ResizeObserver };

const createBundle = (el: HTMLDivElement, opts: ChartOptions): Bundle => {
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
      scaleMargins: { top: 0.1, bottom: opts.showVolume ? 0.26 : 0.08 },
    },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
    },
    localization: { locale: "en-US" },
  });

  const candle = chart.addSeries(CandlestickSeries, {
    upColor: "#16c784",
    downColor: "#ea3943",
    wickUpColor: "#16c784",
    wickDownColor: "#ea3943",
    borderVisible: false,
    lastValueVisible: true,
    priceLineVisible: true,
    priceLineColor: "rgba(142,152,173,0.6)",
  });

  const markers = createSeriesMarkers(candle, []);

  let hist: ISeriesApi<"Histogram", Time> | null = null;
  if (opts.showVolume) {
    const volPane = chart.addPane();
    volPane.setStretchFactor(opts.compact ? 0.28 : 0.32);
    chart.panes()[0]?.setStretchFactor(opts.compact ? 0.72 : 0.68);
    hist = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: "volume" },
        priceScaleId: "",
        color: "rgba(0,255,163,0.32)",
      },
      1,
    );
  }

  const ro = new ResizeObserver(() => {
    const { width, height } = el.getBoundingClientRect();
    chart.applyOptions({ width, height });
  });
  ro.observe(el);

  return { chart, candle, markers, hist, ro };
};

const disposeBundle = (b: Bundle) => {
  b.ro.disconnect();
  b.chart.remove();
};

/**
 * Scoped Effect: acquire chart + ResizeObserver on `el`, release on interrupt / scope close, then block forever until interrupted.
 */
export const chartHoldProgram = (
  el: HTMLDivElement,
  opts: ChartOptions,
  handlesRef: { current: LightweightChartHandles | null },
  onReady?: () => void,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const bundle = yield* Effect.acquireRelease(
        Effect.sync(() => createBundle(el, opts)),
        (b) =>
          Effect.sync(() => {
            disposeBundle(b);
            handlesRef.current = null;
          }),
      );
      handlesRef.current = {
        chart: bundle.chart,
        candle: bundle.candle,
        markers: bundle.markers,
        hist: bundle.hist,
      };
      if (onReady) {
        yield* Effect.sync(onReady);
      }
      yield* Effect.never;
    }),
  );

export type SyncChartInput = {
  data: ChartPoint[];
  trades?: MockTrade[];
  symbol: string;
};

export type SyncChartResult = {
  lastLabel: string;
  pulse: boolean;
};

/** Synchronous chart data sync (call during React render when handles exist). */
export const syncLightweightChartData = (
  handles: LightweightChartHandles,
  input: SyncChartInput,
): SyncChartResult => {
  const { data, trades } = input;
  const candles = buildCandlesFromLine(data);
  const volume = getVolumeForPoints(data);

  if (data.length === 0) {
    handles.candle.setData([]);
    handles.hist?.setData([]);
    handles.markers.setMarkers([]);
    return { lastLabel: "—", pulse: false };
  }

  handles.candle.setData(candles);
  handles.hist?.setData(volume);
  handles.chart.timeScale().fitContent();
  handles.markers.setMarkers(buildTradeMarkers(trades, data));

  const v = data[data.length - 1]!.value;
  const lastLabel = v < 1 ? v.toPrecision(6) : v.toFixed(4);

  return { lastLabel, pulse: true };
};

export const interruptChartFiber = (fiber: Fiber.RuntimeFiber<unknown, unknown> | null | undefined) => {
  if (fiber) {
    Runtime.runFork(defaultRuntime)(Fiber.interruptFork(fiber));
  }
};

export const forkChartHold = (
  el: HTMLDivElement,
  opts: ChartOptions,
  handlesRef: { current: LightweightChartHandles | null },
  onReady?: () => void,
) => Runtime.runFork(defaultRuntime)(chartHoldProgram(el, opts, handlesRef, onReady));
