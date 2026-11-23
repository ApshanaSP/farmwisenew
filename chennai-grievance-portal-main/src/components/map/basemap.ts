/**
 * One base map for the site's maps, as clear as Google Maps: a sharp street map (OpenFreeMap vector tiles drawn by
 * MapLibre GL at the screen's full resolution, light or night with the page theme), or satellite imagery (Esri, at
 * double resolution on high-resolution screens) with sharp names over it. When the sharp map cannot be drawn (no WebGL,
 * no network to the tile server, too many maps on the page) the raster street map is drawn instead, so a map always
 * appears.
 *
 *   const base = addBasemap(L, map, "map", { namesFrom: 13 });
 *   base.set("satellite");  base.onTone((t) => recolour(t));  // base.remove() (or map.remove()) when done
 *
 * The sharp map sits in its own pane (z-index 210): over Leaflet's tile pane (200, where the imagery and the raster
 * fallbacks go) and under every overlay pane (400 and up), so polygons, markers and tooltips stay on top.
 */
import type * as Leaflet from "leaflet";
import "maplibre-gl/dist/maplibre-gl.css";
import "./basemap.css";
import {
  ATTR, COVER_AFTER_MS, DOWN_FOR_MS, GIVE_UP_AFTER_MS, LAST_ZOOM, STYLE_URL, TILES, giveUpIn, imageryOptions, planBasemap, prepareStyle, sharpRoom, styleSource,
  type BaseKind, type Plan, type StyleDoc, type Tone, type VectorStyle
} from "./basemapPlan";
import type { GLHandle } from "./basemapGL";

export { readBaseChoice, saveBaseChoice, type BaseKind, type Tone } from "./basemapPlan";

export interface BasemapOptions {
  /** "auto" (the default) follows the page's light / night theme (html[data-theme]) as it changes */
  theme?: "auto" | Tone;
  /** names over the satellite imagery */
  labels?: boolean;
  /** the base map's own names wait for this Leaflet zoom (a map that names its own zones over the district) */
  namesFrom?: number;
  /** the quieter grey street map, for maps of figures (shaded wards, bubbles) */
  quiet?: boolean;
  /** the raster street map used when the sharp one cannot be drawn: Esri's (the console's) or OpenStreetMap's */
  fallback?: "esri" | "osm";
}

export interface Basemap {
  readonly kind: BaseKind;
  /** light or dark under the overlays: lines and names drawn on top pick their colours from this */
  readonly tone: Tone;
  set(kind: BaseKind): void;
  /** told when the tone changes (theme, Map / Satellite, a fallback); returns the unsubscribe */
  onTone(fn: (t: Tone) => void): () => void;
  remove(): void;
}

const PANE = "diqbase";
/** sharp maps on the page now (basemapPlan MAX_SHARP_MAPS) */
let sharpLive = 0;
/** the sharp map failed for want of its style or worker: raster tiles for new maps until then */
let downUntil = 0;

let glModule: Promise<typeof import("./basemapGL")> | null = null;
const loadGL = () => (glModule ??= import("./basemapGL").catch((e) => { glModule = null; throw e; }));

const sources = new Map<string, Promise<StyleDoc>>();
/** a style from OpenFreeMap, fetched once a page (a failed fetch is tried again next time) */
function sourceStyle(name: keyof typeof STYLE_URL): Promise<StyleDoc> {
  let p = sources.get(name);
  if (!p) {
    p = fetch(STYLE_URL[name], { credentials: "omit" }).then((r) => {
      if (!r.ok) throw new Error(`map style ${r.status}`);
      return r.json() as Promise<StyleDoc>;
    });
    sources.set(name, p);
    p.catch(() => sources.delete(name));
  }
  return p;
}

let webglOK: boolean | null = null;
/**
 * The browser can draw WebGL 2 (asked once; the test context is handed straight back). MapLibre 6 draws with WebGL 2 only
 * and throws without it, so a browser with only WebGL 1 goes straight to raster tiles instead of downloading MapLibre to fail.
 */
