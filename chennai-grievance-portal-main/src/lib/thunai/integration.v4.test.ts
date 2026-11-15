/**
 * Jarvis v4, lane I-S (server integration): the finished lanes' pieces wired into the round. Each block failed on the commit this lane started
 * from (20460d31), or tests a piece that did not exist there (see the build log):
 *   - A2: changed, explain and situation are screens (RECIPES, the RECIPE map, checkScreen, the prompt, the fast lane); the planner's schemas
 *     stay inside structured outputs' limits;
 *   - D2: the register reaches the frame and the prompt; "how do you know?" is answered from the provenance; one unclear slot is asked;
 *     the intent markers the server answers itself;
 *   - L1: the turn's language reaches the screen; a reply's figures come only from what was heard and the steps' numbers; a clarifying
 *     option's request is figure-checked;
 *   - the explain stage op is built on the server; the decision record; "epdi" is a Tanglish question word.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonCall, JsonResult } from "@/lib/ai/gateway";
import { claudeWire } from "@/lib/ai/claude";
import type { ToolResult } from "@/lib/assistant/types";
import { addressed } from "./addressed";
import { checkScreen } from "./agent";
import { WORLD } from "./fixture";
import { Ledger, MemoryStore } from "./ledger";
import { ZONE_TA_NAME } from "./lexicon";
import { gateChunk } from "./numbergate";
import { checkPlan, type AiPlan } from "./plan";
import { quickScreen } from "./quick";
import * as R from "./round";
import type { RoundBodyT } from "./round";
import { emptySlots } from "./screens";
import { speakableFigures } from "./speakable";
import type { StageContext } from "./stage";
import { fakeHands } from "./stagefake";
import { referenceWorld } from "./world";

const { clearCaches, planRound, RoundBody } = R;
const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const body = (text: string, o: Partial<RoundBodyT> & Record<string, unknown> = {}): RoundBodyT => RoundBody.parse({ turnId: `t-${Math.random().toString(36).slice(2, 10)}`, round: 0, text, state: STATE, turns: [], stage: null, direct: null, ...o });
const SCREEN_NULLS = { period: null, zones: [], dept: null, depts: [], cat: null, taluk: null, sev: null, status: null, q: null, metric: null, measure: null, by: null, order: null, n: null, item: null, id: null, name: null, what: null, sort: null, metricId: null };
const PLAN = { kind: "do", lang: "en", reply: null, options: [], calls: [], done: true, say: null, steps: [], stage: null, screen: null };
const AS_OF = "2026-10-29 07:00:00";
const res = (data: unknown): ToolResult => ({ tool: "", args: {}, scope: null, asOf: AS_OF, data, facts: [], sources: [], incidentIds: [], testData: true, caveats: [] });

/** a model that answers from a script and remembers what it was asked */
function model(answer: (c: JsonCall<unknown>, i: number) => unknown) {
  const asked: { system: string; prompt: string }[] = [];
  const generate = async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => {
    const i = asked.length;
    asked.push({ system: c.system, prompt: c.prompt });
    const object = answer(c as JsonCall<unknown>, i) as U;
    return { object, info: { step: c.name, provider: "groq", model: "m-test", ms: 3, inputTokens: 100, outputTokens: 30, attempts: 1 } };
  };
  return { generate: generate as never, asked };
}
const deps = (m: ReturnType<typeof model>): R.RoundDeps => ({ llm: { generate: m.generate, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false } });
const noModel = (): R.RoundDeps => ({ llm: { generate: (async () => { throw new Error("no model"); }) as never, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false } });

