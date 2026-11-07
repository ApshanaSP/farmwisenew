import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromCookies, revokeSessions, setAuthCookie } from "@/lib/auth";
import { signToken } from "@/lib/jwt";
import { roleToPortal } from "@/lib/session-cookies";
import { getClientIp } from "@/lib/rate-limit";
import { isStaff } from "@/lib/security/factors";
import { staffHours } from "@/lib/security/session";
import { recentEvents, securityLog } from "@/lib/security/audit";
import { checkRef } from "@/lib/security/stamp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The console's Security page (components/security/SecurityPanel.tsx), for the signed-in staff account:
 *   GET               when this session ends, recent sign-ins and confirmations
 *   check_ref         is "DIQ-7F3A-K2QZ" an email District IQ really sent (lib/security/stamp.ts)
 *   signout_others    ends every other session of the account; this tab gets a fresh one
 */
export async function GET() {
  const s = await getSessionFromCookies();
  if (!s || !isStaff(s.role)) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const events = await recentEvents(s.email, 14);
  const exp = Number((s as unknown as { exp?: number }).exp) || null;
  return NextResponse.json({ email: s.email, role: s.role, sessionEnds: exp ? new Date(exp * 1000).toISOString() : null, hours: staffHours(), events });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check_ref"), ref: z.string().trim().min(8).max(24) }),
  z.object({ action: z.literal("signout_others") })
]);

export async function POST(req: NextRequest) {
  const s = await getSessionFromCookies();
  if (!s || !isStaff(s.role)) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Type the reference from the email, like DIQ-7F3A-K2QZ." }, { status: 400 });
  const ip = getClientIp(req.headers);

  if (b.data.action === "check_ref") {
    const r = await checkRef(b.data.ref);
    await securityLog(s.email, "email:check_ref", null, { ref: b.data.ref.toUpperCase(), genuine: r.genuine, ip });
    return NextResponse.json(r);
  }

  const tv = await revokeSessions(s.userId);
  const portal = roleToPortal(s.role)!;
  const res = NextResponse.json({ ok: true });
  await setAuthCookie(res, await signToken({ userId: s.userId, email: s.email, role: s.role, departmentId: s.departmentId, tv }, `${staffHours()}h`), portal, staffHours() * 3600);
  await securityLog(s.email, "auth:signout_others", String(s.userId), { ip });
  return res;
}
