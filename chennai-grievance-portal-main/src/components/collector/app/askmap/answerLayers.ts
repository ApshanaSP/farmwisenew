/**
 * Ask the Map's drawing on the console map (SatMap): the answer's areas and mask, rings around the facilities that
 * have a case nearby, road and water corridors drawn to scale, facility glyphs, and the result pins (clustered at the
 * district zoom, fanned out where several share a point, each with its location accuracy). Plain Leaflet calls in
 * their own layer groups, above the console's pins; nothing here changes the console's own layers.
 */
import type * as Leaflet from "leaflet";
import type { AskResponse } from "@/lib/map/ask";
import type { MapGeo } from "@/lib/collector/geo";
import { circlePolygon, fmtDistance } from "@/lib/map/geom";
import { LAYER_WORD } from "@/lib/map/words";
import type { LayerId } from "@/lib/map/types";
import { CAT_COL } from "../lib";

type L = typeof Leaflet;
export interface AnswerLayers {
  areas: Leaflet.LayerGroup;
  marks: Leaflet.LayerGroup;
  pins: Leaflet.LayerGroup;
  focus: Leaflet.LayerGroup;
  corridors: { line: Leaflet.Polyline; meters: number; lat: number }[];
}

export function createAnswerLayers(L: L, map: Leaflet.Map): AnswerLayers {
  // panes keep the answer above the console's own pins and tooltips readable
  if (!map.getPane("askAreas")) { map.createPane("askAreas").style.zIndex = "390"; map.createPane("askMarks").style.zIndex = "610"; map.createPane("askPins").style.zIndex = "620"; }
  return { areas: L.layerGroup().addTo(map), marks: L.layerGroup().addTo(map), pins: L.layerGroup().addTo(map), focus: L.layerGroup().addTo(map), corridors: [] };
}

