import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { getActivePortalSession } from "@/lib/auth";
import { seesEveryPetition } from "@/lib/manu/guard";
import { officerDeptCode } from "@/lib/officer/guard";

export const dynamic = "force-dynamic";

/** The paper petitions behind a case, for the case screens: nothing when the case came from somewhere else. */
export async function GET(_req: NextRequest, { params }: { params: { incident: string } }) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(params.incident)) return NextResponse.json({ items: [] });
  const staff = await seesEveryPetition();
  let dept: string | null = null;
  if (!staff) {
    const o = await getActivePortalSession("officer");
    if (o?.role !== "department_officer") return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    dept = await officerDeptCode(o.userId);
  }
  let rows: RowDataPacket[] = [];
  try {
    [rows] = await pool.query<RowDataPacket[]>(
      `SELECT complaint_code, subject, pages, dept_code, DATE_FORMAT(filed_at, '%Y-%m-%d %H:%i:%s') AS filed_at FROM petitions WHERE incident_id = ? AND status = 'filed' ORDER BY filed_at`, [params.incident]);
  } catch { return NextResponse.json({ items: [] }); }
  const items = rows.filter((r) => staff || r.dept_code === dept).map((r) => ({
    code: String(r.complaint_code), subject: String(r.subject ?? ""), filedAt: String(r.filed_at), pages: (JSON.parse(String(r.pages ?? "[]")) as string[]).map((n) => `/api/manu/photos/${n}`)
  }));
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
