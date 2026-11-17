/**
 * v7: the answer layer's evaluation (docs/jarvis/JARVIS_V7.md part 2, section 4). On the console's own store (the dry-run copy, read only),
 * through the real round (lanes, planner, screens) and the real aide; Claude is never called in this build (JARVIS_CLAUDE_OFF=1 is forced).
 *   AIDE7=dry     SET=dev|holdout                 no model at all: each question's lane, screen and fact count, v7 and v6 (routing only)
 *   AIDE7=run     SET=dev|holdout TAG=<tag>       live: each question answered by v7 (the aide, on the free ladder) and by v6 (its own line for
 *                                                 the screen v6 builds, items read as v6 reads them); one file eval/v7/<set>/results/<tag>.json
 *   AIDE7=audit   SET=... TAG=...                 no model: every spoken sentence checked again against its facts, the rubric, the gold rules
 *   AIDE7=judge   SET=... TAG=... [JUDGE_MODEL]   a blind pairwise judge (a free model), v7 against v6, each pair in both orders; a win only
 *                                                 when both orders agree; the exact sign test
 *   AIDE7=gjudge  SET=... TAG=...                 an independent grounding judge (a free model of another family than the writer's): the claims
 *                                                 of each v7 answer its facts do not support
 * LIVE_GAP_MS (default 20000) between questions that called a model. The holdout's file hash is checked before it is run (eval/v7/HASHES.txt).
 *   AIDE7=run SET=dev TAG=v7dev1 LIVE_GAP_MS=20000 npx vitest run --config vitest.live.config.ts src/lib/thunai/aide7/eval7.live.ts
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-spec/durable.sqlite";
// this build never calls Claude: the owner tests it later
process.env.JARVIS_CLAUDE_OFF = "1";
process.env.AI_PROVIDER = "none";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { expect, it } from "vitest";
import { z } from "zod";
import { newsDoc } from "@/lib/collector/intel";
import { generateJson } from "@/lib/ai/gateway";
import { serverHands } from "../data";
import { ledger } from "../ledger";
import { groqOnly } from "../liverecord";
import { onLlmCall } from "../llm";
import { newsAsk } from "../newsask";
import { clearCaches, planRound, RoundBody, type RoundBodyT, type RoundDeps } from "../round";
import { stageContext, type StageDocT } from "../stage";
import { narrationOf, stageDigest, stageEmpty } from "../stagelocal";
import type { Lang } from "../types";
import { newsEvents, type NewsEvent, type StoredDoc } from "../web/serve";
import { serverWorld } from "../world";
import { checkSentence, type Fact7, type Sheet7 } from "./ground";
import { gazOf, type AideOut } from "./index";
import { newsAide } from "./news";
import type { Written } from "./writer";

groqOnly();
process.env.JARVIS_CLAUDE_OFF = "1";
const MODE = process.env.AIDE7 ?? "";
const SET = (process.env.SET ?? "dev") as "dev" | "holdout";
const TAG = process.env.TAG ?? "v7";
const GAP = Number(process.env.LIVE_GAP_MS ?? 20000);
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const DIR = path.resolve(process.cwd(), "eval", "v7", SET);
const OUT = path.join(DIR, "results", `${TAG}.json`);

type Kind = "incident" | "news" | "compare" | "why" | "followup" | "outside";
interface Item { id: string; kind: Kind; lang: "en" | "ta" | "tg"; text: string; before?: string; news?: number }
interface Answer { said: string[]; lane: string | null; recipe: string | null; note: string | null; by: string | null; model: string | null; gap: string | null; gapStatus: string | null;
  rejected: { text: string; problems: string[] }[]; firstMs: number | null; ms: number; tokens: number; calls: number; hops: string[]; facts: { id: string; src: string; text: string }[]; error?: string }
interface Row { id: string; kind: Kind; lang: string; text: string; before?: string; v7: Answer; v6: Answer; at: string }

const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => s.replace(/\r\n/g, "\n");

function items(): Item[] {
  const file = path.join(DIR, "set.json");
  const raw = norm(fs.readFileSync(file, "utf8"));
  if (SET === "holdout") {
    const want = fs.readFileSync(path.resolve(process.cwd(), "eval", "v7", "HASHES.txt"), "utf8").match(/^([0-9a-f]{64}) \*eval\/v7\/holdout\/set\.json$/m)?.[1];
    const got = createHash("sha256").update(raw).digest("hex");
    if (want !== got) throw new Error(`the holdout set changed since it was hashed (${got} != ${want})`);
  }
  const all = (JSON.parse(raw) as { items: Item[] }).items;
  return ONLY.length ? all.filter((x) => ONLY.includes(x.id)) : all;
}

const empty = (): Answer => ({ said: [], lane: null, recipe: null, note: null, by: null, model: null, gap: null, gapStatus: null, rejected: [], firstMs: null, ms: 0, tokens: 0, calls: 0, hops: [], facts: [] });
const factsOf = (s: Sheet7 | null) => (s?.facts ?? []).map((f: Fact7) => ({ id: f.id, src: f.src, text: f.text }));
const fromWritten = (a: Answer, w: Written | null, sheet: Sheet7 | null) => {
  if (!w) return a;
  return { ...a, by: w.by, model: w.model, gap: w.gap, rejected: w.rejected.map((r) => ({ text: r.text, problems: r.problems.map((p) => `${p.kind}: ${p.detail}`) })), firstMs: w.firstMs,
    tokens: a.tokens + w.tokens, calls: a.calls + w.calls, hops: [...a.hops, ...w.hops], facts: factsOf(sheet) };
};

/** what v6 said for a screen: its line, then (a news list or a brief) every item, as the browser read them */
const v6Spoken = (say: string | null, stage: StageDocT | null, lang: Lang): string[] => {
  const items = stage && stage.blocks.some((b) => b.kind === "NewsReader" || b.kind === "Brief") ? narrationOf(stage, lang).map((x) => x.text) : [];
  return [...(say ? [say] : []), ...items];
};

