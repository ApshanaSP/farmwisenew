"use client";

import { Fragment, useEffect, useState } from "react";
import type { Insights } from "@/lib/collector/insights";
import type { Overview as OverviewData } from "@/lib/collector/intel";
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
 * Page 2: the Collector's brief, read top to bottom in a minute. Left: the period as numbered key points (the
 * pipeline's AI note, every number checked against the data, else the same points by rules), the critical incidents
 * they mention as links, and what to watch. Middle: what each department received, one line each, opening in place
 * to the full note and its incidents. Right: stories still developing and what is only in the news. Nothing here
 * repeats another page (no KPI tiles, severe list, tasks or news feed); lists show only the rows that fit whole.
 */
export function BriefingBook({ ins, d, c }: { ins: Insights; d?: OverviewData; c: Console }) {
  const b = ins.book!;
  return (
    <section className="bb">
      <Brief ins={ins} b={b} c={c} />
      <Departments b={b} c={c} />
      <div className="bb-col">
        <Developing ins={ins} d={d} c={c} />
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
function Emph({ text }: { text: string }) {
  const parts = text.split(/(\d[\d,.]*\s?%?)/);
  return <>{parts.map((p, k) => (k % 2 ? <b key={k}>{p}</b> : <Fragment key={k}>{p}</Fragment>))}</>;
}

/** A paragraph as points: one sentence each. */
function sentences(text: string): string[] {
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

function Brief({ ins, b, c }: { ins: Insights; b: Book; c: Console }) {
  const [lang, setLang] = useState<Lang>("en");
  const [talking, setTalking] = useState(false);
  const [voice, setVoice] = useState(false);
  useEffect(() => { setVoice(canSpeak()); return () => stopSpeaking(); }, []);
  const story = b.glance.ai ?? b.glance.opening;
  const ta = lang === "ta" && !!story?.ta;
  const points = ta ? sentences(story!.ta!) : story?.en ? sentences(story.en) : rulePoints(ins, b, c.periodLabel);
  // the IMD warning has its own line, so the status does not repeat it
  const reasons = b.status.reasons.filter((r) => !(b.status.warning && /IMD/.test(r)));
  const status = `${STATUS[b.status.level]}${reasons.length ? ` · ${reasons.join(", ")}` : ""}`;
  const listen = () => {
    if (talking) { stopSpeaking(); setTalking(false); return; }
    const say = ta ? points.join(" ") : `District status: ${status}. ${points.join(" ")}`;
    setTalking(speak(say, ta ? "ta-IN" : "en-IN", () => setTalking(false)));
  };
  const pick = (l: Lang) => { stopSpeaking(); setTalking(false); setLang(l); };
  const old = b.citizens.oldest;
  const ai = !!b.glance.ai || !!b.glance.opening;
  const written = b.glance.ai?.writtenFor;
  return (
    <section className="bb-card bb-brief">
      <Head ic="scroll" title="Key points" note={c.periodLabel.toLowerCase()}>
        <span className="bb-tools">
          {story?.ta && (
            <span className="bb-lang" role="group" aria-label="Language">
              <button className={lang === "en" ? "on" : ""} aria-pressed={lang === "en"} onClick={() => pick("en")}>EN</button>
              <button className={lang === "ta" ? "on" : ""} aria-pressed={lang === "ta"} onClick={() => pick("ta")}>தமிழ்</button>
            </span>
          )}
          {voice && <button className="bb-btn" onClick={listen} title={talking ? "Stop" : "Read the brief aloud"}><I n={talking ? "stop" : "volume"} />{talking ? "Stop" : "Listen"}</button>}
        </span>
      </Head>
      <div className="bb-body">
        <p className={`bb-status lv-${b.status.level}`} title="District status, by fixed rules: deaths, severe incidents, IMD warnings">
          <i /><b>{STATUS[b.status.level]}</b><span>{reasons.length ? reasons.join(" · ") : b.status.warning ? "IMD warning in force" : "Nothing unusual in this period"}</span>
        </p>
        <ol className="bb-points" lang={ta ? "ta" : "en"}>
          {points.map((p, k) => <li key={k}><Emph text={p} /></li>)}
        </ol>
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
          <small className="bb-src">{ai ? `Written by AI${written ? ` at ${written.replace(/^\d+ \w+, /, "")}` : ""} from the records · numbers checked against the data`
            : "From the district's records, by rules."}</small>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ by department --

/**
 * The note's first sentence (what came in, where) as a short line: "Incidents of theft, protests, and road accidents
 * were reported in Teynampet and Adyar." reads "Theft, protests, road accidents · Teynampet, Adyar". Else by rules.
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

function Departments({ b, c }: { b: Book; c: Console }) {
  const rows = b.departments;
  const [open, setOpen] = useState<string | null>(null);
  const [ref] = useFit<HTMLUListElement>(rows.map((r) => r.code).join() + (open ?? ""));
  const p = c.periodLabel.toLowerCase();
  return (
    <section className="bb-card bb-depts">
      <Head ic="gov" title="Departments" note={`what each received · ${p}`} more={rows.length ? () => c.openDepts() : undefined} />
      {rows.length ? (
        <ul ref={ref} className="bb-fit">
          {rows.map((x) => {
            const on = open === x.code;
            const rest = x.ai?.en ? sentences(x.ai.en).slice(1).join(" ") : null;
            return (
              <li key={x.code} className={on ? "on" : ""}>
                <button className="bb-dept" onClick={() => setOpen(on ? null : x.code)} aria-expanded={on} title={on ? "Close" : "Open the department's note and incidents"}>
                  <span className="bb-dic"><I n={deptIcon(x.code)} /></span>
                  <span className="bb-dn">{x.name}</span>
                  <span className="bb-dk"><b>{num(x.n)}</b></span>
                  <span className="bb-ds">
                    {x.dead > 0 && <em className="bad">{x.dead} dead</em>}
                    {x.severe > 0 && <em>{x.severe} severe</em>}
                    {firstLine(x, c.zone != null)}
                  </span>
                  <I n={on ? "chevd" : "chevr"} />
                </button>
                {on && (
                  <div className="bb-dx">
                    {rest && <p>{rest}</p>}
                    {x.items.slice(0, 3).map((i) => (
                      <button key={i.id} className="bb-di" onClick={() => c.openInc(i.id)} title="Open the incident">
                        <i style={{ background: SEV_HEX[i.sev] }} /><span>{i.title}</span><small>{i.status}</small>
                      </button>
                    ))}
                    <button className="bb-all" onClick={() => c.openList({ dept: x.code, sort: "sev", dir: 1 }, `${x.name}: reported in the ${p}`)}>
                      All {num(x.n)} reports<I n="chevr" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : <div className="bb-fit"><Calm>No department received a report in this period.</Calm></div>}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------- the news --

/** The stages to draw: the first report, what followed (at most three), and the latest report when nothing new was named. */
function steps(s: NonNullable<OverviewData["stories"]>["threads"][number]) {
  const st = s.stages.length > 4 ? [s.stages[0], ...s.stages.slice(-3)] : s.stages;
  return st.length > 1 ? st : [...st, { stage: "Still reported", t: s.last }];
}

function Developing({ ins, d, c }: { ins: Insights; d?: OverviewData; c: Console }) {
  const threads = d?.stories?.threads ?? [];
  const [ref] = useFit<HTMLUListElement>(threads.map((t) => t.id).join());
  return (
    <section className="bb-card grow bb-dev">
      <Head ic="pulse" title="Stories still developing" n={d?.stories?.total ?? threads.length} more={threads.length ? () => c.openStories(null) : undefined} />
      {threads.length ? (
        <ul ref={ref} className="bb-fit">
          {threads.map((s) => (
            <li key={s.id}>
              <button className="bb-story" onClick={() => c.openStories(s.id)} title="Open the story's timeline">
                <b>{s.title}</b>
                <span className="bb-track">
                  {steps(s).map((g, k) => (
                    <span key={k} className={k === 0 ? "first" : ""}><i />{g.stage}<em>{fmtDate(g.t)}</em></span>
                  ))}
                </span>
                <small>{s.reports} reports · {s.outlets.length} outlet{s.outlets.length === 1 ? "" : "s"} · updated {rel(s.last, ins.now)}</small>
              </button>
            </li>
          ))}
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
