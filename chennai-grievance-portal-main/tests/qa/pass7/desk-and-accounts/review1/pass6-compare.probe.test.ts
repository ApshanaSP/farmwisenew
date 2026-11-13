/**
 * Review 1: the "missed repeat" pairs, under pass 6's rule (db27d55^, copied beside this file) — to tell regressions from old misses.
 * Informational: these assert what pass 6 did, so they pass.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[], []] }, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/db", () => ({ connectionSettings: () => ({}), default: { query: async () => [[], []] } }));
const { sameTopic: pass6 } = await import("./pass6-repeat-snapshot");

describe("review1: pass 6's rule on the pairs the fix no longer joins", () => {
  it("joined: Streetlight / Street light not burning", () => expect(pass6("Streetlight not burning", "Street light not burning", true)).toBe(true));
  it("joined: தெருவிளக்கு / தெரு விளக்கு எரியவில்லை", () => expect(pass6("தெருவிளக்கு எரியவில்லை", "தெரு விளக்கு எரியவில்லை", true)).toBe(true));
  it("joined: old building / dangerous building", () => expect(pass6("Old building near my house about to collapse", "Dangerous building, wall cracks, please demolish", true)).toBe(true));
  it("not joined either: பள்ளம் / பள்ளங்கள்", () => expect(pass6("தெருவில் பள்ளம்", "தெருவில் பள்ளங்கள்", true)).toBe(false));
  it("not joined either: mosquito / mosquitoes", () => expect(pass6("Mosquito menace in our area", "Mosquitoes breeding in stagnant water", true)).toBe(false));
  it("different people 'for a long time': pass 6 joined too", () => expect(pass6("Drinking water not coming for a long time", "Sewage overflowing on the road for a long time", false)).toBe(true));
});
