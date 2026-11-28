import { NextRequest, NextResponse } from "next/server";
import { failed, fresh, officerSession, parseScope } from "@/lib/officer/guard";
import { deptBriefing, deptInsights, officerAlerts } from "@/lib/officer/insights";
import { refuseBadFilter } from "@/lib/collector/filters";

export const dynamic = "force-dynamic";

/**
 * For the signed-in officer's department (the session's, never the request's):
 *   (default)        insights from the district intelligence store (police, hospital, PWD, weather, air, markets ...)
 *   ?part=briefing   today's briefing: the Collector's "Today at a glance" figures with the department as the filter
 *   ?part=alerts     the district's alerts lane (IMD, NDMA SACHET, the news) for the alert chip
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const ctx = await officerSession(p);
  if (ctx instanceof NextResponse) return ctx;
  const bad = refuseBadFilter(p);
  if (bad) return bad;
  const part = p.get("part");
  try {
    if (part === "alerts") return fresh(await officerAlerts());
    if (part === "briefing") return fresh({ briefing: await deptBriefing(ctx.dept.code, parseScope(p)) });
    return fresh({ modules: await deptInsights(ctx.dept.code, parseScope(p)) });
  } catch (err) {
    return failed(err, part === "alerts" ? "the alerts" : part === "briefing" ? "today's briefing" : "department insights");
  }
}