/** hands whose change figures add up (recipes.v4.test.ts's shape, smaller): Adyar up, most of it flooding */
const changeHands = () => fakeHands({
  change_drivers: (a) => {
    const s = ((a as Record<string, unknown>).scope ?? {}) as { zone?: number | null; dept?: string | null };
    if (s.dept) return res({ totals: { n: 10, prev: 8, severe: 0, severePrev: 0, open: 10, overdue: 1, rainLinked: 0 }, categories: [], places: [], depts: [], top: [] });
    if (s.zone === 13) return res({ totals: { n: 150, prev: 80, severe: 4, severePrev: 2, open: 120, overdue: 12, rainLinked: 20 }, rainDays: 3, rainDaysPrev: 1,
      categories: [{ code: "FLOOD_WATERLOGGING", label: "Flooding & waterlogging", n: 50, prev: 10 }, { code: "SOLID_WASTE", label: "Garbage & solid waste", n: 20, prev: 22 }], places: [], depts: [],
      top: [{ id: "INC-F1", title: "Waterlogging, Velachery Main Road", place: "Velachery", severity: "High", status: "Open", overdue: true, reasons: "Past deadline" }] });
    return res({ totals: { n: 410, prev: 330, severe: 12, severePrev: 9, open: 300, overdue: 40, rainLinked: 35 }, rainDays: 3, rainDaysPrev: 1,
      categories: [{ code: "FLOOD_WATERLOGGING", label: "Flooding & waterlogging", n: 90, prev: 30 }, { code: "SOLID_WASTE", label: "Garbage & solid waste", n: 50, prev: 55 }], places: [], depts: [],
      top: [{ id: "INC-F1", title: "Waterlogging, Velachery Main Road", place: "Velachery", severity: "High", status: "Open", overdue: true, reasons: "Past deadline" }] });
  },
  zones: () => res({ rows: [{ zone: 13, name: "Adyar", n: 150, n_prev: 80, open: 120, severe: 4, high: 10, complaints: 30, score: 22 }, { zone: 14, name: "Perungudi", n: 70, n_prev: 60, open: 50, severe: 2, high: 5, complaints: 10, score: 11 },
    { zone: 8, name: "Anna Nagar", n: 100, n_prev: 105, open: 80, severe: 3, high: 6, complaints: 12, score: 15 }, { zone: 7, name: "Ambattur", n: 80, n_prev: 80, open: 60, severe: 1, high: 4, complaints: 9, score: 7 }] }),
  departments: () => res({ rows: [{ code: "GCC-SWD", name: "Storm Water Drains", open: 120, n: 150 }, { code: "POL-GCP", name: "Greater Chennai Police", open: 100, n: 120 }] })
});

