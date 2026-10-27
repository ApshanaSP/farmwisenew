"use client";

import { useEffect, useState } from "react";
import type { Insights, PatternDetail } from "@/lib/collector/insights";
import type { PatternBrief } from "@/lib/collector/aibrief";
import type { Overview as OverviewData } from "@/lib/collector/intel";
import { I } from "./icons";
import { Empty, SEV_HEX, SevChip, deptIcon, fmtDate, fmtShort, rel, sevTone, watchBrief, type Row } from "./lib";
import type { Console } from "./CollectorApp";
import { itemWhen, itemWhere } from "./Added";
import { StoriesCard } from "./Stories";
import { canSpeak, speak, stopSpeaking } from "./assistant/speech";
import { mdToHtml } from "@/lib/markdown";
import { METRICS, caption, pctChange, shortWindow, windowText } from "@/lib/reference/metrics";

export { mdToHtml };

const Loading = () => <div className="empty" style={{ margin: "auto" }}><I n="refresh" className="spin" />Preparing…</div>;

/** An AI write-up from /api/collector/brief (aibrief.ts): undefined while it is written, null when no model answered. */
function useAi<T>(qs: string | null): T | null | undefined {
  const [s, set] = useState<{ qs: string; v: T | null } | null>(null);
  useEffect(() => {
    if (!qs) return;
    return watchBrief<T>(`/api/collector/brief?${qs}`, (v) => set({ qs, v }));
  }, [qs]);
  return s && s.qs === qs ? s.v : undefined;
}

/** Suggested next steps: who does what (and why, when known). */
function NextSteps({ steps, title = "Suggested next steps" }: { steps: { who: string; what: string; why?: string }[]; title?: string }) {
  return (
    <div className="ai-next">
      <b>{title}</b>
      <ol>{steps.map((x, k) => <li key={k}><em>{x.who}</em><span>{x.what}{x.why ? <small>{x.why}</small> : null}</span></li>)}</ol>
    </div>
  );
}
const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** "about 1 a day", "about 1 every 3 days": what is normal for a place, in words. */
const usual = (perDay: number) => (perDay >= 0.95 ? `about ${Math.round(perDay)} a day` : `about 1 every ${Math.max(2, Math.round(1 / Math.max(perDay, 0.01)))} days`);

/** "Thousand Lights and Royapettah, Teynampet": the localities the reports name, then the zone. */
const placeLine = (p: Row) => {
  const loc = ((p.localities ?? []) as string[]).filter((l) => l.toLowerCase() !== String(p.zone_name ?? "").toLowerCase()).slice(0, 2);
  return [loc.join(" and "), p.zone_name].filter(Boolean).join(", ") || "the district";
};
const nounOf = (p: Row, n: number) => (p.noun ? (n === 1 ? p.noun[0] : p.noun[1]) : `${String(p.label).toLowerCase()} report${n === 1 ? "" : "s"}`);
/** A spike as one would say it: "4 road accidents in Thousand Lights, Teynampet on Tue 6 Oct". */
export const spikeLine = (e: Row, short = false) => {
  const n = Number(e.observed);
  return `${n} ${nounOf(e, n)} in ${short ? e.zone_name ?? "the district" : placeLine(e)} ${e.kind === "slow_rise" ? `in the ${e.days} days to ${day(e.date)}` : `on ${day(e.date)}`}`;
};
/** The localities a spike's reports name, other than the zone itself. */
const localities = (e: Row) => ((e.localities ?? []) as string[]).filter((l) => l.toLowerCase() !== String(e.zone_name ?? "").toLowerCase()).slice(0, 2).join(", ");
/** "Royapettah (Govt Royapettah Hospital)" -> "Govt Royapettah Hospital, Royapettah" */
const spot = (s: string) => {
  const m = String(s ?? "").match(/^(.*?)\s*\((.+)\)\s*$/);
  // "Rajiv Nagar, Rajiv Nagar, Kaladipet": each name once
  return [...new Set((m ? `${m[2]}, ${m[1]}` : String(s ?? "")).split(/\s*,\s*/).filter(Boolean))].join(", ");
};
/** A hotspot as one would say it: "Thefts and snatchings keep coming back near Egmore Railway Station, Egmore". */
const hotspotLine = (h: Row) => { const s = nounOf(h, 2); return `${s[0].toUpperCase()}${s.slice(1)} near ${spot(h.top_place)}`; };
/** The newest report behind it, in its own words. */
const Quote = ({ t }: { t: string | null }) => (t ? <>&ldquo;{t}&rdquo;</> : null);

// ================================================================ briefing ==

type Brief = Insights["briefing"];

/**
 * The briefing's opening: the period in three sentences (the pipeline's AI opening for the whole district, else the
 * rule-based headline), with a greeting and Listen in English or Tamil (the browser's own voices).
 */
function Opening({ b, c }: { b: Brief; c: Console }) {
  const [lang, setLang] = useState<"en" | "ta">("en");
  const [talking, setTalking] = useState(false);
  const [voice, setVoice] = useState(false);
  useEffect(() => { setVoice(canSpeak()); return () => stopSpeaking(); }, []);
  const ta = lang === "ta" && b.opening?.ta;
  const text = ta ? b.opening!.ta! : b.opening?.en ?? b.headline.join(" ");
  const h = new Date(c.now.replace(" ", "T")).getHours();
  const hello = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const listen = () => {
    if (talking) { stopSpeaking(); setTalking(false); return; }
    setTalking(speak(text, ta ? "ta-IN" : "en-IN", () => setTalking(false)));
  };
  return (
    <div className="bf2-open">
      <div className="bf2-open-h">
        <b>{hello}, Collector</b>
        {b.opening?.ta && (
          <span className="bf2-lang" role="group" aria-label="Language">
            <button className={lang === "en" ? "on" : ""} onClick={() => { stopSpeaking(); setTalking(false); setLang("en"); }}>English</button>
            <button className={lang === "ta" ? "on" : ""} onClick={() => { stopSpeaking(); setTalking(false); setLang("ta"); }}>தமிழ்</button>
          </span>
        )}
        {voice && <button className="bf2-listen" onClick={listen} title={talking ? "Stop" : "Read the briefing aloud"}>
          <I n={talking ? "stop" : "volume"} />{talking ? "Stop" : "Listen"}</button>}
      </div>
      <p lang={ta ? "ta" : "en"}>{text}</p>
      {b.opening && <small>Written by AI from today&apos;s figures; every number is checked against the data.</small>}
    </div>
  );
}

/** The three most urgent decisions; the rest fold away. */
function Decisions({ items, render }: { items: Brief["attention"]; render: (a: Brief["attention"][number], k: number) => React.ReactNode }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 3);
  return (
    <>
      <ol className="bf2-list">{shown.map(render)}</ol>
      {items.length > 3 && (
        <button className="bf2-more" onClick={() => setAll(!all)}>
          {all ? "Show only the top 3" : `Show ${items.length - 3} more that need you`}<I n={all ? "up" : "down"} />
        </button>
      )}
    </>
  );
}

/**
 * Page 2: the written briefing on the left; developing stories and department
 * follow-ups on the right. Incidents seen only in the news open from the briefing.
 */
