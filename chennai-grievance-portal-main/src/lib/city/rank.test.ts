import { describe, expect, it, vi } from "vitest";

// 23 Nov 2026: "top three most congested roads", "which areas have the least traffic": rankPart over a stand-in for TomTom
vi.mock("@/lib/rehearsal/engine", () => ({ pastRains: async () => null, rehearsalState: async () => null }));
vi.mock("@/lib/rehearsal/impacts", () => ({ impacts: async () => null }));
vi.mock("./traffic", async () => ({ LEVEL_WORD: (await import("./pick")).LEVEL_WORD, trafficNow: async () => null, trafficSay: () => ({ en: "", ta: "" }) }));
const { rankPart } = await import("./now");

const owner = { dept: "POL-GCP", name: "Greater Chennai Traffic Police", ta: "காவல்", why: "" };
const spot = (id: string, level: string, delayMin: number, lengthM: number, zone: number, zoneName: string) => ({ id, level, kind: "Jam", label: "Queuing", name: `Road ${id}`, road: `Road ${id}`,
  from: null, to: null, delayMin, delayS: delayMin * 60, lengthM, magnitude: 3, path: [[13.05, 80.25]], lat: 13.05, lon: 80.25, ward: null, zone, zoneName, owner,
  repeat: { n: 0, open: 0, reports: [], news: [], cats: [] }, action: true, why: "", score: 0 });
const T = {
  enabled: true, at: "2026-11-23T05:12:00.000Z", why: null, source: "TomTom", counts: {} as never, clusters: [], window: { from: "", to: "" },
  spots: [spot("a", "congested", 20, 2000, 9, "Teynampet"), spot("b", "very", 12, 1400, 9, "Teynampet"), spot("c", "very", 5, 800, 8, "Anna Nagar"),
    spot("d", "slow", 2, 300, 13, "Adyar"), spot("e", "flood", 30, 900, 13, "Adyar"), spot("f", "congested", 4, 500, 8, "Anna Nagar")],
  zones: [{ zone: 9, name: "Teynampet", jams: 2, very: 1, delayMin: 32 }, { zone: 8, name: "Anna Nagar", jams: 2, very: 1, delayMin: 9 }, { zone: 13, name: "Adyar", jams: 1, very: 0, delayMin: 2 }]
} as never;

describe("rankPart", () => {
  it("top three most congested roads: very first, then delay, then length; water is not congestion; with why and how", () => {
    const r = rankPart({ n: 3, order: "most", by: "road" }, T, null, null);
    expect(r.items.map((x) => x.name)).toEqual(["Road b", "Road c", "Road a"]);
    expect(r.items[0].why).toMatch(/very congested, about 12 min delay over 1\.4 km/);
    expect(r.line.en).toMatch(/^The 3 most congested roads now: 1\. Road b \(Teynampet\)/);
    expect(r.method.en).toMatch(/Why this order/);
  });
  it("least congested roads: the mildest first, and says unlisted roads move freely", () => {
    const r = rankPart({ n: 2, order: "least", by: "road" }, T, null, null);
    expect(r.items.map((x) => x.name)).toEqual(["Road d", "Road f"]);
    expect(r.line.en).toMatch(/Every road TomTom does not list is moving at its normal speed/);
  });
  it("zones with the most congestion: very congested, then jams, then delay", () => {
    const r = rankPart({ n: 3, order: "most", by: "area" }, T, null, null);
    expect(r.items.map((x) => x.name)).toEqual(["Teynampet", "Anna Nagar", "Adyar"]);
    expect(r.items[0].why).toBe("2 jams now, 1 very congested, 32 min of delay in all");
  });
  it("zones with the least: the zones with no jam", () => {
    const r = rankPart({ n: 3, order: "least", by: "area" }, T, null, null);
    expect(r.items.every((x) => x.jams === 0)).toBe(true);
    expect(r.line.en).toMatch(/^12 zones have no jam at all now/);
  });
  it("fewer jams than asked: says only that many", () => {
    const r = rankPart({ n: 5, order: "most", by: "road" }, { ...(T as object), spots: (T as { spots: unknown[] }).spots.slice(0, 2) } as never, "Teynampet", null);
    expect(r.line.en).toMatch(/^Only 2 roads in Teynampet are congested now/);
  });
});
