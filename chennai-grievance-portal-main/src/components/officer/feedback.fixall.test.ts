import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { grievanceBriefing } from "./format";
import type { OfficerOverview } from "@/lib/officer/data";

// hunt2-ops-08: the officer's feedback and the PDF's "The Collector verified N reports and returned M for rework" were read from the 8
// newest decisions, a reject counted as rework and a bare resolve as a verified report. officer-day-05: a case the Collector rejected
// showed in the drawer with the green "Verified by Collector" chip, and the feedback card listed it as "Returned" with a rework icon.
vi.mock("@/components/manu/PetitionOriginal", () => ({ default: () => null }));
vi.mock("@/components/collector/app/SatMap", () => ({ default: () => null }));
// this vitest config compiles .tsx with the classic JSX runtime
(globalThis as { React?: unknown }).React = React;

const fb = (did: number, decision: string, note: string | null = null) =>
  ({ did, id: `INC-${did}`, decision, note, at: "2026-10-14 11:00:00", title: `Case ${did}`, type: "Garbage",
    kind: ({ verify: "verified", resolve: "resolved", reopen: "returned", reject: "rejected" } as Record<string, string>)[decision],
    ok: decision === "verify" || decision === "resolve" });

const ov = (feedback: ReturnType<typeof fb>[], feedbackCounts: Record<string, number>) => ({
  counts: { new: 0, action: 0, sent: 0, verified: 0, returned: 0, serious: 0, overdue: 0, newSerious: 0, due: 0 },
  periodInfo: { label: "Last 24 hours", buckets: 12, hours: 24 }, byType: [], map: { sevCounts: [] }, trend: [], byArea: { rows: [] }, news: [],
  feedback, feedbackCounts
}) as unknown as OfficerOverview;

describe("hunt2-ops-08: the briefing counts every decision of the period by what it did", () => {
  it("12 decisions (9 resolves, a verify, a reopen, a reject), of which the card holds 8: each counted once, under its own name", () => {
    const list = [fb(12, "reject", "Duplicate"), fb(11, "reopen", "Not done"), fb(10, "verify"), ...[9, 8, 7, 6, 5].map((k) => fb(k, "resolve"))];
    const lines = grievanceBriefing(ov(list, { verified: 1, resolved: 9, returned: 1, rejected: 1 }), null);
    const line = lines.find((l) => l.startsWith("The Collector"));
    expect(line).toBe("The Collector verified 1 report, returned 1 for rework, closed 9 without a report and rejected 1 in this period.");
  });
  it("nothing decided: no sentence; only verifies: no rework claimed", () => {
    expect(grievanceBriefing(ov([], { verified: 0, resolved: 0, returned: 0, rejected: 0 }), null).some((l) => l.startsWith("The Collector"))).toBe(false);
    expect(grievanceBriefing(ov([fb(1, "verify")], { verified: 2, resolved: 0, returned: 0, rejected: 0 }), null))
      .toContain("The Collector verified 2 reports in this period.");
  });
});

describe("officer-day-05: a case the Collector rejected is said as rejected, never verified or returned", () => {
  it("the feedback card: Rejected, with the reason, not Returned with the rework icon", async () => {
    const { FeedbackCard } = await import("./Cards");
    const c = { ov: ov([fb(1, "reject", "Duplicate of an earlier complaint"), fb(2, "reopen", "Photos unclear"), fb(3, "resolve")], {}), now: "2026-10-14 12:00:00", openGrievance: () => undefined };
    const html = renderToStaticMarkup(createElement(FeedbackCard, { c: c as never }));
    const items = [...html.matchAll(/<b>(Case \d)<\/b><span class="loc">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]);
    expect(items).toEqual([
      ["Case 1", "Rejected by the Collector · Duplicate of an earlier complaint"],
      ["Case 2", "Returned for rework · Photos unclear"],
      ["Case 3", expect.stringMatching(/^Closed by the Collector · /)]
    ]);
  });
  it("the drawer's footer for a rejected case: rejected, when and why; not the green 'Verified by Collector'", async () => {
    const { Outcome } = await import("./Drawer");
    const html = renderToStaticMarkup(createElement(Outcome, { stage: "closed", closedByDept: false, rejected: { t: "2026-10-14 11:00:00", note: "Duplicate" } }));
    expect(html).toContain("Rejected by the Collector");
    expect(html).toContain("Duplicate");
    expect(html).not.toContain("Verified");
    expect(html).not.toContain("sev-low");
    const done = renderToStaticMarkup(createElement(Outcome, { stage: "verified", closedByDept: false, rejected: null }));
    expect(done).toContain("Verified by Collector");
  });
});