export function BriefingPage({ ins, d, c }: { ins: Insights | null; d: OverviewData; c: Console }) {
  if (!ins) return <section className="p3"><article className="card" style={{ gridColumn: "1 / -1" }}><Loading /></article></section>;
  const b = ins.briefing;
  return (
    <section className="p3 bpage">
      <article className="card bf" style={{ gridColumn: "span 6", gridRow: "span 2" }}>
        <div className="ch"><I n="doc" /><h3>Collector&apos;s Briefing <span>· {ins.scope} · {c.periodLabel.toLowerCase()}</span></h3>
          <button className="more" onClick={() => c.showText("Collector's Briefing", b.md)} title="Read the whole briefing"><I n="doc" />Full text</button>
          <button className="more" onClick={() => download(`district-iq-briefing-${c.period}.md`, b.md)} title="Download as text"><I n="download" />Download</button>
          <button className="more" onClick={() => c.openWorkspace()} title="Save this view with a frozen copy of the briefing"><I n="layers" />Save</button>
        </div>
        {c.archived && <ArchivedBanner c={c} />}
        {c.archived ? <div className="bf-body md" dangerouslySetInnerHTML={{ __html: mdToHtml(c.archived.markdown) }} /> : (
          <div className="bf2">
            <Opening b={b} c={c} />
            <div className="bf2-stats">
              <Stat l="Reported" v={b.stats.reported} sub={b.stats.change == null ? "no earlier data" : b.stats.change === 0 ? "same as before" : `${b.stats.change > 0 ? "▲" : "▼"} ${Math.abs(b.stats.change)}% vs. ${c.period === "daily" ? "yesterday" : "previous period"}`}
                tone={b.stats.change != null && b.stats.change > 0 ? "bad" : "ok"} />
              <Stat l="Still open" v={b.stats.open} sub="incidents not yet closed" />
              <Stat l={`Past deadline · ${shortWindow(c.period)}`} v={b.stats.overdue} sub={caption("past_deadline", c.period)} tone={b.stats.overdue ? "bad" : "ok"} />
              <Stat l="Severe" v={b.stats.severe} sub={caption("severe", c.period)} tone={b.stats.severe ? "bad" : "ok"} />
            </div>

            <div className="bf2-cond">
              {b.env.rain != null && <span><I n="cloud" /><b>Rain</b> {b.env.rain} mm in 24 h</span>}
              {b.env.aqi != null && <span><I n="wind" /><b>Air</b> AQI {b.env.aqi} ({b.env.aqi <= 50 ? "good" : b.env.aqi <= 100 ? "satisfactory" : b.env.aqi <= 200 ? "moderate" : "poor"})</span>}
              {b.env.lakes != null && <span><I n="drop" /><b>Reservoirs</b> {b.env.lakes}% full</span>}
              {b.stats.newsOnly > 0 && (
                <button className="bf2-gap" onClick={c.openGaps} title="Incidents in the news with no department record">
                  <I n="news" /><b>{b.stats.newsOnly}</b> seen only in the news<I n="right" />
                </button>
              )}
            </div>
            {b.market.length > 0 && <div className="bf2-market"><I n="chart" /><span><b>Vegetable prices:</b> {b.market[0]}.</span></div>}

            <h4 className="bf2-h"><span>1</span>Decisions for you
              <small title={b.ranking ? "Priority = severity plus weighted signals (deadlines, sources, rain...). The weights learn from your Verify and Send back decisions." : undefined}>
                {b.attention.length ? `${b.attention.length} open incident${b.attention.length === 1 ? "" : "s"}, most urgent first` : "nothing right now"}
                {b.ranking && b.attention.length ? ` · ${b.ranking.text}` : ""}</small></h4>
            {b.attention.length ? (
              <Decisions items={b.attention} render={(a, k) => (
                  <li key={a.id} style={{ "--c": SEV_HEX[a.sev] } as React.CSSProperties}>
                    <div className="bf2-top">
                      <i className="bf2-n">{k + 1}</i>
                      <button className="bf2-t" onClick={() => c.openInc(a.id)} title="Open the incident">{a.title}</button>
                      <SevChip s={a.sev} />
                    </div>
                    <div className="bf2-where">
                      <span><I n="pin" />{a.zone ?? "Chennai"}</span><span><I n="gov" />{a.dept}</span><span>{a.status}</span>
                      {a.overdue && <span className="bf2-late">Past deadline</span>}
                    </div>
                    <div className="bf2-what"><b>What happened</b>{a.why.summary}{a.why.facts.length ? ` ${a.why.facts.join(" · ")}.` : ""}</div>
                    <div className="bf2-why">
                      <b>Why it needs you</b>
                      <ul>{a.why.attention.map((w) => <li key={w}>{w}</li>)}</ul>
                    </div>
                    {a.next && (
                      <div className="bf2-next">
                        <b>Next step</b>
                        <span>{a.next.text}{a.next.owner ? <> — <em>{a.next.owner}</em></> : null}{a.next.due ? <>, due <em>{fmtShort(a.next.due)}</em></> : null}</span>
                      </div>
                    )}
                    <div className="bf2-ev">Based on {a.evidence}{a.why.ai ? " · summary and next step written by AI from these records; check before acting" : ""}</div>
                  </li>
                )} />
            ) : <Empty>No open incident needs you in this scope. The departments are handling everything.</Empty>}
            {b.stats.handledByDepts > 0 && (
              <p className="bf2-rest"><I n="checkc" />{b.stats.handledByDepts.toLocaleString("en-IN")} other open incident{b.stats.handledByDepts === 1 ? " is" : "s are"} routine: the departments are handling {b.stats.handledByDepts === 1 ? "it" : "them"}, nothing to do.</p>
            )}

            {b.emerging.length > 0 && (
              <>
                <h4 className="bf2-h"><span>2</span>Unusual rises <small>more reports than normal for the place · click one to see what happened</small></h4>
                <div className="bf2-src">
                  {b.emerging.slice(0, 4).map((e, k) => (
                    <button key={k} onClick={() => c.openPattern({ kind: "spike", cat: e.cat, zone: e.zone != null ? Number(e.zone) : null, date: e.date })}>
                      <i className="spk" />
                      <b>{spikeLine(e)}</b>
                      <small>{e.example ? <><Quote t={e.example} /> · </> : null}normally {usual(Number(e.perDay ?? e.expected))}{e.kind === "slow_rise" ? " (slow rise)" : ""}</small>
                    </button>
                  ))}
                </div>
              </>
            )}

            <h4 className="bf2-h"><span>{b.emerging.length ? 3 : 2}</span>From added sources
              <small>{b.addedCount ? `${b.addedCount} item${b.addedCount === 1 ? "" : "s"} in the last ${b.addedDays} days` : `none in the last ${b.addedDays} days`}</small>
              {b.addedCount > 0 && <button className="lnk" onClick={() => c.openAdded()}>See all ›</button>}
            </h4>
            <div className="bf2-src">
              {b.fromSources.slice(0, 4).map((i) => (
                <button key={i.item_id} onClick={() => c.openItem(i)} title="Open the item and its source link">
                  <i className={i.is_incident ? "civic" : ""} />
                  <b>{i.title}</b>
                  <small>{[i.source, itemWhere(i), i.category_label, itemWhen(i.t, ins.now)].filter(Boolean).join(" · ")}</small>
                </button>
              ))}
            </div>
            <p className="bf-note">{b.method}</p>
          </div>
        )}
      </article>

      <article className="card" style={{ gridColumn: "span 3" }}><StoriesCard d={d} c={c} /></article>
      <article className="card" style={{ gridColumn: "span 3", gridRow: "span 2" }}><NewsOnlyCard ins={ins} c={c} /></article>
      <article className="card" style={{ gridColumn: "span 3" }}><DeptFollowUps ins={ins} c={c} /></article>
    </section>
  );
}

