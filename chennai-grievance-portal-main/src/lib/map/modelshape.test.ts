import { describe, expect, it } from "vitest";
import { countByOf, fitModelPlan, keepAreas, type ModelWords } from "./route";
import type { Plan } from "./plan";
import type { Found, Match } from "./resolve";

const FAM: Record<string, string> = { FLOOD_RELIEF: "FLOOD", DARK_SPOT_SAFETY: "PUBLIC_SAFETY", STREETLIGHT_ELECTRICAL: "ELECTRICAL", CRIMES_AGAINST_WOMEN: "CRIME", VECTOR_DISEASE: "HEALTH", SOLID_WASTE: "WASTE_SANITATION" };
const words: ModelWords = { lang: "en", familyOf: (c) => FAM[c] ?? null };
const inc = (category: string[] | null, family: string[] | null) => ({ op: "take" as const, as: "a", layer: "incidents" as const, where: null,
  filter: { category, family, severity: null, status: "open" as const, dept: null, overdue: null, citizen: null, period: null, text: null } });
const cats = (p: Plan) => { const s = p.steps[0]; return s.op === "take" ? [s.filter?.category ?? null, s.filter?.family ?? null] : null; };
const m = (ref: string, kind: string, name: string): Match => ({ entry: { kind: kind as never, ref, name_en: name, name_ta: null, lat: 13, lon: 80, res: [] }, start: 0, end: 1, text: name, method: "name" });
const group = (...ms: Match[]): Found => ({ start: 0, end: 1, text: ms[0].text, pick: ms[0], alternatives: ms.slice(1) });

describe("the shape of a model's plan, from the question's words", () => {
  it("takes the most exact named category and drops guesses no word names", () => {
    expect(cats(fitModelPlan({ language: "en", show: "a", steps: [inc(["STREETLIGHT_ELECTRICAL"], ["CRIME", "PUBLIC_SAFETY"])] }, "dark spots near bus stands", null, null, words))).toEqual([["DARK_SPOT_SAFETY"], null]);
    expect(cats(fitModelPlan({ language: "en", show: "a", steps: [inc(null, ["FLOOD"])] }, "flood relief needs in zone 13", null, null, words))).toEqual([["FLOOD_RELIEF"], null]);
    expect(cats(fitModelPlan({ language: "en", show: "a", steps: [inc(null, ["CRIME"])] }, "crimes against women near bus stands", null, null, words))).toEqual([["CRIMES_AGAINST_WOMEN"], null]);
  });

  it("adds the count by area a question asks for, in English or Tanglish", () => {
    expect(countByOf("ward vaariyaga kosu pugar")).toBe("ward");
    expect(countByOf("garbage zone wise")).toBe("zone");
    expect(countByOf("garbage near schools")).toBeNull();
    const out = fitModelPlan({ language: "tanglish", show: "a", steps: [inc(["VECTOR_DISEASE"], null)] }, "ward vaariyaga kosu pugar", null, null, { ...words, lang: "tanglish" });
    expect(out.steps.map((s) => s.op)).toEqual(["take", "count_by"]);
    expect(out.show).toBe("by");
  });

  it("makes clusters of a count when the question asks where they cluster", () => {
    const out = fitModelPlan({ language: "en", show: "by", steps: [inc(["VECTOR_DISEASE"], null), { op: "count_by", as: "by", of: "a", by: "zone" }] },
      "dengue spots clustering in the north", null, null, words);
    expect(out.steps.map((s) => s.op)).toEqual(["take", "hotspot"]);
  });

  it("holds an area the rules read for 'in X' against the point of the same name, and puts back a place the model left out", () => {
    const anna = group(m("osm:n1", "osm_place", "Anna Nagar"), m("zone:8", "zone", "Anna Nagar"));
    const banks = { op: "take" as const, as: "f1", layer: "banks" as const, filter: null, where: null };
    const rules: Plan = { language: "en", show: "in", steps: [banks, { op: "inside", as: "in", of: "f1", area: { kind: "zone", id: 8 } }] };
    const ai: Plan = { language: "en", show: "in", steps: [banks, { op: "inside", as: "in", of: "f1", area: { kind: "point", ref: "osm:n1", radius_m: 1000 } }] };
    expect(keepAreas(ai, rules, [anna]).steps[1]).toMatchObject({ area: { kind: "zone", id: 8 } });
    // the rules read "near X" as the point: the model's point stays
    const rulesNear: Plan = { ...rules, steps: [banks, { op: "inside", as: "in", of: "f1", area: { kind: "point", ref: "osm:n1", radius_m: 1000 } }] };
    expect(keepAreas(ai, rulesNear, [anna]).steps[1]).toMatchObject({ area: { kind: "point" } });
    // the model left the place out: the rules' area on its answer
    const dropped: Plan = { language: "ta", show: "f1", steps: [banks] };
    const back = keepAreas(dropped, rules, [anna]);
    expect(back.steps.map((s) => s.op)).toEqual(["take", "inside"]);
    expect(back.show).toBe("in");
  });
});

