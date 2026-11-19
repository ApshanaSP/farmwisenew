/**
 * v6 (Phase 6): the HUD's core moves with the real speech: on the browser's voice it swells at each word's start (the voice's boundary
 * event) and falls away; the wake reply drives it from its own audio. Only the level's shape is tested here (no browser).
 */
import { describe, expect, it } from "vitest";
import { wordPulse } from "./mouth";

describe("v6: the core pulses on the real words", () => {
  it("a swell at the word's start, falling away over about 160 ms, never below the speaking floor", () => {
    expect(wordPulse(0)).toBeCloseTo(0.9, 5);
    expect(wordPulse(160)).toBeCloseTo(0.3 + 0.6 / Math.E, 5);
    expect(wordPulse(1000)).toBeGreaterThanOrEqual(0.3);
    expect(wordPulse(1000)).toBeLessThan(0.31);
    expect(wordPulse(50)).toBeGreaterThan(wordPulse(100));
  });
});
