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

// pass4-open-12 (pass 4's RC-15, PB-161 class): a Tamil case list named the body in English, "PWD Water Resources வசம் 2", in the key
// numbers and the spoken line; the "first" and "past their deadline" points of a brief did the same.
describe("pass4-open-12: a Tamil case list names the body in Tamil", () => {
  const row = (id: string, overdue: number) => ({ id, title: "Lake bund seepage", sev: "Severe", status: "Open", zone: 13, zone_name: "Adyar", place: "Velachery", dept: "PWD-WRD", dept_name: "PWD Water Resources",
    complaints: 2, t: "2026-11-12 08:00:00", overdue, breached: overdue });
  it("the key numbers and the spoken line", async () => {
    const h = fakeHands({ incidents: () => res({ rows: [row("INC-1", 1), row("INC-2", 1)], total: 2, complaints: 4 }) });
    const { doc } = await buildScreen("cases", { ...emptySlots(), zones: [13] }, SCOPE, WORLD, h, "அடையாறு வழக்குகள்");
    const t = tamil(doc);
    expect(t).not.toContain("PWD Water Resources வசம்");
    expect(t).toContain("பொதுப்பணித்துறை நீர்வளம் வசம்");
  });
});

describe("pass4-open-12: the advice screen's first and past-deadline points name the body in Tamil", () => {
  it("first case and the body sitting on several overdue cases", async () => {
    const h = fakeHands({ incidents: () => res({ rows: [1, 2, 3].map((k) => ({ id: `INC-${k}`, title: "Lake bund seepage", sev: "Severe", status: "Open", zone: 13, zone_name: "Adyar", place: "Velachery",
      dept: "PWD-WRD", dept_name: "PWD Water Resources", complaints: 2, t: "2026-11-12 08:00:00", overdue: 1, breached: 1 })), total: 3, complaints: 6 }) });
    const { doc } = await buildScreen("advise", { ...emptySlots(), zones: [13] }, SCOPE, WORLD, h, "அடையாறில் என்ன செய்ய வேண்டும்");
    const t = tamil(doc);
    expect(t).not.toMatch(/PWD Water Resources (வசம்|துறையை)/);
    expect(t).toMatch(/பொதுப்பணித்துறை நீர்வளம் வசம் உள்ளது/);
    expect(t).toMatch(/3 பொதுப்பணித்துறை நீர்வளம் வசம்/);
  });
});

// pass4-open-15 (pass 4's PB-207): the Tamil district brief said "PWD Water Resources, அண்ணா நகர்: <reason>" twice for two cases.
describe("pass4-open-15: no two Tamil brief points say the same thing, and the body is named in Tamil", () => {
  it("two cases of one body in one zone with the same reason", async () => {
    const why = { attention: ["Still open at more than twice its 6-hour deadline"] };
    const h = fakeHands({ briefing: () => res({ headline: ["1,357 incidents were reported in Chennai district (last 7 days), 6% more than the previous period.", "1,167 incidents are still open, 505 of them past the deadline; 65 severe events."],
      stats: { reported: 1357, change: 6, open: 1167, overdue: 505, severe: 65, newsOnly: 73, multi: 46 },
      attention: [{ id: "INC-1", title: "Canal overflow at Pulianthope, Anna Nagar.", zone: "Anna Nagar", dept: "PWD Water Resources", why }, { id: "INC-2", title: "Canal overflow at Ice House, Teynampet.", zone: "Teynampet", dept: "PWD Water Resources", why },
        { id: "INC-3", title: "Canal overflow at Kilpauk, Anna Nagar.", zone: "Anna Nagar", dept: "PWD Water Resources", why }], emerging: [], conditions: null }) });
    const { doc } = await buildScreen("brief", { ...emptySlots(), period: "weekly" }, { ...SCOPE, period: "weekly" as never }, WORLD, h, "இந்த வாரம் சுருக்கம் சொல்லு");
    const brief = (doc.blocks as { kind: string; points?: { ta?: string }[] }[]).find((b) => b.kind === "Brief")!;
    const ta = brief.points!.map((p) => p.ta).filter((x): x is string => !!x);
    expect(ta.length).toBeGreaterThan(3);
    expect(ta.filter((l, i) => ta.indexOf(l) !== i)).toEqual([]);
    expect(ta.join("\n")).not.toContain("PWD Water Resources");
  });
});
