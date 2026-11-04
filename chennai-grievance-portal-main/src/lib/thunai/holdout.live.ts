/**
 * The held-out runs, on the frozen sets in eval/holdout (data from fake hands, so only understanding is measured).
 *   HOLDOUT=rules    all 150 through rules and router, no model
 *   HOLDOUT=planner  the frozen sample through the planner (HOLDOUT_SET=baseline20|final40); checks the ledger first and
 *                    refuses to start a run that cannot finish; a 429 is a capacity failure, not a wrong answer
 * Results go to eval/holdout/results/<HOLDOUT_TAG>-<mode>.json. Run with:
 *   set HOLDOUT=rules&& npx vitest run --config vitest.live.config.ts src/lib/thunai/holdout.live.ts
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { expect, it } from "vitest";
import { z } from "zod";
import { generateJson } from "@/lib/ai/gateway";
import { callLlm } from "./llm";
import { AgentPlanLenient, AgentPlanSchema, runThunaiAgent, type AgentResult } from "./agent";
import { START, WORLD } from "./fixture";
import { byLang, goldIntent, type HoldoutItem, type Scored } from "./holdout";
import { ledger } from "./ledger";
import { ZONE_TA_NAME } from "./lexicon";
import { isPlainMove } from "./plan";
import { offTopic, quickScreen } from "./quick";
import { fakeHands } from "./stagefake";
import { understand } from "./understand";
import { referenceWorld } from "./world";
import { addressed } from "./addressed";
import { BUNDLE_SERVES, ruleIntent } from "./rules";
import { clearCaches, planRound, RoundBody } from "./round";
import { districtNounIn } from "./quick";
import { resolveFrame } from "./frame";
import type { StageContext } from "./stage";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
// HOLDOUT_DIR=holdout2 is the set frozen on 4 Nov 2026 after eval/holdout had been read; a run refuses it if a hash has changed
const SET_DIR = process.env.HOLDOUT_DIR ?? "holdout";
const DIR = path.join(process.cwd(), "eval", SET_DIR);
if (SET_DIR !== "holdout") for (const line of fs.readFileSync(path.join(DIR, "HASHES.txt"), "utf8").trim().split(/\r?\n/)) {
  const [hash, rel] = line.split(" *");
  // git may change the line endings on checkout: the hash is of the text
  const now = crypto.createHash("sha256").update(fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n")).digest("hex");
  if (now !== hash) throw new Error(`${rel} no longer matches its frozen hash`);
}
const items = () => fs.readFileSync(path.join(DIR, "understanding.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as HoldoutItem);
/** right and wrong per lane: what a report may look at without opening the rows of a set still held out */
const byLane = (rows: (Scored & { lane: string })[]) => Object.fromEntries([...new Set(rows.map((r) => r.lane))].map((l) => { const x = rows.filter((r) => r.lane === l); return [l, { n: x.length, right: x.filter((r) => r.ok).length }]; }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TAG = process.env.HOLDOUT_TAG || "baseline";
const write = (name: string, data: unknown) => { fs.mkdirSync(path.join(DIR, "results"), { recursive: true }); fs.writeFileSync(path.join(DIR, "results", `${TAG}-${name}.json`), JSON.stringify(data, null, 1)); };

/** what the code alone makes of a sentence on main: the off-topic wall, the fast lane, the rules. null: left to the planner */
function rulesIntent(text: string): string | null {
  if (offTopic(text, world)) return "general";
  const q = quickScreen(text, world);
  if (q) return q.recipe;
  const r = understand(text, START, world, { speechConf: 0.95 });
  if (r.kind === "refuse") return "refuse";
  if (r.kind === "do" && r.steps.some((s) => s.a === "workspace" || s.a === "remember")) return "save";
  if (r.kind === "do" && r.confidence >= 0.9 && isPlainMove(r.steps)) return "navigate";
  return null;
}

/** the intent a planner result carries */
function resultIntent(r: AgentResult): string {
  if (r.kind === "refuse") return "refuse";
  if (r.kind === "chat") return "chat";
  if (r.kind === "clarify") return "clarify";
  if (r.stage) return r.stage.recipe === "answer" ? "answer" : r.stage.recipe;
  if (r.stageOp) return r.stageOp.op === "save" || r.stageOp.op === "pin" ? "save" : "stage_op";
  if (r.steps.some((s) => s.a === "workspace" || s.a === "remember")) return "save";
  if (r.steps.length) return "navigate";
  return "none";
}

/** "answer" (a looked-up reply) is right for the owner's intents a recipe does not name */
const SAME: Record<string, string[]> = { insight: ["insight", "answer", "why", "ranking", "trend"], complete: ["complete", "answer"], general: ["general", "chat", "refuse"], case: ["case", "stage_op"], stage_op: ["stage_op", "case"] };
const matches = (gold: string, got: string) => got === gold || (SAME[gold] ?? []).includes(got);

const mode = process.env.HOLDOUT ?? "rules";

it.runIf(mode === "rules")("rules on all 150", () => {
  const rows: Scored[] = items().map((x) => {
    const gold = goldIntent(x), got = rulesIntent(x.text);
    return { id: x.id, lang: x.lang, gold, got: got ?? "defer", ok: !!got && matches(gold, got), deferred: !got };
  });
  const t = byLang(rows);
  write("rules", { at: new Date().toISOString(), summary: t, rows });
  console.log(JSON.stringify(t));
  expect(rows.length).toBe(150);
});

it.runIf(mode === "planner")("the planner on the frozen sample", async () => {
  const which = (process.env.HOLDOUT_SET ?? "baseline20") as "baseline20" | "final40";
  const ids = JSON.parse(fs.readFileSync(path.join(DIR, "planner40.json"), "utf8"))[which] as string[];
  const all = items();
  const set = ids.map((id) => all.find((x) => x.id === id)!);
  const models = ["qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b"];
  // a run that cannot finish is not started: about 5K tokens a sentence on main, against what is left of the day
  const left = models.reduce((a, m) => a + Math.max(0, ledger().room("groq", m).left.tpd), 0);
  if (left < set.length * 5000) { write(`planner-${which}`, { refused: true, left }); console.log(`not started: ${left} tokens left`); return; }
  const gap = Number(process.env.LIVE_GAP_MS ?? 25_000);
  const rows: (Scored & { model: string | null; ms: number; note: string | null })[] = [];
  const replies: unknown[] = [];
  for (const x of set) {
    const gold = goldIntent(x);
    let tokens = 0;
    const turns = x.after ? [{ heard: x.after, did: `showed a screen for: ${x.after.slice(0, 80)}` }] : [];
    const r = await runThunaiAgent({ text: x.text, state: { ...START, now: Date.now() }, ctx: { turns, notes: [], habits: {}, now: Date.now() }, stage: null }, {
      world, hands: fakeHands(),
      llm: async (system, prompt, round, timeoutMs) => {
        const res = await generateJson({ role: "reasoning", name: `thunai_agent${round}`, schema: AgentPlanSchema, lenient: AgentPlanLenient, system, prompt, temperature: 0, maxOutputTokens: 1100,
          user: "holdout", prefer: "groq", timeoutMs, first: models, lane: "eval" });
        tokens += res.info.inputTokens + res.info.outputTokens;
        replies.push({ id: x.id, round, model: res.info.model, tokens: res.info.inputTokens + res.info.outputTokens, plan: res.object });
        return { plan: res.object, model: res.info.model };
      }
    }).catch(() => null);
    const capacity = !r || (r.kind === "none" && r.note === "model");
    const got = r ? resultIntent(r) : "error";
    rows.push({ id: x.id, lang: x.lang, gold, got, ok: !capacity && matches(gold, got), deferred: false, capacity, model: r?.model ?? null, ms: r?.ms ?? 0, note: r?.note ?? null });
    console.log(x.id, gold, "->", got, capacity ? "(capacity)" : "", tokens, "tokens");
    await sleep(gap);
  }
  const summary = byLang(rows);
  write(`planner-${which}`, { at: new Date().toISOString(), summary, rows });
  fs.mkdirSync(path.join(DIR, "recorded"), { recursive: true });
  fs.writeFileSync(path.join(DIR, "recorded", `${TAG}-${which}.jsonl`), replies.map((x) => JSON.stringify(x)).join("\n") + "\n");
  console.log(JSON.stringify(summary));
});

// ------------------------------------------------------------------ the final pipeline --

const FINAL = process.env.HOLDOUT_TAG === "final" || process.env.HOLDOUT_FINAL === "1";
// a general question is answered as chat, which is what its lane is for; the lane's "cannot reason" line is not an answer (see planner2)
const MATCH: Record<string, string[]> = { ...SAME, insight: ["insight", "why", "ranking", "trend", "answer"], complete: ["complete"], general: ["general", "chat"], refuse: ["refuse"], followup: [] };
const hits = (gold: string, got: string) => got === gold || (MATCH[gold] ?? []).includes(got);

it.runIf(mode === "rules2")("rules and router on all 150, the shipped pipeline: strict, and with a correct hand-off to the planner", () => {
  const rows: (Scored & { lane: string; bundle: string | null; routed: boolean })[] = items().map((x) => {
    const gold = goldIntent(x);
    const r = ruleIntent(x.text, world, START, { after: x.after ?? null });
    const ok = !!r.intent && hits(gold, r.intent);
    const routed = (!r.intent && !!r.bundle && (BUNDLE_SERVES[r.bundle] ?? []).includes(gold)) || (r.lane === "router" && gold === "general");
    return { id: x.id, lang: x.lang, gold, got: r.intent ?? `defer:${r.bundle}`, ok, deferred: !r.intent, lane: r.lane, bundle: r.bundle, routed };
  });
  const strict = byLang(rows);
  const lenient = byLang(rows.map((r) => ({ ...r, ok: r.ok || r.routed })));
  write("rules", { at: new Date().toISOString(), note: "strict: code alone names the intent. with hand-off: or it goes to the planner with a prompt bundle that can serve the intent", strict, withHandOff: lenient, rows });
  console.log(JSON.stringify({ strict: strict.all, handoff: lenient.all, en: lenient.en, ta: lenient.ta, tanglish: lenient.tanglish, byLane: byLane(rows.map((r) => ({ ...r, ok: r.ok || r.routed }))) }));
  expect(rows.length).toBe(items().length);
});

it.runIf(mode === "ambient")("the address gate on 40 side conversations and 40 unnamed commands", () => {
  const rows = fs.readFileSync(path.join(DIR, "ambient.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { id: string; text: string; lang: string; kind: "side" | "command" });
  const out = rows.map((x) => {
    const q = quickScreen(x.text, world);
    const u = q ? null : understand(x.text, START, world, { speechConf: 0.95 });
    const g = addressed({ text: x.text, lastTurnAt: null, now: Date.now(), rulesSure: !!q || (u?.kind === "do" && u.confidence >= 0.85), districtNoun: districtNounIn(x.text, world) });
    return { id: x.id, kind: x.kind, lang: x.lang, act: g.act, tier: g.tier, why: g.why };
  });
  const side = out.filter((x) => x.kind === "side"), cmd = out.filter((x) => x.kind === "command");
  const summary = { sideFalseActs: side.filter((x) => x.act).length, sideN: side.length, sideLevelBC: side.filter((x) => x.act && x.tier !== 3).length, commandsAccepted: cmd.filter((x) => x.act).length, commandsN: cmd.length,
    byLang: Object.fromEntries(["en", "ta", "tanglish"].map((l) => [l, { sideFalseActs: side.filter((x) => x.lang === l && x.act).length, side: side.filter((x) => x.lang === l).length, accepted: cmd.filter((x) => x.lang === l && x.act).length, commands: cmd.filter((x) => x.lang === l).length }])) };
  write("ambient", { at: new Date().toISOString(), summary, rows: out });
  console.log(JSON.stringify(summary));
  expect(summary.sideLevelBC).toBe(0);
});

// a trial, not the shipped gate: would a small model, asked only about what the rules would already act on, cut the false acts? It can
// only say no, so it can never let in more than the rules do, and an ambient sentence the rules ignore never reaches it
const GATE_SYSTEM = `People are talking in the office of the Chennai District Collector, where a voice assistant runs a civic console (incidents, complaints, news, rain, reservoirs, air, prices, departments). One sentence was overheard, in English, Tamil or Tanglish, with no earlier context. Was it a request for the console to show or do something (yes), or people talking to each other, about their day, or a remark about work (no)? Reply as JSON.`;
const GateSchema = z.object({ forConsole: z.boolean() });

it.runIf(mode === "gatemodel")("a small model as a veto on the address gate", async () => {
  const rows = fs.readFileSync(path.join(DIR, "ambient.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { id: string; text: string; lang: string; kind: "side" | "command" });
  const gap = Number(process.env.LIVE_GAP_MS ?? 2_000);
  const out: { id: string; kind: string; lang: string; rules: boolean; model: boolean | null; tokens: number; ms: number }[] = [];
  for (const x of rows) {
    const q = quickScreen(x.text, world);
    const u = q ? null : understand(x.text, START, world, { speechConf: 0.95 });
    const g = addressed({ text: x.text, lastTurnAt: null, now: Date.now(), rulesSure: !!q || (u?.kind === "do" && u.confidence >= 0.85), districtNoun: districtNounIn(x.text, world) });
    if (!g.act) { out.push({ id: x.id, kind: x.kind, lang: x.lang, rules: false, model: null, tokens: 0, ms: 0 }); continue; }
    const t0 = Date.now();
    const r = await callLlm({ name: "jarvis_gate", system: GATE_SYSTEM, prompt: JSON.stringify(x.text), schema: GateSchema, maxOutputTokens: 20, user: "holdout", lane: "eval", until: Date.now() + 6000, hedge: false });
    out.push({ id: x.id, kind: x.kind, lang: x.lang, rules: true, model: r ? r.object.forConsole : null, tokens: r?.tokens ?? 0, ms: Date.now() - t0 });
    await sleep(gap);
  }
  const side = out.filter((x) => x.kind === "side"), cmd = out.filter((x) => x.kind === "command"), asked = out.filter((x) => x.rules);
  const after = (x: (typeof out)[number]) => x.rules && x.model !== false;
  const summary = { sideN: side.length, commandsN: cmd.length, rules: { sideFalseActs: side.filter((x) => x.rules).length, commandsAccepted: cmd.filter((x) => x.rules).length }, withVeto: { sideFalseActs: side.filter(after).length, commandsAccepted: cmd.filter(after).length }, asked: asked.length, noAnswer: asked.filter((x) => x.model == null).length, tokensPerCall: asked.length ? Math.round(asked.reduce((a, x) => a + x.tokens, 0) / asked.length) : 0, msP50: asked.map((x) => x.ms).sort((a, b) => a - b)[Math.floor(asked.length / 2)] ?? 0 };
  write("gatemodel", { at: new Date().toISOString(), summary, rows: out });
  console.log(JSON.stringify(summary));
});

it.runIf(mode === "followups")("the 20 follow-ups, resolved in code from the earlier sentence", () => {
  const rows = fs.readFileSync(path.join(DIR, process.env.FOLLOWUPS ?? "followups.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { id: string; lang: string; after: string; text: string; expect: { intent?: string; place?: string; keeps?: boolean; n?: number } });
  const stageFor = (after: string): StageContext | null => {
    const q = quickScreen(after, world, { noBail: true });
    if (!q) return null;
    return { recipe: q.recipe, title: after.slice(0, 80), focus: null, slots: q.slots, blocks: [{ kind: "CaseList", ids: ["INC-1", "INC-2", "INC-3", "INC-4", "INC-5"] }] };
  };
  const out = rows.map((x) => {
    const stage = stageFor(x.after);
    const f = resolveFrame({ text: x.text, stage, turns: [{ heard: x.after, did: "showed a screen" }], lastPlace: null, lastText: x.after, world });
    const gold = x.expect.intent ?? "";
    const got = f.kind === "screen" ? f.recipe : f.kind === "stageOp" ? "stage_op" : "none";
    const named = world.zones.find((z) => z.name.toLowerCase() === (x.expect.place ?? "").toLowerCase())?.n ?? null;
    const q = quickScreen(x.after, world, { noBail: true });
    const ahead = (q?.slots.zones as number[] | undefined) ?? [];
    // the follow-up was resolved, the place it means is in focus (carried over or named), and it asks for what it should: the same
    // intent, or the earlier sentence's own when it only carries on from it ("keeps"), or an item or view of the open screen
    const zones = f.kind === "screen" ? (f.slots.zones as number[] | undefined) ?? [] : ahead;
    const placeOk = !named || zones.includes(named) || (f.kind === "screen" && f.slots.name != null) || (f.kind === "stageOp" && !ahead.length);
    const nOk = x.expect.n == null || (f.kind === "stageOp" && f.n === x.expect.n);
    const sameAsBefore = !!x.expect.keeps && got === q?.recipe;
    const stageFine = got === "stage_op" && f.kind === "stageOp" && (f.op === "open" ? nOk : true);
    const previousFine = gold === "compare" && f.kind === "screen" && f.why === "compare-previous";
    const ok = f.kind !== "none" && placeOk && nOk && (got === gold || sameAsBefore || stageFine || previousFine || !gold);
    return { id: x.id, lang: x.lang, gold, got, why: f.kind === "none" ? null : f.why, ok, inCode: f.kind !== "none" };
  });
  const summary = { n: out.length, right: out.filter((x) => x.ok).length, resolvedInCode: out.filter((x) => x.inCode).length };
  write((process.env.FOLLOWUPS ?? "followups.jsonl").replace(".jsonl", ""), { at: new Date().toISOString(), summary, rows: out });
  console.log(JSON.stringify(summary));
  expect(out.length).toBe(20);
});

it.runIf(mode === "planner2")("the shipped planner, through planRound, on the frozen sample", async () => {
  const which = process.env.HOLDOUT_SET ?? "final40";
  const sample = SET_DIR === "holdout" ? "planner40.json" : "live60.json";
  const lists = JSON.parse(fs.readFileSync(path.join(DIR, sample), "utf8")) as Record<string, string[]>;
  const all = items();
  // for tuning, on the old set only: the Tamil sentences outside the 40, which no planner change was made against
  const ids = which === "tamilrest" ? all.filter((x) => x.lang === "ta" && !lists.final40.includes(x.id)).map((x) => x.id) : lists[which];
  const set = ids.map((id) => all.find((x) => x.id === id)!);
  const gap = Number(process.env.LIVE_GAP_MS ?? 12_000);
  const models = ["qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b"];
  const left = models.reduce((a, m) => a + Math.max(0, ledger().room("groq", m).left.tpd), 0);
  if (left < set.length * 3000) { write(`planner-${which}`, { refused: true, left }); console.log(`not started: ${left} tokens left`); return; }
  const rows: (Scored & { model: string | null; ms: number; tokens: number; calls: number; lane: string; note: string | null })[] = [];
  clearCaches();
  for (const x of set) {
    const gold = goldIntent(x);
    const turnId = `h-${x.id}-${Date.now()}`;
    const t0 = Date.now();
    let r = null, tokens = 0, calls = 0, lane = "", failed = false;
    try {
      for (let round = 0; round < 3; round++) {
        const body = RoundBody.parse({ turnId, round, text: x.text.slice(0, 300), turns: x.after ? [{ heard: x.after.slice(0, 300), did: "showed a screen" }] : [], lastText: x.after?.slice(0, 300) ?? null, stage: null, direct: null,
          state: { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false } });
        const o = await planRound(body, world, fakeHands(), "holdout");
        tokens = o.tokens; calls = o.calls; lane = o.lane;
        if (o.done) { r = o.result; break; }
      }
    } catch (e) { failed = true; console.warn(x.id, (e as Error).message.slice(0, 160)); }
    const capacity = failed || !r || (r.kind === "none" && r.note === "no-model");
    const got = r ? (r.note === "general-fallback" ? "general-fallback" : resultIntent(r)) : "error";
    rows.push({ id: x.id, lang: x.lang, gold, got, ok: !capacity && hits(gold, got), deferred: false, capacity, model: r?.model ?? null, ms: Date.now() - t0, tokens, calls, lane, note: r?.note ?? null });
    if (SET_DIR === "holdout") console.log(x.id, gold, "->", got, lane, capacity ? "(capacity)" : "", tokens, "tokens", calls, "calls");
    if (calls > 0) await sleep(gap);
  }
  const summary = byLang(rows);
  const used = rows.filter((x) => x.calls > 0);
  const avg = (k: "tokens" | "calls") => (used.length ? Math.round((used.reduce((a, x) => a + x[k], 0) / used.length) * 10) / 10 : 0);
  const tokensAll = rows.reduce((a, x) => a + x.tokens, 0);
  write(`planner-${which}`, { at: new Date().toISOString(), summary, byLane: byLane(rows), tokensAll, tokensPerModelTurn: avg("tokens"), callsPerModelTurn: avg("calls"), modelTurns: used.length, rows });
  console.log(JSON.stringify({ summary, byLane: byLane(rows), tokensAll, tokensPerModelTurn: avg("tokens"), callsPerModelTurn: avg("calls"), modelTurns: used.length }));
});
void FINAL;
