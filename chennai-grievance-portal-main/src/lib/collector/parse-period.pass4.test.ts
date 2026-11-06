import { describe, it, expect } from "vitest";
import { parsePeriod } from "./intel";

// QA pass 4, finding access-fuzz-1: `v in PERIODS` also matches the names every object inherits.
describe("parsePeriod", () => {
  it.fails("access-fuzz-1: ?period=constructor and ?period=__proto__ fall back to daily", () => {
    for (const v of ["constructor", "__proto__", "toString", "hasOwnProperty"]) expect(parsePeriod(v)).toBe("daily");
  });
});
