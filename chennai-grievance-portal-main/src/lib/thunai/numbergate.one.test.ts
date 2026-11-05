import { expect, it } from "vitest";
import { gateChunk } from "./numbergate";

// Hunter B, B4 (BUG-017): a model line "There is only one severe case open in Adyar" passed the gate with nothing allowed
it("'one' before a counted thing is a figure", () => {
  expect(gateChunk("There is only one severe case open in Adyar.", new Set()).ok).toBe(false);
  expect(gateChunk("One complaint came in today.", new Set()).ok).toBe(false);
  expect(gateChunk("One complaint came in today.", new Set(["1"])).ok).toBe(true);
});
it("'one' that is not a count stays allowed", () => {
  for (const s of ["One moment.", "Open the second one.", "That one is in Adyar.", "One of the drains is blocked, I'd ask the corporation."]) expect(gateChunk(s, new Set()).ok).toBe(true);
});
