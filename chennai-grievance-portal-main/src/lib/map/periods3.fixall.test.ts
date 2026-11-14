/**
 * fixall3-map-today, the second review of round 4 (6f4efc6e): where the map's wider reading of time words broke ordinary questions.
 * - a follow-up ending in "now" lost its command ("by ward now", "only severe now") (XFALSEPOS-01);
 * - in-range times the reader does not model ("since Monday", "a few days", "fortnight"), and Tamil words that are no time at all ("வாரியம் முன்",
 *   "in front of the board"), were refused as out of the records (XFALSEPOS-02, -03);
 * - an area comparison with "higher or lower" became a change in one area (XFALSEPOS-04);
 * - "older than yesterday" became a comparison with yesterday (XFALSEPOS-05); a bounded time threw away the question's own window (XFALSEPOS-06);
 * - "compared to August" became a plain period edit (XPATHS-02); a merged follow-up with "right now" kept status any (XPATHS-03);
 * - a date range was fixed at the day it was asked, so a saved view run later counted the old window (XPATHS-04);
 * - Tamil and Tanglish comparison follow-ups missed their time word (XPATHS-06); the comparison follow-up ignored the 8-step limit (XPATHS-07);
 * - "the 1 days before" (XPATHS-08); the Tamil "day before yesterday" was taken as a bound (XFALSEPOS-07).
 */
import { describe, expect, it } from "vitest";
import { periodRange } from "./execute";
import { fixtureResolver } from "./fixture";
import { LIMITS, type Period, type Plan, type Step } from "./plan";
import { periodOf, rulesRoute, type RouteEnv } from "./route";
import { makeResolver } from "./resolve";
import { periodWords } from "./words";

const NOW = "2026-11-06 12:00:00"; // a Friday
const bare: RouteEnv = { resolve: () => [], dept: () => null, now: NOW };
let placesEnv: RouteEnv | null = null;
const withPlaces = (): RouteEnv => (placesEnv ??= { resolve: makeResolver(fixtureResolver()), dept: () => null, now: NOW });
const route = (q: string, prev: Plan | null = null, env: RouteEnv = bare) => rulesRoute(q, prev, env);
const planOf = (q: string, prev: Plan | null = null, env: RouteEnv = bare) => { const r = route(q, prev, env); return r && r.kind === "plan" ? r : null; };
const takeOf = (p: Plan | null | undefined) => p?.steps.find((s) => s.op === "take" && s.layer === "incidents") as Extract<Step, { op: "take" }> | undefined;
const ops = (p: Plan | null | undefined) => p?.steps.map((s) => s.op) ?? [];

describe("a follow-up ending in 'now' keeps its command", () => {
  const first = () => planOf("flooding in zone 13 this week")!.plan;
  it.each(["by ward now", "show by ward now", "ward wise ippo", "இப்போது வார்டு வாரியாக காட்டு"])("%s: counted by ward, in the same 7 days", (q) => {
    const p = planOf(q, first())?.plan;
    expect(ops(p)).toContain("count_by");
    expect(takeOf(p)?.filter?.period).toEqual({ kind: "last_days", days: 7, offset: 0 });
  });
  it("'only severe now' applies the severity", () => {
    expect(takeOf(planOf("only severe now", first())?.plan)?.filter?.severity).toEqual(["Severe"]);
  });
  it("'right now', 'currently' still name the current state", () => {
    expect(periodOf("open flooding right now", NOW)).toBe("now");
    expect(periodOf("garbage complaints currently", NOW)).toBe("now");
    expect(periodOf("show severe ones now", NOW)).toBeNull();
  });
  it("a merged follow-up with 'right now' after a status-any answer is what is open now", () => {
    const prev = planOf("where is flooding clustering", null, withPlaces())!.plan;
    const f = takeOf(planOf("in zone 1 right now", prev, withPlaces())?.plan)?.filter;
    expect(f?.status).toBe("open");
    expect(f?.period).toBeNull();
  });
});

describe("times inside the records are never refused", () => {
  it.each(["flooding complaints since Monday", "accidents last Sunday on Anna Salai", "flooding in the last few days", "garbage complaints in the past couple of weeks",
    "thefts this fortnight", "garbage complaints two weeks ago", "குடிநீர் வாரியம் முன்பு குப்பை", "மின் வாரியம் முன் தண்ணீர் தேக்கம்", "flooding reported from Sun News"])(
    "%s: answered (its unread words go to the AI), not refused", (q) => {
      expect(route(q)?.kind).not.toBe("say");
    });
  it.each(["flooding last year", "accidents next week", "garbage complaints tomorrow", "அடுத்த வாரம் வெள்ளம்"])("%s: refused", (q) => {
    expect(route(q)?.kind).toBe("say");
  });
});

