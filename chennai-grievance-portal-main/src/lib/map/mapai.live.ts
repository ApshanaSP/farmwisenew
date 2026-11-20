/**
 * Ask the Map final: the AI plan step, live, on the frozen store's world (eval/store: its categories, departments, zones and place names), on
 * the questions in eval/map-final/dev.json (or MAP_EVAL_FILE). Each question goes straight to aiPlan (the step the console calls when the rules
 * cannot read a question whole), with the places the resolver finds, as ask.ts sends them. A plan passes when it checks and has everything the
 * question's `want` lists. One line per question to MAP_EVAL_OUT (default the scratch folder), then the totals: passed, median and p90
 * time, tokens and US$ (Claude at its list prices, claudebudget.ts; Nova Lite at AWS's list price, US$0.06 / 0.24 a million, not billed here).
 *   set AI_MAP_PROVIDER=anthropic&& npx vitest run --config vitest.live.config.ts src/lib/map/mapai.live.ts
 *   set AI_MAP_PROVIDER=bedrock&& ...      (Nova Lite, the current live provider)
 * Never the blind set: this file reads only the path it is given.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { beforeAll, expect, it, vi } from "vitest";
import { haveStore, loadFrozen } from "@/lib/assistant/__tests__/golden/harness";
import type { Plan, Step } from "./plan";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));

interface Want { show?: string; layers?: string[]; of_layer?: string; cats?: string[]; family_or_cat?: string; meters?: number; beyond?: number; by?: string; order?: string;
  areas?: string; area?: string; kinds?: string[]; period_days?: number; language?: string; severity?: string; overdue?: boolean; from_place?: boolean; understood?: boolean }
interface Q { id: string; q: string; want: Want }

const FILE = process.env.MAP_EVAL_FILE || path.join(process.cwd(), "eval", "map-final", "dev.json");
const OUT = process.env.MAP_EVAL_OUT || path.join(os.tmpdir(), `map-ai-${process.env.AI_MAP_PROVIDER || "default"}-${Date.now()}.jsonl`);

/** What is wrong with the plan for this question ([] = it passes). */
export function misses(plan: Plan | null, problems: string[] | null, want: Want): string[] {
  if (want.understood === false) return problems?.includes("not a map question") ? [] : ["should be refused as not a map question"];
  if (!plan) return [`no plan (${(problems ?? []).join("; ").slice(0, 120)})`];
  const out: string[] = [];
  const show = plan.steps.find((s) => s.as === plan.show)!;
  const takes = plan.steps.filter((s): s is Extract<Step, { op: "take" }> => s.op === "take");
  const inc = takes.find((t) => t.layer === "incidents");
  if (want.show && show.op !== want.show) out.push(`shows ${show.op}, not ${want.show}`);
  for (const l of want.layers ?? []) if (!takes.some((t) => t.layer === l)) out.push(`no ${l}`);
  if (want.of_layer) {
    const w = plan.steps.find((s) => s.op === "within") as Extract<Step, { op: "within" }> | undefined;
    const of = w && plan.steps.find((s) => s.as === w.of);
    if (!(of?.op === "take" && of.layer === want.of_layer)) out.push(`within is not of ${want.of_layer}`);
  }
  const cats = [...(inc?.filter?.category ?? []), ...(inc?.filter?.family ?? [])];
  for (const c of want.cats ?? []) if (!cats.includes(c)) out.push(`no category ${c} (has ${cats.join(",") || "none"})`);
  if (want.family_or_cat && !cats.some((c) => c === want.family_or_cat || c.startsWith(want.family_or_cat!))) out.push(`no ${want.family_or_cat}`);
  const step = <O extends Step["op"]>(op: O) => plan.steps.find((s) => s.op === op) as Extract<Step, { op: O }> | undefined;
  if (want.meters != null && (step("within")?.meters ?? step("along")?.meters) !== want.meters) out.push(`meters ${step("within")?.meters ?? "none"}, not ${want.meters}`);
  if (want.beyond != null && step("farthest")?.beyond_m !== want.beyond) out.push(`beyond ${step("farthest")?.beyond_m ?? "none"}, not ${want.beyond}`);
  if (want.areas && step("farthest")?.areas !== want.areas) out.push(`areas ${step("farthest")?.areas}, not ${want.areas}`);
  if (want.by && ((show as { by?: string }).by ?? step("count_by")?.by ?? step("rank")?.by) !== want.by) out.push(`by ${(show as { by?: string }).by ?? "none"}, not ${want.by}`);
  if (want.order && step("rank")?.order !== want.order) out.push(`order ${step("rank")?.order ?? "none"}, not ${want.order}`);
  if (want.area) {
    const ins = plan.steps.filter((s): s is Extract<Step, { op: "inside" }> => s.op === "inside");
    if (!ins.some((s) => `${s.area.kind}:${s.area.kind === "zone" || s.area.kind === "ward" ? s.area.id : ""}` === want.area)) out.push(`not inside ${want.area}`);
  }
  if (want.kinds) for (const k of want.kinds) if (!takes.some((t) => t.where?.kinds?.includes(k))) out.push(`no kind ${k}`);
  if (want.period_days != null) { const p = inc?.filter?.period; if (!(p?.kind === "last_days" && p.days === want.period_days)) out.push(`period ${JSON.stringify(p)}, not last ${want.period_days} days`); }
  if (want.language && plan.language !== want.language) out.push(`language ${plan.language}, not ${want.language}`);
  if (want.severity && !inc?.filter?.severity?.includes(want.severity)) out.push(`no severity ${want.severity}`);
  if (want.overdue && inc?.filter?.overdue !== true) out.push("not overdue");
  if (want.from_place && !step("nearest")?.from.startsWith("place:")) out.push("nearest is not from the place");
  return out;
}

