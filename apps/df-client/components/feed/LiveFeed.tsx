"use client";

import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { ScrollArea } from "@repo/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { fetchIntel, fetchTrades } from "@/lib/api/queries";
import { queryKeys } from "@/lib/query-keys";
import type { IntelEvent, MockTrade } from "@/lib/data/mockData";
import { cn } from "@/lib/utils";

type LiveFeedProps = {
  extraTrades?: MockTrade[];
  className?: string;
  intelVariant?: boolean;
  defaultTab?: "tape" | "alerts";
};

export const LiveFeed = ({
  extraTrades = [],
  className,
  intelVariant,
  defaultTab = "tape",
}: LiveFeedProps) => {
  const [tab, setTab] = useState(defaultTab);
  const [pulse, setPulse] = useState(0);

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

  useEffect(() => {
    const id = window.setInterval(() => setPulse((p) => p + 1), 1100);
    return () => window.clearInterval(id);
  }, []);

  const mergedMap = new Map<string, MockTrade>();
  for (const t of [...extraTrades, ...remote]) {
    mergedMap.set(t.id, t);
  }
  const merged = [...mergedMap.values()].slice(0, 60);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col rounded-lg border border-border-subtle bg-surface-glass/90 p-2 backdrop-blur-sm",
        intelVariant && "ring-1 ring-white/[0.04]",
        className,
      )}
    >
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "tape" | "alerts")}
        className="flex min-h-0 flex-1 flex-col gap-1.5"
      >
        <div className="flex items-center justify-between gap-2">
          <TabsList
            className={cn(
              "h-8 w-full max-w-full grid grid-cols-2 rounded-md bg-black/35 p-0.5",
              intelVariant && "h-8",
            )}
          >
            <TabsTrigger
              value="tape"
              className="rounded-md font-mono text-[11px] uppercase data-active:bg-primary/12 data-active:text-primary"
            >
              Tape
            </TabsTrigger>
            <TabsTrigger
              value="alerts"
              className="rounded-md font-mono text-[11px] uppercase data-active:bg-signal/12 data-active:text-signal"
            >
              Alerts
            </TabsTrigger>
          </TabsList>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase transition-opacity duration-300",
              intelVariant ? "bg-signal/12 text-signal" : "bg-primary/12 text-primary",
              pulse % 2 === 0 ? "opacity-100" : "opacity-75",
            )}
            aria-hidden
          >
            sim
          </span>
        </div>

        <TabsContent value="tape" className="mt-0 min-h-0 flex-1 outline-none">
          <ScrollArea className="h-full min-h-[120px] pr-2">
            <ul className="flex flex-col gap-1 pb-2" aria-live="polite">
              <AnimatePresence initial={false}>
                {merged.map((t) => (
                  <motion.li
                    key={t.id}
                    layout
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-black/30 px-2 py-1.5 font-mono text-[11px]"
                  >
                    <span
                      className={cn(
                        "font-semibold uppercase",
                        t.side === "buy" ? "text-neon-up" : "text-neon-down",
                      )}
                    >
                      {t.side}
                    </span>
                    <span className="text-foreground">{t.symbol}</span>
                    <span className="text-muted-foreground">{t.size}</span>
                    <span className="tabular-nums text-foreground">{t.price}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="alerts" className="mt-0 min-h-0 flex-1 outline-none">
          <ScrollArea className="h-full min-h-[120px] pr-2">
            <ul className="flex flex-col gap-1 pb-2" aria-live="polite">
              <AnimatePresence initial={false}>
                {intel.slice(0, 24).map((e: IntelEvent) => (
                  <motion.li
                    key={e.id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="rounded-md border border-border-subtle bg-black/30 px-2 py-1.5 font-mono text-[10px] text-signal/90 leading-snug"
                  >
                    <span className="text-muted-foreground">{e.kind}</span>
                    <p className="mt-0.5 font-sans text-foreground text-xs">{e.title}</p>
                    <p className="text-muted-foreground">{e.detail}</p>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};
