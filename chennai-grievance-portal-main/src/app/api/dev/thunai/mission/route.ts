import { localOnly } from "@/lib/thunai/devguard";
import { NextRequest, NextResponse } from "next/server";
import { serverHands } from "@/lib/thunai/data";
import { MissionBody, planMission, PLAN_MS } from "@/lib/thunai/missions";
import { redactHands } from "@/lib/thunai/privacy";
import { serverWorld } from "@/lib/thunai/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The dev test console's mission plans: the same code on the local store, no sign-in. 404 in production and off this PC. */
export async function POST(req: NextRequest) {
  // a measuring build (NEXT_PUBLIC_JARVIS_SPEC=1 at build time) keeps these; a normal production build does not
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_JARVIS_SPEC !== "1") return new NextResponse(null, { status: 404 });
  if (!localOnly(req.headers)) return new NextResponse(null, { status: 404 });
  const parsed = MissionBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ plan: null, why: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  const b = parsed.data;
  try {
    const hands = redactHands(serverHands({ email: "dev:thunai", role: "collector", lockDept: null }, req.signal));
    const r = await planMission(b.text, { world: await serverWorld(), lang: b.lang, state: b.state as never, redirect: b.redirect },
      { user: "dev:thunai", signal: req.signal, until: Date.now() + PLAN_MS, tool: hands.tool });
    if (r.kind === "plan") return NextResponse.json({ plan: r.plan, reply: null, why: null, via: r.via });
    return NextResponse.json({ plan: null, reply: r.reply, why: r.why, refused: r.kind === "refuse" });
  } catch (e) {
    if (req.signal.aborted) return new NextResponse(null, { status: 499 });
    console.error("thunai dev mission failed", e);
    return NextResponse.json({ plan: null, why: (e as Error).message.slice(0, 200) }, { status: 500 });
  }
}