let ready = false;
beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
  ready = true;
}, 300_000);

it.runIf(haveStore())("Ask the Map's AI plan on the dev questions", async () => {
  expect(ready).toBe(true);
  vi.useRealTimers();
  const { world } = await import("./world");
  const { aiPlan } = await import("./ai");
  const ai = await import("./ai");
  const { makeResolver } = await import("./resolve");
  const { mapLang } = await import("./route");
  const { costOf } = await import("@/lib/ai/claudebudget");
  const { world: w, resolver } = await world();
  const resolve = makeResolver(resolver);
  const catLabels = new Map([...w.cats.entries()].map(([k, v]) => [k, v.label]));
  const qs: Q[] = JSON.parse(fs.readFileSync(FILE, "utf8")).questions;
  const only = process.env.MAP_EVAL_ONLY ? new Set(process.env.MAP_EVAL_ONLY.split(",")) : null;
  const rows: { id: string; ok: boolean; ms: number; provider: string; model: string; usd: number; inT: number; outT: number; cacheR: number; miss: string[] }[] = [];
  for (const x of qs) {
    if (only && !only.has(x.id)) continue;
    // free tiers count requests a minute: MAP_EVAL_GAP_MS between questions
    if (rows.length && Number(process.env.MAP_EVAL_GAP_MS)) await new Promise((r) => setTimeout(r, Number(process.env.MAP_EVAL_GAP_MS)));
    const found = resolve(x.q, null).slice(0, 6).map((f) => ({ ref: f.pick.entry.ref, kind: f.pick.entry.kind, name: f.pick.entry.name_en }));
    const t0 = Date.now();
    let plan: Plan | null = null, problems: string[] | null = null, err = "";
    try {
      const r = await aiPlan(x.q, null, { cats: [...w.cats.keys()], depts: [...w.depts.keys()], places: found, user: "eval@map", lang: mapLang(x.q, resolve(x.q, null)), zones: w.zones, catLabels });
      if ("plan" in r) plan = r.plan; else problems = r.problems;
    } catch (e) { err = (e as Error).message.slice(0, 160); problems = [err]; }
    const ms = Date.now() - t0;
    const info = ai.takeMapCallInfo();
    const m = misses(plan, problems, x.want);
    const usd = info?.provider === "anthropic" ? costOf(info.model, { input_tokens: info.inputTokens - (info.cacheReadTokens ?? 0) - (info.cacheWriteTokens ?? 0), output_tokens: info.outputTokens,
      cache_read_input_tokens: info.cacheReadTokens ?? 0, cache_creation_input_tokens: info.cacheWriteTokens ?? 0 })
      : info?.provider === "bedrock" ? (info.inputTokens * 0.06 + info.outputTokens * 0.24) / 1e6 : 0;
    const row = { id: x.id, ok: !m.length, ms, provider: info?.provider ?? "none", model: info?.model ?? "", usd, inT: info?.inputTokens ?? 0, outT: info?.outputTokens ?? 0, cacheR: info?.cacheReadTokens ?? 0, miss: m };
    rows.push(row);
    fs.appendFileSync(OUT, JSON.stringify({ ...row, q: x.q, plan }) + "\n");
    console.log(`${row.ok ? "PASS" : "FAIL"} ${x.id} ${ms} ms ${row.provider}/${row.model} $${usd.toFixed(5)} ${m.join("; ")}`);
  }
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  const q = (p: number) => ms[Math.min(ms.length - 1, Math.ceil(p * ms.length) - 1)];
  const sum = { file: path.basename(FILE), provider: process.env.AI_MAP_PROVIDER || "default", n: rows.length, passed: rows.filter((r) => r.ok).length,
    median_ms: q(0.5), p90_ms: q(0.9), usd: Number(rows.reduce((a, r) => a + r.usd, 0).toFixed(5)), usd_per_q: Number((rows.reduce((a, r) => a + r.usd, 0) / Math.max(1, rows.length)).toFixed(6)),
    by_provider: rows.reduce((a, r) => ({ ...a, [r.provider]: (a[r.provider] ?? 0) + 1 }), {} as Record<string, number>), cache_read: rows.reduce((a, r) => a + r.cacheR, 0), out: OUT };
  console.log("SUMMARY " + JSON.stringify(sum));
  fs.appendFileSync(OUT, "SUMMARY " + JSON.stringify(sum) + "\n");
}, 3_600_000);
