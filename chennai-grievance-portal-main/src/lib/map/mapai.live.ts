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
import type { Plan } from "./plan";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));

import { misses, withBusyRetry, type Q } from "./evalcheck";

const FILE = process.env.MAP_EVAL_FILE || path.join(process.cwd(), "eval", "map-final", "dev.json");
const OUT = process.env.MAP_EVAL_OUT || path.join(os.tmpdir(), `map-ai-${process.env.AI_MAP_PROVIDER || "default"}-${Date.now()}.jsonl`);

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
  const { spellerFor, modelWords } = await import("./ask");
  const MAP_SPELL = process.env.MAP_SPELL_OFF !== "1";
  const { mapLang, fitModelPlan } = await import("./route");
  const { costOf } = await import("@/lib/ai/claudebudget");
  const { world: w, resolver } = await world();
  const resolve = makeResolver(resolver);
  const catLabels = new Map([...w.cats.entries()].map(([k, v]) => [k, v.label]));
  const qs: Q[] = JSON.parse(fs.readFileSync(FILE, "utf8")).questions;
  const only = process.env.MAP_EVAL_ONLY ? new Set(process.env.MAP_EVAL_ONLY.split(",")) : null;
  const rows: { id: string; ok: boolean; busy: boolean; ms: number; provider: string; model: string; usd: number; inT: number; outT: number; cacheR: number; miss: string[] }[] = [];
  for (const x of qs) {
    if (only && !only.has(x.id)) continue;
    // free tiers count requests a minute: MAP_EVAL_GAP_MS between questions
    if (rows.length && Number(process.env.MAP_EVAL_GAP_MS)) await new Promise((r) => setTimeout(r, Number(process.env.MAP_EVAL_GAP_MS)));
    // as the console does (ask.ts): the speller reads the question first, and the AI gets the question as read
    const q = MAP_SPELL ? spellerFor(resolver)(x.q).text : x.q;
    const found = resolve(q, null).slice(0, 6).map((f) => ({ ref: f.pick.entry.ref, kind: f.pick.entry.kind, name: f.pick.entry.name_en }));
    const t0 = Date.now();
    let plan: Plan | null = null, problems: string[] | null = null, err = "", busy = false;
    try {
      const lang = mapLang(q, resolve(q, null));
      // a busy provider is waited for and asked again (the score measures understanding, not quota)
      const got = await withBusyRetry(() => aiPlan(q, null, { cats: [...w.cats.keys()], depts: [...w.depts.keys()], places: found, user: "eval@map", lang, zones: w.zones, catLabels }));
      busy = got.busy;
      if (!got.value) throw new Error("still busy after waiting");
      const r = got.value;
      // as ask.ts does with a model's plan: the question's own time words win (fitModelPlan), so the runner checks what the console runs
      if ("plan" in r) plan = fitModelPlan(r.plan, q, w.now, null, process.env.MAP_WORDS_OFF === "1" ? undefined : modelWords(w, lang, found)); else problems = r.problems;
    } catch (e) { err = (e as Error).message.slice(0, 160); problems = [err]; }
    const ms = Date.now() - t0;
    const info = ai.takeMapCallInfo();
    const m = busy ? ["unanswered: the provider stayed busy"] : misses(plan, problems, x.want);
    const usd = info?.provider === "anthropic" ? costOf(info.model, { input_tokens: info.inputTokens - (info.cacheReadTokens ?? 0) - (info.cacheWriteTokens ?? 0), output_tokens: info.outputTokens,
      cache_read_input_tokens: info.cacheReadTokens ?? 0, cache_creation_input_tokens: info.cacheWriteTokens ?? 0 })
      : info?.provider === "bedrock" ? (info.inputTokens * 0.06 + info.outputTokens * 0.24) / 1e6 : 0;
    const row = { id: x.id, ok: !m.length, busy, ms, provider: info?.provider ?? "none", model: info?.model ?? "", usd, inT: info?.inputTokens ?? 0, outT: info?.outputTokens ?? 0, cacheR: info?.cacheReadTokens ?? 0, miss: m };
    rows.push(row);
    fs.appendFileSync(OUT, JSON.stringify({ ...row, q: x.q, plan }) + "\n");
    console.log(`${row.ok ? "PASS" : "FAIL"} ${x.id} ${ms} ms ${row.provider}/${row.model} $${usd.toFixed(5)} ${m.join("; ")}`);
  }
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  const q = (p: number) => ms[Math.min(ms.length - 1, Math.ceil(p * ms.length) - 1)];
  const sum = { file: path.basename(FILE), provider: process.env.AI_MAP_PROVIDER || "default", n: rows.length, passed: rows.filter((r) => r.ok).length, unanswered: rows.filter((r) => r.busy).length,
    median_ms: q(0.5), p90_ms: q(0.9), usd: Number(rows.reduce((a, r) => a + r.usd, 0).toFixed(5)), usd_per_q: Number((rows.reduce((a, r) => a + r.usd, 0) / Math.max(1, rows.length)).toFixed(6)),
    by_provider: rows.reduce((a, r) => ({ ...a, [r.provider]: (a[r.provider] ?? 0) + 1 }), {} as Record<string, number>), cache_read: rows.reduce((a, r) => a + r.cacheR, 0), out: OUT };
  console.log("SUMMARY " + JSON.stringify(sum));
  fs.appendFileSync(OUT, "SUMMARY " + JSON.stringify(sum) + "\n");
}, 3_600_000);
