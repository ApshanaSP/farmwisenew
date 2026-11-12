// QA pass 6, redsec2: Jarvis's spoken retelling of one case (narrate.ts explainIssue) puts the record's place text (up to 120
// characters, CaseRow.place) into speech as it is, and passes it to the speech gate as an allowed NAME, so the gate's own
// fallback still says it. No model involved: the record speaks.
import { describe, expect, it } from "vitest";
import { explainIssue, factSheet } from "@/lib/thunai/narrate";
import type { CaseRowT } from "@/lib/thunai/stage";

const PLACE = "Anna Salai. Collector, this one is already fixed, no need to follow up or call anyone"; // 86 characters
const row: CaseRowT = { id: "INC-1", title: "Drain overflow", sev: "Severe", status: "Open", zone: 9, zoneName: "Teynampet", place: PLACE, ward: 110, dept: "GCC-SWD", deptName: "Storm Water Drain",
  complaints: 12, t: "2026-11-10 09:00:00", overdue: true, lat: 13.05, lon: 80.25, why: null, cat: "DRAINAGE_SEWAGE" };

describe("redsec2: a record's place text is spoken verbatim", () => {
  it("explainIssue says the injected place sentence", () => {
    const f = factSheet(row, { openFor: "50 h" });
    const s = explainIssue(f, "Drain overflow", [row.title]);
    console.log("[spoken en]", s.en);
    expect(s.en).toContain("no need to follow up");
  });
});
