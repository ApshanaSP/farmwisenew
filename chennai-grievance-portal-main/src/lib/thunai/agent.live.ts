/**
 * Live check of Thunai v2's agent on the configured model (THUNAI_PROVIDER: Groq by default; keys from .env): the 40
 * acceptance cases and the 20 held-out unseen cases of agent.cases.ts, each scored on the checked result (kind, screen
 * recipe and slots, Stage op, console steps). Data comes from fake hands (stagefake.ts) so only understanding is measured;
 * the screens' data is unit-tested and shown in the browser. As in the console, a Stage command the local parser knows
 * ("next", "only the Adyar ones") is answered without the model and counted as such.
 *   set LIVE_GAP_MS=7000&& npx vitest run --config vitest.live.config.ts src/lib/thunai/agent.live.ts
 * LIVE_SET=cases|unseen|all (default all); LIVE_FROM / LIVE_N run a slice; LIVE_OUT_DIR keeps the transcript.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { expect, it } from "vitest";
import { generateJson } from "@/lib/ai/gateway";
import { AgentPlanLenient, AgentPlanSchema, runThunaiAgent, type AgentResult } from "./agent";
import { CASES, UNSEEN, type Expect, type LiveCase, type StagePreset } from "./agent.cases";
import { START, WORLD } from "./fixture";
import { ZONE_TA_NAME } from "./lexicon";
import { buildScreen, emptySlots, type Slots } from "./screens";
import { fakeHands } from "./stagefake";
import { stageContext, type StageContext } from "./stage";
import { localStageCommand } from "./stagelocal";
import { isReflex } from "./plan";
import { understand } from "./understand";
import { referenceWorld } from "./world";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const provider = () => ((process.env.THUNAI_PROVIDER ?? "").trim() === "bedrock" ? "bedrock" : "groq");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function preset(p: StagePreset): Promise<StageContext | null> {
  if (!p) return null;
  const S = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null, sev: null };
  const slots: Record<Exclude<StagePreset, null>, [Parameters<typeof buildScreen>[0], Partial<Slots>]> = {
    cases: ["cases", { sev: "Severe" }], compare: ["compare", { zones: [13, 7], period: "weekly" }], news: ["news", {}], ranking: ["ranking", { measure: "rain", n: 3 }],
    performance: ["performance", { by: "dept" }]
  };
  const [recipe, s] = slots[p];
  return stageContext((await buildScreen(recipe, { ...emptySlots(), ...s }, S, world, fakeHands(), p)).doc);
}

interface Outcome { r: AgentResult | null; local: string | null }

/** Does the outcome meet the expectation? (`or`: any alternative) */
function meets(o: Outcome, e: Expect): boolean {
  if (e.or?.length && e.or.some((x) => meets(o, x))) return true;
  const own = { ...e, or: undefined };
  if (e.or?.length && !Object.keys(own).some((k) => k !== "or" && (own as Record<string, unknown>)[k] !== undefined)) return false;
  const r = o.r;
  if (o.local) {
    if (!e.op || !e.op.includes(o.local)) return false;
    return !e.recipe && !e.slots && !e.steps;
  }
  if (!r) return false;
  if (e.kind && r.kind !== e.kind) return false;
  if (e.recipe && !(r.stage && e.recipe.includes(r.stage.recipe))) return false;
  if (e.slots) {
    const s = (r.stage?.slots ?? {}) as Partial<Slots> & Record<string, unknown>;
    const sc = r.stage?.scope;
    const x = e.slots;
    if (x.sev && s.sev !== x.sev) return false;
    if (x.zones && !x.zones.every((z) => (s.zones ?? []).includes(z) || sc?.zone === z)) return false;
    if (x.cat && s.cat !== x.cat && sc?.cat !== x.cat) return false;
    if (x.metric && s.metric !== x.metric) return false;
    if (x.measure && !x.measure.includes(String(s.measure))) return false;
    if (x.by && s.by !== x.by) return false;
    if (x.period && (sc?.period ?? s.period) !== x.period) return false;
    if (x.what && s.what !== x.what) return false;
    if (x.q && !(typeof s.q === "string" && s.q.trim())) return false;
    if (x.dept && s.dept !== x.dept && sc?.dept !== x.dept) return false;
    if (x.depts && !x.depts.every((d) => (s.depts ?? []).includes(d))) return false;
  }
  if (e.op && !(r.stageOp && e.op.includes(r.stageOp.op))) return false;
  if (e.opN != null && r.stageOp?.n !== e.opN) return false;
  if (e.steps && !e.steps.every((a) => r.steps.some((st) => st.a === a))) return false;
  return true;
}

