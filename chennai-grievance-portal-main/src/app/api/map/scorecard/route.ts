import { NextRequest, NextResponse } from "next/server";
import { assistantSession } from "@/lib/assistant/access";
import { checkRateLimit } from "@/lib/rate-limit";
import { placeLookup } from "@/lib/map/ask";
import { scorecard, scorecardHtml } from "@/lib/map/v2";
import { world } from "@/lib/map/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Ask the Map v2: a ward's scorecard (lib/map/v2.ts). ?ward=1..200; &format=html gives the printable page, else JSON. A department officer's
 * scorecard counts only their department's cases (the department comes from the database).
 */
export async function GET(req: NextRequest) {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  const gate = checkRateLimit(`mapcard:${s.userId}`, 30, 300);
  if (!gate.allowed) return NextResponse.json({ error: `Too many scorecards in a few minutes. Try again in ${gate.retryAfterSeconds} s.` }, { status: 429 });
  const ward = Number(req.nextUrl.searchParams.get("ward"));
  if (!Number.isInteger(ward) || ward < 1 || ward > 200) return NextResponse.json({ error: "Choose a ward from 1 to 200." }, { status: 400 });
  try {
    const { world: w, resolver } = await world();
    const lock = s.role === "department_officer" ? s.lockDept : null;
    const sc = scorecard(ward, w, { place: placeLookup(w, resolver, lock), lang: "en", lockDept: lock }, lock);
    if (!sc) return NextResponse.json({ error: `There is no Ward ${ward} on the map.` }, { status: 404 });
    if (req.nextUrl.searchParams.get("format") === "html") return new NextResponse(scorecardHtml(w, sc, w.dataAsOf), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    const { brief: _b, ...rest } = sc;
    return NextResponse.json({ scorecard: rest });
  } catch (e) {
    console.error("[map] scorecard failed", e);
    return NextResponse.json({ error: "The scorecard could not be made just now." }, { status: 500 });
  }
}
