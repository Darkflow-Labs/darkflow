"use client";

import { cn } from "@/lib/utils";

type MiniSparklineProps = {
  series: number[];
  className?: string;
};

export const MiniSparkline = ({ series, className }: MiniSparklineProps) => {
  if (series.length < 2) {
    return (
      <div
        className={cn("h-7 w-16 rounded-sm bg-white/[0.04]", className)}
        aria-hidden
      />
    );
  }

  const w = 64;
  const h = 28;
  const pad = 2;
  const step = (w - pad * 2) / (series.length - 1);
  const pts = series.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (1 - v) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-7 w-16 shrink-0 text-primary", className)}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts.join(" ")}
        opacity={0.85}
      />
    </svg>
  );
};
