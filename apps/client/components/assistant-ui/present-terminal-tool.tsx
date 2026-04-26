"use client";

import { memo, useEffect, useMemo } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { motion } from "framer-motion";
import { TokenTableWidget } from "@/components/token/TokenTableWidget";
import { useTerminal } from "@/components/layout/TerminalState";
import { presentTerminalSchema } from "@/lib/ai/schema";
import type { PresentTerminalInput } from "@/lib/types/terminal";
import { cn } from "@/lib/utils";

const parsePayload = (
  argsText: string | undefined,
  result: unknown,
): PresentTerminalInput | null => {
  try {
    if (result !== undefined && result !== null && typeof result === "object") {
      return presentTerminalSchema.parse(result);
    }
    if (argsText) {
      return presentTerminalSchema.parse(JSON.parse(argsText));
    }
  } catch {
    return null;
  }
  return null;
};

const PresentTerminalToolImpl: ToolCallMessagePartComponent = ({
  argsText,
  result,
  status,
}) => {
  const {
    setSelectedSymbol,
    setChartDrawerOpen,
    flashOrder,
    appendSimulatedTrade,
  } = useTerminal();
  const payload = useMemo(
    () => parsePayload(argsText, result),
    [argsText, result],
  );

  const primarySymbol = payload?.tokens[0]?.symbol;
  useEffect(() => {
    if (!primarySymbol) return;
    setSelectedSymbol(primarySymbol);
  }, [primarySymbol, setSelectedSymbol]);

  const handleViewChart = (symbol: string) => {
    setSelectedSymbol(symbol);
    setChartDrawerOpen(true);
  };

  const handleBuy = (symbol: string) => {
    const row = payload?.tokens.find((t) => t.symbol === symbol);
    const priceStr = row
      ? row.price < 1
        ? row.price.toPrecision(6)
        : row.price.toFixed(4)
      : "—";
    flashOrder(`Simulated market buy: ${symbol} @ ${priceStr}`);
    appendSimulatedTrade({
      id: `sim_${Date.now()}`,
      side: "buy",
      symbol,
      size: "1.00",
      price: priceStr,
      at: Date.now(),
    });
  };

  if (!payload) {
    const running = status?.type === "running";
    return (
      <div
        className={cn(
          "rounded-sm border border-border-subtle border-s-primary/45 bg-ai-bubble px-2.5 py-2 font-mono text-muted-foreground text-xs",
          running && "animate-pulse",
        )}
        aria-live="polite"
      >
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
          Terminal
        </p>
        <p className="mt-1">
          {running ? "Streaming terminal payload…" : "Waiting for terminal payload…"}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border-subtle border-s-primary/55 bg-ai-bubble px-2.5 py-2">
      <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.18em]">
        Terminal
      </p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mt-1 font-sans text-foreground text-sm leading-relaxed"
      >
        {payload.message}
      </motion.p>
      <div className="mt-2">
        <TokenTableWidget
          tokens={payload.tokens}
          onViewChart={handleViewChart}
          onBuy={handleBuy}
        />
      </div>
    </div>
  );
};

export const PresentTerminalTool = memo(
  PresentTerminalToolImpl,
) as ToolCallMessagePartComponent;
