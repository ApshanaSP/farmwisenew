import { describe, expect, it } from "vitest";
import { clusterIncidents, type ClusterInput } from "./cluster";

const H = 36e5;
const at = (h: number) => Date.parse("2026-10-01T08:00:00+05:30") + h * H;
// ~111 m per 0.001 degree of latitude
const inc = (id: string, cat: string, h: number, lat: number | null, lon: number | null, text = "", placed = lat != null): ClusterInput =>
  ({ id, cat, t: at(h), lat, lon, placed, text });

describe("clusterIncidents", () => {
  it("groups the same problem reported nearby within three days", () => {
    const g = clusterIncidents([
      inc("A", "SOLID_WASTE", 0, 13.0800, 80.2700),
      inc("B", "SOLID_WASTE", 20, 13.0815, 80.2705), // ~170 m, next day
      inc("C", "SOLID_WASTE", 40, 13.0790, 80.2695)
    ]);
    expect(new Set(g.values())).toEqual(new Set(["A"]));
  });

  it("keeps other problems, far places and later reports apart", () => {
    const g = clusterIncidents([
      inc("A", "SOLID_WASTE", 0, 13.08, 80.27),
      inc("B", "STREETLIGHT_ELECTRICAL", 1, 13.08, 80.27), // another problem, same spot
      inc("C", "SOLID_WASTE", 2, 13.09, 80.27), // ~1.1 km away
      inc("D", "SOLID_WASTE", 100, 13.08, 80.27) // four days later
    ]);
    expect(g.get("B")).toBe("B");
    expect(g.get("C")).toBe("C");
    expect(g.get("D")).toBe("D");
  });

  it("does not let a chain of reports drift away from the first one", () => {
    // each report 250 m from the previous: within the radius of its neighbour, not of the first
    const rows = [0, 1, 2, 3].map((k) => inc(`R${k}`, "ROAD_DAMAGE", k, 13.08 + k * 0.00225, 80.27));
    const g = clusterIncidents(rows);
    expect(g.get("R1")).toBe("R0");
    expect(g.get("R2")).not.toBe("R0");
  });

  it("groups city-level news of one event by its headline, not by the city centre", () => {
    const g = clusterIncidents([
      inc("N1", "MISSING_PERSON", 0, 13.08, 80.27, "Four missing school children found dead in lake near Chennai", false),
      inc("N2", "MISSING_PERSON", 3, 13.08, 80.27, "Four schoolchildren found dead in Chennai lake after going missing", false),
      inc("N3", "MISSING_PERSON", 4, 13.08, 80.27, "Police search for elderly man missing from Tambaram home", false)
    ]);
    expect(g.get("N2")).toBe("N1");
    expect(g.get("N3")).toBe("N3");
  });

  it("puts routine notices of one kind in one group for a week", () => {
    const g = clusterIncidents([
      inc("P1", "STREETLIGHT_ELECTRICAL", 0, null, null, "Chennai power cut: areas without power on Monday"),
      inc("P2", "STREETLIGHT_ELECTRICAL", 50, null, null, "Power shutdown areas in Chennai tomorrow"),
      inc("P3", "STREETLIGHT_ELECTRICAL", 200, null, null, "Power cut in Chennai on Friday: full list")
    ]);
    expect(g.get("P2")).toBe("P1");
    expect(g.get("P3")).toBe("P3"); // over a week after the first
  });

  it("groups the same street in the same zone even when the pins are far apart (the Gandhi Street case)", () => {
    // two dark-spot complaints on Gandhi Street, Royapuram, filed 4.5 h apart with pins ~460 m apart, wards 58 and 59
    const g = clusterIncidents([
      { ...inc("G1", "STREETLIGHT_ELECTRICAL", 0, 13.0823319, 80.2702039), zone: 5, place: "Gandhi Street", reporters: ["r1"], civic: true },
      { ...inc("G2", "STREETLIGHT_ELECTRICAL", 4.5, 13.0825834, 80.2744232), zone: 5, place: "Gandhi Street", reporters: ["r1"], civic: true }
    ]);
    expect(g.get("G2")).toBe("G1");
  });

  it("groups the same person reporting the problem again nearby, under any place name", () => {
    const g = clusterIncidents([
      { ...inc("A", "SOLID_WASTE", 0, 13.08, 80.27), zone: 5, place: "Bypass Road", reporters: ["same"], civic: true },
      { ...inc("B", "SOLID_WASTE", 10, 13.0845, 80.27), zone: 5, place: "Corner of 2nd Lane", reporters: ["same"], civic: true }, // ~500 m
      { ...inc("C", "SOLID_WASTE", 12, 13.0880, 80.27), zone: 5, place: "Market Road", reporters: ["same"], civic: true } // ~890 m: another spot
    ]);
    expect(g.get("B")).toBe("A");
    expect(g.get("C")).toBe("C");
  });

  it("keeps a street name in another zone, or too far along, apart", () => {
    const g = clusterIncidents([
      { ...inc("A", "STREETLIGHT_ELECTRICAL", 0, 13.08, 80.27), zone: 5, place: "Gandhi Street", civic: true },
      { ...inc("B", "STREETLIGHT_ELECTRICAL", 2, 13.0805, 80.2705), zone: 9, place: "Gandhi Street", civic: true }, // another zone's Gandhi Street… but 70 m: one spot
      { ...inc("C", "STREETLIGHT_ELECTRICAL", 3, 13.10, 80.27), zone: 5, place: "Gandhi Street", civic: true } // 2.2 km along
    ]);
    expect(g.get("B")).toBe("A"); // the distance rule still holds
    expect(g.get("C")).toBe("C");
  });

  it("does not join separate police events by an area name", () => {
    const g = clusterIncidents([
      { ...inc("P1", "ROAD_ACCIDENT", 0, 12.98, 80.22), zone: 13, place: "Velachery", civic: false },
      { ...inc("P2", "ROAD_ACCIDENT", 20, 12.9838, 80.22), zone: 13, place: "Velachery", civic: false } // ~420 m
    ]);
    expect(g.get("P2")).toBe("P2");
  });

  it("keeps two different crimes reported near each other apart (the Kolathur case)", () => {
    // a news report about a child-theft complaint against a fertility hospital, and a police report of an OTP fraud
    // 270 m away the same evening: both "theft & fraud", two different events
    const g = clusterIncidents([
      inc("N", "CRIME_PROPERTY", 0, 13.1231, 80.2121, "Chennai police probe child theft complaint against fertility hospital, couple"),
      inc("P", "CRIME_PROPERTY", 12, 13.124426, 80.209832, "A resident of Kolathur lost Rs 1,39,500 after sharing an OTP with a caller posing as a bank official")
    ]);
    expect(g.get("P")).toBe("P");
  });

  it("still joins reports of one crime from different sources near each other", () => {
    const g = clusterIncidents([
      inc("A", "CRIME_VIOLENT", 0, 13.06, 80.24, "Wife held for murder of armed reserve SI in Nungambakkam"),
      inc("B", "CRIME_VIOLENT", 10, 13.0605, 80.2405, "Woman arrested for murder of her husband, an armed reserve SI, in Nungambakkam")
    ]);
    expect(g.get("B")).toBe("A");
  });

  it("keeps two police records of accidents at one landmark apart", () => {
    const g = clusterIncidents([
      { ...inc("R1", "ROAD_ACCIDENT", 0, 13.04, 80.234, "A two-wheeler skidded near T. Nagar Bus Terminus around 9.40 pm; one person was injured"), official: true },
      { ...inc("R2", "ROAD_ACCIDENT", 15, 13.0402, 80.2341, "A two-wheeler skidded near T. Nagar Bus Terminus around 12.40 pm; two persons were injured"), official: true }
    ]);
    expect(g.get("R2")).toBe("R2");
  });

  it("handles thousands of incidents quickly", () => {
    const rows: ClusterInput[] = [];
    for (let k = 0; k < 20_000; k++) rows.push(inc(`I${k}`, `C${k % 30}`, (k % 2000) / 10, 12.9 + ((k * 7919) % 2000) / 10_000, 80.1 + ((k * 104729) % 2000) / 10_000));
    const t0 = Date.now();
    clusterIncidents(rows);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
