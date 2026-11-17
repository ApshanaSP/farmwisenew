import { describe, expect, it } from "vitest";
import { asks7 } from "./asks7";
import { WORLD } from "./fixture";

const r = (s: string) => { const a = asks7(s, WORLD); return a ? { recipe: a.recipe, ...a.slots } : null; };

describe("v7: the owner's question shapes reach the right facts in code", () => {
  it("compare everything: every zone side by side", () => {
    for (const s of ["compare everything", "Jarvis, compare all the zones", "how do the zones compare", "zone-wise comparison", "compare all zones this month", "எல்லா மண்டலங்களையும் ஒப்பிடு", "ella zone um compare pannu"])
      expect(r(s), s).toMatchObject({ recipe: "performance", by: "zone" });
    expect(r("compare all zones this month")).toMatchObject({ period: "monthly" });
  });
  it("compare the departments", () => {
    for (const s of ["compare all departments", "how do the departments compare", "department-wise comparison", "துறைகளை ஒப்பிடு"]) expect(r(s), s).toMatchObject({ recipe: "performance", by: "dept" });
  });
  it("this period against the last: what changed, and where", () => {
    expect(r("compare this week with last week")).toMatchObject({ recipe: "changed", period: "weekly" });
    expect(r("today vs yesterday")).toMatchObject({ recipe: "changed", period: "daily" });
    expect(r("compare this month with last month in Adyar")).toMatchObject({ recipe: "changed", period: "monthly", zones: [13] });
  });
  it("why one place is worse than another: the two side by side", () => {
    expect(r("why is Adyar worse than Anna Nagar")).toMatchObject({ recipe: "compare", zones: [13, 8] });
    expect(r("அடையாறு ஏன் அண்ணா நகரை விட மோசமா இருக்கு")).toMatchObject({ recipe: "compare" });
  });
  it("the X issue: the case that matters most there, explained", () => {
    for (const s of ["what's the Adyar issue", "what is the issue in Adyar", "tell me about the Adyar problem", "Adyar issue enna", "அடையாறு பிரச்சினை என்ன"])
      expect(r(s), s).toMatchObject({ recipe: "explain", zones: [13] });
  });
  it("leaves everything else to the lanes that already read it", () => {
    for (const s of ["show the severe cases in Adyar", "compare Adyar and Anna Nagar", "what changed since yesterday", "go to trends", "compare", "what's happening in Adyar", "the Adyar issues list"])
      expect(r(s), s).toBeNull();
  });
});

describe("v7: a question about people or events outside the dashboard never reaches a model's memory", () => {
  it("goes to the place's situation (or the news) with the outside part named for the gap search", () => {
    const a = asks7("CM Vijay is visiting Adyar, what should I know", WORLD);
    expect(a).toMatchObject({ recipe: "situation", slots: { zones: [13] }, why: "outside" });
    expect(a?.gap).toEqual(["cm", "vijay", "visiting"]);
    expect(asks7("what did the Governor say about the floods", WORLD)).toMatchObject({ recipe: "news", why: "outside" });
    expect(asks7("முதல்வர் அடையாறுக்கு வருகிறாரா", WORLD)).toMatchObject({ recipe: "situation", why: "outside" });
    expect(asks7("is the minister inaugurating the flyover today", WORLD)).toMatchObject({ recipe: "news", why: "outside" });
  });
  it("not for the console's own people and records", () => {
    for (const s of ["which officer has the Adyar case", "show the severe cases in Adyar", "who complained about the drain"]) expect(asks7(s, WORLD), s).toBeNull();
  });
});
