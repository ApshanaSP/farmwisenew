"use client";

/**
 * The Studio's Dashboards tab: the Collector's own dashboards, as many as wanted (one per link, or one mixing several).
 * On the left the list (name, how many tiles, from which datasets), "New dashboard", rename and delete; on the right
 * the open dashboard: its name (click to rename), "Add from a dataset", and its tiles on a grid that can be dragged and
 * resized (TileGrid). One click on a name opens it. Every figure is recomputed from the datasets' latest rows by the
 * server each time a dashboard opens; nothing here asks a model.
 */
import { useEffect, useRef, useState } from "react";
import type { DashboardSummary, RenderedDashboard } from "@/lib/studio/dashtypes";
import type { Console } from "../CollectorApp";
import { I } from "../icons";
import { api } from "./client";
import { Popover } from "./DashPicker";
import TileGrid from "./TileGrid";

interface Ds { id: string; name: string }
const tilesWord = (n: number) => `${n} ${n === 1 ? "tile" : "tiles"}`;

export default function Dashboards({ c, dashboards, datasets, sel, onSel, onOpen, onChanged, onAddData }: {
  c: Console;
  /** null while the Studio's list is loading */
  dashboards: DashboardSummary[] | null;
  datasets: Ds[];
  /** the open dashboard (kept by the Studio, so a toast's "Open" can choose it) */
  sel: string | null; onSel: (id: string | null) => void;
  /** open a dataset in the Datasets tab */
  onOpen: (datasetId: string) => void;
  /** the Studio reads its list again (names, tile counts); resolves when it has */
  onChanged: () => Promise<unknown>;
  /** go to Datasets with the add card in view */
  onAddData: () => void;
}) {
  const list = dashboards ?? [];
  const cur = list.find((d) => d.id === sel) ?? list[0] ?? null;
  const [shown, setShown] = useState<RenderedDashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  // the inline forms: a new dashboard's name, the one being renamed, the one asking "Delete?"
  const [naming, setNaming] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  // read through a ref too: Enter, the blur that follows it and Escape all end the same rename, which must save once or not at all
  const rn = useRef<{ id: string; name: string } | null>(null);
  const setRn = (v: { id: string; name: string } | null) => { rn.current = v; setRenaming(v); };
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const nameOf = (d: DashboardSummary) => names[d.id] ?? d.name;

  const curId = cur?.id ?? null;
  useEffect(() => {
    if (!curId) { setShown(null); return; }
    let live = true;
    setErr(null);
    api<{ dashboard: RenderedDashboard }>(`/api/collector/studio/dashboards/${curId}`)
      .then((r) => { if (live) setShown(r.dashboard); }, (e: Error) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [curId, rev]);

  const create = async (name: string, datasetId?: string) => {
    const n = name.trim();
    if (n.length < 2 || busy) return;
    setBusy(true);
    try {
      const r = await api<{ dashboard: DashboardSummary }>("/api/collector/studio/dashboards", { json: datasetId ? { name: n, datasetId } : { name: n } });
      setNaming(null);
      await onChanged();
      onSel(r.dashboard.id);
      c.toast(datasetId ? `Made the dashboard “${r.dashboard.name}” (${tilesWord(r.dashboard.tiles)}).` : `Made the dashboard “${r.dashboard.name}”. Add tiles to it from a dataset.`);
    } catch (e) { c.toast((e as Error).message, "alert"); }
    finally { setBusy(false); }
  };
  const rename = async (d: DashboardSummary) => {
    const r = rn.current;
    if (!r) return;
    setRn(null);
    const n = r.name.trim();
    if (n.length < 2 || n === nameOf(d)) return;
    setNames((m) => ({ ...m, [d.id]: n }));
    try {
      await api(`/api/collector/studio/dashboards/${d.id}`, { method: "PATCH", json: { name: n } });
      await onChanged();
    } catch (e) { c.toast((e as Error).message, "alert"); }
    setNames((m) => { const { [d.id]: _gone, ...rest } = m; return rest; });
  };
  const remove = async (d: DashboardSummary) => {
    setDeleting(null);
    try {
      await api(`/api/collector/studio/dashboards/${d.id}`, { method: "DELETE" });
      c.toast(`Deleted the dashboard “${nameOf(d)}”. Its datasets are kept.`);
      await onChanged();
      if (d.id === curId) onSel(null);
    } catch (e) { c.toast((e as Error).message, "alert"); }
  };
  const addDataset = async (ds: Ds) => {
    if (!cur) return;
    try {
      const r = await api<{ dashboard: DashboardSummary; added?: string[] }>(`/api/collector/studio/dashboards/${cur.id}/tiles`, { json: { datasetId: ds.id } });
      const n = r.added?.length ?? 0;
      c.toast(n ? `Added ${tilesWord(n)} from “${ds.name}”.` : `Nothing new to add from “${ds.name}”: it is all on the dashboard already.`);
      setRev((x) => x + 1);
      void onChanged();
    } catch (e) { c.toast((e as Error).message, "alert"); }
  };

  const newForm = (
    <form className="ds-bl-form" onSubmit={(e) => { e.preventDefault(); if (naming != null) void create(naming); }}>
      <input autoFocus value={naming ?? ""} maxLength={80} placeholder="Name it, e.g. Relief shelters" aria-label="Name of the new dashboard"
        onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setNaming(null); }} />
      <button type="submit" className="ds-btn sm" disabled={busy || (naming ?? "").trim().length < 2}>{busy ? <span className="ds-spin sm" /> : <I n="check" />}Make</button>
      <button type="button" className="ds-icon" onClick={() => setNaming(null)} aria-label="Cancel" title="Cancel"><I n="x" /></button>
    </form>
  );
  const starters = datasets.length > 0 && (
    <div className="ds-bm-start">
      <small>Or make one from a dataset, in one click</small>
      <div>{datasets.slice(0, 6).map((x) => <button key={x.id} type="button" className="ds-ghost" disabled={busy} onClick={() => create(x.name, x.id)} title={`A dashboard of “${x.name}”: its summary, numbers, findings and charts`}><I n="table" />{x.name}</button>)}</div>
    </div>
  );

  return (
    <section className="ds-span card ds-boards" aria-label="Dashboards">
      <aside className="ds-bl" aria-label="Your dashboards">
        <header className="ds-bl-h"><b>Dashboards</b>{list.length > 0 && <span className="cnt-b">{list.length}</span>}</header>
        {naming != null ? newForm : (
          <button type="button" className="ds-bl-new" onClick={() => { setNaming(""); setRn(null); setDeleting(null); }}><I n="plus" />New dashboard</button>
        )}
        <ul className="ds-bl-l">
          {dashboards == null && [0, 1, 2].map((k) => <li key={k} className="ds-skel ds-bl-sk" />)}
          {list.map((d, i) => {
            const on = d.id === curId;
            return (
              <li key={d.id} className={`ds-bl-i${on ? " on" : ""}`} style={{ ["--i" as string]: i }}>
                {renaming?.id === d.id ? (
                  <form className="ds-bl-form" onSubmit={(e) => { e.preventDefault(); (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.blur(); }}>
                    <input autoFocus value={renaming.name} maxLength={80} aria-label="New name of the dashboard" onChange={(e) => setRn({ id: d.id, name: e.target.value })}
                      onBlur={() => void rename(d)} onKeyDown={(e) => { if (e.key === "Escape") setRn(null); }} />
                  </form>
                ) : (
                  <button type="button" className="ds-bl-open" onClick={() => onSel(d.id)} aria-current={on ? "page" : undefined}>
                    <span className="ds-bl-ic"><I n="grid" /></span>
                    <span className="ds-bl-b"><b>{nameOf(d)}</b>
                      <small title={d.datasets.map((x) => x.name).join(", ")}>{tilesWord(d.tiles)}{d.datasets.length ? ` · ${d.datasets.map((x) => x.name).join(", ")}` : " · empty"}</small></span>
                  </button>
                )}
                {renaming?.id !== d.id && (
                  <span className="ds-bl-acts">
                    <button type="button" onClick={() => { setRn({ id: d.id, name: nameOf(d) }); setDeleting(null); }} title="Rename" aria-label={`Rename ${nameOf(d)}`}><I n="edit" /></button>
                    <button type="button" onClick={() => setDeleting(deleting === d.id ? null : d.id)} title="Delete the dashboard" aria-label={`Delete ${nameOf(d)}`}><I n="trash" /></button>
                  </span>
                )}
                {deleting === d.id && (
                  <div className="ds-bl-del" role="alert">
                    <span>Delete the dashboard? The data is kept.</span>
                    <button type="button" onClick={() => void remove(d)} data-jarvis-never>Yes, delete</button>
                    <button type="button" onClick={() => setDeleting(null)}>No</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {dashboards != null && !list.length && naming == null && <p className="ds-muted pad">None yet. Press “New dashboard”, or “Add to dashboard” on any dataset.</p>}
      </aside>

      <div className="ds-bm">
        {dashboards == null ? <BoardSkeleton />
          : !cur ? (
            <div className="ds-empty big ds-bm-empty">
              <I n="grid" /><b>No dashboards yet</b>
              <span>A dashboard holds the numbers, findings and charts you choose, from one dataset or several. Name one to start, then add to it from your datasets.</span>
              {naming == null && <button type="button" className="ds-btn" onClick={() => setNaming("")}><I n="plus" />New dashboard</button>}
              {starters}
              {!datasets.length && <button type="button" className="ds-ghost" onClick={onAddData}><I n="download" />Add a file or a link first</button>}
            </div>
          ) : (
            <>
              <header className="ds-bm-h">
                <div className="ds-bm-t">
                  {renaming?.id === `head:${cur.id}` ? (
                    <input autoFocus value={renaming.name} maxLength={80} aria-label="Dashboard name" onChange={(e) => setRn({ id: `head:${cur.id}`, name: e.target.value })}
                      onBlur={() => void rename(cur)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRn(null); }} />
                  ) : (
                    <h2 title="Click to rename" onClick={() => setRn({ id: `head:${cur.id}`, name: nameOf(cur) })}>{nameOf(cur)}<I n="edit" /></h2>
                  )}
                  <small>{tilesWord(cur.tiles)}{cur.datasets.length ? ` from ${cur.datasets.map((x) => x.name).join(", ")}` : ""}. Drag a tile by its grip to move it, pull its bottom-right corner to resize it. Figures are worked out again from the latest rows each time it opens.</small>
                </div>
                <AddFrom datasets={datasets} on={cur.datasets.map((x) => x.id)} onAdd={addDataset} onAddData={onAddData} />
              </header>
              <div className="ds-bm-b">
                {shown && shown.id === cur.id ? (
                  <TileGrid key={cur.id} d={shown} c={c} onOpen={onOpen} onChanged={() => void onChanged()}
                    empty={(
                      <div className="ds-empty big ds-bm-empty">
                        <I n="plus" /><b>This dashboard is empty</b>
                        <span>Press “Add from a dataset” above to bring in a dataset’s summary, numbers, findings and charts. Or open any dataset and press <em>Pin</em> on the one thing you want here.</span>
                        {datasets.length > 0 && (
                          <div className="ds-bm-start"><small>Add one now</small>
                            <div>{datasets.slice(0, 6).map((x) => <button key={x.id} type="button" className="ds-ghost" onClick={() => addDataset(x)}><I n="plus" />{x.name}</button>)}</div>
                          </div>
                        )}
                      </div>
                    )} />
                ) : err ? (
                  <div className="ds-empty"><I n="alert" /><b>{err}</b><button type="button" className="ds-btn" onClick={() => setRev((x) => x + 1)}>Try again</button></div>
                ) : <BoardSkeleton grid />}
              </div>
            </>
          )}
      </div>
    </section>
  );
}

/** "Add from a dataset": every dataset, each adding its summary, numbers, findings and charts; the ones already here are marked. */
function AddFrom({ datasets, on, onAdd, onAddData }: { datasets: Ds[]; on: string[]; onAdd: (d: Ds) => Promise<void>; onAddData: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <>
      <button ref={btn} type="button" className="ds-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}><I n="plus" />Add from a dataset<I n="chevd" /></button>
      {open && (
        <Popover anchor={btn} onClose={() => setOpen(false)} label="Add from a dataset" className="ds-dp" width={300}>
          <header className="ds-dp-h"><I n="table" /><b>Add from which dataset?</b></header>
          {datasets.length ? (
            <ul className="ds-dp-l">
              {datasets.map((d) => (
                <li key={d.id}>
                  <button type="button" disabled={!!busy} onClick={async () => { setBusy(d.id); await onAdd(d); setBusy(null); setOpen(false); }}>
                    <span className="ds-dp-ic">{busy === d.id ? <span className="ds-spin sm" /> : <I n="table" />}</span>
                    <span className="ds-dp-b"><b>{d.name}</b><small>{on.includes(d.id) ? "Already here: adds what is missing" : "Its summary, numbers, findings and charts"}</small></span>
                    {on.includes(d.id) && <em>On it</em>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="ds-dp-none"><p>No datasets yet.</p><button type="button" className="ds-btn sm" onClick={() => { setOpen(false); onAddData(); }}><I n="download" />Add a file or a link</button></div>
          )}
        </Popover>
      )}
    </>
  );
}

function BoardSkeleton({ grid = false }: { grid?: boolean }) {
  return (
    <div className={`ds-bm-sk${grid ? " grid" : ""}`} role="status" aria-label="Opening the dashboard">
      {!grid && <div className="ds-skel sk-h" />}
      <div className="sk-r"><div className="ds-skel" /><div className="ds-skel" /><div className="ds-skel" /><div className="ds-skel" /></div>
      <div className="sk-r two"><div className="ds-skel" /><div className="ds-skel" /></div>
    </div>
  );
}