function webgl(): boolean {
  if (webglOK != null) return webglOK;
  try {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl2");
    webglOK = !!g;
    g?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglOK = false;
  }
  return webglOK;
}

const pageTheme = (): Tone => (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/** when the page last came back on screen (basemapPlan giveUpIn: only time on screen counts) */
let shownAt = 0;
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (!document.hidden) shownAt = Date.now(); });

export function addBasemap(L: typeof Leaflet, map: Leaflet.Map, kind: BaseKind, opts: BasemapOptions = {}): Basemap {
  const o = { theme: "auto" as "auto" | Tone, labels: false, namesFrom: 0, quiet: false, fallback: "esri" as "esri" | "osm", ...opts };
  if (!map.getPane(PANE)) {
    const pane = map.createPane(PANE);
    pane.style.zIndex = "210";
    pane.style.pointerEvents = "none";
  }
  // the map picker and the officer's task map set no closest zoom (basemapPlan LAST_ZOOM)
  if (map.options.maxZoom == null) map.setMaxZoom(LAST_ZOOM);
  const box = map.getContainer();
  let cur = kind, tone: Tone = "light", dead = false, failed = false;
  let plan: Plan | null = null;
  const toneFns = new Set<(t: Tone) => void>();
  let imagery: Leaflet.TileLayer | null = null, street: Leaflet.TileLayer | null = null;
  let names: Leaflet.TileLayer[] = [];

  // ---- the sharp map: wanted style, drawn style, and one load at a time (gen bumps when it is dropped, so a load still
  // under way for the dropped one is ignored)
  let want: VectorStyle | null = null, shown: VectorStyle | null = null;
  let gl: GLHandle | null = null;
  let gen = 0, holds = false, loaded = false, drawn = false, covering = false;
  let timers: ReturnType<typeof setTimeout>[] = [];

  const drop = () => {
    gen++;
    timers.forEach(clearTimeout);
    timers = [];
    const g = gl;
    gl = null;
    shown = null;
    loaded = drawn = false;
    if (holds) { holds = false; sharpLive--; }
    if (g) try { g.remove(); } catch { /* gone with the map already */ }
  };
  /** the sharp map cannot be drawn here: raster tiles from now on (and for new maps a while, when the network is the cause) */
  const fail = (network: boolean) => {
    if (dead) return;
    failed = true;
    if (network) downUntil = Date.now() + DOWN_FOR_MS;
    drop();
    apply();
  };
  const styled = async (v: VectorStyle) => prepareStyle(await sourceStyle(styleSource(v)), v, o.namesFrom);
  const start = async () => {
    const my = ++gen;
    holds = true;
    sharpLive++;
    // a map always appears: the raster street map under the sharp one if it is slow to draw, and for good if it never loads
    timers.push(setTimeout(() => { if (my === gen && !drawn && want !== "labels") cover(true); }, COVER_AFTER_MS));
    const startedAt = Date.now();
    const giveUp = () => {
      if (my !== gen || loaded) return;
      const wait = giveUpIn(Date.now(), startedAt, shownAt, document.hidden);
      if (wait > 0) timers.push(setTimeout(giveUp, wait));
      else fail(true);
    };
    timers.push(setTimeout(giveUp, GIVE_UP_AFTER_MS));
    try {
      const [m] = await Promise.all([loadGL(), new Promise<void>((r) => map.whenReady(() => r()))]);
      const v = want;
      if (!v || dead || my !== gen) return;
      const style = await styled(v);
      if (dead || my !== gen) return;
      gl = m.createGL(L, map, {
        pane: PANE, style, attribution: ATTR.vector,
        onLoad: () => { if (my === gen) loaded = true; },
        onDrawn: () => { if (my === gen) { drawn = true; cover(false); } },
        onLost: () => { if (my === gen) fail(false); },
        // taken off with the whole map: give its slot back
        onGone: () => { if (my === gen) { gl = null; drop(); } }
      });
      shown = v;
      if (want !== shown) void restyle();
    } catch {
      if (my === gen) fail(true);
    }
  };
  const restyle = async () => {
    const v = want, my = gen;
    if (!gl || !v || v === shown) return;
    shown = v;
    try {
      const style = await styled(v);
      if (my === gen && gl && want === v) gl.setStyle(style);
    } catch {
      if (my === gen) fail(true);
    }
  };
  const vector = (v: VectorStyle | null) => {
    want = v;
    if (!v) { if (holds) drop(); return; }
    if (!holds) void start();
    else if (gl) void restyle();
  };

  const streetLayer = (on: boolean) => {
    if (on && !street) {
      street = L.tileLayer(o.fallback === "osm" ? TILES.osm : TILES.street, { maxZoom: 20, maxNativeZoom: 19, attribution: o.fallback === "osm" ? ATTR.osm : ATTR.street }).addTo(map);
    } else if (!on && street) {
      street.remove();
      street = null;
    }
  };
  function cover(on: boolean) {
    covering = on;
    if (!dead) streetLayer(on || !!plan?.street);
  }

  function apply() {
    if (dead) return;
    const theme = o.theme === "auto" ? pageTheme() : o.theme;
    const p = (plan = planBasemap({ kind: cur, theme, webgl: webgl(), failed: failed || Date.now() < downUntil, room: sharpRoom(sharpLive, holds), labels: o.labels, quiet: o.quiet }));
    if (p.imagery && !imagery) imagery = L.tileLayer(TILES.imagery, { ...imageryOptions(L.Browser.retina), attribution: ATTR.imagery }).addTo(map);
    else if (!p.imagery && imagery) { imagery.remove(); imagery = null; }
    // Esri's raster names (no WebGL): 256 px tiles, so no double resolution (their letters would come out half size)
    if (p.rasterLabels && !names.length) {
      const z = { maxZoom: 20, maxNativeZoom: 19, minZoom: o.namesFrom || 0 };
      names = [L.tileLayer(TILES.roads, { ...z, opacity: 0.55 }).addTo(map), L.tileLayer(TILES.places, { ...z, opacity: 0.9, attribution: ATTR.labels }).addTo(map)];
    } else if (!p.rasterLabels && names.length) {
      names.forEach((n) => n.remove());
      names = [];
    }
    if (p.vector === null || p.vector === "labels") covering = false;
    vector(p.vector);
    streetLayer(p.street || covering);
    box.classList.add("bm-on");
    box.classList.toggle("bm-map", cur === "map");
    box.classList.toggle("bm-sat", cur === "satellite");
    box.classList.toggle("bm-light", p.tone === "light");
    box.classList.toggle("bm-dark", p.tone === "dark");
    if (p.tone !== tone) {
      tone = p.tone;
      toneFns.forEach((f) => f(tone));
    }
  }

  const watch = o.theme === "auto" && typeof MutationObserver !== "undefined" ? new MutationObserver(() => apply()) : null;
  watch?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const unload = () => handle.remove();
  map.on("unload", unload);

  const handle: Basemap = {
    get kind() { return cur; },
    get tone() { return tone; },
    set(k) {
      if (k === cur || dead) return;
      cur = k;
      apply();
    },
    onTone(fn) {
      toneFns.add(fn);
      return () => { toneFns.delete(fn); };
    },
    remove() {
      if (dead) return;
      dead = true;
      watch?.disconnect();
      map.off("unload", unload);
      drop();
      for (const l of [imagery, street, ...names]) l?.remove();
      imagery = street = null;
      names = [];
      box.classList.remove("bm-on", "bm-map", "bm-sat", "bm-light", "bm-dark");
      toneFns.clear();
    }
  };
  apply();
  return handle;
}
