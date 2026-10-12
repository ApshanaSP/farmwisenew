"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { Insights } from "@/lib/collector/insights";
import type { Overview as OverviewData } from "@/lib/collector/intel";
import type { Story } from "@/lib/collector/storyai";
import { I, type IconName } from "./icons";
import { SEV_HEX, deptIcon, fmtDate, rel, useFit, type Row } from "./lib";
import type { Console } from "./CollectorApp";
import { canSpeak, speak, stopSpeaking } from "./assistant/speech";

type Book = NonNullable<Insights["book"]>;
type Dept = Book["departments"][number];
type Lang = "en" | "ta";

const STATUS = { normal: "Normal", watchful: "Watchful", alert: "Alert" } as const;
const num = (v: number) => v.toLocaleString("en-IN");
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Page 2: the Collector's brief, read top to bottom in a minute. Left: the key points of the period, one AI report of
 * every incident, grievance and news story (numbers checked), the critical incidents and what to watch. Middle: each
 * department in one line (deaths and severe only), opening in place to a short brief, what happened in each death and
 * every report. Right: stories that really developed (duplicates joined, repeats left out) and what is only in the news.
 */
export function BriefingBook({ ins, c }: { ins: Insights; d?: OverviewData; c: Console }) {
  const b = ins.book!;
  return (
    <section className="bb">
      <Brief ins={ins} b={b} c={c} />
      <Departments b={b} c={c} />
      <div className="bb-col">
        <Developing ins={ins} c={c} />
        <NewsOnly ins={ins} c={c} />
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------------------------------- building blocks --

function Head({ ic, title, n, note, more, children }:
  { ic: IconName; title: string; n?: number; note?: string; more?: () => void; children?: React.ReactNode }) {
  return (
    <header className="bb-h">
      <I n={ic} />
      <h3>{title}</h3>
      {n != null && <span className="bb-n">{num(n)}</span>}
      {note && <span className="bb-note">{note}</span>}
      {children}
      {more && <button className="bb-more" onClick={more}>See all<I n="chevr" /></button>}
    </header>
  );
}

const Calm = ({ children }: { children: React.ReactNode }) => <p className="bb-calm"><I n="checkc" />{children}</p>;

/** Numbers stand out, so the points can be scanned. */
export function Emph({ text }: { text: string }) {
  const parts = text.split(/(\d[\d,.]*\s?%?)/);
  return <>{parts.map((p, k) => (k % 2 ? <b key={k}>{p}</b> : <Fragment key={k}>{p}</Fragment>))}</>;
}

/** A paragraph as points: one sentence each. */
export function sentences(text: string): string[] {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=\S)/).map((s) => s.trim()).filter((s) => s.length > 2);
}

/** "the 24 hours before" / "the 7 days before" for the period's comparison. */
function before(label: string): string {
  const m = /last (.+)$/i.exec(label);
  return m ? `the ${m[1]} before` : "the previous period";
}

/** The key points by rules, from the same figures the AI note is written from (used when there is no AI note). */
function rulePoints(ins: Insights, b: Book, period: string): string[] {
  const t = b.glance.tiles;
  const whole = !ins.scope || /^(district-wide|chennai district)$/i.test(ins.scope);
  const out: string[] = [];
  out.push(`${num(t.reported)} incident${t.reported === 1 ? " was" : "s were"} reported${whole ? "" : ` in ${ins.scope}`}` +
    (t.change ? `, ${Math.abs(t.change)}% ${t.change > 0 ? "more" : "fewer"} than ${before(period)}` : t.change === 0 ? `, the same as ${before(period)}` : "") + ".");
  if (t.deaths || t.injured) out.push([t.deaths ? `${num(t.deaths)} ${t.deaths === 1 ? "person died" : "people died"}` : null,
    t.injured ? `${num(t.injured)} ${t.injured === 1 ? "was" : "were"} injured` : null].filter(Boolean).join(" and ") + ".");
  const z = [...b.where].sort((a, x) => x.n - a.n)[0];
  if (z && whole) out.push(`${z.name} had the most reports (${z.n})${z.kinds.length ? `, mainly ${z.kinds.map(lc).join(" and ")}` : ""}.`);
  const k = b.citizens.kinds;
  if (k.length) out.push(`Citizens complained most about ${k.slice(0, 2).map((x) => `${lc(x.label)} (${x.n})`).join(" and ")}.`);
  if (t.awaiting) out.push(`${num(t.awaiting)} completed work${t.awaiting === 1 ? " waits" : "s wait"} for verification.`);
  return out;
}

