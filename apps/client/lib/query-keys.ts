export const queryKeys = {
  chart: (symbol: string) => ["chart", symbol] as const,
  trades: ["trades"] as const,
  intel: ["intel"] as const,
  explore: ["explore"] as const,
  portfolio: ["portfolio"] as const,
  recon: ["recon"] as const,
  coinInsights: (symbol: string, label: string | null) =>
    ["coinInsights", symbol, label ?? ""] as const,
};
