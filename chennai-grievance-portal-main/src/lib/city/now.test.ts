import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// v12 (21 Nov): cityNow's focus (the most congested stretch, the trouble spot that keeps coming back), its past rain (the streets that flooded
// in the last heavy rain) and its stale-while-revalidate cache, against stand-ins for TomTom and the flood memory
const owner = { dept: "POL-GCP", name: "Greater Chennai Traffic Police", ta: "சென்னை போக்குவரத்துக் காவல்", why: "A jam." };
const spot = (id: string, level: string, delayMin: number, lengthM: number) => ({ id, level, kind: "Jam", label: "Queuing traffic", name: `Road ${id}`, road: `Road ${id}`, from: null, to: null,
  delayMin, delayS: delayMin * 60, lengthM, magnitude: 3, path: [[13.05, 80.25]], lat: 13.05, lon: 80.25, ward: null, zone: 9, zoneName: "Teynampet", owner,
  repeat: { n: 3, open: 1, reports: [], news: [], cats: [] }, action: true, why: "", score: 0 });
const TRAFFIC = {
  enabled: true, at: "2026-11-21T06:30:00.000Z", why: null, source: "TomTom",
  counts: { total: 3, jams: 2, very: 1, congested: 1, slow: 0, closed: 0, flooded: 1, accidents: 0, works: 0, action: 3, clusters: 1 },
  spots: [spot("wet", "flood", 30, 900), spot("very12", "very", 12, 1400), spot("cong20", "congested", 20, 2000)],
  clusters: [{ id: "tc-1", name: "Poonamallee High Road", zone: 8, zoneName: "Anna Nagar", ward: null, lat: 13.08, lon: 80.21, spots: ["cong20"], level: "congested", delayMin: 20,
    reports: [{ id: "INC-1" }, { id: "INC-2" }], news: [], open: 1, owner, why: "2 reports in 30 days" }],
  zones: [], window: { from: "", to: "" }
};
const street = (key: string, label: string, rains: number) => ({ key, name: label, name_ta: null, near: null, label, label_ta: `${label} (த)`, ward: 177, tier: 2, rains, rainDates: [], rainIncidents: 0,
  otherIncidents: 0, lastFlood: null, length_m: 100, lat: 12.98, lon: 80.22, water_m: 0, main: false, incidents: [], lines: [], chokes: 0 });
const STATE = {
  asOf: "2026-11-21 12:00:00", trigger: { level: "none", reasons: [], hoursLeft: null }, rain: { stations: [] }, lakes: [], jobs: [], rains: [],
  counts: { likely: 2, possible: 1, chokes: 0 }, streets: [street("s1", "Velachery Main Road", 4), street("s2", "Taramani Link Road", 3), street("s3", "Kotturpuram Bridge Road", 1)]
};
const PAST = { asOf: "2026-11-21", rains: [
  { id: "rain-2026-11-02", start: "2026-11-02 05:00:00", end: "", maxMm: 30, sources: [], reports: [] },
  { id: "rain-2026-10-21", start: "2026-10-21 06:00:00", end: "", maxMm: 120, sources: [], reports: [{ street: "s2" }, { street: "s1" }, { street: "s1" }, { street: null }] }
] };
const trafficNow = vi.fn(async () => TRAFFIC);
vi.mock("./traffic", async () => {
  const pick = await import("./pick");
  return { LEVEL_WORD: pick.LEVEL_WORD, trafficNow: () => trafficNow(), trafficSay: () => ({ en: "Live traffic across the district: 1 very congested stretch.", ta: "நேரடி போக்குவரத்து." }) };
});
vi.mock("@/lib/rehearsal/engine", () => ({ rehearsalState: async () => STATE, pastRains: async () => PAST }));
vi.mock("@/lib/rehearsal/impacts", () => ({ impacts: async () => ({ rains: [], items: [] }) }));

const { cityNow } = await import("./now");

beforeEach(() => {
  globalThis.__diqCityNow = undefined;
  globalThis.__diqCityRun = undefined;
  trafficNow.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-21T07:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("cityNow: the one place a focused question asked about", () => {
  it("the most congested stretch is the very congested one, not the water on a road; said alone, with its own figures and the view on it", async () => {
    const c = await cityNow("traffic", { focus: "worst-jam" });
    expect(c.focus).toMatchObject({ kind: "spot", id: "very12", delayMin: 12, lengthM: 1400, reports: 3, open: 1 });
    expect(c.say.en).toBe(c.focus!.line.en);
    expect(c.say.en).toMatch(/^Road very12 \(Teynampet\) is the most congested now: very congested, about 12 min delay over 1\.4 km\./);
    expect(c.view).toEqual({ kind: "traffic", spot: "very12" });
    expect(c.facts.find((f) => f.id === "traffic.focus.length")).toMatchObject({ value: 1.4, unit: "km" });
    expect(c.rows[0].spot).toBe("very12");
  });
  it("the trouble spot that keeps coming back opens the view on its tab", async () => {
    const c = await cityNow("traffic", { focus: "repeat" });
    expect(c.focus).toMatchObject({ kind: "cluster", id: "tc-1", reports: 2, open: 1 });
    expect(c.view).toEqual({ kind: "traffic", cluster: "tc-1", tab: "repeat" });
  });
  it("no focus: the district's traffic, as before, with each row's spot id", async () => {
    const c = await cityNow("traffic");
    expect(c.focus).toBeNull();
    expect(c.say.en).toMatch(/^Live traffic across the district/);
    expect(c.rows.map((r) => r.spot)).toEqual(["wet", "very12", "cong20"]);
  });
});

describe("cityNow: one past heavy rain", () => {
  it("the last heavy rain with reports: its streets, most reports first, said first", async () => {
    const c = await cityNow("flood", { rain: "latest" });
    expect(c.rainOf).toMatchObject({ id: "rain-2026-10-21", latest: true, reports: 4 });
    expect(c.rainOf!.streets.map((s) => [s.key, s.n])).toEqual([["s1", 2], ["s2", 1]]);
    expect(c.say.en.startsWith("In the last heavy rain (21 October), 2 streets flooded: Velachery Main Road, Taramani Link Road.")).toBe(true);
    expect(c.view).toEqual({ kind: "rain", lens: "flood", replay: "rain-2026-10-21" });
    expect(c.facts.find((f) => f.id === "flood.rain.streets")?.value).toBe(2);
  });
  it("a day with no heavy rain in the record is said so", async () => {
    const c = await cityNow("flood", { rain: "rain-2026-09-01" });
    expect(c.rainOf).toBeNull();
    expect(c.say.en).toMatch(/^There is no heavy rain on 1 September in the record\./);
  });
});

describe("cityNow: stale-while-revalidate", () => {
  it("a fresh answer is served as it is; a stale one at once, read again behind it; an old one read now", async () => {
    const a = await cityNow("traffic");
    expect(trafficNow).toHaveBeenCalledTimes(1);
    expect(await cityNow("traffic")).toBe(a);
    expect(trafficNow).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-11-21T07:02:00Z"));
    expect(await cityNow("traffic")).toBe(a);
    await vi.waitFor(() => expect(trafficNow).toHaveBeenCalledTimes(2));
    // (the read behind it has landed: one read at a time per key, so a call while it runs shares it)
    await vi.waitFor(() => expect(globalThis.__diqCityRun?.size ?? 0).toBe(0));
    vi.setSystemTime(new Date("2026-11-21T07:20:00Z"));
    const c = await cityNow("traffic");
    expect(c).not.toBe(a);
    expect(trafficNow).toHaveBeenCalledTimes(3);
  });
});
