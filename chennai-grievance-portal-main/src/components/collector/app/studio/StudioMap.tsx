"use client";

/**
 * The dataset on the district map: a quiet grey street map (sharp on any screen, night-dark in the night theme;
 * components/map/basemap.ts) with ward outlines, wards shaded by the dataset's value (per ward, or per zone for every
 * ward of the zone), and bubbles for the localities the rows name. Clicking a zone narrows every panel of the dataset to
 * it (the page's cross-filter); the zone in focus is outlined.
 */
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { MapGeo } from "@/lib/collector/geo";
import { fmtNum, type PanelData } from "@/lib/studio/types";
import { esc } from "../SatMap";
import { reduced } from "./client";
import { I } from "../icons";
import { addBasemap, type Tone } from "@/components/map/basemap";

const RAMP = ["#BBF7D0", "#86EFAC", "#4ADE80", "#16A34A", "#15803D", "#14532D"];
const color = (t: number) => RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.floor(t * (RAMP.length - 0.001))))];
/** lines and the "no value" veil: pale over the night map, slate and white over the light one */
const INK: Record<Tone, { ward: string; zone: string; sel: string; none: string }> = {
  dark: { ward: "#C7D2FE", zone: "#E0E7FF", sel: "#FFFFFF", none: "#020617" },
  light: { ward: "#64748B", zone: "#334155", sel: "#0F172A", none: "#FFFFFF" }
};

/** A numbered pin (Thunai's Stage): the items being talked about pulse (`hot`). */
export interface MapPin { n: number | null; id: string; lat: number; lon: number; label: string; sev: string | null; hot: boolean }
interface Props { geo: MapGeo | null; panel: PanelData; focusZone: number | null; onZone?: (z: number) => void; pins?: MapPin[]; outline?: number[]; onPin?: (i: number) => void }

interface St { L: typeof Leaflet; map: Leaflet.Map; wards: { ward: number; zone: number; taluk: string | null; poly: Leaflet.Polygon }[]; zones: Leaflet.Polyline[]; bubbles: Leaflet.LayerGroup; sel: Leaflet.LayerGroup; pins: Leaflet.LayerGroup; district: Leaflet.LatLngBounds }

