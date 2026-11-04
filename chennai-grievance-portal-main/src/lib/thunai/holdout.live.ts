/**
 * The held-out runs, on the frozen sets in eval/holdout (data from fake hands, so only understanding is measured).
 *   HOLDOUT=rules    all 150 through rules and router, no model
 *   HOLDOUT=planner  the frozen sample through the planner (HOLDOUT_SET=baseline20|final40); checks the ledger first and
 *                    refuses to start a run that cannot finish; a 429 is a capacity failure, not a wrong answer
 * Results go to eval/holdout/results/<HOLDOUT_TAG>-<mode>.json. Run with:
 *   set HOLDOUT=rules&& npx vitest run --config vitest.live.config.ts src/lib/thunai/holdout.live.ts
 */
import fs from "fs";
import path from "path";
import { expect, it } from "vitest";
import { generateJson } from "@/lib/ai/gateway";
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

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const DIR = path.join(process.cwd(), "eval", "holdout");
const items = () => fs.readFileSync(path.join(DIR, "understanding.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as HoldoutItem);
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
