import { describe, expect, it } from "vitest";
import { ageWords } from "./narrate";
import { figuresIn } from "./numbergate";

describe("v4: time in words holds no figure", () => {
  it("no age phrase, English or Tamil, is read as a figure by the gate", () => {
    for (const h of [0, 1, 2.5, 5, 19, 30, 48, 70, 100, 200, 400, 1000]) {
      const a = ageWords(h)!;
      expect(figuresIn(a.en), `${h} h en: ${a.en}`).toEqual([]);
      expect(figuresIn(a.ta), `${h} h ta: ${a.ta}`).toEqual([]);
    }
  });
});
