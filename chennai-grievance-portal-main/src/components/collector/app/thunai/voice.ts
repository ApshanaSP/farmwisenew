/**
 * Thunai's voice, with the browser's own speech service (no audio goes to a new service through this code). The v1 voice
 * took the first voice listed for the language, often the oldest, most robotic one. This picks the most natural voice the
 * device has (Edge and Windows "Online (Natural)" neural voices, then Google's, then any for the language), lets the
 * Collector choose another, speaks the sentence-sized chunks mouth.ts hands it (lib/thunai/chunker.ts keeps each short enough
 * for Chrome, which stops long utterances after about 15 s), and reports
 * which line and word is being spoken, so the Stage can highlight it.
 */

import { flag } from "@/lib/thunai/flags";

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
  // an Indian voice always comes first when the device has one (the owner's wish), the most natural Indian voice first
  if (VL === L) s += 100; else if (VL.slice(0, 2) === L.slice(0, 2)) s += 35; else return -1;
  if (/natural|neural|online|wavenet|premium|enhanced/i.test(v.name)) s += 45;
  if (/google/i.test(v.name)) s += 20;
  if (/microsoft/i.test(v.name)) s += 8;
  // Indian English first for an Indian Collector, then the clearest other English accents
  if (L === "en-in" && VL !== "en-in") s += /en-gb/.test(VL) ? 6 : /en-us/.test(VL) ? 4 : 0;
  if (/compact|espeak|robot/i.test(v.name)) s -= 30;
  // an older voice installed on the machine sounds robotic beside a natural one of another accent
  if (!/natural|neural|online|wavenet|premium|enhanced|google/i.test(v.name)) s -= 25;
  // Jarvis speaks with a woman's voice: the device's female voices first, its male voices last
  const g = voiceGender(v.name);
  if (g === "f") s += 40; else if (g === "m") s -= 40;
  return s;
}

/**
 * Whether a voice is a woman's or a man's, from its name (browsers do not say): the Microsoft, Google and Apple voices
 * an Indian device has. Neerja and Pallavi (Edge's natural en-IN and ta-IN voices) and Heera (Windows) are female;
 * Prabhat, Ravi and Valluvar male.
 */
const FEMALE = /\b(female|woman|neerja|heera|pallavi|swara|kalpana|aashi|ananya|aria|jenny|zira|hazel|susan|sonia|libby|natasha|clara|emma|ava|michelle|nancy|sara|samantha|veena|lekha|kanya|shruti|priya|karen|moira|tessa|fiona|victoria|serena|catherine)\b/i;
const MALE = /\b(male|man|prabhat|ravi|valluvar|hemant|madhur|david|mark|guy|ryan|george|james|thomas|daniel|alex|fred|rishi|aaron|arthur|oliver|brian|eric|roger|steffan|christopher|andrew|davis|tony|jason)\b/i;
export function voiceGender(name: string): "f" | "m" | null {
  if (FEMALE.test(name) && !/\bmale\b/i.test(name)) return "f";
  if (MALE.test(name)) return "m";
  // Google's plain voices ("Google US English", "Google हिन्दी") are women's voices
  if (/^google\b/i.test(name)) return "f";
  return null;
}

