import { getKnownSymbols } from "@/lib/data/mockData";

const hashSeed = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export type ReconToken = {
  id: string;
  displayName: string;
  /** Ticker shown on card */
  symbol: string;
  /** Maps to mock chart / tape symbol */
  trackSymbol: string;
  ageLabel: string;
  /** fresh = neon green, warm = yellow-ish, stale = muted */
  ageTone: "fresh" | "warm" | "stale";
  volumeUsd: number;
  mcapUsd: number;
  holders: number;
  txns24h: number;
  devHoldPct: number;
  lpLockedPct: number;
  topHolderPct: number;
  hasX: boolean;
  hasTg: boolean;
  hasWeb: boolean;
  /** 0–1, graduating lane only */
  curveProgress?: number;
  migrating?: boolean;
  /** graduated lane */
  venue?: string;
};

export type ReconLanes = {
  newCreations: ReconToken[];
  aboutToGraduate: ReconToken[];
  graduated: ReconToken[];
};

const NAMES = [
  "sully",
  "Apple",
  "DeepSeekAI",
  "Voidrunner",
  "Paperclip",
  "Lumin",
  "Circuit",
  "Nebula",
  "Pulse",
  "Drift",
];

const fmtAge = (sec: number): { label: string; tone: ReconToken["ageTone"] } => {
  if (sec < 120) return { label: `${sec}s`, tone: "fresh" };
  if (sec < 3600) return { label: `${Math.floor(sec / 60)}m`, tone: "warm" };
  if (sec < 86400) return { label: `${Math.floor(sec / 3600)}h`, tone: "warm" };
  return { label: `${Math.floor(sec / 86400)}d`, tone: "stale" };
};

const mkToken = (
  lane: "new" | "grad" | "done",
  i: number,
  now: number,
): ReconToken => {
  const syms = getKnownSymbols();
  const track = syms[i % syms.length]!;
  const h = hashSeed(`${lane}_${i}_${now}`);
  const name = NAMES[h % NAMES.length]!;
  const sym =
    lane === "new"
      ? `${name.slice(0, 4).toUpperCase()}`
      : track;
  const vol = 800 + (h % 120_000);
  const mc = 2_000 + (h % 900_000);
  const sec =
    lane === "new"
      ? 3 + (h % 180)
      : lane === "grad"
        ? 2_000 + (h % 80_000)
        : 200_000 + (h % 2_000_000);
  const age = fmtAge(sec);

  const base: ReconToken = {
    id: `recon_${lane}_${i}`,
    displayName: name,
    symbol: sym,
    trackSymbol: track,
    ageLabel: age.label,
    ageTone: age.tone,
    volumeUsd: vol,
    mcapUsd: mc,
    holders: 12 + (h % 900),
    txns24h: 40 + (h % 4000),
    devHoldPct: 2 + (h % 18),
    lpLockedPct: 70 + (h % 30),
    topHolderPct: 8 + (h % 25),
    hasX: h % 3 !== 0,
    hasTg: h % 4 !== 0,
    hasWeb: h % 5 !== 0,
  };

  if (lane === "grad") {
    const progress = 0.42 + ((h % 55) / 100) * 0.52;
    return {
      ...base,
      curveProgress: Math.min(0.98, progress),
      migrating: h % 7 === 0,
    };
  }

  if (lane === "done") {
    const venues = ["Raydium", "Orca", "Meteora", "Phoenix"] as const;
    return { ...base, venue: venues[h % venues.length]! };
  }

  return base;
};

export const getReconLanes = (now = Date.now()): ReconLanes => {
  return {
    newCreations: Array.from({ length: 7 }, (_, i) => mkToken("new", i, now)),
    aboutToGraduate: Array.from({ length: 6 }, (_, i) =>
      mkToken("grad", i, now),
    ),
    graduated: Array.from({ length: 6 }, (_, i) => mkToken("done", i, now)),
  };
};
