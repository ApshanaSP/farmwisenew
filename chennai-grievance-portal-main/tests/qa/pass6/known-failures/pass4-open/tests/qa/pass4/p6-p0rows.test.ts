// QA pass 6, hunter pass4-open: pass 4 P0 rows PB-043 (en-brief-09) and PB-049 (en-numbers-06), graded again on this tree.
// The same path and grader as tests/qa/pass4/grader/run.test.ts (ClientSim + real planRound on the pinned snapshot, frozen clock, no model key), only these 7 rows,
// and the result goes to docs/qa/pass6/evidence/pass4-open/p0-rows.json (never to pass 4's results folder).
//   QA_PIN_PORT=3197 timeout 600 npx vitest run --config vitest.qa4.config.ts --dir tests/qa/pass6/probes/pass4-open p6-p0rows
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
// only under vitest.qa4.config.ts (dry-run store reading the pinned snapshot on 127.0.0.1); under another config this file stops before any import runs
vi.hoisted(() => { if (!(process.env.QA_GROQ_ONLY === "1" && process.env.AWS_STORE_DRY_RUN === "1" && /^http:\/\/127\.0\.0\.1:/.test(process.env.AWS_API_URL ?? ""))) throw new Error("pass4-open probe: run with vitest.qa4.config.ts only"); });
import { clearCaches } from "@/lib/thunai/round";
import { browserWorld, ClientSim, runConversation } from "../../../../../../../../tests/qa/pass4/grader/client-sim";
import * as gradeMod from "../../../../../../../../tests/qa/pass4/grader/grade.mjs";

const { gradeRow, Truth } = gradeMod as any;
const FROZEN = "2026-11-06T06:30:00.000Z";
const IDS = ["en-brief-09", "en-numbers-06"];
const OPEN = path.resolve(process.cwd(), "..", "docs", "qa", "pass4", "testsets", "open.jsonl");
const EVID = path.resolve(process.cwd(), "..", "docs", "qa", "pass6", "evidence", "pass4-open");
const rows = fs.readFileSync(OPEN, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => IDS.includes(r.id));
const out: Record<string, unknown>[] = [];
afterAll(() => { vi.useRealTimers(); fs.mkdirSync(EVID, { recursive: true }); fs.writeFileSync(path.join(EVID, "p0-rows.json"), JSON.stringify(out, null, 1)); });

describe("pass 4 P0 rows still open in BUGS.json", () => {
  it("both are in the open set", () => expect(rows.map((r) => r.id).sort()).toEqual([...IDS].sort()));
  let world: any, list: any, T: any;
  it.each(IDS)("%s is not graded wrong", async (id) => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) });
    if (!world) ({ world, list } = await browserWorld());
    T ??= new Truth();
    const r = rows.find((x) => x.id === id)!;
    vi.setSystemTime(new Date(FROZEN));
    clearCaches();
    const sim = new ClientSim(world, {}, list);
    const earlier = (r.earlier ?? []).filter((t: { who: string }) => t.who === "collector").map((t: { text: string }) => t.text);
    const c = await runConversation(sim, earlier, r.text);
    const o = c.last;
    const a = { lane: o.lane, path: o.path, kind: o.kind, note: o.note, said: o.said, said_lang: o.lang, voice: o.voice, items: o.items, options: o.options,
      spoken: o.stage ? { en: o.stage.say.en, ta: o.stage.say.ta } : { [o.lang]: o.said }, stage: o.stage, steps: o.steps, stage_op: o.stageOp, drafted: o.drafted, rules: o.rules, error: o.error,
      model_needed: o.rounds.some((x) => x.lane === "no-model" || x.note === "no-model" || x.note === "general-fallback"), hops: o.rounds.flatMap((x) => x.hops),
      rounds: o.rounds.map((x) => ({ round: x.round, status: x.status, lane: x.lane, note: x.note, kind: x.kind, trace: x.trace })),
      console: { page: sim.page, period: sim.period, zone: sim.zone, dept: sim.dept, cat: sim.cat, taluk: sim.taluk, sev: sim.sevTab, panel: sim.panel, incident: sim.incident, stage_open: sim.doc?.recipe ?? null } };
    const base = { id: r.id, lang: r.lang, family: r.family, text: r.text, earlier: r.earlier, expect: r.expect, must: r.must, must_not: r.must_not, must_not_contain: r.must_not_contain };
    const row = { ...base, ...a };
    const g = gradeRow(r, row, T);
    out.push({ id, text: r.text, lane: a.lane, kind: a.kind, said: a.said, title: o.stage?.title ?? null, console: a.console, grade: g.grade, confident_wrong: g.confident_wrong, reasons: g.reasons });
    expect(g.grade, `${id}: ${a.said} | ${(g.reasons ?? []).join("; ")}`).not.toBe("wrong");
  });
});
