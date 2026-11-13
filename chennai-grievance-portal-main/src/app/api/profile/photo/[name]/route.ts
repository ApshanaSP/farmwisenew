import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { getActiveSessions } from "@/lib/auth";
import { PHOTO_NAME_RE, PHOTO_PREFIX, readPhoto } from "@/lib/profile-photo";

export const dynamic = "force-dynamic";

/**
 * A profile photo, for the signed-in account it belongs to and nobody else (it is shown only on the account's own profile page). Any other
 * name, or someone else's photo, is "Not found", so a name cannot be probed (QA pass 6, hunt2-sec-07).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  // every sign-in this browser holds, as the complaint media route reads them: an <img> request carries no page to say which portal asks
  const sessions = await getActiveSessions();
  if (!sessions.length) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!PHOTO_NAME_RE.test(name)) return notFound();
  const [rows] = await pool.query<RowDataPacket[]>("SELECT user_id FROM user_profiles WHERE profile_photo = ? LIMIT 1", [PHOTO_PREFIX + name]);
  if (!rows.length || !sessions.some((s) => Number(s.userId) === Number(rows[0].user_id))) return notFound();
  const photo = await readPhoto(name);
  if (!photo) return notFound();
  return new NextResponse(new Uint8Array(photo.buf), {
    headers: { "Content-Type": photo.type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" }
  });
}