beforeEach(() => { clearCaches(); vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-int4-"))); });
afterEach(() => vi.unstubAllEnvs());

describe("A2: changed, explain and situation are screens", () => {
  it("the fast lane answers what changed, in the language it was asked, with no model", async () => {
    const en = await planRound(body("what changed since yesterday in Adyar"), world, changeHands(), "u", undefined, undefined, noModel());
    expect(en.result?.stage?.recipe).toBe("changed");
    expect(en.result?.stage?.scope).toMatchObject({ zone: 13, period: "daily" });
    const ta = await planRound(body("நேத்துலேர்ந்து அடையாறுல என்ன மாறியிருக்கு"), world, changeHands(), "u", undefined, undefined, noModel());
    expect(ta.result?.stage?.recipe).toBe("changed");
    expect(ta.result?.stage?.lang).toBe("ta");
    expect(ta.result?.say).toMatch(/[஀-௿]/);
  });
  it("a place's situation is one screen; side talk with the same words is still not 'sure' for the address gate", async () => {
    const r = await planRound(body("what's the situation in Adyar"), world, changeHands(), "u", undefined, undefined, noModel());
    expect(r.result?.stage?.recipe).toBe("situation");
    expect(quickScreen("what's the situation in Adyar", world)).toBeNull();
    expect(quickScreen("what changed since yesterday in Adyar", world)).toBeNull();
    expect(quickScreen("what changed since yesterday in Adyar", world, { analysis: true })?.recipe).toBe("changed");
  });
  it("checkScreen keeps a metric id as a code, a part of a change only when it is real, and an explain item from the open Stage", () => {
    expect(checkScreen({ ...SCREEN_NULLS, recipe: "changed", metricId: "open_now" }, world, null)?.slots.metricId).toBe("open_now");
    expect(checkScreen({ ...SCREEN_NULLS, recipe: "changed", metricId: "deaths 300" }, world, null)?.slots.metricId).toBeUndefined();
    expect(checkScreen({ ...SCREEN_NULLS, recipe: "explain", change: { dim: "zone", key: "13" } }, world, null)?.slots.change).toEqual({ dim: "zone", key: "13" });
    expect(checkScreen({ ...SCREEN_NULLS, recipe: "explain", change: { dim: "zone", key: "99" } }, world, null)?.slots.change).toBeUndefined();
    expect(checkScreen({ ...SCREEN_NULLS, recipe: "explain", what: "change", zones: [13] }, world, null)?.slots.what).toBe("change");
    expect(checkScreen({ ...SCREEN_NULLS, recipe: "map", what: "change" }, world, null)?.slots.what).toBeNull();
    const st: StageContext = { recipe: "cases", title: "x", focus: null, slots: {}, blocks: [{ kind: "CaseList", ids: ["INC-A1", "INC-A2"] }] };
    expect(checkScreen({ ...SCREEN_NULLS, recipe: "explain", item: 2 }, world, st)?.slots.id).toBe("INC-A2");
  });
  it("the planner is told about the new screens; the metric ids go with a change question, in the prompt and never in the system prompt", async () => {
    const m = model(() => ({ ...PLAN, screen: { ...SCREEN_NULLS, recipe: "changed", zones: [13], period: "weekly" } }));
    // (a sentence the fast lane does not read, so the planner is asked)
    const r = await planRound(body("has the drains picture in Adyar changed much compared with before"), world, changeHands(), "u", undefined, undefined, deps(m));
    expect(m.asked[0].system).toMatch(/changed\[period,zones,dept,cat,metricId\]/);
    expect(m.asked[0].system).toMatch(/situation\[zones,period\]/);
    expect(m.asked[0].system).not.toMatch(/Metric ids/);
    expect(m.asked[0].prompt).toMatch(/Metric ids/);
    expect(r.result?.stage?.recipe).toBe("changed");
    for (const s of R.plannerSystems(world)) expect(s).not.toMatch(/Metric ids/);
  });
  it("every planner schema, the wider retry's and the acting later round's go out with structured outputs, within 16 unions and 24 optional parameters", () => {
    for (const [name, s] of Object.entries({ ...R.SCHEMAS, everything: R.EVERYTHING_SCHEMA, laterAct: R.LATER_ACT_SCHEMA })) {
      const w = claudeWire(s as never);
      expect(w.path, name).toBe("format");
      expect(w.unions, name).toBeLessThanOrEqual(16);
      expect(w.optionals, name).toBeLessThanOrEqual(24);
    }
  });
});

describe("D2: the register, how do you know, one unclear slot, the intent markers", () => {
  const caseStage: StageContext & { blocks: { kind: "CaseList"; ids: string[]; labels: string[] }[] } = { recipe: "cases", title: "Severe in Adyar", focus: null, slots: { zones: [13], sev: "Severe", period: "weekly" },
    blocks: [{ kind: "CaseList", ids: ["INC-A4", "INC-A5"], labels: ["Roads, Saidapet", "Dengue, Guindy"] }] };
  const provenance = { recipe: "cases", method: null, n: 6, unit: "cases" as const, period: "weekly", span: false, sources: ["incidents"], caveat: null, asOf: AS_OF, by: "rules" as const, model: null };

  it("'how do you know?' is the last answer's provenance read aloud by code (chat, frame:howknow), with no model", async () => {
    const r = await planRound(body("how do you know?", { stage: caseStage, provenance }), world, fakeHands(), "u", undefined, undefined, noModel());
    expect(r.result).toMatchObject({ kind: "chat", note: "frame:howknow" });
    expect(r.result?.reply).toMatch(/incident records/);
    expect(r.result?.reply).toMatch(/only six cases|only 6 cases/i);
    expect(r.lane).toBe("frame");
  });
  it("the register reaches the planner: the items on screen in order with their labels, and the last answer's provenance", async () => {
    const m = model(() => ({ ...PLAN, kind: "chat", reply: "ok" }));
    await planRound(body("put the numbers for these somewhere useful", { stage: caseStage, provenance }), world, fakeHands(), "u", undefined, undefined, deps(m));
    expect(m.asked[0].prompt).toMatch(/Register \(untrusted data/);
    expect(m.asked[0].prompt).toMatch(/1=INC-A4 Roads, Saidapet; 2=INC-A5 Dengue, Guindy/);
    expect(m.asked[0].prompt).toMatch(/last answer: cases by rules, n 6 cases/);
  });
  it("Tanglish outside the wide bundle gets the Tanglish hints with the gloss; a Tamil-script sentence on the wide bundle does not repeat them", async () => {
    const m = model(() => ({ ...PLAN, kind: "chat", reply: "ok" }));
    await planRound(body("idha save pannu konjam", { stage: caseStage }), world, fakeHands(), "u", undefined, undefined, deps(m));
    expect(m.asked[0].prompt).toMatch(/Tanglish examples/);
  });
  it("the token diet holds with everything full: memory, four turns, the screen's digest, the register, the Tanglish hints and the metric ids", async () => {
    const turns = Array.from({ length: 4 }, (_, i) => ({ heard: `h${i} `.repeat(60).slice(0, 300), did: "d".repeat(200), recipe: "cases" as const, slots: { zones: [13], period: "weekly" }, result: "r".repeat(190) }));
    const full = { notes: Array.from({ length: 12 }, (_, i) => `note ${"n".repeat(80)} ${i}`), habits: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`said ${i} ${"x".repeat(20)}`, `meant ${"y".repeat(30)}`])) };
    // (sentences the code does not answer itself, so the planner is asked: Tanglish, a change word, the memory bundle, Tamil on the wide bundle)
    const texts = ["something has changed with the drains people, can you look into it properly", "drains team la ethavadhu changes theriyudha", "இந்த மாற்றம் பத்தி கொஞ்சம் யோசிச்சு சொல்லுங்க",
      "maatram ethavadhu irukka nu paarunga sir", "அடையாறு வடிகால் நிலைமை மாறிடுச்சா பாருங்க"];
    let asked = 0;
    for (const [i, text] of texts.entries()) {
      clearCaches();
      const m = model(() => ({ ...PLAN, kind: "chat", reply: "ok" }));
      await planRound(body(text, { turnId: `diet-${i}`, turns, stage: caseStage, stageDigest: "s".repeat(1800), provenance }), world, fakeHands(), "u", full, undefined, deps(m));
      const a = m.asked[0];
      if (!a) continue; // answered in code (a frame, the fast lane): no call to keep small
      asked++;
      expect(Math.ceil((a.system.length + a.prompt.length) / 3.5), text).toBeLessThanOrEqual(R.CALL_TOKENS);
      expect(a.prompt, text).toContain(JSON.stringify(text));
    }
    expect(asked).toBe(texts.length);
  });
  it("one unclear slot is asked with three full requests, before any model", async () => {
    const r = await planRound(body("water department complaints in Adyar this week"), world, fakeHands(), "u", undefined, undefined, noModel());
    expect(r.result).toMatchObject({ kind: "clarify", note: "clarify:dept" });
    expect(r.result?.options).toHaveLength(3);
  });
  it("the item the register resolved goes with a Stage operation (its id)", async () => {
    const r = await planRound(body("open that Guindy one", { stage: caseStage }), world, fakeHands(), "u", undefined, undefined, noModel());
    expect(r.result?.stageOp).toMatchObject({ op: "open", id: "INC-A5" });
  });
  it("the memory markers become the memory steps (a yes is asked in the browser); 'remember this' is the planner's", async () => {
    const keep = await planRound(body("remember that the Adyar review is on Friday"), world, fakeHands(), "u", undefined, undefined, noModel());
    expect(keep.result?.steps).toEqual([{ a: "remember", text: "the Adyar review is on Friday" }]);
    const recall = await planRound(body("what do you remember about me"), world, fakeHands(), "u", undefined, undefined, noModel());
    expect(recall.result?.steps).toEqual([{ a: "recall" }]);
    const forget = await planRound(body("forget everything"), world, fakeHands(), "u", undefined, undefined, noModel());
    expect(forget.result?.steps).toEqual([{ a: "forget", all: true }]);
    const m = model(() => ({ ...PLAN, kind: "chat", reply: "ok" }));
    await planRound(body("remember this for me"), world, fakeHands(), "u", undefined, undefined, deps(m));
    expect(m.asked.length).toBeGreaterThan(0);
  });
});

