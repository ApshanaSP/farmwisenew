import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { getActiveSession } from "@/lib/auth";
import { MEDIA_NAME_RE, PRIVATE_MEDIA_PREFIX, mediaOwner, readMedia } from "@/lib/complaint-media";

export const dynamic = "force-dynamic";

/**
 * A complaint's private photo or video, for the citizen who uploaded it (or whose complaint it is attached to), an
 * officer of that complaint's department, or the Collector. Anyone else gets "Not found", so a name cannot be probed.
 */
export async function GET(_req: NextRequest, { params }: { params: { name: string } }) {
  const session = await getActiveSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!MEDIA_NAME_RE.test(params.name)) return notFound();
  try {
    let allowed = session.role === "collector";
    if (!allowed) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT user_id, department_id FROM complaints WHERE media_path = ? LIMIT 1`, [PRIVATE_MEDIA_PREFIX + params.name]);
      const c = rows[0];
      if (session.role === "citizen") {
        allowed = (await mediaOwner(params.name)) === session.userId || (c != null && Number(c.user_id) === session.userId);
      } else if (session.role === "department_officer" && c?.department_id != null) {
        const [u] = await pool.query<RowDataPacket[]>(`SELECT department_id FROM users WHERE id = ? LIMIT 1`, [session.userId]);
        allowed = u[0]?.department_id != null && Number(u[0].department_id) === Number(c.department_id);
      }
    }
    if (!allowed) return notFound();
    const media = await readMedia(params.name);
    if (!media) return notFound();
    return new NextResponse(new Uint8Array(media.buf), {
      headers: { "Content-Type": media.type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline" }
    });
  } catch (err) {
    console.error("complaint media failed", err);
    return NextResponse.json({ error: "Could not load the file." }, { status: 500 });
  }
}
