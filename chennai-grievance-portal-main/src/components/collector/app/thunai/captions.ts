/**
 * The ribbon's live words while someone is speaking: the browser's own recognition (continuous, interim results), restarted
 * as the browser ends it. Display only, never an action: Whisper's text decides, and a "yes" from captions never counts (they
 * can catch Jarvis's own voice). Where the browser has no service the ribbon just shows that speech is being heard.
 *
 * v5 (C3): the recogniser sends room audio to the browser's speech service, so it runs only while Jarvis is woken or engaged:
 * `may` (the console passes the conductor's inWindow: within ENGAGED_MS of the wake or of Jarvis's last turn, or while it speaks)
 * is asked before every start, the browser's own restarts and a language change included. Outside the window nothing starts.
 *
 * v15 (22 Nov, the owner: "when I speak, the words should be typed in the bar as I speak, like Claude's voice mode, never the older
 * question"): the recogniser is kept running inside the window (turnstate.ts HearingCaptions), so it is already listening when a
 * sentence starts; it took 0.3-1 s to start at the onset, so a sentence's first words never showed and the bar kept the last
 * question. `mark()` starts a new sentence: only what is heard after it is shown (the results before it, Jarvis's own voice
 * included, are left out), and every result since the mark is shown, not only the last one.
 */
type Result = { isFinal: boolean; 0: { transcript: string } };
type Rec = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<Result> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; start: () => void; stop: () => void; abort: () => void;
};
const Recognizer = (): (new () => Rec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
export const canCaption = () => !!Recognizer();

/**
 * v15: the words of one sentence out of a continuous recogniser's results: every result from `base` on, joined, with the part of the
 * result that was still being heard at the mark (`carry`, Jarvis's voice or the end of the last sentence) cut from its front.
 */
export function sentenceText(results: ArrayLike<Result>, base: number, carry: string): string {
  let t = "";
  for (let i = Math.max(0, base); i < results.length; i++) t += `${results[i][0].transcript} `;
  t = t.replace(/\s+/g, " ").trim();
  const c = carry.replace(/\s+/g, " ").trim();
  if (c && t.toLowerCase().startsWith(c.toLowerCase())) t = t.slice(c.length).trim();
  return t;
}

export class Captions {
  private r: Rec | null = null;
  private alive = false;
  /** v15: the first result of the sentence being heard (a final result before it belongs to an earlier one) */
  private base = 0;
  /** v15: the unfinished result's words at the mark: cut from the front of the sentence's text */
  private carry = "";
  private last: ArrayLike<Result> | null = null;
  private fails = 0;
  constructor(private lang: string, private onText: (t: string) => void, private may: () => boolean = () => true) {}
  start() {
    const R = Recognizer();
    if (!R) return false;
    // outside the engaged window (C3): no recogniser, and the browser's restart loop ends here
    if (!this.may()) { this.alive = false; return false; }
    this.alive = true;
    const r = new R();
    this.r = r;
    r.lang = this.lang; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
    this.base = 0; this.carry = ""; this.last = null;
    r.onresult = (e) => {
      if (this.r !== r) return;
      this.fails = 0;
      this.last = e.results;
      const t = sentenceText(e.results, this.base, this.carry);
      if (t) this.onText(t);
    };
    r.onerror = (e) => {
      if (this.r !== r) return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { this.alive = false; return; }
      if (e.error !== "no-speech" && e.error !== "aborted") this.fails++;
    };
    // restarted as the browser ends it; after errors (offline, no speech service) more and more slowly, then not at all
    r.onend = () => {
      if (this.r !== r || !this.alive) return;
      if (this.fails > 8) { this.alive = false; return; }
      setTimeout(() => { if (this.alive && this.r === r) this.start(); }, this.fails ? 120 * 2 ** Math.min(this.fails, 6) : 0);
    };
    try { r.start(); } catch { /* already started */ }
    return true;
  }
  /** v15: a new sentence starts now: what the recogniser heard before it (finished or not) is not this sentence's */
  mark() {
    const res = this.last;
    if (!res || !res.length) { this.base = 0; this.carry = ""; return; }
    const tail = res[res.length - 1];
    if (tail.isFinal) { this.base = res.length; this.carry = ""; }
    else { this.base = res.length - 1; this.carry = tail[0].transcript; }
  }
  get running() { return this.alive; }
  setLang(lang: string) { if (lang === this.lang) return; this.lang = lang; if (this.alive) { this.stop(); this.start(); } }
  stop() {
    this.alive = false;
    const r = this.r;
    this.r = null;
    if (r) { r.onresult = null; r.onerror = null; r.onend = null; try { r.abort(); } catch { /* gone */ } }
  }
}
