/**
 * fixall3-map-today (P3): Ask the Map read period words with its own patterns. "today" was the last 24 hours, "last week" and "last month" the last
 * 7 and 30 days, while Jarvis and Ask District IQ read them with src/lib/period/read.ts (pass 7, P6-022): today since midnight IST, the previous
 * calendar week (Monday to Sunday), month or quarter. One phrase meant two windows on one console. The map now reads its period words with
 * readPeriod, and puts the same calendar bounds on them.
 */
import { describe, expect, it, vi } from "vitest";
import { readPeriod, spanOf } from "@/lib/period/read";
import { matches, periodRange, shiftWall } from "./execute";
import { INCIDENTS, fixtureResolver, fixtureWorld } from "./fixture";
import { checkPlan, type Filter, type Period, type Plan } from "./plan";
import { changeWindows, periodOf, rulesRoute, withSaidPeriod, type RouteEnv } from "./route";
import { fromWire, toWire } from "./wire";
import { periodWords } from "./words";

vi.mock("./world", () => ({ world: async () => ({ world: fixtureWorld(), resolver: fixtureResolver() }) }));
vi.mock("@/lib/assistant/scope", () => ({ refNames: async () => { throw new Error("no store in this test"); } }));
vi.mock("fs", async (orig) => {
  const real = await orig<typeof import("fs")>();
  const appendFile = () => undefined; // the question log: nothing written from a test
  return { ...real, appendFile, default: { ...real, appendFile } };
});

import { askMap } from "./ask";

// a Friday, IST wall clock (the map's and the reader's "now")
const NOW = "2026-11-06 12:00:00";
const F = (period: Period | null): Filter => ({ category: null, family: null, severity: null, status: "any", dept: null, overdue: null, citizen: null, period, text: null });
const at = (first: string) => ({ ...INCIDENTS[0], first });

describe("the map reads period words as Jarvis and Ask District IQ do", () => {
  it.each([
    ["open incidents today", { kind: "day", offset: 0 }],
    ["garbage complaints today", { kind: "day", offset: 0 }],
    ["இன்று வெள்ளம்", { kind: "day", offset: 0 }],
    ["innaiki garbage", { kind: "day", offset: 0 }],
    ["inniki flooding", { kind: "day", offset: 0 }],
    ["this morning", { kind: "day", offset: 0 }],
    ["flooding yesterday", { kind: "day", offset: 1 }],
    ["incidents last week", { kind: "week", offset: 1 }],
    ["கடந்த வாரம் சம்பவங்கள்", { kind: "week", offset: 1 }],
    ["garbage last month", { kind: "month", offset: 1 }],
    ["கடந்த மாதம்", { kind: "month", offset: 1 }],
    ["accidents last quarter", { kind: "quarter", offset: 1 }]
  ] as [string, Period][])("%s: a calendar period", (q, p) => {
    expect(periodOf(q)).toEqual(p);
  });

  it.each([
    ["in the last 24 hours", 1], ["past 24 hours", 1], ["since yesterday", 1], ["this week", 7], ["last 7 days", 7], ["this month", 30], ["இந்த மாதம்", 30],
    ["this quarter", 90], ["last 10 days", 10], ["last 2 months", 60], ["last 3 weeks", 21]
  ] as [string, number][])("%s: the rolling window, as before", (q, days) => {
    expect(periodOf(q)).toEqual({ kind: "last_days", days, offset: 0 });
  });

  it("'right now' is the current state, whatever day it was reported: no reporting window", () => {
    expect(periodOf("open incidents right now")).toBe("all");
    expect(periodOf("all time")).toBe("all");
    expect(periodOf("garbage")).toBeNull();
  });

  it.each(["open incidents today", "flooding yesterday", "incidents last week", "garbage last month", "accidents last quarter", "கடந்த மாதம்"])(
    "%s: the map's window is the reader's window", (q) => {
      const p = periodOf(q) as Period;
      const span = spanOf(readPeriod(q), NOW)!;
      const r = periodRange(p, NOW);
      expect(r.from).toBe(span.range!.from);
      expect(r.fromOpen).toBe(false);
      // the reader's end is exclusive, the map's inclusive: one second apart
      expect(shiftWall(r.to, 1 / 3600)).toBe(span.range!.to);
    });
});

