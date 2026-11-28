/**
 * The official-places check behind Ask the Map's facility layers (scripts/lib/official-places.mjs, 28 Nov 2026): the name rules, the
 * matching against an official list, and the rail and metro stations against the timetables and the reported openings. Small fixtures only.
 */
import { describe, expect, it } from "vitest";
import * as lib from "../../../scripts/lib/official-places.mjs";

// a plain ES module of the layer build (scripts/), typed loosely here
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const op = lib as any;

type Feat = { type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] }; properties: Record<string, unknown> };
const feat = (id: string, name: string | null, lon: number, lat: number, extra: Record<string, unknown> = {}): Feat =>
  ({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { id, name, kind: "college", ward: 1, in_district: true, ...extra } });

describe("names", () => {
  it("one name in its spellings is one name; two names that only share consonants are not", () => {
    expect(op.nameScore("Meenakshi Sunderarajan College of Engineering", "Meenakshi Sundararajan Engineering College")).toBeGreaterThan(0.8);
    expect(op.nameScore("Washermanpet Fire & Rescue Station", "Washermempet Fire Station")).toBeGreaterThan(0.8);
    expect(op.nameScore("SIVET College", "Saveetha Engineering College")).toBeLessThan(0.62);
    // generic words alone never decide which school it is
    expect(op.nameScore("Government Higher Secondary School", "GHSS VELACHERY")).toBeLessThanOrEqual(0.4);
    expect(op.nameScore("Government Higher Secondary School Velachery", "GHSS VELACHERY")).toBeGreaterThan(0.9);
  });
  it("a different kind or subject of institution is a different place", () => {
    expect(op.conflict("Madha Medical College", "Madha Engineering College")).toBe(true);
    expect(op.conflict("Madras Medical College", "Madras University")).toBe(true);
    expect(op.conflict("Anna Institute of Management", "Anna University")).toBe(true);
    expect(op.conflict("Chennai Girls Higher Secondary School", "CHSS BOYS SAIDAPET")).toBe(true);
    expect(op.conflict("Chennai High School", "GOVT GIRLS HR SEC SCHOOL ASHOK NAGAR")).toBe(true);
    expect(op.conflict("Loyola College", "Loyola College of Education")).toBe(false);
  });
});

describe("rules", () => {
  it("drops coaching and exam centres, training institutes, campus buildings and research institutes from colleges", () => {
    for (const n of ["R Square Academy for Tnpsc, Tnusrb SI, Bank Exam Coaching Centre", "NIIT", "Department of Aeronautical Engineering", "Rajam Lecture Hall Complex",
      "Government Industrial Training Institute Perumbakkam", "The Institute of Mathematical Sciences", "Central Leather Research Institute", "Hangar 1"]) {
      expect(op.ruleVerdict("colleges", n).v, n).toBe("drop");
    }
    expect(op.ruleVerdict("colleges", "Presidency College").v).toBe("keep");
    expect(op.ruleVerdict("colleges", "Loyola Institute of Business Administration").v).toBe("unsure");
  });
  it("schools keep schools (also 'Junior College' schools) and drop pre-schools and colleges mapped as schools", () => {
    expect(op.ruleVerdict("schools", "Kidzee School").v).toBe("drop");
    expect(op.ruleVerdict("schools", "KCG College of Technology").why).toBe("a college or university, not a school");
    expect(op.ruleVerdict("schools", "S.B.O.A School and Junior College").v).toBe("keep");
    expect(op.ruleVerdict("schools", "Santhome HSS").v).toBe("keep");
  });
  it("hospitals: a shop or lab goes unless its name says it treats people; a vet clinic always goes", () => {
    expect(op.ruleVerdict("hospitals", "Aarthi Scans").v).toBe("drop");
    expect(op.ruleVerdict("hospitals", "Kidney Hospital and Diagnostic Centre").v).toBe("keep");
    expect(op.ruleVerdict("hospitals", "Apollo Clinic & Pharmacy").v).toBe("keep");
    expect(op.ruleVerdict("hospitals", "Police Hospital").v).toBe("keep");
    expect(op.ruleVerdict("hospitals", "Madras Medical Mission").v).toBe("keep");
    expect(op.ruleVerdict("hospitals", "Government Veterinary Hospital").v).toBe("drop");
  });
});

