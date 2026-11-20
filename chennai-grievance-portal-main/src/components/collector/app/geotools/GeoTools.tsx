"use client";
/**
 * Two map tools beside the zoom buttons, in place on the map (no wizard):
 *
 *  Then and now: a swipe over the map. Left of the handle, Chennai's satellite photo as it was in the chosen year; right, as it is
 *  now (Esri World Imagery Wayback, one version a year: lib/map/imagery.ts). Each side says when its photo was actually taken and by
 *  which satellite, read for the place being looked at. The zones, wards and pins stay on top, so an encroached lake, a new
 *  layout on a flood plain or a filled drain is seen with the incidents around it.
 *
 *  Measure and plot: click corners on the map (click the first one again, or double-click, to close the area). The plot gives its
 *  area in m² and cents, hectares and acres, its perimeter, the wards it touches and every incident on the map inside it; it can be
 *  asked about in Ask the Map, and copied as GeoJSON for a surveyor. Esc leaves; Backspace takes the last corner back.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type * as Leaflet from "leaflet";
import type { MapGeo } from "@/lib/collector/geo";
import { LATEST, RELEASES, releaseOf, waybackTiles, type Shot } from "@/lib/map/imagery";
import { centre, enclosing, fmtArea, fmtLength, inside, pathLength, ringArea, toGeoJson, type Pt } from "@/lib/map/plot";
import { I } from "../icons";
import type { Row } from "../lib";
import type { MapAsk } from "../askmap/useMapAsk";
import "./geotools.css";

interface Props {
  get: () => { L: typeof Leaflet; map: Leaflet.Map } | null;
  host: () => HTMLDivElement | null;
  ready: number;
  geo: MapGeo | null;
  pins: Row[];
  onPin: (id: string) => void;
  ask?: MapAsk | null;
  /** Rain or the circle tool own the map's clicks: the plotter waits */
  blocked?: boolean;
}

/** a geo tool owns the map's clicks: SatMap's ward click (zone filter, "what is happening here?") stands aside */
export const geoBusy = { on: false };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const when = (d: string | null) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : null);
const SENSOR: Record<string, string> = { WV01: "WorldView-1", WV02: "WorldView-2", WV03: "WorldView-3", WV04: "WorldView-4", GE01: "GeoEye-1", QB02: "QuickBird", IK02: "IKONOS", PL: "Pléiades", PNEO: "Pléiades Neo" };
const shotLine = (s: Shot | undefined) => {
  if (!s) return "looking up when this photo was taken…";
  if (!s.date) return "Esri gives no photo date here";
  const sat = s.sensor ? SENSOR[s.sensor] ?? s.sensor : null;
  return [`photo taken ${when(s.date)}`, sat, s.resM ? `${s.resM < 1 ? s.resM.toFixed(1) : Math.round(s.resM)} m detail` : null].filter(Boolean).join(" · ");
};