function Stat({ l, v, sub, tone }: { l: string; v: number; sub: string; tone?: "ok" | "bad" }) {
  return (
    <div className={`bf2-stat${tone ? " " + tone : ""}`}>
      <small>{l}</small>
      <b>{v.toLocaleString("en-IN")}</b>
      <span>{sub}</span>
    </div>
  );
}

function ArchivedBanner({ c }: { c: Console }) {
  const a = c.archived!;
  return (
    <div className="banner teal" style={{ margin: "0 14px 8px" }}>
      <I n="clock" />
      <span>Saved version: <b>{a.name} v{a.version}</b>, frozen {fmtShort(a.issued_at)} (data as of {fmtShort(a.as_of)}).</span>
      <button className="lnk" style={{ marginLeft: "auto" }} onClick={() => c.closeArchived()}>Back to live</button>
    </div>
  );
}

function DeptFollowUps({ ins, c }: { ins: Insights; c: Console }) {
  const [open, setOpen] = useState<string | null>(ins.deptActions[0]?.code ?? null);
  return (
    <>
      <div className="ch"><I n="tasks" /><h3>Department follow-ups <span>· what each department should do next</span></h3><span className="cnt-b">{ins.deptActions.length}</span></div>
      <div className="cb dfu">
        {ins.deptActions.length ? ins.deptActions.map((d) => (
          <div key={d.code} className={`dfu-d${open === d.code ? " on" : ""}`}>
            <button className="dfu-h" onClick={() => setOpen(open === d.code ? null : d.code)}>
              <span className="bic t-info" style={{ width: 30, height: 30 }}><I n={deptIcon(d.code)} /></span>
              <b>{d.name}</b>
              <span className="dfu-n" title="Open incidents">{d.open} open</span>
              {d.overdue > 0 && <span className="dfu-n late" title="Past deadline">{d.overdue} late</span>}
              {d.awaiting > 0 && <span className="dfu-n ok" title="Officer says done, waiting for a check">{d.awaiting} to check</span>}
              <I n={open === d.code ? "chevd" : "chevr"} />
            </button>
            {open === d.code && (
              <ul>
                {d.followUps.map((f) => (
                  <li key={f.id} onClick={() => c.openInc(f.id)}>
                    <i style={{ background: SEV_HEX[f.sev] }} />
                    <span><b>{f.title}</b>{f.next ? <small>{f.next.text}{f.next.due ? ` · due ${fmtShort(f.next.due)}` : ""}{f.overdue ? " · past deadline" : ""}</small> : null}</span>
                  </li>
                ))}
                <li className="dfu-all"><button className="lnk" onClick={() => c.setDept(d.code)}>Filter the dashboard to {d.name} ›</button></li>
              </ul>
            )}
          </div>
        )) : <Empty>No open work in this scope.</Empty>}
      </div>
    </>
  );
}

/** Page 2 card: incidents the news reported that no department has a record of, in the period and scope. */
function NewsOnlyCard({ ins, c }: { ins: Insights; c: Console }) {
  const rows = ins.gaps;
  return (
    <>
      <div className="ch"><I n="news" /><h3 title="Reported in the news, but no department has a record of it yet">News, no dept record</h3><span className="cnt-b">{rows.length}</span>
        {rows.length > 0 && <button className="more" onClick={c.openGaps}>See all<I n="right" /></button>}
      </div>
      <div className="cb gap-list">
        {rows.length ? rows.map((g) => (
          <button key={g.id} className="rt" onClick={() => c.openInc(g.id)}>
            <span className={`bic ${sevTone(g.sev)}`}><I n={deptIcon(g.dept)} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <b title={g.title}>{g.title || g.type}</b>
              <small>{g.zone_name ?? "Chennai"} · {rel(g.t, ins.now)}</small>
              <small className="gap-dept"><I n="gov" />Belongs to {g.dept_name ?? g.dept}</small>
            </span>
          </button>
        )) : <Empty>Every news report {c.period === "daily" ? "today" : "in this period"} has a department record.</Empty>}
      </div>
    </>
  );
}

/** Modal: incidents seen only in the news, with no department record. */
export function GapsBody({ ins, c }: { ins: Insights | null; c: Console }) {
  const [multi, setMulti] = useState(false);
  if (!ins) return <Loading />;
  const rows = ins.gaps.filter((g) => !multi || Number(g.outlet_count) >= 2);
  return (
    <>
      <div className="gap-bar">
        <span>Reported in the news, but no department has a record of it yet. Newest and most serious first.</span>
        <label className="tgl"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />Only stories in 2+ outlets</label>
        <span className="cnt-b">{rows.length}</span>
      </div>
      <div className="gap-list">
        {rows.length ? rows.map((g) => (
          <button key={g.id} className="rt" onClick={() => c.openInc(g.id)}>
            <span className={`bic ${sevTone(g.sev)}`}><I n={deptIcon(g.dept)} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <b title={g.title}>{g.title || g.type}</b>
              <small>{g.zone_name ?? "Chennai"} · {g.dept_name ?? g.dept} · {rel(g.t, ins.now)}</small>
              {g.suggested_action && <small style={{ color: "var(--accent-2)" }}>Suggested: {g.suggested_action}</small>}
            </span>
          </button>
        )) : <Empty>Every news report in this scope has a department record.</Empty>}
      </div>
    </>
  );
}

// ================================================================== trends ==

export type Pattern = { kind: "spike"; cat: string; zone: number | null; date: string } | { kind: "hotspot"; id: string } | { kind: "category"; cat: string };

/**
 * Page 3, district-wide and never filtered: which problems are rising, which taluks carry
 * the most unresolved work, unusual spikes, recurring hotspots and places that need checking.
 * Every row opens the detail behind it; nothing here changes the dashboard's filters.
 */
