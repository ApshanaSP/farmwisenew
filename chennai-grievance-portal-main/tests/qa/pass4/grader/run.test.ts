// QA pass 4: the sentence runner. Every row goes down Jarvis's real path: the browser's handle() written out in client-sim.ts, the real planRound with serverWorld() and
// serverHands() on the real store with the pinned snapshot. The clock is frozen at 2026-11-06 12:00 IST, for Date only. Nothing here decides an answer.
//   QA_P4_SET=open QA_P4_LABEL=open-baseline-codelanes npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/grader/run.test.ts
//   QA_P4_MODE=live QA_P4_SET=open QA_P4_LABEL=open-live QA_P4_SAMPLE=40 QA_P4_SEED=20261106 npx vitest run --config vitest.qa4-live.config.ts tests/qa/pass4/grader/run.test.ts
// A follow-up row's earlier collector turns run first, through the same path and the same tab, so the next sentence goes out with the state a browser would send.
// The assistant lines in the set are the author's picture of an earlier turn: they are kept in the results but never sent, since a browser only sends what really happened.
// The sealed run: QA_P4_SET=sealed reads the gz here and nowhere else, prints no row, and writes results/sealed-<mode>.json only if that file does not exist yet.
import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { asOf, exportMeta } from "@/lib/collector/intel";
import { GROQ_MODELS } from "@/lib/thunai/llm";
import { ledger } from "@/lib/thunai/ledger";
import { clearCaches } from "@/lib/thunai/round";
import type { StageDocT } from "@/lib/thunai/stage";
import { browserWorld, ClientSim, runConversation, type Outcome } from "./client-sim";
import * as gradeMod from "./grade.mjs";
import * as setsMod from "./sets.mjs";

// plain .mjs tools: typed loosely here
const { gradeRow, tally, Truth } = gradeMod as any;
const { openRun } = setsMod as any;

const FROZEN = "2026-11-06T06:30:00.000Z";
const SET = process.env.QA_P4_SET;
const MODE = process.env.QA_P4_MODE === "live" ? "live" : "codelanes";
const LABEL = process.env.QA_P4_LABEL ?? "";
/** a live run needs at least this many tokens left today, across the Groq models, for each row it will run */
const TOKENS_PER_ROW = 3000;

/** The screen as the results keep it: all it says and shows, without the map's points and outlines. */
function slim(d: StageDocT | null) {
  if (!d) return null;
  return { recipe: d.recipe, title: d.title, takeaway: d.takeaway, say: d.say, scope: d.scope, slots: d.slots, sources: d.sources, asOf: d.asOf, notes: d.notes, next: d.next,
    blocks: d.blocks.map((b) => {
      if (b.kind === "MapView") return { kind: b.kind, id: b.id, title: b.title, points: b.points.length, rule: b.rule };
      if (b.kind === "Compare") return { ...b, sides: b.sides.map((s) => ({ ...s, series: [] })) };
      return b;
    }) };
}

/** What a row did, in the form the grader reads. */
function answerOf(o: Outcome, sim: ClientSim) {
  const last = o.rounds[o.rounds.length - 1];
  const modelNeeded = o.rounds.some((r) => r.lane === "no-model" || r.note === "no-model" || r.note === "general-fallback");
  const model = o.server?.model ?? o.rounds.map((r) => r.model).filter(Boolean).pop() ?? null;
  return { lane: o.lane, path: o.path, kind: o.kind, note: o.note ?? o.rounds.map((r) => r.note).filter(Boolean).pop() ?? null, model, model_needed: modelNeeded, tokens: last?.tokens ?? 0, calls: last?.calls ?? 0, hops: o.rounds.flatMap((r) => r.hops),
    latency_ms: o.ms, rounds: o.rounds.map((r) => ({ round: r.round, status: r.status, lane: r.lane, note: r.note, kind: r.kind, ms: r.ms, trace: r.trace })), said: o.said, said_lang: o.lang, voice: o.voice, items: o.items, options: o.options,
    spoken: o.stage ? { en: o.stage.say.en, ta: o.stage.say.ta } : { [o.lang]: o.said }, stage: slim(o.stage), steps: o.steps, stage_op: o.stageOp, drafted: o.drafted, rules: o.rules, error: o.error,
    console: { page: sim.page, period: sim.period, zone: sim.zone, dept: sim.dept, cat: sim.cat, taluk: sim.taluk, sev: sim.sevTab, panel: sim.panel, incident: sim.incident, stage_open: sim.doc?.recipe ?? null } };
}

/** The figures on a screen, plainly: for a person reading the results. */
function figuresOf(d: StageDocT | null) {
  const out: { where: string; label: string; value: number }[] = [];
  for (const b of d?.blocks ?? []) {
    if (b.kind === "Kpis") for (const i of b.items) out.push({ where: "tile", label: i.label, value: i.value });
    if (b.kind === "CaseList") out.push({ where: "list total", label: b.title, value: b.total });
    if (b.kind === "Ranking") for (const i of b.items) out.push({ where: "ranking", label: i.label, value: i.value });
    if (b.kind === "Answer") for (const f of b.facts) out.push({ where: "fact", label: f.label, value: f.value });
  }
  return out;
}

