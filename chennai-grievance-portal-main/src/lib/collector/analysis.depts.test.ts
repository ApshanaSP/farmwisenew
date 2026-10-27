import { describe, expect, it } from "vitest";
import { otherDepts } from "./analysis";

// LT-12 (live re-check 27 Oct 2026): the AI analysis said "involves PWD Water Resources, GCC-SWD, POL-GCP, and PWD-WRD":
// the lead twice (by name and by code) and two raw codes
describe("departments involved, by name and once (LT-12)", () => {
  const names = new Map([["PWD-WRD", "PWD Water Resources"], ["GCC-SWD", "Storm Water Drain"], ["POL-GCP", "Greater Chennai Police"]]);
  it("names the others, leaves out the lead and repeats", () => {
    expect(otherDepts(["GCC-SWD", "POL-GCP", "PWD-WRD"], "PWD-WRD", names, "PWD Water Resources")).toEqual(["Storm Water Drain", "Greater Chennai Police"]);
  });
  it("never shows a code it cannot name", () => {
    expect(otherDepts(["XYZ-1", "GCC-SWD"], "PWD-WRD", names)).toEqual(["Storm Water Drain"]);
  });
});
