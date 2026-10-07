"use client";

import { useEffect, useState } from "react";
import type { ActionDraft } from "@/lib/collector/actionmail";
import { I } from "./icons";
import { fmtShort, rel, type Row } from "./lib";
import type { Console } from "./CollectorApp";

const WORKING = ["Reading the incident and its reports…", "Finding the department officer…", "Drafting the email…"];

/**
 * Take action on a severe incident: the agent reads it, finds the officer and drafts the instruction; the Collector
 * reads (and may edit) the email and approves it. Nothing is sent before that. Shown over the incident pop-up.
 */
export function TakeAction({ id, c, onClose, onSent }: { id: string; c: Console; onClose: () => void; onSent: () => void }) {
  const [d, setD] = useState<ActionDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<Row | null>(null);
  const [redraft, setRedraft] = useState(0);

  useEffect(() => {
    let live = true;
    setD(null); setErr(null); setTick(0);
    const t = setInterval(() => setTick((k) => Math.min(k + 1, WORKING.length - 1)), 900);
    fetch(`/api/collector/incidents/${encodeURIComponent(id)}/action`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not prepare the action.");
        if (live) { setD(j); setSubject(j.subject); setBody(j.body); }
      })
      .catch((e) => live && setErr(e.message))
      .finally(() => clearInterval(t));
    return () => { live = false; clearInterval(t); };
  }, [id, redraft]);

  const send = async () => {
    setSending(true);
    try {
      const r = await fetch(`/api/collector/incidents/${encodeURIComponent(id)}/action`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not send.");
      setDone(j);
      c.toast(j.status === "sent" ? `Instruction sent to ${j.to?.role ?? "the department"}.` : `Instruction recorded for ${j.to?.role ?? "the department"}.`);
      onSent();
    } catch (e) {
      c.toast((e as Error).message, "alert");
    } finally {
      setSending(false);
    }
  };

  const copy = () => navigator.clipboard?.writeText(`Subject: ${subject}\n\n${body}`).then(() => c.toast("Email copied."), () => undefined);

  return (
    <div className="ta" role="dialog" aria-label="Take action">
      <div className="ta-h">
        <span className="ta-badge"><I n="spark" />AI agent</span>
        <h3>Take action</h3>
        <button className="xbtn" onClick={onClose} aria-label="Back to the incident"><I n="x" /></button>
      </div>

      {err ? <div className="ta-b"><div className="ta-err" role="alert">{err}</div></div>
        : !d ? (
          <div className="ta-b">
            <ol className="ta-steps">
              {WORKING.map((w, k) => (
                <li key={w} className={k < tick ? "ok" : k === tick ? "run" : ""}>
                  <i>{k < tick ? <I n="check" /> : k === tick ? <I n="refresh" className="spin" /> : k + 1}</i><span>{w}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : done ? (
          <div className="ta-b ta-done">
            <span className="ta-ok"><I n="checkc" /></span>
            <h4>{done.status === "sent" ? "Instruction sent" : "Instruction recorded"}</h4>
            <p>{done.note}</p>
            <p className="dim">A follow-up is due in 24 hours. The department&apos;s completion report, with photos, comes to My Tasks.</p>
            <button className="btn" onClick={onClose}><I n="chevl" />Back to the incident</button>
          </div>
        ) : (
          <>
            <div className="ta-b">
              <ol className="ta-steps done">
                {d.steps.map((s) => (
                  <li key={s.key} className={s.ok ? "ok" : "warn"}>
                    <i>{s.ok ? <I n="check" /> : <I n="alert" />}</i><span><b>{s.label}</b><small>{s.detail}</small></span>
                  </li>
                ))}
              </ol>

              <div className="ta-to">
                <div className="ta-row"><small>To</small>
                  {d.to ? <span><b>{d.to.role}</b><em>{d.to.email}</em></span> : <span className="dim">No officer account for this department</span>}
                </div>
                {d.head && <div className="ta-row"><small>Head</small><span><b>{d.head.name}</b><em>{d.head.role} · for reference, not emailed</em></span></div>}
              </div>
              <div className={`ta-mode ${d.delivery.to ? "" : "warn"}`}><I n={d.delivery.mode === "sandbox" ? "shield" : "send"} />{d.delivery.note}</div>

              {d.sent.length > 0 && (
                <div className="ta-prev"><I n="clock" />Already sent {rel(d.sent[0].t, c.now)}: “{d.sent[0].subject}”{d.sent.length > 1 ? ` and ${d.sent.length - 1} earlier` : ""}</div>
              )}

              <label className="ta-f"><small>Subject</small>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} />
              </label>
              <label className="ta-f grow"><small>Message{d.ai ? <em><I n="spark" />Drafted by AI from this incident · check before sending</em> : <em>From a template</em>}</small>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
              </label>
            </div>
            <div className="ta-f2">
              <button className="btn plain sm" onClick={() => setRedraft((k) => k + 1)} disabled={sending}><I n="refresh" />Redraft</button>
              <button className="btn plain sm" onClick={copy}><I n="copy" />Copy</button>
              <span className="grow" />
              <button className="btn plain" onClick={onClose} disabled={sending}>Cancel</button>
              <button className="btn" onClick={send} disabled={sending || subject.trim().length < 5 || body.trim().length < 40}>
                {sending ? <><I n="refresh" className="spin" />Sending…</> : <><I n="send" />Approve &amp; send</>}
              </button>
            </div>
          </>
        )}
    </div>
  );
}

/** "Sent 2 h ago" note for an incident that already has an instruction. */
export function SentNote({ e, now }: { e: Row; now: string }) {
  return (
    <div className="iv2-sent"><I n="send" />
      <span><b>Instruction sent {rel(e.t, now)}</b> to {e.to?.role ?? "the department"} · {fmtShort(e.t)}
        <small>{e.subject}{e.status === "sent" ? "" : e.status === "failed" ? " · email failed, on the officer's console" : " · on the officer's console"}</small></span>
    </div>
  );
}
