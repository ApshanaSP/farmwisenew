import { describe, expect, it } from "vitest";
import { chunks } from "./chunker";

describe("the chunker is the only chunking (voice.ts no longer cuts again)", () => {
  it("a long clause with no comma is cut at a space, no piece over 220 characters, nothing lost", () => {
    const long = Array.from({ length: 70 }, (_, i) => `word${i}`).join(" ") + ".";
    expect(long.length).toBeGreaterThan(440);
    const c = chunks(long);
    expect(c.length).toBeGreaterThan(2);
    for (const x of c) expect(x.length).toBeLessThanOrEqual(220);
    expect(c.join(" ")).toBe(long);
  });
  it("Tamil too, at a space", () => {
    const long = Array.from({ length: 40 }, () => "அடையாறில்").join(" ") + ".";
    const c = chunks(long);
    for (const x of c) expect(x.length).toBeLessThanOrEqual(220);
    expect(c.join(" ")).toBe(long);
  });
});