describe("a layer the model took and never used", () => {
  it("means the incidents near it", () => {
    const out = fitModelPlan({ language: "tanglish", show: "a", steps: [inc(["FIRE_EXPLOSION"], null), { op: "take", as: "f1", layer: "fuel", filter: null, where: null }] },
      "petrol bunk pakkathula theeppidi", null, null, { ...words, lang: "tanglish" });
    expect(out.steps.map((s) => s.op)).toEqual(["take", "take", "within"]);
    expect(out.steps[2]).toMatchObject({ of: "a", near: ["f1"], meters: 500 });
    expect(out.show).toBe("near");
  });
});

describe("v2 round 5", () => {
  it("reads Tanglish 'where … most' as clusters, and 'most … went up' as a league table", () => {
    const cb = (): Plan => ({ language: "tanglish", show: "by", steps: [inc(["ROAD_ACCIDENT"], null), { op: "count_by", as: "by", of: "a", by: "zone" }] });
    expect(fitModelPlan(cb(), "enga ellam vibathu jaasthi nadakkudhu", null, null, { ...words, lang: "tanglish" }).steps.map((s) => s.op)).toEqual(["take", "hotspot"]);
    expect(fitModelPlan(cb(), "indha vaaram endha zone-la vibathu jaasthi aachu", "2026-11-20 23:00:00", null, { ...words, lang: "tanglish" }).steps.map((s) => s.op)).toEqual(["take", "change", "rank"]);
  });

  it("holds 'near X' as the point against the zone of the same name", () => {
    const roya = group(m("osm:n2", "osm_place", "Royapuram"), m("zone:5", "zone", "Royapuram"));
    const fire = { op: "take" as const, as: "f1", layer: "fire_stations" as const, filter: null, where: null };
    const rules: Plan = { language: "en", show: "in", steps: [fire, { op: "inside", as: "in", of: "f1", area: { kind: "point", ref: "osm:n2", radius_m: 1000 } }] };
    const ai: Plan = { language: "en", show: "in", steps: [fire, { op: "inside", as: "in", of: "f1", area: { kind: "zone", id: 5 } }] };
    expect(keepAreas(ai, rules, [roya]).steps[1]).toMatchObject({ area: { kind: "point", ref: "osm:n2" } });
  });
});

describe("which place has the most complaints near it", () => {
  it("reads the question in its usual forms", async () => {
    const { BY_NEAR } = await import("./route");
    for (const q of ["near which school there is higher complaint open", "which school has the most open complaints", "which hospitals have the most garbage complaints around them",
      "top 5 markets by complaints", "schools with the most complaints", "what bus stand has more thefts near it"]) expect(BY_NEAR.test(q), q).toBe(true);
    for (const q of ["schools near Adyar", "nearest school to Guindy", "which ward has the most complaints", "complaints near schools"]) expect(BY_NEAR.test(q), q).toBe(false);
  });
});
