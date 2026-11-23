"use client";

/**
 * One dashboard's tiles on a 12-column grid (react-grid-layout v2). A tile moves only by the grip in its header, so
 * charts and maps stay clickable, and resizes from its bottom-right corner; the layout is saved a moment after it
 * settles, and never for the shuffle the grid does on its own when it first lays the tiles out. A title is renamed with
 * a double click (or from the tile's menu). On a narrow screen the tiles stack in one column and do not move, so the
 * saved 12-column layout is never overwritten by a one-column one. Every figure was computed by the server from each
 * dataset's latest rows (lib/studio/dashboards.ts); nothing here asks a model.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import RGL, { useContainerWidth, verticalCompactor, type Layout } from "react-grid-layout";
import { transformStrategy, type PositionStrategy } from "react-grid-layout/core";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { GRID_COLS, GRID_GAP, GRID_ROW, MIN_SIZE, type LayoutItem, type RenderedDashboard, type RenderedTile, type TileLayout } from "@/lib/studio/dashtypes";
import { HELPS } from "@/lib/studio/helps";
import { fmtNum, type PanelData } from "@/lib/studio/types";
import type { Console } from "../CollectorApp";
import { I } from "../icons";
import { zoomOf } from "../Shell";
import { api } from "./client";
import { Popover } from "./DashPicker";
import { DataTable } from "./Dataset";
import { Evidence, LabelChip } from "./Insights";

const StudioChart = dynamic(() => import("./StudioChart"), { ssr: false, loading: () => <div className="ds-skel" /> });
const StudioMap = dynamic(() => import("./StudioMap"), { ssr: false, loading: () => <div className="ds-skel" /> });

/** how long the layout must hold still before it is saved */
const SAVE_MS = 600;
const GRID = { cols: GRID_COLS, rowHeight: GRID_ROW, margin: [GRID_GAP, GRID_GAP] as const, containerPadding: [0, 0] as const };
// only the grip drags: a click on a chart bar, a map or a button inside the tile stays a click
const DRAG = { enabled: true, handle: ".ds-tile-grip", threshold: 4 };
const RESIZE = { enabled: true, handles: ["se"] as const };

const keyOf = (l: LayoutItem[]) => [...l].sort((a, b) => a.i.localeCompare(b.i)).map((x) => `${x.i}:${x.x},${x.y},${x.w},${x.h}`).join("|");

/** A tile's place, kept inside the 12 columns and at least its kind's smallest size. */
function fitted(t: RenderedTile, l: TileLayout): TileLayout {
  const min = MIN_SIZE[t.kind] ?? { w: 2, h: 2 };
  const w = Math.min(GRID_COLS, Math.max(min.w, Math.round(l.w) || min.w));
  const h = Math.max(min.h, Math.round(l.h) || min.h);
  const x = Math.min(Math.max(0, Math.round(l.x) || 0), GRID_COLS - w);
  return { x, y: Math.max(0, Math.round(l.y) || 0), w, h };
}

