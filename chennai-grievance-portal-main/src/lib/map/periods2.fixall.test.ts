/**
 * fixall3-map-today, round 4's review (reviewer H and the four-lens review): what the first map period fix (9aecf063, 42a22525) still got wrong.
 * - a count past the records ("last 12 months") fell to the 7-day default (H-03, PHRASES-01);
 * - a comparison the reader reads ("up or down", "than yesterday", "pona maasatha vida") was answered as one list (H-09, PHRASES-02, MODEL-02);
 * - hours were rounded to days (H-04, PHRASES-04); dates ("in September") and ages ("open for more than 30 days") had no window (H-07, H-05);
 * - a model's change compared today so far with all of yesterday, and its calendar period stood on rolling words (H-01, H-02, CONSUMERS-01, MODEL-01);
 * - "right now" counted every record ever for a hotspot (H-06); a bounded time ("before yesterday") became the window (H-08);
 * - "5 naal kulla" stayed unread (H-10); change headlines read "in the yesterday" (CONSUMERS-02); the week label broke the headline split
 *   (CONSUMERS-03); an export re-run after midnight did not say which day it held (CONSUMERS-04).
 */
import { describe, expect, it, vi } from "vitest";
import { splitHead } from "@/components/collector/app/askmap/useMapAsk";
import { matches, periodRange, shiftWall } from "./execute";
import { INCIDENTS, NOW as FIXTURE_NOW, fixtureResolver, fixtureWorld } from "./fixture";
import type { Filter, Period, Plan, Step } from "./plan";
import { changeWindows, fitModelPlan, periodOf, rulesRoute, type RouteEnv } from "./route";
import { inPeriodWords } from "./words";

vi.mock("./world", () => ({ world: async () => ({ world: fixtureWorld(), resolver: fixtureResolver() }) }));
vi.mock("@/lib/assistant/scope", () => ({ refNames: async () => { throw new Error("no store in this test"); } }));
vi.mock("fs", async (orig) => {
  const real = await orig<typeof import("fs")>();
  const appendFile = () => undefined;
  return { ...real, appendFile, default: { ...real, appendFile } };
});

const NOW = "2026-11-06 12:00:00"; // a Friday
const env: RouteEnv = { resolve: () => [], dept: () => null, now: NOW };
const noClock: RouteEnv = { resolve: () => [], dept: () => null };
type Take = Extract<Step, { op: "take" }>;
type Change = Extract<Step, { op: "change" }>;
const planOf = (q: string, prev: Plan | null = null, e = env) => { const r = rulesRoute(q, prev, e); return r && r.kind === "plan" ? r : null; };
const takeOf = (p: Plan | undefined | null) => p?.steps.find((s) => s.op === "take" && s.layer === "incidents") as Take | undefined;
const changeOf = (p: Plan | undefined | null) => p?.steps.find((s) => s.op === "change") as Change | undefined;
const F = (period: Period | null, extra: Partial<Filter> = {}): Filter => ({ category: null, family: null, severity: null, status: "open", dept: null, overdue: null, citizen: null, period, text: null, ...extra });
const model = (steps: Step[]): Plan => ({ language: "en", show: steps[steps.length - 1].as, steps });

