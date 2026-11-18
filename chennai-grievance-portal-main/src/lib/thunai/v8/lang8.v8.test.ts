import { describe, expect, it } from "vitest";
import { replyLang8, wordsLang } from "./lang8";

// the owner's example 4: spoken English came back in Tamil. The reply's language is the language of the Collector's own words on this turn.
const NAMES = new Set(["adyar", "royapuram", "teynampet", "anna", "nagar", "pallikaranai", "kasimedu", "அடையாறு", "ராயபுரம்"]);
const isName = (w: string) => NAMES.has(w.toLowerCase());
const lang = (t: string, last: "en" | "ta" | null = null) => replyLang8(t, { isName, last });

describe("v8 language: the Collector's own words decide", () => {
  const en = ["Show me the severe cases in Adyar.", "What's happening in Royapuram?", "Open the news.", "Show Adyar.", "Adyar status", "Which department is the slowest?",
    "Compare Adyar and Anna Nagar.", "Tell me about the Adyar issue.", "what about Adyar?", "show me the list, seri", "Open the Supreme Court news on Palikan.",
    "Open the health department and rotary club of Madras partner to take forward HPVC. வாக்சினேசன். And that news."];
  for (const t of en) it(`English: ${t}`, () => expect(lang(t, "ta")).toBe("en"));
  const ta = ["Adyar la enna problem?", "severe cases kaattunga", "show pannunga", "Adyar status enna", "Adyar-ku enna aachu", "what is the status, sollunga", "zone 13 la",
    "naalaikku rain forecast", "Ambattur kuppai", "அடையாறு நிலவரம் என்ன?", "ராயபுரம் நிலவரம் எப்படி இருக்கு?", "Supreme Court news open pannunga.", "rendavadhu news ah padinga",
    "Teynampet la enna nadakkudhu?", "Kasimedu harbour news pathi sollunga"];
  for (const t of ta) it(`Tamil: ${t}`, () => expect(lang(t, "en")).toBe("ta"));
  it("no language in it: the last language the Collector used, else English", () => {
    expect(wordsLang("Adyar", { isName })).toBeNull();
    expect(lang("Adyar", "ta")).toBe("ta");
    expect(lang("Adyar")).toBe("en");
    expect(lang("seri", "ta")).toBe("ta");
  });
  it("whatever the speech-to-text called it: the words are English", () => expect(lang("Show me the severe cases in Adyar.", "ta")).toBe("en"));
});
