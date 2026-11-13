import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonCall, JsonResult } from "@/lib/ai/gateway";
import type { ToolResult } from "@/lib/assistant/types";
import { WORLD } from "./fixture";
import { Ledger, MemoryStore } from "./ledger";
import { clearCaches, observation, planRound, RoundBody, safeHands, type RoundBodyT } from "./round";
import { fakeHands } from "./stagefake";
import type { StageContext } from "./stage";

const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const body = (text: string, o: Partial<RoundBodyT> = {}): RoundBodyT => RoundBody.parse({ turnId: "turn1", round: 0, text, state: STATE, turns: [], stage: null, direct: null, ...o });
const stage: StageContext = { recipe: "cases", title: "Severe in Royapuram", focus: null, slots: { sev: "Severe", zones: [5], period: "daily" }, blocks: [{ kind: "CaseList", ids: ["INC-1", "INC-2", "INC-3"] }] };

/** a model that answers from a script, and remembers what it was asked */
function model(answer: (c: JsonCall<unknown>) => unknown) {
  const asked: { name: string; system: string; prompt: string; model: string }[] = [];
  const generate = async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => {
    asked.push({ name: c.name, system: c.system, prompt: c.prompt, model: c.only?.models[0] ?? "" });
    const object = answer(c as JsonCall<unknown>) as U;
    if (object === undefined) throw new Error("429 refused");
    return { object, info: { step: c.name, provider: c.only?.provider ?? "groq", model: c.only?.models[0] ?? "m", ms: 3, inputTokens: Math.ceil((c.system.length + c.prompt.length) / 3.5), outputTokens: 60, attempts: 1 } };
  };
  return { generate: generate as never, asked };
}
const deps = (m: ReturnType<typeof model>) => ({ llm: { generate: m.generate, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false } });
const SCREEN_NULLS = { period: null, zones: [], dept: null, depts: [], cat: null, taluk: null, sev: null, status: null, q: null, metric: null, measure: null, by: null, order: null, n: null, item: null, id: null, name: null, what: null, sort: null };

