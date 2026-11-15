// v5 F1: no digit reaches any voice. Every spoken chunk has its numbers said in words by code, in the sentence's language, after the
// number gate has passed it. Invented sentences only.
import { describe, expect, it } from "vitest";
import { allowedSet, figuresIn, gateChunk } from "./numbergate";
import * as nw from "./numberwords";

const DIGIT = /\p{N}/u;
const aloud = (t: string, l: "en" | "ta") => nw.aloud(t, l).text;

/** English number words read back to their value (the test's own reader, not the code under test) */
const EN: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90
};
function readEn(s: string): number {
  let total = 0, cur = 0;
  for (const w of s.replace(/-/g, " ").split(/\s+/).filter(Boolean)) {
    if (w === "and") continue;
    if (Object.hasOwn(EN, w)) cur += EN[w];
    else if (w === "hundred") cur *= 100;
    else if (w === "thousand") { total += cur * 1000; cur = 0; }
    else if (w === "lakh") { total += cur * 100_000; cur = 0; }
    else if (w === "crore") { total = (total + cur) * 10_000_000; cur = 0; }
    else throw new Error(`not a number word: ${w}`);
  }
  return total + cur;
}
/**
 * Tamil number words read back by the number gate's own Tamil reader (numbergate.ts, written in v4, before this code), word by word, with
 * lakh and crore as multipliers. "ஒன்று"/"ஒரு" (one) is left out of the gate on purpose, and "-ோராயிரம்" (…one thousand) is put as
 * "-ொன்றாயிரம்" for it.
 */
function readTa(s: string): number {
  let total = 0, cur = 0;
  for (const w0 of s.split(/\s+/).filter(Boolean)) {
    const w = w0.replace(/ோராயிர/u, "ொன்றாயிர");
    if (w === "பூஜ்ஜியம்") continue;
    if (w === "ஒரு" || w === "ஒன்று") { cur += 1; continue; }
    if (/^கோடி/u.test(w)) { total = (total + (cur || 1)) * 10_000_000; cur = 0; continue; }
    if (/^லட்ச/u.test(w)) { total += (cur || 1) * 100_000; cur = 0; continue; }
    const f = figuresIn(w);
    if (f.length !== 1) throw new Error(`not one number word: ${w}`);
    cur += f[0].value;
  }
  return total + cur;
}

describe("F1: a whole number in words, English and Tamil", () => {
  it("English, Indian scale", () => {
    const cases: [number, string][] = [
      [0, "zero"], [7, "seven"], [13, "thirteen"], [47, "forty-seven"], [100, "one hundred"], [230, "two hundred and thirty"], [1000, "one thousand"],
      [1204, "one thousand two hundred and four"], [45_230, "forty-five thousand two hundred and thirty"], [100_000, "one lakh"],
      [120_000, "one lakh twenty thousand"], [25_000_000, "two crore fifty lakh"], [12_340_000_000, "one thousand two hundred and thirty-four crore"]
    ];
    for (const [n, w] of cases) expect(nw.numberInWords(n, "en"), String(n)).toBe(w);
  });
  it("Tamil (model-drafted words, not checked by a Tamil speaker)", () => {
    const cases: [number, string][] = [
      [0, "பூஜ்ஜியம்"], [1, "ஒன்று"], [3, "மூன்று"], [10, "பத்து"], [11, "பதினொன்று"], [19, "பத்தொன்பது"], [21, "இருபத்தொன்று"], [22, "இருபத்திரண்டு"],
      [23, "இருபத்துமூன்று"], [47, "நாற்பத்தேழு"], [90, "தொண்ணூறு"], [99, "தொண்ணூற்றொன்பது"], [100, "நூறு"], [230, "இருநூற்று முப்பது"], [900, "தொள்ளாயிரம்"],
      [1000, "ஆயிரம்"], [1204, "ஆயிரத்து இருநூற்று நான்கு"], [2026, "இரண்டாயிரத்து இருபத்தாறு"], [11_000, "பதினோராயிரம்"], [21_000, "இருபத்தோராயிரம்"],
      [45_230, "நாற்பத்தைந்தாயிரத்து இருநூற்று முப்பது"], [100_000, "ஒரு லட்சம்"], [120_000, "ஒரு லட்சத்து இருபதாயிரம்"], [25_000_000, "இரண்டு கோடியே ஐம்பது லட்சம்"]
    ];
    for (const [n, w] of cases) expect(nw.numberInWords(n, "ta"), String(n)).toBe(w);
  });
  it("property: 2,000 seeded whole numbers, each in words with no digit, read back to the same value (English and Tamil)", () => {
    let seed = 1511;
    const rnd = (n: number) => { seed = (seed * 1664525 + 1013904223) % 2 ** 32; return seed % n; };
    for (let i = 0; i < 2000; i++) {
      const n = [rnd(100), rnd(1000), rnd(100_000), rnd(10_000_000), rnd(2 ** 31)][i % 5];
      for (const l of ["en", "ta"] as const) {
        const w = nw.numberInWords(n, l);
        expect(w, `${n} ${l}`).not.toMatch(DIGIT);
        expect(l === "en" ? readEn(w) : readTa(w), `${n} ${l}: ${w}`).toBe(n);
      }
    }
  });
});

