// Review of the dates the shared reader puts on a period (src/lib/period/read.ts spanOf, compareOf, prevOf), pass 7 rules-periods.
// "BREAK" tests assert the owner's spec and FAIL while the break is there; "holds" tests passed when written.
import { describe, expect, it } from "vitest";
import { compareOf, prevOf, readPeriod, spanOf, type PeriodSpec } from "@/lib/period/read";
import { customWindow } from "@/lib/assistant/fastpath";

const NOW = "2026-11-06 18:08:00"; // the pinned snapshot's as-of, a Friday
const H = 3600_000;
const ms = (s: string) => Date.parse(`${s.replace(" ", "T")}+05:30`);

describe("BREAK: 'since <day>' starts before that day's midnight (the hours are rounded up from now)", () => {
  it("BREAK: 'since 1 October' at 18:08 counts from 1 Oct 00:00, not 30 Sep 23:08", () => {
    const s = spanOf(readPeriod("complaints since 1 October"), NOW)!;
    expect(s.label.en).toBe("since 1 Oct");
    expect(s.range!.from).toBe("2026-10-01 00:00:00");
  });
  it("BREAK: Ask District IQ's window for 'since 1 October' starts at 1 Oct 00:00", () =>
    expect(customWindow("complaints since 1 October", NOW)!.range!.from).toBe("2026-10-01 00:00:00"));
  it("BREAK: 'since 6 November' asked on 6 Nov at 18:08 is today since midnight, not from 5 Nov 23:08", () =>
    expect(spanOf({ kind: "since", month: 10, day: 6 }, NOW)!.range!.from).toBe("2026-11-06 00:00:00"));
  it("BREAK: 'since Pongal' asked on 1 Mar 2026 at 10:30 starts on 15 Jan 00:00", () =>
    expect(spanOf(readPeriod("complaints since Pongal"), "2026-03-01 10:30:00")!.range!.from).toBe("2026-01-15 00:00:00"));
});

describe("BREAK: a 'last week of <month>' the store does not hold is still counted (a false zero)", () => {
  // the store keeps about 180 days (read.ts MAX_HOURS): on 6 Nov 2026 that is back to about 10 May 2026
  it("BREAK: 'the last week of April' (24 Apr - 1 May), wholly before the records, is refused or at least carries a note", () => {
    const s = spanOf(readPeriod("severe cases in the last week of April"), NOW);
    expect(s === null || s.note !== null).toBe(true);
  });
  it("BREAK: 'the last week of December' (Dec 2025), wholly outside the records, is not counted with a note that only the start is missing", () => {
    const s = spanOf(readPeriod("the last week of december"), NOW);
    expect(s).toBeNull();
  });
  it("(for contrast, holds) 'in April' is refused: the month kind returns null when it is too old", () => expect(spanOf(readPeriod("complaints in April"), NOW)).toBeNull());
});

describe("BREAK: holidays the table does not hold for the coming year", () => {
  it("BREAK: 'since New Year' asked on 5 Jan 2027 counts from 1 Jan 2027, not 1 Jan 2026 cut at 180 days", () => {
    const s = spanOf(readPeriod("complaints since new year"), "2027-01-05 10:00:00")!;
    expect(s.label.en).toContain("1 Jan");
    expect(s.label.en).not.toContain("2026");
    expect(s.note).toBeNull();
  });
});

describe("p7-rules-periods-04 (open, it.fails until fixed): MINOR: last month (a 31-day month) is keyed as the quarter", () => {
  it.fails("MINOR: spanOf(last month).key and Ask District IQ's period for October are 'monthly', not 'quarterly'", () => {
    expect(spanOf({ kind: "last", unit: "month" }, NOW)!.key).toBe("monthly");
    expect(customWindow("complaints last month", NOW)!.period).toBe("monthly");
  });
});

