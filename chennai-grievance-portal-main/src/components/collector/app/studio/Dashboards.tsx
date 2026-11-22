"use client";

/**
 * Dashboards: every dataset the Collector added with "Add to dashboard", each as one simple page: the headline, up to
 * four headline numbers, and a few charts, each saying what it shows and what it is good for (lib/studio/simpledash).
 * Charts pinned one by one from a dataset are kept under "Pinned charts". Nothing here asks a model: every figure is
 * recomputed from the dataset's latest rows each time it opens.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DashCard, SimpleDash } from "@/lib/studio/simpledash";
import { fmtNum, type PanelData, type Pin } from "@/lib/studio/types";
import type { Console } from "../CollectorApp";
import { I, type IconName } from "../icons";
import { api } from "./client";
import TookCard from "./Took";
import { DataTable } from "./Dataset";

const StudioChart = dynamic(() => import("./StudioChart"), { ssr: false, loading: () => <div className="ds-skel" /> });
const StudioMap = dynamic(() => import("./StudioMap"), { ssr: false, loading: () => <div className="ds-skel" /> });

export interface BoardItem { pin: Pin; panel: PanelData; dataset: { id: string; name: string } }
const KEY = "diq-studio-dash";
const PRIO = { act: "Needs action", watch: "Worth knowing", note: "Note" } as const;
const CARD_IC: Record<string, IconName> = { Where: "map", "Over time": "line", Split: "donut", Ranking: "barH" };

export default function Dashboards({ c, pins, onOpen, onChanged }: { c: Console; pins: BoardItem[]; onOpen: (id: string) => void; onChanged: () => void }) {
  const [list, setList] = useState<SimpleDash[] | null>(null);
  const [sel, setSel] = useState<string | null>(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  // the console object is rebuilt on every render of the shell: read it through a ref, so the list loads once
  const cRef = useRef(c);
  cRef.current = c;
  const load = useCallback(() => {
    api<{ dashboards: SimpleDash[] }>("/api/collector/studio/dashboards").then((r) => setList(r.dashboards), (e: Error) => { setList([]); cRef.current.toast(e.message, "alert"); });
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { try { if (sel) localStorage.setItem(KEY, sel); } catch { /* not saved */ } }, [sel]);
  const remove = async (d: SimpleDash) => {
    try {
      await api("/api/collector/studio/dashboards", { json: { id: d.id, on: false } });
      c.toast(`Removed "${d.name}" from the dashboards. The dataset itself is kept.`);
      load(); onChanged();
    } catch (e: any) { c.toast(e.message, "alert"); }
  };
  const unpin = async (datasetId: string, pinId: string) => {
    try { await api(`/api/collector/studio/${datasetId}`, { json: { action: "unpin", planId: pinId } }); onChanged(); } catch (e: any) { c.toast(e.message, "alert"); }
  };

  const tabs = [...(list ?? []).map((d) => ({ k: d.id, t: d.name, n: d.cards.length })), ...(pins.length ? [{ k: "pins", t: "Pinned charts", n: pins.length }] : [])];
  const cur = tabs.find((x) => x.k === sel)?.k ?? tabs[0]?.k ?? null;
  const dash = (list ?? []).find((d) => d.id === cur) ?? null;

  return (
    <section className="ds-span card ds-board ds-dashes">
      <header className="ds-board-h">
        <span className="ds-ws-ic k-board"><I n="grid" /></span>
        <div><h2>Dashboards</h2><small>One simple dashboard for each link or file you added. Every figure is recomputed from its latest rows.</small></div>
      </header>
      {list == null ? (
        <div className="ds-dash-load" role="status"><div className="ds-skel sk-head" /><div className="sk-row"><div className="ds-skel" /><div className="ds-skel" /><div className="ds-skel" /></div><div className="sk-row two"><div className="ds-skel" /><div className="ds-skel" /></div></div>
      ) : !tabs.length ? (
        <div className="ds-empty big"><I n="grid" /><b>No dashboards yet</b>Open a dataset you added and press “Add to dashboard”. Its headline, key numbers and charts appear here, each with what it shows and how it helps.</div>
      ) : (
        <>
          <nav className="ds-dtabs" role="tablist" aria-label="Your dashboards">
            {tabs.map((x) => (
              <button key={x.k} role="tab" aria-selected={cur === x.k} className={cur === x.k ? "on" : ""} onClick={() => setSel(x.k)} title={x.t}>
                <I n={x.k === "pins" ? "bookmark" : "grid"} /><span>{x.t}</span><em>{x.n}</em>
              </button>
            ))}
          </nav>
          <div className="ds-dash-b">
            {cur === "pins" ? <Pinned pins={pins} c={c} onOpen={onOpen} onUnpin={unpin} />
              : dash ? <SimpleDashView key={dash.id} d={dash} c={c} onOpen={() => onOpen(dash.id)} onRemove={() => remove(dash)} /> : null}
          </div>
        </>
      )}
    </section>
  );
}

