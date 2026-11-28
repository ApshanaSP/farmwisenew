/**
 * The rain action tracker's pure parts (tracker.ts): the stage machine, the outcome at the next rain with its "comparable rain"
 * rule, the flood hit test, the summary, and the default department and note.
 */
import { describe, expect, it } from "vitest";
import {
  canAssign, compareRains, COMPARABLE_SHARE, defaultDue, doneAt, fixKey, floodDefault, floodHit, impactDefault, isLate, nextStage, NEAR_M, newestByPlace,
  outcomeOf, parseFixKey, PLACE_RE, REPORT_TAIL_DAYS, stageOf, STAGES, STEP_ROLE, STEPS, summarize, type RainFact, type TrailEvent
} from "./tracker";
import { RAIN_TAIL_DAYS } from "./memory";

const ev = (step: TrailEvent["step"], at = "2026-11-20 10:00:00"): TrailEvent => ({ step, at, by: "x@y", remarks: null, photo: null, photoM: null });

describe("the stage machine", () => {
  it("goes open -> assigned -> in action -> done -> verified, each step by its own side", () => {
    expect(nextStage("open", "assign")).toBe("assigned");
    expect(nextStage("assigned", "progress")).toBe("in_action");
    expect(nextStage("in_action", "progress")).toBe("in_action");
    expect(nextStage("assigned", "done")).toBe("done");
    expect(nextStage("in_action", "done")).toBe("done");
    expect(nextStage("done", "verify")).toBe("verified");
    expect(nextStage("done", "reopen")).toBe("in_action");
    expect([STEP_ROLE.assign, STEP_ROLE.verify, STEP_ROLE.reopen]).toEqual(["collector", "collector", "collector"]);
    expect([STEP_ROLE.progress, STEP_ROLE.done]).toEqual(["officer", "officer"]);
  });

  it("refuses every other step: no verify before done, no update after done, nothing after verified, no second assign", () => {
    const allowed = new Set(["open:assign", "assigned:progress", "assigned:done", "in_action:progress", "in_action:done", "done:verify", "done:reopen",
      // the Collector may withdraw an unfinished or done fix, and move (reassign) one that is not done yet
      "assigned:withdraw", "in_action:withdraw", "done:withdraw", "assigned:reassign", "in_action:reassign"]);
    for (const s of STAGES) for (const st of STEPS) expect(nextStage(s, st) !== null).toBe(allowed.has(`${s}:${st}`));
  });

  it("a fix's stage is its trail replayed; a step not allowed where it stands is ignored", () => {
    expect(stageOf([ev("assign")])).toBe("assigned");
    expect(stageOf([ev("assign"), ev("progress"), ev("progress")])).toBe("in_action");
    expect(stageOf([ev("assign"), ev("done"), ev("verify")])).toBe("verified");
    expect(stageOf([ev("assign"), ev("done"), ev("reopen")])).toBe("in_action");
    expect(stageOf([ev("assign"), ev("done"), ev("reopen"), ev("done")])).toBe("done");
    // a verify before done does nothing; a done after verified does nothing
    expect(stageOf([ev("assign"), ev("verify")])).toBe("assigned");
    expect(stageOf([ev("assign"), ev("done"), ev("verify"), ev("done"), ev("reopen")])).toBe("verified");
    // a row written before the tracker (no assignment in its trail) counts as assigned
    expect(stageOf([])).toBe("assigned");
    expect(stageOf([ev("done")])).toBe("done");
  });

  it("late only while unfinished and past due; done at the last done after the last send-back", () => {
    expect(isLate("assigned", "2026-11-20 23:59:59", "2026-11-21 08:00:00")).toBe(true);
    expect(isLate("in_action", "2026-11-22 23:59:59", "2026-11-21 08:00:00")).toBe(false);
    expect(isLate("done", "2026-11-20 23:59:59", "2026-11-21 08:00:00")).toBe(false);
    expect(isLate("assigned", null, "2026-11-21 08:00:00")).toBe(false);
    expect(doneAt([ev("assign"), ev("done", "2026-11-21 09:00:00")])).toBe("2026-11-21 09:00:00");
    expect(doneAt([ev("assign"), ev("done", "2026-11-21 09:00:00"), ev("reopen", "2026-11-22 09:00:00")])).toBeNull();
    expect(doneAt([ev("assign"), ev("done", "2026-11-21 09:00:00"), ev("reopen"), ev("done", "2026-11-24 12:00:00"), ev("verify")])).toBe("2026-11-24 12:00:00");
    expect(doneAt([ev("assign"), ev("progress")])).toBeNull();
  });

  it("keys: one per tab and place; places that would break the summary header are refused", () => {
    expect(fixKey("flood", "n12|w3")).toBe("fix:flood:n12|w3");
    expect(parseFixKey("fix:power:ward:57")).toEqual({ lens: "power", place: "ward:57" });
    expect(parseFixKey("fix:traffic:road:old mahabalipuram road")).toEqual({ lens: "traffic", place: "road:old mahabalipuram road" });
    expect(parseFixKey("drain:INC-1")).toBeNull();
    expect(parseFixKey("fix:boats:x")).toBeNull();
    expect(PLACE_RE.test("road:anna salai|w-")).toBe(true);
    expect(PLACE_RE.test("bad} key")).toBe(false);
    expect(PLACE_RE.test("")).toBe(false);
  });
});

