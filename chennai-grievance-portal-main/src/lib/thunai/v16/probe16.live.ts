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
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v11/durable.sqlite";
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
import { readSentence, type Reading } from "./reader";
import type { Turn } from "../plan";

const SESSIONS: Record<string, string[]> = {
  // the owner's own morning of 22 Nov, 11:53-11:56, in order
  A: ["Tell me about today's news headlines.", "Show me all the severe cases today.", "Which I should concentrate first?", "Which incident I should concentrate first?",
    "Okay, tell me about the incident alone which I should concentrate first.",
    "அலந்தூர் and அடையார்ல இருக்கிற incidents எல்லாம் compare பண்ணு. எதுக்கு நான் நிறைய concentrate பண்ணனும்னு சொல்லு.", "What are my tasks to do today?"],
  // the owner's night of 21-22 Nov
  B: ["Okay now which area I have to concentrate most?", "எந்த area-லாம் இப்போ improve ஆகிட்டு வருது?", "எந்த road-ல பிரச்சனை திரும்பத் திரும்ப வந்துகிட்டே இருக்கு?",
    "Where most of the violent crime cases are arising?", "Compare Adyar and Alandur violent crime cases over a week.", "Now do the same for this month.", "Why did you stop now?",
    "எந்த area-ல கொலை நிறைய நடக்குது?", "எப்படி பேசுற?", "எந்த area-ல நிறைய cases இருக்கு, நிறைய worst ஆகிட்டே வருது?"],
  // hard questions nobody wrote a rule for
  C: ["Is flooding getting worse in Velachery?", "Between Anna Nagar, Ambattur and Teynampet, where should I spend my time this week?", "Which kinds of complaints are rising this month?",
    "Has Royapuram improved compared to last month?", "Which zone improved the most in the last three months and why?", "I'm going to Adyar tomorrow, what should I focus on there?",
    "Don't show me areas, just tell me the single most urgent case right now.", "Are things getting better or worse overall compared to last month?",
    "Garbage is my priority this week. Where is it worst?", "Which department is falling behind the most?"],
  // Tanglish follow-up chains: each sentence leans on the last answer
  E: ["Adyar la enna problem adhigama irukku?", "Perungudi oda compare pannu.", "Rendu la edhu worse aagudhu?", "Andha area la mudhalla enna case paakanum?",
    "What changed since yesterday?", "How many dengue cases this month?", "And in Royapuram?"],
  // navigation, the city, small talk, context
  D: ["Go to the trends page.", "Show live traffic on the map.", "Which road is the most congested right now?", "What's the air quality today?", "Thank you Jarvis.",
    "அடையாறு பகுதியில இப்போ நிலைமை எப்படி?", "அங்க எது முதல்ல கவனிக்கணும்?"]
};
const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const tamil = (s: string) => /[஀-௿]/.test(s);

it("v16 probe", async () => {
  const w = await serverWorld();
  const hands = serverHands({ email: "probe@local", role: "collector", lockDept: null });
  let snap = await districtSnapshot(60_000);
  for (let i = 0; snap && snap.parts.length < 11 && i < 30; i++) { await new Promise((r) => setTimeout(r, 2000)); snap = await districtSnapshot(); }
  console.log(`[snapshot] ${snap?.parts.length ?? 0} parts`);
  // PROBE_FILE: sessions from a JSON file ({ name: sentences[] }), e.g. the owner's whole history (replay-sessions.json)
  const all: Record<string, string[]> = process.env.PROBE_FILE ? JSON.parse(fs.readFileSync(process.env.PROBE_FILE, "utf8")) : SESSIONS;
  const want = process.env.PROBE_SESSIONS ? process.env.PROBE_SESSIONS.split(",") : Object.keys(all);
  const outFile = `data/thunai/probe16/run-${Date.now()}.json`;
  fs.mkdirSync("data/thunai/probe16", { recursive: true });
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
      const row = { session: name, said: text, reader: rd ? { ask: rd.ask, zones: rd.zones, cat: rd.cat, sev: rd.sev, period: rd.period, lenses: rd.lenses, about: rd.about, one: rd.one, request: rd.request, reply: rd.reply, ms: readMs } : null,
        lane: out.lane, note: r?.note ?? null, screen: r?.stage?.recipe ?? null, title: r?.stage?.title ?? null, model: r?.model ?? null,
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
