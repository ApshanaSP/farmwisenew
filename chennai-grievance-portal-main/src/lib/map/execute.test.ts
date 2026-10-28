import { describe, expect, it } from "vitest";
import { GI_HOT, dbscan, giStar, hex500, matches, periodRange, runMapPlan, type Ctx, type Place } from "./execute";
import { haversineM, distToLineM } from "./geom";
import { checkPlan, type Filter, type Plan, type Step } from "./plan";
import { compose, nearestMiss } from "./answer";
import { FIRE, HOSPITALS, INCIDENTS, NOW, ROAD, SCHOOLS, fixtureWorld } from "./fixture";

const w = fixtureWorld();
const PLACES: Record<string, Place> = {
  "loc:Testpet": { ref: "loc:Testpet", name: "Testpet", name_ta: "டெஸ்ட்பேட்டை", lat: 13.005, lon: 80.215, kind: "locality" }
};
const ctx: Ctx = { lang: "en", place: (r) => PLACES[r] ?? (r.startsWith("drawn:") ? { ref: r, name: "drawn", name_ta: null, lat: Number(r.split(/[:,]/)[1]), lon: Number(r.split(/[:,]/)[2]), kind: "drawn" } : null) };
const F = (f: Partial<Filter>): Filter => ({ category: null, family: null, severity: null, status: "open", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 30, offset: 0 }, text: null, ...f });
const plan = (steps: Step[], show?: string): Plan => {
  const p = { steps, show: show ?? steps[steps.length - 1].as, language: "en" as const };
  const c = checkPlan(p);
  if (!c.ok) throw new Error(c.problems.join("; "));
  return c.plan;
};
const ids = (r: { hits: { inc: { id: string } }[] }) => r.hits.map((h) => h.inc.id).sort();
const take = (f: Partial<Filter> = {}): Step => ({ op: "take", as: "a", layer: "incidents", filter: F(f), where: null });

/** the oracle: plain loops over every row, haversine for every pair, no index and no shared path but haversineM */
const inWindow = (first: string, days: number) => {
  const t = Date.parse(first.replace(" ", "T") + "Z"), now = Date.parse(NOW.replace(" ", "T") + "Z");
  return t > now - days * 86_400_000 && t <= now;
};

describe("take filters", () => {
  it("open waterlogging, last 30 days: hand-checked", () => {
    const r = runMapPlan(plan([take({ category: ["FLOOD_WATERLOGGING"] })]), w, ctx);
    // I04 is closed, I07 is 40 days old; I25 (no exact place) still counts in a district-wide take
    expect(ids(r)).toEqual(["I01", "I02", "I03", "I05", "I06", "I25", "I29", "I30"]);
  });
  it("period windows end at now, (from, to] like the console", () => {
    const r = periodRange({ kind: "last_days", days: 7, offset: 1 }, NOW);
    expect(r).toEqual({ from: "2026-10-13 20:00:00", to: "2026-10-20 20:00:00", fromOpen: true });
    // I01 was reported exactly 24 h before now: outside "last 24 hours" (the window's start is open), inside 2 days
    expect(matches(INCIDENTS[0], F({ period: { kind: "last_days", days: 1, offset: 0 } }), NOW)).toBe(false);
    expect(matches(INCIDENTS[0], F({ period: { kind: "last_days", days: 2, offset: 0 } }), NOW)).toBe(true);
  });
  it("severity, citizen, overdue, department and text", () => {
    const run = (f: Partial<Filter>) => ids(runMapPlan(plan([take({ period: null, ...f })]), w, ctx));
    expect(run({ severity: ["Severe"] })).toEqual(["I01", "I05", "I14", "I23", "I28"]);
    expect(run({ citizen: true, category: ["SOLID_WASTE"] })).toEqual(["I08", "I09", "I10", "I13", "I26", "I27"]);
    expect(run({ overdue: true })).toEqual(["I02", "I21", "I28"]);
    expect(run({ dept: ["GCC-SWM"], status: "closed" })).toEqual(["I12"]);
    expect(run({ text: "test salai junction", status: "any" })).toEqual(["I17"]);
  });
  it("rows sort by priority, then newest, then id", () => {
    const r = runMapPlan(plan([take({ period: null, status: "any" })]), w, ctx);
    const pr = r.hits.map((h) => h.inc.priority);
    expect(pr).toEqual([...pr].sort((a, b) => b - a));
  });
});

