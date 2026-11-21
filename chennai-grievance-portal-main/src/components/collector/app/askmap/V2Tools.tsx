"use client";
/**
 * Ask the Map v2's panel pieces:
 *   PlayPeriod   "Play the period": the answer's incidents by the day first reported (the server's counts, extra.timeline), a bar per day,
 *                Play / Pause, a slider, "that day" or "up to that day"; the map shows only those pins (the panel's spot, as the tiles do)
 *   ScorecardCard the ward scorecard (r.scorecard): the counts, the rank among wards, the change, Print
 *   ShareActs     Copy link (the console opened on the same question) and Print brief (one page, made on the server)
 * Nothing here counts: every number is the server's.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AskResponse } from "@/lib/map/ask";
import { I } from "../icons";
import type { MapAsk } from "./useMapAsk";

const fmt = (n: number) => n.toLocaleString("en-IN");
const dayLabel = (d: string, ta: boolean) => new Date(`${d}T00:00:00Z`).toLocaleDateString(ta ? "ta-IN" : "en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export function PlayPeriod({ r, ask, lang }: { r: AskResponse; ask: MapAsk; lang: "en" | "ta" }) {
  const tl = r.extra.timeline;
  const ta = lang === "ta";
  const [at, setAt] = useState<number | null>(null);
  const [upTo, setUpTo] = useState(true);
  const [playing, setPlaying] = useState(false);
  // v3: how fast the days go by (ms a day)
  const [speed, setSpeed] = useState(700);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const days = tl?.days ?? [];
  const max = Math.max(1, ...days.map((d) => d.n));
  const label = (k: number) => (upTo ? (ta ? `${dayLabel(days[k].day, ta)} வரை` : `Up to ${dayLabel(days[k].day, ta)}`) : dayLabel(days[k].day, ta));
  // the map shows that day's pins (or every day up to it): the panel's spot, as the answer's tiles do
  useEffect(() => {
    if (at == null || !days[at]) return;
    const ids = upTo ? days.slice(0, at + 1).flatMap((d) => d.ids) : days[at].ids;
    ask.setSpot({ ids, label: label(at), still: true });
  }, [at, upTo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing) { if (timer.current) clearInterval(timer.current); timer.current = null; return; }
    timer.current = setInterval(() => setAt((k) => { const nx = k == null || k >= days.length - 1 ? 0 : k + 1; if (nx === days.length - 1) setPlaying(false); return nx; }), speed);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, days.length, speed]);
  // a new answer: start again
  useEffect(() => { setAt(null); setPlaying(false); }, [r]);
  if (!tl || days.length < 2) return null;
  const shown = at == null ? null : upTo ? days.slice(0, at + 1).reduce((a, d) => a + d.n, 0) : days[at].n;
  const stop = () => { setPlaying(false); setAt(null); ask.setSpot(null); };
  return (
    <section className="amp-play" aria-label={ta ? "காலத்தை இயக்கு" : "Play the period"}>
      <div className="amp-play-h">
        <h5><I n="clock" />{ta ? "நாள் வாரியாக" : "Day by day"}</h5>
        <button className="amp-ib" onClick={() => setPlaying((p) => !p)} aria-pressed={playing} title={playing ? (ta ? "நிறுத்து" : "Pause") : (ta ? "இயக்கு" : "Play the period")} aria-label={playing ? "Pause" : "Play the period"}>
          {playing ? "❚❚" : "▶"}
        </button>
        <label className="amp-play-mode"><input type="checkbox" checked={upTo} onChange={(e) => setUpTo(e.target.checked)} />{ta ? "அதுவரை எல்லாம்" : "Up to the day"}</label>
        <button className="amp-speed" onClick={() => setSpeed((v) => (v === 700 ? 350 : v === 350 ? 1400 : 700))} title={ta ? "வேகம்" : "Speed"} aria-label={ta ? "வேகம்" : "Speed"}>{speed === 350 ? "2×" : speed === 1400 ? "½×" : "1×"}</button>
        {at != null && <button className="amp-ib" onClick={stop} title={ta ? "அனைத்தையும் காட்டு" : "Show all again"} aria-label="Show all again"><I n="x" /></button>}
      </div>
      <div className="amp-bars" role="img" aria-label={ta ? `${days.length} நாட்களில் ${fmt(tl.total)}` : `${fmt(tl.total)} over ${days.length} days, by the day first reported`}>
        {days.map((d, k) => (
          <button key={d.day} className={`${at != null && (upTo ? k <= at : k === at) ? "on" : ""}${at === k ? " cur" : ""}`} style={{ height: `${Math.max(4, Math.round((d.n / max) * 100))}%` }}
            onClick={() => { setPlaying(false); setAt(k); }} title={`${dayLabel(d.day, ta)}: ${fmt(d.n)}`} aria-label={`${dayLabel(d.day, ta)}: ${fmt(d.n)}`} tabIndex={-1} />
        ))}
      </div>
      <input type="range" min={0} max={days.length - 1} value={at ?? days.length - 1} onChange={(e) => { setPlaying(false); setAt(Number(e.target.value)); }}
        aria-label={ta ? "நாள்" : "Day"} aria-valuetext={at != null ? `${label(at)}: ${fmt(shown ?? 0)}` : undefined} />
      {at != null && <DayStage days={days} at={at} upTo={upTo} shown={shown ?? 0} total={tl.total} ta={ta} playing={playing} />}
      <p className="amp-play-f">
        <span>{dayLabel(tl.from, ta)}</span>
        <b aria-live="polite">{at != null ? `${label(at)}: ${fmt(shown ?? 0)} ${ta ? "" : "on the map"}` : (ta ? `மொத்தம் ${fmt(tl.total)}` : `${fmt(tl.total)} in all · press ▶`)}</b>
        <span>{dayLabel(tl.to, ta)}</span>
      </p>
    </section>
  );
}

/**
 * v3: the day on the map itself, big enough to read across a room: the date, how many cases are on the map, a strip of
 * the days with the current one lit, and a progress line. Drawn over the map (a portal into the answer's map) while a
 * day is chosen or the period plays.
 */
