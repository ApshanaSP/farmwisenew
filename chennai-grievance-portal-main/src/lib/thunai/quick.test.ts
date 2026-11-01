import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { offTopic, quickScreen } from "./quick";

const q = (t: string) => quickScreen(t, WORLD);

describe("Jarvis's fast lane: everyday questions answered from the data with no model", () => {
  it("severe cases, in a place, in a period", () => {
    expect(q("Show me the severe cases")).toMatchObject({ recipe: "cases", slots: { sev: "Severe", period: "daily" } });
    expect(q("severe cases in Adyar this week")).toMatchObject({ recipe: "cases", slots: { sev: "Severe", zones: [13], period: "weekly" } });
    expect(q("இன்று கடுமையான சம்பவங்கள் என்ன?")).toMatchObject({ recipe: "cases", slots: { sev: "Severe", period: "daily" } });
  });
  it("a place's news is filtered to that place", () => {
    expect(q("Latest news in Adyar")).toMatchObject({ recipe: "news", slots: { zones: [13] } });
    expect(q("What is the news in Anna Nagar today?")).toMatchObject({ recipe: "news", slots: { zones: [8], period: "daily" } });
    expect(q("அடையாறு செய்திகள் காட்டு")).toMatchObject({ recipe: "news", slots: { zones: [13] } });
    expect(q("today's news")).toMatchObject({ recipe: "news", slots: { zones: [] } });
  });
  it("prices, in English, Tamil and Tanglish", () => {
    expect(q("What is the price of tomato today?")).toMatchObject({ recipe: "prices", slots: { q: "tomato" } });
    expect(q("தக்காளி விலை என்ன?")).toMatchObject({ recipe: "prices", slots: { q: "தக்காளி" } });
    expect(q("thakkali vilai enna")).toMatchObject({ recipe: "prices" });
    expect(q("vegetable prices")).toMatchObject({ recipe: "prices", slots: { q: null } });
  });
  it("air, rain and the reservoirs", () => {
    expect(q("How is the air quality in Manali?")).toMatchObject({ recipe: "readings", slots: { metric: "aqi", zones: [2] } });
    expect(q("How full are the reservoirs?")).toMatchObject({ recipe: "readings", slots: { metric: "lakes" } });
    expect(q("how much rain today")).toMatchObject({ recipe: "readings", slots: { metric: "rain" } });
  });
  it("why, where and compare", () => {
    expect(q("Why are there so many flooding complaints in Royapuram?")).toMatchObject({ recipe: "why", slots: { zones: [5], cat: "FLOOD_WATERLOGGING" } });
    expect(q("Where did the fire accident happen today?")).toMatchObject({ recipe: "cases", slots: { cat: "FIRE_EXPLOSION", period: "daily" } });
    expect(q("compare Adyar and Ambattur this week")).toMatchObject({ recipe: "compare", slots: { zones: [13, 7] } });
  });
  it("leaves follow-ups and commands to the agent", () => {
    for (const t of ["same for Anna Nagar", "only the severe ones", "open the third one", "draft a message for the first case", "go to trends"]) expect(q(t)).toBeNull();
  });
});

describe("Jarvis keeps to the district", () => {
  it.each(["What is deep learning?", "who is the president of America", "tell me a joke", "write a poem about the sea", "explain machine learning", "டீப் லேர்னிங் என்றால் என்ன?"])(
    "declines %j", (t) => expect(offTopic(t, WORLD)).toBe(true));
  it.each(["What is the price of tomato today?", "what is happening in Adyar", "what are the severe cases", "explain why flooding is rising in Royapuram",
    "who is the officer for storm water drains", "அடையாறு செய்திகள் காட்டு", "Show me the severe cases", "hello"])(
    "answers %j", (t) => expect(offTopic(t, WORLD)).toBe(false));
});
