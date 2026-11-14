/**
 * fixall3-map-today, the third review of round 4 (90a11f0b):
 * - a follow-up with "right now", "currently" lost its command ("by ward right now", "closed ones right now") (YRULES-01);
 * - "flooding today vs yesterday" (no areas) was a plain list again (YRULES-02); two areas compared without "vs" became a change in one (YRULES-03);
 * - "except in October", "not in September", "but not yesterday" slipped past the bounds (YRULES-04);
 * - "7 days ago", "a week ago", "the week before last week" were read as the current window (YRULES-05); "8 months ago" got the default (YRULES-06);
 * - an area comparison follow-up naming a time, or "may", went to the AI (YRULES-07); "vaaraanga" was a week word (YRULES-08);
 * - a re-run range kept its old label (YRANGES-02); "last 1000 hours" was not re-run (YRANGES-03); an age past a year made an inverted window
 *   (YRANGES-04); age_hours had no bound and could throw (YRANGES-05).
 */
import { describe, expect, it } from "vitest";
import { periodRange } from "./execute";
import { fixtureResolver } from "./fixture";
import { checkPlan, type Filter, type Period, type Plan, type Step } from "./plan";
import { makeResolver } from "./resolve";
import { freshPlan, periodOf, rulesRoute, type RouteEnv } from "./route";
import { periodWords } from "./words";

const NOW = "2026-11-06 12:00:00";
const bare: RouteEnv = { resolve: () => [], dept: () => null, now: NOW };
let placesEnv: RouteEnv | null = null;
const withPlaces = (): RouteEnv => (placesEnv ??= { resolve: makeResolver(fixtureResolver()), dept: () => null, now: NOW });
const route = (q: string, prev: Plan | null = null, env: RouteEnv = bare) => rulesRoute(q, prev, env);
const planOf = (q: string, prev: Plan | null = null, env: RouteEnv = bare) => { const r = route(q, prev, env); return r && r.kind === "plan" ? r : null; };
const takeOf = (p: Plan | null | undefined) => p?.steps.find((s) => s.op === "take" && s.layer === "incidents") as Extract<Step, { op: "take" }> | undefined;
const ops = (p: Plan | null | undefined) => p?.steps.map((s) => s.op) ?? [];
const F = (period: Period | null): Filter => ({ category: null, family: null, severity: null, status: "open", dept: null, overdue: null, citizen: null, period, text: null });

describe("a follow-up keeps its command with any 'now' phrase", () => {
  const first = () => planOf("flooding in zone 13 this week")!.plan;
  it.each(["by ward right now", "show by ward currently", "zone wise at the moment", "ward wise as of now"])("%s: counted by area, open now", (q) => {
    const p = planOf(q, first())?.plan;
    expect(ops(p)).toContain("count_by");
    expect(takeOf(p)?.filter?.period).toBeNull();
  });
  it("'only severe right now' keeps the severity, 'closed ones right now' the closed status", () => {
    expect(takeOf(planOf("only severe right now", first())?.plan)?.filter?.severity).toEqual(["Severe"]);
    expect(takeOf(planOf("closed ones right now", first())?.plan)?.filter?.status).toBe("closed");
  });
  it("a time alone is still a time edit", () => {
    expect(takeOf(planOf("last 30 days", first())?.plan)?.filter?.period).toEqual({ kind: "last_days", days: 30, offset: 0 });
    expect(takeOf(planOf("show me today's", first())?.plan)?.filter?.period).toEqual({ kind: "day", offset: 0 });
    expect(takeOf(planOf("right now", first())?.plan)?.filter?.period).toBeNull();
  });
});

describe("comparisons: of times, or of areas", () => {
  it.each(["flooding today vs yesterday", "garbage complaints today vs yesterday", "compare flooding today and yesterday"])("%s: a change of two 24-hour windows", (q) => {
    const c = planOf(q)?.plan.steps.find((s) => s.op === "change") as Extract<Step, { op: "change" }> | undefined;
    expect(c?.now).toEqual({ kind: "last_days", days: 1, offset: 0 });
  });
  it.each(["Adyar or Velachery, which is higher or lower?", "zone 13 and zone 10: more or fewer potholes?", "garbage in zone 13 and zone 10, up or down?"])(
    "%s: an area comparison, both areas kept", (q) => {
      const p = planOf(q, null, withPlaces())?.plan;
      expect(ops(p)).toContain("compare");
      expect(ops(p)).not.toContain("change");
    });
  it.each(["compare with zone 10 yesterday", "vs zone 10 in September", "compare with zone 10 over the last 30 days"])(
    "follow-up '%s' stays an area comparison with the rules", (q) => {
      const p = planOf(q, planOf("flooding in zone 13", null, withPlaces())!.plan, withPlaces())?.plan;
      expect(ops(p)).toContain("compare");
    });
});