describe.runIf(SET)("QA pass 4: the sentence runner", () => {
  it(`${SET}, ${MODE}`, async () => {
    const live = MODE === "live";
    if (live) {
      expect(process.env.QA_GROQ_ONLY).toBe("1");
      expect(process.env.ANTHROPIC_API_KEY ?? "").toBe("");
      expect(process.env.AI_FORCE_PROVIDER ?? "").toBe("");
      expect(process.env.GROQ_API_KEY ?? "", "a live run needs a Groq key in the process").not.toBe("");
    } else {
      expect(process.env.GROQ_API_KEY ?? "", "a code-lane run has no model key").toBe("");
    }
    const sealed = SET === "sealed";
    const sampleN = process.env.QA_P4_SAMPLE ? Number(process.env.QA_P4_SAMPLE) : null;
    // the quota is read before a sealed run claims its one go
    if (live) {
      const left = GROQ_MODELS.reduce((a, m) => a + Math.max(0, ledger().room("groq", m).left.tpd ?? 0), 0);
      const need = (sampleN ?? 180) * TOKENS_PER_ROW;
      if (left < need) throw new Error(`too little Groq quota left today: ${left} tokens, and this run needs about ${need}. Run QA_LIVE=quota to see it.`);
    }
    const run = openRun({ set: SET!, label: LABEL, mode: MODE, sample: sampleN, seed: process.env.QA_P4_SEED ? Number(process.env.QA_P4_SEED) : 20261106 });
    const T = new Truth();
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN), shouldAdvanceTime: live });
    const started = FROZEN;
    const { world, list } = await browserWorld();
    const out: Record<string, unknown>[] = [];
    const t0 = performance.now();
    for (const r of run.rows as any[]) {
      vi.setSystemTime(new Date(FROZEN));
      clearCaches();
      const earlier = (r.earlier ?? []).filter((t: { who: string }) => t.who === "collector").map((t: { text: string }) => t.text);
      const base = { id: r.id, lang: r.lang, family: r.family, text: r.text, earlier: r.earlier, expect: r.expect, must: r.must, must_not: r.must_not, must_not_contain: r.must_not_contain };
      let row: Record<string, unknown>;
      try {
        let sim = new ClientSim(world, {}, list);
        let c = await runConversation(sim, earlier, r.text);
        let a = answerOf(c.last, sim);
        // QA_P4_PACE=1: a row refused for the per-minute token limit is retried after a pause (up to 4 times), so capacity does not hide the verdict. Off by default.
        for (let k = 0; live && process.env.QA_P4_PACE && a.model_needed && k < 4; k++) {
          await new Promise((res) => setTimeout(res, 20_000));
          sim = new ClientSim(world, {}, list);
          c = await runConversation(sim, earlier, r.text);
          a = answerOf(c.last, sim);
        }
        const invalid = live && a.model && !GROQ_MODELS.some((m) => String(a.model).replace(/#\d+$/, "").startsWith(m)) ? String(a.model) : null;
        const earlierDone = c.earlier.map((e) => ({ lane: e.lane, kind: e.kind, recipe: e.stage?.recipe ?? null, title: e.stage?.title ?? null, said: e.said.slice(0, 240), steps: e.steps, error: e.error }));
        // a row that a live server could not answer for lack of capacity is not a verdict on the understanding
        const capacity = live && a.model_needed;
        row = { ...base, ...a, figures: figuresOf(c.last.stage), earlier_outcomes: earlierDone, ...(invalid ? { invalid_provider: invalid } : {}), ...(capacity ? { capacity: true } : {}) };
      } catch (e) {
        row = { ...base, crash: String((e as Error).stack ?? e).slice(0, 1200), lane: "crash", kind: "none", said: "", items: [], options: [], steps: [], stage: null };
      }
      let g: Record<string, unknown>;
      try { g = gradeRow(r, row, T); } catch (e) { g = { grade: "wrong", confident_wrong: false, did: "grader-crash", checks: {}, reasons: [`the grader failed on this row: ${String((e as Error).stack ?? e).slice(0, 600)}`], unchecked_must: [], grader_crash: true }; }
      out.push({ ...row, ...g });
    }
    vi.useRealTimers();
    const meta = await exportMeta();
    const summary = tally(out);
    const doc = { label: run.sealed ? `sealed-${MODE}` : LABEL, set: SET, set_hash: run.hash, mode: MODE, frozen_clock: started, as_of: await asOf(), build_id: meta.build_id, sample: sampleN, seed: process.env.QA_P4_SEED ?? null, ms: Math.round(performance.now() - t0), summary, rows: out };
    fs.writeFileSync(run.outFile, JSON.stringify(doc, null, 1));
    // the numbers only: a sealed run prints no row
    console.log(JSON.stringify({ label: doc.label, ...summary, invalid_provider: out.filter((x) => x.invalid_provider).length, crashes: out.filter((x) => x.crash).length }));
    expect(out.filter((x) => x.invalid_provider).map((x) => (sealed ? "row" : x.id)), "answered by another provider").toEqual([]);
    expect(out.filter((x) => x.grader_crash).map((x) => (sealed ? "row" : x.id)), "the grader must not crash").toEqual([]);
  }, 7_200_000);
});
