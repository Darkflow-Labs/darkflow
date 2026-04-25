"use client";

import dynamic from "next/dynamic";
import type { ChartPoint, MockTrade } from "@/lib/data/mockData";

export type PriceChartDynamicProps = {
  symbol: string;
  data: ChartPoint[];
  trades?: MockTrade[];
  className?: string;
  compact?: boolean;
  showVolume?: boolean;
  /** Omit in-chart symbol header for flush dock embedding */
  flush?: boolean;
};

const PriceChartLazy = dynamic(
  () =>
    import("@/components/chart/PriceChart").then((m) => ({
      default: m.PriceChart,
    })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

export const PriceChartDynamic = (props: PriceChartDynamicProps) => {
  return <PriceChartLazy {...props} />;
};

const ChartSkeleton = () => (
  <div
    className="h-full min-h-[220px] w-full animate-pulse rounded-sm bg-white/[0.03]"
    aria-hidden
  />
);
