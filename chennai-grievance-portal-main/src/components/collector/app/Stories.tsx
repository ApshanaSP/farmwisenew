"use client";

import { openDoc } from "./Conflicts";
import { useState } from "react";
import type { Overview as OverviewData } from "@/lib/collector/intel";
import type { Thread, ThreadStep } from "@/lib/collector/threads";
import type { EventSource } from "@/lib/collector/storyai";
import { I } from "./icons";
import { Empty, SEV_HEX, fmtDate, fmtDay, fmtTime, reportsOutlets } from "./lib";
import { itemWhen, safeUrl } from "./Added";
import type { Console } from "./CollectorApp";

export const STAGE_COL: Record<string, string> = {
  "First report": "#818CF8", Arrest: "#A78BFA", Death: "#FB7185", Court: "#94A3B8", Probe: "#38BDF8", Protest: "#FBBF24",
  Action: "#34D399", Warning: "#FCD34D", Completed: "#34D399", Update: "#94A3B8"
};

const span = (h: number) => (h < 1 ? "within the hour" : h < 36 ? `over ${h} h` : `over ${Math.round(h / 24)} days`);
const where = (t: Thread, c: Console) => t.place ?? (t.zones.length === 1 ? c.zoneNameOf(t.zones[0]) : null) ?? "Chennai";

/** Stage chips in order: "First report 27 Sep → Arrest 27 Sep → Death 28 Sep". */
function StageStrip({ t, max = 4 }: { t: Thread; max?: number }) {
  const st = t.stages.length > max ? [...t.stages.slice(0, max - 1), t.stages[t.stages.length - 1]] : t.stages;
  const updates = t.updates ?? t.days.reduce((a, d) => a + d.steps.filter((s) => s.stage === "Update").length, 0);
  return (
    <span className="thr-steps">
      {st.map((s, k) => (
        <span key={s.stage} className="stg-w">
          {k > 0 && <I n="right" />}
          <span className="stg" style={{ color: STAGE_COL[s.stage], background: `${STAGE_COL[s.stage]}14` }}>{s.stage}<em>{fmtDate(s.t)}</em></span>
        </span>
      ))}
      {updates > 0 && <span className="stg-more">+{updates} update{updates === 1 ? "" : "s"}</span>}
    </span>
  );
}

/** Environment & markets page card: the developing stories, newest update first. */
export function StoriesCard({ d, c }: { d: OverviewData; c: Console }) {
  const { threads, days, total } = d.stories;
  return (
    <>
      <div className="ch"><I n="clock" /><h2 title={`The same event reported again as it developed, last ${days} days`}>Developing stories <span>· same event over time</span></h2>
        <span className="cnt-b">{total}</span>
        <button className="more" onClick={() => c.openStories(null)}>See all<I n="right" /></button>
      </div>
      <div className="fitlist">
        {threads.length ? threads.map((t) => (
          <button key={t.id} className="thr" onClick={() => c.openStories(t.id)} title="See what happened, in order">
            <span className="thr-h">
              <b title={t.title}>{t.title}</b>
              <span className="thr-n">{reportsOutlets(t.reports, t.outlets.length)}</span>
            </span>
            <span className="thr-m">
              <StageStrip t={t} max={3} />
              <span className="thr-w">
                {t.sev && <i style={{ background: SEV_HEX[t.sev] }} />}
                {[where(t, c), t.catLabel, span(t.hours), `latest ${itemWhen(t.last, d.now)}`].filter(Boolean).join(" · ")}
              </span>
            </span>
          </button>
        )) : <Empty>No event was reported more than once in the last {days} days in this scope.</Empty>}
      </div>
    </>
  );
}

export const STORY_STATUS: Record<string, string> = { ongoing: "Ongoing", waiting: "Awaiting next step", settled: "Settled" };

