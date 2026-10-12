import { NextRequest, NextResponse } from "next/server";
import { routeNewsComplaints } from "@/lib/collector/intel";
import { jobKeyOk } from "@/lib/jobauth";

export const dynamic = "force-dynamic";

/**
 * Routes news reports that are civic complaints to the department's officer (and withdraws automatic assignments
 * that no longer qualify), auditing each change as "District IQ news monitor". A scheduled job, not a page: the
 * caller sends REFRESH_API_KEY in `x-job-key`, e.g. every 15 minutes:
 *   curl -X POST -H "x-job-key: $REFRESH_API_KEY" https://<portal>/api/collector/jobs/route-news
 */
export async function POST(req: NextRequest) {
  if (!jobKeyOk(req.headers.get("x-job-key"))) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  try {
    const r = await routeNewsComplaints();
    return NextResponse.json({ ok: true, candidates: r.candidates, added: r.added.length, withdrawn: r.withdrawn.length });
  } catch (err) {
    // the ops tables come from scripts/seed-official-contacts.js; without them there is nothing to route
    console.warn("news routing failed:", (err as Error).message);
    return NextResponse.json({ error: "News routing failed; see the server log." }, { status: 500 });
  }
}
