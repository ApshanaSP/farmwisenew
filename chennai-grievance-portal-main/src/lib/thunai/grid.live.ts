/**
 * The diagnosis grid (v5 build, section 7): the FIRST planner call only, per cell, per pinned Groq model, on eval/holdout/tuning24.jsonl
 * (no frozen set is read). Results: eval/holdout/results/grid-<cell>-<model>.json. No live Claude call: groqOnly() first.
 *
 *   GRID=run   GRID_RUN="openai/gpt-oss-20b:A,B;openai/gpt-oss-120b:A,B;qwen/qwen3.8-27b:A,B" (models run in parallel, each on its
 *              own quota, cells in the order given, sentences in a seeded, language-balanced order); GRID_N="24" or per model
 *              "openai/gpt-oss-20b:24,qwen/qwen3.8-27b:20"; GRID_SEED (default 20261115). Before a model starts, the ledger must
 *              hold its whole need (GRID_CACHED_FREE=1 counts gpt-oss cached input as free, as Groq's docs say, once measured).
 *              A 429 is a capacity failure: never retried on another model; a long one (daily) stops that model's run.
 *   GRID=pairs every pair of cells on the same model and the same sentences: n, b, c, exact p, mid-p, and the build rule's reading
 *   GRID=sizes characters and characters / 4 of each bundle's system prompt, schema and bare first prompt, v3, v4 and G (Phase 0, #8)
 *
 * Run: GRID=run GRID_RUN=... npx vitest run --config vitest.live.config.ts src/lib/thunai/grid.live.ts
 */
import fs from "fs";
import path from "path";
import { expect, it } from "vitest";
import { generateJson, onAttempt, schemaText, type AttemptEvent } from "@/lib/ai/gateway";
import { AgentPlanLenient } from "./agent";
import { mcnemar, scoreLine } from "./evalstats";
import { WORLD } from "./fixture";
import { ledger } from "./ledger";
import { ZONE_TA_NAME } from "./lexicon";
import { groqOnly } from "./liverecord";
import { bankLines, Shortlister } from "./shortlist";
import { referenceWorld } from "./world";
import { cellCall, pairable, scorePlan, type CellId, type TuningItem } from "./grid/cells";
import { firstPrompt, SCHEMAS, systemFor } from "./round";
import { firstPromptV3, SCHEMAS_V3, systemV3 } from "./grid/v3";
import { balancedOrder, bodyOf, promptG, systemG } from "./grid/cells";

groqOnly();

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const DIR = path.resolve(process.cwd(), "eval", "holdout");
const OUT = path.join(DIR, "results");
const mode = process.env.GRID ?? "run";
const SEED = Number(process.env.GRID_SEED ?? 20261115);
const items = (): TuningItem[] => fs.readFileSync(path.join(DIR, "tuning24.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as TuningItem);
const fileOf = (cell: string, model: string) => path.join(OUT, `grid-${cell}-${model.replace(/[^a-z0-9.]+/gi, "-")}.json`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A row's outcome is scored only when the model gave a plan to score (review evaluation-honesty-2): a 429 is a capacity failure, and a
 * strict-mode 400 with no usable draft, a 5xx, a timeout or an error are their own outcomes, never a wrong answer. (A strict-mode 400
 * whose draft our lenient schema took, "draft_used", is scored: production answers from that draft too.)
 */
const SCORED = (r: { outcome: string }) => r.outcome === "ok" || r.outcome === "draft_used";

interface Row { id: string; lang: string; cell: string; model: string; bundle: string; via: string; ok: boolean; slotsOk: boolean; kind: string | null; recipe: string | null; outcome: string; prompt_tokens: number; completion_tokens: number; cached_tokens: number; ms: number; est: number; at: string }

const estimateOf = (c: ReturnType<typeof cellCall>) => Math.ceil((c.system.length + schemaText(c.schema).length + c.prompt.length) / 4) + 300;

function readRows(cell: string, model: string): Row[] {
  try { return (JSON.parse(fs.readFileSync(fileOf(cell, model), "utf8")) as { rows: Row[] }).rows ?? []; } catch { return []; }
}
function writeRows(cell: string, model: string, rows: Row[], extra: Record<string, unknown> = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const scored = rows.filter(SCORED);
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  const any429 = rows.some((r) => r.outcome === "rate_limited");
  const summary = { label: any429 ? "CAPACITY FAILURE (a 429 was met: not a plain score)" : "clean", allTurns: scoreLine(rows.filter((r) => SCORED(r) && r.ok).length, rows.length),
    n: rows.length, right: scored.filter((r) => r.ok).length, scored: scored.length, score: scoreLine(scored.filter((r) => r.ok).length, scored.length), slotsRight: scored.filter((r) => r.slotsOk).length,
    capacity: rows.filter((r) => r.outcome === "rate_limited").length, jsonValidateFailed: rows.filter((r) => r.outcome === "json_validate_failed" || r.outcome === "draft_used").length,
    timeouts: rows.filter((r) => r.outcome === "timeout").length, errors: rows.filter((r) => r.outcome === "error").length,
    meanPrompt: Math.round(rows.reduce((a, r) => a + r.prompt_tokens, 0) / Math.max(1, rows.length)), meanCompletion: Math.round(rows.reduce((a, r) => a + r.completion_tokens, 0) / Math.max(1, rows.length)),
    meanCached: Math.round(rows.reduce((a, r) => a + r.cached_tokens, 0) / Math.max(1, rows.length)), meanEstimate: Math.round(rows.reduce((a, r) => a + r.est, 0) / Math.max(1, rows.length)),
    msP50: ms[Math.floor(ms.length / 2)] ?? null, msP90: ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.9))] ?? null };
  fs.writeFileSync(fileOf(cell, model), JSON.stringify({ at: new Date().toISOString(), cell, model, seed: SEED, summary, ...extra, rows }, null, 1));
  return summary;
}