interface Ctx { world: Awaited<ReturnType<typeof serverWorld>>; hands: ReturnType<typeof serverHands>; news: { id: string; source: string | null; title: string }[] }

/** one turn through the real round; `v6`: JARVIS_ANSWER=v6 for it (no aide, no v7 lane) */
async function turn(c: Ctx, text: string, lang: Lang, v: "v6" | "v7", prior: { stage: StageDocT | null; turns: RoundBodyT["turns"] }, noModel: boolean): Promise<{ a: Answer; stage: StageDocT | null; say: string | null; aide: AideOut | null }> {
  process.env.JARVIS_ANSWER = v;
  let aide: AideOut | null = null, v6say: string | null = null, v6stage: StageDocT | null = null;
  const calls: { tokens: number; model: string | null }[] = [];
  const stop = onLlmCall((e) => calls.push({ tokens: e.tokens, model: e.model }));
  const t0 = Date.now();
  const stageCtx = prior.stage ? stageContext(prior.stage, null) : null;
  const digest = prior.stage ? stageDigest({ ...stageEmpty, doc: prior.stage }) : null;
  const body = RoundBody.parse({ turnId: `e${Date.now().toString(36)}`, round: 0, text, state: STATE, turns: prior.turns ?? [], stage: stageCtx, stageDigest: digest, direct: null, heard: { lang, conf: 0.95, source: "typed" } });
  const deps: RoundDeps = { onAide: (x, v6) => { aide = x; v6say = v6.say; v6stage = v6.stage; },
    ...(noModel ? { aide: { open: async () => { throw new Error("dry: no model"); }, rungs: () => [] }, llm: { generate: (async () => { throw new Error("dry: no model"); }) as never } } : {}) };
  try {
    const o = await planRound(body, c.world, c.hands, "eval:aide7", { notes: [], habits: {} }, undefined, deps);
    const r = o.result;
    const a: Answer = { ...empty(), said: r?.say ? [r.say] : r?.reply ? [r.reply] : [], lane: o.lane, recipe: r?.stage?.recipe ?? r?.kind ?? null, note: r?.note ?? null, ms: Date.now() - t0,
      tokens: calls.reduce((n, x) => n + x.tokens, 0), calls: calls.length, hops: calls.map((x) => x.model ?? "none") };
    const got = aide as AideOut | null;
    if (got) return { a: { ...fromWritten(a, got.written, got.sheet), said: [...got.written.sentences, ...(got.gap?.said ?? [])], gapStatus: got.gap?.status ?? null }, stage: r?.stage ?? null, say: r?.say ?? null, aide: got };
    // v6 (or a turn the aide did not answer): its line and the items v6 reads
    return { a: { ...a, said: v6Spoken(r?.say ?? r?.reply ?? null, r?.stage ?? null, (r?.lang ?? "en") as Lang) }, stage: r?.stage ?? null, say: r?.say ?? null, aide: null };
  } catch (e) {
    return { a: { ...empty(), error: (e as Error).message.slice(0, 200), ms: Date.now() - t0 }, stage: null, say: null, aide: null };
  } finally {
    stop();
    void v6say; void v6stage;
  }
}

