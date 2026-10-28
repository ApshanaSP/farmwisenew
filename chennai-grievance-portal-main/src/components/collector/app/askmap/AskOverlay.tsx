"use client";

/**
 * What Ask the Map puts over a console map: the "Ask the map…" pill on the small map (it shows the current answer's
 * headline when one is drawn), and, once the map has grown, the panel, the legend, the Layers menu and the actions:
 * Send to department (the Collector: one draft per department, sent only on Approve, sandbox by default), Export,
 * Save view and the officer's Visit order. The panel's code loads on the pill's first use, so the Overview loads no
 * slower than before.
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { AskResponse } from "@/lib/map/ask";
import { fmtDistance } from "@/lib/map/geom";
import { I } from "../icons";
import { Legend, type Overlay } from "./Chrome";
import { downloadAnswer, googleMapsLink, saveView, visitOrder } from "./actions";
import type { MapAsk } from "./useMapAsk";

const AskMapPanel = dynamic(() => import("./AskMapPanel"), { ssr: false, loading: () => <aside className="amp" aria-busy="true"><div className="amp-busy" style={{ margin: 14 }} /></aside> });

let suggestCache: string[] | null = null;

export default function AskOverlay({ ask, role, toast, onOpen, layersMenu, overlays, compact }: {
  ask: MapAsk;
  role: "collector" | "officer";
  toast: (msg: string, kind?: "ok" | "alert") => void;
  onOpen: (id: string) => void;
  layersMenu: React.ReactNode;
  overlays: Overlay[];
  /** the officer's smaller map: the pill says only "Ask the map" */
  compact?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<string[]>(suggestCache ?? []);
  const [focusBox, setFocusBox] = useState(false);
  const [sending, setSending] = useState<{ dept: string | null } | null>(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    if (!ask.grown || suggestCache) return;
    fetch("/api/map/suggest").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.items) { suggestCache = j.items; setSuggestions(j.items); } }).catch(() => undefined);
  }, [ask.grown]);
  const r: AskResponse | null = ask.resp;
  const question = ask.history[ask.history.length - 1] ?? null;
  if (!ask.grown) {
    const label = r?.kind === "answer" ? r.answer?.headline.replace(/ · (map layer ready|வரைபட அடுக்கு தயார்)\.?$/, "") : r?.kind === "brief" ? r.brief?.label.en : null;
    return (
      <button className="ampill" onClick={() => { setFocusBox(true); ask.setGrown(true); }} title="Ask the map a question, in English or Tamil" aria-label="Ask the map"
        onMouseEnter={() => { import("./AskMapPanel"); }} onFocus={() => { import("./AskMapPanel"); }}>
        <I n="search" />{label ? <span className="ans">{label}</span> : <span>{compact ? "Ask the map" : "Ask the map…"}</span>}
      </button>
    );
  }
  const exportIt = () => setExporting(true);
  return (
    <>
      <AskMapPanel ask={ask} autoFocus={focusBox || !r} actions={{
        role, suggestions, onBack: () => ask.setGrown(false), onOpen,
        onSend: role === "collector" ? (_a, dept) => setSending({ dept }) : undefined,
        onExport: exportIt,
        onSave: (a) => saveView(a, role, question).then((m) => toast(m)).catch((e) => toast(e.message, "alert")),
        onVisits: role === "officer" ? (a) => {
          const route = visitOrder(a, null);
          if (!route.stops.length) { toast("No open case in this answer has an exact place to visit.", "alert"); return; }
          ask.setRoute(route);
        } : undefined
      }} />
      <Legend r={r} overlays={overlays} />
      {layersMenu}
      {exporting && r && (
        <div className="amsheet" role="dialog" aria-label="Export">
          <h4>Export {r.total.toLocaleString("en-IN")} rows</h4>
          <p>Exactly the answer's rows, with the as-of date and the question in the file. No personal details.</p>
          <div className="amsheet-b">
            {(["csv", "geojson"] as const).map((f) => (
              <button key={f} className="pri" onClick={() => downloadAnswer(r, f, question).then((m) => { toast(`Exported ${m}`); setExporting(false); }).catch((e) => toast(e.message, "alert"))}>
                <I n="download" />{f === "csv" ? "CSV (spreadsheet)" : "GeoJSON (GIS)"}
              </button>
            ))}
            <button onClick={() => setExporting(false)}>Cancel</button>
          </div>
        </div>
      )}
      {sending && r && <SendDialog r={r} dept={sending.dept} question={question} onClose={() => setSending(null)} toast={toast} />}
      {ask.route && <VisitCard ask={ask} toast={toast} />}
    </>
  );
}

interface Draft { dept: string; deptName: string; ids: string[]; total: number; listed: number; subject: string; body: string; to: { name: string; email: string | null } | null;
  delivery: { mode: string; smtp: boolean; to: string | null; note: string } }