describe("counts, hours, dates and ages get the reader's window", () => {
  it.each([["open flooding last 12 months in zone 13", 360], ["garbage complaints in the last 200 days", 200], ["thefts in the past 365 days", 365],
    ["road accidents over the past 9 months", 270], ["கடந்த 200 நாட்களில் குப்பை புகார்கள்", 200]] as [string, number][])(
    "%s: that many days (every record the store keeps), never the 7-day default", (q, days) => {
      const r = planOf(q);
      expect(takeOf(r?.plan)?.filter?.period).toEqual({ kind: "last_days", days, offset: 0 });
      expect(r?.defaults).not.toContain("period");
    });
  it("'last 36 hours' is 36 hours back, not 2 days; without the map's clock it is left for the AI, never rounded", () => {
    const p = takeOf(planOf("flooding in the last 36 hours")?.plan)?.filter?.period as Period;
    const r = periodRange(p, NOW);
    // (from, to], as the reader counts hours, put on the run's own now
    expect([r.from, r.to, r.fromOpen]).toEqual([shiftWall(NOW, -36), NOW, true]);
    expect(periodOf("flooding in the last 36 hours")).toBeNull();
    expect(planOf("flooding in the last 36 hours", null, noClock)?.unread).toContain("hours");
  });
  it("'in September', 'since 1 October' and 'on 20 Oct' are those calendar days, said in the reader's words", () => {
    const sep = takeOf(planOf("garbage complaints in September")?.plan)?.filter?.period;
    expect(sep).toMatchObject({ kind: "range", from: "2026-09-01 00:00:00", to: "2026-09-30 23:59:59" });
    expect((sep as Extract<Period, { kind: "range" }>).label?.en).toMatch(/September/);
    expect(takeOf(planOf("garbage complaints since 1 October")?.plan)?.filter?.period).toMatchObject({ kind: "range", from: "2026-10-01 00:00:00", to: NOW });
    expect(takeOf(planOf("garbage complaints on 20 Oct")?.plan)?.filter?.period).toMatchObject({ kind: "range", from: "2026-10-20 00:00:00", to: "2026-10-20 23:59:59" });
  });
  it.each(["flooding last year", "accidents next week", "garbage complaints tomorrow"])("%s: a time the records cannot reach is said, not answered", (q) => {
    const r = rulesRoute(q, null, env);
    expect(r?.kind).toBe("say");
  });
  it("an age is the incidents reported before then: an open case from 40 days ago is in, one from 2 days ago is out", () => {
    const f = takeOf(planOf("complaints open for more than 30 days")?.plan)!.filter!;
    expect(f.period).toMatchObject({ kind: "range", to: shiftWall(NOW, -24 * 30) });
    const at = (d: number) => ({ ...INCIDENTS[0], first: shiftWall(NOW, -24 * d), open: true, routed: false, citizen: 1 });
    expect(matches(at(40), { ...f, category: null }, NOW)).toBe(true);
    expect(matches(at(2), { ...f, category: null }, NOW)).toBe(false);
  });
  it("'right now' is what is open now, whatever day it was reported, for a hotspot and the news too", () => {
    for (const q of ["where is flooding clustering right now", "flooding in the news right now", "open garbage complaints currently"]) {
      const f = takeOf(planOf(q)?.plan)?.filter;
      expect(f?.period, q).toBeNull();
      expect(f?.status, q).toBe("open");
    }
  });
  it("a time the question bounds or leaves out is not its window", () => {
    expect(periodOf("flooding reported before yesterday", NOW)).toBeNull();
    expect(periodOf("open flooding, leaving out today", NOW)).toBeNull();
    expect(periodOf("garbage except last week", NOW)).toBeNull();
    // "the day before yesterday" is a day, not a bound
    expect(periodOf("flooding the day before yesterday", NOW)).toEqual({ kind: "day", offset: 2 });
  });
  it("the map's own Tanglish count is read, and its words are not left for the AI", () => {
    expect(planOf("garbage complaints 5 naal kulla")?.unread).toEqual([]);
    expect(planOf("garbage complaints 10 naatkal la")?.unread).toEqual([]);
  });
});

describe("a comparison is a change between two equal windows", () => {
  it.each([["is open flooding up or down in zone 13", 7], ["garbage complaints compared with yesterday", 1], ["pona maasatha vida garbage complaints", 30],
    ["நேற்றை விட வெள்ளம் அதிகமா", 1], ["garbage complaints up from last month", 30]] as [string, number][])("%s: the last %i days against the ones before", (q, days) => {
    const c = changeOf(planOf(q)?.plan);
    expect(c?.now).toEqual({ kind: "last_days", days, offset: 0 });
    expect(c?.before).toEqual({ kind: "last_days", days, offset: 1 });
  });
  it("a follow-up 'up or down?' compares the answer's own window; 'compared to yesterday' the last 24 hours", () => {
    const first = planOf("open flooding in zone 13")!.plan;
    expect(changeOf(planOf("up or down?", first)?.plan)).toMatchObject({ now: { kind: "last_days", days: 7, offset: 0 }, before: { kind: "last_days", days: 7, offset: 1 } });
    expect(changeOf(planOf("compared to yesterday", first)?.plan)).toMatchObject({ now: { kind: "last_days", days: 1, offset: 0 }, before: { kind: "last_days", days: 1, offset: 1 } });
  });
  it("a whole calendar period said as the window is compared with the one before it", () => {
    expect(changeWindows({ kind: "month", offset: 1 })).toEqual({ now: { kind: "month", offset: 1 }, before: { kind: "month", offset: 2 } });
    expect(changeWindows({ kind: "month", offset: 1 }, true)).toEqual({ now: { kind: "last_days", days: 30, offset: 0 }, before: { kind: "last_days", days: 30, offset: 1 } });
  });
});

