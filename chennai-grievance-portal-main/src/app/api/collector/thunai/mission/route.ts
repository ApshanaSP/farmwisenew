import { NextRequest, NextResponse } from "next/server";
import { collectorSession } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { serverHands } from "@/lib/thunai/data";
import { logDecision } from "@/lib/thunai/decisions";
import { MissionBody, planMission, PLAN_MS } from "@/lib/thunai/missions";
import { redactHands } from "@/lib/thunai/privacy";
import { serverWorld } from "@/lib/thunai/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A mission's plan (lib/thunai/missions.ts): one sentence in, a plan of 3-6 steps out as data, for the browser's plan card. Nothing runs
 * here: the browser runs the plan after the Collector's Start (missions.run.ts). Refusals come first, in code (privacy, never send /
 * approve / delete), as in the round. Read-only: the tour reads the zones tool, redacted; drafts are only named, never made or sent.
 * Body { text, lang?, stage?, state?, redirect? } -> { plan, reply, why, via }. A plan is put on the decision record (decisions.ts: the
 * Collector's words cleaned, the model or the rules, the time taken; no citizen text); a record that cannot be written never fails the plan.
 */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const gate = checkRateLimit(`thunai-mission:${s.userId}`, 20, 60);
  if (!gate.allowed) return NextResponse.json({ plan: null, why: "busy" }, { status: 429 });
  const parsed = MissionBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ plan: null, why: "bad request" }, { status: 400 });
  const b = parsed.data;
  try {
    const t0 = Date.now();
    const hands = redactHands(serverHands({ email: s.email, role: "collector", lockDept: null }, req.signal));
    const r = await planMission(b.text, { world: await serverWorld(), lang: b.lang, state: b.state as never, redirect: b.redirect },
      { user: `collector:${s.userId}`, signal: req.signal, until: Date.now() + PLAN_MS, tool: hands.tool });
    if (r.kind === "plan") {
      const planned = r.via === "model";
      try {
        logDecision(s.email, { kind: "answer", query: b.text.slice(0, 400), lang: b.lang === "ta" ? "ta" : b.lang === "en" ? "en" : null, snapshot: null, tools: planned || r.via !== "tour" ? [] : ["zones"],
          model: planned ? (r.model && /^[A-Za-z0-9._:/#-]{1,80}$/.test(r.model) ? r.model : null) : "rules", lane: planned ? "planner" : "rules", ms: Math.min(600_000, Date.now() - t0) });
      } catch (e) { console.error("thunai mission decision record failed", (e as Error).message); }
      return NextResponse.json({ plan: r.plan, reply: null, why: null, via: r.via });
    }
    return NextResponse.json({ plan: null, reply: r.reply, why: r.why, refused: r.kind === "refuse" });
  } catch (e) {
    if (req.signal.aborted) return new NextResponse(null, { status: 499 });
    console.error("thunai mission failed", e);
    return NextResponse.json({ plan: null, why: "failed" }, { status: 500 });
  }
}
