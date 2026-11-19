import { describe, expect, it } from "vitest";
import { grams, Shortlister, type BankLine } from "./shortlist";

// invented lines, none from any eval set
const bank: BankLine[] = [
  { recipe: "readings", lang: "en", text: "how full is the Poondi reservoir", slots: { metric: "lakes", name: "Poondi" } },
  { recipe: "readings", lang: "en", text: "air quality in Manali now", slots: { metric: "aqi" } },
  { recipe: "cases", lang: "en", text: "list the open drainage complaints in Adyar", slots: { zones: [13], status: "open" } },
  { recipe: "compare", lang: "en", text: "compare Adyar and Ambattur this week", slots: { zones: [13, 7], period: "weekly" } },
  { recipe: "trend", lang: "en", text: "how has dengue moved this quarter", slots: { cat: "VECTOR_DISEASE", period: "quarterly" } },
  { recipe: "readings", lang: "ta", text: "பூண்டி ஏரி நீர்மட்டம் எவ்வளவு", slots: { metric: "lakes", name: "Poondi" } },
  { recipe: "cases", lang: "ta", text: "அடையாறில் திறந்த புகார்களைக் காட்டு", slots: { zones: [13] } },
  { recipe: "compare", lang: "ta", text: "அடையாறையும் அம்பத்தூரையும் ஒப்பிடு", slots: { zones: [13, 7] } },
  { recipe: "readings", lang: "tanglish", text: "Poondi lake level enna", slots: { metric: "lakes", name: "Poondi" } },
  { recipe: "cases", lang: "tanglish", text: "Adyar la open complaints kaattu", slots: { zones: [13] } },
  { recipe: "compare", lang: "tanglish", text: "Adyar um Ambattur um compare pannu", slots: { zones: [13, 7] } },
  { recipe: "brief", lang: "en", text: "brief me on the day", slots: {} },
  { recipe: "map", lang: "en", text: "put the severe cases on the map", slots: { what: "severe" } },
  { recipe: "why", lang: "en", text: "why are complaints rising in Perungudi", slots: { zones: [14] } }
];
const s = new Shortlister(bank);

describe("the n-gram shortlist (A3, grid cell G)", () => {
  it("counts character 3- to 5-grams of the normalised text", () => {
    const g = grams("Adyar");
    expect(g.has(" ad")).toBe(true);
    expect(g.has("dyar ")).toBe(true);
    expect([...g.keys()].every((x) => x.length >= 3 && x.length <= 5)).toBe(true);
  });

  it("puts the gold recipe in the shortlist for three invented sentences per language form", () => {
    const cases: [string, string][] = [
      ["what is the level of Poondi lake today", "readings"],
      ["show me open complaints for Adyar", "cases"],
      ["Adyar versus Ambattur, compare them", "compare"],
      ["பூண்டி ஏரியின் நீர்மட்டம் சொல்லு", "readings"],
      ["அடையாறில் புகார்களைக் காட்டு", "cases"],
      ["அம்பத்தூரையும் அடையாறையும் ஒப்பிட்டு காட்டு", "compare"],
      ["Poondi level konjam sollu", "readings"],
      ["Adyar complaints ellam kaattu", "cases"],
      ["Ambattur Adyar compare pannunga", "compare"]
    ];
    for (const [text, gold] of cases) expect(s.shortlist(text, 5).recipes, text).toContain(gold);
  });

  it("orders the examples least similar first and most similar last, and keeps n of them", () => {
    const r = s.shortlist("how full is Poondi", 5, 4);
    expect(r.examples).toHaveLength(4);
    const sims = r.examples.map((x) => x.sim);
    expect([...sims].sort((a, b) => a - b)).toEqual(sims);
    expect(r.examples[3].recipe).toBe("readings");
    expect(r.best).toBe(sims[3]);
  });

  it("an unrelated sentence still gets k recipes (the planner decides; checkScreen guards)", () => {
    expect(s.shortlist("xyzzy", 5).recipes).toHaveLength(5);
  });
});
