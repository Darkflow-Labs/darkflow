import { NextResponse } from "next/server";
import { getExploreRows } from "@/lib/data/mockData";

export const GET = async () => {
  return NextResponse.json({ rows: getExploreRows(Date.now()) });
};
