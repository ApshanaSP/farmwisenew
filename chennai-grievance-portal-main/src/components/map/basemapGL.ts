/**
 * The sharp map itself: MapLibre GL drawn inside a Leaflet map (@maplibre/maplibre-gl-leaflet). Loaded only in the
 * browser and only when a sharp map is wanted (basemap.ts imports this file on demand), so pages without a map never
 * download MapLibre.
 */
import * as maplibregl from "maplibre-gl";
import { MaplibreGL } from "@maplibre/maplibre-gl-leaflet";
import type * as Leaflet from "leaflet";
import type { StyleDoc } from "./basemapPlan";

let prepared = false;
/**
 * MapLibre cuts tiles in a worker of its own. A bundler cannot hand it that file here, so it comes from the CDN the site
 * already allows for workers and scripts (next.config.js), at exactly the bundled version. Two workers: enough for the
 * console's few maps, and lighter on memory than one per processor core.
 */
function prepare() {
  if (prepared) return;
  prepared = true;
  maplibregl.setWorkerUrl(`https://cdn.jsdelivr.net/npm/maplibre-gl@${maplibregl.getVersion()}/dist/maplibre-gl-worker.mjs`);
  maplibregl.setWorkerCount(2);
}

type Inner = {
  _map: (Leaflet.Map & { getBounds(): Leaflet.LatLngBounds }) | null;
  _glMap: (maplibregl.Map & { _actualCanvas: HTMLElement }) | null;
  _container?: HTMLElement;
  _resizeContainer(): void;
  _zoomEnd(): void;
};
type Fn = (this: Inner, ...a: unknown[]) => unknown;

let Safe: (new (options: Record<string, unknown>) => Leaflet.Layer & { getMaplibreMap(): maplibregl.Map }) | null = null;
/**
 * The plugin's layer with its late handlers made harmless: a zoom animation or a resize can call back after the layer
 * left the map (a theme or Map / Satellite switch mid-zoom), and the plugin would then throw "Cannot read properties of
 * null" (as Leaflet's own markers do, askmap/leafletSafe.ts).
 */
function safeClass(L: typeof Leaflet) {
  if (Safe) return Safe;
  const P = MaplibreGL.prototype as unknown as Record<string, Fn>;
  const live = (t: Inner) => !!t._map && !!t._glMap;
  const guard = (name: string): Fn => function (this: Inner, ...a: unknown[]) { return live(this) ? P[name].apply(this, a) : undefined; };
  Safe = (MaplibreGL as unknown as { extend(p: Record<string, unknown>): typeof Safe }).extend({
    _update: guard("_update"),
    _pinchZoom: guard("_pinchZoom"),
    _animateZoom: guard("_animateZoom"),
    _zoomEnd: guard("_zoomEnd"),
    _resize: guard("_resize"),
    // the plugin's own, with the check inside the frame callback, where the late call lands
    _transitionEnd(this: Inner) {
      L.Util.requestAnimFrame(function (this: Inner) {
        const map = this._map, gl = this._glMap;
        if (!map || !gl) return;
        const zoom = map.getZoom(), center = map.getCenter();
        const offset = map.latLngToContainerPoint(map.getBounds().getNorthWest());
        this._resizeContainer();
        L.DomUtil.setTransform(gl._actualCanvas, offset, 1);
        gl.once("moveend", () => this._zoomEnd());
        gl.jumpTo({ center, zoom: zoom - 1 });
      }, this);
    },
    onRemove(this: Inner, map: Leaflet.Map) {
      if (this._glMap) return P.onRemove.call(this, map);
      // the sharp map never started (WebGL refused): only its empty box to take away
      this._container?.remove();
      return undefined;
    }
  }) as typeof Safe;
  return Safe!;
}

export interface GLHandle {
  setStyle(style: StyleDoc): void;
  remove(): void;
}
export interface GLOptions {
  pane: string;
  style: StyleDoc;
  attribution: string;
  /** the style is loaded */
  onLoad(): void;
  /** the first whole picture is drawn */
  onDrawn(): void;
  /** WebGL stopped (the browser took the drawing context back) */
  onLost(): void;
  /** the layer left the map by any route (the whole map removed, for one) */
  onGone(): void;
}

/** Puts a sharp map on the Leaflet map, in its own pane under every overlay. Throws when WebGL cannot start. */
export function createGL(L: typeof Leaflet, map: Leaflet.Map, o: GLOptions): GLHandle {
  prepare();
  const Layer = safeClass(L);
  // not interactive: Leaflet keeps the mouse and the camera, MapLibre only draws (16 ms: follows Leaflet's flights frame by frame)
  const layer = new Layer({ style: o.style, pane: o.pane, interactive: false, updateInterval: 16, attributionControl: { customAttribution: o.attribution } });
  try {
    layer.addTo(map);
  } catch (e) {
    try { map.removeLayer(layer); } catch { /* it never got as far as the map */ }
    throw e;
  }
  layer.on("remove", o.onGone);
  const gm = layer.getMaplibreMap();
  let drawn = false;
  const draw = () => { if (!drawn) { drawn = true; o.onDrawn(); } };
  gm.once("load", () => { o.onLoad(); setTimeout(draw, 1500); });
  gm.once("idle", draw);
  gm.getCanvas().addEventListener("webglcontextlost", () => o.onLost(), { once: true });
  return {
    setStyle: (s) => gm.setStyle(s as unknown as Parameters<maplibregl.Map["setStyle"]>[0]),
    remove: () => { layer.off("remove", o.onGone); map.removeLayer(layer); }
  };
}
