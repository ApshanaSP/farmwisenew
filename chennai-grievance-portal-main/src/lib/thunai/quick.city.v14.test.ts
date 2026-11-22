/**
 * v14 (21 Nov review of v13's city routing), the server's fast lane with the live reference lists: the Tamil "where is the traffic worst" is
 * the worst-jam screen in code (routing 2); records, past periods and who handles traffic, power and trains are never the live city screen
 * (routing 3); power and trains in the rain are never the rain gauges (routing 6); "What about power if it rains tonight?" is the city power
 * screen, no planner (scenarios 5). Normal console questions stay theirs.
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { quickScreen } from "./quick";
import { referenceWorld } from "./world";
import type { World } from "./types";

const REAL: World = { ...WORLD, ...referenceWorld() };
const q = (s: string) => quickScreen(s, REAL, { analysis: true });

describe("v14 routing 2: the Tamil and Tanglish worst jam, in code", () => {
  it.each([
    "டிராபிக் எங்க அதிகமா இருக்கு",
    "எங்க அதிகமா டிராபிக் இருக்கு",
    "அதிகமான நெரிசல் எந்த ரோட்ல இருக்கு",
    "எந்த சாலையில் அதிக போக்குவரத்து நெரிசல்?",
    "எந்த ரோட்ல ரொம்ப டிராபிக்",
    "traffic adhigama irukka idam kaattu"
  ])("%s", (said) => expect(q(said)).toEqual({ recipe: "city", slots: { q: "traffic", zones: [], focus: "worst-jam", rain: null } }));
});

describe("v14 routing 3: records and past periods are never the live city screen", () => {
  it.each([
    "Show traffic accidents this month", "How was traffic last week?", "Show the traffic jams yesterday", "What was the worst jam yesterday?",
    "Which officer handles traffic in Adyar?", "Who is responsible for the traffic jam on OMR?", "What is the update on the traffic jam on OMR?",
    "What did the papers say about the traffic jam on OMR?", "Which department handles power cuts?", "Is the power supply restored in Velachery?",
    "When is the next metro train?", "Show me the metro stations"
  ])("%s", (said) => expect(q(said)?.recipe ?? null).not.toBe("city"));

  it("traffic accidents this month are the road accident cases", () => {
    expect(q("Show traffic accidents this month")).toMatchObject({ recipe: "cases", slots: { cat: "ROAD_ACCIDENT", period: "monthly" } });
  });
});

describe("v14 routing 6 and scenarios 5: power and trains in the rain", () => {
  it.each([
    ["mazhai vandha current enga pogum", "power"], ["Where does power go off when it rains?", "power"], ["What about power if it rains tonight?", "power"],
    ["What happens to power if it rains tonight?", "power"], ["Where will power go off if it rains?", "power"], ["Which trains get delayed in rain?", "metro"],
    ["Metro in heavy rain", "metro"], ["கனமழையில எந்த வார்டுல கரண்ட் போகும்", "power"]
  ])("%s: the city %s screen, never the rain gauges", (said, topic) => expect(q(said)).toEqual({ recipe: "city", slots: { q: topic, zones: [], focus: null, rain: null } }));

  it("the rain alone is still the gauges", () => {
    expect(q("What is the current rainfall?")).toMatchObject({ recipe: "readings", slots: { metric: "rain" } });
    expect(q("How much rain did we get today?")).toMatchObject({ recipe: "readings", slots: { metric: "rain" } });
    expect(q("Show the rain gauges")).toMatchObject({ recipe: "readings", slots: { metric: "rain" } });
  });
});

describe("v14: normal console questions are not city screens", () => {
  it.each([
    "How many traffic complaints this week?", "Show me traffic cases in Adyar", "Which department has the most pending cases?",
    "Show the flooding complaints in Velachery this week", "Compare traffic in Adyar and Teynampet", "Show the power outage trend this month",
    "Any news about traffic jams on OMR?", "Read the news on flooding", "Show the electricity complaints this week", "Metro water supply complaints",
    "Show me the trend of flooding complaints", "Show the trend of traffic complaints", "Which department handles traffic jams?"
  ])("%s", (said) => expect(q(said)?.recipe ?? null).not.toBe("city"));
});
