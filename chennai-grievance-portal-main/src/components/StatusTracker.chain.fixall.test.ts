// Fix-all run after QA pass 6, officer-day-06: the citizen's tracker was not told who will check the work, so every complaint, including
// the non-severe ones the department closes itself, was shown "Completed – pending Collector verification" and "Verified by Collector" next.
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rows: new Map<string, unknown[]>() }));
vi.mock("@/lib/collector/db", () => ({
  default: { query: async (sql: string) => [/FROM events/.test(sql) ? h.rows.get("events") ?? [] : /FROM incidents/.test(sql) ? h.rows.get("incidents") ?? [] : []] },
  ops: (t: string) => t
}));
vi.mock("@/lib/db", () => ({ default: { query: async () => [[]] } }));
const { default: StatusTracker, chainFor } = await import("@/components/StatusTracker");
const { checkerOf } = await import("@/lib/complaint-progress");
(globalThis as { React?: unknown }).React = React;

const titles = (status: string, checker: "collector" | "department" | null, history: { status: string; created_at: string }[] = []) =>
  [...renderToStaticMarkup(createElement(StatusTracker, { status: status as never, rejectedStage: null, remarks: null, history, checker })).matchAll(/<b>([^<]*)<\/b>/g)].map((m) => m[1]);

describe("officer-day-06: the tracker's next steps follow who checks the work", () => {
  it.each(["Complaint Filed", "Pending Approval", "Approved by Department Officer", "In Progress"])("department's case at %s: no Collector steps", (s) => {
    expect(chainFor(s as never, "department")).not.toContain("Verified by Collector");
    expect(chainFor(s as never, "department")).not.toContain("Completed - Pending Collector Verification");
    expect(chainFor(s as never, "department").at(-1)).toBe("Resolved by Department");
    expect(titles(s, "department")).toContain("Resolved – checked by the department");
    expect(titles(s, "department")).not.toContain("Verified by Collector");
  });
  it("not told who checks (the case not in this build yet): the department's steps, as most cases are", () => {
    expect(chainFor("Approved by Department Officer")).not.toContain("Verified by Collector");
  });
  it("a severe case keeps the Collector's steps", () => {
    expect(chainFor("Approved by Department Officer", "collector")).toContain("Verified by Collector");
    expect(titles("In Progress", "collector")).toContain("Verified by Collector");
  });
  it("a case the Collector is checking or verified keeps them, whoever was to check it", () => {
    expect(chainFor("Completed - Pending Collector Verification", "department")).toContain("Verified by Collector");
    expect(titles("Verified by Collector", "department").at(-1)).toBe("Verified by Collector");
  });
  it("a rejected case whose history went to the Collector shows those steps", () => {
    const at = "2026-11-12 14:00:00";
    const t = titles("Rejected", "department", [{ status: "Complaint Filed", created_at: at }, { status: "Completed - Pending Collector Verification", created_at: at }, { status: "Rejected", created_at: at }]);
    expect(t).toContain("Completed – pending Collector verification");
  });
});

describe("officer-day-06: who checks, from the case's severity", () => {
  it.each([["Severe", "collector"], ["High", "department"], ["Medium", "department"], ["Low", "department"]])("%s -> %s", async (sev, who) => {
    h.rows.set("events", [{ code: "2026-111AAA", inc: "INC-W-2026-111AAA" }]);
    h.rows.set("incidents", [{ severity_level: sev }]);
    expect(await checkerOf("2026-111AAA")).toBe(who);
  });
  it("a case not in this build: not known", async () => {
    h.rows.set("events", []);
    expect(await checkerOf("2026-111AAA")).toBeNull();
  });
});
