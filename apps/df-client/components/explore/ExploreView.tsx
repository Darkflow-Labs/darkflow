"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, LayoutPanelLeft, X } from "lucide-react";
import { MiniSparkline } from "@/components/explore/MiniSparkline";
import { useTerminal } from "@/components/layout/TerminalState";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { fetchExplore } from "@/lib/api/queries";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const fmtUsdCompact = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

const SecCell = ({ ok }: { ok: boolean }) => (
  <span
    className={cn(
      "inline-flex size-4 items-center justify-center rounded-sm border font-mono text-[9px]",
      ok
        ? "border-primary/35 text-primary"
        : "border-neon-down/40 text-neon-down",
    )}
    aria-label={ok ? "Pass" : "Fail"}
  >
    {ok ? <Check className="size-2.5" /> : <X className="size-2.5" />}
  </span>
);

export const ExploreView = () => {
  const { selectedSymbol, setSelectedSymbol, openCoinInsights } = useTerminal();

  const { data: rows = [], isPending } = useQuery({
    queryKey: queryKeys.explore,
    queryFn: fetchExplore,
    refetchInterval: 4000,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-border-subtle border-b px-2 py-2 md:px-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="rounded-sm border-border-subtle font-mono text-[9px] uppercase"
          >
            New pairs
          </Badge>
          <span className="font-mono text-[10px] text-muted-foreground">
            Mock stream · {rows.length} rows
          </span>
          <span className="ms-auto font-mono text-[10px] text-muted-foreground tabular-data">
            Focus: {selectedSymbol}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[56rem] border-collapse font-mono text-[10px]">
          <thead className="sticky top-0 z-10 border-border-subtle border-b bg-background/95 backdrop-blur-sm">
            <tr className="text-[8px] text-muted-foreground uppercase tracking-wide">
              <th className="px-2 py-1.5 text-start font-medium">Token</th>
              <th className="px-1 py-1.5 text-end font-medium">Created</th>
              <th className="px-1 py-1.5 text-end font-medium">Liq</th>
              <th className="px-1 py-1.5 text-end font-medium">Holders</th>
              <th className="px-1 py-1.5 text-end font-medium">MCap</th>
              <th className="px-1 py-1.5 text-end font-medium">Vol</th>
              <th className="px-1 py-1.5 text-end font-medium">Swaps</th>
              <th className="px-1 py-1.5 text-center font-medium">CV/CR/LP/T10</th>
              <th className="px-1 py-1.5 text-center font-medium">Px</th>
              <th className="px-2 py-1.5 text-end font-medium">Act</th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                  Loading tape…
                </td>
              </tr>
            ) : null}
            {rows.map((r, i) => {
              const active = r.symbol === selectedSymbol;
              return (
                <motion.tr
                  key={r.symbol}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02, type: "spring", stiffness: 380, damping: 30 }}
                  className={cn(
                    "cursor-pointer border-border-subtle/80 border-b border-dashed last:border-b-0 hover:bg-white/[0.04]",
                    active && "bg-primary/[0.06]",
                  )}
                  onClick={() => setSelectedSymbol(r.symbol)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedSymbol(r.symbol);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`Select ${r.symbol}`}
                >
                  <td className="px-2 py-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-black/50 font-semibold text-[9px] text-primary">
                        {r.symbol.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground text-[11px]">
                          {r.name}
                        </div>
                        <div className="truncate text-[9px] text-muted-foreground">
                          {r.symbol} · {r.mintShort}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-1 py-1.5 text-end tabular-data text-neon-down">
                    {r.createdSecAgo}s
                  </td>
                  <td className="px-1 py-1.5 text-end tabular-data text-foreground/90">
                    {fmtUsdCompact(r.liquidityUsd)}
                  </td>
                  <td className="px-1 py-1.5 text-end tabular-data text-foreground/90">
                    {r.holders}
                  </td>
                  <td className="px-1 py-1.5 text-end tabular-data text-foreground/90">
                    {fmtUsdCompact(r.mcapUsd)}
                  </td>
                  <td className="px-1 py-1.5 text-end tabular-data text-foreground/90">
                    {fmtUsdCompact(r.volume24hUsd)}
                  </td>
                  <td className="px-1 py-1.5 text-end">
                    <div className="flex items-center justify-end gap-1">
                      <span className="tabular-data text-foreground/90">{r.swaps}</span>
                      <span
                        className="flex h-4 w-6 overflow-hidden rounded-[1px] bg-white/10"
                        title={`Buys ~${Math.round(r.buyRatio * 100)}%`}
                        aria-hidden
                      >
                        <span
                          className="h-full bg-primary"
                          style={{ width: `${Math.round(r.buyRatio * 100)}%` }}
                        />
                        <span className="h-full flex-1 bg-neon-down/60" />
                      </span>
                    </div>
                  </td>
                  <td className="px-1 py-1.5">
                    <div className="flex justify-center gap-0.5">
                      <SecCell ok={r.secMintRevoked} />
                      <SecCell ok={r.secNotFreezable} />
                      <SecCell ok={r.secLpBurnt} />
                      <SecCell ok={r.secTop10Ok} />
                    </div>
                  </td>
                  <td className="px-1 py-1.5">
                    <div className="flex justify-center">
                      <MiniSparkline series={r.sparkline} />
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-end">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="size-7 rounded-sm border-border-subtle p-0 text-muted-foreground hover:text-primary"
                        aria-label={`Open ${r.symbol} details`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openCoinInsights(r.symbol, r.name);
                        }}
                      >
                        <LayoutPanelLeft className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-sm border-primary/35 px-2 font-mono text-[9px] text-primary uppercase"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSymbol(r.symbol);
                        }}
                      >
                        Track
                      </Button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
