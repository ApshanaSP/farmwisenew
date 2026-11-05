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
