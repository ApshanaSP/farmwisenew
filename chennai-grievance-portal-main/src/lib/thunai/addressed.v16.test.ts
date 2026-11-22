/**
 * v16 (22 Nov), the address gate and the self-hearing guard on the owner's sessions of 21-22 Nov (telemetry "ignored": "side" 01:43:40 and
 * 01:44:15, "unaddressed" 01:49:18 and 01:49:31, "self-heard" 01:50:48, all Tamil, all engaged). The lines are invented in the owner's way of
 * speaking (Sarvam's codemix: Tamil words in Tamil script, English words in Latin letters).
 *   - Tamil's I, you, my, your (நான், நீங்க, என், உங்க) are side talk only outside the conversation, or in it when the line is no question and no
 *     request, as SIDE_WEAK is for English; the words about other people stay side talk always.
 *   - "<English verb> பண்ணு" and the other common Tamil commands are a request's shape; so are எந்த ("which"), எவ்ளோ, எத்தன and a yes-or-no
 *     question's ending (இருக்கா).
 *   - Jarvis's own voice heard back comes back in Jarvis's order: a re-asked question that shares its words with the answer is the Collector's.
 */
import { describe, expect, it } from "vitest";
import { addressed, pairOverlap, selfHeard } from "./addressed";

const now = 1_000_000;
const engaged = (text: string, sec = 8) => addressed({ text, lastTurnAt: now - sec * 1000, now, rulesSure: false, districtNoun: false });
const cold = (text: string) => addressed({ text, lastTurnAt: null, now, rulesSure: false, districtNoun: false });

describe("v16: the owner's Tamil questions in the conversation are for Jarvis", () => {
  it.each([
    "இப்போ நான் எந்த area-ல ரொம்ப concentrate பண்ணனும்? எந்த area-ல நிறைய cases இருக்கு?",
    "நான் எந்த area-ல concentrate பண்ணனும்?",
    "நீங்க சொல்லுங்க எந்த area worst",
    "அடையார்ல இருக்கிற incidents எல்லாம் compare பண்ணு",
    "இந்த news-அ close பண்ணு",
    "அந்த flood இருக்கிற road-எல்லாம் map-ல காண்பிங்க",
    "எந்த area-ல நிறைய cases இருக்கு",
    "Adyar zone-ல இன்னைக்கு flood ஏதாவது இருக்கா",
    "இந்த வாரம் எவ்ளோ complaints வந்திருக்கு Adyar-ல",
    "Adyar map-ல அந்த lake area zoom pannunga",
    "Trends page-ல weekly view-க்கு போ"
  ])("'%s' (8 s after Jarvis spoke) is acted on", (said) => {
    const g = engaged(said);
    expect(`${g.act} ${g.why}`).toBe("true engaged");
  });
});

describe("v16: side talk stays side talk", () => {
  it.each([
    ["நான் அப்புறம் பாக்குறேன்", "side"],
    ["நீ சாப்பிட்டியா?", "side"],
    ["அவங்க நாளைக்கு வருவாங்க", "side"],
    ["நாம lunch-க்கு போலாமா?", "side"],
    ["ஏங்க, காபி வேணுமா?", "title"],
    ["அடையார் ரிப்போர்ட் காட்டுங்கன்னு சொன்னார்", "side"]
  ])("'%s' in the conversation is not for Jarvis (%s)", (said, why) => {
    const g = engaged(said);
    expect(g.act).toBe(false);
    expect(g.why).toBe(why);
  });
  it.each(["நான் எந்த area-ல concentrate பண்ணனும்?", "நீங்க சொல்லுங்க எந்த area worst", "நான் அப்புறம் பாக்குறேன்"])(
    "'%s' with Jarvis not in the conversation is side talk, as before", (said) => {
      expect(cold(said)).toMatchObject({ act: false, why: "side" });
    });
});

describe("v16: the self-hearing guard keeps Jarvis's own voice out, not the Collector's question", () => {
  const SAYING = "திரும்பத் திரும்ப பிரச்சனை வரும் road இதுதான். அண்ணா சாலை-ல பிரச்சனை அதிகம்.";
  it("Jarvis's voice heard back, word for word or with a word misheard: Jarvis's own", () => {
    expect(selfHeard("திரும்பத் திரும்ப பிரச்சனை வரும் road இதுதான்", SAYING)).toBe(true);
    expect(selfHeard("திரும்பத் திரும்ப பிரச்சனை வரும் ரோடு இதுதான்", SAYING)).toBe(true);
    expect(selfHeard("The severe cases are on the screen.", "The severe cases are on the screen now, in four zones.")).toBe(true);
  });
  it("the same question asked again over an answer that repeats its words: the Collector's (it was 'self-heard' before v16)", () => {
    const asked = "திரும்பத் திரும்ப பிரச்சனை வர்ற road எது";
    // most of its words are in the answer, so the plain share alone took it for Jarvis's voice
    expect(pairOverlap(asked, SAYING)).toBeLessThan(0.5);
    expect(selfHeard(asked, SAYING)).toBe(false);
    expect(selfHeard("again and again which road has the problem", "The road with the problem again and again is Anna Salai.")).toBe(false);
    // (the limit: a re-ask that keeps a long run of the answer's own words in its order still reads as Jarvis's voice)
    expect(selfHeard("which road has the problem again and again", "The road with the problem again and again is Anna Salai.")).toBe(true);
  });
  it("a short line keeps the plain rule, and nothing is self-heard when Jarvis is silent", () => {
    expect(selfHeard("Anna Salai", SAYING.replace("அண்ணா சாலை", "Anna Salai"))).toBe(true);
    expect(selfHeard("anything at all here", null)).toBe(false);
  });
});
