"use client";

/**
 * The AI analyst beside a dataset:
 *   Story   the headline, the link with the district's incidents (the incidents open in the console), the findings
 *   Ask     questions in words or by voice; the AI plans, the engine computes; answers can join the dashboard or the board
 *   Alerts  "tell me when ...": checked against the rows every time the dataset is opened or rebuilt
 */
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { fmtNum, type LinkResult, type PanelData, type Plan, type RuleStatus } from "@/lib/studio/types";
import type { Console } from "../CollectorApp";
import { I } from "../icons";
import { BrandMark } from "../assistant/Brand";
import { canListen, listen } from "../assistant/speech";
import { api } from "./client";
import type { DatasetData } from "./Dataset";

const StudioChart = dynamic(() => import("./StudioChart"), { ssr: false, loading: () => <div className="ds-skel sm" /> });
const PairChart = dynamic(() => import("./StudioChart").then((m) => m.PairChart), { ssr: false, loading: () => <div className="ds-skel sm" /> });
const TimeChart = dynamic(() => import("./StudioChart").then((m) => m.TimeChart), { ssr: false, loading: () => <div className="ds-skel sm" /> });

interface Answer {
  kind: "query" | "watch" | "unsupported"; plan?: Plan; panel?: PanelData; answer?: string; note?: string | null; by: "ai" | "rules"; model: string | null;
  watch?: { op: "gt" | "gte" | "lt" | "lte"; threshold: number } | null;
}
interface Msg { id: number; q: string; a: Answer | null; err: string | null; added?: boolean; pinned?: boolean; watched?: boolean }

export default function Analyst({ data, id, c, onSpot, onAdd, onPin, onAlertsChanged, seed }: {
  data: DatasetData; id: string; c: Console; onSpot: (p: Plan, answer?: string) => void; onAdd: (p: Plan) => void; onPin: (p: Plan) => void; onAlertsChanged: () => void;
  /** a question handed over from a drill-down ("Ask the AI"): asked at once */
  seed?: { q: string; n: number } | null;
}) {
  const [tab, setTab] = useState<"link" | "ask" | "alerts">("ask");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  useEffect(() => { setMsgs([]); setTab("ask"); }, [id]);
  useEffect(() => { if (seed) setTab("ask"); }, [seed]);
  const fired = data.alerts.filter((a) => !a.ok).length;
  return (
    <aside className="ds-ai-col card">
      <header className="ds-ai-h">
        <span className="ds-ai-mark"><BrandMark size={26} /></span>
        <div><b>AI analyst</b><small>Questions in plain words · answers counted from the rows</small></div>
      </header>
      <nav className="ds-ai-tabs" role="tablist">
        {([["ask", "Ask", "chat"], ["link", "District link", "compare"], ["alerts", "Alerts", "bell"]] as const).map(([k, t, ic]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            <I n={ic} />{t}{k === "alerts" && data.alerts.length > 0 && <em className={fired ? "hot" : ""}>{fired || data.alerts.length}</em>}
            {k === "ask" && msgs.length > 0 && <em>{msgs.length}</em>}
          </button>
        ))}
      </nav>
      <div className="ds-ai-b" key={tab}>
        {tab === "link" && (data.meta.link ? <div className="ds-story"><LinkCard l={data.meta.link} c={c} /></div>
          : <div className="ds-ask-0"><span className="ds-ask-ic"><I n="compare" /></span><b>No link with district incidents</b><p>This data has no zones or weeks that line up with the incidents the console records.</p></div>)}
        {tab === "ask" && <AskTab data={data} id={id} c={c} msgs={msgs} setMsgs={setMsgs} onSpot={onSpot} onAdd={onAdd} onPin={onPin} onWatched={onAlertsChanged} seed={seed ?? null} />}
        {tab === "alerts" && <AlertsTab data={data} id={id} c={c} onChanged={onAlertsChanged} />}
      </div>
    </aside>
  );
}

// -------------------------------------------------------------------- link --

