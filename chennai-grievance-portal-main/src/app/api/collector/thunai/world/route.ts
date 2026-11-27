import { NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { referenceWorld, serverWorld } from "@/lib/thunai/world";
import { markActive } from "@/lib/thunai/keepwarm";
import { brainOn, warmBrain } from "@/lib/brain";
import { inBackground } from "@/lib/util/background";

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
    // 26 Nov: whether the brain (lib/brain) answers first; the browser then sends every sentence to it instead of its own word lanes.
    // 27 Nov: its warm-up as background work (its store reads queue behind the requests' own); the `cases` table it reads is made by the
    // keep-warm after each build, and when it must be made here it is made in slices with the thread let go (brain/sql.ts refreshCases)
    if (brainOn()) void inBackground(() => serverWorld().then((w) => warmBrain(w))).catch(() => undefined);
    return NextResponse.json({ ...referenceWorld(), brain: brainOn() });
  } catch (err) {
    return failed(err, "Thunai's vocabulary");
  }
}
