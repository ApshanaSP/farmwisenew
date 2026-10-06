"use client";

import { useEffect, useRef } from "react";

/**
 * A small, non-interactive location map: OpenStreetMap, turned to a dark-matter look in the dark theme (CSS filter), with
 * one azure pin that drops in with a ripple. Leaflet loads only when the map is shown.
 */
export default function MiniMap({ lat, lng, height = 160 }: { lat: number; lng: number; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let live = true;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!live || !ref.current) return;
      map = L.map(ref.current, { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false })
        .setView([lat, lng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      L.marker([lat, lng], {
        interactive: false,
        icon: L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11], html: '<span class="mm-pin"><i></i></span>' })
      }).addTo(map);
    })();
    return () => { live = false; map?.remove(); };
  }, [lat, lng]);
  return (
    <div className="relative overflow-hidden rounded-[10px] border border-canvas-border" style={{ height }}>
      <style>{`.mm-pin{position:relative;display:block;width:22px;height:22px;border-radius:50%;background:var(--accent);border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.35);animation:mm-drop .5s cubic-bezier(.16,1,.3,1) both}
.mm-pin i{position:absolute;inset:-3px;border-radius:50%;border:2px solid var(--accent);animation:mm-ring 1.4s ease-out .4s 1 both}
@keyframes mm-drop{from{transform:translateY(-14px);opacity:0}}@keyframes mm-ring{from{transform:scale(1);opacity:.8}to{transform:scale(2.6);opacity:0}}
:root[data-theme="dark"] .mm-wrap .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.85) contrast(.9) saturate(.6)}`}</style>
      <div ref={ref} className="mm-wrap h-full w-full" />
    </div>
  );
}
