"use client";
/**
 * The map's targeting reticle: it sweeps to the place being discussed, with pulse rings on what stands out. The console's map
 * registers itself here; the reticle asks it where a coordinate is on screen. No map on the page, or a place with no position:
 * no reticle. The positions come from the same screen document the answer does.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { hud } from "./hudstore";

interface MapLike { latLngToContainerPoint: (p: [number, number]) => { x: number; y: number }; getContainer: () => HTMLElement }
let current: MapLike | null = null;
/** the console's map says it exists (SatMap); null when it goes */
export function setConsoleMap(m: MapLike | null) { current = m; }

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

export function Reticle() {
  const s = useSyncExternalStore(hud.subscribe, hud.get, hud.get);
  const f = s.focus;
  const [, tick] = useState(0);
  // the map may pan under it: the position is read again while it shows
  useEffect(() => {
    if (!f) return;
    const t = setInterval(() => tick((x) => x + 1), 600);
    return () => clearInterval(t);
  }, [f]);
  if (!f || f.lat == null || f.lon == null) return null;
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