/** One draft per responsible department, each opened for review; Approve sends it (sandbox by default). */
function SendDialog({ r, dept, question, onClose, toast }: { r: AskResponse; dept: string | null; question: string | null; onClose: () => void; toast: (m: string, k?: "ok" | "alert") => void }) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(0);
  useEffect(() => {
    fetch("/api/map/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "draft", plan: r.plan, question, dept }) })
      .then((x) => x.json()).then((j) => (j.drafts ? setDrafts(j.drafts) : setErr(j.error ?? "The drafts could not be made."))).catch(() => setErr("The drafts could not be made."));
  }, [r, dept, question]);
  const send = async (d: Draft) => {
    setBusy(d.dept);
    const x = await fetch("/api/map/send", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "send", dept: d.dept, ids: d.ids, subject: d.subject, body: d.body, plan: r.plan }) });
    const j = await x.json().catch(() => ({}));
    setBusy(null);
    if (!x.ok) { toast(j.error ?? "Not sent.", "alert"); return; }
    setDone((m) => ({ ...m, [d.dept]: `${j.note} Follow-up set for ${j.followups} ${j.followups === 1 ? "case" : "cases"} (24 h).` }));
    toast(`${d.deptName}: ${j.note}`);
  };
  return (
    <div className="amsheet wide" role="dialog" aria-label="Send to department">
      <h4>Send to department{dept ? "" : "s"}</h4>
      <p>One email per department, listing its open cases from this answer. Nothing is sent until you press Approve.</p>
      {err && <div className="amp-err">{err}</div>}
      {!drafts && !err && <div className="amp-busy" />}
      {drafts?.length === 0 && <p>No open case in this answer to send.</p>}
      <div className="amsend">
        {drafts?.map((d, k) => (
          <section key={d.dept} className={open === k ? "on" : ""}>
            <button className="amsend-h" onClick={() => setOpen(k)} aria-expanded={open === k}>
              <b>{d.deptName}</b><span>{d.total} {d.total === 1 ? "case" : "cases"}{d.total > d.listed ? ` (${d.listed} listed)` : ""}</span>
              {done[d.dept] && <em><I n="checkc" />sent</em>}
            </button>
            {open === k && (
              <div className="amsend-b">
                <div className="amsend-to">To: {d.to ? `${d.to.name} <${d.to.email ?? "no address"}>` : "the department's console (no officer account)"} · <b>{d.delivery.mode === "sandbox" ? "Sandbox" : "Live"}</b>: {d.delivery.note}</div>
                <input value={d.subject} onChange={(e) => setDrafts((x) => x!.map((y) => (y.dept === d.dept ? { ...y, subject: e.target.value } : y)))} aria-label="Subject" />
                <textarea value={d.body} rows={10} onChange={(e) => setDrafts((x) => x!.map((y) => (y.dept === d.dept ? { ...y, body: e.target.value } : y)))} aria-label="Message" />
                {done[d.dept] ? <div className="amsend-ok">{done[d.dept]}</div>
                  : <button className="pri" disabled={busy === d.dept} onClick={() => send(d)}><I n="send" />{busy === d.dept ? "Sending…" : "Approve and send"}</button>}
              </div>
            )}
          </section>
        ))}
      </div>
      <div className="amsheet-b"><button onClick={onClose}>Close</button></div>
    </div>
  );
}

/** The officer's visit order: numbered stops, straight-line legs and the total, with an Open in Google Maps link. */
function VisitCard({ ask, toast }: { ask: MapAsk; toast: (m: string, k?: "ok" | "alert") => void }) {
  const route = ask.route!;
  const [locating, setLocating] = useState(false);
  const fromHere = () => {
    if (!navigator.geolocation) { toast("This browser cannot share its location.", "alert"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((p) => { setLocating(false); ask.setRoute(visitOrder(ask.resp!, { lat: p.coords.latitude, lon: p.coords.longitude })); },
      () => { setLocating(false); toast("Location was not shared; the route starts at the highest-priority case.", "alert"); }, { timeout: 10000 });
  };
  return (
    <div className="amsheet" role="dialog" aria-label="Visit order">
      <h4>Visit order: {route.stops.length} {route.stops.length === 1 ? "stop" : "stops"}, {fmtDistance(route.total_m)}</h4>
      <p>Straight-line, not road distance. {route.start ? "Starting from your location." : "Starting at the highest-priority case; click the map or use your location to start elsewhere."}</p>
      {/* each stop with its distance from the one before (from the start point, when there is one) */}
      <ol className="amvisit">{route.stops.map((s, k) => {
        const leg = route.start ? route.legs[k] : k > 0 ? route.legs[k - 1] : null;
        return <li key={s.id}><b>{k + 1}</b>{s.title}<small>{leg == null ? "start" : `+${fmtDistance(leg)}`}</small></li>;
      })}</ol>
      <div className="amsheet-b">
        <a className="pri" href={googleMapsLink(route)} target="_blank" rel="noopener noreferrer"><I n="ext" />Open in Google Maps</a>
        <button onClick={fromHere} disabled={locating}><I n="pin" />{locating ? "Locating…" : "Use my location"}</button>
        <button onClick={() => ask.setRoute(null)}>Close</button>
      </div>
    </div>
  );
}