describe("holds: edge days and clocks", () => {
  const day = (back: 0 | 1 | 2, now: string) => spanOf({ kind: "day", back }, now)!.range;
  const last = (unit: "week" | "month" | "quarter", now: string) => spanOf({ kind: "last", unit }, now)!;
  it("today just after midnight IST (UTC still the day before) is the new IST day", () => {
    expect(day(0, "2026-11-07 00:20:00")).toEqual({ from: "2026-11-07 00:00:00", to: "2026-11-07 00:20:01" });
    expect(day(1, "2026-11-07 00:20:00")).toEqual({ from: "2026-11-06 00:00:00", to: "2026-11-07 00:00:00" });
  });
  it("today just before midnight runs to midnight, exclusive", () => expect(day(0, "2026-11-06 23:59:59")).toEqual({ from: "2026-11-06 00:00:00", to: "2026-11-07 00:00:00" }));
  it("yesterday on 1 January is 31 December of the year before", () => expect(day(1, "2027-01-01 00:05:00")).toEqual({ from: "2026-12-31 00:00:00", to: "2027-01-01 00:00:00" }));
  it("leap day: yesterday on 1 Mar 2028 is 29 Feb, the day before yesterday 28 Feb", () => {
    expect(day(1, "2028-03-01 09:00:00")!.from).toBe("2028-02-29 00:00:00");
    expect(day(2, "2028-03-01 09:00:00")!.from).toBe("2028-02-28 00:00:00");
  });
  it("last month on 1 January (just after midnight) is December of the year before, labelled with its year", () => {
    const s = last("month", "2027-01-01 00:00:30");
    expect(s.range).toEqual({ from: "2026-12-01 00:00:00", to: "2027-01-01 00:00:00" });
    expect(s.label.en).toBe("last month (December 2026)");
  });
  it("last month on 1 Mar 2028 is the 29-day February; on 31 Mar 2026 the 28-day February", () => {
    expect(last("month", "2028-03-01 10:00:00").range).toEqual({ from: "2028-02-01 00:00:00", to: "2028-03-01 00:00:00" });
    expect(last("month", "2026-03-31 23:59:59").range).toEqual({ from: "2026-02-01 00:00:00", to: "2026-03-01 00:00:00" });
  });
  it("last week on a Monday, on a Sunday, and across the year", () => {
    expect(last("week", "2026-11-09 00:00:00").range).toEqual({ from: "2026-11-02 00:00:00", to: "2026-11-09 00:00:00" });
    expect(last("week", "2026-11-08 23:59:59").range).toEqual({ from: "2026-10-26 00:00:00", to: "2026-11-02 00:00:00" });
    const y = last("week", "2027-01-04 09:00:00");
    expect(y.range).toEqual({ from: "2026-12-28 00:00:00", to: "2027-01-04 00:00:00" });
    expect(y.label.en).toBe("last week (28 Dec to 3 Jan)");
  });
  it("last week just after midnight IST on a Monday (UTC still Sunday) is the week just ended", () =>
    expect(last("week", "2026-11-09 00:10:00").range).toEqual({ from: "2026-11-02 00:00:00", to: "2026-11-09 00:00:00" }));
  it("last quarter in January is October to December of the year before", () =>
    expect(last("quarter", "2027-01-10 10:00:00").range).toEqual({ from: "2026-10-01 00:00:00", to: "2027-01-01 00:00:00" }));
  it("a comparison is two contiguous windows of equal length, for every key, also just after midnight", () => {
    for (const now of [NOW, "2026-11-07 00:20:00", "2027-01-01 00:00:30", "2028-03-01 00:00:00"])
      for (const k of ["daily", "weekly", "monthly", "quarterly"] as const) {
        const c = compareOf(k, now)!;
        const len = (x: { from: string; to: string }) => ms(x.to) - ms(x.from);
        expect(len(c.cur.range!)).toBe(len(c.prev.range!));
        expect(c.prev.range!.to).toBe(c.cur.range!.from);
        expect(ms(c.cur.range!.to)).toBe(ms(now) + 1000);
        expect(len(c.cur.range!)).toBe({ daily: 24, weekly: 168, monthly: 720, quarterly: 2160 }[k] * H);
      }
  });
  it("prevOf: September before October, November before December across the year, none for today or right now", () => {
    expect(prevOf({ kind: "last", unit: "month" }, NOW)!.range).toEqual({ from: "2026-09-01 00:00:00", to: "2026-10-01 00:00:00" });
    expect(prevOf({ kind: "last", unit: "month" }, "2027-01-03 09:00:00")!.range).toEqual({ from: "2026-11-01 00:00:00", to: "2026-12-01 00:00:00" });
    expect(prevOf({ kind: "day", back: 1 }, "2027-01-01 08:00:00")!.range).toEqual({ from: "2026-12-30 00:00:00", to: "2026-12-31 00:00:00" });
    expect(prevOf({ kind: "day", back: 0 }, NOW)).toBeNull();
    expect(prevOf({ kind: "now" }, NOW)).toBeNull();
  });
  it("a frozen clock gives the same dates every time (no hidden Date.now)", () => {
    const specs: PeriodSpec[] = [{ kind: "day", back: 0 }, { kind: "last", unit: "month" }, { kind: "since", month: 9, day: 1 }, { kind: "month", month: 8, year: null }];
    for (const s of specs) expect(spanOf(s, NOW)).toEqual(spanOf(s, NOW));
  });
  it("'in November' on 1 Nov just after midnight is November to date; 'in December' in November is refused (a year back, too old)", () => {
    expect(spanOf({ kind: "month", month: 10, year: null }, "2026-11-01 00:05:00")!.range).toEqual({ from: "2026-11-01 00:00:00", to: "2026-11-01 00:05:01" });
    expect(spanOf({ kind: "month", month: 11, year: null }, NOW)).toBeNull();
  });
});