export default function GeoTools(p: Props) {
  const [tool, setTool] = useState<"swipe" | "plot" | null>(null);
  const [then, setThen] = useState(2016);
  const [shots, setShots] = useState<Record<number, Shot>>({});
  const [x, setX] = useState(0.5);
  const xRef = useRef(0.5);
  const [plot, setPlot] = useState<{ pts: Pt[]; closed: boolean; hover: number | null }>({ pts: [], closed: false, hover: null });
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const cb = useRef(p);
  cb.current = p;
  useEffect(() => { setPortal(p.host()?.parentElement ?? null); }, [p.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // the other tool, Rain or the circle tool taking the map: this one stands down
  useEffect(() => { if (p.blocked && tool === "plot") setTool(null); }, [p.blocked, tool]);
  useEffect(() => { geoBusy.on = tool === "plot"; return () => { geoBusy.on = false; }; }, [tool]);
  // Esc leaves either tool (and is not passed on to close the page behind it)
  useEffect(() => {
    if (!tool) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setTool(null); }
      else if (tool === "plot" && e.key === "Backspace" && !(e.target as HTMLElement)?.closest?.("input, textarea")) {
        e.preventDefault();
        setPlot((s) => (s.closed ? { ...s, closed: false } : { ...s, pts: s.pts.slice(0, -1) }));
      } else if (tool === "plot" && e.key === "Enter") setPlot((s) => (s.pts.length >= 3 ? { ...s, closed: true } : s));
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [tool]);

  // ---------------------------------------------------------------- then and now --
  const layers = useRef<{ now: Leaflet.TileLayer; then: Leaflet.TileLayer; pane: HTMLElement } | null>(null);
  const clip = () => {
    const m = cb.current.get(), l = layers.current;
    if (!m || !l) return;
    const size = m.map.getSize();
    const nw = m.map.containerPointToLayerPoint([0, 0]), se = m.map.containerPointToLayerPoint(size);
    const cut = nw.x + size.x * xRef.current;
    // the older photo shows left of the handle only (the pane moves with the map, so the cut is in its own coordinates)
    l.pane.style.clip = `rect(${nw.y}px, ${cut}px, ${se.y}px, ${nw.x}px)`;
  };
  useEffect(() => {
    if (tool !== "swipe") return;
    const m = p.get();
    if (!m) return;
    const { L, map } = m;
    const pane = (n: string, z: number) => { const e = map.getPane(n) ?? map.createPane(n); e.style.zIndex = String(z); e.style.pointerEvents = "none"; return e; };
    pane("diqNow", 240);
    const thenPane = pane("diqThen", 250);
    const attr = "Imagery © Esri World Imagery Wayback, Maxar, Earthstar Geographics";
    const now = L.tileLayer(waybackTiles(LATEST.release), { pane: "diqNow", maxZoom: 19, attribution: attr }).addTo(map);
    const old = L.tileLayer(waybackTiles(releaseOf(then)?.release ?? RELEASES[0].release), { pane: "diqThen", maxZoom: 19 }).addTo(map);
    layers.current = { now, then: old, pane: thenPane };
    p.host()?.classList.add("swiping");
    map.on("move zoom zoomend resize viewreset", clip);
    clip();
    return () => {
      map.off("move zoom zoomend resize viewreset", clip);
      now.remove(); old.remove();
      thenPane.style.clip = "";
      layers.current = null;
      cb.current.host()?.classList.remove("swiping");
    };
  }, [tool, p.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const r = releaseOf(then); if (r) layers.current?.then.setUrl(waybackTiles(r.release)); }, [then]);
  // when each side's photo was taken, for the place in the middle of the map (again after a move of a kilometre or so)
  useEffect(() => {
    if (tool !== "swipe") return;
    const m = p.get();
    if (!m) return;
    let live = true, t: ReturnType<typeof setTimeout> | null = null, last = "";
    const read = () => {
      const c = m.map.getCenter();
      const key = `${c.lat.toFixed(2)},${c.lng.toFixed(2)},${then}`;
      if (key === last) return;
      last = key;
      setShots({});
      fetch(`/api/map/imagery?lat=${c.lat.toFixed(4)}&lon=${c.lng.toFixed(4)}&years=${then},${LATEST.year}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((j: { shots?: Shot[] } | null) => {
          if (!live) return;
          // not answered: both sides say the date is not known, rather than "looking it up" for ever
          const none = (y: number): Shot => ({ year: y, date: null, sensor: null, resM: null, provider: null });
          setShots(Object.fromEntries((j?.shots ?? [none(then), none(LATEST.year)]).map((s) => [s.year, s])));
        });
    };
    const moved = () => { if (t) clearTimeout(t); t = setTimeout(read, 700); };
    read();
    m.map.on("moveend", moved);
    return () => { live = false; if (t) clearTimeout(t); m.map.off("moveend", moved); };
  }, [tool, then, p.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const drag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const host = p.host();
    if (!host) return;
    e.preventDefault();
    const b = e.currentTarget;
    b.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const v = Math.max(0.04, Math.min(0.96, (ev.clientX - r.left) / r.width));
      xRef.current = v; setX(v); clip();
    };
    const up = () => { b.removeEventListener("pointermove", move); b.removeEventListener("pointerup", up); b.removeEventListener("pointercancel", up); };
    b.addEventListener("pointermove", move); b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
  };
  const nudge = (d: number) => { const v = Math.max(0.04, Math.min(0.96, xRef.current + d)); xRef.current = v; setX(v); clip(); };

  // ---------------------------------------------------------------- measure and plot --
  const drawn = useRef<{ group: Leaflet.LayerGroup; ghost: Leaflet.Polyline } | null>(null);
  useEffect(() => {
    if (tool !== "plot") return;
    const m = p.get();
    if (!m) return;
    const { L, map } = m;
    const group = L.layerGroup().addTo(map);
    const ghost = L.polyline([], { color: "#FFD24A", weight: 2, dashArray: "4 6", opacity: 0.85, interactive: false }).addTo(map);
    drawn.current = { group, ghost };
    map.doubleClickZoom.disable();
    const host = p.host();
    host?.classList.add("plotting");
    const click = (e: Leaflet.LeafletMouseEvent) => {
      setPlot((s) => {
        if (s.closed) return s;
        // the first corner clicked again closes the area
        if (s.pts.length >= 3) {
          const first = map.latLngToContainerPoint([s.pts[0].lat, s.pts[0].lon]);
          if (first.distanceTo(e.containerPoint) < 14) return { ...s, closed: true };
        }
        // a double-click's two clicks land on the same spot: one corner, and the double-click closes the area
        const last = s.pts[s.pts.length - 1];
        if (last && map.latLngToContainerPoint([last.lat, last.lon]).distanceTo(e.containerPoint) < 6) return s;
        return { ...s, pts: [...s.pts, { lat: e.latlng.lat, lon: e.latlng.lng }] };
      });
    };
    const dbl = () => setPlot((s) => (s.pts.length >= 3 ? { ...s, closed: true } : s));
    const move = (e: Leaflet.LeafletMouseEvent) => {
      setPlot((s) => {
        const last = s.pts[s.pts.length - 1];
        ghost.setLatLngs(!s.closed && last ? [[last.lat, last.lon], e.latlng] : []);
        return { ...s, hover: !s.closed && last ? Math.round(map.distance([last.lat, last.lon], e.latlng)) : null };
      });
    };
    map.on("click", click); map.on("dblclick", dbl); map.on("mousemove", move);
    return () => {
      map.off("click", click); map.off("dblclick", dbl); map.off("mousemove", move);
      map.doubleClickZoom.enable();
      group.remove(); ghost.remove();
      drawn.current = null;
      host?.classList.remove("plotting");
    };
  }, [tool, p.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  // the plot's shape, drawn as it grows
  useEffect(() => {
    const m = p.get(), d = drawn.current;
    if (!m || !d) return;
    const { L } = m;
    d.group.clearLayers();
    const ll = plot.pts.map((q) => [q.lat, q.lon] as [number, number]);
    if (plot.closed && ll.length >= 3) {
      d.ghost.setLatLngs([]);
      L.polygon(ll, { color: "#FFD24A", weight: 2.5, fillColor: "#FFD24A", fillOpacity: 0.14, interactive: false, className: "gt-plot" }).addTo(d.group);
    } else if (ll.length > 1) L.polyline(ll, { color: "#FFD24A", weight: 2.5, interactive: false }).addTo(d.group);
    ll.forEach((q, i) => L.circleMarker(q, { radius: i === 0 && ll.length >= 3 && !plot.closed ? 7 : 4.5, color: "#1A1A1A", weight: 1.5, fillColor: "#FFD24A", fillOpacity: 1, interactive: false }).addTo(d.group));
  }, [plot]); // eslint-disable-line react-hooks/exhaustive-deps
  const startPlot = () => { setPlot({ pts: [], closed: false, hover: null }); setTool((t) => (t === "plot" ? null : "plot")); };

  // what the closed plot holds
  const closed = plot.closed && plot.pts.length >= 3;
  const area = closed ? ringArea(plot.pts) : 0;
  const len = pathLength(plot.pts, closed);
  const within = closed ? p.pins.filter((r) => r.lat != null && r.lon != null && inside({ lat: Number(r.lat), lon: Number(r.lon) }, plot.pts)) : [];
  within.sort((a, b) => Number(b.sev === "Severe") - Number(a.sev === "Severe") || Number(b.open) - Number(a.open));
  const wards = closed && p.geo ? p.geo.wards.filter((w) => {
    const ring = (w.rings[0] ?? []).map(([lat, lon]) => ({ lat, lon }));
    if (!ring.length) return false;
    return inside(centre(ring), plot.pts) || ring.some((q) => inside(q, plot.pts)) || plot.pts.some((q) => inside(q, ring));
  }).map((w) => w.ward).sort((a, b) => a - b) : [];
  const a = fmtArea(area);
  const copy = () => {
    const g = toGeoJson(plot.pts, { area_m2: Math.round(area), perimeter_m: Math.round(len), wards, made: new Date().toISOString(), by: "District IQ land plotter" });
    navigator.clipboard?.writeText(g).then(() => flash("Copied as GeoJSON"), () => flash("Could not copy"));
  };
  const [note, setNote] = useState<string | null>(null);
  const flash = (t: string) => { setNote(t); setTimeout(() => setNote(null), 1800); };
  // Ask the Map opens (the map grows) and answers for the circle that holds the plot: every record in the store, not only the pins shown
  const askHere = () => { if (!closed || !p.ask) return; p.ask.setGrown(true); void p.ask.draw(enclosing(plot.pts)); setTool(null); };

  const r = releaseOf(then);
  const overlay = !portal ? null : tool === "swipe" ? createPortal(
    <div className="gt-swipe" style={{ ["--x" as string]: `${x * 100}%` }}>
      <div className="gt-line" />
      <button className="gt-knob" onPointerDown={drag} aria-label="Drag to compare the two years" title="Drag to compare"
        onKeyDown={(e) => { if (e.key === "ArrowLeft") nudge(-0.05); else if (e.key === "ArrowRight") nudge(0.05); }}><I n="chevl" /><I n="chevr" /></button>
      <div className="gt-tag l"><b>{then}</b><small>{shotLine(shots[then])}</small></div>
      <div className="gt-tag r"><b>Now</b><small>{shotLine(shots[LATEST.year])}</small></div>
      <div className="gt-years" role="radiogroup" aria-label="The year on the left">
        <span className="gt-yl"><I n="history" />Then</span>
        {RELEASES.slice(0, -1).map((y) => (
          <button key={y.year} role="radio" aria-checked={then === y.year} className={then === y.year ? "on" : ""} onClick={() => setThen(y.year)}
            title={`Esri World Imagery as published ${y.published}`}>{String(y.year).slice(2)}</button>
        ))}
        <button className="gt-x" onClick={() => setTool(null)} aria-label="Close then and now" title="Close (Esc)"><I n="x" /></button>
      </div>
      <span className="gt-src">{r ? `Left: Esri World Imagery as of ${r.published}` : ""} · Right: today&apos;s · photos by Maxar and partners</span>
    </div>, portal)
    : tool === "plot" ? createPortal(
      <div className={`gt-plotcard${closed ? " done" : ""}`} role="dialog" aria-label="Measure and plot">
        <header><I n="ruler" /><b>{closed ? "Plotted area" : plot.pts.length ? "Plotting…" : "Measure and plot"}</b>
          <button className="gt-x" onClick={() => setTool(null)} aria-label="Close the plotter" title="Close (Esc)"><I n="x" /></button></header>
        {!closed ? (
          <>
            <p className="gt-help">{plot.pts.length === 0 ? "Click the map at each corner of the land or stretch to measure."
              : plot.pts.length < 3 ? "Keep clicking corners. The distance so far is below."
              : "Click the first corner again (or double-click, or press Enter) to close the area."}</p>
            <div className="gt-nums"><span><small>Length</small><b>{fmtLength(len + (plot.hover ?? 0))}</b></span><span><small>Corners</small><b>{plot.pts.length}</b></span></div>
            {plot.pts.length > 0 && <div className="gt-acts"><button onClick={() => setPlot((s) => ({ ...s, pts: s.pts.slice(0, -1) }))}><I n="chevl" />Undo corner</button>
              <button onClick={() => setPlot({ pts: [], closed: false, hover: null })}><I n="trash" />Start again</button></div>}
          </>
        ) : (
          <>
            <div className="gt-nums big"><span><small>Area</small><b>{a.main}</b><em>{a.also}</em></span><span><small>Perimeter</small><b>{fmtLength(len)}</b></span></div>
            <p className="gt-line2"><b>{wards.length ? `Ward${wards.length > 1 ? "s" : ""} ${wards.slice(0, 8).join(", ")}${wards.length > 8 ? ` and ${wards.length - 8} more` : ""}` : "Outside the GCC wards"}</b></p>
            <p className="gt-line2">{within.length ? <><b>{within.length}</b> incident{within.length > 1 ? "s" : ""} on the map inside · <b>{within.filter((w) => w.sev === "Severe").length}</b> severe · <b>{within.filter((w) => Number(w.open) === 1).length}</b> open</> : "No incident on the map inside this area."}</p>
            {within.length > 0 && (
              <ul className="gt-list">
                {within.slice(0, 5).map((w) => (
                  <li key={w.id}><button onClick={() => p.onPin(String(w.id))}><i className={w.sev === "Severe" ? "sev" : Number(w.open) === 1 ? "open" : ""} /><span>{w.title ?? "Incident"}</span><small>{w.status}</small></button></li>
                ))}
              </ul>
            )}
            <div className="gt-acts">
              {p.ask && <button className="pri" onClick={askHere} title="Everything the store knows about this area, in Ask the Map"><I n="search" />Ask about this area</button>}
              <button onClick={copy} title="For a surveyor or another GIS"><I n="copy" />Copy GeoJSON</button>
              <button onClick={() => setPlot({ pts: [], closed: false, hover: null })}><I n="plus" />New plot</button>
            </div>
          </>
        )}
        {note && <div className="gt-note" role="status">{note}</div>}
      </div>, portal)
    : null;

  return (
    <>
      <button onClick={() => setTool((t) => (t === "swipe" ? null : "swipe"))} className={tool === "swipe" ? "on" : ""} aria-pressed={tool === "swipe"}
        title="Then and now: swipe between a past year's satellite photo and today's" aria-label="Then and now satellite compare"><I n="history" /></button>
      <button onClick={startPlot} disabled={p.blocked} className={tool === "plot" ? "on" : ""} aria-pressed={tool === "plot"}
        title="Measure and plot: distance, area (acres, cents, hectares), the wards and incidents inside" aria-label="Measure and plot an area"><I n="ruler" /></button>
      {overlay}
    </>
  );
}
