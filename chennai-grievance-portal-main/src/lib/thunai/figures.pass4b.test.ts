// QA pass 4, lane b, RC-08 class guard: a figure about a list is counted over the whole list, never over the rows on a page, and a list
// "most serious first" starts with the most serious. The fake store here PAGES (12 rows a page, as the real tool does) and orders
// severity as the real list does (FIELD(...) ascending with dir 1), so the old failures show: the tests of the first pass used a tool that
// returned every row at once, which hid them.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";
import { buildScreen, emptySlots, type Hands } from "./screens";
import { fakeHands } from "./stagefake";

const SEV = ["Severe", "High", "Medium", "Low"];
// 100 open incidents: 100 - 10 are Low, every third one is past its deadline, the Severe ones are never late (so page 0 of a
// severity-ordered list has no late case on it, as in the real store)
const ALL = Array.from({ length: 100 }, (_, i) => {
  const sev = i < 10 ? "Severe" : i < 40 ? "High" : i < 70 ? "Medium" : "Low";
  return { id: `INC-${i}`, title: `Case ${i}`, sev, status: "Open", zone: 13, dept: i % 2 ? "GCC-SWD" : "POL-GCP", dept_name: i % 2 ? "Storm Water Drain" : "Greater Chennai Police",
    complaints: 1, t: "2026-11-01 10:00:00", breached: sev !== "Severe" && i % 3 === 0 ? 1 : 0 };
});
const LATE = ALL.filter((x) => x.breached === 1);
const ordered = (rows: typeof ALL, sort: string, dir: number) => {
  const r = [...rows];
  if (sort === "sev") r.sort((a, b) => (SEV.indexOf(a.sev) - SEV.indexOf(b.sev)) * (dir < 0 ? -1 : 1));
  return r;
};
const calls: Record<string, unknown>[] = [];
function pagedHands(withList: boolean): Hands {
  const h = fakeHands();
  const pick = (a: Record<string, unknown>, status: unknown) => {
    let rows = status === "overdue" ? LATE : ALL;
    if (a.sev) rows = rows.filter((x) => x.sev === a.sev);
    return ordered(rows, String(a.sort ?? "t"), Number(a.dir ?? -1));
  };
  const hands: Hands = { ...h, tool: async (n: string, a: Record<string, unknown>) => {
    if (n !== "incidents") return h.tool(n, a);
    calls.push(a);
    const rows = pick(a, a.status);
    const page = Number(a.page ?? 0);
    return { scope: null, asOf: "2026-11-06 18:00:00", data: { rows: rows.slice(page * 12, page * 12 + 12), total: rows.length }, facts: [], sources: [], incidentIds: [], caveats: [] } as never;
  } };
  if (withList) hands.list = async (_s, f) => {
    const rows = pick({ sev: f.sev, sort: f.sort, dir: f.sort === "sev" ? 1 : -1 }, f.status);
    return { rows: rows.slice((f.page ?? 0) * 12, (f.page ?? 0) * 12 + 12), total: rows.length, incidents: rows.length, asOf: "2026-11-06 18:00:00" };
  };
  return hands;
}
const world = { ...WORLD, ...referenceWorld() };
const scope = { period: "weekly" as const, zone: null, dept: null, cat: null, taluk: null, sev: null };
const kpi = (b: Awaited<ReturnType<typeof buildScreen>>, key: string) => (b.doc.blocks.find((x) => x.kind === "Kpis") as { items: { key: string; value: number }[] } | undefined)?.items.find((x) => x.key === key)?.value;
const list = (b: Awaited<ReturnType<typeof buildScreen>>) => b.doc.blocks.find((x) => x.kind === "CaseList") as { total: number; rows: { id: string; sev: string }[] } | undefined;

