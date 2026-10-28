/**
 * Trust (U7) and the Collector's lens (U6): what a refresh changed (rows added and removed by content, columns, a big
 * jump), the change log merging refreshes and Live Connector runs, the data card's numbers, and each family read from
 * realistic headers (and corrected in one click).
 */
import { describe, expect, it } from "vitest";
import { changeLog, dataCard, diffTables } from "@/lib/studio/datacard";
import { FAMILIES, detectFamily, familyBoost, familyOf, type FamilyKey } from "@/lib/studio/family";
import { parseFile } from "@/lib/studio/parse";
import { profileTable } from "@/lib/studio/profile";
import { rulesSpec } from "@/lib/studio/spec";
import type { DatasetMeta } from "@/lib/studio/types";

const refs = { wards: new Map(), zones: new Map(), taluks: new Map(), categories: [], depts: [], families: new Map() } as never;

describe("what a refresh changed", () => {
  const prev = { headers: ["Zone", "Count"], rows: [["Adyar", 10], ["Teynampet", 20], ["Royapuram", 30]] };
  it("rows added and removed by content, not by count", () => {
    const next = { headers: ["Zone", "Count"], rows: [["Adyar", 10], ["Teynampet", 22], ["Royapuram", 30], ["Manali", 5]] };
    expect(diffTables(prev, next, null)).toMatchObject({ added: 2, removed: 1, columns: null });
  });
  it("columns added and removed; a jump of 50%+ in the main measure is called out", () => {
    const next = { headers: ["Zone", "Count", "Ward"], rows: [["Adyar", 30, 1], ["Teynampet", 40, 2], ["Royapuram", 50, 3]] };
    const d = diffTables(prev, next, "Count");
    expect(d.columns).toEqual({ added: ["Ward"], removed: [] });
    expect(d.jump).toMatch(/Count rose from 60 to 120 \(\+100%\)/);
  });
});

const meta = (over: Partial<DatasetMeta> = {}): DatasetMeta => ({
  id: "ds_card000001", name: "Ward complaints", createdAt: "2026-10-20T04:00:00.000Z", updatedAt: "2026-10-27T04:00:00.000Z", rows: 38, cols: 5,
  window: { from: "2026-10-01", to: "2026-10-27" },
  spec: { title: "Ward complaints", columns: [{ key: "c0", header: "Zone", label: "Zone", role: "zone" }], openValues: [], panelBy: null } as never,
  profile: [], panels: [], link: null, story: null, rules: [], sample: false,
  source: { kind: "link", file: "complaints.csv", url: "https://data.example.gov.in/x.csv", sheet: null, sheets: [], bytes: 1000, caption: null,
    connect: { method: "http", via: "the file", auth: "none", account: null, candidates: [], choice: "file-1", hash: "", fetchedAt: "2026-10-27T04:00:00.000Z", every: null, lastOkAt: null, lastError: null,
      history: [{ at: "2026-10-27T04:00:00.000Z", ok: true, rows: 38, changed: true, note: "x", added: 3, removed: 1, columns: { added: ["Ward"], removed: [] }, jump: null },
        { at: "2026-10-26T04:00:00.000Z", ok: false, rows: null, changed: false, note: "The site has a problem (HTTP 500)." }] } },
  detective: { before: 70, after: 95, rowsIn: 40, rowsOut: 38, placed: 30, unplaced: [{ v: "Near bus stand", n: 4 }],
    issues: [{ kind: "total_rows", column: null, label: "Removed total rows", count: 1, action: "removed", examples: [] }, { kind: "duplicates", column: null, label: "Removed duplicate rows", count: 1, action: "removed", examples: [] },
      { kind: "variants", column: "c0", label: "Merged spellings of zones", count: 6, action: "fixed", examples: [] }] },
  steps: [{ step: "understand", ms: 10, detail: "", by: "rules", model: null }],
  relevance: { verdict: "district", why: "78% of rows in Chennai.", by: "rules", filtered: null, forced: false, signals: [] },
  ...over
} as DatasetMeta);

