"use client";

import { useState, type CSSProperties } from "react";
import { I } from "@/components/collector/app/icons";
import { fmtShort } from "@/components/collector/app/lib";

export interface Inquiry { id: number; t: string; question: string; answer: { t: string; text: string; by: string } | null }

// inline, so the box needs nothing from the console's stylesheet (being restyled separately); the theme's own colour tokens
const BOX: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, width: "100%", minWidth: 0 };
const HEAD: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 };
const AREA: CSSProperties = { width: "100%", minHeight: 56, resize: "vertical", font: "inherit", fontSize: 13.5, padding: "8px 10px", borderRadius: 10,
  border: "1px solid var(--line)", background: "var(--surface, #fff)", color: "var(--text)" };

/**
 * The Collector's question about a closed case, in the drawer's actions: the officer writes the answer, which goes to the Collector's case
 * page (POST /api/officer/grievances/[id]/answer). The case stays as it is. Answered, it shows the answer and when it was sent.
 */
export function CaseAnswer({ caseId, q, onDone }: { caseId: string; q: Inquiry; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (q.answer) {
    return (
      <div style={BOX} role="status">
        <span style={HEAD}><I n="checkc" /><b>You answered the Collector</b> · {fmtShort(q.answer.t)}</span>
        <small style={{ color: "var(--text-2)" }}>“{q.question}” — {q.answer.text}</small>
      </div>
    );
  }
  const send = async () => {
    const t = text.trim();
    if (t.length < 5) { setErr("Write your answer to the Collector's question."); return; }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/officer/grievances/${encodeURIComponent(caseId)}/answer`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inquiryId: q.id, text: t })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not send the answer.");
      setText("");
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={BOX}>
      <span style={{ ...HEAD, color: "var(--high, #C9600A)" }}><I n="alert" /><b>The Collector asks</b> · {fmtShort(q.t)}</span>
      <q style={{ fontSize: 13.5 }}>{q.question}</q>
      <textarea style={AREA} value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder="Your answer to the Collector"
        aria-label="Your answer to the Collector" disabled={busy} />
      {err && <div className="oerr" role="alert">{err}</div>}
      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <button className="btn ok" disabled={busy} onClick={send}>{busy ? <><I n="refresh" className="spin" />Sending…</> : <><I n="send" />Send answer</>}</button>
        <span className="hint">The case stays closed; your answer shows on the Collector&apos;s case page.</span>
      </span>
    </div>
  );
}