/** a news item on screen: v7 reads it through the news route with the aide; v6 as v6 read it (its own reading of the sentence) */
async function newsTurn(c: Ctx, it: Item, lang: Lang, v: "v6" | "v7", noModel: boolean): Promise<Answer> {
  const on = { items: c.news.map((x) => ({ id: x.id, source: x.source, title: x.title })), reading: c.news[it.news ?? 0]?.id ?? null };
  const na = newsAsk(it.text, on, { v7: v === "v7" });
  if (!na || na.kind !== "read") {
    // v6 did not read it as a request to read a report: the agent's answer, with the news list on screen as context
    const doc: StageDocT = { v: 1, id: "news-on-screen", recipe: "news", title: "News · this week", takeaway: null, say: { en: "", ta: "" }, scope: { period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null }, slots: {}, sources: [], asOf: null, notes: [],
      blocks: [{ kind: "NewsReader", id: "news", title: "News · this week", total: c.news.length, items: c.news.slice(0, 12).map((x) => ({ id: x.id, title: x.title, source: x.source, t: null, place: null, incidentId: null, url: null })) }] };
    return (await turn(c, it.text, lang, v, { stage: doc, turns: [] }, noModel)).a;
  }
  const t0 = Date.now();
  let w: Written | null = null, sheet: Sheet7 | null = null;
  const aide = v === "v7" && !noModel ? newsAide(c.world, { user: "eval:aide7", onDone: (x, s) => { w = x; sheet = s; } }) : undefined;
  const ev: NewsEvent[] = [];
  for await (const e of newsEvents({ ...na.body, ...(v === "v7" ? { ask: { q: it.text, lang } } : {}) } as never, { loadDoc: (id) => newsDoc(id) as Promise<StoredDoc | null>, related: false, user: "eval:aide7", aide })) ev.push(e);
  const briefs = ev.filter((e): e is Extract<NewsEvent, { type: "brief" }> => e.type === "brief");
  const last = briefs.at(-1)?.brief;
  const a: Answer = { ...empty(), said: last ? last[lang] : [], lane: "news", recipe: "news-read", ms: Date.now() - t0 };
  return fromWritten(a, w, sheet);
}

async function context(): Promise<Ctx> {
  const world = await serverWorld();
  const hands = serverHands({ email: "eval:aide7", role: "collector", lockDept: null });
  const r = await hands.news({ period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null });
  const news = r.rows.map((x) => ({ id: String(x.id), source: ((x.outletNames as string[] | undefined) ?? [])[0] ?? (x.publisher as string | null) ?? null, title: String(x.title ?? "") }));
  return { world, hands, news };
}
const langOf = (l: Item["lang"]): Lang => (l === "en" ? "en" : "ta");

async function answer(c: Ctx, it: Item, v: "v6" | "v7", noModel: boolean): Promise<Answer> {
  const lang = langOf(it.lang);
  clearCaches();
  if (it.kind === "news" && it.news != null) return newsTurn(c, it, lang, v, noModel);
  let prior: { stage: StageDocT | null; turns: RoundBodyT["turns"] } = { stage: null, turns: [] };
  if (it.before) {
    // the earlier turn as the browser would have it: its screen open, and the turn remembered (its words never cost a writer call here)
    const b = await turn(c, it.before, lang, v, prior, true);
    prior = { stage: b.stage, turns: [{ heard: it.before, did: b.stage ? `showed a ${b.stage.recipe} screen` : "answered", recipe: b.stage?.recipe ?? null, slots: (b.stage?.slots ?? null) as never, result: b.say ? b.say.slice(0, 200) : null }] };
  }
  return (await turn(c, it.text, lang, v, prior, noModel)).a;
}

function save(rows: Row[]) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ set: SET, tag: TAG, at: new Date().toISOString(), rows }, null, 1));
}

it.runIf(MODE === "dry")("dry: lanes, screens and facts without any model", async () => {
  const c = await context();
  for (const it of items()) {
    const v7 = await answer(c, it, "v7", true);
    const v6 = await answer(c, it, "v6", true);
    console.log(`${it.id.padEnd(10)} v7 ${String(v7.lane).padEnd(7)} ${String(v7.recipe).padEnd(11)} facts ${String(v7.facts.length).padStart(2)} | v6 ${String(v6.lane).padEnd(7)} ${String(v6.recipe).padEnd(11)} ${v7.error ?? ""}${v6.error ?? ""}`);
  }
  expect(true).toBe(true);
});

