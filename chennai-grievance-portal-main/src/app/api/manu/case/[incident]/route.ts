import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import intelPool from "@/lib/collector/db";
import { getActivePortalSession } from "@/lib/auth";
import { isComplaintMediaPath, isPhotoPath } from "@/lib/complaint-media-path";
import { maskAadhaar } from "@/lib/manu/clean";
import { seesEveryPetition } from "@/lib/manu/guard";
import { officerDeptCode } from "@/lib/officer/guard";

export const dynamic = "force-dynamic";

/**
 * What the people who reported a case wrote or sent, for the case screens (the officer's drawer and the Collector's detail): the paper
 * petitions behind it, and the photo or video a citizen attached to an online complaint in it. The attachment never reached the officer
 * or the Collector: the case is built from the incident store, which never received it (QA pass 6, officer-day-09), so it is read here from
 * the complaint itself. Nothing when the case has neither.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ incident: string }> }) {
  const params = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(params.incident)) return NextResponse.json({ items: [], media: [] });
  const staff = await seesEveryPetition();
  const collector = (await getActivePortalSession("collector"))?.role === "collector";
  let dept: string | null = null, deptId: number | null = null;
  if (!staff) {
    const o = await getActivePortalSession("officer");
    if (o?.role !== "department_officer") return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    dept = await officerDeptCode(o.userId);
    const [u] = await pool.query<RowDataPacket[]>(`SELECT department_id FROM users WHERE id = ? LIMIT 1`, [o.userId]).catch(() => [[] as RowDataPacket[]]);
    deptId = u[0]?.department_id != null ? Number(u[0].department_id) : null;
  }
  let rows: RowDataPacket[] = [];
  try {
    [rows] = await pool.query<RowDataPacket[]>(
      `SELECT complaint_code, subject, pages, dept_code, DATE_FORMAT(filed_at, '%Y-%m-%d %H:%i:%s') AS filed_at FROM petitions WHERE incident_id = ? AND status = 'filed' ORDER BY filed_at`, [params.incident]);
  } catch { /* an older store with no petitions table */ }
  const items = rows.filter((r) => staff || r.dept_code === dept).map((r) => ({
    code: String(r.complaint_code), subject: String(r.subject ?? ""), filedAt: String(r.filed_at), pages: (JSON.parse(String(r.pages ?? "[]")) as string[]).map((n) => `/api/manu/photos/${n}`)
  }));
  return NextResponse.json({ items, media: await complaintMedia(params.incident, collector, deptId) }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * The attachments of the online complaints in a case, as GET /api/complaints/media/<name> lets this viewer open them: the Collector sees
 * every one, a department officer those of complaints filed to the officer's own department. The petition desk sees none (the media route
 * refuses it too).
 */
async function complaintMedia(incident: string, collector: boolean, deptId: number | null) {
  if (!collector && deptId == null) return [];
  try {
    const [members] = await intelPool.query<RowDataPacket[]>(
      `SELECT DISTINCT source_record_id AS code FROM incident_members WHERE incident_id = ? AND source = 'grievance' AND source_record_id IS NOT NULL LIMIT 200`, [incident]);
    const codes = members.map((m) => String(m.code));
    if (!codes.length) return [];
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT complaint_code, title, media_path, department_id, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at FROM complaints
        WHERE complaint_code IN (?) AND media_path IS NOT NULL AND media_path <> '' ORDER BY created_at`, [codes]);
    return rows
      .filter((r) => isComplaintMediaPath(String(r.media_path)) && (collector || (r.department_id != null && Number(r.department_id) === deptId)))
      .map((r) => ({ code: String(r.complaint_code), title: maskAadhaar(String(r.title ?? "")), filedAt: String(r.created_at ?? ""), url: String(r.media_path), kind: isPhotoPath(String(r.media_path)) ? "photo" as const : "video" as const }));
  } catch (e) {
    console.warn(`[manu] attachments for ${incident} not read: ${(e as Error).message}`);
    return [];
  }
}