describe("F1: a spoken chunk with every number in words", () => {
  it("English: counts, decimals, lakh and crore kept as words, percent, ordinals, times, ranges, a fall", () => {
    const cases: [string, string][] = [
      ["There are 47 severe cases in 3 zones.", "There are forty-seven severe cases in three zones."],
      ["There are 1.2 lakh complaints this month.", "There are one point two lakh complaints this month."],
      ["The total is 2.5 crore.", "The total is two point five crore."],
      ["45,230 were closed.", "forty-five thousand two hundred and thirty were closed."],
      ["Rain was 12.5 mm.", "Rain was twelve point five mm."],
      ["The lake is 45% full.", "The lake is forty-five percent full."],
      ["Adyar is 3rd and Guindy is 21st.", "Adyar is third and Guindy is twenty-first."],
      ["The crew left at 10:30 and came back at 9:05.", "The crew left at ten thirty and came back at nine oh five."],
      ["The meeting is at 10:00.", "The meeting is at ten o'clock."],
      ["Between 10-20 trees fell.", "Between ten to twenty trees fell."],
      ["It changed by -3 today.", "It changed by minus three today."],
      ["Zone 13 has 4 open cases.", "Zone thirteen has four open cases."],
      ["The road is 5km long.", "The road is five km long."],
      ["About 10k people.", "About ten thousand people."]
    ];
    for (const [t, w] of cases) {
      expect(aloud(t, "en"), t).toBe(w);
      expect(aloud(t, "en"), t).not.toMatch(DIGIT);
    }
  });
  it("English: a code, a PIN code and a leading zero are read digit by digit; a short code's number in words", () => {
    expect(aloud("Case INC-2026-004 is open.", "en")).toBe("Case INC-two zero two six-zero zero four is open.");
    expect(aloud("Velachery 600042.", "en")).toBe("Velachery six zero zero zero four two.");
    expect(aloud("Covid-19 and PM2.5 readings.", "en")).toBe("Covid-nineteen and PM two point five readings.");
    expect(aloud("Ward 007.", "en")).toBe("Ward zero zero seven.");
  });
  it("Tamil: counts, lakh, percent, ordinals, a case ending on the number, ranges; Tamil digits and the Tamil sign for ten", () => {
    const cases: [string, string][] = [
      ["இன்று 47 புகார்கள் வந்தன.", "இன்று நாற்பத்தேழு புகார்கள் வந்தன."],
      ["இந்த மாதம் 1.2 லட்சம் புகார்கள் வந்தன.", "இந்த மாதம் ஒன்று புள்ளி இரண்டு லட்சம் புகார்கள் வந்தன."],
      ["மொத்தம் 1 லட்சம் பேர்.", "மொத்தம் ஒரு லட்சம் பேர்."],
      ["45,230 புகார்கள் முடிந்தன.", "நாற்பத்தைந்தாயிரத்து இருநூற்று முப்பது புகார்கள் முடிந்தன."],
      ["ஏரி 45% நிரம்பியுள்ளது.", "ஏரி நாற்பத்தைந்து சதவீதம் நிரம்பியுள்ளது."],
      ["அடையாறு 3வது இடம்.", "அடையாறு மூன்றாவது இடம்."],
      ["500க்கும் மேல் புகார்கள்.", "ஐந்நூறுக்கும் மேல் புகார்கள்."],
      ["10-20 மரங்கள் விழுந்தன.", "பத்து முதல் இருபது வரை மரங்கள் விழுந்தன."],
      ["இன்று ௪௭ புகார்கள்.", "இன்று நாற்பத்தேழு புகார்கள்."],
      ["௰ மண்டலங்கள்.", "பத்து மண்டலங்கள்."]
    ];
    for (const [t, w] of cases) {
      expect(aloud(t, "ta"), t).toBe(w);
      expect(aloud(t, "ta"), t).not.toMatch(DIGIT);
    }
  });
  it("a chunk that holds no number is handed back as it is", () => {
    for (const t of ["The list is on screen.", "பட்டியல் திரையில் உள்ளது.", "One moment."]) expect(nw.aloud(t, "en")).toEqual({ text: t, spans: [] });
  });
  it("a number sign it cannot say (a fraction, a Roman numeral) is left in place, so the voice refuses the chunk", () => {
    for (const t of ["About ½ of it.", "Chapter Ⅻ."]) expect(nw.holdsDigit(aloud(t, "en")), t).toBe(true);
    expect(nw.holdsDigit("The list is on screen.")).toBe(false);
    expect(nw.holdsDigit("இன்று ௪௭")).toBe(true);
  });
  it("the gate passes the chunk in digits, and what the voice gets has no digit and says the same value", () => {
    const chunks: [string, number[], "en" | "ta", number][] = [
      ["There are 47 severe cases.", [47], "en", 47],
      ["45,230 were closed this week.", [45_230], "en", 45_230],
      ["இன்று 47 புகார்கள் வந்தன.", [47], "ta", 47],
      ["45,230 புகார்கள் முடிந்தன.", [45_230], "ta", 45_230]
    ];
    for (const [t, vals, l, n] of chunks) {
      expect(gateChunk(t, allowedSet(vals)).ok, t).toBe(true);
      const said = aloud(t, l);
      expect(said, t).not.toMatch(DIGIT);
      expect(said, t).toContain(nw.numberInWords(n, l));
    }
  });
});

describe("F1: the sentence's language, and where a word the voice is saying sits in the text as shown", () => {
  it("Tamil letters make a Tamil sentence; Latin letters an English one; neither keeps the answer's language", () => {
    expect(nw.sentenceLang("இன்று 47 புகார்கள்", "en")).toBe("ta");
    expect(nw.sentenceLang("Adyar has 47 open.", "ta")).toBe("en");
    expect(nw.sentenceLang("47.", "ta")).toBe("ta");
  });
  it("a place in the words said maps back to the same place in the text shown (inside a number: its start)", () => {
    const shown = "There are 47 severe cases, 1.2 lakh in all.";
    const a = nw.aloud(shown, "en");
    expect(a.text).toBe("There are forty-seven severe cases, one point two lakh in all.");
    expect(nw.shownIndex(a, a.text.indexOf("severe"))).toBe(shown.indexOf("severe"));
    expect(nw.shownIndex(a, a.text.indexOf("seven"))).toBe(shown.indexOf("47"));
    expect(nw.shownIndex(a, a.text.indexOf("lakh"))).toBe(shown.indexOf("lakh"));
    expect(nw.shownIndex(a, 0)).toBe(0);
  });
});
