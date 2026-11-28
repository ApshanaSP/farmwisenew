import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { jsonWithEtag } from "@/lib/etag";
import { parseCat, parseDept, parsePeriod, parseTaluk, parseZone } from "@/lib/collector/intel";
import { insights, parsePart, withAiAccounts } from "@/lib/collector/insights";
import { refuseBadFilter } from "@/lib/collector/filters";

export const dynamic = "force-dynamic";

/** Briefing, department follow-ups, news-only incidents, trends, taluks, patterns and markets for the scope. */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const p = req.nextUrl.searchParams;
  const bad = refuseBadFilter(p);
  if (bad) return bad;
  try {
    // the Briefing's decision cards in the AI's words where the pipeline wrote none (insights.ts withAiAccounts)
    return jsonWithEtag(req, await withAiAccounts(await insights(parsePeriod(p.get("period")), parseZone(p.get("zone")), parseDept(p.get("dept")),
      { cat: parseCat(p.get("cat")), taluk: parseTaluk(p.get("taluk")) }, parsePart(p.get("part")))), { "Cache-Control": "private, no-cache" });
  } catch (err) {
    return failed(err, "the briefing");
  }
}
