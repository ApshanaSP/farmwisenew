/**
 * v6, Phase 1: the model bake-off, on this repo's own dev set (eval/holdout/tuning24.jsonl, the grid's tuning set: no frozen set is
 * read) and from this PC. For each model the existing free Groq and Gemini keys can call:
 *   - understanding and JSON reliability: the SHIPPED planner call (grid cell B: today's prompt and schema) through the production
 *     gateway pinned to that one model (generateJson, strict schema, the lenient draft as production takes it); scored by grid/cells.ts
 *     scorePlan (kind and recipe match gold); every outcome kept: ok, draft_used, strict-mode 400 with no draft, 429, timeout, error;
 *   - speed: the same system prompt and request, STREAMED in plain JSON mode straight to the provider's API: time to the first content
 *     token, total time, output tokens, and output tokens a second after the first token.
 * No live Claude call (groqOnly()). Every call is recorded in the quota ledger; a model is skipped when the ledger has no room for its
 * whole share. Results: eval/v6/bakeoff/<model>.json, the table: eval/v6/bakeoff/TABLE.md (BAKE=table).
 *
 *   BAKE=run BAKE_MODELS="gemini:gemma-4-31b-it,groq:openai/gpt-oss-safeguard-20b" BAKE_N=12 BAKE_SPEED=6 \
 *     npx vitest run --config vitest.live.config.ts src/lib/thunai/bakeoff.live.ts
 *   BAKE=table npx vitest run --config vitest.live.config.ts src/lib/thunai/bakeoff.live.ts
 * BAKE_N=0 runs speed only (the Groq models whose understanding the v5 grid already measured on cell B).
 */
import fs from "fs";
import path from "path";
import { expect, it } from "vitest";
import { generateJson, onAttempt, schemaText, type AttemptEvent } from "@/lib/ai/gateway";
import { AgentPlanLenient } from "./agent";
import { wilson } from "./evalstats";
import { WORLD } from "./fixture";
import { ledger, LIMITS, type Org } from "./ledger";
import { ZONE_TA_NAME } from "./lexicon";
import { groqOnly } from "./liverecord";
import { referenceWorld } from "./world";
import { balancedOrder, cellCall, scorePlan, type TuningItem } from "./grid/cells";

groqOnly();

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const OUT = path.resolve(process.cwd(), "eval", "v6", "bakeoff");
const items = (): TuningItem[] => fs.readFileSync(path.resolve(process.cwd(), "eval", "holdout", "tuning24.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as TuningItem);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
const stat = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x)); return { n: v.length, p50: pct(v, 0.5), p90: pct(v, 0.9) }; };
const fileOf = (model: string) => path.join(OUT, `${model.replace(/[^a-z0-9.]+/gi, "-")}.json`);

interface Speed { id: string; lang: string; ttftMs: number | null; totalMs: number; outTokens: number | null; tps: number | null; status: number; err?: string }
interface Und { id: string; lang: string; ok: boolean; slotsOk: boolean; kind: string | null; recipe: string | null; outcome: string; ms: number; tokens: number }

