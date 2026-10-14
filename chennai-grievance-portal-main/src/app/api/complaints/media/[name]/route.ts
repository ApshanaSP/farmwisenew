import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { getActiveSessions } from "@/lib/auth";
import type { JwtPayload } from "@/types";
import { MEDIA_NAME_RE, PRIVATE_MEDIA_PREFIX, mediaOwner, readMedia } from "@/lib/complaint-media";

export const dynamic = "force-dynamic";

/**
 * A complaint's private photo or video, for the citizen who uploaded it (or whose complaint it is attached to), an
 * officer of that complaint's department, or the Collector. Anyone else gets "Not found", so a name cannot be probed.
 */
export async function GET(_req: NextRequest, { params }: { params: { name: string } }) {
  // every sign-in this browser holds: a photo opened in a new tab carries no page to say which portal asked
  const sessions = await getActiveSessions();
  if (!sessions.length) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!MEDIA_NAME_RE.test(params.name)) return notFound();
  try {
    let complaint: RowDataPacket | null | undefined;
    const may = async (session: JwtPayload): Promise<boolean> => {
      if (session.role === "collector") return true;
      if (complaint === undefined) {
        const [rows] = await pool.query<RowDataPacket[]>(
          `SELECT user_id, department_id FROM complaints WHERE media_path = ? LIMIT 1`, [PRIVATE_MEDIA_PREFIX + params.name]);
        complaint = rows[0] ?? null;
      }
      const c = complaint;
      if (session.role === "citizen") return (await mediaOwner(params.name)) === session.userId || (c != null && Number(c.user_id) === session.userId);
      if (session.role === "department_officer" && c?.department_id != null) {
        const [u] = await pool.query<RowDataPacket[]>(`SELECT department_id FROM users WHERE id = ? LIMIT 1`, [session.userId]);
        return u[0]?.department_id != null && Number(u[0].department_id) === Number(c.department_id);
      }
      return false;
    };
    let allowed = false;
    for (const s of sessions) if ((allowed = await may(s))) break;
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