const parsePlan = (s: string | undefined) => (s ?? "").split(";").map((x) => x.trim()).filter(Boolean).map((x) => { const [m, c] = x.split(":"); return { model: m.trim(), cells: c.split(",").map((y) => y.trim()) as CellId[] }; });
const nFor = (model: string): number => {
  const v = process.env.GRID_N ?? "24";
  if (!v.includes(":")) return Number(v);
  const m = v.split(",").map((x) => x.split(":")).find(([k]) => k.trim() === model);
  return m ? Number(m[1]) : 24;
};

it.runIf(mode === "run")("the diagnosis grid: first planner call, pinned Groq models", async () => {
  const plan = parsePlan(process.env.GRID_RUN);
  expect(plan.length).toBeGreaterThan(0);
  const all = items();
  const order = balancedOrder(all, SEED);
  const needsBank = plan.some((p) => p.cells.includes("G"));
  const sl = needsBank ? new Shortlister(bankLines()) : undefined;
  if (needsBank && !bankLines().length) throw new Error("cell G needs src/lib/thunai/bank/*.json");
  const cachedFree = process.env.GRID_CACHED_FREE === "1";
  const report: Record<string, unknown> = {};

  await Promise.all(plan.map(async ({ model, cells }) => {
    // 120b runs only cells that pair with A on screen recipes: its sentences come from the 18 that every schema can express
    const pool = cells.some((c) => c === "C" || c === "D" || c === "E") && !cells.some((c) => c === "B" || c === "F" || c === "G") ? order.filter((x) => pairable(x, ["A"])) : order;
    const n = Math.min(nFor(model), pool.length);
    const set = pool.slice(0, n);
    // the ledger must hold the whole run (a run that cannot finish is not started)
    const need = cells.reduce((a, c) => a + set.reduce((s, x) => s + estimateOf(cellCall(c, x.text, world, sl)), 0), 0);
    const left = ledger().room("groq", model).left.tpd ?? Infinity;
    const credit = cachedFree && model.startsWith("openai/") ? Number(process.env.GRID_CACHED_SHARE ?? 0) : 0;
    const needNet = Math.round(need * (1 - credit));
    if (needNet > left) { report[model] = { refused: true, need, needNet, left, n }; console.log(JSON.stringify({ model, refused: true, need, needNet, left, n })); return; }
    console.log(JSON.stringify({ model, cells, n, need, needNet, ledgerLeft: left }));
    const window: { t: number; tokens: number }[] = [];
    const used = () => { const now = Date.now(); while (window.length && now - window[0].t > 61_000) window.shift(); return { tokens: window.reduce((a, x) => a + x.tokens, 0), requests: window.length }; };
    let stopped: string | null = null;
    for (const cell of cells) {
      if (stopped) break;
      const prior = readRows(cell, model).filter((r) => !set.some((x) => x.id === r.id));
      const rows: Row[] = [];
      let avgBill = 0;
      for (const x of set) {
        if (stopped) break;
        const c = cellCall(cell, x.text, world, sl);
        const est = estimateOf(c);
        const want = rows.length ? avgBill : est;
        for (let u = used(); u.tokens + want > 7_400 || u.requests >= 28; u = used()) await sleep(1500);
        const events: AttemptEvent[] = [];
        const off = onAttempt((e) => { if (e.model.split("#")[0] === model) events.push(e); });
        const t0 = Date.now();
        let plan: Record<string, unknown> | null = null;
        try {
          const r = await generateJson({ role: "fast", name: `grid_${cell}`, schema: c.schema, lenient: AgentPlanLenient as never, system: c.system, prompt: c.prompt, temperature: 0, maxOutputTokens: 500, user: "grid", lane: "eval", timeoutMs: 20_000, only: { provider: "groq", models: [model] } });
          plan = r.object as Record<string, unknown>;
        } catch { plan = null; }
        off();
        const last = events[events.length - 1];
        const outcome = events.some((e) => e.outcome === "rate_limited") ? "rate_limited" : last?.outcome ?? "error";
        const s = scorePlan(x, outcome === "rate_limited" ? null : plan);
        const pt = events.reduce((a, e) => a + (e.inputTokens ?? 0), 0), ct = events.reduce((a, e) => a + (e.outputTokens ?? 0), 0), ca = events.reduce((a, e) => a + (e.cachedTokens ?? 0), 0);
        const bill = pt ? pt - ca + ct : est;
        window.push({ t: Date.now(), tokens: bill });
        avgBill = (avgBill * rows.length + bill) / (rows.length + 1);
        rows.push({ id: x.id, lang: x.lang, cell, model, bundle: c.bundle, via: c.via, ok: s.ok, slotsOk: s.slotsOk, kind: s.kind, recipe: s.recipe, outcome, prompt_tokens: pt, completion_tokens: ct, cached_tokens: ca, ms: Date.now() - t0, est, at: new Date().toISOString() });
        writeRows(cell, model, [...prior, ...rows], { partial: true });
        if (rows.length === 3) console.log(JSON.stringify({ model, cell, firstThree: rows.map((r) => ({ prompt: r.prompt_tokens, completion: r.completion_tokens, cached: r.cached_tokens, est: r.est, outcome: r.outcome })) }));
        if (outcome === "rate_limited") {
          const ra = Number(events.find((e) => e.outcome === "rate_limited")?.rateHeaders?.["retry-after"] ?? NaN);
          if (!Number.isFinite(ra) || ra > 300) { stopped = `429 with retry-after ${Number.isFinite(ra) ? ra : "unknown"} s: the day's limit; the rest of this model's run is owed`; break; }
          await sleep((ra + 1) * 1000);
        }
      }
      const summary = writeRows(cell, model, [...prior, ...rows], stopped ? { stopped } : {});
      report[`${cell}/${model}`] = summary;
      console.log(JSON.stringify({ model, cell, summary, stopped }));
    }
  }));
  console.log(JSON.stringify({ done: true, report }));
});

