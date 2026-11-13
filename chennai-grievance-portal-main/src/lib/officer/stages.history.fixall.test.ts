// Copy to: chennai-grievance-portal-main/src/lib/officer/stages.probe.fixall.test.ts (next to stages.fixall.test.ts)
//
// reviewerB-05 (officer-day-26, commit c4a0df1). stepsOf (stages.ts:37-41) still places a case by its stage alone whenever
// closedByDept is false. STAGE_SQL (src/lib/officer/data.ts:79-91) maps the Collector's 'reject' to 'closed', and any other
// Collector decision made before the department acted (resolve, verify, escalate) to 'verified'. So:
//   - a severe case the Collector rejected is drawn with all four steps done, "Verified" included (STAGE_INDEX.closed = 3 = last);
//   - a non-severe case the Collector rejected straight from New is drawn with "In action" done;
//   - a non-severe case sent before the rule and then verified by the Collector now loses its "Sent to Collector" step. It was drawn
//     correctly before c4a0df1, and stepsOf's own doc says "or one that was sent" keeps the four steps.
// officer-day-20 fixed the same "placed by stage, not by history" fault on the citizen's tracker in this batch.
// Only the first case can be probed without the case's history (the other two look like other valid inputs at this signature).
// Expected on 172fabd: fails ("Verified" is ticked for a rejected case).
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { stepsOf } from "@/lib/officer/stages";

vi.mock("@/components/manu/PetitionOriginal", () => ({ default: () => null }));
// this vitest config compiles .tsx with the classic JSX runtime
(globalThis as { React?: unknown }).React = React;

const bar = async (stage: "new" | "approved" | "action" | "sent" | "verified" | "closed", severe: boolean, closedByDept: boolean) => {
  const { Steps } = await import("@/components/officer/Drawer");
  const html = renderToStaticMarkup(createElement(Steps, { stage, severe, closedByDept }));
  const steps = [...html.matchAll(/<div(?: class="([^"]*)")?><s>.*?<\/s>([^<]+)<\/div>/g)].map((m) => ({ cls: m[1] ?? "", label: m[2] }));
  return { labels: steps.map((s) => s.label), done: steps.filter((s) => s.cls === "dn").map((s) => s.label) };
};

describe("reviewerB-05: a case the Collector rejected is never drawn as verified", () => {
  it("a severe case at 'closed' (the Collector's reject) does not tick 'Verified'", async () => {
    const b = await bar("closed", true, false);
    expect(b.done, `labels ${b.labels.join(" > ")}`).not.toContain("Verified");
  });

  it("stepsOf for the same case does not end on 'Verified'", () => {
    const s = stepsOf("closed", true, false);
    expect(s.labels[s.labels.length - 1]).not.toBe("Verified");
  });
});

describe("reviewerB-05: the step bar follows the case's history", () => {
  const H = (sent: boolean, acted: boolean) => ({ sent, acted });
  it("a severe case rejected after it was sent: four steps, ending 'Closed', not 'Verified'", () => {
    expect(stepsOf("closed", true, false, H(true, true))).toEqual({ labels: ["Received", "In action", "Sent to Collector", "Closed"], at: 3 });
  });
  it("a non-severe case rejected straight from New does not tick 'In action'", () => {
    expect(stepsOf("closed", false, false, H(false, false))).toEqual({ labels: ["Received", "Closed"], at: 1 });
  });
  it("a non-severe case sent before the rule and then verified keeps its 'Sent to Collector' step", () => {
    expect(stepsOf("verified", false, false, H(true, true))).toEqual({ labels: ["Received", "In action", "Sent to Collector", "Verified"], at: 3 });
  });
  it("the timeline labels historyOf reads are the ones grievanceDetail writes", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/lib/officer/data.ts", "utf8");
    const { DEPT_STEP_LABELS, historyOf } = await import("@/lib/officer/stages");
    for (const l of Object.values(DEPT_STEP_LABELS)) expect(src).toContain(`"${l}"`);
    expect(historyOf([{ label: "Approved by department" }])).toEqual({ sent: false, acted: true });
    expect(historyOf([{ label: "Rejected by Collector" }])).toEqual({ sent: false, acted: false });
  });
});
