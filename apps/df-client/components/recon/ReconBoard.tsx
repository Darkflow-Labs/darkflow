"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Filter } from "lucide-react";
import { useMemo, useState } from "react";
import { ReconTokenCard } from "@/components/recon/ReconTokenCard";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { ScrollArea } from "@repo/ui/scroll-area";
import type { ReconToken } from "@/lib/data/reconMock";
import { fetchRecon } from "@/lib/api/queries";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type LaneKey = "newCreations" | "aboutToGraduate" | "graduated";

const LANE_META: Record<
  LaneKey,
  { title: string; subtitle: string; accent: string }
> = {
  newCreations: {
    title: "New deploys",
    subtitle: "Fresh pairs · sim stream",
    accent: "text-primary",
  },
  aboutToGraduate: {
    title: "Curve exit",
    subtitle: "Pressure building to pool",
    accent: "text-signal",
  },
  graduated: {
    title: "Live pools",
    subtitle: "Routed · paper venue tags",
    accent: "text-primary/80",
  },
};

const LaneColumn = ({
  laneKey,
  tokens,
}: {
  laneKey: LaneKey;
  tokens: ReconToken[];
}) => {
  const [hotOnly, setHotOnly] = useState(false);
  const meta = LANE_META[laneKey];

  const filtered = useMemo(() => {
    if (!hotOnly) return tokens;
    return tokens.filter((_, i) => i % 2 === 0);
  }, [tokens, hotOnly]);

  return (
    <motion.section
      variants={{
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0 },
      }}
      className="flex max-h-[42vh] min-h-0 min-w-0 flex-col rounded-sm border border-border-subtle bg-black/35 lg:max-h-none lg:h-full lg:min-h-0"
    >
      <header className="shrink-0 border-border-subtle border-b px-2 py-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2
              className={cn(
                "font-mono text-[11px] uppercase tracking-wide",
                meta.accent,
              )}
            >
              {meta.title}
            </h2>
            <p className="mt-0.5 font-mono text-[8px] text-muted-foreground uppercase tracking-wider">
              {meta.subtitle}
            </p>
          </div>
          <Button
            type="button"
            variant={hotOnly ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 shrink-0 gap-1 rounded-sm px-2 font-mono text-[9px] uppercase",
              hotOnly && "bg-primary/15 text-primary hover:bg-primary/20",
            )}
            onClick={() => setHotOnly((v) => !v)}
            aria-pressed={hotOnly}
            aria-label="Toggle compact lane filter"
          >
            <Filter className="size-3" aria-hidden />
            Filter
          </Button>
        </div>
      </header>
      <ScrollArea className="h-0 min-h-0 min-w-0 flex-1">
        <div className="flex flex-col gap-1.5 p-2 pb-4">
          {filtered.map((t, i) => (
            <ReconTokenCard key={t.id} token={t} index={i} />
          ))}
        </div>
      </ScrollArea>
    </motion.section>
  );
};

export const ReconBoard = () => {
  const { data, isPending } = useQuery({
    queryKey: queryKeys.recon,
    queryFn: fetchRecon,
    refetchInterval: 5000,
  });

  if (isPending || !data) {
    return (
      <div className="flex flex-1 items-center justify-center font-mono text-muted-foreground text-sm">
        Syncing recon lanes…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden px-2 py-2 md:px-3">
      <div className="shrink-0 flex flex-wrap items-center gap-2 border-border-subtle border-b pb-2">
        <Badge
          variant="outline"
          className="rounded-sm border-primary/35 font-mono text-[9px] text-primary uppercase"
        >
          Recon mode
        </Badge>
        <span className="font-mono text-[10px] text-muted-foreground">
          Turbo desk · mock lanes refresh on interval
        </span>
      </div>

      <motion.div
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)] lg:gap-3 lg:items-stretch"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.06 } },
        }}
      >
        <LaneColumn laneKey="newCreations" tokens={data.newCreations} />
        <LaneColumn laneKey="aboutToGraduate" tokens={data.aboutToGraduate} />
        <LaneColumn laneKey="graduated" tokens={data.graduated} />
      </motion.div>
    </div>
  );
};
