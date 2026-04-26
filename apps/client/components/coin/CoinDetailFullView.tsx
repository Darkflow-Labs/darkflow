"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { PriceChartDynamic } from "@/components/chart/PriceChartDynamic";
import { useTerminal } from "@/components/layout/TerminalState";
import { fetchChart, fetchCoinInsights, fetchTrades } from "@/lib/api/queries";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { Button } from "@darkflow/ui/button";
import { ScrollArea } from "@darkflow/ui/scroll-area";

const fmtUsd = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(4)}`;
};

type CoinDetailFullViewProps = {
  symbol: string;
  displayLabel: string | null;
};

export const CoinDetailFullView = ({ symbol, displayLabel }: CoinDetailFullViewProps) => {
  const router = useRouter();
  const { setSelectedSymbol, closeCoinInsights } = useTerminal();

  useEffect(() => {
    closeCoinInsights();
  }, [closeCoinInsights]);

  useEffect(() => {
    setSelectedSymbol(symbol);
  }, [symbol, setSelectedSymbol]);

  const { data: chartPoints = [], isPending: chartPending } = useQuery({
    queryKey: queryKeys.chart(symbol),
    queryFn: () => fetchChart(symbol),
    refetchInterval: 3500,
    enabled: Boolean(symbol),
  });

  const { data: tapeTrades = [] } = useQuery({
    queryKey: queryKeys.trades,
    queryFn: fetchTrades,
    refetchInterval: 2500,
  });

  const { data: insights, isPending: insightsPending } = useQuery({
    queryKey: queryKeys.coinInsights(symbol, displayLabel),
    queryFn: () => fetchCoinInsights(symbol, displayLabel),
    refetchInterval: 3200,
    enabled: Boolean(symbol),
  });

  const title = insights?.displayName ?? displayLabel ?? symbol;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-border-subtle border-b px-2 py-2 md:px-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-sm border-border-subtle font-mono text-[9px] uppercase"
          onClick={() => router.back()}
          aria-label="Back"
        >
          <ArrowLeft className="me-1 size-3.5" aria-hidden />
          Back
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-foreground text-sm md:text-base">{title}</h1>
          <p className="font-mono text-[10px] text-muted-foreground uppercase">{symbol}</p>
        </div>
      </div>

      <ScrollArea className="h-0 min-h-0 flex-1">
        <div className="space-y-4 px-2 py-3 md:px-4 md:py-4">
          <section className="rounded-sm border border-border-subtle bg-black/35 p-2 md:p-3">
            <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
              Price · sim
            </p>
            {insightsPending ? (
              <p className="mt-2 font-mono text-xs text-muted-foreground">Loading…</p>
            ) : insights ? (
              <div className="mt-2 flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-2xl text-foreground tabular-nums md:text-3xl">
                  {fmtUsd(insights.priceUsd)}
                </span>
                <span
                  className={cn(
                    "font-mono text-sm tabular-nums",
                    insights.change24hPct >= 0 ? "text-neon-up" : "text-neon-down",
                  )}
                >
                  {insights.change24hPct >= 0 ? "+" : ""}
                  {insights.change24hPct.toFixed(1)}% 24h
                </span>
              </div>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-sm border border-border-subtle bg-[#05090f] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="border-border-subtle border-b px-2 py-1.5 font-mono text-[9px] text-muted-foreground uppercase tracking-wider md:px-3">
              Chart
            </p>
            <div className="h-[min(52dvh,420px)] min-h-[240px] w-full md:h-[min(48dvh,480px)]">
              {chartPending ? (
                <div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
                  Loading chart…
                </div>
              ) : (
                <PriceChartDynamic
                  symbol={symbol}
                  data={chartPoints}
                  trades={tapeTrades}
                  className="h-full w-full"
                  showVolume
                />
              )}
            </div>
          </section>

          {insights ? (
            <>
              <section>
                <h2 className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
                  Recent buy / sell
                </h2>
                <ul className="mt-2 space-y-1 rounded-sm border border-border-subtle border-dashed bg-black/25 p-2 md:p-3">
                  {insights.flow.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] md:text-[11px]"
                    >
                      <span
                        className={cn(
                          "shrink-0 uppercase",
                          row.side === "buy" ? "text-neon-up" : "text-neon-down",
                        )}
                      >
                        {row.side}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {row.walletShort}
                      </span>
                      <span className="shrink-0 tabular-nums text-foreground/90">
                        {fmtUsd(row.amountUsd)}
                      </span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {row.completedSecAgo}s
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <div className="grid gap-3 md:grid-cols-2">
                <section className="rounded-sm border border-border-subtle bg-black/30 p-3">
                  <h2 className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
                    Highest balance
                  </h2>
                  <p className="mt-2 font-mono text-sm text-foreground">{insights.topHolder.walletShort}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    ~{insights.topHolder.pctHeld.toFixed(1)}% · {insights.topHolder.tokenAmountLabel} tokens (mock)
                  </p>
                </section>
                <section className="rounded-sm border border-border-subtle bg-black/30 p-3">
                  <h2 className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
                    Most trades 24h
                  </h2>
                  <p className="mt-2 font-mono text-sm text-foreground">{insights.mostTrades.walletShort}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {insights.mostTrades.tradeCount24h} fills (mock)
                  </p>
                </section>
              </div>

              <section className="rounded-sm border border-border-subtle bg-black/30 p-3">
                <h2 className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
                  Your desk position
                </h2>
                {insights.userPosition ? (
                  <dl className="mt-2 grid gap-2 font-mono text-[11px] sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Notional</dt>
                      <dd className="mt-0.5 tabular-nums text-foreground">
                        {fmtUsd(insights.userPosition.notionalUsd)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Avg entry</dt>
                      <dd className="mt-0.5 tabular-nums text-foreground">
                        {fmtUsd(insights.userPosition.avgEntryUsd)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">PnL</dt>
                      <dd
                        className={cn(
                          "mt-0.5 tabular-nums",
                          insights.userPosition.pnlUsd >= 0 ? "text-neon-up" : "text-neon-down",
                        )}
                      >
                        {fmtUsd(insights.userPosition.pnlUsd)} ({insights.userPosition.pnlPct >= 0 ? "+" : ""}
                        {insights.userPosition.pnlPct.toFixed(1)}%)
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    No portfolio row for this symbol (mock).
                  </p>
                )}
              </section>
            </>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
};
