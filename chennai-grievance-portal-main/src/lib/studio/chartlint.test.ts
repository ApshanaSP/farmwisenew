/**
 * The Chart Doctor (masterclass U3, 9.4) and the sufficiency tiers in the Designer (U2, 9.3): one test per hard rule,
 * the tiers' views, a guard that no drawn panel skips the linter, and 0 hard violations over every panel of every
 * sample and fixture table.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { lint, renderPanel, violations, wordCut } from "@/lib/studio/chartlint";
import { clean, type DRow } from "@/lib/studio/clean";
import { designDashboard, plan, tierOfRows } from "@/lib/studio/dashboard";
import { runPlan, type Names } from "@/lib/studio/engine";
import { parseFile, type Table } from "@/lib/studio/parse";
import { profileTable } from "@/lib/studio/profile";
import type { Refs } from "@/lib/studio/refs";
import { rulesSpec } from "@/lib/studio/spec";
import type { PanelData, Plan, Spec } from "@/lib/studio/types";

const refs: Refs = { wards: new Map(), zones: new Map(), taluks: new Map(), categories: [], depts: [], families: new Map() };
const names: Names = { zone: (z) => `Zone ${z}`, taluk: (t) => t, zoneOf: (v) => Number(String(v).match(/\d+/)?.[0]) || null };

type Loose = Omit<Partial<PanelData>, "plan"> & { plan?: Partial<Plan> };
const panel = (p: Loose): PanelData => ({
  id: "p", title: "Complaints by zone", subtitle: "complaints", chart: "hbar", labels: [], values: [], keys: [], geo: null, points: [], total: 0, rows: 10,
  format: "int", unit: null, kpi: null, table: null, note: null, ...p, plan: plan({ id: "p", title: "x", chart: (p.chart ?? "hbar"), by: "col", byCol: "c0", ...(p.plan ?? {}) })
});
const bars = (vals: number[], extra: Loose = {}) => panel({ labels: vals.map((_, i) => `Item ${i + 1}`), keys: vals.map((_, i) => `Item ${i + 1}`), values: vals, ...extra });

describe("9.4 one test per hard rule", () => {
  it("H1 an empty chart becomes a table that says so", () => {
    const p = lint(bars([0, 0, 0]));
    expect(p.chart).toBe("table");
    expect(p.lint!.join()).toMatch(/H1/);
  });
  it("H2 bars and areas start at zero", () => {
    expect(lint(bars([5, 9, 3])).zero).toBe(true);
    expect(violations({ ...bars([5, 9, 3]), zero: false })).toContain("H2");
  });
  it("H3 a donut of 7 parts, of averages or with a negative part becomes bars", () => {
    expect(lint(bars([7, 6, 5, 4, 3, 2, 1], { chart: "donut", plan: { chart: "donut" } })).chart).toBe("hbar");
    expect(lint(bars([3, 2, 1], { chart: "donut", plan: { chart: "donut", agg: "avg" } })).chart).toBe("hbar");
    expect(lint(bars([3, -2, 1], { chart: "donut", plan: { chart: "donut" } })).chart).toBe("hbar");
    expect(lint(bars([3, 2, 1], { chart: "donut", plan: { chart: "donut" } })).chart).toBe("donut");
  });
  it("H4 no line over unordered categories", () => {
    expect(lint(bars([3, 9, 1], { chart: "line", plan: { chart: "line", by: "col" } })).chart).toBe("hbar");
  });
  it("H5 time runs left to right", () => {
    const p = lint(panel({ chart: "area", labels: ["Mar", "Jan", "Feb"], keys: ["2026-03", "2026-01", "2026-02"], values: [3, 1, 2], plan: { chart: "area", by: "time" } }));
    expect(p.keys).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(p.values).toEqual([1, 2, 3]);
  });
  it("H6 only the Studio's own chart kinds (no dual axis, no 3D)", () => {
    expect(lint(bars([1, 2, 3], { chart: "scatter3d" as never })).chart).toBe("table");
  });
  it("H7 no chart of a constant or a single category", () => {
    expect(lint(bars([4, 4, 4])).chart).toBe("table");
    expect(lint(bars([9])).chart).toBe("table");
  });
  it("H8 a % change on a base under 20 is dropped; a percentage says its base", () => {
    const k = lint(panel({ chart: "kpi", kpi: { value: 12, label: "x", sub: "", spark: [3, 12], delta: 300, tone: "info" }, plan: { chart: "kpi", by: "none" } }));
    expect(k.kpi!.delta).toBeNull();
    const big = lint(panel({ chart: "kpi", kpi: { value: 60, label: "x", sub: "", spark: [40, 60], delta: 50, tone: "info" }, plan: { chart: "kpi", by: "none" } }));
    expect(big.kpi!.delta).toBe(50);
    expect(lint(bars([40, 30, 20], { format: "pct", subtitle: "average occupancy" })).subtitle).toMatch(/of 10 rows/);
  });
  it("H9 a title names the measure; the window is in the subtitle", () => {
    const p = lint(bars([5, 3, 1], { title: "" }), { window: { from: "2026-10-01", to: "2026-10-27" } });
    expect(p.title).toMatch(/Complaints/);
    expect(p.subtitle).toMatch(/27 Oct 2026/);
  });
  it("H10 labels are never cut mid-word", () => {
    expect(wordCut("Kannankottai Thervoy Kandigai reservoir, north side", 40)).toBe("Kannankottai Thervoy Kandigai reservoir…");
    const p = lint(panel({ labels: ["A very long locality name that goes on and on past the limit", "B"], keys: ["a", "b"], values: [3, 1] }));
    expect(p.labels[0].endsWith("…")).toBe(true);
    expect(p.labels[0]).toBe("A very long locality name that goes on…");
  });
  it("H11 at most 12 bars: the top 10 and Others (for a count)", () => {
    const p = lint(bars(Array.from({ length: 20 }, (_, i) => 20 - i)));
    expect(p.values.length).toBe(11);
    expect(p.labels[10]).toBe("Others (10)");
    expect(p.values[10]).toBe(55);
  });
  it("H12 a map with 4 places, or 10% placed, becomes bars", () => {
    expect(lint(bars([4, 3, 2, 1], { chart: "map", plan: { chart: "map", by: "zone" } })).chart).toBe("hbar");
    expect(lint(bars([5, 4, 3, 2, 1, 1], { chart: "map", plan: { chart: "map", by: "zone" } }), { placedShare: 0.1 }).chart).toBe("hbar");
    expect(lint(bars([5, 4, 3, 2, 1, 1], { chart: "map", plan: { chart: "map", by: "zone" } }), { placedShare: 0.8 }).chart).toBe("map");
  });
  it("H13 one period is no trend; two periods are a before-and-after pair", () => {
    const one = lint(panel({ chart: "area", labels: ["Oct"], keys: ["2026-10"], values: [5], plan: { chart: "area", by: "time" } }));
    expect(one.chart).toBe("table");
    const two = lint(panel({ chart: "area", labels: ["Sep", "Oct"], keys: ["2026-09", "2026-10"], values: [5, 9], plan: { chart: "area", by: "time" } }));
    expect(two.chart).toBe("bar");
    expect(two.note).toMatch(/\+4/);
  });
  it("soft: bars sorted largest first, an ordered scale keeps its order; each panel says why and has alt text", () => {
    expect(lint(bars([1, 9, 4])).values).toEqual([9, 4, 1]);
    const ord = lint(panel({ labels: ["Low", "Medium", "High"], keys: ["Low", "Medium", "High"], values: [9, 1, 4] }));
    expect(ord.labels).toEqual(["Low", "Medium", "High"]);
    const p = lint(bars([1, 9, 4]));
    expect(p.why).toMatch(/sorted bars/);
    expect(p.alt).toMatch(/highest is Item 2 with 9/);
  });
  it("lint is stable: a linted panel breaks no hard rule", () => {
    for (const p of [bars([0]), bars([1, 2]), bars(Array.from({ length: 30 }, (_, i) => i + 1)), bars([4, 3, 2, 1], { chart: "map", plan: { chart: "map", by: "zone" } })]) expect(violations(lint(p))).toEqual([]);
  });
});

describe("9.4 every drawn panel goes through the linter", () => {
  it("runPlan is only called directly for numbers and rows that are not drawn", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f.name) && !/\.test\./.test(f.name)) files.push(p); } };
    walk(path.join(process.cwd(), "src"));
    const bad: string[] = [];
    for (const f of files) {
      if (/studio[\\/](engine|chartlint)\.ts$/.test(f)) continue;
      const lines = fs.readFileSync(f, "utf8").split("\n");
      lines.forEach((l, i) => {
        if (!/\brunPlan\(/.test(l) || /import|function runPlan|lint\(runPlan/.test(l)) return;
        if (!/not drawn/.test(`${lines[i - 1] ?? ""} ${l}`)) bad.push(`${path.relative(process.cwd(), f)}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});

// ------------------------------------------------------------------- tiers --

function build(t: Table, file: string) {
  const spec = rulesSpec(profileTable(t), file, t.caption, refs) as Spec;
  const c = clean(t, spec);
  return { spec, rows: c.rows, window: c.window };
}
const csv = (s: string) => parseFile(Buffer.from(s), "x.csv");
const charts = (plans: Plan[]) => plans.filter((p) => p.chart !== "kpi" && p.chart !== "table");

describe("9.3 the tiers' views", () => {
  it("a 3-row file has 0 charts: a fact card (numbers and its rows)", () => {
    const { spec, rows, window } = build(csv("Zone,Complaints,Date\nAdyar,12,2026-10-01\nTeynampet,8,2026-10-02\nRoyapuram,5,2026-10-03\n"), "a.csv");
    expect(tierOfRows(rows, spec)).toBe("fact");
    const plans = designDashboard(rows, spec, window);
    expect(charts(plans)).toEqual([]);
    expect(plans.filter((p) => p.chart === "kpi").length).toBeLessThanOrEqual(3);
    expect(plans.some((p) => p.chart === "table")).toBe(true);
  });
  it("12 rows: a sorted table with in-cell bars, at most 3 KPIs and one sorted bar", () => {
    const body = Array.from({ length: 12 }, (_, i) => `${["Adyar", "Teynampet", "Royapuram", "Ambattur"][i % 4]},${(i * 7) % 23 + 1},2026-10-${String(i + 1).padStart(2, "0")}`).join("\n");
    const { spec, rows, window } = build(csv(`Zone,Complaints,Date\n${body}\n`), "a.csv");
    expect(tierOfRows(rows, spec)).toBe("small");
    const plans = designDashboard(rows, spec, window);
    expect(charts(plans).length).toBeLessThanOrEqual(1);
    expect(plans.filter((p) => p.chart === "kpi").length).toBeLessThanOrEqual(3);
    const table = plans.find((p) => p.chart === "table")!;
    const out = runPlan(rows, spec, table, names);
    expect(out.table!.bar).toBe(table.col);
    const v = out.table!.rows.map((r) => r[table.col!] as number);
    expect(v).toEqual([...v].sort((a, b) => b - a));
  });
  it("one period gives no trend; 4 places give no map", () => {
    const one = Array.from({ length: 30 }, (_, i) => `${["Adyar", "Teynampet", "Royapuram", "Ambattur"][i % 4]},${i + 1},2026-10-05`).join("\n");
    const { spec, rows, window } = build(csv(`Zone,Complaints,Date\n${one}\n`), "a.csv");
    for (const r of rows) r._z = ({ Adyar: 13, Teynampet: 9, Royapuram: 5, Ambattur: 7 } as Record<string, number>)[String(r[spec.columns.find((c) => c.role === "zone")!.key])] ?? null;
    const plans = designDashboard(rows, spec, window);
    expect(plans.some((p) => p.by === "time" && (p.chart === "line" || p.chart === "area"))).toBe(false);
    expect(plans.some((p) => p.chart === "map")).toBe(false);
  });
  it("a base under 20 gives no % change on a card", () => {
    const rows: DRow[] = [];
    for (let w = 0; w < 6; w++) for (let k = 0; k < (w === 5 ? 9 : 3); k++) rows.push({ _d: `2026-${w < 2 ? "09" : "10"}-${String(1 + w * 6 - (w >= 2 ? 12 : 0)).padStart(2, "0")}`, c0: 1 } as unknown as DRow);
    const spec = { columns: [], entityPlural: "complaints", entity: "complaint" } as unknown as Spec;
    const k = runPlan(rows, spec, plan({ id: "k", title: "Complaints", chart: "kpi" }), names);
    expect(k.kpi!.delta).toBeNull();
  });
});

describe("9.4 0 hard violations over every panel of every sample", () => {
  const dir = path.join(process.cwd(), "data", "studio-samples");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(csv|xlsx)$/.test(f)) : [];
  for (const f of files) {
    it(f, () => {
      const t = parseFile(fs.readFileSync(path.join(dir, f)), f);
      const { spec, rows, window } = build(t, f);
      for (const p of designDashboard(rows, spec, window)) {
        const drawn = renderPanel(rows, spec, p, names, window);
        expect({ panel: p.id, v: violations(drawn) }).toEqual({ panel: p.id, v: [] });
      }
    });
  }
});
