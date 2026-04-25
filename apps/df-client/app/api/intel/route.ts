import { NextResponse } from "next/server";
import { getIntelEvents } from "@/lib/data/mockData";

export const GET = async () => {
  return NextResponse.json({ events: getIntelEvents(Date.now()) });
};