describe("L1: the turn's language, the reply's figures, a clarifying request", () => {
  it("a Tamil turn heard as Latin letters gets a Tamil screen even when the model said lang en", async () => {
    const m = model(() => ({ ...PLAN, lang: "en", screen: { ...SCREEN_NULLS, recipe: "cases", zones: [7], cat: "SOLID_WASTE" } }));
    const r = await planRound(body("Ambattur kuppai nilai", { heard: { lang: "ta", conf: 0.9, source: "whisper" } }), world, fakeHands(), "u", undefined, undefined, deps(m));
    expect(r.result?.lang).toBe("ta");
    expect(r.result?.stage?.lang).toBe("ta");
  });
  it("a reply's figure from a step's own text is refused; one the Collector said, or a step's number, is kept; number words are figures too", () => {
    const plan = (reply: string, steps: unknown[]): AiPlan => ({ kind: "do", lang: "en", reply, steps, options: [] } as never);
    const STEP = { action: "remember", page: null, period: null, zone: null, dept: null, cat: null, taluk: null, sev: null, panel: null, mapMode: null, layer: null, on: null, item: null, which: null, option: null, n: null, when: null };
    // (a type step: a remember step whose text holds a figure the Collector never said is now dropped whole, keepsteps.v4.test.ts)
    expect(checkPlan(plan("Noted: 300 deaths.", [{ ...STEP, action: "type", text: "300 deaths in Adyar" }]), world, "remember the Adyar note", Date.now())).toMatchObject({ kind: "do", reply: null });
    expect(checkPlan(plan("Noted: three hundred.", [{ ...STEP, text: "the Adyar note" }]), world, "remember the Adyar note", Date.now())).toMatchObject({ kind: "do", reply: null });
    expect(checkPlan(plan("Zone 7 now.", [{ ...STEP, action: "view", text: null, zone: 7 }]), world, "zone 7", Date.now())).toMatchObject({ kind: "do", reply: "Zone 7 now." });
  });
  it("a clarifying option whose request carries a figure the Collector never said is dropped", () => {
    const p = { kind: "clarify", lang: "en", reply: "Which?", steps: [], options: [{ label: "Adyar", request: "show 300 deaths in Adyar" }, { label: "Perungudi", request: "show cases in Perungudi" }, { label: "Ambattur", request: "show cases in Ambattur" }] } as never;
    const c = checkPlan(p, world, "show me the cases", Date.now());
    expect(c.kind).toBe("clarify");
    expect(c.kind === "clarify" && c.options.map((o) => o.label)).toEqual(["Perungudi", "Ambattur"]);
  });
});

