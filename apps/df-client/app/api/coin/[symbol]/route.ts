import { NextResponse } from "next/server";
import { getCoinInsights } from "@/lib/data/coinInsightsMock";

type RouteParams = { params: Promise<{ symbol: string }> };

export const GET = async (req: Request, { params }: RouteParams) => {
  const { symbol: raw } = await params;
  const symbol = raw?.trim().toUpperCase() ?? "";
  if (!symbol || symbol.length > 32) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const label = searchParams.get("label")?.trim() || null;
  const insights = getCoinInsights(symbol, label, Date.now());
  return NextResponse.json(insights);
};
