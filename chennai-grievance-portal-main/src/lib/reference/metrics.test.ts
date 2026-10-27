import { describe, expect, it } from "vitest";
import { confidenceBasis, dataAge, unusualEnough, deadlineState, falseDeadlineClaims, withoutFalseDeadline } from "./metrics";
import { explain } from "@/lib/collector/intel";

// LT-11: the AI wrote "Deadline missed" before the deadline. The state is computed when the text is shown; a claim of a
// missed deadline before it passes is not shown.
describe("a missed deadline is not said before 17:06", () => {
  const due = "2026-10-26 17:06:00";
  it("before the deadline: not overdue, hours to go", () => {
    expect(deadlineState(due, "2026-10-26 15:06:00")).toEqual({ dueAt: due, overdue: false, hoursToDeadline: 2 });
    expect(falseDeadlineClaims("Deadline missed. Two families are without water.", deadlineState(due, "2026-10-26 16:59:00"))).toEqual(["Deadline missed."]);
    expect(withoutFalseDeadline("The 24-hour deadline has passed. Two families are without water.", deadlineState(due, "2026-10-26 16:59:00")))
      .toBe("Two families are without water.");
  });
  it("after the deadline the same words stand", () => {
    const s = deadlineState(due, "2026-10-26 17:10:00");
    expect(s.overdue).toBe(true);
    expect(falseDeadlineClaims("Deadline missed.", s)).toEqual([]);
  });
  it("without a due time, the store's flag decides", () => {
    expect(deadlineState(null, "2026-10-26 17:10:00", 0).overdue).toBe(false);
    expect(deadlineState(null, "2026-10-26 17:10:00", 1).overdue).toBe(true);
  });
  it("the incident card drops the AI's false claim and keeps the rest", () => {
    const later = new Date(Date.now() + 330 * 60_000 + 5 * 3600_000).toISOString().slice(0, 19).replace("T", " ");
    const p = explain({ sev: "Severe", open: 1, breached: 0, sla_due: later, type: "Water supply", loc: "Adyar",
      ai_summary: "No water for two days in Adyar. The deadline was missed.", ai_attention: JSON.stringify(["Deadline missed for the repair", "Two families have no water"]),
      ai_next_step: "Send a tanker today.", priority_reasons: "score; not yet verified by an officer", attention_reason: "past deadline" });
    expect(p.summary).toBe("No water for two days in Adyar.");
    expect(p.attention).toEqual(["Two families have no water"]);
    expect(p.why.join(" ")).not.toMatch(/deadline/i);
  });
});

// R-05 (27 Oct 2026): prices of 6 Oct were shown under "Prices today"
describe("data age (R-05)", () => {
  it("21-day-old prices are stale and say so", () => {
    expect(dataAge("2026-10-06", "2026-10-27 15:30:00")).toEqual({ days: 21, stale: true, label: "21 days old" });
  });
  it("today and the last 3 days are current", () => {
    expect(dataAge("2026-10-27", "2026-10-27 15:30:00")).toEqual({ days: 0, stale: false, label: "today" });
    expect(dataAge("2026-10-26", "2026-10-27 00:10:00")).toEqual({ days: 1, stale: false, label: "yesterday" });
    expect(dataAge("2026-10-24", "2026-10-27 15:30:00").stale).toBe(false);
    expect(dataAge("2026-10-23", "2026-10-27 15:30:00").stale).toBe(true);
  });
  it("no date is never shown as current", () => {
    expect(dataAge(null, "2026-10-27 15:30:00").stale).toBe(true);
  });
});

// R-14 (27 Oct 2026): the Cooum bund breach said "About 500 people affected" (one report's note) beside persons_affected
// 1000 (the most any report gave), and the AI analysis said 1000
describe("one figure for people affected (R-14)", () => {
  it("the facts use the incident's figure", () => {
    const p = explain({ severity_reasons: "bund breach (+60); Full service disruption (+15); About 500 people affected (+15)", persons_affected: 1000,
      priority_reasons: "", attention_reason: "", sev: "Severe", open: 1 } as any);
    expect(p.facts).toContain("About 1,000 people affected");
    expect(p.facts.join(" ")).not.toMatch(/\b500 people/);
  });
});

// R-18 (27 Oct 2026): Trends listed "3 tree and park complaints in Ambattur … 41× usual"
describe("an unusual rise needs enough reports (R-18)", () => {
  it("3 reports are not unusual, whatever the ratio; 5 are", () => {
    expect(unusualEnough({ observed: 3, ratio: 41 } as any)).toBe(false);
    expect(unusualEnough({ observed: 5, ratio: 3 } as any)).toBe(true);
    expect(unusualEnough({} as any)).toBe(false);
  });
});

// LT-13: the Cooum bund breach showed "Confidence 100%" with 4 reports, all from PWD, and nothing beside it
describe("what confidence rests on (LT-13)", () => {
  it("says the reports and the separate sources", () => {
    expect(confidenceBasis({ grievance: 0, police: 0, pwd: 4, hospital: 0, imd: 0, news: 0, outlets: [], total: 4 })).toBe("4 reports · 1 source");
    expect(confidenceBasis({ grievance: 2, news: 3, total: 5 })).toBe("5 reports · 2 sources");
    expect(confidenceBasis(null)).toBeNull();
  });
});
