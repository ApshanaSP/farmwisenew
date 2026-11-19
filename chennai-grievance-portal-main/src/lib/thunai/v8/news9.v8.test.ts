import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";
import { browserLaneV8, newsLane8 } from "./browser";
import { newsRequest, outletIn, pickStory, rankStories, topicWords, SOFT_FLOOR, type StoryItem } from "./news8";
import { newsOrdinal8, ordinalOf, stageRef8 } from "./refs8";
import { placesOf } from "./newsfind";
import type { ScreenState } from "../types";

// v8's holdout misses (eval/RESULTS.md v8, "Where v8 still misses"), one class at a time: each a failing test before its fix.
// Headlines are the dry-run store's (18-19 Nov 2026).
const world = { ...WORLD, ...referenceWorld() };
const PANEL: StoryItem[] = [
  { id: "p1", title: "Aquaan storm caused sea turbulence at Chennai Kasimedu fishing harbor", outlets: ["Dinamalar"], onScreen: 1, t: "2026-11-18 19:00" },
  { id: "p2", title: "GCC issues 124 de-occupation notices for coastal buildings", outlets: ["The Hindu"], onScreen: 2, t: "2026-11-18 18:00" },
  { id: "p3", title: "Rise in balloon prices; Plan to hold hunger strike in Chennai: Decorators interview", outlets: ["The Indian Express"], onScreen: 3, t: "2026-11-18 17:30" },
  { id: "p4", title: "Bid to smuggle drugs into Puzhal jail, two held", outlets: ["The New Indian Express", "The Times of India"], onScreen: 4, t: "2026-11-18 17:00" },
  { id: "p5", title: "Unauthorised Buildings Major Enforcement Challenge in Chennai", outlets: ["Deccan Chronicle"], onScreen: 5, t: "2026-11-18 16:00" },
  { id: "p6", title: "Construction Ban In Chennai's Pallikaranai: HC Gives Liberty To Petitioners To Approach SC", outlets: ["ETV Bharat", "Hindu Tamil Thisai"], onScreen: 6, t: "2026-11-18 15:00" },
  { id: "p7", title: "Seizure of drugs worth Rs. 140 crore near Madhavaram – 2 people arrested", outlets: ["Maalaimalar"], onScreen: 7, t: "2026-11-18 14:00" },
  { id: "p8", title: "Tamil Nadu: Fire at IOCL plant in Chennai; worker killed in explosion", outlets: ["The Economic Times"], onScreen: 8, t: "2026-11-18 13:00" },
  { id: "p9", title: "Health Department and Rotary Club of Madras partner to take forward HPV vaccination", outlets: ["The Hindu"], onScreen: 9, t: "2026-11-18 12:00" },
  { id: "p10", title: "Chennai Corporation opens free public toilets at 853 locations", outlets: ["Daily Thanthi"], onScreen: 10, t: "2026-11-18 11:00" },
  { id: "p11", title: "Pharmacy owner, two chefs arrested for supplying narcotic drugs in Chennai", outlets: ["The Times of India"], onScreen: 11, t: "2026-11-18 10:00" }
];
const STORE: StoryItem[] = [
  { id: "s1", title: "Construction ban on Pallikkaranai wetland ordered by the Supreme Court for ‘Credai’", outlets: ["Dinamalar"], place: "Pallikaranai", t: "2026-11-18 19:24" },
  { id: "s2", title: "Man hacked after dispute over honking in Pattinapakkam, four arrested", outlets: ["The Times of India"], t: "2026-11-18 09:00" },
  { id: "s3", title: "மெரினாவில் சவாரி குதிரை மிரண்டு ஓடியதில் தாய், மகள் உள்பட 3 பேர் படுகாயம்", titleEn: "3 people including mother and daughter severely injured after a riding horse goes berserk in Marina", outlets: ["Dinamani"], t: "2026-11-17 20:00" },
  { id: "s4", title: "The cascade water tank in Marina, Chennai has broken; repair work has started", outlets: ["DT Next"], t: "2026-11-17 18:00" },
  { id: "s5", title: "திருப்பரங்குன்றம் மலை உச்சியில் தீபம் ஏற்ற அனுமதி இல்லை: மதுரை நிர்வாகம் வாதம்", titleEn: "No permission to light a lamp on the Tirupparangunram pillar: Madurai administration argues", outlets: ["Dinamalar"], t: "2026-11-17 12:00" },
  { id: "s6", title: "Kodungaiyur residents stage empty pot protest over drinking water", outlets: ["DT Next"], place: "Kodungaiyur", t: "2026-11-16 12:00" },
  { id: "s7", title: "Vandalur Zoo closed due to bird flu to reopen tomorrow!", outlets: ["Dinamani"], t: "2026-11-16 10:00" },
  { id: "s8", title: "Thala Forever: CSK Pay Special Tribute To MS Dhoni With Drone At Chennai's Marina Beach", outlets: ["News18"], t: "2026-11-15 10:00" },
  { id: "s9", title: "Chennai drug bust: DRI seizes 70kg heroin worth Rs 700 crore, arrests two", outlets: ["The Times of India"], t: "2026-11-15 09:00" },
  { id: "s10", title: "Power shutdown announcement for coming Thursday in Chennai.. Do you know in which areas?", outlets: ["Maalaimalar"], t: "2026-11-15 08:00" }
];
const ALL = [...PANEL, ...STORE];
const PLACES = placesOf(world);
const find = (text: string, o: { onScreen?: boolean; items?: StoryItem[] } = {}) => {
  const onScreen = o.onScreen ?? false;
  const items = o.items ?? (onScreen ? ALL : STORE.concat(PANEL.map((p) => ({ ...p, onScreen: null }))));
  const req = newsRequest(text, { onScreen });
  if (!req) return null;
  return { req, ...pickStory(rankStories(req, items, { places: PLACES }), null, req.soft ? SOFT_FLOOR : undefined) };
};
const panelNews = { items: PANEL.map((p) => ({ id: p.id, title: p.title, source: (p.outlets ?? []).join(" · ") })) };
const lane = (t: string, o: { panel?: boolean } = {}) => newsLane8(t, { news: panelNews, world, lang: /[஀-௿]/u.test(t) ? "ta" : "en", panel: o.panel ?? true });

