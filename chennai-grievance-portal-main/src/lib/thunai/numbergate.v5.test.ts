// v5 F1, found while writing the voice's Tamil number words: the gate's Tamil reader and the thousands said with "ஓர்" (…one).
// Invented sentences only.
import { describe, expect, it } from "vitest";
import { figuresIn, gateChunk } from "./numbergate";
import { numberInWords } from "./numberwords";

const values = (t: string) => figuresIn(t).map((f) => f.value);

describe("the gate reads the Tamil thousands said with ஓர் (one)", () => {
  it("இருபத்தோராயிரம் is 21,000, பதினோராயிரம் 11,000, ஓராயிரம் 1,000", () => {
    expect(values("இருபத்தோராயிரம் புகார்கள்")).toEqual([21_000]);
    expect(values("பதினோராயிரம் பேர்")).toEqual([11_000]);
    expect(values("ஓராயிரம் மரங்கள்")).toEqual([1000]);
    expect(values("தொண்ணூற்றோராயிரத்து இருநூறு")).toEqual([91_000, 200]);
  });
  it("a model's figure said that way is refused", () => {
    for (const t of ["பதினோராயிரம் மரணங்கள்", "ஓராயிரம் வீடுகள் இடிந்தன", "இருபத்தோராயிரம் பேர் இறந்தனர்"]) expect(gateChunk(t, new Set()).ok, t).toBe(false);
  });
  it("property: the gate reads the voice's Tamil words for 1,000 to 99,999 as the same value, word by word", () => {
    for (let n = 1000; n < 100_000; n += 7) {
      // a lone ஒன்று (one) is left out of the gate on purpose ("ஒன்று" is also "a thing"), so 2,001 reads as 2,000
      if (n % 100 === 1) continue;
      const w = numberInWords(n, "ta");
      expect(values(w).reduce((a, b) => a + b, 0), `${n}: ${w}`).toBe(n);
    }
  });
});
