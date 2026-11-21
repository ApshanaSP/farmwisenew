/**
 * v14 (21 Nov review of v13, scenarios 6): with Rain & flooding open, "மழை வந்தா கரண்ட் எங்க போகும்?" opened the Power tab and said only "The
 * Power tab.", closing the answer card. rehearsalIntent now says when a lens was asked as a question (asks), so the map lane can say the
 * lens's answer, not only switch the tab; a plain tab request carries no asks.
 */
import { describe, expect, it } from "vitest";
import { rehearsalIntent } from "./intent";

describe("v14 scenarios 6: a lens asked as a question", () => {
  it.each([
    ["மழை வந்தா கரண்ட் எங்க போகும்?", "power"],
    ["mazhai vandha current enga pogum", "power"],
    ["Which areas lose power in heavy rain?", "power"],
    ["where does traffic jam when it rains", "traffic"],
    ["Which trains get delayed in rain?", "metro"],
    ["மழையில் மின்தடை எங்கே", "power"]
  ])("%s: lens %s, asks", (said, lens) => expect(rehearsalIntent(said)).toMatchObject({ lens, asks: true }));

  it("a tab asked for, not a question, carries no asks (the shape the callers had)", () => {
    expect(rehearsalIntent("show power cuts in the rain")).toEqual({ replay: null, manual: false, stop: null, focus: null, lens: "power" });
    expect(rehearsalIntent("metro in heavy rain")).toEqual({ replay: null, manual: false, stop: null, focus: null, lens: "metro" });
    // (the other rehearsal readings are unchanged)
    expect(rehearsalIntent("replay 21 October rain")).toEqual({ replay: "rain-2026-10-21", manual: false, stop: "warn", focus: null });
  });
});
