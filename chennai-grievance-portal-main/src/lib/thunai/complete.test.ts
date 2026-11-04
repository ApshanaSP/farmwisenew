import { describe, expect, it } from "vitest";
import { completeRows, SOURCES, type Lookups } from "./complete";

const K: Lookups = {
  wardZone: (w) => (w === 170 ? { zone: 13, name: "Adyar" } : null),
  pointWard: (lat) => (lat === 13 ? { ward: 171, zone: 13, zoneName: "Adyar" } : null),
  placeZone: (p) => (p === "Velachery" ? { zone: 13, name: "Adyar" } : null),
  catLead: (c) => (c === "Flooding" ? { code: "GCC-SWD", name: "Storm Water Drains" } : null)
};

describe("complete this data", () => {
  it("fills a zone from the ward, showing the source on the cell", () => {
    const r = completeRows([{ id: "A", ward: 170, place: "X", dept: "D" }], K);
    expect(r.rows[0].cells.zone).toEqual({ v: "Adyar", src: SOURCES.ward, filled: true });
    expect(r.filled).toBe(1);
  });
  it("fills a ward and zone from the point by polygon, a zone from the gazetteer, a department from the category's lead", () => {
    const r = completeRows([{ id: "A", lat: 13, lon: 80, place: "P", dept: "D" }, { id: "B", place: "Velachery", dept: "D", ward: 5 }, { id: "C", zone: 7, place: "Q", cat: "Flooding", ward: 9 }], K);
    expect(r.rows[0].cells.ward).toEqual({ v: 171, src: SOURCES.polygon, filled: true });
    expect(r.rows[0].cells.zone.src).toBe(SOURCES.polygon);
    expect(r.rows[1].cells.zone).toMatchObject({ v: "Adyar", src: SOURCES.gazetteer, filled: true });
    expect(r.rows[2].cells.dept).toMatchObject({ v: "Storm Water Drains", src: SOURCES.lead, filled: true });
  });
  it("never guesses: what cannot be filled stays blank, is counted, and says why; a given value is untouched", () => {
    const r = completeRows([{ id: "Z", title: "No clues", cat: "Unknown" }, { id: "Y", zone: 5, zoneName: "Royapuram", ward: 50, place: "Port", dept: "D", deptName: "Drains" }], K);
    const z = r.rows[0].cells;
    expect(z.zone).toEqual({ v: null, src: null, filled: false });
    expect(z.place).toEqual({ v: null, src: null, filled: false });
    expect(z.dept).toEqual({ v: null, src: null, filled: false });
    expect(r.unresolved).toEqual(["Z"]);
    expect(r.cannot.map((c) => c.col).sort()).toEqual(["department", "place", "ward", "zone"]);
    expect(r.rows[1].cells.zone).toEqual({ v: "Royapuram", src: null, filled: false });
    // every filled value has a source; no cell is filled without one
    for (const row of r.rows) for (const c of Object.values(row.cells)) expect(c.filled ? !!c.src : !c.src).toBe(true);
  });
  it("a place is never worked out from a zone, and a place the gazetteer does not know gives no zone", () => {
    const r = completeRows([{ id: "A", zone: 13, zoneName: "Adyar", dept: "D", ward: 1 }, { id: "B", place: "Nowhere", dept: "D", ward: 77 }], K);
    expect(r.rows[0].cells.place.v).toBeNull();
    expect(r.rows[1].cells.zone.v).toBeNull();
    expect(r.left).toBeGreaterThanOrEqual(2);
  });
});
