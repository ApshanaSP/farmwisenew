import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AiBudgetError, AiBusyError, AiUnavailableError } from "@/lib/ai/gateway";
import { assistantSession } from "@/lib/assistant/access";
import { checkRateLimit } from "@/lib/rate-limit";
import { analyse } from "@/lib/map/analyst";
import { checkPlan } from "@/lib/map/plan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The AI analyst on a map answer (after the answer is drawn): a reading, actions with owners, one thing to watch. */
export async function POST(req: NextRequest) {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  const gate = checkRateLimit(`map-insight:${s.userId}`, 20, 60);
  if (!gate.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const body = await req.json().catch(() => null);
  const c = checkPlan(z.object({ plan: z.unknown() }).safeParse(body).data?.plan);
  if (!c.ok) return NextResponse.json({ error: "Nothing to read." }, { status: 400 });
  try {
    const out = await analyse({ plan: c.plan, user: { email: s.email, role: s.role, lockDept: s.lockDept }, signal: req.signal });
    return NextResponse.json(out ?? { none: true });
  } catch (e) {
    if (e instanceof AiUnavailableError || e instanceof AiBusyError || e instanceof AiBudgetError) return NextResponse.json({ none: true, reason: "ai" });
    console.error("[map] analyst failed", (e as Error).message);
    return NextResponse.json({ none: true });
  }
}
