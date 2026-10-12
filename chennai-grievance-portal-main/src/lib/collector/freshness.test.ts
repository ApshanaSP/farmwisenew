import { describe, expect, it } from "vitest";
import { ago, feedsForAnswer, freshnessLine, istNow, minutesBetween, staleFeeds } from "./freshness";

const NOW = "2026-10-12 15:00:00";

describe("feed freshness (FRESH-001)", () => {
  it("flags a feed more than twice its refresh interval behind, with the expected message", () => {
    const s = staleFeeds([{ source: "news", okAt: "2026-10-12 09:00:00", targetMin: 60 }], NOW);
    expect(s).toHaveLength(1);
    expect(freshnessLine(s[0])).toBe("News last collected 6 hours ago; today's view may be incomplete.");
  });
  it("does not warn about fresh feeds, or at exactly twice the interval", () => {
    expect(staleFeeds([
      { source: "news", okAt: "2026-10-12 14:30:00", targetMin: 60 },
      { source: "imd", okAt: "2026-10-12 13:00:00", targetMin: 60 },
      { source: "police", okAt: "2026-10-11 16:00:00", targetMin: 1440 }
    ], NOW)).toEqual([]);
  });
  it("never invents a time: no interval means no verdict; never collected says so", () => {
    expect(staleFeeds([{ source: "cfm", okAt: "2026-01-01 00:00:00", targetMin: null }], NOW)).toEqual([]);
    const s = staleFeeds([{ source: "cpcb", okAt: null, targetMin: 60 }], NOW);
    expect(freshnessLine(s[0])).toBe("Air quality (CPCB) has not been collected yet; today's view may be incomplete.");
  });
  it("orders the most behind first", () => {
    const s = staleFeeds([
      { source: "news", okAt: "2026-10-12 09:00:00", targetMin: 60 },
      { source: "cpcb", okAt: "2026-10-10 15:00:00", targetMin: 60 }
    ], NOW);
    expect(s.map((x) => x.source)).toEqual(["cpcb", "news"]);
    expect(freshnessLine(s[0], "this answer")).toBe("Air quality (CPCB) last collected 2 days ago; this answer may be incomplete.");
  });
  it("reads times and the clock in IST", () => {
    expect(minutesBetween("2026-10-12 09:00:00", NOW)).toBe(360);
    expect(minutesBetween("not a date", NOW)).toBeNull();
    expect(istNow(Date.UTC(2026, 9, 12, 9, 30, 0))).toBe("2026-10-12 15:00:00");
    expect(ago(45)).toBe("45 minutes ago");
    expect(ago(60 * 25)).toBe("25 hours ago");
    expect(ago(1)).toBe("1 minute ago");
  });
  it("finds the feeds behind an answer", () => {
    const env = (m: string) => (m === "aqi" ? "cpcb" : m === "rainfall_24h_mm" ? "imd" : null);
    expect(feedsForAnswer([{ tool: "environment", args: { metric: "aqi" } }], [], env)).toEqual(["cpcb"]);
    expect(feedsForAnswer([{ tool: "news_gaps" }])).toEqual(["news"]);
    expect(feedsForAnswer([{ tool: "mandi_prices" }])).toEqual([]);
    expect(feedsForAnswer([{ tool: "zones" }])).toContain("news");
    expect(feedsForAnswer([], ["intel.documents"])).toEqual(["news"]);
  });
});
