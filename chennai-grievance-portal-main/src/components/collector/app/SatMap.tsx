"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { MapGeo } from "@/lib/collector/geo";
import { I } from "./icons";
import { CAT_COL, type Row } from "./lib";

export interface MapStation { id: string; name: string; kind: "aqi" | "rain" | "lake"; lat: number; lon: number; label: string }

export const STATION_STYLE: Record<MapStation["kind"], { color: string; letter: string; title: string }> = {
  aqi: { color: "#34D399", letter: "A", title: "Air quality station" },
  rain: { color: "#38BDF8", letter: "R", title: "Rain gauge" },
  lake: { color: "#818CF8", letter: "L", title: "Lake / reservoir" }
};

interface Props {
  geo: MapGeo | null;
  /** incidents per zone, for the heat shading */
  zoneCounts: Record<string, number>;
  pins: Row[];
  zone: number | null;
  layers: Record<string, boolean>;
  stations: MapStation[];
  /** items from sources the Collector added that name a place (lat/lon of the place) */
  added: Row[];
  /** zones (GCC) or revenue taluks */
  mode: "zones" | "taluks";
  taluk: string | null;
  /** incident to fly to and ring */
  focus: { id: string; lat: number; lon: number } | null;
  onZone: (zone: number) => void;
  onTaluk: (taluk: string) => void;
  onPin: (id: string) => void;
  onStation: (s: MapStation) => void;
  onItem: (item: Row) => void;
  zoneTip: (zone: number) => string;
  /** pin colour; defaults to the Collector's severe / complaint / other colours (the officer console colours by severity) */
  pinColor?: (pin: Row) => string;
}

/** zone shading: indigo, warming to rose where the most incidents were reported */
const HEAT = [
  { c: "#000000", o: 0 },
  { c: "#818CF8", o: 0.14 },
  { c: "#818CF8", o: 0.24 },
  { c: "#A78BFA", o: 0.3 },
  { c: "#FB7185", o: 0.34 }
];
/** taluks: one coordinated set of tones, so neighbours stand apart */
const TALUK_COL = ["#818CF8", "#38BDF8", "#34D399", "#FBBF24", "#FB7185", "#A78BFA", "#2DD4BF", "#F472B6", "#A3E635"];

interface State {
  L: typeof Leaflet;
  map: Leaflet.Map;
  wards: { zone: number; taluk: string | null; poly: Leaflet.Polygon }[];
  zoneLabels: Map<number, Leaflet.Marker>;
  talukLabels: Map<string, Leaflet.Marker>;
  outlines: Leaflet.Polyline[];
  sel: Leaflet.LayerGroup;
  pins: Leaflet.LayerGroup;
  stations: Leaflet.LayerGroup;
  added: Leaflet.LayerGroup;
  focus: Leaflet.LayerGroup;
  district: Leaflet.LatLngBounds;
  zoneBounds: Map<number, Leaflet.LatLngBounds>;
  talukBounds: Map<string, Leaflet.LatLngBounds>;
  /** hides zone or taluk names that would overlap another name */
  declutter: () => void;
}

