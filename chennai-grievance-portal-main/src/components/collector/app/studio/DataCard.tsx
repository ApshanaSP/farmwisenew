"use client";

/**
 * The data card: what a Collector needs to trust a dataset before acting on it. Where it came from and its terms,
 * what was read, left out and used, what the Data Detective fixed, how much is on the map, its dates and freshness,
 * its family (confirm or correct it in one click), who read it, the checks it passed, its Live Connector, and the
 * change log of every refresh.
 */
import { useState } from "react";
import type { DataCard as Card } from "@/lib/studio/datacard";
import type { Console } from "../CollectorApp";
import { I, type IconName } from "../icons";
import { api } from "./client";
import { LangSwitch, day, useLang } from "./Outcome";

const FAMILIES: [string, string, string][] = [
  ["progress", "Scheme / project progress", "திட்ட முன்னேற்றம்"], ["works", "Works register", "பணிகள் பதிவேடு"], ["service", "Service delivery / grievances", "சேவை / குறைகள்"],
  ["health", "Health surveillance", "சுகாதாரக் கண்காணிப்பு"], ["supplies", "Supplies / stock", "பொருள் இருப்பு"], ["water", "Water and weather", "நீர் மற்றும் வானிலை"],
  ["facility", "Facility list", "வசதிகள் பட்டியல்"], ["period", "Period table (district × year)", "காலவாரி அட்டவணை"]
];
const T = {
  en: { source: "Source", rows: "Rows", fixes: "What the Data Detective did", places: "Places", dates: "Dates", family: "What kind of data", reading: "Who read it", checks: "Checks passed", live: "Live Connector", changes: "Change log",
    read: "read", left: "left out", used: "used", onMap: "of rows on the map", notMatched: "Not matched", none: "Nothing to fix", noChanges: "No refresh yet.", confirm: "Is this right?", yes: "Yes", change: "Change", ai: "An AI model", rules: "The rules", old: "days old", qs: "The questions it answers" },
  ta: { source: "மூலம்", rows: "வரிசைகள்", fixes: "தரவு துப்பறிவாளர் செய்தவை", places: "இடங்கள்", dates: "தேதிகள்", family: "எந்த வகைத் தரவு", reading: "யார் படித்தது", checks: "தேறிய சோதனைகள்", live: "நேரடி இணைப்பு", changes: "மாற்றப் பதிவு",
    read: "படித்தவை", left: "விலக்கியவை", used: "பயன்பட்டவை", onMap: "வரிசைகள் வரைபடத்தில்", notMatched: "பொருந்தாதவை", none: "சரிசெய்ய எதுவும் இல்லை", noChanges: "இன்னும் புதுப்பிப்பு இல்லை.", confirm: "இது சரியா?", yes: "ஆம்", change: "மாற்று", ai: "AI மாதிரி", rules: "விதிகள்", old: "நாட்கள் பழையது", qs: "இது பதில் தரும் கேள்விகள்" }
};
const CHANGE_IC: Record<string, IconName> = { refresh: "refresh", failed: "alert", same: "check", columns: "table", jump: "up", quarantine: "shield", approved: "checkc", rejected: "x", late: "clock", watch: "bell", created: "plus", paused: "stop" };
const n = (x: number) => x.toLocaleString("en-IN");
const when = (iso: string | null) => { if (!iso) return "—"; const d = new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString(); return `${day(d.slice(0, 10))}, ${d.slice(11, 16)} IST`; };

