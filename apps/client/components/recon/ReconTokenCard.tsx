"use client";

import { motion } from "framer-motion";
import { Globe, LayoutPanelLeft, Send, Sparkles } from "lucide-react";
import { useTerminal } from "@/components/layout/TerminalState";
import { Button } from "@darkflow/ui/button";
import { cn } from "@/lib/utils";
import type { ReconToken } from "@/lib/data/reconMock";

const fmtUsdShort = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
};

type ReconTokenCardProps = {
  token: ReconToken;
  index: number;
};

export const ReconTokenCard = ({ token, index }: ReconTokenCardProps) => {
  const { selectedSymbol, setSelectedSymbol, openCoinInsights } = useTerminal();
  const active = token.trackSymbol === selectedSymbol;

  const ageClass =
    token.ageTone === "fresh"
      ? "text-primary"
      : token.ageTone === "warm"
        ? "text-signal"
        : "text-muted-foreground";

  const handleSelect = () => {
    setSelectedSymbol(token.trackSymbol);
  };

  const handleOpenInsights = () => {
    openCoinInsights(token.trackSymbol, token.displayName);
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, type: "spring", stiffness: 380, damping: 30 }}
      className={cn(
        "rounded-sm border border-border-subtle bg-black/45 p-2 transition-colors",
        active && "border-primary/40 bg-primary/[0.06]",
      )}
    >
      <div className="flex gap-2">
        <div className="relative shrink-0">
          <div className="flex size-11 items-center justify-center rounded-sm border border-border-subtle bg-black/60 font-semibold text-primary text-xs">
            {token.symbol.slice(0, 2).toUpperCase()}
          </div>
          <span
            className="absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full border border-background bg-primary"
            aria-hidden
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-foreground text-sm leading-tight">
                {token.displayName}
              </h3>
              <p className="truncate font-mono text-[10px] text-muted-foreground uppercase tracking-tight">
                {token.symbol}
              </p>
            </div>
            <span className={cn("shrink-0 font-mono text-[11px] tabular-nums", ageClass)}>
              {token.ageLabel}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[9px] text-muted-foreground uppercase">
            <span title="Dev hold">DH {token.devHoldPct}%</span>
            <span title="LP lock">LP {token.lpLockedPct}%</span>
            <span title="Top holder">T10 {token.topHolderPct}%</span>
          </div>

          <div className="mt-1 flex items-center gap-1.5">
            {token.hasX ? (
              <span className="rounded-sm border border-border-subtle px-1 py-px font-mono text-[8px] text-muted-foreground">
                X
              </span>
            ) : null}
            {token.hasTg ? (
              <span className="rounded-sm border border-border-subtle px-1 py-px font-mono text-[8px] text-muted-foreground">
                TG
              </span>
            ) : null}
            {token.hasWeb ? (
              <Globe className="size-3 text-muted-foreground" aria-label="Web" />
            ) : null}
          </div>

          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 font-mono text-[10px]">
            <span className="text-muted-foreground">V</span>
            <span className="text-foreground/90">{fmtUsdShort(token.volumeUsd)}</span>
            <span className="text-muted-foreground">MC</span>
            <span className="text-signal">{fmtUsdShort(token.mcapUsd)}</span>
            <span className="text-muted-foreground">H</span>
            <span className="tabular-nums text-foreground/85">{token.holders}</span>
            <span className="text-muted-foreground">TX</span>
            <span className="tabular-nums text-foreground/85">{token.txns24h}</span>
          </div>

          {token.curveProgress != null ? (
            <div className="mt-2 space-y-1">
              <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-primary/80 transition-[width] duration-500"
                  style={{ width: `${Math.round(token.curveProgress * 100)}%` }}
                />
              </div>
              {token.migrating ? (
                <p className="flex items-center gap-1 font-mono text-[9px] text-primary uppercase animate-pulse">
                  <Sparkles className="size-3" aria-hidden />
                  Migrating…
                </p>
              ) : null}
            </div>
          ) : null}

          {token.venue ? (
            <p className="mt-1.5 font-mono text-[9px] text-muted-foreground uppercase">
              Desk · <span className="text-primary">{token.venue}</span>
            </p>
          ) : null}

          <div className="mt-2 flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 flex-1 rounded-sm border-border-subtle font-mono text-[9px] uppercase"
              onClick={handleSelect}
            >
              Track
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="size-7 shrink-0 rounded-sm border-border-subtle p-0 text-muted-foreground hover:text-primary"
              aria-label={`Open ${token.displayName} details`}
              onClick={handleOpenInsights}
            >
              <LayoutPanelLeft className="size-3.5" aria-hidden />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="size-7 shrink-0 rounded-sm p-0 text-muted-foreground"
              aria-label="Sim ping desk"
            >
              <Send className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </motion.article>
  );
};
