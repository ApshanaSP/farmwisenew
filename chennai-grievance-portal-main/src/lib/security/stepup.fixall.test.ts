import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GRANT_HEADER, issueGrant, requireConfirm, scopeHash } from "./stepup";

// officer-day-14: a "Confirm it's you" grant was good for 5 minutes and any number of uses. After the Collector sent a closed case
// back, the same report (same remarks, same photo) was replayed with the old grant and closed the case again without the password.
const S = { userId: 12, email: "officer@test", role: "department_officer" as const, departmentId: 4, tv: 1 };
const SCOPE = { id: "INC-W-2026-807AIC", step: "close", remarks: "Pothole filled and levelled.", photos: ["ab".repeat(32)] };
const req = (grant: string) => new NextRequest("http://x/api/officer/grievances/INC-W-2026-807AIC/report", { method: "POST", headers: { [GRANT_HEADER]: grant } });

describe("officer-day-14: a grant does its one action once", () => {
  it("the first request with the grant passes; the same request again asks for the password again", async () => {
    const g = await issueGrant(S, "officer_report", scopeHash(SCOPE), "password");
    expect((await requireConfirm(req(g), S, "officer_report", "Close case", SCOPE)).ok).toBe(true);
    const again = await requireConfirm(req(g), S, "officer_report", "Close case", { ...SCOPE });
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.res.status).toBe(428);
      expect((await again.res.json()).error).toMatch(/already used/);
    }
  });

  it("a refused try does not spend the grant: the right request still passes with it after a wrong one", async () => {
    const g = await issueGrant(S, "officer_report", scopeHash(SCOPE), "password");
    expect((await requireConfirm(req(g), S, "officer_report", "", { ...SCOPE, remarks: "changed" })).ok).toBe(false);
    expect((await requireConfirm(req(g), S, "officer_report", "", SCOPE)).ok).toBe(true);
  });

  it("two grants for the same thing are each good once", async () => {
    const g1 = await issueGrant(S, "officer_report", scopeHash(SCOPE), "password");
    const g2 = await issueGrant(S, "officer_report", scopeHash(SCOPE), "password");
    expect(g1).not.toBe(g2);
    expect((await requireConfirm(req(g1), S, "officer_report", "", SCOPE)).ok).toBe(true);
    expect((await requireConfirm(req(g2), S, "officer_report", "", SCOPE)).ok).toBe(true);
    expect((await requireConfirm(req(g1), S, "officer_report", "", SCOPE)).ok).toBe(false);
  });
});
