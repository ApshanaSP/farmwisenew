// QA pass 6, officer-day: what the citizen's tracker promises for a complaint the department closes itself, and whether the
// workflow's words (tracker, officer report, confirm box) have Tamil without a model (hand-checked list or the cached data/i18n/ta.json).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chainFor } from "@/components/StatusTracker";
import { translate } from "@/components/i18n/Translator";
import { progressOf } from "@/lib/complaint-progress";

describe("citizen tracker for a non-severe online complaint", () => {
  it("an approved complaint (every online complaint is Medium, closed by the department) is shown the Collector's steps next", () => {
    const chain = chainFor("Approved by Department Officer");
    console.log("chain after approval:", JSON.stringify(chain));
    // the department closes it: the Collector's verification never comes
    expect(chain).not.toContain("Verified by Collector");
  });
  it("a Collector 'resolve' on a complaint nobody worked tells the resident the Collector checked the work", () => {
    const p = progressOf("INC-W-X", "2026-11-12 10:00:00", [], [{ decision: "resolve", at: "2026-11-12 10:05:00", note: null, role: "collector" }], []);
    console.log("progress:", JSON.stringify(p));
    expect(p?.journey.at(-1)?.remarks ?? "").not.toMatch(/checked the work/);
  });
});

describe("Tamil for the workflow's words", () => {
  const cache = (() => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "i18n", "ta.json"), "utf8")) as Record<string, string>; } catch { return {}; } })();
  const words = [
    // citizen tracker (StatusTracker, track-complaints SHORT, complaint-progress journey remarks)
    "Approved", "In progress", "Awaiting Collector", "Resolved", "Completed – pending Collector verification", "Resolved – checked by the department",
    "Verified by Collector", "Accepted by the department; work will be scheduled.", "The Collector's office returned it to the department for more work.",
    "The department checked the finished work and closed the complaint.", "Photos of the work done", "Journey",
    // officer report and the confirm box
    "Complete & close", "Close as done", "Complete & send to Collector", "Remarks · what was done", "Upload site photos",
    "Returned by the Collector for rework.", "Waiting for the Collector's verification", "Confirm it's you", "Your account password", "Confirm"
  ];
  it("each has Tamil without asking a model", () => {
    const missing = words.filter((w) => translate(w) == null && cache[w] == null);
    console.log("no Tamil without a model:", JSON.stringify(missing));
    expect(missing).toEqual([]);
  });
});
