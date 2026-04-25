"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell, Search } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { HeatmapCalendar } from "@/components/heatmap/HeatmapCalendar";
import { useTerminal } from "@/components/layout/TerminalState";
import type {
  PortfolioDeployedRow,
  PortfolioPosition,
  PortfolioTradeRow,
} from "@/lib/data/portfolioMock";
import { fetchPortfolio } from "@/lib/api/queries";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { ScrollArea } from "@repo/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const fmtUsd = (n: number, signed = false) => {
  const abs = Math.abs(n);
  const body = abs >= 1000 ? `${(abs / 1000).toFixed(2)}K` : abs.toFixed(2);
  const dollar = `$${body}`;
  if (!signed) return (n < 0 ? "-" : "") + dollar;
  if (n > 0) return `+${dollar}`;
  if (n < 0) return `-${dollar}`;
  return dollar;
};

const PnlSparkline = ({ series }: { series: number[] }) => {
  if (series.length < 2) return null;
  const w = 280;
  const h = 72;
  const pad = 4;
  const pts = series.map((v, i) => {
    const x = pad + (i / (series.length - 1)) * (w - pad * 2);
    const y = pad + (1 - v) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-20 w-full max-w-[min(100%,280px)] text-primary"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts.join(" ")}
        opacity={0.9}
      />
    </svg>
  );
};

type PosSort = "sym" | "pnl" | "recent";

export const PortfolioAnalyzerView = () => {
  const { selectedSymbol, setSelectedSymbol } = useTerminal();
  /** Stable range end so the heatmap grid is not rebuilt every render */
  const heatmapEndDate = useMemo(() => new Date(), []);
  const [walletQuery, setWalletQuery] = useState("");
  const [pnlRange, setPnlRange] = useState<"all" | "7d" | "24h" | "6h" | "1h">(
    "all",
  );
  const [posSort, setPosSort] = useState<PosSort>("pnl");
  const [tab, setTab] = useState<"history" | "winners" | "deployed">("history");

  const { data, isPending } = useQuery({
    queryKey: queryKeys.portfolio,
    queryFn: fetchPortfolio,
    refetchInterval: 8000,
  });

  const sortedPositions = useMemo(() => {
    if (!data) return [];
    const rows = [...data.positions];
    if (posSort === "sym") rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
    else if (posSort === "pnl") rows.sort((a, b) => b.pnlUsd - a.pnlUsd);
    else rows.reverse();
    return rows;
  }, [data, posSort]);

  const handleRowSymbol = useCallback(
    (symbol: string) => {
      setSelectedSymbol(symbol);
    },
    [setSelectedSymbol],
  );

  if (isPending || !data) {
    return (
      <div className="flex flex-1 items-center justify-center font-mono text-muted-foreground text-sm">
        Loading portfolio snapshot…
      </div>
    );
  }

  const { summary, pnlSeries, heatmapData, distribution } = data;

  return (
    <div className="isolate flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-2 py-2 md:gap-4 md:px-3 md:py-2.5">
      <section className="shrink-0 space-y-2 border-border-subtle border-b pb-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-foreground text-sm tracking-tight md:text-base">
                Portfolio analyzer
              </h2>
              <Badge
                variant="outline"
                className="rounded-sm border-primary/30 font-mono text-[9px] text-primary uppercase"
              >
                sim
              </Badge>
            </div>
            <p className="mt-0.5 max-w-xl text-muted-foreground text-xs leading-snug md:text-[13px]">
              Paper desk: realized vs open risk, lane activity, and settlement log — not a custodial
              wallet.
            </p>
          </div>
          <div className="flex w-full max-w-md flex-col gap-1.5 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={walletQuery}
                onChange={(e) => setWalletQuery(e.target.value)}
                placeholder="Track label or 0x… (mock)"
                className="rounded-sm border-border-subtle bg-black/40 ps-8 font-mono text-xs"
                aria-label="Wallet or label filter"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 rounded-sm border-border-subtle font-mono text-[10px] uppercase"
            >
              <Bell className="me-1 size-3" aria-hidden />
              Alert
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatBlock
            label="Realized PnL"
            value={fmtUsd(summary.realizedPnlUsd, true)}
            tone={summary.realizedPnlUsd >= 0 ? "up" : "down"}
          />
          <StatBlock
            label="Unrealized"
            value={fmtUsd(summary.unrealizedPnlUsd, true)}
            tone={summary.unrealizedPnlUsd >= 0 ? "up" : "down"}
          />
          <StatBlock
            label="Notional in"
            value={fmtUsd(summary.totalRevenueUsd, true)}
            tone="up"
          />
          <StatBlock
            label="Notional out"
            value={fmtUsd(summary.totalSpentUsd, true)}
            tone="neutral"
          />
        </div>
      </section>

      <div className="grid w-full items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-4">
        <div className="flex w-full min-w-0 flex-col gap-3 self-start">
          <Panel title="Realized curve" subtitle="Normalized mock path">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["all", "All"],
                  ["7d", "7D"],
                  ["24h", "24H"],
                  ["6h", "6H"],
                  ["1h", "1H"],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={pnlRange === key ? "default" : "outline"}
                  className={cn(
                    "h-7 rounded-sm px-2 font-mono text-[10px] uppercase",
                    pnlRange === key && "bg-primary/15 text-primary hover:bg-primary/20",
                  )}
                  onClick={() => setPnlRange(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="mt-2 flex min-h-[5rem] items-center justify-center rounded-sm border border-border-subtle border-dashed bg-black/30 p-2">
              <PnlSparkline series={pnlSeries} />
            </div>
          </Panel>

          <div className="w-full shrink-0">
            <HeatmapCalendar
              title="Desk fills"
              data={heatmapData}
              endDate={heatmapEndDate}
              rangeDays={365}
              weekStartsOn={1}
              cellSize={14}
              cellGap={3}
              bodyMinClassName="min-h-[18rem] lg:min-h-[20rem]"
              axisLabels={{
                showMonths: true,
                showWeekdays: true,
                weekdayIndices: [1, 3, 5],
                monthFormat: "short",
                minWeekSpacing: 3,
              }}
              legend={{ placement: "bottom", direction: "row" }}
              levelClassNames={[
                "bg-white/[0.06]",
                "bg-primary/18",
                "bg-primary/32",
                "bg-primary/50",
                "bg-primary/72",
              ]}
              className="shadow-none"
            />
          </div>
        </div>

        <Panel
          title="Open lanes"
          subtitle={`Focus ${selectedSymbol}`}
          className="w-full min-h-[14rem] self-stretch lg:min-h-0"
          expandBody
        >
          <div className="mb-2 flex flex-wrap gap-1">
            {(
              [
                ["pnl", "By PnL"],
                ["sym", "Symbol"],
                ["recent", "Recent"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant="ghost"
                className={cn(
                  "h-7 rounded-sm px-2 font-mono text-[10px] uppercase",
                  posSort === key && "bg-white/[0.08] text-primary",
                )}
                onClick={() => setPosSort(key)}
              >
                {label}
              </Button>
            ))}
          </div>
          <ScrollArea className="h-[min(22rem,42dvh)] pr-2 lg:max-h-[min(28rem,calc(100dvh-24rem))]">
            <table className="w-full border-collapse font-mono text-[10px]">
              <thead>
                <tr className="border-border-subtle border-b text-[8px] text-muted-foreground uppercase">
                  <th className="py-1.5 text-start font-medium">Sym</th>
                  <th className="py-1.5 text-end font-medium">In</th>
                  <th className="py-1.5 text-end font-medium">Out</th>
                  <th className="py-1.5 text-end font-medium">Rem</th>
                  <th className="py-1.5 text-end font-medium">PnL</th>
                </tr>
              </thead>
              <tbody>
                {sortedPositions.map((p) => (
                  <PositionRow
                    key={p.symbol}
                    p={p}
                    active={p.symbol === selectedSymbol}
                    onSelect={() => handleRowSymbol(p.symbol)}
                  />
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </Panel>
      </div>

      <section className="relative z-[1] mt-1 shrink-0 space-y-2 border-border-subtle border-t pt-4">
        <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
          PnL distribution
        </p>
        <div
          className="grid h-2.5 w-full min-w-0 overflow-hidden rounded-full bg-white/[0.06]"
          style={{
            gridTemplateColumns: `${distribution.over200Pct}fr ${distribution.between0And200Pct}fr ${distribution.under0Pct}fr`,
          }}
          role="img"
          aria-label={`PnL distribution: over 200% ${distribution.over200Pct.toFixed(0)} percent, mid ${distribution.between0And200Pct.toFixed(0)} percent, under zero ${distribution.under0Pct.toFixed(0)} percent`}
        >
          <div className="min-w-0 bg-primary" />
          <div className="min-w-0 bg-primary/45" />
          <div className="min-w-0 bg-neon-down/75" />
        </div>
        <div className="flex flex-wrap gap-3 font-mono text-[9px] text-muted-foreground uppercase">
          <span className="text-primary">
            &gt;200% ({distribution.counts.over200})
          </span>
          <span className="text-primary/80">
            0–200% ({distribution.counts.mid})
          </span>
          <span className="text-neon-down">
            &lt;0% ({distribution.counts.under0})
          </span>
        </div>
      </section>

      <Panel
        title="Settlement log"
        subtitle="Mock fills · desk only"
        className="relative z-[1] min-h-[12rem]"
        expandBody
      >
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as typeof tab)}
          className="flex min-h-0 flex-col gap-2"
        >
          <TabsList
            variant="line"
            className="h-auto w-full justify-start gap-0 rounded-none border-0 bg-transparent p-0"
          >
            <TabsTrigger
              value="history"
              className="rounded-sm font-mono text-[10px] uppercase data-active:border-primary/40 data-active:bg-primary/10 data-active:text-primary"
            >
              History
            </TabsTrigger>
            <TabsTrigger
              value="winners"
              className="rounded-sm font-mono text-[10px] uppercase data-active:border-primary/40 data-active:bg-primary/10 data-active:text-primary"
            >
              Top exits
            </TabsTrigger>
            <TabsTrigger
              value="deployed"
              className="rounded-sm font-mono text-[10px] uppercase data-active:border-primary/40 data-active:bg-primary/10 data-active:text-primary"
            >
              Deployed
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="mt-0 min-h-0 flex-1">
            <TradeTable rows={data.tradeHistory} />
          </TabsContent>
          <TabsContent value="winners" className="mt-0 min-h-0 flex-1">
            <TradeTable rows={data.topWinners} />
          </TabsContent>
          <TabsContent value="deployed" className="mt-0 min-h-0 flex-1">
            <DeployedTable rows={data.deployed} />
          </TabsContent>
        </Tabs>
      </Panel>
    </div>
  );
};

const Panel = ({
  title,
  subtitle,
  className,
  expandBody,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  /** When true, body fills remaining panel height (scroll regions). Omit for content-sized panels. */
  expandBody?: boolean;
  children: ReactNode;
}) => (
  <div
    className={cn(
      "flex flex-col rounded-sm border border-border-subtle bg-black/35 p-2.5",
      className,
    )}
  >
    <div className="mb-2 shrink-0 border-border-subtle border-b pb-1.5">
      <h3 className="font-medium text-foreground text-xs tracking-tight">{title}</h3>
      {subtitle ? (
        <p className="mt-0.5 font-mono text-[9px] text-muted-foreground uppercase tracking-wide">
          {subtitle}
        </p>
      ) : null}
    </div>
    <div className={cn(expandBody && "min-h-0 flex-1")}>{children}</div>
  </div>
);

const StatBlock = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "up" | "down" | "neutral";
}) => (
  <div className="rounded-sm border border-border-subtle bg-black/40 px-2 py-1.5">
    <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-wider">
      {label}
    </p>
    <p
      className={cn(
        "mt-0.5 font-mono text-sm tabular-nums tracking-tight",
        tone === "up" && "text-neon-up",
        tone === "down" && "text-neon-down",
        tone === "neutral" && "text-foreground/90",
      )}
    >
      {value}
    </p>
  </div>
);

const PositionRow = ({
  p,
  active,
  onSelect,
}: {
  p: PortfolioPosition;
  active: boolean;
  onSelect: () => void;
}) => {
  const up = p.pnlUsd >= 0;
  return (
    <tr
      className={cn(
        "cursor-pointer border-border-subtle/70 border-b border-dashed last:border-b-0 hover:bg-white/[0.04]",
        active && "bg-primary/[0.07]",
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
    >
      <td className="py-1.5 font-medium text-foreground">{p.symbol}</td>
      <td className="py-1.5 text-end tabular-nums text-foreground/90">
        {fmtUsd(p.investedUsd)}
      </td>
      <td className="py-1.5 text-end tabular-nums text-foreground/90">
        {fmtUsd(p.soldUsd)}
      </td>
      <td className="py-1.5 text-end tabular-nums text-foreground/90">
        {fmtUsd(p.remainingUsd)}
      </td>
      <td className="py-1.5 text-end">
        <span className={cn("tabular-nums", up ? "text-neon-up" : "text-neon-down")}>
          {fmtUsd(p.pnlUsd, true)}
        </span>
        <span className="ms-1 text-[9px] text-muted-foreground">
          ({p.pnlPct >= 0 ? "+" : ""}
          {p.pnlPct.toFixed(1)}%)
        </span>
      </td>
    </tr>
  );
};

const TradeTable = ({ rows }: { rows: PortfolioTradeRow[] }) => (
  <ScrollArea className="h-[200px] pr-2 md:h-[220px]">
    <table className="w-full border-collapse font-mono text-[10px]">
      <thead className="sticky top-0 z-[1] bg-background/95">
        <tr className="border-border-subtle border-b text-[8px] text-muted-foreground uppercase">
          <th className="py-1 text-start font-medium">Age</th>
          <th className="py-1 text-start font-medium">Type</th>
          <th className="py-1 text-end font-medium">Px</th>
          <th className="py-1 text-end font-medium">Amt</th>
          <th className="py-1 text-end font-medium">$</th>
          <th className="py-1 text-start font-medium">Maker</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            className="border-border-subtle/60 border-b border-dashed last:border-b-0"
          >
            <td className="py-1 text-neon-down tabular-nums">{r.age}</td>
            <td
              className={cn(
                "py-1 font-semibold uppercase",
                r.type === "buy" ? "text-neon-up" : "text-neon-down",
              )}
            >
              {r.type}
            </td>
            <td className="py-1 text-end tabular-nums">{r.price}</td>
            <td className="py-1 text-end tabular-nums">{r.amt}</td>
            <td className="py-1 text-end tabular-nums text-foreground/95">{r.totalUsd}</td>
            <td className="max-w-[7rem] truncate py-1 text-muted-foreground">{r.maker}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </ScrollArea>
);

const DeployedTable = ({ rows }: { rows: PortfolioDeployedRow[] }) => (
  <ScrollArea className="h-[200px] pr-2 md:h-[220px]">
    <table className="w-full border-collapse font-mono text-[10px]">
      <thead className="sticky top-0 z-[1] bg-background/95">
        <tr className="border-border-subtle border-b text-[8px] text-muted-foreground uppercase">
          <th className="py-1 text-start font-medium">Sym</th>
          <th className="py-1 text-start font-medium">Curve</th>
          <th className="py-1 text-end font-medium">Raised</th>
          <th className="py-1 text-end font-medium">Age</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            className="border-border-subtle/60 border-b border-dashed last:border-b-0"
          >
            <td className="py-1 font-medium text-foreground">{r.symbol}</td>
            <td className="py-1 text-muted-foreground uppercase">{r.curve}</td>
            <td className="py-1 text-end tabular-nums text-foreground/90">
              {fmtUsd(r.raisedUsd)}
            </td>
            <td className="py-1 text-end text-neon-down tabular-nums">{r.at}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </ScrollArea>
);