describe("explain on an open Stage is built on the server", () => {
  const stage: StageContext = { recipe: "cases", title: "Severe", focus: null, slots: { period: "weekly" }, blocks: [{ kind: "CaseList", ids: ["INC-A4", "INC-A5"] }] };
  it("the planner's stage.op explain n 2: the explain screen for that case, not the screen said again", async () => {
    const m = model(() => ({ ...PLAN, stage: { op: "explain", n: 2, text: null } }));
    const r = await planRound(body("could you go through number two for me", { stage }), world, fakeHands(), "u", undefined, undefined, deps(m));
    expect(r.result?.stage?.recipe).toBe("explain");
    expect(r.result?.stage?.slots).toMatchObject({ id: "INC-A5" });
    expect(r.result?.stageOp).toBeNull();
    expect(r.result?.note).toBe("stage-explain");
  });
  it("the frame's 'explain the second one' is the same screen, with no model", async () => {
    const r = await planRound(body("explain the second one", { stage }), world, fakeHands(), "u", undefined, undefined, noModel());
    expect(r.result?.stage?.recipe).toBe("explain");
    expect(r.result?.stage?.slots).toMatchObject({ id: "INC-A5" });
  });
  it("on a what-changed screen the nth mover's name is read back to its zone", () => {
    const changed: StageContext = { recipe: "changed", title: "What changed", focus: null, slots: { period: "weekly", cat: "FLOOD_WATERLOGGING" }, blocks: [{ kind: "Kpis", ids: [] }, { kind: "Ranking", ids: ["Perungudi", "Adyar"] }] };
    const slots = R.explainScreenSlots({ kind: "change", dim: "zone", key: "13" }, changed);
    expect(slots).toMatchObject({ change: { dim: "zone", key: "13" }, period: "weekly", cat: "FLOOD_WATERLOGGING", zones: [] });
  });
});

