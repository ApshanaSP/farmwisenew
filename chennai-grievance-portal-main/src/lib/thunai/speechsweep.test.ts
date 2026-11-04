import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";
import { ZONE_TA_NAME } from "./lexicon";
import { buildScreen, emptySlots, type Slots } from "./screens";
import { fakeHands } from "./stagefake";
import { RECIPES } from "./stage";
import { labelIn } from "./speechcheck";

// every recipe's spoken line goes through the label gate: no ids, codes, field labels, enum values or ISO dates aloud
const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const base = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null, sev: null };
const SLOTS: Partial<Record<(typeof RECIPES)[number], Partial<Slots>>> = {
  case: { id: "INC-X1" }, compare: { zones: [13, 14] }, readings: { metric: "lakes" }, ranking: { measure: "zone_severe" }, performance: { by: "dept" }, nearby: { q: "schools near flooding in Adyar" },
  map: { what: "severe" }, brief: {}, complete: {}, prices: { q: "tomato" }
};
describe("no recipe reads fields aloud", () => {
  for (const recipe of RECIPES.filter((r) => r !== "answer")) {
    it(recipe, async () => {
      const b = await buildScreen(recipe, { ...emptySlots(), ...(SLOTS[recipe] ?? {}) }, base, world, fakeHands(), `test ${recipe}`);
      for (const lang of ["en", "ta"] as const) expect(labelIn(b.doc.say[lang]), `${recipe}/${lang}: ${b.doc.say[lang]}`).toBeNull();
    });
  }
});
