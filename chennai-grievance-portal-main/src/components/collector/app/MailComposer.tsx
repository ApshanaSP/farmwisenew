"use client";
/**
 * Draft a mail to any department officer or staff member, about anything (28 Nov 2026, the owner). Opened from the Menu and the search
 * palette, and by Jarvis or the chatbot ("draft a mail to the Metrowater officer about ..."): openMail({ topic, dept }) sends the
 * "diq:compose-mail" event, and MailComposerHost (drawn once by the console) opens the composer. With a topic it drafts at once.
 * The Collector picks the department and the person, reads and edits the AI's draft, and approves the send (lib/collector/composemail.ts).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { MailDept, MailPerson } from "@/lib/collector/composemail";
import { I } from "./icons";
import type { Console } from "./CollectorApp";

export interface MailAsk { topic?: string; dept?: string | null }
export const openMail = (a: MailAsk = {}) => window.dispatchEvent(new CustomEvent<MailAsk>("diq:compose-mail", { detail: a }));

/**
 * "draft a mail to X about Y", in English, Tanglish or Tamil: the words after the verb are the topic (the composer guesses the department
 * from them). null when the sentence does not ask for a mail.
 */
const MAIL_RE = /\b(?:draft|write|compose|prepare|send|make)\s+(?:an?\s+|the\s+)?(?:e-?mail|mail|letter|message)\b|\b(?:e-?mail|mail)\s+(?:the|to)\b|மின்னஞ்சல்|கடிதம்\s*(?:எழுது|தயார்)|mail\s+(?:podu|anuppu|ezhudhu|draft\s+pannu)/i;
export function mailAsk(text: string): MailAsk | null {
  const t = text.trim();
  if (!MAIL_RE.test(t)) return null;
  return { topic: t.replace(/^(?:hi|hey|ok|okay)?\s*jarvis[,\s]*/i, "").trim() };
}

/** the department the Collector's words point at: its name's words, or a few everyday names for it */
const ALIAS: [RegExp, RegExp][] = [
  [/\bpolice|law and order|traffic police\b/i, /police/i], [/\bmetro ?water|drinking water|sewage|sewer\b/i, /metro ?water|water supply|cmwssb/i],
  [/\belectric|power cut|tangedco|eb\b|street ?light/i, /electric|tangedco|tneb/i], [/\bgarbage|waste|swm|conservancy\b/i, /solid waste/i],
  [/\bstorm ?water|drain\b/i, /storm water/i], [/\bhealth|hospital|dengue|fever\b/i, /health|hospital/i], [/\bpwd|lake|reservoir|canal|river\b/i, /water resources|pwd/i],
  [/\broad|pothole|bridge\b/i, /road|bridge|highway/i], [/\bfire\b/i, /fire/i], [/\brevenue|tahsildar|vao|patta\b/i, /revenue/i], [/\bdisaster|relief|shelter\b/i, /disaster/i],
  [/\bcorporation|gcc|commissioner\b/i, /corporation/i], [/\bschool|education\b/i, /education|school/i]
];
export function guessDept(topic: string, depts: MailDept[]): string | null {
  for (const [said, name] of ALIAS) if (said.test(topic)) { const d = depts.find((x) => name.test(x.name) || name.test(x.code)); if (d) return d.code; }
  const w = new Set(topic.toLowerCase().split(/[^a-z]+/).filter((x) => x.length > 3));
  let best: { code: string; n: number } | null = null;
  for (const d of depts) {
    const n = d.name.toLowerCase().split(/[^a-z]+/).filter((x) => x.length > 3 && w.has(x)).length;
    if (n && (!best || n > best.n)) best = { code: d.code, n };
  }
  return best?.code ?? null;
}

