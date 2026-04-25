"use client";

import { LineChartIcon, ShoppingCart } from "lucide-react";
import { Button } from "@repo/ui/button";
import { cn } from "@/lib/utils";
import type { TerminalToken } from "@/lib/types/terminal";

type TokenTableWidgetProps = {
  tokens: TerminalToken[];
  onViewChart: (symbol: string) => void;
  onBuy: (symbol: string) => void;
  className?: string;
};

const formatPrice = (price: number) =>
  price < 1 ? price.toPrecision(6) : price.toFixed(4);

export const TokenTableWidget = ({
  tokens,
  onViewChart,
  onBuy,
  className,
}: TokenTableWidgetProps) => {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-sm border border-border-subtle border-s-primary/50 bg-black/50",
        className,
      )}
    >
      <table className="w-full min-w-[22rem] border-collapse font-mono text-[10px]">
        <thead>
          <tr className="border-border-subtle border-b text-[8px] text-muted-foreground uppercase tracking-wide">
            <th className="px-1.5 py-1 text-start font-medium">Sym</th>
            <th className="px-1 py-1 text-end font-medium tabular-data">Px</th>
            <th className="px-1 py-1 text-end font-medium tabular-data">24h</th>
            <th className="min-w-0 px-1 py-1 text-start font-medium">Driver</th>
            <th className="px-1 py-1 text-start font-medium">Risk</th>
            <th className="px-1.5 py-1 text-end font-medium">Act</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => {
            const isUp = t.change.trim().startsWith("+");
            return (
              <tr
                key={t.symbol}
                className="border-border-subtle/80 border-b border-dashed last:border-b-0 hover:bg-white/[0.03]"
              >
                <td className="max-w-[4.5rem] truncate px-1.5 py-1 font-medium text-foreground">
                  {t.symbol}
                </td>
                <td className="px-1 py-1 text-end tabular-data text-foreground/95">
                  {formatPrice(t.price)}
                </td>
                <td
                  className={cn(
                    "px-1 py-1 text-end tabular-data",
                    isUp ? "text-neon-up" : "text-neon-down",
                  )}
                >
                  {t.change}
                </td>
                <td className="max-w-[9rem] truncate px-1 py-1 font-sans text-[9px] text-foreground/80 leading-tight">
                  {t.reason}
                </td>
                <td className="px-1 py-1 text-muted-foreground uppercase">{t.risk}</td>
                <td className="px-1.5 py-0.5 text-end">
                  <div className="flex justify-end gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-7 shrink-0 rounded-sm text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                      aria-label={`Chart ${t.symbol}`}
                      onClick={() => onViewChart(t.symbol)}
                    >
                      <LineChartIcon className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="size-7 shrink-0 rounded-sm border-primary/30 text-primary hover:bg-primary/10"
                      aria-label={`Simulate buy ${t.symbol}`}
                      onClick={() => onBuy(t.symbol)}
                    >
                      <ShoppingCart className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
