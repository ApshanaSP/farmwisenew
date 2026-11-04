/**
 * The ribbon's live words while someone is speaking: the browser's own recognition (continuous, interim results), restarted
 * as the browser ends it. Display only, never an action: Whisper's text decides, and a "yes" from captions never counts (they
 * can catch Jarvis's own voice). Where the browser has no service the ribbon just shows that speech is being heard.
 */
type Rec = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; start: () => void; stop: () => void; abort: () => void;
};
const Recognizer = (): (new () => Rec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
export const canCaption = () => !!Recognizer();

export class Captions {
  private r: Rec | null = null;
  private alive = false;
  private base = 0;
  private seen = 0;
  private fails = 0;
  constructor(private lang: string, private onText: (t: string) => void) {}
  start() {
    const R = Recognizer();
    if (!R) return false;
    this.alive = true;
    const r = new R();
    this.r = r;
    r.lang = this.lang; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
    this.base = 0; this.seen = 0;
    r.onresult = (e) => {
      if (this.r !== r) return;
      this.fails = 0;
      let t = "";
      this.seen = e.results.length;
      for (let i = Math.max(this.base, e.results.length - 1); i < e.results.length; i++) t += e.results[i][0].transcript;
      this.onText(t.trim());
    };
    r.onerror = (e) => {
      if (this.r !== r) return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { this.alive = false; return; }
      if (e.error !== "no-speech") this.fails++;
    };
    // restarted as the browser ends it; after errors (offline, no speech service) more and more slowly, then not at all
    r.onend = () => {
      if (this.r !== r || !this.alive) return;
      if (this.fails > 8) { this.alive = false; return; }
      setTimeout(() => { if (this.alive && this.r === r) this.start(); }, 120 * 2 ** Math.min(this.fails, 6));
    };
    try { r.start(); } catch { /* already started */ }
    return true;
  }
  setLang(lang: string) { if (lang === this.lang) return; this.lang = lang; if (this.alive) { this.stop(); this.start(); } }
  stop() {
    this.alive = false;
    const r = this.r;
    this.r = null;
    if (r) { r.onresult = null; r.onerror = null; r.onend = null; try { r.abort(); } catch { /* gone */ } }
  }
}
