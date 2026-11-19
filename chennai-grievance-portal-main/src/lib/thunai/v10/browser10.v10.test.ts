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
import { browserLaneV8, userLang8 } from "../v8/browser";
import { browserLaneV10, cutOff, joinCut, v10Front, type BrowserCtx10, type BrowserLane10 } from "./browser10";
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

describe("v10: the owner's replayed turns, dry (19 Nov): three misses", () => {
  it.each(["அண்ணா நகர் பிரைஸ் என்ன?", "Akvan puyal pathi?", "அக்வான் புயல் பற்றி?", "Adyar la?"])("'%s' is a whole question, not a cut-off line", (said) => {
    expect(cutOff(said)).toBe(false);
  });
  it.each(["அந்த", "Show me the", "இந்த ஒரு"])("'%s' is cut off", (said) => {
    expect(cutOff(said) || said.split(/\s+/).length === 1).toBe(true);
  });
  it("'Goto News.' (Whisper's 'go to') is the news panel's move, never a search for 'goto'", () => {
    const b = lane("Goto News.");
    expect(findOf(b)).toBeNull();
  });
  it("a Tamil headline's ordinary words are no names: a Tamil complaint question makes no news search", () => {
    const lex2 = buildLexicon([...STORIES, { id: "t1", title: "சென்னையில் இன்று புகார்கள் வந்திருக்கின்றன என்னனால் கம்ப்பியன்ஸ் அதிகம்", t: "2026-11-19 10:00" },
      { id: "t2", title: "அர்லேகர் மருத்துவமனையில் அனுமதி", titleEn: "Governor Arlekar admitted to hospital", t: "2026-11-19 11:00" },
      // the real store's (19 Nov): words before புயல் that are no storm, and Tamil words that sound like names in other stories
      { id: "t3", title: "இன்று புயல் கரையைக் கடக்கும்; தீவிர புயல் எச்சரிக்கை", titleEn: "Cyclone to cross coast today; severe cyclone warning", t: "2026-11-19 09:00" },
      { id: "t4", title: "பெண்கள் பாதுகாப்பு; கனமழை எச்சரிக்கை", titleEn: "Women's safety; heavy rain warning", t: "2026-11-19 08:00" },
      { id: "t5", title: "Bengal bay depression; Kanimozhi visits Chennai", t: "2026-11-19 07:00" }], world);
    expect(lex2.some((e) => e.spellings.includes("கம்ப்பியன்ஸ்") || e.spellings.includes("வந்திருக்கின்றன"))).toBe(false);
    expect(lex2.find((e) => e.core === "Arlekar")?.spellings).toContain("அர்லேகர்");
    expect(lex2.some((e) => e.kind === "storm" && e.spellings.some((s) => ["இன்று", "தீவிர"].includes(s)))).toBe(false);
    expect(lex2.some((e) => e.spellings.includes("பெண்கள்") || e.spellings.includes("கனமழை"))).toBe(false);
    expect(lex2.find((e) => e.core === "Vandalur") ?? null).toBeNull();
    const c: BrowserCtx10 = { stage: null, news: { items: [] }, state: state(), world, listenLang: "en", heardLang: "ta", v7: true, lex: lex2 };
    const b = browserLaneV10("எனக்கு வந்து இன்று என்ன என்னனால் கம்ப்பியன்ஸ் வந்திருக்கு.", c);
    expect(findOf(b)?.entity ?? null).toBeNull();
    // a Tamil verb that sounds as a Latin name in the news is no mention ("வந்திருக்கு" as Vandalur)
    const lex3 = buildLexicon([{ id: "v1", title: "Vandalur Zoo closed due to bird flu to reopen tomorrow!", t: "2026-11-17 20:20" }], world);
    const c3: BrowserCtx10 = { ...c, lex: lex3 };
    expect(b.lane === "confirm").toBe(false);
    expect(browserLaneV10("இன்று எத்தனை புகார்கள் வந்திருக்கு?", c3).lane).not.toBe("confirm");
  });
});

