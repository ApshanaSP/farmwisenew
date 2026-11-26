import { districtSnapshot } from "@/lib/thunai/v11/snapshot";
import { NextRequest, NextResponse } from "next/server";
import { claudeConfigured } from "@/lib/ai/claude";
import { busy, markActive } from "@/lib/thunai/keepwarm";
import { exportMeta } from "@/lib/collector/intel";
import { collectorSession } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { serverHands } from "@/lib/thunai/data";
import type { TurnEvent } from "@/lib/thunai/events";
import { logDecision } from "@/lib/thunai/decisions";
import { decisionOf, planRound, RoundBody, type RoundOut } from "@/lib/thunai/round";
import { readMemory } from "@/lib/thunai/store";
import { roundStream } from "@/lib/thunai/streamturn";
import { serverWorld } from "@/lib/thunai/world";
import { brainOn } from "@/lib/brain";
import { brainTurn } from "@/lib/thunai/brainturn";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * One round of Jarvis's thinking (lib/thunai/round.ts): the browser drives the rounds, applies the steps and sends the digest. A
 * disconnected browser (a barge-in, Esc) aborts the model and the tools through req.signal. Read-only: drafts go to the tray and
 * the tray's button is the Collector's own tap. With `stream: true` in the body the round answers as NDJSON events (events.ts), the
 * last of which (RUN_FINISHED) carries the same object the JSON reply does; without it the reply is that JSON, as it always was.
 * A round that ends with an answer is put on the decision record (decisions.ts: the Collector's words cleaned, the data's time, the tools,
 * the model, the lane and the time taken; no citizen text); a record that cannot be written never fails the answer.
 */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  // rounds count separately: three to a turn
  const gate = checkRateLimit(`thunai-round:${s.userId}`, 90, 60);
  if (!gate.allowed) return NextResponse.json({ done: true, result: { kind: "none", note: "no-model" }, why: "busy" }, { status: 429 });
  const parsed = RoundBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ done: true, result: { kind: "none" }, why: "bad request" }, { status: 400 });
  // v12 (21 Nov): Jarvis is in use: the keep-warm keeps its reads (and, with Claude leading, the planner's prompt cache) warm meanwhile
  markActive("jarvis");
  const mem = readMemory(s.userId);
  const record = (o: RoundOut) => {
    // v12 (21 Nov): a round the browser gave up on (a barge-in, Esc) was never shown: it goes on no record ("what did you do today" claimed
    // the 06:42:15 flooded-roads answer the Collector never saw; the report, stale-and-double RC7)
    if (req.signal.aborted) return o;
    const d = decisionOf(parsed.data, o);
    if (d) try { logDecision(s.email, d); } catch (e) { console.error("thunai decision record failed", (e as Error).message); }
    return o;
  };
  // v12 (21 Nov): THE DISTRICT NOW is read only when Claude can lead the planner, the one rung that attaches it: with Claude off (the $5
  // ceiling reached) every planner turn waited on it, and its stale refresh froze the conversation, for a picture no turn used (RC3)
  const snapshot = () => (claudeConfigured() ? districtSnapshot() : Promise.resolve(null));
  const run = async (emit?: (e: TurnEvent) => void) => record(await planRound(parsed.data, await serverWorld(), serverHands({ email: s.email, role: "collector", lockDept: null }, req.signal), `collector:${s.userId}`,
    { notes: mem.notes.map((n) => n.text), habits: mem.habits }, req.signal, { dataVersion: () => exportMeta().then((m) => m.build_id ?? m.exported_at ?? ""), speculate: true, emit, snapshot,
      // 26 Nov: the brain answers first (lib/brain); the lanes of round.ts stand behind it
      brain: brainOn() ? brainTurn : null, brainFor: { user: { email: s.email, role: "collector", lockDept: null }, key: `voice:${s.userId}` } }));
  // v15: the keep-warm's heavy steps wait while a round is answered (keepwarm.ts busy)
  const done = busy();
  const runBusy = (emit?: (e: TurnEvent) => void) => run(emit).finally(done);
  if (parsed.data.stream) return roundStream(runBusy, { turnId: parsed.data.turnId, round: parsed.data.round }, req.signal);
  try {
    return NextResponse.json(await runBusy());
  } catch (e) {
    if (req.signal.aborted) return new NextResponse(null, { status: 499 });
    console.error("thunai round failed", e);
    return NextResponse.json({ done: true, result: { kind: "none", note: "failed" }, why: "failed" }, { status: 500 });
  }
}
