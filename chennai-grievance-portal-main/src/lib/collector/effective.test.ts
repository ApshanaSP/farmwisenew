import { describe, expect, it } from "vitest";
import { DECISION_EFFECT, decisionEffect, effectiveSql, effectiveStatus } from "./effective";

describe("effective status (KPI-001)", () => {
  it("resolve and reject close an open incident", () => {
    expect(effectiveStatus(1, "Open", "resolve")).toEqual({ open: 0, status: "Resolved" });
    expect(effectiveStatus(1, "In progress", "reject")).toEqual({ open: 0, status: "Rejected" });
  });
  it("reopen opens a closed incident", () => {
    expect(effectiveStatus(0, "Resolved", "reopen")).toEqual({ open: 1, status: "Open" });
  });
  it("keeps the pipeline status with no decision, or one that does not change status", () => {
    expect(effectiveStatus(1, "Assigned", null)).toEqual({ open: 1, status: "Assigned" });
    expect(effectiveStatus(1, "Assigned", "verify")).toEqual({ open: 1, status: "Assigned" });
    expect(effectiveStatus(0, "Resolved", "escalate")).toEqual({ open: 0, status: "Resolved" });
    expect(decisionEffect("note")).toBeNull();
    expect(decisionEffect("constructor")).toBeNull();
  });
  it("builds the SQL from the same table of effects", () => {
    const s = effectiveSql("ops.collector_decisions");
    expect(s.latest).toContain("FROM ops.collector_decisions d");
    expect(s.latest).toContain("d.decision <> 'note'");
    expect(s.latest).toContain("ORDER BY d.decision_id DESC LIMIT 1");
    for (const [k, e] of Object.entries(DECISION_EFFECT)) {
      expect(s.open).toContain(`WHEN '${k}' THEN ${e.open}`);
      expect(s.status).toContain(`WHEN '${k}' THEN '${e.status}'`);
    }
    expect(s.open).toContain("ELSE i.is_open END");
    expect(s.status).toContain("ELSE i.status_std END");
  });
});
