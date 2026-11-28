"use client";
/**
 * Act on news that needs action (28 Nov 2026, the owner): every story the news desk marked "Needs action" has an Act button. It drafts the
 * instruction to the department officer that answers for it (lib/collector/newsaction.ts); the Collector reads it, may change it, and
 * approves the send (nothing goes before that). A severe story on a case also offers the Collector's own Take action on the case, as for
 * incidents. Once sent, the story says so, and shows the department's answer when it comes.
 *
 * The button and the status sit on the news lists (Overview, All news, the story's preview); the dialog is drawn once, by NewsActHost in the
 * console, opened with the "diq:news-act" event.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import type { NewsDraft } from "@/lib/collector/newsaction";
import { I } from "./icons";
import { rel } from "./lib";
import type { Console } from "./CollectorApp";

/** the least a story needs here */
export interface ActStory { id: string; title: string; incident?: string | null; sev?: string | null; desk?: { v: string } | null }

// ---- which stories were sent, read in one request for every list on the page (refreshed each minute and after a send)
type Sent = { at: string; done: boolean; reply: string | null; due: string | null };
const store = { sent: new Map<string, Sent>(), asked: new Map<string, string>(), subs: new Set<() => void>(), timer: 0 as unknown as ReturnType<typeof setTimeout>, v: 0 };
const notify = () => { store.v++; store.subs.forEach((f) => f()); };
function ask(s: ActStory) {
  if (store.asked.has(s.id)) return;
  store.asked.set(s.id, s.incident ?? "");
  clearTimeout(store.timer);
  store.timer = setTimeout(load, 300);
}
async function load() {
  const ids = [...store.asked.keys()];
  if (!ids.length) return;
  try {
    const r = await fetch(`/api/collector/news/action?status=${ids.map(encodeURIComponent).join(",")}&inc=${ids.map((i) => encodeURIComponent(store.asked.get(i) ?? "")).join(",")}`);
    if (!r.ok) return;
    const j = (await r.json()) as { sent: Record<string, Sent> };
    store.sent = new Map(Object.entries(j.sent ?? {}));
    notify();
  } catch { /* the status waits for the next read */ }
}
if (typeof window !== "undefined") setInterval(() => { if (store.asked.size && document.visibilityState === "visible") void load(); }, 60_000);

