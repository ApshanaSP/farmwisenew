import { describe, expect, it } from "vitest";
import { stageShownText } from "./shown";

// invented screen text, none from any eval set or any citizen
const row = (id: string, title: string) => ({ id, title, sev: null, status: null, zone: null, zoneName: null, place: null, ward: null, dept: null, deptName: null, complaints: 1, t: null, overdue: false, lat: null, lon: null, why: null, cat: null });
describe("the Stage's news and complaint text (G3 a)", () => {
  it("lists case titles, a case's details, headlines and brief points; nothing from other blocks", () => {
    const doc = { blocks: [
      { kind: "CaseList", rows: [row("I1", "an invented drain complaint")] },
      { kind: "CaseDetail", incident: { ...row("I2", "an invented road case"), what: ["water on the road"], why: "a blocked drain", next: null, deadline: null, officials: [] }, timeline: [{ t: "x", source: "s", text: "reported" }] },
      { kind: "NewsReader", items: [{ id: "n", title: "an invented headline", source: null, t: null, place: null, incidentId: null, url: null }] },
      { kind: "Brief", points: [{ text: "an invented brief point", incidentId: null }] },
      { kind: "Note", id: "x", text: "code's own note" }
    ] } as never;
    expect(stageShownText(doc)).toEqual(["an invented drain complaint", "an invented road case", "water on the road", "a blocked drain", "reported", "an invented headline", "an invented brief point"]);
  });
  it("no Stage: nothing", () => { expect(stageShownText(null)).toEqual([]); });
});

describe("review numbers-privacy-2: the Filled (complete) screen's row titles count as shown complaint text", () => {
  it("lists a Filled block's row titles", () => {
    const doc = { blocks: [{ kind: "Filled", rows: [{ id: "r1", title: "an invented unresolved complaint", cells: [] }] }] } as never;
    expect(stageShownText(doc)).toEqual(["an invented unresolved complaint"]);
  });
});
