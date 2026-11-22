/**
 * v13 (21 Nov review of v12's city routing), the server's part: the owner's six sentences reach the city screen in code with the right
 * slots; finish() keeps a model's valid cases or map plan (finding 0 3); a follow-up that points back ("the traffic there") goes to the
 * planner with its turns (0 5); the wide bundle knows the city recipe, with Tamil city lines (0 10, 1 5); the client's rules fallback
 * reads cityQuick's bail-outs (0 9, as a function).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonCall, JsonResult } from "@/lib/ai/gateway";
import type { ToolResult } from "@/lib/assistant/types";
import { finish, type AgentPlan } from "./agent";
import { START, WORLD } from "./fixture";
import { Ledger, MemoryStore } from "./ledger";
import { cityQuick } from "./quick";
import { clearCaches, plannerWarm, planRound, RoundBody, systemFor, type RoundBodyT } from "./round";
import { fakeHands } from "./stagefake";

const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const body = (text: string, o: Partial<RoundBodyT> = {}): RoundBodyT => RoundBody.parse({ turnId: `t-${Math.random().toString(36).slice(2, 8)}`, round: 0, text, state: STATE, turns: [], stage: null, direct: null, ...o });
const SCREEN_NULLS = { period: null, zones: [], dept: null, depts: [], cat: null, taluk: null, sev: null, status: null, q: null, metric: null, measure: null, by: null, order: null, n: null, item: null, id: null, name: null, what: null, sort: null, metricId: null, focus: null, rain: null };

function model(answer: (c: JsonCall<unknown>) => unknown) {
  const asked: { name: string; system: string; prompt: string }[] = [];
  const generate = async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => {
    asked.push({ name: c.name, system: c.system, prompt: c.prompt });
    const object = (c.name === "jarvis_router" ? { lane: "district" } : answer(c as JsonCall<unknown>)) as U;
    return { object, info: { step: c.name, provider: "groq", model: "fake", ms: 1, inputTokens: 100, outputTokens: 20, attempts: 1 } };
  };
  return { asked, deps: { llm: { generate: generate as never, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false, claudeOk: () => false } } };
}
const noPlanner = () => model(() => { throw new Error("the planner was asked"); });
const CHAT = () => ({ kind: "chat", lang: "en", reply: "ok", options: [], calls: [], done: true, say: null, steps: [], stage: null, screen: null });

const spot = { kind: "spot", focus: "worst-jam", id: "tt-very-12", name: "Anna Salai: Gemini → Thousand Lights", lat: 13.06, lon: 80.25, level: "very", zoneName: "Teynampet",
  owner: { dept: "POL-GCP", name: "Greater Chennai Traffic Police", ta: "சென்னை போக்குவரத்துக் காவல்", why: "A jam." }, why: "Very congested, about 12 min delay", delayMin: 12, lengthM: 800, reports: 4, open: 2,
  line: { en: "Anna Salai: Gemini → Thousand Lights (Teynampet) is the most congested now: very congested, about 12 min delay over 800 m. Greater Chennai Traffic Police answers for it; its card has Send.", ta: "அண்ணா சாலை இப்போது அதிக நெரிசலான சாலை." } };
const rainOf = { id: "rain-2026-10-21", start: "2026-10-21 06:00:00", latest: true, reports: 9, streets: [{ key: "s1", label: "Velachery Main Road", label_ta: "வேளச்சேரி பிரதான சாலை", ward: 177, lat: 12.98, lon: 80.22, n: 5 }],
  line: { en: "In the last heavy rain (21 October), 1 street flooded: Velachery Main Road.", ta: "கடந்த கனமழையில் (21 அக்டோபர்) 1 தெருவில் வெள்ளம்." } };
function cityNow(args: Record<string, unknown>): ToolResult {
  const focus = args.focus ? spot : null, ro = args.rain ? rainOf : null;
  const facts = [{ id: "city.traffic.very", label: "Very congested stretches now", value: 3 }, { id: "city.flood.streets", label: "Streets that flood", value: 4 },
    ...(focus ? [{ id: "city.traffic.focus.delay", label: "Delay", value: 12, unit: "min" }, { id: "city.traffic.focus.length", label: "Length", value: 800, unit: "m" }] : []),
    ...(ro ? [{ id: "city.flood.rain.streets", label: "Streets with flooding reports", value: 1 }, { id: "city.flood.rain.reports", label: "Flooding reports", value: 9 }] : [])];
  const say = focus?.line.en ?? ro?.line.en ?? (args.topic === "flood" ? "Streets that flood in heavy rain: 4." : "Live traffic across the district: 3 very congested stretches.");
  return { scope: null, asOf: "2026-11-21 12:00:00", tool: "city_now", args,
    data: { topic: args.topic, headline: { en: "The city now", ta: "நகர நிலவரம்" }, say: { en: say, ta: "நகர நிலவரம்." }, rows: [], view: { kind: args.topic === "flood" ? "rain" : "traffic" }, missing: [], focus, rainOf: ro },
    facts, sources: [], incidentIds: [], testData: true, caveats: [], untrusted: ["place", "detail", "name", "label", "label_ta"] } as unknown as ToolResult;
}
const hands = () => fakeHands({ city_now: cityNow });

describe("v13: the owner's six sentences, routed in code", () => {
  beforeEach(() => { clearCaches(); vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-city13-"))); });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["Where are the flooded roads?", { q: "flood", focus: null, rain: null }],
    ["What are the flooded streets in the last rain?", { q: "flood", focus: null, rain: "latest" }],
    ["Zoom in the map to the most congested area", { q: "traffic", focus: "worst-jam", rain: null }],
    ["Show me the most congested traffic now", { q: "traffic", focus: "worst-jam", rain: null }],
    ["Show me live traffic in the map", { q: "traffic", focus: null, rain: null }],
    ["Go to the map, show live traffic and zoom to the worst jam", { q: "traffic", focus: "worst-jam", rain: null }]
  ])("%s: the fast lane's city screen, no planner", async (said, slots) => {
    const m = noPlanner();
    const r = await planRound(body(said), WORLD, hands(), "u", undefined, undefined, m.deps);
    expect(r.lane).toBe("quick");
    expect(r.result?.stage?.recipe).toBe("city");
    // (a screen's slots leave out a focus or a rain not set)
    const sl = r.result?.stage?.slots ?? {};
    expect({ q: sl.q, focus: sl.focus ?? null, rain: sl.rain ?? null }).toEqual(slots);
    expect(m.asked.filter((a) => a.name !== "jarvis_router")).toEqual([]);
  });

  it("'Okay, now tell me, show me in the map' after the most congested traffic: the traffic again, with that answer's focus", async () => {
    const m = noPlanner();
    const turns = [{ heard: "Show me the most congested traffic now", did: "showed a screen", recipe: "city" as const, slots: { q: "traffic", focus: "worst-jam" } }];
    const r = await planRound(body("Okay, now tell me, show me in the map", { turns }), WORLD, hands(), "u", undefined, undefined, m.deps);
    expect(r.lane).toBe("quick");
    expect(r.result?.stage?.slots).toMatchObject({ q: "traffic", focus: "worst-jam" });
  });

  it("the most congested road's line is code's own (no aide), and the flooded streets in the last rain say that rain", async () => {
    const a = await planRound(body("Show me the most congested traffic now"), WORLD, hands(), "u", undefined, undefined, noPlanner().deps);
    expect(a.result?.say).toMatch(/is the most congested now: very congested, about 12 min delay over 800 m/);
    const b = await planRound(body("What are the flooded streets in the last rain?"), WORLD, hands(), "u", undefined, undefined, noPlanner().deps);
    expect(b.result?.say).toBe("In the last heavy rain (21 October), 1 street flooded: Velachery Main Road.");
  });
});

describe("v13 finding 0 5: a follow-up that points back goes to the planner with its turns", () => {
  beforeEach(() => { clearCaches(); vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-city13b-"))); });
  afterEach(() => vi.unstubAllEnvs());
  const ADYAR = [{ heard: "severe cases in Adyar", did: "showed a screen", recipe: "cases" as const, slots: { zones: [13] } }];
  it.each(["And the traffic there?", "Okay, what about traffic in that zone?", "Now the traffic near it", "What about the flooded streets there?"])("%s: the turns are read (a frame or the planner), not the fast lane", async (said) => {
    const m = model(CHAT);
    const r = await planRound(body(said, { turns: ADYAR }), WORLD, hands(), "u", undefined, undefined, m.deps);
    expect(["frame", "planner"]).toContain(r.lane);
  });
  it("'What about the flooded streets there?' after Adyar is Adyar's flooding (the follow-up's frame), not the district's flood streets", async () => {
    const r = await planRound(body("What about the flooded streets there?", { turns: ADYAR }), WORLD, hands(), "u", undefined, undefined, model(CHAT).deps);
    expect(r.result?.stage?.slots).toMatchObject({ zones: [13], cat: "FLOOD_WATERLOGGING" });
  });
  it("'Okay, show it on the map' after a city answer is that answer, with no planner", async () => {
    const turns = [{ heard: "Show me live traffic.", did: "showed a screen", recipe: "city" as const, slots: { q: "traffic" } }];
    const r = await planRound(body("Okay, show it on the map", { turns }), WORLD, hands(), "u", undefined, undefined, noPlanner().deps);
    expect(r.lane).toBe("quick");
    expect(r.result?.stage?.slots).toMatchObject({ q: "traffic" });
  });
});

describe("v13 finding 0 3: finish() keeps a model's valid plan", () => {
  const step = (o: Record<string, unknown>) => ({ action: "help", page: null, period: null, zone: null, dept: null, cat: null, taluk: null, sev: null, panel: null, mapMode: null, layer: null,
    on: null, item: null, which: null, option: null, n: null, text: null, when: null, ...o });
  const plan = (o: Record<string, unknown>) => ({ kind: "do", lang: "en", reply: null, steps: [], screen: null, stage: null, calls: [], done: true, say: null, options: [], ...o }) as unknown as AgentPlan;
  const run0 = () => ({ t0: Date.now(), rounds: 1, model: "m", results: [], clock: Date.now, until: Date.now() + 8000 });
  const input = (text: string) => ({ text, state: START, ctx: { turns: [] }, stage: null, screen: [], lang: "en" as const });
  const d = () => ({ world: WORLD, hands: hands(), llm: async () => { throw new Error("no model here"); } });

  it("the reviewers' plans: Adyar's flooding today and this week's traffic issues stay the cases the model chose", async () => {
    const a = await finish(plan({ screen: { ...SCREEN_NULLS, recipe: "cases", cat: "FLOOD_WATERLOGGING", zones: [13], period: "daily" } }), input("Show only the flooded streets reported today in Adyar"), d(), run0());
    expect(a.stage?.recipe).toBe("cases");
    expect(a.stage?.slots).toMatchObject({ cat: "FLOOD_WATERLOGGING", zones: [13] });
    const b = await finish(plan({ screen: { ...SCREEN_NULLS, recipe: "cases", cat: "TRAFFIC_OBSTRUCTION", period: "weekly" } }), input("Show me the traffic issues reported this week"), d(), run0());
    expect(b.stage?.recipe).toBe("cases");
  });
  it("a cases or map screen is replaced only when the sentence asks for the map, a spot or a rain, and never one whose zone it named", async () => {
    // no map, spot or rain asked: the model's flooding cases for Adyar stay
    const a = await finish(plan({ screen: { ...SCREEN_NULLS, recipe: "cases", cat: "FLOOD_WATERLOGGING", zones: [13] } }), input("Where are the flooded roads in Adyar?"), d(), run0());
    expect(a.stage?.recipe).toBe("cases");
    // the map asked, and the zone named: the model's map of Adyar's flooding stays
    const b = await finish(plan({ screen: { ...SCREEN_NULLS, recipe: "map", what: "cases", cat: "FLOOD_WATERLOGGING", zones: [13] } }), input("Show the flooded streets in Adyar on the map"), d(), run0());
    expect(b.stage?.recipe).toBe("map");
    // the map asked, no place: the city screen, as at 06:33
    const c = await finish(plan({ screen: { ...SCREEN_NULLS, recipe: "map", what: "severe" }, steps: [step({ action: "view", cat: "TRAFFIC_OBSTRUCTION" })] }), input("Okay, show me live traffic in map."), d(), run0());
    expect(c.stage?.recipe).toBe("city");
  });
  it("an empty plan is no city screen (the checker's), and a steps-only plan needs a city filter or the map asked", async () => {
    const a = await finish(plan({}), input("Show me live traffic in the map"), d(), run0());
    expect(a.stage ?? null).toBeNull();
    expect(a.note).toBe("checker");
    const b = await finish(plan({ steps: [step({ action: "page", page: "overview" })] }), input("Go to the map, show live traffic and zoom to the worst jam"), d(), run0());
    expect(b.stage?.recipe).toBe("city");
    expect(b.stage?.slots).toMatchObject({ q: "traffic", focus: "worst-jam" });
    expect(b.steps.map((s) => s.a)).toEqual(["page"]);
  });
});

describe("v13 findings 0 10 and 1 5: the wide bundle knows the city recipe", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("its system prompt has the city entry; the warm-up's prefix is the same", () => {
    vi.stubEnv("JARVIS_SNAPSHOT", "0");
    const wide = systemFor("wide", WORLD);
    // (v14, the review of v13, routing 7: the entry is the recipe and its q values, and the two Tamil city lines are out: they pushed
    // ordinary wide prompts with the live lists to SHRINK's last row; the code lanes read both sentences now. round.v14.test has the budget)
    expect(wide).toContain("city[q traffic|flood|power|metro|all,focus,rain]: to SEE the city live, never complaint filters");
    expect(wide).not.toMatch(/-> city q power/);
    expect(plannerWarm(WORLD).system).toBe(wide);
    // the data bundle is as it was
    expect(systemFor("data", WORLD)).not.toContain("city[q traffic");
  });
});

describe("v13 finding 0 9: the client's rules fallback reads cityQuick's bail-outs", () => {
  it.each(["Show the power outage trend this month", "Compare traffic in Adyar and Teynampet", "morning briefing on traffic", "Show only traffic"])("%s: no city screen", (said) => {
    expect(cityQuick(said, WORLD)).toBeNull();
  });
  it("the owner's sentences are the city's there too", () => {
    expect(cityQuick("Where are the flooded roads?", WORLD)?.slots).toMatchObject({ q: "flood" });
    expect(cityQuick("Show me the most congested traffic now", WORLD)?.slots).toMatchObject({ q: "traffic", focus: "worst-jam" });
    // (a place named with the flood streets is that place's flooding: the cases' lanes, finding 0 2)
    expect(cityQuick("Show the flooded streets in Adyar", WORLD)).toBeNull();
  });
});
