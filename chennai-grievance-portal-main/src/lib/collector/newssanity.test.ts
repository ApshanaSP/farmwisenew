import { describe, expect, it } from "vitest";
import { STORY_HOURS, casualtyMerges, isArchival, isGasNotDisease, storyMerges, type NewsIncident, animalDeathsOnly, notAnIncident } from "./newssanity";

describe("history columns are not today's incidents", () => {
  it("drops Dinamani's 'this day' item (95 killed in a 1976 Bombay air crash, published 13 Oct 2026)", () => {
    expect(isArchival("13.10.1976: பம்பாயில் விமான விபத்தில் 95 பேர் பலி - சென்னைக்கு கிளம்பியவுடன் கீழே விழுந்து", "2026-10-13 07:15:00")).toBe(true);
  });
  it("drops other date forms, year prefixes and history phrases", () => {
    expect(isArchival("13/10/1990 - Fire at the central station", "2026-10-13 07:15:00")).toBe(true);
    expect(isArchival("1984: Cyclone hits the coast", "2026-10-13 07:15:00")).toBe(true);
    expect(isArchival("On this day: the first metro line opened", "2026-10-13 07:15:00")).toBe(true);
    expect(isArchival("இதே நாளில்: சென்னை துறைமுகம் திறப்பு", "2026-10-13 07:15:00")).toBe(true);
  });
  it("keeps current news, including headlines that open with today's date or contain old years", () => {
    expect(isArchival("13.10.2026: Two workers die in a stormwater well", "2026-10-13 07:15:00")).toBe(false);
    expect(isArchival("Two workers die while working inside Chennai corporation's stormwater well", "2026-10-12 17:47:42")).toBe(false);
    expect(isArchival("Building from 1976 collapses in Royapuram", "2026-10-13 07:15:00")).toBe(false);
    expect(isArchival("2026: city records its wettest October", "2026-10-13 07:15:00")).toBe(false);
    expect(isArchival(null, null)).toBe(false);
  });
});

describe("gas deaths are not vector-borne disease", () => {
  it("recognises workers overcome by gas, in Tamil and English", () => {
    expect(isGasNotDisease("கொடுங்கையூரில் விஷவாயு தாக்கி தொழிலாளர்கள் இருவர் உயிரிழப்பு", "Two workers die in a chemical gas attack in Kodungaiyur")).toBe(true);
    expect(isGasNotDisease("Two sanitary workers suffocate in a septic tank")).toBe(true);
  });
  it("leaves disease reports alone", () => {
    expect(isGasNotDisease("Dengue cases rise in Kodungaiyur")).toBe(false);
    expect(isGasNotDisease("Fever outbreak after toxic water in Perambur")).toBe(false);
    expect(isGasNotDisease("Mosquito menace in Velachery")).toBe(false);
  });
});

describe("news-only incidents of one story become one", () => {
  const inc = (id: string, t: string, zone: number | null, mediaOnly = true): NewsIncident => ({ id, t, zone, mediaOnly });

  it("merges the Kodungaiyur story's three incidents into the earliest placed one", () => {
    const m = storyMerges(new Map([["STY-62832147b1", [
      inc("INC-053966", "2026-10-12 20:06:12", 4), inc("INC-842A66", "2026-10-12 20:06:12", 4), inc("INC-CF4F34", "2026-10-12 17:47:42", 4)
    ]]]));
    expect(m.get("INC-053966")).toBe("INC-CF4F34");
    expect(m.get("INC-842A66")).toBe("INC-CF4F34");
    expect(m.has("INC-CF4F34")).toBe(false);
  });
  it("keeps a placed incident over an earlier city-level one", () => {
    const m = storyMerges(new Map([["S", [inc("A", "2026-10-12 08:00:00", null), inc("B", "2026-10-12 09:00:00", 13)]]]));
    expect(m.get("A")).toBe("B");
  });
  it(`leaves incidents more than ${STORY_HOURS} hours after the first one`, () => {
    const m = storyMerges(new Map([["S", [inc("A", "2026-10-01 08:00:00", 5), inc("B", "2026-10-01 20:00:00", 5), inc("C", "2026-10-06 08:00:00", 5)]]]));
    expect(m.get("B")).toBe("A");
    expect(m.has("C")).toBe(false);
  });
  it("leaves a story placed in two zones, and incidents with a department record", () => {
    expect(storyMerges(new Map([["S", [inc("A", "2026-10-01 08:00:00", 5), inc("B", "2026-10-01 09:00:00", 9)]]])).size).toBe(0);
    expect(storyMerges(new Map([["S", [inc("A", "2026-10-01 08:00:00", 5), inc("B", "2026-10-01 09:00:00", 5, false)]]])).size).toBe(0);
  });
});

