import { describe, expect, it } from "vitest";
import {
  BASE_KEY, GIVE_UP_AFTER_MS, LAST_ZOOM, MAX_SHARP_MAPS, STYLE_URL, baseAsked, englishNames, forChennai, giveUpIn, imageryOptions, labelsOnly, namesFrom, planBasemap, prepareStyle, readBaseChoice,
  saveBaseChoice, sharpRoom, styleSource, type PlanIn, type StyleDoc
} from "./basemapPlan";

const base: PlanIn = { kind: "map", theme: "light", webgl: true, failed: false, room: true, labels: false, quiet: false };

describe("which base map is drawn", () => {
  it("draws the sharp street map by default, light or night with the theme", () => {
    expect(planBasemap(base)).toEqual({ imagery: false, vector: "liberty", street: false, rasterLabels: false, tone: "light" });
    expect(planBasemap({ ...base, theme: "dark" })).toMatchObject({ vector: "dark", street: false, tone: "dark" });
  });
  it("uses the quiet grey map for maps of figures, but the night map at night", () => {
    expect(planBasemap({ ...base, quiet: true }).vector).toBe("positron");
    expect(planBasemap({ ...base, quiet: true, theme: "dark" }).vector).toBe("dark");
  });
  it("falls back to the raster street map without WebGL, after a failure, or with no slot free", () => {
    for (const p of [{ webgl: false }, { failed: true }, { room: false }]) {
      expect(planBasemap({ ...base, ...p })).toEqual({ imagery: false, vector: null, street: true, rasterLabels: false, tone: "light" });
    }
  });
  it("puts sharp names over the imagery when it can, and Esri's raster names when it cannot", () => {
    expect(planBasemap({ ...base, kind: "satellite", labels: true })).toEqual({ imagery: true, vector: "labels", street: false, rasterLabels: false, tone: "dark" });
    expect(planBasemap({ ...base, kind: "satellite", labels: true, webgl: false })).toMatchObject({ vector: null, rasterLabels: true, street: false });
    expect(planBasemap({ ...base, kind: "satellite" })).toMatchObject({ imagery: true, vector: null, rasterLabels: false });
  });
  it("keeps a slot for a map that holds one, and refuses new ones at the limit", () => {
    expect(sharpRoom(MAX_SHARP_MAPS - 1, false)).toBe(true);
    expect(sharpRoom(MAX_SHARP_MAPS, false)).toBe(false);
    expect(sharpRoom(MAX_SHARP_MAPS, true)).toBe(true);
  });
});

describe("giving the sharp map up", () => {
  it("counts only time on screen", () => {
    // started 20 s ago, on screen throughout: give up now
    expect(giveUpIn(100_000, 80_000, 0, false)).toBe(0);
    // in a background tab: wait a full period again
    expect(giveUpIn(100_000, 80_000, 0, true)).toBe(GIVE_UP_AFTER_MS);
    // back on screen 5 s ago after a long time hidden: 10 s more
    expect(giveUpIn(100_000, 20_000, 95_000, false)).toBe(GIVE_UP_AFTER_MS - 5_000);
  });
});

describe("satellite tiles on high-resolution screens", () => {
  it("asks for the next zoom's tiles, never past Esri's zoom 19", () => {
    const r = imageryOptions(true);
    expect(r.detectRetina).toBe(true);
    // Leaflet adds one to the zoom asked for (and takes one off maxZoom)
    expect(r.maxNativeZoom + 1).toBe(19);
    expect(r.maxZoom - 1).toBeGreaterThanOrEqual(19);
    expect(imageryOptions(false)).toEqual({ detectRetina: false, maxNativeZoom: 19, maxZoom: 20 });
  });
  it("stops at the same closest zoom a map without its own limit is given", () => {
    // Leaflet takes one off a retina layer's maxZoom
    expect(imageryOptions(true).maxZoom - 1).toBe(LAST_ZOOM);
    expect(imageryOptions(false).maxZoom).toBe(LAST_ZOOM);
  });
});

describe("Ask the Map's Satellite / Streets value", () => {
  const sat = { base: "sat", forced: false }, streets = { base: "streets", forced: false };
  it("takes a change as the Collector's choice, but not the first value", () => {
    expect(baseAsked(null, sat)).toBeNull();
    expect(baseAsked(sat, streets)).toBe("map");
    expect(baseAsked(streets, sat)).toBe("satellite");
    expect(baseAsked(sat, sat)).toBeNull();
    expect(baseAsked(sat, { base: undefined, forced: false })).toBeNull();
  });
  it("ignores Rain & flooding opening and closing (its street map is forced, before its layer arrives too)", () => {
    const opened = { base: "streets", forced: true };
    expect(baseAsked(sat, opened)).toBeNull();
    // closing hands back "sat": the Collector's Map choice stays
    expect(baseAsked(opened, sat)).toBeNull();
  });
});