describe("figures about a list come from the whole list (RC-08)", () => {
  for (const withList of [true, false]) {
    const how = withList ? "console list" : "tool pages only";
    it(`past deadline beside an open list counts the whole list, not its first page (${how})`, async () => {
      const b = await buildScreen("cases", { ...emptySlots(), status: "open", period: "weekly" }, scope, world, pagedHands(withList), "open cases");
      if (withList) expect(kpi(b, "late")).toBe(LATE.length);
      // without the console list the count cannot be made: it is then the rows on screen, and the takeaway says "shown"
      else expect(kpi(b, "late")).toBe(list(b)!.rows.filter((r) => LATE.some((x) => x.id === r.id)).length);
    });
    it(`the severity-ordered list starts with the most serious (${how})`, async () => {
      const b = await buildScreen("cases", { ...emptySlots(), status: "open", period: "weekly" }, scope, world, pagedHands(withList), "open cases");
      expect(list(b)!.rows[0].sev).toBe("Severe");
    });
  }
  it("the past-deadline list holds the whole count and the rows of the most serious first", async () => {
    const b = await buildScreen("cases", { ...emptySlots(), status: "overdue", period: "weekly" }, scope, world, pagedHands(true), "overdue cases");
    expect(list(b)!.total).toBe(LATE.length);
    expect(kpi(b, "late")).toBe(LATE.length);
    expect(b.doc.say.en).toContain(`${LATE.length} are past their deadline`);
  });
  it("a severe-and-late request counts the late severe ones, one page or more", async () => {
    const b = await buildScreen("cases", { ...emptySlots(), status: "overdue", sev: "High", period: "weekly" }, scope, world, pagedHands(true), "overdue high cases");
    expect(list(b)!.total).toBe(LATE.filter((x) => x.sev === "High").length);
  });
  // found at the merge of lanes a to d: the severity panel counts its own rows (52) and the past-deadline figure counts incidents (54): a part larger than the whole
  it("a past-deadline figure is never said to be \"N of M\" with N larger than M (severity panel rows against incidents)", async () => {
    const hands = pagedHands(true);
    hands.severe = async () => ({ rows: ALL.filter((x) => x.sev === "High").slice(0, 2), counts: { High: 2 }, asOf: "2026-11-06 18:00:00" }) as never;
    const b = await buildScreen("cases", { ...emptySlots(), sev: "High", period: "weekly" }, scope, world, hands, "high cases");
    const t = b.doc.takeaway?.en ?? "";
    for (const m of t.matchAll(/(\d+) of the (\d+)/g)) expect(Number(m[1])).toBeLessThanOrEqual(Number(m[2]));
    expect(t).toMatch(/past (its|their) deadline/);
  });
  it("who holds most is not said of a list shown in part", async () => {
    const b = await buildScreen("cases", { ...emptySlots(), status: "open", period: "weekly" }, scope, world, pagedHands(true), "open cases");
    expect(JSON.stringify(b.doc.blocks.find((x) => x.kind === "Kpis"))).not.toMatch(/Held by/);
    expect(b.doc.say.en).not.toMatch(/ holds \d+ of them/);
  });
  it("the dashboard, advise, complete and case screens ask for severity order ascending (dir 1)", async () => {
    calls.length = 0;
    const h = pagedHands(false);
    await buildScreen("dashboard", emptySlots(), scope, world, h, "dashboard");
    await buildScreen("advise", emptySlots(), scope, world, h, "what should I do first");
    await buildScreen("complete", emptySlots(), scope, world, h, "complete this data");
    await buildScreen("case", { ...emptySlots(), cat: "FLOODING" }, { ...scope, zone: 13 }, world, h, "explain the flooding in Adyar");
    const sevCalls = calls.filter((a) => a.sort === "sev");
    expect(sevCalls.length).toBeGreaterThan(2);
    for (const a of sevCalls) expect(a.dir, JSON.stringify(a)).toBe(1);
  });
});

describe("class guard: no screen reads the incident list on its own (RC-08)", () => {
  const root = path.resolve(__dirname);
  const src = fs.readFileSync(path.join(root, "screens.ts"), "utf8");
  it("screens.ts calls the incidents tool only inside incidentList", () => {
    const direct = src.split(/\r?\n/).filter((l) => /call\(c, "incidents"/.test(l));
    expect(direct.length).toBe(1);
  });
  it("every thunai source that asks the incidents tool for severity order also says the direction", () => {
    for (const f of fs.readdirSync(root).filter((x) => /\.ts$/.test(x) && !/\.test\.ts$/.test(x))) {
      for (const l of fs.readFileSync(path.join(root, f), "utf8").split(/\r?\n/)) {
        if (/(call\(|args: \{).*sort: "sev"/.test(l)) expect(l, `${f}: ${l.trim()}`).toMatch(/dir:/);
      }
    }
  });
});
