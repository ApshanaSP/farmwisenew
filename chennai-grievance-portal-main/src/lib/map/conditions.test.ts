import { describe, expect, it } from "vitest";
import { conditionsNear, familiesOf, spreadOf } from "./conditions";
import { fixtureWorld } from "./fixture";
import type { CondPlace, World } from "./types";

const base = fixtureWorld();
const place = (id: string, kind: CondPlace["kind"], lat: number, lon: number, m: CondPlace["m"], at = base.now): CondPlace => ({ id, kind, name: id, lat, lon, at, source: "test", m });
const r = (v: number, extra: Partial<CondPlace["m"][string]> = {}) => ({ v, unit: "", z: null, anomaly: false, detail: null, full: null, ...extra });
const world: World = {
  ...base,
  conds: {
    places: [
      place("Station A", "rain", 13.0, 80.21, { rainfall_24h_mm: r(72) }),
      place("Station B", "rain", 13.2, 80.3, { rainfall_24h_mm: r(0) }),
      place("Lake One", "lake", 13.01, 80.22, { lake_pct_full: r(97, { full: 2 }) }),
      place("Lake Far", "lake", 13.3, 80.0, { lake_pct_full: r(99) }),
      place("Lake Low", "lake", 13.0, 80.215, { lake_pct_full: r(40) }),
      place("GH", "hospital", 13.0, 80.22, { bed_occupancy_pct: r(94), emergency_cases: r(200, { z: 2.5 }) }),
      place("AQ", "air", 13.0, 80.21, { aqi: r(160) }),
      place("District", "weather", 13.05, 80.25, { imd_warning_level: r(2, { detail: "Heavy rain likely" }) })
    ],
    works: [
      { id: "W1", title: "Desilting of a canal", type: "desilting", asset: null, lat: 13.005, lon: 80.215, status: "in_progress", progress: 20, gap: -25, target: null, office: null },
      { id: "W2", title: "Hospital block", type: "building_construction", asset: null, lat: 13.005, lon: 80.215, status: "in_progress", progress: 60, gap: 0, target: null, office: null }
    ]
  }
};
const here = { center: { lat: 13.0, lon: 80.215 }, box: { s: 12.995, n: 13.01, w: 80.21, e: 80.225 }, wide: false };

describe("on the ground now", () => {
  it("flooding: the warning, the nearest rain, the lakes near full here (not far ones), the water works and the late one", () => {
    const c = conditionsNear(world, { fams: new Set(["FLOOD"]), ...here });
    expect(c.map((x) => x.kind)).toEqual(["weather", "rain", "lakes", "works"]);
    expect(c[1].en).toMatch(/^72 mm of rain in 24 h at Station A: heavy/);
    expect(c[2].en).toMatch(/1 lake nearby is over 85 % full: Lake One 97 % \(full in 2 d\)/);
    expect(c[2].en).not.toMatch(/Far|Low/);
    // a building is not a flooding answer's business
    expect(c[3].en).toMatch(/^1 PWD water work under way here; 1 behind schedule/);
  });
  it("health: the nearby hospital's beds; air for pollution; nothing unrelated", () => {
    const h = conditionsNear(world, { fams: new Set(["HEALTH"]), ...here });
    // an orange warning is shown with every answer
    expect(h.map((x) => x.kind)).toEqual(["weather", "hospital"]);
    expect(h[1].en).toMatch(/GH: beds 94 % occupied, 200 emergency cases \(unusually high\)/);
    expect(conditionsNear(world, { fams: new Set(["ENVIRONMENT"]), ...here }).map((x) => x.kind)).toEqual(["weather", "air"]);
    expect(conditionsNear(world, { fams: new Set(["CRIME"]), ...here }).map((x) => x.kind)).toEqual(["weather"]);
  });
  it("no rain says so plainly; an old reading says its date; no feeds, no conditions", () => {
    const dry = { ...world, conds: { places: [place("Station B", "rain", 13.0, 80.21, { rainfall_24h_mm: r(0) }, "2026-10-01 08:30:00")], works: [] } };
    const c = conditionsNear(dry, { fams: new Set(["FLOOD"]), ...here });
    expect(c[0].en).toMatch(/^No rain in the last 24 h at Station B \(reading of 1 Oct\): standing water now points to drains or pipes/);
    expect(conditionsNear(base, { fams: new Set(), ...here })).toEqual([]);
  });
  it("families from the filter; the spread of the answer's places", () => {
    expect([...familiesOf(["FLOOD_WATERLOGGING"], null, base)]).toEqual(["FLOOD"]);
    const s = spreadOf([{ lat: 13.0, lon: 80.2 }, { lat: 13.01, lon: 80.21 }], base.district);
    expect(s.wide).toBe(false);
    expect(spreadOf([], base.district).wide).toBe(true);
  });
});
