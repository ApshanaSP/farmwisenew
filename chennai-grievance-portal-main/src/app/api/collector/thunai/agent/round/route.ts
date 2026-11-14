import { NextRequest, NextResponse } from "next/server";
import { exportMeta } from "@/lib/collector/intel";
import { collectorSession } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { serverHands } from "@/lib/thunai/data";
import type { TurnEvent } from "@/lib/thunai/events";
import { planRound, RoundBody } from "@/lib/thunai/round";
import { readMemory } from "@/lib/thunai/store";
import { roundStream } from "@/lib/thunai/streamturn";
import { serverWorld } from "@/lib/thunai/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * One round of Jarvis's thinking (lib/thunai/round.ts): the browser drives the rounds, applies the steps and sends the digest. A
 * disconnected browser (a barge-in, Esc) aborts the model and the tools through req.signal. Read-only: drafts go to the tray and
 * the tray's button is the Collector's own tap. With `stream: true` in the body the round answers as NDJSON events (events.ts), the
 * last of which (RUN_FINISHED) carries the same object the JSON reply does; without it the reply is that JSON, as it always was.
 */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  // rounds count separately: three to a turn
  const gate = checkRateLimit(`thunai-round:${s.userId}`, 90, 60);
  if (!gate.allowed) return NextResponse.json({ done: true, result: { kind: "none", note: "no-model" }, why: "busy" }, { status: 429 });
  const parsed = RoundBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ done: true, result: { kind: "none" }, why: "bad request" }, { status: 400 });
  const mem = readMemory(s.userId);
  const run = async (emit?: (e: TurnEvent) => void) => planRound(parsed.data, await serverWorld(), serverHands({ email: s.email, role: "collector", lockDept: null }, req.signal), `collector:${s.userId}`,
    { notes: mem.notes.map((n) => n.text), habits: mem.habits }, req.signal, { dataVersion: () => exportMeta().then((m) => m.build_id ?? m.exported_at ?? ""), speculate: true, emit });
  if (parsed.data.stream) return roundStream(run, { turnId: parsed.data.turnId, round: parsed.data.round }, req.signal);
  try {
    return NextResponse.json(await run());
  } catch (e) {
    if (req.signal.aborted) return new NextResponse(null, { status: 499 });
    console.error("thunai round failed", e);
    return NextResponse.json({ done: true, result: { kind: "none", note: "failed" }, why: "failed" }, { status: 500 });
  }
}
