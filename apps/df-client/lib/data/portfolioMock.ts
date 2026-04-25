import { getKnownSymbols } from "@/lib/data/mockData";

const hashSeed = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export type PortfolioSummary = {
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalRevenueUsd: number;
  totalSpentUsd: number;
};

export type PortfolioPosition = {
  symbol: string;
  investedUsd: number;
  soldUsd: number;
  remainingUsd: number;
  pnlUsd: number;
  pnlPct: number;
};

export type PortfolioTradeRow = {
  id: string;
  age: string;
  type: "buy" | "sell";
  price: string;
  amt: string;
  totalUsd: string;
  maker: string;
};

export type PortfolioDeployedRow = {
  id: string;
  symbol: string;
  curve: string;
  raisedUsd: number;
  at: string;
};

export type PortfolioHeatmapDatum = {
  date: string;
  value: number;
};

export type PortfolioSnapshot = {
  summary: PortfolioSummary;
  /** Normalized 0–1 series for inline chart */
  pnlSeries: number[];
  /** Daily desk activity counts for calendar heatmap */
  heatmapData: PortfolioHeatmapDatum[];
  positions: PortfolioPosition[];
  distribution: {
    over200Pct: number;
    between0And200Pct: number;
    under0Pct: number;
    counts: { over200: number; mid: number; under0: number };
  };
  tradeHistory: PortfolioTradeRow[];
  topWinners: PortfolioTradeRow[];
  deployed: PortfolioDeployedRow[];
};

const sym = getKnownSymbols();

const localDateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const getPortfolioSnapshot = (now = Date.now()): PortfolioSnapshot => {
  const h = hashSeed(`pf_${now}`);
  const wobble = (i: number) => ((hashSeed(`t${i}`) % 1000) / 1000 - 0.5) * 0.08;

  const pnlSeries = Array.from({ length: 32 }, (_, i) => {
    const t = i / 31;
    return 0.35 + Math.sin(t * 4.2 + h * 0.001) * 0.22 + wobble(i);
  }).map((v) => Math.min(1, Math.max(0, v)));

  const dayEnd = new Date(now);
  dayEnd.setHours(0, 0, 0, 0);
  const heatmapData: PortfolioHeatmapDatum[] = [];
  for (let i = 0; i < 365; i++) {
    const d = new Date(dayEnd);
    d.setDate(d.getDate() - i);
    const key = localDateKey(d);
    const v = hashSeed(`hm_${key}_${now}`) % 16;
    heatmapData.push({ date: key, value: v });
  }

  const positions: PortfolioPosition[] = sym.slice(0, 5).map((s, i) => {
    const x = hashSeed(s + String(i));
    const invested = 200 + (x % 1800);
    const sold = (x % 3 === 0 ? 0.4 : 0.75) * invested;
    const remaining = invested - sold * 0.55;
    const pnlUsd = sold * 0.08 - remaining * 0.02 + ((x % 100) - 50) * 2;
    const pnlPct = (pnlUsd / invested) * 100;
    return {
      symbol: s,
      investedUsd: invested,
      soldUsd: sold,
      remainingUsd: Math.max(0, remaining),
      pnlUsd,
      pnlPct,
    };
  });

  const realized = 1.45 + (h % 100) / 500;
  const unrealized = (h % 40) / 100 - 0.15;
  const revenue = 5.92 + (h % 80) / 200;
  const spent = 4.46 + (h % 60) / 200;

  const mkTrade = (i: number, win: boolean): PortfolioTradeRow => {
    const side: "buy" | "sell" = i % 4 === 0 ? "sell" : "buy";
    const px = (1.2 + (i % 50) / 20).toFixed(4);
    const amt = (1200 + (i % 800)).toString();
    const tot = ((side === "buy" ? 1 : -1) * (200 + i * 17) + (win ? 80 : -40)).toFixed(2);
    return {
      id: `pf_tr_${i}`,
      age: `${(i % 59) + 1}m`,
      type: side,
      price: px,
      amt,
      totalUsd: tot,
      maker: `0x${(hashSeed(String(i)) % 0xffffff).toString(16).padStart(6, "0")}…`,
    };
  };

  const tradeHistory = Array.from({ length: 12 }, (_, i) => mkTrade(i, false));
  const topWinners = Array.from({ length: 6 }, (_, i) => mkTrade(i + 20, true));

  const deployed: PortfolioDeployedRow[] = sym.slice(0, 3).map((s, i) => ({
    id: `dep_${i}`,
    symbol: s,
    curve: i % 2 === 0 ? "pump" : "bonding",
    raisedUsd: 12_000 + (hashSeed(s) % 50_000),
    at: `${(i + 1) * 3}d`,
  }));

  const over200 = positions.filter((p) => p.pnlPct > 200).length;
  const under0 = positions.filter((p) => p.pnlPct < 0).length;
  const mid = positions.length - over200 - under0;
  const total = positions.length || 1;

  return {
    summary: {
      realizedPnlUsd: realized,
      unrealizedPnlUsd: unrealized,
      totalRevenueUsd: revenue,
      totalSpentUsd: spent,
    },
    pnlSeries,
    heatmapData,
    positions,
    distribution: {
      over200Pct: (over200 / total) * 100,
      between0And200Pct: (mid / total) * 100,
      under0Pct: (under0 / total) * 100,
      counts: { over200, mid, under0 },
    },
    tradeHistory,
    topWinners,
    deployed,
  };
};
