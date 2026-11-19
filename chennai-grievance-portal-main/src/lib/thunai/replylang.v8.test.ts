import { afterEach, describe, expect, it } from "vitest";
import { replyLang } from "./round";

// the owner's example 4: spoken English answered in Tamil. The ears' label said Tamil; the words are English.
const ta = { lang: "ta" as const, conf: 0.9, source: "whisper" as const };
const en = { lang: "en" as const, conf: 0.9, source: "whisper" as const };

describe("v8: the reply's language is the Collector's words' language, whatever the ears' label", () => {
  afterEach(() => { delete process.env.JARVIS_UNDERSTAND; });
  for (const t of ["Show Adyar.", "Compare Adyar and Anna Nagar.", "Adyar status", "Show me the severe cases in Adyar.", "Open the news."]) {
    it(`English heard as Tamil: ${t}`, () => expect(replyLang(t, ta)).toBe("en"));
  }
  for (const t of ["Adyar la enna problem?", "severe cases kaattunga", "Teynampet la enna nadakkudhu?"]) {
    it(`Tanglish heard as English: ${t}`, () => expect(replyLang(t, en)).toBe("ta"));
  }
  it("Tamil script is Tamil", () => expect(replyLang("அடையாறு நிலவரம் என்ன?", en)).toBe("ta"));
  it("a place name alone: the Collector's last language that had one", () => {
    expect(replyLang("Adyar?", ta, ["Adyar la enna problem?"])).toBe("ta");
    expect(replyLang("Adyar?", ta, ["Show me the severe cases"])).toBe("en");
    expect(replyLang("Adyar?", ta)).toBe("en");
  });
  it("JARVIS_UNDERSTAND=v7 keeps v7's rule (the label decides a sentence with one English word)", () => {
    process.env.JARVIS_UNDERSTAND = "v7";
    expect(replyLang("Show Adyar.", ta)).toBe("ta");
  });
});
