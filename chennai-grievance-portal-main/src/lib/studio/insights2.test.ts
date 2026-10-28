/**
 * Insight engine 2.0 (masterclass U4, 9.6): each new insight type on data made to show it (and not on noise), the
 * funnel's fair comparison on units of different sizes, the ranking (usefulness parts, bands), the R-19 negatives
 * (counts of things are never "Needs action"), no causal words, and the golden top three of each sample.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { clean, type DRow } from "@/lib/studio/clean";
import { computeInsights } from "@/lib/studio/insights";
import { changePoint, computeInsights2, funnel } from "@/lib/studio/insights2";
import { ACTIONABLE, RANK, freshnessOf, rankOne, significanceOf } from "@/lib/studio/rank";
import { parseFile } from "@/lib/studio/parse";
import { profileTable } from "@/lib/studio/profile";
import { rulesSpec } from "@/lib/studio/spec";
import type { Insight, Spec } from "@/lib/studio/types";
import { addDays, parseDate } from "@/lib/studio/values";

const refs = { wards: new Map(), zones: new Map(), taluks: new Map(), categories: [], depts: [], families: new Map() } as never;
const ZONES = ["Thiruvottiyur", "Manali", "Madhavaram", "Tondiarpet", "Royapuram", "Thiru-Vi-Ka Nagar", "Ambattur", "Anna Nagar", "Teynampet", "Kodambakkam", "Valasaravakkam", "Alandur", "Adyar", "Perungudi", "Sholinganallur"];
const names = { zone: (z: number) => ZONES[z - 1] ?? `Zone ${z}`, taluk: (t: string) => t, zoneOf: (v: string | number) => { const i = ZONES.findIndex((z) => z.toLowerCase() === String(v).toLowerCase()); return i >= 0 ? i + 1 : null; } };

/** A CSV read as the pipeline reads it (the geography from the zone column, dates from the date column). */
function build(csvText: string, file = "x.csv") {
  const t = parseFile(Buffer.from(csvText), file);
  const spec = rulesSpec(profileTable(t), file, t.caption, refs) as Spec;
  const c = clean(t, spec);
  const date = spec.columns.find((x) => x.role === "date");
  const zone = spec.columns.find((x) => x.role === "zone" || (x.role === "place" && /zone/i.test(x.header)));
  for (const r of c.rows) {
    if (date && r._d == null) r._d = parseDate(r[date.key]);
    if (zone) r._z = names.zoneOf(String(r[zone.key] ?? ""));
  }
  return { spec, rows: c.rows, det: c.detective, window: c.window };
}
const csv = (h: string[], rows: (string | number)[][]) => [h.join(","), ...rows.map((r) => r.join(","))].join("\n");
const day0 = "2026-06-01";

