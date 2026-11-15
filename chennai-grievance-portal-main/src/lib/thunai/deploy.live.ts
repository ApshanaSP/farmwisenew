/**
 * The Haiku deploy check (v5 build, item A6 d). Built in the v5 build and NEVER run there (no live Claude call by design: owner,
 * 15 Nov 2026). The owner runs it once the Anthropic key works (docs/jarvis/DEPLOY_HAIKU.md), from chennai-grievance-portal-main:
 *   HOLDOUT=deploy-haiku npx vitest run --config vitest.live.config.ts src/lib/thunai/deploy.live.ts
 *   (Windows cmd: set HOLDOUT=deploy-haiku&& npx vitest run --config vitest.live.config.ts src/lib/thunai/deploy.live.ts)
 *
 *   Step 1  one tiny call. A 401, a 403 or a refusal prints "key refused" and stops (cost $0); else the anthropic-ratelimit-* headers
 *   Step 2  timing, three arms (thinking off + effort low; thinking off + medium; thinking off + low + the compact plan): per arm one warm
 *           call per bundle, then 20 calls each on the screens and wide bundles (the tuning sentences the rules route there, cycled to
 *           20). Per call: total ms, output_tokens, input_tokens, cache_read_input_tokens, cache_creation_input_tokens, stop_reason, path.
 *           Each bundle's first call after its warm is reported apart (cold) and left out of the p50
 *   Step 3  the 24 tuning sentences, one run per arm, sent and scored like grid cell B (cellCall("B") and scorePlan), paired against
 *           each Groq model's eval/holdout/results/grid-B-<model>.json (b, c, exact p; ids both have, clean outcomes only)
 *   Step 4  after the ledger check: the live-60 through planRound pinned to Haiku (JARVIS_LADDER_PIN=anthropic) with the arm Step 3
 *           picks, the planner2 loop of holdout.live.ts (RoundBody per sentence, up to 3 rounds, recordTurn); written to
 *           eval/holdout2/results/deploy-haiku-planner-live60.json and paired against this build's final Groq live-60 file (v5final),
 *           else v4final (it says which): n, b, c and p only
 *   Decision  printed (deploycheck.ts), with the env lines to set; .env is never edited
 *
 * Cost: every request's usage at Haiku 5.5's prices; a call that could take the run over US$0.50 is not made. Expected about $0.15.
 * Privacy: prints and writes timings, counts, ids, outcomes and scores; never a sentence, a reply or the key.
 * It never calls groqOnly() (that strips the Claude key) and never imports holdout.live.ts (it calls groqOnly() on import).
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { expect, it } from "vitest";
import type { z } from "zod";
import { claudeJson, claudeOff, claudeWarm, onClaudeCall, type ClaudeCallEvent } from "@/lib/ai/claude";
import { AgentPlanLenient, type AgentResult } from "./agent";
import {
  ARMS, CAP_USD, HAIKU, Spend, armEnv, armP50, cleanOutcome, envLines, gridRows, keyVerdict, ledgerCheck, liveBaseline, pairTuning, pickArm, pickLead,
  quantile, rateLimitHeaders, timingSets, type Arm, type ArmId, type TimingRow, type TuneRow
} from "./deploycheck";
import { pairRows, resultRows } from "./evalpair";
import { scoreLine } from "./evalstats";
import { WORLD } from "./fixture";
import { cellCall, scorePlan, type TuningItem } from "./grid/cells";
import { byLang, goldIntent, type HoldoutItem, type Scored } from "./holdout";
import { ledger } from "./ledger";
import { ZONE_TA_NAME } from "./lexicon";
import { liveSummary, recordTurn, type TurnRecord } from "./liverecord";
import { clearCaches, planRound, RoundBody, SCHEMAS, systemFor } from "./round";
import { routeByRules } from "./router";
import { fakeHands } from "./stagefake";
import { referenceWorld } from "./world";

const RUN = process.env.HOLDOUT === "deploy-haiku";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const ROOT = process.cwd();
const TUNE_DIR = path.join(ROOT, "eval", "holdout");
const OUT = path.join(TUNE_DIR, "results");
const LIVE_DIR = path.join(ROOT, "eval", "holdout2");
const LIVE_OUT = path.join(LIVE_DIR, "results");
const LIVE_FILE = "deploy-haiku-planner-live60.json";
const ENV_KEYS = ["JARVIS_CLAUDE_MODEL", "JARVIS_HAIKU_EFFORT", "JARVIS_PLAN_COMPACT", "JARVIS_LADDER_PIN", "JARVIS_PLANNER_LEAD"];

const write = (dir: string, name: string, data: unknown) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 1)); };
const say = (x: unknown) => console.log(JSON.stringify(x));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const usd = (x: number) => Math.round(x * 10_000) / 10_000;
const p3 = (x: number) => Math.round(x * 1000) / 1000;
const setArm = (a: Arm) => Object.assign(process.env, armEnv(a));
/** the bundle the rules pick for a sentence, as grid cell B and the planner pick it */
const route = (text: string) => routeByRules(text.slice(0, 300), world, false).bundle ?? "screens";

