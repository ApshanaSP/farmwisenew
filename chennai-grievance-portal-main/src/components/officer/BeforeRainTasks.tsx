"use client";
/**
 * The officer's before-rain tasks (Rain Rehearsal): the jobs the Collector approved for this department, with their
 * deadlines, a small map with the visit order on real roads (rehearsal roads: likely flood streets closed), and Done
 * with an optional photo (where it was taken is compared with the job's place). Only this department's jobs: the
 * server decides (lockDept). Shown on the officer Board while there are tasks; quiet otherwise.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "@/components/collector/app/rehearsal/rehearsal.css";

interface Task { id: number; key: string; text: string; lat: number; lon: number; ward: number | null; due: string | null; status: "todo" | "done" | "late"; doneAt: string | null; photo: string | null; photoM: number | null; incident: string | null }
const fmtT = (t: string | null) => (t ? new Date(t.replace(" ", "T") + "Z").toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) : "as soon as possible");
const KX = 111320 * Math.cos(13.05 * Math.PI / 180), KY = 110574;
const dist = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => Math.hypot((a.lon - b.lon) * KX, (a.lat - b.lat) * KY);

/** nearest-first order of the open tasks (the officer starts at the first) */
function order(ts: Task[]): Task[] {
  const left = [...ts];
  const out: Task[] = [];
  let cur = left.shift();
  while (cur) { out.push(cur); left.sort((a, b) => dist(cur!, a) - dist(cur!, b)); cur = left.shift(); }
  return out;
}

/**
 * The slim line on the officer Board while the department has before-rain tasks: how many are done and the next
 * deadline; it opens the tasks card in a drawer (the Board's grid stays as it is). Nothing when there are none.
 */
export function BeforeRainStrip() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () => fetch("/api/rehearsal/tasks").then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j) setTasks(j.tasks); }).catch(() => undefined);
    load();
    const t = setInterval(load, 120_000);
    return () => { live = false; clearInterval(t); };
  }, [open]);
  if (!tasks?.length) return null;
  const left = tasks.filter((t) => t.status !== "done");
  const late = tasks.filter((t) => t.status === "late").length;
  const next = left.map((t) => t.due).filter(Boolean).sort()[0] ?? null;
  return (
    <>
      <button className="rr-band lv-rehearse" style={{ width: "100%", border: 0, cursor: "pointer", font: "inherit", textAlign: "left" }} onClick={() => setOpen(true)}>
        <span className="rr-rain" aria-hidden="true" />
        <b>Before-rain tasks from the Collector</b>
        <span className="rr-band-ready">{tasks.length - left.length} of {tasks.length} done{late ? ` · ${late} late` : ""}</span>
        {next && <span className="rr-band-src">next due {fmtT(next)}</span>}
        <span className="tspace" />
        <span className="rr-band-go">Open</span>
      </button>
      {open && (
        <>
          <div className="scrim" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 80 }} />
          <aside style={{ position: "fixed", top: 12, right: 12, bottom: 12, width: 440, zIndex: 81, overflow: "auto", padding: 12, borderRadius: 14, background: "var(--surface)", boxShadow: "0 24px 60px rgba(0,0,0,.25)" }}>
            <button className="rr-x" style={{ float: "right", color: "var(--text-2)" }} onClick={() => setOpen(false)} aria-label="Close">✕</button>
            <BeforeRainTasks />
          </aside>
        </>
      )}
    </>
  );
}

