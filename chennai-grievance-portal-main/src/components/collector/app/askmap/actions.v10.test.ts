/**
 * v10 (docs/jarvis/v10-research/50-askmap-anatomy.md 4.4, bugs 1 and 2): what the panel does with a "ui" answer.
 *   1. The Collector's "plan my visits" did nothing: the server answers `ui: "visits"`, the turn says "Planning your visits from this answer.",
 *      but only the officer's console handled the cue (AskOverlay gave onVisits to the officer alone).
 *   2. The cue fired again whenever the panel mounted again (the map shrunk and grown again, as voice does often): the Send dialog or the
 *      Export sheet reopened by itself.
 */
import { describe, expect, it } from "vitest";
import { cueAct } from "./actions";

describe("a ui answer's cue on the panel", () => {
  it("'plan my visits' plans the visits on the Collector's console too (bug 1)", () => {
    expect(cueAct({ seq: 5, ui: "visits", dept: null }, "collector", 0)).toEqual({ act: "visits" });
    expect(cueAct({ seq: 5, ui: "visits", dept: null }, "officer", 0)).toEqual({ act: "visits" });
  });
  it("send opens the drafts on the Collector's console only; export and 'why these' on both", () => {
    expect(cueAct({ seq: 5, ui: "send", dept: "GCC-SWD" }, "collector", 0)).toEqual({ act: "send", dept: "GCC-SWD" });
    expect(cueAct({ seq: 5, ui: "send", dept: "GCC-SWD" }, "officer", 0)).toBe(null);
    expect(cueAct({ seq: 5, ui: "export", dept: null }, "officer", 0)).toEqual({ act: "export" });
    expect(cueAct({ seq: 5, ui: "open_trace", dept: null }, "collector", 0)).toBe(null);
    expect(cueAct(null, "collector", 0)).toBe(null);
  });
  it("a cue already acted on is not acted on again when the panel mounts again (bug 2)", () => {
    // the panel acted on cue 5, then the map shrank and grew again: nothing reopens
    expect(cueAct({ seq: 5, ui: "send", dept: null }, "collector", 5)).toBe(null);
    // a new cue is acted on
    expect(cueAct({ seq: 6, ui: "send", dept: null }, "collector", 5)).toEqual({ act: "send", dept: null });
    // a cue that came before the panel's first mount (nothing acted on yet) is still acted on
    expect(cueAct({ seq: 2, ui: "export", dept: null }, "collector", 0)).toEqual({ act: "export" });
  });
});
