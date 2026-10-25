import { describe, expect, it } from "vitest";
import { withoutEchoedNumbers } from "@/lib/assistant/verify";

describe("a figure said as a word and again as digits", () => {
  it("drops the digits that repeat the word", () => {
    expect(withoutEchoedNumbers("It has been open for 310.9 hours, and one person was reported injured 1. No citizen complaints have been logged 0, and PWD handles it."))
      .toBe("It has been open for 310.9 hours, and one person was reported injured. No citizen complaints have been logged, and PWD handles it.");
  });

  it("keeps digits that say something else", () => {
    for (const t of ["One zone, Adyar, has 41 open incidents.", "Two of the 12 incidents are severe.", "No incidents in Ward 106.", "Three deaths were recorded in 2.",
      "Royapuram ranks 2 of 15 zones."]) expect(withoutEchoedNumbers(t)).toBe(t);
  });
});
