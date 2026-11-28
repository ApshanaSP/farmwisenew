import { NextRequest, NextResponse } from "next/server";
import { failed, fresh, officerSession } from "@/lib/officer/guard";
import { grievanceList, search } from "@/lib/officer/data";
import { MODULES } from "@/lib/officer/insights";
import { officerSearch } from "@/lib/search/history";

export const dynamic = "force-dynamic";

/**
 * Search the department's grievances by title, street, area, type or id (the last 90 days, or the dates the search names: "52 days ago",
 * "3 October", "last week"); the news filed into the department's own cases, of any date; and, for any day held, the readings its console
 * uses (lib/officer/insights.ts MODULES: air quality, market prices, reservoirs, rain, river gauges). Nothing of another department.
 */
export async function GET(req: NextRequest) {
  const ctx = await officerSession(req.nextUrl.searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const text = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (text.length < 2) return fresh({ rows: [], news: [], newsTotal: 0, values: [], notes: [], when: null, unread: false, topic: "" });
  const dept = ctx.dept;
  try {
    return fresh(await officerSearch(dept, MODULES[dept.code] ?? [], text, {
      recent: (t) => search(dept, t),
      inRange: async (t, from, to) => (await grievanceList(dept, { tab: "all", period: "quarterly", zone: null, taluk: null, page: 0, per: 8, cat: null, q: t, range: { from, to } })).rows
    }));
  } catch (err) {
    return failed(err, "search results");
  }
}
