import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StatusTracker from "@/components/StatusTracker";

// officer-day-20: a complaint the Collector rejected before anyone worked on it (live 2026-670DUN: history Complaint Filed, Rejected)
// was drawn with "Approved by Department Officer", "In Progress" and "Completed – pending Collector verification" all ticked, because
// the rejecting stage (Collector = 4 steps), not the complaint's history, decided how many steps were done. The Collector may reject
// at any stage (officer-day-03, the owner's design), so only the history says what happened.
// this vitest config compiles .tsx with the classic JSX runtime
(globalThis as { React?: unknown }).React = React;

type Row = { status: string; stage?: string | null; remarks?: string | null; created_at: string };
const at = (m: number) => `2026-11-12 14:${String(m).padStart(2, "0")}:00`;
const hist = (...s: string[]): Row[] => s.map((status, i) => ({ status, stage: null, remarks: null, created_at: at(i) }));
function drawn(rejectedStage: "Department Officer" | "Collector", history: Row[]) {
  const html = renderToStaticMarkup(createElement(StatusTracker, { status: "Rejected", rejectedStage, remarks: "duplicate", history }));
  const items = [...html.matchAll(/<li class="([^"]*)"[^>]*>.*?<b>([^<]*)<\/b>/g)].map((m) => ({ state: m[1].replace("ui-tl-i", "").trim(), title: m[2] }));
  return { ticked: items.filter((x) => x.state === "done").map((x) => x.title), last: items.at(-1) };
}

describe("officer-day-20: a rejected complaint's tracker ticks only the steps its history shows", () => {
  it("rejected by the Collector straight after filing: only 'Complaint Filed' is ticked (the probe's live case)", () => {
    const d = drawn("Collector", hist("Complaint Filed", "Rejected"));
    expect(d.ticked).toEqual(["Complaint Filed"]);
    expect(d.last).toEqual({ state: "bad", title: "Rejected at the Collector stage" });
  });

  it("rejected by the Collector after the work was reported: every step up to the report is ticked", () => {
    const d = drawn("Collector", hist("Complaint Filed", "Approved by Department Officer", "In Progress", "Completed - Pending Collector Verification", "Rejected"));
    expect(d.ticked).toEqual(["Complaint Filed", "Pending Approval", "Approved by Department Officer", "In Progress", "Completed – pending Collector verification"]);
  });

  it("rejected while in progress after the Collector sent it back: up to 'In Progress', where it stood", () => {
    const d = drawn("Collector", hist("Complaint Filed", "Approved by Department Officer", "In Progress", "Completed - Pending Collector Verification", "In Progress", "Rejected"));
    expect(d.ticked.at(-1)).toBe("In Progress");
    expect(d.ticked).not.toContain("Completed – pending Collector verification");
  });

  it("rejected by the department before approving it: no approval is ticked", () => {
    const d = drawn("Department Officer", hist("Complaint Filed", "Rejected"));
    expect(d.ticked).toEqual(["Complaint Filed"]);
    expect(d.last?.title).toBe("Rejected at the Department Officer stage");
  });

  it("with no history to read, claims nothing beyond the filing", () => {
    expect(drawn("Collector", []).ticked).toEqual(["Complaint Filed"]);
  });
});
