/**
 * v10 (docs/jarvis/JARVIS_V10.md 4.8 and Part 3): who a line is said to.
 *   - Jarvis's own name by ear: the owner's "Javes, Goto News." (19 Nov) and "எப்படி இருக்காதே ஜர்விஸ்?" are said to Jarvis.
 *   - Speech to a person in Tamil script: a vocative with a comma ("சார், ...", "ஏங்க, ...", "தம்பி, ...", "அண்ணா, ...") is someone else's.
 *   - A lone unclear word ("வாயமுர்ரா.") or a cut-off line that reached the lanes (named, called or engaged) waits; it is never answered.
 * Failing first on v9's gate and lanes.
 */
import { describe, expect, it } from "vitest";
import { addressed, namedIn, sideTalk8 } from "../addressed";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";
import { browserLaneV10 } from "./browser10";

const world = { ...WORLD, ...referenceWorld() };
const gate = (text: string, o: { engagedSec?: number | null } = {}) => {
  const now = 1_000_000;
  return addressed({ text, lastTurnAt: o.engagedSec == null ? null : now - o.engagedSec * 1000, now, rulesSure: false, districtNoun: false });
};
const state = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false } as never;
const lane = (said: string) => browserLaneV10(said, { stage: null, news: { items: [] }, state, world, listenLang: "en", heardLang: /[஀-௿]/u.test(said) ? "ta" : "en", v7: true, lex: [] });

describe("v10: Jarvis's own name by ear", () => {
  it.each([["Javes, Goto News.", "Goto News."], ["Jarvees, open the news", "open the news"], ["எப்படி இருக்காதே ஜர்விஸ்?", "எப்படி இருக்காதே"]])("'%s' is named", (said, rest) => {
    const n = namedIn(said);
    expect(n).not.toBeNull();
    expect((n ?? "").replace(/[?.]+$/, "").trim().toLowerCase()).toBe(rest.replace(/[?.]+$/, "").trim().toLowerCase());
    expect(gate(said).act).toBe(true);
  });
  it.each(["Jaws was a good film", "he has a javelin", "jerseys for the team"])("'%s' is not the name", (said) => {
    expect(namedIn(said)).toBeNull();
  });
});

describe("v10: speech to a person in the room, in Tamil script", () => {
  it.each(["சார், கார் ரெடியா இருக்கு", "ஏங்க, காபி வேணுமா?", "தம்பி, அந்த ஃபைலை எடுத்துட்டு வா", "அண்ணா, மீட்டிங் எப்போ?", "மேடம், கையெழுத்து போடுங்க", "ஐயா, அவர் வந்துட்டாரு"])("'%s' is someone else's", (said) => {
    expect(sideTalk8(said)).not.toBeNull();
    expect(gate(said, { engagedSec: 5 }).act).toBe(false);
  });
  it.each(["அண்ணா நகர் புகார்களைக் காட்டு", "அம்மா உணவகம் பற்றிய செய்தி"])("'%s' (a place or a name, no vocative) is not", (said) => {
    expect(sideTalk8(said)).toBeNull();
  });
});

describe("v10: talk about the screen, a phone call, reported speech (v10-research/30-side-talk.md 5.4)", () => {
  it.each([
    ["ஏங்க, இதைப் பாருங்க", 4], ["See, this one has gone up", 3], ["Look at this, Adyar is the worst again", 3], ["look here, the numbers doubled", 5],
    ["Idhu romba jaasthi aagiduchu, paarunga", 4], ["இதோ பாருங்க, அடையார் மறுபடியும் மோசம்", 4], ["idho paarunga, Adyar la thaan adhigam", 6],
    ["Hello? Haan, sollunga", 4], ["ஹலோ? சொல்லுங்க", 5], ["Hello, yes, speaking", 8],
    ["He said show the Adyar report", 5], ["அடையார் ரிப்போர்ட் காட்டுங்கன்னு சொன்னார்", 5], ["நாளைக்கு மழை வருமாம்", 5], ["Kodungaiyur la thanni illaiyaam", 5]
  ])("'%s' (%i s after Jarvis spoke) is not for Jarvis", (said, sec) => {
    expect(gate(said, { engagedSec: sec }).act).toBe(false);
  });
  it.each([
    ["Open the Akvan storm news", 6], ["Adyar la evvalavu complaints?", 7], ["look up the Akvan news", 5], ["show me this one", 4], ["இதைத் திறங்க", 4],
    ["Adyar cases paarunga", 5], ["இந்த வாரம் எத்தனை புகார்கள் வந்திருக்கு?", 6], ["அங்கே போகலாம்", 30]
  ])("'%s' (%i s after) is not silenced by these rules", (said, sec) => {
    const g = gate(said, { engagedSec: sec });
    if (sec <= 20) expect(g.act).toBe(true);
    else expect(g.why).not.toMatch(/screen|phone|hearsay/);
  });
});

describe("v10: a lone unclear word or a cut-off line that reached the lanes waits", () => {
  it.each(["வாயமுர்ரா.", "Tell me about the", "What are the"])("'%s' waits", (said) => {
    expect(lane(said).lane).toBe("wait");
  });
  it.each(["அடுத்து", "Adyar", "stop", "yes", "next", "நன்றி"])("'%s' does not", (said) => {
    expect(lane(said).lane).not.toBe("wait");
  });
});