describe("v9: an acronym spoken letter by letter", () => {
  it("'I O C L' is IOCL, 'H P V' is HPV, dots or spaces", () => {
    expect(topicWords("Jarvis, anything new on that I O C L blast?", null)).toContain("iocl");
    expect(topicWords("open the I.O.C.L. fire news", null)).toContain("iocl");
    expect(topicWords("H P V vaccination news", null)).toContain("hpv");
  });
  it("finds the story by the joined letters", () => {
    expect(find("Jarvis, anything new on that I O C L blast?")?.stories[0]?.id).toBe("p8");
    expect(find("I O C L fire news padinga")?.pick?.id).toBe("p8");
    expect(find("Jarvis, anything on the H P V vaccination drive?")?.stories[0]?.id).toBe("p9");
  });
  it("a lone article or pronoun is not part of an acronym", () => {
    expect(topicWords("is there a news on the Puzhal jail", null)).toEqual(["puzhal", "jail"]);
    expect(topicWords("I read the Puzhal jail news", null)).toEqual(["puzhal", "jail"]);
  });
});

describe("v9: a place split or spelt by ear", () => {
  it("'Kasi medu' is Kasimedu, 'Palli Karanai' is Pallikaranai (the two halves joined)", () => {
    expect(find("Jarvis, open the Kasi medu one", { onScreen: true })?.pick?.id).toBe("p1");
    expect(["s1", "p6"]).toContain(find("Palli Karanai construction ban news")?.pick?.id);
    expect(find("Kaasi Medu harbour news")?.pick?.id).toBe("p1");
  });
  it("a two-word name in the headline is still matched word by word ('Anna Nagar' is not joined away)", () => {
    const items: StoryItem[] = [{ id: "a", title: "Anna Nagar tower park reopens after repairs", outlets: ["DT Next"], t: "2026-11-18 10:00" },
      { id: "b", title: "Anna Salai metro work causes traffic jam", outlets: ["DT Next"], t: "2026-11-18 09:00" }];
    expect(find("Anna Nagar park news", { items })?.pick?.id).toBe("a");
  });
  it("spelt by ear: Pattinapakam, Kodungayur, Vandaloor", () => {
    expect(find("Pattinapakam honking fight news")?.pick?.id).toBe("s2");
    expect(find("Kodungayur protest news")?.pick?.id).toBe("s6");
    expect(find("Vandaloor zoo news")?.pick?.id).toBe("s7");
  });
});

