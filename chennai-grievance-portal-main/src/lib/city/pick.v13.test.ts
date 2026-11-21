/**
 * v13 (21 Nov review, finding 0 12): the length Jarvis says is the length its tile shows. lengthWords rounded with toFixed and the tile with
 * Math.round, so TomTom's 1150, 1450, 1650 and 2150 m were said "1.1 km" beside a "1.2 km" tile; both now come from lengthTile.
 */
import { describe, expect, it } from "vitest";
import { lengthTile, lengthWords, spotLine } from "./pick";
import type { TrafficSpot } from "./traffic";

describe("lengthWords is the tile's figure", () => {
  it.each([[1150, "1.2 km"], [1450, "1.5 km"], [1650, "1.7 km"], [2150, "2.2 km"], [1000, "1.0 km"], [1400, "1.4 km"], [999.6, "1000 m"], [300, "300 m"]])("%d m", (m, said) => {
    expect(lengthWords(m)).toBe(said);
    const t = lengthTile(m)!;
    expect(Number(said.split(" ")[0])).toBe(t.value);
  });
  it("in Tamil too, and nothing for no length", () => {
    expect(lengthWords(1150, "ta")).toBe("1.2 கி.மீ");
    expect(lengthWords(0)).toBeNull();
    expect(lengthWords(null)).toBeNull();
  });
  it("the spot's line says the tile's length", () => {
    const owner = { dept: "POL-GCP", name: "Greater Chennai Traffic Police", ta: "சென்னை போக்குவரத்துக் காவல்", why: "A jam." };
    const s = { id: "a", level: "very", kind: "Jam", label: "Queuing traffic", name: "Anna Salai", road: "Anna Salai", from: null, to: null, delayMin: 9, delayS: 540, lengthM: 1150,
      magnitude: 3, path: [], lat: 13.05, lon: 80.25, ward: null, zone: 9, zoneName: "Teynampet", owner, repeat: { n: 0, open: 0, reports: [], news: [], cats: [] }, action: true, why: "", score: 0 } as unknown as TrafficSpot;
    expect(spotLine(s)).toContain("over 1.2 km.");
  });
});