describe("v10: no \"did you mean\" for an English word or a Tamil verb (v8's dev set, d-na-8 and d-na-12, the first dry run)", () => {
  const lexB = buildLexicon([{ id: "v1", title: "வண்டலூர் உயிரியல் பூங்கா மீண்டும் திறப்பு", titleEn: "Vandalur Zoo to reopen tomorrow", t: "2026-11-17 20:20" },
    { id: "b1", title: "Bharati statue cleaned before anniversary", t: "2026-11-18 10:00" }], world);
  const c = (said: string): BrowserCtx10 => ({ stage: null, news: { items: [] }, state: state(), world, listenLang: "en", heardLang: /[஀-௿]/u.test(said) ? "ta" : "en", v7: true, lex: lexB });
  it.each(["பள்ளிக்கரணை பற்றி செய்தியில என்ன வந்திருக்கு?", "What's the latest on the bird flu at the zoo?"])("'%s' is not asked back", (said) => {
    expect(browserLaneV10(said, c(said)).lane).not.toBe("confirm");
  });
  it("a Tamil verb of what went or happened is no name ('திருட்டு போனது' was asked back as Pondy: news9, the dry run of 19 Nov)", () => {
    const lexP = buildLexicon([{ id: "p1", title: "பாண்டி பஜாரில் நடைபாதை கடைகள் அகற்றம்", titleEn: "Pavement shops removed at Pondy Bazaar", t: "2026-11-18 10:00" }], world);
    const said = "கோயில்ல திருட்டு போனது பத்தி ஏதாவது நியூஸ்?";
    expect(browserLaneV10(said, { ...c(said), lex: lexP }).lane).not.toBe("confirm");
  });
  it("a contraction is an English word, never half of a name said in two words ('one, that's' was asked back as 'Unittas?': v8's dev d-own-2)", () => {
    const lexU = buildLexicon([{ id: "u1", title: "Unittas meets Collector over land dispute", t: "2026-11-18 10:00" },
      { id: "u2", title: "Unittas plea heard in court", t: "2026-11-17 10:00" }], world);
    const said = "Open that one, that's Supreme Court order.";
    expect(browserLaneV10(said, { ...c(said), lex: lexU }).lane).not.toBe("confirm");
  });
  it("a name heard by ear still is ('Bharathi statue' is Bharati)", () => {
    const b = browserLaneV10("tell me about the Bharathi statue", c("x"));
    expect(findOf(b)?.entity?.name ?? (b.lane === "confirm" ? "asked" : null)).toBeTruthy();
  });
});

describe("v10: a named event the lexicon does not know is still the news, never the look-up or the planner's memory (4.4)", () => {
  it.each(["Tell me about the Zorbo protest", "what happened at the Kelvar fire?", "any update on the Mirvan accident"])("'%s' searches the news", (said) => {
    const f = findOf(lane(said));
    expect(f, said).not.toBeNull();
  });
  it.each(["Tell me about the protests in Adyar", "show the fire department's backlog", "open the Adyar fire"])("'%s' is not this lane's", (said) => {
    expect(findOf(lane(said))?.entity ?? null).toBeNull();
  });
});