export function TrendsPage({ ins, c }: { ins: Insights | null; c: Console }) {
  if (!ins) return <section className="p3"><article className="card" style={{ gridColumn: "1 / -1" }}><Loading /></article></section>;
  const maxT = Math.max(1, ...ins.taluks.map((x) => x.open));
  return (
    <section className="p3 trends">
      <article className="card" style={{ gridColumn: "span 8" }}>
        <div className="ch"><I n="chart" /><h3>Which problems are rising? <span>· last 4 weeks compared with the 4 weeks before</span></h3></div>
        <Rising t={ins.trends.weekly} where={ins.trends.where} c={c} />
      </article>

      <article className="card" style={{ gridColumn: "span 4" }}>
        <div className="ch"><I n="pin" /><h3>Unresolved by taluk <span>· last 30 days</span></h3></div>
        <div className="tk-head"><span>Taluk</span><span>Open incidents</span><span title="Reports in the last 30 days against the 30 days before">Change</span></div>
        <div className="fitlist">
          {ins.taluks.filter((x) => x.open > 0).map((x) => {
            const d = pctChange(x.reported, x.prev); // none on a small base (metrics.ts)
            return (
              <button key={x.code} className="tk" onClick={() => c.openList({ status: "open", taluk: x.code, cat: "", dept: "", anyZone: true, scope: "30d", sort: "sev", dir: 1 }, `Still open in ${x.name} taluk, reported in the last 30 days`)}
                title={`See the open incidents in ${x.name} taluk`}>
                <span className="tk-l"><b>{x.name}</b><small title={`${METRICS.past_deadline.measure} · ${windowText("reported", "monthly")}`}>{x.severe ? `${x.severe} severe · ` : ""}{x.overdue} past deadline (30 days)</small></span>
                <span className="tk-b"><i style={{ width: `${(x.open / maxT) * 100}%` }} /></span>
                <b className="tk-v">{x.open}</b>
                <span className={`tk-d ${d != null && d > 0 ? "up" : d != null && d < 0 ? "down" : ""}`}
                  title={`${x.reported} incidents reported in the last 30 days, ${x.prev} in the 30 days before`}>{d == null || d === 0 ? "–" : `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}%`}</span>
              </button>
            );
          })}
          {/* incidents with no in-district taluk, so the ranking adds up to the district total */}
          {ins.talukUnassigned.open > 0 && (
            <button className="tk" onClick={() => c.openList({ status: "open", place: "notaluk", cat: "", dept: "", anyZone: true, scope: "30d", sort: "sev", dir: 1 }, "Still open with no taluk, reported in the last 30 days")}
              title="District-wide reports, places that could not be found, and places outside Chennai district">
              <span className="tk-l"><b>No taluk</b><small>district-wide or unknown{ins.talukUnassigned.severe ? ` · ${ins.talukUnassigned.severe} severe` : ""}</small></span>
              <span className="tk-b"><i style={{ width: `${(ins.talukUnassigned.open / Math.max(maxT, ins.talukUnassigned.open)) * 100}%`, background: "var(--text-3)" }} /></span>
              <b className="tk-v">{ins.talukUnassigned.open}</b>
              <span className="tk-d">–</span>
            </button>
          )}
        </div>
      </article>

      <article className="card" style={{ gridColumn: "span 4" }}>
        <div className="ch"><I n="bolt" /><h3>Unusual rises <span>· a day or a fortnight far above normal</span></h3><span className="cnt-b">{ins.patterns.emerging.length}</span></div>
        <div className="fitlist">
          {ins.patterns.emerging.length ? ins.patterns.emerging.map((e, k) => (
            <button key={k} className="pat" onClick={() => c.openPattern({ kind: "spike", cat: e.cat, zone: e.zone != null ? Number(e.zone) : null, date: e.date })}
              title={e.kind === "slow_rise" ? "See the reports behind this slow rise" : "See the reports behind this spike"}>
              <span className="bic t-high"><I n="bolt" /></span>
              <span className="pat-m">
                <b title={spikeLine(e)}>{spikeLine(e, true)}</b>
                <small title={`Normally ${usual(Number(e.perDay ?? e.expected))}`}>
                  {localities(e) ? `${localities(e)} · ` : ""}{e.example ? <Quote t={e.example} /> : e.kind === "slow_rise" ? `Slow rise over ${e.days} days` : `Normally ${usual(Number(e.perDay ?? e.expected))}`}
                </small>
              </span>
              <span className="pat-x" title={`Normally ${usual(Number(e.perDay ?? e.expected))}`}>{Math.round(Number(e.ratio))}×<small>usual</small></span>
              <I n="chevr" />
            </button>
          )) : <Empty>No unusual rises in the last three weeks.</Empty>}
        </div>
      </article>
      <article className="card" style={{ gridColumn: "span 4" }}>
        <div className="ch"><I n="refresh" /><h3>Recurring hotspots <span>· keeps coming back</span></h3><span className="cnt-b">{ins.patterns.hotspots.length}</span></div>
        <div className="fitlist">
          {ins.patterns.hotspots.length ? ins.patterns.hotspots.map((h) => (
            <button key={h.id} className="pat" onClick={() => c.openPattern({ kind: "hotspot", id: h.id })} title="See every incident at this spot">
              <span className="bic t-violet"><I n="pin" /></span>
              <span className="pat-m">
                <b title={`${h.label} · ${h.top_place}`}>{hotspotLine(h)}</b>
                <small title={`${h.incidents} since ${fmtDate(h.first_seen + " 00:00:00")} · ${h.open} open${h.zone_name ? ` · ${h.zone_name}` : ""}`}>
                  {h.open} open · {h.example ? <>latest: <Quote t={h.example} /></> : `${h.incidents} since ${fmtDate(h.first_seen + " 00:00:00")}`}
                </small>
              </span>
              <span className="pat-x" title="Incidents in the last 30 days">{h.incidents_30d}<small>in 30 d</small></span>
              <I n="chevr" />
            </button>
          )) : <Empty>No recurring hotspot.</Empty>}
        </div>
      </article>
      <article className="card" style={{ gridColumn: "span 4" }}>
        <LocationReview ins={ins} c={c} />
      </article>
    </section>
  );
}

/**
 * Open incidents of the last 30 days whose place nobody knows: a specific event reported only "in Chennai". Weather
 * warnings and city-wide news (no single place), incidents placed by their own map point or a place in the headline,
 * and towns outside the district are left out, and counted in the note (locreview.ts). The card shows the two counts
 * and the first few; the review list opens in its own window.
 */
function LocationReview({ ins, c }: { ins: Insights; c: Console }) {
  const r = ins.review;
  const placed = (r.placed ?? []) as Row[];
  return (
    <>
      <div className="ch"><I n="pin" /><h3 title="Specific incidents reported only as 'in Chennai': the map cannot show them">Locations needing review</h3>
        {(r.unplacedTotal > 0 || placed.length > 0) && <button className="more" onClick={c.openReview}>Review all<I n="right" /></button>}
      </div>
      <div className="lr2">
        <div className="lr2-stats">
          <button className="miss" onClick={c.openReview} title="Open the review list">
            <b>{r.unplacedTotal}</b><span>Place unknown<small>only &ldquo;Chennai&rdquo; is known</small></span>
          </button>
          <button onClick={c.openReview} title="Open the review list">
            <b>{placed.length}</b><span>Placed from the report<small>now on the map</small></span>
          </button>
        </div>
        <div className="fitlist lr2-list">
          {r.unplaced.length ? r.unplaced.map((i) => (
            <button key={i.id} className="lr2-row" onClick={() => c.openInc(i.id)} title={`${i.title || i.type}. Open the incident.`}>
              <i style={{ background: SEV_HEX[i.sev] ?? "var(--text-4)" }} />
              <span><b>{i.title || i.type}</b><small>{[i.type, rel(i.t, ins.now)].filter(Boolean).join(" · ")}</small></span>
            </button>
          )) : <Empty>Every open incident has a place on the map.</Empty>}
        </div>
      </div>
    </>
  );
}