export default function DataCardTab({ id, card, fam, c, onChanged }: { id: string; card: Card; fam: { key: string; name: string; confidence: number; by: string; confirm: boolean; questions: string[] } | null; c: Console; onChanged: () => void }) {
  const [lang, setLang] = useLang();
  const t = T[lang];
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const setFamily = async (key: string) => {
    setBusy(true);
    try { await api(`/api/collector/studio/${id}`, { json: { action: "family", family: key } }); c.toast("Family set: the brief is ranked by it."); setPicking(false); onChanged(); }
    catch (e) { c.toast((e as Error).message, "alert"); }
    setBusy(false);
  };
  return (
    <div className="ds-card-w">
      <div className="ds-card-top"><LangSwitch lang={lang} setLang={setLang} /></div>
      <div className="ds-card-g">
        <section className="ds-card-s">
          <h3 lang={lang}><I n="ext" />{t.source}</h3>
          <p><b>{card.source.how}</b></p>
          {card.source.url && <p className="ds-card-url" title={card.source.url}>{card.source.url}</p>}
          <p>Fetched {when(card.source.fetchedAt)}</p>
          <p className="ds-muted">{card.source.terms}</p>
        </section>
        <section className="ds-card-s">
          <h3 lang={lang}><I n="table" />{t.rows}</h3>
          <div className="ds-card-flow">
            <span><b>{n(card.rows.read)}</b><small lang={lang}>{t.read}</small></span><I n="right" />
            <span><b>{n(card.rows.read - card.rows.used)}</b><small lang={lang}>{t.left}</small></span><I n="right" />
            <span><b>{n(card.rows.used)}</b><small lang={lang}>{t.used}</small></span>
          </div>
          {card.rows.removed.length > 0 && <ul className="ds-card-l">{card.rows.removed.map((r, i) => <li key={i}>{r.why}: {n(r.n)}</li>)}</ul>}
        </section>
        <section className="ds-card-s">
          <h3 lang={lang}><I n="shield" />{t.fixes}</h3>
          {card.fixes.length ? <ul className="ds-card-l">{card.fixes.map((f, i) => <li key={i}><em>{f.action}</em> {f.what}: {n(f.n)}</li>)}</ul> : <p className="ds-muted" lang={lang}>{t.none}</p>}
        </section>
        <section className="ds-card-s">
          <h3 lang={lang}><I n="pin" />{t.places}</h3>
          {card.places.share != null ? <p><b>{card.places.share}%</b> <span lang={lang}>{t.onMap}</span></p> : <p className="ds-muted">No place column.</p>}
          {card.places.unmatched.length > 0 && <p className="ds-muted"><span lang={lang}>{t.notMatched}</span>: {card.places.unmatched.slice(0, 6).map((u) => `${u.v} (${u.n})`).join(", ")}</p>}
        </section>
        <section className="ds-card-s">
          <h3 lang={lang}><I n="cal" />{t.dates}</h3>
          <p>{card.dates.from ? `${day(card.dates.from)} → ${day(card.dates.to)}` : "No dates"}</p>
          {card.dates.ageDays != null && <p className={card.dates.ageDays > 30 ? "ds-card-warn" : "ds-muted"}>{n(card.dates.ageDays)} <span lang={lang}>{t.old}</span></p>}
        </section>
        <section className="ds-card-s">
          <h3 lang={lang}><I n="layers" />{t.family}</h3>
          {fam && <p><b>{lang === "ta" ? FAMILIES.find((f) => f[0] === fam.key)?.[2] ?? fam.name : fam.name}</b> <span className="ds-muted">· {fam.by === "you" ? "set by you" : `${Math.round(fam.confidence * 100)}% sure`}</span></p>}
          {fam?.confirm && !picking && <div className="ds-out-acts"><span lang={lang}>{t.confirm}</span><button className="ds-btn sm" disabled={busy} onClick={() => setFamily(fam.key)}>{t.yes}</button><button className="ds-ghost" onClick={() => setPicking(true)}>{t.change}</button></div>}
          {!fam?.confirm && !picking && <button className="ds-lnk" onClick={() => setPicking(true)}><span lang={lang}>{t.change}</span></button>}
          {picking && <div className="ds-card-fams" role="group" aria-label={t.family}>{FAMILIES.map(([k, en, ta]) => <button key={k} className={k === fam?.key ? "ds-btn sm" : "ds-ghost"} disabled={busy} onClick={() => setFamily(k)} lang={lang}>{lang === "ta" ? ta : en}</button>)}</div>}
          {fam && <><small className="ds-muted" lang={lang}>{t.qs}</small><ul className="ds-card-l">{fam.questions.map((q) => <li key={q}>{q}</li>)}</ul></>}
        </section>
        <section className="ds-card-s">
          <h3 lang={lang}><I n="spark" />{t.reading}</h3>
          <p><b lang={lang}>{card.reading.by === "ai" ? t.ai : t.rules}</b>{card.reading.model ? ` · ${card.reading.model}` : ""}</p>
          <p className="ds-muted">Every number is computed from the rows by code; the AI only reads columns, chooses and explains.</p>
        </section>
        <section className="ds-card-s">
          <h3 lang={lang}><I n="checkc" />{t.checks}</h3>
          <ul className="ds-card-checks">{card.checks.map((k) => <li key={k.label} className={k.ok ? "ok" : "bad"}><I n={k.ok ? "check" : "alert"} /><span><b>{k.label}</b> · {k.detail}</span></li>)}</ul>
        </section>
        {card.connector && (
          <section className="ds-card-s">
            <h3 lang={lang}><I n="refresh" />{t.live}</h3>
            <p><span className={`ds-health h-${card.connector.status}`}>{card.connector.status}</span> {card.connector.every} at {card.connector.at} IST · {card.connector.mode}</p>
            <p className="ds-muted">Last success {when(card.connector.lastOkAt)}</p>
          </section>
        )}
      </div>
      <section className="ds-card-s wide">
        <h3 lang={lang}><I n="clock" />{t.changes}</h3>
        {card.changes.length ? (
          <ol className="ds-conn-hist">{card.changes.map((x, i) => <li key={i} className={x.ok ? "" : "bad"}><time>{when(x.at)}</time><span><I n={CHANGE_IC[x.kind] ?? "info"} /> {x.text}</span></li>)}</ol>
        ) : <p className="ds-muted" lang={lang}>{t.noChanges}</p>}
      </section>
    </div>
  );
}
