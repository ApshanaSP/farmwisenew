"use client";

import { useEffect, useState, type ReactNode } from "react";
import { I } from "@/components/collector/app/icons";
import { Empty, SevChip, fmtDate, fmtShort, fmtTime, fromManu, fullTitle, rel, type Row } from "@/components/collector/app/lib";
import { LiveDot } from "@/components/ui";
import { NextStep, StageChip } from "./Cards";
import type { Ctx, ListFlag } from "./OfficerApp";
import { deadlineOf } from "./format";
import { ResolvedRows } from "@/components/cases/ResolvedRows";

export function Modal({ title, children, onClose, narrow, wide }: { title: string; children: ReactNode; onClose: () => void; narrow?: boolean; wide?: boolean }) {
  return (
    <div className={`modal${narrow ? " narrow" : ""}${wide ? " wide" : ""}`} role="dialog" aria-label={title}>
      <div className="modal-h"><h2>{title}</h2><button className="xbtn" onClick={onClose} aria-label="Close"><I n="x" /></button></div>
      <div className="modal-b">{children}</div>
    </div>
  );
}

/** A list row's own deadline (officer-day-10): the due time, red with "missed" once passed while the work is open. */
export function DeadlineCell({ r, now }: { r: Row; now: string }) {
  const dl = deadlineOf(r, now);
  return <td className={dl?.missed ? "num" : "dim num"} style={dl?.missed ? { color: "var(--sev)" } : undefined}>{dl ? `${fmtShort(dl.due)}${dl.missed ? " · missed" : ""}` : "—"}</td>;
}

/**
 * Every grievance of one type, stage or flag (severe or high and open; past deadline and open; due within 24 hours), in the period and
 * area, with a keyword filter, pages, and each grievance's next step (approve, complete and send) on its row.
 */
