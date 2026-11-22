/**
 * Jarvis v4, lane L2 (the planner): lookups from every bundle, the observation path, memory and the last four turns in the first prompt,
 * the speech confidence and language, one planner call that stops at tools, two speeds, speculation and the planner's stable system
 * prompts. Each block failed on the code before v4 (see the build log).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonCall, JsonResult } from "@/lib/ai/gateway";
import { schemaText } from "@/lib/ai/gateway";
import type { ToolResult } from "@/lib/assistant/types";
import { WORLD } from "./fixture";
import { Ledger, MemoryStore } from "./ledger";
import * as R from "./round";
import type { RoundBodyT } from "./round";
import { fakeHands } from "./stagefake";
import type { StageContext } from "./stage";
import type { TurnEvent } from "./events";
import { asksForbiddenOrder, routeByRules } from "./router";

const { clearCaches, planRound, RoundBody, safeHands } = R;
const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const body = (text: string, o: Partial<RoundBodyT> = {}): RoundBodyT => RoundBody.parse({ turnId: "turn1", round: 0, text, state: STATE, turns: [], stage: null, direct: null, ...o });
const stage: StageContext = { recipe: "cases", title: "Severe in Royapuram", focus: null, slots: { sev: "Severe", zones: [5], period: "daily" }, blocks: [{ kind: "CaseList", ids: ["INC-1", "INC-2", "INC-3"] }] };
const SCREEN_NULLS = { period: null, zones: [], dept: null, depts: [], cat: null, taluk: null, sev: null, status: null, q: null, metric: null, measure: null, by: null, order: null, n: null, item: null, id: null, name: null, what: null, sort: null };
const CALL = (tool: string) => ({ tool, period: null, zone: null, dept: null, cat: null, taluk: null, place: null, metric: null, text: null });
const STEP = (o: Record<string, unknown>) => ({ action: "page", page: null, period: null, zone: null, dept: null, cat: null, taluk: null, sev: null, panel: null, mapMode: null, layer: null, on: null, item: null, which: null, option: null, n: null, text: null, when: null, ...o });

interface Asked { name: string; system: string; prompt: string; schema: JsonCall<unknown>["schema"] }
/** a model that answers from a script (optionally after a delay), and remembers what it was asked */
function model(answer: (c: JsonCall<unknown>, i: number) => unknown, delayMs = 0) {
  const asked: Asked[] = [];
  const generate = async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => {
    const i = asked.length;
    asked.push({ name: c.name, system: c.system, prompt: c.prompt, schema: c.schema as never });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const object = answer(c as JsonCall<unknown>, i) as U;
    if (object === undefined) throw new Error("429 refused");
    return { object, info: { step: c.name, provider: "groq", model: c.only?.models[0] ?? "m", ms: 3, inputTokens: Math.ceil((c.system.length + c.prompt.length) / 3.5), outputTokens: 60, attempts: 1 } };
  };
  return { generate: generate as never, asked };
}
const deps = (m: ReturnType<typeof model>, o: Partial<R.RoundDeps> = {}): R.RoundDeps => ({ llm: { generate: m.generate, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false }, ...o });
const PLAN = { kind: "do", lang: "en", reply: null, options: [], calls: [], done: true, say: null, steps: [], stage: null, screen: null };
const telemetryRows = (): Record<string, unknown>[] => {
  const f = path.join(process.env.THUNAI_DIR ?? "", "telemetry.ndjson");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
};

