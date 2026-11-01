/**
 * "Hi Jarvis": the wake word, with the browser's own speech service (Chrome and Edge; nothing is sent by this code).
 * A quiet recogniser keeps listening while Jarvis is idle; when it hears the name (hi / hey / hello / ok Jarvis, in
 * English or Tamil script) it wakes Jarvis. A command said in the same breath ("hey Jarvis, show the severe cases")
 * is handed over as it is, so the Collector does not have to wait for the beep. The browser ends a long listen by
 * itself now and then: it is started again at once while the wake word is on. Only one recogniser can listen at a
 * time, so Jarvis pauses this one while it listens for a command or speaks.
 */

type Rec = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; length: number; [k: number]: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
const Ctor = (): (new () => Rec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
export const canWake = () => !!Ctor();

/** the name as speech services write it down (Jarvis is often heard as "jarvis", "jervis", "javis", "service" never counts) */
const NAME = "(?:jarvis|jarviz|jarvish|jarwis|jervis|jarves|javis|jaarvis|ஜார்விஸ்|ஜார்விஸ|ஜார்வீஸ்|ஜாவிஸ்)";
const GREET = "(?:hi|hey|hello|hai|ok|okay|yo|ஹாய்|ஹலோ|ஹே)";
const WAKE = new RegExp(`(?:^|\\s)(?:${GREET}[\\s,.!]*)?${NAME}(?=$|[\\s,.!?])[\\s,.!?]*(.*)$`, "i");

/** what follows the wake word, or null when the name was not said ("" when it was said alone) */
export function wakeIn(text: string): string | null {
  const m = WAKE.exec(text.toLowerCase().replace(/\s+/g, " ").trim());
  if (!m) return null;
  return (m[1] ?? "").replace(/^(please|pls)\s+/, "").trim();
}

export interface WakeOpts {
  /** the name was heard: `rest` is the command said with it ("" when the name was said alone) */
  onWake: (rest: string) => void;
  /** the microphone is blocked or the service failed for good */
  onFail?: (why: string) => void;
}

/** the one wake recogniser running on the page (a browser lets only one recogniser listen at a time) */
let current: (() => void) | null = null;

/** Start listening for the name (stopping any other wake listener first); returns a function that stops for good. */
export function startWake(o: WakeOpts): () => void {
  const R = Ctor();
  if (!R) { o.onFail?.("unsupported"); return () => undefined; }
  current?.();
  let stopped = false, rec: Rec | null = null, fails = 0, woke = false, waitT: ReturnType<typeof setTimeout> | null = null;
  const go = () => {
    if (stopped) return;
    woke = false;
    const r = new R();
    rec = r;
    // Indian English hears "Hi Jarvis" well, also from a Tamil speaker; the command after it is heard again in the
    // Collector's language by Jarvis's own listen when it is not said in the same breath
    r.lang = "en-IN";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 3;
    r.onresult = (e) => {
      if (woke) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        for (let k = 0; k < Math.min(res.length, 3); k++) {
          const rest = wakeIn(res[k].transcript);
          if (rest == null) continue;
          // the name alone: wake now. With words after it: wait for the sentence to end (the final result), so the
          // whole command is handed over, but not longer than 1.6 s
          if (!rest) { woke = true; fire(""); return; }
          if (res.isFinal) { woke = true; fire(rest); return; }
          if (waitT) clearTimeout(waitT);
          waitT = setTimeout(() => { if (!woke) { woke = true; fire(rest); } }, 1600);
          return;
        }
      }
    };
    r.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") { stopped = true; o.onFail?.(ev.error); }
      else if (ev.error !== "no-speech" && ev.error !== "aborted") fails++;
    };
    r.onend = () => {
      rec = null;
      if (stopped || woke) return;
      // a network hiccup: back off a little; otherwise straight back to listening
      setTimeout(go, fails > 3 ? 4000 : 150);
    };
    try { r.start(); } catch { setTimeout(go, 800); }
  };
  const fire = (rest: string) => {
    if (waitT) { clearTimeout(waitT); waitT = null; }
    try { rec?.abort(); } catch { /* already ended */ }
    rec = null;
    o.onWake(rest);
  };
  go();
  const stop = () => { stopped = true; if (waitT) clearTimeout(waitT); try { rec?.abort(); } catch { /* ended */ } rec = null; if (current === stop) current = null; };
  current = stop;
  return stop;
}
