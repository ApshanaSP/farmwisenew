import { NextResponse } from "next/server";
import { assistantSession } from "@/lib/assistant/access";
import { trafficNow } from "@/lib/city/traffic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Live traffic for the Traffic view (lib/city/traffic.ts): TomTom's jams, closures and flooded roads now, each placed in
 * its ward and zone with the body that answers for it, and the trouble spots that keep coming back. Staff only; an
 * officer sees only their own department's records in the trouble spots.
 */
export async function GET() {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  try {
    const t = await trafficNow({ lockDept: s.role === "department_officer" ? s.lockDept ?? null : null });
    return NextResponse.json(t, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[traffic] live traffic failed", e);
    return NextResponse.json({ error: "Live traffic could not be read just now." }, { status: 503 });
  }
}
