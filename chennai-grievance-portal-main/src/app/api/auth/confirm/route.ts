import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromCookies } from "@/lib/auth";
import { getClientIp } from "@/lib/rate-limit";
import { emailCode, isStaff, verifyFactor } from "@/lib/security/factors";
import { issueGrant, type ActionKind } from "@/lib/security/stepup";
import { securityLog } from "@/lib/security/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIONS = ["send_email", "decide", "officer_report", "delete_dataset", "approve_source", "change_source", "export", "signout_others"] as const;
const Body = z.discriminatedUnion("step", [
  z.object({ step: z.literal("email") }),
  z.object({
    step: z.literal("check"), action: z.enum(ACTIONS), scope: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/), summary: z.string().max(400).default(""),
    method: z.enum(["email", "password"]), code: z.string().trim().min(4).max(200)
  })
]);

/**
 * The "Confirm it's you" box (components/security/Confirm.tsx):
 *   email   sends a code by email (sandbox inbox by default)
 *   check   checks the password or the code and returns a 5-minute grant for this action on this exact scope (lib/security/stepup.ts)
 * Staff only, for the account signed in to the page that asks (its portal's own session).
 */
export async function POST(req: NextRequest) {
  const s = await getSessionFromCookies();
  if (!s || !isStaff(s.role)) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Type your password." }, { status: 400 });
  const ip = getClientIp(req.headers);

  if (b.data.step === "email") {
    const r = await emailCode(s.userId);
    return r.ok ? NextResponse.json({ sent: true, to: r.to }) : NextResponse.json({ error: r.error }, { status: r.status });
  }
  const { action, scope, summary, method, code } = b.data;
  const r = await verifyFactor(s.userId, method, code);
  if (!r.ok) {
    await securityLog(s.email, "confirm:wrong", String(s.userId), { action, method, ip });
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
  const grant = await issueGrant(s, action as ActionKind, scope, r.factor);
  await securityLog(s.email, "confirm:ok", String(s.userId), { action, summary: summary.slice(0, 200), factor: r.factor, ip });
  return NextResponse.json({ grant, factor: r.factor });
}
