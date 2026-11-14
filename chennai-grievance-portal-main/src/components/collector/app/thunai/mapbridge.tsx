"use client";
/**
 * The map's targeting reticle: it sweeps to the place being discussed, with pulse rings on what stands out. The console's map
 * registers itself here; the reticle asks it where a coordinate is on screen. No map on the page, or a place with no position:
 * no reticle. The positions come from the same screen document the answer does.
 *
 * It moves when something moves (v4): the map's own pan, zoom and resize events, the window's resize and scroll, the map's box
 * changing size, the map coming or going. No timer: while nothing moves, nothing runs, and it re-draws only when the position
 * on screen actually changed.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { hud, type HudState } from "./hudstore";

interface MapLike {
  latLngToContainerPoint: (p: [number, number]) => { x: number; y: number };
  getContainer: () => HTMLElement;
  /** Leaflet's events; a map without them is followed through the window's events only */
  on?: (type: string, fn: () => void) => unknown;
  off?: (type: string, fn: () => void) => unknown;
}
let current: MapLike | null = null;
const changes = new Set<() => void>();
/** the console's map says it exists (SatMap); null when it goes */
export function setConsoleMap(m: MapLike | null) { current = m; changes.forEach((f) => f()); }

type Box = { left: number; top: number; right: number; bottom: number; width: number };
/** a map point on the screen: Leaflet counts the map's own pixels, the console's CSS zoom scales them, the reticle is outside that zoom */
export function toViewport(r: Box, p: { x: number; y: number }, ownWidth: number): { x: number; y: number } | null {
  const k = r.width / (ownWidth || r.width);
  const x = r.left + p.x * k, y = r.top + p.y * k;
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom ? { x, y } : null;
}

function onScreen(lat: number, lon: number): { x: number; y: number } | null {
  if (!current) return null;
  const box = current.getContainer();
  if (!box.isConnected) return null;
  const r = box.getBoundingClientRect();
  if (!r.width) return null;
  return toViewport(r, current.latLngToContainerPoint([lat, lon]), box.offsetWidth);
}

type Focus = NonNullable<HudState["focus"]>;
/** where the reticle and its pulses are on screen, to the pixel: the same key means nothing to re-draw */
export function placeKey(f: Focus | null): string {
  if (!f || f.lat == null || f.lon == null) return "";
  const at = onScreen(f.lat, f.lon);
  const px = (q: { x: number; y: number } | null) => (q ? `${Math.round(q.x)},${Math.round(q.y)}` : "-");
  return [px(at), ...(f.pulses ?? []).map((p) => px(onScreen(p.lat, p.lon)))].join(";");
}

const MAP_EVENTS = "move zoom resize viewreset";

/**
 * Calls `moved` (at most once a frame) whenever what is under the reticle may have moved: the map's pan, zoom and resize, the
 * window's resize and scroll, the map's box resizing, the map being swapped. Returns the stop. No timer runs.
 */
export function followMap(moved: () => void, env: { win?: Pick<Window, "addEventListener" | "removeEventListener"> | null; frame?: (f: () => void) => void } = {}): () => void {
  const win = env.win !== undefined ? env.win : typeof window !== "undefined" ? window : null;
  const frame = env.frame ?? ((f: () => void) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => f()) : setTimeout(f, 16)));
  let queued = false, live = true;
  const fire = () => { if (queued || !live) return; queued = true; frame(() => { queued = false; if (live) moved(); }); };
  let bound: MapLike | null = null;
  let ro: ResizeObserver | null = null;
  const bind = () => {
    if (bound === current) return;
    bound?.off?.(MAP_EVENTS, fire);
    ro?.disconnect();
    ro = null;
    bound = current;
    bound?.on?.(MAP_EVENTS, fire);
    if (bound && typeof ResizeObserver === "function") {
      try { ro = new ResizeObserver(fire); ro.observe(bound.getContainer()); } catch { ro = null; }
    }
  };
  const swapped = () => { bind(); fire(); };
  bind();
  changes.add(swapped);
  win?.addEventListener("resize", fire);
  win?.addEventListener("scroll", fire, { capture: true, passive: true } as AddEventListenerOptions);
  return () => {
    live = false;
    changes.delete(swapped);
    bound?.off?.(MAP_EVENTS, fire);
    ro?.disconnect();
    win?.removeEventListener("resize", fire);
    win?.removeEventListener("scroll", fire, { capture: true } as EventListenerOptions);
  };
}

export function Reticle() {
  const s = useSyncExternalStore(hud.subscribe, hud.get, hud.get);
  const f = s.focus;
  const [, redraw] = useState(0);
  const drawn = useRef("");
  // the map may pan under it: the position is read again when something moves, and drawn again only if it changed
  useEffect(() => {
    if (!f || f.lat == null || f.lon == null) return;
    return followMap(() => { if (placeKey(f) !== drawn.current) redraw((x) => x + 1); });
  }, [f]);
  if (!f || f.lat == null || f.lon == null) { drawn.current = ""; return null; }
  drawn.current = placeKey(f);
  const at = onScreen(f.lat, f.lon);
  if (!at) return null;
  return (
    <>
      <div className="hud-reticle" style={{ transform: `translate(${at.x}px, ${at.y}px)` }} aria-hidden="true">
        <svg viewBox="-36 -36 72 72">
          <circle r="22" /><circle r="3" />
          <path d="M-34 0H-26M26 0H34M0 -34V-26M0 26V34" />
          <path d="M-30 -30H-20M-30 -30V-20M30 -30H20M30 -30V-20M-30 30H-20M-30 30V20M30 30H20M30 30V20" />
        </svg>
        {f.label && <span>{f.label}</span>}
      </div>
      {(f.pulses ?? []).map((p, i) => {
        const q = onScreen(p.lat, p.lon);
        return q ? <i key={i} className="hud-pulse" aria-hidden="true" style={{ "--at": `translate(${q.x}px, ${q.y}px)`, transform: `translate(${q.x}px, ${q.y}px)` } as React.CSSProperties} /> : null;
      })}
    </>
  );
}