describe("v10: a story on the screen named by its topic, with no news word (the owner's \"Open the GCC issue.\", 18 Nov)", () => {
  const panelStories = [{ id: "p1", title: "DRI Officials Seize 70 Kg Heroin Worth Rs 140 Crore In Chennai; Two Arrested", source: "DT Next" },
    { id: "p25", title: "GCC issues 124 de-occupation notices for coastal buildings", source: "The Hindu" }];
  const onPanel = (said: string) => browserLaneV10(said, { stage: null, news: { items: panelStories }, state: state({ panel: "news" }), world, listenLang: "en", heardLang: "en", v7: true, lex });
  it("'Open the GCC issue.' over the news panel is a find among the screen's stories, soft (nothing close: the lanes behind)", () => {
    const b = onPanel("Open the GCC issue.");
    const f = findOf(b);
    expect(f?.onlyScreen).toBe(true);
    expect(b.lane === "news" && b.na.kind === "find" && b.na.soft).toBe(true);
  });
  it.each(["Open the trends page.", "Open the Adyar complaints.", "Close the panel.", "Open the news panel.",
    // v8's own: "that one" and an outlet's story are its lanes' (v8's dev set, d-own-2 and d-ref-11, regressed in the first dry run)
    "Open that one, that's Supreme Court order.", "Open the DT Next one."])("'%s' over the panel is not", (said) => {
    expect(findOf(onPanel(said))?.onlyScreen ?? false).toBe(false);
  });
  it("the server finds it among the screen's stories only", async () => {
    const { findNews } = await import("../v8/newsfind");
    const r = await findNews({ q: "Open the GCC issue.", lang: "en", screen: panelStories, onlyScreen: true }, { world, stories: async () => [{ id: "s9", title: "GCC issue tracker launched for roads", t: "2026-11-19 10:00" }] });
    expect(r?.picked.pick?.id).toBe("p25");
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

describe("v10 review 2: a whole question that ends on 'is' or 'are' is answered, never waited on (finding 19)", () => {
  // v10 review 2, finding 19: cutOff took every line ending in is/are for a cut-off one, so these were held and never answered (v9 answered them)
  it.each(["Tell me where the Adyar zonal office is", "Tell me what the IMD warning is", "Find out who the AE for Velachery is", "Tell me where the relief centres are"])("'%s'", (said) => {
    expect(cutOff(said)).toBe(false);
    expect(lane(said).lane).not.toBe("wait");
  });
  it.each(["And the real problem is the", "What is", "Tell me what is", "Tell me if the drain is", "Check whether the AE is"])("'%s' is still cut off", (said) => {
    expect(cutOff(said)).toBe(true);
  });
  it("a typed line is finished when Enter is pressed: 'Tell me about the' typed is not waited on", () => {
    const c: BrowserCtx10 = { stage: null, news: { items: [] }, state: state(), world, listenLang: "en", heardLang: "en", v7: true, lex, source: "typed" };
    expect(browserLaneV10("Tell me about the", c).lane).not.toBe("wait");
    expect(browserLaneV10("Tell me about the", { ...c, source: "whisper" }).lane).toBe("wait");
  });
});

describe("v10 review 2: the Tamil and Tanglish 'he' is not Cyclone Akvan (finding 22)", () => {
  // v10 review 2, finding 22: அவன் / avan sounded within the ask band of Akvan (0.89), so these were asked back "Cyclone Akvan?"
  const lexA = buildLexicon([...STORIES, { id: "ta1", title: "அக்வான் புயல் நாளை கரையைக் கடக்கும்", titleEn: "Cyclone Akvan to cross the coast tomorrow", t: "2026-11-19 09:00" }], world);
  const c = (said: string): BrowserCtx10 => ({ stage: null, news: { items: [] }, state: state(), world, listenLang: "en", heardLang: /[஀-௿]/u.test(said) ? "ta" : "en", v7: true, lex: lexA });
  it.each(["அவன் என்ன சொன்னான்?", "அவன் மேல என்ன வழக்கு?", "Adyar AE avan phone edukkala"])("'%s' is not asked back", (said) => {
    const b = browserLaneV10(said, c(said));
    expect(b.lane === "confirm" ? b.ask.en : null).toBeNull();
  });
  it("the storm said in Tamil letters still is ('அக்வான் புயல் பற்றி சொல்லுங்க')", () => {
    const said = "அக்வான் புயல் பற்றி சொல்லுங்க";
    expect(findOf(browserLaneV10(said, c(said)))?.entity?.name).toBe("Cyclone Akvan");
  });
});

describe("v10 review 2: a name of the day said alone is answered, never waited on as a noise word (finding 23)", () => {
  // v10 review 2, finding 23: the one-word wait ran before the lexicon, so a name said or typed alone was taken for a noise
  const lexA = buildLexicon([...STORIES, { id: "ta1", title: "அக்வான் புயல் நாளை கரையைக் கடக்கும்", titleEn: "Cyclone Akvan to cross the coast tomorrow", t: "2026-11-19 09:00" }], world);
  const c = (said: string): BrowserCtx10 => ({ stage: null, news: { items: [] }, state: state(), world, listenLang: "en", heardLang: /[஀-௿]/u.test(said) ? "ta" : "en", v7: true, lex: lexA });
  it.each(["Akvan", "Akvan?", "Arlekar", "அக்வான்"])("'%s' does not wait", (said) => {
    expect(browserLaneV10(said, c(said)).lane).not.toBe("wait");
  });
  it.each(["Seithi", "செய்தி"])("the news word alone ('%s') does not wait", (said) => {
    expect(browserLaneV10(said, c(said)).lane).not.toBe("wait");
  });
  it("a noise no lexicon knows still waits ('வாயமுர்ரா.')", () => {
    expect(browserLaneV10("வாயமுர்ரா.", c("வாயமுர்ரா.")).lane).toBe("wait");
  });
});

describe("v10 review 2: 'the Fort' and 'the fast' at a sentence's end are no positions (finding 25)", () => {
  // v10 review 2, finding 25: with a list on screen, earOrdinals read "the Fort" as "the Fourth" and "the fast" as "the first"
  const S2 = [...STORIES, { id: "s4", title: "Secretariat staff protest at Fort St George over pay", t: "2026-11-19 10:00" },
    { id: "s5", title: "Hunger fast by fishermen enters third day at Kasimedu", t: "2026-11-19 09:30" }];
  const lex2 = buildLexicon(S2, world);
  const items = S2.map((s) => ({ id: s.id, title: s.title, source: "DT Next" }));
  const c = (): BrowserCtx10 => ({ stage: { recipe: "news", blocks: [{ kind: "NewsReader", items }], scope: { zone: null }, slots: {} } as never, news: { items }, state: state(), world, listenLang: "en", heardLang: "en", v7: true, lex: lex2 });
  it("'Any news from the Fort?' searches the news for the Fort", () => {
    const s = "Any news from the Fort?";
    expect(v10Front(s, c()).said).toBe(s);
    expect(browserLaneV10(s, c()).lane).toBe("news");
  });
  it("'Any update on the fast?' stays the fast", () => {
    expect(v10Front("Any update on the fast?", c()).said).toBe("Any update on the fast?");
  });
  it.each([["Tell me about the fast news.", "Tell me about the first news."], ["open the fort one", "open the fourth one"], ["open the secand", "open the second"]])("'%s' is still the position", (said, read) => {
    expect(v10Front(said, c()).said).toBe(read);
  });
});

describe("v10 review 2: a noise word that waited is never glued to the next request (finding 26)", () => {
  // v10 review 2, finding 26: "வாயமுர்ரா." waited (one-word) and joinCut put it in front of the next request, which then came back in Tamil
  it("'வாயமுர்ரா.' then 'Adyar complaints evvalavu?'", () => {
    const joined = joinCut({ text: "வாயமுர்ரா.", at: 0 }, "Adyar complaints evvalavu?", 1000);
    expect(userLang8(joined, null)).toBe(userLang8("Adyar complaints evvalavu?", null));
    expect(joined).toBe("Adyar complaints evvalavu?");
  });
  it("a line cut off before its point still takes its rest ('Tell me about the' ... 'fast news'; 'அந்த' ... 'Adyar report')", () => {
    expect(joinCut({ text: "Tell me about the", at: 0 }, "fast news", 1000)).toBe("Tell me about the fast news");
    expect(joinCut({ text: "அந்த", at: 0 }, "Adyar report", 1000)).toBe("அந்த Adyar report");
  });
});
