/**
 * Jarvis's mouth: the same calls as voice.ts (speakText, speakLines, stopVoice), spoken by the server's voice
 * (api/jarvis/say: Gemini, a woman's voice, Tamil and English alike). The next line is fetched while one plays, and
 * what was said once is kept, so repeats start at once. When the server cannot speak (busy, offline, no key), English
 * falls back to the browser's best female voice (voice.ts) and Tamil to the browser's Tamil voice if the PC has one;
 * otherwise the words stay on screen for the time they would take to say.
 */
import type { JarvisVoice } from "@/lib/jarvis/voices";
import * as browser from "./voice";

export interface SpeakOpts { rate?: number; voice?: string | null; onLine?: (i: number) => void; onWord?: (line: number, charIndex: number) => void; onEnd?: () => void }

let token = 0;
let audio: HTMLAudioElement | null = null;
/** the server spoke last time (false after it failed twice in a row: then the browser speaks until a reload) */
let serverOk = true;
let fails = 0;
const clips = new Map<string, Promise<string | null>>();
let jarvisVoice: JarvisVoice = "Despina";
let speakingNow = false;

export function setJarvisVoice(v: JarvisVoice) { jarvisVoice = v; }
export const speaking = () => speakingNow || browser.speaking();
/** Tamil can always be spoken while the server voice works */
export const hasVoice = (lang: string) => (serverOk ? true : browser.hasVoice(lang));
export const warmVoices = browser.warmVoices;
export const voicesFor = browser.voicesFor;

const short = (l: string) => (l.toLowerCase().startsWith("ta") ? "ta" : "en") as "ta" | "en";

/**
 * the browser has a natural (online, neural) woman's voice for the language: it speaks, free and at once. Microsoft
 * Edge has them for Tamil (Pallavi) and Indian English (Neerja); Chrome has Google's English ones but no Tamil.
 */
function natural(lang: "ta" | "en"): boolean {
  const v = browser.bestVoice(lang === "ta" ? "ta-IN" : "en-IN");
  return !!v && browser.voiceGender(v.name) === "f" && /natural|neural|online|google/i.test(v.name) && v.lang.toLowerCase().startsWith(lang);
}

/** Which voice Jarvis speaks the language with on this browser, for its settings ("Microsoft Pallavi · Edge"). */
export function voiceInfo(lang: "ta" | "en"): { name: string | null; how: "browser" | "server" | "none" } {
  const v = browser.bestVoice(lang === "ta" ? "ta-IN" : "en-IN");
  if (natural(lang) && v) return { name: v.name.replace(/^Microsoft\s+/, "").replace(/\s*\(Natural\).*$/, "").replace(/\s+Online.*$/, ""), how: "browser" };
  if (serverOk) return { name: jarvisVoice, how: "server" };
  return v && v.lang.toLowerCase().startsWith(lang) ? { name: v.name, how: "browser" } : { name: null, how: "none" };
}

/** the clip for one line, from the cache or the server; null when the browser's own natural voice speaks it, or the server cannot */
function clip(text: string, lang: "ta" | "en"): Promise<string | null> {
  if (natural(lang)) return Promise.resolve(null);
  const key = `${jarvisVoice}|${lang}|${text}`;
  const have = clips.get(key);
  if (have) return have;
  const p = (async () => {
    if (!serverOk) return null;
    try {
      const r = await fetch("/api/jarvis/say", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 700), lang, voice: jarvisVoice }),
        signal: AbortSignal.timeout(14_000) });
      if (!r.ok) throw new Error(String(r.status));
      fails = 0;
      return URL.createObjectURL(await r.blob());
    } catch {
      if (++fails >= 2) serverOk = false;
      clips.delete(key);
      return null;
    }
  })();
  clips.set(key, p);
  if (clips.size > 80) clips.delete(clips.keys().next().value as string);
  return p;
}

/** Fetch a line ahead of time (the reply's first words while the agent still thinks, a greeting at start). */
export function prefetch(text: string, lang: string) { if (text.trim()) void clip(text.trim(), short(lang)); }

function play(url: string, my: number, rate: number): Promise<boolean> {
  return new Promise((done) => {
    const a = new Audio(url);
    audio = a;
    a.playbackRate = Math.max(0.8, Math.min(1.25, rate));
    a.onended = () => done(true);
    a.onerror = () => done(false);
    a.play().then(() => { if (my !== token) { a.pause(); done(true); } }).catch(() => done(false));
  });
}

/** the browser speaks one line (the fallback), or nothing is said and the words wait on screen */
function fallback(text: string, lang: string, o: SpeakOpts): Promise<void> {
  return new Promise((done) => {
    const bl = short(lang) === "ta" ? "ta-IN" : "en-IN";
    if (short(lang) === "ta" && !browser.hasVoice("ta-IN")) { setTimeout(done, Math.min(6000, 600 + text.length * 45)); return; }
    if (!browser.speakText(text, bl, { rate: o.rate, voice: o.voice, onEnd: () => done() })) done();
  });
}

/**
 * Speak lines one after another (same contract as voice.speakLines): returns false where nothing can speak at all;
 * any later call or stopVoice() cancels it, and onEnd then never fires for the cancelled one.
 */
export function speakLines(lines: string[], lang: string, o: SpeakOpts = {}): boolean {
  // a long reply starts sooner: its first sentence is spoken while the rest is still being made
  // (each piece keeps the number of the line it came from, for the Stage's highlight)
  const pieces = lines.flatMap((raw, line) => {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) return [];
    const m = t.length > 160 ? /^(.{25,170}?[.!?।])\s+(.+)$/.exec(t) : null;
    return (m ? [m[1], m[2]] : [t]).map((text, k) => ({ text, line, first: k === 0 }));
  });
  const list = pieces.map((x) => x.text);
  stopVoice();
  const my = ++token;
  if (!list.length) { o.onEnd?.(); return false; }
  const l = short(lang);
  speakingNow = true;
  void (async () => {
    // the first two pieces are asked for at once; each later one while the one before it plays
    void clip(list[0], l); if (list[1]) void clip(list[1], l);
    for (let i = 0; i < list.length; i++) {
      if (my !== token) return;
      if (pieces[i].first) o.onLine?.(pieces[i].line);
      if (list[i + 1]) void clip(list[i + 1], l);
      const url = await clip(list[i], l);
      if (my !== token) return;
      const ok = url ? await play(url, my, o.rate ?? 1) : false;
      if (my !== token) return;
      if (!ok) await fallback(list[i], lang, o);
      if (my !== token) return;
      if (i < list.length - 1) await new Promise((r) => setTimeout(r, 180));
    }
    if (my !== token) return;
    speakingNow = false;
    o.onEnd?.();
  })();
  return true;
}

export function speakText(text: string, lang: string, o: SpeakOpts = {}): boolean {
  return speakLines([text], lang, o);
}

export function stopVoice() {
  token++;
  speakingNow = false;
  if (audio) { try { audio.pause(); } catch { /* gone */ } audio = null; }
  browser.stopVoice();
}