/** Satellite map of the district: ward heat or taluk colours, zone outlines, incident pins and stations. */
export default function SatMap(props: Props) {
  const { geo, zoneCounts, pins, zone, layers, stations, added, mode, taluk, focus } = props;
  const el = useRef<HTMLDivElement>(null);
  const st = useRef<State | null>(null);
  const cb = useRef(props);
  cb.current = props;
  const [ready, setReady] = useState(0);

  // ---- create the map once the outlines are loaded
  useEffect(() => {
    if (!geo || !el.current) return;
    let dead = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (dead || !el.current) return;
      const map = L.map(el.current, { zoomControl: false, zoomSnap: 0.25, zoomDelta: 0.5, minZoom: 9, maxZoom: 18, attributionControl: true });
      map.attributionControl.setPrefix(false);
      // markers and zone names scale with the zoom: small over the whole district, larger as the Collector zooms in
      const box = el.current;
      const scale = () => box.style.setProperty("--pz", String(Math.max(0.7, Math.min(1.45, 0.7 + (map.getZoom() - 11) * 0.25))));
      map.on("zoomend", scale);
      scale();
      // zone and taluk names never overlap: a name that would cover another (the selected one wins) waits for a closer zoom
      const declutter = () => {
        const ls = [...box.querySelectorAll<HTMLElement>(".zlbl")]
          .sort((a, b) => Number(b.classList.contains("zsel")) - Number(a.classList.contains("zsel")));
        const taken: DOMRect[] = [];
        for (const l of ls) {
          l.style.visibility = "";
          const r = l.getBoundingClientRect();
          if (taken.some((t) => r.left < t.right + 4 && r.right > t.left - 4 && r.top < t.bottom + 1 && r.bottom > t.top - 1)) l.style.visibility = "hidden";
          else taken.push(r);
        }
      };
      map.on("zoomend moveend", declutter);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics"
      }).addTo(map);
      // Road and place names once zoomed in, so the district view stays uncluttered.
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19, minZoom: 13, opacity: 0.55
      }).addTo(map);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19, minZoom: 13, opacity: 0.9
      }).addTo(map);

      const talukName = new Map(geo.taluks.map((t) => [t.code, t.name]));
      const zoneBounds = new Map<number, Leaflet.LatLngBounds>();
      const talukBounds = new Map<string, Leaflet.LatLngBounds>();
      const grow = <K,>(m: Map<K, Leaflet.LatLngBounds>, k: K, b: Leaflet.LatLngBounds) =>
        m.set(k, m.get(k)?.extend(b) ?? L.latLngBounds(b.getSouthWest(), b.getNorthEast()));
      const wards = geo.wards.map((w) => {
        const poly = L.polygon(w.rings, { color: "#9FB4D9", weight: 0.6, opacity: 0.35, fillOpacity: 0 })
          .on("click", () => {
            if (cb.current.mode === "taluks") { if (w.taluk) cb.current.onTaluk(w.taluk); }
            else cb.current.onZone(w.zone);
          })
          .bindTooltip(() => cb.current.mode === "taluks"
            ? `<b>${esc(talukName.get(w.taluk ?? "") ?? "Taluk not known")} taluk</b><span style="opacity:.7">Ward ${w.ward} · click to filter to this taluk</span>`
            : cb.current.zoneTip(w.zone) + `<span style="opacity:.7">Ward ${w.ward}</span>`,
          { sticky: true, className: "dtip", direction: "top", offset: [0, -10] })
          .addTo(map);
        const b = poly.getBounds();
        grow(zoneBounds, w.zone, b);
        if (w.taluk) grow(talukBounds, w.taluk, b);
        return { zone: w.zone, taluk: w.taluk, poly };
      });
      const outlines = geo.zones.map((z) => L.polyline(z.lines, { color: "#C9D7F2", weight: 1.4, opacity: 0.75, interactive: false }).addTo(map));
      const zoneLabels = new Map<number, Leaflet.Marker>();
      for (const z of geo.zones) {
        zoneLabels.set(z.zone, L.marker([z.lat, z.lon], {
          icon: L.divIcon({ className: "", html: `<div class="zlbl">${esc(z.name)}</div>`, iconSize: [0, 0] }), interactive: false, keyboard: false
        }));
      }
      const talukLabels = new Map<string, Leaflet.Marker>();
      for (const t of geo.taluks) {
        const b = talukBounds.get(t.code);
        const at = b ? b.getCenter() : L.latLng(t.lat, t.lon);
        talukLabels.set(t.code, L.marker(at, {
          icon: L.divIcon({ className: "", html: `<div class="zlbl tlbl">${esc(t.name)}</div>`, iconSize: [0, 0] }), interactive: false, keyboard: false
        }));
      }
      const district = L.latLngBounds([]);
      zoneBounds.forEach((b) => district.extend(b));
      map.fitBounds(district, { padding: [8, 8] });

      st.current = {
        L, map, wards, zoneLabels, talukLabels, outlines, zoneBounds, talukBounds, district, declutter,
        sel: L.layerGroup().addTo(map),
        pins: L.layerGroup().addTo(map),
        stations: L.layerGroup().addTo(map),
        added: L.layerGroup().addTo(map),
        focus: L.layerGroup().addTo(map)
      };
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(el.current);
      setReady((n) => n + 1);
    })();
    return () => {
      dead = true;
      ro?.disconnect();
      st.current?.map.remove();
      st.current = null;
    };
  }, [geo]);

  // ---- shading, labels and the selected zone or taluk
  useEffect(() => {
    const s = st.current;
    if (!s || !geo) return;
    const talukIx = new Map(geo.taluks.map((t, k) => [t.code, k]));
    const mx = Math.max(1, ...Object.values(zoneCounts));
    const level = (z: number) => {
      const c = zoneCounts[z] || 0;
      return c === 0 ? 0 : Math.min(4, 1 + Math.floor((c / mx) * 3.999));
    };
    for (const w of s.wards) {
      if (mode === "taluks") {
        const col = TALUK_COL[(talukIx.get(w.taluk ?? "") ?? 0) % TALUK_COL.length];
        if (taluk && w.taluk !== taluk) w.poly.setStyle({ fillColor: "#020814", fillOpacity: 0.55, opacity: 0.15, color: "#9FB4D9", weight: 0.5 });
        else w.poly.setStyle({ fillColor: col, fillOpacity: taluk ? 0.1 : 0.26, opacity: 0.3, color: "#9FB4D9", weight: 0.5 });
      } else if (zone && w.zone !== zone) w.poly.setStyle({ fillColor: "#020814", fillOpacity: 0.55, opacity: 0.18 });
      else if (zone) w.poly.setStyle({ fillColor: "#818CF8", fillOpacity: 0.1, opacity: 0.55 });
      else {
        const h = HEAT[level(w.zone)];
        w.poly.setStyle({ fillColor: h.c, fillOpacity: h.o, opacity: 0.35 });
      }
    }
    for (const o of s.outlines) o.setStyle({ opacity: mode === "taluks" ? 0.3 : 0.75, weight: mode === "taluks" ? 1 : 1.4 });
    s.zoneLabels.forEach((m, z) => {
      if (mode === "zones") {
        m.addTo(s.map);
        const e = m.getElement()?.firstElementChild as HTMLElement | undefined;
        if (e) {
          e.className = `zlbl${zone === z ? " zsel" : ""}`;
          e.style.opacity = zone && zone !== z ? "0.45" : "1";
        }
      } else m.remove();
    });
    s.talukLabels.forEach((m, code) => {
      if (mode === "taluks") {
        m.addTo(s.map);
        const e = m.getElement()?.firstElementChild as HTMLElement | undefined;
        if (e) {
          e.className = `zlbl tlbl${taluk === code ? " zsel" : ""}`;
          e.style.opacity = taluk && taluk !== code ? "0.45" : "1";
        }
      } else m.remove();
    });
    s.sel.clearLayers();
    let target: Leaflet.LatLngBounds | undefined;
    if (mode === "taluks" && taluk) target = s.talukBounds.get(taluk);
    else if (zone) {
      const g = geo.zones.find((z) => z.zone === zone);
      if (g) s.L.polyline(g.lines, { color: "#FFFFFF", weight: 2.4, opacity: 0.95, interactive: false }).addTo(s.sel);
      target = s.zoneBounds.get(zone);
    }
    if (!cb.current.focus) s.map.flyToBounds(target ?? s.district, { padding: target ? [24, 24] : [8, 8], duration: 0.6 });
    requestAnimationFrame(() => st.current?.declutter());
  }, [ready, zoneCounts, zone, geo, mode, taluk]);

  // ---- incident pins
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    s.pins.clearLayers();
    const shown = pins.filter((p) => p.lat != null && layers[p.cat]).slice(0, 150).reverse();
    for (const p of shown) {
      const open = Number(p.open) === 1;
      // the dot is centred on the point by CSS and sized by --s x the zoom scale (--pz)
      const size = p.sev === "Severe" ? 11 : 8;
      const color = cb.current.pinColor?.(p) ?? CAT_COL[p.cat];
      const html = `<div class="mpin${open ? "" : " faded"}${open && p.sev === "Severe" ? " pulse" : ""}" style="--s:${size}px;background:${color};--mc:${color}"></div>`;
      s.L.marker([Number(p.lat), Number(p.lon)], {
        icon: s.L.divIcon({ className: "", html, iconSize: [0, 0], iconAnchor: [0, 0] }),
        zIndexOffset: p.sev === "Severe" ? 500 : 0
      })
        .on("click", () => cb.current.onPin(p.id))
        .bindTooltip(`<b>${esc(p.title ?? "Incident")}</b>${esc(p.sev)} · ${esc(p.status)}`, { className: "dtip", direction: "top", offset: [0, -8] })
        .addTo(s.pins);
    }
  }, [ready, pins, layers]);

  // ---- items from added sources: indigo diamonds; items naming the same place fan out slightly
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    s.added.clearLayers();
    if (!layers.added) return;
    const at = new Map<string, number>();
    for (const i of added) {
      const k = `${i.lat},${i.lon}`;
      const n = at.get(k) ?? 0;
      at.set(k, n + 1);
      const lat = Number(i.lat) + (n ? 0.0012 * Math.sin(n * 2.1) : 0), lon = Number(i.lon) + (n ? 0.0012 * Math.cos(n * 2.1) : 0);
      s.L.marker([lat, lon], {
        icon: s.L.divIcon({ className: "", html: `<div class="madd${i.is_incident ? "" : " gen"}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] }),
        zIndexOffset: 300
      })
        .on("click", () => cb.current.onItem(i))
        .bindTooltip(`<b>${esc(i.title)}</b>${esc(i.source)} · ${esc(i.place ?? i.zone_name ?? "")}<br><span style="opacity:.7">From an added source · click to open</span>`,
          { className: "dtip", direction: "top", offset: [0, -8] })
        .addTo(s.added);
    }
  }, [ready, added, layers.added]);

  // ---- the incident chosen in a list: fly to it and ring it
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    s.focus.clearLayers();
    if (!focus) return;
    s.L.marker([focus.lat, focus.lon], {
      icon: s.L.divIcon({ className: "", html: `<div class="mfocus"></div>`, iconSize: [44, 44], iconAnchor: [22, 22] }), interactive: false, zIndexOffset: 1000
    }).addTo(s.focus);
    s.map.flyTo([focus.lat, focus.lon], Math.max(s.map.getZoom(), 14.5), { duration: 0.7 });
  }, [ready, focus]);

  // ---- environment stations
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    s.stations.clearLayers();
    if (!layers.stations) return;
    for (const x of stations) {
      const sty = STATION_STYLE[x.kind];
      s.L.marker([x.lat, x.lon], {
        icon: s.L.divIcon({ className: "", html: `<div class="mst" style="background:${sty.color};color:#0B1020">${sty.letter}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] })
      })
        .on("click", () => cb.current.onStation(x))
        .bindTooltip(`<b>${esc(x.name)}</b>${sty.title} · ${esc(x.label)}`, { className: "dtip", direction: "top", offset: [0, -10] })
        .addTo(s.stations);
    }
  }, [ready, stations, layers.stations]);

  const fitView = () => {
    const s = st.current;
    if (!s) return;
    s.focus.clearLayers();
    const b = mode === "taluks" && taluk ? s.talukBounds.get(taluk) : zone ? s.zoneBounds.get(zone) : undefined;
    s.map.flyToBounds(b ?? s.district, { padding: [8, 8], duration: 0.5 });
  };
  const m = () => st.current?.map;
  return (
    <>
      <div ref={el} style={{ position: "absolute", inset: 0 }} aria-label="Satellite map of Chennai district. Click a zone or taluk to filter, a pin to open the incident." />
      {!geo && <div className="empty" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--text-3)" }}>Loading the map…</div>}
      <div className="map-tools">
        <button onClick={() => m()?.zoomIn()} title="Zoom in" aria-label="Zoom in">+</button>
        <button onClick={() => m()?.zoomOut()} title="Zoom out" aria-label="Zoom out">−</button>
        <button onClick={fitView} title="Fit the view" aria-label="Fit the view"><I n="expand" /></button>
      </div>
    </>
  );
}

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}
