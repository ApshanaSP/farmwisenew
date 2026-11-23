import { NextResponse } from "next/server";
import { assistantSession } from "@/lib/assistant/access";
import { warmPlanner } from "@/lib/map/ask";
import { suggestions } from "@/lib/map/suggest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The Ask box's suggested questions: made from the live data, each with a non-empty answer. The panel asks for them when it opens,
 * so the planner's prompt cache is warmed here too, without waiting for it (lib/map/ai.ts warmMapPlanner; off unless MAP_PLAN_WARM=1).
 */
export async function GET() {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  void warmPlanner();
  try {
    return NextResponse.json({ items: await suggestions() });
  } catch (e) {
    console.error("[map] suggestions failed", e);
    return NextResponse.json({ items: [] });
  }
}
