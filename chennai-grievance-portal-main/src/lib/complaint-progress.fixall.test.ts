import { describe, expect, it, vi } from "vitest";

// officer-day-28: after the Collector sent the work back, the citizen still saw the rejected report's pictures under "Photos of the
// work done", next to "In Progress: returned to the department for more work". Photos were taken from every report since filing,
// whatever happened to the report after. Only the pure reading is tested here: no database is opened.
vi.mock("@/lib/db", () => ({ default: {} }));
vi.mock("@/lib/collector/db", () => ({ default: {}, ops: (t: string) => t }));
const { progressOf } = await import("./complaint-progress");

const FILED = "2026-10-10 09:00:00";
const step = (step: string, at: string, note: string | null = null, reportId: number | null = null) => ({ step, at, note, reportId });
const dec = (decision: string, at: string, role = "collector", note: string | null = null) => ({ decision, at, note, role });
const REPORTS = [
  { reportId: 7, photoDir: "20261011-aaaaaaaaaaaaaaaa", photos: ["1.jpg", "2.jpg"] },
  { reportId: 9, photoDir: "20261014-bbbbbbbbbbbbbbbb", photos: ["3.jpg"] }
];

describe("officer-day-28: photos of the work done are only those of a report that still stands", () => {
  it("sent back by the Collector: In Progress, and the returned report's photos are gone", () => {
    const p = progressOf("INC-1", FILED, [step("approve", "2026-10-10 11:00:00"), step("send", "2026-10-11 16:00:00", "Drain desilted", 7)],
      [dec("reopen", "2026-10-12 10:00:00")], REPORTS)!;
    expect(p.status).toBe("In Progress");
    expect(p.journey.at(-1)?.remarks).toMatch(/returned it to the department/);
    expect(p.photos).toEqual([]);
  });

  it("sent back, then reported again: only the new report's photos", () => {
    const p = progressOf("INC-1", FILED,
      [step("approve", "2026-10-10 11:00:00"), step("send", "2026-10-11 16:00:00", "Drain desilted", 7), step("send", "2026-10-14 12:00:00", "Silt carted away", 9)],
      [dec("reopen", "2026-10-12 10:00:00")], REPORTS)!;
    expect(p.status).toBe("Completed - Pending Collector Verification");
    expect(p.photos).toEqual(["/api/officer/photos/20261014-bbbbbbbbbbbbbbbb/3.jpg"]);
  });

  it("a report the Collector accepts keeps its photos", () => {
    const p = progressOf("INC-1", FILED, [step("send", "2026-10-11 16:00:00", "Drain desilted", 7)], [dec("verify", "2026-10-12 10:00:00")], REPORTS)!;
    expect(p.photos).toHaveLength(2);
  });
});
