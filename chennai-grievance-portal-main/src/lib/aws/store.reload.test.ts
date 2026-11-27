import { describe, expect, it } from "vitest";

// hosted-jarvis C3 (27 Nov): the copy that does not save reloads the durable store every 5 minutes, and every reload bumped the data epoch,
// emptying every cache (the lexicon, the brain's cases table, the insights) on the hosted copy's one core. Now a reload bumps it only when
// AWS handed over other rows than at the last load, or one of this copy's own changes could not be kept over them.
const { durableSignature, reloadChanged } = await import("./store");

describe("a reload of the durable store bumps the data epoch only when something changed", () => {
  const rows = () => ({
    complaints: [{ id: 1, complaint_code: "2026-119FJQ", status: "Complaint Filed" }, { id: 2, complaint_code: "2026-225QED", status: "Approved by Department Officer" }],
    officer_steps: [{ step_id: 7, incident_id: "INC-20261109-5D433C", step: "approve" }]
  });

  it("the same rows give the same fingerprint, whatever order the load lists them in", async () => {
    const a = rows(), b = rows();
    b.complaints.reverse();
    const reordered = { officer_steps: b.officer_steps, complaints: b.complaints };
    expect(await durableSignature(reordered)).toBe(await durableSignature(a));
  });

  it("a new row, a changed value or a removed row gives another", async () => {
    const base = await durableSignature(rows());
    const added = rows(); added.officer_steps.push({ step_id: 8, incident_id: "INC-20261109-5D433C", step: "close" });
    const changed = rows(); changed.complaints[0].status = "Resolved by Department";
    const removed = rows(); removed.complaints.pop();
    for (const r of [added, changed, removed]) expect(await durableSignature(r)).not.toBe(base);
    // an empty table is not the same as no table
    expect(await durableSignature({ ...rows(), followups: [] })).not.toBe(base);
  });

  it("reloadChanged: the same fingerprint and nothing lost is no change; anything else is", () => {
    expect(reloadChanged("abc", "abc", 0)).toBe(false);
    expect(reloadChanged("abc", "abd", 0)).toBe(true);
    expect(reloadChanged("abc", "abc", 1)).toBe(true); // a local change that could not be kept over the new rows
    expect(reloadChanged(undefined, "abc", 0)).toBe(true); // loaded by an older version of the module: no fingerprint to compare
  });
});
