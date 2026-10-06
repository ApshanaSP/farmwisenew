"use client";

/**
 * The dataset on the district map: the console's satellite imagery and ward outlines, wards shaded by the dataset's
 * value (per ward, or per zone for every ward of the zone), and bubbles for the localities the rows name. Clicking a
 * zone narrows every panel of the dataset to it (the page's cross-filter); the zone in focus is outlined in white.
 */
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { MapGeo } from "@/lib/collector/geo";
import { fmtNum, type PanelData } from "@/lib/studio/types";
import { esc } from "../SatMap";
import { I } from "../icons";

const RAMP = ["#312E81", "#4F46E5", "#6366F1", "#8B5CF6", "#C026D3", "#F43F5E"];
const color = (t: number) => RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.floor(t * (RAMP.length - 0.001))))];

interface Props { geo: MapGeo | null; panel: PanelData; focusZone: number | null; onZone?: (z: number) => void }

interface St { L: typeof Leaflet; map: Leaflet.Map; wards: { ward: number; zone: number; taluk: string | null; poly: Leaflet.Polygon }[]; bubbles: Leaflet.LayerGroup; sel: Leaflet.LayerGroup; district: Leaflet.LatLngBounds }

export default function StudioMap({ geo, panel, focusZone, onZone }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const st = useRef<St | null>(null);
  const cb = useRef({ onZone, panel });
  cb.current = { onZone, panel };
  const [ready, setReady] = useState(0);

  useEffect(() => {
    if (!geo || !el.current) return;
    let dead = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (dead || !el.current) return;
      const map = L.map(el.current, { zoomControl: false, zoomSnap: 0.25, minZoom: 9, maxZoom: 17, attributionControl: true, scrollWheelZoom: true });
      map.attributionControl.setPrefix(false);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagery © Esri" }).addTo(map);
      const wards = geo.wards.map((w) => {
        const poly = L.polygon(w.rings, { color: "#C7D2FE", weight: 0.5, opacity: 0.35, fillOpacity: 0 })
          .on("click", () => cb.current.onZone?.(w.zone))
          .bindTooltip(() => tip(w.ward, w.zone, cb.current.panel, geo), { sticky: true, className: "dtip", direction: "top", offset: [0, -8] })
          .addTo(map);
        return { ward: w.ward, zone: w.zone, taluk: w.taluk, poly };
      });
      for (const z of geo.zones) L.polyline(z.lines, { color: "#E0E7FF", weight: 1.2, opacity: 0.6, interactive: false }).addTo(map);
      const district = L.latLngBounds([]);
      for (const w of wards) district.extend(w.poly.getBounds());
      map.fitBounds(district, { padding: [6, 6] });
      st.current = { L, map, wards, district, bubbles: L.layerGroup().addTo(map), sel: L.layerGroup().addTo(map) };
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(el.current);
      setReady((n) => n + 1);
    })();
    return () => { dead = true; ro?.disconnect(); st.current?.map.remove(); st.current = null; };
  }, [geo]);

  // ---- shading and bubbles
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    const val = new Map<string | number, number>(panel.keys.map((k, i) => [k, panel.values[i]]));
    const max = Math.max(1, ...panel.values);
    const valueOf = (w: St["wards"][number]) => (panel.geo === "ward" ? val.get(w.ward) : panel.geo === "zone" ? val.get(w.zone) : panel.geo === "taluk" ? val.get(w.taluk ?? "") : undefined);
    for (const w of s.wards) {
      const v = valueOf(w);
      if (v == null || panel.geo === "place") w.poly.setStyle({ fillColor: "#020617", fillOpacity: panel.geo === "place" ? 0.18 : 0.42, opacity: 0.25 });
      else w.poly.setStyle({ fillColor: color(v / max), fillOpacity: 0.28 + 0.4 * Math.sqrt(v / max), opacity: 0.45 });
    }
    s.bubbles.clearLayers();
    const pts = [...panel.points].sort((a, b) => b.v - a.v).slice(0, 220);
    const pmax = Math.max(1, ...pts.map((p) => p.v));
    pts.reverse().forEach((p, i) => {
      const r = Math.sqrt(p.v / pmax);
      const size = Math.round(10 + 30 * r);
      const html = `<div class="ds-bub${r > 0.75 ? " hot" : ""}" style="--s:${size}px;--c:${color(r)};--d:${Math.min(900, (pts.length - i) * 12)}ms"><b>${r > 0.45 ? esc(fmtNum(p.v, panel.format, panel.unit)) : ""}</b></div>`;
      s.L.marker([p.lat, p.lon], { icon: s.L.divIcon({ className: "", html, iconSize: [0, 0] }), zIndexOffset: Math.round(r * 1000) })
        .bindTooltip(`<b>${esc(p.name)}</b>${esc(fmtNum(p.v, panel.format, panel.unit))} · ${esc(panel.subtitle)}`, { className: "dtip", direction: "top", offset: [0, -size / 2] })
        .addTo(s.bubbles);
    });
  }, [ready, panel]);

  // ---- the zone in focus
  useEffect(() => {
    const s = st.current;
    if (!s || !geo) return;
    s.sel.clearLayers();
    if (focusZone) {
      const z = geo.zones.find((x) => x.zone === focusZone);
      if (z) s.L.polyline(z.lines, { color: "#FFFFFF", weight: 2.6, opacity: 1, interactive: false }).addTo(s.sel);
      const b = s.L.latLngBounds([]);
      for (const w of s.wards) if (w.zone === focusZone) b.extend(w.poly.getBounds());
      if (b.isValid()) s.map.flyToBounds(b, { padding: [20, 20], duration: 0.6 });
    } else s.map.flyToBounds(s.district, { padding: [6, 6], duration: 0.6 });
  }, [ready, focusZone, geo]);

  const max = Math.max(0, ...panel.values);
  return (
    <div className="ds-map">
      <div ref={el} className="ds-map-c" aria-label={`Map: ${panel.title}`} />
      {!geo && <div className="ds-map-wait"><span className="ds-spin" />Loading the map…</div>}
      <div className="ds-map-tools">
        <button onClick={() => st.current?.map.zoomIn()} aria-label="Zoom in">+</button>
        <button onClick={() => st.current?.map.zoomOut()} aria-label="Zoom out">−</button>
        <button onClick={() => st.current?.map.flyToBounds(st.current.district, { padding: [6, 6], duration: 0.5 })} aria-label="Whole district"><I n="expand" /></button>
      </div>
      {max > 0 && (
        <div className="ds-map-leg">
          <span>{panel.geo === "place" ? "Bubble size" : panel.geo === "ward" ? "Per ward" : panel.geo === "taluk" ? "Per taluk" : "Per zone"}</span>
          <i style={{ background: `linear-gradient(90deg, ${RAMP.join(",")})` }} />
          <em><b>0</b><b>{fmtNum(max, panel.format, panel.unit)}</b></em>
        </div>
      )}
    </div>
  );
}

function tip(ward: number, zone: number, p: PanelData, geo: MapGeo): string {
  const zname = geo.zones.find((z) => z.zone === zone)?.name ?? `Zone ${zone}`;
  const i = p.geo === "ward" ? p.keys.indexOf(ward) : p.geo === "zone" ? p.keys.indexOf(zone) : -1;
  const v = i >= 0 ? `<br>${esc(fmtNum(p.values[i], p.format, p.unit))} · ${esc(p.subtitle)}` : "";
  return `<b>${esc(zname)}</b>Ward ${ward}${v}<br><span style="opacity:.65">Click to focus every chart on ${esc(zname)}</span>`;
}