/** The colour of a step, by what its label says happened (the labels are the AI's own words: "Died", "Seat vacant"). */
export function stepColour(label: string): string {
  const l = label.toLowerCase();
  if (STAGE_COL[label]) return STAGE_COL[label];
  if (/\b(died?|dead|death|killed|funeral|cremat|drown)/.test(l)) return STAGE_COL.Death;
  if (/\b(arrest|held|detain|custody|remand|booked)/.test(l)) return STAGE_COL.Arrest;
  if (/\b(court|hc|bail|verdict|petition|sentence|order)/.test(l)) return STAGE_COL.Court;
  if (/\b(probe|inquiry|investigat|complaint|notice|report)/.test(l)) return STAGE_COL.Probe;
  if (/\b(protest|strike|blockade|agitation|demand)/.test(l)) return STAGE_COL.Protest;
  if (/\b(warn|alert|injur|accident|fire|collapse|attack|missing)/.test(l)) return STAGE_COL.Warning;
  return "#15803D";
}

/** The outlets behind one event, each linking to its own report. */
function Outlets({ list, reports }: { list: EventSource[]; reports: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, 5);
  return (
    <span className="sl-src">
      <em>Reported by</em>
      {shown.map((o) => {
        const url = safeUrl(o.url);
        return url ? <a key={o.publisher} href={url} target="_blank" rel="noopener noreferrer" title={`${o.title} · ${fmtDate(o.t)}, ${fmtTime(o.t)}`}>{o.publisher}<I n="ext" /></a>
          : <span key={o.publisher} title={o.title}>{o.publisher}</span>;
      })}
      {list.length > shown.length && <button className="lnk" onClick={() => setAll(true)}>+{list.length - shown.length} more</button>}
      {reports > list.length && <i>{reports} reports</i>}
    </span>
  );
}

/**
 * Full view: the stories on the left; on the right the chosen story as one timeline, each event once with every outlet that reported it
 * (AI, checked against the reports: storyai.ts), where it stands now, and every report behind it on demand.
 */