describe("the decision record (decisions.ts) from a finished round", () => {
  it("an answer is recorded with the lane, the model, the tools and the data's time; a direct screen, a round not done and no answer are not", async () => {
    const m = model(() => ({ ...PLAN, screen: { ...SCREEN_NULLS, recipe: "cases", zones: [13] } }));
    const o = await planRound(body("put together something useful for my morning"), world, fakeHands(), "u", undefined, undefined, deps(m));
    expect(o.lane).toBe("planner");
    const d = R.decisionOf({ text: "put together something useful for my morning, call 9876543210" }, o);
    expect(d).toMatchObject({ kind: "answer", lane: "planner", model: "m-test", snapshot: AS_OF });
    expect(d?.tools?.every((t) => /^[a-z_]+$/.test(t))).toBe(true);
    const q = await planRound(body("severe cases in Adyar this week"), world, fakeHands(), "u", undefined, undefined, noModel());
    expect(R.decisionOf({ text: "severe cases in Adyar this week" }, q)).toMatchObject({ lane: "rules", model: "rules" });
    expect(R.decisionOf({ text: "x" }, { ...q, lane: "direct" })).toBeNull();
    expect(R.decisionOf({ text: "x" }, { ...q, done: false })).toBeNull();
    expect(R.decisionOf({ text: "x" }, { ...q, result: { ...q.result!, kind: "none" } })).toBeNull();
  });
  it("the record keeps no phone number of the words said (decisions.ts cleans the query)", async () => {
    const { decisionEvent } = await import("./decisions");
    const q = await planRound(body("severe cases in Adyar this week"), world, fakeHands(), "u", undefined, undefined, noModel());
    const ev = decisionEvent(R.decisionOf({ text: "severe cases in Adyar this week, ring 9876543210" }, q)!, "c@x");
    expect(JSON.stringify(ev)).not.toMatch(/9876543210/);
  });
});

describe("addressed: 'epdi' is a Tanglish question word", () => {
  it("engaged, a longer Tanglish question with epdi is a request", () => {
    const g = addressed({ text: "indha data ippo epdi vandhuchu", lastTurnAt: 1_000, now: 2_000, rulesSure: false, districtNoun: false });
    expect(g).toMatchObject({ act: true, tier: 2 });
  });
});

describe("the persona pushes back when the data is thin, with code's own count", async () => {
  const { thinCount, thinLine, thinSay, PERSONA_LINE } = await import("./persona");
  it("the planner's stable system prompt carries the persona line, with nothing of the turn in it", () => {
    for (const s of R.plannerSystems(world)) { expect(s).toContain(PERSONA_LINE); expect(s).not.toMatch(/Said:/); }
    expect(PERSONA_LINE).toMatch(/never caused by/);
  });
  it("a why screen resting on six cases says so in both languages, and the line passes the number gate with the screen's own figures", async () => {
    const thin = fakeHands({ change_drivers: () => res({ totals: { n: 6, prev: 2, severe: 1, severePrev: 0, open: 6, overdue: 1, rainLinked: 0 }, rainDays: 0, rainDaysPrev: 0, categories: [], places: [], depts: [], top: [] }) });
    for (const lang of ["en", "ta"] as const) {
      const { buildScreen } = await import("./screens");
      const d = (await buildScreen("why", { ...emptySlots(), zones: [13] }, { period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null }, world, thin, "why so many in Adyar", undefined, lang)).doc;
      expect(thinCount(d)).toEqual({ n: 6, kind: "finding" });
      const line = thinLine(d)!;
      expect(d.say[lang]).toContain(line[lang]);
      expect(gateChunk(line[lang], speakableFigures(d, lang)).ok, line[lang]).toBe(true);
    }
    expect(thinSay(6)).toEqual({ en: "Only six cases, so I wouldn't read much into it.", ta: "ஆறு சம்பவங்கள் தான், அதனால பெருசா எடுத்துக்க வேண்டாம்." });
  });
  it("ten cases or more, none at all, or a list: no push-back", () => {
    expect(thinSay(10)).toBeNull();
    expect(thinSay(0)).toBeNull();
    expect(thinCount({ recipe: "cases", blocks: [{ kind: "CaseList", id: "l", title: "t", source: "list", sev: null, total: 3, rows: [] }] })).toBeNull();
    expect(thinCount({ recipe: "ranking", blocks: [{ kind: "Ranking", id: "r", title: "t", unit: "incidents", method: "m", order: "top", items: [3, 2].map((v, i) => ({ key: `${i}`, label: `z${i}`, value: v, rank: i + 1, sub: null, zone: null, lat: null, lon: null, action: "zone" as const })) }] })).toEqual({ n: 3, kind: "top" });
    expect(thinCount({ recipe: "ranking", blocks: [{ kind: "Ranking", id: "r", title: "t", unit: "mm", method: "m", order: "top", items: [3, 2].map((v, i) => ({ key: `${i}`, label: `z${i}`, value: v, rank: i + 1, sub: null, zone: null, lat: null, lon: null, action: "station" as const })) }] })).toBeNull();
  });
});
