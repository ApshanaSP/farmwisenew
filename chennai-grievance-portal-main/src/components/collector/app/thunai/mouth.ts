/**
 * Jarvis's mouth. The voice ladder, first that can speak wins:
 *   1. the browser's natural voice (Edge has Pallavi for Tamil and Neerja for Indian English): free, at once. No PCM exists on
 *      this path, so barge-in is cancel only, a resume restarts at the sentence boundary, and the HUD's level is an envelope
 *      driven by the state.
 *   2. the server's voice (api/jarvis/say), played through an AudioContext (source -> gain -> analyser -> speakers), so a
 *      barge-in pauses within a frame, resumes where it stopped, and the HUD reads the real level.
 *   3. the words on screen, for the time they would take to say.
 * What was said once is kept. Every chunk (lib/thunai/chunker.ts) passes the number gate before it is spoken; a chunk that
 * fails stays on screen and is not said. The next chunk is fetched while one plays.
 */
import { chunks } from "@/lib/thunai/chunker";
import { gateChunk } from "@/lib/thunai/numbergate";
import type { JarvisVoice } from "@/lib/jarvis/voices";
import * as browser from "./voice";

export interface SpeakOpts {
  rate?: number; voice?: string | null; onLine?: (i: number) => void; onWord?: (line: number, charIndex: number) => void; onEnd?: () => void;
  /** the figures this speech may use; omitted only for text built by code from the data */
  allowed?: Set<string>;
}
export type VoicePath = "browser" | "pcm" | "text";
export interface MouthHooks { onStart?: (path: VoicePath, ack: boolean) => void; onEnd?: () => void; onGateRefused?: (raw: string[]) => void }

let hooks: MouthHooks = {};
export function setMouthHooks(h: MouthHooks) { hooks = h; }

interface Piece { text: string; line: number; first: boolean }
interface Speech { pieces: Piece[]; lang: string; o: SpeakOpts; at: number; ack: boolean }

let token = 0;
let cur: Speech | null = null;
/** the last speech that was cut short, for "continue" */
let bookmark: Speech | null = null;
let jarvisVoice: JarvisVoice = "Despina";
let speakingNow = false;
let path: VoicePath = "browser";
/** the server's voice failed: it is tried again after a minute, not never (it used to stay off until a reload) */
let serverDownUntil = 0;
let fails = 0;
const clips = new Map<string, Promise<AudioBuffer | null>>();

let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let source: AudioBufferSourceNode | null = null;
let paused = false;
const levelBuf = new Float32Array(512);

const AC = () => {
  const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return W.AudioContext ?? W.webkitAudioContext;
};
function out(): AudioContext | null {
  if (ctx) return ctx;
  const A = AC();
  if (!A) return null;
  ctx = new A();
  gain = ctx.createGain();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.5;
  gain.connect(analyser).connect(ctx.destination);
  return ctx;
}

const serverUp = () => Date.now() >= serverDownUntil;

export function setJarvisVoice(v: JarvisVoice) { jarvisVoice = v; }
export const speaking = () => speakingNow || browser.speaking();
export const voicePath = () => path;
/** Tamil can always be spoken while the server voice works */
export const hasVoice = (lang: string) => (serverUp() ? true : browser.hasVoice(lang));
export const warmVoices = browser.warmVoices;
export const voicesFor = browser.voicesFor;
/** the words being said right now (the self-hearing guard) */
export const nowSaying = (): string | null => (speakingNow && cur ? cur.pieces.map((p) => p.text).join(" ") : null);

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
  if (serverUp()) return { name: jarvisVoice, how: "server" };
  return v && v.lang.toLowerCase().startsWith(lang) ? { name: v.name, how: "browser" } : { name: null, how: "none" };
}

