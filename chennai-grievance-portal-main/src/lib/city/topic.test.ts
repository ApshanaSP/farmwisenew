import { describe, expect, it } from "vitest";
import { cityTopic } from "./topic";
import { greetLine, isGreeting } from "@/lib/thunai/greet";
import { trafficCondition } from "@/lib/map/conditions";

describe("cityTopic: which part of the city a question is about", () => {
  it.each([
    ["how is the traffic now?", "traffic"],
    ["live traffic in Adyar", "traffic"],
    ["where are the traffic jams right now", "traffic"],
    ["which roads are congested", "traffic"],
    ["where do jams keep coming back?", "traffic"],
    ["போக்குவரத்து நெரிசல் எங்கே?", "traffic"],
    ["traffic romba jaasthi enga", "traffic"],
    ["which wards lose power in heavy rain", "power"],
    ["power cuts during rain", "power"],
    ["மின் வெட்டு எங்கே", "power"],
    ["which metro lines run late in heavy rain", "metro"],
    ["suburban train delays in rain", "metro"],
    ["which streets flood in heavy rain", "flood"],
    ["flood prone streets", "flood"],
    ["what is the rain situation now", "rain"],
    ["மழை நிலவரம்", "rain"],
    ["how is the city now", "all"],
    ["traffic and power in the rain", "all"]
  ])("%s -> %s", (q, want) => expect(cityTopic(q)).toBe(want));

  it.each([
    "road accidents this month",
    "flooding complaints in Adyar this week",
    "traffic obstruction complaints in zone 9",
    "metro water complaints",
    "how many severe cases today",
    "show me the garbage complaints",
    "power cut complaints in Velachery"
  ])("stays with the incidents: %s", (q) => expect(cityTopic(q)).toBeNull());
});

describe("Jarvis greets at once", () => {
  it.each(["Hi Jarvis", "jarvis", "Hello Jarvis!", "hey jarvis, are you there?", "vanakkam jarvis", "ஹாய் ஜார்விஸ்", "good morning jarvis", "Jarvis how are you"])("%s is a greeting", (t) =>
    expect(isGreeting(t)).toBe(true));
  it.each(["Hi Jarvis show the severe cases", "jarvis open the map", "hello how many floods", "what is the traffic"])("%s is a request", (t) => expect(isGreeting(t)).toBe(false));
  it("says hello to the Collector in the asked language", () => {
    const at = new Date("2026-11-19T05:00:00Z"); // 10:30 IST
    expect(greetLine("en", at, 0)).toBe("Good morning, Collector. How can I help you?");
    expect(greetLine("ta", at, 0)).toMatch(/கலெக்டர்/);
    expect(greetLine("en", at, 1)).toMatch(/Collector/);
  });
});

describe("Ask the Map: live traffic beside an answer", () => {
  const t = { enabled: true, at: "2026-11-19T05:00:00.000Z", spots: [
    { id: "a", level: "very", name: "Anna Salai: Gemini → Thousand Lights", delayMin: 12, lat: 13.06, lon: 80.25, zoneName: "Teynampet", repeat: { n: 4 } },
    { id: "b", level: "closed", name: "Side street", delayMin: null, lat: 13.061, lon: 80.251, zoneName: "Teynampet", repeat: { n: 0 } },
    { id: "c", level: "congested", name: "GST Road", delayMin: 4, lat: 12.95, lon: 80.14, zoneName: "Alandur", repeat: { n: 0 } }
  ] };
  const box = { s: 13.05, n: 13.07, w: 80.24, e: 80.26 };
  it("names the jams in the answer's area, worst first", () => {
    const c = trafficCondition(t, { fams: new Set(["FLOOD"]), box, wide: false })!;
    expect(c.kind).toBe("traffic");
    expect(c.en).toContain("1 jammed stretch");
    expect(c.en).toContain("Anna Salai");
    expect(c.pts).toHaveLength(1);
  });
  it("says nothing for answers that are not about roads, or without live traffic", () => {
    expect(trafficCondition(t, { fams: new Set(["HEALTH"]), box, wide: false })).toBeNull();
    expect(trafficCondition({ ...t, enabled: false }, { fams: new Set(), box, wide: true })).toBeNull();
  });
});
