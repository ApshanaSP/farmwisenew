/**
 * v18 review (24 Nov), the owner's rules: every click opens exactly the records behind what was clicked, in the screen's own window; every part
 * has a title and a line under it saying what it shows. A zone or a station clicked with no drill of its own (a map's ward or zone, a Compare
 * side, a gauge) kept the console's period and dropped the screen's kind; the screens built outside buildScreen had no line under their parts.
 */
import { describe, expect, it } from "vitest";
import { checkStage, type StageDocT } from "../stage";
import { stationClickSlots, zoneClickSlots } from "../stagelocal";
import { newsScreen } from "../newsask";
import { groundScreen } from "../v10/offer10";
import { answerScreen, type AgentPlan } from "../agent";

const doc = (slots: Record<string, unknown>, extra: Partial<StageDocT> = {}): StageDocT => ({
  v: 1, id: "x", recipe: "summary", title: "t", takeaway: null, say: { en: "", ta: "" }, blocks: [{ kind: "Note", id: "n", text: "x" }],
  scope: { period: "weekly", zone: 9, dept: "GCC-SWM", cat: null, taluk: null, sev: "Severe" }, slots, sources: [], asOf: null, notes: [], ...extra
});
const LAST2 = { kind: "hours", hours: 48, n: 2, unit: "day" };

describe("a zone clicked on a screen with its own dates", () => {
  it("opens that zone's cases in the same dates, for the same department, group of kinds, severity and status", () => {
    const d = doc({ zones: [9], family: "CRIME", status: "open", span: LAST2 }, { when: { en: "last 2 days", ta: "கடந்த 2 நாள்", from: "2026-11-22 15:00:00", to: "2026-11-24 15:00:00" } });
    expect(zoneClickSlots(d, 13)).toEqual({ zones: [13], dept: "GCC-SWM", family: "CRIME", sev: "Severe", status: "open", period: "weekly", span: LAST2, view: "cases", fresh: true });
  });
  it("keeps one kind when the screen is about one kind", () => {
    const d = doc({ span: LAST2 }, { scope: { period: "daily", zone: null, dept: null, cat: "FLOODING", taluk: null, sev: null } });
    expect(zoneClickSlots(d, 4)).toEqual({ zones: [4], cat: "FLOODING", period: "daily", span: LAST2, view: "cases", fresh: true });
  });
  it("a screen on the console's own windows, or none at all, is left to the old click (the zone's cases over the console's period)", () => {
    expect(zoneClickSlots(doc({ zones: [9] }), 13)).toBeNull();
    expect(zoneClickSlots(doc({ span: { kind: "now" } }), 13)).toBeNull();
    expect(zoneClickSlots(null, 13)).toBeNull();
  });
});

describe("a station clicked", () => {
  it("keeps the screen's own dates", () => {
    expect(stationClickSlots(doc({ span: LAST2 }), "Velachery", "aqi")).toEqual({ metric: "aqi", name: "Velachery", period: "weekly", span: LAST2 });
  });
  it("without them, its latest readings as before", () => {
    expect(stationClickSlots(doc({}), "Velachery", "aqi")).toEqual({ metric: "aqi", name: "Velachery" });
    expect(stationClickSlots(null, "Red Hills", "points")).toEqual({ metric: "rain", name: "Red Hills" });
  });
});

describe("the screens built outside buildScreen say what each part shows", () => {
  const titled = (d: StageDocT | null) => (d?.blocks ?? []).filter((b) => b.kind !== "Note");
  it("the news answer's sources, in English and Tamil", () => {
    const links = [{ outlet: "The Hindu", title: "Cyclone", url: "https://www.thehindu.com/a", publishedAt: null }];
    for (const lang of ["en", "ta"] as const) {
      const d = newsScreen({ lang, kind: "read", outlet: "The Hindu", en: ["x"], ta: ["y"], links, now: 1 });
      expect(checkStage(d).ok).toBe(true);
      expect(titled(d).length).toBe(1);
      expect(titled(d).every((b) => typeof b.about === "string" && b.about.length > 0 && b.about.length <= 300)).toBe(true);
      expect(titled(d)[0].about).toMatch(lang === "ta" ? /[஀-௿]/ : /^The pages/);
    }
  });
  it("the console's cases on a story", () => {
    const row = { id: "INC-1", title: "Drain overflow", sev: "High", status: "Open", zone: 13, zoneName: "Adyar", place: "Kotturpuram", ward: null, dept: "CMWSSB", deptName: "Metro Water",
      complaints: 2, t: "2026-11-07 09:00:00", overdue: true, lat: null, lon: null, why: null, cat: "Drainage & sewage" };
    const d = groundScreen({ lang: "en", en: ["x"], ta: ["y"], rows: [row], title: { en: "On the console", ta: "கன்சோலில்" }, now: 1 });
    expect(titled(d).map((b) => b.kind)).toEqual(["CaseList"]);
    expect(titled(d)[0].about).toMatch(/matched to this story/);
  });
  it("the answer from the data, its figures and their line passing the screen's check", () => {
    const plan = { kind: "do", lang: "en", reply: null, steps: [], stage: null, calls: [], done: true, say: "Adyar has 13 open cases.", options: [] } as unknown as AgentPlan;
    const res = [{ name: "zones", result: { tool: "zones", args: { zone: 13 }, scope: null, asOf: "2026-11-24 15:00:00", data: { rows: [{ zone: 13, name: "Adyar", open: 13 }] },
      facts: [{ id: "zone.13.open", label: "Open in Adyar", value: 13 }], sources: [], incidentIds: [], testData: true, caveats: [] } }];
    const scope = { period: "weekly" as const, zone: 13, dept: null, cat: null, taluk: null, sev: null };
    const en = answerScreen(plan, "how is Adyar", res as never, scope, "en");
    expect(checkStage(en).ok).toBe(true);
    expect(en.blocks[0].about).toMatch(/figures it rests on/);
    expect(answerScreen(plan, "how is Adyar", res as never, scope, "ta").blocks[0].about).toMatch(/[஀-௿]/);
  });
});
