// QA pass 7 (rules-periods), pass4-open-08, -10, -11: Ask District IQ's rules name what they cannot apply or do, by the shape of the ask, not a list of pass 4's exact
// sentences; a share is the share asked. Pure: no database, no model. (The real path is tests/qa/pass6/known-failures/pass4-open/.../p6-ask.test.ts, 33/33.)
import { describe, expect, it } from "vitest";
import { notDone, shareAsked } from "./cannot";
import { unresolvedInput, type UnresolvedWorld } from "./unresolved";
import { windowIn } from "@/lib/windowspan";

const W: UnresolvedWorld = { zones: Array.from({ length: 15 }, (_, k) => k + 1), now: "2026-11-06 18:08:00", days: 180, placeFound: false, wardFound: false, rulesOnly: true, known: () => false };
const un = (m: string) => unresolvedInput(m, W);

describe("pass4-open-08: an input that cannot be applied is named, whatever its case or form", () => {
  it.each([
    ["how many complaints in atlantis", "atlantis"],
    ["open complaints in Gotham City", "Gotham City"],
    ["garbage complaints in Springfield this week", "Springfield"]
  ])("a place the district does not have: %s", (m, asked) => expect(un(m)).toMatchObject({ kind: "place", asked }));
  it.each(["complaints in total this week", "cases in progress in Adyar", "how many complaints in detail", "complaints in Tamil Nadu"])("an ordinary word or the state is no place: %s", (m) =>
    expect(un(m)?.kind === "place").toBe(false));
  it("zero in words is a count of no time", () => {
    expect(windowIn("complaints in the last zero days")).toMatchObject({ kind: "bad", why: "zero" });
    expect(un("complaints in the last zero days")).toMatchObject({ kind: "period" });
    expect(un("complaints in the last zero days")!.say.en).toMatch(/zero/);
  });
  it("a month still to come, or older than the records, is named", () => {
    expect(un("complaints in December 2026")).toMatchObject({ kind: "period", asked: "December 2026" });
    expect(un("complaints in December 2026")!.say.en).toMatch(/has not started yet/);
    expect(un("complaints in March 2025")!.say.en).toMatch(/older than the records/);
    expect(un("complaints in October 2026")).toBeNull();
  });
  it("a day still to come is named", () => {
    expect(un("incidents on 25 December")).toMatchObject({ kind: "date", asked: "25 December" });
    expect(un("incidents on 25 December")!.say.en).toMatch(/has not come yet/);
    expect(un("incidents on 25 October")).toBeNull();
  });
});

describe("pass4-open-10: what chat cannot do is read by its shape", () => {
  it.each([
    ["draft a reply to the citizen who complained about garbage in Adyar", "letter"],
    ["prepare a note for the Chief Secretary on flooding", "letter"],
    ["please draft something for the zonal officers", "letter"],
    ["what will the backlog look like at the end of the month", "forecast"],
    ["how will the pending complaints change next month", "forecast"]
  ])("%s", (m, kind) => expect(notDone(m, true)?.kind).toBe(kind));
  it.each(["prepare today's briefing", "show me the backlog this week", "will you show the open complaints in Adyar", "write down nothing, just count the complaints"])("still answered: %s", (m) =>
    expect(notDone(m, true)).toBeNull());
});

describe("pass4-open-11: a share is the share asked", () => {
  it.each([
    ["what percentage of complaints were resolved within the deadline", "ontime"],
    ["share of incidents resolved on time this month", "ontime"],
    ["ratio of open to closed incidents this week", "ratio"],
    ["percentage of resolved complaints", "resolved"],
    ["what percent of incidents are still open", "open"]
  ])("%s", (m, share) => expect(shareAsked(m)).toBe(share));
});
