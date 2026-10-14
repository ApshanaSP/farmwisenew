import { describe, expect, it, vi } from "vitest";

// only the pure reading is tested here: no database is opened
vi.mock("@/lib/db", () => ({ default: {} }));
vi.mock("@/lib/collector/db", () => ({ default: {}, ops: (t: string) => t }));
const { progressOf, withProgress } = await import("./complaint-progress");

const FILED = "2026-10-10 09:00:00";
const step = (step: string, at: string, note: string | null = null, reportId: number | null = null) => ({ step, at, note, reportId });
const dec = (decision: string, at: string, role = "collector", note: string | null = null) => ({ decision, at, note, role });

describe("a resident's tracker follows the work on the incident", () => {
  it("shows nothing new until someone acts", () => {
    expect(progressOf("INC-1", FILED, [], [], [])).toBeNull();
  });
  it("approve, send with photos, Collector verifies: Verified by Collector, checked by the Collector", () => {
    const p = progressOf("INC-1", FILED,
      [step("approve", "2026-10-10 11:00:00"), step("send", "2026-10-11 16:00:00", "Drain desilted, 40 m", 7)],
      [dec("verify", "2026-10-12 10:00:00")],
      [{ reportId: 7, photoDir: "20261011-0123456789abcdef", photos: ["1.jpg", "2.jpg"] }])!;
    expect(p.status).toBe("Verified by Collector");
    expect(p.checkedBy).toBe("collector");
    expect(p.journey.map((j) => j.status)).toEqual(["Approved by Department Officer", "Completed - Pending Collector Verification", "Verified by Collector"]);
    expect(p.journey[1].remarks).toBe("Work done: Drain desilted, 40 m");
    expect(p.photos).toEqual(["/api/officer/photos/20261011-0123456789abcdef/1.jpg", "/api/officer/photos/20261011-0123456789abcdef/2.jpg"]);
  });
  it("work the department closes itself reads Resolved by Department, never Verified by Collector", () => {
    // the close is stored as a step and as a 'resolve' decision by the officer at the same time
    const p = progressOf("INC-1", FILED, [step("approve", "2026-10-10 11:00:00"), step("close", "2026-10-11 16:00:00", "Light replaced")],
      [dec("resolve", "2026-10-11 16:00:00", "department_officer", "Closed by the department: Light replaced")], [])!;
    expect(p.status).toBe("Resolved by Department");
    expect(p.checkedBy).toBe("department");
    expect(p.journey).toHaveLength(2);
  });
  it("work returned by the Collector goes back to In Progress; a rejection gives the stage and reason", () => {
    const back = progressOf("INC-1", FILED, [step("send", "2026-10-11 16:00:00")], [dec("reopen", "2026-10-12 10:00:00")], [])!;
    expect(back.status).toBe("In Progress");
    expect(back.checkedBy).toBeNull();
    const no = progressOf("INC-1", FILED, [], [dec("reject", "2026-10-12 10:00:00", "collector", "Private property, not a civic issue")], [])!;
    expect(no).toMatchObject({ status: "Rejected", rejectedStage: "Collector", remarks: "Private property, not a civic issue" });
  });
  it("ignores work on the incident from before the complaint was filed, notes and escalations", () => {
    expect(progressOf("INC-1", FILED, [step("approve", "2026-10-01 11:00:00")], [dec("verify", "2026-10-02 10:00:00")], [])).toBeNull();
    expect(progressOf("INC-1", FILED, [], [dec("note", "2026-10-11 10:00:00"), dec("escalate", "2026-10-11 11:00:00")], [])).toBeNull();
  });
  it("lays the journey over the complaint's own history once", () => {
    const p = progressOf("INC-1", FILED, [step("approve", "2026-10-10 11:00:00")], [], [])!;
    const own = [{ status: "Complaint Filed", created_at: FILED }, { status: "Approved by Department Officer", created_at: "2026-10-10 11:00:00" }];
    expect(withProgress(own, p).map((h) => h.status)).toEqual(["Complaint Filed", "Approved by Department Officer"]);
    expect(withProgress([own[0]], p).map((h) => h.status)).toEqual(["Complaint Filed", "Approved by Department Officer"]);
  });
});
