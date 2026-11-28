/**
 * The base map's decisions, kept free of the browser so they can be tested (basemap.test.ts): which picture for which
 * theme, when the sharp vector map gives way to raster tiles, the satellite tiles' settings on high-resolution screens,
 * the remembered Map / Satellite choice, and the small changes made to the OpenFreeMap styles (English names, names
 * held back over the whole district, names only over the imagery). basemap.ts puts these on a Leaflet map.
 */

export type BaseKind = "map" | "satellite";
export type Tone = "light" | "dark";
/**
 * liberty: the light street map, every site map's default (in green and yellow since 28 Nov: greenYellow); positron: a quieter grey one, for
 * maps of figures (the Data Studio's and the chatbot's maps); dark: the night map; labels: liberty's names alone, over the imagery
 */
export type VectorStyle = "liberty" | "positron" | "dark" | "labels";
type Source = Exclude<VectorStyle, "labels">;

const OFM = "https://tiles.openfreemap.org";
/** OpenFreeMap: free, no key, OpenStreetMap data drawn as vectors (sharp at any zoom and on any screen) */
export const STYLE_URL: Record<Source, string> = { liberty: `${OFM}/styles/liberty`, positron: `${OFM}/styles/positron`, dark: `${OFM}/styles/dark` };

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
export const TILES = {
  imagery: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
  street: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
  roads: `${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`,
  places: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
  osm: "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
} as const;

const A = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
export const ATTR = {
  vector: `${A("https://openfreemap.org", "© OpenFreeMap")} ${A("https://www.openmaptiles.org/", "© OpenMapTiles")} Data from ${A("https://www.openstreetmap.org/copyright", "OpenStreetMap")}`,
  imagery: "Imagery © Esri, Maxar, Earthstar Geographics",
  street: "Map © Esri, HERE, Garmin, OpenStreetMap contributors",
  labels: "Labels © Esri",
  osm: `© ${A("https://www.openstreetmap.org/copyright", "OpenStreetMap")} contributors`
} as const;

/**
 * Each sharp map holds a WebGL drawing context and a browser keeps only about sixteen per page (the oldest is lost
 * beyond that). The console can show several maps at once (Studio tiles, map answers in the chat), so after this many
 * the next ones use raster tiles instead.
 */
export const MAX_SHARP_MAPS = 8;
/** the sharp map has not drawn by now: the raster street map is shown under it meanwhile, so a map always appears */
export const COVER_AFTER_MS = 2500;
/** still not loaded by now (no network to the tile server, a blocked worker): it is given up for raster tiles */
export const GIVE_UP_AFTER_MS = 15000;
/** after a give-up, new maps go straight to raster tiles for this long instead of each waiting to fail again */
export const DOWN_FOR_MS = 5 * 60_000;
/**
 * The closest zoom for a map whose page sets none. Leaflet takes such a map's limit from its tile layers, and the sharp
 * map is not one: without a limit the map zooms in for ever, and past MapLibre's own last zoom the streets slide away from
 * the pins. 20 is where the raster street map and the imagery stop too.
 */
export const LAST_ZOOM = 20;

/**
 * How much longer to wait before giving the sharp map up (0: now). Only time on screen counts: a browser does not draw
 * a tab in the background, and MapLibre loads its style on the next drawn frame, so a map opened in a background tab
 * would otherwise be given up before it was ever shown.
 */
export function giveUpIn(now: number, startedAt: number, shownAt: number, hidden: boolean): number {
  if (hidden) return GIVE_UP_AFTER_MS;
  return Math.max(0, Math.max(startedAt, shownAt) + GIVE_UP_AFTER_MS - now);
}

export interface PlanIn {
  kind: BaseKind;
  theme: Tone;
  /** the browser can draw WebGL 2 (all MapLibre 6 draws with) */
  webgl: boolean;
  /** the sharp map already failed on this map (no style, lost context) */
  failed: boolean;
  /** a sharp-map slot is free (or this map holds one already) */
  room: boolean;
  /** names over the satellite imagery */
  labels: boolean;
  /** the quieter grey street map (shaded wards and bubbles read better on it) */
  quiet: boolean;
}
export interface Plan {
  imagery: boolean;
  /** the sharp map's style, or null for none */
  vector: VectorStyle | null;
  /** the raster street map: the fallback when the sharp map cannot be drawn */
  street: boolean;
  /** Esri's raster names over the imagery (when the sharp names cannot be drawn) */
  rasterLabels: boolean;
  /** light or dark under the overlays, for the colours of lines and names drawn on top */
  tone: Tone;
}

