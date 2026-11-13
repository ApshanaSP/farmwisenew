// Goes to: chennai-grievance-portal-main/src/lib/thunai/pass4-open-13.probe.fixall.test.ts
// reviewerF-05 (on pass4-open-13, 856c59d9): casesSay's Tamil line was rewritten to choose the singular or the plural, and the space after
// the colon was lost: before, "... முதலில் கவனிக்க வேண்டியவை: <first case>"; now "... வேண்டியவை:<first case>" (and "வேண்டியது:<...>"),
// in every Tamil case list that has a case past its deadline, singular or plural. No test reads that join.
// Expected today: FAILS on both. Passes once the template keeps ": " (screens.ts casesSay, the `late.length ?` branch).
import { describe, expect, it } from "vitest";
import { casesSay } from "@/lib/thunai/screens";
import type { CaseRowT } from "@/lib/thunai/stage";

const row = (id: string, overdue: boolean): CaseRowT => ({ id, title: "Drain overflow", sev: "Severe", status: "Open", zone: 13, zoneName: "Adyar", place: "Besant Nagar", ward: 178,
  dept: "GCC-SWD", deptName: "Storm Water Drain", complaints: 3, t: "2026-11-12 09:00:00", overdue, lat: 13.0, lon: 80.26, why: null, cat: "DRAINAGE_SEWAGE" }) as CaseRowT;

describe("reviewerF-05 (pass4-open-13): the Tamil case list keeps the space after its colon", () => {
  it("two past their deadline (plural)", () => {
    const { ta } = casesSay([row("INC-1", true), row("INC-2", true)], 2, null, "daily");
    expect(ta).toMatch(/வேண்டியவை: \S/);
  });
  it("one past its deadline (singular)", () => {
    const { ta } = casesSay([row("INC-1", true), row("INC-2", false)], 2, null, "daily");
    expect(ta).toMatch(/வேண்டியது: \S/);
  });
});
