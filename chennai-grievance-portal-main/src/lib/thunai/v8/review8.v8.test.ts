import { afterEach, describe, expect, it } from "vitest";
import { addressed, sideTalk8 } from "../addressed";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";
import { browserLaneV8, newsLane8 } from "./browser";
import { wordsLang, placeWord } from "./lang8";
import { newsRequest, pickStory, rankStories, topicWords, type StoryItem } from "./news8";
import { newsOrdinal8, stageRef8 } from "./refs8";
import { placesOf } from "./newsfind";

// The independent code review of 092ada32 (18 Nov), and the owner's examples on the real path (o8a): each finding as a failing test first.
const world = { ...WORLD, ...referenceWorld() };
const lane = (t: string, items: { id: string; title?: string; source?: string | null }[] = []) => newsLane8(t, { news: { items: items.map((x) => ({ ...x, source: x.source ?? null })) }, world, lang: "en" });
const gate = (text: string, o: { awaiting?: boolean; noun?: boolean } = {}) =>
  addressed({ text, lastTurnAt: 1_000_000 - 5000, now: 1_000_000, rulesSure: false, districtNoun: o.noun ?? false, awaitingAnswer: o.awaiting ?? false });

describe("review 1: the story search is fast (it blocked the server for tens of seconds)", () => {
  it("3,000 stories and the district's places score in well under a second", () => {
    const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima"];
    const items: StoryItem[] = Array.from({ length: 3000 }, (_, i) => ({ id: `s${i}`, title: `${words[i % 12]} ${words[(i * 7) % 12]} report on the Chennai ${words[(i * 5) % 12]} works near Adyar and Velachery number ${i}`, outlets: ["The Hindu"], t: `2026-11-18 ${String(i % 24).padStart(2, "0")}:00` }));
    items.push({ id: "pal", title: "Construction ban on Pallikkaranai wetland ordered by the Supreme Court", outlets: ["Dinamalar"], t: "2026-11-18 19:24" });
    const req = newsRequest("Open the Supreme Court news on Palikan.", {})!;
    const t0 = performance.now();
    const r = pickStory(rankStories(req, items, { places: placesOf(world) }));
    const ms = performance.now() - t0;
    expect(r.pick?.id).toBe("pal");
    expect(ms).toBeLessThan(1500);
  });
});

describe("review 2: ordinary console questions stay out of the news lane", () => {
  for (const t of ["Anything urgent?", "Any overdue work in Adyar?", "Is there anything pending in Teynampet?", "Any flooding in Velachery?", "Any accidents in Anna Nagar today?",
    "Latest numbers for Adyar?", "What happened to the Velachery drain work?", "Go to the news page.", "Open the news panel.", "Show me the news tab.", "Read the news in Tamil.",
    "Read the weekly report", "Open the rainfall report", "Show me the zone report for Adyar", "Open the officer's report", "Show the action taken report"]) {
    it(t, () => expect(lane(t)).toBeNull());
  }
  it("a news question with a news word still is one", () => expect(lane("Any news on the cyclone?")?.kind).toBe("find"));
});

describe("review 3: real requests are not silenced as side talk", () => {
  for (const t of ["Open that.", "Read this.", "Explain that.", "Zoom in.", "What's this about?", "What's going on?", "Who is this case assigned to?", "Which outlet is this from?",
    "Show me more on that.", "Will you read the second story?", "Are you listening?", "Google it.", "Seri, open the news.", "Haan, show me the severe cases.",
    "Show me the cases from Adyar, Velachery.", "அடுத்து"]) {
    it(t, () => { const g = gate(t, { noun: /Adyar|Velachery|AE/.test(t) }); expect(g.act, g.why).toBe(true); });
  }
  // these three v7's own engaged-window rule leaves unanswered (no request shape): v8's new silences must not be the reason
  for (const t of ["Google the Supreme Court news.", "Send it to the AE.", "Amma Unavagam complaints in Adyar"]) {
    it(`v8's silences leave '${t}' alone`, () => expect(sideTalk8(t, { districtNoun: /AE|Adyar/.test(t) })).toBeNull());
  }
  it("a bare 'That.' answering Jarvis's question is an answer", () => expect(gate("That.", { awaiting: true }).act).toBe(true));
  it("'Alexa' as Whisper writes it in Tamil letters is another assistant (the real run, 18 Nov)", () => {
    expect(gate("அலேக்சா When was it open?").act).toBe(false);
    expect(gate("அலெக்ஸா, what's the time?").act).toBe(false);
  });
  it("the owner's examples still hold", () => {
    for (const t of ["Alexa, when was it open?", "What are the", "தயவுசெய்து,", "Ramesh, send the file to the Commissioner.", "Madam, the car is ready downstairs."]) expect(gate(t).act, t).toBe(false);
  });
});

