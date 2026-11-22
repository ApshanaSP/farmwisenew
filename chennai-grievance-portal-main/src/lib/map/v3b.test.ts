/**
 * v3, the owner's 22 Nov 2026 round: ward names ("Anna Nagar (Ward 102)"), the same answer by ward, zone or taluk, an
 * area's topic beside its overview, the answer's topic in words, and the conversation the turn reader is given.
 */
import { describe, expect, it } from "vitest";
import { runMapPlan, wardName, type Ctx } from "./execute";
import { checkPlan, type Filter, type Plan, type Step } from "./plan";
import { fixtureWorld } from "./fixture";
import { nameWards } from "./world";
import { topicOf } from "./answer";
import { areaOfRow, herePlan, regroup } from "@/components/collector/app/askmap/TopBars";
import { historyOf, type Turn } from "@/components/collector/app/askmap/useMapAsk";
import type { PointFeat, World } from "./types";

const ctx: Ctx = { lang: "en", place: () => null };
const F = (f: Partial<Filter>): Filter => ({ category: null, family: null, severity: null, status: "any", dept: null, overdue: null, citizen: null, period: null, text: null, ...f });
const plan = (steps: Step[]): Plan => { const c = checkPlan({ steps, show: steps[steps.length - 1].as, language: "en" }); if (!c.ok) throw new Error(c.problems.join("; ")); return c.plan; };
const pt = (id: string, name: string, lat: number, lon: number, kind: string, ward: number | null): PointFeat => ({ id, layer: "osm_places", name, name_ta: null, lat, lon, kind, in_district: true, ward });

describe("ward names", () => {
  it("a suburb inside the ward is its name; a ward with none takes the nearest within 1.5 km; else it stays 'Ward N'", () => {
    const w: World = fixtureWorld();
    const [a, b, c] = w.wards;
    const places = [pt("osm:1", "Little Place", a.lat + 0.001, a.lon, "neighbourhood", a.ward), pt("osm:2", "Big Suburb", a.lat + 0.002, a.lon, "suburb", a.ward),
      pt("osm:3", "Next Door", b.lat + 0.005, b.lon, "neighbourhood", null)];
    nameWards(w.wards, places);
    expect(a.name?.en).toBe("Big Suburb");
    expect(b.name?.en).toBe("Next Door");
    expect(wardName(w, a.ward).en).toBe(`Big Suburb (Ward ${a.ward})`);
    if (c && Math.hypot(c.lat - b.lat - 0.005, c.lon - b.lon) * 111_320 > 1500) expect(wardName(w, c.ward).en).toBe(`Ward ${c.ward}`);
  });
  it("a count by ward says each ward by its name, the ward number after it", () => {
    const w = fixtureWorld();
    w.wards[0].name = { en: "Big Suburb", ta: "Big Suburb" };
    const r = runMapPlan(plan([{ op: "take", as: "a", layer: "incidents", filter: F({}), where: null }, { op: "count_by", as: "by", of: "a", by: "ward" }]), w, ctx);
    if (r.show.type !== "groups") throw new Error("not groups");
    const g = r.show.groups.find((x) => x.key === String(w.wards[0].ward));
    expect(g?.label).toBe(`Big Suburb (Ward ${w.wards[0].ward})`);
    expect(g?.label_ta).toBe(`Big Suburb (வார்டு ${w.wards[0].ward})`);
  });
});

describe("the same answer by ward, zone or taluk; an area's own list", () => {
  const p = plan([{ op: "take", as: "a", layer: "incidents", filter: F({ category: ["SOLID_WASTE"], status: "open" }), where: null }, { op: "count_by", as: "by", of: "a", by: "ward", per: "people" }]);
  it("regroup changes only the counting step's area, keeping its people and kind", () => {
    const z = regroup(p, "zone")!;
    const by = z.steps.find((s) => s.op === "count_by");
    expect(by && by.op === "count_by" && by.by).toBe("zone");
    expect(by && by.op === "count_by" && by.per).toBe("people");
    expect(z.steps[0]).toEqual(p.steps[0]);
    expect(checkPlan(z).ok).toBe(true);
  });
  it("regroup refuses a plan that does not rank areas", () => {
    expect(regroup(plan([{ op: "take", as: "a", layer: "incidents", filter: F({}), where: null }]), "zone")).toBeNull();
    expect(regroup(plan([{ op: "take", as: "a", layer: "incidents", filter: F({}), where: null }, { op: "count_by", as: "by", of: "a", by: "category" }]), "zone")).toBeNull();
  });
  it("herePlan keeps the answer's own cases (kind, status, time) inside the one area picked", () => {
    const h = herePlan(p, areaOfRow("ward", "12", null)!)!;
    expect(checkPlan(h).ok).toBe(true);
    expect(h.steps).toEqual([p.steps[0], { op: "inside", as: "here", of: "a", area: { kind: "ward", id: 12 } }]);
    expect(areaOfRow("near", "osm:n5", 300)).toEqual({ kind: "point", ref: "osm:n5", radius_m: 300 });
    expect(areaOfRow("taluk", "TLK-1", null)).toEqual({ kind: "taluk", code: "TLK-1" });
    expect(areaOfRow("category", "SOLID_WASTE", null)).toBeNull();
  });
});

describe("the answer's topic, the conversation for the turn reader", () => {
  it("names the kind of problem, and is null for every kind", () => {
    const w = fixtureWorld();
    const cat = [...w.cats.keys()][0];
    expect(topicOf(plan([{ op: "take", as: "a", layer: "incidents", filter: F({ category: [cat], status: "open" }), where: null }]), w)?.en).toMatch(/^open /);
    expect(topicOf(plan([{ op: "take", as: "a", layer: "incidents", filter: F({ status: "open" }), where: null }]), w)).toBeNull();
    expect(topicOf(null, w)).toBeNull();
  });
  it("historyOf sends the last three answered turns, each with its answer in a few words, never a failed or waiting one", () => {
    const t = (id: number, q: string, gist: string | null, extra: Partial<Turn> = {}): Turn => ({ id, q, resp: null, gist, ...extra });
    const h = historyOf([t(1, "one", "1 a"), t(2, "two", "2 b"), t(3, "bad", null, { error: "x" }), t(4, "three", "3 c"), t(5, "four", "4 d"), t(6, "wait", null, { pending: true })]);
    expect(h).toEqual([{ q: "two", a: "2 b" }, { q: "three", a: "3 c" }, { q: "four", a: "4 d" }]);
  });
});
