/**
 * Ask the Map v2: can the AI plan step read the typo questions (eval/map-v2/typos.json and typos-holdout.json)? For each pair, the rules' plan
 * for the correctly written question is the target (rulesRoute, as askMap runs it). The AI then plans the typed question twice: as typed, and
 * after the speller (the console's path). A pass is the same plan (language aside). Pairs whose correct form the rules answer as an area brief
 * are skipped (the AI does not make briefs). One line per question to TYPO_AI_OUT; totals, time and US$ at the end.
 *   set AI_MAP_PROVIDER=anthropic&& npx vitest run --config vitest.live.config.ts src/lib/map/typoai.live.ts
 */
import fs from "fs";
import os from "os";
import path from "path";
import { beforeAll, expect, it, vi } from "vitest";
import { haveStore, loadFrozen } from "@/lib/assistant/__tests__/golden/harness";
import type { Plan } from "./plan";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));

const OUT = process.env.TYPO_AI_OUT || path.join(os.tmpdir(), `map-typo-ai-${Date.now()}.jsonl`);
interface TQ { id: string; q: string; same_as: string }

let ready = false;
beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
  ready = true;
}, 300_000);

it.runIf(haveStore())("the AI plan step on the typo questions, as typed and after the speller", async () => {
  expect(ready).toBe(true);
  vi.useRealTimers();
  const { world } = await import("./world");
  const ai = await import("./ai");
  const { makeResolver } = await import("./resolve");
  const { mapLang, fitModelPlan, freshPlan, rulesRoute } = await import("./route");
  const { spellerFor, modelWords } = await import("./ask");
  const { costOf } = await import("@/lib/ai/claudebudget");
  const { world: w, resolver } = await world();
  const resolve = makeResolver(resolver);
  const spell = spellerFor(resolver);
  const catLabels = new Map([...w.cats.entries()].map(([k, v]) => [k, v.label]));
  const sig = (p: Plan) => JSON.stringify({ ...freshPlan(p, w.now), language: null });
  // what shows a slip was understood: the layers taken, the incidents' category or family, the places and areas named, the kind of answer
  // (not the details a model may reasonably choose differently: a radius, "nearest" against "within", a status)
  const key = (p: Plan) => {
    const takes = p.steps.filter((s): s is Extract<Plan["steps"][number], { op: "take" }> => s.op === "take");
    const inc = takes.find((t) => t.layer === "incidents")?.filter;
    const places = new Set<string>();
    for (const st of p.steps) {
      if (st.op === "inside") { const a = st.area; places.add(a.kind === "point" ? a.ref : a.kind === "taluk" ? a.code : a.kind === "drawn" ? "drawn" : `${a.kind}:${a.id}`); }
      if (st.op === "along") places.add(st.line);
      if (st.op === "nearest" && st.from.startsWith("place:")) places.add(st.from.slice(6));
      if (st.op === "compare") for (const a of [st.a, st.b]) places.add(a.kind === "point" ? a.ref : a.kind === "taluk" ? a.code : a.kind === "drawn" ? "drawn" : `${a.kind}:${a.id}`);
    }
    const kinds = ["count_by", "hotspot", "farthest", "rank", "change", "compare"].filter((o) => p.steps.some((x) => x.op === o));
    return JSON.stringify({ layers: [...new Set(takes.map((t) => t.layer))].sort(), cats: [...(inc?.category ?? []), ...(inc?.family ?? [])].sort(), places: [...places].sort(), kinds });
  };
  const qs: (TQ & { set: string })[] = [
    ...JSON.parse(fs.readFileSync(path.join(process.cwd(), "eval", "map-v2", "typos.json"), "utf8")).questions.map((q: TQ) => ({ ...q, set: "tuned" })),
    ...JSON.parse(fs.readFileSync(path.join(process.cwd(), "eval", "map-v2", "typos-holdout.json"), "utf8")).questions.map((q: TQ) => ({ ...q, set: "holdout" }))];
  const plan = async (text: string): Promise<{ p: Plan | null; ms: number; usd: number }> => {
    const lang = mapLang(text, resolve(text, null));
    const places = resolve(text, null).slice(0, 6).map((f) => ({ ref: f.pick.entry.ref, kind: f.pick.entry.kind, name: f.pick.entry.name_en }));
    const t0 = Date.now();
    let p: Plan | null = null;
    try {
      const r = await ai.aiPlan(text, null, { cats: [...w.cats.keys()], depts: [...w.depts.keys()], places, user: "eval@map", lang, zones: w.zones, catLabels });
      if ("plan" in r) p = fitModelPlan(r.plan, text, w.now, null, modelWords(w, lang));
    } catch { p = null; }
    const info = ai.takeMapCallInfo();
    const usd = info?.provider === "anthropic" ? costOf(info.model, { input_tokens: info.inputTokens - (info.cacheReadTokens ?? 0) - (info.cacheWriteTokens ?? 0), output_tokens: info.outputTokens,
      cache_read_input_tokens: info.cacheReadTokens ?? 0, cache_creation_input_tokens: info.cacheWriteTokens ?? 0 }) : 0;
    return { p, ms: Date.now() - t0, usd };
  };
  type S = { n: number; raw: number; spelled: number; rawKey: number; spelledKey: number; skipped: number };
  const z = (): S => ({ n: 0, raw: 0, spelled: 0, rawKey: 0, spelledKey: 0, skipped: 0 });
  const score: Record<string, S> = { tuned: z(), holdout: z() };
  let usd = 0;
  const ms: number[] = [];
  for (const x of qs) {
    const env = { resolve, dept: () => null, lang: mapLang(x.same_as, resolve(x.same_as, null)), now: w.now };
    const want = rulesRoute(x.same_as, null, env);
    if (want?.kind !== "plan") { score[x.set].skipped++; fs.appendFileSync(OUT, JSON.stringify({ id: x.id, skipped: want?.kind ?? "none" }) + "\n"); continue; }
    score[x.set].n++;
    const a = await plan(x.q);
    const fixed = spell(x.q).text;
    const b = fixed === x.q ? a : await plan(fixed);
    usd += a.usd + (b === a ? 0 : b.usd);
    ms.push(a.ms);
    const okA = !!a.p && sig(a.p) === sig(want.plan), okB = !!b.p && sig(b.p) === sig(want.plan);
    const kA = !!a.p && key(a.p) === key(want.plan), kB = !!b.p && key(b.p) === key(want.plan);
    if (okA) score[x.set].raw++;
    if (okB) score[x.set].spelled++;
    if (kA) score[x.set].rawKey++;
    if (kB) score[x.set].spelledKey++;
    fs.appendFileSync(OUT, JSON.stringify({ id: x.id, set: x.set, q: x.q, read: fixed, raw: okA, spelled: okB, rawKey: kA, spelledKey: kB, want: key(want.plan), gotRaw: a.p ? key(a.p) : null, gotSpelled: b.p ? key(b.p) : null }) + "\n");
    console.log(`${x.id} raw=${okA}/${kA} spelled=${okB}/${kB} ${x.q}`);
  }
  ms.sort((p, q) => p - q);
  const sum = { score, usd: Number(usd.toFixed(5)), median_ms: ms[Math.floor(ms.length / 2)], out: OUT };
  console.log("TYPOAI " + JSON.stringify(sum));
  fs.appendFileSync(OUT, "SUMMARY " + JSON.stringify(sum) + "\n");
}, 3_600_000);
