/**
 * v10: Ask the Map by voice through the browser's own lanes (browser10.ts browserLaneV10, as Thunai.tsx's handle() runs them): the map's lane
 * takes what is plainly the map's with Ask the Map's state published (Thunai.tsx mapSnap10), and leaves the rest to the other lanes: the news
 * about a storm, a story by its position, a console filter.
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";
import { browserLaneV10, type BrowserCtx10, type BrowserLane10 } from "./browser10";
import { buildLexicon } from "./lexicon10";
import type { MapCtx10 } from "./map10";

const world = { ...WORLD, ...referenceWorld() };
const STORIES = [{ id: "s6", title: "Cyclone Akvan to cross Odisha coast tomorrow; rain likely in Chennai on November 23, 24", t: "2026-11-19 11:36" }];
const lex = buildLexicon(STORIES, world);
const state = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false } as never;
const ANSWER: Omit<MapCtx10, "lang"> = { open: true, hasAnswer: true, kind: "answer", total: 12, shots: 4, shot: 0, chips: ["Flooding", "Open"], chipOpts: [], suggest: ["severe cases this week", "garbage near schools"] };
const lane = (said: string, askMap: Omit<MapCtx10, "lang"> | null = null): BrowserLane10 => {
  const c: BrowserCtx10 = { stage: null, news: { items: [] }, state, world, listenLang: "en", heardLang: /[஀-௿]/u.test(said) ? "ta" : "en", v7: true, lex, askMap };
  return browserLaneV10(said, c);
};
const mapOp = (b: BrowserLane10) => (b.lane === "map" ? b.cmd.op : null);

describe("the map's lane among the others", () => {
  it("takes the map's own sentences, in three languages", () => {
    expect(mapOp(lane("within two kilometres of Kasimedu"))).toBe("circle");
    expect(mapOp(lane("Kasimedu-la rendu km kulla"))).toBe("circle");
    expect(mapOp(lane("காசிமேட்டிலிருந்து இரண்டு கிலோமீட்டருக்குள்"))).toBe("circle");
    expect(mapOp(lane("Jarvis, take me round the district"))).toBe("tour");
    expect(mapOp(lane("plan my visit to the worst flooded spots tomorrow morning"))).toBe("visit");
    expect(mapOp(lane("open rain and flooding"))).toBe("rain");
    expect(mapOp(lane("export this as CSV", ANSWER))).toBe("export");
    expect(mapOp(lane("only the severe ones", ANSWER))).toBe("followup");
    expect(mapOp(lane("next", { ...ANSWER, tour: true }))).toBe("tour");
  });
  it("the answer's language follows the words (Tamil and Tanglish answered in Tamil)", () => {
    const b = lane("Kasimedu-la rendu km kulla enna nadakkudhu");
    expect(b.lane === "map" ? b.lang : null).toBe("ta");
    const e = lane("within two kilometres of Kasimedu");
    expect(e.lane === "map" ? e.lang : null).toBe("en");
  });
  it("leaves the others' sentences to them", () => {
    // a storm asked about is the news (with the weather), even with the map open
    expect(lane("Tell me about Cyclone Aquan.", ANSWER).lane).toBe("news");
    // "export this as CSV" with nothing on the map is not the map's
    expect(lane("export this as CSV").lane).not.toBe("map");
    // "next" with no tour, "only the severe ones" with no answer: not the map's
    expect(lane("next", ANSWER).lane).not.toBe("map");
    expect(lane("only the severe ones").lane).not.toBe("map");
    // a cut-off line still waits for its rest
    expect(lane("take me round the").lane).toBe("wait");
  });
  it("a news request about the rain, a tour or a round-up is the news's, as in v9 (v10 review 2, findings 9 and 12)", () => {
    for (const s of ["show the latest rain news", "what's the news on rain and flooding", "news about flood prone areas", "கடந்த மழை செய்திகளைக் காட்டு", "mazhai vellam news kaattu",
      "give me the news round-up", "news about the CM's district tour", "முதல்வர் சுற்றுப்பயணம் பற்றிய செய்தி", "மாமல்லபுரம் சுற்றுலா செய்திகள்"]) {
      expect(lane(s).lane, s).toBe("news");
    }
  });
  it("a visit's brief, a case on the map, a case assigned and side requests are not the map's (v10 review 2, findings 13, 15, 17 and 18)", () => {
    expect(lane("I have a site visit in Velachery tomorrow, what should I know?").lane).not.toBe("map");
    expect(lane("I have a field visit in Adyar tomorrow morning, brief me").lane).not.toBe("map");
    const caseOpen = { ...(state as object), panel: "incident", incident: "INC-1" } as never;
    const b = browserLaneV10("show this case on the map", { stage: null, news: { items: [] }, state: caseOpen, world, listenLang: "en", heardLang: "en", v7: true, lex, askMap: null, incident: "INC-1" } as BrowserCtx10);
    expect(b.lane).not.toBe("map");
    for (const s of ["assign this case to the AE", "send this to the zonal officer", "keep the map open", "suggest an action for this"]) expect(lane(s, ANSWER).lane, s).not.toBe("map");
  });
});
