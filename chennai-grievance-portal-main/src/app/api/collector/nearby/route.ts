import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { asOf } from "@/lib/collector/intel";
import { nearby, nearbyDetail } from "@/lib/collector/nearby";

export const dynamic = "force-dynamic";

/**
 * News from the districts next to Chennai that could reach the city or needs a precaution here (nearby.ts). Collector only.
 * GET: the events by district. GET ?event=ID: what happened in one event, from every outlet's report of it.
 */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    const id = req.nextUrl.searchParams.get("event");
    if (id != null) {
      if (id.length > 200) return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
      return NextResponse.json({ detail: await nearbyDetail(id, await asOf(), s.email) });
    }
    return NextResponse.json(await nearby(await asOf(), s.email));
  } catch (err) {
    return failed(err, "the nearby districts' news");
  }
}