it.runIf(MODE === "run")("run: v7 and v6 answers, live on the free ladder", async () => {
  const left = (m: string) => { const r = ledger().room("groq", m, { tokens: 1 }); return Math.min(r.left.tpd, 200_000); };
  const groqLeft = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"].reduce((n, m) => n + left(m), 0);
  const list = items();
  console.log(`[aide7] ${SET} ${list.length} questions; Groq left today about ${groqLeft} tokens`);
  // a smoke test of at most three questions may run on Gemini flash-lite alone (the ladder's last rung) when Groq's day is spent
  const lite = ledger().room("gemini", "gemini-3.5-flash-lite", { tokens: 2500 }).ok;
  if (groqLeft < list.length * 2500 && !(list.length <= 3 && lite)) throw new Error(`not enough Groq allowance for ${list.length} questions (${groqLeft} left): never fill a run with an estimate`);
  if (groqLeft < list.length * 2500) console.log("[aide7] a smoke test on Gemini flash-lite (Groq's day is spent): not a measurement");
  const c = await context();
  const rows: Row[] = fs.existsSync(OUT) ? (JSON.parse(fs.readFileSync(OUT, "utf8")) as { rows: Row[] }).rows.filter((r) => !list.some((x) => x.id === r.id)) : [];
  // V6=all: v6 answered live too (its planner turns cost Groq); V6=code: v6 only where its answer is code's (no model; its planner turns are left
  // out of the comparison); V6_FROM=<tag>: v6's answers taken from an earlier run of the same set (v6 does not change)
  const v6mode = process.env.V6 ?? "all";
  const earlier = process.env.V6_FROM ? new Map((JSON.parse(fs.readFileSync(path.join(DIR, "results", `${process.env.V6_FROM}.json`), "utf8")) as { rows: Row[] }).rows.map((r) => [r.id, r.v6])) : null;
  for (const it of list) {
    const v7 = await answer(c, it, "v7", false);
    let v6 = earlier?.get(it.id) ?? null;
    if (!v6) {
      v6 = await answer(c, it, "v6", v6mode === "code");
      if (v6mode === "code" && (v6.lane === "no-model" || v6.lane === "general" || v6.error)) v6 = { ...empty(), lane: v6.lane, error: "skipped: v6 needs a model here (V6=code)" };
    }
    rows.push({ id: it.id, kind: it.kind, lang: it.lang, text: it.text, before: it.before, v7, v6, at: new Date().toISOString() });
    save(rows);
    console.log(`[aide7] ${it.id} v7 ${v7.by ?? "-"} ${v7.model ?? "-"} hops ${v7.hops.join(">") || "-"} first ${v7.firstMs ?? "-"} ms, ${v7.said.length} sentences, ${v7.rejected.length} rejected${v7.gap ? `, gap "${v7.gap}" ${v7.gapStatus}` : ""}${v7.error ? ` ERROR ${v7.error}` : ""} | v6 ${v6.said.length} lines`);
    if (v7.calls + v6.calls > 0) await sleep(GAP);
  }
  expect(rows.length).toBeGreaterThan(0);
});

