import { describe, expect, it } from "vitest";
import { fitModelPlan, type ModelWords } from "./route";
import type { Plan } from "./plan";

const FAM: Record<string, string> = { VECTOR_DISEASE: "HEALTH", CRIME_PROPERTY: "CRIME", DRAINAGE_SEWAGE: "DRAINAGE", WATER_SUPPLY: "DRAINAGE", ROAD_ACCIDENT: "ROADS_TRAFFIC", FLOOD_WATERLOGGING: "FLOOD", SOLID_WASTE: "WASTE_SANITATION" };
const words = (lang: ModelWords["lang"] = "en"): ModelWords => ({ lang, familyOf: (c) => FAM[c] ?? null });
const plan = (category: string[] | null, family: string[] | null, language: Plan["language"] = "en"): Plan => ({ language, show: "a", steps: [
  { op: "take", as: "a", layer: "incidents", where: null,
    filter: { category, family, severity: null, status: "open", dept: null, overdue: null, citizen: null, period: null, text: null } }] });
const cats = (p: Plan) => { const s = p.steps[0]; return s.op === "take" ? [s.filter?.category ?? null, s.filter?.family ?? null] : null; };

describe("a model's plan with the question's own words on top", () => {
  it("narrows a family to the exact category the question names", () => {
    expect(cats(fitModelPlan(plan(null, ["DRAINAGE"]), "which zones saw drainage complaints rise", null, null, words()))).toEqual([["DRAINAGE_SEWAGE"], null]);
    expect(cats(fitModelPlan(plan(null, ["ROADS_TRAFFIC"]), "road accidents near ration shops", null, null, words()))).toEqual([["ROAD_ACCIDENT"], null]);
  });

  it("fills a category the model dropped, and replaces a code the world does not have", () => {
    expect(cats(fitModelPlan(plan(null, null), "sewage overflow near government schools", null, null, words()))).toEqual([["DRAINAGE_SEWAGE"], null]);
    expect(cats(fitModelPlan(plan(["DRINKING_WATER"], null), "drinking water complaints ward by ward", null, null, words()))).toEqual([["WATER_SUPPLY"], null]);
    expect(cats(fitModelPlan(plan(null, null), "open severe flooding near hospitals", null, null, words()))).toEqual([null, ["FLOOD"]]);
  });

  it("leaves a model's other reading alone when it chose a different family or already has the category", () => {
    const keep = plan(["SOLID_WASTE"], null);
    expect(cats(fitModelPlan(keep, "sewage and garbage near markets", null, null, words()))).toEqual([["SOLID_WASTE"], null]);
    const has = plan(["DRAINAGE_SEWAGE", "SOLID_WASTE"], null);
    expect(fitModelPlan(has, "sewage near markets", null, null, words()).steps).toEqual(has.steps);
    expect(cats(fitModelPlan(plan(null, ["CRIME"]), "kids' safety near TASMAC shops", null, null, words()))).toEqual([null, ["CRIME"]]);
  });

  it("takes the server's language, and does nothing without the words", () => {
    expect(fitModelPlan(plan(null, null, "tanglish"), "சந்தைகள் அருகே குப்பை", null, null, words("ta")).language).toBe("ta");
    const p = plan(null, ["DRAINAGE"]);
    expect(fitModelPlan(p, "drainage complaints")).toBe(p);
  });

  it("replaces a category no word of the question names with the one it does name", () => {
    expect(cats(fitModelPlan(plan(null, ["FLOOD"]), "mosquito complaints around public toilets", null, null, words()))).toEqual([["VECTOR_DISEASE"], null]);
    expect(cats(fitModelPlan(plan(null, ["CRIME"]), "chain snatching near ATMs", null, null, words()))).toEqual([["CRIME_PROPERTY"], null]);
  });

  it("turns a count by area into a ranked change when the question asks which area rose", () => {
    const cb: Plan = { language: "tanglish", show: "by", steps: [
      { op: "take", as: "a", layer: "incidents", where: null, filter: { category: ["SOLID_WASTE"], family: null, severity: null, status: "open", dept: null, overdue: null, citizen: true, period: { kind: "last_days", days: 30, offset: 0 }, text: null } },
      { op: "count_by", as: "by", of: "a", by: "ward" }] };
    const out = fitModelPlan(cb, "indha maasam endha ward-la kuppai complaint jaasthi aagiruchu", "2026-11-20 23:00:00", null, words("tanglish"));
    expect(out.show).toBe("rank");
    expect(out.steps.map((s) => s.op)).toEqual(["take", "change", "rank"]);
    expect(out.steps[2]).toMatchObject({ op: "rank", by: "ward", order: "rise" });
    // a plain count by area stays a count
    expect(fitModelPlan(cb, "garbage complaints ward wise this month", "2026-11-20 23:00:00", null, words()).show).toBe("by");
  });

  it("starts a nearest search at the one place named, runs a league table the way the words say, and clusters after the area", () => {
    const near: Plan = { language: "en", show: "near", steps: [{ op: "take", as: "f1", layer: "pharmacies", filter: null, where: null }, { op: "nearest", as: "near", from: "", to: "f1", k: 1 }] };
    const out = fitModelPlan(near, "nearest pharmacy to Marina Beach", null, null, { ...words(), places: [{ ref: "loc:Marina Beach", kind: "locality" }] });
    expect(out.steps[1]).toMatchObject({ from: "place:loc:Marina Beach" });
    const rank = (order: "rise" | "fall"): Plan => ({ language: "en", show: "rank", steps: [
      { op: "take", as: "a", layer: "incidents", where: null, filter: { category: null, family: null, severity: null, status: "any", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 7, offset: 0 }, text: null } },
      { op: "change", as: "chg", of: "a", now: { kind: "last_days", days: 7, offset: 0 }, before: { kind: "last_days", days: 7, offset: 1 } },
      { op: "rank", as: "rank", of: "chg", by: "ward", order }] });
    expect(fitModelPlan(rank("rise"), "rank wards by the drop in streetlight complaints this week", null, null, words()).steps[2]).toMatchObject({ order: "fall" });
    expect(fitModelPlan(rank("fall"), "which wards got worse for flooding", null, null, words()).steps[2]).toMatchObject({ order: "rise" });
    const hot: Plan = { language: "en", show: "in", steps: [
      { op: "take", as: "a", layer: "incidents", where: null, filter: { category: ["VECTOR_DISEASE"], family: null, severity: null, status: "open", dept: null, overdue: null, citizen: null, period: null, text: null } },
      { op: "hotspot", as: "hot", of: "a" }, { op: "inside", as: "in", of: "hot", area: { kind: "zone", id: 1 } }] };
    const h = fitModelPlan(hot, "dengue spots clustering in the north", null, null, words());
    expect(h.steps.map((s) => s.op)).toEqual(["take", "inside", "hotspot"]);
    expect(h.show).toBe("hot");
    expect(h.steps[1]).toMatchObject({ of: "a" });
    expect(h.steps[2]).toMatchObject({ of: "in" });
  });
});
