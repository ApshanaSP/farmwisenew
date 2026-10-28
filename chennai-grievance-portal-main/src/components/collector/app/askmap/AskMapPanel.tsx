"use client";

/**
 * Ask the Map's panel, over the left of the grown console map: the Ask box (typed or spoken, Enter asks, ↑ recalls),
 * the plan as chips (each part changeable with no AI call), the answer ("N … · map layer ready", one sentence of
 * meaning, the departments, the as-of line), "How this was worked out", the list (worst first, up to 200 rows), the
 * Area brief, and the actions. Every number here comes from the server's executor; nothing is computed in the browser
 * except moving the camera. Loaded on the Ask box's first focus (dynamic import), so the Overview loads no slower.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { AskResponse } from "@/lib/map/ask";
import { applyChip, type PlanChip } from "@/lib/map/chips";
import { fmtDistance } from "@/lib/map/geom";
import { LAYER_WORD } from "@/lib/map/words";
import { I } from "../icons";
import { SEV_HEX } from "../lib";
import { canListen, listen } from "../assistant/speech";
import type { MapAsk } from "./useMapAsk";

const T = {
  en: {
    title: "Ask the map", back: "Back to overview", placeholder: "Ask about any place, distance, road or area…", ask: "Ask", mic: "Speak your question",
    how: "How this was worked out", list: "Cases", none: "Nothing matched.", more: (n: number) => `and ${n.toLocaleString("en-IN")} more`, exportAll: "Export all",
    send: "Send to department", export: "Export", save: "Save view", visits: "Plan my visits", depts: "Responsible", asOf: "As of", noPlace: "no exact place",
    tour: "Tour the top 3", follow: "Follow the road", before: "Before", now: "Now", backTo: "Back to the answer", empty: "Ask about any place, distance, road or area, in English or Tamil.",
    suggest: "Try", brief: "What is happening here", open: "open issues", worst: "Worst three", byType: "By type", deptsH: "Departments", change: "Last 30 days", facilities: "In and around it",
    citizen: "From citizens", default: "default", remove: "Remove", unplaced: (n: number) => `${n.toLocaleString("en-IN")} with no exact place (counted, not pinned)`,
    showing: (l: string) => `Showing: ${l}`, clear: "Show all", from: "from", overdue: "past deadline"
  },
  ta: {
    title: "வரைபடத்திடம் கேளுங்கள்", back: "மேலோட்டம்", placeholder: "எந்த இடம், தூரம், சாலை அல்லது பகுதி பற்றியும் கேளுங்கள்…", ask: "கேள்", mic: "பேசிக் கேளுங்கள்",
    how: "இது எப்படிக் கணக்கிடப்பட்டது", list: "சம்பவங்கள்", none: "எதுவும் பொருந்தவில்லை.", more: (n: number) => `மேலும் ${n.toLocaleString("en-IN")}`, exportAll: "அனைத்தையும் பதிவிறக்கு",
    send: "துறைக்கு அனுப்பு", export: "பதிவிறக்கு", save: "பார்வையைச் சேமி", visits: "என் வருகைகள்", depts: "பொறுப்பு", asOf: "நிலவரம்", noPlace: "துல்லிய இடம் இல்லை",
    tour: "முதல் 3 இடங்கள்", follow: "சாலை வழியே", before: "முன்பு", now: "இப்போது", backTo: "பதிலுக்குத் திரும்பு", empty: "எந்த இடம், தூரம், சாலை அல்லது பகுதி பற்றியும் தமிழிலோ ஆங்கிலத்திலோ கேளுங்கள்.",
    suggest: "முயலுங்கள்", brief: "இங்கே என்ன நடக்கிறது", open: "திறந்த பிரச்சனைகள்", worst: "மோசமான மூன்று", byType: "வகைவாரியாக", deptsH: "துறைகள்", change: "கடந்த 30 நாட்கள்", facilities: "உள்ளேயும் அருகிலும்",
    citizen: "குடிமக்களிடமிருந்து", default: "இயல்பு", remove: "நீக்கு", unplaced: (n: number) => `${n} துல்லிய இடமின்றி (எண்ணப்பட்டது, குறிக்கப்படவில்லை)`,
    showing: (l: string) => `காட்டுவது: ${l}`, clear: "அனைத்தும்", from: "இலிருந்து", overdue: "காலக்கெடு தாண்டியது"
  }
};
type Words = typeof T.en;

export const SELLING = [
  ["Ask, don't search.", "One sentence instead of five dropdowns."],
  ["It knows what is near what.", "Schools, hospitals, police and fire stations, lakes, canals and roads are on the same map."],
  ["Every dot is real and checkable.", "Click a pin to see who reported it, when, and its status."],
  ["In Tamil, too.", "அடையாறு அருகே திறந்த புகார்கள்"]
];

export interface PanelActions {
  role: "collector" | "officer";
  onBack: () => void;
  onOpen: (id: string) => void;
  onSend?: (r: AskResponse, dept: string | null) => void;
  onExport?: (r: AskResponse) => void;
  onSave?: (r: AskResponse) => void;
  onVisits?: (r: AskResponse) => void;
  suggestions: string[];
}

export default function AskMapPanel({ ask, actions, autoFocus }: { ask: MapAsk; actions: PanelActions; autoFocus?: boolean }) {
  const r = ask.resp;
  const lang = r?.lang === "ta" ? "ta" : "en";
  const w = T[lang];
  const [text, setText] = useState("");
  const [recall, setRecall] = useState(-1);
  const [listening, setListening] = useState<null | (() => void)>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"peek" | "half" | "full">("half");
  const [traceOn, setTraceOn] = useState<string | null>(null);
  const [tour, setTour] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);
  useEffect(() => { setTour(-1); setTraceOn(null); setMenu(null); }, [r]);
  // "send these to SWD", "export": follow-ups that are actions
  useEffect(() => {
    const u = ask.uiCue;
    if (!u || !ask.resp) return;
    if (u.ui === "send" && actions.onSend) actions.onSend(ask.resp, u.dept);
    if (u.ui === "export" && actions.onExport) actions.onExport(ask.resp);
    if (u.ui === "visits" && actions.onVisits) actions.onVisits(ask.resp);
  }, [ask.uiCue?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (q?: string) => {
    const t = (q ?? text).trim();
    if (!t) return;
    setText("");
    setRecall(-1);
    await ask.ask(t);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    else if (e.key === "ArrowUp" && ask.history.length) {
      e.preventDefault();
      const i = recall < 0 ? ask.history.length - 1 : Math.max(0, recall - 1);
      setRecall(i);
      setText(ask.history[i]);
    } else if (e.key === "ArrowDown" && listRef.current) {
      e.preventDefault();
      listRef.current.querySelector<HTMLElement>(".amp-row")?.focus();
    }
  };
  const mic = () => {
    if (listening) { listening(); setListening(null); return; }
    const stop = listen(/[஀-௿]/.test(text) || lang === "ta" ? "ta-IN" : "en-IN", (t) => setText(t), (t) => { setListening(null); if (t) submit(t); }, () => setListening(null));
    setListening(() => stop);
  };
  const chip = (c: PlanChip, option: string | null) => {
    setMenu(null);
    if (!ask.plan) return;
    const p = applyChip(ask.plan, c.id, option);
    if (p) ask.run(p);
  };
  const altChip = (c: PlanChip, key: string) => {
    setMenu(null);
    if (!ask.plan) return;
    const p = applyChip(ask.plan, c.id, key);
    if (p) ask.run(p);
  };

  return (
    <aside className={`amp${typeof window !== "undefined" && window.innerWidth < 768 ? " sheet" : ""}`} data-h={sheet} aria-label={w.title}>
      <button className="amp-grab" aria-label="Resize the panel" onClick={() => setSheet((s) => (s === "peek" ? "half" : s === "half" ? "full" : "peek"))} />
      <div className="amp-h">
        <h3><I n="map" />{w.title}</h3>
        {r && <button className="amp-x" onClick={() => { ask.clear(); input.current?.focus(); }} title={lang === "ta" ? "கேள்வியை அழி" : "Clear the question and the map"}><I n="x" />{lang === "ta" ? "அழி" : "Clear"}</button>}
        <button className="amp-x" onClick={actions.onBack} title={`${w.back} (Esc)`}><I n="chevl" />{w.back}</button>
      </div>
      <div className="amp-ask">
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder={w.placeholder} aria-label={w.title} maxLength={400} />
        {canListen() && <button className={listening ? "rec" : ""} onClick={mic} title={w.mic} aria-label={w.mic} aria-pressed={!!listening}><I n={listening ? "stop" : "mic"} /></button>}
        <button className="go" onClick={() => submit()} title={w.ask} aria-label={w.ask} disabled={ask.busy}><I n="send" /></button>
      </div>
      <div className="amp-b">
        {ask.busy && <div className="amp-busy" role="progressbar" aria-label="Working" />}
        {ask.error && <div className="amp-err" role="alert">{ask.error}</div>}
        {!r && <Empty w={w} suggestions={actions.suggestions} onPick={submit} />}
        {r?.kind === "say" && r.say && (
          <div className="amp-say" role="status">
            {lang === "ta" ? r.say.ta : r.say.en}
            {r.say.chips.length > 0 && <div className="amp-sug" style={{ marginTop: 8 }}>{r.say.chips.map((c) => <button key={c} onClick={() => submit(c)}>{c}</button>)}</div>}
          </div>
        )}
        {r?.kind === "answer" && r.answer && (
          <>
            <div className="amp-chips" role="group" aria-label="The question, part by part">
              {r.chips.map((c) => (
                <span key={c.id} className={`amp-chip${c.isDefault ? " def" : ""}`}>
                  <button style={{ all: "unset", display: "inline-flex", alignItems: "center", gap: 3, cursor: c.options.length ? "pointer" : "default", minWidth: 0 }}
                    onClick={() => c.options.length && setMenu(menu === c.id ? null : c.id)} aria-haspopup={c.options.length ? "menu" : undefined} aria-expanded={menu === c.id}
                    title={c.isDefault ? `${lang === "ta" ? c.ta : c.en} (${w.default}: not in the question)` : lang === "ta" ? c.ta : c.en}>
                    <span>{lang === "ta" ? c.ta : c.en}</span>{c.isDefault && <em>{w.default}</em>}{c.options.length > 0 && <I n="chevd" />}
                  </button>
                  {c.removable && <span className="rm" role="button" tabIndex={0} aria-label={`${w.remove} ${c.en}`} onClick={() => chip(c, null)} onKeyDown={(e) => e.key === "Enter" && chip(c, null)}><I n="x" /></span>}
                  {menu === c.id && (
                    <div className="amp-menu" role="menu">
                      {c.options.map((o) => (
                        <button key={o.key} role="menuitemradio" aria-checked={o.on} className={o.on ? "on" : ""} onClick={() => (c.part === "place" ? altChip(c, o.key) : chip(c, o.key))}>
                          {o.on && <I n="check" />}{lang === "ta" ? o.ta : o.en}
                        </button>
                      ))}
                    </div>
                  )}
                </span>
              ))}
            </div>
            <Answer r={r} w={w} lang={lang} ask={ask} onDept={(code, ids) => ask.setSpot({ ids, label: r.answer!.depts.find((d) => d.code === code)?.name ?? code })} />
            <Analyst r={r} lang={lang} onSend={actions.role === "collector" && actions.onSend ? (dept) => actions.onSend!(r, dept) : undefined} />
            <Insights r={r} lang={lang} ask={ask} onSend={actions.role === "collector" && actions.onSend ? () => actions.onSend!(r, null) : undefined} onAsk={submit} />
            <Extras r={r} w={w} ask={ask} tour={tour} setTour={setTour} lang={lang} />
            <Trace r={r} w={w} lang={lang} ask={ask} on={traceOn} setOn={setTraceOn} />
            <List r={r} w={w} lang={lang} ask={ask} actions={actions} listRef={listRef} />
          </>
        )}
        {r?.kind === "brief" && r.brief && <BriefView r={r} w={w} lang={lang} ask={ask} actions={actions} />}
      </div>
      {r?.kind === "answer" && r.answer && (
        <div className="amp-acts">
          {actions.role === "collector" && actions.onSend && (
            <button className="pri" onClick={() => actions.onSend!(r, null)} disabled={!r.total}><I n="send" />{w.send}</button>
          )}
          {actions.role === "officer" && actions.onVisits && <button className="pri" onClick={() => actions.onVisits!(r)} disabled={!r.total}><I n="flow" />{w.visits}</button>}
          {actions.onExport && <button onClick={() => actions.onExport!(r)} disabled={!r.total}><I n="download" />{w.export}</button>}
          {actions.onSave && <button onClick={() => actions.onSave!(r)}><I n="bookmark" />{w.save}</button>}
        </div>
      )}
    </aside>
  );
}

function Empty({ w, suggestions, onPick }: { w: Words; suggestions: string[]; onPick: (q: string) => void }) {
  return (
    <div className="amp-empty">
      <p style={{ margin: "2px 0 8px", color: "var(--text-2)" }}>{w.empty}</p>
      {suggestions.length > 0 && <h4>{w.suggest}</h4>}
      <div className="amp-sug">{suggestions.map((s) => <button key={s} onClick={() => onPick(s)}>{s}</button>)}</div>
      <ul className="amp-sell">{SELLING.map(([a, b]) => <li key={a}><b>{a}</b> {b}</li>)}</ul>
    </div>
  );
}

function Answer({ r, w, lang, ask, onDept }: { r: AskResponse; w: Words; lang: "en" | "ta"; ask: MapAsk; onDept: (code: string, ids: string[]) => void }) {
  const a = r.answer!;
  const ready = lang === "ta" ? "வரைபட அடுக்கு தயார்" : "map layer ready";
  const [head, tail] = a.headline.includes(` · ${ready}`) ? [a.headline.split(` · ${ready}`)[0], ready] : [a.headline, null];
  const deptIds = (code: string) => r.rows.filter((x) => x.dept === code).map((x) => x.id);
  const layers = r.asOf.layers.filter((l) => l.id !== "incidents");
  return (
    <div className="amp-card">
      <p className="amp-head" aria-live="polite">
        <button onClick={() => ask.setSpot(null)} title={w.clear}>{head}</button>{tail && <> · <span className="rd">{tail}</span></>}
      </p>
      {a.meaning && <p className="amp-mean">{a.meaning}</p>}
      {a.depts.length > 0 && (
        <div className="amp-depts" aria-label={w.depts}>
          {a.depts.slice(0, 4).map((d) => <button key={d.code} onClick={() => onDept(d.code, deptIds(d.code))} title={`${d.name}: ${d.n}`}>{d.name}<b>{d.n.toLocaleString("en-IN")}</b></button>)}
        </div>
      )}
      {r.unplaced.length > 0 && <div className="amp-asof">{w.unplaced(r.unplaced.length)}</div>}
      <div className="amp-asof">
        {w.asOf}: {lang === "ta" ? "சம்பவங்கள்" : "Incidents"} {fmtWhen(r.asOf.data || r.asOf.now)}
        {layers.map((l) => ` · ${lang === "ta" ? l.ta : l.en}: ${l.source}${l.as_of ? `, ${fmtDay(l.as_of)}` : ""}`).join("")}
      </div>
      {ask.spot && <div className="amp-asof" style={{ color: "var(--accent-2)", fontWeight: 600 }}>{w.showing(ask.spot.label)} · <button style={{ all: "unset", cursor: "pointer", textDecoration: "underline" }} onClick={() => ask.setSpot(null)}>{w.clear}</button></div>}
    </div>
  );
}

const TONE_ICON = { alert: "alert", warn: "bolt", info: "info", good: "checkc" } as const;
/** Findings the map computed about this answer; a click shows exactly their rows on the map. */
function Insights({ r, lang, ask, onSend, onAsk }: { r: AskResponse; lang: "en" | "ta"; ask: MapAsk; onSend?: () => void; onAsk: (q: string) => void }) {
  if (!r.insights?.length) return null;
  return (
    <div className="amp-ins" aria-label={lang === "ta" ? "கண்டறிதல்கள்" : "Insights"}>
      <div className="amp-sec" style={{ cursor: "default" }}><I n="spark" />{lang === "ta" ? "வரைபடம் கண்டவை" : "What the map found"}<span className="n">{r.insights.length}</span></div>
      {r.insights.map((i) => {
        const on = ask.spot?.label === i.en || ask.spot?.label === i.ta;
        return (
          <div key={i.id} className={`amp-insight t-${i.tone}${on ? " on" : ""}`}>
            <button className="amp-insight-b" disabled={!i.ids.length} onClick={() => (on ? ask.setSpot(null) : ask.setSpot({ ids: i.ids, label: lang === "ta" ? i.ta : i.en }))}
              title={i.ids.length ? (lang === "ta" ? "இவற்றை வரைபடத்தில் காட்டு" : "Show these on the map") : undefined}>
              <I n={TONE_ICON[i.tone]} /><span>{lang === "ta" ? i.ta : i.en}</span>
            </button>
            {i.next && (i.next.ask || (i.kind === "overdue" && onSend)) && (
              <button className="amp-insight-n" onClick={() => (i.next!.ask ? onAsk(i.next!.ask) : onSend?.())}>{lang === "ta" ? i.next.ta : i.next.en}<I n="chevr" /></button>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface AnalystOut { summary: string; actions: { text: string; dept: string | null }[]; watch: string | null; model: string; dropped: number }
/** The AI analyst's reading, after the answer is drawn: what it means, up to three actions with owners, what to watch. */
function Analyst({ r, lang, onSend }: { r: AskResponse; lang: "en" | "ta"; onSend?: (dept: string) => void }) {
  const [state, setState] = useState<{ plan: string; out: AnalystOut | null; busy: boolean } | null>(null);
  const key = JSON.stringify(r.plan);
  useEffect(() => {
    if (!r.plan || !r.total) { setState(null); return; }
    const ac = new AbortController();
    setState({ plan: key, out: null, busy: true });
    fetch("/api/map/insight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: r.plan }), signal: ac.signal })
      .then((x) => (x.ok ? x.json() : null)).then((j) => setState({ plan: key, out: j && !j.none ? j : null, busy: false }))
      .catch(() => { if (!ac.signal.aborted) setState({ plan: key, out: null, busy: false }); });
    return () => ac.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state || state.plan !== key || (!state.busy && !state.out)) return null;
  const deptName = (c: string) => r.answer?.depts.find((d) => d.code === c)?.name ?? c;
  return (
    <div className="amp-ai" aria-live="polite">
      <div className="amp-ai-h"><I n="ai" />{lang === "ta" ? "AI பகுப்பாய்வாளர்" : "AI analyst"}{state.busy && <span className="amp-ai-dots" aria-label="reading"><i /><i /><i /></span>}</div>
      {state.busy && <div className="amp-ai-sk"><i /><i /><i style={{ width: "62%" }} /></div>}
      {state.out && (
        <>
          <p>{state.out.summary}</p>
          {state.out.actions.length > 0 && (
            <ol className="amp-ai-acts">{state.out.actions.map((a, k) => (
              <li key={k}><span>{a.text}</span>
                {a.dept && <em>{deptName(a.dept)}</em>}
                {a.dept && onSend && <button onClick={() => onSend(a.dept!)} title={`Draft an email to ${deptName(a.dept)}`}><I n="send" /></button>}
              </li>))}
            </ol>
          )}
          {state.out.watch && <p className="amp-ai-w"><I n="clock" />{state.out.watch}</p>}
          <small>{lang === "ta" ? "ஒவ்வொரு எண்ணும் வரைபடத்தின் கணக்குடன் சரிபார்க்கப்பட்டது" : "Every number checked against the map's own figures"} · {state.out.model}</small>
        </>
      )}
    </div>
  );
}

function Extras({ r, w, ask, tour, setTour, lang }:{ r: AskResponse; w: Words; ask: MapAsk; tour: number; setTour: (n: number) => void; lang: "en" | "ta" }) {
  const shape = r.camera.shape;
  if (shape === "hotspot" && r.camera.tour.length) {
    return (
      <div className="amp-tour" role="group" aria-label={w.tour}>
        <button onClick={() => { setTour(0); ask.replay(0); }}>{w.backTo}</button>
        {r.camera.tour.slice(0, 3).map((t, i) => (
          <button key={t.id} className={tour === i + 1 ? "on" : ""} onClick={() => { setTour(i + 1); ask.replay(i + 1); ask.setSpot({ ids: r.extra.clusters?.[i]?.ids ?? [], label: lang === "ta" ? t.caption_ta : t.caption_en }); }}>
            {lang === "ta" ? t.caption_ta : t.caption_en}
          </button>
        ))}
      </div>
    );
  }
  if (shape === "along" && r.camera.line) return <div className="amp-tour"><button onClick={() => ask.replay(1)}><I n="play" /> {w.follow}</button><button onClick={() => ask.replay(0)}>{w.backTo}</button></div>;
  if (r.extra.change) {
    return (
      <div className="amp-tour" role="group" aria-label={`${w.before} / ${w.now}`}>
        <button className={ask.showBefore ? "on" : ""} onClick={() => ask.setShowBefore(true)}>{w.before} · {r.extra.change.before.length}</button>
        <button className={!ask.showBefore ? "on" : ""} onClick={() => ask.setShowBefore(false)}>{w.now} · {r.extra.change.now.length}</button>
      </div>
    );
  }
  return null;
}

function Trace({ r, w, lang, ask, on, setOn }: { r: AskResponse; w: Words; lang: "en" | "ta"; ask: MapAsk; on: string | null; setOn: (s: string | null) => void }) {
  return (
    <div>
      <button className={`amp-sec${ask.traceOpen ? " open" : ""}`} onClick={() => ask.setTraceOpen(!ask.traceOpen)} aria-expanded={ask.traceOpen}>
        <I n="chevr" />{w.how}<span className="n">{r.trace.length}</span>
      </button>
      {ask.traceOpen && (
        <ol className="amp-trace">
          {r.trace.map((s, i) => (
            <li key={s.as + i}>
              <button className={on === s.as ? "on" : ""} onClick={() => {
                // a step's own rows on the map (facilities have no incident ids: the step frames the answer instead)
                const ids = s.layer === "incidents" ? s.ids : [];
                setOn(on === s.as ? null : s.as);
                if (on === s.as || !ids.length) { ask.setSpot(null); ask.replay(0); } else ask.setSpot({ ids, label: lang === "ta" ? s.note_ta : s.note_en });
              }}>
                <i>{i + 1}</i><span>{lang === "ta" ? s.note_ta : s.note_en}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function List({ r, w, lang, ask, actions, listRef }: { r: AskResponse; w: Words; lang: "en" | "ta"; ask: MapAsk; actions: PanelActions; listRef: React.RefObject<HTMLUListElement> }) {
  const rows = useMemo(() => (ask.spot ? r.rows.filter((x) => ask.spot!.ids.includes(x.id)) : r.rows), [r, ask.spot]);
  if (!r.total) return null;
  const more = (ask.spot ? ask.spot.ids.length : r.total) - rows.length;
  const nowMs = Date.parse((r.asOf.now || "").replace(" ", "T") + "Z");
  const onRowKey = (e: React.KeyboardEvent<HTMLLIElement>, id: string) => {
    const li = e.currentTarget;
    if (e.key === "ArrowDown") { e.preventDefault(); (li.nextElementSibling as HTMLElement | null)?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); (li.previousElementSibling as HTMLElement | null)?.focus(); }
    if (e.key === "Enter") { e.preventDefault(); if (ask.focus === id) actions.onOpen(id); else ask.setFocus(id); }
  };
  return (
    <div>
      <div className="amp-sec" style={{ cursor: "default" }}>{w.list}<span className="n">{(ask.spot ? ask.spot.ids.length : r.total).toLocaleString("en-IN")}</span></div>
      <ul className="amp-list" ref={listRef} aria-label={w.list}>
        {rows.map((x) => {
          const age = Math.max(0, Math.round((nowMs - Date.parse(x.first.replace(" ", "T") + "Z")) / 86_400_000));
          return (
            <li key={x.id} className={`amp-row${ask.focus === x.id ? " on" : ""}`} tabIndex={0} onKeyDown={(e) => onRowKey(e, x.id)}
              onMouseEnter={() => ask.setHover(x.id)} onMouseLeave={() => ask.setHover(null)} onFocus={() => ask.setHover(x.id)} onBlur={() => ask.setHover(null)}
              onClick={() => (ask.focus === x.id ? actions.onOpen(x.id) : ask.setFocus(x.id))}
              aria-label={`${x.title}, ${x.sev}, ${x.status}`}>
              <span className="dot" style={{ background: SEV_HEX[x.sev] ?? "#8BA0B5" }} />
              <div style={{ minWidth: 0 }}>
                <div className="t">{x.title}</div>
                <div className="s">
                  {x.sev} · {x.status}{x.overdue ? ` · ${w.overdue}` : ""} · {x.ward ? `${lang === "ta" ? "வார்டு" : "Ward"} ${x.ward}` : ""}{x.zoneName ? `, ${x.zoneName}` : ""}
                  {!x.pinnable && ` · ${w.noPlace}`}
                </div>
                <div className="s">
                  {x.near && <span className="nr">{fmtDistance(x.near.m, lang)} {lang === "ta" ? `${x.near.name ?? LAYER_WORD[x.near.layer].ta_one} ${w.from}`
                    : `from ${x.near.name ?? `a ${LAYER_WORD[x.near.layer].one}`}`} · </span>}
                  {age === 0 ? (lang === "ta" ? "இன்று" : "today") : lang === "ta" ? `${age} நாள் முன்` : `${age} d ago`} · {x.deptName}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {more > 0 && <div className="amp-more">{w.more(more)} · {actions.onExport ? <button onClick={() => actions.onExport!(r)}>{w.exportAll}</button> : null}</div>}
    </div>
  );
}

function BriefView({ r, w, lang, ask, actions }: { r: AskResponse; w: Words; lang: "en" | "ta"; ask: MapAsk; actions: PanelActions }) {
  const b = r.brief!;
  const show = (ids: string[], label: string) => ask.setSpot({ ids, label });
  const num = (n: number, ids: string[], label: string) => <button onClick={() => show(ids, label)} disabled={!n}>{n.toLocaleString("en-IN")}</button>;
  return (
    <div className="amp-card amp-brief">
      <p className="amp-head" aria-live="polite">{w.brief}: {lang === "ta" ? b.label.ta : b.label.en}</p>
      <dl style={{ marginTop: 6 }}>
        <dt>{w.open}</dt><dd>{num(b.open.n, b.open.ids, w.open)}</dd>
        <dt>{w.citizen}</dt><dd>{num(b.citizen.n, b.citizen.ids, w.citizen)}</dd>
      </dl>
      {b.byType.length > 0 && <><h5>{w.byType}</h5><dl>{b.byType.slice(0, 8).map((t) => <FragmentRow key={t.cat} label={lang === "ta" ? t.ta : t.en} n={num(t.n, t.ids, lang === "ta" ? t.ta : t.en)} />)}</dl></>}
      {b.worst.length > 0 && <><h5>{w.worst}</h5>
        <ul className="amp-list">{b.worst.map((x) => (
          <li key={x.id} className="amp-row" tabIndex={0} onClick={() => actions.onOpen(x.id)} onKeyDown={(e) => e.key === "Enter" && actions.onOpen(x.id)}>
            <span className="dot" style={{ background: SEV_HEX[x.sev] ?? "#8BA0B5" }} />
            <div><div className="t">{x.title}</div><div className="s">{x.sev} · {x.dept}{x.reasons ? ` · ${x.reasons}` : ""}</div></div>
          </li>))}
        </ul></>}
      {b.depts.length > 0 && <><h5>{w.deptsH}</h5><dl>{b.depts.slice(0, 8).map((d) => (
        <FragmentRow key={d.code} label={d.name} n={<>{num(d.open, d.ids, d.name)}{d.overdue > 0 && <> · <button onClick={() => show(d.overdueIds, `${d.name}: ${w.overdue}`)}>{d.overdue} {w.overdue}</button></>}</>} />))}
      </dl></>}
      <h5>{w.change}</h5>
      <p style={{ margin: 0 }}>{lang === "ta" ? b.change.ta : b.change.en}</p>
      <h5>{w.facilities}</h5>
      <dl>{b.facilities.filter((f) => f.n > 0).map((f) => <FragmentRow key={f.layer} label={lang === "ta" ? f.ta : f.en}
        n={<span title={f.items.map((x) => `${x.name ?? ""}${x.inside ? "" : ` (${fmtDistance(x.m)})`}`).join(", ")}>{f.n}</span>} />)}</dl>
      {b.unplaced.n > 0 && <div className="amp-asof">{w.unplaced(b.unplaced.n)}</div>}
      <div className="amp-asof">{lang === "ta" ? b.rule_ta : b.rule_en}</div>
    </div>
  );
}
function FragmentRow({ label, n }: { label: string; n: React.ReactNode }) {
  return <><dt>{label}</dt><dd>{n}</dd></>;
}

const fmtWhen = (s: string) => {
  const d = new Date(s.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? s : `${d.getUTCDate()} ${d.toLocaleString("en-IN", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const fmtDay = (s: string) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? s : `built ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`; };
