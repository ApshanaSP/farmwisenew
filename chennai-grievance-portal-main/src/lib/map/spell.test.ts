import { describe, expect, it } from "vitest";
import { fixesLine, makeSpeller, soundKey, tamilKey } from "./spell";
import { mapVocabulary, mapVocabularyTa } from "./route";

const EN = new Set(["show", "me", "the", "near", "and", "in", "real", "what", "is", "happening", "government", "anna", "half", "word", "words", "complaining", "flooded", "review", "slowest", "of"]);
const spell = makeSpeller({
  words: mapVocabulary(), extra: ["scool"],
  places: ["Adyar", "Adayar", "Velachery", "Velachery Lake", "Mylapore", "Nungambakkam", "T. Nagar", "Anna Nagar", "Anna Salai", "Egmore", "Guindy", "Pallikaranai", "Pallikarani Marsh", "Government Hospital"],
  areas: ["Adyar", "Anna Nagar", "Mylapore"],
  isKnown: (w) => EN.has(w),
  soft: (w) => w === "velacheri",
  tamil: [...mapVocabularyTa(), "அடையாறு", "மயிலாப்பூர்", "வேளச்சேரி"]
});
const read = (q: string) => spell(q).text;

describe("Ask the Map's speller", () => {
  it("reads slips in the map's words", () => {
    expect(read("hospitls near Adyar")).toBe("hospitals near Adyar");
    expect(read("garbge complaints")).toBe("garbage complaints");
    expect(read("tasmak shops")).toBe("tasmac shops");
    expect(read("waterloging near lakes")).toBe("waterlogging near lakes");
    expect(read("which ward is farthst from a fire staton")).toBe("which ward is farthest from a fire station");
    expect(read("pharmacys")).toBe("pharmacy");
  });

  it("reads Tamil place names written loosely in English", () => {
    expect(read("near velacheri")).toBe("near Velachery");
    expect(read("near mylapur")).toBe("near Mylapore");
    expect(read("near nungambakam")).toBe("near Nungambakkam");
    expect(read("near guindi")).toBe("near Guindy");
    // a spelling of a zone's name is the zone's name
    expect(read("near adayar")).toBe("near Adyar");
  });

  it("reads names typed as one word or one part off, never a short Tanglish word as part of a name", () => {
    expect(read("banks in tnagar")).toBe("banks in T. Nagar");
    expect(read("banks in anna nager")).toBe("banks in Anna Nagar");
    expect(read("thefts along ana salai")).toBe("thefts along Anna Salai");
    expect(read("Velachery la kuppai")).toBe("Velachery la kuppai");
    expect(read("near government hospitals")).toBe("near government hospitals");
  });

  it("reads phone shorthand and three-letter slips toward four-letter map words", () => {
    expect(read("thefts nr ATMs")).toBe("thefts near ATMs");
    expect(read("accidents arnd schools")).toBe("accidents around schools");
    expect(read("complaints by zon")).toBe("complaints by zone");
  });

  it("leaves alone what is right, English, short, or glued to a number", () => {
    for (const q of ["show me the review", "complaining near Adyar", "W-12 zone13", "the slowest", "atm illa wards", "kuppai pakkathula"]) expect(read(q)).toBe(q);
    expect(spell("hospitals near Adyar").fixes).toEqual([]);
  });

  it("prefers a map word to a rare keyword, and a place to its spelling inside longer names", () => {
    expect(read("schol near Adyar")).toBe("school near Adyar");
    expect(read("near pallikarnai")).toBe("near Pallikaranai");
  });

  it("asks when two readings are equally close", () => {
    const s = makeSpeller({ words: ["mount", "mound"], places: [], isKnown: () => false })("mounx");
    expect(s.ask?.options.map((o) => o.label).sort()).toEqual(["mound", "mount"]);
    expect(s.ask?.options.map((o) => o.text).sort()).toEqual(["mound", "mount"]);
  });

  it("reads Tamil script with the letters people mix up, keeping the ending", () => {
    expect(tamilKey("அடையார்")).toBe(tamilKey("அடையாறு"));
    expect(tamilKey("மயிலாபூர்")).toBe(tamilKey("மயிலாப்பூர்"));
    expect(read("அடையார் அருகே")).toBe("அடையாறு அருகே");
    expect(read("மயிலாபூர் பள்ளிகள்")).toBe("மயிலாப்பூர் பள்ளிகள்");
    expect(read("வேளச்சேரியில் குப்பை")).toBe("வேளச்சேரியில் குப்பை");
  });

  it("says what it read, in English and Tamil", () => {
    const s = spell("hospitls near adayar");
    expect(fixesLine(s.fixes, false)).toBe("Read 'hospitls' as hospitals, 'adayar' as Adyar.");
    expect(fixesLine(s.fixes, true)).toContain("'adayar' → Adyar");
    expect(fixesLine([], false)).toBeNull();
  });

  it("sound keys join the spellings people use", () => {
    expect(soundKey("velacheri")).toBe(soundKey("Velachery"));
    expect(soundKey("tasmak")).toBe(soundKey("tasmac"));
    expect(soundKey("thiruvanmiyur")).toBe(soundKey("tiruvanmiyur"));
    expect(soundKey("kovil")).not.toBe(soundKey("koil"));
  });
});

describe("Tamil words of the question itself", () => {
  it("never reads மண்டலம் (zone) or அருகே (near) as a place spelt like them", () => {
    const s = makeSpeller({ words: [], places: [], isKnown: () => false, tamil: ["தண்டலம்", "அருணே"] });
    expect(s("மண்டலம் 13 இல் வெள்ளம்").text).toBe("மண்டலம் 13 இல் வெள்ளம்");
    expect(s("பள்ளி அருகே").fixes).toEqual([]);
  });
});
