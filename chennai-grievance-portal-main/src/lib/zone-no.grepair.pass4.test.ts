// g-repair (SKG1-33, 34, 35): a zone said by its number is read in every script and language, several are listed, and one that does not exist is named.
import { describe, expect, it } from "vitest";
import { unresolvedInput } from "./assistant/unresolved";
import { noSuchArea } from "./map/route";
import { zoneNoIn, zoneNosIn, withZoneDigits } from "./zone-no";

describe("zoneNosIn", () => {
  it("one zone, in digits of any script and in number words of three languages", () => {
    for (const t of ["zone 5 brief", "zone ٥ brief", "zone ５ brief", "zone ௫ brief", "zone five brief", "zone anju brief sollu", "zone aindhu", "மண்டலம் ஐந்து சுருக்கம்", "மண்டலம் 5", "mandalam 5"]) expect(zoneNosIn(t), t).toEqual([5]);
  });
  it("a number that is no zone is still read, so it can be said", () => {
    expect(zoneNosIn("zone 99 brief")).toEqual([99]);
    expect(zoneNosIn("zone 0 brief")).toEqual([0]);
    expect(zoneNosIn("zone fifty brief")).toEqual([50]);
  });
  it("several zones: and, to, a second zone word", () => {
    expect(zoneNosIn("zone 5 and 6 brief")).toEqual([5, 6]);
    expect(zoneNosIn("zone five and six brief")).toEqual([5, 6]);
    expect(zoneNosIn("zones 5 to 7 brief")).toEqual([5, 6, 7]);
    expect(zoneNosIn("zone 5 and zone 6")).toEqual([5, 6]);
    expect(zoneNosIn("மண்டலம் 5 மற்றும் 6")).toEqual([5, 6]);
  });
  it("an ordinal before the zone word: 5th zone, fifth zone, the Tamil ordinal", () => {
    for (const t of ["show the 5th zone", "fifth zone brief", "5th zone", "ஐந்தாவது மண்டலம் சுருக்கம்"]) expect(zoneNosIn(t), t).toEqual([5]);
    expect(zoneNoIn("fifteenth zone")).toBe(15);
    expect(zoneNoIn("5 zones")).toBeNull();
  });
  it("withZoneDigits writes a spoken zone in 0-9 so a digits-only reader (the map resolver, Data Studio) reads it", () => {
    expect(withZoneDigits("zone five on the map")).toMatch(/zone 5$/);
    expect(withZoneDigits("zone ٥")).toMatch(/zone 5$/);
    expect(withZoneDigits("zone 5 on the map")).toBe("zone 5 on the map");
  });
  it("a zone that does not exist said in words is refused, as the digits are (Ask, the map)", () => {
    const w = { zones: Array.from({ length: 15 }, (_, i) => i + 1), now: "2026-11-06 12:00:00", placeFound: true, wardFound: true, rulesOnly: false, known: () => true };
    for (const t of ["how many complaints in zone ninety nine", "zone fifty complaints", "complaints in zone 99"]) expect(unresolvedInput(t, w)?.kind, t).toBe("zone");
    expect(unresolvedInput("how many complaints in zone five", w)).toBeNull();
    expect(noSuchArea("show zone ninety on the map")?.en).toMatch(/no Zone 90/);
    expect(noSuchArea("show zone five on the map")).toBeNull();
  });
  it("no zone number: none", () => {
    for (const t of ["brief me on the police", "adyar brief", "ward 106 status", "5 zones", "show me five cases"]) expect(zoneNosIn(t), t).toEqual([]);
  });
});
