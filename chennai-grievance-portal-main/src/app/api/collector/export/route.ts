import { NextRequest, NextResponse } from "next/server";
import { requireConfirm } from "@/lib/security/stepup";
import { collectorSession, failed } from "@/lib/collector/guard";
import { csvCell } from "@/lib/csv";
import { EXPORT_COLS, exportRows, parseCat, parseDept, parsePeriod, parseTaluk, parseZone } from "@/lib/collector/intel";
import { refuseBadFilter } from "@/lib/collector/filters";

export const dynamic = "force-dynamic";

// the Collector's action list: incidents that need them, then closed work to check (see exportRows)
const COLS = EXPORT_COLS;

export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const p = req.nextUrl.searchParams;
  const bad = refuseBadFilter(p);
  if (bad) return bad;
  const c = await requireConfirm(req, s, "export", "Download the action list as a spreadsheet", Object.fromEntries([...p.entries()].sort()));
  if (!c.ok) return c.res;
  try {
    const rows = await exportRows(parsePeriod(p.get("period")), parseZone(p.get("zone")), parseDept(p.get("dept")),
      { cat: parseCat(p.get("cat")), taluk: parseTaluk(p.get("taluk")) });
    const cell = (v: unknown) => csvCell(v, true);
    const csv = [COLS.join(","), ...rows.map((r: Record<string, unknown>) => COLS.map((c) => cell(r[c])).join(","))].join("\n");
    return NextResponse.json({ csv, count: rows.length });
  } catch (err) {
    return failed(err, "the export");
  }
}