describe("times the map must not take as the window", () => {
  it.each(["except on 20 Oct", "except in October", "not in September", "outside October", "but not yesterday"])("follow-up '%s' is never a period edit to that time", (q) => {
    const r = route(q, planOf("open flooding in zone 13 this month")!.plan);
    const p = r && r.kind === "plan" ? takeOf(r.plan)?.filter?.period : undefined;
    expect(p === undefined || (p?.kind === "last_days" && p.days === 30)).toBe(true);
  });
  it("a new question with an exclusion keeps its own window", () => {
    expect(periodOf("flooding in the last 30 days except on 20 Oct", NOW)).toEqual({ kind: "last_days", days: 30, offset: 0 });
    expect(periodOf("flooding except in October", NOW)).toBeNull();
  });
  it.each(["garbage complaints 7 days ago", "flooding a week ago", "potholes one month ago", "flooding 30 days back", "flooding the week before last week"])(
    "%s: no window (its words go to the AI), never the current one", (q) => {
      const r = planOf(q);
      expect(takeOf(r?.plan)?.filter?.period).toEqual({ kind: "last_days", days: 7, offset: 0 });
      expect(r?.defaults).toContain("period");
      expect((r?.unread ?? []).length).toBeGreaterThan(0);
    });
  it.each(["garbage complaints 8 months ago", "garbage complaints 200 days ago"])("%s: beyond the records, said", (q) => {
    expect(route(q)?.kind).toBe("say");
  });
  it("'vaaraanga' (they come) is no week word: the follow-up compares the answer's own month", () => {
    const prev = planOf("open flooding in zone 13 last month")!.plan;
    const c = planOf("romba per vaaraanga, kooduchaa korainjaa?", prev)?.plan.steps.find((s) => s.op === "change") as Extract<Step, { op: "change" }> | undefined;
    expect(c?.now).toEqual({ kind: "month", offset: 1 });
    expect(c?.before).toEqual({ kind: "month", offset: 2 });
  });
});

describe("ranges run again", () => {
  const saved = (q: string) => takeOf(planOf(q)?.plan)!.filter!.period as Extract<Period, { kind: "range" }>;
  it("a saved 'since 1 October' re-run a year later is labelled and counted for that year", () => {
    const plan: Plan = { language: "en", show: "a", steps: [{ op: "take", as: "a", layer: "incidents", filter: F(saved("open flooding in October")), where: null }] };
    const later = freshPlan(plan, "2027-10-05 10:00:00");
    const p = takeOf(later)!.filter!.period as Extract<Period, { kind: "range" }>;
    expect(p.from).toBe("2027-10-01 00:00:00");
    expect(periodWords(p, "en")).not.toMatch(/2026/);
  });
  it("'last 1000 hours' is re-run on the run's now", () => {
    const p = saved("open flooding in the last 1000 hours");
    expect(periodRange(p, "2026-11-12 12:00:00").to).toBe("2026-11-12 12:00:00");
  });
  it("an age past a year is said, never an inverted window; a hand-made huge age is refused by the checks", () => {
    expect(route("flooding open for more than 400 days")?.kind).toBe("say");
    const huge = { language: "en", show: "a", steps: [{ op: "take", as: "a", layer: "incidents", where: null,
      filter: F({ kind: "range", from: "2026-01-01 00:00:00", to: "2026-02-01 00:00:00", age_hours: 1e12 }) }] };
    expect(checkPlan(huge).ok).toBe(false);
    const inverted = { ...huge, steps: [{ ...huge.steps[0], filter: F({ kind: "range", from: "2026-03-01 00:00:00", to: "2026-02-01 00:00:00" }) }] };
    expect(checkPlan(inverted).ok).toBe(false);
  });
});
