import type { UTCTimestamp } from "lightweight-charts";

export type ChartPoint = { time: UTCTimestamp; value: number };

export type MockToken = {
  symbol: string;
  basePrice: number;
  volatility: number;
  reason: string;
  risk: "Low" | "Medium" | "High";
};

const BASE: MockToken[] = [
  {
    symbol: "SOL",
    basePrice: 142.5,
    volatility: 0.02,
    reason: "Primary supported adapter",
    risk: "Low",
  },
];

const hashSeed = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const wobble = (symbol: string, t: number) => {
  const h = hashSeed(symbol);
  const a = (h % 1000) / 1000;
  const wave = Math.sin(t / 4000 + a * 6.28) * 0.012;
  const noise = Math.sin(t / 900 + h) * 0.004;
  return 1 + wave + noise;
};

export const getKnownSymbols = (): string[] => BASE.map((b) => b.symbol);

/** Base price for symbols outside the mock console list — keeps charts/insights coherent. */
export const syntheticBaseFromHash = (upper: string): number => {
  const h = hashSeed(upper);
  const tier = h % 5;
  if (tier === 0) return 20 + (h % 5000) / 10;
  if (tier === 1) return 0.2 + (h % 800) / 1000;
  if (tier === 2) return 0.00002 + (h % 1_000_000) / 1e11;
  return 1 + (h % 1200) / 40;
};

/** Canonical mock spot for symbol at `now` — chart, cards, and APIs should align on this. */
export const getSpotPrice = (symbol: string, now = Date.now()): number => {
  const upper = symbol.trim().toUpperCase();
  const row = BASE.find((b) => b.symbol === upper);
  if (!row) return syntheticBaseFromHash(upper) * wobble(upper, now);
  return row.basePrice * wobble(row.symbol, now);
};

export const getTokens = (now = Date.now()) => {
  return BASE.map((b) => {
    const price = getSpotPrice(b.symbol, now);
    const f = price / b.basePrice;
    const drift = (f - 1) * 100;
    const change =
      drift >= 0 ? `+${drift.toFixed(1)}%` : `${drift.toFixed(1)}%`;
    return {
      symbol: b.symbol,
      price,
      change,
      reason: b.reason,
      risk: b.risk,
    };
  });
};

export const getChartData = (symbol: string, now = Date.now()): ChartPoint[] => {
  const upper = symbol.trim().toUpperCase();
  const row = BASE.find((b) => b.symbol === upper);
  const basePrice = row?.basePrice ?? syntheticBaseFromHash(upper);
  const volatility = row?.volatility ?? 0.05;

  const points: ChartPoint[] = [];
  const stepSec = 120;
  const count = 180;
  let v = basePrice * 0.92;
  const t0 = Math.floor(now / 1000) - stepSec * count;
  for (let i = 0; i < count; i++) {
    const t = (t0 + i * stepSec) as UTCTimestamp;
    const micro = Math.sin(i / 7 + hashSeed(upper) % 17) * volatility * v;
    v = Math.max(1e-8, v * (1 + micro * 0.02 + (i % 11 === 0 ? 0.003 : 0)));
    points.push({ time: t, value: v });
  }
  const spot = getSpotPrice(upper, now);
  const last = points[count - 1]!.value;
  const scale = last > 0 ? spot / last : 1;
  return points.map((p) => ({ ...p, value: p.value * scale }));
};

export type MockTrade = {
  id: string;
  side: "buy" | "sell";
  symbol: string;
  size: string;
  price: string;
  at: number;
};

const mkTrade = (i: number, now: number): MockTrade => {
  const t = BASE[i % BASE.length];
  const side: MockTrade["side"] = i % 3 === 0 ? "sell" : "buy";
  const px = t.basePrice * wobble(t.symbol, now - i * 700);
  return {
    id: `tr_${i}`,
    side,
    symbol: t.symbol,
    size: (0.5 + (i % 7) * 0.33).toFixed(2),
    price: px.toFixed(t.basePrice < 0.01 ? 8 : 4),
    at: now - i * 420,
  };
};

export const getTrades = (now = Date.now(), depth = 24): MockTrade[] => {
  return Array.from({ length: depth }, (_, i) => mkTrade(i, now));
};

export type IntelKind = "ALERT" | "LAUNCH" | "FLOW" | "FUNDING";

export type IntelEvent = {
  id: string;
  kind: IntelKind;
  title: string;
  detail: string;
  at: number;
};

