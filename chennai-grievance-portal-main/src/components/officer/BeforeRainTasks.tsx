"use client";
/**
 * The officer's before-rain tasks (Rain Rehearsal): the jobs the Collector approved for this department, with their
 * deadlines, a small map with the visit order on real roads (rehearsal roads: likely flood streets closed), and Done
 * with an optional photo (where it was taken is compared with the job's place). Only this department's jobs: the
 * server decides (lockDept). Shown on the officer Board while there are tasks; quiet otherwise.
 *
 * Fixes after a rain (the Collector's action tracker, lib/rehearsal/tracker.ts) are listed apart: what the Collector asked to
 * change at a place a rain hit, the due date, and the steps so far. The officer posts updates and marks the fix done, each
 * time saying what was done (and a site photo where possible); the Collector then verifies it or sends it back, and the next
 * heavy rain shows whether the place held.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "@/components/collector/app/rehearsal/rehearsal.css";
import { addBasemap } from "@/components/map/basemap";

type Stage = "open" | "assigned" | "in_action" | "done" | "verified";
interface Step { step: "assign" | "progress" | "done" | "verify" | "reopen"; at: string; by: string; remarks: string | null; photo: string | null; photoM: number | null }
interface Fix { lens: "flood" | "traffic" | "power" | "metro"; place: string; label: string; note: string; stage: Stage; late: boolean; trail: Step[] }
interface Task { id: number; key: string; rehearsal: string; text: string; lat: number; lon: number; ward: number | null; due: string | null; status: "todo" | "done" | "late"; doneAt: string | null; photo: string | null; photoM: number | null; incident: string | null; fix?: Fix }
const LENS_WORD: Record<Fix["lens"], string> = { flood: "Flooded street", traffic: "Road jammed in rain", power: "Ward that lost power", metro: "Rail line late in rain" };
const STAGE_WORD: Record<Stage, string> = { open: "Not assigned", assigned: "To do", in_action: "In action", done: "Done · waiting for the Collector's check", verified: "Verified by the Collector" };
/** "rain-2026-11-18" -> "18 Nov" */
const rainDay = (id: string) => { const d = id.replace(/^rain-/, ""); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) : id; };
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
  const fixes = tasks.filter((t) => t.fix).length;
  return (
    <>
      <button className="rr-band lv-rehearse" style={{ width: "100%", border: 0, cursor: "pointer", font: "inherit", textAlign: "left" }} onClick={() => setOpen(true)}>
        <span className="rr-rain" aria-hidden="true" />
        <b>{fixes ? (fixes === tasks.length ? "Fixes after the rain, from the Collector" : "Rain tasks from the Collector") : "Before-rain tasks from the Collector"}</b>
        <span className="rr-band-ready">{tasks.length - left.length} of {tasks.length} done{late ? ` · ${late} late` : ""}</span>
        {next && <span className="rr-band-src">next due {fmtT(next)}</span>}
        <span className="tspace" />
        <span className="rr-band-go">Open</span>
      </button>
      {open && (
        <>
          <div className="scrim" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 80 }} />
          <aside style={{ position: "fixed", top: 12, right: 12, bottom: 12, width: "min(440px, calc(100vw - 24px))", zIndex: 81, overflow: "auto", padding: 12, borderRadius: 14, background: "var(--surface)", boxShadow: "0 24px 60px rgba(0,0,0,.25)" }}>
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
        // the sharp street map: the roads of the visit route are what the officer reads here
        addBasemap(L, map, "map");
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

  const done = async (t: Task, file: File | null, step: "done" | "progress" = "done", remarks: string | null = null): Promise<boolean> => {
    setBusy(t.id); setMsg(null);
    const form = new FormData();
    form.set("id", String(t.id));
    form.set("step", step);
    if (remarks) form.set("remarks", remarks);
    if (file) form.set("photo", file);
    const pos = await new Promise<GeolocationPosition | null>((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(res, () => res(null), { enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 });
    });
    if (pos) { form.set("lat", String(pos.coords.latitude)); form.set("lon", String(pos.coords.longitude)); }
    const r = await fetch(dev ? `/api/rehearsal/dev?kind=done&dept=${encodeURIComponent(dev)}` : "/api/rehearsal/tasks", { method: "POST", body: form });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    const far = j.near === false ? ` The photo's place is ${j.photoM} m from the place: the Collector will see that.` : "";
    setMsg(r.ok ? (step === "progress" ? `Update sent to the Collector.${far}` : `Marked done.${far}${t.fix ? " The Collector will check it." : ""}`) : j.error ?? "Could not save it.");
    load();
    return r.ok;
  };

  if (!tasks || !tasks.length) return null;
  const late = tasks.filter((t) => t.status === "late").length;
  const before = tasks.filter((t) => !t.fix);
  const fixes = tasks.filter((t) => t.fix).sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.due ?? "9").localeCompare(b.due ?? "9") || a.id - b.id);
  const gm = visit.length ? `https://www.google.com/maps/dir/${visit.slice(0, 9).map((t) => `${t.lat},${t.lon}`).join("/")}` : null;
  return (
    <section className="rr-otasks card" aria-label="Before-rain tasks">
      <div className="rr-otasks-h">
        <b><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 8a4.5 4.5 0 0 1 0 9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M8 20l1-2M12 21l1-2M16 20l1-2" stroke="currentColor" strokeWidth="2" /></svg>
          {fixes.length ? (before.length ? "Rain tasks" : "Fixes after the rain") : "Before-rain tasks"}</b>
        <span className="rr-muted">{tasks.length - open.length} of {tasks.length} done{late ? ` · ${late} late` : ""}</span>
      </div>
      <div ref={el} style={{ height: 170, borderRadius: 10, overflow: "hidden" }} />
      {route && visit.length > 1 && (
        <p className="rr-muted small">Visit order on rehearsal roads (flood streets avoided): {visit.length} stops, about {route.min} min, {route.km} km.{" "}
          {gm && <a href={gm} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>}</p>
      )}
      {msg && <p className="rr-note">{msg}</p>}
      {fixes.length > 0 && (
        <>
          <b className="rr-muted" style={{ display: "block", margin: "8px 0 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>Fixes after the rain · {fixes.filter((t) => t.status !== "done").length} open</b>
          {fixes.map((t) => <FixTask key={t.id} t={t} n={visit.indexOf(t)} busy={busy === t.id} onStep={(file, step, remarks) => done(t, file, step, remarks)} />)}
        </>
      )}
      {fixes.length > 0 && before.length > 0 && <b className="rr-muted" style={{ display: "block", margin: "8px 0 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>Before the next rain</b>}
      {[...visit.filter((t) => !t.fix), ...before.filter((t) => t.status === "done")].map((t) => (
        <div key={t.id} className={`rr-otask ${t.status}`}>
          <b>{t.status !== "done" && visit.includes(t) ? <span className="stop" title="Its number on the map route">Stop {visit.indexOf(t) + 1} · </span> : null}{t.text}</b>
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

/**
 * One fix after a rain: where, what the Collector asked, the stage and the last step; while it is open, what was done (needed)
 * with an optional site photo, sent as an update or as done. A fix the Collector sent back shows why.
 */
function FixTask({ t, n, busy, onStep }: { t: Task; n: number; busy: boolean; onStep: (file: File | null, step: "done" | "progress", remarks: string) => Promise<boolean> }) {
  const f = t.fix!;
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const last = [...f.trail].reverse().find((e) => e.step !== "assign") ?? null;
  const sentBack = last?.step === "reopen" ? last : null;
  const can = f.stage === "assigned" || f.stage === "in_action";
  const ok = text.trim().length >= 5;
  const go = async (step: "done" | "progress") => { if (await onStep(file, step, text.trim())) { setText(""); setFile(null); setOpen(false); } };
  const lastWord = last ? ({ progress: "Update", done: "Marked done", verify: "Verified by the Collector", reopen: "Sent back", assign: "" } as const)[last.step] : "";
  return (
    <div className={`rr-otask ${t.status}`} style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
      <b>{n >= 0 ? <span className="stop" title="Its number on the map route">Stop {n + 1} · </span> : null}{f.label}</b>
      <small>{LENS_WORD[f.lens]} in the {rainDay(t.rehearsal)} rain · {STAGE_WORD[f.stage]}{can ? ` · ${f.late ? "late, was due" : "due"} ${fmtT(t.due)}` : ""}{t.ward ? ` · ward ${t.ward}` : ""}</small>
      <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{f.note}</span>
      {sentBack && <span className="rr-note">Sent back by the Collector{sentBack.remarks ? `: ${sentBack.remarks}` : ""}</span>}
      {last && !sentBack && <small>{lastWord} {last.at ? fmtT(last.at) : ""}{last.remarks ? ` · “${last.remarks}”` : ""}{last.photo ? " · with a photo" : ""}</small>}
      {can && !open && <span><button className="rr-btn" onClick={() => setOpen(true)}>Update or mark done</button></span>}
      {can && open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} aria-label="What was done"
            placeholder="What was done, for example: drain inlets on both sides desilted, 120 m"
            style={{ width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 9, border: "1px solid var(--line-3)", background: "var(--surface)", color: "var(--text)", font: "inherit", fontSize: 12.5, resize: "vertical" }} />
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <label className="rr-btn" title="Add a site photo">{file ? "Photo added" : "Add photo"}
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <button className="rr-btn" disabled={busy || !ok} onClick={() => go("progress")}>Send update</button>
            <button className="rr-btn primary" disabled={busy || !ok} onClick={() => go("done")}>{busy ? "…" : "Mark done"}</button>
            <button className="rr-btn" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          </span>
        </div>
      )}
    </div>
  );
}
