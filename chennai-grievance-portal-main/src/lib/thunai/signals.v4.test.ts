import { describe, expect, it } from "vitest";
import { buildSignals, conditionsOf, freshWords, seriesFromRows, type CountSeries, type WatchInput, type WatchSignal } from "./signals";
import { allowedSet, figuresIn, gateChunk } from "./numbergate";
import { labelIn } from "./speechcheck";

const AS_OF = "2026-11-14 18:00:00";
const flat = (n: number, v: number) => Array.from({ length: n }, () => v);
const base = (over: Partial<WatchInput> = {}): WatchInput => ({ asOf: AS_OF, series: [], overdue: null, rain: [], lakes: [], warning: null, gaps: null, followed: [], studio: [], ...over });
const zc = (zone: number, cat: string, counts: number[]): CountSeries => ({ dim: "zonecat", zone, dept: null, cat, counts });

/** every line passes the number gate with its own values and has no field label */
function sayable(s: WatchSignal) {
  const allowed = allowedSet(Object.values(s.values));
  for (const l of [s.text.en, s.text.ta]) {
    expect(gateChunk(l, allowed), `${s.key}: ${l}`).toEqual({ ok: true, bad: [] });
    expect(labelIn(l), l).toBeNull();
    expect(l).not.toMatch(/caused by|because of|due to/i);
  }
}

describe("server watch: signals from data, numbers from code", () => {
  it("a two-day rise in drain reports in Royapuram is one high signal with every field, in English and Tamil", () => {
    const s = buildSignals(base({ series: [zc(5, "DRAINAGE_SEWAGE", [...flat(54, 5), 20, 22])] }));
    expect(s).toHaveLength(1);
    const x = s[0];
    expect(x).toMatchObject({ kind: "rise", severity: "high", value: 22, place: { en: "Royapuram", ta: "ராயபுரம்" }, metric: "reports.DRAINAGE_SEWAGE", key: "rise:zonecat:5::DRAINAGE_SEWAGE" });
    expect(x.expected).toBeCloseTo(5, 0);
    expect(x.n).toBeGreaterThanOrEqual(6);
    expect(x.method).toMatch(/Noufaily/);
    expect(x.caveat.ta).toMatch(/[஀-௿]/);
    expect(x.sources[0]).toMatchObject({ id: "incidents", asOf: AS_OF });
    expect(x.text.en).toMatch(/Royapuram: 22 in the last 24 hours, against about 5/);
    expect(x.text.ta).toMatch(/ராயபுரம் பகுதியில/);
    sayable(x);
  });
  it("flat counts raise nothing", () => {
    expect(buildSignals(base({ series: [zc(5, "DRAINAGE_SEWAGE", flat(56, 5)), { dim: "zone", zone: 3, dept: null, cat: null, counts: flat(56, 30) }] }))).toEqual([]);
  });
  it("one event, one line: the zone's own rise is folded into the zone-and-category one", () => {
    const zone: CountSeries = { dim: "zone", zone: 5, dept: null, cat: null, counts: [...flat(54, 40), 60, 62] };
    const s = buildSignals(base({ series: [zone, zc(5, "DRAINAGE_SEWAGE", [...flat(54, 5), 20, 22])] }));
    expect(s.map((x) => x.key)).toEqual(["rise:zonecat:5::DRAINAGE_SEWAGE"]);
  });
  it("cases past the deadline growing two days running", () => {
    const [x] = buildSignals(base({ overdue: [40, 40, 41, 40, 42, 41, 40, 40, 52, 60] }));
    expect(x).toMatchObject({ kind: "overdue", value: 60, expected: 41, metric: "open_past_deadline" });
    expect(x.text.en).toBe("Cases past their deadline are piling up: 60 now, up from 41 a week ago.");
    sayable(x);
  });
  it("rain against IMD's lines; stale readings are ignored", () => {
    const heavy = buildSignals(base({ rain: [{ place: "Nungambakkam", value: 72.4, t: "2026-11-14 08:30:00" }] }));
    expect(heavy[0]).toMatchObject({ kind: "rain", severity: "medium", value: 72 });
    sayable(heavy[0]);
    const veryHeavy = buildSignals(base({ rain: [{ place: "Meenambakkam", value: 130, t: "2026-11-14 08:30:00" }, { place: "Nungambakkam", value: 80, t: "2026-11-14 08:30:00" }] }));
    expect(veryHeavy[0]).toMatchObject({ severity: "high", value: 130 });
    expect(veryHeavy[0].text.en).toMatch(/2 gauges/);
    sayable(veryHeavy[0]);
    expect(buildSignals(base({ rain: [{ place: "Old", value: 150, t: "2026-11-10 08:30:00" }] }))).toEqual([]);
  });
  it("reservoirs, the IMD warning, news gaps", () => {
    const s = buildSignals(base({ lakes: [{ place: "Chembarambakkam", value: 92.3, t: "2026-11-14 06:00:00" }, { place: "Puzhal", value: 84, t: "2026-11-14 06:00:00" }],
      warning: { level: 2, t: "2026-11-14 06:00:00" }, gaps: { n: 3, asOf: AS_OF } }));
    const by = Object.fromEntries(s.map((x) => [x.kind, x]));
    expect(by.reservoir).toMatchObject({ severity: "high", value: 92 });
    expect(by.warning).toMatchObject({ severity: "high" });
    expect(by.gap).toMatchObject({ severity: "medium", value: 3 });
    for (const x of s) sayable(x);
    // high before medium
    expect(s[s.length - 1].kind).toBe("gap");
  });
  it("a reservoir is news when it fills, not while it stays full; test readings say so", () => {
    const t = "2026-11-14 06:00:00";
    expect(buildSignals(base({ lakes: [{ place: "Puzhal", value: 92, t, mean28: 91 }] }))).toEqual([]);
    const [x] = buildSignals(base({ lakes: [{ place: "Puzhal", value: 92, t, mean28: 80.4 }], lakesTest: true }));
    expect(x).toMatchObject({ kind: "reservoir", severity: "high", value: 92, expected: 80.4 });
    expect(x.text.en).toBe("Puzhal is filling: 92 percent full, up from about 80 percent over the past month.");
    expect(x.caveat.en).toMatch(/generated test data/);
    sayable(x);
  });
  it("a followed incident that closed, one that went past its deadline, a followed zone whose counts moved", () => {
    const s = buildSignals(base({ followed: [
      { follow: { id: "f1", kind: "incident", ref: "INC-1", at: AS_OF, snap: { open: true, overdue: false }, cat: "DRAINAGE_SEWAGE", zone: 5 }, now: { open: false, overdue: false } },
      { follow: { id: "f2", kind: "incident", ref: "INC-2", at: AS_OF, snap: { open: true, overdue: false }, cat: null, zone: null }, now: { open: true, overdue: true } },
      { follow: { id: "f3", kind: "zone", ref: "9", at: AS_OF, snap: { openN: 40, overdueN: 10 }, zone: 9 }, now: { openN: 52, overdueN: 10 } },
      { follow: { id: "f4", kind: "zone", ref: "8", at: AS_OF, snap: { openN: 40, overdueN: 10 }, zone: 8 }, now: { openN: 41, overdueN: 10 } }
    ] }));
    const keys = s.map((x) => x.key);
    expect(keys).toContain("followed:incident:INC-1:closed");
    expect(keys).toContain("followed:incident:INC-2:overdue");
    expect(keys.some((k) => k.startsWith("followed:zone:9:open"))).toBe(true);
    expect(keys.some((k) => k.startsWith("followed:zone:8"))).toBe(false);
    const closed = s.find((x) => x.key.endsWith("INC-1:closed"))!;
    expect(closed.text.en).toBe("The drainage and sewage case you follow in Royapuram is now closed.");
    expect(s.find((x) => x.key.startsWith("followed:zone:9"))!.text.en).toBe("Teynampet, which you follow: open cases went from 40 to 52.");
    for (const x of s) { sayable(x); expect(x.text.en).not.toMatch(/INC-/); }
  });
  it("a Data Studio watch: the dataset's name is said without its digits", () => {
    const [x] = buildSignals(base({ studio: [{ dataset: "Wards 2025 works", total: 3 }] }));
    expect(x.kind).toBe("studio");
    expect(figuresIn(x.text.en)).toEqual([]);
    sayable(x);
  });
  it("many random inputs: every line of every signal passes the number gate with its own values", () => {
    let seed = 7;
    const r = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
    let seen = 0;
    for (let k = 0; k < 150; k++) {
      const lvl = 1 + Math.floor(r() * 30);
      const step = 1 + Math.floor(r() * 6);
      const series = [zc(1 + Math.floor(r() * 15), "FLOOD_WATERLOGGING", [...flat(54, lvl), lvl * step + 3, lvl * step + 5]),
        { dim: "dept" as const, zone: null, dept: "GCC-SWD", cat: null, counts: [...flat(54, lvl), lvl * step + 9, lvl * step + 9] }];
      const s = buildSignals(base({ series, overdue: [10, 10, 10, 10, 10, 10, 10, 10, 10 + step * 4, 10 + step * 5], rain: [{ place: "Gauge", value: r() * 300, t: AS_OF }],
        lakes: [{ place: "Lake", value: 60 + r() * 40, t: AS_OF }], gaps: { n: Math.floor(r() * 4), asOf: AS_OF } }), { maxRises: 6 });
      for (const x of s) { sayable(x); seen += 1; }
    }
    expect(seen).toBeGreaterThan(200);
  });
});

