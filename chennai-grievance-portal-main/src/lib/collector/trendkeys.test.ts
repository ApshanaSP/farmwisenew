import { describe, expect, it } from "vitest";
import { trendKeys } from "./insights";

// Hunter A, A2 (BUG-008): on an IST server after midnight every key was a Sunday (all weekly values 0); on a UTC server on a
// Monday morning the last full week was dropped. The keys must be the Mondays SQL's WEEKDAY() buckets return.
describe("Trends week keys", () => {
  it.each([["2026-11-04 03:00:00"], ["2026-11-04 19:12:00"], ["2026-11-02 03:00:00"], ["2026-11-08 23:59:00"]])("%s: twelve Mondays ending the week before", (now) => {
    const { weeks } = trendKeys(now);
    expect(weeks).toHaveLength(12);
    for (const k of weeks) expect(new Date(`${k}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(weeks[11]).toBe("2026-10-26");
  });
  it("months are the last six, ending this month", () => expect(trendKeys("2026-11-04 03:00:00").months).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]));
});
