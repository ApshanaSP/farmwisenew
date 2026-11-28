/**
 * The tracker on the server (trackview.ts): each fix's outcome read from the later rains' own data (Flooding: reports and
 * satellite streets; Power, Traffic, Metro: the tab's record of that rain), and an assignment checked place by place against the
 * rain it names, with the place's name and point from the server's data.
 */
import { describe, expect, it, vi } from "vitest";
import type { Task } from "./tasks";

const rain = (id: string, start: string, end: string, mean: number, wards: Record<number, number>, reports: { street: string | null; lat: number; lon: number }[], streets: unknown[] = []) => ({
  id, start, end, maxMm: mean * 2, sources: ["imd"], reports: reports.map((r, k) => ({ id: `${id}-${k}`, title: "Water", place: "2nd Street", first: `${start} 10:00:00`, ward: 173, open: true, ...r })),
  rain: { mean, wards: Object.entries(wards).map(([w, mm]) => ({ ward: Number(w), mm })), window: { from: start, to: end, daysRead: 2, daysWanted: 2 } }, sat: null, streets
});
const RAINS = [
  rain("rain-2026-11-18", "2026-11-18", "2026-11-19", 80, { 173: 100, 57: 90 }, [{ street: "n5|w173", lat: 12.98, lon: 80.22 }], [{ key: "n5|w173", source: "complaint", reports: 1, sat: null },
    { key: "sat:1", source: "satellite", reports: 0, sat: { name: null, near: "Anna Salai", ward: 112, how: "on", floodedM: 120, conf: "high", lat: 13.05, lon: 80.25, lines: [] } }]),
  rain("rain-2026-12-03", "2026-12-03", "2026-12-04", 85, { 173: 95, 57: 30 }, [{ street: "n5|w173", lat: 12.98, lon: 80.22 }])
];
vi.mock("./engine", () => ({
  pastRains: async () => ({ asOf: "2026-12-20 10:00:00", rains: RAINS }),
  impactInputs: async () => ({ streets: [{ key: "n5|w173", label: "Velachery Main Road", lat: 12.981, lon: 80.221, ward: 173 }] })
}));
vi.mock("./satflood", () => ({ withRainData: (v: { rains: unknown[] }) => v }));
vi.mock("./impacts", () => ({
  impacts: async (lens: string) => ({
    items: lens === "power" ? [{ key: "ward:57", label: "Ward 57", lat: 13.1, lon: 80.28, ward: 57, byRain: { "rain-2026-11-18": { level: 2, why: "Power off about 4 h" } } }]
      : lens === "traffic" ? [{ key: "road:anna salai", label: "Anna Salai", lat: 13.05, lon: 80.25, ward: 112, byRain: { "rain-2026-11-18": { level: 3, why: "Water on the road" }, "rain-2026-12-03": { level: 1, why: "1 accident" } } }] : []
  })
}));
vi.mock("@/lib/map/world", () => ({ world: async () => ({ world: { depts: new Map([["GCC-SWD", { name: "Storm Water Drain" }], ["TANGEDCO", { name: "Electricity Distribution" }]]) } }) }));
vi.mock("@/lib/collector/intel", () => ({ asOf: async () => "2026-12-20 10:00:00" }));

const done = (at: string) => [{ step: "assign" as const, at: "2026-11-20 09:00:00", by: "c", remarks: null, photo: null, photoM: null }, { step: "done" as const, at, by: "o", remarks: "Done", photo: null, photoM: null }];
const task = (id: number, lens: "flood" | "power" | "traffic", place: string, ward: number, trail: ReturnType<typeof done>, stage: "done" | "verified" | "assigned" = "done"): Task => ({
  id, rehearsal: "rain-2026-11-18", dept: lens === "power" ? "TANGEDCO" : "GCC-SWD", key: `fix:${lens}:${place}`, lat: 12.98, lon: 80.22, ward, text: "Fix it", incident: null, due: "2026-11-30 23:59:59",
  status: stage === "assigned" ? "todo" : "done", doneAt: null, doneBy: null, photo: null, photoM: null, createdAt: "2026-11-20 09:00:00",
  fix: { lens, place, label: place, note: "Fix it", stage, late: false, trail }
});
const H = vi.hoisted(() => ({ tasks: [] as unknown[] }));
vi.mock("./tasks", () => ({ readTasks: async () => H.tasks }));

