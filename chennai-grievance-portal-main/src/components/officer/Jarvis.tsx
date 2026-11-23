"use client";

/**
 * 23 Nov 2026 (owner: "Jarvis should also be in the department officer console"): Jarvis for a department officer. A voice question goes
 * to Ask District IQ, which the server locks to the officer's own department (lib/assistant/access.ts lockDept), and the answer is shown and
 * spoken in the language asked. "Hi Jarvis" can wake it (off until the officer turns it on; the choice is kept in this browser).
 *
 * It is the same engine as the Collector's chatbot, so the officer gets the same reading of a question (the top three, the least congested,
 * why each ranks where it does) over their own department's records; the Collector's full-screen Jarvis screens stay the Collector's.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { I } from "@/components/collector/app/icons";

type Rec = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; start: () => void; stop: () => void; abort: () => void };
const recognizer = (): (new () => Rec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
/** "Hi Jarvis", "Hey Jarvis", "OK Jarvis", the way speech-to-text spells it ("Javas", "Jarvish", "Javed"), and ஜார்விஸ் */
const WAKE = /\b(?:(?:hi|hey|hello|ok|okay)\s+)?(?:jarvis|jarvish|jarwis|javas|jarvas|javis)\b|ஜார்விஸ்|ஜார்வீஸ்/i;
const KEY = "diq-officer-jarvis-wake";

export default function OfficerJarvis({ deptShort, open }: { deptShort: string; open: () => void }) {
  const [wake, setWake] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const paused = useRef(0);
  // (read after the page is on screen: the server cannot know the browser's microphone, and must draw the same first page)
  const [ok, setOk] = useState(false);

  useEffect(() => { setOk(!!recognizer()); try { setWake(localStorage.getItem(KEY) === "1"); } catch { /* storage blocked */ } }, []);

  /** open the dialog and listen there for the question (the answer is spoken there) */
  const ask = useCallback((already?: string) => {
    rec.current?.abort();
    paused.current = Date.now() + 30_000;
    open();
    // the dialog loads on first use: ask until it answers that it heard (diq:voice-ack), at most about 4 s
    let acked = false, tries = 0;
    const ack = () => { acked = true; };
    window.addEventListener("diq:voice-ack", ack, { once: true });
    const send = () => {
      if (acked || tries++ > 14) { window.removeEventListener("diq:voice-ack", ack); return; }
      window.dispatchEvent(already ? new CustomEvent("diq:voice-ask", { detail: already }) : new CustomEvent("diq:voice"));
      setTimeout(send, 300);
    };
    setTimeout(send, 150);
  }, [open]);

  // "Hi Jarvis": one quiet recognizer, started again whenever it ends, paused while the dialog's own mic is in use
  useEffect(() => {
    const R = recognizer();
    if (!wake || !R) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      if (!live) return;
      const wait = paused.current - Date.now();
      if (wait > 0) { timer = setTimeout(run, wait); return; }
      const r = new R();
      rec.current = r;
      r.lang = /ta/i.test(document.documentElement.lang) ? "ta-IN" : "en-IN";
      r.continuous = true;
      r.interimResults = false;
      r.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (!res.isFinal) continue;
          const said = String(res[0]?.transcript ?? "").trim();
          const m = WAKE.exec(said);
          if (!m) continue;
          const rest = said.slice(m.index + m[0].length).replace(/^[\s,.!?]+/, "").trim();
          setHeard(rest || said);
          setTimeout(() => setHeard(null), 2500);
          // "Hi Jarvis, how many open cases in Adyar?": asked at once; "Hi Jarvis" alone: listens for the question
          ask(rest.split(/\s+/).length >= 3 ? rest : undefined);
          return;
        }
      };
      r.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") { live = false; setWake(false); } };
      r.onend = () => { rec.current = null; if (live) timer = setTimeout(run, 400); };
      try { r.start(); } catch { timer = setTimeout(run, 1500); }
    };
    run();
    return () => { live = false; if (timer) clearTimeout(timer); rec.current?.abort(); rec.current = null; };
  }, [wake, ask]);

  const toggleWake = () => setWake((v) => {
    const next = !v;
    try { localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* storage blocked */ }
    return next;
  });

  if (!ok) return null;
  return (
    <div className="ojv" role="group" aria-label="Jarvis">
      {heard && <div className="ojv-heard" role="status"><I n="mic" />{heard}</div>}
      <button className={`ojv-wake${wake ? " on" : ""}`} onClick={toggleWake} aria-pressed={wake}
        title={wake ? "Listening for “Hi Jarvis”. Click to stop." : "Let “Hi Jarvis” wake Jarvis (the microphone stays on in this tab)"}>
        <I n={wake ? "mic" : "bell"} /><span>{wake ? "Hi Jarvis: on" : "Hi Jarvis: off"}</span>
      </button>
      <button className="ojv-fab" onClick={() => ask()} title={`Ask Jarvis by voice: answers about ${deptShort} only`} aria-label={`Ask Jarvis by voice (${deptShort})`}>
        <I n="mic" /><span>Jarvis</span>
      </button>
    </div>
  );
}
