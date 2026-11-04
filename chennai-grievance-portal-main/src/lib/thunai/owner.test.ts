/**
 * The owner's features, each end to end from a sentence to a checked screen, in English, Tamil and Tanglish, with no model:
 * compare, what stands out, complete this data, what first. And the never-rules: no Groq keys, no send, no number of its own.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { figuresIn } from "./numbergate";
import { WORLD } from "./fixture";
import { clearCaches, planRound, RoundBody, type RoundBodyT } from "./round";
import { fakeHands } from "./stagefake";
import { checkStage, figuresOf, type StageDocT } from "./stage";
import { SOURCES } from "./complete";
import type { Hands } from "./screens";

const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const body = (text: string, o: Partial<RoundBodyT> = {}): RoundBodyT => RoundBody.parse({ turnId: `o-${Math.random().toString(36).slice(2, 9)}`, round: 0, text, state: STATE, turns: [], stage: null, direct: null, ...o });
const noModel = { llm: { generate: (async () => { throw new Error("no model should be asked"); }) as never, bedrockOk: () => false } };

const INCIDENTS = { data: { rows: [
  { id: "INC-W", title: "Drain at ward 170", sev: "High", status: "Open", ward: 170, loc: "Bridge Road", type: "Flooding & waterlogging", first: "2026-11-03 08:00:00" },
  { id: "INC-G", title: "Garbage at Velachery", sev: "High", status: "Open", loc: "Velachery", dept: "GCC-SWM", dept_name: "Solid Waste Management", first: "2026-11-03 09:00:00" },
  { id: "INC-N", title: "Report with nothing to go on", sev: "Low", status: "Open", first: "2026-11-03 10:00:00" }
], total: 3 }, facts: [], sources: [], incidentIds: [], asOf: "2026-11-04 08:00:00", scope: {}, caveats: [], untrusted: [], testData: true };
const withLookups = (): Hands => {
  const h = fakeHands({ incidents: () => INCIDENTS });
  return { ...h, lookups: () => ({
    wardZone: (w) => (w === 170 ? { zone: 13, name: "Adyar" } : null),
    placeZone: (p) => (p === "Velachery" ? { zone: 13, name: "Adyar" } : null),
    catLead: (c) => (/Flooding/.test(c) ? { code: "GCC-SWD", name: "Storm Water Drains" } : null)
  }) };
};

/** every figure said on a screen must be on it */
function sayIsOnScreen(doc: StageDocT, lang: "en" | "ta") {
  const onScreen = figuresOf(doc);
  for (const f of figuresIn(doc.say[lang])) if (!f.words) expect(onScreen.has(String(f.value)), `${f.raw} in ${doc.say[lang]}`).toBe(true);
}

