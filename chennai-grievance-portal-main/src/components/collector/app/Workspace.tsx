"use client";

import { useEffect, useState } from "react";
import { I } from "./icons";
import { Empty, fmtShort, type Row } from "./lib";
import type { Console } from "./CollectorApp";

export interface Layout {
  pages: { briefing: boolean; trends: boolean; environment: boolean; studio: boolean };
  panels: { map: boolean; snapshot: boolean; brief: boolean; severity: boolean; tasks: boolean };
  kpis: string[];
}
export const DEFAULT_LAYOUT: Layout = {
  pages: { briefing: true, trends: true, environment: true, studio: true },
  panels: { map: true, snapshot: true, brief: true, severity: true, tasks: true },
  kpis: ["severe", "complaints", "ongoing", "resolved"]
};
/** A layout saved before a page existed shows that page (the new page is on by default). */
export function normalizeLayout(l: Layout): Layout {
  return { ...DEFAULT_LAYOUT, ...l, pages: { ...DEFAULT_LAYOUT.pages, ...l.pages }, panels: { ...DEFAULT_LAYOUT.panels, ...l.panels } };
}
export const KPI_LABELS: Record<string, string> = {
  severe: "Severe events", complaints: "Open complaints", ongoing: "Ongoing incidents", resolved: "Resolved"
};

/** Save the current view (filters, layout and a frozen briefing) and reopen saved versions. */
export function WorkspaceBody({ c }: { c: Console }) {
  const [list, setList] = useState<{ name: string; versions: Row[] }[] | null>(null);
  const [name, setName] = useState(c.workspaceName ?? "Collector's Daily Briefing");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  /** the workspace being renamed (its new name), or asked to be deleted */
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const change = async (method: "PATCH" | "DELETE", url: string, body: unknown, ok: string) => {
    setBusy(true);
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "That did not work. Please try again.");
      c.toast(ok);
      setRenaming(null); setDeleting(null);
      load();
    } catch (e) {
      c.toast((e as Error).message, "alert");
    } finally { setBusy(false); }
  };
  const load = () => {
    setFailed(false);
    fetch("/api/collector/workspaces")
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !Array.isArray(j?.workspaces)) throw new Error();
        setList(j.workspaces);
      })
      .catch(() => setFailed(true));
  };
  useEffect(() => { load(); }, []);
  const save = async () => {
    setBusy(true);
    try {
      const v = await c.saveWorkspace(name.trim());
      if (v) load();
    } finally { setBusy(false); }
  };
  return (
    <>
      <div className="wsave">
        <label>Save the current view as<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label>
        <button className="btn" disabled={busy || name.trim().length < 2} onClick={save}><I n="layers" />{busy ? "Saving…" : "Save new version"}</button>
      </div>
      <p className="sub">A version stores the period, zone, department, category and taluk filters, your dashboard layout, and a frozen copy of the
        briefing as it reads right now, so you can reopen last week&apos;s version exactly as it was.</p>
      {failed && !list ? <div className="empty" role="alert">Your saved workspaces could not be loaded. <button className="lnk" onClick={load}>Retry</button></div>
        : !list ? <div className="empty">Loading…</div> : list.length ? list.map((w) => (
        <div key={w.name} className="wlist">
          <div className="wlist-h">
            {renaming?.from === w.name ? (
              <form className="wren" onSubmit={(e) => { e.preventDefault(); void change("PATCH", "/api/collector/workspaces", renaming, `Renamed to "${renaming.to.trim()}".`); }}>
                <input autoFocus aria-label="New name" value={renaming.to} maxLength={100} onChange={(e) => setRenaming({ from: w.name, to: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setRenaming(null); } }} />
                <button className="btn sm" disabled={busy || renaming.to.trim().length < 2}>Save</button>
                <button type="button" className="btn plain sm" onClick={() => setRenaming(null)}>Cancel</button>
              </form>
            ) : deleting === w.name ? (
              <span className="wdel" role="alert">Delete all {w.versions.length} version{w.versions.length === 1 ? "" : "s"} of “{w.name}”?
                <button className="btn sm danger" disabled={busy} onClick={() => void change("DELETE", `/api/collector/workspaces?name=${encodeURIComponent(w.name)}`, null, `Deleted "${w.name}".`)}>Delete</button>
                <button className="btn plain sm" onClick={() => setDeleting(null)}>Keep</button></span>
            ) : (
              <>
                <h4>{w.name}</h4>
                <button className="lnk" onClick={() => { setDeleting(null); setRenaming({ from: w.name, to: w.name }); }} aria-label={`Rename ${w.name}`}>Rename</button>
                <button className="lnk" onClick={() => { setRenaming(null); setDeleting(w.name); }} aria-label={`Delete ${w.name}`}>Delete</button>
              </>
            )}
          </div>
          <div className="wv">
            {w.versions.map((v) => {
              const f = v.filters ?? {};
              return (
                <button key={v.id} className={`wv-i${v.is_current ? " cur" : ""}`} onClick={() => c.openSavedWorkspace(v.id)}>
                  <b>v{v.version}{v.is_current ? " · latest" : ""}</b>
                  <span>{fmtShort(v.created_at)}</span>
                  <small>{[f.period, f.zoneName, f.deptName, f.catLabel, f.talukName].filter(Boolean).join(" · ") || "District-wide"}</small>
                </button>
              );
            })}
          </div>
        </div>
      )) : <Empty>No saved workspaces yet.</Empty>}
    </>
  );
}