describe("within", () => {
  const p = (m: number, f: Partial<Filter> = { category: ["FLOOD_WATERLOGGING"] }) =>
    plan([take(f), { op: "take", as: "f1", layer: "schools", filter: null, where: null }, { op: "within", as: "near", of: "a", near: ["f1"], meters: m }]);
  it("300 m of schools: hand-checked, with the nearest school and its distance", () => {
    const r = runMapPlan(p(300), w, ctx);
    expect(ids(r)).toEqual(["I01", "I02", "I06", "I29"]);
    const i01 = r.hits.find((h) => h.inc.id === "I01")!;
    expect(i01.near!.name).toBe("Govt School Northpet");
    expect(i01.near!.m).toBeLessThan(40);
    // I05 sits on S2 but is known only to 2.5 km: left out, and said so
    expect(r.leftOut).toBe(2);
    expect(r.steps.find((s) => s.as === "near_unplaced")!.count).toBe(2);
  });
  it("equals a brute-force oracle at several distances", () => {
    for (const m of [10, 50, 100, 250, 300, 500, 1000, 5000]) {
      const want = INCIDENTS.filter((i) => i.cat === "FLOOD_WATERLOGGING" && i.open && inWindow(i.first, 30) && i.pinnable && SCHOOLS.some((s) => haversineM(i, s) <= m)).map((i) => i.id).sort();
      expect(ids(runMapPlan(p(m), w, ctx))).toEqual(want);
    }
  });
  it("a 2,001 m incident is never kept by a point rule; a 2,000 m one is", () => {
    const r = runMapPlan(p(5000, { category: ["FLOOD_WATERLOGGING"], period: null }), w, ctx);
    expect(ids(r)).toContain("I06");
    expect(ids(r)).not.toContain("I05");
    expect(ids(r)).not.toContain("I25");
  });
  it("hospitals without clinics; government only; near several layers", () => {
    const base = take({ category: ["DRAINAGE_SEWAGE"], period: null });
    const hosp = (where: { government: boolean | null; kinds: string[] | null }) =>
      plan([base, { op: "take", as: "f1", layer: "hospitals", filter: null, where }, { op: "within", as: "near", of: "a", near: ["f1"], meters: 200 }]);
    expect(ids(runMapPlan(hosp({ government: null, kinds: ["hospital", "health_centre"] }), w, ctx))).toEqual(["I21"]);
    expect(ids(runMapPlan(hosp({ government: null, kinds: null }), w, ctx))).toEqual(["I21", "I22"]);
    expect(ids(runMapPlan(hosp({ government: true, kinds: null }), w, ctx))).toEqual(["I21"]);
    const two = plan([take({ period: null }), { op: "take", as: "f1", layer: "fire_stations", filter: null, where: null }, { op: "take", as: "f2", layer: "water_bodies", filter: null, where: null },
      { op: "within", as: "near", of: "a", near: ["f1", "f2"], meters: 60 }]);
    const r = runMapPlan(two, w, ctx);
    expect(ids(r)).toEqual(INCIDENTS.filter((i) => i.open && i.pinnable && (FIRE.some((f) => haversineM(i, f) <= 60) || i.id === "I24")).map((i) => i.id).sort());
  });
  it("an empty answer names the nearest miss", () => {
    const pl = plan([take({ category: ["FLOOD_WATERLOGGING"], period: { kind: "last_days", days: 2, offset: 0 } }), { op: "take", as: "f1", layer: "hospitals", filter: null, where: null },
      { op: "within", as: "near", of: "a", near: ["f1"], meters: 50 }]);
    const r = runMapPlan(pl, w, ctx);
    expect(r.hits).toHaveLength(0);
    const miss = nearestMiss(pl, r, w, ctx)!;
    expect(miss.id).toBe("I01");
    expect(Math.round(miss.m)).toBe(Math.round(Math.min(...HOSPITALS.map((h) => haversineM(INCIDENTS[0], h)))));
    const a = compose(pl, r, w, ctx);
    expect(a.headline).toMatch(/^No open/);
    expect(a.meaning).toMatch(/^The closest is .* from /);
  });
});

