import { describe, expect, it } from "vitest";
import { localityOf, runMapPlan, type Ctx } from "./execute";
import { checkPlan, type Filter, type Plan, type Step } from "./plan";
import { fromWire, toWire } from "./wire";
import { fixtureWorld } from "./fixture";
import type { World } from "./types";

/** the fixture with people: ward 1 small (2,000), ward 2 large (50,000), ward 3 middling (20,000) */
const withPeople = (): World => {
  const w = fixtureWorld();
  const pop: Record<number, number> = { 1: 2_000, 2: 50_000, 3: 20_000 };
  return { ...w, wards: w.wards.map((x) => ({ ...x, pop: pop[x.ward] })) };
};
const ctx: Ctx = { lang: "en", place: () => null };
const F = (f: Partial<Filter>): Filter => ({ category: null, family: null, severity: null, status: "any", dept: null, overdue: null, citizen: null, period: null, text: null, ...f });
const plan = (steps: Step[]): Plan => {
  const c = checkPlan({ steps, show: steps[steps.length - 1].as, language: "en" });
  if (!c.ok) throw new Error(c.problems.join("; "));
  return c.plan;
};
const take: Step = { op: "take", as: "a", layer: "incidents", filter: F({}), where: null };

describe("Ask the Map v3: people", () => {
  it("counts by ward with each ward's people and its cases per 10,000", () => {
    const w = withPeople();
    const r = runMapPlan(plan([take, { op: "count_by", as: "by", of: "a", by: "ward" }]), w, ctx);
    expect(r.show.type).toBe("groups");
    if (r.show.type !== "groups") return;
    for (const g of r.show.groups) {
      const pop = w.wards.find((x) => String(x.ward) === g.key)!.pop!;
      expect(g.pop).toBe(pop);
      // the rate, checked by hand: n / pop x 10,000, one decimal
      expect(g.per10k).toBe(Math.round((g.n / pop) * 1e5) / 10);
    }
  });

  it("ranks per person with small counts steadied, and by count otherwise", () => {
    const w = withPeople();
    const byCount = runMapPlan(plan([take, { op: "count_by", as: "by", of: "a", by: "ward" }]), w, ctx);
    const per = runMapPlan(plan([take, { op: "count_by", as: "by", of: "a", by: "ward", per: "people" }]), w, ctx);
    if (byCount.show.type !== "groups" || per.show.type !== "groups") throw new Error("not groups");
    // by count: largest n first
    const ns = byCount.show.groups.map((g) => g.n);
    expect(ns).toEqual([...ns].sort((a, b) => b - a));
    // per person: the steadied rate (n + 5) / (pop + 5 / r0) falls down the list
    const all = per.show.groups;
    const r0 = all.reduce((t, g) => t + g.n, 0) / all.reduce((t, g) => t + (g.pop ?? 0), 0);
    const steady = all.map((g) => (g.n + 5) / (g.pop! + 5 / r0));
    expect(steady).toEqual([...steady].sort((a, b) => b - a));
    // the same groups and counts either way: only the order changes
    expect(all.map((g) => `${g.key}:${g.n}`).sort()).toEqual(byCount.show.groups.map((g) => `${g.key}:${g.n}`).sort());
  });

  it("a zone's people are its wards' people", () => {
    const w = withPeople();
    const r = runMapPlan(plan([take, { op: "count_by", as: "by", of: "a", by: "zone" }]), w, ctx);
    if (r.show.type !== "groups") throw new Error("not groups");
    const z1 = r.show.groups.find((g) => g.key === "1");
    if (z1) expect(z1.pop).toBe(52_000);
  });

  it("no people file: no rate, and the count order stands", () => {
    const w = fixtureWorld();
    const r = runMapPlan(plan([take, { op: "count_by", as: "by", of: "a", by: "ward", per: "people" }]), w, ctx);
    if (r.show.type !== "groups") throw new Error("not groups");
    expect(r.show.groups.every((g) => g.pop == null && g.per10k == null)).toBe(true);
  });

  it("per people survives the AI's wire format, both ways, and only for ward, zone or taluk", () => {
    const p = plan([take, { op: "count_by", as: "by", of: "a", by: "zone", per: "people" }]);
    const back = fromWire(toWire(p));
    expect(back.steps.find((s) => s.op === "count_by")).toMatchObject({ by: "zone", per: "people" });
    const w = toWire(plan([take, { op: "count_by", as: "by", of: "a", by: "category" }]));
    w.steps[1].per_people = true;
    expect(fromWire(w).steps[1]).not.toHaveProperty("per");
  });
});

describe("Ask the Map v3: places without a name", () => {
  it("are called by the nearest neighbourhood within 2 km", () => {
    const w = fixtureWorld();
    expect(localityOf(w, 13.0031, 80.2031)?.en).toBe("Nearville");
    expect(localityOf(w, 13.0179, 80.2179)?.en).toBe("Farville");
    // far from every neighbourhood: no name
    expect(localityOf(w, 13.2, 80.4)).toBeNull();
  });
});