function DayStage({ days, at, upTo, shown, total, ta, playing }: { days: { day: string; n: number }[]; at: number; upTo: boolean; shown: number; total: number; ta: boolean; playing: boolean }) {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => { setHost(document.querySelector(".ask-dim")); }, []);
  if (!host) return null;
  const d = new Date(`${days[at].day}T00:00:00Z`);
  const wk = d.toLocaleDateString(ta ? "ta-IN" : "en-IN", { weekday: "long", timeZone: "UTC" });
  const dm = d.toLocaleDateString(ta ? "ta-IN" : "en-IN", { day: "numeric", month: "long", timeZone: "UTC" });
  const max = Math.max(1, ...days.map((x) => x.n));
  return createPortal(
    <div className={`daystage${playing ? " playing" : ""}`} role="status" aria-live="polite">
      <div className="ds-date" key={days[at].day}><em>{wk}</em><b>{dm}</b></div>
      <div className="ds-n"><b>{fmt(shown)}</b><span>{upTo ? (ta ? "இந்நாள் வரை வழக்குகள்" : "cases up to this day") : ta ? "இந்நாளில் வழக்குகள்" : "cases this day"}</span>
        {!upTo && <i>+{fmt(days[at].n)}</i>}</div>
      <div className="ds-strip" aria-hidden>{days.map((x, k) => <i key={x.day} className={k === at ? "cur" : (upTo ? k < at : false) ? "on" : ""} style={{ height: `${Math.max(8, (x.n / max) * 100)}%` }} />)}</div>
      <div className="ds-prog" aria-hidden><i style={{ width: `${((at + 1) / days.length) * 100}%` }} /></div>
      <small>{ta ? `நாள் ${at + 1} / ${days.length} · மொத்தம் ${fmt(total)}` : `Day ${at + 1} of ${days.length} · ${fmt(total)} in all`}</small>
    </div>,
    host
  );
}