export default function StudioMap({ geo, panel, focusZone, onZone, pins, outline, onPin }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const st = useRef<St | null>(null);
  const cb = useRef({ onZone, panel, onPin });
  cb.current = { onZone, panel, onPin };
  const [ready, setReady] = useState(0);
  const [tone, setTone] = useState<Tone>("light");

  useEffect(() => {
    if (!geo || !el.current) return;
    let dead = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (dead || !el.current) return;
      const map = L.map(el.current, { zoomControl: false, zoomSnap: 0.25, minZoom: 9, maxZoom: 17, attributionControl: true, scrollWheelZoom: true });
      map.attributionControl.setPrefix(false);
      // the quiet street map: shaded wards read better on grey than on a photograph; its names wait for street zoom
      const base = addBasemap(L, map, "map", { quiet: true, namesFrom: 13 });
      setTone(base.tone);
      base.onTone(setTone);
      const ink = INK[base.tone];
      const wards = geo.wards.map((w) => {
        const poly = L.polygon(w.rings, { color: ink.ward, weight: 0.5, opacity: 0.35, fillOpacity: 0 })
          .on("click", () => cb.current.onZone?.(w.zone))
          .bindTooltip(() => tip(w.ward, w.zone, cb.current.panel, geo), { sticky: true, className: "dtip", direction: "top", offset: [0, -8] })
          .addTo(map);
        return { ward: w.ward, zone: w.zone, taluk: w.taluk, poly };
      });
      const zones = geo.zones.map((z) => L.polyline(z.lines, { color: ink.zone, weight: 1.2, opacity: 0.6, interactive: false }).addTo(map));
      const district = L.latLngBounds([]);
      for (const w of wards) district.extend(w.poly.getBounds());
      map.fitBounds(district, { padding: [6, 6] });
      st.current = { L, map, wards, zones, district, bubbles: L.layerGroup().addTo(map), sel: L.layerGroup().addTo(map), pins: L.layerGroup().addTo(map) };
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(el.current);
      setReady((n) => n + 1);
    })();
    return () => { dead = true; ro?.disconnect(); st.current?.map.remove(); st.current = null; };
  }, [geo]);

  // ---- shading and bubbles (and the lines, in the colours that read on the base map now)
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    const ink = INK[tone];
    for (const z of s.zones) z.setStyle({ color: ink.zone });
    s.sel.eachLayer((l) => (l as Leaflet.Polyline).setStyle({ color: ink.sel }));
    const val = new Map<string | number, number>(panel.keys.map((k, i) => [k, panel.values[i]]));
    const max = Math.max(1, ...panel.values);
    const valueOf = (w: St["wards"][number]) => (panel.geo === "ward" ? val.get(w.ward) : panel.geo === "zone" ? val.get(w.zone) : panel.geo === "taluk" ? val.get(w.taluk ?? "") : undefined);
    for (const w of s.wards) {
      const v = valueOf(w);
      if (v == null || panel.geo === "place") w.poly.setStyle({ fillColor: ink.none, fillOpacity: panel.geo === "place" ? 0.18 : 0.42, opacity: 0.25, color: ink.ward });
      else w.poly.setStyle({ fillColor: color(v / max), fillOpacity: 0.28 + 0.4 * Math.sqrt(v / max), opacity: 0.45, color: ink.ward });
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
  }, [ready, panel, tone]);

  // ---- numbered pins (the Stage): drawn over the shading, the hot ones pulse
  const pinKey = JSON.stringify(pins?.map((p) => [p.id, p.hot]) ?? []);
  const pinIds = (pins ?? []).map((p) => p.id).join(",");
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    s.pins.clearLayers();
    (pins ?? []).forEach((p, i) => {
      const cls = `st-pin${p.hot ? " hot" : ""}${p.sev ? ` sev-${p.sev.toLowerCase()}` : ""}${p.n == null ? " ring" : ""}`;
      s.L.marker([p.lat, p.lon], { icon: s.L.divIcon({ className: "", html: `<div class="${cls}"><b>${p.n ?? ""}</b></div>`, iconSize: [0, 0] }), zIndexOffset: p.hot ? 900 : p.n ? 500 - p.n : 0, keyboard: false })
        .bindTooltip(esc(p.label), { className: "dtip", direction: "top", offset: [0, -12] })
        .on("click", () => cb.current.onPin?.(i))
        .addTo(s.pins);
    });
  }, [ready, pinKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the zone in focus (or the Stage's outlined zones, or its pins)
  const outlineKey = (outline ?? []).join(",");
  useEffect(() => {
    const s = st.current;
    if (!s || !geo) return;
    s.sel.clearLayers();
    if (pins?.length || outline?.length) {
      const b = s.L.latLngBounds([]);
      for (const z of outline ?? []) {
        const zz = geo.zones.find((x) => x.zone === z);
        if (zz) s.L.polyline(zz.lines, { color: INK[tone].sel, weight: 2.4, opacity: 0.95, interactive: false }).addTo(s.sel);
        for (const w of s.wards) if (w.zone === z) b.extend(w.poly.getBounds());
      }
      for (const p of pins ?? []) if (p.n != null || !b.isValid()) b.extend([p.lat, p.lon]);
      if (b.isValid()) s.map.flyToBounds(b.pad(0.08), { padding: [24, 24], duration: 0.6, maxZoom: 15, animate: !reduced() });
      return;
    }
    if (focusZone) {
      const z = geo.zones.find((x) => x.zone === focusZone);
      if (z) s.L.polyline(z.lines, { color: INK[tone].sel, weight: 2.6, opacity: 1, interactive: false }).addTo(s.sel);
      const b = s.L.latLngBounds([]);
      for (const w of s.wards) if (w.zone === focusZone) b.extend(w.poly.getBounds());
      if (b.isValid()) s.map.flyToBounds(b, { padding: [20, 20], duration: 0.6 });
    } else s.map.flyToBounds(s.district, { padding: [6, 6], duration: 0.6 });
    // the fit follows which pins are shown, not which one is being read (that would undo the Collector's own pan)
  }, [ready, focusZone, geo, outlineKey, pinIds]); // eslint-disable-line react-hooks/exhaustive-deps

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