/** Whether the console fits the screen (.dic.fit): when it does not (a phone, a narrow window), the tiles stack. */
function useFit(ref: RefObject<HTMLElement | null>): boolean {
  const [fit, setFit] = useState(true);
  useEffect(() => {
    const dic = ref.current?.closest(".dic");
    if (!dic) return;
    const read = () => setFit(dic.classList.contains("fit"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(dic, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [ref]);
  return fit;
}

export default function TileGrid({ d, c, onOpen, onChanged, empty }: {
  d: RenderedDashboard; c: Console; onOpen: (datasetId: string) => void;
  /** a tile was removed or renamed: the dashboards list (tile counts, datasets) is read again */
  onChanged: () => void;
  empty?: ReactNode;
}) {
  const [tiles, setTiles] = useState(d.tiles);
  const [pos, setPos] = useState<Record<string, TileLayout>>(() => Object.fromEntries(d.tiles.map((t) => [t.id, fitted(t, t.layout)])));
  // a fresh copy from the server (a tile added) keeps the places just set here and takes the new tiles' own
  const seen = useRef(d);
  useEffect(() => {
    if (seen.current === d) return;
    seen.current = d;
    setTiles(d.tiles);
    setPos((p) => Object.fromEntries(d.tiles.map((t) => [t.id, p[t.id] ?? fitted(t, t.layout)])));
  }, [d]);

  // ---------------------------------------------------------------- saving --
  const cRef = useRef(c);
  cRef.current = c;
  const saved = useRef(keyOf(d.tiles.map((t) => ({ i: t.id, ...t.layout }))));
  const pending = useRef<LayoutItem[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // set by the Collector's first drag or resize: before it, a layout change is the grid tidying itself, not a choice
  const touched = useRef(false);
  const flush = useCallback((leaving = false) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const l = pending.current;
    pending.current = null;
    if (!l) return;
    const k = keyOf(l);
    if (k === saved.current) return;
    saved.current = k;
    api(`/api/collector/studio/dashboards/${d.id}`, { method: "PATCH", json: { layout: l }, keepalive: leaving })
      .catch((e: Error) => { saved.current = ""; if (!leaving) cRef.current.toast(`The new layout was not saved: ${e.message}`, "alert"); });
  }, [d.id]);
  const flushRef = useRef(flush);
  flushRef.current = flush;
  // leaving the page or the dashboard saves what is waiting
  useEffect(() => {
    const f = () => flushRef.current(true);
    window.addEventListener("pagehide", f);
    return () => { window.removeEventListener("pagehide", f); flushRef.current(true); };
  }, []);

  const onLayoutChange = useCallback((l: Layout) => {
    const items: LayoutItem[] = l.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
    setPos((p) => {
      const same = items.length === Object.keys(p).length && items.every((it) => { const q = p[it.i]; return !!q && q.x === it.x && q.y === it.y && q.w === it.w && q.h === it.h; });
      return same ? p : Object.fromEntries(items.map(({ i, ...r }) => [i, r]));
    });
    if (!touched.current) return;
    pending.current = items;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), SAVE_MS);
  }, []);
  const touch = useCallback(() => { touched.current = true; }, []);

  // ----------------------------------------------------------------- tiles --
  const remove = async (t: RenderedTile) => {
    setTiles((ts) => ts.filter((x) => x.id !== t.id));
    try {
      await api(`/api/collector/studio/dashboards/${d.id}/tiles/${t.id}`, { method: "DELETE" });
      c.toast(`Removed “${t.shown}” from the dashboard. The data is kept.`);
      onChanged();
    } catch (e) {
      setTiles((ts) => (ts.some((x) => x.id === t.id) ? ts : [...ts, t]));
      c.toast((e as Error).message, "alert");
    }
  };
  const rename = async (t: RenderedTile, title: string) => {
    setTiles((ts) => ts.map((x) => (x.id === t.id ? { ...x, title, shown: title } : x)));
    try { await api(`/api/collector/studio/dashboards/${d.id}/tiles/${t.id}`, { method: "PATCH", json: { title } }); }
    catch (e) { setTiles((ts) => ts.map((x) => (x.id === t.id ? t : x))); c.toast((e as Error).message, "alert"); }
  };

  const layout = useMemo(() => tiles.map((t) => {
    const min = MIN_SIZE[t.kind] ?? { w: 2, h: 2 };
    return { i: t.id, ...(pos[t.id] ?? fitted(t, t.layout)), minW: min.w, minH: min.h };
  }), [tiles, pos]);

  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
  const fit = useFit(containerRef);
  // the console is scaled with CSS zoom to fit the screen: dragging must divide by it to follow the pointer. The zoom is
  // set on .app's style and changes with the window or Jarvis's panel while the grid's own width stays the same (the
  // canvas is 1366 wide), so it is read again whenever that style changes, not when the width does
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const read = () => setZoom(zoomOf(containerRef.current));
    read();
    const app = containerRef.current?.closest(".app");
    if (!app) return;
    const mo = new MutationObserver(read);
    mo.observe(app, { attributes: true, attributeFilter: ["style"] });
    return () => mo.disconnect();
  }, [containerRef]);
  // (the library's createScaledStrategy places a dragged tile from the page's left edge, not the grid's: only the scale is taken)
  const strategy = useMemo<PositionStrategy>(() => (Math.abs(zoom - 1) < 0.001 ? transformStrategy : { ...transformStrategy, scale: zoom }), [zoom]);

  const card = (t: RenderedTile, i: number, drag: boolean) => (
    <TileCard t={t} i={i} c={c} drag={drag} onOpen={onOpen} onRename={(v) => rename(t, v)} onRemove={() => remove(t)} />
  );
  // the one-column stack keeps the grid's reading order: top to bottom, then left to right
  const stacked = useMemo(() => [...tiles].sort((a, b) => {
    const p = pos[a.id] ?? a.layout, q = pos[b.id] ?? b.layout;
    return p.y - q.y || p.x - q.x;
  }), [tiles, pos]);

  return (
    <div ref={containerRef as RefObject<HTMLDivElement>} className={`ds-tgrid${fit ? "" : " narrow"}`}>
      {!tiles.length ? empty
        : !fit ? (
          <div className="ds-tstack">
            {stacked.map((t, i) => {
              const h = Math.max(MIN_SIZE[t.kind]?.h ?? 2, (pos[t.id] ?? t.layout).h);
              return <div key={t.id} className={`ds-tile k-${t.kind}${t.missing ? " is-missing" : ""}`} style={{ height: h * GRID_ROW + (h - 1) * GRID_GAP }}>{card(t, i, false)}</div>;
            })}
          </div>
        ) : mounted ? (
          <RGL width={width} layout={layout} gridConfig={GRID} dragConfig={DRAG} resizeConfig={RESIZE} compactor={verticalCompactor} positionStrategy={strategy}
            onLayoutChange={onLayoutChange} onDragStart={touch} onResizeStart={touch}>
            {tiles.map((t, i) => <div key={t.id} className={`ds-tile k-${t.kind}${t.missing ? " is-missing" : ""}`}>{card(t, i, true)}</div>)}
          </RGL>
        ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ a tile --

function TileCard({ t, i, c, drag, onOpen, onRename, onRemove }: {
  t: RenderedTile; i: number; c: Console; drag: boolean; onOpen: (datasetId: string) => void; onRename: (title: string) => void; onRemove: () => void;
}) {
  const [edit, setEdit] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const mb = useRef<HTMLButtonElement>(null);
  const save = () => {
    const v = (edit ?? "").trim();
    setEdit(null);
    if (v && v !== t.shown) onRename(v);
  };
  const sub = [t.dataset?.name, (t.kind === "chart" || t.kind === "map") && !t.missing ? t.panel?.subtitle : null].filter(Boolean).join(" · ");
  return (
    // the grid places the outer box with a transform, so the entrance animation is on this inner one
    <article className="ds-tile-in" style={{ ["--i" as string]: i }} aria-label={t.shown}>
      <header className="ds-tile-h">
        {drag && <span className="ds-tile-grip" title="Drag to move this tile"><I n="grip" /></span>}
        <div className="ds-tile-t">
          {edit != null ? (
            <input autoFocus value={edit} maxLength={120} onChange={(e) => setEdit(e.target.value)} onBlur={save}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEdit(null); }} aria-label="Tile title" />
          ) : <h4 title={`${t.shown}${sub ? ` · ${sub}` : ""} (double-click to rename)`} onDoubleClick={() => setEdit(t.shown)}>{t.shown}</h4>}
          {sub && <small title={sub}>{sub}</small>}
        </div>
        <button ref={mb} type="button" className="ds-tile-m" onClick={() => setMenu((m) => !m)} aria-label={`Options for ${t.shown}`} aria-haspopup="menu" aria-expanded={menu} title="Open the dataset, rename or remove">
          <I n="dots" /></button>
        {menu && (
          <Popover anchor={mb} onClose={() => setMenu(false)} label="Tile options" className="ds-menu" width={230} role="menu">
            <button type="button" role="menuitem" disabled={!t.dataset} onClick={() => { setMenu(false); if (t.dataset) onOpen(t.dataset.id); }}><I n="table" />Open dataset</button>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); setEdit(t.shown); }}><I n="edit" />Rename</button>
            <button type="button" role="menuitem" className="danger" onClick={() => { setMenu(false); onRemove(); }} data-jarvis-never><I n="x" />Remove from dashboard</button>
          </Popover>
        )}
      </header>
      <div className="ds-tile-b">
        {t.missing ? (
          <div className="ds-tile-miss"><I n="info" /><p>{t.missing}</p><button type="button" className="ds-ghost" onClick={onRemove} data-jarvis-never><I n="x" />Remove</button></div>
        ) : <TileBody t={t} c={c} />}
      </div>
    </article>
  );
}

