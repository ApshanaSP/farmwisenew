/**
 * v10: the owner's own failing turns (docs/jarvis/JARVIS_V10.md Part 3, read from the local audit log, 18-19 Nov) through the browser's lanes,
 * each a failing test first: v9's lanes (browserLaneV8) took every one of them the wrong way (BROWSER=v9 runs this file against them).
 *   "Tell me about Cyclone Aquan."        v9: the instant web look-up (newsask FORECAST caught "cyclone"); the news never searched
 *   "Tell me about the fast news."        v9: searched the news for "fast"; Whisper's Indian English "first"
 *   "Tell me about the", "What are the"   v9: answered as requests (the planner, the chat lane)
 *   "Explain me about Murasar Saikilon"   v9: refused (Cyclone Murasu, said by ear)
 * And the class v9's blind set found: "what's the latest on the cyclone" (weather words took a news question).
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";
import { browserLaneV8 } from "../v8/browser";
import { browserLaneV10, cutOff, type BrowserCtx10, type BrowserLane10 } from "./browser10";
import { buildLexicon } from "./lexicon10";

const world = { ...WORLD, ...referenceWorld() };
const STORIES = [
  { id: "s1", title: "DRI Officials Seize 70 Kg Heroin Worth Rs 140 Crore In Chennai; Two Arrested", t: "2026-11-19 13:46" },
  { id: "s6", title: "Cyclone Akvan to cross Odisha coast tomorrow; rain likely in Chennai on November 23, 24", t: "2026-11-19 11:36" },
  { id: "w32", title: "Sea appeared turbulent in the morning due to Cyclone Murasu in Chennai. Location: Tiruvanmiyur.", t: "2026-11-18 08:17" },
  { id: "w54", title: "Akwan Cyclone Update | Asuran cyclone effect.. Warning issued for northern districts including Chennai", t: "2026-11-17 16:25" },
  { id: "w3", title: "TN Governor Rajendra Arlekar admitted to private hospital in Chennai", t: "2026-11-19 11:57" }
];
const lex = buildLexicon(STORIES, world);
const state = (o: Record<string, unknown> = {}) => ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false, ...o }) as never;
const newsList = { recipe: "news", blocks: [{ kind: "NewsReader", items: STORIES.map((s) => ({ id: s.id, title: s.title, source: "DT Next" })) }], scope: { zone: null }, slots: {} };
const V9 = process.env.BROWSER === "v9";
const lane = (said: string, o: { stage?: unknown; panel?: boolean } = {}): BrowserLane10 => {
  const c: BrowserCtx10 = { stage: (o.stage ?? null) as never, news: { items: o.stage ? STORIES.map((s) => ({ id: s.id, title: s.title, source: "DT Next" })) : o.panel ? STORIES.map((s) => ({ id: s.id, title: s.title, source: "DT Next" })) : [] },
    state: state(o.panel ? { panel: "news" } : {}), world, listenLang: "en", heardLang: /[஀-௿]/u.test(said) ? "ta" : "en", v7: true, lex };
  return V9 ? browserLaneV8(said, c) : browserLaneV10(said, c);
};
const findOf = (b: BrowserLane10) => (b.lane === "news" && b.na.kind === "find" ? b.na.body.find : null);

describe("v10: the owner's own turns (Part 3)", () => {
  it("'Tell me about Cyclone Aquan.' searches the news for Cyclone Akvan, with the weather readings (never the instant look-up)", () => {
    const b = lane("Tell me about Cyclone Aquan.");
    const f = findOf(b);
    expect(f, JSON.stringify(b)).not.toBeNull();
    expect(f?.q).toMatch(/Akvan/);
    expect(f?.entity?.spellings).toEqual(expect.arrayContaining(["Akvan", "Akwan"]));
    expect(f?.weather).toBe(true);
  });
  it("'Explain me about Murasar Saikilon' is Cyclone Murasu by ear", () => {
    const f = findOf(lane("Explain me about Murasar Saikilon"));
    expect(f?.entity?.name).toBe("Cyclone Murasu");
    expect(f?.weather).toBe(true);
  });
  it("the storm said in Tamil letters ('அக்வான் புயல் பற்றி சொல்லுங்க') is Cyclone Akvan, answered in Tamil", () => {
    const b = lane("அக்வான் புயல் பற்றி சொல்லுங்க");
    expect(findOf(b)?.entity?.name).toBe("Cyclone Akvan");
    expect(b.lane === "news" ? b.lang : null).toBe("ta");
  });
  it("'Tell me about the fast news.' over a news list reads the first story", () => {
    const b = lane("Tell me about the fast news.", { stage: newsList });
    expect(b.lane === "news" && b.na.kind === "read" && "id" in b.na.body ? b.na.body.id : JSON.stringify(b)).toBe("s1");
  });
  it("'Tell me about the fast news.' on the console's news panel reads its first story", () => {
    const b = lane("Tell me about the fast news.", { panel: true });
    expect(b.lane === "news" && (b.na.kind === "read" ? "id" in b.na.body && b.na.body.id : null)).toBe("s1");
  });
  it.each(["Tell me about the", "What are the", "Tell me about the.", "Show me the", "Open the"])("'%s' waits for the rest", (said) => {
    expect(lane(said).lane).toBe("wait");
  });
  it("'what's the latest on the cyclone' is the news about the storm, with the weather; a forecast stays the look-up's", () => {
    const f = findOf(lane("what's the latest on the cyclone"));
    expect(f?.weather).toBe(true);
    const fc = lane("will it rain tonight");
    expect(fc.lane === "news" && fc.na.kind === "lookup").toBe(true);
  });
  it("a storm the lexicon does not know ('Cyclone Zorbo') still searches the news, never the look-up", () => {
    const b = lane("Tell me about Cyclone Zorbo");
    expect(findOf(b)?.entity?.name).toBe("Cyclone Zorbo");
  });
  it("a name in the news said by ear ('governor Arlakar health update') finds the governor's story", () => {
    const f = findOf(lane("governor Arlakar health update"));
    expect(f?.entity?.spellings ?? []).toContain("Arlekar");
  });
});

describe("v10: what stays as it was", () => {
  it.each(["show the severe cases in Adyar", "go to the trends page", "open the news panel", "how fast is the drain work in Adyar", "fast track the Adyar case"])("'%s' is not a named-event news search", (said) => {
    const b = lane(said);
    expect(findOf(b)?.entity ?? null).toBeNull();
    expect(b.lane).not.toBe("wait");
  });
  it("a name in a visit's brief ('CM Vijay is visiting Adyar, what should I know?') stays with v8's lanes", () => {
    const lex2 = buildLexicon([...STORIES, { id: "w27", title: "Chief Minister Vijay inaugurated 12 completed project works in Chennai Municipal Corporation", t: "2026-11-18 15:24" }], world);
    const c: BrowserCtx10 = { stage: null, news: { items: [] }, state: state(), world, listenLang: "en", heardLang: "en", v7: true, lex: lex2 };
    const b = V9 ? browserLaneV8("CM Vijay is visiting Adyar, what should I know?", c) : browserLaneV10("CM Vijay is visiting Adyar, what should I know?", c);
    expect(findOf(b)?.entity ?? null).toBeNull();
  });
  it("'fast' with no list on screen is fast", () => {
    const b = lane("Tell me about the fast news.");
    expect(b.lane === "news" && b.na.kind === "read").toBe(false);
  });
  it.each(["what's going on", "carry on", "zoom in", "Open that.", "Read it.", "Who is this case assigned to?", "Will you read the second story?"])("'%s' is whole, not cut off", (said) => {
    expect(cutOff(said)).toBe(false);
  });
});
