"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { MapGeo } from "@/lib/collector/geo";
import { I } from "./icons";
import { CAT_COL, type Row } from "./lib";
import type { MapAsk } from "./askmap/useMapAsk";
import { createAnswerLayers, clearAnswer, corridorWeights, drawAnswer, drawHeat, drawPins, markPins, type AnswerLayers } from "./askmap/answerLayers";
import { cameraFor, type Shot } from "@/lib/map/camera";
import "./askmap/askmap.css";

export interface MapStation { id: string; name: string; kind: "aqi" | "rain" | "lake"; lat: number; lon: number; label: string }

export const STATION_STYLE: Record<MapStation["kind"], { color: string; letter: string; title: string }> = {
  aqi: { color: "#34D399", letter: "A", title: "Air quality station" },
  rain: { color: "#7FD3E6", letter: "R", title: "Rain gauge" },
  lake: { color: "#3B82F6", letter: "L", title: "Lake / reservoir" }
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
  // ---- Ask the Map (all optional: without them the map is exactly as it was)
  /** the question's state: its answer is drawn above the console's pins, which dim to 25 % */
  ask?: MapAsk | null;
  /** the map card fills the page: scale bar, right-click and ward-click "what is happening here?", the circle tool */
  grown?: boolean;
  /** extra buttons for the right-hand tools (Layers, Back to the answer, the circle tool) */
  extraTools?: React.ReactNode;
  /** base map */
  base?: "sat" | "streets";
  /** facility and water layers switched on from the Layers menu */
  overlays?: { id: string; kind: string; features: { id: string; name: string | null; lat?: number; lon?: number; lines?: [number, number][][]; polys?: [number, number][][][] }[] }[];
  /** the answer as a heat layer */
  heat?: boolean;
  /** the circle tool is on: drag a circle on the map */
  drawCircle?: boolean;
  onDrawn?: () => void;
  /** an answer pin clicked twice: open the incident */
  onAskOpen?: (id: string) => void;
}