describe("calendar windows on the IST wall clock", () => {
  it("today runs from midnight: an incident 13 hours ago (yesterday evening) is not today's, though it is in the last 24 hours", () => {
    const today = F({ kind: "day", offset: 0 });
    expect(periodRange({ kind: "day", offset: 0 }, NOW)).toEqual({ from: "2026-11-06 00:00:00", to: NOW, fromOpen: false });
    expect(matches(at("2026-11-05 23:00:00"), today, NOW)).toBe(false);
    expect(matches(at("2026-11-05 23:00:00"), F({ kind: "last_days", days: 1, offset: 0 }), NOW)).toBe(true);
    expect(matches(at("2026-11-06 00:00:00"), today, NOW)).toBe(true);
    expect(matches(at("2026-11-06 11:59:00"), today, NOW)).toBe(true);
  });
  it("yesterday is the whole calendar day before", () => {
    expect(periodRange({ kind: "day", offset: 1 }, NOW)).toEqual({ from: "2026-11-05 00:00:00", to: "2026-11-05 23:59:59", fromOpen: false });
    expect(periodRange({ kind: "day", offset: 2 }, NOW)).toEqual({ from: "2026-11-04 00:00:00", to: "2026-11-04 23:59:59", fromOpen: false });
  });
  it("last week is Monday to Sunday before this Monday; this week (calendar) runs from Monday", () => {
    expect(periodRange({ kind: "week", offset: 1 }, NOW)).toEqual({ from: "2026-10-26 00:00:00", to: "2026-11-01 23:59:59", fromOpen: false });
    expect(periodRange({ kind: "week", offset: 0 }, NOW)).toEqual({ from: "2026-11-02 00:00:00", to: NOW, fromOpen: false });
    expect(periodRange({ kind: "week", offset: 2 }, NOW)).toEqual({ from: "2026-10-19 00:00:00", to: "2026-10-25 23:59:59", fromOpen: false });
    // a Monday: this week starts today, last week is the seven days before
    expect(periodRange({ kind: "week", offset: 1 }, "2026-11-02 00:30:00").from).toBe("2026-10-26 00:00:00");
    // a Sunday: this week started six days ago
    expect(periodRange({ kind: "week", offset: 0 }, "2026-11-08 23:00:00").from).toBe("2026-11-02 00:00:00");
  });
  it("last quarter is the calendar quarter before, across a year", () => {
    expect(periodRange({ kind: "quarter", offset: 1 }, NOW)).toEqual({ from: "2026-07-01 00:00:00", to: "2026-09-30 23:59:59", fromOpen: false });
    expect(periodRange({ kind: "quarter", offset: 1 }, "2027-02-10 09:00:00")).toEqual({ from: "2026-10-01 00:00:00", to: "2026-12-31 23:59:59", fromOpen: false });
  });
});

describe("words, the model's form and the checks", () => {
  it("each window says what it is", () => {
    expect(periodWords({ kind: "day", offset: 0 }, "en")).toBe("today, since midnight");
    expect(periodWords({ kind: "day", offset: 0 }, "ta")).toBe("இன்று, நள்ளிரவு முதல்");
    expect(periodWords({ kind: "day", offset: 1 }, "en")).toBe("yesterday");
    expect(periodWords({ kind: "week", offset: 1 }, "en")).toBe("last calendar week (Monday to Sunday)");
    expect(periodWords({ kind: "quarter", offset: 1 }, "en")).toBe("last calendar quarter");
    expect(periodWords({ kind: "last_days", days: 1, offset: 0 }, "en")).toBe("last 24 hours");
  });
  it("a calendar period survives the model's flat form (the current plan of a follow-up)", () => {
    for (const p of [{ kind: "day", offset: 0 }, { kind: "day", offset: 1 }, { kind: "week", offset: 1 }, { kind: "month", offset: 1 }, { kind: "quarter", offset: 1 }] as Period[]) {
      const plan: Plan = { language: "en", show: "a", steps: [{ op: "take", as: "a", layer: "incidents", filter: F(p), where: null }] };
      const back = fromWire(toWire(plan));
      expect((back.steps[0] as Extract<Plan["steps"][number], { op: "take" }>).filter?.period, JSON.stringify(p)).toEqual(p);
    }
  });
  it("the checks take the new kinds and refuse a negative offset", () => {
    const plan = (p: Period): unknown => ({ language: "en", show: "a", steps: [{ op: "take", as: "a", layer: "incidents", filter: F(p), where: null }] });
    expect(checkPlan(plan({ kind: "day", offset: 0 })).ok).toBe(true);
    expect(checkPlan(plan({ kind: "quarter", offset: 1 })).ok).toBe(true);
    expect(checkPlan(plan({ kind: "week", offset: -1 })).ok).toBe(false);
  });
});

