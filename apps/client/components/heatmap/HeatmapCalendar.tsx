"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@darkflow/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@darkflow/ui/tooltip";
import { cn } from "@/lib/utils";
import * as React from "react";

export type HeatmapDatum = {
  date: string | Date;
  value: number;
  meta?: unknown;
};

export type HeatmapCell = {
  date: Date;
  key: string;
  value: number;
  level: number;
  label: string;
  disabled: boolean;
  meta?: unknown;
};

export type LegendConfig = {
  show?: boolean;
  lessText?: React.ReactNode;
  moreText?: React.ReactNode;
  showArrow?: boolean;
  placement?: "right" | "bottom";
  direction?: "row" | "column";
  showText?: boolean;
  swatchSize?: number;
  swatchGap?: number;
  className?: string;
};

export type AxisLabelsConfig = {
  show?: boolean;
  showWeekdays?: boolean;
  showMonths?: boolean;
  weekdayIndices?: number[];
  monthFormat?: "short" | "long" | "numeric";
  minWeekSpacing?: number;
  className?: string;
};

export type HeatmapCalendarProps = {
  title?: string;
  data: HeatmapDatum[];
  rangeDays?: number;
  endDate?: Date;
  weekStartsOn?: 0 | 1;
  cellSize?: number;
  cellGap?: number;
  onCellClick?: (cell: HeatmapCell) => void;
  levelClassNames?: string[];
  palette?: string[];
  legend?: boolean | LegendConfig;
  axisLabels?: boolean | AxisLabelsConfig;
  renderLegend?: (args: {
    levelCount: number;
    levelClassNames: string[];
    palette?: string[];
    cellSize: number;
    cellGap: number;
  }) => React.ReactNode;
  renderTooltip?: (cell: HeatmapCell) => React.ReactNode;
  className?: string;
  /** Ensures the chart area is at least this tall (Tailwind class), e.g. min-h-[17rem] */
  bodyMinClassName?: string;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** Local calendar day — must match grid dates (addDays / startOfDay use local time). */
function toLocalDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date, weekStartsOn: 0 | 1) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

function getLevel(value: number) {
  if (value <= 0) return 0;
  if (value <= 2) return 1;
  if (value <= 5) return 2;
  if (value <= 10) return 3;
  return 4;
}

function clampLevel(level: number, levelCount: number) {
  return Math.max(0, Math.min(levelCount - 1, level));
}

function bgStyleForLevel(level: number, palette?: string[]) {
  if (!palette?.length) return undefined;
  const idx = clampLevel(level, palette.length);
  return { backgroundColor: palette[idx] };
}

function formatMonth(d: Date, fmt: "short" | "long" | "numeric") {
  if (fmt === "numeric") {
    const yy = String(d.getFullYear()).slice(-2);
    return `${d.getMonth() + 1}/${yy}`;
  }
  return d.toLocaleDateString(undefined, { month: fmt });
}

function weekdayLabelForIndex(index: number, weekStartsOn: 0 | 1) {
  const actualDay = (weekStartsOn + index) % 7;
  const base = new Date(Date.UTC(2024, 0, 7 + actualDay));
  return base.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
}

