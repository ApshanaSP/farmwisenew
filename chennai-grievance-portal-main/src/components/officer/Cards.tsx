"use client";

/* The officer page's cards under the map. Each takes the console context `c`; the look is the Collector console's (collector.css, marina.css). */
import { useState, type CSSProperties } from "react";
import { I } from "@/components/collector/app/icons";
import { OfficerCard } from "@/components/collector/app/Overview";
import { Chart, Empty, HBars, fmtDate, fullTitle, rel, type Row } from "@/components/collector/app/lib";
import { FEEDBACK_LABEL, STAGE_CLASS, STAGE_LABEL, STAGE_SHORT, type FeedbackKind, type Stage } from "@/lib/officer/stages";
import { labelLower } from "@/lib/period/day";
import type { DeptBriefing } from "@/lib/officer/insights";
import { bucketLabels } from "./format";
import type { Ctx } from "./OfficerApp";

// ------------------------------------------------------------ small parts --

/** Stage chip; a grievance the Collector sent back shows "Returned" (in the table, instead of "In action"). */
export function StageChip({ r, compact }: { r: Row; compact?: boolean }) {
  const s = r.stage as Stage;
  const returned = r.returned && (s === "action" || s === "approved");
  // a closed case the Collector reopened reads "Reopened"; work sent back before it was closed stays "Returned"
  const word = (r as Row & { reopened?: boolean }).reopened ? "Reopened" : "Returned";
  const note = returned ? `${word} by the Collector${r.returnNote ? `: ${r.returnNote}` : ""}` : undefined;
  if (compact && returned) return <span className="chip sev-high" title={note}><I n="refresh" />{word}</span>;
  if (compact) return <span className={`st ${STAGE_CLASS[s] ?? "st-open"}`} title={STAGE_LABEL[s]}>{STAGE_SHORT[s] ?? s}</span>;
  return (
    <>
      <span className={`st ${STAGE_CLASS[s] ?? "st-open"}`}>{STAGE_LABEL[s] ?? s}</span>
      {returned ? <> <span className="chip sev-high" title={note}>{word}</span></> : null}
    </>
  );
}

/** The one thing the officer can do next: approve a new grievance, or complete and send one in action. */
export function NextStep({ r, c }: { r: Row; c: Pick<Ctx, "busy" | "approve" | "openSend"> }) {
  const busy = c.busy.has(r.id);
  const run = (e: React.MouseEvent, f: () => void) => { e.stopPropagation(); f(); };
  switch (r.stage as Stage) {
    case "new":
      return <button className="btn sm" disabled={busy} onClick={(e) => run(e, () => c.approve(r))}><I n="check" />Approve</button>;
    case "approved":
    case "action":
      // severe work goes to the Collector; the department closes everything else itself
      return r.sev === "Severe"
        ? <button className="btn sm ok" disabled={busy} onClick={(e) => run(e, () => c.openSend(r))}><I n="send" />Complete &amp; send</button>
        : <button className="btn sm ok" disabled={busy} onClick={(e) => run(e, () => c.openSend(r))}><I n="check" />Complete &amp; close</button>;
    case "sent":
      // sent for the Collector's verification (severe) or approval (any other): it waits for the Collector's decision
      return <span className="dim" style={{ fontSize: 12.5 }}>Awaiting Collector</span>;
    default:
      return <span className="chip sev-low"><I n="check" />Verified</span>;
  }
}

/** Where the grievance came from, as compact icons with counts (hover for the words). */
export function SourceIcons({ r }: { r: Row }) {
  const s = String(r.sources ?? "").split("|");
  const n = Number(r.complaints), o = Number(r.outlets);
  const out: React.ReactNode[] = [];
  if (n > 0 || s.includes("grievance")) out.push(<span key="g" className="osi chip-portal" title={`Grievance portal: ${n} citizen complaint${n === 1 ? "" : "s"}`}><I n="app" />{n || ""}</span>);
  if (o > 0 || s.includes("news")) out.push(<span key="n" className="osi chip-src" title={`News: ${o} outlet${o === 1 ? "" : "s"}`}><I n="news" />{o || ""}</span>);
  if (s.includes("police")) out.push(<span key="p" className="osi chip-pol" title="Police record"><I n="shield" /></span>);
  if (s.includes("pwd")) out.push(<span key="w" className="osi chip-src" title="PWD field record"><I n="doc" /></span>);
  return out.length ? <>{out}</> : <span className="dim">—</span>;
}

// ------------------------------------------------------------------ news --

export type NewsTab = "news" | "gaps";

/**
 * Latest news for the department, as the Collector's Overview card: the news linked to the department's incidents, and (a tab) the
 * department's incidents seen only in the news, with no department record yet (the Collector's "Only in the news", filtered).
 */