const R = (id: string, start: string, end: string, districtMm: number | null, maxMm: number | null, wardMm: Record<string, number> | null = null): RainFact => ({ id, start, end, districtMm, maxMm, wardMm });

describe("comparable rain", () => {
  const cause = R("rain-2026-11-18", "2026-11-18", "2026-11-19", 80, 140, { "173": 100, "57": 60 });
  it("uses the ward's gauge rain when both rains have it, at 70 % of the rain that led to the action", () => {
    expect(COMPARABLE_SHARE).toBe(0.7);
    const later = R("rain-2026-11-25", "2026-11-25", "2026-11-25", 30, 60, { "173": 70, "57": 20 });
    expect(compareRains(cause, later, 173)).toEqual({ comparable: true, basis: "ward", causeMm: 100, laterMm: 70 });
    expect(compareRains(cause, { ...later, wardMm: { "173": 69.9 } }, 173).comparable).toBe(false);
    expect(compareRains(cause, later, 57)).toMatchObject({ comparable: false, basis: "ward", causeMm: 60, laterMm: 20 });
  });
  it("falls back to the district average, then the wettest gauge; with no reliable figure the later rain tests nothing", () => {
    const later = R("rain-2026-11-25", "2026-11-25", "2026-11-25", 60, 90, { "1": 50 });
    expect(compareRains(cause, later, 173)).toEqual({ comparable: true, basis: "district", causeMm: 80, laterMm: 60 });
    expect(compareRains(cause, later, null).basis).toBe("district");
    expect(compareRains({ ...cause, districtMm: null }, later, 173)).toEqual({ comparable: false, basis: "wettest", causeMm: 140, laterMm: 90 });
    expect(compareRains({ ...cause, districtMm: null, maxMm: null }, later, 173)).toEqual({ comparable: false, basis: "none", causeMm: null, laterMm: null });
    // a cause rain of a few mm is no basis (any drizzle would "test" the fix), and a later rain must clear the floor too
    expect(compareRains({ ...cause, districtMm: 4.9, maxMm: 30, wardMm: null }, { ...later, districtMm: 3.5, wardMm: null }, 173).basis).toBe("none");
    expect(compareRains({ ...cause, districtMm: 25, wardMm: null }, { ...later, districtMm: 18, wardMm: null }, 173)).toMatchObject({ basis: "district", comparable: false });
    // a rain only partly read from the gauges keeps its gauge figures out
    expect(compareRains({ ...cause, complete: false }, later, 173).basis).toBe("wettest");
    // ward 0 (outside the Corporation's wards) never reads a ward figure
    expect(compareRains({ ...cause, wardMm: { "0": 10 } }, { ...later, wardMm: { "0": 1 } }, 0).basis).toBe("district");
  });
});

