import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { getSessionFromCookies, resolvePortal, revokeSessions, setAuthCookie } from "@/lib/auth";
import { signToken } from "@/lib/jwt";
import { roleToPortal } from "@/lib/session-cookies";
import { changePasswordSchema } from "@/lib/validators";
import { RowDataPacket } from "mysql2";
import { UserRow } from "@/types";

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM users WHERE id = ?", [session.userId]);
  if (rows.length === 0) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  const user = rows[0] as UserRow;

  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, session.userId]);

  // every other device is signed out; this browser gets a fresh session so the user stays signed in here
  const tv = await revokeSessions(session.userId);
  const res = NextResponse.json({ message: "Password changed successfully. Other devices have been signed out." });
  const portal = resolvePortal() ?? roleToPortal(session.role);
  if (portal) {
    const { userId, email, role, departmentId } = session;
    setAuthCookie(res, await signToken({ userId, email, role, departmentId, tv }), portal);
  }
  return res;
}
