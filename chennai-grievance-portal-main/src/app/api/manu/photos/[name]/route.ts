import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { getActivePortalSession } from "@/lib/auth";
import { PHOTO_NAME, mediaTypeOf, readPhoto } from "@/lib/manu/files";
import { seesEveryPetition } from "@/lib/manu/guard";
import { officerDeptCode } from "@/lib/officer/guard";

export const dynamic = "force-dynamic";

/** A petition's photo: for the petition officer, the Collector, and the officer of the department it went to. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const params = await ctx.params;
  if (!PHOTO_NAME.test(params.name)) return new NextResponse("Not found", { status: 404 });
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT dept_code, status FROM petitions WHERE pages LIKE ? LIMIT 1`, [`%"${params.name}"%`]);
  const p = rows[0];
  if (!p) return new NextResponse("Not found", { status: 404 });
  let allowed = await seesEveryPetition();
  if (!allowed && p.status === "filed" && p.dept_code) {
    const o = await getActivePortalSession("officer");
    allowed = o?.role === "department_officer" && (await officerDeptCode(o.userId)) === p.dept_code;
  }
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });
  const b = await readPhoto(params.name);
  if (!b) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(b), { headers: { "Content-Type": mediaTypeOf(params.name), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