function LinkCard({ l, c }: { l: LinkResult; c: Console }) {
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

// --------------------------------------------------------------------- ask --

function AskTab({ data, id, c, msgs, setMsgs, onSpot, onAdd, onPin, onWatched, seed }: {
  data: DatasetData; id: string; c: Console; msgs: Msg[]; setMsgs: React.Dispatch<React.SetStateAction<Msg[]>>;
  onSpot: (p: Plan, a?: string) => void; onAdd: (p: Plan) => void; onPin: (p: Plan) => void; onWatched: () => void; seed: { q: string; n: number } | null;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mic, setMic] = useState<(() => void) | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" }); }, [msgs]);
  const send = async (q: string) => {
    q = q.trim();
    if (q.length < 2 || busy) return;
    setText("");
    const mid = Date.now();
    setMsgs((m) => [...m, { id: mid, q, a: null, err: null }]);
    setBusy(true);
    try {
      const a = await api<Answer>(`/api/collector/studio/${id}`, { json: { action: "ask", question: q } });
      setMsgs((m) => m.map((x) => (x.id === mid ? { ...x, a } : x)));
      // "add ... to the dashboard": the answer joins the dashboard at once
      if (a.plan && a.kind === "query" && /\b(add|put|include)\b.*\b(dashboard|panels?)\b/i.test(q)) { onAdd(a.plan); setMsgs((m) => m.map((x) => (x.id === mid ? { ...x, added: true } : x))); }
    } catch (e: any) {
      setMsgs((m) => m.map((x) => (x.id === mid ? { ...x, err: e.message } : x)));
    } finally { setBusy(false); }
  };
  // a question handed over from a drill-down is asked once
  const asked = useRef(0);
  useEffect(() => { if (seed && seed.n !== asked.current) { asked.current = seed.n; void send(seed.q); } }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const watch = async (m: Msg) => {
    if (!m.a?.plan || !m.a.watch) return;
    try {
      await api(`/api/collector/studio/${id}`, { json: { action: "watch", text: m.q, plan: m.a.plan, op: m.a.watch.op, threshold: m.a.watch.threshold } });
      setMsgs((x) => x.map((y) => (y.id === m.id ? { ...y, watched: true } : y)));
      c.toast("Alert saved. It is checked whenever this data is opened or fetched again.");
      onWatched();
    } catch (e: any) { c.toast(e.message, "alert"); }
  };
  const voice = () => {
    if (mic) { mic(); setMic(null); return; }
    const stop = listen("en-IN", (t) => setText(t), (t) => { setMic(null); if (t) send(t); }, (e) => { setMic(null); c.toast(e === "not-allowed" ? "The microphone is blocked for this site." : "Voice input stopped.", "alert"); });
    setMic(() => stop);
  };
  const qs = data.meta.spec.questions;
  return (
    <div className="ds-ask">
      <div className="ds-thread" ref={list}>
        {!msgs.length && (
          <div className="ds-ask-0">
            <span className="ds-ask-ic"><I n="chat" /></span>
            <b>Ask this data anything</b>
            <p>The AI turns your question into a query; the numbers are counted from the rows, never written by the model. Say &ldquo;add it to the dashboard&rdquo; to keep the chart.</p>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className="ds-turn">
            <div className="ds-q">{m.q}</div>
            {!m.a && !m.err && <div className="ds-a think"><span className="ds-dots"><i /><i /><i /></span>Planning the query…</div>}
            {m.err && <div className="ds-a err"><I n="alert" />{m.err}</div>}
            {m.a && (
              <div className="ds-a">
                {m.a.kind === "unsupported" ? <p className="ds-muted">{m.a.note}</p> : (
                  <>
                    <p className="ds-a-t">{m.a.answer}</p>
                    {m.a.panel?.subtitle && <p className="ds-a-how"><I n="sliders" /><span><b>Counted:</b> {m.a.panel.subtitle}</span></p>}
                    {m.a.note && <p className="ds-muted">{m.a.note}</p>}
                    {m.a.panel && m.a.panel.chart !== "kpi" && m.a.panel.chart !== "table" && m.a.panel.values.length > 0 && m.a.panel.chart !== "map" && (
                      <div className="ds-a-c"><StudioChart panel={m.a.panel} height={150} compact /></div>
                    )}
                    {m.a.panel?.kpi && <div className="ds-a-k"><b>{fmtNum(m.a.panel.kpi.value, m.a.panel.format, m.a.panel.unit)}</b><small>{m.a.panel.kpi.sub}</small></div>}
                    <div className="ds-a-acts">
                      {m.a.kind === "watch" && m.a.watch ? (
                        <button className="ds-btn sm" disabled={m.watched} onClick={() => watch(m)}><I n="bell" />{m.watched ? "Alert saved" : `Alert me when ${m.a.watch.op.startsWith("g") ? "above" : "below"} ${m.a.watch.threshold.toLocaleString("en-IN")}`}</button>
                      ) : null}
                      {m.a.plan && <button className="ds-chip-b" disabled={m.added} onClick={() => { onAdd(m.a!.plan!); setMsgs((x) => x.map((y) => (y.id === m.id ? { ...y, added: true } : y))); }}><I n="plus" />{m.added ? "On the dashboard" : "Add to dashboard"}</button>}
                      {m.a.plan && <button className="ds-chip-b" disabled={m.pinned} onClick={() => { onPin(m.a!.plan!); setMsgs((x) => x.map((y) => (y.id === m.id ? { ...y, pinned: true } : y))); }}><I n="bookmark" />{m.pinned ? "Pinned" : "Pin"}</button>}
                      {m.a.plan && <button className="ds-chip-b" onClick={() => onSpot(m.a!.plan!, m.a!.answer)}><I n="expand" />Open</button>}
                    </div>
                    <small className="ds-a-by">{m.a.by === "ai" ? `Planned by AI (${m.a.model?.split("/").pop()}) · computed from the rows` : "Read by rules (no AI answered) · computed from the rows"}</small>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {qs.length > 0 && msgs.length === 0 && (
        <div className="ds-sugg">{qs.map((q) => <button key={q} onClick={() => send(q)} disabled={busy}>{q}</button>)}</div>
      )}
      <form className="ds-ask-f" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={mic ? "Listening…" : "Which zone has the most…"} maxLength={400} aria-label="Ask this data" />
        {canListen() && <button type="button" className={`ds-mic${mic ? " on" : ""}`} onClick={voice} aria-label={mic ? "Stop listening" : "Ask by voice"} title="Ask by voice"><I n="mic" /></button>}
        <button type="submit" className="ds-send" disabled={busy || text.trim().length < 2} aria-label="Ask"><I n="send" /></button>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ alerts --

function AlertsTab({ data, id, c, onChanged }: { data: DatasetData; id: string; c: Console; onChanged: () => void }) {
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
