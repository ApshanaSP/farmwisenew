import { NextRequest, NextResponse } from "next/server";
import { getActiveSessions } from "@/lib/auth";
import { PROFILE_NAME_RE, readProfilePhoto } from "@/lib/profile-photo";

export const dynamic = "force-dynamic";

/** A profile photo, for the account it belongs to only (the profile page is the one place it shows). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const sessions = await getActiveSessions();
  if (!sessions.length) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const m = PROFILE_NAME_RE.exec(name);
  if (!m || !sessions.some((s) => s.userId === Number(m[1]))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const photo = await readProfilePhoto(name);
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(photo.buf), {
    headers: { "Content-Type": photo.type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" }
  });
}
