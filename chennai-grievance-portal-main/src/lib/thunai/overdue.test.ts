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

// SK-1, SK-2 (lane a skeptic): a zone's overdue cases are not on the first page of 12 of the open list; the list is asked for the overdue ones
it("overdue cases are asked for as overdue, and read past a first page that holds none", async () => {
  const h = fakeHands();
  const seenStatus: unknown[] = [];
  const row = (p: number, i: number, late: boolean) => ({ id: `INC-Q${p}-${i}`, title: `Case ${p}-${i}`, sev: "High", status: "Open", zone: 13, breached: late ? 1 : 0, dept: "GCC-SWD", complaints: 1, t: "2026-11-01 10:00:00" });
  const hands = { ...h, tool: async (n: string, a: Record<string, unknown>) => {
    if (n === "incidents") {
      seenStatus.push(a.status);
      const p = Number(a.page ?? 0);
      // the first page holds no overdue case when it is read as "open"; asked as overdue, every row is
      const rows = Array.from({ length: p < 1 ? 3 : 0 }, (_, i) => row(p, i, true));
      return { scope: null, asOf: null, data: { rows, total: 3 }, facts: [], sources: [], incidentIds: [], caveats: [] } as never;
    }
    return n === "dept_followups" ? { scope: null, asOf: null, data: { rows: [] }, facts: [], sources: [], incidentIds: [], caveats: [] } as never : h.tool(n, a);
  } };
  const world = { ...WORLD, ...referenceWorld() };
  const b = await buildScreen("cases", { ...emptySlots(), status: "overdue", period: "weekly" }, { period: "weekly", zone: 13, dept: null, cat: null, taluk: null, sev: null }, world, hands, "overdue cases in Adyar");
  const list = b.doc.blocks.find((x) => x.kind === "CaseList") as { total: number; rows: unknown[] } | undefined;
  expect(seenStatus.every((x) => x === "overdue")).toBe(true);
  expect(list?.total).toBe(3);
  expect(list?.rows.length).toBe(3);
});