export function ScorecardCard({ r, lang }: { r: AskResponse; lang: "en" | "ta" }) {
  const s = r.scorecard;
  if (!s) return null;
  const ta = lang === "ta";
  const ch = s.change;
  return (
    <div className="amp-card amp-score">
      <p className="amp-head">{ta ? `${s.label.ta}: மதிப்பெண் அட்டை` : `${s.label.en}: scorecard`}</p>
      <div className="amp-tiles">
        <span className="amp-tile"><b>{fmt(s.open)}</b><span>{ta ? "திறந்தவை" : "open issues"}</span></span>
        <span className={`amp-tile ${s.overdue ? "t-alert" : "t-good"}`}><b>{fmt(s.overdue)}</b><span>{ta ? "காலக்கெடு தாண்டியவை" : "past deadline"}</span></span>
        <span className={`amp-tile ${s.severe ? "t-warn" : "t-good"}`}><b>{fmt(s.severe)}</b><span>{ta ? "கடுமையானவை" : "severe"}</span></span>
        <span className="amp-tile"><b>{fmt(s.citizen)}</b><span>{ta ? "குடிமக்களிடமிருந்து" : "from citizens"}</span></span>
      </div>
      <p className="amp-mean">
        {ta ? `திறந்த பிரச்சனைகளில் ${fmt(s.rank.of)} வார்டுகளில் ${fmt(s.rank.k)}வது (1 = அதிகம்). நடு வார்டில் ${fmt(s.median)}.`
          : `Rank ${fmt(s.rank.k)} of ${fmt(s.rank.of)} wards by open issues (1 = the most). The middle ward has ${fmt(s.median)}.`}
        {" "}{ta ? `கடந்த 30 நாட்களில் ${fmt(ch.now)}, அதற்கு முந்தைய 30 நாட்களில் ${fmt(ch.before)}.` : `${fmt(ch.now)} reported in the last 30 days, ${fmt(ch.before)} in the 30 before${ch.pct != null ? ` (${ch.pct > 0 ? "+" : ""}${ch.pct} %)` : ""}.`}
      </p>
      <div className="amp-tacts">
        <a className="pri" href={`/api/map/scorecard?ward=${s.ward}&format=html`} target="_blank" rel="noopener"><I n="doc" />{ta ? "அச்சிடு" : "Print scorecard"}</a>
      </div>
    </div>
  );
}

/** the question that made this answer, for a link or a printed page */
export function ShareActs({ r, question, lang, toast }: { r: AskResponse; question: string | null; lang: "en" | "ta"; toast?: (m: string, k?: "ok" | "alert") => void }) {
  const ta = lang === "ta";
  const [copied, setCopied] = useState(false);
  if (r.kind !== "answer" || !r.plan) return null;
  // a typed question travels as words; an answer changed by chips travels as its plan
  const printHref = question ? `/api/map/brief?q=${encodeURIComponent(question)}` : `/api/map/brief?plan=${encodeURIComponent(JSON.stringify(r.plan))}`;
  const copy = async () => {
    if (!question) { toast?.(ta ? "இந்தப் பதிலுக்கு இணைப்பு இல்லை: கேள்வியைத் தட்டச்சு செய்யுங்கள்." : "Type the question to share it: a link carries the question, not the chip changes.", "alert"); return; }
    const url = `${window.location.origin}/collector?ask=${encodeURIComponent(question)}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); toast?.(ta ? "இணைப்பு நகலெடுக்கப்பட்டது" : "Link copied. Whoever opens it sees today's numbers, and only what their role allows."); }
    catch { window.prompt(ta ? "இந்த இணைப்பை நகலெடுங்கள்" : "Copy this link", url); }
  };
  return (
    <div className="amp-tacts amp-share">
      <button onClick={copy} title={ta ? "இதே கேள்வியைத் திறக்கும் இணைப்பு" : "A link that opens the console on this same question"}><I n={copied ? "check" : "ext"} />{copied ? (ta ? "நகலெடுக்கப்பட்டது" : "Copied") : (ta ? "இணைப்பு" : "Copy link")}</button>
      <a href={printHref} target="_blank" rel="noopener" title={ta ? "ஒரு பக்கச் சுருக்கம்" : "One printable page: the question, the numbers, a map, the top 25"}><I n="doc" />{ta ? "அச்சிடு" : "Print brief"}</a>
    </div>
  );
}
