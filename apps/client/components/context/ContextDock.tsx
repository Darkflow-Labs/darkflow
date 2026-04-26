"use client";

import { useMemo } from "react";
import { LayoutPanelLeft, Maximize2, ShoppingCart } from "lucide-react";
import { PriceChartDynamic } from "@/components/chart/PriceChartDynamic";
import { Button } from "@darkflow/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@darkflow/ui/dialog";
import { useTerminal } from "@/components/layout/TerminalState";
import type { ChartPoint, MockTrade } from "@/lib/data/mockData";
import { getSpotPrice } from "@/lib/data/mockData";
import { cn } from "@/lib/utils";

type ContextDockProps = {
  chartPoints: ChartPoint[];
  tapeTrades: MockTrade[];
  className?: string;
};

export const ContextDock = ({
  chartPoints,
  tapeTrades,
  className,
}: ContextDockProps) => {
  const {
    selectedSymbol,
    setSelectedSymbol,
    flashOrder,
    appendSimulatedTrade,
    trades,
    chartDrawerOpen,
    setChartDrawerOpen,
    openCoinInsights,
  } = useTerminal();

  const mergedTape = useMemo(
    () => [...trades, ...tapeTrades],
    [trades, tapeTrades],
  );

  const handleQuickBuy = () => {
    const px = getSpotPrice(selectedSymbol);
    const priceStr = px < 1 ? px.toPrecision(6) : px.toFixed(4);
    flashOrder(`Simulated market buy: ${selectedSymbol} @ ${priceStr}`);
    appendSimulatedTrade({
      id: `dock_${Date.now()}`,
      side: "buy",
      symbol: selectedSymbol,
      size: "1.00",
      price: priceStr,
      at: Date.now(),
    });
  };

  return (
    <>
      <aside
        className={cn(
          "flex min-h-0 min-w-0 flex-col border-border-subtle border-s bg-background",
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-border-subtle border-b px-2 py-1">
          <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.22em]">
            Context
          </span>
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 rounded-sm text-muted-foreground hover:text-foreground"
              aria-label={`Open ${selectedSymbol} details`}
              onClick={() => openCoinInsights(selectedSymbol, null)}
            >
              <LayoutPanelLeft className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 rounded-sm text-muted-foreground hover:text-foreground"
              aria-label="Expand chart"
              onClick={() => setChartDrawerOpen(true)}
            >
              <Maximize2 className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="shrink-0 border-border-subtle border-b">
          <p className="px-2 pt-1 font-mono text-[8px] text-muted-foreground uppercase tracking-wider">
            Quick execution
          </p>
          <div className="flex items-center gap-1.5 px-2 py-1">
            <select
              aria-label="Symbol"
              className="min-w-0 flex-1 rounded-sm border border-border-subtle bg-black/55 py-1 ps-1.5 font-mono text-foreground text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-electric-mint/40"
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
            >
              {["SOL", "BONK", "WIF", "JUP", "RENDER"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 rounded-sm border-primary/40 px-2 font-mono text-[10px] text-primary hover:bg-primary/10"
              onClick={handleQuickBuy}
            >
              <ShoppingCart className="size-3" aria-hidden />
              Buy
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border-subtle border-t">
          <p className="shrink-0 px-2 py-0.5 font-mono text-[8px] text-muted-foreground uppercase tracking-wider">
            Chart
          </p>
          <div className="min-h-0 flex-1 overflow-hidden">
            <PriceChartDynamic
              symbol={selectedSymbol}
              data={chartPoints}
              trades={mergedTape}
              compact
              showVolume
              flush
              className="h-full min-h-0 w-full"
            />
          </div>
        </div>
      </aside>

      <Dialog open={chartDrawerOpen} onOpenChange={setChartDrawerOpen}>
        <DialogContent
          showCloseButton
          className="max-h-[min(90dvh,900px)] max-w-[min(96vw,1100px)] gap-3 rounded-sm p-3 sm:max-w-[min(96vw,1100px)]"
        >
          <DialogHeader>
            <DialogTitle className="font-mono text-sm uppercase tracking-wide">
              {selectedSymbol} · chart
            </DialogTitle>
          </DialogHeader>
          <div className="h-[min(70dvh,640px)] min-h-[320px] w-full overflow-hidden rounded-sm border border-border-subtle bg-black/40">
            <PriceChartDynamic
              symbol={selectedSymbol}
              data={chartPoints}
              trades={mergedTape}
              className="h-full w-full"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
