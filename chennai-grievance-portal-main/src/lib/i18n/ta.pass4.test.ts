// QA pass 4, RC-32 class guard: a Tamil clock phrase never names a part of the day that fits only some of the hours its English
// phrase covers. "PM" runs from noon to midnight, so மதியம் (noon), மாலை (evening) or இரவு (night) alone is wrong for part of it
// (6 PM was shown as மதியம்); "AM" runs from midnight, so காலை (morning) alone is wrong at 2 AM. PM uses பிற்பகல் (afternoon, the
// formal word for PM).
import { describe, expect, it } from "vitest";
import * as ta from "./ta";

const dict = (Object.values(ta).find((v) => v && typeof v === "object" && "Collected today, #:# PM" in (v as object)) ?? {}) as Record<string, string>;

describe("Tamil clock phrases", () => {
  it("finds the dictionary", () => expect(Object.keys(dict).length).toBeGreaterThan(10));
  it("a PM time is not called noon, evening or night alone", () => {
    for (const [en, tamil] of Object.entries(dict)) if (/#:# PM\b/.test(en)) expect(tamil).not.toMatch(/மதியம்|மாலை|இரவு/);
  });
  it("a PM time says afternoon (பிற்பகல்), the formal PM", () => {
    expect(dict["Collected today, #:# PM"]).toContain("பிற்பகல்");
  });
});
