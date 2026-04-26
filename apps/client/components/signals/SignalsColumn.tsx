"use client";

import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@darkflow/ui/scroll-area";
import { useTerminal } from "@/components/layout/TerminalState";
import { fetchIntel, fetchTrades } from "@/lib/api/queries";
import { queryKeys } from "@/lib/query-keys";
import type { IntelEvent, MockTrade } from "@/lib/data/mockData";
import { cn } from "@/lib/utils";

type SignalsColumnProps = {
  className?: string;
};

const formatHms = (at: number) =>
  new Date(at).toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export const SignalsColumn = ({ className }: SignalsColumnProps) => {
  const { trades: extraTrades } = useTerminal();

  const { data: remote = [] } = useQuery({
    queryKey: queryKeys.trades,
    queryFn: fetchTrades,
    refetchInterval: 2000,
  });

  const { data: intel = [] } = useQuery({
    queryKey: queryKeys.intel,
    queryFn: fetchIntel,
    refetchInterval: 4500,
  });

  const mergedMap = new Map<string, MockTrade>();
  for (const t of [...extraTrades, ...remote]) {
    mergedMap.set(t.id, t);
  }
  const tape = [...mergedMap.values()].slice(0, 48);

  const rowGridTape =
    "grid grid-cols-[2.75rem_minmax(0,1fr)_minmax(3.25rem,1fr)_3.25rem] gap-x-1 items-baseline";
  const rowGridIntel =
    "grid grid-cols-[3.25rem_minmax(0,1fr)_3.25rem] gap-x-1 items-baseline";

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-col border-border-subtle border-e bg-background",
        className,
      )}
    >
      <div className="shrink-0 border-border-subtle border-b px-2 py-1">
        <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.22em]">
          Signals
        </p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col pb-1 pe-0.5">
          <p className="px-2 py-0.5 font-mono text-[8px] text-electric-mint/85 uppercase tracking-wider">
            Tape
          </p>
          <div
            className={cn(
              rowGridTape,
              "border-border-subtle border-b px-2 py-0.5 font-mono text-[8px] text-muted-foreground uppercase tracking-wide",
            )}
            aria-hidden
          >
            <span>Type</span>
            <span>Ticker</span>
            <span className="text-end tabular-data">Price</span>
            <span className="text-end">Time</span>
          </div>
          <ul className="flex flex-col font-mono text-[9px] leading-tight" aria-live="polite">
            {tape.map((t) => (
              <li
                key={t.id}
                className={cn(rowGridTape, "border-border-subtle border-b px-2 py-0.5")}
              >
                <span
                  className={cn(
                    "font-medium uppercase",
                    t.side === "buy" ? "text-neon-up" : "text-neon-down",
                  )}
                >
                  {t.side === "buy" ? "BUY" : "SELL"}
                </span>
                <span className="min-w-0 truncate text-foreground/90">{t.symbol}</span>
                <span className="truncate text-end tabular-data text-muted-foreground">
                  {t.price}
                </span>
                <span className="text-end tabular-data text-muted-foreground/90">
                  {formatHms(t.at)}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-1.5 px-2 py-0.5 font-mono text-[8px] text-signal/85 uppercase tracking-wider">
            Intel
          </p>
          <div
            className={cn(
              rowGridIntel,
              "border-border-subtle border-b px-2 py-0.5 font-mono text-[8px] text-muted-foreground uppercase tracking-wide",
            )}
            aria-hidden
          >
            <span>Kind</span>
            <span>Headline</span>
            <span className="text-end">Time</span>
          </div>
          <ul className="flex flex-col font-mono text-[9px] leading-tight">
            {intel.slice(0, 14).map((e: IntelEvent) => (
              <li
                key={e.id}
                className={cn(rowGridIntel, "border-border-subtle border-b px-2 py-0.5")}
              >
                <span className="shrink-0 text-signal/90">{e.kind}</span>
                <span className="min-w-0 truncate text-foreground/88">{e.title}</span>
                <span className="text-end tabular-data text-muted-foreground/90">
                  {formatHms(e.at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </ScrollArea>
    </div>
  );
};
