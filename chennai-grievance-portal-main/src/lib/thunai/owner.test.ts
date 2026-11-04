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
  afterEach(() => vi.unstubAllEnvs());

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
