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
import type { MapAsk, Turn } from "./useMapAsk";

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
  // the plan's parts fold into one line; opened, each part is a chip that can be changed
  const [filtersOpen, setFiltersOpen] = useState(false);
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
    const o = c.options.find((x) => x.key === option);
    if (p) ask.run(p, option == null ? `${lang === "ta" ? "நீக்கு" : "Remove"}: ${lang === "ta" ? c.ta : c.en}` : `${lang === "ta" ? o?.ta ?? option : o?.en ?? option}`);
  };
  const altChip = (c: PlanChip, key: string) => {
    setMenu(null);
    if (!ask.plan) return;
    const p = applyChip(ask.plan, c.id, key);
    const o = c.options.find((x) => x.key === key);
    if (p) ask.run(p, lang === "ta" ? o?.ta ?? key : o?.en ?? key);
  };
  // each new answer: scroll so its question sits at the top of the panel, the earlier ones above it
  const body = useRef<HTMLDivElement>(null);
  const qRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const b = body.current, q = qRef.current;
    if (b && q) b.scrollTop = Math.max(0, q.offsetTop - b.offsetTop - 6);
  }, [r]);
  const cur = ask.turns.find((t) => t.resp === r) ?? null;

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
      <div className="amp-b" ref={body}>
        {ask.busy && <div className="amp-busy" role="progressbar" aria-label="Working" />}
        <Thread ask={ask} cur={cur} lang={lang} />
        {cur && <div className="amp-q" ref={qRef}><span>{cur.q}</span></div>}
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
            <FilterLine r={r} lang={lang} open={filtersOpen} onToggle={() => setFiltersOpen((v) => !v)} />
            {filtersOpen && <div className="amp-chips" role="group" aria-label="The question, part by part">
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
            </div>}
            <Answer r={r} w={w} lang={lang} ask={ask} />
            <NextAsks r={r} lang={lang} onAsk={submit} busy={ask.busy} />
            <Extras r={r} w={w} ask={ask} tour={tour} setTour={setTour} lang={lang} />
            <Trace r={r} w={w} lang={lang} ask={ask} on={traceOn} setOn={setTraceOn} />
            <List r={r} w={w} lang={lang} ask={ask} actions={actions} listRef={listRef} />
            <Places r={r} lang={lang} />
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

/** The answer in a few words, for the thread: "160 open flooding incidents · last 7 days". */
function gist(r: AskResponse, lang: "en" | "ta"): string {
  if (r.answer) { const { big, rest } = splitHead(r.answer.headline); return big ? `${big} ${rest}` : rest; }
  if (r.brief) return `${lang === "ta" ? "இங்கே என்ன நடக்கிறது" : "What is happening"}: ${lang === "ta" ? r.brief.label.ta : r.brief.label.en}`;
  if (r.say) return lang === "ta" ? r.say.ta : r.say.en;
  return "";
}

