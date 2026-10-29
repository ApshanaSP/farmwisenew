"use client";
/**
 * What needs the Collector on the Overview: open incidents by severity, and closed work to check (My Tasks), in one
 * full-height card with a switch at its top (or one of them alone, when the other is switched off in Customize). Each
 * list is compact (a line of title, a line of facts, the actions on the right), so the card shows eight or more at a
 * time; a task opens in place to show the department's remarks and photos.
 */
import { useState } from "react";
import type { Overview as OverviewData } from "@/lib/collector/intel";
import { I } from "./icons";
import { Empty, SEVS, SEV_HEX, deptIcon, fullTitle, rel, sevTone, type Row } from "./lib";
import type { Console } from "./CollectorApp";
import "./attention.css";

export const TASK_RULE = "You verify closed work on severe incidents only, from the department's remarks and site photos. " +
  "The department verifies and closes everything else itself. The same problem reported several times in one area is one task.";

export function AttentionCard({ d, c, only }: { d: OverviewData; c: Console; only?: "sev" | "tasks" }) {
  const [view, setView] = useState<"sev" | "tasks">(only ?? "sev");
  const v = only ?? view;
  const counts = d.severity.counts;
  const openN = SEVS.reduce((a, s) => a + (counts[s] ?? 0), 0);
  const sevNow = c.sevTab ?? SEVS.find((s) => counts[s] > 0) ?? "Severe";
  return (
    <>
      <div className="att-h">
        {only ? (
          <span className="att-one"><I n={v === "sev" ? "alert" : "tasks"} />{v === "sev" ? "Open, by severity" : "My Tasks"}<em>{(v === "sev" ? openN : d.tasks.count).toLocaleString("en-IN")}</em></span>
        ) : (
          <div className="att-sw" role="tablist" aria-label="What needs you">
            <button role="tab" aria-selected={v === "sev"} className={v === "sev" ? "on" : ""} onClick={() => setView("sev")}
              title="Open incidents by severity (the Severe events tile counts every severe event reported in the period)">
              <I n="alert" />By severity<em>{openN.toLocaleString("en-IN")}</em></button>
            <button role="tab" aria-selected={v === "tasks"} className={v === "tasks" ? "on" : ""} onClick={() => setView("tasks")} title={"Closed work for you to check. " + TASK_RULE}>
              <I n="tasks" />My tasks<em className={d.tasks.count ? "hot" : ""}>{d.tasks.count.toLocaleString("en-IN")}</em></button>
          </div>
        )}
        <button className="more" onClick={() => (v === "sev" ? c.openList({ status: "open", sev: sevNow, sort: "sev", dir: 1 }, `${sevNow} incidents`)
          : c.openList({ status: "awaiting", sort: "sev", dir: 1 }, "Closed work for you to check"))}>See all<I n="right" /></button>
      </div>
      {v === "sev" ? <SevList d={d} c={c} /> : <TaskList d={d} c={c} />}
    </>
  );
}

function SevList({ d, c }: { d: OverviewData; c: Console }) {
  const counts = d.severity.counts;
  const first = SEVS.find((s) => counts[s] > 0) ?? "Severe";
  const tab = c.sevTab && (counts[c.sevTab] > 0 || c.sevTab === first) ? c.sevTab : first;
  const rows = [...d.severity.rows.filter((r) => r.sev === tab)].sort((a, b) => Number(!!b.why?.needsYou) - Number(!!a.why?.needsYou));
  const needN = rows.filter((r) => r.why?.needsYou).length;
  const total = SEVS.reduce((a, s) => a + (counts[s] ?? 0), 0);
  return (
    <>
      {/* the four severities as one row of filters; each shows its share of the open incidents as a thin bar */}
      <div className="att-pills" role="tablist" aria-label="Severity">
        {SEVS.map((s) => (
          <button key={s} role="tab" aria-selected={tab === s} className={tab === s ? "on" : ""} onClick={() => c.setSevTab(s)} style={{ "--c": SEV_HEX[s] } as React.CSSProperties}
            title={`${s}: ${counts[s].toLocaleString("en-IN")} open${total ? ` · ${Math.round((counts[s] / total) * 100)} %` : ""}`}>
            <b>{counts[s].toLocaleString("en-IN")}</b><span><i />{s}</span>
            <s style={{ width: `${total ? Math.max(4, (counts[s] / total) * 100) : 0}%` }} />
          </button>
        ))}
      </div>
      {needN > 0 && <div className="att-note"><I n="bell" /><b>{needN} need{needN === 1 ? "s" : ""} you</b> · shown first</div>}
      <div className="att-list">
        {rows.length ? rows.map((i) => (
          <div key={i.id} className={`att-row${c.focus?.id === i.id ? " on" : ""}${i.why?.needsYou ? " need" : ""}`} style={{ "--c": SEV_HEX[i.sev] } as React.CSSProperties}>
            <button className="att-main" onClick={() => { c.highlight(i); c.openInc(i.id); }} title={fullTitle(i)}>
              <span className={`att-ic ${sevTone(i.sev)}`}><I n={deptIcon(i.dept)} /></span>
              <span className="att-txt">
                <b>{fullTitle(i)}</b>
                {/* one line of facts; when it needs the Collector, the reason leads it */}
                <small title={i.why?.needsYou ? i.why.attention.join("\n") : undefined}>
                  {i.why?.needsYou && <em><I n="bell" />{i.why.attention[0]}</em>}
                  {[i.zone_name, i.dept_name ?? i.dept, rel(i.t, d.now)].filter(Boolean).join(" · ")}{Number(i.grouped) > 1 ? ` · ${i.grouped} merged` : ""}
                </small>
              </span>
            </button>
            {i.sev === "Severe" && (
              <button className={`att-act${i.acted ? " done" : ""}`} onClick={() => c.openAction(i.id)}
                title={i.acted ? `Action taken: instruction sent ${rel(i.acted.t, d.now)}. Click to send another.` : "Take action: AI drafts an instruction email to the department officer; you approve it"}
                aria-label={`${i.acted ? "Action taken on" : "Take action on"} ${fullTitle(i)}`}>
                <I n={i.acted ? "checkc" : "send"} /><span>{i.acted ? "Sent" : "Act"}</span>
              </button>
            )}
          </div>
        )) : <Empty>No open {tab.toLowerCase()} incidents {c.periodLabel.toLowerCase()}.</Empty>}
      </div>
    </>
  );
}

