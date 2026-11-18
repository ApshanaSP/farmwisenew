import { describe, expect, it } from "vitest";
import { bestName, editDistance, fold, jaroWinkler, looseKey, nameScore, stemsOf, tokenSim } from "./match";

// the research's pairs (docs/jarvis/v8-research/40-tamil-matching.md R.6): heard -> intended, and near misses that must not match
const PLACES = ["Pallikaranai", "Pallavaram", "Palavakkam", "Adyar", "Ayanavaram", "Otteri", "Thiruvottiyur", "Thiruvanmiyur", "Velachery", "Valasaravakkam",
  "Kodambakkam", "Nungambakkam", "Egmore", "Ennore", "Anna Nagar", "Anna Salai", "Saidapet", "Sowcarpet", "Mylapore", "Chennai", "Kasimedu", "Minjur", "Teynampet", "Royapuram"];
const OUTLETS = ["Dinamalar", "Dinamani", "Daily Thanthi", "Dinakaran", "The Hindu", "DT Next", "The Times of India"];

describe("v8 match: the Tamil-loose key", () => {
  it("folds the spellings the three scripts disagree on", () => {
    expect(looseKey("Thiruvottiyur")).toBe(looseKey("Tiruvottiyur"));
    expect(looseKey("Thiruvotriyur")).toBe(looseKey("Thiruvottiyur"));
    expect(looseKey("Thiruvottriyur")).toBe(looseKey("Thiruvottiyur"));
    expect(looseKey("Pallikkaranai")).toBe(looseKey("Pallikaranai"));
    expect(looseKey("Velacheri")).toBe(looseKey("Velachery"));
    expect(looseKey("Thamizh")).toBe(looseKey("Tamil"));
    expect(looseKey("Dhinamalar")).toBe(looseKey("Dinamalar"));
  });
  it("romanises Tamil script before keying", () => {
    expect(looseKey(fold("பள்ளிக்கரணை"))).toBe(looseKey("Pallikaranai"));
    expect(looseKey(fold("திருவொற்றியூர்"))).toBe(looseKey("Thiruvottiyur"));
    expect(looseKey(fold("தினமலர்"))).toBe(looseKey("Dinamalar"));
  });
  it("Jaro-Winkler and the edit distance behave", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 2);
    expect(editDistance("ca", "ac")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });
  it("finds the stem a case ending hides, with the oblique repaired", () => {
    expect(stemsOf("pallikaranaiyila")).toContain("pallikaranai");
    expect(stemsOf("kodambakkathula")).toContain("kodambakkam");
    expect(stemsOf("adyarukku")).toContain("adyar");
  });
});

describe("v8 match: heard -> intended (must match)", () => {
  const cases: [string, string][] = [
    ["Palikan", "Pallikaranai"], ["Pallikaranai la", "Pallikaranai"], ["Pallikaranaila", "Pallikaranai"], ["Pallikaranaiyila", "Pallikaranai"],
    ["பள்ளிக்கரணையில்", "Pallikaranai"], ["Pallikkaranai", "Pallikaranai"], ["Adyar la", "Adyar"], ["Adyar-il", "Adyar"], ["Adyarla", "Adyar"],
    ["Adyarukku", "Adyar"], ["அடையாறில்", "Adyar"], ["Adaiyar", "Adyar"], ["Tiruvottiyur", "Thiruvottiyur"], ["Thiruvotriyur", "Thiruvottiyur"],
    ["திருவொற்றியூர்", "Thiruvottiyur"], ["Thiruvottiyurla", "Thiruvottiyur"], ["Velacheri", "Velachery"], ["Kodambakkathula", "Kodambakkam"],
    ["Chennaiyila", "Chennai"], ["Kasimedu harbour", "Kasimedu"], ["ராயபுரம்", "Royapuram"], ["தேனாம்பேட்டை", "Teynampet"]
  ];
  for (const [heard, want] of cases) it(`${heard} -> ${want}`, () => expect(bestName(heard, PLACES)?.name).toBe(want));
  const outlets: [string, string][] = [["Dhinamalar", "Dinamalar"], ["தினமலர்", "Dinamalar"], ["Dinamalr", "Dinamalar"], ["Dinathanthi", "Dina Thanthi"], ["DT Next", "DT Next"], ["Hindu", "The Hindu"]];
  for (const [heard, want] of outlets) it(`${heard} -> ${want}`, () => expect(bestName(heard, [...OUTLETS, "Dina Thanthi"])?.name).toBe(want));
});

describe("v8 match: near misses (must not match)", () => {
  const not: [string, string][] = [["Adyar", "Ayanavaram"], ["Adyar", "Otteri"], ["Dinamalar", "Dinamani"], ["Thiruvanmiyur", "Thiruvottiyur"], ["Kodambakkam", "Nungambakkam"],
    ["Egmore", "Ennore"], ["Anna Nagar", "Anna Salai"], ["Velachery", "Valasaravakkam"], ["Saidapet", "Sowcarpet"], ["Dinakaran", "Daily Thanthi"], ["Dinakaran", "Dinamalar"]];
  for (const [heard, wrong] of not) it(`${heard} is not ${wrong}`, () => expect(nameScore(heard, wrong)).toBeLessThan(0.88));
  it("a prefix two names share is no answer (ask, never guess)", () => expect(bestName("Pallava", PLACES)).toBeNull());
  it("Thiru alone is no name", () => expect(bestName("Thiru", PLACES)).toBeNull());
  it("an English word and a Tamil spelling of it meet ('supreme' heard in Tamil letters)", () => {
    expect(tokenSim(fold("சுப்ரீம்"), "supreme")).toBeGreaterThanOrEqual(0.88);
    expect(tokenSim(fold("கோர்ட்"), "court")).toBeGreaterThanOrEqual(0.8);
  });
});
