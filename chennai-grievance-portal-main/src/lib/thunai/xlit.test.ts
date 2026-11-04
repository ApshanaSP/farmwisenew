import { describe, expect, it } from "vitest";
import { fuzzyNames, phonetic, romanise } from "./xlit";
import { ZONE_NAMES } from "./lexicon";
import { WORLD } from "./fixture";
import { zonesIn } from "./quick";

const ZN: [number, string][] = ZONE_NAMES.map((n, i) => [i + 1, n]);

describe("names across scripts and spellings", () => {
  it("romanises Tamil without touching it otherwise", () => {
    expect(romanise("அடையாறு")).toBe("ataiyaru");
    expect(romanise("மணலி")).toBe("manali");
    expect(romanise("பெருங்குடி")).toBe("perunkuti");
  });
  it("the key folds what spellings disagree on", () => {
    expect(phonetic("Ambathur")).toBe(phonetic("Ambattur"));
    expect(phonetic("Kodambakam")).toBe(phonetic("Kodambakkam"));
    expect(phonetic("Sholinganallur")).toBe(phonetic("Solinganalur"));
    expect(phonetic("பெருங்குடி")).toBe(phonetic("Perungudi"));
    expect(phonetic("மணலி")).toBe(phonetic("Manali"));
  });
  it("finds names in Latin spellings the lexicon does not list, and in transliterated Tamil", () => {
    expect(fuzzyNames("show the cases in Perungudy", ZN)).toEqual([14]);
    expect(fuzzyNames("Kodambaakkam la enna nadakkudhu", ZN)).toEqual([10]);
    expect(fuzzyNames("வளசரவாக்கத்தில்", ZN)).toEqual([]); // an inflected form is left to the lexicon and the model
    expect(fuzzyNames("மணலி நிலவரம்", ZN)).toEqual([2]);
    expect(fuzzyNames("Velachery la thanni", [[13, "Velachery"]])).toEqual([13]);
  });
  it("does not find a name inside other words", () => {
    expect(fuzzyNames("the manager called about the market", ZN)).toEqual([]);
    expect(fuzzyNames("show me the alarm on the road", ZN)).toEqual([]);
  });
  it("zonesIn falls back to it", () => {
    expect(zonesIn(" severe cases in perungudy ", WORLD)).toEqual([14]);
    expect(zonesIn(" adyar and perungudi ", WORLD)).toEqual([13, 14]);
  });
});