describe("review 4: the found story does not linger", () => {
  it("'anything else' or 'what else is pending in Teynampet' is not a re-search of an old story", () => {
    const last = { id: "s1", title: "Pallikaranai marsh construction ban", other: { id: "s2" } };
    expect(newsLane8("Anything else?", { news: { items: [] }, world, lang: "en", lastFound: last })).toBeNull();
    expect(newsLane8("What else is pending in Teynampet?", { news: { items: [] }, world, lang: "en", lastFound: last })).toBeNull();
    const more = newsLane8("What else is in the news about it?", { news: { items: [] }, world, lang: "en", lastFound: last });
    expect(more?.kind === "find" && more.body.find.exclude).toEqual(["s1"]);
  });
  it("a title with 'stop' or 'never' in it is still searched", () => {
    const more = newsLane8("anything more on it", { news: { items: [] }, world, lang: "en", lastFound: { id: "x", title: "Never again: residents stop the dumping at Kodungaiyur", other: null } });
    expect(more?.kind).toBe("find");
    expect(more?.kind === "find" && newsRequest(more.body.find.q, {})).toBeTruthy();
  });
});

describe("review 5: v7's list commands keep their meaning", () => {
  const rows = [{ id: "c1", title: "Waterlogging", place: "Perambur", zoneName: "Thiru-Vi-Ka Nagar" }, { id: "c2", title: "Accident", place: "Royapettah", zoneName: "Teynampet" },
    { id: "c3", title: "Garbage", place: "Kasimedu", zoneName: "Royapuram" }];
  for (const t of ["show only the first two", "show the first five", "read the first three", "Is the Kasimedu one done?", "Explain the second chart"]) {
    it(t, () => expect(stageRef8(t, rows)).toBeNull());
  }
  it("over a news list 'read the first one' stays the Stage's headline reading (the 17 Nov fix); 'the first article' is the article", () => {
    const items = [{ id: "n1" }, { id: "n2" }];
    expect(newsOrdinal8("read the first one", items)).toBeNull();
    expect(newsOrdinal8("Read the news from last week", items)).toBeNull();
    expect(newsOrdinal8("Read the story about the second bridge", items)).toBeNull();
    expect(newsOrdinal8("read the first article", items)).toBe("n1");
  });
});

describe("review 7 and 8: Tamil topic words, and the reply language's edge cases", () => {
  it("முதல்வர் (the CM) and இந்திய are topic words, not the request's own", () => {
    expect(topicWords("முதல்வர் திறந்து வைத்த திட்டங்கள் செய்தியைப் படி", null)).toContain(topicWords("முதல்வர்", null)[0]);
    expect(topicWords("இந்திய ராணுவம் செய்தி", null).length).toBe(2);
  });
  it("English with a filler at the end stays English", () => {
    expect(wordsLang("Show me the severe cases in Adyar, um", { isName: placeWord })).toBe("en");
    expect(wordsLang("Open the Supreme Court news, ah", { isName: placeWord })).toBe("en");
  });
  it("a place said in Tamil letters alone is Tamil", () => expect(wordsLang("அடையாறு?", { isName: placeWord })).toBe("ta"));
});

describe("the real run (o8a): an English request gets the English report of the story", () => {
  it("of several outlets' reports of one event, the one in the request's language", () => {
    const items: StoryItem[] = [
      { id: "ta1", title: "பள்ளிக்கரணை சதுப்பு நிலத்தில் கட்டுமான தடை உச்ச நீதிமன்றத்தை அணுக கிரெடாய்க்கு உத்தரவு", titleEn: "Construction ban on Pallikkaranai wetland ordered by the Supreme Court for Credai", outlets: ["Dinamalar"], t: "2026-11-18 19:24", story: "S1" },
      { id: "en1", title: "Pallikaranai marsh construction ban: Madras HC asks litigants to approach Supreme Court for interim relief", outlets: ["The Hindu"], t: "2026-11-18 12:02", story: "S1" }];
    const req = newsRequest("Open the Supreme Court news on Palikan.", {})!;
    expect(pickStory(rankStories(req, items, { places: ["Pallikaranai"] }), "en").pick?.id).toBe("en1");
    expect(pickStory(rankStories(req, items, { places: ["Pallikaranai"] }), "ta").pick?.id).toBe("ta1");
  });
  it("'Palikana' (Whisper's 'Pallikaranai marsh': 'Palikana Imash') still finds the marsh story", () => {
    const items: StoryItem[] = [{ id: "m", title: "Pallikaranai marsh construction ban: Madras HC asks litigants to approach Supreme Court", outlets: ["The Hindu"], t: "2026-11-18 12:02" },
      { id: "x", title: "Two arrested for assaulting traffic police constable", outlets: ["The Hindu"], t: "2026-11-18 11:00" }];
    const req = newsRequest("Read the Palikana Imash story.", {})!;
    expect(pickStory(rankStories(req, items, { places: ["Pallikaranai"] })).pick?.id).toBe("m");
  });
});

describe("review 9: the rollback covers Sonnet leading", () => {
  afterEach(() => { delete process.env.JARVIS_UNDERSTAND; delete process.env.JARVIS_CLAUDE_MODEL; });
  it("JARVIS_UNDERSTAND=v7: a Sonnet JARVIS_CLAUDE_MODEL does not lead (v7's rule: only Haiku leads)", async () => {
    const { ladder } = await import("../llm");
    const { Ledger, MemoryStore } = await import("../ledger");
    process.env.JARVIS_UNDERSTAND = "v7"; process.env.JARVIS_CLAUDE_MODEL = "claude-sonnet-5-5";
    expect(ladder(2000, new Ledger(new MemoryStore()), false, true, false)[0].provider).toBe("groq");
  });
});

void browserLaneV8;