// rewrite every grid file's summary from its own rows under the scoring rule above (no model call)
it.runIf(mode === "resummarize")("the grid files' summaries, from their rows", () => {
  const files = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => /^grid-[A-G]-.+\.json$/.test(f)) : [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")) as { cell: string; model: string; rows: Row[]; [k: string]: unknown };
    const { rows, cell, model, at: _at, summary: _s, ...rest } = j;
    const s = writeRows(cell, model, rows, rest);
    console.log(JSON.stringify({ file: f, label: s.label, allTurns: s.allTurns, cleanTurns: s.score, capacity: s.capacity, ownOutcome: rows.filter((r) => !SCORED(r) && r.outcome !== "rate_limited").length }));
  }
});

/** the pairs the grid reads (7.5), on one model */
const PAIRS: [CellId, CellId][] = [["A", "B"], ["A", "C"], ["A", "D"], ["A", "E"], ["F", "B"], ["G", "A"], ["G", "B"], ["C", "D"]];

it.runIf(mode === "pairs")("every pair of grid cells on the same model and sentences: b, c, p", () => {
  const files = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => /^grid-[A-G]-.+\.json$/.test(f)) : [];
  const runs = files.map((f) => JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")) as { cell: CellId; model: string; rows: Row[] });
  const gold = new Map(items().map((x) => [x.id, x]));
  const out: Record<string, unknown>[] = [];
  for (const model of [...new Set(runs.map((r) => r.model))]) {
    for (const [x, y] of PAIRS) {
      const rx = runs.find((r) => r.model === model && r.cell === x), ry = runs.find((r) => r.model === model && r.cell === y);
      if (!rx || !ry) continue;
      const clean = (r: Row) => SCORED(r);
      const ym = new Map(ry.rows.filter(clean).map((r) => [r.id, r]));
      const both = rx.rows.filter(clean).filter((r) => ym.has(r.id) && pairable(gold.get(r.id)!, [x, y]));
      const b = both.filter((r) => r.ok && !ym.get(r.id)!.ok).length, c = both.filter((r) => !r.ok && ym.get(r.id)!.ok).length;
      const m = mcnemar(b, c);
      out.push({ model, pair: `${x} vs ${y}`, n: both.length, [`right ${x}`]: both.filter((r) => r.ok).length, [`right ${y}`]: both.filter((r) => ym.get(r.id)!.ok).length, b, c, p: Math.round(m.p * 1000) / 1000, midP: Math.round(m.midP * 1000) / 1000,
        reading: b - c >= 3 ? `${x} beats ${y} on this model` : c - b >= 3 ? `${y} beats ${x} on this model` : "about equal" });
    }
  }
  fs.writeFileSync(path.join(OUT, "grid-pairs.json"), JSON.stringify({ at: new Date().toISOString(), note: "b = right only in the first cell, c = right only in the second; exact two-sided McNemar. Direction rule (7.5): X beats Y when b - c >= 3 on a model and no model that ran both shows the opposite sign by 3 or more. With 16-24 pairs only large effects show.", pairs: out }, null, 1));
  console.log(JSON.stringify(out));
});

