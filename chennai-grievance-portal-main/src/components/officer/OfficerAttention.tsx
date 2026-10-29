"use client";
/**
 * The officer Board's "what needs you" card: open incidents by severity, and My Work (grievances to approve, work in
 * action to complete and send), in one card two columns wide with a switch at its top, as on the Collector's
 * Overview (collector/app/Attention.tsx, same look: attention.css). Rows are compact (a line of title, a line of facts,
 * the action on the right), so many show at a time.
 */
import { useState } from "react";
import { I } from "@/components/collector/app/icons";
import { Empty, SEVS, SEV_HEX, deptIcon, fullTitle, rel, sevTone, type Row } from "@/components/collector/app/lib";
import type { Ctx } from "./OfficerApp";
import "@/components/collector/app/attention.css";

export function OfficerAttention({ c, goGrievances }: { c: Ctx; goGrievances: (tab: "new" | "action") => void }) {
  const k = c.ov.counts;
  const counts = c.ov.board.severity.counts as Record<string, number>;
  const openN = SEVS.reduce((a, s) => a + (counts[s] ?? 0), 0);
  // the work comes first when something waits for approval
  const [view, setView] = useState<"sev" | "work">(k.new ? "work" : "sev");
  const [sev, setSev] = useState<string | null>(null);
  const [work, setWork] = useState<"new" | "action">(k.new || !k.action ? "new" : "action");
  const first = SEVS.find((s) => counts[s] > 0) ?? "Severe";
  const tab = sev && (counts[sev] > 0 || sev === first) ? sev : first;
  return (
    <>
      <div className="att-h">
        <div className="att-sw" role="tablist" aria-label="What needs you">
          <button role="tab" aria-selected={view === "sev"} className={view === "sev" ? "on" : ""} onClick={() => setView("sev")}
            title="Your department's open incidents by severity">
            <I n="alert" />By severity<em>{openN.toLocaleString("en-IN")}</em></button>
          <button role="tab" aria-selected={view === "work"} className={view === "work" ? "on" : ""} onClick={() => setView("work")}
            title="Your work: approve new grievances, complete and send the work in action">
            <I n="tasks" />My work<em className={k.new ? "hot" : ""}>{(k.new + k.action).toLocaleString("en-IN")}</em></button>
        </div>
        <button className="more" onClick={() => (view === "sev" ? c.openList(null, `${tab} incidents, open`, "open", { sev: tab }) : goGrievances(work))}>See all<I n="right" /></button>
      </div>

      {view === "sev" ? (
        <>
          <div className="att-pills" role="tablist" aria-label="Severity">
            {SEVS.map((s) => (
              <button key={s} role="tab" aria-selected={tab === s} className={tab === s ? "on" : ""} onClick={() => setSev(s)} style={{ "--c": SEV_HEX[s] } as React.CSSProperties}
                title={`${s}: ${(counts[s] ?? 0).toLocaleString("en-IN")} open${openN ? ` · ${Math.round(((counts[s] ?? 0) / openN) * 100)} %` : ""}`}>
                <b>{(counts[s] ?? 0).toLocaleString("en-IN")}</b><span><i />{s}</span>
                <s style={{ width: `${openN ? Math.max(4, ((counts[s] ?? 0) / openN) * 100) : 0}%` }} />
              </button>
            ))}
          </div>
          <div className="att-list">
            {(c.ov.board.severity.rows as Row[]).filter((r) => r.sev === tab).map((i) => (
              <div key={i.id} className="att-row" style={{ "--c": SEV_HEX[i.sev] } as React.CSSProperties}>
                <button className="att-main" onClick={() => c.openGrievance(i.id)} title={fullTitle(i)}>
                  <span className={`att-ic ${sevTone(i.sev)}`}><I n={deptIcon(i.dept)} /></span>
                  <span className="att-txt">
                    <b>{fullTitle(i)}</b>
                    <small>{[i.zone_name, i.loc, rel(i.t, c.now)].filter(Boolean).join(" · ")}</small>
                  </span>
                </button>
                <span className="att-btns"><button className="att-ib" onClick={() => c.openGrievance(i.id)} title="Open" aria-label="Open"><I n="right" /></button></span>
              </div>
            ))}
            {!(c.ov.board.severity.rows as Row[]).some((r) => r.sev === tab) && <Empty>No open {tab.toLowerCase()} incidents {c.ov.periodInfo.label.toLowerCase()}.</Empty>}
          </div>
        </>
      ) : (
        <>
          <div className="att-pills two" role="tablist" aria-label="Work">
            <button role="tab" aria-selected={work === "new"} className={work === "new" ? "on" : ""} onClick={() => setWork("new")} style={{ "--c": "var(--high)" } as React.CSSProperties}
              title="New grievances waiting for your approval">
              <b>{k.new.toLocaleString("en-IN")}</b><span><i />To approve</span></button>
            <button role="tab" aria-selected={work === "action"} className={work === "action" ? "on" : ""} onClick={() => setWork("action")} style={{ "--c": "var(--accent)" } as React.CSSProperties}
              title="Approved work in action: complete it and send the report">
              <b>{k.action.toLocaleString("en-IN")}</b><span><i />In action</span></button>
          </div>
          {k.returned > 0 && (
            <button className="att-note att-ret" onClick={() => { setWork("action"); goGrievances("action"); }} title="Returned by the Collector: redo the work and send a fresh completion report">
              <I n="refresh" /><b>{k.returned}</b> returned by the Collector for rework
            </button>
          )}
          <div className="att-list">
            {(c.ov.queue[work] as Row[]).length ? (c.ov.queue[work] as Row[]).map((r) => (
              <div key={r.id} className="att-row" style={{ "--c": SEV_HEX[r.sev] } as React.CSSProperties}>
                <button className="att-main" onClick={() => c.openGrievance(r.id)} title={[r.type, r.loc].filter(Boolean).join(" – ")}>
                  <span className={`att-ic ${sevTone(r.sev)}`}><I n={deptIcon(r.dept ?? c.dept.code)} /></span>
                  <span className="att-txt">
                    <b>{fullTitle(r)}</b>
                    <small>
                      {r.returned ? <em title={r.returnNote ?? undefined}><I n="refresh" />Returned</em> : <em className="sev" style={{ color: SEV_HEX[r.sev], background: `color-mix(in srgb, ${SEV_HEX[r.sev]} 14%, transparent)` }}>{r.sev}</em>}
                      {[r.zone_name, rel(r.t, c.now), r.complaints ? `${r.complaints} complaint${r.complaints === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                </button>
                <span className="att-btns">
                  {work === "new"
                    ? <button className="att-act ok" disabled={c.busy.has(r.id)} onClick={() => c.approve(r)}><I n="check" /><span>Approve</span></button>
                    : <button className="att-act ok" disabled={c.busy.has(r.id)} onClick={() => c.openSend(r)}
                      title={r.sev === "Severe" ? "Complete the work and send the report (with photos) to the Collector" : "Complete the work and close it"}>
                      {r.sev === "Severe" ? <><I n="send" /><span>Complete &amp; send</span></> : <><I n="check" /><span>Complete &amp; close</span></>}</button>}
                </span>
              </div>
            )) : <Empty>{work === "new" ? "Nothing waiting for your approval." : "Nothing in action right now."}</Empty>}
          </div>
        </>
      )}
    </>
  );
}
