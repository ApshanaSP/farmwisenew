import { NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { referenceWorld } from "@/lib/thunai/world";
import { warmInsights } from "@/lib/assistant/tools";

export const dynamic = "force-dynamic";

/** Thunai's vocabulary from the district reference: categories, taluks (with Tamil names) and places. */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    // Jarvis has just opened: the district's overviews are worked out now, while the Collector is still speaking
    void warmInsights();
    return NextResponse.json(referenceWorld());
  } catch (err) {
    return failed(err, "Thunai's vocabulary");
  }
}
