import { expect, it } from "vitest";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";
import { buildScreen, emptySlots } from "./screens";
import { fakeHands } from "./stagefake";

// Hunter A, A1 (BUG-007): 40 overdue cases were said as 12, the overdue rows on the list's first page
it("the overdue total is the scope's, not one page's", async () => {
  const h = fakeHands();
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: `INC-OVD${i}`, title: `Case ${i}`, sev: "High", status: "Open", zone: 13, breached: 1, dept: "GCC-SWD", dept_name: "Storm Water Drain", complaints: 1, t: "2026-11-01 10:00:00" }));
  const hands = { ...h, tool: async (n: string, a: Record<string, unknown>) =>
    n === "incidents" ? { scope: null, asOf: null, data: { rows, total: 300 }, facts: [], sources: [], incidentIds: [], caveats: [] } as never
    : n === "dept_followups" ? { scope: null, asOf: null, data: { rows: [{ code: "GCC-SWD", name: "Storm Water Drain", open: 120, overdue: 25, serious: 3 }, { code: "POL-GCP", name: "Greater Chennai Police", open: 200, overdue: 15, serious: 9 }] }, facts: [], sources: [], incidentIds: [], caveats: [] } as never
    : h.tool(n, a) };
  const world = { ...WORLD, ...referenceWorld() };
  const b = await buildScreen("cases", { ...emptySlots(), status: "overdue", period: "weekly" }, { period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null }, world, hands, "overdue cases");
  const list = b.doc.blocks.find((x) => x.kind === "CaseList") as { total: number } | undefined;
  expect(list?.total).toBe(40);
  expect(b.doc.say.en).toMatch(/^40 /);
});

// pass-2 hunter (BUG-021): with a severity or words, the follow-ups' all-overdue count was said as the severe overdue count
it("severe overdue cases are counted from the severe list, page by page", async () => {
  const h = fakeHands();
  const mk = (p: number) => Array.from({ length: 12 }, (_, i) => ({ id: `INC-P${p}R${i}`, title: `Case ${p}-${i}`, sev: "Severe", status: "Open", zone: 13, breached: i < 5 ? 1 : 0, dept: "GCC-SWD", complaints: 1, t: "2026-11-01 10:00:00" }));
  const hands = { ...h, tool: async (n: string, a: Record<string, unknown>) =>
    n === "incidents" ? { scope: null, asOf: null, data: { rows: Number(a.page ?? 0) < 3 ? mk(Number(a.page ?? 0)) : [], total: 36 }, facts: [], sources: [], incidentIds: [], caveats: [] } as never
    : n === "dept_followups" ? { scope: null, asOf: null, data: { rows: [{ code: "GCC-SWD", name: "Storm Water Drain", open: 900, overdue: 400, serious: 3 }] }, facts: [], sources: [], incidentIds: [], caveats: [] } as never
    : h.tool(n, a) };
  const world = { ...WORLD, ...referenceWorld() };
  const b = await buildScreen("cases", { ...emptySlots(), status: "overdue", sev: "Severe", q: "drain" }, { period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null }, world, hands, "severe overdue drain cases");
  const list = b.doc.blocks.find((x) => x.kind === "CaseList") as { total: number } | undefined;
  expect(list?.total).toBe(15);
});