export function MailComposerHost({ c }: { c: Console }) {
  const [ask, setAsk] = useState<MailAsk | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const f = (e: Event) => { setAsk((e as CustomEvent<MailAsk>).detail ?? {}); setN((k) => k + 1); };
    window.addEventListener("diq:compose-mail", f);
    return () => window.removeEventListener("diq:compose-mail", f);
  }, []);
  useEffect(() => {
    if (!ask) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setAsk(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [ask]);
  if (!ask) return null;
  return (
    <div className="nact-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) setAsk(null); }}>
      <Composer key={n} ask={ask} c={c} onClose={() => setAsk(null)} />
    </div>
  );
}

function Composer({ ask, c, onClose }: { ask: MailAsk; c: Console; onClose: () => void }) {
  const [depts, setDepts] = useState<MailDept[] | null>(null);
  const [dept, setDept] = useState<string>(ask.dept ?? "");
  const [people, setPeople] = useState<MailPerson[] | null>(null);
  const [to, setTo] = useState("officer");
  const [topic, setTopic] = useState(ask.topic ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [ai, setAi] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ note: string; deptName: string; ref?: string } | null>(null);
  const auto = useRef(!!ask.topic);

  useEffect(() => {
    fetch("/api/collector/mail").then((r) => r.json()).then((j) => {
      const ds = (j.depts ?? []) as MailDept[];
      setDepts(ds);
      setDept((d) => d || guessDept(ask.topic ?? "", ds) || "");
    }).catch(() => setDepts([]));
  }, [ask.topic]);
  useEffect(() => {
    if (!dept) { setPeople(null); return; }
    let live = true;
    setPeople(null);
    fetch(`/api/collector/mail?dept=${encodeURIComponent(dept)}`).then((r) => r.json()).then((j) => { if (live) { setPeople(j.people ?? []); setTo((j.people ?? [])[0]?.id ?? "officer"); } }).catch(() => live && setPeople([]));
    return () => { live = false; };
  }, [dept]);

  const draft = useCallback(async () => {
    if (!dept || topic.trim().length < 5) return;
    setDrafting(true);
    try {
      const r = await fetch("/api/collector/mail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft", dept, to, topic }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not draft it.");
      setSubject(j.subject); setBody(j.body); setAi(j.ai?.model ?? null); setNote(j.delivery?.note ?? null);
    } catch (e) { c.toast((e as Error).message, "alert"); } finally { setDrafting(false); }
  }, [dept, to, topic, c]);
  // asked by Jarvis or the chatbot with a topic: drafted once the department and its people are known
  useEffect(() => { if (auto.current && dept && people) { auto.current = false; void draft(); } }, [dept, people, draft]);

  const send = async () => {
    setSending(true);
    try {
      const r = await fetch("/api/collector/mail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", dept, to, subject, body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 428 ? "Not confirmed: nothing was sent." : j.error || "Could not send.");
      setDone({ note: j.note, deptName: j.deptName, ref: j.ref });
      c.toast(`Mail sent to ${j.to?.name ?? j.deptName}. It is on the department's console.`);
    } catch (e) { c.toast((e as Error).message, "alert"); } finally { setSending(false); }
  };

  return (
    <div className="ta nact-dlg mail-dlg" role="dialog" aria-label="Draft a mail">
      <div className="ta-h">
        <span className="ta-badge"><I n="send" />Mail</span>
        <h3>Draft a mail to a department</h3>
        <button className="xbtn" onClick={onClose} aria-label="Close"><I n="x" /></button>
      </div>
      {done ? (
        <div className="ta-b ta-done">
          <span className="ta-ok"><I n="checkc" /></span>
          <h4>Sent to {done.deptName}</h4>
          <p>{done.note}</p>
          {done.ref && <p className="dim">Reference <b translate="no">{done.ref}</b>.</p>}
          <p className="dim">The officer sees it on the department console under &ldquo;From the Collector&rdquo; and replies there.</p>
          <button className="btn" onClick={onClose}><I n="chevl" />Back</button>
        </div>
      ) : (
        <>
          <div className="ta-b">
            <div className="mail-grid">
              <label className="ta-f"><small>Department</small>
                <select value={dept} onChange={(e) => setDept(e.target.value)} disabled={!depts}>
                  <option value="">{depts ? "Choose a department…" : "Loading…"}</option>
                  {(depts ?? []).map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
                </select>
              </label>
              <label className="ta-f"><small>To</small>
                <select value={to} onChange={(e) => setTo(e.target.value)} disabled={!people?.length}>
                  {!dept ? <option>Choose a department first</option> : !people ? <option>Loading…</option> : !people.length ? <option value="officer">The department&apos;s console (no email on record)</option>
                    : people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
                </select>
              </label>
            </div>
            <label className="ta-f"><small>What is it about?<em>Your words: the AI writes the mail from them</em></small>
              <textarea className="mail-topic" rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={1200}
                placeholder="e.g. Ask for a status report on the desilting of the Adyar canal by Monday" />
            </label>
            <button className="btn plain sm mail-draft" disabled={!dept || topic.trim().length < 5 || drafting} onClick={draft}>
              {drafting ? <><I n="refresh" className="spin" />Drafting…</> : <><I n="spark" />{subject ? "Draft again" : "Draft the mail"}</>}
            </button>
            {note && <div className="ta-mode"><I n="shield" />{note}</div>}
            {(subject || body) && <>
              <label className="ta-f"><small>Subject</small><input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} /></label>
              <label className="ta-f grow"><small>Message{ai ? <em><I n="spark" />Drafted by AI ({ai}) · check before sending</em> : <em>From a template</em>}</small>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={6000} /></label>
            </>}
          </div>
          <div className="ta-f2">
            <span className="grow" />
            <button className="btn plain" onClick={onClose} disabled={sending}>Cancel</button>
            <button className="btn" onClick={send} disabled={sending || !dept || subject.trim().length < 5 || body.trim().length < 40}>
              {sending ? <><I n="refresh" className="spin" />Sending…</> : <><I n="send" />Approve &amp; send</>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