/** zone shading: sea cyan, warming to coral and red where the most incidents were reported */
const HEAT = [
  { c: "#000000", o: 0 },
  { c: "#22B8D0", o: 0.16 },
  { c: "#F2B33D", o: 0.24 },
  { c: "#F07A4A", o: 0.32 },
  { c: "#F0414F", o: 0.38 }
];
/** taluks: one coordinated set of tones, so neighbours stand apart */
const TALUK_COL = ["#22B8D0", "#3B82F6", "#34D399", "#F2C94C", "#F0414F", "#FF8466", "#FFA24C", "#F472B6", "#A3E635"];

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
  /** Ask the Map's own layers, above the console's */
  answer: AnswerLayers;
  streets: Leaflet.TileLayer;
  sat: Leaflet.TileLayer;
  overlay: Leaflet.LayerGroup;
  scale: Leaflet.Control.Scale | null;
  /** the camera is moving the map (not the user) */
  prog: boolean;
  follow: number | null;
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
      const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics"
      }).addTo(map);
      // the Streets base map of Ask the Map's tools (added only when chosen)
      const streets = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19, attribution: "Map © Esri, HERE, Garmin, OpenStreetMap contributors"
      });
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
        const poly = L.polygon(w.rings, { color: "#9FB4D9", weight: 0.6, opacity: 0.35, fillOpacity: 0, className: "wpoly" })
          .on("click", () => {
            // grown for Ask the Map, a ward click asks "What is happening here?"
            if (cb.current.grown && cb.current.ask && !cb.current.drawCircle) { cb.current.ask.draw({ ward: w.ward }); return; }
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
      const outlines = geo.zones.map((z) => L.polyline(z.lines, { color: "#D6DEEA", weight: 1.4, opacity: 0.75, interactive: false }).addTo(map));
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
        focus: L.layerGroup().addTo(map),
        answer: createAnswerLayers(L, map), streets, sat, overlay: L.layerGroup().addTo(map), scale: null, prog: false, follow: null
      };
      // the user's hand wins: a drag, a wheel or a pinch while the camera flies stops it, and it stays put
      const took = () => {
        const s = st.current;
        if (!s) return;
        if (s.follow != null) { cancelAnimationFrame(s.follow); s.follow = null; }
        if (s.prog) { s.prog = false; map.stop(); }
        const a = cb.current.ask;
        if (a?.resp && !a.tookOver) { a.setTookOver(true); camera(box, { took: true }); }
      };
      for (const ev of ["wheel", "mousedown", "touchstart", "keydown"]) box.addEventListener(ev, (e) => { if (!(e.target as HTMLElement).closest(".map-tools,.amp,.leaflet-marker-icon")) took(); }, { passive: true });
      map.on("moveend", () => { const s = st.current; if (s && s.follow == null) s.prog = false; });
      map.on("zoomend", () => { const s = st.current; if (s) corridorWeights(map, s.answer); });
      // right-click (or long-press) a spot: "What is happening here?" in a 500 m circle
      map.on("contextmenu", (e: Leaflet.LeafletMouseEvent) => {
        const a = cb.current.ask;
        if (!a || !cb.current.grown) return;
        a.draw({ lat: e.latlng.lat, lon: e.latlng.lng, r: 500 });
      });
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
      else if (zone) w.poly.setStyle({ fillColor: "#22B8D0", fillOpacity: 0.1, opacity: 0.55 });
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
    // (while an answer is on the map, the camera belongs to the answer)
    if (!cb.current.focus && !cb.current.ask?.resp) s.map.flyToBounds(target ?? s.district, { padding: target ? [24, 24] : [8, 8], duration: 0.6 });
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
        zIndexOffset: p.sev === "Severe" ? 500 : 0, title: `${p.sev}: ${p.title ?? "Incident"}, ${p.status}`
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
        zIndexOffset: 300, title: `${i.title}, from ${i.source}`
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
        icon: s.L.divIcon({ className: "", html: `<div class="mst" style="background:${sty.color};color:#0B1020">${sty.letter}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
        title: `${sty.title}: ${x.name}, ${x.label}`
      })
        .on("click", () => cb.current.onStation(x))
        .bindTooltip(`<b>${esc(x.name)}</b>${sty.title} · ${esc(x.label)}`, { className: "dtip", direction: "top", offset: [0, -10] })
        .addTo(s.stations);
    }
  }, [ready, stations, layers.stations]);

  // ---------------------------------------------------------------- Ask the Map --
  const ask = props.ask ?? null;
  const resp = ask?.resp ?? null;
  const [fanned, setFanned] = useState<string | null>(null);
  const [zoomTick, setZoomTick] = useState(0);
  const lastSeq = useRef(-1);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // the console's own pins dim while an answer is shown; they come back when it is cleared, and so does the view
  const hadAnswer = useRef(false);
  useEffect(() => {
    const on = !!resp && (resp.kind === "answer" || resp.kind === "brief");
    el.current?.classList.toggle("ask-dim", on);
    if (hadAnswer.current && !resp && st.current) {
      const s = st.current;
      s.answer.focus.clearLayers();
      const b = mode === "taluks" && taluk ? s.talukBounds.get(taluk) : zone ? s.zoneBounds.get(zone) : undefined;
      s.map.flyToBounds(b ?? s.district, { padding: b ? [24, 24] : [8, 8], duration: reduced ? 0 : 0.6, animate: !reduced });
      if (el.current) delete el.current.dataset.camera;
    }
    hadAnswer.current = !!resp;
  }, [resp]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    const on = () => setZoomTick((n) => n + 1);
    s.map.on("zoomend", on);
    return () => { s.map.off("zoomend", on); };
  }, [ready]);
  // areas, rings, corridors, facilities: redrawn with each answer
  useEffect(() => {
    const s = st.current;
    if (!s || !geo) return;
    setFanned(null);
    if (!resp || (resp.kind !== "answer" && resp.kind !== "brief")) { clearAnswer(s.answer); return; }
    drawAnswer(s.L, s.map, s.answer, resp, {
      geo, lang: resp.lang, showBefore: !!ask?.showBefore, drop: false, reduced, onPin: () => undefined,
      onGroup: (ids, label) => cb.current.ask?.setSpot({ ids, label })
    });
    // OpenStreetMap layers carry their licence on the map
    const osm = resp.asOf.layers.some((l) => l.source === "OpenStreetMap");
    s.map.attributionControl[osm ? "addAttribution" : "removeAttribution"]("© OpenStreetMap contributors (ODbL)");
  }, [ready, resp, geo]); // eslint-disable-line react-hooks/exhaustive-deps
  // the pins: on each answer (dropping in by priority), and again when the zoom changes the clustering
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    if (!resp || resp.kind !== "answer") { s.answer.pins.clearLayers(); return; }
    const fresh = lastSeq.current !== ask?.cue.seq;
    lastSeq.current = ask?.cue.seq ?? -1;
    drawPins(s.L, s.map, s.answer, resp, {
      geo: geo!, lang: resp.lang, showBefore: !!ask?.showBefore, drop: fresh && !reduced, reduced, only: ask?.spot ? new Set(ask.spot.ids) : null, fanned,
      onFan: setFanned, onGroup: () => undefined,
      pinColor: cb.current.pinColor ? (f) => cb.current.pinColor!({ sev: f.sev, open: f.open ? 1 : 0, cat: f.sev === "Severe" ? "severe" : f.citizen ? "complaint" : "other" } as Row) : undefined,
      onPin: (id) => {
        const a = cb.current.ask;
        if (!a) return;
        // the first click flies to the case and rings it; a second click opens its reports
        if (a.focus === id) (cb.current.onAskOpen ?? cb.current.onPin)(id);
        else a.setFocus(id);
      }
    });
    markPins(el.current!, ask?.hover ?? null, ask?.focus ?? null);
  }, [ready, resp, ask?.showBefore, ask?.spot, fanned, zoomTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (el.current) markPins(el.current, ask?.hover ?? null, ask?.focus ?? null); }, [ask?.hover, ask?.focus]);
  // a list row or pin chosen: fly to it at zoom 16 and ring it
  useEffect(() => {
    const s = st.current;
    if (!s || !resp) return;
    s.answer.focus.clearLayers();
    const f = ask?.focus ? resp.features.find((x) => x.id === ask.focus) ?? resp.before.find((x) => x.id === ask.focus) : null;
    if (!f || !f.pinnable) return;
    s.L.marker([f.lat, f.lon], { pane: "askPins", icon: s.L.divIcon({ className: "", html: `<div class="mfocus"></div>`, iconSize: [44, 44], iconAnchor: [22, 22] }), interactive: false, zIndexOffset: 2000 }).addTo(s.answer.focus);
    s.prog = true;
    const pad = panelPad(el.current!);
    const p = s.map.project([f.lat, f.lon], Math.max(s.map.getZoom(), 16));
    const target = s.map.unproject(p.subtract(s.L.point((pad.tl[0] - pad.br[0]) / 2, (pad.tl[1] - pad.br[1]) / 2)), Math.max(s.map.getZoom(), 16));
    if (reduced) s.map.setView(target, Math.max(s.map.getZoom(), 16), { animate: false });
    else s.map.flyTo(target, Math.max(s.map.getZoom(), 16), { duration: 0.8 });
    camera(el.current!, { kind: "point", target: f.id, user_took_over: false });
  }, [ask?.focus]); // eslint-disable-line react-hooks/exhaustive-deps
  // the camera: each new answer flies the map to it (never under the panel); the user's hand wins until the next question
  useEffect(() => {
    const s = st.current;
    if (!s || !resp || !ask || !ask.cue.move) return;
    if (resp.kind !== "answer" && resp.kind !== "brief") return;
    const pad = panelPad(el.current!);
    const c = s.map.getCenter();
    const shots = cameraFor(resp.camera, { width: el.current!.offsetWidth, height: el.current!.offsetHeight, padTopLeft: pad.tl, padBottomRight: pad.br, reducedMotion: reduced, from: { lat: c.lat, lon: c.lng } });
    const shot = shots[Math.min(ask.cue.index, shots.length - 1)];
    if (shot) play(s, shot, el.current!, () => cb.current.ask?.tookOver ?? false);
  }, [ask?.cue.seq, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  // the heat view: where the answer is dense, as one coloured layer (the pins fade under it)
  const heatLayer = useRef<Leaflet.Layer | null>(null);
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    heatLayer.current?.remove();
    heatLayer.current = null;
    const on = !!props.heat && !!resp && resp.kind === "answer" && resp.features.length > 0;
    el.current?.classList.toggle("ask-heat", on);
    if (!on) return;
    const w = { Severe: 1.6, High: 1.25, Medium: 1, Low: 0.8 } as Record<string, number>;
    heatLayer.current = drawHeat(s.L, s.map, resp!.features.map((f) => ({ lat: f.lat, lon: f.lon, w: w[f.sev] ?? 1 }))).addTo(s.map);
  }, [ready, resp, props.heat]); // eslint-disable-line react-hooks/exhaustive-deps

  // the officer's visit order: numbered stops and straight legs; a click on the map starts the route there
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    s.map.eachLayer((l) => { if ((l as Leaflet.Layer & { _visit?: boolean })._visit) s.map.removeLayer(l); });
    const route = ask?.route;
    if (!route?.stops.length) return;
    const L = s.L;
    const pts: [number, number][] = [...(route.start ? [[route.start.lat, route.start.lon] as [number, number]] : []), ...route.stops.map((x) => [x.lat, x.lon] as [number, number])];
    const line = L.polyline(pts, { pane: "askMarks", color: "#FFD24A", weight: 3, dashArray: "8 6", interactive: false }) as Leaflet.Polyline & { _visit?: boolean };
    line._visit = true;
    line.addTo(s.map);
    route.stops.forEach((x, k) => {
      const m = L.marker([x.lat, x.lon], { pane: "askMarks", zIndexOffset: 3000, title: `Stop ${k + 1}: ${x.title}`,
        icon: L.divIcon({ className: "", html: `<div class="avisit">${k + 1}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }) }) as Leaflet.Marker & { _visit?: boolean };
      m._visit = true;
      m.addTo(s.map);
    });
    s.prog = true;
    s.map.flyToBounds(L.latLngBounds(pts), { paddingTopLeft: L.point(panelPad(el.current!).tl[0], 40), paddingBottomRight: L.point(60, 40), maxZoom: 15, duration: reduced ? 0 : 0.8, animate: !reduced });
    const click = (e: Leaflet.LeafletMouseEvent) => {
      const a = cb.current.ask;
      if (a?.route && a.resp) import("./askmap/actions").then((m) => a.setRoute(m.visitOrder(a.resp!, { lat: e.latlng.lat, lon: e.latlng.lng })));
    };
    s.map.on("click", click);
    return () => { s.map.off("click", click); };
  }, [ready, ask?.route]); // eslint-disable-line react-hooks/exhaustive-deps
  // grown: the metric scale bar; the base map; layers switched on from the Layers menu
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    if (props.grown && !s.scale) s.scale = s.L.control.scale({ imperial: false, position: "bottomleft" }).addTo(s.map);
    if (!props.grown && s.scale) { s.scale.remove(); s.scale = null; }
    setTimeout(() => s.map.invalidateSize(), 360);
  }, [ready, props.grown]);
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    if (props.base === "streets") { s.streets.addTo(s.map); s.sat.remove(); } else { s.sat.addTo(s.map); s.streets.remove(); }
  }, [ready, props.base]);
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    s.overlay.clearLayers();
    const rend = s.L.canvas({ padding: 0.3 });
    for (const o of props.overlays ?? []) {
      for (const f of o.features) {
        if (f.lat != null && f.lon != null) s.L.circleMarker([f.lat, f.lon], { renderer: rend, radius: 4, color: "#fff", weight: 1, fillColor: OVERLAY_COL[o.id] ?? "#94A3B8", fillOpacity: 0.95 })
          .bindTooltip(`<b>${esc(f.name ?? "")}</b>${esc(o.id.replace(/_/g, " "))} · OpenStreetMap`, { className: "dtip" }).addTo(s.overlay);
        else if (f.lines) s.L.polyline(f.lines, { renderer: rend, color: "#38BDF8", weight: 2, opacity: 0.8 }).bindTooltip(esc(f.name ?? ""), { className: "dtip", sticky: true }).addTo(s.overlay);
        else if (f.polys) for (const p of f.polys) s.L.polygon(p, { renderer: rend, color: "#60A5FA", weight: 1, fillOpacity: 0.25 }).bindTooltip(esc(f.name ?? ""), { className: "dtip", sticky: true }).addTo(s.overlay);
      }
    }
    if (props.overlays?.length) s.map.attributionControl.addAttribution("© OpenStreetMap contributors (ODbL)");
  }, [ready, props.overlays]);
  // the circle tool: press, drag out the radius, release
  useEffect(() => {
    const s = st.current;
    if (!s || !props.drawCircle) return;
    const L = s.L, map = s.map;
    map.dragging.disable();
    el.current?.classList.add("drawing");
    let c: Leaflet.LatLng | null = null;
    let circ: Leaflet.Circle | null = null;
    const down = (e: Leaflet.LeafletMouseEvent) => { c = e.latlng; circ = L.circle(c, { radius: 10, color: "#FFD24A", weight: 2, dashArray: "6 6", fillOpacity: 0.08 }).addTo(map); };
    const move = (e: Leaflet.LeafletMouseEvent) => { if (c && circ) circ.setRadius(Math.min(5000, Math.max(50, c.distanceTo(e.latlng)))); };
    const up = () => {
      if (c && circ) {
        const r = circ.getRadius();
        circ.remove();
        cb.current.ask?.draw({ lat: c.lat, lon: c.lng, r: Math.round(r) });
        props.onDrawn?.();
      }
      c = null; circ = null;
    };
    map.on("mousedown", down); map.on("mousemove", move); map.on("mouseup", up);
    return () => { map.off("mousedown", down); map.off("mousemove", move); map.off("mouseup", up); map.dragging.enable(); el.current?.classList.remove("drawing"); circ?.remove(); };
  }, [ready, props.drawCircle]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <button onClick={fitView} title={props.grown ? "Whole district" : "Fit the view"} aria-label={props.grown ? "Whole district" : "Fit the view"}><I n="expand" /></button>
        {props.extraTools}
      </div>
    </>
  );
}

