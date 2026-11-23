/**
 * Ask the Map's warm-up: writes the planner's long fixed prompt into Claude's prompt cache before the first question needs it
 * (lib/map/ai.ts warmMapPlanner: at most once in four minutes for the whole server, none while questions keep it warm, off
 * unless MAP_PLAN_WARM=1). The panel's suggestions (GET /api/map/suggest) start the same warm-up when it opens; this route is
 * for a caller that wants the result. Never an error to the console: the answer says what happened.
 */
import { NextResponse } from "next/server";
import { assistantSession } from "@/lib/assistant/access";
import { checkRateLimit } from "@/lib/rate-limit";
import { warmPlanner } from "@/lib/map/ask";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  if (!checkRateLimit(`map-warm:${s.userId}`, 6, 60).allowed) return NextResponse.json({ warmed: false, why: "rate-limited" }, { status: 429 });
  return NextResponse.json(await warmPlanner());
}
