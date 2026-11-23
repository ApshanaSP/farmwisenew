import { describe, expect, it } from "vitest";
import { describePanel, helpsOf } from "@/lib/studio/helps";
import { tookOf } from "@/lib/studio/took";
import type { DatasetMeta, PanelData, Plan } from "@/lib/studio/types";

const plan = (p: Partial<Plan>): Plan => ({ id: "x", title: "t", chart: "hbar", agg: "count", col: null, by: "col", byCol: "c1", unit: null, filters: [], sort: "desc", limit: 10, ...p });
const panel = (p: Partial<PanelData> & Pick<PanelData, "labels" | "values">): PanelData => ({
  id: "x", plan: plan({}), title: "t", subtitle: "", chart: "hbar", keys: p.labels, geo: null, points: [], total: 0, rows: 10, format: "int", unit: null,
  kpi: null, table: null, note: null, ...p
});

describe("describePanel", () => {
  it("names the leader of a ranking and the share the top three hold", () => {
    const s = describePanel(panel({ labels: ["Adyar", "Anna Nagar", "Teynampet", "Royapuram"], values: [40, 30, 20, 10] }));
    expect(s).toBe("Adyar leads with 40 (40% of the total); the top 3 hold 90%.");
  });
  it("never names the catch-all bucket as the leader", () => {
    const s = describePanel(panel({ labels: ["Anna Adarsh College", "Loyola College", "St. Francis School", "Others (5)"], values: [375, 300, 259, 660] }));
    expect(s).toBe("Anna Adarsh College leads with 375 (24% of the total); the top 3 hold 59%.");
  });
  it("reads a trend from its first and last points, and says on for a day", () => {
    const s = describePanel(panel({ chart: "area", plan: plan({ by: "time", chart: "area" }), labels: ["1 Jun", "8 Jun", "15 Jun"], values: [100, 140, 120] }));
    expect(s).toBe("From 1 Jun to 15 Jun: 100 to 120, up 20%. Highest was 140 on 8 Jun.");
  });
  it("gives the largest part of a split as a share", () => {
    const s = describePanel(panel({ chart: "donut", labels: ["Completed", "Pending"], values: [75, 25] }));
    expect(s).toBe("Completed is the largest part: 75% of 100.");
  });
  it("does not add up averages", () => {
    const s = describePanel(panel({ plan: plan({ agg: "avg" }), labels: ["Manali", "Perungudi", "Alandur", "Velachery"], values: [80, 60, 50, 40] }));
    expect(s).toBe("Manali is highest (80); Velachery is lowest (40).");
  });
});

describe("helpsOf", () => {
  it("says what each kind of chart is for", () => {
    expect(helpsOf(panel({ chart: "map", labels: [], values: [] }))).toMatch(/where to send/);
    expect(helpsOf(panel({ chart: "area", plan: plan({ by: "time" }), labels: [], values: [] }))).toMatch(/better or worse/);
    expect(helpsOf(panel({ plan: plan({ by: "zone", byCol: null }), labels: [], values: [] }))).toMatch(/Ranks areas/);
  });
});

describe("tookOf", () => {
  const meta = {
    source: { kind: "link", file: "lake-level", url: "https://cmwssb.tn.gov.in/lake-level", sheet: null, sheets: [], bytes: 1, caption: null,
      connect: { method: "http", via: "", auth: "none", account: null, candidates: [{ id: "a", kind: "table", label: "Lake levels", rows: 6, cols: 9, headers: [], score: 90, why: "" }, { id: "b", kind: "table", label: "Rainfall", rows: 6, cols: 3, headers: [], score: 40, why: "" }],
        choice: "a", hash: "", fetchedAt: "", every: null, lastOkAt: null, lastError: null, history: [] } },
    detective: { before: 80, after: 95, rowsIn: 8, rowsOut: 6, issues: [], placed: 0, unplaced: [] },
    cols: 5,
    spec: { columns: [
      { key: "c1", header: "Reservoir", label: "Reservoir", role: "category", type: "text", unit: null, agg: null, conf: 1, why: "" },
      { key: "c2", header: "Storage", label: "Storage", role: "measure", type: "number", unit: "mcft", agg: "sum", conf: 1, why: "" },
      { key: "c3", header: "Remarks", label: "Remarks", role: "text", type: "text", unit: null, agg: null, conf: 1, why: "" },
      { key: "c4", header: "Officer", label: "Officer", role: "person", type: "text", unit: null, agg: null, conf: 1, why: "" },
      { key: "c5", header: "Date", label: "Date", role: "date", type: "date", unit: null, agg: null, conf: 1, why: "" }
    ] },
    window: { from: "2026-11-22", to: "2026-11-22" },
    link: null
  } as unknown as DatasetMeta;
  it("says which table on the page was used, the rows kept and the columns used", () => {
    const t = tookOf(meta);
    expect(t.source).toBe("cmwssb.tn.gov.in/lake-level");
    expect(t.part).toBe("Lake levels (1 of 2 found on the page)");
    expect([t.rowsRead, t.rowsKept]).toEqual([8, 6]);
    expect(t.used.map((c) => c.as)).toEqual(["Type", "Number", "Date"]);
    expect(t.unused).toEqual(["Remarks"]);
    expect(t.hidden).toEqual(["Officer"]);
    expect(t.period).toBe("22 Nov 2026");
    expect(t.placedPct).toBeNull();
  });
});
