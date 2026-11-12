// g-repair (SKG1-33, 34, 35): a zone said by its number is read in every script and language, several are listed, and one that does not exist is named.
import { describe, expect, it } from "vitest";
import { zoneNosIn } from "./zone-no";

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
  it("no zone number: none", () => {
    for (const t of ["brief me on the police", "adyar brief", "ward 106 status", "5 zones", "show me five cases"]) expect(zoneNosIn(t), t).toEqual([]);
  });
});