describe("v9: an outlet misheard", () => {
  it("'Deccan Chronical', 'ETV Bharath', 'Dina malar', 'Malaimalar' are the outlets", () => {
    expect(outletIn("Jarvis, the Deccan Chronical one")).toBe("Deccan Chronicle");
    expect(outletIn("open the ETV Bharath one")).toBe("ETV Bharat");
    expect(outletIn("read the Dina malar story")).toBe("Dinamalar");
    expect(outletIn("the Malaimalar news")).toBe("Maalaimalar");
    expect(outletIn("the Maalai Malar news")).toBe("Maalaimalar");
  });
  it("The Indian Express is not The New Indian Express", () => {
    expect(outletIn("the Indian Express one")).toBe("The Indian Express");
    expect(outletIn("the New Indian Express story")).toBe("The New Indian Express");
    expect(find("open the Indian Express one", { onScreen: true })?.pick?.id).toBe("p3");
  });
  it("the misheard outlet's story on the panel is opened", () => {
    expect(find("Jarvis, the Deccan Chronical one", { onScreen: true })?.pick?.id).toBe("p5");
    expect(find("open the ETV Bharath one", { onScreen: true })?.pick?.id).toBe("p6");
    expect(find("open the Maalaimalar one", { onScreen: true })?.pick?.id).toBe("p7");
  });
  it("a word near an outlet's is not the outlet ('chronic', 'Bharathi')", () => {
    expect(outletIn("the chronic water shortage news")).toBeNull();
    expect(outletIn("Bharathi Pasarai art competition news")).toBeNull();
    // Hindu Munnani is an organisation (the store's "Hindu Munnani members protest in Chennai Egmore"), not The Hindu
    expect(outletIn("the Hindu Munnani protest news")).toBeNull();
    expect(outletIn("read the Hindu's piece on the Metro")).toBe("The Hindu");
    expect(outletIn("N D T V story")).toBe("NDTV");
    expect(outletIn("News 18 report")).toBe("News18");
    expect(outletIn("show me the news")).toBeNull();
    expect(outletIn("தினமணி செய்தியைப் படிங்க")).toBe("Dinamani");
    expect(outletIn("மாலைமலர் செய்தி")).toBe("Maalaimalar");
  });
});

describe("v9: colloquial Tamil left in the topic", () => {
  it("postpositions and particles are the request's own (பத்தின, -வுல, அதைப், ஆச்சு, நடந்த)", () => {
    expect(topicWords("திருப்பரங்குன்றம் தீபம் பத்தின செய்தியைச் சொல்லுங்க", null)).toHaveLength(2);
    expect(topicWords("Marina la enna aachu? edhavadhu news irukka?", null)).toEqual(["marina"]);
    expect(topicWords("Pattinapakam la nadandha vettu sambavam news sollunga", null)).toEqual(["pattinapakam", "vettu"]);
    expect(topicWords("மெரினாவுல குதிரை மிரண்டு ஓடின செய்தி என்ன? அதைப் படிங்க", null)).not.toContain(topicWords("அதைப்", null)[0]);
  });
  it("the stories are found", () => {
    expect(find("Jarvis, திருப்பரங்குன்றம் தீபம் பத்தின செய்தியைச் சொல்லுங்க")?.pick?.id).toBe("s5");
    expect(find("மெரினாவுல குதிரை மிரண்டு ஓடின செய்தி என்ன? அதைப் படிங்க")?.pick?.id).toBe("s3");
    expect(find("Jarvis, Pattinapakam la nadandha vettu sambavam news sollunga")?.pick?.id).toBe("s2");
    expect(find("Jarvis, Thursday power cut news ah konjam padinga")?.pick?.id).toBe("s10");
  });
  it("a news question with spoken Tamil keeps its topic", () => {
    expect(find("Jarvis, Marina la enna aachu? edhavadhu news irukka?")?.stories.some((s) => /marina/i.test(s.titleEn || s.title))).toBe(true);
  });
  it("what the news does not have is still not matched (Kerala's floods in Tamil)", () => {
    expect(find("கேரளா வெள்ளம் பத்தின செய்தி இருக்கா?")?.pick ?? null).toBeNull();
  });
});