export function clearAnswer(a: AnswerLayers) {
  a.areas.clearLayers(); a.marks.clearLayers(); a.pins.clearLayers(); a.focus.clearLayers(); a.corridors = [];
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
/** metres per screen pixel at a latitude and zoom (web mercator) */
const mpp = (lat: number, z: number) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
const A_COL = "#2563EB", B_COL = "#E5533A";

/** The ring(s) of an area, from the console's own ward outlines (a zone or taluk is all its wards). */
function areaRings(geo: MapGeo, key: string): [number, number][][] {
  const [kind, v] = key.split(":");
  if (kind === "ward") return geo.wards.find((w) => w.ward === Number(v))?.rings ?? [];
  if (kind === "zone") return geo.wards.filter((w) => w.zone === Number(v)).flatMap((w) => w.rings);
  if (kind === "taluk") return geo.wards.filter((w) => w.taluk === v).flatMap((w) => w.rings);
  return [];
}

export interface DrawOpts {
  geo: MapGeo;
  lang: "en" | "ta" | "tanglish";
  showBefore: boolean;
  drop: boolean;
  pinColor?: (f: AskResponse["features"][number]) => string;
  onPin: (id: string) => void;
  onGroup: (ids: string[], label: string) => void;
  reduced: boolean;
}

/** Areas, mask, rings, corridors, facilities, groups and clusters: everything but the pins. */
export function drawAnswer(L: L, map: Leaflet.Map, a: AnswerLayers, r: AskResponse, o: DrawOpts) {
  clearAnswer(a);
  const ta = o.lang === "ta";
  const areas = r.context.areas;
  const compare = r.extra.compare;
  // the district mask with the asked area cut out (not for comparisons: both areas stay bright)
  if (areas.length && !compare && (r.kind === "brief" || r.camera.shape === "area" || r.camera.shape === "change")) {
    const holes: [number, number][][] = [];
    for (const ar of areas) {
      if (ar.circle) holes.push(circlePolygon({ lat: ar.circle.lat, lon: ar.circle.lon }, ar.circle.r, 72));
      else holes.push(...areaRings(o.geo, ar.key));
    }
    const d = r.camera.district;
    const pad = 0.6;
    const world: [number, number][] = [[d.s - pad, d.w - pad], [d.s - pad, d.e + pad], [d.n + pad, d.e + pad], [d.n + pad, d.w - pad]];
    L.polygon([world, ...holes], { pane: "askAreas", stroke: false, fillColor: "#020814", fillOpacity: 0.45, interactive: false, className: "amask" }).addTo(a.areas);
  }
  areas.forEach((ar, i) => {
    const col = compare ? (i === 0 ? A_COL : B_COL) : "#FFFFFF";
    if (ar.circle) {
      L.circle([ar.circle.lat, ar.circle.lon], { pane: "askAreas", radius: ar.circle.r, color: col, weight: 2.4, dashArray: "6 6", fill: false, interactive: false, className: "aarea" }).addTo(a.areas);
      L.circleMarker([ar.circle.lat, ar.circle.lon], { pane: "askMarks", radius: 4, color: "#fff", weight: 2, fillColor: col, fillOpacity: 1, interactive: false }).addTo(a.marks);
    } else {
      const rings = areaRings(o.geo, ar.key);
      const zone = ar.key.startsWith("zone:") ? o.geo.zones.find((z) => z.zone === Number(ar.key.slice(5))) : null;
      if (zone) L.polyline(zone.lines, { pane: "askAreas", color: col, weight: 2.6, opacity: 0.95, interactive: false, className: "aarea" }).addTo(a.areas);
      else for (const ring of rings) L.polyline([...ring, ring[0]], { pane: "askAreas", color: col, weight: 2.4, opacity: 0.95, interactive: false, className: "aarea" }).addTo(a.areas);
    }
    if (compare) {
      const c = i === 0 ? compare.a : compare.b;
      const at = ar.circle ? L.latLng(ar.circle.lat, ar.circle.lon) : L.polygon(areaRings(o.geo, ar.key)).getBounds().getCenter();
      L.marker(at, { pane: "askMarks", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "", html: `<div class="acmp" style="--c:${col}"><b>${c.n.toLocaleString("en-IN")}</b>${esc(ta ? c.label_ta : c.label)}</div>`, iconSize: [0, 0] }) }).addTo(a.marks);
    }
  });

  // rings ripple out from the facilities that have a case nearby
  r.context.rings.forEach((g, i) => {
    L.circle([g.lat, g.lon], { pane: "askAreas", radius: g.r, color: "#FFD24A", weight: 1.2, opacity: 0.85, fillColor: "#FFD24A", fillOpacity: 0.07, interactive: false,
      className: o.reduced ? "aring" : "aring rip" }).addTo(a.areas);
    const el = (a.areas.getLayers().at(-1) as Leaflet.Path | undefined)?.getElement?.() as SVGElement | undefined;
    el?.style.setProperty("--d", `${Math.min(i, 40) * 25}ms`);
  });
  // roads and water: the line, and its corridor drawn to scale (weight in pixels = 2 x metres / metres-per-pixel)
  for (const l of r.context.lines) {
    const lat = l.path[0]?.[0]?.[0] ?? 13.05;
    const corridor = L.polyline(l.path, { pane: "askAreas", color: "#FFD24A", opacity: 0.22, weight: 1, lineCap: "round", lineJoin: "round", interactive: false, className: "acorr" }).addTo(a.areas);
    L.polyline(l.path, { pane: "askAreas", color: "#FFD24A", weight: 3, opacity: 0.95, interactive: true, className: "aline" })
      .bindTooltip(`<b>${esc(ta ? l.name_ta ?? l.name : l.name)}</b>${ta ? `${fmtDistance(l.meters, "ta")} க்குள்` : `within ${fmtDistance(l.meters)} of the line`}`, { className: "dtip", sticky: true })
      .addTo(a.areas);
    a.corridors.push({ line: corridor, meters: l.meters, lat });
  }
  corridorWeights(map, a);
  for (const p of r.context.polys) for (const poly of p.polys)
    L.polygon(poly, { pane: "askAreas", color: "#60A5FA", weight: 1.6, fillColor: "#60A5FA", fillOpacity: 0.25, interactive: true, className: "awater" })
      .bindTooltip(`<b>${esc(p.name ?? "Lake or pond")}</b>OpenStreetMap`, { className: "dtip", sticky: true }).addTo(a.areas);
  // facilities that matter to the answer: a glyph with a letter and a shape, named in words
  for (const p of r.context.points) facility(L, p.layer, p, ta).addTo(a.marks);

  // nearest from a place: a line to each facility with its distance
  const nr = r.extra.nearest;
  if (nr?.origin) {
    L.marker([nr.origin.lat, nr.origin.lon], { pane: "askMarks", keyboard: false, title: nr.origin.name,
      icon: L.divIcon({ className: "", html: `<div class="aorigin"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(a.marks);
    for (const t of nr.pairs[0]?.to ?? []) {
      L.polyline([[nr.origin.lat, nr.origin.lon], [t.lat, t.lon]], { pane: "askAreas", color: "#FFD24A", weight: 2, dashArray: "5 6", interactive: false }).addTo(a.areas);
      L.marker([(nr.origin.lat + t.lat) / 2, (nr.origin.lon + t.lon) / 2], { pane: "askMarks", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "", html: `<div class="adist">${fmtDistance(t.m, ta ? "ta" : "en")}</div>`, iconSize: [0, 0] }) }).addTo(a.marks);
    }
  }
  // farthest: the far point, a dashed line to the nearest facility and the distance on it
  const far = r.extra.areas?.[0];
  if (far && r.camera.shape === "farthest") {
    const rings = areaRings(o.geo, `ward:${far.key}`);
    for (const ring of rings) L.polyline([...ring, ring[0]], { pane: "askAreas", color: "#fff", weight: 2.4, interactive: false }).addTo(a.areas);
    if (far.worst.to) {
      L.polyline([[far.worst.lat, far.worst.lon], [far.worst.to.lat, far.worst.to.lon]], { pane: "askAreas", color: "#FFD24A", weight: 2.4, dashArray: "6 6", interactive: false }).addTo(a.areas);
      L.marker([(far.worst.lat + far.worst.to.lat) / 2, (far.worst.lon + far.worst.to.lon) / 2], { pane: "askMarks", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "", html: `<div class="adist">${fmtDistance(far.worst.m, ta ? "ta" : "en")}</div>`, iconSize: [0, 0] }) }).addTo(a.marks);
    }
    L.circleMarker([far.worst.lat, far.worst.lon], { pane: "askMarks", radius: 6, color: "#fff", weight: 2, fillColor: "#E0364A", fillOpacity: 1 }).bindTooltip(ta ? "தொலைவான இடம்" : "The ward's far ground", { className: "dtip" }).addTo(a.marks);
  }
  // count by area: a bubble per area with its count (click: its list)
  for (const g of r.extra.groups ?? []) {
    if (!g.lat && !g.lon) continue;
    const size = Math.round(22 + Math.min(34, Math.sqrt(g.n) * 6));
    L.marker([g.lat, g.lon], { pane: "askMarks", title: `${g.label}: ${g.n}`,
      icon: L.divIcon({ className: "", html: `<div class="agroup" style="--s:${size}px">${g.n.toLocaleString("en-IN")}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }) })
      .on("click", () => o.onGroup(g.ids, ta ? g.label_ta : g.label)).bindTooltip(`<b>${esc(ta ? g.label_ta : g.label)}</b>${g.n.toLocaleString("en-IN")}`, { className: "dtip" }).addTo(a.marks);
  }
  // hotspots: a circle per cluster sized by its reports
  (r.extra.clusters ?? []).slice(0, 40).forEach((c, i) => {
    const size = Math.round(26 + Math.min(40, Math.sqrt(c.n) * 5));
    L.marker([c.lat, c.lon], { pane: "askMarks", title: `${c.n} reports${c.place ? ` near ${c.place}` : ""}`,
      icon: L.divIcon({ className: "", html: `<div class="ahot${i < 3 ? " top" : ""}" style="--s:${size}px"><b>${c.n}</b></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }) })
      .on("click", () => o.onGroup(c.ids, `${c.n} reports${c.place ? ` near ${c.place}` : ""}`))
      .bindTooltip(`<b>${c.n} reports${c.place ? ` near ${esc(c.place)}` : ""}</b>${ta ? "250 மீ க்குள் 3+ அறிக்கைகள்" : "3 or more within 250 m of each other"}`, { className: "dtip" }).addTo(a.marks);
  });
}

function facility(L: L, layer: LayerId, p: { id: string; name: string | null; name_ta: string | null; lat: number; lon: number; kind: string; government?: boolean }, ta: boolean) {
  const w = LAYER_WORD[layer];
  const kind = layer === "hospitals" && p.kind === "clinic" ? "clinic" : w.one;
  const name = (ta ? p.name_ta ?? p.name : p.name) ?? (ta ? w.ta_one : `A ${kind}`);
  return L.marker([p.lat, p.lon], {
    pane: "askMarks", keyboard: true, title: `${cap(kind)}: ${name}`,
    icon: L.divIcon({ className: "", html: `<div class="afac ${w.shape}" data-l="${layer}">${w.letter || "•"}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] })
  }).bindTooltip(`<b>${esc(name)}</b>${esc(cap(kind))}${p.government ? (ta ? " · அரசு" : " · government") : ""} · ${layer === "police" ? "district store" : "OpenStreetMap"}`, { className: "dtip", direction: "top", offset: [0, -10] });
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** keeps each corridor's drawn width true to its metres at the current zoom */
export function corridorWeights(map: Leaflet.Map, a: AnswerLayers) {
  const z = map.getZoom();
  for (const c of a.corridors) c.line.setStyle({ weight: Math.max(2, (2 * c.meters) / mpp(c.lat, z)) });
}

const pinCol = (f: AskResponse["features"][number]) => (f.sev === "Severe" ? CAT_COL.severe : f.citizen ? CAT_COL.complaint : CAT_COL.other);

/**
 * The result pins: only incidents exact enough to pin. Over 400 on screen at a district zoom they group into
 * pixel-grid clusters with counts (a click zooms in); from zoom 14 every pin shows. Pins at the same point show once
 * with a count badge and fan out on a click. Returns how many pins and clusters were drawn, for the legend.
 */
export function drawPins(L: L, map: Leaflet.Map, a: AnswerLayers, r: AskResponse, o: DrawOpts & { only?: Set<string> | null; fanned?: string | null; onFan?: (k: string | null) => void }) {
  a.pins.clearLayers();
  const change = r.extra.change;
  const keep = change ? new Set(o.showBefore ? change.before : change.now) : null;
  // a hotspot answer shows its clusters; a cluster's own pins appear when it is chosen
  if (r.camera.shape === "hotspot" && !o.only) return { pins: 0, clusters: 0 };
  const feats = (change && o.showBefore ? r.before : r.features).filter((f) => f.pinnable && (!keep || keep.has(f.id)) && (!o.only || r.camera.shape !== "hotspot" || o.only.has(f.id)));
  const z = map.getZoom();
  const bounds = map.getBounds().pad(0.2);
  const onScreen = feats.filter((f) => bounds.contains([f.lat, f.lon]));
  const color = o.pinColor ?? pinCol;
  const pin = (f: AskResponse["features"][number], at: Leaflet.LatLngExpression, extra = "") => {
    const size = f.sev === "Severe" ? 12 : f.sev === "High" ? 10 : 8;
    const col = color(f);
    const dim = o.only && !o.only.has(f.id) ? " dim" : "";
    const html = `<div class="mpin apin${f.open ? "" : " faded"}${f.open && f.sev === "Severe" ? " pulse" : ""}${o.drop ? " drop" : ""}${dim}${extra}" data-id="${esc(f.id)}" style="--s:${size}px;background:${col};--mc:${col};--d:${Math.min(f.rank, 60) * 14}ms"></div>`;
    const m = L.marker(at, { pane: "askPins", icon: L.divIcon({ className: "", html, iconSize: [0, 0], iconAnchor: [0, 0] }), zIndexOffset: 1000 - Math.min(f.rank, 999),
      title: `${f.sev}: ${f.title}${f.open ? "" : " (closed)"}`, keyboard: true })
      .on("click", () => o.onPin(f.id))
      .bindTooltip(`<b>${esc(f.title)}</b>${esc(f.sev)}${f.open ? "" : " · closed"}${f.prec && f.prec > 50 ? `<br><span style="opacity:.75">${o.lang === "ta" ? `இடம் சுமார் ${fmtDistance(f.prec, "ta")} வரை` : `Location known to about ${fmtDistance(f.prec)}`}</span>` : ""}`,
        { className: "dtip", direction: "top", offset: [0, -8] });
    // a coarse location shows its circle of accuracy on hover
    if (f.prec && f.prec > 50) {
      const acc = L.circle(at, { pane: "askAreas", radius: f.prec, color: col, weight: 1, dashArray: "3 4", fillOpacity: 0.06, interactive: false });
      m.on("mouseover", () => acc.addTo(a.focus)).on("mouseout", () => a.focus.removeLayer(acc));
    }
    return m;
  };
  // big answers: the 300 highest-priority places keep their pins (and their drop-in); the rest are dots on one canvas,
  // so panning and zooming stay smooth with thousands on the map. Count bubbles only when it is too dense to read.
  if (feats.length > 300 && !(onScreen.length > 1500 && z < 13.5)) {
    const rend = canvasFor(L, map);
    const top = new Set(feats.slice().sort((x, y) => x.rank - y.rank).slice(0, 300).map((f) => f.id));
    for (const f of feats) {
      if (top.has(f.id)) { pin(f, [f.lat, f.lon]).addTo(a.pins); continue; }
      const dim = o.only && !o.only.has(f.id);
      L.circleMarker([f.lat, f.lon], { renderer: rend, pane: "askPins", radius: f.sev === "Severe" ? 5 : f.sev === "High" ? 4 : 3, color: "#0B1020", weight: 1,
        fillColor: color(f), fillOpacity: dim ? 0.15 : 0.9, opacity: dim ? 0.15 : 0.8 })
        .on("click", () => o.onPin(f.id)).bindTooltip(`<b>${esc(f.title)}</b>${esc(f.sev)}${f.open ? "" : " · closed"}`, { className: "dtip", direction: "top" })
        .addTo(a.pins);
    }
    return { pins: feats.length, clusters: 0 };
  }
  if (onScreen.length > 1500 && z < 13.5) {
    // pixel grid: 56 px cells at the current zoom
    const cells = new Map<string, AskResponse["features"]>();
    for (const f of feats) {
      const p = map.project([f.lat, f.lon], z);
      const k = `${Math.floor(p.x / 56)},${Math.floor(p.y / 56)}`;
      (cells.get(k) ?? cells.set(k, []).get(k)!).push(f);
    }
    for (const fs of cells.values()) {
      if (fs.length === 1) { pin(fs[0], [fs[0].lat, fs[0].lon]).addTo(a.pins); continue; }
      const lat = fs.reduce((s, f) => s + f.lat, 0) / fs.length, lon = fs.reduce((s, f) => s + f.lon, 0) / fs.length;
      const size = Math.round(26 + Math.min(26, Math.sqrt(fs.length) * 3));
      const severe = fs.some((f) => f.sev === "Severe" && f.open);
      L.marker([lat, lon], { pane: "askPins", title: `${fs.length} results here: zoom in`,
        icon: L.divIcon({ className: "", html: `<div class="aclus${severe ? " sev" : ""}${o.drop ? " drop" : ""}" style="--s:${size}px">${fs.length}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }) })
        .on("click", () => map.flyToBounds(L.latLngBounds(fs.map((f) => [f.lat, f.lon] as [number, number])), { padding: [40, 40], maxZoom: 16, duration: o.reduced ? 0 : 0.6, animate: !o.reduced }))
        .addTo(a.pins);
    }
    return { pins: [...cells.values()].filter((c) => c.length === 1).length, clusters: [...cells.values()].filter((c) => c.length > 1).length };
  }
  // stacked points: one marker with a count; a click fans them out in a small circle, each still clickable
  const stacks = new Map<string, AskResponse["features"]>();
  for (const f of feats) { const k = `${f.lat.toFixed(5)},${f.lon.toFixed(5)}`; (stacks.get(k) ?? stacks.set(k, []).get(k)!).push(f); }
  for (const [k, fs] of stacks) {
    if (fs.length === 1) { pin(fs[0], [fs[0].lat, fs[0].lon]).addTo(a.pins); continue; }
    if (o.fanned === k) {
      const c = map.project([fs[0].lat, fs[0].lon], z);
      fs.forEach((f, i) => {
        const ang = (2 * Math.PI * i) / fs.length, rad = 16 + fs.length * 2.5;
        const at = map.unproject([c.x + Math.cos(ang) * rad, c.y + Math.sin(ang) * rad], z);
        L.polyline([[fs[0].lat, fs[0].lon], at], { pane: "askAreas", color: "#fff", weight: 1, opacity: 0.6, interactive: false }).addTo(a.pins);
        pin(f, at).addTo(a.pins);
      });
      continue;
    }
    const top = fs[0];
    pin(top, [top.lat, top.lon], " stack").addTo(a.pins);
    L.marker([top.lat, top.lon], { pane: "askPins", zIndexOffset: 1100, title: `${fs.length} reports at this point: click to spread them out`,
      icon: L.divIcon({ className: "", html: `<div class="astack">${fs.length}</div>`, iconSize: [18, 18], iconAnchor: [-2, 18] }) })
      .on("click", () => o.onFan?.(k)).addTo(a.pins);
  }
  return { pins: feats.length, clusters: 0 };
}

const renderers = new WeakMap<Leaflet.Map, Leaflet.Canvas>();
/** one canvas renderer per map, in the answer's pin pane */
function canvasFor(L: L, map: Leaflet.Map): Leaflet.Canvas {
  let r = renderers.get(map);
  if (!r) r = L.canvas({ pane: "askPins", padding: 0.3 });
  renderers.set(map, r);
  return r;
}

/**
 * The heat view of an answer: every exact place as a soft blob on one canvas, coloured by how many overlap (from the
 * console's green through amber to red). Redrawn after each move or zoom; nothing to do with counts (the headline and
 * the list stay the numbers).
 */
export function drawHeat(L: L, map: Leaflet.Map, pts: { lat: number; lon: number; w: number }[]): Leaflet.Layer {
  const Heat = L.Layer.extend({
    onAdd(this: Leaflet.Layer & { _c?: HTMLCanvasElement; _draw?: () => void }) {
      const c = (this._c = L.DomUtil.create("canvas", "aheat") as HTMLCanvasElement);
      map.getPanes().overlayPane.appendChild(c);
      this._draw = () => {
        const size = map.getSize(), tl = map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(c, tl);
        c.width = size.x; c.height = size.y;
        const g = c.getContext("2d")!;
        const r = Math.max(10, Math.min(40, 6 * Math.pow(1.35, map.getZoom() - 10)));
        g.globalCompositeOperation = "lighter";
        for (const p of pts) {
          const q = map.latLngToContainerPoint([p.lat, p.lon]);
          if (q.x < -r || q.y < -r || q.x > size.x + r || q.y > size.y + r) continue;
          const grd = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
          grd.addColorStop(0, `rgba(0,0,0,${0.18 * p.w})`);
          grd.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = grd;
          g.fillRect(q.x - r, q.y - r, 2 * r, 2 * r);
        }
        // colourise by intensity (alpha): green, amber, red
        const img = g.getImageData(0, 0, size.x, size.y), d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3] / 255;
          if (!a) continue;
          const t = Math.min(1, a * 1.6);
          const [cr, cg, cb] = t < 0.5 ? [47 + (242 - 47) * t * 2, 174 + (179 - 174) * t * 2, 102 - 41 * t * 2] : [242 - 2 * (t - 0.5) * 2, 179 - 114 * (t - 0.5) * 2, 61 + 18 * (t - 0.5) * 2];
          d[i] = cr; d[i + 1] = cg; d[i + 2] = cb; d[i + 3] = Math.min(220, 60 + a * 400);
        }
        g.putImageData(img, 0, 0);
      };
      map.on("moveend zoomend resize", this._draw);
      this._draw();
      return this;
    },
    onRemove(this: Leaflet.Layer & { _c?: HTMLCanvasElement; _draw?: () => void }) {
      map.off("moveend zoomend resize", this._draw);
      this._c?.remove();
      return this;
    }
  });
  return new (Heat as unknown as new () => Leaflet.Layer)();
}

/** Lifts the hovered row's pin and rings the focused one. */
export function markPins(container: HTMLElement, hover: string | null, focus: string | null) {
  container.querySelectorAll<HTMLElement>(".apin.lift").forEach((e) => e.classList.remove("lift"));
  if (hover) container.querySelectorAll<HTMLElement>(`.apin[data-id="${CSS.escape(hover)}"]`).forEach((e) => e.classList.add("lift"));
  container.querySelectorAll<HTMLElement>(".apin.on").forEach((e) => e.classList.remove("on"));
  if (focus) container.querySelectorAll<HTMLElement>(`.apin[data-id="${CSS.escape(focus)}"]`).forEach((e) => e.classList.add("on"));
}
