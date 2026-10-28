/**
 * Leaflet throws "Cannot read properties of null (reading '_latLngToNewLayerPoint')" (and the like) when a marker,
 * tooltip, popup or renderer is removed while a zoom animation is still running: its zoom handler fires after it lost
 * its map. A new answer clears the map's layers, often mid-flight, so the console shows "Unhandled Runtime Error".
 * These guards make the late handler a no-op. Patched once per Leaflet instance.
 */
import type * as Leaflet from "leaflet";

type Proto = Record<string, unknown> & { _map?: unknown };
const DONE = Symbol.for("districtiq.leafletSafe");

function guard(proto: Proto | undefined, methods: string[]) {
  if (!proto) return;
  for (const m of methods) {
    const orig = proto[m];
    if (typeof orig !== "function") continue;
    proto[m] = function (this: Proto, ...args: unknown[]) {
      if (!this._map) return undefined;
      return (orig as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
}

export function hardenLeaflet(L: typeof Leaflet): void {
  const l = L as unknown as Record<symbol, boolean>;
  if (l[DONE]) return;
  l[DONE] = true;
  const p = (c: unknown) => (c as { prototype?: Proto } | undefined)?.prototype;
  guard(p(L.Marker), ["_animateZoom", "update"]);
  guard(p(L.Tooltip), ["_animateZoom", "_updatePosition", "update"]);
  guard(p(L.Popup), ["_animateZoom", "_updatePosition", "update", "_adjustPan"]);
  guard(p(L.Renderer), ["_onZoom", "_updateTransform", "_onAnimZoom", "_update"]);
  guard(p(L.ImageOverlay), ["_animateZoom", "_reset"]);
}
