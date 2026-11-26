/**
 * The Daily window (day.ts): the calendar day in India, from 12 AM to now, the small hours until 6 AM still the day before; "yesterday by this time"
 * beside it, "yesterday" as the whole calendar day, the day's 2-hour buckets, and the words.
 */
import { describe, expect, it } from "vitest";
import { DAY_WORDS, PERIODS, dayBuckets, dayHours, dayKey, dayRollsAt, dayStart, dayWindow, dayWords, inDay, labelIn, labelLower, periodBefore, periodHours, periodIn, periodInfo, periodLower,
  smallHours, wholeDay } from "./day";
import { ROLLING_24, compareOf, readPeriod, spanOf } from "./read";

describe("the day starts at 12 AM and runs to now", () => {
  it("from 6 AM to 11:59 PM it is today's, from 12 AM", () => {
    for (const t of ["06:00:00", "06:00:01", "12:00:00", "17:30:00", "23:59:00", "23:59:59"]) {
      const now = `2026-11-26 ${t}`;
      expect([smallHours(now), dayStart(now), dayKey(now), dayWindow(now)]).toEqual([false, "2026-11-26 00:00:00", "2026-11-26", { from: "2026-11-26 00:00:00", to: now }]);
    }
  });
  it("from 12 AM until 6 AM the day that began at 12 AM yesterday goes on", () => {
    for (const t of ["00:00:00", "00:00:01", "01:20:00", "05:59:59"]) {
      const now = `2026-11-26 ${t}`;
      expect([smallHours(now), dayStart(now), dayKey(now)]).toEqual([true, "2026-11-25 00:00:00", "2026-11-25"]);
      expect(dayRollsAt(now)).toBe("2026-11-26 06:00:00");
    }
    expect(dayRollsAt("2026-11-26 09:00:00")).toBe("2026-11-27 06:00:00");
  });
  it("across a month's and a year's end", () => {
    expect(dayStart("2026-12-01 02:00:00")).toBe("2026-11-30 00:00:00");
    expect(dayStart("2027-01-01 05:59:59")).toBe("2026-12-31 00:00:00");
    expect(dayStart("2027-01-01 06:00:00")).toBe("2027-01-01 00:00:00");
  });
  it("nothing leaves the day before it rolls over: whatever is inside it at one moment is inside it at every later one", () => {
    const seen = "2026-11-25 00:00:00"; // the first second of the day
    for (let h = 0; h < 30; h++) for (const m of ["00:00", "30:00", "59:59"]) {
      const d = h < 24 ? "2026-11-25" : "2026-11-26", now = `${d} ${String(h % 24).padStart(2, "0")}:${m}`;
      // (before 6 AM of the 25th the desk is still in the 24th, which holds it too)
      expect(inDay(seen, now), now).toBe(true);
    }
    expect(inDay(seen, "2026-11-26 06:00:00")).toBe(false);
    expect(inDay("2026-11-26 00:30:00", "2026-11-26 06:00:00")).toBe(true);
    expect(inDay("2026-11-26T09:00:00", "2026-11-26 08:59:59")).toBe(false); // not yet
  });
  it("reads a date, a minute or an ISO time; anything else is the clock's", () => {
    expect(dayStart("2026-11-26T17:30:00")).toBe("2026-11-26 00:00:00");
    expect(dayStart("2026-11-26 17:30")).toBe("2026-11-26 00:00:00");
    expect(dayStart("")).toMatch(/^\d{4}-\d{2}-\d{2} 00:00:00$/);
  });
});

describe("the comparison and yesterday are two things", () => {
  it("the comparison is the same hours one day earlier, also in the small hours", () => {
    expect(dayWindow("2026-11-26 17:30:00", 1)).toEqual({ from: "2026-11-25 00:00:00", to: "2026-11-25 17:30:00" });
    expect(dayWindow("2026-11-26 01:20:00", 1)).toEqual({ from: "2026-11-24 00:00:00", to: "2026-11-25 01:20:00" });
    expect(dayWindow("2026-11-26 17:30:00", 2).from).toBe("2026-11-24 00:00:00");
  });
  it("yesterday is the whole calendar day, 12 AM to 12 AM", () => {
    expect(wholeDay("2026-11-26 17:30:00", 1)).toEqual({ from: "2026-11-25 00:00:00", before: "2026-11-26 00:00:00" });
    expect(wholeDay("2026-11-26 01:20:00", 1)).toEqual({ from: "2026-11-25 00:00:00", before: "2026-11-26 00:00:00" });
    expect(wholeDay("2026-11-26 17:30:00", 2)).toEqual({ from: "2026-11-24 00:00:00", before: "2026-11-25 00:00:00" });
  });
  it("read.ts says the same: today against yesterday by this time; yesterday by its own dates", () => {
    const c = compareOf("daily", "2026-11-26 17:30:00")!;
    expect([c.cur.range, c.prev.range]).toEqual([{ from: "2026-11-26 00:00:00", to: "2026-11-26 17:30:01" }, { from: "2026-11-25 00:00:00", to: "2026-11-25 17:30:01" }]);
    expect(c.label.en).toBe("today against yesterday by this time");
    expect(spanOf({ kind: "day", back: 1 }, "2026-11-26 17:30:00")!.range).toEqual({ from: "2026-11-25 00:00:00", to: "2026-11-26 00:00:00" });
  });
});