const { trackerState, prepareAssign, rainFacts } = await import("./trackview");

describe("the tracker's outcomes come from the later rains' own records", () => {
  it("a street flooded again, a ward that held, a road jammed again; names and order", async () => {
    H.tasks = [task(1, "flood", "n5|w173", 173, done("2026-11-25 12:00:00")), task(2, "power", "ward:57", 57, done("2026-11-25 12:00:00")),
      task(3, "traffic", "road:anna salai", 112, done("2026-11-25 12:00:00"), "verified"), task(4, "flood", "e7", 173, [done("")[0]], "assigned")];
    const s = await trackerState();
    expect(s.fixes.map((f) => f.id)).toEqual([4, 3, 2, 1]);
    const by = new Map(s.fixes.map((f) => [f.id, f]));
    expect(by.get(1)!.outcome).toMatchObject({ kind: "again", rain: "rain-2026-12-03" });
    // ward 57 had 30 mm against 90 mm: a lighter rain, not a test, even though the power stayed on
    expect(by.get(2)!.outcome).toMatchObject({ kind: "pending", why: "lighter" });
    expect(by.get(3)!.outcome).toMatchObject({ kind: "again", rain: "rain-2026-12-03" });
    expect(by.get(4)!.outcome).toMatchObject({ kind: "pending", why: "not-done" });
    expect(by.get(1)!.deptName).toBe("Storm Water Drain");
    expect(s.depts.find((d) => d.code === "TANGEDCO")!.name).toBe("Electricity Distribution");
    expect(s.share).toBe(0.7);
  });

  it("each rain's gauge rain by ward feeds the comparison", () => {
    expect(rainFacts(RAINS as never)[1]).toEqual({ id: "rain-2026-12-03", start: "2026-12-03", end: "2026-12-04", districtMm: 85, maxMm: 170, wardMm: { "173": 95, "57": 30 }, complete: true });
  });
});

describe("an assignment is checked against the rain it names", () => {
  it("takes the server's name and point, a satellite street too; skips what the rain did not hit, unfinished and repeated places", async () => {
    H.tasks = [task(9, "flood", "e8", 173, [done("")[0]], "assigned")];
    const note = "Clear the drains along it before the next rain";
    const p = await prepareAssign("flood", "rain-2026-11-18", [
      { place: "n5|w173", dept: "GCC-SWD", note }, { place: "sat:1", dept: "GCC-SWD", note }, { place: "e8", dept: "GCC-SWD", note },
      { place: "e404", dept: "GCC-SWD", note }, { place: "n5|w173", dept: "PWD-WRD", note }
    ]);
    expect(p.ok).toEqual([
      { place: "n5|w173", dept: "GCC-SWD", note, label: "Velachery Main Road", lat: 12.981, lon: 80.221, ward: 173 },
      { place: "sat:1", dept: "GCC-SWD", note, label: "A lane off Anna Salai", lat: 13.05, lon: 80.25, ward: 112 }
    ]);
    expect(p.skipped).toEqual([{ place: "e8", why: "unfinished" }, { place: "e404", why: "not-hit" }, { place: "n5|w173", why: "repeat" }]);
  });

  it("the other tabs: the place must be in that rain's record; an unknown rain skips everything", async () => {
    H.tasks = [];
    const note = "Check transformers on low ground in the ward";
    const a = await prepareAssign("power", "rain-2026-11-18", [{ place: "ward:57", dept: "TANGEDCO", note }]);
    expect(a.ok).toEqual([{ place: "ward:57", dept: "TANGEDCO", note, label: "Ward 57", lat: 13.1, lon: 80.28, ward: 57 }]);
    const b = await prepareAssign("power", "rain-2026-12-03", [{ place: "ward:57", dept: "TANGEDCO", note }]);
    expect(b.skipped).toEqual([{ place: "ward:57", why: "not-hit" }]);
    const c = await prepareAssign("flood", "rain-2030-01-01", [{ place: "n5|w173", dept: "GCC-SWD", note }]);
    expect(c.rain).toBeNull();
  });
});
