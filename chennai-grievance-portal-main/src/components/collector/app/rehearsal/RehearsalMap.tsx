"use client";
/**
 * The rehearsal's own map (Leaflet): flood streets glowing blue (brighter and wider where it flooded in more rains),
 * open drain complaints as orange squares, hospitals and fire stations (a red ring when cut off), wards that lose quick
 * help hatched grey, dry schools, lakes filling, river gauges, a releasing river, and at each clock stop what changes:
 * job flags (Act), reports dropping in over ghost outlines (Rain), saved / still flooded / missed (Check).
 * A tapped hospital or fire station shows the roads it reaches in 10 minutes, shrinking to its rehearsal reach.
 */
import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import type { MapGeo } from "@/lib/collector/geo";
import type { Line, RehearsalState } from "@/lib/rehearsal/types";
import { hardenLeaflet } from "../askmap/leafletSafe";

export type Stop = "warn" | "act" | "rain" | "check" | "learn";
export interface Layers { streets: boolean; help: boolean; drains: boolean; schools: boolean; water: boolean }
export interface MapSel { kind: "street" | "facility" | "ward" | "lake" | "gauge" | "dry" | "choke" | "job" | "report" | "rain"; id: string; lat: number; lon: number }

interface Props {
  geo: MapGeo | null;
  d: RehearsalState;
  stop: Stop;
  layers: Layers;
  sel: MapSel | null;
  onSel: (s: MapSel | null) => void;
  reach: { id: string; kept: Line[]; lost: Line[] } | null;
  route: { line: Line; normal?: Line } | null;
  /** reports shown at the Rain stop (they drop in, in time order) */
  revealed: number;
  base: "streets" | "sat";
  fitKey: string;
}

