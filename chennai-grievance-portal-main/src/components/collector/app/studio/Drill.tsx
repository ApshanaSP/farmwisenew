"use client";

/**
 * The drill-down drawer: one mark of a chart opened. What it stands for (value, share, against the average, rank),
 * how it breaks down (each breakdown is clickable again: drill deeper, and step back), the rows behind it, the
 * district's incidents in its zones, and what the Collector can do with it: focus the whole dashboard on it, ask the
 * AI, draft a note to the department, download the rows, pin it.
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { type DraftNote, type DrillResult, type Filter, type Plan } from "@/lib/studio/types";
import type { Console } from "../CollectorApp";
import { I } from "../icons";
import { api } from "./client";
import { AnimatedNum, DataTable } from "./Dataset";

const StudioChart = dynamic(() => import("./StudioChart"), { ssr: false, loading: () => <div className="ds-skel sm" /> });

interface Level { plan: Plan; key: string | number | null; extra: Filter[] }

export default function Drill({ id, start, extra, c, onClose, onFocus, onAsk, onPin }: {
  id: string; start: { plan: Plan; key: string | number | null }; extra: Filter[]; c: Console;
  onClose: () => void; onFocus: (label: string, filters: Filter[]) => void; onAsk: (q: string) => void; onPin: (p: Plan) => void;
}) {
  const [stack, setStack] = useState<Level[]>([{ ...start, extra }]);
  const [data, setData] = useState<DrillResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [note, setNote] = useState<DraftNote | "busy" | null>(null);
  const level = stack[stack.length - 1];

  useEffect(() => {
    let live = true;
    setData(null); setErr(null); setNote(null); setQ("");
    api<DrillResult>(`/api/collector/studio/${id}`, { json: { action: "drill", plan: level.plan, key: level.key, filters: level.extra } })
      .then((d) => live && setData(d)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [id, level]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); stack.length > 1 ? setStack((s) => s.slice(0, -1)) : onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [stack.length, onClose]);

  // a mark inside a breakdown: one level deeper (the breakdown's plan already holds this level's filters)
  const deeper = (plan: Plan, key: string | number) => setStack((s) => [...s, { plan: { ...plan, title: plan.title }, key, extra: [] }]);
  const draft = async () => {
    setNote("busy");
    try { setNote(await api<DraftNote>(`/api/collector/studio/${id}`, { json: { action: "note", plan: level.plan, key: level.key, filters: level.extra } })); }
    catch (e: any) { setNote(null); c.toast(e.message, "alert"); }
  };
  const copy = async (n: DraftNote) => {
    const text = `To: ${n.to}\nSubject: ${n.subject}\n\n${n.body}\n\nAction requested:\n${n.actions.map((a, i) => `${i + 1}. ${a}`).join("\n")}`;
    try { await navigator.clipboard.writeText(text); c.toast("Note copied."); } catch { c.toast("Copy is blocked in this browser: select the text instead.", "alert"); }
  };
  const csv = data ? `/api/collector/studio/${id}?export=csv&f=${encodeURIComponent(JSON.stringify(data.filters))}` : "#";

  return (
    <div className="ds-drill" role="dialog" aria-label="Details">
      <header className="ds-drill-h">
        {stack.length > 1 && <button className="ds-icon" onClick={() => setStack((s) => s.slice(0, -1))} title="Back" aria-label="Back"><I n="chevl" /></button>}
        <span className="ds-drill-ic"><I n="target" /></span>
        <div className="ds-drill-t">
          <small>{stack.length > 1 ? `${stack.length - 1} level${stack.length > 2 ? "s" : ""} deeper · ` : ""}{level.plan.title}</small>
          <h3>{data?.label ?? "Opening…"}</h3>
        </div>
        <button className="ds-icon" onClick={onClose} title="Close (Esc)" aria-label="Close"><I n="x" /></button>
      </header>
      {err && <div className="ds-empty"><I n="alert" /><b>{err}</b></div>}
      {!data && !err && <div className="ds-loading"><span className="ds-spin" />Reading the rows behind it…</div>}
      {data && (
        <div className="ds-drill-b">
          <div className="ds-drill-stats">
            <div className="ds-dstat main"><small>{data.measure}</small><b><AnimatedNum v={data.value} format={data.format} unit={data.unit} /></b></div>
            <div className="ds-dstat"><small>Records</small><b>{data.rows.toLocaleString("en-IN")}</b></div>
            {data.share != null && <div className="ds-dstat"><small>Share of the chart</small><b>{data.share}%</b><i style={{ width: `${Math.min(100, data.share)}%` }} /></div>}
            {data.vsAvg != null && <div className={`ds-dstat${data.vsAvg >= 1.5 ? " hot" : data.vsAvg <= 0.6 ? " cool" : ""}`}><small>Against the average</small><b>{data.vsAvg}×</b></div>}
            {data.rank && <div className="ds-dstat"><small>Rank</small><b>{data.rank.pos}<em> of {data.rank.of}</em></b></div>}
          </div>
          {data.chips.length > 0 && <div className="ds-drill-chips">{data.chips.map((x, i) => <span key={i}>{x}</span>)}</div>}
          <div className="ds-drill-acts">
            <button className="ds-btn sm" onClick={() => { onFocus(data.label, data.filters.slice(extra.length)); onClose(); }} disabled={data.filters.length <= extra.length}>
              <I n="target" />Focus the dashboard on this</button>
            <button className="ds-chip-b" onClick={() => onAsk(`${data.title} for ${data.label}: what stands out?`)}><I n="chat" />Ask the AI</button>
            <button className="ds-chip-b" onClick={draft} disabled={note === "busy"}>{note === "busy" ? <span className="ds-spin sm" /> : <I n="scroll" />}Draft a note to the department</button>
            <a className="ds-chip-b" href={csv}><I n="download" />Download these {data.rows.toLocaleString("en-IN")} rows</a>
            <button className="ds-chip-b" onClick={() => onPin({ ...level.plan, id: `p_${Date.now().toString(36)}`, title: `${level.plan.title}: ${data.label}`, filters: data.filters, by: level.plan.by === "time" ? "time" : "none", chart: level.plan.by === "time" ? "area" : "kpi" })}>
              <I n="bookmark" />Pin</button>
          </div>
          {note && note !== "busy" && (
            <div className="ds-note">
              <header><I n="scroll" /><b>Draft note</b><small>{note.by === "ai" ? `Written by AI (${note.model?.split("/").pop()}) · every number checked` : "Written from the figures above"}</small>
                <button className="ds-chip-b" onClick={() => copy(note)}><I n="copy" />Copy</button><button className="ds-icon" onClick={() => setNote(null)} aria-label="Close the note"><I n="x" /></button></header>
              <dl><dt>To</dt><dd>{note.to}</dd><dt>Subject</dt><dd><b>{note.subject}</b></dd></dl>
              <p>{note.body}</p>
              {note.actions.length > 0 && <ol>{note.actions.map((a, i) => <li key={i}>{a}</li>)}</ol>}
            </div>
          )}
          <div className="ds-drill-g">
            <div className="ds-drill-l">
              {data.breakdowns.map((b) => (
                <section key={b.id} className="ds-drill-card">
                  <h4>{b.title}<small>click to go deeper</small></h4>
                  <div className="ds-drill-ch">{b.values.length ? <StudioChart panel={b} height={150} compact onPick={(k) => deeper(b.plan, k)} /> : <div className="ds-nodata">No values.</div>}</div>
                </section>
              ))}
              {data.incidents.length > 0 && (
                <section className="ds-drill-card">
                  <h4>District incidents here<small>open first · click to open</small></h4>
                  <ul className="ds-incs">
                    {data.incidents.map((s) => (
                      <li key={s.id}><button onClick={() => c.openInc(s.id)}>
                        <i className={`sv ${s.severity.toLowerCase()}`} />
                        <span><b>{s.title}</b><small>{s.zone ?? "Chennai"} · {s.when.slice(0, 10)}{s.open ? " · open" : ""}{s.news ? " · in the news" : ""}</small></span><I n="chevr" />
                      </button></li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
            <section className="ds-drill-card rows">
              <h4>The records<small>{data.table && data.table.rows.length < data.rows ? `first ${data.table.rows.length} of ${data.rows.toLocaleString("en-IN")}` : `${data.rows.toLocaleString("en-IN")}`}</small></h4>
              <label className="ds-search sm"><I n="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter these records…" aria-label="Filter these records" /></label>
              <div className="ds-drill-rows">{data.table && <DataTable cols={data.table.cols} rows={data.table.rows} search={q} />}</div>
            </section>
          </div>
          <p className="ds-drill-foot">Every figure here is counted from the rows; the charts open the next level down.</p>
        </div>
      )}
    </div>
  );
}
