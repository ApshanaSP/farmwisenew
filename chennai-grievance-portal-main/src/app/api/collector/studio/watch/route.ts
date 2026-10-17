import { NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { watchList } from "@/lib/studio/store";

export const dynamic = "force-dynamic";

/** The Collector's datasets with their most pressing findings, for the Briefing page ("From your datasets"). */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json({ datasets: watchList() });
  } catch (err) {
    return failed(err, "your datasets");
  }
}
