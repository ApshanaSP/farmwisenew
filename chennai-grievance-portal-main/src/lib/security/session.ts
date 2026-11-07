/**
 * Starting a session once the password is right: the signed token, this tab's cookie, and a sign-in row in the audit log. Staff sessions last 12 hours (STAFF_SESSION_HOURS); a
 * citizen's 7 days, as before.
 */
import { NextResponse } from "next/server";
import { signToken } from "@/lib/jwt";
import { migrateLegacyCookie, setAuthCookie } from "@/lib/auth";
import { roleToPortal } from "@/lib/session-cookies";
import type { UserRole } from "@/types";
import { isStaff, type Factor } from "./factors";
import { securityLog } from "./audit";

export interface SignedIn { id: number; email: string; role: UserRole; department_id: number | null; tv: number }

export const staffHours = () => Math.min(24, Math.max(1, Number(process.env.STAFF_SESSION_HOURS) || 12));

export function landing(role: string): string {
  return role === "citizen" ? "/citizen" : role === "department_officer" ? "/officer" : role === "collector" ? "/collector" : "/login";
}

export async function startSession(u: SignedIn, how: { factor: Factor | null; ip: string; ua: string | null }, extra: Record<string, unknown> = {}): Promise<NextResponse> {
  const portal = roleToPortal(u.role);
  if (!portal) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  const staff = isStaff(u.role);
  const token = await signToken({ userId: u.id, email: u.email, role: u.role, departmentId: u.department_id, tv: u.tv }, staff ? `${staffHours()}h` : undefined);
  const res = NextResponse.json({ message: "Login successful", redirectTo: landing(u.role), role: u.role, ...extra });
  await migrateLegacyCookie(res);
  await setAuthCookie(res, token, portal, staff ? staffHours() * 3600 : undefined);
  await securityLog(u.email, "auth:signin", String(u.id), { factor: how.factor ?? "password", ip: how.ip, ua: how.ua?.slice(0, 120) ?? null });
  return res;
}
