import { NextRequest, NextResponse } from "next/server";
import { assistantSession } from "@/lib/assistant/access";
import { imageryDates, RELEASES } from "@/lib/map/imagery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET ?lat&lon&years=2016,2026: when each year's satellite photo at that point was taken (Esri Wayback metadata). */
export async function GET(req: NextRequest) {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  const q = req.nextUrl.searchParams;
  const lat = Number(q.get("lat")), lon = Number(q.get("lon"));
  // the district and its edges only: this is not a general lookup service
  if (!(lat >= 12.5 && lat <= 13.6 && lon >= 79.9 && lon <= 80.6)) return NextResponse.json({ error: "A point in Chennai district." }, { status: 400 });
  const known = new Set(RELEASES.map((r) => r.year));
  const years = [...new Set((q.get("years") ?? "").split(",").map(Number).filter((y) => known.has(y)))].slice(0, 4);
  if (!years.length) return NextResponse.json({ error: "Which years?" }, { status: 400 });
  return NextResponse.json({ shots: await imageryDates(lat, lon, years) }, { headers: { "cache-control": "private, max-age=3600" } });
}