describe("the owner's features, end to end, no model", () => {
  beforeEach(() => { clearCaches(); vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-own-"))); });
  afterEach(() => vi.unstubAllEnvs());

  it.each([["compare Adyar and Ambattur this week", "en"], ["அடையாறு மற்றும் அம்பத்தூர் ஒப்பிடு", "ta"], ["Adyar and Ambattur compare pannu", "ta"]])("compare: %s", async (t, lang) => {
    const r = await planRound(body(t), WORLD, fakeHands(), "u", undefined, undefined, noModel);
    expect(r.result?.stage?.recipe).toBe("compare");
    const doc = r.result!.stage!;
    expect(checkStage(doc).ok).toBe(true);
    const cmp = doc.blocks.find((b) => b.kind === "Compare");
    expect(cmp && cmp.kind === "Compare" && cmp.sides.length).toBe(2);
    expect(doc.say.en).toMatch(/gap|Adyar/);
    expect(doc.say.ta).toMatch(/[஀-௿]/);
    expect(r.result?.lang).toBe(lang);
    sayIsOnScreen(doc, "en");
  });
  it.each(["what stands out this week", "any anomalies in Adyar", "தனித்து நிற்பது என்ன", "unusual a enna irukku"])("what stands out: %s", async (t) => {
    const r = await planRound(body(t), WORLD, fakeHands(), "u", undefined, undefined, noModel);
    expect(r.result?.stage?.recipe).toBe("insight");
    const doc = r.result!.stage!;
    expect(checkStage(doc).ok).toBe(true);
    const f = doc.blocks.find((b) => b.kind === "Findings");
    expect(f && f.kind === "Findings" && f.items.length).toBeGreaterThan(0);
    if (f && f.kind === "Findings") for (const i of f.items) { expect(i.method.length).toBeGreaterThan(4); expect(i.n).toBeGreaterThan(0); expect(i.caveat.length).toBeGreaterThan(4); }
  });
  it.each(["complete this data", "fill in the missing data for the unresolved incidents", "விடுபட்ட தரவை நிரப்பு", "missing data fill pannu"])("complete this data: %s", async (t) => {
    const r = await planRound(body(t), WORLD, withLookups(), "u", undefined, undefined, noModel);
    expect(r.result?.stage?.recipe).toBe("complete");
    const doc = r.result!.stage!;
    expect(checkStage(doc).ok, JSON.stringify(checkStage(doc))).toBe(true);
    const b = doc.blocks.find((x) => x.kind === "Filled");
    if (!b || b.kind !== "Filled") throw new Error("no table");
    const zone = b.cols.findIndex((c) => c.key === "zone"), dept = b.cols.findIndex((c) => c.key === "dept");
    const rows = Object.fromEntries(b.rows.map((x) => [x.id, x.cells]));
    expect(rows["INC-W"][zone]).toMatchObject({ v: "Adyar", filled: true, src: SOURCES.ward });
    expect(rows["INC-G"][zone]).toMatchObject({ v: "Adyar", filled: true, src: SOURCES.gazetteer });
    expect(rows["INC-W"][dept]).toMatchObject({ v: "Storm Water Drains", filled: true, src: SOURCES.lead });
    // what cannot be filled stays blank, is named, and a draft is offered for the tray
    expect(rows["INC-N"][zone]).toEqual({ v: null, src: null, filled: false });
    expect(b.cannot.length).toBeGreaterThan(0);
    expect(doc.say.en).toMatch(/Nothing was guessed/);
    expect(doc.next?.some((n) => n.kind === "draft" && n.ids.includes("INC-N"))).toBe(true);
    // every filled cell shows its source
    for (const row of b.rows) for (const c of row.cells) if (c.filled) expect(c.src).toBeTruthy();
  });
  const filledOf = (doc: StageDocT) => { const b = doc.blocks.find((x) => x.kind === "Filled"); if (!b || b.kind !== "Filled") throw new Error("no table"); return b; };
  it("complete this data says when it covers part of the list, from the tool's total", async () => {
    const h = fakeHands({ incidents: () => ({ ...INCIDENTS, data: { ...INCIDENTS.data, total: 212 } }) });
    const r = await planRound(body("complete this data"), WORLD, h, "u", undefined, undefined, noModel);
    const doc = r.result!.stage!;
    expect(checkStage(doc).ok).toBe(true);
    expect(filledOf(doc).title).toMatch(/first 3 of 212/);
    expect(doc.say.en).toMatch(/^The first 3 of 212\./);
    expect(doc.takeaway?.en).toMatch(/first 3 of 212/i);
    sayIsOnScreen(doc, "en");
    sayIsOnScreen(doc, "ta");
  });
  it("complete this data with slots.ids completes those rows and not the console's list", async () => {
    const h = fakeHands();
    const r = await planRound(body("complete this data", { direct: { recipe: "complete", slots: { ids: ["INC-A1", "INC-A2", "not an id", "INC-A1"], period: "weekly" }, lang: "en" } }), WORLD, h, "u", undefined, undefined, noModel);
    const doc = r.result!.stage!;
    expect(checkStage(doc).ok, JSON.stringify(checkStage(doc))).toBe(true);
    expect(filledOf(doc).rows.map((x) => x.id)).toEqual(["INC-A1", "INC-A2"]);
    expect(h.calls).not.toContain("incidents");
    expect(doc.title).not.toMatch(/first/);
    expect(doc.slots.ids).toEqual(["INC-A1", "INC-A2"]);
  });
  it("complete this data with slots.ids says how many it could not read", async () => {
    const h = fakeHands({ incident_detail: (a) => ({ tool: "incident_detail", args: a, scope: null, asOf: "2026-10-29 07:00:00", data: null, facts: [], sources: [], incidentIds: [], testData: true, caveats: [] }) });
    const r = await planRound(body("complete this data", { direct: { recipe: "complete", slots: { ids: ["INC-A1"] }, lang: "en" } }), WORLD, h, "u", undefined, undefined, noModel);
    expect(r.result!.stage!.notes.join(" ")).toMatch(/1 of the 1 rows could not be read/);
  });
  it("a row with nothing missing is not claimed as filled, though its age is shown", async () => {
    const row = { id: "INC-FULL", title: "Drain", sev: "High", status: "Open", ward: 170, zone: 13, zone_name: "Adyar", loc: "Bridge Road", dept: "GCC-SWD", dept_name: "Storm Water Drains", t: "2026-11-03 08:00:00" };
    const r = await planRound(body("complete this data"), WORLD, fakeHands({ incidents: () => ({ ...INCIDENTS, data: { rows: [row], total: 1 } }) }), "u", undefined, undefined, noModel);
    const doc = r.result!.stage!;
    const b = filledOf(doc);
    expect(b.filled).toBe(0);
    expect(b.left).toBe(0);
    expect(doc.say.en).toBe("Nothing is missing in these rows.");
    expect(doc.say.en).not.toMatch(/filled/);
    const age = b.cols.findIndex((c) => c.key === "age");
    expect(b.rows[0].cells[age]).toMatchObject({ v: 24, filled: false });
  });
  it("a Studio dataset with a long name, and long advice, still pass the catalog", async () => {
    const h: Hands = { ...fakeHands(), dataset: async () => ({ name: `Ward survey ${"x".repeat(200)}`, total: 40, rows: [{ id: "y".repeat(100), title: "Row", zoneName: "Adyar" }] }) };
    const r = await planRound(body("complete this data", { direct: { recipe: "complete", slots: { name: "ward survey" }, lang: "en" } }), WORLD, h, "u", undefined, undefined, noModel);
    expect(checkStage(r.result!.stage!).ok, JSON.stringify(checkStage(r.result!.stage!))).toBe(true);
    expect(r.result!.stage!.title).toMatch(/first 1 of 40/);
    const long = "very long title ".repeat(12);
    const h2 = fakeHands({
      incidents: () => ({ ...INCIDENTS, data: { rows: [{ id: "INC-L", title: long, sev: "High", status: "Open", breached: 1, loc: "L".repeat(120), dept_name: "D".repeat(80), t: "2026-11-03 08:00:00" }, { id: "INC-M", title: long, breached: 1, dept_name: "D".repeat(80), t: "2026-11-03 08:00:00" }], total: 2 } }),
      change_drivers: () => ({ ...INCIDENTS, data: { categories: [{ label: "C".repeat(60), delta: 5, n: 9, prev: 4 }], places: [] } })
    });
    const adv = await planRound(body("what should I do first", { direct: { recipe: "advise", slots: { period: "weekly" }, lang: "en" } }), WORLD, h2, "u", undefined, undefined, noModel);
    const c = checkStage(adv.result!.stage!);
    expect(c.ok, JSON.stringify(c)).toBe(true);
    expect(adv.result!.stage!.say.en.length).toBeLessThanOrEqual(600);
  });
  it("what stands out today: no limits or trend from 2-hour buckets, and the labels are hours", async () => {
    const hours = Array.from({ length: 12 }, (_, i) => ({ from: `2026-11-03 ${String(8 + i).padStart(2, "0")}:00:00`, to: "", n: 40 - i * 3, severe: 0, open: 0 }));
    const h = fakeHands({ incident_series: () => ({ ...INCIDENTS, data: { buckets: hours, unit: "2 hours", normal: null } }) });
    const r = await planRound(body("what stands out", { direct: { recipe: "insight", slots: { period: "daily" }, lang: "en" } }), WORLD, h, "u", undefined, undefined, noModel);
    const doc = r.result!.stage!;
    const f = doc.blocks.find((x) => x.kind === "Findings");
    if (f && f.kind === "Findings") for (const i of f.items) expect(i.method).not.toMatch(/c-chart|Theil-Sen/);
    const t = doc.blocks.find((x) => x.kind === "Trend");
    if (!t || t.kind !== "Trend") throw new Error("no trend");
    expect(t.labels[0]).toBe("8:00 AM");
    expect(t.normal).toBeNull();
    expect(t.marks).toEqual([]);
    expect(doc.notes.join(" ")).toMatch(/time of day/);
  });
  it("what needs the Collector first, reasoned in code", async () => {
    const r = await planRound(body("what should I do about flooding in Adyar"), WORLD, fakeHands(), "u", undefined, undefined, noModel);
    expect(r.result?.stage?.recipe).toBe("advise");
    expect(r.result?.stage?.blocks.some((b) => b.kind === "Brief")).toBe(true);
  });
  it("every recipe a rule reaches passes the catalog, and its spoken figures are on the screen", async () => {
    for (const t of ["show the severe cases", "read today's news", "how full are the reservoirs", "department-wise performance", "worst zones this week", "why is Perungudi so bad", "make me a flooding dashboard for this week", "what is the price of tomato", "what needs my attention today"]) {
      const r = await planRound(body(t), WORLD, fakeHands(), "u", undefined, undefined, noModel);
      expect(r.result?.stage, t).toBeTruthy();
      expect(checkStage(r.result!.stage!).ok, t).toBe(true);
      sayIsOnScreen(r.result!.stage!, "en");
    }
  });
});

describe("with the Groq keys removed", () => {
  beforeEach(() => { clearCaches(); vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-nokeys-"))); vi.stubEnv("AI_FORCE_PROVIDER", ""); vi.stubEnv("AI_PROVIDER", "groq"); vi.stubEnv("AI_FALLBACK_PROVIDER", "none"); vi.stubEnv("AWS_BEARER_TOKEN_BEDROCK", ""); vi.stubEnv("AWS_ACCESS_KEY_ID", ""); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("with only the Groq keys gone, Gemini answers the turn at once: a rung with no key costs no wait", async () => {
    for (const k of ["GROQ_API_KEY", "GROQ_API_KEY_2", "GROQ_API_KEY_3"]) vi.stubEnv(k, "");
    vi.stubEnv("GEMINI_API_KEY", "stub");
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      asked.push(String(u));
      const text = JSON.stringify({ kind: "chat", lang: "en", reply: "Good morning.", options: [], screen: null });
      return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const t0 = Date.now();
    const r = await planRound(body("put together something useful for my morning"), WORLD, fakeHands(), "u");
    expect(r.result).toMatchObject({ kind: "chat", reply: "Good morning." });
    expect(asked.length).toBe(1);
    expect(asked[0]).toContain("gemini-3.5-flash-lite");
    expect(Date.now() - t0).toBeLessThan(2500);
  });
  it("a turn that needs a model says it cannot reason right now, inside 8 s, through the real gateway", async () => {
    for (const k of ["GROQ_API_KEY", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "GEMINI_API_KEY"]) vi.stubEnv(k, "");
    const t0 = Date.now();
    const r = await planRound(body("put together something useful for my morning"), WORLD, fakeHands(), "u");
    expect(r.result).toMatchObject({ kind: "none", note: "no-model" });
    expect(Date.now() - t0).toBeLessThan(8000);
  });
  it("a plain request still completes from the rules, with no key at all", async () => {
    for (const k of ["GROQ_API_KEY", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "GEMINI_API_KEY"]) vi.stubEnv(k, "");
    const r = await planRound(body("show the severe cases"), WORLD, fakeHands(), "u");
    expect(r.result?.stage?.recipe).toBe("cases");
    expect(r.calls).toBe(0);
  });
});