describe("each new insight type", () => {
  it("Drivers: the category behind a rise between two equal periods", () => {
    const rows: (string | number)[][] = [];
    for (let w = 0; w < 10; w++) for (const [t, k] of [["Potholes", w >= 6 ? 14 : 4], ["Lights", 5], ["Drains", 5]] as [string, number][])
      for (let i = 0; i < k; i++) rows.push([addDays(day0, w * 7 + (i % 6)), t, ZONES[i % 15]]);
    const b = build(csv(["Date", "Complaint type", "Zone"], rows));
    const x = computeInsights2({ ...b, names }).find((i) => i.label === "Drivers");
    expect(x?.title).toMatch(/Potholes accounts for most of the rise/);
  });
  it("Unusual change: last week outside mean ± 2 sd of the 8 before; not on steady noise", () => {
    // each row its own complaint (an id), so the Data Detective keeps them all
    const mk = (spike: boolean) => { const rows: (string | number)[][] = []; let id = 0; for (let w = 0; w < 10; w++) for (let i = 0; i < (w === 9 && spike ? 40 : 10 + (w % 2)); i++) rows.push([`C${++id}`, addDays(day0, w * 7 + (i % 7)), "A"]); return rows; };
    const hit = computeInsights2({ ...build(csv(["Complaint no", "Date", "Type"], mk(true))), names }).find((i) => i.label === "Unusual change");
    expect(hit?.title).toMatch(/unusually high/);
    expect(computeInsights2({ ...build(csv(["Complaint no", "Date", "Type"], mk(false))), names }).some((i) => i.label === "Unusual change")).toBe(false);
  });
  it("Change point: a level that moved and stayed", () => {
    const cp = changePoint([5, 6, 5, 5, 6, 15, 16, 15, 14, 16]);
    expect(cp?.at).toBe(5);
    expect(cp!.t).toBeGreaterThan(4);
  });
  it("Correlation: said as an association, never a cause", () => {
    // related but not identical (ρ near 0.9, not 1: a perfect match usually means one column is made from the other)
    const rows = Array.from({ length: 20 }, (_, i) => [ZONES[i % 15], 100 + i * 10, 50 + i * 4 + [9, -7, 3, -11, 6][i % 5]]);
    const x = computeInsights2({ ...build(csv(["Zone", "Households", "Fever cases"], rows)), names }).find((i) => i.label === "Correlation");
    expect(x?.text).toMatch(/association/);
    expect(x?.text).toMatch(/not proof/);
  });
  it("Target gap: the laggards and the days to the deadline", () => {
    const rows = ZONES.slice(0, 6).map((z, i) => [z, 100, 30 + i * 12, "2026-11-30"]);
    const prev = process.env.STUDIO_TODAY;
    const b = build(csv(["Zone", "Target (km)", "Achieved (km)", "Deadline"], rows));
    const x = computeInsights2({ ...b, names, today: "2026-10-27" }).find((i) => i.label === "Target gap");
    process.env.STUDIO_TODAY = prev;
    expect(x?.text).toMatch(/34 days to the deadline/);
    expect(x?.text).toMatch(/Furthest behind: Thiruvottiyur 30%/);
  });
  it("Freshness: a unit that stopped reporting", () => {
    const rows: (string | number)[][] = [];
    for (let w = 0; w < 12; w++) for (const z of ZONES.slice(0, 5)) if (!(z === "Manali" && w >= 6)) rows.push([addDays(day0, w * 7), z, 3]);
    const x = computeInsights2({ ...build(csv(["Report date", "Zone", "Cases"], rows)), names, today: addDays(day0, 80) }).find((i) => /stopped reporting/.test(i.title));
    expect(x?.title).toBe("Manali stopped reporting");
  });
});

describe("funnel limits: a fair comparison of units of different sizes", () => {
  it("a small unit at an extreme is 'too few', a large unit just as far out is flagged", () => {
    const pts = funnel([{ key: "Big", n: 400, x: 200 }, { key: "Small", n: 6, x: 5 }, ...Array.from({ length: 6 }, (_, i) => ({ key: `U${i}`, n: 300, x: 75 + i }))]);
    expect(pts.find((p) => p.key === "Small")!.flag).toBe("few");
    expect(pts.find((p) => p.key === "Big")!.flag).toBe("above");
    expect(pts.filter((p) => p.key.startsWith("U")).every((p) => p.flag === "inside")).toBe(true);
  });
  it("the same rate is unusual at size 2,000 and ordinary at size 20", () => {
    const base = Array.from({ length: 8 }, (_, i) => ({ key: `U${i}`, n: 1000, x: 200 }));
    expect(funnel([...base, { key: "X", n: 2000, x: 560 }]).find((p) => p.key === "X")!.flag).toBe("above");
    expect(funnel([...base, { key: "X", n: 20, x: 6 }]).find((p) => p.key === "X")!.flag).toBe("inside");
  });
});