/** Choose what the dashboard shows. Saved in this browser and with every workspace version. */
export function CustomizeBody({ c }: { c: Console }) {
  const [l, setL] = useState<Layout>(c.layout);
  const panelCount = Object.values(l.panels).filter(Boolean).length;
  const setPanel = (k: keyof Layout["panels"], v: boolean) => setL((x) => ({ ...x, panels: { ...x.panels, [k]: v } }));
  const setPage = (k: keyof Layout["pages"], v: boolean) => setL((x) => ({ ...x, pages: { ...x.pages, [k]: v } }));
  const toggleKpi = (k: string) => setL((x) => ({ ...x, kpis: x.kpis.includes(k) ? x.kpis.filter((y) => y !== k) : [...x.kpis, k] }));
  return (
    <div className="cust">
      <section>
        <h4>Pages</h4>
        <label className="chk"><input type="checkbox" checked disabled />Overview</label>
        {([["briefing", "Briefing: written briefing, department follow-ups, news-only incidents"], ["trends", "Trends: categories over time, taluks, spikes, hotspots"],
          ["environment", "Environment & markets: rain, air, reservoirs, mandi prices by Chennai market, developing stories"],
          ["studio", "Data Studio: add a department's file or link; AI cleans, maps, links and explains it"]] as const).map(([k, t]) => (
          <label key={k} className="chk"><input type="checkbox" checked={l.pages[k]} onChange={(e) => setPage(k, e.target.checked)} />{t}</label>
        ))}
      </section>
      <section>
        <h4>Overview panels</h4>
        {([["map", "Satellite map"], ["snapshot", "District snapshot"], ["brief", "Latest news"], ["severity", "Severity-based incidents"], ["tasks", "My tasks"]] as const).map(([k, t]) => (
          <label key={k} className="chk"><input type="checkbox" checked={l.panels[k]} disabled={l.panels[k] && panelCount === 1} onChange={(e) => setPanel(k, e.target.checked)} />{t}</label>
        ))}
        <h4 style={{ marginTop: 14 }}>Headline cards</h4>
        {Object.entries(KPI_LABELS).map(([k, t]) => (
          <label key={k} className="chk"><input type="checkbox" checked={l.kpis.includes(k)} onChange={() => toggleKpi(k)} />{t}</label>
        ))}
      </section>
      <div className="cust-f">
        <button className="btn plain" onClick={() => setL(DEFAULT_LAYOUT)}>Reset to default</button>
        <button className="btn" onClick={() => { c.setLayout(l); c.closeAll(); c.toast("Dashboard layout saved."); }}><I n="check" />Apply</button>
      </div>
    </div>
  );
}
