import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { collectorSearch } from "@/lib/search/history";

export const dynamic = "force-dynamic";

/**
 * The console's search box: zones, departments, incidents, news, connected sources, Data Studio datasets and complaint numbers; and, for any
 * day the record holds, air quality, market prices, reservoir levels, rain and river gauges (lib/search/history.ts). A date in the search
 * ("52 days ago", "3 October", "last week") limits every kind to those dates.
 */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const text = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 80);
  if (text.length < 2) return NextResponse.json({ zones: [], depts: [], incidents: [], incidentsTotal: 0, news: [], newsTotal: 0, values: [], notes: [], sources: [], datasets: [], complaints: [], when: null, unread: false, topic: "" });
  try {
    return NextResponse.json(await collectorSearch(text), { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return failed(err, "search");
  }
}