const which = (process.env.LIVE_SET ?? "all").toLowerCase();
const ALL: (LiveCase & { set: string })[] = [
  ...(which === "unseen" ? [] : CASES.map((c) => ({ ...c, set: "cases" }))),
  ...(which === "cases" ? [] : UNSEEN.map((c) => ({ ...c, set: "unseen" })))
];

it("Thunai v2 agent, live", async () => {
  const from = Number(process.env.LIVE_FROM ?? 0), n = Number(process.env.LIVE_N ?? ALL.length);
  const gap = Number(process.env.LIVE_GAP_MS ?? 0);
  const list = ALL.slice(from, from + n);
  const rows: { id: string; set: string; say: string; ok: boolean; ms: number; model: string | null; rounds: number; tokens: number; got: string }[] = [];
  for (const c of list) {
    const stage = await preset(c.stage ?? null);
    const local = stage ? localStageCommand(c.say) : null;
    let r: AgentResult | null = null;
    let tokens = 0;
    const t0 = Date.now();
    // as in the console: instant controls (go back, stop, confirm N) never wait for the model
    const rules = local ? null : understand(c.say, START, world, { speechConf: 0.95 });
    const reflex = rules?.kind === "do" && isReflex(rules.steps, START) ? rules.steps : null;
    if (reflex) r = { kind: "do", lang: "en", reply: null, steps: reflex, stage: null, stageOp: null, say: null, options: [], rounds: 0, calls: [], model: "instant", ms: 0, note: null };
    if (!local && !reflex) {
      r = await runThunaiAgent({ text: c.say, state: START, ctx: { turns: c.turns, now: START.now }, stage }, {
        world, hands: fakeHands(),
        llm: async (system, prompt, round, timeoutMs) => {
          const g = await generateJson({ role: provider() === "groq" ? "reasoning" : "fast", name: `thunai_agent${round}`, schema: AgentPlanSchema, lenient: AgentPlanLenient, system, prompt,
            temperature: 0, maxOutputTokens: 1100, user: "live:thunai-agent", prefer: provider(), timeoutMs });
          tokens += (g.info.inputTokens ?? 0) + (g.info.outputTokens ?? 0);
          return { plan: g.object, model: g.info.model };
        }
      }).catch(() => null);
    }
    const ms = Date.now() - t0;
    const ok = meets({ r, local: local?.op ?? null }, c.expect);
    const got = local ? `local:${local.op}` : r ? `${r.kind}${r.stage ? ` ${r.stage.recipe} ${JSON.stringify(Object.fromEntries(Object.entries(r.stage.slots).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length) && v !== "top")))}` : ""}${r.stageOp ? ` op:${r.stageOp.op}${r.stageOp.n ?? ""}` : ""}${r.steps.length ? ` steps:${r.steps.map((s) => s.a).join(",")}` : ""}${r.note ? ` note:${r.note}` : ""}` : "error";
    rows.push({ id: c.id, set: c.set, say: c.say, ok, ms, model: r?.model ?? (local ? "local" : null), rounds: r?.rounds ?? 0, tokens, got });
    console.log(`${ok ? "PASS" : "MISS"} ${c.id} ${ms}ms ${r?.model ?? (local ? "local" : "-")} ${JSON.stringify(c.say)} -> ${got}`);
    if (gap && !local && !reflex) await sleep(gap);
  }
  const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
  for (const set of ["cases", "unseen"]) {
    const rs = rows.filter((x) => x.set === set);
    if (!rs.length) continue;
    const timed = rs.filter((x) => x.model && x.model !== "local" && x.model !== "instant").map((x) => x.ms);
    const models = Object.entries(rs.reduce<Record<string, number>>((m, x) => ({ ...m, [x.model ?? "none"]: (m[x.model ?? "none"] ?? 0) + 1 }), {}));
    const tok = rs.filter((x) => x.tokens).map((x) => x.tokens);
    console.log(`\n${set}: ${rs.filter((x) => x.ok).length}/${rs.length} (${Math.round((rs.filter((x) => x.ok).length / rs.length) * 100)}%), p50 ${pct(timed, 0.5)} ms, p90 ${pct(timed, 0.9)} ms, ` +
      `tokens per sentence p50 ${pct(tok, 0.5)}, models ${models.map(([m, k]) => `${m}:${k}`).join(" ")}, local ${rs.filter((x) => x.model === "local").length}, instant ${rs.filter((x) => x.model === "instant").length}`);
  }
  const dir = process.env.LIVE_OUT_DIR ?? os.tmpdir();
  fs.writeFileSync(path.join(dir, `thunai-agent-live-${which}.json`), JSON.stringify(rows, null, 1));
  expect(rows.length).toBe(list.length);
}, 3_600_000);
