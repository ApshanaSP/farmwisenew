import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";
import { ZONE_TA_NAME } from "./lexicon";
import { briefTurn } from "./entities";
import { plainWhat } from "./narrate";
import { quickScreen } from "./quick";
import { redactText } from "./privacy";

// the pass-2 hunter's breaks (docs/qa/hunt/hunterC.md C2-C5)
const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
describe("keeping or typing a report is not a brief (BUG-022)", () => {
  it.each(["remember to check the police report tomorrow", "remind me at 5 pm to read the police report", "save this view as police report", "type police report in the search box", "pin the corporation status"])("%s", (s) => expect(briefTurn(s, world)).toBeNull());
  it("a plain police report still is", () => expect(briefTurn("police report", world)?.kind).toBe("screen"));
});
describe("an issue is named by its own kind (BUG-023)", () => {
  it.each([["Road accident", "a road accident"], ["Flood relief needs", "people who need flood relief"], ["Flood risk signal", "a flood warning"], ["Flooding & waterlogging", "standing water"], ["Road damage", "a damaged road"]])("%s", (cat, want) => expect(plainWhat(cat, null)?.en).toBe(want));
});
describe("past-the-deadline words ask for overdue cases only (BUG-024)", () => {
  it.each(["severe cases past the deadline", "which severe cases are overdue", "overdue high priority cases in Adyar"])("%s", (s) => expect(quickScreen(s, world)?.slots.status).toBe("overdue"));
  it("severe cases alone are not narrowed", () => expect(quickScreen("show me the severe cases", world)?.slots.status ?? null).toBeNull());
});
describe("Unicode spaces and dashes in a number are still a number (BUG-025)", () => {
  it.each(["98400 12345", "9840–012345", "98401‑12345", "98400 12345"])("%j", (s) => expect(redactText(`call ${s}`)).toContain("[hidden]"));
});
