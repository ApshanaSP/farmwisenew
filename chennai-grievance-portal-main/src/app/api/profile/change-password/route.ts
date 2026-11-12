import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { getSessionFromCookies, resolvePortal, revokeSessions, setAuthCookie } from "@/lib/auth";
import { signToken } from "@/lib/jwt";
import { isStaff, verifyFactor } from "@/lib/security/factors";
import { staffHours } from "@/lib/security/session";
import { roleToPortal } from "@/lib/session-cookies";
import { changePasswordSchema } from "@/lib/validators";
import { RowDataPacket } from "mysql2";

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

  const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM users WHERE id = ?", [session.userId]);
  if (rows.length === 0) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // the current password is checked where every "it's you" check with a session is, and counts on the same failures: five wrong in 15
  // minutes lock it. Checked here with no limit, a stolen session cookie could guess the password about 20 times a second, past the
  // sign-in limit and the step-up limit, then change it and sign every other device out (QA pass 6, hunt2-sec-09)
  const check = await verifyFactor(session.userId, "password", currentPassword);
  if (!check.ok) {
    return check.status === 401
      ? NextResponse.json({ error: "Current password is incorrect." }, { status: 400 })
      : NextResponse.json({ error: check.error }, { status: check.status });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, session.userId]);

  // every other device is signed out; this browser gets a fresh session so the user stays signed in here
  const tv = await revokeSessions(session.userId);
  const res = NextResponse.json({ message: "Password changed successfully. Other devices have been signed out." });
  const portal = (await resolvePortal()) ?? roleToPortal(session.role);
  if (portal) {
    const { userId, email, role, departmentId } = session;
    // the account's own session length: a staff account's new session lasted the citizen's 7 days, not 12 hours (QA pass 6, P6-016)
    const staff = isStaff(role);
    await setAuthCookie(res, await signToken({ userId, email, role, departmentId, tv }, staff ? `${staffHours()}h` : undefined), portal, staff ? staffHours() * 3600 : undefined);
  }
  return res;
}
