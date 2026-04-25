import type {
  ChartPoint,
  ExploreRow,
  IntelEvent,
  MockTrade,
} from "@/lib/data/mockData";
import type { PortfolioSnapshot } from "@/lib/data/portfolioMock";
import type { ReconLanes } from "@/lib/data/reconMock";
import type { CoinInsights } from "@/lib/data/coinInsightsMock";
import { api } from "@/lib/api/client";

export const fetchChart = async (symbol: string): Promise<ChartPoint[]> => {
  const { data } = await api.get<{ points?: ChartPoint[] }>("/api/chart", {
    params: { symbol },
  });
  return data.points ?? [];
};

export const fetchTrades = async (): Promise<MockTrade[]> => {
  const { data } = await api.get<{ trades?: MockTrade[] }>("/api/trades");
  return data.trades ?? [];
};

export const fetchIntel = async (): Promise<IntelEvent[]> => {
  const { data } = await api.get<{ events?: IntelEvent[] }>("/api/intel");
  return data.events ?? [];
};

export const fetchExplore = async (): Promise<ExploreRow[]> => {
  const { data } = await api.get<{ rows?: ExploreRow[] }>("/api/explore");
  return data.rows ?? [];
};

export const fetchPortfolio = async (): Promise<PortfolioSnapshot> => {
  const { data } = await api.get<{ snapshot?: PortfolioSnapshot }>(
    "/api/portfolio",
  );
  if (!data.snapshot) {
    throw new Error("portfolio snapshot missing");
  }
  return data.snapshot;
};

export const fetchRecon = async (): Promise<ReconLanes> => {
  const { data } = await api.get<{ lanes?: ReconLanes }>("/api/recon");
  if (!data.lanes) {
    throw new Error("recon lanes missing");
  }
  return data.lanes;
};

export const fetchCoinInsights = async (
  symbol: string,
  label?: string | null,
): Promise<CoinInsights> => {
  const upper = symbol.trim().toUpperCase();
  const { data } = await api.get<CoinInsights>(`/api/coin/${encodeURIComponent(upper)}`, {
    params: label ? { label } : undefined,
  });
  return data;
};
