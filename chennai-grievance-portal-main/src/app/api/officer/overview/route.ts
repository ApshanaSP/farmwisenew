import { NextRequest, NextResponse } from "next/server";
import { failed, fresh, officerSession, parseScope } from "@/lib/officer/guard";
import { officerOverview, officerPulse } from "@/lib/officer/data";
import { officerWork } from "@/lib/officer/insights";
import { refuseBadFilter } from "@/lib/collector/filters";

export const dynamic = "force-dynamic";

/**
 * Everything the officer console's page shows first, for the signed-in officer's department: the overview and the officer's work
 * lists (to approve, in action, reopened). The department is the session's (guard.ts), never the request's.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const ctx = await officerSession(p);
  if (ctx instanceof NextResponse) return ctx;
  const bad = refuseBadFilter(p);
  if (bad) return bad;
  try {
    // ?meta=1: the cheap check the console polls for new grievances, decisions and a new pipeline build
    if (p.get("meta")) return fresh(await officerPulse(ctx.dept));
    const scope = parseScope(p);
    const [ov, work] = await Promise.all([officerOverview(ctx.dept, scope), officerWork(ctx.dept, scope)]);
    return fresh({ ...ov, work });
  } catch (err) {
    return failed(err, "the dashboard");
  }
}
