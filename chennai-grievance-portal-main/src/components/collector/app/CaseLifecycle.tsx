"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { I } from "./icons";
import { fmtShort, rel } from "./lib";
import type { Console } from "./CollectorApp";
import { PhotoLightbox, approvedWords, type ResolutionView } from "@/components/cases/ResolvedRows";

interface CaseEvent { kind: "reopened" | "returned" | "closed" | "approved" | "rejected" | "question" | "answer"; t: string; by: string | null; note: string | null }
interface Question { id: number; t: string; question: string; answer: { t: string; text: string; by: string } | null }
interface Life {
  id: string; dept: string; deptName: string | null; open: boolean; status: string; canReopen: boolean; canAsk: boolean;
  reopened: CaseEvent | null; events: CaseEvent[]; questions: Question[]; pending: number; resolution: ResolutionView | null;
}

const AREA: CSSProperties = { width: "100%", minHeight: 64, resize: "vertical", font: "inherit", fontSize: 13.5, padding: "8px 10px", borderRadius: 10,
  border: "1px solid var(--line)", background: "var(--card, #fff)", color: "var(--text)" };
const ROW: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" };

/**
 * The case's closing, on the Collector's case page (the owner's request of 28 Nov): for a closed case, how it was resolved (the photo, large,
 * the officer's remark, who approved it), with Reopen (back to the same department as Reopened, with your remark) and Ask the department
 * (a question; the case stays closed; the officer's answer shows here). For a case you reopened, what you asked for. Short: one card.
 */
export function CaseLifecycle({ id, c }: { id: string; c: Console }) {
  const [d, setD] = useState<Life | null>(null);
  const [form, setForm] = useState<"reopen" | "ask" | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [again, setAgain] = useState(0);
  const [big, setBig] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/collector/decisions/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => null); if (live && r.ok && j) setD(j as Life); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [id, c.reloadKey, again]);

  if (!d || (d.open && !d.reopened && !d.questions.length)) return null;
  const dept = d.deptName ?? "the department";
  const res = d.resolution;
  const photo = res?.photos?.[0] ?? null;

  const submit = async () => {
    if (!form) return;
    const note = text.trim();
    if (note.length < 10) { setErr(form === "reopen" ? "Write what is still wrong, or what the department should check." : "Write the question for the department."); return; }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/collector/decisions/${encodeURIComponent(id)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: form, note })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not save it.");
      c.toast(form === "reopen" ? `Reopened and sent back to ${dept}. It is at the top of their list as Reopened.` : `Your question was sent to ${dept}. The case stays closed.`);
      setForm(null);
      setText("");
      c.markChanged?.();
      setAgain((n) => n + 1);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="iv-rep" style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0,
      ...(d.open ? { background: "var(--high-soft)", borderColor: "var(--high-line, var(--line))" } : {}) }}>
      {!d.open ? (
        <>
          <div className="iv-t"><I n="checkc" />How it was closed</div>
          {photo && (
            <button onClick={() => setBig(photo)} aria-label="Show the photo large" title="Show the photo large"
              style={{ padding: 0, border: 0, background: "none", cursor: "zoom-in", display: "block", width: "100%" }}>
              <img src={photo} alt="After the work" loading="lazy" style={{ width: "100%", maxHeight: 240, objectFit: "cover", borderRadius: 12, display: "block" }} />
            </button>
          )}
          {/* the department's report and its remark are shown just above (Work reported by ...); a close with no report shows the record's note */}
          {res?.remark && !res.report && <q style={{ margin: 0 }}>{res.remark}</q>}
          <small className="dim">
            {approvedWords(res, "collector")}{res?.closedAt ? ` · ${fmtShort(res.closedAt)}` : ""}{res?.by && res.report ? ` · report by ${res.by}` : ""}
            {d.status === "Rejected" ? " · rejected" : ""}
          </small>
          {form == null && (
            <span style={ROW}>
              {d.canReopen && <button className="btn sm plain" onClick={() => { setForm("reopen"); setErr(""); }} title={`Send it back to ${dept} as Reopened, with your remark`}><I n="refresh" />Reopen</button>}
              {d.canAsk && <button className="btn sm plain" onClick={() => { setForm("ask"); setErr(""); }} title="Ask the department about this case; it stays closed"><I n="send" />Ask the department</button>}
            </span>
          )}
        </>
      ) : d.reopened ? (
        <>
          <div className="iv-t" style={{ color: "var(--high)" }}><I n="refresh" />Reopened by you · {rel(d.reopened.t, c.now)}</div>
          {d.reopened.note && <q style={{ margin: 0 }}>{d.reopened.note}</q>}
          <small className="dim">Back with {dept} as Reopened; it closes again once they complete it.</small>
        </>
      ) : null}

      {form && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="dim" htmlFor={`cl-${id}`} style={{ fontSize: 12.5 }}>
            {form === "reopen" ? `What is still wrong, or what should ${dept} check? This goes to the officer with the case.` : `Your question for ${dept}. The case stays closed.`}
          </label>
          <textarea id={`cl-${id}`} style={AREA} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} autoFocus disabled={busy}
            placeholder={form === "reopen" ? "e.g. Garbage is back at the same spot; clear it and add the spot to the daily route." : "e.g. Was the drain cleared along the whole street, or only at the junction?"} />
          {err && <div className="oerr" role="alert" style={{ color: "var(--sev)", fontSize: 13 }}>{err}</div>}
          <span style={ROW}>
            <button className="btn sm" disabled={busy} onClick={submit}>
              {busy ? <><I n="refresh" className="spin" />Saving…</> : form === "reopen" ? <><I n="refresh" />Reopen and send back</> : <><I n="send" />Send question</>}
            </button>
            <button className="btn sm plain" disabled={busy} onClick={() => { setForm(null); setText(""); setErr(""); }}>Cancel</button>
          </span>
        </div>
      )}

      {d.questions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="iv-t"><I n="send" />Your questions to {dept}</div>
          {d.questions.map((q) => (
            <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 13 }}>
              <span><b>You asked</b> · {fmtShort(q.t)}: {q.question}</span>
              {q.answer
                ? <span style={{ color: "var(--text-2)" }}><b>{dept} answered</b> · {fmtShort(q.answer.t)}: {q.answer.text}</span>
                : <span className="dim"><I n="clock" /> Waiting for the department&apos;s answer</span>}
            </div>
          ))}
        </div>
      )}
      {big && <PhotoLightbox src={big} alt="After the work" onClose={() => setBig(null)} />}
    </div>
  );
}
