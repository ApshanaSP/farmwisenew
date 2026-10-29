import { NextRequest, NextResponse } from "next/server";
import intelPool, { ops } from "@/lib/collector/db";
import { getActiveSessions } from "@/lib/auth";
import { officerDeptCode } from "@/lib/officer/guard";
import { DIR_RE, NAME_RE, readPhoto } from "@/lib/officer/photos";
import { decodeSummary } from "@/lib/rehearsal/tasks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A before-rain task's photo, for the Collector or an officer of the task's department. */
export async function GET(_req: NextRequest, { params }: { params: { dir: string; name: string } }) {
  const sessions = await getActiveSessions();
  if (!sessions.length) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!DIR_RE.test(params.dir) || !NAME_RE.test(params.name)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ref = `${params.dir}/${params.name}`;
  const [rows] = (await intelPool.query(`SELECT a.record_id, a.after_value, f.summary FROM ${ops("audit_log")} a JOIN ${ops("followups")} f ON f.followup_id = a.record_id
     WHERE a.action = 'rehearsal:done'`)) as unknown as [Record<string, any>[]];
  const row = rows.find((r) => { try { return JSON.parse(String(r.after_value)).photo === ref; } catch { return false; } });
  const dept = row ? decodeSummary(String(row.summary))?.head.d ?? null : null;
  if (!dept) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let allowed = false;
  for (const s of sessions) {
    allowed = s.role === "collector" || (s.role === "department_officer" && (await officerDeptCode(s.userId)) === dept);
    if (allowed) break;
  }
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const photo = await readPhoto(params.dir, params.name);
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(photo.buf), { headers: { "content-type": photo.type, "Cache-Control": "private, max-age=3600" } });
}