export function planBasemap(p: PlanIn): Plan {
  const sharp = p.webgl && !p.failed && p.room;
  if (p.kind === "satellite") return { imagery: true, vector: p.labels && sharp ? "labels" : null, street: false, rasterLabels: p.labels && !sharp, tone: "dark" };
  if (sharp) return { imagery: false, vector: p.theme === "dark" ? "dark" : p.quiet ? "positron" : "liberty", street: false, rasterLabels: false, tone: p.theme };
  // Esri's street map is a light map in either theme (the night theme only dims it)
  return { imagery: false, vector: null, street: true, rasterLabels: false, tone: "light" };
}

/** a slot for one more sharp map: this map holds one already, or fewer than the limit are in use */
export const sharpRoom = (live: number, holds: boolean) => holds || live < MAX_SHARP_MAPS;

/**
 * Satellite tiles. A high-resolution screen asks for the next zoom's tiles at half size (Leaflet's detectRetina), so the
 * picture is as sharp as the screen. Esri's imagery stops at zoom 19 over Chennai, so on such a screen the last zoom
 * asked for is 18 (shown with 19's tiles); past it the last tiles are enlarged. Leaflet takes one off maxZoom for
 * detectRetina, hence 21.
 */
export function imageryOptions(retina: boolean): { detectRetina: boolean; maxNativeZoom: number; maxZoom: number } {
  return retina ? { detectRetina: true, maxNativeZoom: 18, maxZoom: 21 } : { detectRetina: false, maxNativeZoom: 19, maxZoom: 20 };
}

// ---------------------------------------------------------------- the remembered choice

export const BASE_KEY = "diq-map-base";
type Store = Pick<Storage, "getItem" | "setItem">;
const local = (): Store | null => {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
};

/** The Map / Satellite choice made in this browser, or null (private windows and blocked storage give null). */
export function readBaseChoice(store: Store | null = local()): BaseKind | null {
  try {
    const v = store?.getItem(BASE_KEY);
    return v === "map" || v === "satellite" ? v : null;
  } catch { return null; }
}
export function saveBaseChoice(v: BaseKind, store: Store | null = local()): void {
  try { store?.setItem(BASE_KEY, v); } catch { /* storage refused: the choice lasts this visit only */ }
}

/** Ask the Map's Satellite / Streets value as last seen, and whether a view (Rain & flooding, live traffic) forced it then */
export interface BaseSeen { base: string | undefined; forced: boolean }
/**
 * The view a change of Ask the Map's value asks for, or null when it is no choice: its first value (only a default), and a
 * change made by a forced view opening or closing (closing Rain & flooding hands back "sat", which must not turn the
 * Collector's Map into Satellite).
 */
export function baseAsked(prev: BaseSeen | null, next: BaseSeen): BaseKind | null {
  if (!prev || next.forced || prev.forced || !next.base || next.base === prev.base) return null;
  return next.base === "streets" ? "map" : "satellite";
}

// ---------------------------------------------------------------- style changes

export interface StyleLayer { id: string; type: string; source?: string; minzoom?: number; maxzoom?: number; layout?: Record<string, unknown>; paint?: Record<string, unknown>; [k: string]: unknown }
export interface StyleDoc { version: number; sources: Record<string, unknown>; layers: StyleLayer[]; [k: string]: unknown }

/** English first; MapLibre cannot join Tamil letters (a vowel sign lands on the wrong side), so a Tamil line under each name would read wrongly */
const ENGLISH = ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];

/** Every name in English only (the styles write "Latin name" over "local name"). */
export function englishNames(style: StyleDoc): StyleDoc {
  return {
    ...style,
    layers: style.layers.map((l) => (l.type === "symbol" && l.layout && JSON.stringify(l.layout["text-field"] ?? "").includes("name:nonlatin")
      ? { ...l, layout: { ...l.layout, "text-field": ENGLISH } }
      : l))
  };
}

/**
 * The base map's own names wait until Leaflet zoom `from` (MapLibre's zoom is one less: its tiles are 512 px). Over the
 * whole district the console draws its zone and taluk names, and a second set of names under them is clutter.
 */
