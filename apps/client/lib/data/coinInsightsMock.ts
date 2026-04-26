import { getSpotPrice } from "@/lib/data/mockData";
import { getPortfolioSnapshot } from "@/lib/data/portfolioMock";

const hashSeed = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const shortWallet = (seed: number) => {
  const a = (seed >>> 8).toString(16).slice(0, 4);
  const b = (seed & 0xffff).toString(16).padStart(4, "0");
  return `0x${a}…${b}`;
};

export type CoinFlowRow = {
  id: string;
  side: "buy" | "sell";
  walletShort: string;
  amountUsd: number;
  completedSecAgo: number;
};

export type CoinUserPosition = {
  notionalUsd: number;
  avgEntryUsd: number;
  pnlUsd: number;
  pnlPct: number;
};

export type CoinInsights = {
  symbol: string;
  displayName: string;
  priceUsd: number;
  change24hPct: number;
  flow: CoinFlowRow[];
  topHolder: { walletShort: string; pctHeld: number; tokenAmountLabel: string };
  mostTrades: { walletShort: string; tradeCount24h: number };
  userPosition: CoinUserPosition | null;
  updatedAt: number;
};

export const getCoinInsights = (
  symbol: string,
  displayLabel: string | null,
  now = Date.now(),
): CoinInsights => {
  const upper = symbol.trim().toUpperCase();
  const h = hashSeed(`ci_${upper}_${Math.floor(now / 60_000)}`);
  const priceUsd = getSpotPrice(upper, now);
  const change24hPct = ((h % 200) - 80) / 10;

  const flow: CoinFlowRow[] = Array.from({ length: 14 }, (_, i) => {
    const hs = hashSeed(`${upper}_flow_${i}_${now}`);
    return {
      id: `flow_${upper}_${i}`,
      side: hs % 3 === 0 ? "sell" : "buy",
      walletShort: shortWallet(hs),
      amountUsd: 40 + (hs % 8000),
      completedSecAgo: 3 + (hs % 200),
    };
  });

  const th = hashSeed(`th_${upper}`);
  const tt = hashSeed(`tt_${upper}`);

  const pf = getPortfolioSnapshot(now);
  const pos = pf.positions.find((p) => p.symbol === upper);
  const avgEntryUsd =
    priceUsd > 0 ? priceUsd * (0.82 + ((h % 18) / 100) * 0.35) : 0;

  const userPosition: CoinUserPosition | null = pos
    ? {
        notionalUsd: pos.remainingUsd,
        avgEntryUsd,
        pnlUsd: pos.pnlUsd,
        pnlPct: pos.pnlPct,
      }
    : null;

  const pctHeld = 4 + (th % 22);
  const tokenAmt = `${(1.2 + (th % 800) / 100).toFixed(1)}M`;

  return {
    symbol: upper,
    displayName: displayLabel?.trim() || upper,
    priceUsd,
    change24hPct,
    flow,
    topHolder: {
      walletShort: shortWallet(th),
      pctHeld,
      tokenAmountLabel: tokenAmt,
    },
    mostTrades: {
      walletShort: shortWallet(tt ^ 0x9e3779b9),
      tradeCount24h: 12 + (tt % 180),
    },
    userPosition,
    updatedAt: now,
  };
};
