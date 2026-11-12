/**
 * QA pass 6, P6-012 (redsec2-09, reviewer2-01): Ask the Map turns a map context or a plan's place "inc:<id>" into a place with the incident's
 * title and coordinates. For a department officer it did so for any department's incident, so officerB (GCC-ELE) read the title and location
 * of officerA's (GCC-SWM) incident by putting its id in the map context. placeLookup now takes the officer's department.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { placeLookup } from "@/lib/map/ask";
import type { World } from "@/lib/map/types";

const w = { incidents: [
  { id: "INC-SWM-1", dept: "GCC-SWM", title: "Garbage heap at the market gate", pinnable: true, lat: 13.05, lon: 80.25 },
  { id: "INC-ELE-1", dept: "GCC-ELE", title: "Street light pole down", pinnable: true, lat: 13.06, lon: 80.26 }
], points: {} } as unknown as World;
const data = { entries: [] } as never;

describe("QA pass 6, P6-012: Ask the Map keeps an officer to the officer's own department's incidents", () => {
  it("an officer of GCC-ELE gets no place for a GCC-SWM incident id", () => {
    expect(placeLookup(w, data, "GCC-ELE")("inc:INC-SWM-1")).toBeNull();
  });
  it("but does for the department's own incident", () => {
    expect(placeLookup(w, data, "GCC-ELE")("inc:INC-ELE-1")).toMatchObject({ lat: 13.06, lon: 80.26 });
  });
  it("the Collector (no lock) gets any incident", () => {
    expect(placeLookup(w, data, null)("inc:INC-SWM-1")).toMatchObject({ lat: 13.05 });
  });
  it("every caller passes the officer's lock (no placeLookup(w, data) without it)", () => {
    const src = ["src/lib/map/ask.ts", "src/lib/map/suggest.ts"].map((f) => fs.readFileSync(path.join(process.cwd(), f), "utf8")).join("\n");
    const calls = [...src.matchAll(/placeLookup\(([^)]*)\)/g)].map((m) => m[1]).filter((a) => !/^w: World/.test(a));
    expect(calls.length).toBeGreaterThan(0);
    for (const a of calls) expect(a.split(",").length, `placeLookup(${a})`).toBe(3);
  });
});