const INTEL_TEMPLATES: Array<{
  kind: IntelKind;
  title: string;
  detail: (sym: string, i: number) => string;
}> = [
  {
    kind: "ALERT",
    title: "Liquidation cluster",
    detail: (s, i) =>
      `${s} perp: ${(1.2 + (i % 5) * 0.4).toFixed(1)}M notional swept in 90s`,
  },
  {
    kind: "LAUNCH",
    title: "New pair detected",
    detail: (s, i) =>
      `Router flagged ${s}/USDC pool depth +${(8 + (i % 20)).toFixed(0)}%`,
  },
  {
    kind: "FLOW",
    title: "Wallet ping",
    detail: (s, i) =>
      `0x${(hashSeed(s + String(i)) % 0xffff).toString(16)}… bought ${s} size ${(1.2 + (i % 5) * 0.3).toFixed(1)}`,
  },
  {
    kind: "FUNDING",
    title: "Funding flip",
    detail: (s, i) =>
      `${s} 8h ${(i % 2 === 0 ? "+" : "-")}${(0.01 + (i % 7) * 0.004).toFixed(3)} vs basket`,
  },
];

export const getIntelEvents = (now = Date.now(), depth = 18): IntelEvent[] => {
  return Array.from({ length: depth }, (_, i) => {
    const sym = BASE[i % BASE.length].symbol;
    const tpl = INTEL_TEMPLATES[i % INTEL_TEMPLATES.length];
    const detail = tpl.detail(sym, i);
    return {
      id: `intel_${i}`,
      kind: tpl.kind,
      title: tpl.title,
      detail,
      at: now - i * 380 - (hashSeed(sym + String(i)) % 200),
    };
  });
};

export type ExploreRow = {
  symbol: string;
  name: string;
  mintShort: string;
  createdSecAgo: number;
  liquidityUsd: number;
  holders: number;
  mcapUsd: number;
  volume24hUsd: number;
  swaps: number;
  buyRatio: number;
  sparkline: number[];
  secMintRevoked: boolean;
  secLpBurnt: boolean;
  secNotFreezable: boolean;
  secTop10Ok: boolean;
};

const shortMint = (symbol: string) => {
  const h = hashSeed(symbol);
  const a = (h >>> 8).toString(16).slice(0, 4);
  const b = (h & 0xffff).toString(16).padStart(4, "0");
  return `${a}…${b}`;
};

const exploreSparkline = (symbol: string, now: number): number[] => {
  const pts = getChartData(symbol, now);
  const tail = pts.slice(-24);
  if (tail.length === 0) return [];
  const vals = tail.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  return vals.map((v) => (v - lo) / span);
};

export const getExploreRows = (now = Date.now()): ExploreRow[] => {
  return BASE.map((b) => {
    const h = hashSeed(b.symbol + String(now));
    const age = 3 + (h % 120);
    const liq = 4_000 + (h % 80) * 500;
    const mcap = liq * (8 + (h % 40));
    const vol = mcap * (0.4 + (h % 20) / 100);
    const holders = 40 + (h % 900);
    const swaps = 20 + (h % 400);
    const buyRatio = 0.35 + ((h % 55) / 100) * 0.55;
    return {
      symbol: b.symbol,
      name: `${b.symbol} console`,
      mintShort: shortMint(b.symbol),
      createdSecAgo: age,
      liquidityUsd: liq,
      holders,
      mcapUsd: mcap,
      volume24hUsd: vol,
      swaps,
      buyRatio,
      sparkline: exploreSparkline(b.symbol, now),
      secMintRevoked: h % 4 !== 0,
      secLpBurnt: h % 5 !== 0,
      secNotFreezable: h % 3 !== 0,
      secTop10Ok: h % 6 !== 0,
    };
  });
};

export const getVolumeForPoints = (
  points: ChartPoint[],
): { time: ChartPoint["time"]; value: number; color: string }[] => {
  if (points.length === 0) return [];
  const out: { time: ChartPoint["time"]; value: number; color: string }[] = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i]!.value;
    const prev = i > 0 ? points[i - 1]!.value : cur;
    const delta = Math.abs(cur - prev) / (prev || 1);
    const base = 20 + delta * 8000 + (hashSeed(String(points[i]!.time)) % 40);
    const up = cur >= prev;
    out.push({
      time: points[i]!.time,
      value: base,
      color: up ? "rgba(0,255,163,0.42)" : "rgba(251,113,133,0.4)",
    });
  }
  return out;
};