const OVERLAY_COL: Record<string, string> = { schools: "#F59E0B", colleges: "#A855F7", hospitals: "#EF4444", fire_stations: "#F97316", police: "#3B82F6", rail_metro: "#14B8A6", lakes_store: "#60A5FA", gauges: "#22C55E" };

/** The panel's real box as camera padding (the bottom sheet at phone width), so a shot never frames under it. */
function panelPad(box: HTMLElement): { tl: [number, number]; br: [number, number] } {
  const panel = box.parentElement?.querySelector<HTMLElement>(".amp");
  const legend = box.parentElement?.querySelector<HTMLElement>(".amleg");
  if (!panel || panel.offsetParent === null) return { tl: [24, 24], br: [56, 24] };
  const sheet = panel.classList.contains("sheet");
  if (sheet) return { tl: [16, 16], br: [16, box.offsetHeight - panel.offsetTop + 16] };
  // the legend sits in the bottom-right corner only: a little room for it, not its whole height across the map
  return { tl: [panel.offsetLeft + panel.offsetWidth + 20, 24], br: [56 + (legend ? 40 : 0), 32] };
}

/** data-camera on the map: the last shot, its target and final bounds, and whether the user took over (for tests). */
function camera(box: HTMLElement, d: Record<string, unknown>) {
  let cur: Record<string, unknown> = {};
  try { cur = JSON.parse(box.dataset.camera ?? "{}"); } catch { /* fresh */ }
  box.dataset.camera = JSON.stringify({ ...cur, ...d });
}