/** one streamed call in plain JSON mode: the first content token's time, the total, the output tokens */
async function streamOnce(org: "groq" | "gemini", model: string, system: string, prompt: string): Promise<Omit<Speed, "id" | "lang">> {
  const t0 = performance.now();
  let first: number | null = null, out: number | null = null, status = 0;
  try {
    if (org === "groq") {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model, stream: true, stream_options: { include_usage: true }, temperature: 0, max_tokens: 500, response_format: { type: "json_object" },
          ...(model.startsWith("openai/") ? { reasoning_effort: "low", reasoning_format: "hidden" } : model.startsWith("qwen/") ? { reasoning_format: "hidden" } : {}),
          messages: [{ role: "system", content: system }, { role: "user", content: prompt }] })
      });
      status = r.status;
      if (!r.ok || !r.body) return { ttftMs: null, totalMs: Math.round(performance.now() - t0), outTokens: null, tps: null, status, err: (await r.text()).slice(0, 120) };
      const dec = new TextDecoder(); let buf = "";
      for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
        buf += dec.decode(chunk, { stream: true });
        for (let k = buf.indexOf("\n"); k >= 0; k = buf.indexOf("\n")) {
          const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1);
          if (!line.startsWith("data:") || line === "data: [DONE]") continue;
          const j = JSON.parse(line.slice(5)) as { choices?: { delta?: { content?: string } }[]; x_groq?: { usage?: { completion_tokens?: number } }; usage?: { completion_tokens?: number } };
          if (first == null && j.choices?.[0]?.delta?.content) first = performance.now();
          const u = j.usage ?? j.x_groq?.usage;
          if (u?.completion_tokens != null) out = u.completion_tokens;
        }
      }
    } else {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
        method: "POST", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
        body: JSON.stringify({ systemInstruction: model.startsWith("gemma") ? undefined : { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: model.startsWith("gemma") ? `${system}\n\n${prompt}` : prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 500, ...(model.startsWith("gemma") ? {} : { responseMimeType: "application/json" }) } })
      });
      status = r.status;
      if (!r.ok || !r.body) return { ttftMs: null, totalMs: Math.round(performance.now() - t0), outTokens: null, tps: null, status, err: (await r.text()).slice(0, 120) };
      const dec = new TextDecoder(); let buf = "";
      for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
        buf += dec.decode(chunk, { stream: true });
        for (let k = buf.indexOf("\n"); k >= 0; k = buf.indexOf("\n")) {
          const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1);
          if (!line.startsWith("data:")) continue;
          const j = JSON.parse(line.slice(5)) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]; usageMetadata?: { candidatesTokenCount?: number } };
          if (first == null && j.candidates?.[0]?.content?.parts?.some((p) => p.text && !p.thought)) first = performance.now();
          if (j.usageMetadata?.candidatesTokenCount != null) out = j.usageMetadata.candidatesTokenCount;
        }
      }
    }
  } catch (e) {
    return { ttftMs: first == null ? null : Math.round(first - t0), totalMs: Math.round(performance.now() - t0), outTokens: out, tps: null, status, err: (e as Error).name };
  }
  const total = performance.now() - t0;
  const ttft = first == null ? null : first - t0;
  return { ttftMs: ttft == null ? null : Math.round(ttft), totalMs: Math.round(total), outTokens: out, tps: ttft != null && out != null && total - ttft > 20 ? Math.round((out / ((total - ttft) / 1000)) * 10) / 10 : null, status };
}

it("bake-off", async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if ((process.env.BAKE ?? "run") === "table") return table();
  const models = (process.env.BAKE_MODELS ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => { const [org, ...m] = s.split(":"); return { org: org as "groq" | "gemini", model: m.join(":") }; });
  const N = Number(process.env.BAKE_N ?? 12), NS = Number(process.env.BAKE_SPEED ?? 6);
  const order = balancedOrder(items(), 20261117);
  // the production gateway pins one model from its pool: the pool is set to the models under test for this process only
  process.env.AI_MODEL_FAST = models.filter((m) => m.org === "groq").map((m) => m.model).join(",") || process.env.AI_MODEL_FAST;
  process.env.AI_GEMINI_MODEL_FAST = models.filter((m) => m.org === "gemini").map((m) => m.model).join(",") || process.env.AI_GEMINI_MODEL_FAST;
  for (const { org, model } of models) {
    // the day's allowance must hold this model's whole share (the ledger's rolling 24 h; a model it has no limit for is not capped here)
    const need = (N + NS) * 3200, tpd = LIMITS[`${org}/${model}`]?.tpd;
    const spent = ledger().spent(org as Org, model, 86_400_000).tokens;
    if (tpd != null && spent + need > tpd) { console.log(`${model}: skipped, the ledger holds ${tpd - spent} of the ${need} tokens it needs`); continue; }
    const und: Und[] = [], speed: Speed[] = [];
    for (const x of order.slice(0, N)) {
      const c = cellCall("B", x.text, world);
      const events: AttemptEvent[] = [];
      const off = onAttempt((e) => events.push(e));
      const t0 = Date.now();
      let plan: Record<string, unknown> | null = null;
      try {
        const r = await generateJson({ role: "fast", name: "bakeoff", schema: c.schema, lenient: AgentPlanLenient as never, system: c.system, prompt: c.prompt, temperature: 0, maxOutputTokens: 500, user: "bakeoff", lane: "eval", timeoutMs: 20_000, only: { provider: org, models: [model] } });
        plan = r.object as Record<string, unknown>;
      } catch { plan = null; }
      off();
      const last = events[events.length - 1];
      // the gateway reports attempts for some providers only: a plan in hand with no attempt event is an answered call
      const outcome = events.some((e) => e.outcome === "rate_limited") ? "rate_limited" : plan ? (last?.outcome === "draft_used" ? "draft_used" : "ok") : last?.outcome ?? "error";
      const tokens = events.reduce((a, e) => a + (e.inputTokens ?? 0) + (e.outputTokens ?? 0), 0);
      if (org === "gemini") ledger().record("gemini", model, { tokens, lane: "eval" });
      const s = scorePlan(x, outcome === "rate_limited" ? null : plan);
      und.push({ id: x.id, lang: x.lang, ok: s.ok, slotsOk: s.slotsOk, kind: s.kind, recipe: s.recipe, outcome, ms: Date.now() - t0, tokens });
      console.log(`${model} und ${x.id} ${x.lang} ${outcome} ok=${s.ok} ${Date.now() - t0} ms`);
      await sleep(org === "groq" ? 9000 : 6500);
    }
    for (const x of order.slice(0, NS)) {
      const c = cellCall("B", x.text, world);
      const sys = `${c.system}\n\nAnswer with one JSON object that follows this JSON schema:\n${schemaText(c.schema)}`;
      const r = await streamOnce(org, model, sys, c.prompt);
      ledger().record(org as Org, model, { tokens: Math.ceil((sys.length + c.prompt.length) / 4) + (r.outTokens ?? 300), lane: "eval" });
      speed.push({ id: x.id, lang: x.lang, ...r });
      console.log(`${model} speed ${x.id} ${JSON.stringify(r)}`);
      await sleep(org === "groq" ? 9000 : 6500);
    }
    fs.writeFileSync(fileOf(model), JSON.stringify({ org, model, at: new Date().toISOString(), set: "eval/holdout/tuning24.jsonl, seed 20261117 balanced order", und, speed }, null, 1));
  }
  table();
  expect(true).toBe(true);
});

