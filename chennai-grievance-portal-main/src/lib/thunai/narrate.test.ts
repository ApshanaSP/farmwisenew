import { beforeEach, describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";
import { ZONE_TA_NAME } from "./lexicon";
import { ageWords, explainIssue, factSheet, hoursOf } from "./narrate";
import { copiedRun, labelIn, speechProblem } from "./speechcheck";
import { buildScreen, emptySlots } from "./screens";
import { fakeHands } from "./stagefake";
import { clearCaches, planRound, RoundBody } from "./round";
import type { CaseRowT } from "./stage";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const row: CaseRowT = { id: "INC-4821", title: "Water stagnation near main road after heavy rain overnight", sev: "Severe", status: "open", zone: 13, zoneName: "Adyar", place: "Velachery",
  ward: 178, dept: "GCC-SWD", deptName: "Storm Water Drain", complaints: 5, t: "2026-10-30 08:00:00", overdue: true, lat: 12.98, lon: 80.22, why: null, cat: "Flooding & waterlogging" };

describe("the speech gates", () => {
  it("catch a record read out", () => {
    expect(copiedRun("Issue says water stagnation near main road after heavy rain overnight, open.", [row.title])).toBe("water stagnation near main road after");
    expect(copiedRun("There's standing water at Velachery.", [row.title])).toBeNull();
  });
  it("a run of names alone is not copying", () => expect(copiedRun("Anna Nagar Adyar Velachery Perungudi Teynampet Royapuram", ["Anna Nagar Adyar Velachery Perungudi Teynampet Royapuram"], ["Anna Nagar", "Adyar", "Velachery", "Perungudi", "Teynampet", "Royapuram"])).toBeNull());
  it.each([
    ["Issue INC-4821 is open.", "incident id"], ["Status: open. Priority: high.", "field label"], ["It has dept_id GCC-SWD.", "snake_case"], ["Logged on 2026-10-30 08:00.", "ISO date"],
    ["Severe, status open, open for 4 days.", "enum read out"], ["Category FLOOD_WATERLOGGING.", "category code"], ["The value is undefined.", "broken value"], ["Held by POL-GCP.", "department code"]
  ])("%s -> %s", (line, why) => expect(labelIn(line)).toBe(why));
  it("plain speech passes", () => expect(speechProblem("There's standing water on a main road in Velachery, and it's been stuck for about four days.", [row.title])).toBeNull());
});

describe("explaining one issue", () => {
  it("ages are words, never figures", () => {
    expect(hoursOf("6 hours")).toBe(6); expect(hoursOf("4 days")).toBe(96); expect(hoursOf("2 weeks")).toBe(336); expect(hoursOf("soon")).toBeNull();
    for (const h of [1, 10, 30, 60, 100, 200, 400, 900]) expect(ageWords(h)!.en).not.toMatch(/\d/);
  });
  it("answers first, in plain words, and passes both gates", () => {
    const f = factSheet(row, { openFor: "4 days", next: null });
    const say = explainIssue(f, "Water stagnation", [row.title]);
    expect(say.en.startsWith("There's standing water at Velachery.")).toBe(true);
    expect(say.en).toMatch(/several days, and it's past its deadline/);
    expect(say.en).toMatch(/I'd ask the corporation's drains team for an update today\./);
    expect(speechProblem(say.en, [row.title], ["Velachery"])).toBeNull();
    const sentences = say.en.split(/(?<=\.)\s/).length;
    expect(sentences).toBeGreaterThanOrEqual(2); expect(sentences).toBeLessThanOrEqual(4);
    expect(say.ta).toMatch(/அடையாறு|Adyar/);
  });
  it("the case screen says the retelling, not the fields", async () => {
    const b = await buildScreen("case", { ...emptySlots(), id: "INC-X1" }, { period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null }, world, fakeHands(), "explain this");
    const say = b.doc.say.en;
    expect(labelIn(say)).toBeNull();
    expect(say).not.toMatch(/status |handles it/);
    expect(say).toMatch(/^There's /);
  });
});

describe("asking for one issue to be explained, with no number", () => {
  beforeEach(() => clearCaches());
  const noModel = { generate: async () => { throw new Error("no model"); } } as never;
  it.each(["explain the flooding complaint in Adyar", "what's going on with the garbage in Anna Nagar", "Adyar flooding enna aachu", "அடையாறு வெள்ளம் விளக்கு"])("%s -> one case, retold", async (text) => {
    const body = RoundBody.parse({ turnId: `e-${text.length}-${Math.random().toString(36).slice(2, 8)}`, round: 0, text, turns: [], lastText: null, stage: null, direct: null,
      state: { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false } });
    const r = (await planRound(body, world, fakeHands(), "t", { notes: [], habits: {} }, undefined, { llm: noModel })).result!;
    expect(r.stage?.recipe).toBe("case");
    expect(labelIn(r.stage!.say.en)).toBeNull();
  });
});

describe("a list's spoken line never reads a long title out", async () => {
  const { casesSay } = await import("./screens");
  it("a six-word title is retold as its kind and place", () => {
    const say = casesSay([{ ...row, why: null, cat: null }], 1, null, "daily").en;
    expect(copiedRun(say, [row.title], ["Velachery", "Adyar"])).toBeNull();
    expect(say).toMatch(/standing water at Velachery/);
  });
});

describe("Tamil joins 'to X' as the word ends", async () => {
  const { idam } = await import("./narrate");
  it.each([["சுகாதாரத் துறை", "சுகாதாரத் துறையிடம்"], ["மாநகராட்சி", "மாநகராட்சியிடம்"], ["குடிநீர் வாரியம்", "குடிநீர் வாரியத்திடம்"], ["மழைநீர் வடிகால் பிரிவு", "மழைநீர் வடிகால் பிரிவிடம்"], ["காவல்துறை", "காவல்துறையிடம்"]])("%s", (w, want) => expect(idam(w)).toBe(want));
});

describe("a new request with an open screen is not taken as a follow-up (BUG-020, found in the browser)", () => {
  const noModel = { generate: async () => { throw new Error("no model"); } } as never;
  it("explain the flooding complaint in Adyar, with a police brief open, explains a case", async () => {
    const stage = { recipe: "brief", title: "Greater Chennai Police · brief, today", focus: null, slots: { dept: "POL-GCP", period: "daily" }, blocks: [{ kind: "Kpis", ids: [] }] };
    const body = RoundBody.parse({ turnId: "frame-explain-1", round: 0, text: "explain the flooding complaint in Adyar", turns: [{ heard: "chennai city police report", did: "showed a screen" }], lastText: "chennai city police report", stage, direct: null,
      state: { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false } });
    const r = (await planRound(body, world, fakeHands(), "t", { notes: [], habits: {} }, undefined, { llm: noModel })).result!;
    expect(r.stage?.recipe).toBe("case");
  });
});