/** the clip for one chunk, from the cache or the server; null when the server cannot (the next rung then speaks) */
function clip(text: string, lang: "ta" | "en"): Promise<AudioBuffer | null> {
  const key = `${jarvisVoice}|${lang}|${text}`;
  const have = clips.get(key);
  if (have) return have;
  const p = (async () => {
    if (!serverUp()) return null;
    const c = out();
    if (!c) return null;
    try {
      const r = await fetch("/api/jarvis/say", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 700), lang, voice: jarvisVoice }), signal: AbortSignal.timeout(14_000) });
      if (!r.ok) throw new Error(String(r.status));
      fails = 0;
      return await c.decodeAudioData(await r.arrayBuffer());
    } catch {
      if (++fails >= 2) { serverDownUntil = Date.now() + 60_000; fails = 0; }
      clips.delete(key);
      return null;
    }
  })();
  clips.set(key, p);
  if (clips.size > 80) clips.delete(clips.keys().next().value as string);
  return p;
}

/** Fetch a line ahead of time (a greeting at start). Nothing when the browser's voice will speak it. */
export function prefetch(text: string, lang: string) { const l = short(lang); if (text.trim() && !natural(l)) void clip(text.trim(), l); }

/** Play a decoded clip from `offset` seconds, through the gain and the analyser. Resolves when it ends or is cut. */
function playPcm(buf: AudioBuffer, my: number): Promise<boolean> {
  return new Promise((done) => {
    const c = out();
    if (!c || !gain) { done(false); return; }
    void c.resume().catch(() => undefined);
    const s = c.createBufferSource();
    s.buffer = buf;
    gain.gain.cancelScheduledValues(c.currentTime);
    gain.gain.setValueAtTime(1, c.currentTime);
    s.connect(gain);
    source = s;
    s.onended = () => { if (source === s) source = null; done(my === token); };
    s.start();
  });
}

/** The browser speaks one chunk, or nothing is said and the words wait on screen. */
function fallback(text: string, lang: string, o: SpeakOpts, line: number, my: number): Promise<void> {
  return new Promise((done) => {
    const bl = short(lang) === "ta" ? "ta-IN" : "en-IN";
    if (short(lang) === "ta" && !browser.hasVoice("ta-IN")) { path = "text"; setTimeout(done, Math.min(6000, 600 + text.length * 45)); return; }
    if (!browser.canSpeak()) { path = "text"; setTimeout(done, Math.min(6000, 600 + text.length * 45)); return; }
    path = "browser";
    const ok = browser.speakText(text, bl, { rate: o.rate, voice: o.voice, onWord: (_, ch) => { if (my === token) o.onWord?.(line, ch); }, onEnd: () => done() });
    if (!ok) done();
  });
}

function pieces(lines: string[]): Piece[] {
  return lines.flatMap((raw, line) => chunks(raw).map((text, k) => ({ text, line, first: k === 0 })));
}

async function run(s: Speech, my: number) {
  const l = short(s.lang);
  let started = false;
  const start = (p: VoicePath) => { if (!started) { started = true; hooks.onStart?.(p, s.ack); } };
  for (; s.at < s.pieces.length; s.at++) {
    if (my !== token) return;
    const piece = s.pieces[s.at];
    // the gate on every spoken chunk: a figure code did not supply is not said (it stays on screen, or is not there at all)
    if (s.o.allowed) {
      const g = gateChunk(piece.text, s.o.allowed);
      if (!g.ok) { hooks.onGateRefused?.(g.bad); continue; }
    }
    if (piece.first) s.o.onLine?.(piece.line);
    if (natural(l)) {
      path = "browser";
      start("browser");
      await fallback(piece.text, s.lang, s.o, piece.line, my);
    } else {
      // the next chunk is asked for while this one is fetched and played
      const next = s.pieces[s.at + 1];
      if (next) void clip(next.text, l);
      const buf = await clip(piece.text, l);
      if (my !== token) return;
      if (buf) { path = "pcm"; start("pcm"); await playPcm(buf, my); }
      else { start(browser.hasVoice(s.lang) ? "browser" : "text"); await fallback(piece.text, s.lang, s.o, piece.line, my); }
    }
    if (my !== token) return;
    // a paused voice waits here (the PCM path resumes inside the clip; the browser path restarts this chunk)
    while (paused && my === token) await new Promise((r) => setTimeout(r, 30));
    if (my !== token) return;
    if (s.at < s.pieces.length - 1) await new Promise((r) => setTimeout(r, s.ack ? 0 : 120));
  }
  if (my !== token) return;
  speakingNow = false;
  cur = null;
  hooks.onEnd?.();
  s.o.onEnd?.();
}

