import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { getSessionFromCookies, resolvePortal, revokeSessions, setAuthCookie } from "@/lib/auth";
import { signToken } from "@/lib/jwt";
import { roleToPortal } from "@/lib/session-cookies";
import { changePasswordSchema } from "@/lib/validators";
import { verifyFactor } from "@/lib/security/factors";

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null); // a malformed body is a 400 from the schema, not a 500
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  // The current password is checked through the same five-tries lock as "Confirm it's you" (lib/security/factors.ts), so a copied
  // cookie cannot be used to guess it without limit (QA4 gate, redteam-final-2). A try is counted before the slow check.
  const check = await verifyFactor(session.userId, "password", currentPassword);
  if (!check.ok) {
    if (check.status === 429) return NextResponse.json({ error: check.error }, { status: 429 });
    if (/not found/i.test(check.error)) return NextResponse.json({ error: "User not found." }, { status: 404 });
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, session.userId]);

  // every other device is signed out; this browser gets a fresh session so the user stays signed in here
  const tv = await revokeSessions(session.userId);
  const res = NextResponse.json({ message: "Password changed successfully. Other devices have been signed out." });
  const portal = (await resolvePortal()) ?? roleToPortal(session.role);
  if (portal) {
    const { userId, email, role, departmentId } = session;
    await setAuthCookie(res, await signToken({ userId, email, role, departmentId, tv }), portal);
  }
  return res;
}