describe("inside, along, nearest, farthest", () => {
  it("inside a zone counts by the record, unpinnable ones included", () => {
    const r = runMapPlan(plan([take({ period: null }), { op: "inside", as: "in", of: "a", area: { kind: "zone", id: 2 } }]), w, ctx);
    expect(ids(r)).toEqual(INCIDENTS.filter((i) => i.open && i.zone === 2).map((i) => i.id).sort());
    expect(ids(r)).toContain("I05");
  });
  it("inside a point radius counts by the map point, pinnable only", () => {
    const r = runMapPlan(plan([take({ period: null }), { op: "inside", as: "in", of: "a", area: { kind: "point", ref: "loc:Testpet", radius_m: 120 } }]), w, ctx);
    const want = INCIDENTS.filter((i) => i.open && i.pinnable && haversineM(i, PLACES["loc:Testpet"]) <= 120).map((i) => i.id).sort();
    expect(ids(r)).toEqual(want);
    expect(want).toEqual(["I26", "I27", "I28"]);
  });
  it("along a road: hand-checked and oracle", () => {
    const pl = (m: number) => plan([take({ period: null, status: "any" }), { op: "along", as: "l", of: "a", line: "road:test-salai", meters: m }]);
    expect(ids(runMapPlan(pl(75), w, ctx))).toEqual(["I08", "I09", "I10", "I11", "I14", "I15"]);
    for (const m of [10, 30, 60, 90, 200]) {
      const want = INCIDENTS.filter((i) => i.pinnable && distToLineM(i, ROAD.lines).m <= m).map((i) => i.id).sort();
      expect(ids(runMapPlan(pl(m), w, ctx))).toEqual(want);
    }
  });
  it("a GCC street with no line matches on recorded text and says so", () => {
    const r = runMapPlan(plan([take({ period: null }), { op: "along", as: "l", of: "a", line: "gcc:Test Salai Junction", meters: 75 }]), w, ctx);
    expect(ids(r)).toEqual(["I17"]);
    expect(r.steps[1].note_en).toMatch(/no map line/);
  });
  it("nearest to a place and to each incident", () => {
    const r = runMapPlan(plan([{ op: "take", as: "f1", layer: "schools", filter: null, where: null }, { op: "nearest", as: "n", from: "place:loc:Testpet", to: "f1", k: 2 }]), w, ctx);
    expect(r.show.type).toBe("nearest");
    const near = r.show.type === "nearest" ? r.show.pairs[0].to.map((x) => x.id) : [];
    expect(near).toEqual([...SCHOOLS].sort((a, b) => haversineM(PLACES["loc:Testpet"], a) - haversineM(PLACES["loc:Testpet"], b)).map((s) => s.id));
    const r2 = runMapPlan(plan([take({ severity: ["Severe"], period: null }), { op: "take", as: "f1", layer: "hospitals", filter: null, where: null }, { op: "nearest", as: "n", from: "a", to: "f1", k: 1 }]), w, ctx);
    for (const h of r2.hits) {
      const best = [...HOSPITALS].sort((a, b) => haversineM(h.inc, a) - haversineM(h.inc, b))[0];
      expect(h.near!.id).toBe(best.id);
    }
  });
  it("farthest ward from a fire station: the ward with the highest 90th percentile", () => {
    const r = runMapPlan(plan([{ op: "take", as: "f1", layer: "fire_stations", filter: null, where: null }, { op: "farthest", as: "far", areas: "ward", from: "f1", beyond_m: null }]), w, ctx);
    expect(r.show.type).toBe("areas");
    if (r.show.type !== "areas") return;
    expect(r.show.areas[0].key).toBe("1"); // ward 1 is the far corner from F1
    expect(r.show.best!.key).toBe("3");
    const beyond = runMapPlan(plan([{ op: "take", as: "f1", layer: "fire_stations", filter: null, where: null }, { op: "farthest", as: "far", areas: "ward", from: "f1", beyond_m: 1500 }]), w, ctx);
    expect(beyond.show.type === "areas" && beyond.show.areas.every((a) => a.p90 > 1500)).toBe(true);
  });
});

