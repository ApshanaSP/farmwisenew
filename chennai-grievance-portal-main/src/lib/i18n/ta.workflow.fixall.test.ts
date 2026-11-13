import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { translate } from "@/components/i18n/Translator";
import { ACTION_WORD } from "@/lib/security/stepup";
import { STAGE_LABEL, STEP_LABELS, TAB_LABEL } from "@/lib/officer/stages";

// officer-day-11: the workflow's own words had no Tamil unless a model translated them live (20 of 22 checked strings), so with no model
// key a Tamil reader saw the tracker, the officer's report form and the confirm box in English. They are now in the hand-checked list.
// translate() reads only that list (and this browser's cache, empty here): no model, no data/i18n/ta.json.

// the two probes' words (tests/qa/pass6/known-failures/officer-day/labels.test.ts and officer-words.test.ts)
const PROBE = [
  "Approved", "In progress", "Awaiting Collector", "Resolved", "Completed – pending Collector verification", "Resolved – checked by the department",
  "Verified by Collector", "Accepted by the department; work will be scheduled.", "The Collector's office returned it to the department for more work.",
  "The department checked the finished work and closed the complaint.", "Photos of the work done", "Journey",
  "Complete & close", "Close as done", "Complete & send to Collector", "Remarks · what was done", "Upload site photos",
  "Returned by the Collector for rework.", "Waiting for the Collector's verification", "Confirm it's you", "Your account password", "Confirm",
  "New", "In action", "Sent to Collector", "Verified", "Closed", "Returned", "Approve", "Received", "Waiting for your approval",
  "Collector Feedback", "Closed by your department", "Approving moves it to In action and assigns it to the field officer.",
  "Severe: the Collector verifies it. Remarks and photos go to the Collector.", "You verify this one: your remarks and photos are kept as the record.",
  "Photos of completed work", "Attach at least one photo of the completed work.", "Write remarks describing the work done."
];

describe("officer-day-11: the workflow's words have hand-checked Tamil", () => {
  it.each(PROBE)("%s", (w) => {
    const ta = translate(w);
    expect(ta, w).toBeTruthy();
    expect(ta).toMatch(/[\u0B80-\u0BFF]/);
  });

  it("every stage, tab and step label of the officer workflow, and every confirm-box title", () => {
    const labels = [...Object.values(STAGE_LABEL), ...Object.values(TAB_LABEL), ...STEP_LABELS, ...Object.values(ACTION_WORD)];
    expect(labels.filter((l) => !translate(l))).toEqual([]);
  });

  it("the citizen tracker's labels and journey remarks (read from the source, so a new one shows up here)", () => {
    const src = ["src/components/StatusTracker.tsx", "src/lib/complaint-progress.ts"].map((f) => fs.readFileSync(path.join(process.cwd(), f), "utf8")).join("\n");
    const fixed = [...src.matchAll(/"([A-Z][^"`${}]{6,120}[.a-z])"/g)].map((m) => m[1])
      .filter((s) => /^(Completed –|Resolved –|Accepted|Work |The (department|Collector)|Rejected by)/.test(s));
    expect(fixed.length).toBeGreaterThanOrEqual(8);
    expect(fixed.filter((s) => !translate(s))).toEqual([]);
  });

  it("the code box keeps the number of digits", () => {
    expect(translate("The 6-digit code from the email")).toBe("மின்னஞ்சலில் வந்த 6-இலக்கக் குறியீடு");
  });
});
