import { describe, expect, it } from "vitest";
import { trigger } from "./trigger";
import { plan, type PlanInput } from "./playbook";
import { decodeSummary, encodeSummary } from "./tasks";
import type { Street } from "./memory";

const base = { gauges: [], releases: [], bulletins: [], lakes: [] };

describe("rain trigger", () => {
  it("is quiet with no warning", () => {
    const t = trigger({ ...base, asOf: "2026-10-29 09:00:00", warnings: [{ at: "2026-10-29 00:00:00", level: 0, text: "No Warning" }] });
    expect(t.level).toBe("none");
    expect(t.rainAt).toBeNull();
  });
  it("rehearses an Orange warning two days out and counts the hours to it", () => {
    const t = trigger({ ...base, asOf: "2026-10-29 09:00:00", warnings: [{ at: "2026-10-31 00:00:00", level: 2, text: "Heavy rain" }] });
    expect(t.level).toBe("rehearse");
    expect(t.rainAt).toBe("2026-10-31 00:00:00");
    expect(t.hoursLeft).toBe(39);
    expect(t.reasons[0].en).toContain("IMD Orange");
  });
  it("acts on a warning for today or tomorrow, and on a reservoir release", () => {
    expect(trigger({ ...base, asOf: "2026-10-29 09:00:00", warnings: [{ at: "2026-10-30 00:00:00", level: 3, text: "Very heavy rain" }] }).level).toBe("act");
    const r = trigger({ ...base, asOf: "2026-10-29 09:00:00", warnings: [], releases: [{ id: "TNCH-07-T0726", name: "Chembarambakkam Tank", at: "2026-10-29 06:00:00", discharge: 1000, inflow: null, unit: "cusec", prev: 0 }] });
    expect(r.level).toBe("act");
    expect(r.reasons[0].kind).toBe("release");
  });
  it("watches a Yellow warning and never reads a warning from the past", () => {
    expect(trigger({ ...base, asOf: "2026-10-29 09:00:00", warnings: [{ at: "2026-10-30 00:00:00", level: 1, text: "Thunderstorm" }] }).level).toBe("watch");
    expect(trigger({ ...base, asOf: "2026-10-29 09:00:00", warnings: [{ at: "2026-10-27 00:00:00", level: 3, text: "Very heavy rain" }] }).level).toBe("none");
  });
  it("never triggers on a suspect gauge, but does on a good one near its warning level", () => {
    const g = (quality: string, level: number) => ({ id: "CFM-1", name: "Saidapet bridge", lat: 13, lon: 80.2, at: "2026-10-29 06:00:00", level, warning: 4, danger: 5, quality, detail: null });
    expect(trigger({ ...base, asOf: "2026-10-29 09:00:00", warnings: [], gauges: [g("suspect", 3.9)] }).level).toBe("none");
    expect(trigger({ ...base, asOf: "2026-10-29 09:00:00", warnings: [], gauges: [g("ok", 3.7)] }).level).toBe("rehearse");
    expect(trigger({ ...base, asOf: "2026-10-29 09:00:00", warnings: [], gauges: [g("ok", 4.1)] }).level).toBe("act");
  });
  it("lets the Collector rehearse anyway, 48 hours out", () => {
    const t = trigger({ ...base, asOf: "2026-10-29 09:00:00", warnings: [], manual: true });
    expect(t.level).toBe("rehearse");
    expect(t.rainAt).toBe("2026-10-31 00:00:00");
  });
});

const street = (over: Partial<Street>): Street => ({ key: "n1|w5", name: "Lake View Road", name_ta: null, near: null, ward: 5, edges: [1], tier: 2, rains: 3, rainDates: [], rainIncidents: 3,
  otherIncidents: 0, lastFlood: null, score: 5, length_m: 300, lat: 13, lon: 80.2, water_m: 200, incidents: ["I1"], ...over });
const input = (over: Partial<PlanInput>): PlanInput => ({
  asOf: "2026-10-29 09:00:00", level: "rehearse", rainAt: "2026-10-31 00:00:00", streets: [], chokes: [], works: [], facilities: [], reach: [], wards: [], wardPoint: new Map(), dry: [], ribbon: null,
  mainStreet: () => false, fireFor: () => null, ...over
});

describe("rehearsal plan", () => {
  it("turns an open drain complaint on a flood street into a job for its own department, due a day before the rain", () => {
    const jobs = plan(input({ streets: [street({})], chokes: [{ id: "INC-1", cat: "DRAINAGE_SEWAGE", title: "Drain blocked", place: "Lake View Road", lat: 13, lon: 80.2, dept: "PWD-WRD", ward: 5, street: "n1|w5", tier: 2, priority: 70, ageDays: 9, breached: true }] }));
    const j = jobs.find((x) => x.kind === "drain")!;
    expect(j.dept).toBe("PWD-WRD");
    expect(j.incident).toBe("INC-1");
    expect(j.due).toBe("2026-10-30 00:00:00");
  });
  it("checks streets that flooded in 3+ rains with no complaint, plans diversions on main roads, and puts pumps by clusters", () => {
    const s = [street({ key: "a", lat: 13, lon: 80.2 }), street({ key: "b", lat: 13.001, lon: 80.201 }), street({ key: "c", lat: 13.002, lon: 80.2 })];
    const jobs = plan(input({ streets: s, mainStreet: (x) => x.key === "a" }));
    expect(jobs.filter((j) => j.kind === "street").length).toBe(3);
    expect(jobs.filter((j) => j.kind === "diversion").map((j) => j.key)).toEqual(["diversion:a"]);
    expect(jobs.filter((j) => j.kind === "pump").length).toBe(1);
  });
  it("says 'as soon as possible' when a deadline has already passed, and opens dry schools only at ACT", () => {
    const dry = [{ id: "S1", name: "Corporation School", name_ta: null, lat: 13, lon: 80.21, ward: 5, government: true, floodM: 400, hospitalMin: 4 }];
    const late = plan(input({ rainAt: "2026-10-29 20:00:00", streets: [street({})], dry }));
    expect(late.find((j) => j.kind === "street")!.due).toBeNull();
    expect(late.some((j) => j.kind === "shelter")).toBe(false);
    expect(plan(input({ level: "act", dry })).some((j) => j.kind === "shelter")).toBe(true);
  });
  it("gives every job a stable key (the same rehearsal never sends one twice)", () => {
    const a = plan(input({ streets: [street({})] })).map((j) => j.key);
    const b = plan(input({ streets: [street({})] })).map((j) => j.key);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe("task rows", () => {
  it("keep the rehearsal, department, job, place and deadline in the follow-up summary", () => {
    const s = encodeSummary("R-2026-10-31", { key: "drain:INC-1", kind: "drain", dept: "PWD-WRD", en: "Clear the drain at Lake View Road", ta: "", why: "", place: "Lake View Road",
      lat: 13.0123456, lon: 80.2, ward: 5, incident: "INC-1", due: "2026-10-30 00:00:00", rank: 1 });
    expect(s.length).toBeLessThanOrEqual(500);
    const d = decodeSummary(s)!;
    expect(d.head).toMatchObject({ r: "R-2026-10-31", d: "PWD-WRD", k: "drain:INC-1", la: 13.01235, w: 5, u: "2026-10-30 00:00:00" });
    expect(d.text).toBe("Clear the drain at Lake View Road");
    expect(decodeSummary("Completion report with photos")).toBeNull();
  });
});