export function NewsCard({ c, gaps, gapsFailed, tab, setTab, style }: {
  c: Ctx; gaps: DeptBriefing | null | undefined; gapsFailed?: boolean; tab: NewsTab; setTab: (t: NewsTab) => void; style?: CSSProperties;
}) {
  const seen = new Set<string>();
  const news = (c.ov.news as Row[]).filter((r) => { const t = fullTitle(r).toLowerCase(); return seen.has(t) ? false : (seen.add(t), true); });
  const when = c.ov.period === "daily" ? labelLower(c.ov.periodInfo.label) : "in this period";
  return (
    <article className="card a-brief ofc-news" id="ofc-news" style={style}>
      <div className="ch"><I n="news" /><h2>Latest news</h2>
        {tab === "news" && news.length > 0 && <button className="more" onClick={c.openNewsAll}>See more<I n="right" /></button>}
      </div>
      <div className="btabs" role="tablist" aria-label="News">
        <button role="tab" aria-selected={tab === "news"} className={tab === "news" ? "on" : ""} onClick={() => setTab("news")}
          title={`News reports linked to ${c.dept.short} incidents`}>In the news <b className="tab-n">{news.length}</b></button>
        <button role="tab" aria-selected={tab === "gaps"} className={`${tab === "gaps" ? "on" : ""}${gaps?.gapsTotal ? " warn" : ""}`} onClick={() => setTab("gaps")}
          title={`${c.dept.short} incidents seen only in the news, with no department record yet`}>
          Only in the news{gaps && <> <b className="tab-n">{gaps.gapsTotal}</b></>}</button>
      </div>
      <div className="fitlist scroll">
        {tab === "news" ? (news.length ? news.map((i) => (
          <button key={i.id} className="brief" onClick={() => c.openGrievance(i.id, "news")} title={fullTitle(i)}>
            <span className="bic t-high"><I n="news" /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <b>{fullTitle(i)}</b>
              <span className="loc">{(i.outletNames as string[] | undefined)?.length ? (i.outletNames as string[]).join(", ") : "News"} · {i.zone_name ?? "Chennai"} · {rel(i.t, c.now)}</span>
              {i.summary && <p>{i.summary}</p>}
            </span>
          </button>
        )) : <Empty>No news about {c.dept.short} {when}.</Empty>)
          : gaps === undefined ? <Empty>{gapsFailed ? "This list could not be loaded. Reload the data from the Menu." : "Reading the news…"}</Empty>
            : gaps?.gaps.length ? gaps.gaps.map((g) => (
              <button key={g.id} className="brief" onClick={() => c.openGrievance(g.id, "news")} title="Open the incident and its news reports">
                <span className="bic t-info"><I n="alert" /></span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <b>{g.title || g.type}</b>
                  <span className="loc">{[g.zone_name ?? "Chennai", g.sev, g.outlets ? `${g.outlets} outlet${g.outlets === 1 ? "" : "s"}` : null, g.t ? rel(g.t, c.now) : null].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            )) : <Empty>Every {c.dept.short} incident in the news has a department record.</Empty>}
      </div>
    </article>
  );
}

// ----------------------------------------------------------------- trend --

/** Grievances reported across the period, in the Collector's buckets (2 hours, a day or a week). */
export function TrendCard({ c, style }: { c: Ctx; style?: CSSProperties }) {
  const [cat, setCat] = useState("all");
  const P = c.ov.periodInfo;
  const series = c.ov.trend;
  const pickSeries = series.find((s) => s.code === cat);
  const vals = cat === "all" || !pickSeries
    ? Array.from({ length: P.buckets }, (_, k) => series.reduce((sum, s) => sum + (s.v[k] ?? 0), 0))
    : pickSeries.v;
  const labels = bucketLabels(c.ov.since, P, c.ov.period);
  const total = vals.reduce((s, v) => s + v, 0);
  return (
    <article className="card o-tr" style={style}>
      <div className="ch"><I n="line" /><h2>Grievances reported <span>· {P.label}</span></h2>
        <select className="sel" value={pickSeries ? cat : "all"} onChange={(e) => setCat(e.target.value)} aria-label="Grievance type">
          <option value="all">All {c.dept.short} grievances</option>
          {series.map((s) => <option key={s.code} value={s.code}>{s.l}</option>)}
        </select>
      </div>
      <div className="cb">
        {total ? <Chart kind="bar" vals={vals} labels={labels} fmt={(v) => `${v.toLocaleString("en-IN")} grievances`} />
          : <Empty>No grievances reported in this period.</Empty>}
      </div>
    </article>
  );
}

/** Open grievances by zone, then (with a zone chosen) by taluk, then (with a taluk chosen) by ward. */
export function AreaCard({ c, style }: { c: Ctx; style?: CSSProperties }) {
  const { level, rows } = c.ov.byArea;
  const title = level === "zone" ? "Open by zone" : level === "taluk" ? "Open by taluk" : "Open by ward";
  const scope = level === "taluk" ? c.zoneName : level === "ward" ? c.talukName : null;
  const click = (key: string) => (level === "zone" ? () => c.setZone(Number(key)) : level === "taluk" ? () => c.setTaluk(key) : undefined);
  return (
    <article className="card o-area" style={style}>
      <div className="ch"><I n="pin" /><h2>{title}{scope ? <span> · {scope}</span> : null}</h2></div>
      <div className="cb">
        {rows.length ? <HBars rows={rows.map((r) => ({ l: r.l, v: r.v, onClick: click(r.key) }))} /> : <Empty>No open grievances</Empty>}
      </div>
    </article>
  );
}

// ----------------------------------------------------------- the Collector --

const FEEDBACK_TONE: Record<FeedbackKind, string> = { verified: "t-low", resolved: "t-low", returned: "t-high", rejected: "t-sev", escalated: "t-high" };
const FEEDBACK_ICON: Record<FeedbackKind, "checkc" | "refresh" | "x" | "alert"> = { verified: "checkc", resolved: "checkc", returned: "refresh", rejected: "x", escalated: "alert" };

/** The Collector's decisions on the department's cases in the period, newest first (verified, closed, returned, rejected, escalated). */
export function FeedbackCard({ c, style, unread }: { c: Pick<Ctx, "ov" | "now" | "openGrievance">; style?: CSSProperties; unread?: Set<string | number> }) {
  const items = c.ov.feedback;
  return (
    <article className="card o-fb" style={style}>
      <div className="ch"><I n="shield" /><h2>From the Collector</h2>{items.length > 0 && <span className="cnt-b">{items.length}</span>}</div>
      <div className="o-list">
        {items.length ? items.map((f) => (
          <button key={f.did} className={`brief${unread?.has(f.did) ? " unread" : ""}`} onClick={() => c.openGrievance(f.id)}>
            {/* what the decision did: a reject is closed for good, not returned for rework (officer-day-05) */}
            <span className={`bic ${FEEDBACK_TONE[f.kind as FeedbackKind] ?? "t-high"}`}><I n={FEEDBACK_ICON[f.kind as FeedbackKind] ?? "refresh"} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <b>{f.title ?? f.type}</b>
              <span className="loc">{FEEDBACK_LABEL[f.kind as FeedbackKind] ?? f.decision} · {f.ok ? rel(f.at, c.now) : f.note || "no note"}</span>
            </span>
          </button>
        )) : <Empty>No decisions in this period.</Empty>}
      </div>
    </article>
  );
}

// ------------------------------------------------------------- your office --

/**
 * The signed-in officer and the department's officials: the login and the department (from the department master), the head of
 * department and, with a zone chosen, its zonal officer, with phone and e-mail as the GCC Who's who publishes them (the source and the
 * day it was read are said under them). Nothing here is invented: an official who is not listed is said to be not listed.
 */
export function ContactsCard({ c, user, style }: { c: Ctx; user: string; style?: CSSProperties }) {
  const contacts = ((c.ov.board.snapshot as Row).contacts as Row[] | undefined) ?? [];
  const own = contacts.filter((x) => x.dept_code === c.dept.code);
  const zonal = contacts.filter((x) => x.zone_no != null);
  const head = own[0] ?? (c.ov.head as Row | null);
  const src = own[0] ?? zonal[0] ?? null;
  return (
    <article className="card o-me" style={style}>
      <div className="ch"><I n="user" /><h2>Your office</h2>
        <button className="more" onClick={c.openContacts}><I n="phone" />All contacts</button></div>
      <div className="o-list">
        <div className="o-me-who">
          <span className="avatar" aria-hidden="true">{c.dept.short.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase()}</span>
          <span style={{ minWidth: 0 }}>
            <small>Signed in as</small>
            <b title={user}>{user.split("@")[0]}</b>
            <span>Department officer · {c.dept.name}{c.dept.org ? `, ${c.dept.org}` : ""}</span>
          </span>
        </div>
        {head ? <OfficerCard o={head} label="Head of department" /> : (
          <div className="officer"><span className="avatar">{c.dept.head.slice(0, 2).toUpperCase()}</span>
            <span style={{ minWidth: 0 }}><small className="olabel">Head of department</small><b>{c.dept.head}</b><small className="desig">Not listed on the GCC Who&apos;s who page</small></span></div>
        )}
        {head?.office && <p className="o-me-note"><I n="pin" /><span>Office: {String(head.office)}</span></p>}
        {c.zone && (zonal.length ? zonal.slice(0, 1).map((o) => <OfficerCard key={o.contact_id ?? o.name} o={o} label={`Zonal officer · ${c.zoneName}`} />)
          : <p className="o-me-note">The zonal officer of {c.zoneName} is not listed on the GCC Who&apos;s who page.</p>)}
        {c.dept.route && <p className="o-me-note"><I n="send" /><span>Escalation: {c.dept.route}</span></p>}
        <p className="o-me-src">
          {src?.source_url ? <>Phone and e-mail: <a href={String(src.source_url)} target="_blank" rel="noreferrer">Greater Chennai Corporation, Who&apos;s who</a>
            {src.retrieved_on ? `, read ${fmtDate(`${src.retrieved_on} 00:00:00`)}` : ""}. </> : null}
          GCC 24-hour complaints cell: 1913.
        </p>
      </div>
    </article>
  );
}