/** The conversation so far, as a chat: each earlier question and the gist of its answer. A click shows that answer again. */
function Thread({ ask, cur, lang }: { ask: MapAsk; cur: Turn | null; lang: "en" | "ta" }) {
  const past = ask.turns.filter((t) => t !== cur);
  if (!past.length) return null;
  return (
    <ol className="amp-thread" aria-label={lang === "ta" ? "முந்தைய கேள்விகள்" : "Earlier questions"}>
      {past.map((t) => (
        <li key={t.id}>
          <button onClick={() => ask.restore(t.id)} title={lang === "ta" ? "இந்தப் பதிலை மீண்டும் காட்டு" : "Show this answer again"}>
            <span className="q">{t.q}</span>
            <span className="a">{gist(t.resp, lang)}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** What to ask next, from what this answer is: each is a follow-up the router reads against this answer. */
function NextAsks({ r, lang, onAsk, busy }: { r: AskResponse; lang: "en" | "ta"; onAsk: (q: string) => void; busy: boolean }) {
  const ta = lang === "ta";
  const plan = r.plan;
  if (!plan) return null;
  const take = plan.steps.find((s) => s.op === "take" && s.layer === "incidents");
  const f = take?.op === "take" ? take.filter : null;
  const last = plan.steps.find((s) => s.as === plan.show);
  const out: [string, string][] = [];
  if (take && r.total > 0) {
    if (r.glance?.overdue.n && !f?.overdue) out.push(["Show the overdue ones", "காலக்கெடு தாண்டியவை"]);
    if (!f?.severity) out.push(["Only severe", "கடுமையானவை மட்டும்"]);
    if (last?.op !== "count_by" && last?.op !== "compare" && last?.op !== "hotspot") out.push(["Which zone has the most?", "மண்டல வாரியாக"]);
    if ((r.answer?.depts.length ?? 0) > 1) out.push(["Which department has the most?", "எந்த துறை அதிகம்?"]);
    const days = f?.period?.kind === "last_days" ? f.period.days : null;
    out.push(days === 7 ? ["This month", "இந்த மாதம்"] : ["Last 7 days", "கடந்த 7 நாட்கள்"]);
    if (!plan.steps.some((s) => s.op === "within")) out.push(["Near schools", "பள்ளிகள் அருகே"]);
  } else if (take && f?.period?.kind === "last_days" && f.period.days < 30) out.push(["This month", "இந்த மாதம்"]);
  else if (!take && r.context.points.length) {
    const layer = r.context.points[0].layer;
    const inArea = plan.steps.some((s) => s.op === "inside");
    if (inArea) for (const [l, en, tam] of [["hospitals", "Hospitals there", "அங்கே மருத்துவமனைகள்"], ["schools", "Schools there", "அங்கே பள்ளிகள்"], ["police", "Police stations there", "அங்கே காவல் நிலையங்கள்"]] as const)
      if (l !== layer) out.push([en, tam]);
    out.push(["Open complaints near them", "அவற்றின் அருகே திறந்த புகார்கள்"]);
  }
  if (!out.length) return null;
  return (
    <div className="amp-next" role="group" aria-label={ta ? "அடுத்து கேளுங்கள்" : "Ask next"}>
      <span>{ta ? "அடுத்து" : "Ask next"}</span>
      {out.slice(0, 4).map(([en, tam]) => <button key={en} disabled={busy} onClick={() => onAsk(ta ? tam : en)}>{ta ? tam : en}</button>)}
    </div>
  );
}

/** The plan in one line ("Flooding · Last 7 days · Open"), and a button that opens its parts for changing. */
function FilterLine({ r, lang, open, onToggle }: { r: AskResponse; lang: "en" | "ta"; open: boolean; onToggle: () => void }) {
  const said = r.chips.filter((c) => !c.isDefault);
  // "of Schools (OSM)" reads as "Near schools", or joins the distance said before it ("Within 300 m of schools")
  const parts: string[] = [];
  let prev: PlanChip | null = null;
  for (const c of said.length ? said : r.chips.slice(0, 2)) {
    if (lang !== "ta" && c.part === "facility") {
      const what = c.en.replace(/\s*\((OSM|store)\)$/, "").replace(/^of /, "").toLowerCase();
      if (prev?.part === "distance") parts[parts.length - 1] += ` of ${what}`;
      else parts.push(`Near ${what}`);
    } else parts.push(lang === "ta" ? c.ta : c.en);
    prev = c;
  }
  const line = parts.join(" · ");
  return (
    <div className="amp-fl">
      <span title={line}><I n="sliders" />{line}</span>
      <button onClick={onToggle} aria-expanded={open}>{open ? (lang === "ta" ? "மூடு" : "Done") : (lang === "ta" ? "மாற்று" : "Change")}<I n={open ? "chevd" : "chevr"} /></button>
    </div>
  );
}

const READY = / · (map layer ready|வரைபட அடுக்கு தயார்)\.?$/;
/** "160 open flooding incidents (last 7 days)" -> big "160", then "open flooding incidents · last 7 days" */
function splitHead(h: string): { big: string | null; rest: string } {
  const clean = h.replace(READY, "").replace(/\.$/, "").replace(/ \(([^()]+)\)$/, " · $1");
  const m = clean.match(/^([\d,]+(?:\.\d+)?)\s+(.+)$/);
  return m ? { big: m[1], rest: m[2] } : { big: null, rest: clean };
}

const COND_ICON = { weather: "cloud", rain: "drop", lakes: "drop", works: "cone", hospital: "health", air: "wind" } as const;

function Answer({ r, w, lang, ask }: { r: AskResponse; w: Words; lang: "en" | "ta"; ask: MapAsk }) {
  const a = r.answer!;
  const { big, rest } = splitHead(a.headline);
  const g = r.glance;
  const ta = lang === "ta";
  const layers = r.asOf.layers.filter((l) => l.id !== "incidents");
  const show = (ids: string[], label: string) => (ask.spot?.label === label ? ask.setSpot(null) : ask.setSpot({ ids, label }));
  // the tiles say only what the headline does not: "open" is news only when the answer counts closed ones too
  const tiles = g ? [
    g.open.n !== r.total ? { k: "open", n: g.open.n, ids: g.open.ids, en: "still open", ta: "திறந்தவை", tone: "" } : null,
    { k: "overdue", n: g.overdue.n, ids: g.overdue.ids, en: "past deadline", ta: "காலக்கெடு தாண்டியவை", tone: g.overdue.n ? "t-alert" : "t-good" },
    { k: "severe", n: g.severe.n, ids: g.severe.ids, en: "severe", ta: "கடுமையானவை", tone: g.severe.n ? "t-warn" : "t-good" }
  ].filter((x): x is NonNullable<typeof x> => !!x && x.n > 0) : [];
  return (
    <div className="amp-card">
      <div className="amp-big" aria-live="polite">
        {big && <button className="n" onClick={() => ask.setSpot(null)} title={w.clear}>{big}</button>}
        <p className="amp-head">{rest}</p>
      </div>
      {a.meaning && <p className="amp-mean">{a.meaning}</p>}
      {tiles.length > 0 && r.total > 0 && (
        <div className="amp-tiles">
          {tiles.map((t) => {
            const label = ta ? t.ta : t.en;
            return (
              <button key={t.k} className={`amp-tile ${t.tone}${ask.spot?.label === label ? " on" : ""}`} disabled={!t.n} onClick={() => show(t.ids, label)} title={t.n ? (ta ? "வரைபடத்தில் காட்டு" : "Show these on the map") : undefined}>
                <b>{t.n.toLocaleString("en-IN")}</b><span>{label}</span>
              </button>
            );
          })}
        </div>
      )}
      <Conditions r={r} lang={lang} max={2} />
      <div className="amp-asof" title={layers.map((l) => `${ta ? l.ta : l.en}: ${l.source}${l.as_of ? `, ${fmtDay(l.as_of)}` : ""}`).join("\n") || undefined}>
        {w.asOf} {fmtWhen(r.asOf.data || r.asOf.now)}
        {r.unplaced.length > 0 && ` · ${w.unplaced(r.unplaced.length)}`}
      </div>
      {ask.spot && <div className="amp-asof" style={{ color: "var(--accent-2)", fontWeight: 600 }}>{w.showing(ask.spot.label)} · <button style={{ all: "unset", cursor: "pointer", textDecoration: "underline" }} onClick={() => ask.setSpot(null)}>{w.clear}</button></div>}
    </div>
  );
}

/** "On the ground now": the live readings that bear on the answer, each from a named place and time. */
function Conditions({ r, lang, max = 4 }: { r: AskResponse; lang: "en" | "ta"; max?: number }) {
  if (!r.conditions?.length) return null;
  return (
    <div className="amp-cond">
      <h5><span className="live" />{lang === "ta" ? "இப்போது களத்தில்" : "On the ground now"}</h5>
      <ul>{r.conditions.slice(0, max).map((c) => <li key={c.id} className={`t-${c.tone}`}><I n={COND_ICON[c.kind]} /><span>{lang === "ta" ? c.ta : c.en}</span></li>)}</ul>
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
      {r.news && r.news.articles > 0 && (
        <p className="amp-newsnote"><I n="news" />
          {lang === "ta"
            ? `${r.news.articles} செய்திகள்: ${r.news.pins.length} வரைபடத்தில் (பகுதி பெயருடன்)${r.news.unplaced ? `, ${r.news.unplaced} மாவட்ட/மண்டல அளவில் மட்டும் (எண்ணப்பட்டது, குறிக்கப்படவில்லை)` : ""}.`
            : `${r.news.articles.toLocaleString("en-IN")} news ${r.news.articles === 1 ? "article" : "articles"}: ${r.news.pins.length.toLocaleString("en-IN")} on the map where they name a locality${r.news.unplaced ? `; ${r.news.unplaced.toLocaleString("en-IN")} name only a taluk, zone or the district (counted, not pinned)` : ""}.`}
        </p>
      )}
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
                {x.press?.length > 0 && (
                  <div className="s amp-press">
                    <I n="news" />
                    {x.press.map((p, k) => (
                      <span key={p.id}>{k > 0 && " · "}
                        {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" title={p.title} onClick={(e) => e.stopPropagation()}>{p.outlet}</a> : <span title={p.title}>{p.outlet}</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {more > 0 && <div className="amp-more">{w.more(more)} · {actions.onExport ? <button onClick={() => actions.onExport!(r)}>{w.exportAll}</button> : null}</div>}
    </div>
  );
}

/** "Schools in Valasaravakkam": the places, by name (each is a marker on the map). */
function Places({ r, lang }: { r: AskResponse; lang: "en" | "ta" }) {
  const pts = r.context.points;
  if (r.total || !pts.length || r.rows.length || r.extra.nearest || r.extra.areas) return null;
  const lw = LAYER_WORD[pts[0].layer];
  return (
    <div>
      <div className="amp-sec" style={{ cursor: "default" }}>{lang === "ta" ? lw.ta : lw.en[0].toUpperCase() + lw.en.slice(1)}<span className="n">{pts.length.toLocaleString("en-IN")}</span></div>
      <ul className="amp-list amp-places">
        {pts.map((p) => (
          <li key={p.id} className="amp-row">
            <span className="dot" style={{ background: "#2E7D5B" }} />
            <div style={{ minWidth: 0 }}>
              <div className="t">{(lang === "ta" ? p.name_ta ?? p.name : p.name) ?? (lang === "ta" ? lw.ta_one : `Unnamed ${lw.one}`)}</div>
              {p.government && <div className="s">{lang === "ta" ? "அரசு" : "Government"}</div>}
            </div>
          </li>
        ))}
      </ul>
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
      <Conditions r={r} lang={lang} />
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
