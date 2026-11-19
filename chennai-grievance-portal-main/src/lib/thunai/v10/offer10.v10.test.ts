/**
 * v10 (docs/jarvis/JARVIS_V10.md 4.5 and 4.9 feature 1): after a news brief, its offered next steps work, in English, Tamil and Tanglish:
 * "show them on the map", "draft a note to the officer", "follow it", "read it fully", "what do we have on this?"; one pending offer, gone
 * after any other turn or two minutes; nothing is ever sent (a draft goes to the tray). The phrasings are MODEL-DRAFTED: a Tamil speaker
 * should review them.
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import { fullRead, newsAsk } from "../newsask";
import { groundAsk, groundScreen, OFFER_MS, offerAct, offerOf, offerSaid, type Offer10 } from "./offer10";

const AT = 1_000_000;
const OFFER: Offer10 = { story: "d1", lang: "en", offers: ["map", "draft"], map: "open drainage complaints near Kotturpuram", draft: ["INC-OLD"], follow: { zone: 13, en: "Adyar", ta: "அடையாறு" }, civic: true, at: AT };
const act = (said: string, o: Offer10 | null = OFFER, now = AT + 5000) => offerAct(said, o, now);

describe("v10: a reply to the brief's offer", () => {
  it.each([
    ["yes", { act: "map", q: OFFER.map }],
    ["Yes please.", { act: "map", q: OFFER.map }],
    ["ஆமா", { act: "map", q: OFFER.map }],
    ["sari", { act: "map", q: OFFER.map }],
    ["yes, show it on the map", { act: "map", q: OFFER.map }],
    ["show them on the map", { act: "map", q: OFFER.map }],
    ["show them", { act: "map", q: OFFER.map }],
    ["map-la kaattunga", { act: "map", q: OFFER.map }],
    ["வரைபடத்தில் காட்டுங்க", { act: "map", q: OFFER.map }],
    ["மேப்ல காட்டுங்க", { act: "map", q: OFFER.map }],
    ["draft a note to the officer", { act: "draft", ids: ["INC-OLD"] }],
    ["Draft a note to the AE.", { act: "draft", ids: ["INC-OLD"] }],
    ["send a note to the officer", { act: "draft", ids: ["INC-OLD"] }],
    ["officer-ku oru note draft pannunga", { act: "draft", ids: ["INC-OLD"] }],
    ["அதிகாரிக்கு ஒரு குறிப்பு எழுதுங்க", { act: "draft", ids: ["INC-OLD"] }],
    ["follow it", { act: "follow", zone: 13, name: { en: "Adyar", ta: "அடையாறு" } }],
    ["keep an eye on it for me", { act: "follow", zone: 13, name: { en: "Adyar", ta: "அடையாறு" } }],
    ["follow pannunga", { act: "follow", zone: 13, name: { en: "Adyar", ta: "அடையாறு" } }],
    ["ஃபாலோ பண்ணுங்க", { act: "follow", zone: 13, name: { en: "Adyar", ta: "அடையாறு" } }],
    ["read it fully", { act: "full", id: "d1" }],
    ["read the whole thing", { act: "full", id: "d1" }],
    ["full-a padinga", { act: "full", id: "d1" }],
    ["முழுசா படிங்க", { act: "full", id: "d1" }],
    ["what do we have on this?", { act: "ground", id: "d1" }],
    ["Do we have any complaints about this?", { act: "ground", id: "d1" }],
    ["what does the console say about it", { act: "ground", id: "d1" }],
    ["idha pathi namma kitta enna irukku", { act: "ground", id: "d1" }],
    ["idhukku complaints irukka", { act: "ground", id: "d1" }],
    ["இதைப் பற்றி நம்மகிட்ட என்ன இருக்கு?", { act: "ground", id: "d1" }],
    ["இது பற்றி புகார் ஏதாவது இருக்கா?", { act: "ground", id: "d1" }],
    ["no thanks", { act: "no" }],
    ["வேண்டாம்", { act: "no" }],
    ["don't draft anything", { act: "no" }]
  ])("%s", (said, want) => {
    expect(act(said)).toEqual(want);
  });

  it("anything else is no reply: the turn goes on, and the offer is forgotten", () => {
    for (const s of ["show me the weather in Adyar", "how many complaints in Teynampet this week", "open the second news", "follow up with the department on the Adyar case", "what is the AQI"]) expect(act(s)).toBeNull();
  });
  it("Jarvis's own offer, overheard, is no reply to it", () => {
    expect(act("Shall I show them on the map, or draft a note to the officer?")).toBeNull();
    expect(act("வரைபடத்தில் காட்டட்டுமா, இல்லை அதிகாரிக்கு ஒரு குறிப்பு வரைவு செய்யட்டுமா?")).toBeNull();
  });
  it("one pending offer for a short while only", () => {
    expect(act("yes", OFFER, AT + OFFER_MS + 1)).toBeNull();
    expect(act("yes", null)).toBeNull();
  });
  it("a step the story has none of is said so, never done", () => {
    const none: Offer10 = { ...OFFER, offers: ["map", "follow"], draft: [] };
    expect(act("draft a note to the officer", none)).toEqual({ act: "none", what: "draft" });
    expect(offerSaid({ act: "none", what: "draft" }, "en")).toMatch(/no open case on the console for this story/);
    expect(act("yes", { ...OFFER, offers: ["full"], map: null, draft: [], follow: null })).toEqual({ act: "full", id: "d1" });
    expect(act("follow it", { ...OFFER, follow: null })).toEqual({ act: "none", what: "follow" });
  });
  it("the offer event is checked: a bad id, an unknown step or a bad zone is dropped", () => {
    expect(offerOf({ story: "bad id!", offers: ["map"] }, "en", AT)).toBeNull();
    const o = offerOf({ story: "d1", offers: ["map", "send", "draft"], map: "open drainage complaints near Kotturpuram", draft: ["INC-1", "<x>"], follow: { zone: 99, en: "x", ta: "y" }, civic: true }, "ta", AT);
    expect(o).toEqual({ story: "d1", lang: "ta", offers: ["map", "draft"], map: "open drainage complaints near Kotturpuram", draft: ["INC-1"], follow: null, civic: true, at: AT });
  });
});

describe("v10 review 2 (finding 2): a sentence about another place, case, zone or kind is no reply to the story's offer", () => {
  it.each([
    ["are there any open complaints about garbage in Teynampet this week?"],
    ["any complaints in Teynampet?"],
    ["தேனாம்பேட்டையில் புகார் ஏதாவது இருக்கா?"],
    ["Teynampet-la complaints irukka?"],
    ["show the garbage complaints in Teynampet on the map"],
    ["give me the full report on overdue cases in Adyar zone"],
    ["draft a note to the officer on INC-123"],
    ["Teynampet zone follow pannunga"],
    ["officer-a follow pannunga"],
    ["close the map"]
  ])("%s: the lanes take it", (said) => {
    expect(act(said)).toBeNull();
  });
  it("with the console's world: a locality or a taluk named elsewhere", () => {
    expect(offerAct("show the complaints in T Nagar on the map", OFFER, AT + 5000, WORLD)).toBeNull();
    expect(offerAct("any complaints in Velachery?", OFFER, AT + 5000, WORLD)).toBeNull();
    expect(offerAct("show them on the map", OFFER, AT + 5000, WORLD)).toEqual({ act: "map", q: OFFER.map });
  });
  it("as the console calls it (no world): a locality the lexicon does not hold, named after 'in' or with '-la', is somewhere else", () => {
    expect(act("show the complaints in Velachery on the map")).toBeNull();
    expect(act("Velachery-la complaints irukka?")).toBeNull();
    expect(act("draft a note to the officer in Besant Nagar")).toBeNull();
    // the story's own place, its zone, and words that name no place are still a reply
    expect(act("show them on the map near Kotturpuram")).toEqual({ act: "map", q: OFFER.map });
    expect(act("show the cases in Adyar on the map")).toEqual({ act: "map", q: OFFER.map });
    expect(act("show them on the map at once")).toEqual({ act: "map", q: OFFER.map });
    expect(act("draft a note to the officer in charge")).toEqual({ act: "draft", ids: ["INC-OLD"] });
  });
  it("a short ask that names where is a question of its own", () => {
    expect(groundAsk("any complaints in Teynampet?")).toBe(false);
    expect(groundAsk("are there any open complaints about garbage in Teynampet this week?")).toBe(false);
  });
  it("the story's own kind, zone, case and department are still the story's", () => {
    expect(act("show the sewage complaints on the map")).toEqual({ act: "map", q: OFFER.map });
    expect(act("are there any complaints about this sewage problem?")).toEqual({ act: "ground", id: "d1" });
    expect(act("any complaints in this area?")).toEqual({ act: "ground", id: "d1" });
    expect(act("draft a note to the officer on INC-OLD")).toEqual({ act: "draft", ids: ["INC-OLD"] });
    expect(act("draft a note to Metro Water")).toEqual({ act: "draft", ids: ["INC-OLD"] });
    expect(act("adha follow pannunga")).toEqual({ act: "follow", zone: 13, name: { en: "Adyar", ta: "அடையாறு" } });
    expect(act("read the full report")).toEqual({ act: "full", id: "d1" });
  });
});

describe("v10 review 2 (finding 8): an acknowledgement is no yes", () => {
  it("'okay thanks' and 'thanks' put the offer away; 'yes thanks' is no plain yes (v9's plainYes)", () => {
    expect(act("okay thanks")).toEqual({ act: "no" });
    expect(act("thanks")).toEqual({ act: "no" });
    expect(act("okay thank you")).toEqual({ act: "no" });
    expect(act("yes thanks")).toBeNull();
  });
  it("an offer the brief never said aloud (after the whole story) takes no bare yes, only a step named", () => {
    const unsaid = offerOf({ story: "d1", offers: ["map", "draft"], map: OFFER.map, draft: ["INC-OLD"], follow: null, civic: true, unsaid: true }, "en", AT);
    expect(act("Okay.", unsaid)).toBeNull();
    expect(act("draft a note to the officer", unsaid)).toEqual({ act: "draft", ids: ["INC-OLD"] });
  });
});

describe("v10: \"read it fully\" in the news lane (newsask.ts)", () => {
  it.each([["read it fully"], ["read the whole thing"], ["read the full article"], ["Read the whole story please"], ["read the rest"], ["full-a padinga"], ["fulla padinga"], ["muzhusa padinga"],
    ["முழுசா படிங்க"], ["முழுச் செய்தியையும் படியுங்கள்"], ["முழுவதும் படிங்க"]])("%s", (said) => {
    expect(fullRead(said)).toBe(true);
  });
  it.each([["read the article"], ["give me the full list of complaints"], ["read the first news"], ["tell me about the Puzhal jail story"]])("not the whole story: %s", (said) => {
    expect(fullRead(said)).toBe(false);
  });
  it("over a news list, \"read the third article in full\" is the third story, whole", () => {
    const items = [{ id: "a", source: "The Hindu" }, { id: "b", source: "DT Next" }, { id: "c", source: "Dinamani" }];
    expect(newsAsk("read the third article in full", { items })).toEqual({ kind: "read", body: { id: "c" }, full: true });
    expect(newsAsk("read the third article", { items })).toEqual({ kind: "read", body: { id: "c" } });
  });
});

describe("v10: news to ground truth's words and screen", () => {
  it("the ask points at the story (or is short); a question about elsewhere is not it", () => {
    expect(groundAsk("what do we have on this?")).toBe(true);
    expect(groundAsk("any complaints there?")).toBe(true);
    expect(groundAsk("do we have complaints?")).toBe(true);
    expect(groundAsk("do we have complaints about garbage in Teynampet from last month in ward 112?")).toBe(false);
    expect(groundAsk("read it fully")).toBe(false);
  });
  it("the screen: what was said, and the open cases as a list the Stage draws (\"open the first one\" opens a case)", () => {
    const row = { id: "INC-OLD", title: "Drain overflow at Kotturpuram", sev: "High", status: "Open", zone: 13, zoneName: "Adyar", place: "Kotturpuram", ward: null, dept: "CMWSSB", deptName: "Metro Water (CMWSSB)",
      complaints: 2, t: "2026-11-07 09:00:00", overdue: true, lat: null, lon: null, why: null, cat: "Drainage & sewage" };
    const d = groundScreen({ lang: "en", en: ["The console has 1 open drainage and sewage case at Kotturpuram, open 12 days, held by Metro Water."], ta: ["x"], rows: [row], title: { en: "On the console: Kotturpuram", ta: "கன்சோலில்: கோட்டூர்புரம்" }, now: AT });
    expect(d?.blocks.map((b) => b.kind)).toEqual(["Note", "CaseList"]);
    expect(d?.title).toBe("On the console: Kotturpuram");
    // a malformed row: the note alone
    const bad = groundScreen({ lang: "en", en: ["x"], ta: ["y"], rows: [{ id: 3 }], title: { en: "On the console", ta: "கன்சோலில்" }, now: AT });
    expect(bad?.blocks.map((b) => b.kind)).toEqual(["Note"]);
  });
});