describe("the model's plans follow the same rules", () => {
  const kids = (period: Period | null): Step[] => [{ op: "take", as: "a", layer: "incidents", filter: F(period), where: null }, { op: "take", as: "f1", layer: "schools", filter: null, where: null },
    { op: "within", as: "w", of: "a", near: ["f1"], meters: 500 }];
  it("a model's change on 'today' compares the last 24 hours with the 24 before, not today so far with all of yesterday", () => {
    const m = model([...kids({ kind: "day", offset: 0 }), { op: "change", as: "chg", of: "w", now: { kind: "day", offset: 0 }, before: { kind: "day", offset: 1 } }]);
    const out = fitModelPlan(m, "has flooding near kids' schools gone up today compared to yesterday", NOW);
    expect(changeOf(out)).toMatchObject({ now: { kind: "last_days", days: 1, offset: 0 }, before: { kind: "last_days", days: 1, offset: 1 } });
    expect(takeOf(out)?.filter?.period).toEqual({ kind: "last_days", days: 1, offset: 0 });
  });
  it("'last week compared to the week before': the calendar week against the one before it", () => {
    const m = model([...kids({ kind: "last_days", days: 7, offset: 0 }), { op: "change", as: "chg", of: "w", now: { kind: "last_days", days: 7, offset: 0 }, before: { kind: "last_days", days: 7, offset: 1 } }]);
    expect(changeOf(fitModelPlan(m, "flooding near kids' schools last week compared to the week before", NOW))).toMatchObject({ now: { kind: "week", offset: 1 }, before: { kind: "week", offset: 2 } });
  });
  it.each([["flooding near kids' schools in the last week", { kind: "week", offset: 1 }, { kind: "last_days", days: 7, offset: 0 }],
    ["garbage near kids' schools this month", { kind: "month", offset: 0 }, { kind: "last_days", days: 30, offset: 0 }],
    ["waterlogging near kids' schools in the last 24 hours", { kind: "day", offset: 0 }, { kind: "last_days", days: 1, offset: 0 }]] as [string, Period, Period][])(
    "%s: the words' rolling window wins over the model's calendar one", (q, modelPeriod, want) => {
      expect(takeOf(fitModelPlan(model(kids(modelPeriod)), q, NOW))?.filter?.period).toEqual(want);
    });
  it("a bounded time leaves the model's period as it is", () => {
    const m = model(kids({ kind: "last_days", days: 30, offset: 0 }));
    expect(fitModelPlan(m, "flooding near kids' schools reported before yesterday", NOW)).toBe(m);
  });
  it("a follow-up that names no time keeps a date range the model's form cannot carry", () => {
    const prev = model(kids({ kind: "range", from: "2026-09-01 00:00:00", to: "2026-09-30 23:59:59", label: { en: "September", ta: "செப்டம்பர்" } }));
    const edited = model(kids(null));
    expect(takeOf(fitModelPlan(edited, "only the severe ones near kids", NOW, prev))?.filter?.period).toMatchObject({ kind: "range", from: "2026-09-01 00:00:00" });
  });
});

describe("words, the headline and the export", () => {
  it("change sentences read right for every kind of period", () => {
    expect(inPeriodWords({ kind: "day", offset: 1 })).toBe("yesterday");
    expect(inPeriodWords({ kind: "day", offset: 2 })).toBe("the day before yesterday");
    expect(inPeriodWords({ kind: "month", offset: 2 })).toBe("in the calendar month 2 months back");
    expect(inPeriodWords({ kind: "week", offset: 1 })).toBe("in the last calendar week, Monday to Sunday");
    expect(inPeriodWords({ kind: "last_days", days: 7, offset: 0 })).toBe("in the last 7 days");
    expect(inPeriodWords({ kind: "last_days", days: 7, offset: 1 })).toBe("in the 7 days before");
    expect(inPeriodWords({ kind: "range", from: "2026-09-01", to: "2026-09-30", label: { en: "September", ta: "செப்டம்பர்" } })).toBe("in September");
  });
  it("the panel lifts a period with brackets of its own out of the headline", () => {
    expect(splitHead("12 open incidents (today (6 Nov, since midnight)).")).toEqual({ big: "12", rest: "open incidents · today (6 Nov, since midnight)" });
    expect(splitHead("5 open solid waste complaints (last calendar week, Monday to Sunday).")).toEqual({ big: "5", rest: "open solid waste complaints · last calendar week, Monday to Sunday" });
  });
  it("an export says the window it counted, in dates", async () => {
    const { exportAnswer } = await import("./ask");
    const plan = model([{ op: "take", as: "a", layer: "incidents", filter: F({ kind: "day", offset: 1 }, { status: "any" }), where: null }]);
    const x = await exportAnswer(plan, "flooding yesterday", { email: "collector@example.invalid", role: "collector", lockDept: null }, "csv");
    const day = shiftWall(FIXTURE_NOW, -24).slice(0, 10);
    expect(x.body).toContain(`# Window: yesterday: reported from ${day} 00:00:00 to ${day} 23:59:59 IST`);
  });
});
