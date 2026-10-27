import { describe, expect, it } from "vitest";
import type { AlertLane } from "./alerts";
import { alertFacts, namesAlert } from "./aibrief";

// R-02 (27 Oct 2026, Cyclone Arnab day 2): the AI key points led with "The period was busier than before with 192
// incidents…" and never named the cyclone; the brief's facts held only "No IMD warning".
const arnab: AlertLane = {
  banner: { tone: "red", title: "Cyclone Arnab · CFM-DSS flood gauges not reporting", line: "" },
  event: { hazard: "cyclone", name: "Arnab" },
  sources: [], agreement: "news_only",
  agreementText: "Cyclone Arnab is in 14 news outlets (red alert for 3 other districts), but neither IMD nor NDMA has a warning for Chennai.",
  officialLevel: 0, newsOutlets: 14,
  stale: [{ source: "cfm", label: "CFM-DSS flood gauges", newest: "2026-10-20 06:30:00", hours: 177 }],
  fallback: null, status: { level: "watchful", reasons: [] }, news: []
};

describe("the day brief leads with an active alert (R-02)", () => {
  it("puts the alert first in the facts, with the silent feeds", () => {
    const { lines, must } = alertFacts(arnab);
    expect(lines[0]).toMatch(/^Active alert \(lead with this\): Cyclone Arnab/);
    expect(lines[0]).toContain("neither IMD nor NDMA has a warning for Chennai");
    expect(lines[1]).toBe("Not reporting during the alert: CFM-DSS flood gauges, silent 177 hours.");
    expect(must).toEqual(["Arnab", "cyclone"]);
  });

  it("refuses the headline that left the cyclone out, accepts one that names it", () => {
    const { must } = alertFacts(arnab);
    expect(namesAlert("The period was busier than before with 192 incidents, featuring severe flooding in Arumbakkam.", must)).toBe(false);
    expect(namesAlert("Cyclone Arnab is in 14 news outlets but has no official warning for Chennai; 7 severe incidents.", must)).toBe(true);
    expect(namesAlert("A cyclone watch: news reports a storm off the coast.", must)).toBe(true);
  });

  it("asks nothing extra on a calm day", () => {
    expect(alertFacts(null)).toEqual({ lines: [], must: [] });
    expect(alertFacts({ ...arnab, banner: null })).toEqual({ lines: [], must: [] });
    expect(namesAlert("A calm day with 40 incidents.", [])).toBe(true);
  });

  it("names a heavy-rain warning by its hazard when it has no name", () => {
    const { must } = alertFacts({ ...arnab, event: { hazard: "heavy_rain", name: null }, stale: [] });
    expect(must).toEqual(["heavy rain"]);
    expect(namesAlert("Heavy rain warning for Chennai today.", must)).toBe(true);
  });
});
