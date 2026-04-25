"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTerminal } from "@/components/layout/TerminalState";
import { fetchCoinInsights } from "@/lib/api/queries";
import { queryKeys } from "@/lib/query-keys";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { Button } from "@repo/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";
import { ScrollArea } from "@repo/ui/scroll-area";

const dockContentPad =
  "pb-[max(6.25rem,calc(1.25rem+4.5rem+env(safe-area-inset-bottom,0px)))]";

const fmtUsd = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(4)}`;
};

type CoinInsightsPanelProps = {
  topInset: number;
  /** When hub + lg: fixed `left` px for the panel */
  hubCoinLeftPx: number | null;
  /** Desktop: panel sits flush to the right of main, left of the 420px chat dock */
  dockAdjacent: boolean;
  coinWidthPx: number;
};

const CoinInsightsBody = ({
  symbol,
  queryLabel,
  wide,
  onToggleWide,
  onClose,
  compactChrome,
}: {
  symbol: string;
  queryLabel: string | null;
  wide: boolean;
  onToggleWide: () => void;
  onClose: () => void;
  compactChrome: boolean;
}) => {
  const router = useRouter();
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.coinInsights(symbol, queryLabel),
    queryFn: () => fetchCoinInsights(symbol, queryLabel),
    refetchInterval: 3200,
    enabled: Boolean(symbol),
  });

  const fullHref =
    queryLabel != null && queryLabel.length > 0
      ? `/coin/${encodeURIComponent(symbol)}?label=${encodeURIComponent(queryLabel)}`
      : `/coin/${encodeURIComponent(symbol)}`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className={cn(
          "flex shrink-0 items-start justify-between gap-2 border-border-subtle border-b bg-black/35 px-2.5 py-2",
          compactChrome && "px-2 py-1.5",
        )}
      >
        <div className="min-w-0">
          <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-[0.2em]">
            Coin desk
          </p>
          <h2 className="truncate font-semibold text-foreground text-sm leading-tight">
            {data?.displayName ?? symbol}
          </h2>
          <p className="font-mono text-[10px] text-muted-foreground uppercase">{symbol}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {!compactChrome ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 rounded-sm text-muted-foreground hover:text-foreground"
              aria-label={wide ? "Narrow panel" : "Widen panel"}
              onClick={onToggleWide}
            >
              {wide ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7 rounded-sm text-muted-foreground hover:text-foreground"
            aria-label="Close coin details"
            onClick={onClose}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="h-0 min-h-0 flex-1">
        <div className="space-y-3 px-2.5 py-3">
          {isPending ? (
            <p className="font-mono text-[10px] text-muted-foreground uppercase">Loading…</p>
          ) : null}
          {isError ? (
            <p className="font-mono text-[10px] text-neon-down uppercase">Could not load desk</p>
          ) : null}
          {data ? (
            <>
              <section aria-labelledby="ci-price-heading">
                <p
                  id="ci-price-heading"
                  className="font-mono text-[8px] text-muted-foreground uppercase tracking-wider"
                >
                  Live (sim)
                </p>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-lg text-foreground tabular-nums">
                    {fmtUsd(data.priceUsd)}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[11px] tabular-nums",
                      data.change24hPct >= 0 ? "text-neon-up" : "text-neon-down",
                    )}
                  >
                    {data.change24hPct >= 0 ? "+" : ""}
                    {data.change24hPct.toFixed(1)}% 24h
                  </span>
                </div>
              </section>

              <section aria-labelledby="ci-flow-heading">
                <p
                  id="ci-flow-heading"
                  className="font-mono text-[8px] text-muted-foreground uppercase tracking-wider"
                >
                  Recent buy / sell
                </p>
                <ul className="mt-1.5 space-y-1 border-border-subtle border border-dashed bg-black/25 p-1.5">
                  {data.flow.slice(0, 10).map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-2 font-mono text-[9px]"
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

              <section className="space-y-2" aria-label="Wallet leaders">
                <div className="rounded-sm border border-border-subtle bg-black/30 p-2">
                  <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-wider">
                    Highest balance
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-foreground">{data.topHolder.walletShort}</p>
                  <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                    ~{data.topHolder.pctHeld.toFixed(1)}% · {data.topHolder.tokenAmountLabel} tokens (mock)
                  </p>
                </div>
                <div className="rounded-sm border border-border-subtle bg-black/30 p-2">
                  <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-wider">
                    Most trades 24h
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-foreground">{data.mostTrades.walletShort}</p>
                  <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                    {data.mostTrades.tradeCount24h} fills (mock)
                  </p>
                </div>
              </section>

              <section aria-labelledby="ci-pos-heading">
                <p
                  id="ci-pos-heading"
                  className="font-mono text-[8px] text-muted-foreground uppercase tracking-wider"
                >
                  Your desk position
                </p>
                {data.userPosition ? (
                  <div className="mt-1.5 rounded-sm border border-primary/25 bg-primary/[0.05] p-2 font-mono text-[10px]">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Notional</span>
                      <span className="tabular-nums text-foreground">
                        {fmtUsd(data.userPosition.notionalUsd)}
                      </span>
                    </div>
                    <div className="mt-1 flex justify-between gap-2">
                      <span className="text-muted-foreground">Avg entry</span>
                      <span className="tabular-nums text-foreground">
                        {fmtUsd(data.userPosition.avgEntryUsd)}
                      </span>
                    </div>
                    <div className="mt-1 flex justify-between gap-2">
                      <span className="text-muted-foreground">PnL</span>
                      <span
                        className={cn(
                          "tabular-nums",
                          data.userPosition.pnlUsd >= 0 ? "text-neon-up" : "text-neon-down",
                        )}
                      >
                        {fmtUsd(data.userPosition.pnlUsd)} ({data.userPosition.pnlPct >= 0 ? "+" : ""}
                        {data.userPosition.pnlPct.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                    No portfolio row for this symbol (mock).
                  </p>
                )}
              </section>
            </>
          ) : null}
        </div>
      </ScrollArea>

      <div
        className={cn(
          "flex shrink-0 gap-1.5 border-border-subtle border-t bg-black/40 px-2.5 py-2",
          dockContentPad,
        )}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 flex-1 rounded-sm border-border-subtle font-mono text-[9px] uppercase"
          onClick={() => {
            onClose();
            router.push(fullHref);
          }}
        >
          Open full page
        </Button>
      </div>
    </div>
  );
};

export const CoinInsightsPanel = ({
  topInset,
  hubCoinLeftPx,
  dockAdjacent,
  coinWidthPx,
}: CoinInsightsPanelProps) => {
  const isLg = useMediaQuery("(min-width: 1024px)");
  const {
    selectedSymbol,
    coinInsightsOpen,
    coinInsightsLabel,
    coinInsightsWide,
    setCoinInsightsWide,
    closeCoinInsights,
  } = useTerminal();

  const handleToggleWide = () => {
    setCoinInsightsWide(!coinInsightsWide);
  };

  if (!coinInsightsOpen) {
    return null;
  }

  const desktopAside = (
    <motion.aside
      key="coin-insights-aside"
      role="complementary"
      aria-label="Coin details"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={cn(
        "fixed z-[39] flex flex-col overflow-hidden border-border-subtle bg-background/97 shadow-[0_0_0_1px_rgba(255,255,255,0.04),-8px_0_32px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md lg:rounded-ss-sm",
        dockContentPad,
        dockAdjacent && "border-s",
        !dockAdjacent && "border-e",
      )}
      style={{
        top: topInset,
        bottom: 0,
        width: coinWidthPx,
        ...(dockAdjacent ? { right: 420 } : {}),
        ...(!dockAdjacent && hubCoinLeftPx != null ? { left: hubCoinLeftPx, right: "auto" } : {}),
      }}
    >
      <CoinInsightsBody
        symbol={selectedSymbol}
        queryLabel={coinInsightsLabel}
        wide={coinInsightsWide}
        onToggleWide={handleToggleWide}
        onClose={closeCoinInsights}
        compactChrome={false}
      />
    </motion.aside>
  );

  return (
    <>
      <AnimatePresence mode="sync">
        {isLg ? desktopAside : null}
      </AnimatePresence>

      {!isLg ? (
        <Dialog open={coinInsightsOpen} onOpenChange={(o) => !o && closeCoinInsights()}>
          <DialogContent
            showCloseButton={false}
            className="flex max-h-[min(88dvh,760px)] max-w-md flex-col gap-0 overflow-hidden rounded-sm p-0"
          >
            <DialogHeader className="sr-only">
              <DialogTitle>Coin details · {selectedSymbol}</DialogTitle>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <CoinInsightsBody
                symbol={selectedSymbol}
                queryLabel={coinInsightsLabel}
                wide={false}
                onToggleWide={handleToggleWide}
                onClose={closeCoinInsights}
                compactChrome
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
};
