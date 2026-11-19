/**
 * v4 live checks of Claude through the real planner (planRound, fake hands: only understanding and timing are measured). Both check
 * the ledger first and refuse to start what cannot finish; only Claude is asked (any other rung is refused in code, so a Groq answer
 * can never be scored as Claude's). The key is read from .env by vitest.live.config.ts and never printed.
 *
 *   JARVIS_LIVE=proof   ONE planner-shaped call (the screens bundle): prints the path taken (format or json), the model, the usage
 *                       with cache_read_input_tokens, and whether the reply validated against the planner's schema.
 *   JARVIS_LIVE=models  Opus 5.5 at effort low (adaptive thinking) vs Sonnet 5.5 (between_tools) vs Haiku 5.5 (disabled) on the 20
 *                       sentences of eval/holdout/planner40.json "baseline20" (the OLD set, already read; never holdout2 or 3):
 *                       latency p50/p90 per call and per turn, accuracy with a Wilson interval, cache reads. About 60 calls.
 *                       Writes eval/holdout/results/v4-claude-models.json. The default model is not changed (rule 7).
 * Run (Windows):  set JARVIS_LIVE=proof&& npx vitest run --config vitest.live.config.ts src/lib/thunai/claude.v4.live.ts
 */
import fs from "fs";
import path from "path";
import { expect, it } from "vitest";
import { claudeConfigured, claudeProblem } from "@/lib/ai/claude";
import { generateJson, type CallInfo, type JsonCall, type JsonResult } from "@/lib/ai/gateway";
import type { AgentResult } from "./agent";
import { WORLD } from "./fixture";
import { byLang, goldIntent, type HoldoutItem, type Scored } from "./holdout";
import { ledger, type Ledger } from "./ledger";
import { ZONE_TA_NAME } from "./lexicon";
import { clearCaches, planRound, RoundBody } from "./round";
import { fakeHands } from "./stagefake";
import { referenceWorld } from "./world";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const DIR = path.join(process.cwd(), "eval", "holdout");
const mode = process.env.JARVIS_LIVE ?? "";
const STATE = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false };
const MODELS = [
  { id: "claude-opus-5-5", how: "effort low, adaptive thinking (no thinking field)" },
  { id: "claude-sonnet-5-5", how: "effort low, thinking between_tools" },
  { id: "claude-haiku-5-5", how: "effort low, thinking disabled" }
];

/** Claude only: every other rung is refused at once, and each Claude call's info is kept */
function claudeOnly(seen: CallInfo[], max = Infinity) {
  return async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => {
    if (c.only?.provider !== "anthropic") throw new Error("claude only");
    if (seen.length >= max) throw new Error("one call only");
    const r = await generateJson(c);
    seen.push(r.info);
    return r;
  };
}
const pct = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null; };
/** room for n more calls of about `tokens` each in Claude's day, on this model */
const roomFor = (l: Ledger, model: string, n: number, tokens: number) => { const r = l.room("anthropic", model); return r.left.rpd >= n && r.left.tpd >= n * tokens && r.why !== "cooling"; };

/** the intent a planner result carries (as holdout.live.ts reads it) */
function resultIntent(r: AgentResult): string {
  if (r.kind === "refuse") return "refuse";
  if (r.kind === "chat") return r.note === "general" ? "general" : "chat";
  if (r.kind === "clarify") return "clarify";
  if (r.stage) return r.stage.recipe === "answer" ? "answer" : r.stage.recipe;
  if (r.stageOp) return r.stageOp.op === "save" || r.stageOp.op === "pin" ? "save" : "stage_op";
  if (r.steps.some((s) => s.a === "workspace" || s.a === "remember")) return "save";
  if (r.steps.length) return "navigate";
  return "none";
}
const MATCH: Record<string, string[]> = { insight: ["insight", "why", "ranking", "trend", "answer"], complete: ["complete"], general: ["general", "chat"], refuse: ["refuse"], case: ["case", "stage_op"], stage_op: ["stage_op", "case"] };
const hits = (gold: string, got: string) => got === gold || (MATCH[gold] ?? []).includes(got);

