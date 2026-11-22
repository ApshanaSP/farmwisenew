import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonCall, JsonResult } from "@/lib/ai/gateway";
import type { ToolResult } from "@/lib/assistant/types";
import { finish, type AgentPlan } from "./agent";
import { START, WORLD } from "./fixture";
import { Ledger, MemoryStore } from "./ledger";
import { clearCaches, planRound, RoundBody, type RoundBodyT } from "./round";
import { bundleByRules } from "./router";
import { fakeHands } from "./stagefake";

// v12 (21 Nov): the owner's 06:33-06:42 sentences reach the city screen in code, with or without a model, and a model's complaint filters for
// one of them become the city screen
const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const body = (text: string, o: Partial<RoundBodyT> = {}): RoundBodyT => RoundBody.parse({ turnId: `t-${Math.random().toString(36).slice(2, 8)}`, round: 0, text, state: STATE, turns: [], stage: null, direct: null, ...o });
const NEWS_TURN = [{ heard: "read today's news", did: "showed a screen", recipe: "news" as const, slots: { period: "daily" } }];
const SCREEN_NULLS = { period: null, zones: [], dept: null, depts: [], cat: null, taluk: null, sev: null, status: null, q: null, metric: null, measure: null, by: null, order: null, n: null, item: null, id: null, name: null, what: null, sort: null, metricId: null, focus: null, rain: null };

function model(answer: (c: JsonCall<unknown>) => unknown, claude = false) {
  const asked: { name: string; system: string; prompt: string }[] = [];
  const generate = async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => {
    asked.push({ name: c.name, system: c.system, prompt: c.prompt });
    const object = (c.name === "jarvis_router" ? { lane: "district" } : answer(c as JsonCall<unknown>)) as U;
    return { object, info: { step: c.name, provider: "groq", model: "fake", ms: 1, inputTokens: 100, outputTokens: 20, attempts: 1 } };
  };
  return { asked, deps: { llm: { generate: generate as never, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false, claudeOk: () => claude } } };
}

/** city_now as the server gives it, with the focus or the rain asked for */
const spot = { kind: "spot", focus: "worst-jam", id: "tt-very-12", name: "Anna Salai: Gemini → Thousand Lights", lat: 13.06, lon: 80.25, level: "very", zoneName: "Teynampet",
  owner: { dept: "POL-GCP", name: "Greater Chennai Traffic Police", ta: "சென்னை போக்குவரத்துக் காவல்", why: "A jam." }, why: "Very congested, about 12 min delay", delayMin: 12, lengthM: 800, reports: 4, open: 2,
  line: { en: "Anna Salai: Gemini → Thousand Lights (Teynampet) is the most congested now: very congested, about 12 min delay over 800 m. 4 reports near it in the last month, 2 still open. Greater Chennai Traffic Police answers for it; its card has Send.", ta: "அண்ணா சாலை இப்போது அதிக நெரிசலான சாலை." } };
const rainOf = { id: "rain-2026-10-21", start: "2026-10-21 06:00:00", latest: true, reports: 9, streets: [{ key: "s1", label: "Velachery Main Road", label_ta: "வேளச்சேரி பிரதான சாலை", ward: 177, lat: 12.98, lon: 80.22, n: 5 }, { key: "s2", label: "Taramani Link Road", label_ta: "தரமணி இணைப்பு சாலை", ward: 178, lat: 12.99, lon: 80.24, n: 3 }],
  line: { en: "In the last heavy rain (21 October), 2 streets flooded: Velachery Main Road, Taramani Link Road.", ta: "கடந்த கனமழையில் (21 அக்டோபர்) 2 தெருக்களில் வெள்ளம்." } };
function cityNow(args: Record<string, unknown>): ToolResult {
  const focus = args.focus ? spot : null, ro = args.rain ? rainOf : null;
  const facts = [{ id: "city.traffic.very", label: "Very congested stretches now", value: 3 },
    ...(focus ? [{ id: "city.traffic.focus.delay", label: "Delay at Anna Salai", value: 12, unit: "min" }, { id: "city.traffic.focus.length", label: "Length of the jam", value: 800, unit: "m" },
      { id: "city.traffic.focus.reports", label: "Reports near it in 30 days", value: 4 }, { id: "city.traffic.focus.open", label: "Still open near it", value: 2 }] : []),
    ...(ro ? [{ id: "city.flood.rain.streets", label: "Streets with flooding reports in the rain of 21 October", value: 2 }, { id: "city.flood.rain.reports", label: "Flooding reports in that rain", value: 9 }] : [])];
  return { scope: null, asOf: "2026-11-21 12:00:00", tool: "city_now", args,
    data: { topic: args.topic, headline: { en: "Live traffic now", ta: "நேரடி போக்குவரத்து" }, say: { en: focus?.line.en ?? ro?.line.en ?? "Live traffic across the district: 3 very congested stretches.", ta: "நேரடி போக்குவரத்து." },
      rows: [], view: { kind: "traffic" }, missing: [], focus, rainOf: ro },
    facts, sources: [], incidentIds: [], testData: true, caveats: [], untrusted: ["place", "detail", "name", "label", "label_ta"] } as unknown as ToolResult;
}
const hands = () => fakeHands({ city_now: cityNow });