describe("the remembered choice", () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };
  it("reads back what was saved, and nothing else", () => {
    const s = mem();
    expect(readBaseChoice(s)).toBeNull();
    saveBaseChoice("satellite", s);
    expect(s.m.get(BASE_KEY)).toBe("satellite");
    expect(readBaseChoice(s)).toBe("satellite");
    s.m.set(BASE_KEY, "sat");
    expect(readBaseChoice(s)).toBeNull();
  });
  it("survives storage that throws (private windows, blocked site data)", () => {
    const bad = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(readBaseChoice(bad)).toBeNull();
    expect(() => saveBaseChoice("map", bad)).not.toThrow();
    expect(readBaseChoice(null)).toBeNull();
  });
});

const bilingual = ["case", ["has", "name:nonlatin"], ["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]], ["coalesce", ["get", "name_en"], ["get", "name"]]];
const style = (): StyleDoc => ({
  version: 8,
  sources: { openmaptiles: { type: "vector" }, ne2_shaded: { type: "raster" } },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#f8f4f0" } },
    { id: "natural_earth", type: "raster", source: "ne2_shaded", maxzoom: 7 },
    { id: "road_minor", type: "line", source: "openmaptiles" },
    { id: "label_city", type: "symbol", source: "openmaptiles", minzoom: 3, layout: { "text-field": bilingual }, paint: { "text-color": "#000" } },
    { id: "label_state", type: "symbol", source: "openmaptiles", minzoom: 5, maxzoom: 8, layout: { "text-field": bilingual } },
    { id: "poi_r1", type: "symbol", source: "openmaptiles", minzoom: 15, layout: { "text-field": bilingual } },
    { id: "highway-shield-non-us", type: "symbol", source: "openmaptiles", minzoom: 8, layout: { "text-field": ["to-string", ["get", "ref"]] } }
  ]
});

describe("the style changes", () => {
  it("writes every name in English only, and leaves road numbers alone", () => {
    const s = englishNames(style());
    const city = s.layers.find((l) => l.id === "label_city")!;
    expect(JSON.stringify(city.layout!["text-field"])).not.toContain("nonlatin");
    expect(city.layout!["text-field"]).toEqual(["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]]);
    expect(s.layers.find((l) => l.id === "highway-shield-non-us")!.layout!["text-field"]).toEqual(["to-string", ["get", "ref"]]);
  });
  it("holds names back until the Leaflet zoom asked for (MapLibre's zoom is one less)", () => {
    const s = namesFrom(style(), 13);
    expect(s.layers.find((l) => l.id === "label_city")!.minzoom).toBe(12);
    expect(s.layers.find((l) => l.id === "poi_r1")!.minzoom).toBe(15);
    // a name layer that ends before then would never show: dropped
    expect(s.layers.some((l) => l.id === "label_state")).toBe(false);
    // lines and areas are untouched
    expect(s.layers.find((l) => l.id === "road_minor")!.minzoom).toBeUndefined();
    expect(namesFrom(style(), 0)).toEqual(style());
  });
  it("keeps names alone over the imagery: white, no background, no shop icons, only the sources still used", () => {
    const s = labelsOnly(style());
    expect(s.layers.map((l) => l.id)).toEqual(["label_city", "label_state", "highway-shield-non-us"]);
    expect(s.layers[0].paint!["text-color"]).toBe("#FFFFFF");
    expect(Object.keys(s.sources)).toEqual(["openmaptiles"]);
  });
  it("drops United States shields and keeps a road without a number from warning, with the same result", () => {
    const s = style();
    s.layers.push({ id: "road_shield_us", type: "symbol", source: "openmaptiles" });
    s.layers.find((l) => l.id === "highway-shield-non-us")!.filter = ["all", ["<=", ["get", "ref_length"], 6]];
    const out = forChennai(s);
    expect(out.layers.some((l) => l.id === "road_shield_us")).toBe(false);
    expect(out.layers.find((l) => l.id === "highway-shield-non-us")!.filter).toEqual(["all", ["<=", ["coalesce", ["get", "ref_length"], 99], 6]]);
  });
  it("never changes the cached source style", () => {
    const src = style();
    const before = JSON.stringify(src);
    prepareStyle(src, "labels", 13);
    prepareStyle(src, "liberty", 13);
    expect(JSON.stringify(src)).toBe(before);
  });
  it("makes the imagery names from the light street style, each other picture from its own", () => {
    expect(styleSource("labels")).toBe("liberty");
    expect(styleSource("dark")).toBe("dark");
    expect(styleSource("positron")).toBe("positron");
    expect(Object.values(STYLE_URL).every((u) => u.startsWith("https://tiles.openfreemap.org/styles/"))).toBe(true);
  });
});
