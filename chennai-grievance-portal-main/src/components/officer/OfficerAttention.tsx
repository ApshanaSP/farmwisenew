"use client";
/**
 * "What needs you" on the officer's page: open incidents by severity, and My work (new grievances to approve, work in action to
 * complete and send, cases the Collector reopened), in one full-height card with a switch at its top, as on the Collector's Overview
 * (collector/app/Attention.tsx, the same look: attention.css). Each row is a line of title and a line of facts with the one action on
 * the right, so ten or more show at a time; the list scrolls inside the card and See all opens every one.
 */
import { useEffect, useState } from "react";
import { I } from "@/components/collector/app/icons";
import { Empty, SEVS, SEV_HEX, deptIcon, fromManu, fullTitle, rel, sevTone, type Row } from "@/components/collector/app/lib";
import { useLangNow } from "@/lib/i18n/lang";
import { labelIn } from "@/lib/period/day";
import type { Ctx } from "./OfficerApp";
import "@/components/collector/app/attention.css";

export type WorkTab = "new" | "action" | "returned";

/** `want`: a list asked for from outside the card (a count tile, a key point, the palette): the card switches to it */
export function OfficerAttention({ c, want }: { c: Ctx; want?: { work: WorkTab; seq: number } | null }) {
  const k = c.ov.counts;
  const counts = c.ov.board.severity.counts as Record<string, number>;
  const openN = SEVS.reduce((a, s) => a + (counts[s] ?? 0), 0);
  // the work comes first when something waits for approval or was sent back
  const [view, setView] = useState<"sev" | "work">(k.new || k.returned || Number(k.asked) > 0 ? "work" : "sev");
  const [sev, setSev] = useState<string | null>(null);
  const [work, setWork] = useState<WorkTab>(k.new ? "new" : k.returned ? "returned" : "action");
  useEffect(() => { if (want) { setView("work"); setWork(want.work); } }, [want?.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = SEVS.find((s) => counts[s] > 0) ?? "Severe";
  const tab = sev && (counts[sev] > 0 || sev === first) ? sev : first;
  const seeAll = () => (view === "sev" ? c.openList(null, `${tab} incidents, open`, "open", { sev: tab })
    : c.openList(null, WORK_TITLE[work], undefined, { tab: work === "new" ? "new" : "action" }));
  return (
    <>
      <div className="att-h">
        <div className="att-sw" role="tablist" aria-label="What needs you">
          <button role="tab" aria-selected={view === "sev"} className={view === "sev" ? "on" : ""} onClick={() => setView("sev")}
            title="Your department's open incidents by severity">
            <I n="alert" />By severity<em>{openN.toLocaleString("en-IN")}</em></button>
          <button role="tab" aria-selected={view === "work"} className={view === "work" ? "on" : ""} onClick={() => setView("work")}
            title="Your work: approve new grievances, complete and send the work in action, redo what the Collector reopened">
            <I n="tasks" />My work<em className={k.new || k.returned ? "hot" : ""}>{(k.new + k.action).toLocaleString("en-IN")}</em></button>
        </div>
        <button className="more" onClick={seeAll}>See all<I n="right" /></button>
      </div>
      {view === "sev" ? <SevList c={c} tab={tab} setSev={setSev} counts={counts} openN={openN} /> : <WorkList c={c} work={work} setWork={setWork} />}
    </>
  );
}

const WORK_TITLE: Record<WorkTab, string> = {
  new: "New grievances: waiting for your approval", action: "In action: complete and send", returned: "In action, with the cases the Collector reopened"
};

function SevList({ c, tab, setSev, counts, openN }: { c: Ctx; tab: string; setSev: (s: string) => void; counts: Record<string, number>; openN: number }) {
  const rows = (c.ov.board.severity.rows as Row[]).filter((r) => r.sev === tab);
  return (
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
        {rows.map((i) => (
          <div key={i.id} className="att-row" style={{ "--c": SEV_HEX[i.sev] } as React.CSSProperties}>
            <button className="att-main" onClick={() => c.openGrievance(i.id)} title={[fullTitle(i), i.zone_name, i.loc].filter(Boolean).join("\n")}>
              <span className={`att-ic ${sevTone(i.sev)}`}><I n={deptIcon(i.dept)} /></span>
              <span className="att-txt">
                <b>{fullTitle(i)}</b>
                <small>{[i.zone_name, i.loc, rel(i.t, c.now)].filter(Boolean).join(" · ")}{Number(i.grouped) > 1 ? ` · ${i.grouped} merged` : ""}</small>
              </span>
            </button>
            <span className="att-btns"><button className="att-ib" onClick={() => c.openGrievance(i.id)} title="Open" aria-label={`Open ${fullTitle(i)}`}><I n="right" /></button></span>
          </div>
        ))}
        {!rows.length && <Empty>No open {tab.toLowerCase()} incidents {labelIn(c.ov.periodInfo.label)}.</Empty>}
      </div>
    </>
  );
}

function WorkList({ c, work, setWork }: { c: Ctx; work: WorkTab; setWork: (w: WorkTab) => void }) {
  const uiLang = useLangNow();
  const k = c.ov.counts;
  const W = c.ov.work;
  const rows = (W?.[work] ?? []) as Row[];
  const pill = (key: WorkTab, n: number, label: string, col: string, title: string) => (
    <button role="tab" aria-selected={work === key} className={work === key ? "on" : ""} onClick={() => setWork(key)} style={{ "--c": col } as React.CSSProperties} title={title}>
      <b>{n.toLocaleString("en-IN")}</b><span><i />{label}</span>
    </button>
  );
  return (
    <>
      <div className="att-pills three" role="tablist" aria-label="My work">
        {pill("new", k.new, "To approve", "var(--high)", "New grievances waiting for your approval")}
        {pill("action", k.action, "In action", "var(--accent)", "Approved work in action: complete it and send the report")}
        {pill("returned", k.returned, "Reopened", "var(--critical)", "Reopened by the Collector: redo the work and send a fresh completion report")}
      </div>
      {/* RC-47: complaints filed with the department that the pipeline's next update adds to this queue */}
      {work === "new" && W?.awaitingNote && <p className="att-note dim" role="status" data-testid="queue-awaiting"><I n="clock" />{uiLang === "ta" ? W.awaitingNote.ta : W.awaitingNote.en}</p>}
      {Number(k.asked) > 0 && (
        <button className="att-note att-ret" onClick={() => c.openList(null, "Questions from the Collector", undefined, { tab: "asked" })}
          title="The Collector asked about these closed cases: open each one and answer in its panel">
          <I n="chat" /><b>{Number(k.asked).toLocaleString("en-IN")}</b> question{Number(k.asked) === 1 ? "" : "s"} from the Collector to answer
        </button>
      )}
      {work !== "new" && k.sent > 0 && (
        <button className="att-note att-ret" onClick={() => c.openList(null, "Sent to the Collector", undefined, { tab: "sent" })}
          title="Reports you sent: they wait for the Collector's check (severe work) or approval">
          <I n="send" /><b>{k.sent.toLocaleString("en-IN")}</b> waiting for the Collector&apos;s check
        </button>
      )}
      <div className="att-list">
        {rows.length ? rows.map((r) => (
          <div key={r.id} className={`att-row${r.returned ? " need" : ""}${r.id === c.fresh ? " on" : ""}`} style={{ "--c": SEV_HEX[r.sev] } as React.CSSProperties}>
            <button className="att-main" onClick={() => c.openGrievance(r.id)} title={[fullTitle(r), r.loc, r.returnNote ? `Collector: ${r.returnNote}` : null].filter(Boolean).join("\n")}>
              <span className={`att-ic ${sevTone(r.sev)}`}><I n={deptIcon(r.dept ?? c.dept.code)} /></span>
              <span className="att-txt">
                <b>{fullTitle(r)}</b>
                <small>
                  {r.returned ? <em title={r.returnNote ?? undefined}><I n="refresh" /><span>Reopened{r.returnNote ? `: ${r.returnNote}` : ""}</span></em>
                    : <em className="sev" style={{ color: SEV_HEX[r.sev], background: `color-mix(in srgb, ${SEV_HEX[r.sev]} 14%, transparent)` }}><span>{r.sev}</span></em>}
                  {[r.zone_name, rel(r.t, c.now), r.complaints ? `${r.complaints} complaint${r.complaints === 1 ? "" : "s"}` : null, fromManu(r) ? "Manu" : null,
                    r.instructed ? "Collector's instruction" : null].filter(Boolean).join(" · ")}
                </small>
              </span>
            </button>
            <span className="att-btns">
              {work === "new"
                ? <button className="att-act ok" disabled={c.busy.has(r.id)} onClick={() => c.approve(r)} title="Approve: the grievance moves to In action"><I n="check" /><span>Approve</span></button>
                : <button className="att-act ok" disabled={c.busy.has(r.id)} onClick={() => c.openSend(r)}
                  title={r.sev === "Severe" ? "Complete the work and send the report (with photos) to the Collector" : "Complete the work and close it"}>
                  {r.sev === "Severe" ? <><I n="send" /><span>Complete &amp; send</span></> : <><I n="check" /><span>Complete &amp; close</span></>}</button>}
            </span>
          </div>
        )) : <Empty>{work === "new" ? "Nothing waiting for your approval." : work === "returned" ? "Nothing reopened by the Collector." : "Nothing in action right now."}</Empty>}
        {rows.length > 0 && rows.length < (work === "new" ? k.new : work === "action" ? k.action : k.returned) && (
          <button className="att-link att-more-all" onClick={() => c.openList(null, WORK_TITLE[work], undefined, { tab: work === "new" ? "new" : "action" })}>
            {`${((work === "new" ? k.new : work === "action" ? k.action : k.returned) - rows.length).toLocaleString("en-IN")} more`}<I n="right" />
          </button>
        )}
      </div>
    </>
  );
}
