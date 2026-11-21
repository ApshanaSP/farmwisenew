import { describe, expect, it } from "vitest";
import { fitModelPlan, type ModelWords } from "./route";
import type { Plan } from "./plan";

const FAM: Record<string, string> = { DRAINAGE_SEWAGE: "DRAINAGE", WATER_SUPPLY: "DRAINAGE", ROAD_ACCIDENT: "ROADS_TRAFFIC", FLOOD_WATERLOGGING: "FLOOD", SOLID_WASTE: "WASTE_SANITATION" };
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
});