describe("count_by, hotspot, compare, change", () => {
  it("count by ward: groups add up to the total; unrecorded ones are said", () => {
    const r = runMapPlan(plan([take({ period: null }), { op: "count_by", as: "by", of: "a", by: "ward" }]), w, ctx);
    if (r.show.type !== "groups") throw new Error("groups");
    expect(r.show.groups.reduce((s, g) => s + g.n, 0) + r.show.unassigned.length).toBe(r.hits.length);
    expect(r.show.unassigned).toEqual(["I25"]);
  });
  it("hex500 cells hold every pinnable point", () => {
    const r = runMapPlan(plan([take({ period: null }), { op: "count_by", as: "by", of: "a", by: "hex500" }]), w, ctx);
    if (r.show.type !== "groups") throw new Error("groups");
    expect(r.show.groups.reduce((s, g) => s + g.n, 0)).toBe(r.hits.filter((h) => h.inc.pinnable).length);
    for (const g of r.show.groups) for (const id of g.ids) expect(haversineM(INCIDENTS.find((i) => i.id === id)!, g)).toBeLessThan(300);
    expect(hex500({ lat: 13, lon: 80.2 }).key).toBe(hex500({ lat: 13.0001, lon: 80.2001 }).key);
  });
  it("DBSCAN finds the garbage cluster on Test Salai (4 within 30 m), not the pair", () => {
    const r = runMapPlan(plan([take({ category: ["SOLID_WASTE"], period: null }), { op: "hotspot", as: "hot", of: "a" }]), w, ctx);
    if (r.show.type !== "hotspots") throw new Error("hotspots");
    expect(r.show.method).toBe("dbscan");
    // I26 and I27 are two garbage reports 70 m apart: too few for a cluster
    expect(r.show.clusters.map((c) => c.ids)).toEqual([["I08", "I09", "I10", "I11"]]);
    expect(dbscan([])).toEqual([]);
  });
  it("Gi* matches the pipeline's formula on a hand case", () => {
    const z = giStar(new Map([[1, 10], [2, 0], [3, 0], [4, 0]]), new Map([[1, [2]], [2, [1, 3]], [3, [2, 4]], [4, [3]]]));
    // x = [10,0,0,0]: mean 2.5, s = sqrt(25 - 6.25) = 4.330; ward 1: nb {1,2}, num = 10 - 5 = 5, den = 4.330 * sqrt((8-4)/3) = 5
    expect(z.get(1)).toBe(1);
    expect(GI_HOT).toBeCloseTo(1.96, 2);
  });
  it("compare two zones", () => {
    const r = runMapPlan(plan([take({ period: null }), { op: "compare", as: "cmp", of: "a", a: { kind: "zone", id: 1 }, b: { kind: "zone", id: 2 } }]), w, ctx);
    if (r.show.type !== "compare") throw new Error("compare");
    expect(r.show.a.n).toBe(INCIDENTS.filter((i) => i.open && i.zone === 1).length);
    expect(r.show.b.n).toBe(INCIDENTS.filter((i) => i.open && i.zone === 2).length);
  });
  it("change: this week against the week before, any status", () => {
    const r = runMapPlan(plan([take({ category: ["FLOOD_WATERLOGGING"], status: "any", period: { kind: "last_days", days: 7, offset: 0 } }),
      { op: "change", as: "chg", of: "a", now: { kind: "last_days", days: 7, offset: 0 }, before: { kind: "last_days", days: 7, offset: 1 } }]), w, ctx);
    if (r.show.type !== "change") throw new Error("change");
    const t = (d: number) => Date.parse(NOW.replace(" ", "T") + "Z") - d * 86_400_000;
    const inR = (i: (typeof INCIDENTS)[number], a: number, b: number) => { const x = Date.parse(i.first.replace(" ", "T") + "Z"); return x > t(a) && x <= t(b); };
    expect(r.show.now.hits.length).toBe(INCIDENTS.filter((i) => i.cat === "FLOOD_WATERLOGGING" && inR(i, 7, 0)).length);
    expect(r.show.before.hits.length).toBe(INCIDENTS.filter((i) => i.cat === "FLOOD_WATERLOGGING" && inR(i, 14, 7)).length);
  });
});

describe("officer lock, determinism and safety", () => {
  it("an officer asking about another department gets their own, and the trace says so", () => {
    const p = plan([take({ dept: ["GCC-SWM"], period: null })]);
    const r = runMapPlan(p, w, ctx, "GCC-SWD");
    expect(r.hits.every((h) => h.inc.dept === "GCC-SWD")).toBe(true);
    expect(r.hits.length).toBe(INCIDENTS.filter((i) => i.open && i.dept === "GCC-SWD").length);
    expect(r.lockNote).toBe(true);
    expect(r.steps.at(-1)!.note_en).toMatch(/Your department only/);
  });
  it("the same plan twice gives the same output, byte for byte", () => {
    const p = plan([take({ period: null, status: "any" }), { op: "take", as: "f1", layer: "schools", filter: null, where: null }, { op: "within", as: "near", of: "a", near: ["f1"], meters: 1500 },
      { op: "count_by", as: "by", of: "near", by: "zone" }]);
    expect(JSON.stringify(runMapPlan(p, w, ctx))).toBe(JSON.stringify(runMapPlan(p, w, ctx)));
  });
  it("a plan that breaks the limits is refused and never runs", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...take(), as: `a${i}` }));
    expect(checkPlan({ steps: nine, show: "a0", language: "en" }).ok).toBe(false);
    expect(checkPlan({ steps: [take(), { op: "take", as: "f1", layer: "schools", filter: null, where: null }, { op: "within", as: "near", of: "a", near: ["f1"], meters: 9000 }], show: "near", language: "en" }).ok).toBe(false);
    expect(checkPlan({ steps: [{ ...take(), layer: "parcels" }], show: "a", language: "en" }).ok).toBe(false);
    expect(checkPlan({ steps: [take(), { op: "within", as: "near", of: "a", near: ["nope"], meters: 300 }], show: "near", language: "en" }).ok).toBe(false);
    expect(checkPlan({ steps: [take({ period: { kind: "last_days", days: 400, offset: 0 } })], show: "a", language: "en" }).ok).toBe(false);
    expect(checkPlan({ steps: [take(), take()], show: "a", language: "en" }).ok).toBe(false);
    expect(checkPlan({ steps: [{ op: "take", as: "f1", layer: "schools", filter: null, where: null }, { op: "nearest", as: "n", from: "place:loc:X", to: "f1", k: 21 }], show: "n", language: "en" }).ok).toBe(false);
  });
});