it.runIf(mode === "sizes")("prompt and schema sizes by bundle, v3, v4 and G (Phase 0, #8)", () => {
  const en = "show me the severe drainage cases", ta = "அடையாறில் தண்ணீர் தேங்கும் புகார்களைக் காட்டு";
  const mem = { notes: [] as string[], habits: {} as Record<string, string> };
  const q = (s: string) => ({ chars: s.length, tokens4: Math.round(s.length / 4) });
  const rows: Record<string, unknown>[] = [];
  for (const bundle of ["screens", "console", "stage", "data", "memory", "wide"] as const) {
    const s4 = systemFor(bundle, world), s3 = systemV3(bundle, world);
    const text = bundle === "wide" ? ta : en, lang = bundle === "wide" ? "ta" : "en";
    rows.push({ bundle, v4: { system: q(s4), schema: q(schemaText(SCHEMAS[bundle] as never)), prompt: q(firstPrompt(bodyOf(text), world, lang, mem, s4.length, { reg: null, bundle, marker: null })) },
      v3: { system: q(s3), schema: q(schemaText(SCHEMAS_V3[bundle] as never)), prompt: q(firstPromptV3(bodyOf(text), world, lang)) } });
  }
  const lines = bankLines();
  const g = lines.length ? (() => { const sl = new Shortlister(lines); return { system: q(systemG(world)), schema: q(schemaText(SCHEMAS.screens as never)), promptEn: q(promptG(bodyOf(en), world, "en", sl)), promptTa: q(promptG(bodyOf(ta), world, "ta", sl)) }; })() : "no bank yet";
  console.log(JSON.stringify({ note: "characters, and characters / 4; the sentence is invented; v4 includes the schema's calls and done", rows, G: g }));
});
