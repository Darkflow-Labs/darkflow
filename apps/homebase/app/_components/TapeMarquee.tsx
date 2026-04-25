"use client";

import { cn } from "@repo/ui/utils";

import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

type TapeRow = {
  id: string;
  hash: string;
  label: string;
  smartMoney?: boolean;
};

const ROWS: TapeRow[] = [
  { id: "1", hash: "4k2…9f1", label: "SOL · swap · 12.4", smartMoney: false },
  { id: "2", hash: "8a1…c03", label: "USDC · mint · 250k", smartMoney: true },
  { id: "3", hash: "0xe…22b", label: "ETH · bridge · in", smartMoney: false },
  { id: "4", hash: "3m9…77d", label: "SOL · route · 2.1", smartMoney: false },
  { id: "5", hash: "7p0…aa4", label: "WIF · pool · add", smartMoney: true },
  { id: "6", hash: "1q5…88e", label: "SOL · settle · out", smartMoney: false },
];

const TapeMarquee = () => {
  const reducedMotion = usePrefersReducedMotion();
  const doubled = [...ROWS, ...ROWS];

  return (
    <div
      className="relative h-[200px] overflow-hidden rounded-md border border-border/40 bg-background/25 sm:h-[220px]"
      aria-label="Simulated tape for visual flavor only. Not live market data."
    >
      <div className="border-b border-border/60 px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
        SIMULATED TAPE · fiction
      </div>
      <div className="relative h-[calc(100%-2.25rem)] overflow-hidden">
        <div
          className={cn(
            "flex flex-col gap-0 px-2 py-1 font-mono text-[11px] leading-snug",
            !reducedMotion && "hb-tape-scroll"
          )}
        >
          {doubled.map((row, i) => (
            <div
              key={`${row.id}-${i}`}
              className={cn(
                "flex justify-between gap-2 border-b border-border/30 py-1.5",
                row.smartMoney &&
                  "bg-[color-mix(in_oklab,var(--radon)_8%,transparent)] text-[color:var(--radon)] shadow-[inset_0_0_0_1px_rgba(255,59,48,0.12)]"
              )}
            >
              <span className="truncate text-muted-foreground">{row.hash}</span>
              <span className={cn("shrink-0", row.smartMoney && "font-medium")}>
                {row.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export { TapeMarquee };