describe("comparisons and bounds", () => {
  it.each(["Adyar vs Velachery: is flooding higher or lower?", "compare zone 13 and zone 10 month on month", "compare garbage in zone 13 and zone 10, increase or decrease"])(
    "%s: still an area comparison", (q) => {
      const p = planOf(q, null, withPlaces())?.plan;
      expect(ops(p)).not.toContain("change");
      expect(ops(p)).toContain("compare");
    });
  it.each(["open flooding older than yesterday", "garbage complaints earlier than yesterday", "flooding complaints other than yesterday's"])(
    "%s: no comparison with yesterday, and not the last 24 hours", (q) => {
      const p = planOf(q)?.plan;
      expect(ops(p)).not.toContain("change");
      expect(takeOf(p)?.filter?.period).not.toEqual({ kind: "last_days", days: 1, offset: 0 });
    });
  it("a bound is taken out and the question's own window kept", () => {
    expect(periodOf("garbage complaints in the last 30 days excluding today", NOW)).toEqual({ kind: "last_days", days: 30, offset: 0 });
    expect(periodOf("open flooding this month other than yesterday", NOW)).toEqual({ kind: "last_days", days: 30, offset: 0 });
    expect(periodOf("flooding reported before yesterday", NOW)).toBeNull();
    expect(periodOf("நேற்று முன்தினம் வெள்ளம்", NOW)).toEqual({ kind: "day", offset: 2 });
  });
  it.each(["compared to August", "compared with September", "vs October", "compared to 20 Oct", "vs the month before?", "compared to the week before"])(
    "follow-up '%s': goes to the AI, never a plain period edit", (q) => {
      expect(route(q, planOf("open flooding in zone 13")!.plan)).toBeNull();
    });
  it.each([["நேற்றை விட அதிகமா?", 1], ["nethai vida jaasthiya?", 1], ["pona maasathai vida?", 30]] as [string, number][])(
    "follow-up '%s' compares the window it names", (q, days) => {
      const c = planOf(q, planOf("open flooding in zone 13")!.plan)?.plan.steps.find((s) => s.op === "change") as Extract<Step, { op: "change" }> | undefined;
      expect(c?.now).toEqual({ kind: "last_days", days, offset: 0 });
      expect(c?.before).toEqual({ kind: "last_days", days, offset: 1 });
    });
  it("the comparison follow-up stays within the step limit", () => {
    const take = (as: string, layer: string): Step => ({ op: "take", as, layer, filter: null, where: null } as unknown as Step);
    const full: Plan = { language: "en", show: "l", steps: [
      { op: "take", as: "a", layer: "incidents", filter: { category: null, family: null, severity: null, status: "open", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 7, offset: 0 }, text: null }, where: null },
      take("f1", "schools"), take("f2", "hospitals"), take("f3", "fire_stations"), take("f4", "colleges"),
      { op: "within", as: "w", of: "a", near: ["f1", "f2"], meters: 500 }, { op: "inside", as: "in", of: "w", area: { kind: "zone", id: 13 } },
      { op: "along", as: "l", of: "in", line: "road:test", meters: 75 }] };
    expect(full.steps.length).toBe(LIMITS.steps);
    expect(route("up or down?", full)).toBeNull();
  });
});

describe("windows and words", () => {
  it("a range from relative words is put on the run's own now: a saved 'last 36 hours' run a day later counts the 36 hours before then", () => {
    const p = periodOf("flooding in the last 36 hours", NOW) as Period;
    const later = "2026-11-07 12:00:00";
    expect(periodRange(p, later).to).toBe(later);
    const since = periodOf("flooding since 1 October", NOW) as Period;
    expect(periodRange(since, later).to >= "2026-11-07").toBe(true);
    const age = periodOf("complaints open for more than 30 days", NOW) as Period;
    expect(periodRange(age, later).to).toBe("2026-10-08 12:00:00");
  });
  it("the 24 hours before, not 'the 1 days before'", () => {
    expect(periodWords({ kind: "last_days", days: 1, offset: 1 }, "en")).toBe("the 24 hours before");
  });
});
