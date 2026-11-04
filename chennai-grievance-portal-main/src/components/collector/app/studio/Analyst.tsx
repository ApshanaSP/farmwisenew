"use client";

/**
 * The dataset's District link card (shown in its Insights) and its Alerts tab ("tell me when ..."). Questions about a
 * dataset are asked of Jarvis, which uses the same engine (the AI plans, the numbers are counted from the rows):
 * the Studio tells Jarvis which dataset is open (window.__diqStudio, event "diq:studio").
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { type LinkResult, type RuleStatus } from "@/lib/studio/types";
import type { Console } from "../CollectorApp";
import { I } from "../icons";
import { api } from "./client";
import type { DatasetData } from "./Dataset";

const PairChart = dynamic(() => import("./StudioChart").then((m) => m.PairChart), { ssr: false, loading: () => <div className="ds-skel sm" /> });
const TimeChart = dynamic(() => import("./StudioChart").then((m) => m.TimeChart), { ssr: false, loading: () => <div className="ds-skel sm" /> });

interface Answer { kind: "query" | "watch" | "unsupported" | "why"; plan?: unknown; watch?: { op: "gt" | "gte" | "lt" | "lte"; threshold: number } | null }

// -------------------------------------------------------------------- link --

export function LinkCard({ l, c }: { l: LinkResult; c: Console }) {
  const rho = l.mode === "place" ? l.rho : l.time?.rho ?? 0;
  const label = l.strength === "none" ? "no clear link" : `${l.strength} link`;
  const win = `${day(l.window.from)} – ${day(l.window.to)}`;
  return (
    <section className={`ds-linkc s-${l.strength}`}>
      <header><I n="compare" />Linked with district incidents<span className="ds-str">{label}</span></header>
      <div className="ds-bridge">
        <div><small>Your data</small><b>{cap(l.dsLabel)}</b></div>
        <div className="ds-bridge-l" aria-hidden="true"><i /><i /><i /><em>ρ {rho.toFixed(2)}</em></div>
        <div><small>Incidents</small><b>{l.incLabel}</b></div>
      </div>
      <div className="ds-meter" title={`Rank correlation ${rho.toFixed(2)}`}><i style={{ width: `${Math.max(3, Math.round(Math.max(0, rho) * 100))}%` }} /><span style={{ left: "25%" }} /><span style={{ left: "40%" }} /><span style={{ left: "60%" }} /></div>
      <small className="ds-linkc-s">
        {l.mode === "place" ? `Zone by zone over ${l.n} zones` : `Week by week over ${l.time?.weeks} weeks${l.time?.lag ? `, incidents ${l.time.lag} ${l.time.lag === 1 ? "week" : "weeks"} earlier` : ""}`} · {win}
        {l.window.basis === "latest" ? " (the latest 90 days: the file's dates are outside the store)" : ""}
      </small>
      {l.mode === "place" && l.pairs.length > 0 && <PairChart pairs={l.pairs} dsLabel={l.dsLabel} incLabel={l.incLabel} height={132} />}
      {l.time && l.mode === "time" && <TimeChart series={l.time.series} dsLabel={l.dsLabel} incLabel={l.incLabel} height={120} />}
      {l.overlap.length > 0 && (
        <div className="ds-overlap"><small>Hotspots in both</small>{l.overlap.map((o) => <span key={o.key}>{o.name}<i>{o.ds} · {o.inc}</i></span>)}</div>
      )}
      {l.incidents > 0 && (
        <div className="ds-linkc-n">
          <span><b>{l.incidents.toLocaleString("en-IN")}</b>incidents</span><span><b>{l.open.toLocaleString("en-IN")}</b>still open</span>
          {l.overdue > 0 && <span className="sev"><b>{l.overdue.toLocaleString("en-IN")}</b>past deadline</span>}{l.news > 0 && <span><b>{l.news.toLocaleString("en-IN")}</b>in the news</span>}
        </div>
      )}
      {l.sample.length > 0 && (
        <ul className="ds-incs">
          {l.sample.map((s) => (
            <li key={s.id}><button onClick={() => c.openInc(s.id)}>
              <i className={`sv ${s.severity.toLowerCase()}`} />
              <span><b>{s.title}</b><small>{s.zone ?? "Chennai"} · {day(s.when.slice(0, 10))}{s.open ? " · open" : ""}{s.news ? " · in the news" : ""}</small></span>
              <I n="chevr" />
            </button></li>
          ))}
        </ul>
      )}
      <p className="ds-caveat">An association between two sources, not proof that one causes the other.</p>
    </section>
  );
}

// ------------------------------------------------------------------ alerts --

export function AlertsTab({ data, id, c, onChanged }: { data: DatasetData; id: string; c: Console; onChanged: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const add = async () => {
    const q = text.trim();
    if (q.length < 6) return;
    setBusy(true); setMsg(null);
    try {
      const a = await api<Answer>(`/api/collector/studio/${id}`, { json: { action: "ask", question: /^(tell|alert|notify|warn|watch|flag)/i.test(q) ? q : `Tell me when ${q}` } });
      if (a.kind === "watch" && a.plan && a.watch) {
        await api(`/api/collector/studio/${id}`, { json: { action: "watch", text: q, plan: a.plan, op: a.watch.op, threshold: a.watch.threshold } });
        setText("");
        c.toast("Alert saved.");
        onChanged();
      } else setMsg("That did not read as an alert. Try: “any zone with more than 20 open works”.");
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  const drop = async (r: RuleStatus) => {
    try { await api(`/api/collector/studio/${id}`, { json: { action: "unwatch", ruleId: r.id } }); onChanged(); } catch (e: any) { c.toast(e.message, "alert"); }
  };
  return (
    <div className="ds-alerts">
      <form className="ds-alert-f" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label>Tell me when…</label>
        <div><input value={text} onChange={(e) => setText(e.target.value)} placeholder="any zone has more than 20 open works" maxLength={280} aria-label="Alert" />
          <button className="ds-btn sm" disabled={busy || text.trim().length < 6}>{busy ? <span className="ds-spin sm" /> : <I n="plus" />}Add</button></div>
        {msg && <small className="ds-alert-m">{msg}</small>}
      </form>
      {!data.alerts.length && (
        <div className="ds-ask-0">
          <span className="ds-ask-ic"><I n="bell" /></span><b>Standing orders, in plain words</b>
          <p>Write what to watch for. The AI turns it into a check; it runs on the rows every time this data is opened or fetched again.</p>
        </div>
      )}
      {data.alerts.map((r, i) => (
        <div key={r.id} className={`ds-alert ${r.ok ? "ok" : "hot"}`} style={{ ["--i" as string]: i }}>
          <header><span className="ds-al-dot" /><b>{r.text}</b><button onClick={() => drop(r)} aria-label="Remove alert"><I n="x" /></button></header>
          {r.ok ? <small>All clear right now.</small> : (
            <>
              <small>{r.total} {r.total === 1 ? "match" : "matches"} now</small>
              <ul>{r.hits.map((h) => <li key={h.label}><span>{h.label}</span><b>{h.value.toLocaleString("en-IN")}</b></li>)}</ul>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (d: string) => (d ? `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}` : "");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