describe("matching a layer to an official list", () => {
  const list = { source: { id: "t" }, entries: [
    { id: "a", src: "t", name: "Loyola College", district: "Chennai" }, { id: "b", src: "t", name: "Loyola College of Education", district: "Chennai" },
    { id: "c", src: "t", name: "Apollo Hospitals" }, { id: "d", src: "t", name: "GHSS KOLATHUR", district: "Kancheepuram" }
  ] };
  it("takes the one best match, tags it, and never takes a tie, a far-apart chain name, or a village of the same name in another district", () => {
    const feats = [
      feat("1", "Loyola College", 80.24, 13.06), feat("2", "R Square Coaching Centre", 80.2, 13.0),
      feat("3", "Apollo Hospitals", 80.25, 13.06, { kind: "hospital" }), feat("4", "Apollo Hospitals", 80.2, 12.95, { kind: "hospital" }),
      feat("5", "Government Higher Secondary School Kolathur", 80.21, 13.12, { kind: "school" })
    ];
    const r = op.filterLayer("colleges", feats.slice(0, 2), list);
    expect(r.kept.map((f: Feat) => f.properties.id)).toEqual(["1"]);
    expect(r.kept[0].properties.official).toEqual({ src: "t", id: "a", name: "Loyola College" });
    expect(r.dropped[0].properties.dropped).toBe("coaching or exam preparation");
    const h = op.filterLayer("hospitals", feats.slice(2, 4), list);
    expect(h.kept.every((f: Feat) => !f.properties.official)).toBe(true);
    const s = op.filterLayer("schools", [feats[4]], list, new Map(), [], { strict: true });
    expect(s.kept[0].properties.official).toBeUndefined();
    // the list's places with no map point here: those it puts in Chennai district or in none (the Kancheepuram school is not Chennai's)
    expect(s.unmapped).toEqual(["Loyola College", "Loyola College of Education", "Apollo Hospitals"]);
  });
  it("leaves a doubtful name out until the AI has judged it, then follows the verdict", () => {
    const f = [feat("9", "Quadrangle Learning", 80.2, 13.0), feat("10", "Kalakshetra Foundation", 80.26, 13.0)];
    const before = op.filterLayer("colleges", f, null);
    expect(before.unjudged.map((x: Feat) => x.properties.id)).toEqual(["10"]);
    const after = op.filterLayer("colleges", f, null, new Map([["colleges|10", { v: "keep", why: "AI: a college" }]]));
    expect(after.kept.map((x: Feat) => [x.properties.id, x.properties.verified, x.properties.verified_by])).toEqual([["10", "name", "ai"]]);
  });
});

describe("rail and metro", () => {
  const gtfs = { stations: [{ id: "cmrl:1", name: "Vadapalani", kind: "metro", lat: 13.05, lon: 80.212, lines: ["Green Line"] },
    { id: "sr:1", name: "Chennai Central Suburban", kind: "suburban", lat: 13.0831, lon: 80.2741, lines: ["West"] }] };
  const osm = [
    feat("o1", "Vadapalani", 80.2121, 13.0501, { kind: "metro" }), feat("o2", "Porur Junction", 80.1567, 13.0359, { kind: "metro" }),
    feat("o3", "Boat Club Metro", 80.2477, 13.0293, { kind: "metro" }), feat("o4", "Puratchi Thalaivar Dr. M. G. Ramachandran Central", 80.276, 13.0824, { kind: "rail" }),
    feat("o5", "Koyambedu Bus Terminus", 80.19, 13.07, { kind: "bus" }), feat("o6", "Adambakkam", 80.197, 12.982, { kind: "rail" })
  ];
  it("keeps the timetables' stations, the reported openings and the long-distance terminal; drops what is being built, bus stands and no-halt stops", () => {
    const r = op.railMetro(gtfs, osm, () => 1, { stations: [{ name: "Porur Junction", kind: "metro", src: "cmrl-c4-2026" }], no_halt: [{ name: "Adambakkam", kind: "rail", src: "sr" }] });
    const kept = Object.fromEntries(r.kept.map((f: Feat) => [f.properties.name, f.properties.verified]));
    expect(kept).toEqual({ Vadapalani: "official", "Chennai Central Suburban": "official", "Porur Junction": "reported", "Puratchi Thalaivar Dr. M. G. Ramachandran Central": "name" });
    const why = Object.fromEntries(r.dropped.map((f: Feat) => [f.properties.name, f.properties.dropped]));
    expect(why["Boat Club Metro"]).toMatch(/not yet open/);
    expect(why["Koyambedu Bus Terminus"]).toMatch(/bus station/);
    expect(why.Adambakkam).toMatch(/do not stop/);
  });
});
