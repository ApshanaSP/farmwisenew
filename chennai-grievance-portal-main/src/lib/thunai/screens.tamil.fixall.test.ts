import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { buildScreen, emptySlots } from "./screens";
import { fakeHands } from "./stagefake";

const SCOPE = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null, sev: null };
const res = (data: unknown) => ({ tool: "", args: {}, scope: null, asOf: "2026-11-12 10:00:00", data, facts: [], sources: [], incidentIds: [], testData: true, caveats: [] });
const tamil = (doc: unknown) => JSON.stringify(doc).replace(/\\"/g, "\"");

// pass4-open-13 (the PB-224 class): a Tamil brief said "1 கடுமையானவை" and "1 கெடு தாண்டியவை", the plural whatever the count.
describe("pass4-open-13: a Tamil count of one takes the singular", () => {
  const briefWith = (severe: number, overdue: number) => fakeHands({ briefing: () => res({ headline: ["9 incidents were reported in Adyar zone (last 24 hours)."],
    stats: { reported: 9, change: 0, open: 7, overdue, severe, newsOnly: 0 }, attention: [], emerging: [], conditions: null }) });
  it("one severe and one past its deadline", async () => {
    const { doc } = await buildScreen("brief", { ...emptySlots(), zones: [13] }, SCOPE, WORLD, briefWith(1, 1), "அடையாறு சுருக்கம்");
    const t = tamil(doc);
    expect(t).not.toMatch(/(^|[^\d.,])1 (கடுமையானவை|கெடு தாண்டியவை|காலக்கெடு தாண்டியவை)/);
    expect(t).toMatch(/(^|[^\d.,])1 கடுமையானது/);
    expect(t).toMatch(/(^|[^\d.,])1 கெடு தாண்டியது/);
  });
  it("two keep the plural", async () => {
    const { doc } = await buildScreen("brief", { ...emptySlots(), zones: [13] }, SCOPE, WORLD, briefWith(2, 3), "அடையாறு சுருக்கம்");
    const t = tamil(doc);
    expect(t).toMatch(/(^|[^\d.,])2 கடுமையானவை/);
    expect(t).toMatch(/(^|[^\d.,])3 கெடு தாண்டியவை/);
  });
});

describe("pass4-open-13: the same in a case list, a body's brief and a kind's summary", () => {
  it("a case list with one past its deadline says it in the singular", async () => {
    const one = fakeHands({ incidents: () => res({ rows: [{ id: "INC-1", title: "Drain overflow", sev: "Severe", status: "Open", zone: 13, zone_name: "Adyar", place: "Besant Nagar", dept: "GCC-SWD", dept_name: "Storm Water Drain", complaints: 3, t: "2026-11-12 08:00:00", overdue: 1, breached: 1 },
      { id: "INC-2", title: "Garbage", sev: "High", status: "Open", zone: 13, zone_name: "Adyar", place: "Thiruvanmiyur", dept: "GCC-SWM", dept_name: "Solid Waste", complaints: 1, t: "2026-11-12 09:00:00", overdue: 0, breached: 0 }], total: 2, complaints: 4 }) });
    const { doc } = await buildScreen("cases", { ...emptySlots(), zones: [13] }, SCOPE, WORLD, one, "அடையாறு வழக்குகள்");
    const t = tamil(doc);
    expect(t).not.toMatch(/(^|[^\d.,])1 (பதிவுகள் )?காலக்கெடு தாண்டியவை/);
    expect(t).toMatch(/1 (பதிவு )?காலக்கெடு தாண்டியது/);
  });
});