describe("the last 24 hours are still the last 24 hours", () => {
  it.each(["incidents in the last 24 hours", "past 24 hours severe cases", "24 hrs news", "the past day", "கடந்த 24 மணி நேரத்தில் எத்தனை", "24 மணி நேர செய்திகள்"])("%s", (q) => {
    expect(readPeriod(q)).toEqual(ROLLING_24);
    const s = spanOf(readPeriod(q), "2026-11-26 17:30:00")!;
    expect([s.key, s.range, s.hours, s.label.en]).toEqual(["daily", null, 24, "last 24 hours"]);
  });
  it.each(["today", "incidents today", "இன்று", "innaiku enna nadandhuchu", "this morning"])("%s is the Daily window", (q) => expect(readPeriod(q)).toEqual({ kind: "day", back: 0 }));
});

describe("the day's chart", () => {
  it("2-hour buckets from 12 AM, up to the one now is in", () => {
    expect(["06:00:00", "07:59:59", "08:00:00", "23:59:59"].map((t) => dayBuckets(`2026-11-26 ${t}`))).toEqual([4, 4, 5, 12]);
    // the small hours go on from the day before: 12 AM yesterday to now
    expect(["00:00:00", "02:10:00", "05:59:59"].map((t) => dayBuckets(`2026-11-26 ${t}`))).toEqual([13, 14, 15]);
    expect(dayHours("2026-11-26 06:30:00")).toBe(6.5);
    const p = periodInfo("daily", "2026-11-26 17:30:00");
    expect([p.buckets, p.hours / p.buckets]).toEqual([9, 2]);
    expect(periodInfo("weekly", "2026-11-26 17:30:00")).toEqual(PERIODS.weekly);
  });
});

describe("the words", () => {
  it("by day and in the small hours, English and Tamil", () => {
    expect([dayWords("2026-11-26 17:30:00").en.label, dayWords("2026-11-26 01:20:00").en.label]).toEqual(["Today (since 12 AM)", "Since 12 AM yesterday"]);
    expect([dayWords("2026-11-26 17:30:00").en.prev, dayWords("2026-11-26 01:20:00").en.prev]).toEqual(["yesterday by this time", "the day before by this time"]);
    expect(dayWords("2026-11-26 17:30:00").en.resolved).toBe("Resolved today");
    for (const t of ["2026-11-26 17:30:00", "2026-11-26 01:20:00"]) for (const w of Object.values(dayWords(t).ta)) expect(w).toMatch(/[஀-௿]/);
    expect(dayWords()).toBe(DAY_WORDS); // a unit test's text is always written by day
  });
  it("inside a line", () => {
    const day = "2026-11-26 17:30:00", night = "2026-11-26 01:20:00";
    expect([periodLower("daily", day), periodLower("daily", night), periodLower("weekly", day)]).toEqual(["today (since 12 AM)", "since 12 AM yesterday", "last 7 days"]);
    expect([periodIn("daily", day), periodIn("weekly", day)]).toEqual(["today", "in the last 7 days"]);
    expect([periodBefore("daily", day), periodBefore("weekly", day)]).toEqual(["yesterday by this time", "the prev. week"]);
    expect([labelLower("Today (since 12 AM)"), labelIn("Today (since 12 AM)"), labelIn("Last 7 days")]).toEqual(["today (since 12 AM)", "today (since 12 AM)", "in the last 7 days"]);
    expect([periodHours("daily", day), periodHours("weekly", day)]).toEqual([17.5, 168]);
    // no wording of the Daily window says 24 hours
    for (const p of [periodInfo("daily", day), periodInfo("daily", night)]) expect(JSON.stringify(p)).not.toMatch(/24 hours|last 24/i);
  });
});
