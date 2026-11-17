/**
 * v6: a Tamil answer's first chunk is short. Edge's online Tamil voice takes longer to start the longer the utterance (eval/v6/latency/
 * voiceprobe.json, fresh text, warm: 33 characters 811 ms, 109 characters 2,159 ms, 236 characters 2,833-3,030 ms; English 185-564 ms
 * at any length), and the v6c run's Tamil answers began 2.6-3.1 s after they were handed to the voice. The first chunk is cut at a comma
 * or a space by FIRST_MAX_TA; the rest are as before. English is unchanged.
 */
import { describe, expect, it } from "vitest";
import { chunks, FIRST_MAX_TA } from "./chunker";

const TA = "ராயபுரத்துல கடந்த இருபத்து நான்கு மணி நேரத்தில் ஐந்து கடுமையான சம்பவங்கள், அதில் மூன்று காலக்கெடு தாண்டியவை. சுகாதாரச் சேவைகள் பற்றிய புகார்கள் அதிகம்.";
const EN = "In Royapuram, five severe incidents in the last twenty-four hours, three of them past their deadline. Health services have the most complaints.";

describe("v6: a Tamil answer starts with a short chunk", () => {
  it("the first Tamil chunk is at most FIRST_MAX_TA characters, cut at a comma or a space, and nothing is lost", () => {
    const c = chunks(TA, { lang: "ta" });
    expect(c[0].length).toBeLessThanOrEqual(FIRST_MAX_TA);
    expect(c[0].length).toBeGreaterThanOrEqual(20);
    expect(c.join(" ").replace(/\s+/g, " ")).toBe(TA.replace(/\s+/g, " "));
    expect(c[1].startsWith(" ")).toBe(false);
  });
  it("English, and Tamil with no language given, are cut as before", () => {
    expect(chunks(EN, { lang: "en" })).toEqual(chunks(EN));
    expect(chunks(TA)[0].length).toBeGreaterThan(FIRST_MAX_TA);
  });
  it("a short Tamil answer stays whole", () => {
    expect(chunks("ராயபுரம் இப்போது அமைதியாக இருக்கிறது.", { lang: "ta" })).toEqual(["ராயபுரம் இப்போது அமைதியாக இருக்கிறது."]);
  });
});
