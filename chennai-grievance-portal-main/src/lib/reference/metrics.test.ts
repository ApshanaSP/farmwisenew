import { describe, expect, it } from "vitest";
import { deadlineState, falseDeadlineClaims, withoutFalseDeadline } from "./metrics";
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
