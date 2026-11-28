/**
 * The case lifecycle's rules (28 Nov): the severe rule and the report's remarks / photo rule, the inquiry tags, which reopen is a
 * "Reopened" case, and what the resident's tracker says when the Collector reopens a closed complaint.
 */
import { describe, expect, it, vi } from "vitest";
import { SEVERE_CLOSE, answerRefusal, answerTag, answeredInquiry, collectorRemarkRefusal, isSevere, reportChoices, reportRefusal, wasReopened } from "./rules";
import { stepRefusal } from "@/lib/officer/stages";

vi.mock("@/lib/db", () => ({ default: {} }));
vi.mock("@/lib/collector/db", () => ({ default: {}, ops: (t: string) => t }));
vi.mock("@/lib/manu/sms", () => ({ sendPetitionSms: async () => undefined }));
vi.mock("@/lib/dataset/append", () => ({ appendStatusChangeToDataset: async () => undefined }));
const { progressOf, REOPENED_WORDS } = await import("@/lib/complaint-progress");

describe("the severe rule and the completion report", () => {
  it("severe is the product's one definition: severity_level Severe", () => {
    expect(isSevere("Severe")).toBe(true);
    expect(isSevere("severe ")).toBe(true);
    for (const s of ["High", "Medium", "Low", "", null, undefined]) expect(isSevere(s)).toBe(false);
  });

  it("a severe case is never closed by the department, whatever it sends", () => {
    expect(reportRefusal("close", "Severe", "Drain cleared and slab replaced", 3)).toBe(SEVERE_CLOSE);
    expect(stepRefusal("close", "action", "Severe")).toBe(SEVERE_CLOSE);
    expect(reportChoices("Severe")).toEqual(["send"]);
  });

  it("a severe case goes to the Collector with remarks AND at least one photo", () => {
    expect(reportRefusal("send", "Severe", "Drain cleared", 0)).toMatch(/at least one photo/);
    expect(reportRefusal("send", "Severe", "", 2)).toMatch(/Write remarks/);
    expect(reportRefusal("send", "Severe", "Drain cleared", 1)).toBeNull();
  });

  it("any other case: closed with remarks (photo optional), or sent to the Collector with a photo", () => {
    expect(reportChoices("Medium")).toEqual(["close", "send"]);
    expect(reportRefusal("close", "Medium", "Bins cleared", 0)).toBeNull();
    expect(reportRefusal("close", "Low", "  ", 0)).toMatch(/Write remarks/);
    expect(reportRefusal("send", "High", "Bins cleared", 0)).toMatch(/Collector approves the work from your photos/);
    expect(reportRefusal("send", "High", "Bins cleared", 1)).toBeNull();
  });
});

describe("the Collector's reopen and questions", () => {
  it("a reopen is a Reopened case only when the case was closed at that moment", () => {
    expect(wasReopened("reopen", "verify", 1)).toBe(true);
    expect(wasReopened("reopen", "resolve", 1)).toBe(true);
    expect(wasReopened("reopen", "reject", 1)).toBe(true);
    // no decision before it: the pipeline's own flag says whether it was closed
    expect(wasReopened("reopen", null, 0)).toBe(true);
    expect(wasReopened("reopen", null, 1)).toBe(false);
    // My Tasks' send-back of work waiting for the Collector, after an earlier reopen: a return for rework
    expect(wasReopened("reopen", "reopen", 0)).toBe(false);
    expect(wasReopened("verify", "resolve", 0)).toBe(false);
  });

  it("the answer's tag names its question; other tags are not answers", () => {
    expect(answeredInquiry(answerTag(42))).toBe(42);
    for (const t of ["inquiry", "answer:", "answer:x", "GCC-SWM", null, 7]) expect(answeredInquiry(t)).toBeNull();
  });

  it("the remarks are required, in plain words", () => {
    expect(collectorRemarkRefusal("reopen", "bad")).toMatch(/still wrong/);
    expect(collectorRemarkRefusal("ask", "")).toMatch(/question/);
    expect(collectorRemarkRefusal("reopen", "Garbage is back at the same spot")).toBeNull();
    expect(collectorRemarkRefusal("ask", "x".repeat(2001))).toMatch(/under 2000/);
    expect(answerRefusal("ok")).toMatch(/answer/);
    expect(answerRefusal("Cleared the whole street")).toBeNull();
  });
});

describe("the resident's tracker when the Collector reopens a closed complaint", () => {
  const filed = "2026-11-20 09:00:00";
  it("closed by the department, then reopened: In Progress, in plain words that it was reopened", () => {
    const p = progressOf("INC-R", filed, [
      { id: 1, step: "approve", at: "2026-11-20 10:00:00", note: null, reportId: null },
      { id: 2, step: "close", at: "2026-11-21 10:00:00", note: "Cleared", reportId: 5 }
    ], [
      { id: 1, decision: "resolve", at: "2026-11-21 10:00:00", note: "Closed by the department: Cleared", role: "department_officer" },
      { id: 2, decision: "reopen", at: "2026-11-22 11:00:00", note: "Garbage is back", role: "collector" }
    ], [{ reportId: 5, photoDir: "20261121-0123456789abcdef", photos: ["1.jpg"] }]);
    expect(p?.status).toBe("In Progress");
    expect(p?.journey.at(-1)).toMatchObject({ status: "In Progress", stage: "Collector", remarks: REOPENED_WORDS });
    // the Collector's own remark is for the department, not the resident; the photos of the report it reopened are not "the work done"
    expect(JSON.stringify(p)).not.toContain("Garbage is back");
    expect(p?.photos).toEqual([]);
  });

  it("a send-back of work waiting for the Collector keeps its own words", () => {
    const p = progressOf("INC-S", filed, [{ id: 1, step: "send", at: "2026-11-21 10:00:00", note: "Done", reportId: null }],
      [{ id: 1, decision: "reopen", at: "2026-11-21 12:00:00", note: "Photos unclear", role: "collector" }], []);
    expect(p?.journey.at(-1)?.remarks).toBe("The Collector's office returned it to the department for more work.");
  });
});
