"use client";

/**
 * One dataset in the Studio: its dashboard (headline cards, the map and charts, all computed from the rows; clicking a
 * zone on the map or a zone bar focuses every chart on that zone), the Data Detective's report, the AI's reading of
 * the columns (change a meaning and rebuild), and the cleaned rows. The AI analyst sits beside it (Analyst.tsx).
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ROLES, ROLE_LABEL, fmtNum, type Detective, type Filter, type Issue, type PanelData, type Plan, type Role, type RuleStatus } from "@/lib/studio/types";
import type { DatasetView } from "@/lib/studio/pipeline";
import type { Console } from "../CollectorApp";
import { I, type IconName } from "../icons";
import { api, reduced } from "./client";
import Analyst from "./Analyst";
import Drill from "./Drill";
import { BriefCard, InsightGrid } from "./Insights";

const StudioChart = dynamic(() => import("./StudioChart"), { ssr: false, loading: () => <div className="ds-skel" /> });
const StudioMap = dynamic(() => import("./StudioMap"), { ssr: false, loading: () => <div className="ds-skel" /> });

export interface DatasetData extends DatasetView { alerts: RuleStatus[]; pinned: string[] }

const CHART_IC: Record<string, IconName> = { map: "map", area: "line", line: "line", hbar: "barH", bar: "chart", donut: "donut", treemap: "grid", table: "table", kpi: "target" };
const KPI_IC: IconName[] = ["table", "clock", "chart", "pin"];

interface Chip { label: string; filters: Filter[] }

export default function Dataset({ id, c, onRemap, onRefresh, onDeleted, onPinned }: {
  id: string; c: Console; onRemap: (changes: { key: string; role: Role; label?: string }[]) => void; onRefresh: () => void; onDeleted: () => void; onPinned: () => void;
}) {
  const [data, setData] = useState<DatasetData | null>(null);
  // the dashboard's filters, each added by focusing on a mark (a zone, a type, a week); every panel follows them
  const [chips, setChips] = useState<Chip[]>([]);
  const [tab, setTab] = useState<"dash" | "detective" | "mapping" | "rows">("dash");
  const [reload, setReload] = useState(0);
  const [spot, setSpot] = useState<{ panel: PanelData; answer?: string } | null>(null);
  const [drill, setDrill] = useState<{ plan: Plan; key: string | number | null; n: number } | null>(null);
  const [seed, setSeed] = useState<{ q: string; n: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const extra = useMemo(() => chips.flatMap((x) => x.filters), [chips]);
  const fq = extra.length ? `?f=${encodeURIComponent(JSON.stringify(extra))}` : "";

  useEffect(() => { setChips([]); setTab("dash"); setSpot(null); setDrill(null); setData(null); }, [id]);
  useEffect(() => {
    let live = true;
    api<DatasetData>(`/api/collector/studio/${id}${fq}`)
      .then((d) => { if (live) { setData(d); setErr(null); } })
      .catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [id, fq, reload]);

  const refresh = useCallback(() => setReload((k) => k + 1), []);
  const [analysing, setAnalysing] = useState(false);
  const analysed = useRef<string | null>(null);
  const reanalyse = useCallback(async () => {
    setAnalysing(true);
    try { await api(`/api/collector/studio/${id}`, { json: { action: "analyse" } }); refresh(); }
    catch (e: any) { c.toast(e.message, "alert"); }
    finally { setAnalysing(false); }
  }, [id, c, refresh]);
  useEffect(() => {
    if (data?.briefStale && analysed.current !== id) { analysed.current = id; void reanalyse(); }
  }, [data?.briefStale, id, reanalyse]);
  const open = useCallback((plan: Plan, key: string | number | null) => { setSpot(null); setDrill({ plan, key, n: Date.now() }); }, []);
  const focusOn = useCallback((label: string, filters: Filter[]) => {
    if (!filters.length) return;
    setChips((cs) => [...cs.filter((x) => JSON.stringify(x.filters) !== JSON.stringify(filters)), { label, filters }]);
    setTab("dash");
  }, []);
  const preview = useCallback(async (plan: Plan, answer?: string) => {
    try {
      const r = await api<{ panel: PanelData }>(`/api/collector/studio/${id}`, { json: { action: "preview", plan } });
      setSpot({ panel: r.panel, answer });
    } catch (e: any) { c.toast(e.message, "alert"); }
  }, [id, c]);
  const pin = useCallback(async (plan: Plan, on: boolean) => {
    try {
      await api(`/api/collector/studio/${id}`, { json: on ? { action: "pin", plan } : { action: "unpin", planId: plan.id } });
      c.toast(on ? `Pinned "${plan.title}" to the Studio board.` : "Removed from the board.");
      refresh(); onPinned();
    } catch (e: any) { c.toast(e.message, "alert"); }
  }, [id, c, refresh, onPinned]);
  const addPanel = useCallback(async (plan: Plan) => {
    try {
      await api(`/api/collector/studio/${id}`, { json: { action: "add-panel", plan } });
      c.toast(`Added "${plan.title}" to this dashboard.`);
      setSpot(null); setTab("dash"); refresh();
    } catch (e: any) { c.toast(e.message, "alert"); }
  }, [id, c, refresh]);
  const removePanel = useCallback(async (plan: Plan) => {
    try { await api(`/api/collector/studio/${id}`, { json: { action: "remove-panel", planId: plan.id } }); refresh(); } catch (e: any) { c.toast(e.message, "alert"); }
  }, [id, c, refresh]);

  if (err && !data) return <section className="ds-ws card ds-span"><div className="ds-empty"><I n="alert" /><b>{err}</b><button className="ds-btn" onClick={refresh}>Try again</button></div></section>;
  if (!data) return (<><section className="ds-ws card"><div className="ds-loading"><span className="ds-spin" />Opening the dataset…</div></section><aside className="ds-ai-col card"><div className="ds-skel tall" /></aside></>);

  const m = data.meta;
  const kpis = data.panels.filter((p) => p.chart === "kpi");
  const charts = data.panels.filter((p) => p.chart !== "kpi");
  const pinned = new Set(data.pinned);
  const issuesN = m.detective.issues.filter((i) => i.action !== "info").length;
  const zf = extra.find((f) => f.col === "_z" && f.op === "in");
  const focusZone = zf ? Number(zf.values[0]) || null : null;
  // a chart's mark opens its drill; a map area opens its zone
  const pick = (p: PanelData) => (key: string | number) =>
    open(p.chart === "map" ? { ...p.plan, by: "zone", byCol: null, chart: "hbar", limit: 15 } : p.plan, key);

  return (
    <>
      <section className="ds-ws card">
        <Head data={data} tab={tab} setTab={setTab} issuesN={issuesN} c={c} onRefresh={onRefresh} onDeleted={onDeleted} onRenamed={refresh} />
        <div className="ds-ws-b" key={tab}>
          {tab === "dash" && (
            <div className="ds-dash">
              {chips.length > 0 && (
                <div className="ds-focus">
                  <I n="target" /><span>Every chart shows</span>
                  {chips.map((x, i) => <em key={i}>{x.label}<button onClick={() => setChips((cs) => cs.filter((_, k) => k !== i))} aria-label={`Remove ${x.label}`}><I n="x" /></button></em>)}
                  <button onClick={() => setChips([])}><I n="x" />Clear all</button>
                </div>
              )}
              <BriefCard brief={data.brief} stale={data.briefStale} busy={analysing} c={c} onReanalyse={reanalyse} />
              {kpis.length > 0 && (
                <div className="ds-kpis" style={{ gridTemplateColumns: `repeat(${kpis.length}, minmax(0,1fr))` }}>
                  {kpis.map((p, i) => <Kpi key={p.id} p={p} i={i} onOpen={() => open(p.plan, null)} />)}
                </div>
              )}
              <h5 className="ds-sec"><I n="bulb" />What matters<small>{data.brief.items.length} insights · click any card for the records behind it</small></h5>
              <InsightGrid items={data.brief.items} onOpen={open} />
              <h5 className="ds-sec"><I n="chart" />The evidence<small>live charts · click a bar, slice or zone to open it</small></h5>
              <div className={`ds-grid${charts.some((p) => p.chart === "map") ? " has-map" : ""}`}>
                {charts.map((p, i) => (
                  <PanelCard key={p.id} p={p} i={i} c={c} zone={focusZone} onPick={pick(p)} pinned={pinned.has(p.plan.id)}
                    onPin={(on) => pin(p.plan, on)} onExpand={() => setSpot({ panel: p })} onRemove={p.id.startsWith("q_") ? () => removePanel(p.plan) : undefined} />
                ))}
              </div>
            </div>
          )}
          {tab === "detective" && <DetectiveTab d={m.detective} id={id} rows={m.rows} cols={m.cols} masked={m.spec.columns.filter((x) => x.role === "person").map((x) => x.label)} />}
          {tab === "mapping" && <MappingTab data={data} onRemap={onRemap} />}
          {tab === "rows" && <RowsTab id={id} />}
        </div>
        {spot && (
          <div className="ds-spot" role="dialog" aria-label={spot.panel.title}>
            <header>
              <span className="ds-spot-ic"><I n={CHART_IC[spot.panel.chart] ?? "chart"} /></span>
              <div><h3>{spot.panel.title}</h3><small>{spot.panel.subtitle} · click any mark to open it</small></div>
              <button className="ds-ghost" onClick={() => setSpot(null)} aria-label="Close"><I n="x" /></button>
            </header>
            {spot.answer && <p className="ds-spot-a">{spot.answer}</p>}
            <div className="ds-spot-b">{renderChart(spot.panel, c, focusZone, pick(spot.panel), "100%")}</div>
            <footer>
              {spot.panel.note && <small>{spot.panel.note}</small>}
              <button className="ds-ghost" onClick={() => pin(spot.panel.plan, !pinned.has(spot.panel.plan.id))}><I n="bookmark" />{pinned.has(spot.panel.plan.id) ? "Unpin" : "Pin to board"}</button>
              {!m.panels.some((x) => x.id === spot.panel.plan.id) && <button className="ds-btn" onClick={() => addPanel(spot.panel.plan)}><I n="plus" />Add to this dashboard</button>}
            </footer>
          </div>
        )}
        {drill && (
          <Drill key={drill.n} id={id} start={drill} extra={extra} c={c} onClose={() => setDrill(null)} onFocus={focusOn}
            onAsk={(q) => { setDrill(null); setSeed({ q, n: Date.now() }); }} onPin={(p) => pin(p, true)} />
        )}
      </section>
      <Analyst data={data} id={id} c={c} onSpot={preview} onAdd={addPanel} onPin={(p) => pin(p, true)} onAlertsChanged={refresh} seed={seed} />
    </>
  );
}

// ------------------------------------------------------------------ header --

function Head({ data, tab, setTab, issuesN, c, onRefresh, onDeleted, onRenamed }: {
  data: DatasetData; tab: string; setTab: (t: "dash" | "detective" | "mapping" | "rows") => void; issuesN: number; c: Console;
  onRefresh: () => void; onDeleted: () => void; onRenamed: () => void;
}) {
  const m = data.meta;
  const [edit, setEdit] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const save = async () => {
    const name = (edit ?? "").trim();
    setEdit(null);
    if (name.length < 2 || name === m.name) return;
    try { await api(`/api/collector/studio/${m.id}`, { method: "PATCH", json: { name } }); onRenamed(); } catch (e: any) { c.toast(e.message, "alert"); }
  };
  const del = async () => {
    try { await api(`/api/collector/studio/${m.id}`, { method: "DELETE" }); c.toast(`Deleted "${m.name}".`); onDeleted(); } catch (e: any) { c.toast(e.message, "alert"); }
  };
  const kindIc: IconName = m.source.kind === "link" ? "ext" : m.source.kind === "sample" ? "spark" : "table";
  return (
    <header className="ds-ws-h">
      <div className="ds-ws-r1">
      <span className={`ds-ws-ic k-${m.source.kind}`}><I n={kindIc} /></span>
      <div className="ds-ws-t">
        {edit != null ? (
          <input autoFocus value={edit} maxLength={100} onChange={(e) => setEdit(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEdit(null); }} aria-label="Dataset name" />
        ) : (
          <h2 title="Click to rename" onClick={() => setEdit(m.name)}>{m.name}</h2>
        )}
        <div className="ds-meta">
          <span title={m.source.url ?? m.source.file}>{m.source.file}</span>
          <span>{m.rows.toLocaleString("en-IN")} rows</span>
          {m.spec.deptName && <span>{m.spec.deptName}</span>}
          <span className={`ds-by ${m.spec.by}`} title={m.spec.model ?? "Read by rules"}><I n="spark" />{m.spec.by === "ai" ? "AI-read" : "Rules-read"}</span>
          {m.sample && <span className="ds-tag warn">Sample · synthetic</span>}
        </div>
      </div>
      <div className="ds-acts">
        {m.source.kind === "link" && <button className="ds-icon" onClick={onRefresh} title="Fetch the link again"><I n="refresh" /></button>}
        <a className="ds-icon" href={`/api/collector/studio/${m.id}?export=csv`} title="Download the cleaned data (CSV)"><I n="download" /></a>
        {confirm ? (
          <span className="ds-confirm">Delete?<button onClick={del}>Yes</button><button onClick={() => setConfirm(false)}>No</button></span>
        ) : <button className="ds-icon" onClick={() => setConfirm(true)} title="Delete this dataset"><I n="trash" /></button>}
      </div>
      </div>
      <nav className="ds-tabs" role="tablist">
        {([["dash", "Insights", "bulb"], ["detective", "Data Detective", "shield"], ["mapping", "AI reading", "spark"], ["rows", "Rows", "table"]] as const).map(([k, t, ic]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            <I n={ic} />{t}{k === "detective" && <em className={m.detective.after >= 85 ? "ok" : "warn"}>{m.detective.after}</em>}
            {k === "detective" && issuesN > 0 && <span className="ds-sr">{issuesN} issues</span>}
          </button>
        ))}
      </nav>
    </header>
  );
}

// -------------------------------------------------------------------- KPIs --

export function AnimatedNum({ v, format, unit }: { v: number; format: PanelData["format"]; unit: string | null }) {
  const [shown, setShown] = useState(reduced() ? v : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) { setShown(v); return; }
    const start = from.current;
    from.current = v;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 1100);
      const e = 1 - Math.pow(1 - p, 4);
      setShown(start + (v - start) * e);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  const val = format === "int" ? Math.round(shown) : Math.round(shown * 100) / 100;
  return <>{fmtNum(val, format, unit, true)}</>;
}

function Kpi({ p, i, onOpen }: { p: PanelData; i: number; onOpen: () => void }) {
  const k = p.kpi!;
  return (
    <button className={`ds-kpi k-${k.tone}`} style={{ ["--i" as string]: i }} onClick={onOpen} title="Open the records behind this number">
      <span className="ds-kpi-ic"><I n={KPI_IC[i % 4]} /></span>
      <div className="ds-kpi-b">
        <small title={k.label}>{k.label}</small>
        <div className="ds-kpi-v"><b><AnimatedNum v={k.value} format={p.format} unit={p.unit} /></b>{k.spark.length > 2 && <Spark vals={k.spark} />}</div>
        <span className="ds-kpi-s" title={k.sub}>
          {k.delta != null && <em className={k.delta > 0 ? "up" : k.delta < 0 ? "dn" : ""}><I n={k.delta > 0 ? "up" : k.delta < 0 ? "down" : "right"} />{Math.abs(k.delta)}%<i>7 days</i></em>}
          <span>{k.sub}</span>
        </span>
      </div>
    </button>
  );
}

function Spark({ vals }: { vals: number[] }) {
  const w = 88, h = 34, max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 8)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const gid = useMemo(() => `sp${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <svg className="ds-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".35" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#${gid})`} className="ds-spark-a" />
      <path d={d} className="ds-spark-l" pathLength={1} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" className="ds-spark-d" />
    </svg>
  );
}

// ------------------------------------------------------------------ panels --

function renderChart(p: PanelData, c: Console, zone: number | null, onPick: (key: string | number) => void, height: number | string) {
  if (!p.rows || (!p.values.length && !p.table)) return <div className="ds-nodata"><I n="info" />Nothing to show{p.note ? `: ${p.note}` : "."}</div>;
  if (p.chart === "map") return <StudioMap geo={c.geo} panel={p} focusZone={zone} onZone={(z) => onPick(z)} />;
  if (p.chart === "table") return <DataTable cols={p.table!.cols} rows={p.table!.rows} />;
  return <StudioChart panel={p} height={height} highlight={p.geo === "zone" ? zone : null} onPick={(k) => onPick(k)} />;
}

function PanelCard({ p, i, c, zone, onPick, pinned, onPin, onExpand, onRemove }: {
  p: PanelData; i: number; c: Console; zone: number | null; onPick: (key: string | number) => void; pinned: boolean; onPin: (on: boolean) => void; onExpand: () => void; onRemove?: () => void;
}) {
  const hint = p.chart === "map" ? " · click an area to open it" : p.chart === "table" ? "" : ` · click a ${p.chart === "donut" || p.chart === "treemap" ? "slice" : p.plan.by === "time" ? "point" : "bar"} to open it`;
  return (
    <article className={`ds-panel${p.chart === "map" ? " is-map" : ""}`} style={{ ["--i" as string]: i }}>
      <header>
        <span className="ds-p-ic"><I n={CHART_IC[p.chart] ?? "chart"} /></span>
        <div className="ds-p-t"><h4>{p.title}</h4><small>{p.subtitle}{hint}</small></div>
        <div className="ds-p-acts">
          <button className={pinned ? "on" : ""} onClick={() => onPin(!pinned)} title={pinned ? "Unpin from the board" : "Pin to the Studio board"} aria-label="Pin"><I n="bookmark" /></button>
          <button onClick={onExpand} title="Open large" aria-label="Open large"><I n="expand" /></button>
          {onRemove && <button onClick={onRemove} title="Remove from this dashboard" aria-label="Remove"><I n="x" /></button>}
        </div>
      </header>
      <div className="ds-p-b">{renderChart(p, c, zone, onPick, "100%")}</div>
      {p.note && p.chart !== "map" && <footer className="ds-p-note" title={p.note}>{p.note}</footer>}
    </article>
  );
}

export function DataTable({ cols, rows, search }: { cols: { key: string; label: string }[]; rows: Record<string, string | number | null>[]; search?: string }) {
  const q = (search ?? "").toLowerCase().trim();
  const shown = q ? rows.filter((r) => cols.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q))) : rows;
  return (
    <div className="ds-table">
      <table>
        <thead><tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
        <tbody>
          {shown.slice(0, 300).map((r, i) => (
            <tr key={i}>{cols.map((c) => { const v = r[c.key]; return <td key={c.key} className={typeof v === "number" ? "n" : ""}>{v == null ? <span className="ds-null">—</span> : typeof v === "number" ? v.toLocaleString("en-IN")
              : /^https?:\/\//.test(String(v)) ? <a className="ds-tlink" href={String(v)} target="_blank" rel="noopener noreferrer">Open<I n="ext" /></a> : String(v)}</td>; })}</tr>
          ))}
        </tbody>
      </table>
      {!shown.length && <div className="ds-nodata">No rows match.</div>}
    </div>
  );
}

// --------------------------------------------------------------- detective --

const ACT: Record<Issue["action"], { t: string; ic: IconName; cls: string }> = {
  fixed: { t: "Fixed", ic: "checkc", cls: "fix" }, removed: { t: "Removed", ic: "trash", cls: "rem" }, flagged: { t: "Flagged for you", ic: "alert", cls: "flag" }, info: { t: "Privacy", ic: "shield", cls: "info" }
};

function Ring({ before, after }: { before: number; after: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t); }, []);
  const R = 52, C = 2 * Math.PI * R;
  const tone = after >= 85 ? "var(--low)" : after >= 65 ? "var(--high)" : "var(--sev)";
  return (
    <div className="ds-ring-w">
      <svg viewBox="0 0 132 132">
        <circle cx="66" cy="66" r={R} className="ds-ring-bg" />
        <circle cx="66" cy="66" r={R} className="ds-ring-b4" strokeDasharray={C} strokeDashoffset={C * (1 - before / 100)} />
        <circle cx="66" cy="66" r={R} className="ds-ring-af" stroke={tone} strokeDasharray={C} strokeDashoffset={on ? C * (1 - after / 100) : C * (1 - before / 100)} />
      </svg>
      <div><b><AnimatedNum v={after} format="int" unit={null} /></b><small>data health</small><em>was {before}</em></div>
    </div>
  );
}

function DetectiveTab({ d, id, rows, cols, masked }: { d: Detective; id: string; rows: number; cols: number; masked: string[] }) {
  const groups = (["fixed", "removed", "flagged", "info"] as const).map((a) => ({ a, items: d.issues.filter((i) => i.action === a) })).filter((g) => g.items.length);
  const placedPct = d.rowsOut ? Math.round((d.placed / d.rowsOut) * 100) : 0;
  return (
    <div className="ds-det">
      <div className="ds-det-l">
        <Ring before={d.before} after={d.after} />
        <dl className="ds-det-s">
          <div><dt>Rows read</dt><dd>{d.rowsIn.toLocaleString("en-IN")}</dd></div>
          <div><dt>Rows kept</dt><dd>{d.rowsOut.toLocaleString("en-IN")}</dd></div>
          <div><dt>On the map</dt><dd>{placedPct}%</dd></div>
          <div><dt>Columns</dt><dd>{cols}</dd></div>
        </dl>
        {masked.length > 0 && <p className="ds-det-p"><I n="shield" />Kept private: {masked.join(", ")}</p>}
        <a className="ds-btn wide" href={`/api/collector/studio/${id}?export=csv`}><I n="download" />Download cleaned data</a>
        <small className="ds-muted">{rows.toLocaleString("en-IN")} rows with the matched zone, ward and taluk added.</small>
      </div>
      <div className="ds-det-r">
        {!groups.length && <div className="ds-empty"><I n="checkc" /><b>No problems found.</b>The file was clean.</div>}
        {groups.map((g) => (
          <section key={g.a} className={`ds-det-g ${ACT[g.a].cls}`}>
            <h4><I n={ACT[g.a].ic} />{ACT[g.a].t}<span>{g.items.reduce((s, x) => s + (g.a === "info" ? 0 : x.count), 0) || ""}</span></h4>
            {g.items.map((x, i) => (
              <div key={i} className="ds-issue" style={{ ["--i" as string]: i }}>
                <b className="ds-issue-n">{g.a === "info" ? <I n="shield" /> : x.count.toLocaleString("en-IN")}</b>
                <div><p>{x.label}</p>{x.examples.length > 0 && <div className="ds-ex">{x.examples.map((e, k) => <code key={k}>{e}</code>)}</div>}</div>
              </div>
            ))}
          </section>
        ))}
        {d.unplaced.length > 0 && (
          <section className="ds-det-g flag">
            <h4><I n="pin" />Places the map does not know</h4>
            <div className="ds-ex wrap">{d.unplaced.map((u) => <code key={u.v}>{u.v} <i>×{u.n}</i></code>)}</div>
            <p className="ds-muted">Outside Chennai district, or a name the gazetteer does not have yet. These rows are kept and counted, but not mapped.</p>
          </section>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- mapping --

function MappingTab({ data, onRemap }: { data: DatasetData; onRemap: (changes: { key: string; role: Role; label?: string }[]) => void }) {
  const s = data.meta.spec;
  const [roles, setRoles] = useState<Record<string, Role>>(() => Object.fromEntries(s.columns.map((c) => [c.key, c.role])));
  const changed = s.columns.filter((c) => roles[c.key] !== c.role);
  const prof = new Map(data.meta.profile.map((p) => [p.key, p]));
  return (
    <div className="ds-mapping">
      <div className="ds-read">
        <div><small>One row is</small><b>a {s.entity}</b></div>
        <div><small>Department</small><b>{s.deptName ?? "Not sure"}</b></div>
        <div><small>Still open means</small><b>{s.openValues.length ? s.openValues.join(", ") : "No status column"}</b></div>
        <div><small>Read by</small><b className="ds-by-b">{s.by === "ai" ? <><I n="spark" />AI · {s.model?.split("/").pop()}</> : "Rules (no AI answered)"}</b></div>
      </div>
      <p className="ds-muted">{s.summary} Change what a column means and rebuild: the cleaning, map, charts, link and story are all redone.</p>
      <div className="ds-cols-w">
        <table className="ds-cols">
          <thead><tr><th>Column in the file</th><th>Values</th><th>Means</th><th>Sure</th><th>Why</th></tr></thead>
          <tbody>
            {s.columns.map((col) => {
              const p = prof.get(col.key);
              return (
                <tr key={col.key} className={roles[col.key] !== col.role ? "chg" : ""}>
                  <td><b>{col.header}</b><small>{p?.type ?? col.type} · {p?.distinct?.toLocaleString("en-IN") ?? "?"} distinct</small></td>
                  <td className="ds-vals">{col.role === "person" ? <span className="ds-muted">hidden</span> : (p?.sample ?? []).slice(0, 3).map((v, i) => <code key={i}>{v}</code>)}</td>
                  <td>
                    <select className="ds-sel" value={roles[col.key]} onChange={(e) => setRoles((r) => ({ ...r, [col.key]: e.target.value as Role }))} aria-label={`Meaning of ${col.header}`}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td><span className="ds-conf"><i style={{ width: `${Math.round(col.conf * 100)}%` }} /></span><small>{Math.round(col.conf * 100)}%</small></td>
                  <td className="ds-why">{col.why}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="ds-map-f">
        <span>{changed.length ? `${changed.length} ${changed.length === 1 ? "change" : "changes"} not yet applied` : "Every column has a meaning. Change any of them to rebuild."}</span>
        <button className="ds-ghost" disabled={!changed.length} onClick={() => setRoles(Object.fromEntries(s.columns.map((c) => [c.key, c.role])))}>Undo</button>
        <button className="ds-btn" disabled={!changed.length} onClick={() => onRemap(changed.map((c) => ({ key: c.key, role: roles[c.key] })))}><I n="refresh" />Rebuild with these meanings</button>
      </footer>
    </div>
  );
}

// -------------------------------------------------------------------- rows --

function RowsTab({ id }: { id: string }) {
  const [t, setT] = useState<PanelData["table"] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    let live = true;
    api<{ table: PanelData["table"] }>(`/api/collector/studio/${id}?rows=1`).then((r) => live && setT(r.table)).catch(() => live && setT({ cols: [], rows: [] }));
    return () => { live = false; };
  }, [id]);
  if (!t) return <div className="ds-loading"><span className="ds-spin" />Loading rows…</div>;
  return (
    <div className="ds-rows">
      <div className="ds-rows-h">
        <label className="ds-search"><I n="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter the rows…" aria-label="Filter the rows" /></label>
        <small>Cleaned rows, newest first (up to 300). Zone is the matched zone. Personal details are not shown.</small>
      </div>
      <DataTable cols={t.cols} rows={t.rows} search={q} />
    </div>
  );
}
