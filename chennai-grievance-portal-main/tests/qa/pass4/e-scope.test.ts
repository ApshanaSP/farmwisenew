// QA pass 4, fixer 1 (figures and time). RC-09: a figure is read from the scope that was asked, not a wider one. Real store on the pinned snapshot,
// real screens through the planner's direct path, no model.
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/e-scope.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import intelPool from "@/lib/collector/db";
import { asOf, list } from "@/lib/collector/intel";
import { serverHands } from "@/lib/thunai/data";
import { serverWorld } from "@/lib/thunai/world";
import { clearCaches, planRound, RoundBody } from "@/lib/thunai/round";

type Row = Record<string, unknown>;
const FROZEN = "2026-11-06T06:30:00.000Z";
const USER = "qa.e.scope@example.test";
const noModel = { generate: async () => { throw new Error("no model"); } } as never;
let turn = 0;
const state = (over: Row = {}) => ({ page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false, ...over });
async function direct(recipe: string, slots: Row, st: Row = {}) {
  const body = RoundBody.parse({ turnId: `e-${++turn}`, round: 0, text: "show", turns: [], lastText: null, stage: null, direct: { recipe, slots, lang: "en" }, state: state(st) });
  const r = await planRound(body, await serverWorld(), serverHands({ email: USER, role: "collector", lockDept: null }), USER, { notes: [], habits: {} }, undefined, { llm: noModel });
  return r.result!.stage!;
}
const kpi = (st: { blocks: Row[] }, key: string) => ((st.blocks.find((b) => b.kind === "Kpis") as { items: { key: string; value: number }[] }).items.find((i) => i.key === key))?.value;
const trendSum = (st: { blocks: Row[] }) => ((st.blocks.find((b) => b.kind === "Trend") as { values: number[] }).values).reduce((a, b) => a + b, 0);

beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) }); clearCaches(); expect(await asOf()).toBe("2026-11-06 18:08:00"); });
afterAll(async () => { vi.useRealTimers(); await intelPool.end?.().catch(() => undefined); });

describe("RC-09: a figure is read from the scope that was asked", () => {
  it("PB-060 department performance for one department is that department's open figure, and the title names it", async () => {
    const st = await direct("performance", { zones: [] }, { dept: "GCC-SWM" });
    const all = await direct("performance", { zones: [] });
    const mine = await list({ period: "weekly", zone: null, dept: "GCC-SWM", sev: null, status: "open", q: null, sort: "t", dir: -1, page: 0, scope: "period" } as never);
    expect(kpi(st, "open")).toBeLessThan(kpi(all, "open")!);
    expect(kpi(st, "open")).toBe(mine.incidents);
    expect(st.title).toMatch(/Solid Waste/i);
  });
  it("PB-067 zone performance: the Reported tile is the trend's own total, and the title says all zones", async () => {
    for (const zone of [null, 13]) {
      const st = await direct("performance", { by: "zone", zones: [] }, { zone });
      expect(kpi(st, "n")).toBe(trendSum(st));
      expect(st.title).toMatch(/all zones/i);
    }
  });
  it("PB-142 a dashboard for one zone does not say 'Most in' another zone", async () => {
    const st = await direct("dashboard", { zones: [] }, { zone: 13 });
    expect(st.say.en).not.toMatch(/Most in/);
    const wide = await direct("dashboard", { zones: [] });
    expect(wide.say.en).toMatch(/Most in/);
  });
  it("PB-096 a body's brief for one zone names the zone in its title and its lines, in both languages", async () => {
    const st = await direct("brief", { org: "GCC", zones: [13] });
    const z = (await serverWorld()).zones.find((x) => x.n === 13)!;
    expect(st.title).toContain(z.name);
    expect(st.say.en).toContain(z.name);
    if (z.ta) expect(st.say.ta).toContain(z.ta);
  });
});

// class guard: with a zone on the console, a screen's title names that zone, or says plainly it is about every zone or the district
describe("RC-09 class guard: a screen says its scope in its title", () => {
  it("every screen that draws something names the zone or says all zones", async () => {
    const z = (await serverWorld()).zones.find((x) => x.n === 13)!;
    const checked: string[] = [], bad: string[] = [];
    for (const recipe of ["cases", "ranking", "trend", "performance", "dashboard", "map", "why"]) {
      const st = await direct(recipe, { zones: [], ...(recipe === "performance" ? { by: "zone" } : {}) }, { zone: 13 });
      if (!st.blocks.length) continue; // a question asked back, not a screen
      checked.push(recipe);
      if (!new RegExp(`${z.name}|all zones|every zone|district|whole of Chennai`, "i").test(`${st.title} ${st.say.en}`)) bad.push(`${recipe}: ${st.title}`);
    }
    expect(checked.length).toBeGreaterThanOrEqual(4); // not a vacuous pass
    expect(bad).toEqual([]);
  });
});