describe("v9: ordinals past the fifth, and 'the last one'", () => {
  const items = PANEL.map((p) => ({ id: p.id }));
  it("Tamil, Tanglish, English and digits up to the twelfth", () => {
    expect(ordinalOf("ஏழாவது")).toBe(7);
    expect(ordinalOf("ஆறாவது செய்தி")).toBe(6);
    expect(ordinalOf("ettavadhu")).toBe(8);
    expect(ordinalOf("ezhavathu")).toBe(7);
    expect(ordinalOf("the 9th")).toBe(9);
    expect(ordinalOf("9-வது")).toBe(9);
    expect(ordinalOf("the eleventh")).toBe(11);
    expect(ordinalOf("பத்தாவது")).toBe(10);
  });
  it("a story on the panel by its position past the fifth", () => {
    expect(newsOrdinal8("Jarvis, ஏழாவது செய்தியைத் திறங்க", items)).toBe("p7");
    expect(newsOrdinal8("ettavadhu news padinga", items)).toBe("p8");
    expect(newsOrdinal8("open the 9th news", items)).toBe("p9");
    expect(newsOrdinal8("பத்தாவது செய்தியைப் படிங்க", items)).toBe("p10");
  });
  it("on the console's news panel, 'the last one' and 'the second one' with no news word are its stories", () => {
    const last = lane("Jarvis, read me the last one");
    expect(last?.kind === "read" && "id" in last.body && last.body.id).toBe("p11");
    const two = lane("the second one, open it");
    expect(two?.kind === "read" && "id" in two.body && two.body.id).toBe("p2");
    const ta = lane("கடைசி ஒண்ணைப் படிங்க");
    expect(ta?.kind === "read" && "id" in ta.body && ta.body.id).toBe("p11");
    const tg = lane("ezhavadhu onna open pannunga");
    expect(tg?.kind === "read" && "id" in tg.body && tg.body.id).toBe("p7");
  });
  it("over Jarvis's own news list (a Stage), 'read the first one' stays the Stage's (the 17 Nov fix)", () => {
    expect(lane("read the first one", { panel: false })).toBeNull();
    expect(lane("read the last one", { panel: false })).toBeNull();
  });
  it("not a position: counts, a period, a street", () => {
    expect(lane("show the first two")).toBeNull();
    expect(lane("read the news from last week")).toBeNull();
    expect(lane("the last one was better")).toBeNull();
  });
  it("a case on the list past the fifth, in Tamil", () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ id: `c${i + 1}`, title: "Garbage", place: "Adyar", zoneName: "Adyar" }));
    expect(stageRef8("ஏழாவது சம்பவத்தைத் திறங்க", rows)).toEqual({ op: "open", n: 7 });
  });
});

describe("v9: 'open the X protest' with no news word: the news, softly", () => {
  it("a story-like topic with an open or read verb asks the news, marked soft", () => {
    const r = newsRequest("Jarvis, open the Kodungayur empty pot protest", { onScreen: false });
    expect(r?.kind).toBe("story");
    expect(r?.soft).toBe(true);
    expect(newsRequest("the IOCL fire, open that", { onScreen: true })?.soft).toBe(true);
    expect(newsRequest("read the Pattinapakkam honking attack", { onScreen: false })?.soft).toBe(true);
    expect(newsRequest("கொடுங்கையூர் காலிக்குடம் போராட்டத்தைத் திறங்க", { onScreen: false })?.soft).toBe(true);
  });
  it("found above the soft floor: the story", () => {
    expect(find("Jarvis, open the Kodungayur empty pot protest")?.pick?.id).toBe("s6");
    expect(find("the IOCL fire, open that", { onScreen: true })?.pick?.id).toBe("p8");
  });
  it("nothing that close: no story (the console's lanes take it)", () => {
    expect(find("open the Adyar fire")?.pick ?? null).toBeNull();
    expect(find("open the Velachery protest")?.pick ?? null).toBeNull();
  });
  it("the console's own requests stay out (cases, complaints, pages, views)", () => {
    for (const t of ["Open the Adyar complaints.", "Show me the fire incidents in Adyar.", "Open the map.", "Open the severe cases.", "Show the protests in Royapuram.",
      "Any accidents in Anna Nagar today?", "Open the fire department's backlog.", "Read the weekly report", "Open the strike rate chart", "open the Adyar one"]) {
      expect(newsRequest(t, { onScreen: false })?.soft ?? null, t).toBeNull();
    }
  });
  it("the browser: a soft find carries the lane it falls back to", () => {
    const state = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false } as unknown as ScreenState;
    const bl = browserLaneV8("Jarvis, open the Kodungayur empty pot protest", { stage: null, news: { items: [] }, state, world, listenLang: "en", heardLang: "en", v7: true });
    expect(bl.lane).toBe("news");
    expect(bl.lane === "news" && bl.na.kind === "find" && bl.na.body.find.soft).toBe(true);
    expect(bl.lane === "news" && bl.soft?.lane).toBeTruthy();
    expect(bl.lane === "news" && bl.soft?.lane).not.toBe("news");
  });
});
