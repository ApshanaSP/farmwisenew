import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { getActiveSessions } from "@/lib/auth";
import type { JwtPayload } from "@/types";
import { MEDIA_NAME_RE, PRIVATE_MEDIA_PREFIX, byteRange, mediaFile, mediaOwner, mediaStream } from "@/lib/complaint-media";

export const dynamic = "force-dynamic";

/**
 * A complaint's private photo or video, for the citizen who uploaded it (or whose complaint it is attached to), an
 * officer of that complaint's department, or the Collector. Anyone else gets "Not found", so a name cannot be probed.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const params = await ctx.params;
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
    // only now is the file looked at, and only its size: who may open it is decided above, so a range answer never tells anyone else it exists
    const media = await mediaFile(params.name);
    if (!media) return notFound();
    // one byte range, from the file: the whole file for every request kept Safari and iOS from playing a video, and others from seeking
    // (p7-desk-and-accounts-10). If-Range quotes a validator this route never gives, so it gets the whole file
    const range = req.headers.has("if-range") ? null : byteRange(req.headers.get("range"), media.size);
    const common = { "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" };
    if (range === "unsatisfiable") {
      return new NextResponse(null, { status: 416, headers: { ...common, "Content-Range": `bytes */${media.size}`, "Content-Length": "0" } });
    }
    const { start, end } = range ?? { start: 0, end: media.size - 1 };
    return new NextResponse(end >= start ? mediaStream(media.file, start, end) : null, {
      status: range ? 206 : 200,
      headers: { ...common, "Content-Type": media.type, "Content-Disposition": "inline", "Content-Length": String(end - start + 1),
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${media.size}` } : {}) }
    });
  } catch (err) {
    console.error("complaint media failed", err);
    return NextResponse.json({ error: "Could not load the file." }, { status: 500 });
  }
}
