import { describe, expect, it } from "vitest";
import { CONF_UNKNOWN, confOf, joinHeard } from "./heard";

describe("the confidence a heard sentence carries", () => {
  it("is P(speech) x exp(mean log-probability), from the server's own numbers, not a fixed 0.95", () => {
    expect(confOf({ speech: 0.98, logprob: -0.2 })).toBeCloseTo(0.98 * Math.exp(-0.2), 2);
    expect(confOf({ speech: 1, logprob: -0.8 })).toBeCloseTo(0.45, 2);
    expect(confOf({ speech: 0.5, logprob: 0 })).toBe(0.5);
    expect(confOf({ speech: 0.99, logprob: -0.1 })).toBeGreaterThan(confOf({ speech: 0.99, logprob: -0.6 }));
  });
  it("stays inside 0..1 whatever comes back, and an unknown one is the old value", () => {
    expect(confOf({ speech: 3, logprob: 2 })).toBe(1);
    expect(confOf({ speech: -1, logprob: -0.2 })).toBe(0);
    expect(confOf(undefined)).toBe(CONF_UNKNOWN);
    expect(confOf({ speech: 0.9 })).toBe(CONF_UNKNOWN);
  });
});

describe("one sentence said in two parts", () => {
  it("the words in order, the longer part's language, the lower confidence", () => {
    const j = joinHeard({ text: "Jarvis, show", lang: "en", conf: { speech: 0.99, logprob: -0.1 } }, { text: "அடையாறு புகார்கள்", lang: "ta", conf: { speech: 0.9, logprob: -0.4 } });
    expect(j).toMatchObject({ text: "Jarvis, show அடையாறு புகார்கள்", lang: "ta", conf: { speech: 0.9, logprob: -0.4 } });
  });
  it("an empty or missing part leaves the other as it was", () => {
    const a = { text: "show trends", lang: "en" as const };
    expect(joinHeard(a, null)).toBe(a);
    expect(joinHeard(null, a)).toBe(a);
    expect(joinHeard(a, { text: "", lang: "en", budget: "low" })).toBe(a);
    expect(joinHeard(null, { text: "", lang: "en", budget: "low" })).toMatchObject({ budget: "low" });
    expect(joinHeard(null, null)).toBeNull();
  });
});
