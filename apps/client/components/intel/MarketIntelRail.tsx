"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ScrollArea } from "@darkflow/ui/scroll-area";
import { fetchIntel } from "@/lib/api/queries";
import { queryKeys } from "@/lib/query-keys";
import type { IntelEvent, IntelKind } from "@/lib/data/mockData";
import { cn } from "@/lib/utils";

const kindAccent = (k: IntelKind) => {
  if (k === "ALERT") return "border-s-destructive/75 text-destructive/90";
  if (k === "LAUNCH") return "border-s-signal text-signal";
  if (k === "FLOW") return "border-s-primary text-primary";
  return "border-s-muted-foreground/60 text-muted-foreground";
};

const formatTime = (at: number) => {
  const d = new Date(at);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

type MarketIntelRailProps = {
  className?: string;
};

export const MarketIntelRail = ({ className }: MarketIntelRailProps) => {
  const [nowTick, setNowTick] = useState(() => Date.now());

  const { data: events = [] } = useQuery({
    queryKey: queryKeys.intel,
    queryFn: fetchIntel,
    refetchInterval: 4500,
  });

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col rounded-lg border border-border-subtle bg-surface-glass/90 backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-border-subtle border-b px-2.5 py-1.5">
        <h2 className="font-medium text-foreground text-[11px] uppercase tracking-[0.16em]">
          Market intel
        </h2>
        <span className="font-mono text-[10px] text-signal/90">LIVE·SIM</span>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2 py-1.5">
        <ul className="flex flex-col gap-1.5 pr-2 pb-2" aria-live="polite">
          <AnimatePresence initial={false}>
            {events.map((e: IntelEvent) => {
              const isNew = nowTick - e.at < 12_000;
              return (
                <motion.li
                  key={e.id}
                  layout
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 6 }}
                  className={cn(
                    "relative border-s-2 rounded-md border border-border-subtle bg-black/25 py-1.5 ps-2.5 pe-2 font-mono text-[11px] leading-snug",
                    kindAccent(e.kind),
                  )}
                >
                  {isNew ? (
                    <span className="absolute end-1.5 top-1 rounded bg-signal/15 px-1 py-0.5 text-[9px] text-signal uppercase">
                      new
                    </span>
                  ) : null}
                  <div className="flex items-baseline justify-between gap-2 pe-10">
                    <span className="text-muted-foreground">{formatTime(e.at)}</span>
                    <span className="text-[10px] text-signal/90 uppercase">{e.kind}</span>
                  </div>
                  <p className="mt-0.5 font-sans font-medium text-foreground text-xs">{e.title}</p>
                  <p className="mt-0.5 text-muted-foreground text-[11px]">{e.detail}</p>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </ScrollArea>
    </div>
  );
};