export function BeforeRainTasks({ dev }: { dev?: string }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [route, setRoute] = useState<{ min: number; km: number; lines: [number, number][][] } | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ L: typeof Leaflet; map: Leaflet.Map; g: Leaflet.LayerGroup } | null>(null);
  const url = dev ? `/api/rehearsal/dev?kind=tasks&dept=${encodeURIComponent(dev)}` : "/api/rehearsal/tasks";

  const load = useCallback(() => fetch(url).then((r) => (r.ok ? r.json() : null)).then((j) => j && setTasks(j.tasks)).catch(() => undefined), [url]);
  useEffect(() => { load(); const t = setInterval(load, 120_000); return () => clearInterval(t); }, [load]);

  const open = (tasks ?? []).filter((t) => t.status !== "done");
  const visit = order(open).slice(0, 10);

  // the visit route on rehearsal roads, leg by leg
  useEffect(() => {
    if (visit.length < 2) { setRoute(null); return; }
    let live = true;
    (async () => {
      const lines: [number, number][][] = [];
      let min = 0, km = 0;
      for (let k = 1; k < visit.length; k++) {
        const r = await fetch(dev ? "/api/rehearsal/dev?kind=route" : "/api/rehearsal/route", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ from: { lat: visit[k - 1].lat, lon: visit[k - 1].lon }, to: { lat: visit[k].lat, lon: visit[k].lon }, state: "rehearsal" }) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        if (r?.reachable) { lines.push(r.line); min += r.min; km += r.km; }
      }
      if (live) setRoute({ min, km: Math.round(km * 10) / 10, lines });
    })();
    return () => { live = false; };
  }, [visit.map((t) => t.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // the small map
  useEffect(() => {
    if (!el.current || !tasks?.length) return;
    let dead = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (dead || !el.current) return;
      if (!mapRef.current) {
        const map = L.map(el.current, { zoomControl: false, attributionControl: true });
        map.attributionControl.setPrefix(false);
        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Map © Esri · roads © OpenStreetMap contributors" }).addTo(map);
        mapRef.current = { L, map, g: L.layerGroup().addTo(map) };
      }
      const { map, g } = mapRef.current;
      g.clearLayers();
      for (const l of route?.lines ?? []) L.polyline(l, { color: "#7C3AED", weight: 4, opacity: 0.85 }).addTo(g);
      const pts: [number, number][] = [];
      tasks.forEach((t) => {
        const n = visit.findIndex((v) => v.id === t.id);
        pts.push([t.lat, t.lon]);
        L.marker([t.lat, t.lon], { icon: L.divIcon({ className: "rr-ic", iconSize: [22, 22], iconAnchor: [11, 11],
          html: `<span class="rr-fac ${t.status === "done" ? "h" : t.status === "late" ? "cut" : "f"}" style="font:700 11px sans-serif">${t.status === "done" ? "✓" : n >= 0 ? n + 1 : "·"}</span>` }) })
          .bindTooltip(t.text, { className: "rr-tip" }).addTo(g);
      });
      if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 15 });
    })();
    return () => { dead = true; };
  }, [tasks, route]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { mapRef.current?.map.remove(); mapRef.current = null; }, []);

  const done = async (t: Task, file: File | null) => {
    setBusy(t.id); setMsg(null);
    const form = new FormData();
    form.set("id", String(t.id));
    if (file) form.set("photo", file);
    const pos = await new Promise<GeolocationPosition | null>((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(res, () => res(null), { enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 });
    });
    if (pos) { form.set("lat", String(pos.coords.latitude)); form.set("lon", String(pos.coords.longitude)); }
    const r = await fetch(dev ? `/api/rehearsal/dev?kind=done&dept=${encodeURIComponent(dev)}` : "/api/rehearsal/tasks", { method: "POST", body: form });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    setMsg(r.ok ? (j.near === false ? `Marked done. The photo's place is ${j.photoM} m from the job: the Collector will see that.` : "Marked done.") : j.error ?? "Could not mark it done.");
    load();
  };

  if (!tasks || !tasks.length) return null;
  const late = tasks.filter((t) => t.status === "late").length;
  const gm = visit.length ? `https://www.google.com/maps/dir/${visit.slice(0, 9).map((t) => `${t.lat},${t.lon}`).join("/")}` : null;
  return (
    <section className="rr-otasks card" aria-label="Before-rain tasks">
      <div className="rr-otasks-h">
        <b><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 8a4.5 4.5 0 0 1 0 9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M8 20l1-2M12 21l1-2M16 20l1-2" stroke="currentColor" strokeWidth="2" /></svg>
          Before-rain tasks</b>
        <span className="rr-muted">{tasks.length - open.length} of {tasks.length} done{late ? ` · ${late} late` : ""}</span>
      </div>
      <div ref={el} style={{ height: 170, borderRadius: 10, overflow: "hidden" }} />
      {route && visit.length > 1 && (
        <p className="rr-muted small">Visit order on rehearsal roads (flood streets avoided): {visit.length} stops, about {route.min} min, {route.km} km.{" "}
          {gm && <a href={gm} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>}</p>
      )}
      {msg && <p className="rr-note">{msg}</p>}
      {[...visit, ...tasks.filter((t) => t.status === "done")].map((t) => (
        <div key={t.id} className={`rr-otask ${t.status}`}>
          <b>{t.status !== "done" && visit.includes(t) ? `${visit.indexOf(t) + 1}. ` : ""}{t.text}</b>
          <small>{t.status === "done" ? `Done ${fmtT(t.doneAt)}${t.photoM != null ? ` · photo ${t.photoM <= 300 ? "at the place" : `${t.photoM} m away`}` : ""}` : `${t.status === "late" ? "Late · was due" : "Due"} ${fmtT(t.due)}`}{t.ward ? ` · ward ${t.ward}` : ""}</small>
          {t.status !== "done" && (
            <span className="acts">
              <label className="rr-btn" title="Add a site photo and mark done">
                Photo
                <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && done(t, e.target.files[0])} />
              </label>
              <button className="rr-btn primary" disabled={busy === t.id} onClick={() => done(t, null)}>{busy === t.id ? "…" : "Done"}</button>
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