/** Modal: the review list. Place unknown (open the incident to set it) and placed from the report (check it on the map). */
export function ReviewBody({ ins, c }: { ins: Insights | null; c: Console }) {
  const [tab, setTab] = useState<"missing" | "placed">("missing");
  const [find, setFind] = useState("");
  if (!ins) return <Loading />;
  const r = ins.review, k = r.counts;
  const placed = (r.placed ?? []) as Row[];
  const match = (i: Row) => !find.trim() || `${i.title} ${i.type} ${i.place ?? ""} ${i.zone_name ?? ""}`.toLowerCase().includes(find.trim().toLowerCase());
  const skipped = k ? [k.district ? `${k.district} city-wide reports` : null, k.located ? `${k.located} placed from their map point` : null,
    k.outside ? `${k.outside} outside Chennai` : null].filter(Boolean).join(", ") : "";
  const rows = (tab === "missing" ? r.unplaced : placed).filter(match);
  return (
    <div className="rv">
      <div className="rv-bar">
        <div className="seg" role="tablist" aria-label="Locations">
          <button role="tab" aria-selected={tab === "missing"} className={tab === "missing" ? "on" : ""} onClick={() => setTab("missing")}>Place unknown <b>{r.unplacedTotal}</b></button>
          <button role="tab" aria-selected={tab === "placed"} className={tab === "placed" ? "on" : ""} onClick={() => setTab("placed")}>Placed from the report <b>{placed.length}</b></button>
        </div>
        <label className="mk-find"><I n="search" /><input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find an incident or place…" aria-label="Find" /></label>
      </div>
      <p className="rv-note">
        {tab === "missing"
          ? <>Open incidents of the last 30 days reported only as &ldquo;in Chennai&rdquo;: the map cannot show them. Open one to see its reports and set the place.{skipped ? ` Not listed: ${skipped}.` : ""}</>
          : <>The pipeline had only &ldquo;Chennai&rdquo;, but the headline, its translation or the article names the place, so they are now on the map. Check that the place is right.</>}
      </p>
      <div className="rv-list">
        {rows.length ? rows.map((i) => (
          <div key={i.id} className="rv-row">
            <i style={{ background: SEV_HEX[i.sev] ?? "var(--text-4)" }} />
            <button className="rv-open" onClick={() => c.openInc(i.id)} title="Open the incident">
              <b>{i.title || i.type}</b>
              <small>{tab === "missing"
                ? [i.type, rel(i.t, ins.now), i.loc_verdict?.how, i.also?.length ? `${i.also.length + 1} reports` : null].filter(Boolean).join(" · ")
                : [i.place ? `${i.place}${i.zone_name && i.zone_name !== i.place ? `, ${i.zone_name}` : ""}` : i.zone_name, i.how, i.type, rel(i.t, ins.now)].filter(Boolean).join(" · ")}</small>
            </button>
            {tab === "placed" && <button className="btn sm plain" onClick={() => c.locate(i)} title="Show it on the map"><I n="target" />Map</button>}
            <button className="btn sm" onClick={() => c.openInc(i.id)}>Open<I n="chevr" /></button>
          </div>
        )) : <Empty>{find ? `Nothing matches "${find}".` : tab === "missing" ? "Every open incident has a place on the map." : "No incident was placed from its report."}</Empty>}
      </div>
    </div>
  );
}

/**
 * "Which problems are rising?": one row per category, sorted by change. Each row shows the
 * two numbers being compared as two bars (grey = the 4 weeks before, blue = the last 4 weeks),
 * the change in words, and the zone adding the most reports. A row opens its detail.
 */
function Rising({ t, where, c }: { t: Insights["trends"]["weekly"]; where: Insights["trends"]["where"]; c: Console }) {
  const n = t.keys.length;
  const rows = t.lines.map((l) => {
    const recent = l.values.slice(n - 4).reduce((a, b) => a + b, 0), before = l.values.slice(n - 8, n - 4).reduce((a, b) => a + b, 0);
    const chg = before ? Math.round(((recent - before) / before) * 100) : null;
    const state = chg == null ? "new" : chg >= 10 ? "up" : chg <= -10 ? "down" : "flat";
    return { ...l, recent, before, chg, state };
  }).filter((r) => r.recent + r.before > 0);
  rows.sort((a, b) => Number(a.cat === "OTHERS") - Number(b.cat === "OTHERS") || (b.chg ?? 999) - (a.chg ?? 999));
  const mx = Math.max(1, ...rows.map((r) => Math.max(r.recent, r.before)));
  const real = rows.filter((r) => r.cat !== "OTHERS" && r.before >= 5);
  const up = real.filter((r) => (r.chg ?? 0) >= 10), down = real.filter((r) => (r.chg ?? 0) <= -10);
  const WORD = (r: typeof rows[number]) => r.chg == null ? "New" : r.state === "up" ? `${r.chg}% more` : r.state === "down" ? `${Math.abs(r.chg)}% fewer` : "About the same";
  return (
    <div className="rs">
      <p className="rs-lead">
        {up.length ? <><b className="up">Rising:</b> {up.map((r) => `${r.label} (+${r.chg}%)`).join(", ")}. </> : <><b>Nothing is rising sharply</b> (no category up 10% or more). </>}
        {down.length ? <><b className="down">Falling:</b> {down.map((r) => `${r.label} (${r.chg}%)`).join(", ")}.</> : null}
      </p>
      <div className="rs-head" aria-hidden="true">
        <span>Problem</span>
        <span className="rs-key"><i className="b" />4 weeks before<i className="r" />Last 4 weeks</span>
        <span>Change</span><span>Most new reports in</span><span />
      </div>
      <div className="rs-body">
        {rows.map((r) => {
          const other = r.cat === "OTHERS";
          const w = where[r.cat];
          return (
            <button key={r.cat} className={`rs-row ${r.state}`} disabled={other}
              onClick={() => c.openPattern({ kind: "category", cat: r.cat })}
              title={other ? "Categories outside the top eight, together" : `See where and why ${r.label.toLowerCase()} is changing`}>
              <span className="rs-name" title={r.label}>{r.label}</span>
              <span className="rs-bars">
                <span><i className="b" style={{ width: `${(r.before / mx) * 100}%` }} /><em>{r.before.toLocaleString("en-IN")}</em></span>
                <span><i className="r" style={{ width: `${(r.recent / mx) * 100}%` }} /><em>{r.recent.toLocaleString("en-IN")}</em></span>
              </span>
              <span className={`rs-chg ${r.state}`}>{r.state === "up" ? "▲ " : r.state === "down" ? "▼ " : ""}{WORD(r)}</span>
              <span className="rs-where">{!other && w ? <>{w.name}<small> +{w.recent - w.before}</small></> : <span className="dim">—</span>}</span>
              {!other ? <I n="chevr" /> : <span />}
            </button>
          );
        })}
      </div>
      <p className="rs-foot">A change under 10% is shown as &ldquo;about the same&rdquo;. Click a problem for what is behind it, its weekly trend and its incidents.</p>
    </div>
  );
}

/**
 * Modal: one unusual spike, recurring hotspot or category trend. Left: what is really happening (AI, from the incidents
 * behind it; the rules' summary until then or without a model), the counts as a chart, the places, and suggested next
 * steps. Right: every incident behind it.
 */