function table() {
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith(".json"));
  let md = "# v6 model bake-off (Phase 1)\n\nFrom `eval/v6/bakeoff/*.json` (src/lib/thunai/bakeoff.live.ts), this PC, the existing free keys. Understanding: the shipped planner call (grid cell B) pinned to one model through the production gateway on the dev set `eval/holdout/tuning24.jsonl`; right = kind and recipe match gold; scored only where the model gave a plan (a 429, a strict-mode 400 with no usable draft, a timeout or an error is its own outcome). Speed: the same prompt streamed in plain JSON mode; TTFT = first content token; tok/s after the first token. n · p50 · p90.\n\n| Model | Right (scored) | EN | TA | Tanglish | Outcomes | Planner call ms | TTFT ms | Total ms | Output tok/s |\n|---|---|---|---|---|---|---|---|---|---|\n";
  for (const f of files.sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")) as { org: string; model: string; und: Und[]; speed: Speed[] };
    // scored where the model gave a plan (a parsed kind), whatever outcome label the first runs wrote for it
    const sc = j.und.filter((u) => u.outcome === "ok" || u.outcome === "draft_used" || (u.outcome !== "rate_limited" && u.kind != null));
    const right = sc.filter((u) => u.ok).length;
    const w = sc.length ? wilson(right, sc.length) : null;
    const byLang = (l: string) => { const s = sc.filter((u) => u.lang === l); return s.length ? `${s.filter((u) => u.ok).length}/${s.length}` : "-"; };
    const outcomes: Record<string, number> = {};
    for (const u of j.und) outcomes[u.outcome] = (outcomes[u.outcome] ?? 0) + 1;
    const f3 = (s: { n: number; p50: number | null; p90: number | null }) => (s.n ? `${s.n} · ${s.p50} · ${s.p90}` : "-");
    md += `| ${j.org}/${j.model} | ${sc.length ? `${right}/${sc.length}${w ? ` (${w.lo.toFixed(1)}-${w.hi.toFixed(1)} %)` : ""}` : "-"} | ${byLang("en")} | ${byLang("ta")} | ${byLang("tanglish")} | ${Object.entries(outcomes).map(([k, v]) => `${k} ${v}`).join(", ") || "-"} | ${f3(stat(j.und.map((u) => u.ms)))} | ${f3(stat(j.speed.map((s) => s.ttftMs)))} | ${f3(stat(j.speed.map((s) => s.totalMs)))} | ${f3(stat(j.speed.map((s) => s.tps)))} |\n`;
  }
  fs.writeFileSync(path.join(OUT, "TABLE.md"), md);
  console.log(md);
}