function TaskList({ d, c }: { d: OverviewData; c: Console }) {
  // Verify: the button turns into a green check, then the row collapses (the reload removes it) and the count ticks down.
  // A grouped task (the same problem reported several times in one area) verifies every incident of the group.
  const [done, setDone] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const verify = async (i: Row) => {
    const ids: string[] = i.members ?? [i.id];
    if (await c.verify(ids.map((id) => (id === i.id ? i : { ...i, id })))) setDone((s) => new Set(s).add(i.id));
  };
  return (
    <>
      <div className="att-note dim" title={TASK_RULE}><I n="info" />Severe work only{d.tasks.leftToDepts > 0 ? <> · <b>{d.tasks.leftToDepts}</b> other closures verified by departments</> : ""}</div>
      <div className="att-list">
        {d.tasks.rows.length ? d.tasks.rows.map((i) => {
          const a = i.action as Row | null;
          const photos: string[] = a?.photos ?? [];
          const proof = !!a?.evidence;
          const isOpen = open === i.id;
          return (
            <div key={i.id} className={`att-row task2${done.has(i.id) ? " leaving" : ""}${isOpen ? " open" : ""}`} style={{ "--c": SEV_HEX[i.sev] } as React.CSSProperties}>
              <button className="att-main" onClick={() => setOpen(isOpen ? null : i.id)} aria-expanded={isOpen} title="Show the department's remarks and photos">
                <span className={`att-ic ${proof ? "t-low" : "t-high"}`}><I n={proof ? "photo" : "alert"} /></span>
                <span className="att-txt">
                  <b>{fullTitle(i)}</b>
                  <small>
                    <em className={proof ? "ok" : "miss"}>{proof ? <><I n="photo" />{photos.length ? `${photos.length} photo${photos.length === 1 ? "" : "s"}` : "Report sent"}</> : <><I n="alert" />No report yet</>}</em>
                    {[i.dept_name ?? i.dept, proof && a?.t ? rel(a.t, d.now) : null].filter(Boolean).join(" · ")}{Number(i.grouped) > 1 ? ` · ${i.grouped} merged` : ""}
                  </small>
                </span>
                <I n={isOpen ? "up" : "chevd"} className="att-chev" />
              </button>
              <span className="att-btns">
                <button className="att-ib" onClick={() => c.sendBack(i)} disabled={c.busyIds.has(i.id)} title="Not satisfied: send it back to the department" aria-label="Send back to the department"><I n="refresh" /></button>
                {proof ? (
                  <button className={`att-act ok${done.has(i.id) ? " done" : ""}`} onClick={() => verify(i)} disabled={c.busyIds.has(i.id) || done.has(i.id)} title="The work is done: close it">
                    {c.busyIds.has(i.id) ? <I n="refresh" className="spin" /> : <I n="check" />}<span>{done.has(i.id) ? "Verified" : "Verify"}</span>
                  </button>
                ) : (
                  <button className="att-act" onClick={() => c.openAction(i.id)} title="Ask the department officer for the completion report with site photos"><I n="send" /><span>Ask</span></button>
                )}
              </span>
              {isOpen && (
                <div className="att-more">
                  {proof ? <q>“{a!.note}”</q> : <p>{a?.note ? `Records say: ${String(a.note).replace(/\.$/, "")}. ` : ""}No remarks or photos sent from the officer console yet.</p>}
                  {photos.length > 0 && <span className="att-ph">{photos.slice(0, 4).map((p, k) => <a key={p} href={p} target="_blank" rel="noreferrer" title="Open the photo"><img src={p} alt={`Site photo ${k + 1}`} loading="lazy" /></a>)}</span>}
                  <span className="att-why">With you because: {(i.because as string[]).join(", ")}</span>
                  {i.acted && <span className="att-why">Instruction sent {rel(i.acted.t, d.now)}</span>}
                  <button className="att-link" onClick={() => c.openInc(i.id)}>Open the incident<I n="right" /></button>
                </div>
              )}
            </div>
          );
        }) : <Empty>All caught up. Nothing needs your check right now.</Empty>}
      </div>
    </>
  );
}
