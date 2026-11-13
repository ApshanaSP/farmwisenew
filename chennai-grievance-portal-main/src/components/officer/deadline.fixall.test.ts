import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// officer-day-10: the officer was never shown a grievance's own deadline: the list (ID, Grievance, Stage, Severity, Location,
// Complaints, Reported) and the drawer (Reported, First source, Linked complaints, Field officer) had no due date and no "missed",
// although the API sent due_at; only the overdue and due-in-24-hours counts existed.
vi.mock("@/components/manu/PetitionOriginal", () => ({ default: () => null }));
// this vitest config compiles .tsx with the classic JSX runtime
(globalThis as { React?: unknown }).React = React;

const NOW = "2026-10-14 12:00:00";
const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("officer-day-10: the officer sees each grievance's own deadline", () => {
  it("the drawer's facts: the due time, and 'missed' in red once it has passed on open work", async () => {
    const { Deadline } = await import("./Drawer");
    const late = renderToStaticMarkup(createElement(Deadline, { r: { due_at: "2026-10-13 09:00:00", stage: "action" }, now: NOW }));
    expect(text(late)).toMatch(/^Deadline13 Oct.* · missed$/);
    expect(late).toContain("var(--sev)");
    const due = renderToStaticMarkup(createElement(Deadline, { r: { due_at: "2026-10-15 09:00:00", stage: "new" }, now: NOW }));
    expect(text(due)).toMatch(/^Deadline15 Oct/);
    expect(due).not.toContain("missed");
    // the pipeline's breach counts as missed; a closed case's deadline is shown but never "missed"
    expect(text(renderToStaticMarkup(createElement(Deadline, { r: { due_at: "2026-10-15 09:00:00", stage: "sent", breached: 1 }, now: NOW })))).toContain("missed");
    expect(text(renderToStaticMarkup(createElement(Deadline, { r: { due_at: "2026-10-13 09:00:00", stage: "verified" }, now: NOW })))).not.toContain("missed");
    expect(text(renderToStaticMarkup(createElement(Deadline, { r: { due_at: null, stage: "new" }, now: NOW })))).toBe("Deadline—");
  });
  it("the list has a Deadline column with the same words", async () => {
    const { DeadlineCell } = await import("./Overlays");
    const cell = renderToStaticMarkup(createElement("table", null, createElement("tbody", null, createElement("tr", null,
      createElement(DeadlineCell, { r: { due_at: "2026-10-13 09:00:00", stage: "approved" }, now: NOW })))));
    expect(text(cell)).toMatch(/13 Oct.* · missed/);
  });
});
