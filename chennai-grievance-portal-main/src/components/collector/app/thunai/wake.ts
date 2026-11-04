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
const WAKE = new RegExp(`(?:^|\\s)(${GREET}[\\s,.!]*)?${NAME}(?=$|[\\s,.!?])[\\s,.!?]*(.*)$`, "i");
/** said before the name and meaning nothing: still the name alone */
const FILLER = new RegExp(`^(?:(?:${GREET}|good (?:morning|afternoon|evening)|vanakkam|வணக்கம்|thanks|thank you|நன்றி|so|um|uh|hmm|ah|oh|well|please|pls|and|excuse me)[\\s,.!]*)*$`, "i");
/** said after the name and asking nothing: the command is what came before it */
const NOTHING_AFTER = /^(?:please|pls|thanks|thank you|now)?[.!?]*$/;
/** the name talked about, not called: a negation or reported speech before it, or a word that makes it the object or subject */
const NEGATED = /^(?:(?:please|so|and|but|no|ok|okay)\s+)*(?:dont|do not|never)(?=\s|$)|(?:^|\s)(?:i|we|you|he|she|they|why|who|should|could)\s+(?:dont|do not|didnt|did not|never|wont|wouldnt|shouldnt|cant|cannot)(?=\s|$)|வேண்டாம்|கூடாது|பண்ணாத|செய்யாத|(?:^|\s)(?:vendaam|vendam|koodathu|pannadha|pannadhe)(?=\s|$)/;
const REPORTED = /(?:^|\s)(?:told|tells|telling|asked|asking|said|says|saying|heard|did (?:you|i|he|she|they|we))(?=\s|$)/;
const JUST_BEFORE = /(?:^|\s)(?:tell|ask|let|did|does|is|was|has|to|about|with|by)$/;
const JUST_AFTER = /^(?:kitta|kita|ku|கிட்ட|கிட்டே|இடம்|said|says|told|made|wrote|drafted|cant|cannot|wont|doesnt|didnt|isnt|wasnt)(?=\s|$)/;
const ATTACHED = new RegExp(`${NAME}(?:['’]s|-?(?:ku|kitta)(?=\\s|$)|கிட்ட|கிட்டே|இடம்|க்கு|ஓட)`, "i");
/** the words before the name belong to the command: an English verb opens them, or Tamil word order puts the verb after the name */
const OPENS = /^(?:please\s+|pls\s+)?(?:show|open|compare|list|give|tell|read|find|sort|filter|draft|make|get|map|rank|go)(?=\s|$)/;
const VERB_LAST = /(?:kaattu|kaatu|kattu|katu|kaami|sollu|sollunga|pannu|pannunga|podu|kudu|paaru|thira)$/;

const clean = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const parts = (s: string) => {
  const m = WAKE.exec(s);
  if (!m) return null;
  return { before: s.slice(0, m.index).replace(/[\s,.!?]+$/, ""), rest: (m[2] ?? "").replace(/^(please|pls)\s+/, "").trim(), greeted: !!m[1] };
};
const about = (p: { before: string; rest: string; greeted: boolean }) => {
  const b = p.before.replace(/['’]/g, ""), r = p.rest.replace(/['’]/g, "");
  if (NEGATED.test(b) || JUST_AFTER.test(r)) return true;
  // "I said hi Jarvis, go to trends" is a call all the same
  return !(p.greeted && r) && (REPORTED.test(b) || JUST_BEFORE.test(b));
};

/** The name is in the sentence but only talked about ("don't let Jarvis draft", "I told Jarvis to forget"): not an order. */
export function talkedAbout(text: string): boolean {
  const s = clean(text);
  if (ATTACHED.test(s)) return true;
  const p = parts(s);
  return !!p && about(p);
}

/** the command said with the name, or null when the name was not called ("" when it was said alone) */
export function wakeIn(text: string): string | null {
  const s = clean(text), p = parts(s);
  if (!p || about(p)) return null;
  const idle = FILLER.test(p.before);
  if (!p.rest) return idle ? "" : p.before.replace(/^(please|pls)\s+/, "");
  if (idle) return p.rest;
  if (NOTHING_AFTER.test(p.rest)) return p.before.replace(/^(please|pls)\s+/, "");
  if (p.greeted) return p.rest;
  return OPENS.test(p.before) || /[஀-௿]/.test(p.before) || VERB_LAST.test(p.rest) ? `${p.before} ${p.rest}` : p.rest;
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
