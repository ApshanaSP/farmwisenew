/**
 * v19 (25 Nov): the analyst asked questions nobody had asked before, through the console's whole server round (the reader, the analyst, the
 * records, the writer), on a dry-run copy of the store (read only), with the real models. Conversations carry their turns and the open screen,
 * so follow-ups are real follow-ups. Prints, per sentence: what was understood, the data request, the screen, what Jarvis says, the times.
 *   npx vitest run --config vitest.live.config.ts src/lib/thunai/v19/eval19.live.ts
 *   EVAL_SETS=log,follow   only those sets; EVAL_FILE=path   sets from a JSON file ({ name: sentences[] }); a set is one conversation unless
 *   its name starts with "_" (each sentence on its own); EVAL_NO_AI=1 answers with no model at all (the AI service busy)
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v18/durable.sqlite";
process.env.JARVIS_LIVE_CLAUDE = "1";
process.env.JARVIS_KEEPWARM = "0";
process.env.DISTRICT_IQ_JOBS = "off";
process.env.AI_PROVIDER = "none";
import fs from "node:fs";
import { it } from "vitest";
import { serverHands } from "../data";
import { clearCaches, planRound, RoundBody, type RoundOut } from "../round";
import { stageContext, type BlockT, type StageDocT } from "../stage";
import { stageDigest } from "../stagelocal";
import { serverWorld } from "../world";
import { districtSnapshot } from "../v11/snapshot";
import { readSentence, type Reading } from "../v16/reader";
import type { Turn } from "../plan";
import { makePlan, type Plan } from "./plan";

const SETS: Record<string, string[]> = {
  // the owner's own words, 25 Nov 09:23 to 09:28
  log: ["What are the seven severe events today?", "Which area is? Highly congested traffic.", "Tell me all.", "Tell me one area which is very congested now.", "Okay, tell me the. Second highest congested street now.",
    "top two area with most severe incidents last two two days.", "யா, மொத்தமா 5-ன்னு காமிக்குது. 2-ன்னு கேட்டா 2 மட்டும் கொண்டு வர மாதிரி பண்ணு.", "Which area has higher police complaints?", "Show me only the police incidents in Adyar for the last two days."],
  follow: ["Which department has the most cases past the deadline?", "And the second?", "Only in Anna Nagar.", "Show me those cases.", "What about the last week alone?"],
  _police: ["How many police incidents happened in Teynampet in the last 48 hours?", "police cases alone in velachery this week", "அடையாறுல கடந்த ரெண்டு நாள்ல நடந்த போலீஸ் சம்பவங்கள் மட்டும் காட்டு", "Which area has the third highest number of thefts this month?"],
  _rank: ["Which is the second worst zone for garbage complaints this week?", "Name the two zones with the fewest incidents in the last 7 days", "Which department takes the longest to close its cases?", "Top 4 localities for drainage problems this month",
    "Which day last week had the most incidents?", "At what time of day do most accidents happen?", "which ward road has most accident reports this month"],
  _traffic: ["Which road is third most congested right now?", "How many roads are jammed in Anna Nagar now?", "least congested area now", "What is the delay on Anna Salai?", "Give me the five worst jams in the city", "Which road was jammed the most yesterday?"],
  _env: ["Which area has the worst air right now?", "How full is Chembarambakkam lake?", "Second fullest lake?", "Which station got the most rain in the last two days?", "What is the temperature in Chennai now?", "cheapest vegetable in Anna Nagar market", "tomato price in KK Nagar", "which vegetable went up the most this week"],
  _count: ["How many people died in road accidents this month?", "Did severe incidents go up or down compared to last week?", "How many murders this month?", "how many complaints are still open in Kodambakkam", "any fire accidents today?", "how many cases did the corporation storm water department resolve this week"],
  _cmp: ["Compare police and fire incidents in the last 7 days", "Are there more severe cases in Adyar or Anna Nagar this week?", "day by day trend of dengue cases in the last 10 days", "what share of cases are handled by the police"],
  _ta: ["எந்த ஏரியால ரெண்டாவது அதிக குப்பை புகார் இருக்கு?", "இன்னைக்கு எத்தனை சிவியர் கேஸ்?", "மூணு பெரிய டிராஃபிக் ஜாம் சொல்லு", "நேத்து எத்தனை விபத்து நடந்துச்சு?", "Adyar la last 3 days la enna crime nadandhuchu"],
  _other: ["What is the population of Adyar?", "how much budget was spent on drains", "Go to the trends page", "Thank you Jarvis", "what is your name", "Brief me on today", "Give me the summary of Anna Nagar", "Where should I concentrate today?", "open the news", "schools near flooded streets in Velachery"]
};
const STATE = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const tamil = (s: string) => /[஀-௿]/.test(s);
const shown = (b: BlockT): string => b.kind === "Kpis" ? `Kpis[${b.items.map((x) => `${x.label}=${x.value}${x.prev != null ? ` (before ${x.prev})` : ""}`).join("; ")}]`
  : b.kind === "Ranking" ? `Ranking "${b.title}" [${b.items.slice(0, 8).map((x) => `#${x.rank} ${x.label}=${x.value}${x.sub ? ` (${x.sub})` : ""}`).join("; ")}${b.items.length > 8 ? `; +${b.items.length - 8}` : ""}]`
  : b.kind === "CaseList" ? `CaseList "${b.title}" ${b.rows.length}/${b.total} [${b.rows.slice(0, 3).map((r) => `${r.title.slice(0, 50)} | ${r.deptName} | ${r.zoneName} | ${r.sev} | ${r.t}`).join(" ;; ")}]`
  : b.kind === "Trend" ? `Trend "${b.title}" [${b.labels.map((l, i) => `${l}:${b.values[i]}`).slice(-12).join(" ")}]` : b.kind === "Chart" ? `Chart "${b.title}" [${b.labels.map((l, i) => `${l}:${b.values[i]}`).slice(0, 24).join(" ")}]`
  : b.kind === "NewsReader" ? `News "${b.title}" ${b.items.length}/${b.total}` : b.kind === "Note" ? `Note "${b.text}"` : b.kind === "MapView" ? `Map(${b.points.length}${b.shade ? `, shade ${b.shade.values.length}` : ""})` : b.kind;

it("v19 evaluation", async () => {
  const w = await serverWorld();
  const hands = serverHands({ email: "probe@local", role: "collector", lockDept: null });
  await districtSnapshot(30_000).catch(() => null);
  const all: Record<string, string[]> = process.env.EVAL_FILE ? JSON.parse(fs.readFileSync(process.env.EVAL_FILE, "utf8")) : SETS;
  const want = process.env.EVAL_SETS ? process.env.EVAL_SETS.split(",") : Object.keys(all);
  fs.mkdirSync("data/thunai/probe19", { recursive: true });
  const outFile = `data/thunai/probe19/run-${Date.now()}.json`;
  const rows: Record<string, unknown>[] = [];
  for (const name of want) {
    let turns: Turn[] = [];
    let doc: StageDocT | null = null;
    for (const text of all[name] ?? []) {
      if (name.startsWith("_")) { turns = []; doc = null; }
      await new Promise((r) => setTimeout(r, Number(process.env.EVAL_GAP_MS ?? 1200)));
      clearCaches();
      const turnId = `p19-${Math.random().toString(36).slice(2, 8)}`;
      let reading: Reading | null = null, plan: Plan | null = null, planMs: number | null = null, readMs: number | null = null;
      const base = readSentence(), mk = makePlan();
      const s = Date.now();
      let screenAt: number | null = null, firstAt: number | null = null;
      const spoken: string[] = [];
      let out: RoundOut = null as never;
      for (let round = 0; round < 3; round++) {
        const body = RoundBody.parse({ turnId, round, text, state: STATE, turns: turns.slice(-6), stage: doc ? stageContext(doc) : null,
          stageDigest: doc ? stageDigest({ doc, back: [], views: {}, filter: null, narr: 0 }) : null, direct: null, heard: { lang: tamil(text) ? "ta" : "en", conf: 0.9, source: "whisper" } });
        out = await planRound(body, w, hands, "probe", undefined, undefined, { snapshot: () => districtSnapshot(),
          reader: async (x, ww, o) => { if (process.env.EVAL_NO_AI === "1") return null; const r = await base(x, ww, o); reading = r?.reading ?? null; readMs = r?.ms ?? null; return r; },
          analyst: async (x, ww, o) => { if (process.env.EVAL_NO_AI === "1") return null; const r = await mk(x, ww, o); plan = r?.plan ?? null; planMs = r?.ms ?? null; return r; },
          ...(process.env.EVAL_NO_AI === "1" ? { llm: { generate: async () => { throw new Error("no model"); } }, aide: { rungs: () => [] } } : {}),
          emit: (e) => { if (e.type === "STATE_SNAPSHOT") screenAt ??= Date.now() - s; if (e.type === "TEXT_MESSAGE_CONTENT") { firstAt ??= Date.now() - s; spoken.push(e.delta); } }
        }).catch((e) => ({ done: true, result: null, lane: `error ${(e as Error).message}` }) as never);
        if (out.done) break;
      }
      const r = out.result;
      const p = plan as Plan | null, rd = reading as Reading | null;
      const says = spoken.join(" ") || r?.say || r?.reply || null;
      rows.push({ set: name, said: text, reader: rd?.ask, plan: p, lane: out.lane, note: r?.note, title: r?.stage?.title, recipe: r?.stage?.recipe, blocks: r?.stage?.blocks, says, screenAt, firstAt, planMs, readMs, totalMs: Date.now() - s });
      console.log([`\n[${name}] ${text}`, `  read ${rd?.ask ?? "-"} ${readMs ?? "-"}ms | plan ${p ? `${p.kind}${p.view ? `:${p.view}` : ""}` : "-"} ${planMs ?? "-"}ms | ${p?.understood ?? ""}`,
        ...(p?.queries ?? []).map((q) => `  q ${JSON.stringify(Object.fromEntries(Object.entries(q).filter(([, v]) => v != null && v !== false && !(Array.isArray(v) && !v.length))))}`),
        `  lane ${out.lane} ${r?.stage?.recipe ?? r?.kind ?? ""} | title: ${r?.stage?.title ?? "-"}${r?.stage?.when ? ` | when ${r.stage.when.en}` : ""}`, ...(r?.stage?.recipe === "ask" ? r.stage.blocks.map((b) => `    ${shown(b)}`) : []),
        ...(r?.stage?.notes.length ? [`    notes: ${r.stage.notes.join(" | ")}`] : []), `  SAYS: ${says}`, `  screen ${screenAt ?? "-"} first ${firstAt ?? "-"} total ${Date.now() - s} ms | voice ${r?.stage?.voice?.by ?? "-"}`].join("\n"));
      turns.push({ heard: text, did: r?.stage ? r.stage.recipe : r?.kind ?? "none", recipe: r?.stage?.recipe ?? null, slots: (r?.stage?.slots as Record<string, unknown>) ?? undefined, result: (says ?? "").slice(0, 200) });
      if (r?.stage) doc = r.stage;
    }
    fs.writeFileSync(outFile, JSON.stringify(rows, null, 1));
  }
}, 3_600_000);
