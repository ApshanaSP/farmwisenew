import { describe, expect, it } from "vitest";
import { clusterLine, lengthTile, lengthWords, NO_JAM, spotLine, spotNear, topRepeat, worstJam } from "./pick";
import type { TrafficCluster, TrafficNow, TrafficSpot } from "./traffic";

const owner = { dept: "POL-GCP", name: "Greater Chennai Traffic Police", ta: "சென்னை போக்குவரத்துக் காவல்", why: "A jam." };
const spot = (id: string, level: TrafficSpot["level"], delayMin: number | null, lengthM: number | null, x: Partial<TrafficSpot> = {}): TrafficSpot => ({
  id, level, kind: "Jam", label: "Queuing traffic", name: `Road ${id}`, road: `Road ${id}`, from: null, to: null, delayMin, delayS: delayMin == null ? null : delayMin * 60, lengthM,
  magnitude: 3, path: [[13.05, 80.25], [13.06, 80.26]], lat: 13.05, lon: 80.25, ward: null, zone: 9, zoneName: "Teynampet", owner,
  repeat: { n: 0, open: 0, reports: [], news: [], cats: [] }, action: true, why: "", score: 0, ...x
});

describe("worstJam: the most congested stretch", () => {
  // v12 (21 Nov): an accident with no delay and water on a road rank first in trafficSay and in spots[]; neither is congestion
  const t = { spots: [spot("acc", "accident", 0, 100), spot("wet", "flood", 30, 900), spot("v12", "very", 12, 800), spot("c20", "congested", 20, 2000), spot("v12long", "very", 12, 1400)] };
  it("ranks very over congested whatever the delay, then the delay, then the length; never an accident or water", () => {
    expect(worstJam(t)?.id).toBe("v12long");
    expect(worstJam({ spots: [spot("c20", "congested", 20, 100), spot("s", "slow", 40, 100)] })?.id).toBe("c20");
    expect(worstJam({ spots: [spot("acc", "accident", 0, 100), spot("x", "closed", null, 300)] })).toBeNull();
    expect(worstJam(null)).toBeNull();
  });
  it("finds the same spot again, or the nearest jam when TomTom gave it a new id", () => {
    expect(spotNear(t, "c20", null)?.id).toBe("c20");
    expect(spotNear({ spots: [spot("far", "very", 5, 100, { lat: 13.2, lon: 80.3 }), spot("near", "very", 5, 100, { lat: 13.0505, lon: 80.2505 })] }, "gone", { lat: 13.05, lon: 80.25 })?.id).toBe("near");
    expect(spotNear({ spots: [spot("far", "very", 5, 100, { lat: 13.2, lon: 80.3 })] }, "gone", { lat: 13.05, lon: 80.25 })).toBeNull();
  });
});

describe("spotLine and clusterLine: code's own words, every figure the spot's", () => {
  it("says the name, the level, the delay and the length, and who answers for it", () => {
    const s = spot("a", "very", 12, 1400, { name: "Anna Salai: Gemini → Thousand Lights", repeat: { n: 4, open: 2, reports: [], news: [], cats: [] } });
    expect(spotLine(s)).toBe("Anna Salai: Gemini → Thousand Lights (Teynampet) is the most congested now: very congested, about 12 min delay over 1.4 km. 4 reports near it in the last month, 2 still open. Greater Chennai Traffic Police answers for it; its card has Send.");
    expect(spotLine(s, "ta")).toMatch(/சுமார் 12 நிமிட தாமதம், 1\.4 கி\.மீ/);
    expect(spotLine(spot("b", "congested", null, null))).toBe("Road b (Teynampet) is the most congested now: congested. Greater Chennai Traffic Police answers for it; its card has Send.");
  });
  it("tells a trouble spot by its reports", () => {
    const c: TrafficCluster = { id: "tc-1", name: "Poonamallee High Road", zone: 8, zoneName: "Anna Nagar", ward: null, lat: 13.08, lon: 80.21, spots: ["a"], level: "very", delayMin: 9,
      reports: [{ id: "INC-1", title: "x", cat: "TRAFFIC_OBSTRUCTION", catLabel: "Traffic", at: "2026-11-01", open: true, dept: "POL-GCP", m: 50 }, { id: "INC-2", title: "y", cat: "TRAFFIC_OBSTRUCTION", catLabel: "Traffic", at: "2026-11-02", open: false, dept: "POL-GCP", m: 80 }],
      news: [], open: 1, owner, why: "" };
    expect(clusterLine(c)).toBe("Poonamallee High Road (Anna Nagar) keeps coming back: 2 reports near it in the last month, 1 still open; very congested again now, about 9 min delay. Greater Chennai Traffic Police answers for it; its card sends it as one case.");
    expect(topRepeat({ clusters: [c] })?.id).toBe("tc-1");
    expect(topRepeat({ clusters: [] } as Pick<TrafficNow, "clusters">)).toBeNull();
  });
  it("puts a length as said and as the tile shows it, the same figure", () => {
    expect(lengthWords(1400)).toBe("1.4 km");
    expect(lengthWords(300, "ta")).toBe("300 மீ");
    expect(lengthTile(1400)).toEqual({ value: 1.4, unit: "km" });
    expect(lengthTile(300)).toEqual({ value: 300, unit: "m" });
    expect(lengthWords(null)).toBeNull();
    expect(NO_JAM.en).toMatch(/No road/);
  });
});