describe("the store's rows as series", () => {
  it("buckets by zone, department, category and pair; thin pairs are left out", () => {
    const rows = [{ b: 55, zone: 5, cat: "DRAINAGE_SEWAGE", dept: "GCC-SWD", n: 30 }, { b: 10, zone: 6, cat: "ROAD_DAMAGE", dept: "GCC-ENG", n: 2 }];
    const s = seriesFromRows(rows, 56);
    const k = s.map((x) => `${x.dim}:${x.zone ?? ""}:${x.dept ?? ""}:${x.cat ?? ""}`).sort();
    expect(k).toContain("zonecat:5::DRAINAGE_SEWAGE");
    expect(k).not.toContain("zonecat:6::ROAD_DAMAGE");
    expect(s.find((x) => x.dim === "zone" && x.zone === 5)!.counts[55]).toBe(30);
  });
  it("freshness in words with no figure, and the calm-day conditions", () => {
    expect(freshWords("2026-11-14 17:00:00", AS_OF).en).toBe("just now");
    expect(freshWords("2026-11-13 10:00:00", AS_OF).en).toBe("yesterday");
    expect(figuresIn(freshWords("2026-10-01 10:00:00", AS_OF).ta)).toEqual([]);
    const c = conditionsOf(base({ rain: [{ place: "A", value: 12.4, t: AS_OF }, { place: "B", value: 3, t: AS_OF }], lakes: [{ place: "Puzhal 2", value: 63.2, t: AS_OF }] }));
    expect(c).toMatchObject({ rainMax: 12, rainAt: "A", lakeMax: 63, lakeAt: "Puzhal" });
  });
});
