/**
 * Thunai's voice, with the browser's own speech service (no audio goes to a new service through this code). The v1 voice
 * took the first voice listed for the language, often the oldest, most robotic one. This picks the most natural voice the
 * device has (Edge and Windows "Online (Natural)" neural voices, then Google's, then any for the language), lets the
 * Collector choose another, speaks in sentence-sized pieces (Chrome stops long utterances after about 15 s), and reports
 * which line and word is being spoken, so the Stage can highlight it.
 */

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

let cache: SpeechSynthesisVoice[] = [];
function all(): SpeechSynthesisVoice[] {
  if (!canSpeak()) return [];
  const v = window.speechSynthesis.getVoices();
  if (v.length) cache = v;
  return cache;
}
/** Voices arrive late in Chrome: call once at start so the first sentence already has the good voice. */
export function warmVoices(onReady?: () => void) {
  if (!canSpeak()) return;
  if (all().length) { onReady?.(); return; }
  const h = () => { all(); onReady?.(); window.speechSynthesis.removeEventListener("voiceschanged", h); };
  window.speechSynthesis.addEventListener("voiceschanged", h);
}

/** How natural a voice sounds for the language, by what its name and language say about it. */
export function voiceScore(v: { name: string; lang: string; localService?: boolean }, lang: string): number {
  const L = lang.toLowerCase(), VL = v.lang.toLowerCase().replace("_", "-");
  let s = 0;
  if (VL === L) s += 60; else if (VL.slice(0, 2) === L.slice(0, 2)) s += 35; else return -1;
  if (/natural|neural|online|wavenet|premium|enhanced/i.test(v.name)) s += 45;
  if (/google/i.test(v.name)) s += 20;
  if (/microsoft/i.test(v.name)) s += 8;
  // Indian English first for an Indian Collector, then the clearest other English accents
  if (L === "en-in" && VL !== "en-in") s += /en-gb/.test(VL) ? 6 : /en-us/.test(VL) ? 4 : 0;
  if (/compact|espeak|robot/i.test(v.name)) s -= 30;
  return s;
}

export interface VoiceInfo { name: string; lang: string; natural: boolean }
export function voicesFor(lang: string): VoiceInfo[] {
  return all().map((v) => ({ v, s: voiceScore(v, lang) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)
    .map(({ v }) => ({ name: v.name, lang: v.lang, natural: /natural|neural|online|google|wavenet|premium|enhanced/i.test(v.name) }));
}

export function bestVoice(lang: string, preferred?: string | null): SpeechSynthesisVoice | null {
  const list = all();
  if (preferred) { const p = list.find((v) => v.name === preferred && voiceScore(v, lang) >= 0); if (p) return p; }
  let best: SpeechSynthesisVoice | null = null, bs = -1;
  for (const v of list) { const s = voiceScore(v, lang); if (s > bs) { bs = s; best = v; } }
  return best;
}

/** Can this device speak the language at all (a Tamil line read by an English voice is noise)? */
export const hasVoice = (lang: string) => !!bestVoice(lang);

/** Sentences, each short enough for Chrome to finish. */
export function chunks(text: string, max = 220): string[] {
  const parts = text.replace(/\s+/g, " ").trim().match(/[^.!?।]+[.!?।]?(\s|$)/g) ?? [text];
  const out: string[] = [];
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    if (p.length <= max) { out.push(p); continue; }
    let rest = p;
    while (rest.length > max) { const cut = rest.lastIndexOf(",", max) > 40 ? rest.lastIndexOf(",", max) + 1 : rest.lastIndexOf(" ", max); out.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim(); }
    if (rest) out.push(rest);
  }
  return out;
}

export interface SpeakOpts { rate?: number; voice?: string | null; onLine?: (i: number) => void; onWord?: (line: number, charIndex: number) => void; onEnd?: () => void }

let token = 0;
/**
 * Speak lines one after another (each line may be several sentences). Returns false where speech is unavailable; any
 * later call or stopVoice() cancels it, and onEnd then never fires for the cancelled one.
 */
export function speakLines(lines: string[], lang: string, o: SpeakOpts = {}): boolean {
  if (!canSpeak() || !lines.some((l) => l.trim())) { o.onEnd?.(); return false; }
  const s = window.speechSynthesis;
  s.cancel();
  const my = ++token;
  const voice = bestVoice(lang, o.voice);
  const queue = lines.flatMap((l, i) => chunks(l).map((c, k) => ({ line: i, text: c, first: k === 0 })));
  let at = 0;
  const next = () => {
    if (my !== token) return;
    if (at >= queue.length) { o.onEnd?.(); return; }
    const q = queue[at++];
    if (q.first) o.onLine?.(q.line);
    const u = new SpeechSynthesisUtterance(q.text);
    u.lang = voice?.lang ?? lang;
    if (voice) u.voice = voice;
    u.rate = o.rate ?? 1;
    u.pitch = 1;
    u.onboundary = (e) => { if (my === token && e.name === "word") o.onWord?.(q.line, e.charIndex); };
    u.onend = () => setTimeout(next, q.first && queue[at]?.first ? 260 : 40);
    u.onerror = (e) => { if ((e as SpeechSynthesisErrorEvent).error === "interrupted" || (e as SpeechSynthesisErrorEvent).error === "canceled") return; next(); };
    s.speak(u);
  };
  next();
  return true;
}

export function speakText(text: string, lang: string, o: SpeakOpts = {}): boolean {
  return speakLines([text], lang, o);
}

export function stopVoice() {
  token++;
  if (canSpeak()) window.speechSynthesis.cancel();
}

export const speaking = () => canSpeak() && window.speechSynthesis.speaking;