// ------------------------------------------------------------------ audit, no model --

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
it.runIf(MODE === "audit")("audit: every sentence again, the rubric and the gold rules", async () => {
  const c = await context();
  const gaz = gazOf(c.world);
  const rows = (JSON.parse(fs.readFileSync(OUT, "utf8")) as { rows: Row[] }).rows;
  const out: Record<string, unknown>[] = [];
  const tally = { n: 0, model: 0, fallback: 0, grounded: 0, sentences: 0, failedAgain: 0, lists: 0, over4: 0, wordsP50: 0, outside: { n: 0, abstained: 0, found: 0, hallucinated: 0 }, readsScreen: 0, v6Lines: 0 };
  const allWords: number[] = [];
  for (const r of rows) {
    const lang = langOf(r.lang as Item["lang"]);
    const sheet: Sheet7 = { facts: r.v7.facts.map((f) => ({ id: f.id, src: f.src, text: f.text })), lang, gaz, shown: [] };
    tally.n++;
    if (r.v7.by === "model") tally.model++; else if (r.v7.by === "fallback") tally.fallback++;
    // the checker again, on every sentence the model wrote and was said (the fallback is the recipe's own line, code-written: not re-checked)
    let bad = 0;
    if (r.v7.by === "model") for (const s of r.v7.said) {
      if (/^Nothing in the dashboard|டாஷ்போர்டிலும் இன்றைய செய்திகளிலும்/u.test(s)) continue;
      tally.sentences++;
      // the sentence was said without its fact marks: checked against every fact (a looser test than the live one, which binds to the cited facts)
      const ids = sheet.facts.map((f) => f.id).join(",");
      const k = checkSentence(`${s} [${ids}]`, sheet);
      const real = k.problems.filter((p) => !["copy", "list", "length", "uncited"].includes(p.kind));
      if (real.length) { bad++; out.push({ id: r.id, sentence: s, problems: real.map((p) => `${p.kind}: ${p.detail}`) }); }
    }
    if (!bad) tally.grounded++; else tally.failedAgain++;
    const all = r.v7.said.join(" ");
    allWords.push(words(all));
    if (r.v7.said.length > 4) tally.over4++;
    if (r.kind === "outside") {
      tally.outside.n++;
      if (r.v7.gapStatus === "ok") tally.outside.found++;
      else if (r.v7.gapStatus === "nothing" || /^Nothing in the dashboard|எதுவும் இல்லை/u.test(all)) tally.outside.abstained++;
    }
    tally.v6Lines += r.v6.said.length;
  }
  allWords.sort((a, b) => a - b);
  tally.wordsP50 = allWords[Math.floor(allWords.length / 2)] ?? 0;
  const file = OUT.replace(/\.json$/, ".audit.json");
  fs.writeFileSync(file, JSON.stringify({ tally, problems: out }, null, 1));
  console.log(JSON.stringify(tally, null, 1));
  for (const p of out.slice(0, 40)) console.log(JSON.stringify(p));
});

// ------------------------------------------------------------------ judges, free models --

const Verdict = z.object({ reason: z.string(), winner: z.enum(["A", "B", "tie"]) });
const JUDGE_SYSTEM = `You compare two spoken answers given by a voice aide to the District Collector of Chennai, who is looking at a screen that already shows the details. You see the question, the facts the answers were meant to use, and two answers, A and B. Decide which the Collector would rather hear. Judge in this order: (1) accuracy: anything the facts do not support counts against an answer; (2) it answers the question asked; (3) it gives the point first and what matters (what happened, why it matters, what is being done or is stuck, what needs the Collector) rather than reading out the screen or a list; (4) it is short and natural to listen to. Length alone is not a reason. A Tamil answer is judged as spoken Tamil. Reply as JSON: {"reason": "<one sentence>", "winner": "A" | "B" | "tie"}.`;
const rng = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
/** exact two-sided sign test on the non-ties */
const signP = (w: number, l: number) => { const n = w + l; if (!n) return 1; const k = Math.min(w, l); let p = 0; let c = 1; for (let i = 0; i <= n; i++) { if (i > 0) c = (c * (n - i + 1)) / i; if (i <= k) p += c; } return Math.min(1, (2 * p) / 2 ** n); };