const None = () => <div className="ds-tile-none"><I n="info" />Nothing to show right now.</div>;

function TileBody({ t, c }: { t: RenderedTile; c: Console }) {
  const p = t.panel ?? null;
  if (t.kind === "brief") {
    const b = t.brief;
    if (!b) return <None />;
    return (
      <div className="ds-tile-brief">
        <span className="ds-brief-badge"><I n="spark" />{b.by === "ai" ? "AI summary" : "Summary"}</span>
        <h3>{b.verdict}</h3>
        {b.summary.length > 0 && <ul>{b.summary.slice(0, 3).map((s, k) => <li key={k}>{s}</li>)}</ul>}
      </div>
    );
  }
  if (t.kind === "insight") {
    const f = t.finding;
    if (!f) return <None />;
    const drawn = !!p && (p.values.length > 0 || !!p.table);
    return (
      <div className={`ds-tile-ins it-${f.tone}`}>
        <div className="ds-tile-chips"><LabelChip label={f.label} priority={f.priority} /></div>
        {f.headline !== t.shown && <p className="ds-tile-hl" title={f.headline}>{f.headline}</p>}
        <div className={`ds-tile-ev${drawn ? " drawn" : ""}`}>
          {drawn ? <PanelView p={p!} c={c} compact /> : <><p className="ds-icap"><b>{f.metric.value}</b><span>{f.metric.caption}</span></p><Evidence bars={f.bars} series={f.series} /></>}
        </div>
        <p className="ds-tile-say" title={t.insightText ?? f.text}>{t.insightText ?? f.text}</p>
        <p className="ds-ihelps"><I n="target" /><b>Helps:</b> {t.helps ?? HELPS[f.label] ?? "Shows what needs attention"}</p>
      </div>
    );
  }
  if (!p) return <None />;
  if (t.kind === "kpi" || p.chart === "kpi") return <KpiTile p={p} title={t.shown} />;
  return (
    <div className="ds-tile-ch">
      <div className="ds-tile-cv"><PanelView p={p} c={c} /></div>
      {t.insightText && <p className="ds-tile-say" title={t.helps ? `${t.insightText} ${t.helps}.` : t.insightText}>{t.insightText}</p>}
    </div>
  );
}

