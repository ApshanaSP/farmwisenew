import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/collector/db", () => ({ default: { query: vi.fn() } }));
vi.mock("@/lib/collector/derive", () => ({}));
import { anyFilter, incidentWhere, splitByIncident } from "./conflictscope";

const none = { zone: null, dept: null, cat: null, taluk: null };

describe("Differ under a filter (26 Nov): a story follows its incident", () => {
  it("splits the stories into those inside the filter, those elsewhere, and those with no incident on record", () => {
    const stories = [{ id: "a", incident: "I1" }, { id: "b", incident: "I2" }, { id: "c", incident: null }];
    expect(splitByIncident(stories, new Set(["I1"]))).toEqual({ inside: ["a"], wide: ["c"], out: 1 });
    expect(splitByIncident(stories, new Set())).toEqual({ inside: [], wide: ["c"], out: 2 });
  });
  it("applies every filter the console has, and none when none is set", () => {
    expect(anyFilter(none)).toBe(false);
    expect(incidentWhere(none)).toEqual({ sql: "1 = 1", params: [] });
    expect(incidentWhere({ zone: 8, dept: "GCC-SWM", cat: "SOLID_WASTE", taluk: "TLK-MYL" })).toEqual({
      sql: "i.zone_no = ? AND i.lead_dept = ? AND i.category_code = ? AND i.taluk_code = ?", params: [8, "GCC-SWM", "SOLID_WASTE", "TLK-MYL"]
    });
  });
});