describe("the map's answers", () => {
  const env: RouteEnv = { resolve: () => [], dept: () => null };
  const takeOf = (r: ReturnType<typeof rulesRoute>) => (r && r.kind === "plan" ? (r.plan.steps[0] as Extract<Plan["steps"][number], { op: "take" }>) : null);
  it("a change between two periods compares windows of equal length, never today-so-far against all of yesterday", () => {
    const chgOf = (q: string) => { const r = rulesRoute(q, null, env); return r && r.kind === "plan" ? r.plan.steps.find((s) => s.op === "change") : null; };
    expect(chgOf("has flooding gone up today")).toMatchObject({ now: { kind: "last_days", days: 1, offset: 0 }, before: { kind: "last_days", days: 1, offset: 1 } });
    expect(chgOf("flooding this week vs last week")).toMatchObject({ now: { kind: "last_days", days: 7, offset: 0 }, before: { kind: "last_days", days: 7, offset: 1 } });
    expect(chgOf("garbage this month vs last month")).toMatchObject({ now: { kind: "last_days", days: 30, offset: 0 }, before: { kind: "last_days", days: 30, offset: 1 } });
    // a whole calendar period against the one before it
    expect(changeWindows({ kind: "week", offset: 1 })).toEqual({ now: { kind: "week", offset: 1 }, before: { kind: "week", offset: 2 } });
    expect(changeWindows({ kind: "day", offset: 0 })).toEqual({ now: { kind: "last_days", days: 1, offset: 0 }, before: { kind: "last_days", days: 1, offset: 1 } });
  });
  it("a model's plan keeps the question's calendar words: 'today' is never its rolling 24 hours", () => {
    const model: Plan = { language: "en", show: "a", steps: [{ op: "take", as: "a", layer: "incidents", filter: F({ kind: "last_days", days: 1, offset: 0 }), where: null },
      { op: "take", as: "f1", layer: "schools", filter: null, where: null }] };
    const out = withSaidPeriod(model, "flooding near kids' schools today");
    expect((out.steps[0] as Extract<Plan["steps"][number], { op: "take" }>).filter?.period).toEqual({ kind: "day", offset: 0 });
    expect(out.steps[1]).toEqual(model.steps[1]);
    // no calendar words: the model's period stands
    expect(withSaidPeriod(model, "flooding near kids' schools in the last 24 hours")).toBe(model);
  });
  it("'open incidents today' is asked as today since midnight, and the answer says so", async () => {
    expect(takeOf(rulesRoute("open flooding today", null, env))?.filter?.period).toEqual({ kind: "day", offset: 0 });
    const r = await askMap({ text: "open flooding today", plan: null, prev: null, context: { zone: null, taluk: null, incidentId: null, drawn: null, ward: null },
      user: { email: "collector@example.invalid", role: "collector", lockDept: null } });
    expect(r.kind).toBe("answer");
    expect(r.answer?.headline ?? "").toMatch(/today, since midnight/);
    const p = r.chips.find((c) => c.part === "period");
    expect(p?.en).toMatch(/^Today, since midnight$/);
  });
});
