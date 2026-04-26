import { NextResponse } from "next/server";
import { getChartData } from "@/lib/data/mockData";

export const GET = async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("symbol")?.trim() ?? "";
  const symbol = raw.toUpperCase();
  if (!symbol || symbol.length > 32) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }
  return NextResponse.json({
    symbol,
    points: getChartData(symbol, Date.now()),
  });
};
