import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { PERIODS, asOf, parseCat, parseDept, parsePeriod, parseTaluk, parseZone, periodSince } from "@/lib/collector/intel";
import { stories } from "@/lib/collector/storyai";

export const dynamic = "force-dynamic";

/** Developing stories of the period and scope: duplicates joined, routine repeats dropped, what changed in order (storyai.ts). */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const p = req.nextUrl.searchParams;
  try {
    const period = parsePeriod(p.get("period"));
    const now = await asOf();
    return NextResponse.json(await stories({ hours: PERIODS[period].hours, zone: parseZone(p.get("zone")), dept: parseDept(p.get("dept")),
      cat: parseCat(p.get("cat")), taluk: parseTaluk(p.get("taluk")), since: periodSince(period, now) }, now, s.email));
  } catch (err) {
    return failed(err, "the developing stories");
  }
}
