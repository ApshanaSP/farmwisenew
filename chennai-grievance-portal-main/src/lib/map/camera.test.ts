import { describe, expect, it } from "vitest";
import { MAX_ZOOM_AREA, MAX_ZOOM_POINT, cameraFor, flightMs, followUpMoves, type CameraInput, type Viewport } from "./camera";

const district = { s: 12.85, w: 80.14, n: 13.24, e: 80.33 };
const v: Viewport = { width: 940, height: 594, padTopLeft: [400, 20], padBottomRight: [60, 40], reducedMotion: false, from: { lat: 13.05, lon: 80.23 } };
const base: CameraInput = { shape: "district", areas: [], points: [], line: null, focus: null, tour: [], district };
const box = (s: number, w: number, n: number, e: number) => ({ s, w, n, e });

describe("cameraFor: one shot per question shape", () => {
  it("an area: flies to its bounds, masks the rest, never under the panel", () => {
    const [s] = cameraFor({ ...base, shape: "area", areas: [{ id: "zone:13", box: box(12.98, 80.22, 13.03, 80.28), label: "Adyar", label_ta: "அடையாறு" }] }, v);
    expect(s).toMatchObject({ kind: "bounds", id: "zone:13", mask: true, maxZoom: MAX_ZOOM_AREA, padTopLeft: [400, 20], padBottomRight: [60, 40], animate: true });
  });
  it("district-wide: frames the middle 90 % of the results and counts the rest", () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({ lat: 13.04 + (i % 6) * 0.002, lon: 80.24 + (i % 4) * 0.002 }));
    const [s] = cameraFor({ ...base, points: [...pts, { lat: 13.23, lon: 80.32 }] }, v);
    expect(s.kind).toBe("bounds");
    expect(s.box!.n).toBeLessThan(13.06);
    expect(s.outside).toBe(1);
  });
  it("one result or a nearest answer's origin: a point at zoom 16, max 17", () => {
    const [s] = cameraFor({ ...base, points: [{ lat: 13.04, lon: 80.25 }] }, v);
    expect(s).toMatchObject({ kind: "point", zoom: MAX_ZOOM_POINT - 1, maxZoom: MAX_ZOOM_POINT });
  });
  it("nearest from a place frames the place and the facilities found", () => {
    const [s] = cameraFor({ ...base, shape: "nearest", focus: { id: "loc:Marina", lat: 13.05, lon: 80.28, label: "Marina", label_ta: "மெரினா" }, points: [{ lat: 13.06, lon: 80.27 }, { lat: 13.03, lon: 80.26 }] }, v);
    expect(s.kind).toBe("bounds");
    expect(s.box!.s).toBeLessThanOrEqual(13.03);
    expect(s.box!.n).toBeGreaterThanOrEqual(13.06);
  });
  it("along a road: frames the line, then 'Follow the road' plays the path in 6 s", () => {
    const path: [number, number][] = [[13.0, 80.21], [13.05, 80.25], [13.08, 80.27]];
    const shots = cameraFor({ ...base, shape: "along", line: { id: "road:anna-salai", box: box(13.0, 80.21, 13.08, 80.27), path } }, v);
    expect(shots.map((s) => s.kind)).toEqual(["bounds", "path"]);
    expect(shots[1]).toMatchObject({ duration_ms: 6000, path });
  });
  it("compare: frames both areas at once", () => {
    const [s] = cameraFor({ ...base, shape: "compare", areas: [{ id: "a", box: box(13.0, 80.2, 13.02, 80.22), label: "A", label_ta: "A" }, { id: "b", box: box(13.1, 80.25, 13.12, 80.27), label: "B", label_ta: "B" }] }, v);
    expect(s.box).toEqual({ s: 13.0, w: 80.2, n: 13.12, e: 80.27 });
  });
  it("change: frames the area and stays still for the Before · Now toggle", () => {
    const shots = cameraFor({ ...base, shape: "change", areas: [{ id: "zone:13", box: box(12.98, 80.22, 13.03, 80.28), label: "Adyar", label_ta: "அடையாறு" }] }, v);
    expect(shots).toHaveLength(1);
    expect(shots[0].mask).toBe(true);
  });
  it("hotspots: frames the top ones, then a tour of the top 3 (3 s each)", () => {
    const tour = [1, 2, 3, 4].map((i) => ({ id: `c${i}`, lat: 13 + i / 100, lon: 80.2 + i / 100, caption_en: `#${i}`, caption_ta: `#${i}` }));
    const shots = cameraFor({ ...base, shape: "hotspot", tour }, v);
    expect(shots.map((s) => s.kind)).toEqual(["bounds", "point", "point", "point"]);
    expect(shots.slice(2).every((s) => s.duration_ms === 3000)).toBe(true);
  });
  it("farthest: the ward and its far point with the facility", () => {
    const [s] = cameraFor({ ...base, shape: "farthest", areas: [{ id: "ward:24", box: box(13.1, 80.2, 13.12, 80.22), label: "Ward 24", label_ta: "வார்டு 24" }],
      focus: { id: "24", lat: 13.11, lon: 80.21, label: "Ward 24", label_ta: "வார்டு 24", to: { lat: 13.13, lon: 80.23, label: "H" } } }, v);
    expect(s.box!.n).toBeGreaterThanOrEqual(13.13);
  });
  it("an empty answer flies to the nearest miss", () => {
    const [s] = cameraFor({ ...base, shape: "empty", focus: { id: "I01", lat: 13.0, lon: 80.2, label: "closest", label_ta: "" } }, v);
    expect(s).toMatchObject({ kind: "point", id: "I01" });
  });
  it("never wider than the district", () => {
    const [s] = cameraFor({ ...base, areas: [{ id: "x", box: box(12.0, 79.0, 14.0, 81.0), label: "", label_ta: "" }], shape: "area" }, v);
    expect(s.box).toEqual(district);
  });
});

describe("motion", () => {
  it("reduced motion: the same final view, no flight", () => {
    const input: CameraInput = { ...base, shape: "area", areas: [{ id: "zone:13", box: box(12.98, 80.22, 13.03, 80.28), label: "", label_ta: "" }] };
    const a = cameraFor(input, v)[0], b = cameraFor(input, { ...v, reducedMotion: true })[0];
    expect(b.box).toEqual(a.box);
    expect(b).toMatchObject({ animate: false, duration_ms: 0 });
  });
  it("flight time 0.6–1.6 s, scaled by distance", () => {
    expect(flightMs({ lat: 13.05, lon: 80.25 }, { lat: 13.051, lon: 80.25 })).toBeLessThan(620);
    expect(flightMs({ lat: 13.05, lon: 80.25 }, { lat: 13.05, lon: 80.25 })).toBe(600);
    expect(flightMs({ lat: 12.85, lon: 80.14 }, { lat: 13.24, lon: 80.33 })).toBe(1600);
  });
  it("small follow-ups keep the view; a comparison or a new place moves it", () => {
    for (const e of ["distance", "severity", "period", "status"]) expect(followUpMoves(e)).toBe(false);
    for (const e of ["compare", null, "chip"]) expect(followUpMoves(e)).toBe(true);
  });
});
