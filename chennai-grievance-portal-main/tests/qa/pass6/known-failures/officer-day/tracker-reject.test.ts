// QA pass 6, officer-day: what the citizen's tracker draws for a complaint the Collector rejected before anyone worked on it
// (live: complaint 2026-670DUN, history = Complaint Filed, Rejected).
import React, { createElement } from "react";
(globalThis as unknown as { React: typeof React }).React = React; // the classic JSX transform of the test runner
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StatusTracker from "@/components/StatusTracker";

describe("tracker: rejected by the Collector, never worked", () => {
  it("does not tick steps that never happened", () => {
    const html = renderToStaticMarkup(createElement(StatusTracker, {
      status: "Rejected", rejectedStage: "Collector", remarks: "duplicate of an earlier complaint",
      history: [
        { status: "Complaint Filed", stage: "Citizen", remarks: "Complaint registered by citizen.", created_at: "2026-11-12 14:29:10" },
        { status: "Rejected", stage: "Collector", remarks: "duplicate of an earlier complaint", created_at: "2026-11-12 14:29:12" }
      ]
    }));
    const items = [...html.matchAll(/<li class="([^"]*)"[^>]*>.*?<b>([^<]*)<\/b>/g)].map((m) => `${m[1].replace("ui-tl-i", "").trim()}: ${m[2]}`);
    console.log("tracker items:", JSON.stringify(items));
    const ticked = items.filter((x) => x.startsWith("done:")).map((x) => x.slice(6));
    expect(ticked).not.toContain("Approved by Department Officer");
    expect(ticked).not.toContain("Completed – pending Collector verification");
  });
});
