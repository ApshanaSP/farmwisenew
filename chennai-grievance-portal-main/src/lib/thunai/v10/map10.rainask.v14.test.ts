/**
 * v14 (21 Nov review 13): the map lane's Rain & flooding rules.
 * - scenarios 6: power or the trains in the rain asked as a question, with Rain open, is the server's city screen (its answer, the tab moved in
 *   place), not "The Power tab."; a bare tab command still moves the tab.
 * - routing 4: a flood sentence that names a place keeps the place (it leaves the district's past rain to the place's flooding).
 */
import { describe, expect, it } from "vitest";
import { mapCommand10, type MapCtx10 } from "./map10";

const closed: MapCtx10 = { open: false, hasAnswer: false, lang: "en" };
const cmd = (s: string, c: Partial<MapCtx10> = {}) => mapCommand10(s, { ...closed, ...c });

describe("v14 scenarios 6: a power or trains question with Rain open is answered, not just its tab named", () => {
  it.each([
    ["மழை வந்தா கரண்ட் எங்க போகும்?", { rainOpen: true }],
    ["மழை வந்தா கரண்ட் எங்க போகும்?", { open: true, rainOpen: true }],
    ["Where does power go off when it rains?", { rainOpen: true }],
    ["Which trains get delayed in rain?", { open: true, rainOpen: true }]
  ] as [string, Partial<MapCtx10>][])("%s → the server's city screen (null here)", (s, c) => {
    expect(cmd(s, c)).toBeNull();
  });
  it("a tab command still moves the tab", () => {
    expect(cmd("show power in heavy rain", { rainOpen: true })).toEqual({ op: "rain", act: "open", tab: "power" });
    expect(cmd("power", { rainOpen: true })).toEqual({ op: "rain", act: "open", tab: "power" });
  });
});

describe("v14 routing 4: a place named with a past rain's flooding is kept", () => {
  it("the owner's sentence and a replay still open the last rain", () => {
    expect(cmd("What are the flooded streets in the last rain?")).toMatchObject({ op: "city", topic: "flood", rain: "latest" });
    expect(cmd("Show me the flooded streets in the last rain on the map")).toEqual({ op: "rain", act: "open", rain: "latest" });
    expect(cmd("Replay the last rain")).toEqual({ op: "rain", act: "open", rain: "latest" });
    expect(cmd("Show the 21 October rain")).toEqual({ op: "rain", act: "open", rain: "rain-2026-10-21" });
  });
  it("a named place leaves it to that place's flooding", () => {
    expect(cmd("Show the flooded streets in Velachery in the last rain")).toBeNull();
  });
});
