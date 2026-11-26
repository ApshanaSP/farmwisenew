import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { parseCat, parseDept, parsePeriod, parseTaluk, parseZone } from "@/lib/collector/intel";
import { deptSummary } from "@/lib/collector/deptsummary";
import { refuseBadFilter } from "@/lib/collector/filters";

export const dynamic = "force-dynamic";

/** One department's summary for the console's period, zone, taluk and category (deptsummary.ts). The Collector's session only. */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const p = req.nextUrl.searchParams;
  const bad = refuseBadFilter(p);
  if (bad) return bad;
  const code = parseDept(p.get("code"));
  if (!code) return NextResponse.json({ error: "Unknown department." }, { status: 400 });
  try {
    const r = await deptSummary(code, parsePeriod(p.get("period")), { zone: parseZone(p.get("zone")), taluk: parseTaluk(p.get("taluk")), cat: parseCat(p.get("cat")) });
    return r ? NextResponse.json(r) : NextResponse.json({ error: "Unknown department." }, { status: 404 });
  } catch (err) {
    return failed(err, "the department's summary");
  }
}