describe("v12: the city on the ground, routed in code", () => {
  beforeEach(() => { clearCaches(); vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-city12-"))); });
  afterEach(() => vi.unstubAllEnvs());

  it("'Okay, show me live traffic in map.' after another turn is the fast lane's city screen, no planner (06:33)", async () => {
    const m = model(() => { throw new Error("the planner was asked"); });
    const r = await planRound(body("Okay, show me live traffic in map.", { turns: NEWS_TURN }), WORLD, hands(), "u", undefined, undefined, m.deps);
    expect(r.lane).toBe("quick");
    expect(r.result?.stage?.recipe).toBe("city");
    expect(m.asked.filter((a) => a.name !== "jarvis_router")).toEqual([]);
  });

  it("'Okay, now tell me, show me in the map.' after the traffic is the traffic on the map (06:38)", async () => {
    const m = model(() => { throw new Error("the planner was asked"); });
    const turns = [{ heard: "Show me live traffic.", did: "showed a screen", recipe: "city" as const, slots: { q: "traffic" } }];
    const r = await planRound(body("Okay, now tell me, show me in the map.", { turns }), WORLD, hands(), "u", undefined, undefined, m.deps);
    expect(r.lane).toBe("quick");
    expect(r.result?.stage?.slots).toMatchObject({ q: "traffic" });
  });

  it("'the most congested road' is one spot: its tiles, its line, one map point with the spot's id (06:39)", async () => {
    const m = model(() => { throw new Error("the planner was asked"); });
    const r = await planRound(body("Show me the details about the most congested road."), WORLD, hands(), "u", undefined, undefined, m.deps);
    const st = r.result?.stage;
    expect(st?.recipe).toBe("city");
    expect(st?.slots).toMatchObject({ q: "traffic", focus: "worst-jam" });
    expect(st?.title).toMatch(/^Most congested now: Anna Salai/);
    expect(r.result?.say).toMatch(/about 12 min delay over 800 m/);
    const pts = st?.blocks.find((b) => b.kind === "MapView" && b.id === "spot");
    expect(pts && pts.kind === "MapView" ? pts.points.map((p) => p.id) : null).toEqual(["tt-very-12"]);
    const kpis = st?.blocks.find((b) => b.kind === "Kpis");
    expect(kpis && kpis.kind === "Kpis" ? kpis.items.map((k) => k.value) : null).toEqual([12, 800, 4, 2]);
  });

  it("'the flooded streets in the last rain' is that rain's streets, said in code (06:41)", async () => {
    const m = model(() => { throw new Error("the planner was asked"); });
    const r = await planRound(body("What are the flooded streets in the last rain?"), WORLD, hands(), "u", undefined, undefined, m.deps);
    expect(r.result?.stage?.slots).toMatchObject({ q: "flood", rain: "latest" });
    expect(r.result?.say).toBe("In the last heavy rain (21 October), 2 streets flooded: Velachery Main Road, Taramani Link Road.");
    expect(r.result?.stage?.blocks.some((b) => b.kind === "Ranking")).toBe(true);
  });

  it("a planner's traffic-complaints filter and map for a city sentence becomes the city screen, and its line is dropped", async () => {
    // ("also" keeps the sentence out of the fast lane, so the planner plans it, as Haiku did at 06:33)
    const m = model(() => ({ kind: "do", lang: "en", reply: "Showing the traffic complaints on the map.", options: [], calls: [], done: true, say: null, stage: null,
      steps: [{ action: "view", cat: "TRAFFIC_OBSTRUCTION", page: null, period: null, zone: null, dept: null, taluk: null, sev: null, panel: null, mapMode: null, layer: null, on: null, item: null, which: null, option: null, n: null, text: null, when: null },
        { action: "layer", layer: "severe", on: true, cat: null, page: null, period: null, zone: null, dept: null, taluk: null, sev: null, panel: null, mapMode: null, item: null, which: null, option: null, n: null, text: null, when: null }],
      screen: { ...SCREEN_NULLS, recipe: "map", what: "severe" } }));
    const r = await planRound(body("also show me live traffic in map"), WORLD, hands(), "u", undefined, undefined, m.deps);
    expect(r.lane).toBe("planner");
    expect(r.result?.stage?.recipe).toBe("city");
    expect(r.result?.reply).toBeNull();
    expect(r.result?.steps.some((s) => s.a === "view" && !!s.view.cat)).toBe(false);
    expect(r.result?.steps.some((s) => s.a === "layer")).toBe(false);
  });

  it("with Claude leading, round 0 asks with the wide bundle and reads the snapshot; without, the keyword bundle and no snapshot read", async () => {
    let reads = 0;
    const snapshot = async () => { reads++; return null; };
    const chat = () => ({ kind: "chat", lang: "en", reply: "ok", options: [], calls: [], done: true, say: null, steps: [], stage: null, screen: null });
    const on = model(chat, true);
    await planRound(body("put together something for my morning"), WORLD, hands(), "u", undefined, undefined, { ...on.deps, snapshot });
    expect(on.asked.find((a) => a.name !== "jarvis_router")?.name).toBe("jarvis_wide0");
    expect(reads).toBe(1);
    const off = model(chat, false);
    await planRound(body("put together something for my morning"), WORLD, hands(), "u", undefined, undefined, { ...off.deps, snapshot });
    expect(off.asked.find((a) => a.name !== "jarvis_router")?.name).toBe("jarvis_screens0");
    expect(reads).toBe(1);
  });

  it("finish(): the planners' own plans of 06:33 and 06:41 become the city screen, their lines dropped, a page move kept", async () => {
    const step = (o: Record<string, unknown>) => ({ action: "help", page: null, period: null, zone: null, dept: null, cat: null, taluk: null, sev: null, panel: null, mapMode: null, layer: null,
      on: null, item: null, which: null, option: null, n: null, text: null, when: null, ...o });
    const plan = (o: Record<string, unknown>) => ({ kind: "do", lang: "en", reply: null, steps: [], screen: null, stage: null, calls: [], done: true, say: null, options: [], ...o }) as unknown as AgentPlan;
    const run0 = () => ({ t0: Date.now(), rounds: 1, model: "m", results: [], clock: Date.now, until: Date.now() + 8000 });
    const input = (text: string) => ({ text, state: START, ctx: { turns: [] }, stage: null, screen: [], lang: "en" as const });
    const d = { world: WORLD, hands: hands(), llm: async () => { throw new Error("no model here"); } };
    // Haiku, 06:33: a traffic-complaints filter, the severe layer and the map recipe
    const a = await finish(plan({ reply: "Showing traffic complaints on the map.", steps: [step({ action: "view", cat: "TRAFFIC_OBSTRUCTION" }), step({ action: "layer", layer: "severe", on: true })],
      screen: { ...SCREEN_NULLS, recipe: "map", what: "severe" } }), input("Okay, show me live traffic in map."), d, run0());
    expect(a.stage?.recipe).toBe("city");
    expect(a.stage?.slots).toMatchObject({ q: "traffic" });
    expect(a.reply).toBeNull();
    // qwen, 06:41: today's flooding complaints, the Overview, daily, said as "Showing the flooded roads from the last rain"
    const b = await finish(plan({ reply: "Showing the flooded roads from the last rain.", steps: [step({ action: "view", cat: "FLOOD_WATERLOGGING" }), step({ action: "page", page: "overview" }), step({ action: "period", period: "daily" })] }),
      input("Go to the show me the roads. which was flooded in. Rain. In the last range."), d, run0());
    expect(b.stage?.slots).toMatchObject({ q: "flood", rain: "latest" });
    expect(b.reply).toBeNull();
    expect(b.steps.filter((s) => s.a !== "page")).toEqual([]);
    // a filter that is not the city's stays the model's (garbage complaints are no city view)
    const c = await finish(plan({ steps: [step({ action: "view", cat: "SOLID_WASTE" })] }), input("Okay, show me live traffic in map."), d, run0());
    expect(c.stage).toBeNull();
  });

  it("a console verb with the city goes to the wide bundle (it holds the city screen), not the steps-only console one", () => {
    expect(bundleByRules("take me to the worst jam", false)).toBe("wide");
    expect(bundleByRules("Go to the show me the roads. which was flooded in. Rain. In the last range.", false)).toBe("wide");
    expect(bundleByRules("go to trends", false)).toBe("console");
  });
});