// ---- kept in step with holdout.live.ts's planner2 mode (not imported: that file strips the Claude key on import)

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
const SAME: Record<string, string[]> = { insight: ["insight", "answer", "why", "ranking", "trend"], complete: ["complete", "answer"], general: ["general", "chat", "refuse"], case: ["case", "stage_op"], stage_op: ["stage_op", "case"] };
const MATCH: Record<string, string[]> = { ...SAME, insight: ["insight", "why", "ranking", "trend", "answer"], complete: ["complete"], general: ["general", "chat"], refuse: ["refuse"], followup: [] };
const hits = (gold: string, got: string) => got === gold || (MATCH[gold] ?? []).includes(got);

/** the live-60, after the frozen set's hashes are checked (the set is read here only, never printed) */
function live60(): HoldoutItem[] {
  for (const line of fs.readFileSync(path.join(LIVE_DIR, "HASHES.txt"), "utf8").trim().split(/\r?\n/)) {
    const [hash, rel] = line.split(" *");
    const now = crypto.createHash("sha256").update(fs.readFileSync(path.resolve(ROOT, rel), "utf8").replace(/\r\n/g, "\n")).digest("hex");
    if (now !== hash) throw new Error(`${rel} no longer matches its frozen hash`);
  }
  const all = fs.readFileSync(path.join(LIVE_DIR, "understanding.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as HoldoutItem);
  const ids = (JSON.parse(fs.readFileSync(path.join(LIVE_DIR, "live60.json"), "utf8")) as Record<string, string[]>).live60 ?? [];
  return ids.map((id) => all.find((x) => x.id === id)).filter((x): x is HoldoutItem => !!x);
}

// ---- Step 1

async function keyStep(spend: Spend): Promise<{ go: boolean; line: string; headers: Record<string, string> }> {
  const key = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!key) return { go: false, line: "key refused (no ANTHROPIC_API_KEY in .env)", headers: {} };
  const client = new Anthropic({ apiKey: key, maxRetries: 0 });
  try {
    const body = { model: HAIKU, max_tokens: 1, messages: [{ role: "user", content: "Reply with OK." }], thinking: { type: "disabled" }, output_config: { effort: "low" } };
    const { data, response } = await client.beta.messages.create(body as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming, { timeout: 20_000 }).withResponse();
    const u = data.usage;
    spend.add(u);
    ledger().record("anthropic", HAIKU, { tokens: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + u.output_tokens, lane: "eval" });
    return { ...keyVerdict({ stopReason: data.stop_reason }), headers: rateLimitHeaders(response.headers) };
  } catch (e) {
    const status = e instanceof Anthropic.APIError && typeof e.status === "number" ? e.status : undefined;
    return { ...keyVerdict({ status, message: e instanceof Error ? e.message : "" }), headers: e instanceof Anthropic.APIError ? rateLimitHeaders(e.headers) : {} };
  }
}

// ---- one first-planner call through claudeJson, as grid cell B sends it

interface Called { plan: Record<string, unknown> | null; ms: number; outcome: string; stopReason: string | null; path: string | null; usage: Pick<TimingRow, "output_tokens" | "input_tokens" | "cache_read_input_tokens" | "cache_creation_input_tokens"> }
async function plannerCall(c: ReturnType<typeof cellCall>, name: string): Promise<Called> {
  const heard: ClaudeCallEvent[] = [];
  const stop = onClaudeCall((e) => heard.push(e));
  const t0 = Date.now();
  let plan: Record<string, unknown> | null = null;
  try {
    const r = await claudeJson({ name, schema: c.schema as never, lenient: AgentPlanLenient as never, system: c.system, prompt: c.prompt, model: HAIKU, maxOutputTokens: 500, timeoutMs: 20_000 });
    plan = r.object as Record<string, unknown>;
  } catch { plan = null; } finally { stop(); }
  const ms = Date.now() - t0;
  const last = heard[heard.length - 1];
  const sum = (k: "output_tokens" | "input_tokens" | "cache_read_input_tokens" | "cache_creation_input_tokens") => heard.reduce((a, e) => a + e[k], 0);
  return { plan, ms, outcome: last?.outcome ?? "error", stopReason: last?.stopReason ?? null, path: last?.path ?? null,
    usage: { output_tokens: sum("output_tokens"), input_tokens: sum("input_tokens"), cache_read_input_tokens: sum("cache_read_input_tokens"), cache_creation_input_tokens: sum("cache_creation_input_tokens") } };
}

it.runIf(RUN)("the Haiku deploy check: key, timing, tuning accuracy, live-60, decision", async () => {
  const at = new Date().toISOString();
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const spend = new Spend(CAP_USD);
  // Steps 2 and 3 call Claude directly: their usage goes into the ledger here (claudeWarm and Step 4's gateway calls record their own)
  let direct = true;
  const stopSpend = onClaudeCall((e) => {
    spend.add(e);
    const tokens = e.input_tokens + e.cache_read_input_tokens + e.cache_creation_input_tokens + e.output_tokens;
    if (direct && !e.warm && tokens > 0) ledger().record("anthropic", e.model, { tokens, lane: "eval" });
  });
  try {
    process.env.JARVIS_CLAUDE_MODEL = HAIKU;

    // ---- Step 1: the key
    if (claudeOff()) { console.log("JARVIS_CLAUDE_OFF=1 is set: unset it, then run the check again (nothing was sent, cost $0)"); return; }
    const key = await keyStep(spend);
    write(OUT, "deploy-haiku-key.json", { at, verdict: key.line, ratelimitHeaders: key.headers, costUsd: usd(spend.spent) });
    console.log(key.line);
    say({ step: 1, ratelimitHeaders: key.headers, costUsd: usd(spend.spent) });
    if (!key.go) return;

    // ---- Step 2: timing
    const items = fs.readFileSync(path.join(TUNE_DIR, "tuning24.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as TuningItem);
    const sets = timingSets(items, route, 20);
    const timing: TimingRow[] = [];
    const warms: Record<string, unknown>[] = [];
    let stopped: string | null = null;
    step2: for (const arm of ARMS) {
      setArm(arm);
      for (const bundle of ["screens", "wide"] as const) {
        const texts = sets[bundle];
        if (!texts.length) { warms.push({ arm: arm.id, bundle, skipped: "no tuning sentence routes here" }); continue; }
        if (!spend.room(texts.length + 1)) { stopped = "cost cap"; break step2; }
        // one warm call per bundle: the same system block, format, thinking and effort as the calls after it
        const w = await claudeWarm({ system: systemFor(bundle, world), schema: SCHEMAS[bundle] as z.ZodTypeAny, model: HAIKU, timeoutMs: 20_000 });
        warms.push({ arm: arm.id, bundle, ok: !!w, ms: w?.ms ?? null, cacheWrite: w?.cacheWrite ?? null, cacheRead: w?.cacheRead ?? null, path: w?.path ?? null });
        for (let i = 0; i < texts.length; i++) {
          if (!spend.room()) { stopped = "cost cap"; break step2; }
          const r = await plannerCall(cellCall("B", texts[i], world), `deploy_t_${bundle}`);
          timing.push({ arm: arm.id, bundle, cold: i === 0, ms: r.ms, outcome: r.outcome, ...r.usage, stop_reason: r.stopReason, path: r.path });
          if (r.outcome === "key_refused" || r.outcome === "no_credit") { stopped = r.outcome; break step2; }
        }
      }
    }
    const timingSummary = Object.fromEntries(ARMS.map((a) => {
      const rows = timing.filter((r) => r.arm === a.id), warm = rows.filter((r) => !r.cold && cleanOutcome(r.outcome));
      const outcomes: Record<string, number> = {};
      for (const r of rows) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
      return [a.id, { calls: rows.length, msP50: armP50(timing, a.id), msP90: quantile(warm.map((r) => r.ms), 0.9), outputTokensP50: quantile(warm.map((r) => r.output_tokens), 0.5),
        inputTokensP50: quantile(warm.map((r) => r.input_tokens), 0.5), cacheReadP50: quantile(warm.map((r) => r.cache_read_input_tokens), 0.5),
        cold: rows.filter((r) => r.cold).map((r) => ({ bundle: r.bundle, ms: r.ms, outcome: r.outcome, cacheWrite: r.cache_creation_input_tokens })), outcomes }];
    }));
    write(OUT, "deploy-haiku-timing.json", { at, sentencesPerBundle: { screens: sets.screens.length, wide: sets.wide.length }, warms, summary: timingSummary, rows: timing, stopped, costUsd: usd(spend.spent) });
    say({ step: 2, summary: timingSummary, warms: warms.length, stopped, costUsd: usd(spend.spent) });
    if (stopped) { console.log(`stopped in Step 2 (${stopped}): no decision`); return; }

    // ---- Step 3: the tuning sentences, scored like grid cell B
    const tuning: (TuneRow & { arm: ArmId; lang: string; bundle: string; slotsOk: boolean; kind: string | null; recipe: string | null; ms: number })[] = [];
    step3: for (const arm of ARMS) {
      setArm(arm);
      for (const x of items) {
        if (!spend.room()) { stopped = "cost cap"; break step3; }
        const c = cellCall("B", x.text, world);
        const r = await plannerCall(c, `deploy_b_${c.bundle}`);
        const s = scorePlan(x, cleanOutcome(r.outcome) ? r.plan : null);
        tuning.push({ id: x.id, lang: x.lang, arm: arm.id, bundle: c.bundle, ok: s.ok, slotsOk: s.slotsOk, kind: s.kind, recipe: s.recipe, outcome: r.outcome, ms: r.ms });
        if (r.outcome === "key_refused" || r.outcome === "no_credit") { stopped = r.outcome; break step3; }
      }
    }
    const armRows = (id: ArmId) => tuning.filter((r) => r.arm === id);
    const scores = Object.fromEntries(ARMS.map((a) => { const r = armRows(a.id).filter((x) => cleanOutcome(x.outcome)); return [a.id, scoreLine(r.filter((x) => x.ok).length, r.length)]; }));
    const mediumVsLow = pairTuning(armRows("medium"), armRows("low")), compactVsLow = pairTuning(armRows("compact"), armRows("low"));
    const nbcp = (p: { n: number; b: number; c: number; p: number }) => ({ n: p.n, b: p.b, c: p.c, p: p3(p.p) });
    // b = right only with the Haiku arm, c = right only with the Groq model
    const grid = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => /^grid-B-.+\.json$/.test(f)) : [];
    const vsGroq = grid.flatMap((f) => {
      const j = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")) as { model?: string; rows?: { id: string; ok: boolean; outcome?: string }[] };
      return ARMS.map((a) => ({ arm: a.id, groq: j.model ?? f, ...nbcp(pairTuning(armRows(a.id), gridRows(j))) }));
    });
    write(OUT, "deploy-haiku-tuning.json", { at, scores, mediumVsLow: nbcp(mediumVsLow), compactVsLow: nbcp(compactVsLow), vsGroq, rows: tuning, stopped, costUsd: usd(spend.spent),
      note: "b = right only in the first named, c = right only in the second; exact two-sided McNemar; ids both runs have, clean outcomes only" });
    say({ step: 3, scores, mediumVsLow: nbcp(mediumVsLow), compactVsLow: nbcp(compactVsLow), vsGroq, stopped, costUsd: usd(spend.spent) });
    if (stopped) { console.log(`stopped in Step 3 (${stopped}): no decision`); return; }

    const p50 = { low: armP50(timing, "low"), medium: armP50(timing, "medium"), compact: armP50(timing, "compact") };
    const picked = pickArm({ p50, mediumVsLow, compactVsLow });

    // ---- Step 4: the live-60 through planRound, pinned to Haiku with the picked arm
    direct = false;
    let live: { b: number; c: number } | null = null;
    let against: string | null = null;
    const set = live60();
    const lc = ledgerCheck(ledger().room("anthropic", HAIKU), set.length);
    if (!lc.ok) say({ step: 4, started: false, why: lc.line });
    else if (!spend.room(set.length * 2)) say({ step: 4, started: false, why: `cost cap: ${usd(spend.spent)} of ${CAP_USD} US$ spent` });
    else {
      setArm(picked.arm);
      process.env.JARVIS_LADDER_PIN = "anthropic";
      process.env.JARVIS_PLANNER_LEAD = "haiku";
      clearCaches();
      const rows: (Scored & { model: string | null; ms: number; tokens: number; calls: number; lane: string; note: string | null; rec: TurnRecord; claude: Record<string, number> })[] = [];
      for (const x of set) {
        if (!spend.room(4)) { stopped = "cost cap"; break; }
        // the ledger's own minute (Jarvis's Claude ceiling): wait for room rather than score a turn the ladder could not ask (at most 2 min)
        for (let waited = 0, r = ledger().room("anthropic", HAIKU, { tokens: 8000 }); !r.ok && (r.why === "tpm" || r.why === "rpm") && waited < 120_000; waited += 1500, r = ledger().room("anthropic", HAIKU, { tokens: 8000 })) await sleep(1500);
        const gold = goldIntent(x);
        const turnId = `deploy-${x.id}-${Date.now()}`;
        const heard: ClaudeCallEvent[] = [];
        const stopHeard = onClaudeCall((e) => heard.push(e));
        const recorder = recordTurn();
        const t0 = Date.now();
        let r: AgentResult | null = null, tokens = 0, calls = 0, lane = "", failed = false;
        try {
          for (let round = 0; round < 3; round++) {
            const body = RoundBody.parse({ turnId, round, text: x.text.slice(0, 300), turns: x.after ? [{ heard: x.after.slice(0, 300), did: "showed a screen" }] : [], lastText: x.after?.slice(0, 300) ?? null, stage: null, direct: null,
              state: { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false } });
            const o = await planRound(body, world, fakeHands(), "holdout");
            tokens = o.tokens; calls = o.calls; lane = o.lane;
            if (o.done) { r = o.result; break; }
          }
        } catch { failed = true; } finally { stopHeard(); }
        const rec = recorder.stop(r?.model ?? null);
        const claude: Record<string, number> = {};
        for (const e of heard) claude[e.outcome] = (claude[e.outcome] ?? 0) + 1;
        // a 429, a 5xx or a time-out is capacity; a refusal, a cut-off or an off-schema reply is Haiku's own wrong answer
        const busy = heard.some((e) => e.outcome === "rate_limited" || e.outcome === "busy" || e.outcome === "timeout");
        const modelFault = heard.some((e) => e.outcome === "refusal" || e.outcome === "max_tokens" || e.outcome === "off_schema");
        const capacity = failed || !r || rec.rate_limited || busy || (r.kind === "none" && r.note === "no-model" && !modelFault);
        const got = r ? (r.note === "general-fallback" ? "general-fallback" : resultIntent(r)) : "error";
        rows.push({ id: x.id, lang: x.lang, gold, got, ok: !capacity && hits(gold, got), deferred: false, capacity, model: r?.model ?? null, ms: Date.now() - t0, tokens, calls, lane, note: r?.note ?? null, rec, claude });
        write(LIVE_OUT, LIVE_FILE, { at, partial: true, done: rows.length, of: set.length, arm: picked.arm.id, rows });
        if (heard.some((e) => e.outcome === "key_refused" || e.outcome === "no_credit")) { stopped = "key refused"; break; }
      }
      const v5 = liveSummary(rows.map((r) => ({ ok: r.ok, capacity: r.capacity, lang: r.lang, rec: r.rec })));
      write(LIVE_OUT, LIVE_FILE, { at, arm: picked.arm.id, summary: byLang(rows), v5, rows, stopped, costUsd: usd(spend.spent) });
      say({ step: 4, arm: picked.arm.id, score: scoreLine(v5.allTurns.k, v5.allTurns.n), cleanTurns: scoreLine(v5.cleanTurns.k, v5.cleanTurns.n), capacityFailures: v5.capacityFailures, label: v5.label, stopped, costUsd: usd(spend.spent) });
      const base = liveBaseline(LIVE_OUT, fs.existsSync);
      if (!base) say({ step: 4, paired: false, why: "no Groq live-60 file (v5final or v4final) in eval/holdout2/results" });
      else if (stopped) say({ step: 4, paired: false, against: base.which, why: `stopped (${stopped})` });
      else {
        against = base.which;
        try {
          const p = pairRows(resultRows(path.join(LIVE_OUT, LIVE_FILE)), resultRows(base.file));
          live = { b: p.b, c: p.c };
          // b = right only with Haiku, c = right only with Groq
          say({ step: 4, against: base.which, n: p.n, b: p.b, c: p.c, p: p3(p.p) });
        } catch { say({ step: 4, paired: false, against: base.which, why: "the two files are not on the same sentences" }); }
      }
    }

    // ---- the decision
    const lead = pickLead(armP50(timing, picked.arm.id), live);
    const lines = envLines(picked.arm, lead.lead);
    const why = [...picked.why, ...lead.why];
    write(OUT, "deploy-haiku-decision.json", { at, arm: picked.arm, lead: lead.lead, why, env: lines, live60Against: against, costUsd: usd(spend.spent) });
    console.log("Decision:");
    for (const w of why) console.log(`  ${w}`);
    console.log("Set these lines in chennai-grievance-portal-main/.env (this check never edits it), then restart the server:");
    for (const l of lines) console.log(`  ${l}`);
    console.log(`Spent about US$${usd(spend.spent)} (cap US$${CAP_USD}).`);
    expect(spend.spent).toBeLessThanOrEqual(CAP_USD);
  } finally {
    stopSpend();
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
