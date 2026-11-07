import { NextRequest, NextResponse } from "next/server";
import { failed } from "@/lib/collector/guard";
import { csvCell } from "@/lib/csv";
import { assistantSession } from "@/lib/assistant/access";
import { audit } from "@/lib/collector/sources";
import { EXPORT_COLS, exportRows, parseDept, parsePeriod, parseZone } from "@/lib/collector/intel";
import { LIMITS, admitExport } from "@/lib/assistant/limits";
import { requireConfirm } from "@/lib/security/stepup";

export const dynamic = "force-dynamic";

/**
 * CSV offered by an answer: the console's own export rows (incident-level, no personal
 * data), capped at 1,000 rows and 10 downloads a day per Collector, and audited.
 */
export async function GET(req: NextRequest) {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  const q = req.nextUrl.searchParams;
  // the console's own export of the same rows asks for the confirm step first; so does this one (the card fetches it, so the confirm box can answer the 428)
  const c = await requireConfirm(req, s, "export", "Download the assistant's incident list as a spreadsheet", Object.fromEntries([...q.entries()].sort()));
  if (!c.ok) return c.res;
  if (!admitExport(String(s.userId))) return NextResponse.json({ error: `Only ${LIMITS.exportsPerDay} exports a day from the assistant.` }, { status: 429 });
  const p = req.nextUrl.searchParams;
  const period = parsePeriod(p.get("period")), zone = parseZone(p.get("zone")), dept = s.lockDept ?? parseDept(p.get("dept"));
  try {
    const all = await exportRows(period, zone, dept);
    const rows = all.slice(0, LIMITS.exportRows);
    // the columns exportRows() returns, as the console's own export writes them (four of the old names did not exist: BUG-029)
    const cols = EXPORT_COLS;
    const cell = (v: unknown) => csvCell(v);
    const csv = "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell((r as Record<string, unknown>)[c])).join(","))].join("\n");
    await audit(s.email, "assistant:export", "incidents", null, null, { period, zone, dept, rows: rows.length, of: all.length });
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="district-iq-${period}${zone ? `-zone${zone}` : ""}${dept ? `-${dept.toLowerCase()}` : ""}.csv"` } });
  } catch (err) {
    return failed(err, "the export");
  }
}
