/**
 * v14 (21 Nov review 13 of the v13 city routing), lib/city/intent.ts's helpers for the last city answer and the views put away:
 *   - scenarios 0 / routing 8: the last city answer is the newest turn's, never an older city turn behind a later answer;
 *   - routing 5: a traffic answer's one zone is kept;
 *   - routing 10: "hide the live traffic", "turn off the traffic view" put a view away (viewPutAway).
 * (lib/city/pick.ts inZone, the zone's own jams, is here too.)
 */
import { describe, expect, it } from "vitest";
import { lastCityOf, lastCitySlotsOf, viewPutAway } from "./intent";
import { inZone, noJamIn, worstJam } from "./pick";

describe("v14 scenarios 0, routing 8: the newest turn only", () => {
  it("a later answer that kept no screen is the last answer: no older city turn is searched for behind it", () => {
    const city = { recipe: "city", slots: { q: "traffic", focus: "worst-jam" } }, words = { recipe: null, slots: null };
    expect(lastCityOf(null, [city, words, words])).toBeNull();
    expect(lastCitySlotsOf(null, [city, words])).toBeNull();
    expect(lastCityOf(null, [words, city])).toBe("traffic");
    expect(lastCitySlotsOf(null, [words, city])).toMatchObject({ topic: "traffic", focus: "worst-jam" });
    // (an open screen still says it, as before)
    expect(lastCityOf({ recipe: "city", slots: { q: "flood" } }, [words])).toBe("flood");
    expect(lastCityOf(null, [])).toBeNull();
  });
});

describe("v14 routing 5: a traffic answer's zone", () => {
  it("one zone is kept; none, two, or a flood screen's are not", () => {
    expect(lastCitySlotsOf({ recipe: "city", slots: { q: "traffic", zones: [13] } })).toMatchObject({ topic: "traffic", zone: 13 });
    expect(lastCitySlotsOf({ recipe: "city", slots: { q: "traffic", zones: [9, 13] } })?.zone).toBeUndefined();
    expect(lastCitySlotsOf({ recipe: "city", slots: { q: "traffic", zones: [] } })?.zone).toBeUndefined();
    expect(lastCitySlotsOf({ recipe: "city", slots: { q: "flood", zones: [13] } })?.zone).toBeUndefined();
    expect(lastCitySlotsOf(null, [{ recipe: "city", slots: { q: "traffic", zones: [13], focus: "worst-jam" } }])).toMatchObject({ zone: 13, focus: "worst-jam" });
  });
});

describe("v14 routing 10: a city view put away", () => {
  it.each([
    ["Hide the live traffic", "traffic"], ["Turn off the traffic view", "traffic"], ["hide traffic", "traffic"], ["switch off live traffic", "traffic"],
    ["close the traffic view", "traffic"], ["turn the live traffic off", "traffic"], ["Okay, close live traffic", "traffic"],
    ["close rain and flooding", "rain"], ["hide the flooding", "rain"]
  ])("%s", (s, want) => expect(viewPutAway(s)).toBe(want));
  it.each(["close this and show me live traffic", "hide the traffic complaints", "remove the traffic filter", "close", "show me live traffic", "hide the panel", "close the traffic issues reported today"])("not: %s", (s) => {
    expect(viewPutAway(s)).toBeNull();
  });
});

describe("v14 routing 0: lib/city/pick.ts inZone", () => {
  const s = (id: string, zone: number, delayMin: number) => ({ id, zone, level: "very", delayMin, lengthM: 100, name: id }) as never;
  it("one zone's jams and trouble spots; the district's when none", () => {
    const t = { spots: [s("a", 13, 10), s("b", 9, 30)], clusters: [{ id: "c", zone: 9 }] as never[] };
    expect(worstJam(inZone(t, 13))?.id).toBe("a");
    expect(worstJam(inZone(t, null))?.id).toBe("b");
    expect(inZone(t, 13).clusters).toEqual([]);
    expect(inZone(t, undefined)).toBe(t);
    expect(noJamIn("Adyar").en).toBe("No road in Adyar is congested right now.");
  });
});