export function PatternBody({ p, c }: { p: Pattern; c: Console }) {
  const [d, setD] = useState<PatternDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const q = new URLSearchParams(p.kind === "spike" ? { kind: "spike", cat: p.cat, date: p.date, ...(p.zone ? { zone: String(p.zone) } : {}) }
    : p.kind === "hotspot" ? { kind: "hotspot", id: p.id } : { kind: "category", cat: p.cat }).toString();
  const ai = useAi<PatternBrief>(`${q.replace(/^kind=/, "kind=pattern&what=")}`);
  useEffect(() => {
    fetch(`/api/collector/pattern?${q}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not load it.");
      setD(j);
    }).catch((e) => setErr(e.message));
  }, [q]);
  if (err) return <Empty>{err}</Empty>;
  if (!d) return <Loading />;
  const icon = d.kind === "spike" ? "bolt" : d.kind === "hotspot" ? "pin" : "chart";
  return (
    <div className="pt">
      <div className="pt-l">
        <div className="pt-h"><span className={`bic ${d.kind === "spike" ? "t-high" : d.kind === "hotspot" ? "t-violet" : "t-info"}`}><I n={icon} /></span>
          <span><b>{d.title}</b><small>{d.when}</small></span></div>
        <div className="pt-stats">{d.stats.map((s) => <div key={s.l}><small>{s.l}</small><b>{s.v}</b></div>)}</div>
        <div className="ai-box pt-ai">
          <span className="ai-tag"><I n="ai" />What is happening{ai ? <small>AI · {ai.at} · from the {d.incidents.length} incidents</small> : null}</span>
          {ai ? (
            <>
              <p>{ai.what}</p>
              {ai.cause && <p className="ai-cause"><b>Shared cause</b>{ai.cause}</p>}
            </>
          ) : (
            <>
              {ai === undefined && <p className="ai-wait">Reading the {d.incidents.length} incidents behind it…</p>}
              <ul className="pt-lead">{d.lead.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          )}
        </div>
        <div className="pt-sec"><b>{d.seriesTitle}</b><PatChart d={d} /></div>
        {d.places.length > 0 && (
          <div className="pt-sec"><b>{"placesTitle" in d && d.placesTitle ? d.placesTitle : "Where"}</b>
            <div className="pt-places">{d.places.map((x) => <span key={x.name}>{x.name}<em>{d.kind === "category" ? `+${x.n}` : x.n}</em></span>)}</div>
          </div>
        )}
        {ai && ai.next.length ? <NextSteps steps={ai.next} />
          : d.next ? <NextSteps title="Suggested next step" steps={[{ who: "Standard procedure", what: d.next }]} /> : null}
      </div>
      <div className="pt-r">
        <div className="iv-t"><I n="doc" />The incidents<span>{d.incidents.length}{d.incidents.length >= 60 ? "+" : ""} · newest first · click to open</span></div>
        <div className="pt-list">
          {d.incidents.map((i: Row) => (
            <button key={i.id} className="pt-i" onClick={() => c.openInc(i.id)} style={{ "--c": SEV_HEX[i.sev] } as React.CSSProperties}>
              <span className="pt-i-h"><b>{i.title || i.type}</b><SevChip s={i.sev} /></span>
              <span className="pt-i-s">{i.plain?.summary}{i.plain?.facts?.length ? ` ${i.plain.facts.slice(0, 2).join(" · ")}.` : ""}</span>
              <span className="pt-i-m">{fmtShort(i.t)} · {i.status}{Number(i.open) ? "" : " (closed)"} · {i.dept_name ?? i.dept}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The pattern's counts as bars. Dates are written only where they fit (the highlighted days' first and last, the ends,
 * then evenly spaced), the highlighted bars carry their number, and a dashed line marks the usual level.
 */
function PatChart({ d }: { d: PatternDetail }) {
  const s = d.series, N = s.length;
  const usualV = d.usual != null && d.usual > 0 ? d.usual : null;
  const mx = Math.max(1, ...s.map((x) => x.n), usualV ?? 0);
  const short = (l: string) => (d.kind === "spike" ? l.replace(/^\w+ /, "") : l);
  const gap = N <= 8 ? 1 : Math.ceil(N / 6);
  const hl = s.map((x, k) => (x.hl ? k : -1)).filter((k) => k >= 0);
  const want = [...(hl.length ? [hl[0], hl[hl.length - 1]] : []), N - 1, 0];
  for (let k = 0; k < N; k += gap) want.push(k);
  const shown = new Set<number>();
  for (const k of want) if (![...shown].some((j) => Math.abs(j - k) < gap)) shown.add(k);
  const usualText = usualV == null ? "" : d.kind === "spike" ? (usualV >= 0.95 ? `about ${Math.round(usualV)} a day` : `about 1 every ${Math.max(2, Math.round(1 / usualV))} days`)
    : `${Math.round(usualV)} a week`;
  return (
    <div className={`pc ${d.kind}`}>
      <div className="pc-bars">
        {usualV != null && <span className="pc-usual" style={{ bottom: `${(usualV / mx) * 100}%` }}><em>Usual: {usualText}</em></span>}
        {s.map((x, k) => (
          <span key={k} className={x.hl ? "hl" : ""} title={`${x.label}: ${x.n}`}>
            <em>{x.n && (x.hl || N <= 14 || x.n === mx) ? x.n : ""}</em>
            <i style={{ height: `${x.n ? Math.max(4, (x.n / mx) * 100) : 1.5}%` }} />
          </span>
        ))}
      </div>
      <div className="pc-axis" aria-hidden="true">
        {s.map((x, k) => <span key={k} className={x.hl ? "hl" : ""}>{shown.has(k) ? <small>{short(x.label)}</small> : null}</span>)}
      </div>
    </div>
  );
}

// ================================================================= markets ==

/** Rs per quintal to ₹ per kg: whole rupees from ₹10 up, one decimal below. */
const kg = (v: number | null | undefined, dec?: number) => (v == null ? "—" : `₹${(v / 100).toFixed(dec ?? (v >= 1000 ? 0 : 1))}`);

/**
 * Mandi prices. "Chennai markets" compares each Chennai market (AGMARKNET's Uzhavar Sandhai
 * reports) commodity by commodity; a market's column opens its own price list. The weekly
 * views average the districts around Chennai or the whole state.
 */
export function MarketsCard({ ins, c, full }: { ins: Insights | null; c: Console; full?: boolean }) {
  const [scope, setScope] = useState<"list" | "markets" | "chennai" | "tamilNadu">(full ? "markets" : "list");
  const [market, setMarket] = useState<string | null>(null);
  const head = (
    <div className="ch"><I n="chart" /><h3>Vegetable and fruit prices</h3>
      <div className="seg sm" style={{ marginLeft: "auto" }}>
        <button className={scope === "list" ? "on" : ""} onClick={() => setScope("list")} title="One line per vegetable or fruit: average price, change, cheapest and dearest market">Prices today</button>
        <button className={scope === "markets" ? "on" : ""} onClick={() => setScope("markets")} title="Every Chennai market side by side (Uzhavar Sandhai farmer markets)">Compare markets</button>
        <button className={scope === "chennai" ? "on" : ""} onClick={() => setScope("chennai")} title="Weekly average over Thiruvallur, Kancheepuram and Chengalpattu">Around Chennai</button>
        <button className={scope === "tamilNadu" ? "on" : ""} onClick={() => setScope("tamilNadu")}>Tamil Nadu</button>
      </div>
      {!full && <button className="more" style={{ marginLeft: 0 }} onClick={() => c.openMarkets()} title="Every commodity at every market, full screen">Full screen<I n="expand" /></button>}
    </div>
  );
  if (!ins) return <>{head}<Loading /></>;
  return (
    <>
      {head}
      <div className={`cb mk-cb${full ? " mk-full" : ""}`}>
        {scope === "list" ? <PriceList m={ins.markets.byMarket} />
          : scope === "markets" ? <ByMarket m={ins.markets.byMarket} c={c} full={full} market={market} setMarket={setMarket} />
            : <Weekly ins={ins} scope={scope} />}
      </div>
    </>
  );
}

/**
 * The simple view: one line per vegetable or fruit sold in two or more Chennai markets: the average price, how it moved
 * since the last report, where it is cheapest and dearest, and its last two weeks. Searchable, sortable by movement.
 */
function PriceList({ m }: { m: ByM }) {
  const [find, setFind] = useState("");
  const [sort, setSort] = useState<"name" | "up" | "down">("name");
  if (!m.markets.length) return <Empty>No Chennai market prices yet. Open Data sources and run AGMARKNET.</Empty>;
  const short = (k: string) => k.replace(/\s*Uzhavar Sandhai$/i, "");
  const rows = m.commodities.filter((x) => x.markets >= 2 && x.avg != null && (!find.trim() || x.commodity.toLowerCase().includes(find.trim().toLowerCase())))
    .map((x) => {
      const at = Object.entries(x.prices).sort((a, b) => a[1].price - b[1].price);
      // the average of the markets' daily prices, for the trend line
      const len = Math.max(0, ...Object.values(x.prices).map((p) => p.series.length));
      const trend = Array.from({ length: len }, (_, k) => {
        const v = Object.values(x.prices).map((p) => p.series[k]).filter((y): y is number => y != null);
        return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
      }).filter((y): y is number => y != null);
      return { ...x, chg: x.avgPrev ? ((x.avg! - x.avgPrev) / x.avgPrev) * 100 : null, lo: at[0], hi: at[at.length - 1], trend };
    })
    .sort((a, b) => sort === "name" ? a.commodity.localeCompare(b.commodity) : sort === "up" ? (b.chg ?? -999) - (a.chg ?? -999) : (a.chg ?? 999) - (b.chg ?? 999));
  const up = rows.filter((r) => (r.chg ?? 0) >= 5).length, down = rows.filter((r) => (r.chg ?? 0) <= -5).length;
  return (
    <>
      <div className="mk-bar">
        <label className="mk-find"><I n="search" /><input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a vegetable or fruit…" aria-label="Find a commodity" /></label>
        <div className="seg sm" role="group" aria-label="Order">
          <button className={sort === "name" ? "on" : ""} onClick={() => setSort("name")}>A–Z</button>
          <button className={sort === "up" ? "on" : ""} onClick={() => setSort("up")} title="Biggest price rises first">Rising first{up ? ` (${up})` : ""}</button>
          <button className={sort === "down" ? "on" : ""} onClick={() => setSort("down")} title="Biggest price falls first">Falling first{down ? ` (${down})` : ""}</button>
        </div>
        <span className="mk-date" title="AGMARKNET, Uzhavar Sandhai farmer markets">₹ per kg{m.latest ? ` · ${fmtDate(m.latest + " 00:00:00")}` : ""} · {m.markets.length} farmer markets · AGMARKNET</span>
      </div>
      <div className="mk-scroll">
        <table className="mk pl">
          <thead><tr><th>Vegetable or fruit</th><th className="r">Average</th><th className="r">Change</th><th>Cheapest at</th><th>Dearest at</th><th>2 weeks</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.commodity}>
                <td className="ev">{x.commodity}<small className="dim"> · {x.markets} markets</small></td>
                <td className="num r"><b>{kg(x.avg)}</b></td>
                <td className="r">{x.chg == null || Math.abs(x.chg) <= 0.5 ? <span className="chg">no change</span> : <Chg v={x.chg} />}</td>
                <td><span className="pl-at lo"><b>{kg(x.lo[1].price)}</b>{short(x.lo[0])}</span></td>
                <td>{x.hi[0] !== x.lo[0] ? <span className="pl-at hi"><b>{kg(x.hi[1].price)}</b>{short(x.hi[0])}</span> : <span className="dim">same everywhere</span>}</td>
                <td><MiniSpark vals={x.trend} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty>{find ? <>No item matches &quot;{find}&quot;.</> : "No item is sold in two or more Chennai markets."}</Empty>}
      </div>
      <p className="mk-foot">Red ▲ = price went up since the market&apos;s last report (hurts households), green ▼ = went down. &ldquo;Compare markets&rdquo; shows every market side by side. Koyambedu does not report to AGMARKNET.</p>
    </>
  );
}

export function MarketsFull({ ins, c }: { ins: Insights | null; c: Console }) {
  return <div className="card mk-modal"><MarketsCard ins={ins} c={c} full /></div>;
}

type ByM = Insights["markets"]["byMarket"];

function ByMarket({ m, c, full, market, setMarket }: { m: ByM; c: Console; full?: boolean; market: string | null; setMarket: (k: string | null) => void }) {
  const [find, setFind] = useState("");
  if (!m.markets.length) return <Empty>No Chennai market prices yet. Open Data sources and run AGMARKNET.</Empty>;
  const one = market ? m.markets.find((x) => x.key === market) : null;
  const match = (x: { commodity: string }) => !find.trim() || x.commodity.toLowerCase().includes(find.trim().toLowerCase());
  const bar = (
    <div className="mk-bar">
      <label className="mk-find"><I n="search" /><input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a vegetable or fruit…" aria-label="Find a commodity" /></label>
      {!one && <span className="mk-key"><i className="lo" />Cheapest market<i className="hi" />Dearest market</span>}
      <span className="mk-date">₹ per kg{m.latest ? ` · prices of ${fmtDate(m.latest + " 00:00:00")}` : ""} · Uzhavar Sandhai farmer markets</span>
    </div>
  );
  if (one) {
    const rows = m.commodities.filter((x) => x.prices[one.key] && match(x));
    return (
      <>
        <div className="mk-back">
          <button className="btn sm plain" onClick={() => setMarket(null)}><I n="chevl" />All markets</button>
          <b>{one.key}</b><span className="dim">{one.area === "Chennai city" ? `Chennai city${one.zone ? ` · ${c.zoneNameOf(one.zone) ?? `Zone ${one.zone}`} zone` : ""}` : "Suburbs"} · {rows.length} items · reported {fmtDate(one.latest + " 00:00:00")}</span>
        </div>
        {bar}
        <div className="mk-scroll">
          <table className="mk mk2">
            <thead><tr><th>Commodity</th><th className="r">Price</th><th className="r">Range</th><th className="r">Since last report</th><th className="r">vs. Chennai average</th><th>Last 14 days</th></tr></thead>
            <tbody>
              {rows.map((x) => {
                const p = x.prices[one.key];
                const vsAvg = x.avg && x.markets > 1 ? ((p.price - x.avg) / x.avg) * 100 : null;
                return (
                  <tr key={x.commodity}>
                    <td className="ev">{x.commodity}</td>
                    <td className="num r"><b>{kg(p.price)}</b></td>
                    <td className="num r dim">{p.lo != null && p.hi != null && p.lo !== p.hi ? `${kg(p.lo, 0)}–${kg(p.hi, 0)}` : "—"}</td>
                    <td className="r"><Chg v={p.prev ? ((p.price - p.prev) / p.prev) * 100 : null} /></td>
                    <td className="r">{vsAvg == null ? <span className="dim">only here</span> : <Chg v={vsAvg} word={vsAvg > 0.5 ? "dearer" : vsAvg < -0.5 ? "cheaper" : "same"} />}</td>
                    <td><MiniSpark vals={p.series.filter((v): v is number => v != null)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    );
  }
  // city markets first, then the suburbs; items sold in one market only are in the full table
  const city = m.markets.filter((k) => k.area === "Chennai city"), sub = m.markets.filter((k) => k.area !== "Chennai city");
  const cols = [...city, ...sub];
  const rows = m.commodities.filter((x) => x.markets >= (full ? 1 : 2) && match(x));
  const moves = m.commodities.filter((x) => x.avg != null && x.avgPrev && x.markets >= 2)
    .map((x) => ({ n: x.commodity, v: ((x.avg! - x.avgPrev!) / x.avgPrev!) * 100 })).filter((x) => Math.abs(x.v) >= 5).sort((a, b) => b.v - a.v);
  const upM = moves.filter((x) => x.v > 0).slice(0, 3), downM = moves.filter((x) => x.v < 0).slice(-3).reverse();
  return (
    <>
      {(upM.length > 0 || downM.length > 0) && (
        <div className="mk-moves">
          <b>Since the last report:</b>
          {upM.map((x) => <span key={x.n} className="up">{x.n} ▲{x.v.toFixed(0)}%</span>)}
          {downM.map((x) => <span key={x.n} className="down">{x.n} ▼{Math.abs(x.v).toFixed(0)}%</span>)}
        </div>
      )}
      {bar}
      <div className="mk-scroll">
        <table className="mk mx">
          <thead>
            <tr className="mx-g">
              <th rowSpan={2}>Commodity</th>
              {city.length > 0 && <th colSpan={city.length}>Chennai city</th>}
              {sub.length > 0 && <th colSpan={sub.length} className="sub">Suburbs</th>}
              <th colSpan={2} className="avg">All markets</th>
            </tr>
            <tr>
              {cols.map((k) => (
                <th key={k.key} className={`mx-h${k.area !== "Chennai city" ? " sub" : ""}`}>
                  <button onClick={() => setMarket(k.key)} title={`${k.key}: ${k.commodities} items, reported ${fmtDate(k.latest + " 00:00:00")}. Click for its full price list.`}>
                    {k.key.replace(/\s*Uzhavar Sandhai$/i, "")}
                  </button>
                </th>
              ))}
              <th className="avg r">Average</th><th className="avg r">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const vals = Object.values(x.prices).map((p) => p.price);
              const lo = Math.min(...vals), hi = Math.max(...vals);
              const chg = x.avg != null && x.avgPrev ? ((x.avg - x.avgPrev) / x.avgPrev) * 100 : null;
              return (
                <tr key={x.commodity}>
                  <td className="ev">{x.commodity}</td>
                  {cols.map((k) => {
                    const p = x.prices[k.key];
                    if (!p) return <td key={k.key} className="num mx-c none" title={`${x.commodity} was not reported at ${k.key}`}>–</td>;
                    const cls = vals.length >= 3 && lo !== hi ? (p.price === lo ? " lo" : p.price === hi ? " hi" : "") : "";
                    return (
                      <td key={k.key} className={`num mx-c${cls}`}
                        title={`${x.commodity} at ${k.key}: ${kg(p.price)}/kg on ${fmtDate(p.date + " 00:00:00")}` +
                          (p.lo != null && p.hi != null ? ` (range ${kg(p.lo)}–${kg(p.hi)})` : "") + (p.prev ? `; previous report ${kg(p.prev)}` : "")}>
                        <span>{kg(p.price)}</span>
                      </td>
                    );
                  })}
                  <td className="num r avg"><b>{kg(x.avg)}</b></td>
                  <td className="r avg">{chg == null || Math.abs(chg) <= 0.5 ? <span className="dim">–</span> : <Chg v={chg} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <Empty>No item matches &quot;{find}&quot;.</Empty>}
      </div>
      <p className="mk-foot">Click a market name for its full price list. Red = price went up (hurts households), green = went down. Koyambedu does not report to AGMARKNET.</p>
    </>
  );
}

function Weekly({ ins, scope }: { ins: Insights; scope: "chennai" | "tamilNadu" }) {
  const wk = ins.markets.weekly[scope];
  const daily = new Map((scope === "chennai" ? ins.markets.chennai : ins.markets.tamilNadu).commodities.map((x) => [x.commodity, x]));
  const latest = (scope === "chennai" ? ins.markets.chennai : ins.markets.tamilNadu).latest;
  return (
    <>
      {wk.length ? (
        <div className="mk-scroll">
        <table className="mk">
          <thead><tr><th>Commodity</th><th>Latest day</th><th>This week</th><th>vs. last week</th><th>vs. last month</th><th>8 weeks</th></tr></thead>
          <tbody>
            {wk.map((m) => {
              const d = daily.get(m.commodity);
              const avg = m.series.reduce((a, b) => a + b, 0) / m.series.length;
              const lvl = m.price > avg * 1.1 ? ["HIGH", "#F2555A"] : m.price < avg * 0.9 ? ["LOW", "#35C28C"] : ["NORMAL", "#6F82A6"];
              return (
                <tr key={m.commodity} style={{ cursor: "default" }}>
                  <td className="ev">{m.commodity} <span className="lvl sm" style={{ color: lvl[1] }}>{lvl[0]}</span></td>
                  <td className="num">{d ? kg(d.price) : "—"}<small className="dim"> {d ? fmtDate(d.date + " 00:00:00") : ""}</small></td>
                  <td className="num"><b>{kg(m.price)}</b></td>
                  <td><Chg v={m.chgWeek} /></td>
                  <td><Chg v={m.chgMonth} /></td>
                  <td><MiniSpark vals={m.series} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      ) : <Empty>No AGMARKNET prices yet. Open Data sources and run AGMARKNET.</Empty>}
      <p className="bf-note" style={{ marginTop: 6 }}>
        Weekly averages over {scope === "chennai" ? "the districts around Chennai (Thiruvallur, Kancheepuram, Chengalpattu)" : "all reporting Tamil Nadu districts"}.
        {latest ? ` Daily prices up to ${fmtDate(latest + " 00:00:00")}.` : ""} A rise is marked red: it hurts households.
      </p>
    </>
  );
}

function Chg({ v, word }: { v: number | null; word?: string }) {
  if (v == null) return <span className="dim">—</span>;
  const up = v > 0.5, down = v < -0.5;
  if (!up && !down) return <span className="chg">no change</span>;
  return <span className={`chg ${up ? "up" : "down"}`}>{up ? "▲" : "▼"} {Math.abs(v).toFixed(0)}%{word ? ` ${word}` : ""}</span>;
}

function MiniSpark({ vals }: { vals: number[] }) {
  if (vals.length < 2) return <span className="dim">—</span>;
  const W = 90, H = 24, mx = Math.max(...vals), mn = Math.min(...vals);
  const x = (i: number) => 2 + (i * (W - 4)) / (vals.length - 1), y = (v: number) => 2 + (1 - (v - mn) / (mx - mn || 1)) * (H - 4);
  return (
    <svg width={W} height={H} aria-hidden="true">
      <path d={vals.map((v, i) => `${i ? "L" : "M"}${x(i)} ${y(v)}`).join(" ")} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth="1.6" />
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r="2.4" style={{ fill: "var(--accent)" }} />
    </svg>
  );
}

// ------------------------------------------------------------------ utils --

export function download(name: string, text: string, type = "text/markdown;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