describe("the outcome at the next rain", () => {
  const rains = [
    R("rain-2026-10-21", "2026-10-21", "2026-10-22", 90, 150, { "173": 110 }),
    R("rain-2026-11-18", "2026-11-18", "2026-11-19", 80, 140, { "173": 100 }),
    R("rain-2026-11-25", "2026-11-25", "2026-11-25", 30, 50, { "173": 40 }),
    R("rain-2026-12-03", "2026-12-03", "2026-12-04", 85, 160, { "173": 95 })
  ];
  const fix = { rain: "rain-2026-11-18", doneAt: "2026-11-22 16:00:00", ward: 173 };
  const later = "2026-12-20 10:00:00";

  it("held: a comparable rain after the work was done, and no flooding there", () => {
    const o = outcomeOf(fix, rains, () => false, later);
    expect(o.kind).toBe("held");
    expect(o.rain).toBe("rain-2026-12-03");
    expect(o.tests.map((t) => [t.rain, t.result])).toEqual([["rain-2026-11-25", "lighter"], ["rain-2026-12-03", "held"]]);
  });

  it("flooded again: hit in any rain after the work, even a lighter one; the latest rain that tested it decides", () => {
    expect(outcomeOf(fix, rains, (id) => id === "rain-2026-11-25", later)).toMatchObject({ kind: "held", rain: "rain-2026-12-03" });
    expect(outcomeOf(fix, rains, (id) => id === "rain-2026-12-03", later)).toMatchObject({ kind: "again", rain: "rain-2026-12-03" });
    expect(outcomeOf(fix, rains.slice(0, 3), (id) => id === "rain-2026-11-25", later)).toMatchObject({ kind: "again", rain: "rain-2026-11-25" });
    // the rain that led to the action, and the rains before it, never count
    expect(outcomeOf(fix, rains, (id) => id === "rain-2026-11-18" || id === "rain-2026-10-21", later)).toMatchObject({ kind: "held" });
  });

  it("not tested: the work is not done (a rain before it is only noted), only lighter rain, no rain since, or reports still coming in", () => {
    const notDone = outcomeOf({ ...fix, doneAt: null }, rains, (id) => id === "rain-2026-11-25", later);
    expect(notDone).toMatchObject({ kind: "pending", why: "not-done", rain: null });
    expect(notDone.tests).toEqual([expect.objectContaining({ rain: "rain-2026-11-25", result: "before" })]);
    expect(outcomeOf(fix, rains.slice(0, 3), () => false, later)).toMatchObject({ kind: "pending", why: "lighter" });
    expect(outcomeOf(fix, rains.slice(0, 2), () => false, later)).toMatchObject({ kind: "pending", why: "no-rain" });
    // the 3 Dec rain ended on the 4th: its reports count until the end of the 6th
    expect(REPORT_TAIL_DAYS).toBe(RAIN_TAIL_DAYS);
    expect(outcomeOf(fix, rains, () => false, "2026-12-06 20:00:00")).toMatchObject({ kind: "pending", why: "open" });
    expect(outcomeOf(fix, rains, () => false, "2026-12-07 00:00:00")).toMatchObject({ kind: "held" });
    // but a flooding report inside the window is enough at once
    expect(outcomeOf(fix, rains, (id) => id === "rain-2026-12-03", "2026-12-03 20:00:00")).toMatchObject({ kind: "again" });
  });

  it("a rain on the day the work was done, or before it, is not a test of it; an unknown rain leaves it untested", () => {
    const sameDay = { ...fix, doneAt: "2026-11-25 07:00:00" };
    expect(outcomeOf(sameDay, rains.slice(0, 3), () => false, later)).toMatchObject({ kind: "pending", why: "no-rain" });
    expect(outcomeOf({ ...fix, rain: "rain-2025-01-01" }, rains, () => true, later)).toMatchObject({ kind: "pending", why: "no-cause" });
  });
});

describe("a flooded street in a rain", () => {
  const rain = { reports: [{ street: "n5|w173", lat: 13.0, lon: 80.2 }, { street: null, lat: 13.05, lon: 80.25 }], streets: [{ key: "sat:9" }] };
  it("a report on it, satellite water on it, or a report within NEAR_M of where the action was taken", () => {
    expect(floodHit(rain, "n5|w173", null)).toBe(true);
    expect(floodHit(rain, "sat:9", null)).toBe(true);
    expect(floodHit(rain, "e77", null)).toBe(false);
    const dLat = (NEAR_M - 10) / 110574;
    expect(floodHit(rain, "e77", { lat: 13.05 + dLat, lon: 80.25 })).toBe(true);
    expect(floodHit(rain, "e77", { lat: 13.05 + (NEAR_M + 10) / 110574, lon: 80.25 })).toBe(false);
    expect(floodHit({ reports: [], streets: null }, "n5|w173", null)).toBe(false);
  });
});

