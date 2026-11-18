import { afterEach, describe, expect, it } from "vitest";
import { choose } from "./stt";

// The owner's example 4 at the ears: with the console set to Tamil, the race leaned +0.1 to the Tamil decode, so English speech that the
// forced-Tamil decode translated (v6 measured the English decode the surer by 0.01-0.29 on all 10 such sentences) could still come back as
// Tamil. v8: two decodes that are translations of each other (different shapes) are weighed by their own confidence alone; the lean stays
// only for the same sounds written in two scripts (Tanglish).
const dec = (lang: "en" | "ta", text: string, logprob: number) =>
  ({ lang, model: lang === "ta" ? "whisper-large-v3" : "whisper-large-v3-turbo", text, segments: [{ avg_logprob: logprob, no_speech_prob: 0.02, compression_ratio: 1.3 }] });

describe("v8: English speech on a Tamil console stays English", () => {
  afterEach(() => { delete process.env.JARVIS_UNDERSTAND; });
  it("the English decode, surer by less than the lean, wins over its Tamil translation", () => {
    expect(choose([dec("ta", "அடையாறில் உள்ள கடுமையான வழக்குகளைக் காட்டுங்கள்.", -0.30), dec("en", "Show me the severe cases in Adyar.", -0.25)], "ta")?.lang).toBe("en");
    expect(choose([dec("ta", "இன்று அடையாறில் மோசமானது என்ன?", -0.32), dec("en", "What's worst in Adyar today?", -0.24)], "ta")?.lang).toBe("en");
  });
  it("Tamil speech (the Tamil decode the surer) stays Tamil", () => {
    expect(choose([dec("ta", "அடையாறுல இன்னைக்கு எது ரொம்ப மோசமா இருக்கு?", -0.08), dec("en", "What is the worst in Adyar today?", -0.16)], "ta")?.lang).toBe("ta");
  });
  it("JARVIS_UNDERSTAND=v7 keeps the lean", () => {
    process.env.JARVIS_UNDERSTAND = "v7";
    expect(choose([dec("ta", "அடையாறில் உள்ள கடுமையான வழக்குகளைக் காட்டுங்கள்.", -0.30), dec("en", "Show me the severe cases in Adyar.", -0.25)], "ta")?.lang).toBe("ta");
  });
});