export function HeatmapCalendar({
  title = "Activity",
  data,
  rangeDays = 365,
  endDate = new Date(),
  weekStartsOn = 1,
  cellSize = 12,
  cellGap = 3,
  onCellClick,
  levelClassNames,
  palette,
  legend = true,
  axisLabels = true,
  renderLegend,
  renderTooltip,
  className,
  bodyMinClassName,
}: HeatmapCalendarProps) {
  const levels = levelClassNames ?? [
    "bg-muted/40",
    "bg-primary/20",
    "bg-primary/35",
    "bg-primary/55",
    "bg-primary/75",
  ];

  const levelCount = palette?.length ? palette.length : levels.length;

  const legendCfg: LegendConfig =
    legend === true ? {} : legend === false ? { show: false } : legend;

  const axisCfg: AxisLabelsConfig =
    axisLabels === true ? {} : axisLabels === false ? { show: false } : axisLabels;

  const showAxis = axisCfg.show ?? true;
  const showWeekdays = axisCfg.showWeekdays ?? true;
  const showMonths = axisCfg.showMonths ?? true;
  const weekdayIndices = axisCfg.weekdayIndices ?? [1, 3, 5];
  const monthFormat = axisCfg.monthFormat ?? "short";

  const valueMap = React.useMemo(() => {
    const map = new Map<string, { value: number; meta?: unknown }>();
    for (const item of data) {
      const d = typeof item.date === "string" ? new Date(item.date) : item.date;
      const key = toLocalDateKey(startOfDay(d));
      const prev = map.get(key);
      const nextVal = (prev?.value ?? 0) + (item.value ?? 0);
      map.set(key, { value: nextVal, meta: item.meta ?? prev?.meta });
    }
    return map;
  }, [data]);

  const { columns, monthLabels } = React.useMemo(() => {
    const end = startOfDay(endDate);
    const start = addDays(end, -(rangeDays - 1));
    const firstWeek = startOfWeek(start, weekStartsOn);
    const totalDays =
      Math.ceil((end.getTime() - firstWeek.getTime()) / 86400000) + 1;
    const weeks = Math.ceil(totalDays / 7);

    const cells: HeatmapCell[] = [];
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const date = addDays(firstWeek, w * 7 + d);
        const inRange = date >= start && date <= end;
        const key = toLocalDateKey(date);
        const v = inRange ? (valueMap.get(key)?.value ?? 0) : 0;
        const meta = inRange ? valueMap.get(key)?.meta : undefined;
        const lvl = inRange ? getLevel(v) : 0;

        cells.push({
          date,
          key,
          value: v,
          level: clampLevel(lvl, levelCount),
          disabled: !inRange,
          meta,
          label: date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
        });
      }
    }

    const cols: HeatmapCell[][] = [];
    for (let i = 0; i < weeks; i++) {
      cols.push(cells.slice(i * 7, i * 7 + 7));
    }

    const labels: { colIndex: number; text: string }[] = [];
    if (showAxis && showMonths) {
      let prevMonth = -1;
      let prevYear = -1;
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i]!;
        const anchor = col.find((c) => !c.disabled)?.date ?? col[0]!.date;
        const y = anchor.getFullYear();
        const mo = anchor.getMonth();
        if (mo !== prevMonth || y !== prevYear) {
          labels.push({ colIndex: i, text: formatMonth(anchor, monthFormat) });
          prevMonth = mo;
          prevYear = y;
        }
      }
    }

    return { columns: cols, monthLabels: labels };
  }, [
    valueMap,
    endDate,
    rangeDays,
    weekStartsOn,
    levelCount,
    showAxis,
    showMonths,
    monthFormat,
  ]);

  const showLegend = legendCfg.show ?? true;
  const placement = legendCfg.placement ?? "right";
  const direction = legendCfg.direction ?? "row";
  const showText = legendCfg.showText ?? true;
  const showArrow = legendCfg.showArrow ?? true;
  const lessText = legendCfg.lessText ?? "Less";
  const moreText = legendCfg.moreText ?? "More";
  const swatchSize = legendCfg.swatchSize ?? cellSize;
  const swatchGap = legendCfg.swatchGap ?? cellGap;

  const LegendUI = renderLegend ? (
    renderLegend({
      levelCount,
      levelClassNames: levels,
      palette,
      cellSize,
      cellGap,
    })
  ) : !showLegend ? null : (
    <div className={cn("min-w-[8.75rem] shrink-0", legendCfg.className)}>
      {showText ? (
        <div className="mb-2 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
          {lessText}{" "}
          {showArrow ? <span aria-hidden>→</span> : null} {moreText}
        </div>
      ) : null}

      <div
        className={cn(
          "flex items-center",
          direction === "row" ? "flex-row" : "flex-col",
        )}
        style={{ gap: `${swatchGap}px` }}
      >
        {Array.from({ length: levelCount }).map((_, i) => {
          const cls = levels[clampLevel(i, levels.length)]!;
          return (
            <div
              key={i}
              className={cn("rounded-[3px]", !palette?.length && cls)}
              style={{
                width: swatchSize,
                height: swatchSize,
                ...(bgStyleForLevel(i, palette) ?? {}),
              }}
              aria-hidden
            />
          );
        })}
      </div>
    </div>
  );

  const tooltipNode = (cell: HeatmapCell) => {
    if (renderTooltip) return renderTooltip(cell);
    if (cell.disabled) return "Outside range";
    const unit = cell.value === 1 ? "fill" : "fills";
    return (
      <div className="text-xs">
        <div className="font-medium">
          {cell.value} desk {unit}
        </div>
        <div className="text-muted-foreground">{cell.label}</div>
      </div>
    );
  };

  const weekdayLabelWidth = showAxis && showWeekdays ? 44 : 0;

  return (
    <Card
      size="sm"
      className={cn(
        "rounded-sm border border-border-subtle bg-black/40 py-3 ring-0",
        bodyMinClassName,
        className,
      )}
    >
      <CardHeader className="border-border-subtle border-b px-3 pb-2">
        <CardTitle className="font-mono text-xs uppercase tracking-wider text-foreground">
          {title}
        </CardTitle>
      </CardHeader>

      <CardContent className="px-3 pt-3 pb-4">
        <div
          className={cn(
            "flex gap-4 pb-1",
            placement === "bottom" ? "flex-col" : "flex-row",
          )}
        >
          <div
            className={cn(
              "w-max max-w-full shrink-0 overflow-x-auto overflow-y-visible",
              axisCfg.className,
            )}
          >
            {showAxis && showMonths ? (
              <div
                className="flex items-end"
                style={{ paddingLeft: weekdayLabelWidth }}
              >
                <div
                  className="relative"
                  style={{
                    height: Math.max(20, cellSize + 4),
                    width: columns.length * (cellSize + cellGap) - cellGap,
                  }}
                >
                  {monthLabels.map((m) => (
                    <div
                      key={m.colIndex}
                      className="absolute font-mono text-[10px] text-muted-foreground"
                      style={{
                        left: m.colIndex * (cellSize + cellGap),
                        top: 0,
                      }}
                    >
                      {m.text}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex items-start">
              {showAxis && showWeekdays ? (
                <div
                  className="mr-2 flex shrink-0 flex-col"
                  style={{ gap: `${cellGap}px` }}
                  aria-hidden
                >
                  {Array.from({ length: 7 }).map((_, rowIdx) => (
                    <div
                      key={rowIdx}
                      className="flex items-center justify-end font-mono text-[9px] text-muted-foreground"
                      style={{ width: 40, height: cellSize }}
                    >
                      {weekdayIndices.includes(rowIdx)
                        ? weekdayLabelForIndex(rowIdx, weekStartsOn)
                        : ""}
                    </div>
                  ))}
                </div>
              ) : null}

              <div
                className="flex shrink-0"
                style={{ gap: `${cellGap}px` }}
                role="grid"
                aria-label="Activity heatmap"
              >
                {columns.map((col, i) => (
                  <div
                    key={i}
                    className="flex shrink-0 flex-col"
                    style={{ gap: `${cellGap}px`, width: cellSize }}
                    role="rowgroup"
                  >
                    {col.map((cell) => {
                      const cls = levels[clampLevel(cell.level, levels.length)]!;
                      return (
                        <div
                          key={`${cell.key}-w${i}`}
                          className="shrink-0"
                          style={{ width: cellSize, height: cellSize }}
                        >
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  disabled={cell.disabled}
                                  onClick={() =>
                                    !cell.disabled && onCellClick?.(cell)
                                  }
                                  className={cn(
                                    "size-full rounded-[3px] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                    !palette?.length && cls,
                                    cell.disabled &&
                                      "pointer-events-none cursor-default opacity-30",
                                  )}
                                  style={{
                                    ...(bgStyleForLevel(cell.level, palette) ??
                                      {}),
                                  }}
                                  aria-label={
                                    cell.disabled
                                      ? "Outside range"
                                      : `${cell.label}: ${cell.value}`
                                  }
                                  role="gridcell"
                                />
                              }
                            />
                            <TooltipContent side="top" className="max-w-xs">
                              {tooltipNode(cell)}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {LegendUI}
        </div>
      </CardContent>
    </Card>
  );
}
