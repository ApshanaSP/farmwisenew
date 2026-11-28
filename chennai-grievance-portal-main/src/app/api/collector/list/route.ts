import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { list, parseCat, parseDept, parsePeriod, parseTaluk, parseZone, readPlace, readScope, readSev, readStatus } from "@/lib/collector/intel";
import { refuseBadFilter } from "@/lib/collector/filters";
import { resolutionsFor, resolvedList } from "@/lib/cases/resolution";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const p = req.nextUrl.searchParams;
  const bad = refuseBadFilter(p);
  if (bad) return bad;
  const sort = p.get("sort");
  const f = {
    period: parsePeriod(p.get("period")),
    zone: parseZone(p.get("zone")),
    dept: parseDept(p.get("dept")),
    // the shared readers: the value refuseBadFilter checked is the value answered for (hunt2-ops-04)
    sev: readSev(p.get("sev")),
    cat: parseCat(p.get("cat")),
    taluk: parseTaluk(p.get("taluk")),
    place: readPlace(p.get("place")),
    // the Open complaints tile's list: only incidents a citizen complained about
    complaints: p.get("complaints") === "1",
    status: readStatus(p.get("status")),
    q: (p.get("q") || "").trim().slice(0, 80) || null,
    sort: (sort === "sev" || sort === "c" || sort === "r" || sort === "d" ? sort : "t") as "t" | "sev" | "c" | "r" | "d",
    dir: (p.get("dir") === "1" ? 1 : -1) as 1 | -1,
    page: Math.max(0, Math.min(10_000, Number(p.get("page")) || 0)),
    scope: readScope(p.get("scope")) ?? "period"
  };
  try {
    // 28 Nov: the Resolved tile's list (closed in the period) shows how each case was resolved: the completion report's photo and remark,
    // who approved the close and when, the ones with a report first (lib/cases/resolution.ts). Any other scope keeps the list's own rows,
    // each with its resolution added.
    if (f.status === "Resolved" && f.scope === "period") return NextResponse.json(await resolvedList(f));
    const out = await list(f);
    if (f.status === "Resolved") {
      const rows = out.rows as Record<string, unknown>[];
      const res = await resolutionsFor(rows.map((r) => String(r.id)), { forCollector: true });
      return NextResponse.json({ ...out, rows: rows.map((r) => ({ ...r, resolution: res[String(r.id)] ?? null })), resolvedList: true });
    }
    return NextResponse.json(out);
  } catch (err) {
    return failed(err, "the list");
  }
}
