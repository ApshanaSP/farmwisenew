import { describe, expect, it } from "vitest";
import { allowedSet, figuresIn, gateChunk } from "./numbergate";
import { speakNumbers, spokenAllowed, spokenFigure } from "./numberwords";

describe("spoken figures: Indian grouping below a lakh, lakh and crore above", () => {
  it("English", () => {
    const cases: [number, string, number][] = [
      [7, "7", 7], [12.5, "12.5", 12.5], [999, "999", 999], [1204, "1,204", 1204], [45_230, "45,230", 45_230], [99_999, "99,999", 99_999],
      [100_000, "1 lakh", 100_000], [123_456, "1.2 lakh", 120_000], [250_000, "2.5 lakh", 250_000], [9_960_000, "99.6 lakh", 9_960_000],
      [9_996_000, "1 crore", 10_000_000], [25_000_000, "2.5 crore", 25_000_000], [123_456_789, "12.3 crore", 123_000_000], [12_340_000_000, "1,234 crore", 12_340_000_000]
    ];
    for (const [n, text, value] of cases) expect(spokenFigure(n, "en"), String(n)).toEqual({ text, value });
  });
  it("Tamil says lakh and crore in Tamil words", () => {
    expect(spokenFigure(123_456, "ta")).toEqual({ text: "1.2 லட்சம்", value: 120_000 });
    expect(spokenFigure(25_000_000, "ta")).toEqual({ text: "2.5 கோடி", value: 25_000_000 });
    expect(spokenFigure(45_230, "ta")).toEqual({ text: "45,230", value: 45_230 });
  });
  it("a fall keeps its sign", () => {
    expect(spokenFigure(-123_456, "en")).toEqual({ text: "-1.2 lakh", value: -120_000 });
  });
});

describe("the number gate accepts what the formatter says, once code hands it the spoken value", () => {
  it("reads every spoken form back as the value it says", () => {
    for (const lang of ["en", "ta"] as const)
      for (const n of [100_000, 123_456, 250_000, 9_960_000, 9_996_000, 25_000_000, 123_456_789, 12_340_000_000, 45_230, 1204]) {
        const f = spokenFigure(n, lang);
        const line = lang === "en" ? `This week ${f.text} complaints came in.` : `இந்த வாரம் ${f.text} புகார்கள் வந்தன.`;
        expect(figuresIn(line).map((x) => x.value), line).toEqual([f.value]);
        expect(gateChunk(line, spokenAllowed(allowedSet([n]), [f.value])).ok, line).toBe(true);
      }
  });
  it("a rounded form needs its spoken value: the exact figure alone does not pass it (callers add f.value; numbergate.ts is unchanged)", () => {
    const f = spokenFigure(123_456, "en");
    expect(gateChunk(`About ${f.text} people.`, allowedSet([123_456])).ok).toBe(false);
    expect(gateChunk(`About ${f.text} people.`, spokenAllowed(allowedSet([123_456]), [f.value])).ok).toBe(true);
  });
  it("property: 1,000 seeded figures, each read back as exactly one figure of the spoken value", () => {
    let seed = 1115;
    const rnd = (n: number) => { seed = (seed * 1664525 + 1013904223) % 2 ** 32; return seed % n; };
    for (let i = 0; i < 1000; i++) {
      const n = rnd(2) ? 100_000 + rnd(900_000_000) : 1000 + rnd(99_000);
      const lang = rnd(2) ? "en" : "ta";
      const f = spokenFigure(n, lang);
      const line = lang === "en" ? `Adyar has ${f.text} open today.` : `இன்று ${f.text} நிலுவையில்.`;
      expect(figuresIn(line).map((x) => x.value), line).toEqual([f.value]);
    }
  });
});

describe("speakNumbers: the grouped figures in a line, from a lakh up", () => {
  it("rewrites a grouped count and leaves the rest", () => {
    expect(speakNumbers("There are 1,23,456 complaints and 45,230 closed in 2026.", "en")).toEqual({ text: "There are 1.2 lakh complaints and 45,230 closed in 2026.", values: [120_000] });
    expect(speakNumbers("2,50,00,000 rupees", "ta")).toEqual({ text: "2.5 கோடி rupees", values: [25_000_000] });
  });
  it("never touches a PIN code, an id, a figure with its scale word, or a grouped figure glued to a word", () => {
    for (const t of ["Velachery 600042", "INC-1,23,456", "12 lakh people", "1,20,000 lakh", "1,23,456க்கும் மேல்", "40% full", "9840012345"]) expect(speakNumbers(t, "en").text, t).toBe(t);
  });
  it("the gate passes the rewritten line with the spoken values added", () => {
    const allowed = allowedSet([123_456, 45_230]);
    const s = speakNumbers("There are 1,23,456 complaints and 45,230 closed.", "en");
    expect(gateChunk(s.text, spokenAllowed(allowed, s.values)).ok).toBe(true);
  });
});