// -------------------------------------------------------------------------------------------------------- the brief --

/** What each AI key point is about, as an icon and a colour. */
const TOPIC: Record<string, { ic: IconName; c: string }> = {
  "Lives lost": { ic: "alert", c: "#E5484D" }, Safety: { ic: "shield", c: "#E8590C" }, Grievances: { ic: "chat", c: "#15803D" },
  News: { ic: "news", c: "#7048E8" }, "Civic services": { ic: "cone", c: "#0E9F6E" }, "Weather & water": { ic: "cloud", c: "#2F80ED" },
  Rising: { ic: "chart", c: "#C58A00" }, "For you": { ic: "checkc", c: "#0A6B8A" }
};

/**
 * The key points: one report of the whole period, written by AI from the incidents, citizen grievances, news, weather
 * and water (aibrief.dayBrief, numbers checked), most important first, each tagged and opening its incident. While it
 * is written (a few seconds, once per build) a placeholder; when no model answers, the pipeline's note or the rules'.
 */
function Brief({ ins, b, c }: { ins: Insights; b: Book; c: Console }) {
  const [lang, setLang] = useState<Lang>("en");
  const [talking, setTalking] = useState(false);
  const [voice, setVoice] = useState(false);
  useEffect(() => { setVoice(canSpeak()); return () => stopSpeaking(); }, []);
  const day = c.dayBrief?.brief ?? null;
  const writing = !c.dayBrief;
  const story = b.glance.ai ?? b.glance.opening;
  const hasTa = day ? !!day.headlineTa && day.points.every((p) => p.ta) : !!story?.ta;
  const ta = lang === "ta" && hasTa;
  const points: { text: string; topic?: string; ref?: string | null }[] = day
    ? day.points.map((p) => ({ text: ta ? p.ta! : p.text, topic: p.topic, ref: p.ref }))
    : (ta ? sentences(story!.ta!) : story?.en ? sentences(story.en) : rulePoints(ins, b, c.periodLabel)).map((text) => ({ text }));
  const headline = day ? (ta ? day.headlineTa : day.headline) : null;
  // the IMD warning has its own line, so the status does not repeat it
  const reasons = b.status.reasons.filter((r) => !(b.status.warning && /IMD/.test(r)));
  const status = `${STATUS[b.status.level]}${reasons.length ? ` · ${reasons.join(", ")}` : ""}`;
  const listen = () => {
    if (talking) { stopSpeaking(); setTalking(false); return; }
    const say = [ta ? "" : `District status: ${status}.`, headline ?? "", ...points.map((p) => p.text)].filter(Boolean).join(" ");
    setTalking(speak(say, ta ? "ta-IN" : "en-IN", () => setTalking(false)));
  };
  const pick = (l: Lang) => { stopSpeaking(); setTalking(false); setLang(l); };
  const old = b.citizens.oldest;
  const ai = !!day || !!b.glance.ai || !!b.glance.opening;
  const written = day?.at ?? b.glance.ai?.writtenFor?.replace(/^\d+ \w+, /, "");
  return (
    <section className="bb-card bb-brief">
      <Head ic="scroll" title="Key points" note={c.periodLabel.toLowerCase()}>
        <span className="bb-tools">
          <span className={`bb-ai${ai || writing ? "" : " rules"}`} title={ai ? "Written by AI from the records; numbers checked against the data" : "From the district's records, by rules"}>
            <I n={ai || writing ? "ai" : "doc"} />{writing ? "Writing…" : ai ? `AI${written ? ` · ${written}` : ""}` : "Rules"}
          </span>
          {hasTa && !writing && (
            <span className="bb-lang" role="group" aria-label="Language">
              <button className={lang === "en" ? "on" : ""} aria-pressed={lang === "en"} onClick={() => pick("en")}>EN</button>
              <button className={lang === "ta" ? "on" : ""} aria-pressed={lang === "ta"} onClick={() => pick("ta")}>தமிழ்</button>
            </span>
          )}
          {voice && !writing && <button className={`bb-btn${talking ? " talking" : ""}`} onClick={listen} title={talking ? "Stop" : "Read the key points aloud"} aria-pressed={talking}>
            {talking ? <span className="bb-bars" aria-hidden="true"><i /><i /><i /><i /></span> : <I n="volume" />}{talking ? "Stop" : "Listen"}</button>}
        </span>
      </Head>
      <div className="bb-body kp">
        <p className={`bb-status lv-${b.status.level}`} title="District status, by fixed rules: deaths, severe incidents, IMD warnings">
          <i /><b>{STATUS[b.status.level]}</b><span>{reasons.length ? reasons.join(" · ") : b.status.warning ? "IMD warning in force" : "Nothing unusual in this period"}</span>
        </p>
        <div className="kp-scroll">
          {writing ? (
            <div className="kp-wait" aria-live="polite">
              <span className="kp-sk" /><span className="kp-sk" /><span className="kp-sk short" /><span className="kp-sk" /><span className="kp-sk short" />
              <small><I n="ai" />Reading the period&apos;s incidents, grievances and news…</small>
            </div>
          ) : (
            <>
              {headline && <p className="kp-head" lang={ta ? "ta" : "en"}><Emph text={headline} /></p>}
              <ol className={`kp-list${day ? " ai" : ""}`} lang={ta ? "ta" : "en"} key={`${ta}${!!day}`}>
                {points.map((p, k) => {
                  const t = p.topic ? TOPIC[p.topic] ?? TOPIC["For you"] : null;
                  const body = <>
                    {t ? <span className="kp-ic" style={{ "--tc": t.c } as React.CSSProperties}><I n={t.ic} /></span> : <span className="kp-no">{k + 1}</span>}
                    <span className="kp-t">{p.topic && t && <em style={{ color: t.c }}>{p.topic}</em>}<Emph text={p.text} /></span>
                    {p.ref && <I n="chevr" />}
                  </>;
                  return <li key={k}>{p.ref ? <button onClick={() => c.openInc(p.ref!)} title="Open the incident">{body}</button> : <div>{body}</div>}</li>;
                })}
              </ol>
            </>
          )}
          {b.critical.length > 0 && (
            <div className="bb-crit">
              <span className="bb-lbl" title="Open severe incidents of the last 7 days, deaths first">Critical now</span>
              <div>
                {b.critical.map((x) => (
                  <button key={x.id} onClick={() => c.openInc(x.id)}
                    title={`${x.title}${x.zone_name ? `, ${x.zone_name}` : ""} · ${x.dead ? `${x.dead} dead · ` : x.injured ? `${x.injured} injured · ` : ""}${x.status}. Click to open.`}>
                    <i style={{ background: SEV_HEX[x.sev] }} />
                    <span>{String(x.title || x.type).replace(/^.*?–\s*/, "") || x.type}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="bb-watch">
            {b.status.warning && <p className="bb-fact warn" title={b.status.warning.text}><I n="cloud" /><b>IMD warning</b><span>{b.status.warning.text}</span></p>}
            {old && (
              <button className="bb-fact" onClick={() => c.openInc(old.id)} title={`${old.title}${old.zone ? `, ${old.zone}` : ""}. Click to open.`}>
                <I n="clock" /><b>Oldest open complaint</b><span>{old.days} days · {old.title}</span><I n="chevr" />
              </button>
            )}
          </div>
        </div>
        <small className="bb-src">{day ? `Written by AI at ${day.at} from the period's incidents, citizen grievances, news and weather · numbers checked against the data`
          : ai ? `Written by AI${written ? ` at ${written}` : ""} from the records · numbers checked against the data` : "From the district's records, by rules."}</small>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ by department --

/**
 * The pipeline's note as a short line: "Incidents of theft, protests, and road accidents were reported in Teynampet
 * and Adyar." reads "Theft, protests, road accidents · Teynampet, Adyar". Else by rules.
 */
function firstLine(x: Dept, oneZone: boolean): string {
  const s = x.ai?.en ? sentences(x.ai.en)[0] ?? x.ai.en : null;
  if (s) {
    // the AI words it several ways: "were reported in", "were recorded / logged / received in", "came in from"
    const m = /^(.+?)\s+(?:(?:were|was|have been|has been)\s+(?:reported|recorded|logged|received|seen)|came\s+in)(?:\s+mainly)?(?:\s+(?:in|across|from)\s+(.+?))?\.?$/i.exec(s);
    if (!m) return s;
    const list = (t: string) => t.replace(/,?\s+and\s+/gi, ", ").replace(/\s{2,}/g, " ").trim();
    const what = list(m[1].replace(/^(mostly\s+)?(incidents|issues|cases|reports|complaints)\s+(of|regarding|about|related to|with|including|involving)\s+/i, "")
      .replace(/\s+(issues|incidents|complaints|cases)$/i, ""));
    return `${what.charAt(0).toUpperCase()}${what.slice(1)}${m[2] ? ` · ${list(m[2])}` : ""}`;
  }
  const kinds = [...new Set(x.items.map((i) => i.type.toLowerCase()))].slice(0, 2);
  const places = oneZone ? [] : [...new Set(x.items.map((i) => i.zone).filter(Boolean))].slice(0, 2);
  return `Mostly ${kinds.length ? kinds.join(" and ") : "new reports"}${places.length ? ` in ${places.join(" and ")}` : ""}.`;
}

/**
 * Each department in one line: what it received, and only what matters (deaths, severe). A line opens in place to a
 * short brief of the department's period (AI, written when opened), what happened in each death, its most serious
 * reports, and every report. The list scrolls inside the card, so an opened department always stays in view.
 */
function Departments({ b, c }: { b: Book; c: Console }) {
  const rows = b.departments;
  const [open, setOpen] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const toggle = (code: string) => {
    const next = open === code ? null : code;
    setOpen(next);
    if (next) setTimeout(() => listRef.current?.querySelector(`[data-code="${next}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
  };
  return (
    <section className="bb-card bb-depts">
      <Head ic="gov" title="Departments" note={`what each received · ${c.periodLabel.toLowerCase()}`} more={rows.length ? () => c.openDepts() : undefined} />
      {rows.length ? (
        <ul ref={listRef} className="dp-list">
          {rows.map((x) => <DeptRow key={x.code} x={x} on={open === x.code} toggle={() => toggle(x.code)} c={c} />)}
        </ul>
      ) : <div className="bb-fit"><Calm>No department received a report in this period.</Calm></div>}
    </section>
  );
}

type DeptAi = { brief: string; watch: string; at: string } | null;

function DeptRow({ x, on, toggle, c }: { x: Dept; on: boolean; toggle: () => void; c: Console }) {
  const [ai, setAi] = useState<DeptAi | undefined>(undefined);
  const p = c.periodLabel.toLowerCase();
  useEffect(() => {
    if (!on || ai !== undefined) return;
    let live = true;
    const qs = new URLSearchParams({ kind: "dept", code: x.code, period: c.period });
    if (c.zone) qs.set("zone", String(c.zone));
    if (c.taluk) qs.set("taluk", c.taluk);
    fetch(`/api/collector/brief?${qs}`).then((r) => r.json()).then((j) => live && setAi(j.brief ?? null)).catch(() => live && setAi(null));
    return () => { live = false; };
  }, [on, ai, x.code, c.period, c.zone, c.taluk]);
  const items = x.items.filter((i) => !x.deaths.some((d) => d.id === i.id)).slice(0, 3);
  return (
    <li data-code={x.code} className={on ? "on" : ""}>
      <button className="dp-row" onClick={toggle} aria-expanded={on} title={on ? "Close" : "A short brief of this department's period"}>
        <span className="bb-dic"><I n={deptIcon(x.code)} /></span>
        <span className="dp-main">
          <span className="dp-n">{x.name}</span>
          {(x.dead > 0 || x.severe > 0) && (
            <span className="dp-tags">
              {x.dead > 0 && <em className="dead">{x.dead} dead</em>}
              {x.severe > 0 && <em className="sev">{x.severe} severe</em>}
            </span>
          )}
        </span>
        <b className="dp-k" title={`${x.n} reports in the ${p}`}>{num(x.n)}</b>
        <I n={on ? "chevd" : "chevr"} />
      </button>
      {on && (
        <div className="dp-x">
          {ai === undefined ? <p className="dp-brief wait"><I n="ai" />Writing a short brief…</p>
            : <p className="dp-brief">{ai ? <><I n="ai" />{ai.brief}</> : x.ai?.en ?? firstLine(x, c.zone != null)}</p>}
          {ai?.watch && <p className="dp-watch"><b>Watch</b>{ai.watch}</p>}
          {x.deaths.length > 0 && (
            <div className="dp-deaths">
              <span className="dp-lbl">What happened · {x.dead} {x.dead === 1 ? "death" : "deaths"}</span>
              {x.deaths.map((d) => (
                <button key={d.id} className="dp-death" onClick={() => c.openInc(d.id)} title="Open the incident">
                  <i />
                  <span><b>{d.title}</b><small>{[`${d.dead} dead${d.injured ? `, ${d.injured} injured` : ""}`, d.place, fmtDate(d.t), d.status].filter(Boolean).join(" · ")}</small></span>
                  <I n="chevr" />
                </button>
              ))}
            </div>
          )}
          {items.length > 0 && (
            <div className="dp-items">
              <span className="dp-lbl">Most serious reports</span>
              {items.map((i) => (
                <button key={i.id} className="bb-di" onClick={() => c.openInc(i.id)} title="Open the incident">
                  <i style={{ background: SEV_HEX[i.sev] }} /><span>{i.title}</span><small>{i.status}</small>
                </button>
              ))}
            </div>
          )}
          <button className="bb-all" onClick={() => c.openList({ dept: x.code, sort: "sev", dir: 1 }, `${x.name}: reported in the ${p}`)}>
            See all {num(x.n)} reports<I n="chevr" />
          </button>
        </div>
      )}
    </li>
  );
}

// ------------------------------------------------------------------------------------------------------- the news --

/** The steps to draw without the AI: the first report, what followed (at most three), else the latest report. */
function steps(s: Story) {
  const st = s.stages.length > 4 ? [s.stages[0], ...s.stages.slice(-3)] : [{ stage: "First report", t: s.first }, ...s.stages];
  return st.length > 1 ? st : [...st, { stage: "Still reported", t: s.last }];
}

/**
 * Stories that really developed (storyai.ts): reports about one event joined into one story, routine repeats left out,
 * each told as what changed. Until they are joined (a few seconds, once per build) a placeholder.
 */
function Developing({ ins, c }: { ins: Insights; c: Console }) {
  const data = c.stories;
  const threads = data?.threads ?? [];
  const [ref] = useFit<HTMLUListElement>(threads.map((t) => t.id).join());
  return (
    <section className="bb-card grow bb-dev">
      <Head ic="pulse" title="Stories still developing" n={data ? threads.length : undefined} more={threads.length ? () => c.openStories(null) : undefined} />
      {!data ? (
        <div className="bb-fit"><p className="dp-brief wait" style={{ margin: "2px 14px" }}><I n="ai" />Joining reports about the same event…</p></div>
      ) : threads.length ? (
        <ul ref={ref} className="bb-fit">
          {threads.map((s) => {
            const ms = s.ai?.milestones ?? [];
            const latest = ms.length > 1 ? ms[ms.length - 1] : null;
            const track = ms.length ? ms.map((m, k) => ({ stage: k === 0 ? "First report" : m.label, t: m.t })) : steps(s);
            return (
              <li key={s.id}>
                <button className="bb-story" onClick={() => c.openStories(s.id)} title="Open the story's timeline">
                  <b>{s.title}</b>
                  {latest && <span className="sv-latest"><em>Latest</em>{latest.what}</span>}
                  <span className="bb-track">
                    {(track.length > 3 ? [track[0], ...track.slice(-2)] : track).map((g, k) => (
                      <span key={k} className={k === 0 ? "first" : ""}><i />{g.stage}<em>{fmtDate(g.t)}</em></span>
                    ))}
                  </span>
                  <small>{ms.length ? `${ms.length} developments · ` : ""}{s.reports} reports · {s.outlets.length} outlet{s.outlets.length === 1 ? "" : "s"} · updated {rel(s.last, ins.now)}</small>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <div className="bb-fit"><Calm>No story developed further in this period.</Calm></div>}
    </section>
  );
}

function NewsOnly({ ins, c }: { ins: Insights; c: Console }) {
  const rows = ins.gaps as Row[];
  const [ref] = useFit<HTMLUListElement>(rows.map((g) => g.id).join());
  return (
    <section className="bb-card grow bb-gaps">
      <Head ic="news" title="Only in the news" n={rows.length} note="no department record" more={rows.length ? () => c.openGaps() : undefined} />
      {rows.length ? (
        <ul ref={ref} className="bb-fit">
          {rows.map((g) => (
            <li key={g.id}>
              <button className="bb-item" onClick={() => c.openInc(g.id)} title="Open the incident and its news reports">
                <i style={{ background: SEV_HEX[g.sev] ?? "var(--text-4)" }} />
                <b>{g.title || g.type}</b>
                <small>{[g.zone_name ?? "Chennai", g.dept_name ? `for ${g.dept_name}` : null, g.t ? rel(g.t, ins.now) : null].filter(Boolean).join(" · ")}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : <div className="bb-fit"><Calm>Every incident in the news has a department record.</Calm></div>}
    </section>
  );
}
