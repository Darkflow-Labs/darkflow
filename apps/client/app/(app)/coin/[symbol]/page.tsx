"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Badge } from "@darkflow/ui/badge";
import { CoinDetailFullView } from "@/components/coin/CoinDetailFullView";

const CoinConsolePageBody = () => {
  const params = useParams();
  const searchParams = useSearchParams();
  const raw = params?.symbol;
  const decoded = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const symbol = decodeURIComponent(decoded).trim().toUpperCase();
  const label = searchParams.get("label")?.trim() || null;

  if (!symbol) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6">
        <p className="font-mono text-sm text-muted-foreground">Missing symbol.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <motion.header
        id="console-app-header"
        initial={{ opacity: 0, y: -3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className="shrink-0 flex items-center justify-between gap-2 border-border-subtle border-b px-2 py-1 md:px-2.5"
      >
        <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
          <h1 className="font-semibold text-foreground text-xs tracking-tight md:text-sm">
            darkflow.
          </h1>
          <Badge
            variant="outline"
            className="rounded-sm border-border-subtle px-1 py-0 font-mono text-[8px] text-muted-foreground uppercase leading-none md:text-[9px]"
          >
            coin
          </Badge>
        </div>
      </motion.header>
      <CoinDetailFullView symbol={symbol} displayLabel={label} />
    </div>
  );
};

export default function CoinConsolePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6">
          <p className="font-mono text-xs text-muted-foreground uppercase">Loading…</p>
        </div>
      }
    >
      <CoinConsolePageBody />
    </Suspense>
  );
}
