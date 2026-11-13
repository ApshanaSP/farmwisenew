import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { list, parseCat, parseDept, parsePeriod, parseTaluk, parseZone, readPlace, readScope, readSev, readStatus } from "@/lib/collector/intel";
import { refuseBadFilter } from "@/lib/collector/filters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const p = req.nextUrl.searchParams;
  const bad = refuseBadFilter(p);
  if (bad) return bad;
  const sort = p.get("sort");
  try {
    return NextResponse.json(
      await list({
        period: parsePeriod(p.get("period")),
        zone: parseZone(p.get("zone")),
        dept: parseDept(p.get("dept")),
        // the shared readers: the value refuseBadFilter checked is the value answered for (hunt2-ops-04)
        sev: readSev(p.get("sev")),
        cat: parseCat(p.get("cat")),
        taluk: parseTaluk(p.get("taluk")),
        place: readPlace(p.get("place")),
        status: readStatus(p.get("status")),
        q: (p.get("q") || "").trim().slice(0, 80) || null,
        sort: sort === "sev" || sort === "c" || sort === "r" || sort === "d" ? sort : "t",
        dir: p.get("dir") === "1" ? 1 : -1,
        page: Math.max(0, Math.min(10_000, Number(p.get("page")) || 0)),
        scope: readScope(p.get("scope")) ?? "period"
      })
    );
  } catch (err) {
    return failed(err, "the list");
  }
}