describe("the data card and the change log", () => {
  it("rows read, left out and used; fixes; places; the checks", () => {
    const c = dataCard(meta(), { conn: null, panels: 6, lintFixes: 2 });
    expect(c.rows).toMatchObject({ read: 40, used: 38 });
    expect(c.rows.removed.map((r) => r.n)).toEqual([1, 1]);
    expect(c.fixes[0]).toMatchObject({ n: 6, action: "Fixed" });
    expect(c.places.share).toBe(79);
    expect(c.places.unmatched[0].v).toBe("Near bus stand");
    expect(c.checks.find((k) => k.label === "Every chart checked")!.detail).toMatch(/6 panels.*2 fixed/);
    expect(c.source.terms).toMatch(/data\.example\.gov\.in/);
    expect(c.reading.by).toBe("rules");
  });
  it("the change log lists every refresh, failures too, newest first, with columns that changed", () => {
    const log = changeLog(meta(), { history: [{ at: "2026-10-27T06:00:00.000Z", kind: "quarantine", ok: false, rowsAdded: null, rows: 38, note: "Rows fell from 6 to 1. Held in quarantine." }] } as never);
    expect(log.map((x) => x.kind)).toEqual(["quarantine", "columns", "refresh", "failed"]);
    expect(log.find((x) => x.kind === "refresh")!.text).toMatch(/\+3 rows, −1 rows/);
  });
});

describe("U6 families from realistic headers", () => {
  const read = (headers: string[], file: string, rows: (string | number)[][]) => {
    const t = parseFile(Buffer.from([headers.join(","), ...rows.map((r) => r.join(","))].join("\n")), file);
    return rulesSpec(profileTable(t), file, t.caption, refs);
  };
  const cases: [FamilyKey, string[], string, (string | number)[]][] = [
    ["progress", ["Zone", "Scheme", "Target (houses)", "Achieved (houses)", "% complete"], "pmay_progress.csv", ["Adyar", "PMAY", 120, 80, 66]],
    ["works", ["Work ID", "Zone", "Name of work", "Contractor", "Estimate (Rs)", "Work order date", "Status"], "road_works.csv", ["W1", "Adyar", "Road relaying", "ABC", 120000, "2026-09-01", "In progress"]],
    ["service", ["Complaint No", "Zone", "Complaint type", "Date", "Status"], "grievances.csv", ["C1", "Adyar", "Garbage", "2026-10-01", "Pending"]],
    ["health", ["Hospital", "Zone", "Week", "Fever cases", "Dengue cases"], "fever_weekly.csv", ["GH", "Adyar", "2026-10-01", 40, 3]],
    ["supplies", ["Shop", "Zone", "Rice stock (kg)", "Received (kg)", "Issued (kg)"], "pds_stock.csv", ["S1", "Adyar", 400, 500, 100]],
    ["water", ["Reservoir", "Level (ft)", "Storage (mcft)", "Inflow (cusecs)", "Date"], "reservoirs.csv", ["Poondi", 30, 2000, 200, "2026-10-01"]],
    ["facility", ["Name", "Zone", "Address", "Latitude", "Longitude"], "fire_stations.csv", ["Egmore Fire Station", "Teynampet", "Egmore", 13.07, 80.26]]
  ];
  for (const [want, headers, file, row] of cases) {
    it(`${want}: ${FAMILIES[want].name}`, () => {
      const spec = read(headers, file, Array.from({ length: 12 }, (_, i) => row.map((v) => (typeof v === "number" ? v + i : v))));
      expect(detectFamily(spec, file).key).toBe(want);
    });
  }
  it("a weak reading asks the Collector to confirm; a correction is kept and wins", () => {
    const spec = read(["A", "B", "C"], "data.csv", Array.from({ length: 8 }, (_, i) => [i, `x${i}`, i * 2]));
    const auto = familyOf({ spec, source: { file: "data.csv" } } as never);
    expect(auto.confirm).toBe(true);
    const mine = familyOf({ spec, source: { file: "data.csv" }, family: { key: "water", by: "you" } } as never);
    expect(mine).toMatchObject({ key: "water", by: "you", confirm: false, confidence: 1 });
  });
  it("a family's own insights count more in the ranking", () => {
    expect(familyBoost("works", "Delay")).toBe(1.25);
    expect(familyBoost("works", "Seasonality")).toBe(1);
    expect(familyBoost(null, "Delay")).toBe(1);
  });
});
