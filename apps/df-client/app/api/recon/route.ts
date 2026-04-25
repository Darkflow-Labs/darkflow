import { NextResponse } from "next/server";
import { getReconLanes } from "@/lib/data/reconMock";

export const GET = async () => {
  return NextResponse.json({ lanes: getReconLanes(Date.now()) });
};