export interface VoiceInfo { name: string; lang: string; natural: boolean; female: boolean }
export function voicesFor(lang: string): VoiceInfo[] {
  return all().map((v) => ({ v, s: voiceScore(v, lang) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)
    .map(({ v }) => ({ name: v.name, lang: v.lang, natural: /natural|neural|online|google|wavenet|premium|enhanced/i.test(v.name), female: voiceGender(v.name) === "f" }));
}

/** One voice for each language for as long as the page is open: the first best one found stays, whatever arrives later. */
const locked = new Map<string, SpeechSynthesisVoice>();
export function bestVoice(lang: string, preferred?: string | null): SpeechSynthesisVoice | null {
  const list = all();
  if (preferred) { const p = list.find((v) => v.name === preferred && voiceScore(v, lang) >= 0); if (p) return p; }
  const have = locked.get(lang);
  if (have) return have;
  let best: SpeechSynthesisVoice | null = null, bs = -1;
  for (const v of list) { const s = voiceScore(v, lang); if (s > bs) { bs = s; best = v; } }
  if (best) locked.set(lang, best);
  return best;
}
/** Resolves when the browser has listed its voices (at once if it has; Chrome lists them late), or after 1.2 s. */
export function voicesReady(): Promise<void> {
  if (!canSpeak() || all().length) return Promise.resolve();
  return new Promise((res) => {
    const done = () => { window.speechSynthesis.removeEventListener("voiceschanged", done); clearTimeout(t); all(); res(); };
    const t = setTimeout(done, 1200);
    window.speechSynthesis.addEventListener("voiceschanged", done);
  });
}

/** Can this device speak the language at all (a Tamil line read by an English voice is noise)? */
export const hasVoice = (lang: string) => !!bestVoice(lang);

export interface SpeakOpts { rate?: number; voice?: string | null; onLine?: (i: number) => void; onWord?: (line: number, charIndex: number) => void; onEnd?: () => void;
  /** the voice started an utterance (its onstart): the trace's voiceStart (v5, review voice-detector-latency-3) */
  onStart?: () => void }

let token = 0;

/**
 * v6, the voice kept warm. Edge's natural voices are online: measured 17 Nov in Playwright-launched Edge (scripts in BUILD_LOG), the
 * first sentence after 20 s or more of quiet starts 543-1,560 ms after speak() (Neerja; Pallavi 585-1,451), but 145-215 ms when a
 * silent utterance went out at least 300 ms before it (100 ms before: no help), and that warmth lasted up to 15 s. So when the
 * Collector starts a sentence to Jarvis, a silent one-character utterance (volume 0) goes out in the voice the answer will use; by the
 * time the answer is ready the connection is warm. It is never counted as speaking (speaking() ignores it), never heard, and any real
 * speech cancels it. NEXT_PUBLIC_JARVIS_VOICE_PREWARM=0 turns it off.
 */
export const prewarmOn = (v: string | undefined = flag("NEXT_PUBLIC_JARVIS_VOICE_PREWARM", process.env.NEXT_PUBLIC_JARVIS_VOICE_PREWARM)) => (v ?? "").trim() !== "0";
/** silent warm-ups still queued or sounding: while only they are, the synthesiser is not "speaking" */
let warmN = 0;
let warming = false;
let warmedAt = 0;
/** not more often than this (ms): a warm connection stays warm for seconds */
export const PREWARM_EVERY_MS = 3000;
/** Warm each language's best voice (the answer may come in either), in order; false when nothing was sent. */
export function prewarm(langs: string | string[], now: number = Date.now()): boolean {
  if (!prewarmOn() || !canSpeak()) return false;
  const s = window.speechSynthesis;
  if (s.speaking || s.pending || now - warmedAt < PREWARM_EVERY_MS) return false;
  const voices = [...new Set((Array.isArray(langs) ? langs : [langs]).map((l) => bestVoice(l)).filter((v): v is SpeechSynthesisVoice => !!v))];
  if (!voices.length) return false;
  warmedAt = now;
  for (const voice of voices) {
    const u = new SpeechSynthesisUtterance(".");
    u.voice = voice; u.lang = voice.lang; u.volume = 0; u.rate = 1;
    const done = () => { warmN = Math.max(0, warmN - 1); warming = warmN > 0; };
    u.onend = done; u.onerror = done;
    warmN++;
    warming = true;
    s.speak(u);
  }
  return true;
}
/** test hook: forget the last warm-up time */
export function resetPrewarm() { warmedAt = 0; warming = false; warmN = 0; }

/**
 * Speak lines one after another, one utterance each: the caller (mouth.ts) has already cut the answer into chunks short
 * enough for Chrome (lib/thunai/chunker.ts), so they are not cut again here. Returns false where speech is unavailable; any
 * later call or stopVoice() cancels it, and onEnd then never fires for the cancelled one.
 */
export function speakLines(lines: string[], lang: string, o: SpeakOpts = {}): boolean {
  if (!canSpeak() || !lines.some((l) => l.trim())) { o.onEnd?.(); return false; }
  const s = window.speechSynthesis;
  s.cancel();
  warming = false; warmN = 0;
  if (s.paused) s.resume();
  const my = ++token;
  const voice = bestVoice(lang, o.voice);
  const queue = lines.map((l, i) => ({ line: i, text: l.replace(/\s+/g, " ").trim(), first: true })).filter((q) => q.text);
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
    // a woman's voice as it is; where the device has only a man's voice for the language, a little lighter
    u.pitch = voice && voiceGender(voice.name) === "m" ? 1.18 : 1.04;
    u.onstart = () => { if (my === token) o.onStart?.(); };
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
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  warming = false; warmN = 0;
  // Chrome keeps a paused synthesiser paused after cancel(), and the next answer would then wait in silence
  if (window.speechSynthesis.paused) window.speechSynthesis.resume();
}

/** v6: the silent warm-up (prewarm) is not speaking */
export const speaking = () => canSpeak() && window.speechSynthesis.speaking && !warming;

/**
 * Pause the utterance in progress (the barge-in's duck, behind its flag in mouth.ts). Whether Edge's natural voices honour
 * pause() is not verified: mouth.ts measures what `paused` reports. False when nothing is being said.
 */
export function pause(): boolean {
  if (!canSpeak() || !window.speechSynthesis.speaking) return false;
  window.speechSynthesis.pause();
  return true;
}
export function resume() { if (canSpeak() && window.speechSynthesis.paused) window.speechSynthesis.resume(); }
export const isPaused = () => canSpeak() && window.speechSynthesis.paused;