describe("v4 planner", () => {
  beforeEach(() => { clearCaches(); vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-round4-"))); });
  afterEach(() => vi.unstubAllEnvs());

  // ---- defect 3: lookups from every bundle
  it("every bundle can look a fact up: its schema keeps calls and its system says so", async () => {
    const cases: [string, StageContext | null][] = [["put together something useful for my morning", null], ["open the trends page and see", null], ["sort these for me", stage],
      ["remember this for me", null], ["ஏதாவது பயனுள்ளதா போடு", null], ["how many open complaints in total", null]];
    for (const [i, [text, st]] of cases.entries()) {
      clearCaches(); // the 30 s tool cache would hand the last case's read over
      const m = model(() => ({ ...PLAN, calls: [CALL("zones")] }));
      const h = fakeHands();
      const r = await planRound(body(text, { stage: st, turnId: `bundle-${i}` }), WORLD, h, "u", undefined, undefined, deps(m));
      expect(m.asked[0].system, text).toMatch(/calls/);
      expect((m.asked[0].schema.parse({ ...PLAN, calls: [CALL("zones")] }) as { calls?: unknown[] }).calls, text).toHaveLength(1);
      // the provider is told calls and done are required (strict modes) ...
      const js = JSON.parse(schemaText(m.asked[0].schema as never)) as { required?: string[]; properties?: Record<string, unknown> };
      expect(js.required, text).toEqual(expect.arrayContaining(["calls", "done"]));
      expect(js.properties?.calls, text).toBeTruthy();
      // ... and a reply that leaves them out is still read, as no lookup
      if (i !== cases.length - 1) {
        const { calls: _c, done: _d, ...older } = PLAN;
        expect(m.asked[0].schema.parse(older), text).toMatchObject({ calls: [], done: true });
      }
      expect(h.calls, text).toContain("zones");
      expect(r.result?.stage?.recipe, text).toBe("answer");
    }
  });
  it("the wider retry after a bundle miss can look facts up too", async () => {
    const m = model((_, i) => (i === 0 ? { ...PLAN, kind: "other" } : { ...PLAN, calls: [CALL("zones")] }));
    const h = fakeHands();
    const r = await planRound(body("put together something useful for my morning", { turnId: "wide-retry" }), WORLD, h, "u", undefined, undefined, deps(m));
    expect(m.asked.length).toBe(2);
    expect(h.calls).toContain("zones");
    expect(r.result?.stage?.recipe).toBe("answer");
  });

  // ---- Pillar 2: one planner call, stop at tools
  it("one planner call: the reads it names run at once and code fills the answer, no second model pass", async () => {
    const m = model(() => ({ ...PLAN, calls: [CALL("zones"), CALL("change_drivers")] }));
    const h = fakeHands();
    const r = await planRound(body("how many open complaints in total", { turnId: "one" }), WORLD, h, "u", undefined, undefined, deps(m));
    expect(r.done).toBe(true);
    expect(m.asked.length).toBe(1);
    expect(r.calls).toBe(1);
    expect(h.calls).toEqual(expect.arrayContaining(["zones", "change_drivers"]));
    expect(r.result?.stage?.recipe).toBe("answer");
    expect(r.result?.note).toBe("stop-at-tools");
    // the say is code's template over the results' facts, filled by fillTemplate: figures only from the results
    expect(r.result?.say).toMatch(/Severe in Adyar: 4/);
    expect(r.result?.say).toMatch(/Incidents reported: 59/);
  });
  it("a second round only when an observation is needed: a failed read or an empty one", async () => {
    for (const [name, h] of [["failed", fakeHands({ hotspots: () => { throw new Error("store busy"); } })], ["empty", fakeHands()]] as const) {
      const m = model((_, i) => (i === 0 ? { ...PLAN, calls: [CALL("zones"), CALL(name === "failed" ? "hotspots" : "departments")] } : { ...PLAN, say: "Adyar has {n:f1} severe.", screen: { ...SCREEN_NULLS, recipe: "answer" } }));
      const first = await planRound(body("how many open complaints in total", { turnId: `two-${name}` }), WORLD, h, "u", undefined, undefined, deps(m));
      expect(first.done, name).toBe(false);
      const second = await planRound(body("how many open complaints in total", { turnId: `two-${name}`, round: 1 }), WORLD, h, "u", undefined, undefined, deps(m));
      expect(second.done, name).toBe(true);
      expect(m.asked.length, name).toBe(2);
      expect(second.result?.say, name).toMatch(/Adyar has \d+ severe/);
    }
  });

  // ---- defect 4: the observation path
  it("console steps the model wants to see come back with done false; their outcome and the screen reach the next round as untrusted data", async () => {
    const m = model((_, i) => (i === 0
      ? { ...PLAN, steps: [STEP({ action: "page", page: "trends" })], done: false }
      : { ...PLAN, screen: { ...SCREEN_NULLS, recipe: "trend", period: "quarterly" } }));
    const said = "go to the trends page and tell me what is there";
    const first = await planRound(body(said, { turnId: "obs" }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(first.done).toBe(false);
    expect(first.steps).toEqual([{ a: "page", page: "trends" }]);
    const second = await planRound(body(said, { turnId: "obs", round: 1, stageDigest: "{\"recipe\":\"trend\",\"title\":\"Dengue over the quarter\"}",
      observations: [{ step: "page", ok: true, digest: "Trends page: dengue rising in Adyar. Call 9876543210" }] }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(second.done).toBe(true);
    expect(second.result?.stage?.recipe).toBe("trend");
    const p = m.asked[1].prompt;
    expect(p).toMatch(/dengue rising in Adyar/);
    expect(p).toMatch(/Dengue over the quarter/);
    expect(p).toMatch(/untrusted/);
    expect(p).not.toMatch(/9876543210/);
    // a console turn can act again in a later round
    expect((m.asked[1].schema.parse({ ...PLAN, steps: [STEP({ action: "panel", panel: "news" })] }) as { steps?: unknown[] }).steps).toHaveLength(1);
  });
  it("an observation's digest is clipped to about 400 tokens", async () => {
    const m = model(() => ({ ...PLAN, screen: { ...SCREEN_NULLS, recipe: "trend" } }));
    const long = "word ".repeat(360);
    await planRound(body("go to the trends page and tell me what is there", { turnId: "clip", round: 1, observations: [{ step: "page", ok: true, digest: long }, { step: "view", ok: true, digest: long }] }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect((m.asked[0].prompt.match(/word/g) ?? []).length * 5).toBeLessThanOrEqual(1400 + 10);
  });
  it("a step that keeps something is never a look-first step: it waits for its yes as before", async () => {
    const m = model(() => ({ ...PLAN, steps: [STEP({ action: "remember", text: "Adyar comes first" })], done: false }));
    const r = await planRound(body("remember that Adyar comes first", { turnId: "keep" }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(r.done).toBe(true);
    expect(r.steps).toEqual([]);
    expect(r.result?.steps.some((s) => s.a === "remember")).toBe(true);
  });

  // ---- defect 5: memory and the last four turns
  it("the Collector's notes and habits and the last four turns reach the first prompt, as untrusted text", async () => {
    const m = model(() => ({ ...PLAN, kind: "chat", reply: "ok" }));
    const words = ["one", "two", "three", "four"];
    const turns = words.map((w, i) => ({ heard: `question ${w}`, did: "showed it", recipe: "cases" as const, slots: { zones: [13], sev: "Severe" }, result: `answer number ${w}${i}` }));
    await planRound(body("put together something useful for my morning", { turnId: "mem", turns }), WORLD, fakeHands(), "u",
      { notes: ["Zone 13 is my priority this monsoon", "call 9876543210 tomorrow"], habits: { "the usual": "severe cases in Adyar" } }, undefined, deps(m));
    const p = m.asked[0].prompt;
    expect(p).toMatch(/Zone 13 is my priority this monsoon/);
    expect(p).toMatch(/the usual -> severe cases in Adyar/);
    expect(p).toMatch(/notes[^\n]*untrusted/i);
    expect(p).not.toMatch(/9876543210/);
    for (const w of words) expect(p).toMatch(new RegExp(`question ${w}`));
    expect(p).toMatch(/cases \{"zones":\[13\],"sev":"Severe"\}/);
    expect(p).toMatch(/answer number four3/);
  });
  it("memory keeps to its budget, and every bundle's first call keeps to the token diet with everything full", async () => {
    const notes = Array.from({ length: 30 }, (_, i) => `note ${"x".repeat(150)} ${i}`);
    const habits = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`heard ${i} ${"y".repeat(40)}`, `meant ${"z".repeat(40)}`]));
    const turns = Array.from({ length: 4 }, () => ({ heard: "h".repeat(300), did: "d".repeat(300), recipe: "compare" as const, slots: { zones: [13, 7, 8, 14], period: "monthly", q: "q".repeat(60) }, result: "r".repeat(200) }));
    const full = { notes: ["Zone 13 first", ...notes], habits };
    const m0 = model(() => ({ ...PLAN, kind: "chat", reply: "ok" }));
    await planRound(body("put together something useful for my morning", { turnId: "budget0", turns }), WORLD, fakeHands(), "u", full, undefined, deps(m0));
    const memPart = m0.asked[0].prompt.split("\n").filter((l) => /^The Collector's notes|^Habits/.test(l)).join("\n");
    expect(memPart.length).toBeGreaterThan(300);
    expect(memPart.length).toBeLessThanOrEqual(300 * 3.5);
    const cases: [string, StageContext | null][] = [["put together something useful for my morning", null], ["open the trends page and see", null], ["sort these for me", stage],
      ["remember this for me", null], ["ஏதாவது பயனுள்ளதா போடு", null], ["how many open complaints in total", null]];
    for (const [i, [text, st]] of cases.entries()) {
      const m = model(() => ({ ...PLAN, kind: "chat", reply: "ok" }));
      await planRound(body(text, { turnId: `budget-${i}`, turns, stage: st, stageDigest: "s".repeat(1400) }), WORLD, fakeHands(), "u", full, undefined, deps(m));
      const a = m.asked[0];
      expect(Math.ceil((a.system.length + a.prompt.length) / 3.5), text).toBeLessThanOrEqual(R.CALL_TOKENS);
      // the turn itself is never cut
      expect(a.prompt, text).toContain(JSON.stringify(text));
      // the schema the provider gets alongside (every bundle now has calls): reported, not held to the same line
      expect(schemaText(a.schema as never).length, text).toBeGreaterThan(0);
    }
  });
  it("the turns' new fields parse with tight limits", () => {
    const t = { heard: "severe cases in Adyar", did: "showed them", recipe: "cases", slots: { zones: [13], sev: "Severe", ids: Array.from({ length: 30 }, (_, i) => `INC-${i}`) }, result: "Showed four severe cases." };
    const ok = body("and Ambattur?", { turns: [t] as never });
    expect(ok.turns?.[0].recipe).toBe("cases");
    expect(JSON.stringify(ok.turns?.[0].slots).length).toBeLessThanOrEqual(300);
    expect(() => body("x", { turns: [{ ...t, result: "r".repeat(500) }] as never })).toThrow();
    expect(() => body("x", { turns: [{ ...t, recipe: "bogus" }] as never })).toThrow();
    // v11: six turns travel (four before)
    expect(body("x", { turns: [t, t, t, t, t, t] as never }).turns).toHaveLength(6);
    expect(() => body("x", { turns: [t, t, t, t, t, t, t] as never })).toThrow();
  });

  // ---- defect 6: speech confidence and language
  it("low speech confidence prefers the rules' reading over a model guess", async () => {
    const m = model(() => ({ ...PLAN, screen: { ...SCREEN_NULLS, recipe: "dashboard" } }));
    const r = await planRound(body("something about the drains", { turnId: "lc1", heard: { lang: "en", conf: 0.4, source: "whisper" } }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(m.asked).toEqual([]);
    expect(r.result?.stage?.recipe).toBe("cases");
    const sure = model(() => ({ ...PLAN, screen: { ...SCREEN_NULLS, recipe: "dashboard" } }));
    const r2 = await planRound(body("something about the drains", { turnId: "lc2", heard: { lang: "en", conf: 0.92, source: "whisper" } }), WORLD, fakeHands(), "u", undefined, undefined, deps(sure));
    expect(sure.asked.length).toBe(1);
    expect(r2.result?.stage?.recipe).toBe("dashboard");
  });
  it("low confidence with no rules reading tells the planner the words may be misheard", async () => {
    const m = model(() => ({ ...PLAN, kind: "chat", reply: "ok" }));
    await planRound(body("put together something useful for my morning", { turnId: "lc3", heard: { lang: "en", conf: 0.3, source: "captions" } }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(m.asked[0].prompt).toMatch(/low confidence/i);
    expect(m.asked[0].prompt).toMatch(/clarify/);
  });
  it("the heard language sets the reply language for Tanglish in Latin letters, and not for plain English", async () => {
    const m = model(() => ({ ...PLAN, kind: "chat", reply: "ok" }));
    await planRound(body("Ambattur kuppai", { turnId: "tg1", heard: { lang: "ta", conf: 0.9, source: "whisper" } }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(m.asked[0].prompt).toMatch(/Reply in Tamil/);
    await planRound(body("put together something useful for my morning", { turnId: "tg2", heard: { lang: "ta", conf: 0.9, source: "whisper" } }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(m.asked[1].prompt).toMatch(/Reply in English/);
    // and the rules' reading answers in Tamil too
    const r = await planRound(body("Ambattur kuppai", { turnId: "tg3", heard: { lang: "ta", conf: 0.4, source: "whisper" } }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(r.result?.lang).toBe("ta");
    expect(r.result?.say ?? "").toMatch(/[஀-௿]/);
  });

  // ---- two speeds
  it("two speeds: analysis questions and missions get 25 s, commands keep 8 s", () => {
    expect(R.COMMAND_BUDGET_MS).toBe(8000);
    expect(R.ANALYSIS_BUDGET_MS).toBe(25_000);
    for (const s of ["why is Adyar so bad lately", "explain this chart to me", "compare Adyar and Ambattur", "what changed this quarter", "any insight on the drains", "prepare for heavy rain tonight",
      "ஏன் இவ்வளவு புகார்கள்", "Ambattur la yen ivlo complaints", "how has dengue moved this quarter", "dengue trend over the last six months"]) expect(R.turnSpeed(s, WORLD), s).toBe("analysis");
    for (const s of ["Zone 7, weekly", "open the news panel", "severe cases in Adyar", "dark mode", "dengue trend this week", "how many open complaints in total"]) expect(R.turnSpeed(s, WORLD), s).toBe("command");
  });
  it("an analysis turn is not cut at 8 s: a slow router leaves the planner time; a command turn is cut", async () => {
    const real = Date.now.bind(Date);
    let ahead = 0;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => real() + ahead);
    try {
      const names: string[] = [];
      const generate = (async (c: JsonCall<unknown>) => {
        names.push(c.name);
        if (c.name === "jarvis_router") { ahead += 9000; return { object: { lane: "district" }, info: { step: c.name, provider: "groq", model: "m", ms: 9000, inputTokens: 10, outputTokens: 2, attempts: 1 } }; }
        return { object: { ...PLAN, kind: "chat", reply: "Here is what I found." }, info: { step: c.name, provider: "groq", model: "m", ms: 5, inputTokens: 10, outputTokens: 2, attempts: 1 } };
      }) as never;
      const r = await planRound(body("what is the reason behind all this", { turnId: "slow-analysis" }), WORLD, fakeHands(), "u", undefined, undefined, { llm: { generate, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false } });
      expect(names[0]).toBe("jarvis_router");
      expect(names.length).toBe(2);
      expect(r.result?.note).not.toBe("no-model");
    } finally { clock.mockRestore(); }
  });
  it("a slow analysis turn sends a progress step event every few seconds while it waits", async () => {
    const m = model(() => ({ ...PLAN, kind: "chat", reply: "ok" }), 140);
    const events: TurnEvent[] = [];
    await planRound(body("why is everything so slow lately", { turnId: "prog" }), WORLD, fakeHands(), "u", undefined, undefined, deps(m, { emit: (e) => events.push(e), progressEveryMs: 30 }));
    const ticks = events.filter((e) => e.type === "STEP_STARTED" && typeof (e as { elapsedMs?: number }).elapsedMs === "number");
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(events.at(-1)?.type).toBe("RUN_FINISHED");
  });

  // ---- speculation
  it("a speculative read is reused by the same read from the planner, and counted", async () => {
    let n = 0;
    const base = fakeHands();
    const h = { ...base, tool: async (name: string, args: Record<string, unknown>) => { n++; return base.tool(name, args); } };
    const args = { scope: { period: "weekly", zone: null, dept: null, cat: null, taluk: null } };
    await safeHands(h, undefined, { spec: true }).tool("zones", args);
    await safeHands(h).tool("zones", args);
    expect(n).toBe(1);
    expect(telemetryRows().some((r) => r.event === "spec" && r.ok === true)).toBe(true);
  });
  it("while the planner thinks, the rules' best guess is read already: a model that only asks back gets that screen", async () => {
    const order: string[] = [];
    const base = fakeHands() as unknown as Record<string, unknown>;
    // every data call is recorded, whichever the cases screen uses
    const h = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, typeof v === "function" ? (...a: unknown[]) => { order.push(k); return (v as (...x: unknown[]) => unknown)(...a); } : v])) as unknown as ReturnType<typeof fakeHands>;
    const m = model(() => { order.push("model"); return { ...PLAN, kind: "clarify", reply: "Which drains?", options: [{ label: "a", request: "a" }, { label: "b", request: "b" }] }; }, 60);
    const r = await planRound(body("something about the drains", { turnId: "spec1" }), WORLD, h, "u", undefined, undefined, deps(m, { speculate: true }));
    expect(r.result?.note).toBe("rules-after-clarify");
    expect(r.result?.stage?.recipe).toBe("cases");
    // the rules' screen was being read before the model answered
    const firstRead = order.findIndex((x) => x !== "model");
    expect(firstRead).toBeGreaterThanOrEqual(0);
    expect(firstRead).toBeLessThan(order.indexOf("model"));
    expect(telemetryRows().some((x) => x.event === "spec" && x.ok === true)).toBe(true);
  });

  // ---- digests are untrusted client input: scrubbed before any prompt (lane L5's request)
  it("a phone number, a quoted citizen sentence or a filer's name in a digest never reaches the model's prompt", async () => {
    const title = "Respected sir, \"my house is flooded please send help\" call 9876543210";
    const stageDigest = JSON.stringify({ recipe: "cases", title: "Flooding in Adyar", items: `cases(2): 1=INC-A1 ${title}; 2=INC-A2 Wall collapse filed by Ramesh Kumar` }).slice(0, 700);
    const obs = [{ step: "page", ok: true, digest: `Priority list: ${title} | Drain blocked “water entering our street since morning” near the school` }, { step: "view", ok: false, error: "failed for 98765 43210" }];
    const m = model((_, i) => (i === 0 ? { ...PLAN, steps: [STEP({ action: "page", page: "trends" })], done: false } : { ...PLAN, kind: "chat", reply: "ok" }));
    const said = "go to the trends page and tell me what is there";
    await planRound(body(said, { turnId: "scrub", stageDigest }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    await planRound(body(said, { turnId: "scrub", round: 1, stageDigest, observations: obs }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(m.asked.length).toBe(2);
    for (const a of m.asked) {
      for (const bad of [/9876543210/, /98765 43210/, /my house is flooded/, /water entering our street/, /Ramesh Kumar/, /Respected sir/i]) expect(a.prompt, String(bad)).not.toMatch(bad);
      expect(a.prompt).toMatch(/Flooding in Adyar|INC-A1/);
    }
    // the rest of the digest still reaches the model
    expect(m.asked[1].prompt).toMatch(/Drain blocked/);
  });

  // ---- the never rule reads a question about how fast things are closed as a question (lane L3 saw it refused)
  it("a question about how fast complaints are closed is not refused; an order to close or delete still is", async () => {
    for (const s of ["which department is slowest to close drainage complaints", "how long does it take to close a case in Adyar", "average time to close complaints",
      "what is the closing rate of complaints", "slowest department to close cases"]) {
      expect(routeByRules(s, WORLD, false).lane, s).not.toBe("refuse");
      expect(asksForbiddenOrder(s), s).toBe(false);
    }
    for (const s of ["close all the drainage complaints", "close the slowest cases", "quickly close all cases in Adyar", "how long does it take to close a case, then delete all the complaints",
      "close all complaints that are late", "delete all the old complaints"]) expect(routeByRules(s, WORLD, false).lane, s).toBe("refuse");
    const m = model(() => ({ ...PLAN, screen: { ...SCREEN_NULLS, recipe: "performance", by: "dept" } }));
    const r = await planRound(body("which department is slowest to close drainage complaints", { turnId: "close-q" }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(r.result?.kind).toBe("do");
    expect(r.result?.stage?.recipe).toBe("performance");
  });
  it("plannerWarm hands lane L3 the wide bundle's exact system prompt and schema", async () => {
    // (v4's prefix: THE DISTRICT NOW off; with it on, v11.test.ts checks the v11 prefix)
    // v12 (21 Nov): the wide bundle, not the screens one: Claude (the only rung with a prompt cache) asks round 0 with it (round.ts leadBundle)
    vi.stubEnv("JARVIS_SNAPSHOT", "0");
    const w = R.plannerWarm(WORLD);
    expect(w.system).toBe(R.plannerSystems(WORLD)[2]);
    expect(w.schema).toBe(R.SCHEMAS.wide);
  });

  // ---- the planner's stable system prompts (for the prompt cache)
  it("plannerSystems gives the exact round-0 system prompts of the screens, data and wide bundles, with nothing per-turn in them", async () => {
    // (v4's prefixes: THE DISTRICT NOW off; with it on, v11.test.ts checks the v11 prefix against what the planner sends)
    vi.stubEnv("JARVIS_SNAPSHOT", "0");
    const sys = R.plannerSystems(WORLD);
    expect(sys.length).toBe(3);
    const said: [string, number][] = [["put together something useful for my morning", 0], ["how many open complaints in total", 1], ["ஏதாவது பயனுள்ளதா போடு", 2]];
    for (const [text, i] of said) {
      const m = model(() => ({ ...PLAN, kind: "chat", reply: "ok" }));
      await planRound(body(text, { turnId: `sys-${i}`, turns: [{ heard: "earlier", did: "did" }] }), WORLD, fakeHands(), "u", { notes: ["a note"], habits: {} }, undefined, deps(m));
      expect(m.asked[0].system, text).toBe(sys[i]);
    }
    for (const s of sys) expect(s).not.toMatch(/\d{4}-\d{2}-\d{2}|\b\d{1,2}:\d{2}\b|a note|earlier/);
  });
});
