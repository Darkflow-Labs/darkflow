import { NextResponse } from "next/server";
import { getTrades } from "@/lib/data/mockData";

export const GET = async () => {
  return NextResponse.json({ trades: getTrades(Date.now()) });
};
