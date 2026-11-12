/**
 * redteam-gate: P6-027 masked an online complaint's text on its console case (onlineCase). The desk's "came before" check
 * (findRepeats, src/lib/manu/repeat.ts:157) still reads the same complaint's title raw from `complaints` and returns it as
 * matches[].problem to the Manu Desk operator: a whole Aadhaar number the citizen typed reaches a staff screen.
 */
import { describe, expect, it, vi } from "vitest";

const ONLINE = { code: "2026-467UPC", filed_at: "2026-11-12 16:00:00", status: "Complaint Filed", problem: "Garbage not cleared, my Aadhaar 2345 6789 1234",
  mobile_number: "9000000001", first_name: "Test", street_address: "1 Test Street", ward_number: 170, dept_name: "Solid Waste Management Department" };
vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[], []] }, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/db", () => ({ connectionSettings: () => ({}), default: { query: async (sql: string) => (/FROM complaints c LEFT JOIN departments/.test(sql) ? [[ONLINE], []] : [[], []]) } }));
const { findRepeats } = await import("@/lib/manu/repeat");
const { onlineCase } = await import("@/lib/manu/cases");
const AADHAAR_RUN = /(?:\d[\s-]?){12}/;

describe("redteam-gate P6-027: the desk's repeat check shows an online complaint's whole Aadhaar number", () => {
  it("findRepeats returns the online complaint's title masked", async () => {
    const r = await findRepeats({ mobile: "9000000001", name: null, street: null, ward: 170, dept: null, problem: "Garbage again" });
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.matches[0].problem).not.toMatch(AADHAAR_RUN);
  });
});

describe("redteam-gate P6-027: 12-digit shapes maskAadhaar does not take (shared with the desk)", () => {
  // 12 digits written 5-7, 6-6, 2-4-6 or one digit at a time are still a whole Aadhaar number on the Collector's case
  for (const t of ["Aadhaar 23456 7891234", "Aadhaar 234567 891234", "Aadhaar 2 3 4 5 6 7 8 9 1 2 3 4", "Aadhaar 23-4567-891234"]) {
    it(`onlineCase title "${t}"`, () => {
      const c = onlineCase({ complaint_code: "2026-1AAAAA", created_at: "2026-11-12 16:00:00", title: t, description: t, ward_number: 170, specific_location: null,
        street_address: "x", mobile_number: "9000000001", user_id: 5 }, null);
      expect(c.title).not.toMatch(AADHAAR_RUN);
    });
  }
});