export function StoriesBody({ c, focus }: { c: Console; focus: string | null }) {
  const data = c.stories;
  const list = data?.threads ?? [];
  const [sel, setSel] = useState<string | null>(focus);
  const [all, setAll] = useState(false);
  if (!data) return <div className="empty" style={{ margin: "40px auto" }}><I n="refresh" className="spin" />Joining the reports about each event…</div>;
  const t = list.find((x) => x.id === sel) ?? list[0];
  if (!t) return <Empty>No story developed further in this period: nothing new was reported after the first reports.</Empty>;
  const pick = (id: string) => { setSel(id); setAll(false); };
  return (
    <div className="thv">
      <div className="thv-l">
        <div className="thv-note">
          {data.ai ? "Each event is told once, in order, with every outlet that reported it. Repeats, speculation and reactions are left out."
            : data.pending ? "Being read by AI: the timelines below are from the rules and will be replaced in a few seconds."
              : "No AI answer just now: the timelines are from the rules."}
        </div>
        {list.map((x) => (
          <button key={x.id} className={`thv-i${x.id === t.id ? " on" : ""}`} onClick={() => pick(x.id)}>
            <b>{x.title}</b>
            <small>{where(x, c)} · {x.events.length} events · {fmtDate(x.events[0]?.t ?? x.first)}{x.first.slice(0, 10) !== x.last.slice(0, 10) ? ` – ${fmtDate(x.last)}` : ""}</small>
          </button>
        ))}
      </div>
      <div className="thv-r">
        <h3>{t.title}{t.ai && <span className={`sl-st ${t.ai.status}`}>{STORY_STATUS[t.ai.status]}</span>}</h3>
        <div className="thv-meta">
          <span><I n="pin" />{where(t, c)}</span>
          {t.catLabel && <span><I n="doc" />{t.catLabel}</span>}
          <span><I n="clock" />{fmtDate(t.first)} → {fmtDate(t.last)} ({span(t.hours)})</span>
          <span><I n="news" />{reportsOutlets(t.reports, t.outlets.length)}</span>
        </div>
        {t.ai && <p className="sv-now"><I n="spark" /><b>Where it stands</b><span>{t.ai.now}</span></p>}
        <ol className="sv-ms">
          {t.events.map((m, k) => {
            const col = stepColour(m.label);
            return (
              <li key={k} style={{ "--c": col } as React.CSSProperties} className={k === t.events.length - 1 ? "last" : undefined}>
                <span className="sv-when"><b>{fmtDate(m.t)}</b><small>{fmtTime(m.t)}</small></span>
                <span className="sv-body">
                  <span className="stg" style={{ color: `color-mix(in srgb, ${col} 62%, var(--text))`, background: `${col}1f` }}>{m.label}</span>
                  <b className="sv-what">{m.what}</b>
                  <Outlets list={m.sources} reports={m.reports} />
                  {m.incident && <small><button className="lnk" onClick={() => c.openInc(m.incident!)}>Open the incident record</button></small>}
                </span>
              </li>
            );
          })}
        </ol>
        {t.incidents.length > 0 && (
          <div className="thv-inc">
            In our records:
            {t.incidents.map((id, k) => <button key={id} className="lnk" onClick={() => c.openInc(id)}>{t.incidents.length === 1 ? "open the incident" : `incident ${k + 1}`}</button>)}
            {t.open != null && <span className="dim"> · {t.open ? "still open" : "closed"}</span>}
          </div>
        )}
        <button className="sv-all" onClick={() => setAll(!all)} aria-expanded={all}>
          <I n={all ? "chevd" : "chevr"} />{all ? "Hide" : "Show"} every report ({t.reports}{t.folded ? `; ${t.folded} repeats folded` : ""})
        </button>
        {all && (
          <ol className="tl2">
            {t.days.map((g) => (
              <li key={g.day}>
                <div className="tl2-d">Day {dayNo(t.first, g.day)} · {fmtDay(g.day + " 00:00:00")}</div>
                {g.steps.map((s, j) => <Step key={j} s={s} c={c} />)}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

const dayNo = (first: string, day: string) => Math.round((Date.parse(day) - Date.parse(first.slice(0, 10))) / 864e5) + 1;

function Step({ s, c }: { s: ThreadStep; c: Console }) {
  const url = safeUrl(s.url);
  const col = STAGE_COL.Update;
  return (
    <div className="tl2-s" style={{ "--c": col } as React.CSSProperties}>
      <span className="tl2-t">{fmtTime(s.t)}</span>
      <span className="tl2-b">
        {url ? <a href={url} target="_blank" rel="noopener noreferrer">{s.title}<I n="ext" /></a> : <b>{s.title}</b>}
        <small>
          {[s.publisher, ...s.also].filter(Boolean).join(", ") || "News"}
          {(s as ThreadStep & { similar?: number }).similar ? <span className="tg-sim">+{(s as ThreadStep & { similar?: number }).similar} similar</span> : null}
          {s.added && <span className="tg-add">added source</span>}
          {s.incident && <button className="lnk" onClick={() => c.openInc(s.incident!)}>open incident</button>}
        </small>
        {/* 29 Nov (the owner: "I can only see the headlines, not where they are taken from"): the source named, and its article in full */}
        <span className="tl2-src">
          <em>Source</em><b>{s.publisher ?? (s.added ? "An added source" : "News")}</b>
          {s.doc && !s.doc.startsWith("item-") && <button type="button" className="dx-open" onClick={() => openDoc({ docId: s.doc!, publisher: s.publisher, t: s.t, title: s.title, url: s.url })}><I n="news" />Read the full article</button>}
          {url && <a className="dx-open" href={url} target="_blank" rel="noopener noreferrer"><I n="ext" />On the outlet&apos;s site</a>}
        </span>
      </span>
    </div>
  );
}