export function ListBody({ c, cat, flag, sev, tab = "all" }: { c: Ctx; cat: string | null; flag?: ListFlag; sev?: string | null; tab?: string }) {
  const per = 12;
  const [page, setPage] = useState(0);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ rows: Row[]; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { setQ(text.trim()); setPage(0); }, 250);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => {
    let live = true;
    const p = new URLSearchParams(c.scopeQs);
    // tab "asked": the closed cases with a question from the Collector still to answer, whatever their date (the route's ?asked=1)
    if (tab === "asked") { p.set("tab", "all"); p.set("asked", "1"); } else p.set("tab", tab);
    p.set("per", String(per)); p.set("page", String(page));
    if (cat) p.set("cat", cat);
    if (flag) p.set("flag", flag);
    if (sev) p.set("sev", sev);
    if (q.length >= 2) p.set("q", q);
    setErr(null);
    fetch(`/api/officer/grievances?${p}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Could not load grievances."); if (live) setData(j); })
      .catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [page, q, cat, flag, sev, tab, c.scopeQs, c.reloadKey]);
  const pages = data ? Math.max(1, Math.ceil(data.total / per)) : 1;
  return (
    <>
      <div className="filters">
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter by keyword, street or ID" aria-label="Filter" autoFocus />
      </div>
      <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 8 }}>
        {data ? `${data.total.toLocaleString("en-IN")} grievances` : "Loading…"} · {c.ov.periodInfo.label} · {c.areaName ?? "all areas"}
      </div>
      {err ? <div className="o-state err">{err}</div> : tab === "verified" && data ? (
        // 28 Nov: the Resolved list shows how each case was resolved: photo, remark, who approved it (lib/cases/resolution.ts)
        <ResolvedRows rows={data.rows} who="officer" onOpen={(id) => c.openGrievance(id)} empty="No grievances match." />
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>ID</th><th>Grievance</th><th>Stage</th><th>Severity</th><th>Location</th><th>Complaints</th><th>Reported</th><th>Deadline</th><th>Next step</th></tr></thead>
            <tbody>
              {data?.rows.length ? data.rows.map((r) => (
                <tr key={r.id} className={r.id === c.fresh ? "flash" : ""} onClick={() => c.openGrievance(r.id)}>
                  <td className="dim num">{r.id}</td><td className="ev">{r.type}{fromManu(r) && <span className="dim"> · Manu</span>}</td><td><StageChip r={r} /></td><td><SevChip s={r.sev} /></td>
                  <td>{r.loc ?? "—"} <span className="dim">· {r.zone_name ?? "Chennai"}</span></td><td className="num">{r.complaints}</td><td className="dim num">{fmtShort(r.t)}</td>
                  <DeadlineCell r={r} now={c.now} />
                  <td className="o-next"><NextStep r={r} c={c} /></td>
                </tr>
              )) : data ? <tr><td colSpan={9}><Empty>No grievances match.</Empty></td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
      <div className="pgr" style={{ justifyContent: "flex-end", marginTop: 10 }}>
        <span>Page {page + 1} of {pages}</span>
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous"><I n="chevl" /></button>
        <button onClick={() => setPage((p) => p + 1)} disabled={page >= pages - 1} aria-label="Next"><I n="chevr" /></button>
      </div>
    </>
  );
}

/** Every news report about the department in the period. */
export function NewsAll({ c }: { c: Ctx }) {
  const items = c.ov.news as Row[];
  if (!items.length) return <Empty>No news reports about {c.dept.short} in this period.</Empty>;
  return (
    <div className="ngrid">
      {items.map((i) => (
        <button key={i.id} className="ncard" onClick={() => c.openGrievance(i.id, "news")}>
          <div className="nout">{(i.outletNames?.length ? i.outletNames : ["News"]).map((n: string) => <span key={n}>{n}</span>)}</div>
          <h4>{fullTitle(i)}</h4>
          <div className="nmeta"><span>{i.zone_name ?? "Chennai"}</span><span>{i.type}</span><span>{rel(i.t, c.now)}</span></div>
          {i.summary && <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)" }}>{i.summary}</p>}
        </button>
      ))}
    </div>
  );
}

/** A departmental feed made by a generator (source_health.kind "synthetic"): test data, never counted as live. */
export const isTestFeed = (f: { kind?: unknown }) => /synthetic/i.test(String(f.kind ?? ""));

/**
 * Data collected: when the hourly collection last ran and each feed's newest record, as the Collector's data sources list shows them.
 * A feed made by a generator (police, PWD, hospital records in this build) is said to be test data, never official.
 */
export function FeedsBody({ c }: { c: Ctx }) {
  const s = c.ov.board.collection;
  const kind = new Map(c.ov.feeds.map((f) => [f.source, f]));
  return (
    <>
      <p style={{ margin: "0 0 12px", color: "var(--text-2)", fontSize: 13.5 }}>
        {s?.lastRun ? <>The district intelligence pipeline last collected at <b>{fmtTime(s.lastRun)}, {fmtDate(s.lastRun)}</b>. </> : "The district intelligence pipeline collects its feeds every hour. "}
        Your dashboard shows the store as of {fmtTime(c.ov.now)}, {fmtDate(c.ov.now)}.
      </p>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Feed</th><th>Status</th><th>Newest record</th></tr></thead>
          <tbody>
            {c.ov.updated.sources.map((x) => {
              const f = kind.get(x.source);
              const test = f ? isTestFeed(f) : false;
              const ok = !x.failed && (f?.status === "ok" || f?.status === "degraded");
              return (
                <tr key={x.source} className="static">
                  <td className="ev">{x.label}</td>
                  <td><span className="ofeed-st"><LiveDot state={x.failed ? "warn" : ok ? "ok" : "warn"} />
                    {test ? "Generated test data (not official)" : x.failed ? "Behind: not collected in the last few hours" : f?.status === "degraded" ? "Partly available" : ok ? "Current" : (f?.status ?? "Unknown")}</span></td>
                  <td className="dim num">{x.newest ? `${fmtTime(x.newest)}, ${fmtDate(x.newest)}` : "No data"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 12 }}>
        Real feeds: news, IMD weather, CPCB air quality and the CFM-DSS flood monitor. The police records, PWD works, hospital records and the
        citizen grievance feed in this build are generated datasets for testing, not official records.
      </p>
    </>
  );
}
