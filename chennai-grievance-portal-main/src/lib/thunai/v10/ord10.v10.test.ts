/**
 * v10 (docs/jarvis/JARVIS_V10.md 4.3, "Compound ordinals"): v9's blind set read "irubathi rendavadhu" (22nd) as the 2nd and "irubathi
 * naalavadhu" (24th) as the 4th: a wrong story read, the worst kind of miss. Read the tens, or name no position; never the last part alone.
 * Also the teens and the twentieth said as one word ("pathinettavadhu", "இருபதாவது"), which v9 left to the planner.
 */
import { describe, expect, it } from "vitest";
import { ordinalOf } from "../v8/ord8";
import { newsOrdinal8 } from "../v8/refs8";

const panel = Array.from({ length: 28 }, (_, i) => ({ id: `s${i + 1}` }));

describe("v10: compound ordinals are read whole, never by their last part", () => {
  it.each([
    ["irubathi rendavadhu news ah padinga", 22],
    ["irubathi naalavadhu news open pannunga", 24],
    ["irubatthu onnaavadhu news padinga", 21],
    ["இருபத்தி இரண்டாவது செய்தியைத் திறங்க", 22],
    ["இருபத்திரண்டாவது செய்தியைப் படிங்க", 22],
    ["இருபத்தொன்றாவது செய்தியைத் திறங்க", 21],
    ["இருபத்துநான்காவது செய்தி படிங்க", 24],
    ["open the twenty second news", 22],
    ["read the twenty-fourth story", 24]
  ])("%s -> %i", (said, n) => {
    expect(ordinalOf(said)).toBe(n);
    expect(newsOrdinal8(said, panel, { panel: true })).toBe(`s${n}`);
  });

  it.each([
    ["pathinettavadhu news padinga", 18],
    ["padhimoonaavadhu news open pannunga", 13],
    ["பதினெட்டாவது செய்தியைத் திறங்க", 18],
    ["இருபதாவது செய்தியைப் படிங்க", 20],
    ["irubathavadhu news padinga", 20],
    ["பத்தொன்பதாவது செய்தி படிங்க", 19]
  ])("a teen or a twentieth said as one word: %s -> %i", (said, n) => {
    expect(ordinalOf(said)).toBe(n);
    expect(newsOrdinal8(said, panel, { panel: true })).toBe(`s${n}`);
  });

  it("a position past the list's end opens nothing (never the last part's story)", () => {
    expect(newsOrdinal8("irubathi rendavadhu news ah padinga", panel.slice(0, 20), { panel: true })).toBeNull();
    expect(newsOrdinal8("இருபத்தி இரண்டாவது செய்தியைத் திறங்க", panel.slice(0, 20), { panel: true })).toBeNull();
  });

  it("the units alone keep their meaning, and a count is no position", () => {
    expect(ordinalOf("rendavadhu news ah padinga")).toBe(2);
    expect(ordinalOf("இரண்டாவது செய்தியைத் திறங்க")).toBe(2);
    expect(ordinalOf("irubathu rendu news irukku")).toBeNull();
    expect(ordinalOf("twenty two complaints in Adyar")).toBeNull();
  });
});

describe("v10 dev2: dA-screenRef-6, a position counted from the end ('கடைசிக்கு முந்தின', 'the second last', 'last but one')", () => {
  const thirteen = panel.slice(0, 13);
  it.each([
    ["கடைசிக்கு முந்தின ஸ்டோரி என்ன?", 12],
    ["கடைசிக்கு முந்தைய செய்தியைப் படிங்க", 12],
    ["kadaisikku munnaadi news-a padinga", 12],
    ["read the second last story", 12],
    ["open the last but one", 12],
    ["what's the second to last news about", 12],
    ["கடைசியிலிருந்து மூன்றாவது செய்தியைத் திறங்க", 11],
    ["open the third from last story", 11]
  ])("%s -> the story %i of 13", (said, n) => {
    expect(newsOrdinal8(said, thirteen, { panel: true })).toBe(`s${n}`);
  });
  it("the last stays the last, and 'last but not least' is no position of its own", () => {
    expect(newsOrdinal8("what's the last one about", thirteen, { panel: true })).toBe("s13");
    expect(newsOrdinal8("last but not least, read the first news", thirteen, { panel: true })).toBe("s1");
    expect(ordinalOf("the last week's news")).toBeNull();
  });
  it("a position from the end past the list's start opens nothing", () => {
    expect(newsOrdinal8("open the fifth from last story", thirteen.slice(0, 3), { panel: true })).toBeNull();
  });
});

describe("v10 dev2: dA-screenRef-5, the English verb in Tamil letters opens a story by its position too", () => {
  it.each([["மூணாவது நியூஸ ஓபன் பண்ணு", 3], ["எட்டாவது ஸ்டோரிய ரீட் பண்ணுங்க", 8], ["கடைசி நியூஸ ஓப்பன் பண்ணுங்க", 13]])("%s -> %i", (said, n) => {
    expect(newsOrdinal8(said, panel.slice(0, 13), { panel: true })).toBe(`s${n}`);
  });
});
