import { beforeEach, describe, expect, it, vi } from "vitest";

// v14 (21 Nov review 13, routing 0 and 5): the server's city screen for one zone. cityNow("traffic", { zone, focus }) named the district's
// worst jam for an Adyar question (focusPart read every spot) and listed the district's stretches; against stand-ins for TomTom, as now.test.ts
const owner = { dept: "POL-GCP", name: "Greater Chennai Traffic Police", ta: "x", why: "A jam." };
const spot = (id: string, delayMin: number, zone: number, zoneName: string) => ({ id, level: "very", kind: "Jam", label: "Queuing traffic", name: `Road ${id}`, road: null, from: null, to: null,
  delayMin, delayS: delayMin * 60, lengthM: 900, magnitude: 3, path: [[13, 80.25]], lat: 13, lon: 80.25, ward: null, zone, zoneName, owner,
  repeat: { n: 0, open: 0, reports: [], news: [], cats: [] }, action: true, why: "", score: 0 });
const TRAFFIC = {
  enabled: true, at: "2026-11-21T06:30:00.000Z", why: null, source: "TomTom",
  counts: { total: 2, jams: 2, very: 2, congested: 0, slow: 0, closed: 0, flooded: 0, accidents: 0, works: 0, action: 2, clusters: 1 },
  spots: [spot("adyar-10", 10, 13, "Adyar"), spot("teyn-30", 30, 9, "Teynampet")],
  clusters: [{ id: "tc-teyn", name: "Cathedral Road", zone: 9, zoneName: "Teynampet", ward: null, lat: 13.05, lon: 80.25, spots: ["teyn-30"], level: "very", delayMin: 30,
    reports: [{ id: "INC-1" }, { id: "INC-2" }], news: [], open: 1, owner, why: "2 reports in 30 days" }],
  zones: [{ zone: 9, name: "Teynampet", jams: 1, very: 1, delayMin: 30 }, { zone: 13, name: "Adyar", jams: 1, very: 1, delayMin: 10 }], window: { from: "", to: "" }
};
vi.mock("./traffic", async () => {
  const pick = await import("./pick");
  return { LEVEL_WORD: pick.LEVEL_WORD, trafficNow: async () => TRAFFIC, trafficSay: () => ({ en: "Live traffic in a zone.", ta: "x" }) };
});
vi.mock("@/lib/rehearsal/engine", () => ({ rehearsalState: async () => null, pastRains: async () => null }));
vi.mock("@/lib/rehearsal/impacts", () => ({ impacts: async () => ({ rains: [], items: [] }) }));

const { cityNow } = await import("./now");

beforeEach(() => { globalThis.__diqCityNow = undefined; globalThis.__diqCityRun = undefined; });

describe("v14 routing 0: one zone's worst jam and trouble spot", () => {
  it("the worst jam in Adyar is Adyar's, said and opened; the district's is Teynampet's", async () => {
    const a = await cityNow("traffic", { zone: 13, focus: "worst-jam" });
    expect(a.focus).toMatchObject({ kind: "spot", id: "adyar-10" });
    expect(a.say.en).toMatch(/^Road adyar-10 \(Adyar\) is the most congested now/);
    expect(a.view).toEqual({ kind: "traffic", spot: "adyar-10" });
    const all = await cityNow("traffic", { focus: "worst-jam" });
    expect(all.focus).toMatchObject({ id: "teyn-30" });
  });
  it("no trouble spot in the zone: said for that zone, never another zone's", async () => {
    const a = await cityNow("traffic", { zone: 13, focus: "repeat" });
    expect(a.focus).toBeNull();
    expect(a.say.en).toBe("No live jam in Adyar stands where reports keep coming back right now.");
    const b = await cityNow("traffic", { zone: 1, focus: "worst-jam" });
    expect(b.say.en).toBe("No road in Thiruvottiyur is congested right now.");
  });
});

describe("v14 routing 5: a zone's rows are its own", () => {
  it("the stretches listed (and mapped) are the zone's", async () => {
    const a = await cityNow("traffic", { zone: 13 });
    expect(a.rows.map((r) => r.spot)).toEqual(["adyar-10"]);
    const all = await cityNow("traffic", {});
    expect(all.rows.map((r) => r.spot).sort()).toEqual(["adyar-10", "teyn-30"]);
  });
});
