import { NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { referenceWorld } from "@/lib/thunai/world";
import { markActive } from "@/lib/thunai/keepwarm";

export const dynamic = "force-dynamic";

/** Thunai's vocabulary from the district reference: categories, taluks (with Tamil names) and places. */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    // v12 (21 Nov): Jarvis has just opened. Nothing is worked out here any more: the insights for four periods and the 11-part snapshot
    // started here held the server's thread 40-49 s while the Collector was speaking (the report, first-question-latency RC1). The
    // keep-warm (lib/thunai/keepwarm.ts) does that work on its own schedule, one step at a time, while the console is in use: this says it is.
    markActive("jarvis");
    return NextResponse.json(referenceWorld());
  } catch (err) {
    return failed(err, "Thunai's vocabulary");
  }
}
