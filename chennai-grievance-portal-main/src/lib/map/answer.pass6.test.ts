/**
 * QA pass 6, P6-021 (reviewer 3 on P6-012, 401d355): another way an officer's Ask the Map reaches another department's incident. An empty "within" answer
 * names the nearest miss; nearestMiss() re-runs the plan's prefix with runPrefixHits(), which calls runMapPlan WITHOUT the officer's lock,
 * so the miss (its id and exact lat/lon, put in the camera focus by ask.ts) can be another department's incident.
 */
import { describe, expect, it } from "vitest";
import { runMapPlan, type Ctx } from "@/lib/map/execute";
import { checkPlan, type Plan } from "@/lib/map/plan";
import { compose, nearestMiss } from "@/lib/map/answer";
import { INCIDENTS, fixtureWorld } from "@/lib/map/fixture";
import { placeLookup } from "@/lib/map/ask";

const w = fixtureWorld();
const ctx: Ctx = { lang: "en", place: placeLookup(w, { entries: [] } as never, "GCC-ELE"), lockDept: "GCC-ELE" };
const pl = (() => {
  const p = { language: "en" as const, show: "near", steps: [
    { op: "take", as: "a", layer: "incidents", filter: { category: null, family: null, severity: null, status: "any", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 30, offset: 0 }, text: null }, where: null },
    { op: "take", as: "f1", layer: "hospitals", filter: null, where: null },
    { op: "within", as: "near", of: "a", near: ["f1"], meters: 50 }] };
  const c = checkPlan(p as never); if (!c.ok) throw new Error(c.problems.join("; ")); return c.plan as Plan;
})();

describe("QA pass 6, P6-021: the nearest miss of an officer's empty answer", () => {
  it("a GCC-ELE officer's empty 'within 50 m of a hospital' answer names no other department's incident", () => {
    const r = runMapPlan(pl, w, ctx, "GCC-ELE");
    expect(r.hits).toHaveLength(0);
    const miss = nearestMiss(pl, r, w, ctx);
    const dept = miss ? INCIDENTS.find((i) => i.id === miss.id)?.dept : null;
    const a = compose(pl, r, w, ctx);
    console.log("miss", JSON.stringify(miss), "dept", dept, "| meaning:", a.meaning);
    expect(dept == null || dept === "GCC-ELE", `miss ${miss?.id} of ${dept} at ${miss?.lat},${miss?.lon}`).toBe(true);
  });
});
