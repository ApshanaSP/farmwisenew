import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { facilityReach, RehearsalUnavailable } from "@/lib/rehearsal/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** One hospital's or fire station's reach in T minutes: the roads it keeps and the roads it loses in the rehearsal. */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const p = req.nextUrl.searchParams;
  const id = p.get("id") ?? "";
  const replay = p.get("replay");
  if (!/^[A-Za-z0-9:_.-]{2,80}$/.test(id) || (replay && !/^rain-\d{4}-\d{2}-\d{2}$/.test(replay))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const r = await facilityReach(id, { replay, tHelp: Number(p.get("t")) || undefined });
    if (!r) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json(r, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) {
    if (e instanceof RehearsalUnavailable) return NextResponse.json({ error: e.message }, { status: 503 });
    return failed(e, "the reach of help");
  }
}
