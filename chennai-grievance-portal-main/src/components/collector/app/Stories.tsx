"use client";

import { useState } from "react";
import type { Overview as OverviewData } from "@/lib/collector/intel";
import type { Thread, ThreadStep } from "@/lib/collector/threads";
import { I } from "./icons";
import { Empty, SEV_HEX, fmtDate, fmtDay, fmtTime } from "./lib";
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
      <div className="ch"><I n="clock" /><h3 title={`The same event reported again as it developed, last ${days} days`}>Developing stories <span>· same event over time</span></h3>
        <span className="cnt-b">{total}</span>
        <button className="more" onClick={() => c.openStories(null)}>See all<I n="right" /></button>
      </div>
      <div className="fitlist">
        {threads.length ? threads.map((t) => (
          <button key={t.id} className="thr" onClick={() => c.openStories(t.id)} title="See what happened, in order">
            <span className="thr-h">
              <b title={t.title}>{t.title}</b>
              <span className="thr-n">{t.reports} reports · {t.outlets.length} outlet{t.outlets.length === 1 ? "" : "s"}</span>
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

/**
 * Full view: the stories on the left; on the right the chosen story as one timeline of what changed (AI, from its
 * reports), where it stands now, and every report behind it on demand, with repeats folded ("+3 similar").
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
  const ms = t.ai?.milestones ?? [];
  return (
    <div className="thv">
      <div className="thv-l">
        <div className="thv-note">
          {data.ai ? "Reports about the same event are joined into one story. News that only repeats (prices, forecasts, listings) is left out."
            : "Reports are threaded when they share a story or an incident, or when their headlines name the same people or places within four days."}
        </div>
        {list.map((x) => (
          <button key={x.id} className={`thv-i${x.id === t.id ? " on" : ""}`} onClick={() => pick(x.id)}>
            <b>{x.title}</b>
            <small>{where(x, c)} · {x.ai ? `${x.ai.milestones.length} developments` : `${x.reports} reports`} · {fmtDate(x.first)}{x.first.slice(0, 10) !== x.last.slice(0, 10) ? ` – ${fmtDate(x.last)}` : ""}</small>
          </button>
        ))}
      </div>
      <div className="thv-r">
        <h3>{t.title}</h3>
        <div className="thv-meta">
          <span><I n="pin" />{where(t, c)}</span>
          {t.catLabel && <span><I n="doc" />{t.catLabel}</span>}
          <span><I n="clock" />{fmtDate(t.first)} → {fmtDate(t.last)} ({span(t.hours)})</span>
          <span><I n="news" />{t.reports} reports · {t.outlets.length} outlet{t.outlets.length === 1 ? "" : "s"}</span>
        </div>
        {t.ai ? (
          <>
            <p className="sv-now"><I n="spark" /><b>Where it stands</b><span>{t.ai.now}</span></p>
            <ol className="sv-ms">
              {ms.map((m, k) => {
                const url = safeUrl(m.url);
                const col = STAGE_COL[m.label] ?? (k === 0 ? STAGE_COL["First report"] : "#15803D");
                return (
                  <li key={k} style={{ "--c": col } as React.CSSProperties}>
                    <span className="sv-when"><b>{fmtDate(m.t)}</b><small>{fmtTime(m.t)}</small></span>
                    <span className="sv-body">
                      <span className="stg" style={{ color: col, background: `${col}17` }}>{k === 0 ? "First report" : m.label}</span>
                      <b className="sv-what">{m.what}</b>
                      <small>
                        {url ? <a href={url} target="_blank" rel="noopener noreferrer">{m.title}<I n="ext" /></a> : m.title}
                        {m.publisher ? ` · ${m.publisher}` : ""}
                        {m.incident && <button className="lnk" onClick={() => c.openInc(m.incident!)}>open incident</button>}
                      </small>
                    </span>
                  </li>
                );
              })}
            </ol>
          </>
        ) : <div className="thv-sum"><b>What happened:</b> <StageStrip t={t} max={8} /></div>}
        {t.incidents.length > 0 && (
          <div className="thv-inc">
            In our records:
            {t.incidents.map((id, k) => <button key={id} className="lnk" onClick={() => c.openInc(id)}>{t.incidents.length === 1 ? "open the incident" : `incident ${k + 1}`}</button>)}
            {t.open != null && <span className="dim"> · {t.open ? "still open" : "closed"}</span>}
          </div>
        )}
        {t.ai && (
          <button className="sv-all" onClick={() => setAll(!all)} aria-expanded={all}>
            <I n={all ? "chevd" : "chevr"} />{all ? "Hide" : "Show"} every report ({t.reports}{t.folded ? `; ${t.folded} repeats folded` : ""})
          </button>
        )}
        {(all || !t.ai) && (
          <ol className="tl2">
            {t.days.map((g, k) => (
              <li key={g.day}>
                <div className="tl2-d">Day {dayNo(t.first, g.day)} · {fmtDay(g.day + " 00:00:00")}</div>
                {g.steps.map((s, j) => <Step key={j} s={s} c={c} first={k === 0 && j === 0} />)}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

const dayNo = (first: string, day: string) => Math.round((Date.parse(day) - Date.parse(first.slice(0, 10))) / 864e5) + 1;

function Step({ s, c, first }: { s: ThreadStep; c: Console; first: boolean }) {
  const url = safeUrl(s.url);
  const col = STAGE_COL[s.stage] ?? STAGE_COL.Update;
  return (
    <div className="tl2-s" style={{ "--c": col } as React.CSSProperties}>
      <span className="tl2-t">{fmtTime(s.t)}</span>
      <span className="tl2-b">
        <span className="stg" style={{ color: col, background: `${col}14` }}>{s.stage}</span>
        {url ? <a href={url} target="_blank" rel="noopener noreferrer" className={first ? "strong" : undefined}>{s.title}<I n="ext" /></a> : <b>{s.title}</b>}
        <small>
          {[s.publisher, ...s.also].filter(Boolean).join(", ") || "News"}
          {(s as ThreadStep & { similar?: number }).similar ? <span className="tg-sim">+{(s as ThreadStep & { similar?: number }).similar} similar</span> : null}
          {s.added && <span className="tg-add">added source</span>}
          {s.incident && <button className="lnk" onClick={() => c.openInc(s.incident!)}>open incident</button>}
        </small>
      </span>
    </div>
  );
}