it.runIf(MODE === "judge")("judge: blind pairwise, both orders, v7 against v6", async () => {
  const model = process.env.JUDGE_MODEL ?? "gemini-3.5-flash-lite";
  const provider = (process.env.JUDGE_PROVIDER ?? "gemini") as "gemini" | "groq";
  const doc = JSON.parse(fs.readFileSync(OUT, "utf8")) as { rows: Row[] };
  const r = rng(20261117);
  const tally = { v7: 0, v6: 0, tie: 0, split: 0, none: 0 };
  const verdicts: Record<string, unknown>[] = [];
  for (const row of doc.rows) {
    const v7 = row.v7.said.join(" ").trim(), v6 = row.v6.said.join(" ").trim();
    if (!v7 || !v6) { tally.none++; continue; }
    const facts = row.v7.facts.slice(0, 24).map((f) => `${f.id} [${f.src}] ${f.text}`).join("\n").slice(0, 5000);
    const order: ("v7" | "v6")[] = r() < 0.5 ? ["v7", "v6"] : ["v6", "v7"];
    const ask = async (first: "v7" | "v6"): Promise<"v7" | "v6" | "tie" | null> => {
      const A = first === "v7" ? v7 : v6, B = first === "v7" ? v6 : v7;
      const prompt = `QUESTION: ${row.text}${row.before ? `\n(EARLIER: ${row.before})` : ""}\nLANGUAGE: ${row.lang === "en" ? "English" : "Tamil"}\nFACTS:\n${facts}\n\nANSWER A:\n${A.slice(0, 2500)}\n\nANSWER B:\n${B.slice(0, 2500)}`;
      try {
        const res = await generateJson({ role: "fast", name: "aide_judge", schema: Verdict, system: JUDGE_SYSTEM, prompt, temperature: 0, maxOutputTokens: 200, user: "eval", lane: "eval", timeoutMs: 25_000, only: { provider, models: [model] } });
        ledger().record(provider, model, { tokens: res.info.inputTokens + res.info.outputTokens, lane: "eval" });
        const w = res.object.winner;
        return w === "tie" ? "tie" : (w === "A") === (first === "v7") ? "v7" : "v6";
      } catch { return null; } finally { await sleep(Number(process.env.JUDGE_GAP_MS ?? 7000)); }
    };
    const a = await ask(order[0]), b = await ask(order[1]);
    const verdict = a == null || b == null ? "none" : a === b ? a : "split";
    if (verdict === "v7") tally.v7++; else if (verdict === "v6") tally.v6++; else if (verdict === "tie") tally.tie++; else if (verdict === "split") tally.split++; else tally.none++;
    verdicts.push({ id: row.id, kind: row.kind, lang: row.lang, first: a, second: b, verdict, words: { v7: words(v7), v6: words(v6) } });
    console.log(`[judge] ${row.id} ${a}/${b} -> ${verdict}`);
  }
  const p = signP(tally.v7, tally.v6);
  fs.writeFileSync(OUT.replace(/\.json$/, `.judge-${model}.json`), JSON.stringify({ model, provider, tally, signTestP: p, verdicts }, null, 1));
  console.log(JSON.stringify({ model, tally, signTestP: p }));
});

const Unsupported = z.object({ unsupported: z.array(z.string()) });
const GJUDGE_SYSTEM = `You check a spoken answer against the facts it was written from. List every claim in the ANSWER that the FACTS do not support: a figure, a name, a place, a time, a cause, a comparison, an event, a recommendation stated as fact. A claim that restates a fact in other words, rounds a figure with "about", or suggests an action is supported. A sentence saying the dashboard or the news has nothing on something is supported. Reply as JSON: {"unsupported": ["<claim>", ...]} with an empty list when everything is supported.`;
it.runIf(MODE === "gjudge")("grounding judge: claims the facts do not support", async () => {
  const model = process.env.JUDGE_MODEL ?? "gemini-3.5-flash-lite";
  const provider = (process.env.JUDGE_PROVIDER ?? "gemini") as "gemini" | "groq";
  const doc = JSON.parse(fs.readFileSync(OUT, "utf8")) as { rows: Row[] };
  const res: Record<string, unknown>[] = [];
  let clean = 0, flagged = 0, none = 0;
  for (const row of doc.rows) {
    const said = row.v7.said.join(" ").trim();
    if (!said) { none++; continue; }
    const facts = row.v7.facts.map((f) => `${f.id} [${f.src}] ${f.text}`).join("\n").slice(0, 6000);
    try {
      const r = await generateJson({ role: "fast", name: "aide_ground_judge", schema: Unsupported, system: GJUDGE_SYSTEM, prompt: `FACTS:\n${facts || "(none)"}\n\nANSWER:\n${said}`, temperature: 0, maxOutputTokens: 300, user: "eval", lane: "eval", timeoutMs: 25_000, only: { provider, models: [model] } });
      ledger().record(provider, model, { tokens: r.info.inputTokens + r.info.outputTokens, lane: "eval" });
      if (r.object.unsupported.length) flagged++; else clean++;
      res.push({ id: row.id, by: row.v7.by, unsupported: r.object.unsupported });
      console.log(`[gjudge] ${row.id} ${r.object.unsupported.length ? `FLAGGED ${JSON.stringify(r.object.unsupported)}` : "clean"}`);
    } catch (e) { none++; res.push({ id: row.id, error: (e as Error).message.slice(0, 120) }); }
    await sleep(Number(process.env.JUDGE_GAP_MS ?? 7000));
  }
  fs.writeFileSync(OUT.replace(/\.json$/, `.gjudge-${model}.json`), JSON.stringify({ model, clean, flagged, none, rows: res }, null, 1));
  console.log(JSON.stringify({ model, clean, flagged, none }));
});
