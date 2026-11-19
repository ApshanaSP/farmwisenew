/**
 * v10 (docs/jarvis/JARVIS_V10.md Part 8, RESULTS v9 "Where v9 still misses" 1): "நியூஸ்" is the Tamil-script "news" Whisper writes, and it was
 * no news word: "புழல் ஜெயில் நியூஸ் படிங்க" made no news request at all (six of v9's blind Tamil requests). The other loanwords a Tamil speaker
 * says for the press too (ஆர்டிகிள், ஹெட்லைன், ஸ்டோரி, ரிப்போர்ட், பேப்பர்). Failing first on v9's news8.ts.
 */
import { describe, expect, it } from "vitest";
import { newsRequest, pickStory, rankStories, topicWords } from "../v8/news8";

const stories = [
  { id: "a", title: "Bid to smuggle drugs into Puzhal jail, two held" },
  { id: "b", title: "Cyclone Akvan to cross Odisha coast tomorrow; rain likely in Chennai on November 23, 24" },
  { id: "c", title: "CHENNAI: RESIDENTS STAGE EMPTY-POT PROTEST OVER FOUR-MONTH WATER SHORTAGE IN KODUNGAIYUR" },
  { id: "d", title: "Health Department and Rotary Club of Madras partner to take forward HPV vaccination" }
];
const pick = (said: string) => {
  const r = newsRequest(said);
  return r ? pickStory(rankStories(r, stories)).pick?.id ?? null : null;
};

describe("v10: the Tamil-script loanwords for the news are news words", () => {
  it.each([
    ["புழல் ஜெயில் நியூஸ் படிங்க", "a"],
    ["புழல் ஜெயில் நியூஸை படிங்க", "a"],
    ["கொடுங்கையூர் போராட்டம் நியூஸ் காட்டுங்க", "c"],
    ["அக்வான் புயல் நியூஸ் சொல்லுங்க", "b"],
    ["HPV தடுப்பூசி நியூஸ்ஸ படிங்க", "d"]
  ])("%s -> a story request that finds %s", (said, id) => {
    expect(newsRequest(said)).not.toBeNull();
    expect(pick(said)).toBe(id);
  });

  it("the loanword is no topic word itself", () => {
    expect(topicWords("புழல் ஜெயில் நியூஸ் படிங்க", null)).not.toContain("niyus");
    expect(topicWords("புழல் ஜெயில் நியூஸ்ல என்ன இருக்கு", null)).not.toContain("niyusla");
  });

  it.each([
    ["மழை பத்தி என்ன நியூஸ் இருக்கு?"],
    ["புயல் பத்தி ஏதாவது நியூஸ் இருக்கா"],
    ["கொடுங்கையூர் பத்தி நியூஸ்ல என்ன வந்திருக்கு"]
  ])("a Tamil news question with நியூஸ்: %s", (said) => {
    const r = newsRequest(said);
    expect(r).not.toBeNull();
    expect(r?.kind).toBe("ask");
  });

  it.each([["ஹெட்லைன்ஸ் படிங்க"], ["நியூஸ் படிங்க"], ["நியூஸ் பேனல் திறங்க"]])("the news with no topic is no story request: %s", (said) => {
    expect(newsRequest(said)).toBeNull();
  });
});

describe("v10: a long English word is never matched by its consonants alone (the real store, 19 Nov)", () => {
  it("'volcano' is not வழக்கின் (of the case): both are v-l-k-n", () => {
    const items = [{ id: "per", title: "பெரியார் அறிவுலக ஊழல்! திமுக வழக்கின் விசாரணை ஒத்திவைப்பு!", titleEn: "Periyar World corruption! DMK case hearing adjourned!", place: "Chennai" }];
    const r = newsRequest("Is there any news about a volcano in Chennai?")!;
    const ranked = rankStories(r, items);
    expect(ranked[0].hits).toBeLessThan(2);
    expect(pickStory(ranked, "en").pick).toBeNull();
  });
  it("a by-ear form still is ('suprim' for Supreme), and a short word across scripts ('court' for கோர்ட்)", () => {
    expect(pickStory(rankStories(newsRequest("open the suprim court news")!, [{ id: "sc", title: "Supreme Court stays the construction ban" }])).pick?.id).toBe("sc");
    expect(rankStories(newsRequest("court news padinga")!, [{ id: "k", title: "கோர்ட் உத்தரவு: கட்டுமானத் தடை" }])[0].hits).toBeGreaterThan(0);
  });
});

describe("v10: two stories as close, the one in the request's language", () => {
  it("an English request about Cyclone Akvan reads an English report when a Tamil one scores as close (the dry replay, 19 Nov)", () => {
    const items = [
      { id: "ta1", title: "அக்வான் புயல் எதிரொலி திருவொற்றியூர், எண்ணூரில் கடல் சீற்றம்", titleEn: "Akvan cyclone effect: rough sea at Thiruvottiyur, Ennore", t: "2026-11-19 12:00" },
      { id: "en1", title: "Cyclone Akvan to cross Odisha coast tomorrow; rain likely in Chennai on November 23, 24", t: "2026-11-19 11:36" }
    ];
    const r = newsRequest("tell me the news about cyclone akvan");
    expect(r).not.toBeNull();
    expect(pickStory(rankStories(r!, items), "en").pick?.id).toBe("en1");
    expect(pickStory(rankStories(newsRequest("அக்வான் புயல் செய்தி படிங்க")!, items), "ta").pick?.id).toBe("ta1");
  });
});
