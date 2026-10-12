import { describe, expect, it } from "vitest";
import { PINNABLE, PIN_PRECISION_M, PLACE_FILTERS, isPinnable, parsePlace } from "./mapplace";

describe("map pins (GIS-001)", () => {
  it("does not pin the district-centroid fallback (13.0827, 80.2707 at 15 km)", () => {
    expect(isPinnable(13.0827, 15000)).toBe(false);
  });
  it("does not pin a 4 km area-level place", () => {
    expect(isPinnable(13.05, 4000)).toBe(false);
  });
  it("pins departmental points and street / locality places", () => {
    for (const p of [30, 50, 300, 800, 1500, PIN_PRECISION_M]) expect(isPinnable(13.05, p)).toBe(true);
  });
  it("treats a point with no recorded precision as a source point, and no point as unlocated", () => {
    expect(isPinnable(13.05, null)).toBe(true);
    expect(isPinnable(null, 30)).toBe(false);
    expect(isPinnable("", null)).toBe(false);
  });
  it("uses the same threshold in SQL, and 'unlocated' is its exact complement", () => {
    expect(PINNABLE).toContain(`<= ${PIN_PRECISION_M}`);
    expect(PINNABLE).toContain("i.lat IS NOT NULL");
    expect(PLACE_FILTERS.unlocated).toBe(`NOT ${PINNABLE}`);
  });
  it("accepts only the known place filters", () => {
    expect(parsePlace("unlocated")).toBe("unlocated");
    expect(parsePlace("nozone")).toBe("nozone");
    expect(parsePlace("notaluk")).toBe("notaluk");
    expect(parsePlace("constructor")).toBeNull();
    expect(parsePlace("1=1")).toBeNull();
    expect(parsePlace(undefined)).toBeNull();
  });
});