async function turn(text: string, after: string | undefined, llm: Parameters<typeof planRound>[6]) {
  const turnId = `v4m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  for (let round = 0; round < 3; round++) {
    const body = RoundBody.parse({ turnId, round, text: text.slice(0, 300), turns: after ? [{ heard: after.slice(0, 300), did: "showed a screen", slots: null }] : [], lastText: after?.slice(0, 300) ?? null, stage: null, direct: null, state: STATE });
    const o = await planRound(body, world, fakeHands(), "v4-live", undefined, undefined, llm);
    if (o.done) return o;
  }
  return null;
}

it.runIf(mode === "proof")("one planner-shaped Claude call: which path, what it cost, whether it validated", async () => {
  if (!claudeConfigured()) { console.log(JSON.stringify({ blocked: claudeProblem() ?? "no ANTHROPIC_API_KEY" })); return; }
  const l = ledger();
  const model = process.env.JARVIS_CLAUDE_MODEL || "claude-opus-5-5";
  if (!roomFor(l, model, 1, 6000)) { console.log(JSON.stringify({ refused: "no room in Claude's day", left: l.room("anthropic", model).left })); return; }
  clearCaches();
  const seen: CallInfo[] = [];
  // the screens bundle: the rules send this sentence straight to the planner (no router call, no fast lane)
  const o = await turn("put together something useful for my morning", undefined, { llm: { generate: claudeOnly(seen, 1) as never, claudeOk: () => true, bedrockOk: () => false } });
  const info = seen[0];
  const out = info
    ? { path: info.path, model: info.model, ms: info.ms, usage: { input: info.inputTokens, output: info.outputTokens, cache_read_input_tokens: info.cacheReadTokens, cache_creation_input_tokens: info.cacheWriteTokens }, validated: true, result: o?.result?.kind ?? null }
    : { path: null, model, validated: false, blocked: claudeProblem(), note: o?.result?.note ?? null };
  console.log(JSON.stringify(out));
  fs.mkdirSync(path.join(DIR, "results"), { recursive: true });
  fs.writeFileSync(path.join(DIR, "results", "v4-claude-proof.json"), JSON.stringify({ at: new Date().toISOString(), ...out }, null, 1));
  expect(seen.length).toBeLessThanOrEqual(1);
});

it.runIf(mode === "models")("Opus 5.5 low vs Sonnet 5.5 between_tools vs Haiku 5.5 disabled, through the planner, on the old set's baseline20", async () => {
  const file = path.join(DIR, "results", "v4-claude-models.json");
  const write = (data: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...(data as object) }, null, 1)); };
  if (!claudeConfigured()) { write({ blocked: claudeProblem() ?? "no ANTHROPIC_API_KEY" }); console.log("blocked: no usable key"); return; }
  const ids = (JSON.parse(fs.readFileSync(path.join(DIR, "planner40.json"), "utf8")) as Record<string, string[]>).baseline20;
  const all = fs.readFileSync(path.join(DIR, "understanding.jsonl"), "utf8").trim().split("\n").map((x) => JSON.parse(x) as HoldoutItem);
  const set = ids.map((id) => all.find((x) => x.id === id)!).filter(Boolean);
  const l = ledger();
  // a run that cannot finish is not started: up to 2 Claude calls a sentence (a plan, a bundle-miss retry), about 6K tokens each
  const short = MODELS.filter((m) => !roomFor(l, m.id, set.length * 2, 6000));
  if (short.length) { write({ refused: true, short: short.map((m) => ({ model: m.id, left: l.room("anthropic", m.id).left })) }); console.log("not started: no room"); return; }
  const gap = Number(process.env.LIVE_GAP_MS ?? 1500);
  const report: Record<string, unknown> = {};
  for (const m of MODELS) {
    process.env.JARVIS_CLAUDE_MODEL = m.id;
    clearCaches();
    const rows: (Scored & { turnMs: number; calls: number })[] = [];
    const seen: CallInfo[] = [];
    for (const x of set) {
      const gold = goldIntent(x);
      const before = seen.length, t0 = Date.now();
      const o = await turn(x.text, x.after, { llm: { generate: claudeOnly(seen) as never, claudeOk: () => true, bedrockOk: () => false } }).catch(() => null);
      const r = o?.result ?? null;
      const capacity = !r || (r.kind === "none" && r.note === "no-model");
      const got = r ? resultIntent(r) : "error";
      rows.push({ id: x.id, lang: x.lang, gold, got, ok: !capacity && hits(gold, got), deferred: false, capacity, turnMs: Date.now() - t0, calls: seen.length - before });
      // a refused key mid-run: stop, it is not a score
      if (claudeProblem()) break;
      await new Promise((res) => setTimeout(res, gap));
    }
    const modelTurns = rows.filter((r) => r.calls > 0);
    report[m.id] = {
      how: m.how, sentences: rows.length, accuracy: byLang(rows), capacityFailures: rows.filter((r) => r.capacity).length,
      callMs: { n: seen.length, p50: pct(seen.map((s) => s.ms), 0.5), p90: pct(seen.map((s) => s.ms), 0.9) },
      turnMs: { n: modelTurns.length, p50: pct(modelTurns.map((r) => r.turnMs), 0.5), p90: pct(modelTurns.map((r) => r.turnMs), 0.9) },
      paths: Object.fromEntries(["format", "json"].map((p) => [p, seen.filter((s) => s.path === p).length])),
      cacheRead: { calls: seen.filter((s) => (s.cacheReadTokens ?? 0) > 0).length, tokens: seen.reduce((a, s) => a + (s.cacheReadTokens ?? 0), 0) },
      tokens: seen.reduce((a, s) => a + s.inputTokens + s.outputTokens, 0),
      rows: rows.map((r) => ({ id: r.id, lang: r.lang, gold: r.gold, got: r.got, ok: r.ok, capacity: r.capacity, turnMs: r.turnMs, calls: r.calls }))
    };
    console.log(m.id, JSON.stringify({ ...(report[m.id] as object), rows: undefined }));
    write({ partial: true, sentences: ids, models: report });
    if (claudeProblem()) { write({ blocked: claudeProblem(), sentences: ids, models: report }); return; }
  }
  delete process.env.JARVIS_CLAUDE_MODEL;
  write({ sentences: ids, note: "default unchanged: claude-opus-5-5 (rule 7); first run, not tuned", models: report });
});
