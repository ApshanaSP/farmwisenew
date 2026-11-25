/**
 * v16 live probe (22 Nov): whole conversations through the console's server round (planRound: the reader, the lanes, the planner, the aide's
 * spoken answer), on the dry-run copy of the store (read only), the real model ladder (Claude leading). Each session carries its turns and
 * the open screen from one sentence to the next as the browser does (the turn list, the Stage, its digest), so follow-ups are real follow-ups.
 * Prints per sentence: what the reader understood, the lane, the screen, what Jarvis says, and when the screen and the first sentence came.
 *   npx vitest run --config vitest.live.config.ts src/lib/thunai/v16/probe16.live.ts
 *   PROBE_SESSIONS=A,B  only those sessions; PROBE_GAP_MS  the pause between sentences (default 2500)
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v18/durable.sqlite";
process.env.JARVIS_LIVE_CLAUDE = "1";
process.env.JARVIS_KEEPWARM = "0";
process.env.AI_PROVIDER = "none";
import fs from "node:fs";
import { it } from "vitest";
import { serverHands } from "../data";
import { clearCaches, planRound, RoundBody, type RoundOut } from "../round";
import { stageContext, type StageDocT } from "../stage";
import { stageDigest } from "../stagelocal";
import { serverWorld } from "../world";
import { districtSnapshot } from "../v11/snapshot";
import { readSentence, type Reading } from "../v16/reader";
import type { Turn } from "../plan";

const SESSIONS: Record<string, string[]> = {
  V1: ["Give me the summary of Anna Nagar.", "Now the same for the last 2 days.", "And Adyar?", "Show me only the severe ones."],
  V2: ["Summary of crimes happening.", "Summary of the police department in the last 48 hours.", "What happened in the district on 20 November?", "Show me the severe cases from two days ago."],
  V3: ["Compare Adyar and Anna Nagar for the last 4 days.", "Flooding news in the last 48 hours.", "Which zone had the most cases between 15 and 20 November?", "What were the vegetable prices in Anna Nagar last week?", "அண்ணா நகர் பத்தி full details சொல்லு"],
  V4: ["Brief me.", "What are my tasks today?", "Which area should I concentrate on?", "What's the traffic like right now?"]
};
const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const tamil = (s: string) => /[஀-௿]/.test(s);

it("v18 probe", async () => {
  const w = await serverWorld();
  const hands = serverHands({ email: "probe@local", role: "collector", lockDept: null });
  let snap = await districtSnapshot(60_000);
  for (let i = 0; snap && snap.parts.length < 11 && i < 30; i++) { await new Promise((r) => setTimeout(r, 2000)); snap = await districtSnapshot(); }
  console.log(`[snapshot] ${snap?.parts.length ?? 0} parts`);
  // PROBE_FILE: sessions from a JSON file ({ name: sentences[] }), e.g. the owner's whole history (replay-sessions.json)
  const all: Record<string, string[]> = process.env.PROBE_FILE ? JSON.parse(fs.readFileSync(process.env.PROBE_FILE, "utf8")) : SESSIONS;
  const want = process.env.PROBE_SESSIONS ? process.env.PROBE_SESSIONS.split(",") : Object.keys(all);
  const outFile = `data/thunai/probe18/run-${Date.now()}.json`;
  fs.mkdirSync("data/thunai/probe18", { recursive: true });
  const rows: Record<string, unknown>[] = [];
  for (const name of want) {
    const said = all[name];
    if (!said) continue;
    const turns: Turn[] = [];
    let doc: StageDocT | null = null;
    for (const [k, text] of said.entries()) {
      if (k) await new Promise((r) => setTimeout(r, Number(process.env.PROBE_GAP_MS ?? 2500)));
      clearCaches();
      const turnId = `p16-${Math.random().toString(36).slice(2, 8)}`;
      let reading: Reading | null = null, readMs: number | null = null;
      const base = readSentence();
      const reader: typeof base = async (x, ww, o) => { const r = await base(x, ww, o); reading = r?.reading ?? null; readMs = r?.ms ?? null; return r; };
      const s = Date.now();
      let screenAt: number | null = null, firstAt: number | null = null;
      const spoken: string[] = [];
      const steps: string[] = [];
      let out: RoundOut = null as never;
      for (let round = 0; round < 3; round++) {
        const body = RoundBody.parse({ turnId, round, text, state: STATE, turns: turns.slice(-6), stage: doc ? stageContext(doc) : null,
          stageDigest: doc ? stageDigest({ doc, back: [], views: {}, filter: null, narr: 0 }) : null, direct: null,
          heard: { lang: tamil(text) ? "ta" : "en", conf: 0.9, source: "whisper" } });
        out = await planRound(body, w, hands, "probe", undefined, undefined, {
          snapshot: () => districtSnapshot(), reader,
          emit: (e) => {
            if (e.type === "STATE_SNAPSHOT") screenAt ??= Date.now() - s;
            if (e.type === "TEXT_MESSAGE_CONTENT") { firstAt ??= Date.now() - s; spoken.push(e.delta); }
            if (e.type === "STEP_STARTED" && !("elapsedMs" in e && e.elapsedMs)) steps.push(e.stepName);
          }
        }).catch((e) => ({ done: true, result: null, lane: `error ${(e as Error).message}` }) as never);
        if (out.done) break;
      }
      const r = out.result;
      const rd = reading as Reading | null;
      const row = { session: name, said: text, reader: rd ? { ask: rd.ask, zones: rd.zones, place: rd.place, dept: rd.dept, topic: rd.topic, time: rd.time, cat: rd.cat, sev: rd.sev, period: rd.period, lenses: rd.lenses, about: rd.about, one: rd.one, request: rd.request, reply: rd.reply, ms: readMs } : null,
        lane: out.lane, note: r?.note ?? null, screen: r?.stage?.recipe ?? null, title: r?.stage?.title ?? null, when: r?.stage?.when?.en ?? null, blocks: (r?.stage?.blocks ?? []).map((b) => b.kind).join(","), model: r?.model ?? null,
        says: spoken.join(" ") || r?.say || r?.reply || null, screenMs: screenAt, firstSentenceMs: firstAt, totalMs: Date.now() - s, steps,
        kind: r?.kind ?? null, actions: (r?.steps ?? out.steps ?? []).map((x) => JSON.stringify(x).slice(0, 140)), stageOp: r?.stageOp ? JSON.stringify(r.stageOp).slice(0, 140) : null,
        options: (r?.options ?? []).map((x) => x.request).slice(0, 3) };
      rows.push(row);
      console.log(JSON.stringify(row, null, 1));
      // the browser's memory of the conversation: what was heard, the screen built, what was said
      turns.push({ heard: text, did: r?.stage ? r.stage.recipe : r?.kind ?? "none", recipe: r?.stage?.recipe ?? null, slots: (r?.stage?.slots as Record<string, unknown>) ?? null, result: (spoken.join(" ") || r?.say || r?.reply || "").slice(0, 200) || null });
      if (r?.stage) doc = r.stage;
    }
    fs.writeFileSync(outFile, JSON.stringify(rows, null, 1));
  }
  fs.writeFileSync(outFile, JSON.stringify(rows, null, 1));
}, 3_600_000);