function useSent(s: ActStory): Sent | null {
  useEffect(() => { if (s.desk?.v === "act") ask(s); }, [s.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useSyncExternalStore((f) => { store.subs.add(f); return () => store.subs.delete(f); }, () => store.v, () => 0);
  return store.sent.get(s.id) ?? null;
}

/** "30 Nov, 4:00 pm" (IST) */
const by = (t: string) => new Date(`${t.replace(" ", "T")}+05:30`).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const open = (s: ActStory) => window.dispatchEvent(new CustomEvent<ActStory>("diq:news-act", { detail: s }));

/** the Act button (a sibling of the story's own button: buttons do not nest) */
export function NewsActButton({ s, className = "" }: { s: ActStory; className?: string }) {
  const sent = useSent(s);
  if (s.desk?.v !== "act") return null;
  return (
    <button type="button" className={`nact${sent ? (sent.done ? " done" : " sent") : ""} ${className}`} onClick={(e) => { e.stopPropagation(); open(s); }}
      title={sent ? (sent.done ? `The department answered: ${sent.reply ?? "done"}` : "Sent to the department: see or send again") : "Send this to the department officer"}>
      <I n={sent?.done ? "checkc" : "send"} />{sent ? (sent.done ? "Done" : "Sent") : "Act"}
    </button>
  );
}

/** the one-line status under a story that was sent */
export function NewsActLine({ s, now }: { s: ActStory; now: string }) {
  const sent = useSent(s);
  if (!sent || s.desk?.v !== "act") return null;
  return sent.done
    ? <span className="nact-line ok"><I n="checkc" />Department answered{sent.reply ? `: ${sent.reply.slice(0, 90)}` : ""}</span>
    : <span className="nact-line"><I n="send" />Sent to the department {rel(sent.at, now)}{sent.due ? ` · report due by ${by(sent.due)}` : ""}</span>;
}

/** the dialog, drawn once by the console */
export function NewsActHost({ c }: { c: Console }) {
  const [s, setS] = useState<ActStory | null>(null);
  useEffect(() => {
    const f = (e: Event) => setS((e as CustomEvent<ActStory>).detail ?? null);
    window.addEventListener("diq:news-act", f);
    return () => window.removeEventListener("diq:news-act", f);
  }, []);
  useEffect(() => {
    if (!s) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setS(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [s]);
  if (!s) return null;
  return (
    <div className="nact-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) setS(null); }}>
      <NewsActDialog key={s.id} s={s} c={c} onClose={() => setS(null)} />
    </div>
  );
}

function NewsActDialog({ s, c, onClose }: { s: ActStory; c: Console; onClose: () => void }) {
  const [d, setD] = useState<NewsDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ note: string; deptName: string; ref?: string } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/collector/news/action?id=${encodeURIComponent(s.id)}`)
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Could not prepare the email."); return j as NewsDraft; })
      .then((j) => { if (live) { setD(j); setSubject(j.subject); setBody(j.body); } })
      .catch((e) => live && setErr((e as Error).message));
    return () => { live = false; };
  }, [s.id]);
  const send = async () => {
    setSending(true);
    try {
      const r = await fetch("/api/collector/news/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", id: s.id, subject, body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 428 ? "Not confirmed: nothing was sent." : j.error || "Could not send.");
      setDone({ note: j.note, deptName: j.deptName, ref: j.ref });
      c.toast(`Sent to ${j.deptName}. The officer sees it on the department console.`);
      void load();
    } catch (e) {
      c.toast((e as Error).message, "alert");
    } finally {
      setSending(false);
    }
  };
  const last = d?.sent[0] ?? null;
  return (
    <div className="ta nact-dlg" role="dialog" aria-label="Act on this news">
      <div className="ta-h">
        <span className="ta-badge"><I n="news" />Needs action</span>
        <h3>Send to the department</h3>
        <button className="xbtn" onClick={onClose} aria-label="Close"><I n="x" /></button>
      </div>
      {err ? <div className="ta-b"><div className="ta-err" role="alert">{err}</div></div>
        : !d ? <div className="ta-b"><p className="nact-wait"><I n="refresh" className="spin" />Reading the story and finding its department officer…</p></div>
        : done ? (
          <div className="ta-b ta-done">
            <span className="ta-ok"><I n="checkc" /></span>
            <h4>Sent to {done.deptName}</h4>
            <p>{done.note}</p>
            {done.ref && <p className="dim">Reference <b translate="no">{done.ref}</b>.</p>}
            <p className="dim">The report is due in {d.severe ? "24" : "48"} hours. The story shows the department&apos;s answer when it comes.</p>
            <button className="btn" onClick={onClose}><I n="chevl" />Back</button>
          </div>
        ) : (
          <>
            <div className="ta-b">
              <p className="nact-story"><b>{d.title}</b>{d.incidentId ? <small>Case {d.incidentId}{d.sev ? ` · ${d.sev}` : ""}</small> : <small>News only: not yet a case</small>}</p>
              <div className="ta-to">
                <div className="ta-row"><small>Department</small><span><b>{d.deptName}</b></span></div>
                <div className="ta-row"><small>To</small>{d.to ? <span><b>{d.to.role}</b><em>{d.to.email}</em></span> : <span className="dim">No officer account: it still reaches the department console</span>}</div>
              </div>
              <div className={`ta-mode ${d.delivery.to ? "" : "warn"}`}><I n={d.delivery.mode === "sandbox" ? "shield" : "send"} />{d.delivery.note}</div>
              {last && (
                <div className={`ta-prev${last.done ? " ok" : ""}`}><I n={last.done ? "checkc" : "clock"} />
                  {last.done ? `The department answered: ${last.reply ?? "done"}` : `Already sent ${rel(last.at, c.now)}; report ${last.due ? `due by ${by(last.due)}` : "awaited"}.`}</div>
              )}
              {d.severe && d.incidentId && (
                <button type="button" className="nact-own" onClick={() => { onClose(); c.openInc(d.incidentId!); }}>
                  <I n="alert" /><span><b>Severe: take action yourself</b><small>Open the case and use Take action, as for any severe incident</small></span><I n="chevr" />
                </button>
              )}
              <label className="ta-f"><small>Subject</small><input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} /></label>
              <label className="ta-f grow"><small>Message<em>From the news desk&apos;s reading · check before sending</em></small>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} /></label>
            </div>
            <div className="ta-f2">
              <span className="grow" />
              <button className="btn plain" onClick={onClose} disabled={sending}>Cancel</button>
              <button className="btn" onClick={send} disabled={sending || subject.trim().length < 5 || body.trim().length < 40}>
                {sending ? <><I n="refresh" className="spin" />Sending…</> : <><I n="send" />{last ? "Send again" : `Send to ${d.deptName}`}</>}
              </button>
            </div>
          </>
        )}
    </div>
  );
}