/**
 * Speak lines one after another: returns false where nothing can be said at all; any later call or stopVoice() cancels it,
 * and onEnd then never fires for the cancelled one.
 */
export function speakLines(lines: string[], lang: string, o: SpeakOpts = {}): boolean {
  stopVoice();
  bookmark = null;
  const list = pieces(lines);
  if (!list.length) { o.onEnd?.(); return false; }
  const my = ++token;
  speakingNow = true;
  paused = false;
  cur = { pieces: list, lang, o, at: 0, ack: false };
  void run(cur, my);
  return true;
}

export function speakText(text: string, lang: string, o: SpeakOpts = {}): boolean {
  return speakLines([text], lang, o);
}

/**
 * The acknowledgement: only where a voice is ready at once (the browser's natural voice, or a clip already kept). It never
 * spends the server's voice and never holds up the answer: speakLines() cuts it the moment the answer exists.
 */
export function speakAck(text: string, lang: string): boolean {
  const l = short(lang);
  if (!natural(l) && !clips.has(`${jarvisVoice}|${l}|${text}`)) return false;
  stopVoice();
  const my = ++token;
  speakingNow = true;
  paused = false;
  cur = { pieces: [{ text, line: 0, first: true }], lang, o: {}, at: 0, ack: true };
  void run(cur, my);
  return true;
}

/**
 * Pause at once (the energy gate's onset). PCM: the gain goes to nothing in about a frame and the clock stops, so resume is
 * exact. speechSynthesis has no reliable pause for its natural voices: cancel, and resume restarts the chunk.
 */
export function pauseVoice() {
  if (!speakingNow) return;
  paused = true;
  if (source && ctx && gain) {
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.004);
    void ctx.suspend().catch(() => undefined);
  } else if (browser.speaking()) browser.stopVoice();
}

/** Go on from where it paused (a cough, a door). */
export function resumeVoice() {
  if (!paused) return;
  paused = false;
  if (source && ctx && gain) {
    void ctx.resume().catch(() => undefined);
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(1, ctx.currentTime, 0.004);
  } else if (cur && speakingNow && !browser.speaking()) {
    // the browser's voice was cancelled: start again from the sentence it was on
    const my = ++token;
    void run(cur, my);
  }
}

/** Everything stops; what was being said is kept for "continue". */
export function stopVoice() {
  token++;
  if (cur && !cur.ack && cur.at < cur.pieces.length) bookmark = cur;
  cur = null;
  speakingNow = false;
  paused = false;
  if (source) { try { source.onended = null; source.stop(); } catch { /* ended */ } source = null; }
  if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  browser.stopVoice();
}

/** "Continue": the interrupted answer from the chunk it was on. False when there is nothing to continue. */
export function continueAnswer(): boolean {
  const s = bookmark;
  bookmark = null;
  if (!s || s.at >= s.pieces.length) return false;
  stopVoice();
  bookmark = null;
  const my = ++token;
  speakingNow = true;
  cur = { ...s };
  void run(cur, my);
  return true;
}
export const canContinue = () => !!bookmark;
/** A new question was asked: what was interrupted before it is gone. */
export const forgetBookmark = () => { bookmark = null; };

/**
 * The voice's level, 0..1, for the HUD. The analyser on the PCM path; speechSynthesis gives no signal, so there it is an
 * envelope driven by the state (a syllable-rate pulse while speaking). The HUD shows which one it has (voicePath).
 */
export function voiceLevel(now = performance.now()): number {
  if (!speakingNow || paused) return 0;
  if (path === "pcm" && analyser) {
    analyser.getFloatTimeDomainData(levelBuf);
    let s = 0;
    for (let i = 0; i < levelBuf.length; i++) s += levelBuf[i] * levelBuf[i];
    return Math.min(1, Math.sqrt(s / levelBuf.length) * 4);
  }
  if (path === "text") return 0.15;
  return 0.45 + 0.3 * Math.sin(now / 95) * Math.sin(now / 410);
}
