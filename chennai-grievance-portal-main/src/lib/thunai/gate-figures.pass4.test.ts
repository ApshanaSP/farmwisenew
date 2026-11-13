// QA4 final gate: the figure fixes. FB-1 (a past-deadline figure larger than the severe figure beside it), FB-2 (rainfall in a zone answered with the
// city's highest reading), gate-oracle-2 (the other department of a comparison read 0 past deadline) and gate-oracle-3 (zone performance left the
// incidents with no zone out of Open and Severe). Each test fails on the code before the fix.
import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";
import { buildScreen, emptySlots, type Hands } from "./screens";
import { fakeHands } from "./stagefake";

const world = { ...WORLD, ...referenceWorld() };
const scope = { period: "weekly" as const, zone: null, dept: null, cat: null, taluk: null, sev: null };
type Built = Awaited<ReturnType<typeof buildScreen>>;
const kpi = (b: Built, key: string) => (b.doc.blocks.find((x) => x.kind === "Kpis") as { items: { key: string; value: number }[] } | undefined)?.items.find((x) => x.key === key)?.value;
const res = (data: unknown) => ({ scope: null, asOf: "2026-11-06 18:00:00", data, facts: [], sources: [], incidentIds: [], caveats: [] }) as never;

describe("FB-1: the past-deadline figure beside the severe figure names its unit", () => {
  // the severity panel has 9 cases (one per group of the same problem); the console's past-deadline list holds 10 incidents
  const row = (i: number, late: boolean) => ({ id: `INC-${i}`, title: `Case ${i}`, sev: "Severe", status: "Open", zone: 13, dept: "PWD-WRD", dept_name: "PWD Water Resources", complaints: 1, t: "2026-11-01 10:00:00", breached: late ? 1 : 0 });
  const rows = Array.from({ length: 9 }, (_, i) => row(i, i < 5));
  const hands = (): Hands => ({
    ...fakeHands(),
    severe: async () => ({ rows: rows as never, counts: { Severe: 9, High: 0, Medium: 0, Low: 0 }, asOf: "2026-11-06 18:00:00" }),
    list: async (_s, f) => (f.status === "overdue"
      ? { rows: rows.slice(0, 5) as never, total: 5, incidents: 10, asOf: "2026-11-06 18:00:00" }
      : { rows: rows as never, total: 9, incidents: 11, asOf: "2026-11-06 18:00:00" })
  });
  it("FB-1: '9 severe cases' is followed by '10 incidents', never by '10 are past their deadline'", async () => {
    const b = await buildScreen("cases", { ...emptySlots(), sev: "Severe", period: "weekly" }, scope, world, hands(), "how many severe incidents this week");
    expect(b.doc.say.en).toMatch(/^9 severe cases/);
    expect(b.doc.say.en).toMatch(/10 incidents are past their deadline/);
    expect(b.doc.say.en).not.toMatch(/\b10 are past/);
    expect(b.doc.say.ta).toMatch(/பதிவுகள்/);
    expect(kpi(b, "late")).toBe(10);
  });
  it("a list whose total counts incidents keeps its sentence as before", async () => {
    const b = await buildScreen("cases", { ...emptySlots(), status: "overdue", period: "weekly" }, scope, world, hands(), "overdue cases");
    expect(b.doc.say.en).not.toMatch(/incidents are past/);
  });
});

describe("FB-2: rainfall in a zone is not answered with the city's highest reading", () => {
  it("a zone with no station of its name is told so, and the highest station is named as such", async () => {
    const b = await buildScreen("readings", { ...emptySlots(), metric: "rain", zones: [13] }, scope, world, fakeHands(), "what is the rainfall in Adyar");
    expect(b.doc.say.en).toMatch(/no rainfall in the last 24 hours gauge in Adyar/i);
    expect(b.doc.say.en).toMatch(/stations, not zones/);
    expect(b.doc.say.ta).toMatch(/பகுதிக்கு/);
  });
  it("a station named after the zone is that zone's reading", async () => {
    const hands = fakeHands({ environment: () => res({ rows: [{ place_id: "S1", place: "Chennai-Nungambakkam", lat: 13.06, lon: 80.24, t: "2026-10-28 08:30:00", value: 64.2, mean28: 12 },
      { place_id: "S5", place: "Adyar", lat: 13.0, lon: 80.25, t: "2026-10-28 08:30:00", value: 9, mean28: 8 }] }) });
    const b = await buildScreen("readings", { ...emptySlots(), metric: "rain", zones: [13] }, scope, world, hands, "what is the rainfall in Adyar");
    expect(b.doc.say.en).toMatch(/^Adyar is at 9 mm/);
  });
  it("no zone named: the highest station, as before", async () => {
    const b = await buildScreen("readings", { ...emptySlots(), metric: "rain" }, scope, world, fakeHands(), "rainfall");
    expect(b.doc.say.en).toMatch(/Highest: Chennai-Nungambakkam/);
  });
});

describe("gate-oracle-2: comparing departments reads each one for itself", () => {
  it("with one department chosen on the console, the other department's past-deadline figure is its own", async () => {
    const seen: string[] = [];
    const base = fakeHands();
    const hands: Hands = { ...base, tool: async (name, args) => {
      const sc = (args.scope ?? {}) as { dept?: string | null };
      seen.push(`${name}:${sc.dept ?? "all"}`);
      // the follow-ups tool applies a department filter, as the real one does: a filtered call holds only that department's row
      if (name === "dept_followups" && sc.dept) return res({ rows: [{ code: sc.dept, name: sc.dept, open: 10, overdue: 3, serious: 1, awaiting: 0, complaints: 1 }] });
      return base.tool(name, args);
    } };
    const b = await buildScreen("compare", { ...emptySlots(), dept: "GCC-SWD", depts: ["GCC-SWD", "POL-GCP"], period: "weekly" }, { ...scope, dept: "GCC-SWD" }, world, hands, "compare storm water and police");
    const cmp = b.doc.blocks.find((x) => x.kind === "Compare") as unknown as { sides: { key: string; values: Record<string, number> }[] };
    expect(seen.filter((x) => /^dept_followups/.test(x))).toEqual(["dept_followups:all"]);
    expect(cmp.sides.find((x) => x.key === "POL-GCP")!.values.overdue).toBe(76);
    expect(cmp.sides.find((x) => x.key === "GCC-SWD")!.values.overdue).toBeGreaterThan(0);
  });
});

describe("gate-oracle-3: zone performance counts the incidents with no zone in Open and Severe", () => {
  it("Open and Severe come from the series that gives Reported, not from the sum of the zone rows", async () => {
    const buckets = [{ from: "2026-11-01 00:00:00", to: "", n: 100, severe: 30, open: 70 }, { from: "2026-11-02 00:00:00", to: "", n: 120, severe: 25, open: 80 }];
    const hands = fakeHands({ incident_series: () => res({ buckets, unit: "day", normal: null }) });
    const b = await buildScreen("performance", { ...emptySlots(), by: "zone", period: "weekly" }, scope, world, hands, "how are the zones doing");
    expect(kpi(b, "n")).toBe(220);
    expect(kpi(b, "severe")).toBe(55);
    expect(kpi(b, "open")).toBe(150);
    // the zone rows alone would add up to 18 severe and 327 open: they leave out the incidents with no zone
    expect(kpi(b, "severe")).not.toBe(18);
  });
});
