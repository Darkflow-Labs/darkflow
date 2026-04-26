import { NextResponse } from "next/server";
import { getPortfolioSnapshot } from "@/lib/data/portfolioMock";

export const GET = async () => {
  return NextResponse.json({ snapshot: getPortfolioSnapshot(Date.now()) });
};
