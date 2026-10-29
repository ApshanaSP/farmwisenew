import { NextRequest, NextResponse } from "next/server";
import { collectorSession } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { PlanBody, screenOf, think } from "@/lib/thunai/brain";
import { readMemory } from "@/lib/thunai/store";
import { serverWorld } from "@/lib/thunai/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Every sentence the Collector says (except instant controls) is understood here by Nova Lite and checked by code. */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const gate = checkRateLimit(`thunai:${s.userId}`, 40, 60);
  if (!gate.allowed) return NextResponse.json({ plan: { kind: "none" }, why: "busy" }, { status: 429 });
  const parsed = PlanBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ plan: { kind: "none" }, why: "bad request" }, { status: 400 });
  const { text, state, turns } = parsed.data;
  const mem = readMemory(s.userId);
  const r = await think(text, screenOf(state), await serverWorld(), { turns, notes: mem.notes.map((n) => n.text), habits: mem.habits }, `collector:${s.userId}`);
  if (r.error) console.error("thunai plan failed", r.error);
  return NextResponse.json({ plan: r.plan, ms: r.ms, model: r.model });
}
