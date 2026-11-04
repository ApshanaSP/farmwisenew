import { NextResponse } from "next/server";
import { assistantSession } from "@/lib/assistant/access";
import { liveIncidents } from "@/lib/rehearsal/traffic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Live traffic incidents over the district (TomTom, every ten minutes), or why there are none. Staff only. */
export async function GET() {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  return NextResponse.json(await liveIncidents(), { headers: { "Cache-Control": "no-store" } });
}