const SVG = {
  hospital: '<svg viewBox="0 0 24 24"><path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" fill="currentColor"/></svg>',
  fire: '<svg viewBox="0 0 24 24"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3-1-5 1-8z" fill="currentColor"/></svg>',
  school: '<svg viewBox="0 0 24 24"><path d="M12 3 2 10h3v10h14V10h3z" fill="currentColor"/><path d="M10 20v-5h4v5" fill="#fff"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4h11l-2 4 2 4H7v9z" fill="currentColor"/></svg>'
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

interface St {
  L: typeof Leaflet;
  map: Leaflet.Map;
  sat: Leaflet.TileLayer;
  streets: Leaflet.TileLayer;
  g: Record<"wards" | "ribbon" | "streets" | "reach" | "route" | "pins" | "jobs" | "reports" | "sel", Leaflet.LayerGroup>;
  svg: Leaflet.Renderer;
  fitted: string;
  /** reduced motion: jump, never fly */
  still: boolean;
}

export default function RehearsalMap(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const st = useRef<St | null>(null);
  const cb = useRef(p);
  cb.current = p;

  // ---- create once
  useEffect(() => {
    if (!el.current) return;
    let dead = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (dead || !el.current) return;
      hardenLeaflet(L);
      // reduced motion (the viewer's setting, or ?still=1 in a preview): no zoom animation, and the map jumps instead of flying
      const still = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || /[?&]still=1\b/.test(window.location.search);
      const map = L.map(el.current, { zoomControl: false, zoomSnap: 0.25, zoomDelta: 0.5, minZoom: 10, maxZoom: 18, attributionControl: true, preferCanvas: false, fadeAnimation: false,
        zoomAnimation: !still, markerZoomAnimation: !still });
      map.attributionControl.setPrefix(false);
      map.attributionControl.addAttribution("Roads © OpenStreetMap contributors (ODbL) · CFM-DSS · IMD");
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
      const box = el.current;
      // marks scale with the zoom; small marks (dry schools, gauges) wait for street zoom, flood-spot halos fade out there
      const scale = () => {
        const z = map.getZoom();
        box.style.setProperty("--pz", String(Math.max(0.65, Math.min(1.1, 0.65 + (z - 11) * 0.2))));
        box.classList.toggle("zlow", z < 12.5);
        box.classList.toggle("zhigh", z >= 14.5);
      };
      // after every move or zoom: road widths and street names follow the view
      map.on("zoomend", scale);
      map.on("moveend", () => draw());
      scale();
      const streets = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Map © Esri, HERE, Garmin, OpenStreetMap contributors" });
      const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" });
      (cb.current.base === "sat" ? sat : streets).addTo(map);
      for (const [name, z] of [["rrWards", 330], ["rrRibbon", 380], ["rrStreets", 420], ["rrReach", 440], ["rrRoute", 460], ["rrPins", 620], ["rrSel", 640]] as const) map.createPane(name).style.zIndex = String(z);
      const svg = L.svg({ padding: 0.4 });
      const g = {
        wards: L.layerGroup().addTo(map), ribbon: L.layerGroup().addTo(map), streets: L.layerGroup().addTo(map), reach: L.layerGroup().addTo(map),
        route: L.layerGroup().addTo(map), pins: L.layerGroup().addTo(map), jobs: L.layerGroup().addTo(map), reports: L.layerGroup().addTo(map), sel: L.layerGroup().addTo(map)
      };
      map.setView([13.05, 80.23], 11.5);
      map.on("click", () => cb.current.onSel(null));
      st.current = { L, map, sat, streets, g, svg, fitted: "", still };
      draw();
      // something may already be chosen (the fly-in can come before the map has loaded)
      if (cb.current.sel) flySel(); else fit();
    })();
    return () => { dead = true; st.current?.map.remove(); st.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- base map
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    if (p.base === "sat") { s.map.removeLayer(s.streets); s.sat.addTo(s.map); } else { s.map.removeLayer(s.sat); s.streets.addTo(s.map); }
  }, [p.base]);

  // ---- redraw on data / stop / layers / selection
  useEffect(() => { draw(); }, [p.d, p.stop, p.layers, p.reach, p.route, p.revealed, p.sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fit(); }, [p.fitKey, !!p.geo]); // eslint-disable-line react-hooks/exhaustive-deps
  // ---- fly to a selection
  useEffect(() => { flySel(); }, [p.sel?.kind, p.sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** a street is framed whole; anything else is approached close enough to read */
  function flySel() {
    const s = st.current;
    const { sel, d } = cb.current;
    if (!s || !sel) return;
    // a fly runs on animation frames; a paused or busy tab may never run them, so it jumps instead
    const z0 = s.map.getZoom(), c0 = s.map.getCenter();
    const jumpIfStuck = (go: () => void) => setTimeout(() => { if (st.current && s.map.getZoom() === z0 && s.map.getCenter().equals(c0)) go(); }, 1500);
    if (sel.kind === "street") {
      const st0 = d.streets.find((x) => x.key === sel.id) ?? d.learn?.streets.find((x) => x.key === sel.id);
      const pts = st0 ? st0.lines.flat() : [];
      if (pts.length >= 2) {
        const b = s.L.latLngBounds(pts);
        if (s.still) { s.map.fitBounds(b, { padding: [70, 70], maxZoom: 16.5, animate: false }); return; }
        s.map.flyToBounds(b, { padding: [70, 70], maxZoom: 16.5, duration: 1.1 });
        jumpIfStuck(() => s.map.fitBounds(b, { padding: [70, 70], maxZoom: 16.5, animate: false }));
        return;
      }
    }
    const z = Math.max(s.map.getZoom(), sel.kind === "ward" ? 14 : 15.5);
    if (!s.map.getBounds().pad(-0.25).contains([sel.lat, sel.lon]) || s.map.getZoom() < z - 0.5) {
      if (s.still) { s.map.setView([sel.lat, sel.lon], z, { animate: false }); return; }
      s.map.flyTo([sel.lat, sel.lon], z, { duration: 0.9 });
      jumpIfStuck(() => s.map.setView([sel.lat, sel.lon], z, { animate: false }));
    }
  }

  function fit() {
    const s = st.current;
    if (!s) return;
    const { d, geo, sel } = cb.current;
    // something is chosen (the fly-in, a card): the ward outlines arriving late must not pull the map back out
    if (sel) return;
    // the district's wards frame the view (a flood street just outside it must not zoom the map out)
    const pts: [number, number][] = geo?.wards.length ? geo.wards.flatMap((w) => w.rings[0] as [number, number][]) : d.streets.filter((x) => x.tier === 2).map((x) => [x.lat, x.lon]);
    if (pts.length < 3) for (const x of d.streets) pts.push([x.lat, x.lon]);
    if (pts.length >= 2) s.map.fitBounds(s.L.latLngBounds(pts).pad(0.08), { animate: !s.still, duration: 0.8, maxZoom: 13.5 } as Leaflet.FitBoundsOptions);
  }

  function draw() {
    const s = st.current;
    if (!s) return;
    const { L, g } = s;
    const { d, stop, layers, sel, reach, route, revealed, geo } = cb.current;
    for (const k of Object.keys(g) as (keyof St["g"])[]) g[k].clearLayers();
    // roads grow with the zoom: thin over the district, bold at street level
    const zoom = s.map.getZoom();
    const zf = Math.max(0.8, Math.min(2.3, 0.8 + (zoom - 12) * 0.38));
    const view = s.map.getBounds().pad(0.15);
    let labels = 0;
    const named = new Set<string>();
    // a chosen street: drawn above everything; the marks that would cover it step aside
    const focus = sel?.kind === "street" ? sel.id : null;
    const click = (sel: MapSel) => (e: Leaflet.LeafletMouseEvent) => { L.DomEvent.stopPropagation(e); cb.current.onSel(sel); };

    // wards that lose quick help (hatched grey)
    if (layers.help && geo && stop !== "rain" && stop !== "check") {
      const lose = new Map(d.wards.filter((w) => w.loses.length).map((w) => [w.ward, w]));
      for (const w of geo.wards) {
        const x = lose.get(w.ward);
        if (!x) continue;
        L.polygon(w.rings as [number, number][][], { pane: "rrWards", renderer: s.svg, color: "#64748B", weight: 1.2, dashArray: "4 4", fillColor: "#64748B", fillOpacity: 0.22, className: "rr-ward-lose" })
          .bindTooltip(`Ward ${w.ward} loses quick ${x.loses.join(" and ")} help`, { sticky: true, className: "rr-tip" })
          .on("click", click({ kind: "ward", id: String(w.ward), lat: (w.rings[0][0][0] + w.rings[0][Math.floor(w.rings[0].length / 2)][0]) / 2, lon: (w.rings[0][0][1] + w.rings[0][Math.floor(w.rings[0].length / 2)][1]) / 2 }))
          .addTo(g.wards);
      }
    }
    // a releasing river
    if (layers.water && d.ribbon) {
      for (const l of d.ribbon.lines) L.polyline(l, { pane: "rrRibbon", renderer: s.svg, color: "#0EA5E9", weight: 16, opacity: 0.22, lineCap: "round", interactive: false }).addTo(g.ribbon);
      for (const l of d.ribbon.lines) L.polyline(l, { pane: "rrRibbon", renderer: s.svg, color: "#0284C7", weight: 2.5, opacity: 0.9, dashArray: "8 10", className: "rr-flow", interactive: false }).addTo(g.ribbon);
    }
    // flood streets
    if (layers.streets) {
      for (const x of d.streets) {
        const isSel = sel?.kind === "street" && sel.id === x.key;
        const target = { kind: "street" as const, id: x.key, lat: x.lat, lon: x.lon };
        const tip = `${esc(x.label)} · ${x.tier === 2 ? "likely to flood" : "may flood"} · flooded in ${x.rains} past ${x.rains === 1 ? "rain" : "rains"}`;
        if (stop === "rain") {
          // the ghost of the prediction: a dashed ring at district zoom, dotted streets closer in
          if (x.tier === 2) L.circleMarker([x.lat, x.lon], { pane: "rrWards", renderer: s.svg, radius: 10, color: "#0369A1", weight: 1.5, dashArray: "3 3", fill: false, className: "rr-halo", interactive: false }).addTo(g.streets);
          L.polyline(x.lines, { pane: "rrStreets", renderer: s.svg, color: x.tier === 2 ? "#0369A1" : "#38BDF8", weight: (x.tier === 2 ? 3.5 : 2.5) * zf, opacity: 0.85, dashArray: "2 6", lineCap: "round" })
            .bindTooltip(tip, { sticky: true, className: "rr-tip" }).on("click", click(target)).addTo(g.streets);
          continue;
        }
        if (stop === "check") {
          const col = x.flooded ? "#DC2626" : "#16A34A";
          if (x.tier === 2 || x.flooded) L.circleMarker([x.lat, x.lon], { pane: "rrWards", renderer: s.svg, radius: x.flooded ? 9 : 7, color: col, weight: 1.5, fillColor: col, fillOpacity: 0.3, className: "rr-halo" })
            .bindTooltip(`${esc(x.label)} · ${x.flooded ? "still flooded" : "no flooding reported"}`, { className: "rr-tip" }).on("click", click(target)).addTo(g.streets);
          L.polyline(x.lines, { pane: "rrStreets", renderer: s.svg, color: col, weight: 9 * zf, opacity: 0.18, lineCap: "round", interactive: false }).addTo(g.streets);
          L.polyline(x.lines, { pane: "rrStreets", renderer: s.svg, color: "#fff", weight: (x.tier === 2 ? 4 : 3) * zf + 3, opacity: 0.9, lineCap: "round", interactive: false, className: "rr-case" }).addTo(g.streets);
          L.polyline(x.lines, { pane: "rrStreets", renderer: s.svg, color: col, weight: (x.tier === 2 ? 4 : 3) * zf, opacity: 0.95, lineCap: "round" })
            .bindTooltip(`${esc(x.label)} · ${x.flooded ? "still flooded" : "no flooding reported"}`, { sticky: true, className: "rr-tip" }).on("click", click(target)).addTo(g.streets);
          continue;
        }
        const w = (x.tier === 2 ? 3 + Math.min(3, x.rains) : 2.2) * zf;
        // the flood spot, so the district view shows where the risk gathers
        if (x.tier === 2) L.circleMarker([x.lat, x.lon], { pane: "rrWards", renderer: s.svg, radius: 7 + Math.min(5, x.rains), stroke: true, color: "#0284C7", weight: 1, opacity: 0.5,
          fillColor: "#38BDF8", fillOpacity: 0.28, className: "rr-halo" }).bindTooltip(tip, { className: "rr-tip" }).on("click", click(target)).addTo(g.streets);
        if (x.tier === 2) L.polyline(x.lines, { pane: "rrStreets", renderer: s.svg, color: "#38BDF8", weight: w + 10 * zf, opacity: isSel ? 0.5 : 0.25, lineCap: "round", interactive: false, className: "rr-glow" }).addTo(g.streets);
        L.polyline(x.lines, { pane: "rrStreets", renderer: s.svg, color: "#fff", weight: (isSel ? w * 1.35 : w) + 3.5, opacity: 0.95, lineCap: "round", interactive: false, className: "rr-case" }).addTo(g.streets);
        L.polyline(x.lines, { pane: "rrStreets", renderer: s.svg, color: x.tier === 2 ? (isSel ? "#1D4ED8" : "#0369A1") : "#3B82F6", weight: isSel ? w * 1.35 : w, opacity: x.tier === 2 ? 1 : 0.85, lineCap: "round",
          dashArray: x.tier === 2 ? undefined : `${Math.round(6 * zf)} ${Math.round(5 * zf)}`,
          className: x.tier === 2 ? "rr-likely" : "rr-possible" }).bindTooltip(tip, { sticky: true, className: "rr-tip" }).on("click", click(target)).addTo(g.streets);
        // the street's name on the map, at street level (likely streets in view, at most 40)
        // named streets and the chosen one (lanes are named after their street, so they would repeat it), each name once
        if (x.tier === 2 && zoom >= 14.5 && labels < 30 && (x.name || isSel) && !named.has(x.label) && view.contains([x.lat, x.lon])) {
          named.add(x.label);
          labels++;
          L.marker([x.lat, x.lon], { pane: "rrPins", interactive: false, keyboard: false,
            icon: L.divIcon({ className: "rr-lbl-ic", iconSize: undefined, html: `<span class="rr-lbl${isSel ? " on" : ""}">${esc(x.label)}<em>${x.rains} rains</em></span>` }) }).addTo(g.streets);
        }
      }
    }
    // a tapped facility's reach: kept roads green, lost roads fade to grey
    if (reach) {
      // one line each for kept and lost (thousands of road pieces): the lost ones fade from green to grey
      if (reach.kept.length) L.polyline(reach.kept, { pane: "rrReach", renderer: s.svg, color: "#16A34A", weight: 3, opacity: 0.7, interactive: false }).addTo(g.reach);
      if (reach.lost.length) {
        const lost = L.polyline(reach.lost, { pane: "rrReach", renderer: s.svg, color: "#16A34A", weight: 3, opacity: 0.7, interactive: false, className: "rr-lost" }).addTo(g.reach);
        setTimeout(() => lost.setStyle({ color: "#94A3B8", opacity: 0.85, dashArray: "3 5" }), 650);
      }
    }
    if (route) {
      if (route.normal) L.polyline(route.normal, { pane: "rrRoute", renderer: s.svg, color: "#64748B", weight: 3, opacity: 0.8, dashArray: "6 6", interactive: false }).addTo(g.route);
      L.polyline(route.line, { pane: "rrRoute", renderer: s.svg, color: "#7C3AED", weight: 6, opacity: 0.25, interactive: false }).addTo(g.route);
      L.polyline(route.line, { pane: "rrRoute", renderer: s.svg, color: "#7C3AED", weight: 3.5, opacity: 0.95, interactive: false }).addTo(g.route);
    }
    const icon = (html: string, size: number, cls = "") => L.divIcon({ html, className: `rr-ic ${cls}`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    // hospitals and fire stations
    if (layers.help && stop !== "check") {
      for (const f of d.facilities) {
        if (!f.routed) continue;
        // fire stations (few), and hospitals that lose reach or are chosen: the rest would bury the flood streets
        const show = f.cutOff || sel?.id === f.id || f.kind === "fire" || (f.normalKm > 0 && f.rehearsalKm < f.normalKm * 0.9);
        if (!show) continue;
        const cls = `rr-fac ${f.kind === "hospital" ? "h" : "f"}${f.cutOff ? " cut" : ""}${sel?.id === f.id ? " on" : ""}`;
        L.marker([f.lat, f.lon], { pane: "rrPins", icon: icon(`<span class="${cls}">${f.kind === "hospital" ? SVG.hospital : SVG.fire}</span>`, f.cutOff ? 26 : 20), keyboard: true, title: f.name, riseOnHover: true })
          .bindTooltip(`${esc(f.name)}${f.cutOff ? " · may be cut off" : ""}`, { className: "rr-tip", direction: "top", offset: [0, -10] })
          .on("click", click({ kind: "facility", id: f.id, lat: f.lat, lon: f.lon })).addTo(g.pins);
      }
    }
    // open drain complaints on flood streets
    if (layers.drains && (stop === "warn" || stop === "learn") && focus) {
      for (const c of d.chokes) if (c.street === focus) L.circleMarker([c.lat, c.lon], { pane: "rrSel", renderer: s.svg, radius: 6, color: "#fff", weight: 2, fillColor: c.breached ? "#C2410C" : "#F97316", fillOpacity: 1 })
        .bindTooltip(`${esc(c.title)} · open ${c.ageDays} days`, { className: "rr-tip", direction: "top" }).on("click", click({ kind: "choke", id: c.id, lat: c.lat, lon: c.lon })).addTo(g.sel);
    } else if (layers.drains && (stop === "warn" || stop === "learn")) {
      for (const c of d.chokes) L.marker([c.lat, c.lon], { pane: "rrPins", icon: icon(`<span class="rr-choke${c.breached ? " late" : ""}"></span>`, 13), title: c.title })
        .bindTooltip(`${esc(c.title)} · open ${c.ageDays} days`, { className: "rr-tip", direction: "top" }).on("click", click({ kind: "choke", id: c.id, lat: c.lat, lon: c.lon })).addTo(g.pins);
    }
    // dry schools
    if (layers.schools && stop !== "rain" && stop !== "check" && !focus) {
      for (const x of d.dry) L.marker([x.lat, x.lon], { pane: "rrPins", icon: icon(`<span class="rr-dry">${SVG.school}</span>`, 18), title: x.name })
        .bindTooltip(`${esc(x.name)} · possible relief centre`, { className: "rr-tip", direction: "top" }).on("click", click({ kind: "dry", id: x.id, lat: x.lat, lon: x.lon })).addTo(g.pins);
    }
    // lakes and river gauges
    if (layers.water && !focus) {
      for (const k of d.lakes) L.marker([k.lat, k.lon], { pane: "rrPins", icon: icon(`<span class="rr-lake${k.pct >= 90 ? " full" : ""}" style="--p:${Math.max(4, Math.min(100, k.pct))}%"><i></i></span>`, 16), title: k.name })
        .bindTooltip(`${esc(k.name)} · ${Math.round(k.pct)} % full`, { className: "rr-tip", direction: "top" }).on("click", click({ kind: "lake", id: k.id, lat: k.lat, lon: k.lon })).addTo(g.pins);
      for (const x of d.gauges) {
        if (x.lat == null || x.lon == null) continue;
        const tone = x.gap == null ? "n" : x.gap <= 0 ? "r" : x.gap <= 0.5 ? "a" : "g";
        const h = x.warning && x.warning > 0 ? Math.max(8, Math.min(100, (x.level / x.warning) * 100)) : 30;
        L.marker([x.lat, x.lon], { pane: "rrPins", icon: icon(`<span class="rr-gauge ${tone}"><i style="height:${h}%"></i></span>`, 14), title: x.name })
          .bindTooltip(`${esc(x.name)} · ${x.level} m${x.warning != null ? ` (warning ${x.warning} m)` : ""}`, { className: "rr-tip", direction: "top" })
          .on("click", click({ kind: "gauge", id: x.id, lat: x.lat, lon: x.lon })).addTo(g.pins);
      }
    }
    // live rain at the Flood Monitor's stations: today's millimetres on a drop (hollow = not reporting)
    if (layers.water && d.rain && !focus) {
      for (const r of d.rain.stations) {
        if (r.lat == null || r.lon == null) continue;
        const mm = r.todayMm ?? 0;
        const tone = r.stale ? "off" : mm >= 64.5 ? "r4" : mm >= 30 ? "r3" : mm >= 10 ? "r2" : mm > 0 ? "r1" : "r0";
        L.marker([r.lat, r.lon], { pane: "rrPins", icon: icon(`<span class="rr-rg ${tone}"><b>${r.stale ? "–" : Math.round(mm)}</b></span>`, 24), title: r.name })
          .bindTooltip(`${esc(r.name)} · ${r.stale ? "not reporting" : `${mm} mm since 08:30${r.hourMm ? `, ${r.hourMm} mm last hour` : ""}`}`, { className: "rr-tip", direction: "top" })
          .on("click", click({ kind: "rain", id: r.id, lat: r.lat, lon: r.lon })).addTo(g.pins);
      }
    }
    // job flags (Act)
    if (stop === "act") {
      for (const j of d.jobs) {
        const s0 = j.task?.status ?? "plan";
        L.marker([j.lat, j.lon], { pane: "rrPins", icon: icon(`<span class="rr-flag ${s0}">${SVG.flag}${s0 === "done" ? "<b>✓</b>" : ""}</span>`, 20), title: j.en })
          .bindTooltip(`${esc(j.en)} · ${s0 === "plan" ? "not sent yet" : s0 === "todo" ? "to do" : s0}`, { className: "rr-tip", direction: "top" })
          .on("click", click({ kind: "job", id: j.key, lat: j.lat, lon: j.lon })).addTo(g.jobs);
      }
    }
    // reports of the rain (Rain: dropping in; Check: on a predicted street or missed)
    if ((stop === "rain" || stop === "check") && d.check) {
      const list = stop === "rain" ? d.check.reports.slice(0, revealed) : d.check.reports;
      list.forEach((r, k) => {
        const missed = stop === "check" && r.missed;
        L.circleMarker([r.lat, r.lon], { pane: "rrPins", renderer: s.svg, radius: missed ? 6 : 5, color: "#fff", weight: 1.5, fillColor: missed ? "#9333EA" : "#1D4ED8", fillOpacity: 0.95,
          className: stop === "rain" && k >= revealed - 6 ? "rr-drop" : "" })
          .bindTooltip(`${esc(r.title)}${r.place ? ` · ${esc(r.place)}` : ""}${missed ? " · not on a predicted street" : ""}`, { className: "rr-tip", direction: "top" })
          .on("click", click({ kind: "report", id: r.id, lat: r.lat, lon: r.lon })).addTo(g.reports);
      });
    }
    // the chosen street, above every mark: a white casing, the road in bright blue, a flowing dash along it
    const chosen = focus ? d.streets.find((x) => x.key === focus) : null;
    if (chosen && layers.streets) {
      const cw = Math.max(6, (3 + Math.min(3, chosen.rains)) * zf * 1.45);
      L.polyline(chosen.lines, { pane: "rrSel", renderer: s.svg, color: "#38BDF8", weight: cw + 14, opacity: 0.35, lineCap: "round", interactive: false }).addTo(g.sel);
      L.polyline(chosen.lines, { pane: "rrSel", renderer: s.svg, color: "#fff", weight: cw + 5, opacity: 1, lineCap: "round", interactive: false, className: "rr-case" }).addTo(g.sel);
      L.polyline(chosen.lines, { pane: "rrSel", renderer: s.svg, color: "#1D4ED8", weight: cw, opacity: 1, lineCap: "round", interactive: false }).addTo(g.sel);
      L.polyline(chosen.lines, { pane: "rrSel", renderer: s.svg, color: "#BFDBFE", weight: Math.max(2, cw / 3), opacity: 0.9, lineCap: "round", dashArray: "10 14", interactive: false, className: "rr-flow" }).addTo(g.sel);
    }
    // the selection ring (not for a street: the street itself is the mark)
    if (sel && !chosen) L.circleMarker([sel.lat, sel.lon], { pane: "rrSel", renderer: s.svg, radius: 16, color: "#0F172A", weight: 2, fill: false, className: "rr-ring", interactive: false }).addTo(g.sel);
  }

  return <div ref={el} className="rr-map" />;
}