describe("one round of thinking", () => {
  beforeEach(() => { clearCaches(); vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-round-"))); });
  afterEach(() => vi.unstubAllEnvs());

  it("privacy and the never-send rule answer in code: no model is asked", async () => {
    const m = model(() => ({ kind: "do" }));
    const a = await planRound(body("who complained about the drain in Adyar"), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(a.result).toMatchObject({ kind: "refuse", note: "privacy" });
    const b = await planRound(body("delete all the old complaints"), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(b.result).toMatchObject({ kind: "refuse", note: "never" });
    expect(m.asked).toEqual([]);
  });
  it("the frame comes first: follow-ups need no model", async () => {
    const m = model(() => ({ kind: "do" }));
    const r = await planRound(body("and in Adyar?", { stage }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(r.lane).toBe("frame");
    expect(r.result?.stage?.recipe).toBe("cases");
    expect(r.result?.stage?.scope.zone).toBe(13);
    const s = await planRound(body("the second one", { stage }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(s.result?.stageOp).toMatchObject({ op: "open", n: 2 });
    const y = await planRound(body("why?", { stage }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(y.result?.stage?.recipe).toBe("why");
    expect(m.asked).toEqual([]);
  });
  it("a correction after a cancel refines the request that was cut off", async () => {
    const m = model(() => ({ kind: "do" }));
    const r = await planRound(body("no, Anna Nagar", { lastText: "show the severe cases in Royapuram" }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(r.result?.stage?.recipe).toBe("cases");
    expect(r.result?.stage?.scope.zone).toBe(8);
    expect(m.asked).toEqual([]);
  });
  it("the fast lane still answers plain questions with no model, and tells the timeline what it really read", async () => {
    const m = model(() => ({ kind: "do" }));
    const r = await planRound(body("severe cases in Adyar this week"), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(r.lane).toBe("quick");
    expect(m.asked).toEqual([]);
    expect(r.trace.some((x) => /Read|cases/i.test(x.label))).toBe(true);
  });
  it("general knowledge is labelled, has no figures, and asks no tool", async () => {
    const m = model(() => ({ reply: "Deep learning trains layered neural networks on examples." }));
    const h = fakeHands();
    const r = await planRound(body("what is deep learning"), WORLD, h, "u", undefined, undefined, deps(m));
    expect(r.result?.reply).toMatch(/^General knowledge, not district data: Deep learning/);
    expect(h.calls).toEqual([]);
    const f = model(() => ({ reply: "Founded in 1956 by ten people." }));
    const g = await planRound(body("what is artificial intelligence"), WORLD, fakeHands(), "u", undefined, undefined, deps(f));
    expect(g.result?.reply).not.toMatch(/1956/);
  });
  it("the planner gets one small bundle; a screen comes back from code", async () => {
    const m = model(() => ({ kind: "do", lang: "en", reply: "Bringing that up.", options: [], screen: { ...SCREEN_NULLS, recipe: "dashboard", cat: "FLOOD_WATERLOGGING", period: "weekly" } }));
    const r = await planRound(body("put together something useful for my morning"), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(r.result?.stage?.recipe).toBe("dashboard");
    expect(m.asked.length).toBe(1);
    expect(m.asked[0].system).not.toMatch(/saveWorkspace|mandi_prices/);
  });
  it("Tamil and Tanglish get one wide call, with screens and steps together; English keeps its small bundle", async () => {
    const m = model(() => ({ kind: "do", lang: "ta", reply: null, options: [], steps: [], stage: null, screen: { ...SCREEN_NULLS, recipe: "performance", by: "dept" } }));
    const r = await planRound(body("ஸ்டார்ம் வாட்டர் ஒர்க் எப்படி போகுது", { turnId: "t-ta" }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(r.result?.stage?.recipe).toBe("performance");
    expect(m.asked.length).toBe(1);
    expect(m.asked[0].system).toMatch(/saveWorkspace/);
    expect(m.asked[0].system).toMatch(/Spoken Tamil/);
    expect(m.asked[0].prompt).toMatch(/Gloss: |Code read/);
    const en = model(() => ({ kind: "do", lang: "en", reply: null, options: [], screen: { ...SCREEN_NULLS, recipe: "brief" } }));
    await planRound(body("something useful for my morning", { turnId: "t-en" }), WORLD, fakeHands(), "u", undefined, undefined, deps(en));
    expect(en.asked[0].system).not.toMatch(/Spoken Tamil|saveWorkspace/);
  });
  it("a sentence the model only asks back about, or chats about, gets the rules' reading if they have one", async () => {
    for (const kind of ["clarify", "chat"]) {
      const m = model(() => ({ kind, lang: "en", reply: "Which one?", options: [{ label: "a", request: "a" }, { label: "b", request: "b" }], screen: null }));
      const r = await planRound(body("how is dengue doing in Kodambakkam", { turnId: `t-${kind}` }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
      expect(m.asked.length).toBe(1);
      expect(r.result).toMatchObject({ kind: "do", note: `rules-after-${kind}` });
      expect(r.result?.stage?.recipe).toBe("cases");
      expect(r.tokens).toBeGreaterThan(0);
    }
    const hello = model(() => ({ kind: "chat", lang: "en", reply: "Good morning.", options: [], screen: null }));
    const h = await planRound(body("good morning there", { turnId: "t-hi" }), WORLD, fakeHands(), "u", undefined, undefined, deps(hello));
    expect(h.result).toMatchObject({ kind: "chat", reply: "Good morning." });
  });
  it("a model's refusal stands: code does not overrule it with a screen", async () => {
    const m = model(() => ({ kind: "refuse", lang: "en", reply: "I can't do that.", options: [], screen: null }));
    const r = await planRound(body("how is dengue doing in Kodambakkam", { turnId: "t-ref" }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(r.result?.kind).toBe("refuse");
  });
  it("a general question that reaches the planner is labelled, and a figure in it stops it being said", async () => {
    const m = model(() => ({ kind: "general", lang: "en", reply: "A tall mountain in the Himalaya.", options: [], screen: null }));
    const r = await planRound(body("tell me something about the Everest mountain", { turnId: "t-g1" }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(r.result).toMatchObject({ kind: "chat", note: "general" });
    expect(r.result?.reply).toMatch(/^General knowledge, not district data: A tall mountain/);
    const f = model(() => ({ kind: "general", lang: "en", reply: "It is 8849 metres tall.", options: [], screen: null }));
    const g = await planRound(body("how tall is the Everest mountain", { turnId: "t-g2" }), WORLD, fakeHands(), "u", undefined, undefined, deps(f));
    expect(g.result?.note).toBe("general-fallback");
    expect(g.result?.reply).not.toMatch(/8849/);
  });
  it("token diet: every bundle's call is at most 2.5K tokens, and a later round is smaller", async () => {
    const big = { ...STATE };
    for (const [text, stageNow] of [["put together something for me", null], ["go somewhere useful", null], ["remember this for me", null], ["how many open complaints in all", null], ["sort these for me", stage], ["ஏதாவது பயனுள்ளதா போடு", null]] as const) {
      const m = model(() => ({ kind: "chat", lang: "en", reply: "ok", options: [], calls: [], done: true, say: null, steps: [], stage: null, screen: null }));
      await planRound(body(text, { stage: stageNow, state: big as never, stageDigest: stageNow ? "x".repeat(1400) : null, turns: [{ heard: "h".repeat(120), did: "d".repeat(80) }, { heard: "h".repeat(120), did: "d".repeat(80) }], turnId: `t-${text}` }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
      const a = m.asked[0];
      expect(a, text).toBeTruthy();
      // the schema adds its fields: the screens bundle is the largest, about 400 tokens of schema
      expect(Math.ceil((a.system.length + a.prompt.length) / 3.5), text).toBeLessThan(2300);
    }
  });
  it("rounds: the plan looks first, the facts stay on the server, later rounds send only the delta", async () => {
    let n = 0;
    const m = model(() => (n++ === 0
      ? { kind: "do", lang: "en", reply: null, options: [], calls: [{ tool: "zones", period: null, zone: null, dept: null, cat: null, taluk: null, place: null, metric: null, text: null }], done: false, say: null, screen: null }
      : { kind: "do", lang: "en", reply: null, options: [], calls: [], done: true, say: "Metro Water has {n:f1} open.", screen: { ...SCREEN_NULLS, recipe: "answer" } }));
    const h = fakeHands();
    const first = await planRound(body("how many open complaints in total", { turnId: "look" }), WORLD, h, "u", undefined, undefined, deps(m));
    expect(first.done).toBe(false);
    expect(h.calls).toContain("zones");
    const second = await planRound(body("how many open complaints in total", { turnId: "look", round: 1, observations: [{ step: "page", ok: true }] }), WORLD, h, "u", undefined, undefined, deps(m));
    expect(second.done).toBe(true);
    expect(second.result?.stage?.recipe).toBe("answer");
    expect(second.result?.say).toMatch(/Metro Water has \d+/);
    expect(m.asked[1].system.length).toBeLessThan(m.asked[0].system.length + 1500);
    expect(m.asked[1].prompt).toMatch(/Results:/);
    expect(m.asked[1].prompt).not.toMatch(/Gloss|Recent/);
    expect(second.calls).toBe(2);
  });
  it("a placeholder the results never gave falls back to the figures, not to a number from the model", async () => {
    let n = 0;
    const m = model(() => (n++ === 0
      ? { kind: "do", lang: "en", reply: null, options: [], calls: [{ tool: "departments", period: null, zone: null, dept: null, cat: null, taluk: null, place: null, metric: null, text: null }], done: false, say: null, screen: null }
      : { kind: "do", lang: "en", reply: null, options: [], calls: [], done: true, say: "There are {n:f99} open and 4,321 closed.", screen: { ...SCREEN_NULLS, recipe: "answer" } }));
    const h = fakeHands();
    await planRound(body("how many open complaints in total", { turnId: "bad" }), WORLD, h, "u", undefined, undefined, deps(m));
    const r = await planRound(body("how many open complaints in total", { turnId: "bad", round: 1 }), WORLD, h, "u", undefined, undefined, deps(m));
    expect(r.result?.say ?? "").not.toMatch(/4,321/);
  });
  it("identical tool arguments are never repeated; a failing tool becomes an observation", async () => {
    const m = model(() => ({ kind: "do", lang: "en", reply: null, options: [], calls: [{ tool: "departments", period: null, zone: null, dept: null, cat: null, taluk: null, place: null, metric: null, text: null }, { tool: "hotspots", period: null, zone: null, dept: null, cat: null, taluk: null, place: null, metric: null, text: null }], done: false, say: null, screen: null }));
    const h = fakeHands({ hotspots: () => { throw new Error("store busy"); } });
    await planRound(body("how many in total", { turnId: "rep" }), WORLD, h, "u", undefined, undefined, deps(m));
    const count = h.calls.filter((c) => c === "departments").length;
    await planRound(body("how many in total", { turnId: "rep", round: 1 }), WORLD, h, "u", undefined, undefined, deps(m));
    expect(h.calls.filter((c) => c === "departments").length).toBe(count);
    expect(m.asked[1].prompt).toMatch(/hotspots: \{ok:false/);
  });
  it("with no model able to answer, the turn ends inside 8 s and says so", async () => {
    const m = model(() => undefined);
    const t0 = Date.now();
    const r = await planRound(body("put together something useful for my morning", { turnId: "dead" }), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(r.result).toMatchObject({ kind: "none", note: "no-model" });
    expect(Date.now() - t0).toBeLessThan(8000);
  });
  it("the plan cache answers a repeat with no second model call, from fresh data", async () => {
    const m = model(() => ({ kind: "do", lang: "en", reply: null, options: [], screen: { ...SCREEN_NULLS, recipe: "compare", zones: [13, 7], period: "weekly" } }));
    const d = { ...deps(m), dataVersion: async () => "v1" };
    const said = "show me how Adyar is doing compared to Ambattur";
    const a = await planRound(body(said, { turnId: "c1" }), WORLD, fakeHands(), "u", undefined, undefined, d);
    const b = await planRound(body(said, { turnId: "c2" }), WORLD, fakeHands(), "u", undefined, undefined, d);
    expect(a.result?.stage?.recipe).toBe("compare");
    expect(b.result?.stage?.recipe).toBe("compare");
    expect(m.asked.length).toBeLessThanOrEqual(1);
  });
  it("the plan cache keys on the whole sentence: a different panel or department never gets the last plan", async () => {
    const step = { action: "panel", panel: "markets" };
    const m = model(() => ({ kind: "do", lang: "en", reply: null, options: [], steps: [step] }));
    const d = { ...deps(m), dataVersion: async () => "v1" };
    await planRound(body("Show the markets panel", { turnId: "p1" }), WORLD, fakeHands(), "u", undefined, undefined, d);
    expect(m.asked.length).toBe(1);
    await planRound(body("Show the markets panel!", { turnId: "p2" }), WORLD, fakeHands(), "u", undefined, undefined, d);
    expect(m.asked.length).toBe(1);
    await planRound(body("Show the review panel", { turnId: "p3" }), WORLD, fakeHands(), "u", undefined, undefined, d);
    expect(m.asked.length).toBe(2);
  });
  it("a repeat that leans on a recent turn is not answered from the cache", async () => {
    const m = model(() => ({ kind: "do", lang: "en", reply: null, options: [], steps: [{ action: "panel", panel: "markets" }] }));
    const d = { ...deps(m), dataVersion: async () => "v1" };
    const turns = [{ heard: "severe cases in Adyar", did: "showed them" }];
    for (const said of ["show that panel", "also show the markets panel"]) {
      m.asked.length = 0;
      await planRound(body(said, { turnId: "e1", turns }), WORLD, fakeHands(), "u", undefined, undefined, d);
      await planRound(body(said, { turnId: "e2", turns }), WORLD, fakeHands(), "u", undefined, undefined, d);
      expect(m.asked.length, said).toBe(2);
    }
  });
  it("a say with a figure of the model's own and no placeholder falls back to the facts", async () => {
    let n = 0;
    const m = model(() => (n++ === 0
      ? { kind: "do", lang: "en", reply: null, options: [], calls: [{ tool: "zones", period: null, zone: null, dept: null, cat: null, taluk: null, place: null, metric: null, text: null }], done: false, say: null, screen: null }
      : { kind: "do", lang: "en", reply: null, options: [], calls: [], done: true, say: "Adyar has 9 severe incidents.", screen: { ...SCREEN_NULLS, recipe: "answer" } }));
    const h = fakeHands();
    await planRound(body("how many open complaints in total", { turnId: "lit" }), WORLD, h, "u", undefined, undefined, deps(m));
    const r = await planRound(body("how many open complaints in total", { turnId: "lit", round: 1 }), WORLD, h, "u", undefined, undefined, deps(m));
    expect(r.result?.stage?.recipe).toBe("answer");
    expect(r.result?.say ?? "").not.toMatch(/Adyar has 9/);
    expect(JSON.stringify(r.result?.stage?.blocks)).not.toMatch(/Adyar has 9/);
  });
  // redsec2-07: a data answer states at least one of the results' figures; one with none ("Adyar leads the list."), beside results that
  // have figures, is not the data speaking and the figures are shown (a record's title had ordered a figure-free false reassurance)
  it("a say with no figure, beside results that have figures, gives way to the figures", async () => {
    let n = 0;
    const m = model(() => (n++ === 0
      ? { kind: "do", lang: "en", reply: null, options: [], calls: [{ tool: "zones", period: null, zone: null, dept: null, cat: null, taluk: null, place: null, metric: null, text: null }], done: false, say: null, screen: null }
      : { kind: "do", lang: "en", reply: null, options: [], calls: [], done: true, say: "Adyar leads the list.", screen: { ...SCREEN_NULLS, recipe: "answer" } }));
    const h = fakeHands();
    await planRound(body("how many open complaints in total", { turnId: "plain" }), WORLD, h, "u", undefined, undefined, deps(m));
    const r = await planRound(body("how many open complaints in total", { turnId: "plain", round: 1 }), WORLD, h, "u", undefined, undefined, deps(m));
    expect(r.result?.say).not.toBe("Adyar leads the list.");
    expect(r.result?.say).toMatch(/^Severe in Adyar: \d+/);
  });
  it("the router's time counts against the turn's 8 s: the planner gets what is left, not a fresh budget", async () => {
    const real = Date.now.bind(Date);
    let ahead = 0;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => real() + ahead);
    try {
      const names: string[] = [];
      const generate = (async (c: JsonCall<unknown>) => {
        names.push(c.name);
        ahead = 9000; // the router took 9 s
        return { object: { lane: "district" }, info: { step: c.name, provider: "groq", model: "m", ms: 9000, inputTokens: 10, outputTokens: 2, attempts: 1 } };
      }) as never;
      const r = await planRound(body("what is the status of everything", { turnId: "slow" }), WORLD, fakeHands(), "u", undefined, undefined, { llm: { generate, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false } });
      expect(names).toEqual(["jarvis_router"]);
      expect(r.result).toMatchObject({ kind: "none", note: "no-model" });
    } finally { clock.mockRestore(); }
  });
  it("the map and a dataset are redacted on their way out too", async () => {
    const f = fakeHands();
    const h = safeHands({ ...f, map: async () => ({ total: 1, rows: [{ place_text: "Call 9876543210", phone: "9876543210" }] }), dataset: async () => ({ name: "d", rows: [{ id: "1", title: "Call 9876543210" }] as never }) });
    expect(JSON.stringify(await h.map("schools"))).not.toMatch(/9876543210/);
    expect(JSON.stringify(await h.dataset!("d"))).not.toMatch(/9876543210/);
    expect(safeHands({ ...f, dataset: undefined }).dataset).toBeUndefined();
  });
  it("every tool result is redacted on its way out, and repeated within 30 s from the cache", async () => {
    let n = 0;
    const h = safeHands({ ...fakeHands(), tool: async () => { n++; return { data: { rows: [{ title: "Call 9876543210", phone: "9876543210" }] }, facts: [] } as unknown as ToolResult; } });
    const r = await h.tool("incidents", {});
    expect(JSON.stringify(r)).not.toMatch(/9876543210/);
    await h.tool("incidents", {});
    expect(n).toBe(1);
  });
  it("an observation is about 150 tokens at most, even for a large result", () => {
    const facts = Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, label: `A rather long label for fact number ${i}`, value: i }));
    const rows = Array.from({ length: 30 }, (_, i) => ({ title: `Row with a long title ${i}` }));
    const o = observation("zones", { scope: {} }, { facts, data: { rows } } as unknown as ToolResult, { values: {} });
    expect(o.length).toBeLessThanOrEqual(525);
  });
  it("an aborted round stops: the browser's cancel reaches the model call", async () => {
    const ctl = new AbortController();
    ctl.abort();
    const m = model(() => ({ kind: "chat", lang: "en", reply: "x", options: [] }));
    await expect(planRound(body("put together something for me", { turnId: "ab" }), WORLD, fakeHands(), "u", undefined, ctl.signal, deps(m))).rejects.toThrow();
  });
});
