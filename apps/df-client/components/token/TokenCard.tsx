"use client";

import { motion } from "framer-motion";
import { LineChartIcon, ShoppingCart } from "lucide-react";
import { Button } from "@repo/ui/button";
import { cn } from "@/lib/utils";
import type { TerminalToken } from "@/lib/types/terminal";

type TokenCardProps = {
  token: TerminalToken;
  onViewChart: (symbol: string) => void;
  onBuy: (symbol: string) => void;
  className?: string;
};

const RiskSignal = ({ risk }: { risk: TerminalToken["risk"] }) => {
  const level = risk === "Low" ? 1 : risk === "Medium" ? 2 : 3;
  const dot =
    risk === "Low"
      ? "bg-muted-foreground"
      : risk === "Medium"
        ? "bg-amber-400"
        : "bg-[#ff3b30]";
  const barFillActive =
    risk === "Low" ? "#64748b" : risk === "Medium" ? "#fbbf24" : "#ff3b30";
  const barFillMuted = "rgba(100,116,139,0.2)";

  return (
    <div className="flex shrink-0 items-center gap-2" aria-label={`Risk ${risk}`}>
      <span className={cn("size-1.5 shrink-0 rounded-full", dot)} aria-hidden />
      <svg width="18" height="12" viewBox="0 0 18 12" className="shrink-0" aria-hidden>
        {[0, 1, 2].map((i) => {
          const h = 4 + i * 3;
          const active = i < level;
          return (
            <rect
              key={i}
              x={2 + i * 6}
              y={12 - h}
              width="3"
              height={h}
              rx="0.5"
              fill={active ? barFillActive : barFillMuted}
            />
          );
        })}
      </svg>
      <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wide">
        {risk}
      </span>
    </div>
  );
};

export const TokenCard = ({
  token,
  onViewChart,
  onBuy,
  className,
}: TokenCardProps) => {
  const isUp = token.change.trim().startsWith("+");

  const handleChartClick = () => {
    onViewChart(token.symbol);
  };

  const handleBuyClick = () => {
    onBuy(token.symbol);
  };

  const handleChartKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleChartClick();
    }
  };

  const handleBuyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleBuyClick();
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className={cn(
        "rounded-sm border border-border-subtle bg-black/35 px-2.5 py-2",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-muted-foreground text-[11px] uppercase tracking-wider">
            {token.symbol}
          </p>
          <p className="mt-0.5 line-clamp-2 font-sans text-[11px] text-foreground/90 leading-snug">
            {token.reason}
          </p>
        </div>
        <RiskSignal risk={token.risk} />
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Price</p>
          <p className="font-mono text-xl font-semibold text-foreground tabular-nums leading-tight">
            {token.price < 1 ? token.price.toPrecision(6) : token.price.toFixed(4)}
          </p>
        </div>
        <div className="text-end">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">24h</p>
          <p
            className={cn(
              "font-mono text-sm font-medium tabular-nums",
              isUp ? "text-neon-up" : "text-neon-down",
            )}
          >
            {token.change}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-row gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 flex-1 rounded-sm px-2 font-mono text-[10px] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
          onClick={handleChartClick}
          onKeyDown={handleChartKeyDown}
          aria-label={`View chart for ${token.symbol}`}
        >
          <LineChartIcon className="size-3" aria-hidden />
          Chart
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 flex-1 rounded-sm border-primary/35 px-2 font-mono text-[10px] text-primary hover:bg-primary/10"
          onClick={handleBuyClick}
          onKeyDown={handleBuyKeyDown}
          aria-label={`Simulate buy for ${token.symbol}`}
        >
          <ShoppingCart className="size-3" aria-hidden />
          Buy
        </Button>
      </div>
    </motion.div>
  );
};