/** Plays one shot: fly to bounds or a point, or follow a road end to end (6 s), with the programmatic flag set. */
function play(s: State, shot: Shot, box: HTMLElement, tookOver: () => boolean) {
  const { L, map } = s;
  if (s.follow != null) { cancelAnimationFrame(s.follow); s.follow = null; }
  const opts = { paddingTopLeft: L.point(shot.padTopLeft[0], shot.padTopLeft[1]), paddingBottomRight: L.point(shot.padBottomRight[0], shot.padBottomRight[1]), maxZoom: shot.maxZoom };
  const record = () => {
    const b = map.getBounds();
    camera(box, { kind: shot.kind, target: shot.id, bounds: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((x) => Math.round(x * 1e5) / 1e5), outside: shot.outside, user_took_over: false });
  };
  s.prog = true;
  if (shot.kind === "bounds" && shot.box) {
    const bb = L.latLngBounds([shot.box.s, shot.box.w], [shot.box.n, shot.box.e]);
    // already looking at it at about the right zoom: no flight (a jump that goes nowhere only makes the map shiver)
    const fitZoom = Math.min(shot.maxZoom, map.getBoundsZoom(bb, false, L.point(shot.padTopLeft[0] + shot.padBottomRight[0], shot.padTopLeft[1] + shot.padBottomRight[1])));
    if (map.getBounds().contains(bb) && Math.abs(map.getZoom() - fitZoom) < 0.6) { s.prog = false; record(); return; }
    if (shot.animate) map.flyToBounds(bb, { ...opts, duration: shot.duration_ms / 1000, easeLinearity: 0.2 });
    else map.fitBounds(bb, { ...opts, animate: false });
    map.once("moveend", record);
    if (!shot.animate) record();
  } else if (shot.kind === "point" && shot.point) {
    const z = Math.min(shot.maxZoom, shot.zoom ?? 16);
    // centre the point in the part of the map the panel leaves free
    const p = map.project([shot.point.lat, shot.point.lon], z).subtract(L.point((shot.padTopLeft[0] - shot.padBottomRight[0]) / 2, (shot.padTopLeft[1] - shot.padBottomRight[1]) / 2));
    const at = map.unproject(p, z);
    if (shot.animate) map.flyTo(at, z, { duration: shot.duration_ms / 1000 });
    else map.setView(at, z, { animate: false });
    map.once("moveend", record);
    if (!shot.animate) record();
  } else if (shot.kind === "path" && shot.path?.length) {
    // "Follow the road": pan from one end to the other in 6 s at a street zoom
    const path = shot.path;
    const z = Math.max(map.getZoom(), 15);
    map.setView(path[0], z, { animate: false });
    if (!shot.animate) { map.setView(path[path.length - 1], z, { animate: false }); record(); return; }
    const t0 = performance.now();
    const step = (t: number) => {
      if (tookOver()) { s.follow = null; return; }
      const k = Math.min(1, (t - t0) / shot.duration_ms);
      const i = k * (path.length - 1), j = Math.floor(i), f = i - j;
      const a = path[j], b = path[Math.min(path.length - 1, j + 1)];
      s.prog = true;
      map.panTo([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], { animate: false });
      if (k < 1) s.follow = requestAnimationFrame(step);
      else { s.follow = null; record(); }
    };
    s.follow = requestAnimationFrame(step);
  }
}

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}
