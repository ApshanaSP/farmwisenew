/** The department summary's arithmetic and sentences, and the charts' day and week buckets (26 Nov 2026). Pure: no store. */
import { describe, expect, it, vi } from "vitest";
import { plain } from "./glance";
import { ageBuckets, average, deptSentences, followupWords, median, spanWords, type DeptFacts } from "./deptwords";
import { batchFollowupSummary } from "./followupdept";

vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[]] }, ops: (t: string) => t }));
const { fillDays, fillWeeks, lastDays, lastWeeks, mondayOf, scopeFilters } = await import("./daily");
const { axisTicks } = await import("@/components/collector/app/MiniCharts");

describe("open cases by age", () => {
  it("every open case is in one bucket: the buckets meet and add up", () => {
    const rows = [0, 3, 4, 7, 8, 15, 16, 30, 31, 400].map((d) => ({ d, n: 1 }));
    expect(ageBuckets(rows).map((b) => b.n)).toEqual([2, 2, 2, 2, 2]);
    expect(ageBuckets([{ d: -1, n: 2 }, { d: null, n: 1 }])[0].n).toBe(3); // filed a moment ago, dated ahead of the clock
    expect(ageBuckets([]).map((b) => b.n)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("time to close", () => {
  it("median and average of what closed; nothing closed is nothing, not 0", () => {
    expect(median([5, 1, 9])).toBe(5);
    expect(median([1, 3])).toBe(2);
    expect(median([])).toBeNull();
    expect(average([])).toBeNull();
    expect(average([1, 2, 6])).toBe(3);
  });
  it("in minutes, hours or days, whichever reads best", () => {
    expect(spanWords(0)?.v).toBe("1 min");
    expect(spanWords(45)?.en).toBe("45 minutes");
    expect(spanWords(60)?.en).toBe("1 hour");
    expect(spanWords(47.4 * 60)?.v).toBe("47 h");
    expect(spanWords(47.6 * 60)?.v).toBe("2 days"); // never "48 hours" beside "2 days"
    expect(spanWords(12831)?.v).toBe("8.9 days");
    expect(spanWords(null)).toBeNull();
  });
});

describe("the plain summary", () => {
  const f = (o: Partial<DeptFacts> = {}): DeptFacts => ({ name: "Storm Water Drain", period: "weekly", now: "2026-11-26 14:00:00", where: null, reported: 163, prevReported: 168, open: 146, overdue: 53, severeOpen: 0, resolved: 140,
    onTime: 34, timed: 140, deaths: 0, medianMinutes: 12831, kinds: [{ label: "Drainage", n: 63 }, { label: "Flooding", n: 47 }], areas: [{ name: "Teynampet", n: 36 }], ...o });
  const en = (o?: Partial<DeptFacts>) => deptSentences(f(o)).en.map(plain);
  it("three sentences, every figure the pop-up's own", () => {
    expect(en()).toEqual([
      "Storm Water Drain received 163 reports in the last 7 days, 5 fewer than the previous week, mostly Drainage (63) and Flooding (47); most from Teynampet (36).",
      "146 of them are still open, 53 past deadline.",
      "It resolved 140 cases in the last 7 days, half of them within 8.9 days; 34 of 140 met the deadline."
    ]);
  });
  it("names the filter it is for, and a quiet department is said to be quiet", () => {
    expect(en({ where: "Adyar" })[0]).toMatch(/^Storm Water Drain in Adyar received/);
    expect(en({ reported: 0, prevReported: 0, open: 0, resolved: 0, kinds: [], areas: [] })).toEqual(["Storm Water Drain received no report and closed no case in the last 7 days."]);
    expect(en({ reported: 0, open: 0, resolved: 2, onTime: 0, timed: 0, medianMinutes: null })).toEqual(["Storm Water Drain received no report in the last 7 days.", "It resolved 2 cases in the last 7 days."]);
  });
  it("the Tamil states the same numbers", () => {
    const s = deptSentences(f({ deaths: 2, severeOpen: 3 }));
    const nums = (t: string) => (t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).sort();
    s.en.forEach((x, k) => expect(nums(plain(s.ta[k]))).toEqual(nums(plain(x))));
  });
});

describe("follow-ups in words", () => {
  it("the machine's header and tail are not shown", () => {
    expect(followupWords('[RR] {"r":"r1","d":"GCC-SWD","k":"k","la":1,"lo":2,"w":null} Clear the drain on 2nd Street')).toBe("Clear the drain on 2nd Street");
    expect(followupWords(batchFollowupSummary("GCC-SWD"))).toBe("Completion report with photos");
    expect(followupWords(null)).toBe("");
  });
});

describe("days and weeks", () => {
  it("the last 7 calendar days end today; whole weeks end last Sunday", () => {
    expect(lastDays("2026-11-26 01:30:00", 7)).toEqual(["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"]);
    const w = lastWeeks("2026-11-26 01:30:00", 12); // a Thursday: this week's Monday is the 23rd
    expect([w.length, w[0], w[11]]).toEqual([12, "2026-08-31", "2026-11-16"]);
    expect(mondayOf("2026-11-22")).toBe("2026-11-16");
    expect(lastWeeks("2026-11-23 10:00:00", 1)).toEqual(["2026-11-16"]); // on a Monday, this week has not finished
  });
  it("a day with nothing is 0, and the weeks are the days added up", () => {
    const days = fillDays(["2026-11-21", "2026-11-22", "2026-11-23"], [{ d: "2026-11-21", n: 3 }, { d: "2026-11-23", n: 5 }], [{ d: "2026-11-22", n: 2 }]);
    expect(days.map((d) => [d.reported, d.resolved])).toEqual([[3, 0], [0, 2], [5, 0]]);
    expect(fillWeeks(["2026-11-16"], days)).toEqual([{ day: "2026-11-16", reported: 3, resolved: 2 }]);
  });
  it("every filter is in the SQL, and none is none", () => {
    expect(scopeFilters({ zone: 13, dept: "GCC-SWD", cat: "FLOOD_RELIEF", taluk: "TLK-MYL" })).toEqual({ sql: " AND i.zone_no = ? AND i.lead_dept = ? AND i.category_code = ? AND i.taluk_code = ?", params: [13, "GCC-SWD", "FLOOD_RELIEF", "TLK-MYL"] });
    expect(scopeFilters({})).toEqual({ sql: "", params: [] });
  });
});

describe("chart axis", () => {
  it("clean whole steps that cover the largest value", () => {
    for (const m of [0, 1, 3, 4, 9, 17, 38, 73, 243, 1400, 99999]) {
      const t = axisTicks(m);
      expect(t[t.length - 1]).toBeGreaterThanOrEqual(Math.max(1, m));
      expect(t.length).toBeLessThanOrEqual(5);
      expect(new Set(t).size).toBe(t.length);
      expect(t.every(Number.isInteger)).toBe(true);
    }
    expect(axisTicks(73)).toEqual([0, 25, 50, 75]);
  });
});
