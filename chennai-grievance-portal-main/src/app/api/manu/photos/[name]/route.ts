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
  // who is calling first, then the store: an anonymous caller got 403 for a real photo's name and 404 for any other, and a store error was an
  // unhandled 500 (pass 5's manu-sec-11)
  const every = await seesEveryPetition();
  const o = every ? null : await getActivePortalSession("officer");
  const dept = !every && o?.role === "department_officer" ? await officerDeptCode(o.userId) : null;
  if (!every && !dept) return new NextResponse("Forbidden", { status: 403 });
  let p: RowDataPacket | undefined;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT dept_code, status FROM petitions WHERE pages LIKE ? LIMIT 1`, [`%"${params.name}"%`]);
    p = rows[0];
  } catch (err) {
    console.error("manu photo", err);
    return new NextResponse("The photo could not be loaded just now.", { status: 503 });
  }
  if (!p) return new NextResponse("Not found", { status: 404 });
  if (!every && !(p.status === "filed" && p.dept_code === dept)) return new NextResponse("Forbidden", { status: 403 });
  const b = await readPhoto(params.name);
  if (!b) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(b), { headers: { "Content-Type": mediaTypeOf(params.name), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
