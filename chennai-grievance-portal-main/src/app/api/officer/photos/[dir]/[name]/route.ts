import { NextRequest, NextResponse } from "next/server";
import { getActiveSessions } from "@/lib/auth";
import { officerDeptCode } from "@/lib/officer/guard";
import { photoOwner } from "@/lib/officer/data";
import { DIR_RE, NAME_RE, readPhoto } from "@/lib/officer/photos";
import { citizenMayViewReport } from "@/lib/complaint-progress";

export const dynamic = "force-dynamic";

/**
 * A completion-report photo, for the Collector, an officer of the department that sent it, or a citizen whose complaint
 * is in the grievance the report is on (their tracker shows the work done).
 */
export async function GET(_req: NextRequest, { params }: { params: { dir: string; name: string } }) {
  // every sign-in this browser holds: photos open in a new tab, with no page to say which portal asked
  const sessions = await getActiveSessions();
  if (!sessions.length) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!DIR_RE.test(params.dir) || !NAME_RE.test(params.name)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const owner = await photoOwner(params.dir);
    if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let allowed = false;
    for (const session of sessions) {
      allowed = session.role === "collector" || (session.role === "department_officer" && (await officerDeptCode(session.userId)) === owner)
        || (session.role === "citizen" && (await citizenMayViewReport(session.userId, params.dir)));
      if (allowed) break;
    }
    if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const photo = await readPhoto(params.dir, params.name);
    if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(photo.buf), {
      headers: { "Content-Type": photo.type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" }
    });
  } catch (err) {
    console.error("officer photo failed", err);
    return NextResponse.json({ error: "Could not load the photo." }, { status: 500 });
  }
}
