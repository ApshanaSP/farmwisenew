import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { parseCat, parseDept, parsePeriod, parseTaluk, parseZone } from "@/lib/collector/intel";
import { pattern } from "@/lib/collector/insights";
import { dayBrief, deptBrief, patternBrief, trendBrief } from "@/lib/collector/aibrief";

export const dynamic = "force-dynamic";

/**
 * A write-up already made comes back at once; one still being written is left to finish in the background (aiJson shares
 * the run and remembers the result) and the page gets `pending`, shows the rules' text and asks again. New data used to
 * hold the Briefing for 11 s.
 */
const WAIT_MS = 2500;
async function soon<T>(p: Promise<T>): Promise<{ brief: T | null; pending?: true }> {
  const late = Symbol("late");
  const r = await Promise.race([p, new Promise<typeof late>((ok) => setTimeout(() => ok(late), WAIT_MS))]);
  if (r !== late) return { brief: r as T };
  p.catch(() => undefined);
  return { brief: null, pending: true };
}

/**
 * AI write-ups (aibrief.ts), each null when no model answered: `kind=day` the key points of the period and scope,
 * `kind=dept&code=` one department's brief, `kind=trends` what is behind the rising problems, `kind=pattern` one spike,
 * hotspot or category trend (the same parameters as /api/collector/pattern).
 */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const p = req.nextUrl.searchParams;
  const scope = { period: parsePeriod(p.get("period")), zone: parseZone(p.get("zone")), dept: parseDept(p.get("dept")), taluk: parseTaluk(p.get("taluk")) };
  try {
    switch (p.get("kind")) {
      case "day": return NextResponse.json(await soon(dayBrief(scope, s.email)));
      case "dept": {
        const code = parseDept(p.get("code"));
        if (!code) return NextResponse.json({ error: "Unknown department." }, { status: 400 });
        return NextResponse.json(await soon(deptBrief(scope, code, s.email)));
      }
      case "trends": return NextResponse.json(await soon(trendBrief(s.email)));
      case "pattern": {
        const cat = parseCat(p.get("cat")), date = p.get("date") ?? "", id = p.get("id") ?? "", what = p.get("what");
        const d = what === "spike" && cat && /^\d{4}-\d{2}-\d{2}$/.test(date) ? await pattern({ kind: "spike", cat, zone: parseZone(p.get("zone")), date })
          : what === "hotspot" && /^[A-Z0-9_-]{3,64}$/.test(id) ? await pattern({ kind: "hotspot", id })
            : what === "category" && cat ? await pattern({ kind: "category", cat }) : undefined;
        if (d === undefined) return NextResponse.json({ error: "Unknown pattern." }, { status: 400 });
        return NextResponse.json(d ? await soon(patternBrief(d, s.email)) : { brief: null });
      }
      default: return NextResponse.json({ error: "Unknown kind." }, { status: 400 });
    }
  } catch (err) {
    return failed(err, "the AI brief");
  }
}