function SimpleDashView({ d, c, onOpen, onRemove }: { d: SimpleDash; c: Console; onOpen: () => void; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const empty = !d.cards.length && !d.kpis.length;
  return (
    <article className="ds-sd">
      <header className="ds-sd-h">
        <div className="ds-sd-t">
          <span className="ds-kicker"><i />{d.department ?? "Your data"}{d.sample ? " · sample" : ""}</span>
          <h2>{d.headline}</h2>
          <small>{d.name} · {d.took.rowsKept.toLocaleString("en-IN")} rows{d.took.period ? ` · ${d.took.period}` : ""}{d.by === "ai" ? " · written by AI over computed numbers" : ""}</small>
        </div>
        <div className="ds-sd-acts">
          <button className="ds-ghost" onClick={onOpen}><I n="table" />Open dataset</button>
          {confirm ? <span className="ds-confirm">Remove?<button onClick={onRemove} data-jarvis-never>Yes</button><button onClick={() => setConfirm(false)}>No</button></span>
            : <button className="ds-icon" onClick={() => setConfirm(true)} title="Remove this dashboard (the dataset is kept)" aria-label="Remove this dashboard"><I n="x" /></button>}
        </div>
      </header>
      {d.summary.length > 0 && !empty && <ul className="ds-sd-sum">{d.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>}
      {empty ? (
        <div className="ds-empty big"><I n="info" /><b>No insights available</b>The data was read, but it holds nothing to count, compare or place on the map: no numbers, dates, places or types to group by. Open the dataset to see its rows.</div>
      ) : (
        <>
          {d.kpis.length > 0 && (
            <div className="ds-sd-k" style={{ gridTemplateColumns: `repeat(${d.kpis.length}, minmax(0,1fr))` }}>
              {d.kpis.map((p) => (
                <div key={p.id} className={`ds-sd-kpi k-${p.kpi!.tone}`}>
                  <small title={p.kpi!.label}>{p.kpi!.label}</small>
                  <b>{fmtNum(p.kpi!.value, p.format, p.unit, true)}</b>
                  <span title={p.kpi!.sub}>{p.kpi!.sub}</span>
                </div>
              ))}
            </div>
          )}
          {d.cards.length > 0 ? (
            <div className={`ds-sd-g n${d.cards.length}`}>
              {d.cards.map((x, i) => <DashCardView key={x.id} x={x} i={i} c={c} />)}
            </div>
          ) : <p className="ds-muted pad"><I n="info" />No insights available beyond the headline numbers.</p>}
        </>
      )}
      <TookCard t={d.took} compact />
    </article>
  );
}

function DashCardView({ x, i, c }: { x: DashCard; i: number; c: Console }) {
  const p = x.panel;
  return (
    <section className={`ds-sdc${x.priority ? ` p-${x.priority}` : ""}${p?.chart === "map" ? " is-map" : ""}`} style={{ ["--i" as string]: i }}>
      <header>
        <span className="ds-ilabel"><I n={CARD_IC[x.label] ?? "bulb"} />{x.label}</span>
        {x.priority && <span className={`ds-prio p-${x.priority}`}>{PRIO[x.priority]}</span>}
      </header>
      <h4>{x.title}</h4>
      <div className="ds-sdc-b">
        {p ? (p.chart === "map" ? <StudioMap geo={c.geo} panel={p} focusZone={null} />
          : p.chart === "table" && p.table ? <DataTable cols={p.table.cols} rows={p.table.rows} bar={p.table.bar ?? null} />
            : <StudioChart panel={p} height="100%" compact />)
          : x.metric ? <div className="ds-sdc-m"><b>{x.metric.value}</b><small>{x.metric.caption}</small></div> : null}
      </div>
      <p className="ds-sdc-i"><b>Insight</b>{x.insight}</p>
      <p className="ds-sdc-h"><I n="target" /><b>Helps:</b> {x.helps}</p>
    </section>
  );
}

function Pinned({ pins, c, onOpen, onUnpin }: { pins: BoardItem[]; c: Console; onOpen: (id: string) => void; onUnpin: (datasetId: string, pinId: string) => void }) {
  return (
    <div className="ds-board-g">
      {pins.map(({ pin, panel, dataset }, i) => (
        <article key={pin.id} className={`ds-panel${panel.chart === "map" ? " is-map" : ""}`} style={{ ["--i" as string]: i }}>
          <header>
            <div className="ds-p-t"><h4>{panel.title}</h4><small><button className="ds-lnk" onClick={() => onOpen(dataset.id)}>{dataset.name}</button> · {panel.subtitle}</small></div>
            <div className="ds-p-acts"><button onClick={() => onUnpin(dataset.id, pin.id)} title="Unpin" aria-label="Unpin"><I n="x" /></button></div>
          </header>
          <div className="ds-p-b">
            {panel.kpi ? <div className="ds-board-k"><b>{panel.kpi.value.toLocaleString("en-IN")}</b><small>{panel.kpi.sub}</small></div>
              : panel.chart === "map" ? <StudioMap geo={c.geo} panel={panel} focusZone={null} />
                : panel.values.length ? <StudioChart panel={panel} height="100%" /> : <div className="ds-nodata">No values right now.</div>}
          </div>
        </article>
      ))}
    </div>
  );
}