describe("the same deaths at the same place, filed under different stories", () => {
  const c = (id: string, t: string, zone: number | null, place: string, dead: number) => ({ id, t, zone, place, dead });
  it("joins the build of 13 Oct: five Kodungaiyur articles on two workers killed by gas, in four stories", () => {
    const m = casualtyMerges([
      c("ETV-1", "2026-10-12 20:06:12", 4, "kodungaiyur", 2), c("ETV-2", "2026-10-12 20:06:12", 4, "kodungaiyur", 2),
      c("TOI", "2026-10-12 17:47:42", 4, "kodungaiyur", 2), c("TNM", "2026-10-13 11:28:06", 4, "kodungaiyur", 2),
      c("MM", "2026-10-13 11:43:20", 4, "kodungaiyur", 2), c("DTN", "2026-10-12 07:00:00", 11, "maduravoyal", 2)
    ]);
    expect([...m.entries()].sort()).toEqual([["ETV-1", "TOI"], ["ETV-2", "TOI"], ["MM", "TOI"], ["TNM", "TOI"]]);
  });
  it("keeps a different toll, place, zone, a city-level report, and a report two days later apart", () => {
    expect(casualtyMerges([c("A", "2026-10-12 08:00:00", 4, "kodungaiyur", 2), c("B", "2026-10-12 09:00:00", 4, "kodungaiyur", 3)]).size).toBe(0);
    expect(casualtyMerges([c("A", "2026-10-12 08:00:00", 4, "kodungaiyur", 2), c("B", "2026-10-12 09:00:00", 4, "tondiarpet", 2)]).size).toBe(0);
    expect(casualtyMerges([c("A", "2026-10-12 08:00:00", 4, "", 2), c("B", "2026-10-12 09:00:00", 4, "", 2)]).size).toBe(0);
    expect(casualtyMerges([c("A", "2026-10-12 08:00:00", null, "kodungaiyur", 2), c("B", "2026-10-12 09:00:00", null, "kodungaiyur", 2)]).size).toBe(0);
    expect(casualtyMerges([c("A", "2026-10-10 08:00:00", 4, "kodungaiyur", 2), c("B", "2026-10-12 09:00:00", 4, "kodungaiyur", 2)]).size).toBe(0);
  });
});

describe("deaths of animals are not deaths of people", () => {
  it("does not count the stray dogs or the deer (real headlines from the store)", () => {
    expect(animalDeathsOnly("17 stray dogs found dead in Madambakkam; IT employee arrested for poisoning")).toBe(true);
    expect(animalDeathsOnly("Spotted deer mauled by stray dogs in Madhavaram dies")).toBe(true);
    expect(animalDeathsOnly("மின்சாரம் தாக்கி 3 மாடுகள் உயிரிழப்பு")).toBe(true);
  });
  it("still counts people, even when animals are named", () => {
    expect(animalDeathsOnly("Man killed after stray dog chase on two-wheeler")).toBe(false);
    expect(animalDeathsOnly("Two workers die of asphyxiation while cleaning sump in Chennai")).toBe(false);
    expect(animalDeathsOnly("நாய் துரத்தியதில் விழுந்து இளைஞர் உயிரிழப்பு")).toBe(false);
    expect(animalDeathsOnly("Woman dies after falling through gap in elevated section of Mylapore MRTS station")).toBe(false);
  });
});

describe("horoscopes and obituaries are news, not incidents", () => {
  it("drops natural-death obituaries and horoscope columns (real obituary headlines from the store)", () => {
    expect(notAnIncident("Veteran filmmaker Singeetham Srinivasa Rao passes away at 94 in a Chennai hospital")).toBe(true);
    expect(notAnIncident("Spiritual Guru Kalki Bhagavan Passes Away In Chennai At 77, Final Rites To Be Conducted On Saturday")).toBe(true);
    expect(notAnIncident("இன்றைய ராசி பலன் - மேஷம் முதல் மீனம் வரை")).toBe(true);
  });
  it("keeps a death that is an incident, however it is worded", () => {
    expect(notAnIncident("Youth passes away after bike accident on OMR")).toBe(false);
    expect(notAnIncident("Worker passed away after falling into stormwater drain")).toBe(false);
    expect(notAnIncident("Two killed in accident on Maduravoyal bypass road")).toBe(false);
  });
});
