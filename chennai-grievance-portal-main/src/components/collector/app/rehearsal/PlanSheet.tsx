"use client";
/**
 * Send jobs: the rehearsal plan by department. Step 1, tick the jobs (all ticked, already-sent ones shown as sent);
 * step 2, one draft email per department, read and edited by the Collector, then Approve and send. The server re-makes
 * the plan itself and never trusts this list; email goes out under the console's safety rule (sandbox by default).
 */
import { useMemo, useState } from "react";
import { I } from "../icons";
import type { RehearsalState, RJob } from "@/lib/rehearsal/types";
type Lang = "en" | "ta";

interface Draft { dept: string; deptName: string; keys: string[]; subject: string; body: string; to: { name: string; email: string | null } | null; delivery: { mode: string; note: string }; jobs: { key: string; en: string; due: string | null }[] }

const fmtDue = (d: string | null) => (d ? new Date(d.replace(" ", "T") + "Z").toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) : "As soon as possible");

export function PlanSheet({ d, lang, manual, planUrl, onClose, onSent, onShow }: {
  d: RehearsalState; lang: Lang; manual: boolean; planUrl: string; onClose: () => void; onSent: (msg: string) => void; onShow: (j: RJob) => void;
}) {
  const open = d.jobs.filter((j) => !j.task);
  const [tick, setTick] = useState<Set<string>>(() => new Set(open.map((j) => j.key)));
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const byDept = useMemo(() => {
    const m = new Map<string, RJob[]>();
    for (const j of d.jobs) (m.get(j.dept) ?? m.set(j.dept, []).get(j.dept)!).push(j);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [d.jobs]);

  const draft = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(planUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "draft", manual, keys: [...tick] }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "The drafts could not be made.");
      setDrafts(j.drafts);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const send = async (x: Draft) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(planUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send", manual, dept: x.dept, keys: x.keys, subject: x.subject, body: x.body }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Not sent.");
      setDone((m) => ({ ...m, [x.dept]: `${j.tasks} ${j.tasks === 1 ? "task" : "tasks"} created. ${j.note}` }));
      onSent(`${x.deptName}: ${j.tasks} before-rain ${j.tasks === 1 ? "task" : "tasks"} sent. ${j.note}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="rr-sheet" role="dialog" aria-label="Send jobs">
      <div className="rr-sheet-h">
        <b><I n="send" />{drafts ? "Read, edit and approve" : "Send jobs"}</b>
        <span>{drafts ? `${drafts.length} ${drafts.length === 1 ? "email" : "emails"}, one per department. Nothing is sent until you approve.` : `${tick.size} of ${open.length} jobs ticked · ${byDept.length} departments`}</span>
        <button className="rr-x" onClick={onClose} aria-label="Close"><I n="x" /></button>
      </div>
      {err && <p className="rr-err">{err}</p>}
      {!drafts ? (
        <>
          <div className="rr-sheet-b">
            {byDept.map(([dept, jobs]) => {
              const free = jobs.filter((j) => !j.task);
              const all = free.length > 0 && free.every((j) => tick.has(j.key));
              return (
                <section key={dept} className="rr-dept">
                  <label className="rr-dept-h">
                    <input type="checkbox" checked={all} disabled={!free.length} onChange={() => setTick((t) => { const n = new Set(t); for (const j of free) all ? n.delete(j.key) : n.add(j.key); return n; })} />
                    <b>{jobs[0].deptName}</b><em>{free.filter((j) => tick.has(j.key)).length} / {jobs.length}</em>
                  </label>
                  <ul>
                    {jobs.slice(0, 40).map((j) => (
                      <li key={j.key} className={j.task ? "sent" : ""}>
                        <label>
                          <input type="checkbox" checked={!!j.task || tick.has(j.key)} disabled={!!j.task} onChange={() => setTick((t) => { const n = new Set(t); n.has(j.key) ? n.delete(j.key) : n.add(j.key); return n; })} />
                          <span><b>{lang === "ta" ? j.ta : j.en}</b><small>{j.why} · by {fmtDue(j.due)}{j.task ? ` · sent (${j.task.status === "done" ? "done" : j.task.status === "late" ? "late" : "to do"})` : ""}</small></span>
                        </label>
                        <button className="rr-mini" onClick={() => onShow(j)} title="Show on the map"><I n="pin" /></button>
                      </li>
                    ))}
                    {jobs.length > 40 && <li className="rr-more">and {jobs.length - 40} more (all are in the email)</li>}
                  </ul>
                </section>
              );
            })}
          </div>
          <div className="rr-sheet-f">
            <span>Each department gets one email (sandbox by default) and sees its jobs on its officer console.</span>
            <button className="rr-btn primary" disabled={busy || !tick.size} onClick={draft}><I n="doc" />{busy ? "Drafting…" : `Draft ${new Set(open.filter((j) => tick.has(j.key)).map((j) => j.dept)).size} emails`}</button>
          </div>
        </>
      ) : (
        <>
          <div className="rr-sheet-b">
            {drafts.map((x, k) => (
              <section key={x.dept} className={`rr-draft${done[x.dept] ? " sent" : ""}`}>
                <div className="rr-draft-h"><b>{x.deptName}</b><span>To {x.to ? x.to.name : "the officer console"} · {x.jobs.length} jobs</span></div>
                <p className="rr-note"><I n="info" />{x.delivery.note}</p>
                <input value={x.subject} disabled={!!done[x.dept]} onChange={(e) => setDrafts((ds) => ds!.map((y, i) => (i === k ? { ...y, subject: e.target.value } : y)))} aria-label="Subject" />
                <textarea value={x.body} disabled={!!done[x.dept]} rows={8} onChange={(e) => setDrafts((ds) => ds!.map((y, i) => (i === k ? { ...y, body: e.target.value } : y)))} aria-label="Message" />
                {done[x.dept] ? <p className="rr-ok"><I n="checkc" />{done[x.dept]}</p>
                  : <button className="rr-btn primary" disabled={busy} onClick={() => send(x)}><I n="send" />Approve and send</button>}
              </section>
            ))}
          </div>
          <div className="rr-sheet-f">
            <button className="rr-btn" onClick={() => setDrafts(null)}><I n="chevl" />Back to the jobs</button>
            <button className="rr-btn primary" disabled={busy || drafts.every((x) => done[x.dept])} onClick={async () => { for (const x of drafts) if (!done[x.dept]) await send(x); }}>
              <I n="send" />Approve all ({drafts.filter((x) => !done[x.dept]).length})
            </button>
          </div>
        </>
      )}
    </div>
  );
}
