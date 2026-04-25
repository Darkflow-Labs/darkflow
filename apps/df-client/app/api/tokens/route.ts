import { NextResponse } from "next/server";
import { getTokens } from "@/lib/data/mockData";

export const GET = async () => {
  return NextResponse.json({ tokens: getTokens(Date.now()) });
};