describe("the ranking", () => {
  const ins = (label: Insight["label"], score: number, title = "x"): Insight => ({ id: "i", label, tone: "sev", score, text: "", title, metric: { value: "", caption: "" }, bars: [], series: [], plan: null, key: null, owner: null });
  it("its parts are defined and bounded", () => {
    expect(significanceOf(1)).toBe(0);
    expect(significanceOf(10)).toBe(0.5);
    expect(significanceOf(1000)).toBe(1);
    expect([freshnessOf(3), freshnessOf(20), freshnessOf(60), freshnessOf(400)]).toEqual([1, 0.8, 0.6, 0.4]);
    expect(Object.values(ACTIONABLE).every((v) => v > 0 && v <= 1)).toBe(true);
  });
  it("Needs action only above the threshold and when someone can act", () => {
    const r = rankOne({ ...ins("Backlog", 80), n: 500 }, { rows: 500, to: "2026-10-27", today: "2026-10-28" });
    expect(r.band).toBe("act");
    expect(r.usefulness).toBeGreaterThanOrEqual(RANK.act);
    expect(rankOne({ ...ins("Correlation", 80), n: 500 }, { rows: 500, to: "2026-10-27", today: "2026-10-28" }).band).not.toBe("act");
    expect(rankOne({ ...ins("Backlog", 80), n: 4 }, { rows: 4, to: "2026-10-27", today: "2026-10-28" }).band).not.toBe("act");
  });
  it("R-19: counts of things are never Needs action (8 metro stations; 152 open incidents in hotspot zones)", () => {
    for (const x of [{ ...ins("Hotspot", 90, "8 metro stations in Anna Nagar"), n: 106 }, { ...ins("Linked", 90, "152 open incidents in hotspot zones"), n: 152 }, { ...ins("Concentration", 90, "8 metro stations"), n: 106 }])
      expect(rankOne(x, { rows: 106, to: "2026-10-27", today: "2026-10-28", things: true }).band).not.toBe("act");
  });
  it("said before counts half (novelty), except what needs action: a persisting backlog stays", () => {
    const a = rankOne(ins("Magnitude", 80, "T"), { rows: 500, to: "2026-10-27", today: "2026-10-28" });
    const b = rankOne(ins("Magnitude", 80, "T"), { rows: 500, to: "2026-10-27", today: "2026-10-28", seen: new Set(["Magnitude|T"]) });
    expect(b.usefulness).toBeCloseTo(a.usefulness / 2, 3);
    const k = rankOne(ins("Backlog", 80, "T"), { rows: 500, to: "2026-10-27", today: "2026-10-28", seen: new Set(["Backlog|T"]) });
    expect(k.band).toBe("act");
  });
});

describe("9.6 golden top three per sample, and no causal claims", () => {
  const dir = path.join(process.cwd(), "data", "studio-samples");
  const CAUSAL = /\b(because|caused|causes|due to|leads? to|results? in|drives?|driven by|owing to)\b/i;
  const GOLDEN: Record<string, string[]> = {
    // without the gazetteer (a unit test places rows by their zone column only), the strongest angles each sample shows
    "Fever_Surveillance_Weekly_2026.csv": ["Anomaly"],
    "GCC_SWD_Desilting_Register_Sep2026.xlsx": ["Backlog", "Delay", "Service gap"],
    "Hospital_Beds_Daily_2026.csv": ["Magnitude"],
    "PDS_Ration_Shop_Stock_Oct2026.csv": []
  };
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => /\.(csv|xlsx)$/.test(x)) : []) {
    it(f, () => {
      process.env.STUDIO_TODAY = "2026-10-28";
      const t = parseFile(fs.readFileSync(path.join(dir, f)), f);
      const spec = rulesSpec(profileTable(t), f, t.caption, refs) as Spec;
      const c = clean(t, spec);
      const date = spec.columns.find((x) => x.role === "date");
      const zone = spec.columns.find((x) => x.role === "zone");
      const open = spec.columns.find((x) => x.role === "status");
      for (const r of c.rows as DRow[]) {
        if (date && r._d == null) r._d = parseDate(r[date.key]);
        if (zone) r._z = names.zoneOf(String(r[zone.key] ?? "")) ?? (Number(String(r[zone.key]).match(/\d+/)?.[0]) || null);
        if (open && spec.openValues.length) r._o = spec.openValues.some((v) => String(r[open.key] ?? "").toLowerCase() === v.toLowerCase()) ? 1 : 0;
      }
      const ins = computeInsights(c.rows, spec, c.detective, null, c.window, names as never);
      delete process.env.STUDIO_TODAY;
      const shown = ins.filter((x) => x.rank!.band !== "hidden");
      const top = shown.slice(0, 3).map((x) => x.label);
      for (const want of GOLDEN[f] ?? []) expect({ f, top }).toEqual({ f, top: expect.arrayContaining([want]) });
      for (const x of ins) {
        expect({ f, t: `${x.title} ${x.text}` }).not.toEqual({ f, t: expect.stringMatching(CAUSAL) });
        expect(x.confidence).toMatch(/^n = [\d,]+ · /);
      }
      // a count of things in a file with no status is never Needs action
      if (!open) expect(ins.filter((x) => x.rank!.band === "act" && ["Hotspot", "Concentration", "Ranking", "Magnitude", "Linked"].includes(x.label))).toEqual([]);
    });
  }
});