export function namesFrom(style: StyleDoc, from: number): StyleDoc {
  if (!from) return style;
  const z = from - 1;
  return {
    ...style,
    layers: style.layers
      // a name layer that ends before that zoom would never show
      .filter((l) => l.type !== "symbol" || l.maxzoom == null || l.maxzoom > z)
      .map((l) => (l.type === "symbol" ? { ...l, minzoom: Math.max(l.minzoom ?? 0, z) } : l))
  };
}

/** names that are not worth a line over imagery: shop and office icons, one-way arrows, United States road shields */
const NOT_OVER_IMAGERY = /^(poi_|road_one_way|highway-shield-us|road_shield_us)/;

/** Liberty's names alone, white with a dark edge so they read on any photograph (Google's "hybrid" view). */
export function labelsOnly(style: StyleDoc): StyleDoc {
  const layers = style.layers
    .filter((l) => l.type === "symbol" && !NOT_OVER_IMAGERY.test(l.id))
    .map((l) => ({ ...l, paint: { ...(l.paint ?? {}), "text-color": "#FFFFFF", "text-halo-color": "rgba(10,16,28,0.85)", "text-halo-width": 1.4, "text-halo-blur": 0.4 } }));
  const used = new Set(layers.map((l) => l.source).filter((s): s is string => !!s));
  return { ...style, sources: Object.fromEntries(Object.entries(style.sources).filter(([k]) => used.has(k))), layers };
}

const US_ONLY = /shield-us|shield_us/;
const REF_LENGTH = JSON.stringify(["get", "ref_length"]);
/**
 * Upstream quirks that only fill the browser console: United States road shields (never on a Chennai map), a road-number
 * filter that warns for every road without a number (such a road still gets no shield: 99 is over the limit of 6), and
 * the night style's wood pattern, missing from its sprite (the woods keep their plain colour).
 */
export function forChennai(style: StyleDoc): StyleDoc {
  return {
    ...style,
    layers: style.layers.filter((l) => !US_ONLY.test(l.id)).map((l) => {
      const f = l.filter === undefined ? "" : JSON.stringify(l.filter);
      let out = f.includes(REF_LENGTH) ? { ...l, filter: JSON.parse(f.split(REF_LENGTH).join(JSON.stringify(["coalesce", ["get", "ref_length"], 99]))) } : l;
      if (out.paint?.["fill-pattern"] === "wood-pattern") {
        const { "fill-pattern": _gone, ...paint } = out.paint;
        out = { ...out, paint };
      }
      return out;
    })
  };
}

/**
 * The light street map's colours (28 Nov 2026). The owner: the map the site opened on was "light shaded"; they want "the one with green and
 * yellow shadings" as the default. Liberty lays a light grey over every residential area up to zoom 12 (hsla(0,3%,85%,0.84) at zoom 9), and the
 * console shows the whole district at about zoom 10, so Chennai opened as a pale grey sheet with faint parks. Here those areas are a soft yellow
 * and parks, woods and grass a clearer green, as the Map button's own picture (Esri's street map) shows them. Roads keep Liberty's yellow and
 * orange; water, names, buildings and the rest are unchanged. Layer ids are Liberty's (https://tiles.openfreemap.org/styles/liberty); a layer
 * the style no longer has is skipped.
 */
export const GREEN_YELLOW: Record<string, Record<string, unknown>> = {
  landuse_residential: { "fill-color": ["interpolate", ["linear"], ["zoom"], 9, "hsla(50,82%,78%,0.58)", 12, "hsla(46,78%,83%,0.48)"] },
  park: { "fill-color": "#c3e2a6", "fill-opacity": 0.8 },
  landcover_wood: { "fill-color": "hsla(100,52%,62%,0.8)", "fill-opacity": 0.55 },
  landcover_grass: { "fill-color": "rgb(176,213,154)", "fill-opacity": 0.5 }
};
export function greenYellow(style: StyleDoc): StyleDoc {
  return { ...style, layers: style.layers.map((l) => (GREEN_YELLOW[l.id] ? { ...l, paint: { ...(l.paint ?? {}), ...GREEN_YELLOW[l.id] } } : l)) };
}

/** which OpenFreeMap style a picture is made from */
export const styleSource = (v: VectorStyle): Source => (v === "labels" ? "liberty" : v);

/** The style a sharp map draws: the source style with the changes above. The source is never changed (it is cached). */
export function prepareStyle(source: StyleDoc, v: VectorStyle, from = 0): StyleDoc {
  const base = v === "labels" ? labelsOnly(source) : v === "liberty" ? greenYellow(source) : source;
  return namesFrom(englishNames(forChennai(base)), from);
}