function PanelView({ p, c, compact = false }: { p: PanelData; c: Console; compact?: boolean }) {
  if (!p.rows || (!p.values.length && !p.table)) return <div className="ds-nodata"><I n="info" />Nothing to show{p.note ? `: ${p.note}` : "."}</div>;
  if (p.chart === "map") return <StudioMap geo={c.geo} panel={p} focusZone={null} />;
  if (p.chart === "table" && p.table) return <DataTable cols={p.table.cols} rows={p.table.rows} bar={p.table.bar ?? null} />;
  return <StudioChart panel={p} height="100%" compact={compact} />;
}

/** A headline number in a tile two rows high: the figure and one line under it (its label only when the tile's title is not already it). */
function KpiTile({ p, title }: { p: PanelData; title: string }) {
  const k = p.kpi;
  if (!k) return <None />;
  return (
    <div className={`ds-tile-kpi k-${k.tone}`}>
      <b>{fmtNum(k.value, p.format, p.unit, true)}</b>
      {k.label.trim() !== title.trim() && <span title={k.label}>{k.label}</span>}
      <small title={k.sub}>
        {k.delta != null && <em className={k.delta > 0 ? "up" : k.delta < 0 ? "dn" : ""}><I n={k.delta > 0 ? "up" : k.delta < 0 ? "down" : "right"} />{Math.abs(k.delta)}% in 7 days</em>}
        {k.sub}
      </small>
    </div>
  );
}
