/**
 * v11 live probe: the owner's own sentences of 20 Nov (data/thunai/audit.jsonl) and the questions an aide is asked, through the console's
 * server round (planRound) with THE DISTRICT NOW, on the dry-run copy of the store (read only), the real planner ladder (Claude leading).
 * Prints, per sentence: the lane, the screen, what Jarvis would say, and the time. Nothing is written to the store.
 *   npx vitest run --config vitest.live.config.ts src/lib/thunai/v11/probe11.live.ts
 *   PROBE=v10 ... the same without the snapshot (JARVIS_SNAPSHOT=0), to compare
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v11/durable.sqlite";
process.env.JARVIS_LIVE_CLAUDE = "1";
process.env.AI_PROVIDER = "none";
if (process.env.PROBE === "v10") process.env.JARVIS_SNAPSHOT = "0";
import { it } from "vitest";
import { serverHands } from "../data";
import { clearCaches, planRound, RoundBody } from "../round";
import { serverWorld } from "../world";
import { districtSnapshot } from "./snapshot";

const SAID = (process.env.PROBE_SAID ? process.env.PROBE_SAID.split("|") : [
  "See live traffic.",
  "Tell me about live traffic in Chennai.",
  "Services எப்படி இருக்கு?",
  "Compare tomato price over one week.",
  "Which zone should I worry about today and why?",
  "Is there anything unusual this week?",
  "How is the power situation if it rains tonight?",
  "Which department is falling behind the most?",
  "இன்னைக்கு சென்னையில என்ன முக்கியமா கவனிக்கணும்?",
  "How full are the lakes?"
]);
const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };

it("v11 probe", async () => {
  const w = await serverWorld();
  const hands = serverHands({ email: "probe@local", role: "collector", lockDept: null });
  const t0 = Date.now();
  let snap = process.env.PROBE === "v10" ? null : await districtSnapshot(60_000);
  // the slow first reads (the briefing, live traffic) join the snapshot when they arrive: wait for all of them, as a warm console has them
  for (let i = 0; snap && snap.parts.length < 11 && i < 40; i++) { await new Promise((r) => setTimeout(r, 2000)); snap = await districtSnapshot(); }
  if (snap) console.log(`[snapshot] ${snap.parts.length} parts (${snap.parts.map((p) => p.name).join(", ")}) in ${Date.now() - t0} ms`);
  for (const [k, text] of SAID.entries()) {
    // spoken pace (PROBE_GAP_MS, default 6 s): back-to-back questions run Claude's minute budget out, as no Collector does
    if (k) await new Promise((r) => setTimeout(r, Number(process.env.PROBE_GAP_MS ?? 6000)));
    clearCaches();
    const s = Date.now();
    const turnId = `p-${Math.random().toString(36).slice(2, 8)}`;
    let out: Awaited<ReturnType<typeof planRound>> = null as never;
    // the browser drives the rounds: a round that looked first (done false) is followed by the next, as Thunai.tsx does
    for (let round = 0; round < 3; round++) {
      const body = RoundBody.parse({ turnId, round, text, state: STATE, turns: [], stage: null, direct: null });
      out = await planRound(body, w, hands, "probe", undefined, undefined, { snapshot: process.env.PROBE === "v10" ? undefined : () => districtSnapshot() }).catch((e) => ({ done: true, result: null, lane: `error ${(e as Error).message}` }) as never);
      if (out.done) break;
    }
    const r = out.result;
    console.log(JSON.stringify({ said: text, lane: out.lane, done: out.done, kind: r?.kind, note: r?.note, screen: r?.stage?.recipe ?? null, model: r?.model, say: r?.say ?? r?.reply ?? null, ms: Date.now() - s,
      modelMs: out.timing?.plannerBack && out.timing?.plannerSent ? out.timing.plannerBack - out.timing.plannerSent : null }));
  }
});