describe("the summary and who may be assigned", () => {
  const f = (id: number, place: string, stage: "assigned" | "in_action" | "done" | "verified" | "closed", kind: "pending" | "held" | "again" = "pending", rain: string | null = null, late = false) =>
    ({ id, lens: "flood" as const, place, stage, late, outcome: { kind, rain } });
  it("counts each place once, by its newest fix", () => {
    const xs = [f(1, "a", "verified", "again", "rain-2026-12-03"), f(5, "a", "assigned", "pending", null, true), f(2, "b", "verified", "held", "rain-2026-12-03"),
      f(3, "c", "done"), f(4, "d", "in_action"), { ...f(6, "e", "assigned"), lens: "power" as const }];
    expect(newestByPlace(xs).get("flood|a")!.id).toBe(5);
    expect(summarize(xs, "flood")).toEqual({ places: 4, assigned: 1, inAction: 1, done: 1, verified: 1, late: 1, closed: 0, held: 1, again: 0, pending: 3, testedIn: ["rain-2026-12-03"] });
    expect(summarize([...xs, f(9, "d", "closed")], "flood")).toMatchObject({ places: 3, closed: 1 });
    // a withdrawn action frees the place
    expect(canAssign([{ rain: "rain-2026-11-18", stage: "closed" }], "rain-2026-11-18")).toEqual({ ok: true });
    expect(summarize(xs, "power").places).toBe(1);
    expect(summarize([], "metro")).toMatchObject({ places: 0, pending: 0, testedIn: [] });
  });
  it("a new action only when every earlier one is verified, and never twice for the same rain", () => {
    expect(canAssign([], "rain-2026-11-18")).toEqual({ ok: true });
    expect(canAssign([{ rain: "rain-2026-11-18", stage: "done" }], "rain-2026-12-03")).toEqual({ ok: false, why: "unfinished" });
    expect(canAssign([{ rain: "rain-2026-11-18", stage: "verified" }], "rain-2026-11-18")).toEqual({ ok: false, why: "same-rain" });
    expect(canAssign([{ rain: "rain-2026-11-18", stage: "verified" }], "rain-2026-12-03")).toEqual({ ok: true });
  });
});

describe("defaults", () => {
  it("a flooded street: the open drain complaint's department, else Storm Water Drain; outside the wards, District Disaster Management", () => {
    const a = floodDefault({ label: "Anna Salai", ward: 112, water_m: 900, chokeDepts: ["GCC-SWM", "GCC-SWD", "GCC-SWM"] }, "18 Nov");
    expect(a.dept).toBe("GCC-SWM");
    expect(a.note).toContain("Anna Salai");
    expect(a.note).toContain("18 Nov rain");
    const b = floodDefault({ label: "A lane off 2nd Street", ward: 173, water_m: 60 }, "18 Nov");
    expect(b.dept).toBe("GCC-SWD");
    expect(b.note).toContain("60 m away");
    expect(floodDefault({ label: "A road in ward 0", ward: 0 }, "18 Nov").dept).toBe("DIST-DM");
    expect(floodDefault({ label: "x".repeat(400), ward: 5 }, "18 Nov").note.length).toBeLessThanOrEqual(300);
  });
  it("Traffic, Power and Metro: the tab's own job that fits what happened", () => {
    const road = { label: "Velachery Main Road", kind: "road", jobs: [{ who: "Greater Chennai Traffic Police", en: "A diversion ready for Velachery Main Road before the next heavy rain" },
      { who: "GCC Storm Water Drains", en: "Clear the drains along Velachery Main Road so water does not stand" }, { who: "GCC Roads", en: "Patch the broken stretches of Velachery Main Road" }] };
    expect(impactDefault("traffic", road, "Water on the road · 2 accidents", "18 Nov").dept).toBe("GCC-SWD");
    expect(impactDefault("traffic", road, "Road damage · 3 accidents", "18 Nov").dept).toBe("GCC-ENG");
    expect(impactDefault("traffic", road, "3 accidents", "18 Nov")).toMatchObject({ dept: "POL-GCP" });
    const ward = { label: "Ward 57", kind: "area", jobs: [{ who: "TNPDCL (electricity)", en: "Check transformers and feeder pillars on low ground in Ward 57" }] };
    expect(impactDefault("power", ward, "Power off about 4 h", "18 Nov")).toMatchObject({ dept: "TANGEDCO" });
    const line = { label: "Blue Line", kind: "line", jobs: [{ who: "CMRL (Metro)", en: "Pumps and sandbags at Guindy and Alandur before the rain" }] };
    const m = impactDefault("metro", line, "Trains about 15 min late", "18 Nov");
    expect(m.dept).toBe("DIST-DM");
    expect(m.note.startsWith("Take up with CMRL: Pumps and sandbags")).toBe(true);
    expect(impactDefault("metro", { label: "X", kind: "line", jobs: [] }, null, "18 Nov").dept).toBe("DIST-DM");
  });
  it("due a week from today by default", () => {
    expect(defaultDue("2026-11-28 10:00:00")).toBe("2026-12-05");
  });
});
