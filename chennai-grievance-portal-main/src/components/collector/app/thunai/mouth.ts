/**
 * Jarvis's mouth. The voice for an answer is chosen once, when the answer starts, and kept to its end: it never switches voice
 * or path mid-answer.
 *   1. the browser's own natural voice for the language (Edge: Pallavi for Tamil, Neerja for Indian English): free, at once.
 *   2. no natural browser voice (Tamil in Chrome): the server's voice (api/jarvis/say), asked for ONCE for the whole answer (the
 *      speech models allow 3 requests a minute, and a request per chunk spent that after about three answers), and played
 *      through an AudioContext as it arrives (source -> the answer's gain -> the duck gain -> analyser -> speakers), so a
 *      barge-in ducks or pauses within a frame and the HUD reads the real level. A request that fails before any sound sends
 *      the whole answer to the next rung; once a sound has played, the answer is never handed to another voice.
 *   3. the browser's other voice for the language.
 *   4. the words on screen, for the time they would take to say.
 * Every chunk (lib/thunai/chunker.ts) passes the number gate before it is spoken or sent: a chunk that fails stays on screen and
 * is neither said nor sent. Grouped figures from a lakh up are said in lakh and crore (lib/thunai/numberwords.ts), and the gate
 * checks the line again as it will be said. What was said is kept, so "continue" goes on with the same audio and no request.
 * v5 F1, no digit reaches any voice: after the gate, every number in the chunk is put in words in the sentence's language
 * (numberwords.ts aloud: "one point two lakh", "நாற்பத்தேழு"), and only those words go to speechSynthesis or /api/jarvis/say. A chunk
 * that still holds a number sign is not said (a count is logged, never the text). The caption and "what is being said" keep the
 * chunk as shown, with its figures; a voice's word boundary is mapped back into it.
 * The barge-in's duck (duckVoice, unduckVoice), the end-of-speech earcon (earconEnd), the numberless acknowledgement (speakAck)
 * and the warm-up on mode-on (warmVoice) live here; the conductor and Thunai.tsx decide when.
 * Trace (section 6.4): "speakCalled" when an answer's first sentence is handed to speak, "voiceStart" when the browser's voice starts
 * (its start event where voice.ts passes one, else its first word) or the PCM path schedules its first sample. Not for an acknowledgement.
 */
import { chunks } from "@/lib/thunai/chunker";
import { flag } from "@/lib/thunai/flags";
import { figuresIn, gateChunk } from "@/lib/thunai/numbergate";
import { aloud, holdsDigit, sentenceLang, shownIndex, speakNumbers, spokenAllowed, type Aloud } from "@/lib/thunai/numberwords";
import type { JarvisVoice } from "@/lib/jarvis/voices";
import { joinSamples, l16ToFloat, pieceStarts, Player, toBuffer } from "./pcmplay";
import { stamp } from "./trace";
import * as browser from "./voice";

export interface SpeakOpts {
  rate?: number; voice?: string | null; onLine?: (i: number) => void; onWord?: (line: number, charIndex: number) => void; onEnd?: () => void;
  /** the figures this speech may use; omitted only for text built by code from the data */
  allowed?: Set<string>;
  /**
   * a piece of the answer is now being said: its text as shown (after the gate and the lakh/crore wording; the voice says the same with
   * its numbers in words, v5 F1), for the bar's caption (v4, Pillar 6). onWord's charIndex counts within this piece (a boundary inside
   * a number's words is put at the number). Browser voice: just before the piece is spoken; server voice: when the audio reaches the piece.
   */
  onPiece?: (text: string, line: number) => void;
}
export type VoicePath = "browser" | "pcm" | "text";
/**
 * What a duck did: on which path, how (the gain to 20 %, the browser's voice cut with cancel() to be said again from the cut piece
 * (v5 D3; v4 paused the synthesiser here), or the voice kept speaking), and in how many ms.
 */
export interface DuckInfo { path: VoicePath; how: "gain" | "cut" | "kept"; ms: number | null; outMs: number | null }
export interface MouthHooks {
  onStart?: (path: VoicePath, ack: boolean) => void; onEnd?: (ack: boolean) => void; onGateRefused?: (raw: string[]) => void;
  /**
   * v12 (21 Nov, stale-and-double RC3): a speech was asked for (speakLines, speakAck, continueAnswer). Its sound can be seconds away (the
   * server's voice is fetched first), and onStart comes only then: until it starts or ends, the turn machine counts it as a voice on its way
   * (turn.ts voiceWanted), so a new request handed on stops it instead of letting the old answer start over the new question
   */
  onRequest?: (ack: boolean) => void;
  /**
   * an earcon is about to sound: the ears must take it as Jarvis's own sound for `ms`, the tone itself (with the output's latency)
   * lasting `toneMs` (Conductor.earcon)
   */
  onEarcon?: (ms: number, toneMs?: number) => void;
  /** a duck took effect, or could not: for the HUD strip and the barge-in telemetry */
  onDuck?: (d: DuckInfo) => void;
  /** v13 (21 Nov, review 1-11): the wake reply's clip started and sounds for `ms`: speech begun over it stops it (stopWakeReply) */
  onWakeSound?: (ms: number) => void;
  /**
   * v16 (22 Nov, the owner: "the voice reply is very late ... it's overlapping"): the Collector holds the floor (speaking now, or a sentence of
   * theirs is still at the transcriber: Conductor.floorHeld). A speech does not start over it (it waits, at most FLOOR_WAIT_MS), an
   * acknowledgement is not said at all, and during a barge-in the browser's voice, which cannot be ducked, stops at the end of its piece
   */
  floorHeld?: () => boolean;
}

let hooks: MouthHooks = {};
export function setMouthHooks(h: MouthHooks) { hooks = h; }

/** a chunk as code wrote it, before the gate */
interface Raw { text: string; line: number; first: boolean }
/** a chunk the gate passed: `text` as shown (the caption, "what is being said"), `voice` what the voice gets (numbers in words) */
interface Piece extends Raw { voice: Aloud }
/** a run of the answer asked for in one request, and its audio once it is in */
interface Group { from: number; to: number; text: string; buf: AudioBuffer | null; pending: Promise<AudioBuffer | null> | null }
/** `fin`: the last piece the browser's voice finished (-1: none yet), so a cut between two pieces says the next one, not the last again */
interface Speech { raw: Raw[]; pieces: Piece[]; lang: string; o: SpeakOpts; at: number; ack: boolean; gated: boolean; path: VoicePath | null; groups: Group[] | null; fin?: number;
  /** v16: asked for, but waiting for the Collector to give the floor back: nothing of it sounds (speaking() and nowSaying() leave it out) */
  waiting?: boolean }

const SAY = "/api/jarvis/say";
/** the most of an answer sent in one request (the route takes 2,400 characters): a longer narration is asked for in runs */
const GROUP_MAX = 2000;
/** the duck: the gain to 20 % in 30 ms (the brief allows 50) */
export const DUCK_LEVEL = 0.2;
export const DUCK_MS = 30;
/** the end-of-speech earcon's length, and how long the ears take it as Jarvis's own sound */
export const EARCON_MS = 110;
export const EARCON_GUARD_MS = 400;
/**
 * the tone as the microphone can hear it: its 110 ms, its edges, and the output's and the input's latency. Only the energy gate needs
 * this (Silero does not take a sine for speech): its onset inside this window is the tone's (conductor.ts earconDrops)
 */
export const EARCON_TONE_MS = EARCON_MS + 150;

let token = 0;
let cur: Speech | null = null;
/** the last speech that was cut short, for "continue" */
let bookmark: Speech | null = null;
const jarvisVoice: JarvisVoice = "Despina";
let speakingNow = false;
let path: VoicePath = "browser";
/** the server's voice failed: it is tried again after a minute, not never (it used to stay off until a reload) */
let serverDownUntil = 0;
let fails = 0;
/** whole answers' audio, decoded: a repeated answer, or an acknowledgement said before, costs no request */
const audioCache = new Map<string, AudioBuffer>();

let ctx: AudioContext | null = null;
/** the duck and the pause act on this gain; each answer has its own gain before it, so cutting one never touches the next */
let master: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let player: Player | null = null;
let answerGain: GainNode | null = null;
let paused = false;
/** how the voice is ducked now: not, by its gain, cut (the browser's voice, to be said again), or not at all (the browser voice keeps speaking) */
let ducked: false | DuckInfo["how"] = false;
/**
 * Stop the browser's voice on a duck. Off unless NEXT_PUBLIC_JARVIS_DUCK_PAUSE=1 (or setDuckPause(true)); off, the voice keeps
 * speaking until the barge-in is confirmed. v5 D3: on, the voice is CUT with cancel() and the piece it was on is kept; a false
 * interruption (unduckVoice) or no bid for the turn within FALSE_CUT_MS says that piece again from its start. The synthesiser's pause
 * and resume are never the mechanism (whether Edge's natural voices honour them is not verified; cancel() works on every voice).
 */
let duckPause = process.env.NEXT_PUBLIC_JARVIS_DUCK_PAUSE === "1";
/**
 * v5 D3: how long a cut browser voice waits for a bid for the turn before it says the cut piece again, ms. A bid (two live words that
 * are not backchannels, or speech held 600 ms: turn.ts) stops the voice through stopVoice() first, which keeps the piece for "continue".
 * NEXT_PUBLIC_JARVIS_FALSE_CUT_MS, default 2,000 (as LiveKit Agents' false-interruption timeout, 2.0 s, from memory and not re-checked),
 * at most 10,000.
 */
export const FALSE_CUT_MS = (() => { const n = Number(process.env.NEXT_PUBLIC_JARVIS_FALSE_CUT_MS); return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : 2000; })();
let cutT: ReturnType<typeof setTimeout> | null = null;
let lastDuckInfo: DuckInfo | null = null;
/** the earcons' own context: a paused voice (its context suspended) never swallows one */
let fx: AudioContext | null = null;
const levelBuf = new Float32Array(512);
/** v6 (Phase 6): when the browser's voice last started a word (its boundary event), and the wake reply's analyser and end */
let lastWordAt = -Infinity;
let wakeAnalyser: AnalyserNode | null = null;
let wakeUntil = 0;

const AC = () => {
  if (typeof window === "undefined") return undefined;
  const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return W.AudioContext ?? W.webkitAudioContext;
};
function out(): AudioContext | null {
  if (ctx) return ctx;
  const A = AC();
  if (!A) return null;
  ctx = new A();
  master = ctx.createGain();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.5;
  master.connect(analyser).connect(ctx.destination);
  return ctx;
}
function fxOut(): AudioContext | null {
  if (fx) return fx;
  const A = AC();
  if (!A) return null;
  try { fx = new A(); } catch { return null; }
  return fx;
}

const serverUp = () => Date.now() >= serverDownUntil;

/** v16: a speech is sounding (asked for and not waiting for the floor) */
const sounding = () => speakingNow && !cur?.waiting;
// v16 (22 Nov): a speech still waiting for the Collector's floor is not speaking (the ears' echo margin, the self-hearing guard and the
// "over the voice" rules read this): nothing of it has sounded
export const speaking = () => sounding() || browser.speaking();
/** v16: the longest a speech waits for the floor, ms; past it, it is said (a floor never given back must not silence Jarvis) */
export const FLOOR_WAIT_MS = 10_000;
const FLOOR_POLL_MS = 60;
/**
 * v16 (22 Nov): wait while the Collector holds the floor (MouthHooks.floorHeld), for at most FLOOR_WAIT_MS. Resolves at once when it is free.
 * Any newer speech or a stop moves the token on, and the wait ends with it (the caller checks the token).
 */
async function floorFree(s: Speech, my: number): Promise<void> {
  if (!hooks.floorHeld?.()) return;
  const t0 = Date.now();
  s.waiting = true;
  try {
    while (my === token && hooks.floorHeld?.() && Date.now() - t0 < FLOOR_WAIT_MS) await new Promise((r) => setTimeout(r, FLOOR_POLL_MS));
  } finally { s.waiting = false; }
}
export const voicePath = () => path;
/** Tamil can always be spoken while the server voice works */
export const hasVoice = (lang: string) => (serverUp() ? true : browser.hasVoice(lang));
export const warmVoices = browser.warmVoices;
export const voicesFor = browser.voicesFor;
/** B8: who is told when the browser refuses to sound the voice (voice.ts); B1: the browser's voice unlocked inside a click */
export const setAudioBlocked = browser.setAudioBlocked;
export const unlockSpeech = browser.unlockSpeech;
/**
 * B1 (27 Nov): a click or a key on the page: the voice's and the earcons' contexts start if the browser held them (a page nobody had clicked
 * yet). Never the voice's context while a barge-in paused it on purpose (pauseVoice), and none is made here.
 */
export function resumeMouth(): Promise<void> {
  const ps: Promise<unknown>[] = [];
  if (ctx && ctx.state === "suspended" && !paused) ps.push(ctx.resume().catch(() => undefined));
  if (fx && fx.state === "suspended") ps.push(fx.resume().catch(() => undefined));
  return Promise.all(ps).then(() => undefined);
}
/**
 * B8 (27 Nov): the server voice's first audio was scheduled this long ago and its context is still suspended (the browser waits for a click):
 * nothing of it is being heard, so the page asks for a click and the answer goes to the next rung (its words are on screen); before, it sat
 * "speaking" in silence with nothing to end it
 */
export const PCM_STALL_MS = 1500;
/** the words being said right now (the self-hearing guard), as shown */
export const nowSaying = (): string | null => (sounding() && cur ? (cur.gated ? cur.pieces : cur.raw).map((p) => p.text).join(" ") : null);
/** v5 F1: chunks not said because a number sign was left in them after the words (a count only, never the text) */
let digitRefusals = 0;
export const digitRefused = () => digitRefusals;
function refuseDigit() {
  digitRefusals++;
  console.warn(`[jarvis] voice: a chunk still held a number sign after the words and was not said (${digitRefusals} so far)`);
}
/** The last duck: its path, how, and ms (null until one happened). */
export const lastDuck = () => lastDuckInfo;
/** Turn the browser voice's pause-on-duck on or off (see duckPause). */
export function setDuckPause(on: boolean) { duckPause = on; }

const short = (l: string) => (l.toLowerCase().startsWith("ta") ? "ta" : "en") as "ta" | "en";

/**
 * the browser has a natural (online, neural) woman's voice for the language: it speaks, free and at once. Microsoft
 * Edge has them for Tamil (Pallavi) and Indian English (Neerja); Chrome has Google's English ones but no Tamil.
 */
const SERVER_FIRST = !(typeof process !== "undefined" && process.env?.VITEST);
function natural(lang: "ta" | "en"): boolean {
  // 28 Nov (the owner: "use the Sarvam speaking model instead of Edge's Neerja and Pallavi, so Jarvis answers in Chrome too"): the server's
  // voice (Sarvam first, api/jarvis/say) speaks whenever it is up and the page can play audio; the browser's voices only when it is not
  // (the unit tests keep the browser rung first: they test that rung, which is still the fallback when the server cannot speak)
  if (SERVER_FIRST && serverUp() && AC()) return false;
  const v = browser.bestVoice(lang === "ta" ? "ta-IN" : "en-IN");
  return !!v && v.lang.toLowerCase().startsWith(lang);
}
const browserCan = (l: "ta" | "en") => browser.canSpeak() && (l !== "ta" || browser.hasVoice("ta-IN"));
/** the voice for a whole answer, chosen once */
function choosePath(l: "ta" | "en"): VoicePath {
  if (natural(l)) return "browser";
  if (serverUp() && AC()) return "pcm";
  return browserCan(l) ? "browser" : "text";
}

/**
 * The path an answer in this language would take if it began now (the same choice run() makes once the voices are listed): the
 * streamed turn speaks its sentences as they come only on the browser's own voice (turnstream.ts queuesSentences).
 */
export const pathFor = (lang: string): VoicePath => choosePath(short(lang));

/** Which voice Jarvis speaks the language with on this browser, for its settings ("Microsoft Pallavi · Edge"). */
export function voiceInfo(lang: "ta" | "en"): { name: string | null; how: "browser" | "server" | "none" } {
  const v = browser.bestVoice(lang === "ta" ? "ta-IN" : "en-IN");
  if (natural(lang) && v) return { name: v.name.replace(/^Microsoft\s+/, "").replace(/\s*\(Natural\).*$/, "").replace(/\s+Online.*$/, ""), how: "browser" };
  if (serverUp()) return { name: "Sarvam", how: "server" };
  return v && v.lang.toLowerCase().startsWith(lang) ? { name: v.name, how: "browser" } : { name: null, how: "none" };
}

function pieces(lines: string[], l: "ta" | "en" = "en"): Raw[] {
  // v6: a Tamil answer's first chunk is short (chunker.ts FIRST_MAX_TA): only the answer's first line
  return lines.flatMap((raw, line) => chunks(raw, { lang: line === 0 ? l : "en" }).map((text, k) => ({ text, line, first: k === 0 })));
}

/**
 * A chunk the gate has passed, as the voice gets it: every number in words in the sentence's language (v5 F1). It runs after the gate
 * and keeps its verdict (numberwords.ts says why). Null, with a count logged, when a number sign is still in it: such a chunk is not said.
 */
function voiced(text: string, line: number, first: boolean, l: "ta" | "en"): Piece | null {
  const voice = aloud(text, sentenceLang(text, l));
  if (holdsDigit(voice.text)) { refuseDigit(); return null; }
  return { text, line, first, voice };
}

/**
 * Text for a voice outside this mouth (review voice-detector-latency-5: the read-aloud on an answer card, assistant/AnswerCard.tsx, which
 * the Jarvis tab shows for Jarvis's answers): the same step as an answer's chunks (voiced). It is cut into the same chunks, each with its
 * numbers in words in its sentence's language; a chunk that still holds a number sign is not said (a count is logged, never the text).
 * The chunks are joined by a space; null when none is left. No gate here: the card's figures are its own (its verifier checked them);
 * this keeps every digit from the voice (F1).
 */
export function wordsAloud(text: string, lang: string): string | null {
  const l = short(lang);
  const said = chunks(text).map((c) => voiced(c, 0, false, l)?.voice.text).filter((t): t is string => !!t);
  return said.length ? said.join(" ") : null;
}

/**
 * The gate on every chunk: a figure code did not supply is not said (the chunk stays on screen). The chunk is then put as it
 * will be said (lakh and crore), and that is gated again, with the rounded values the spoken forms say. Last, its numbers go into
 * words for the voice (voiced).
 */
function gate(raw: Raw[], allowed: Set<string> | undefined, l: "ta" | "en"): Piece[] {
  const kept: Piece[] = [];
  const lines = new Set<number>();
  for (const p of raw) {
    if (allowed) {
      const g = gateChunk(p.text, allowed);
      if (!g.ok) { hooks.onGateRefused?.(g.bad); continue; }
    }
    const said = speakNumbers(p.text, sentenceLang(p.text, l));
    if (allowed && said.values.length) {
      const g = gateChunk(said.text, spokenAllowed(allowed, said.values));
      if (!g.ok) { hooks.onGateRefused?.(g.bad); continue; }
    }
    const v = voiced(said.text, p.line, !lines.has(p.line), l);
    if (!v) continue;
    kept.push(v);
    lines.add(p.line);
  }
  return kept;
}

/** a run of pieces as one text, as the voice gets it: sentences of a line by a space, lines by a newline */
function joinText(ps: Piece[], from: number, to: number): string {
  let t = "";
  for (let i = from; i <= to; i++) t += (i > from ? (ps[i].line !== ps[i - 1].line ? "\n" : " ") : "") + ps[i].voice.text;
  return t;
}
function groupsFrom(ps: Piece[], from: number): Group[] {
  const gs: Group[] = [];
  let start = from, len = 0;
  const add = (a: number, b: number) => gs.push({ from: a, to: b, text: joinText(ps, a, b), buf: null, pending: null });
  for (let i = from; i < ps.length; i++) {
    const n = ps[i].voice.text.length + 1;
    if (i > start && len + n > GROUP_MAX) { add(start, i - 1); start = i; len = 0; }
    len += n;
  }
  if (start < ps.length) add(start, ps.length - 1);
  return gs;
}
/** "continue" inside a run whose audio never arrived: the runs are made again from there */
function ensureGroups(s: Speech) {
  const g = s.groups?.find((x) => x.from <= s.at && s.at <= x.to);
  if (!g || (s.at > g.from && !g.buf && !g.pending)) s.groups = groupsFrom(s.pieces, s.at);
}
/** seconds a run will take, until its audio says (for the line highlight only) */
const estimate = (text: string, l: "ta" | "en") => text.length / (l === "ta" ? 11 : 14);

/**
 * One request for a run of the answer. Each piece of audio is handed to `feed` as it arrives (a WAV in one piece, a stream in
 * many); resolves with the whole of it, or null when the server could not say it all.
 */
async function fetchAudio(text: string, l: "ta" | "en", c: AudioContext, feed: (b: AudioBuffer) => void): Promise<AudioBuffer | null> {
  // the last check before the server's voice: no number sign is ever sent (F1; the route refuses one too)
  if (holdsDigit(text)) { refuseDigit(); return null; }
  const key = `${jarvisVoice}|${l}|${text}`;
  const have = audioCache.get(key);
  if (have) { feed(have); return have; }
  if (!serverUp()) return null;
  // v13 (21 Nov, review 0-13): a controller this call holds, and its own timer, instead of AbortSignal.timeout: the page's fetch wrapper
  // (lib/activity/install.ts) puts the signal under AbortSignal.any, where a timeout signal held only by the composite may be collected
  // and never fire (Node 22 does; Chromium is unverified), so a stalled voice stream would never time out. Cleared when the request ends
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const r = await fetch(SAY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lang: l, voice: jarvisVoice, stream: true }), signal: ctl.signal });
    // the server has no voice set up (503 no-tts): asking again only logs another failed request, so it is not asked again until the page is reloaded (QA4 gate, FB-10)
    if (r.status === 503 && (await r.clone().json().catch(() => null))?.error === "no-tts") { serverDownUntil = Number.MAX_SAFE_INTEGER; return null; }
    if (!r.ok) throw new Error(String(r.status));
    const type = r.headers.get("content-type") ?? "";
    let buf: AudioBuffer;
    if (/audio\/(l16|pcm)/i.test(type) && r.body) {
      // streamed: headerless 16-bit little-endian mono, each piece played as it comes
      const rate = Number(/rate=(\d+)/i.exec(type)?.[1] ?? 24000);
      const reader = r.body.getReader();
      const parts: Float32Array[] = [];
      let carry: number | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value?.length) continue;
        const x = l16ToFloat(value, carry);
        carry = x.carry;
        if (x.samples.length) { parts.push(x.samples); feed(toBuffer(c, x.samples, rate)); }
      }
      if (!parts.length) throw new Error("no audio");
      buf = joinSamples(c, parts, rate);
    } else {
      buf = await c.decodeAudioData(await r.arrayBuffer());
      feed(buf);
    }
    fails = 0;
    audioCache.set(key, buf);
    if (audioCache.size > 24) audioCache.delete(audioCache.keys().next().value as string);
    return buf;
  } catch {
    if (++fails >= 2) { serverDownUntil = Date.now() + 60_000; fails = 0; }
    return null;
  } finally { clearTimeout(timer); }
}

/** The PCM rung for a whole answer: "played", "failed" (nothing was heard: the next rung takes all of it) or "cut". */
async function runPcm(s: Speech, my: number, l: "ta" | "en", start: (p: VoicePath) => void): Promise<"played" | "failed" | "cut"> {
  const c = out();
  if (!c || !master) return "failed";
  if (!paused) void c.resume().catch(() => undefined);
  const g = c.createGain();
  g.connect(master);
  const p = new Player(c, g);
  player = p;
  answerGain = g;
  // where each piece starts in this answer's audio (seconds), for the line highlight and for where "continue" starts
  const tl = new Array<number>(s.pieces.length).fill(Infinity);
  let said = s.at - 1;
  const tick = () => {
    if (my !== token) return;
    const pos = p.position();
    while (said + 1 < s.pieces.length && tl[said + 1] <= pos + 1e-3) {
      said++;
      s.at = said;
      if (s.pieces[said].first) s.o.onLine?.(s.pieces[said].line);
      s.o.onPiece?.(s.pieces[said].text, s.pieces[said].line);
    }
  };
  const iv = setInterval(tick, 50);
  // B8: the browser holds this context until a click: PCM_STALL_MS after the first audio was scheduled, still suspended (and not paused by a
  // barge-in) means nothing is heard: the page is told, the player stops, and the whole answer goes to the next rung
  let blocked = false, stallT: ReturnType<typeof setTimeout> | null = null;
  let unblock: (v: null) => void = () => undefined;
  const blockedP = new Promise<null>((r) => { unblock = r; });
  const watch = () => {
    if (stallT || blocked) return;
    stallT = setTimeout(() => {
      stallT = null;
      if (my !== token || paused || c.state !== "suspended") return;
      blocked = true;
      browser.audioBlocked("audio");
      p.stop();
      unblock(null);
    }, PCM_STALL_MS);
  };
  // the trace: the first sample of an answer (not an acknowledgement) is scheduled
  const scheduled = () => { if (!s.ack) stamp("voiceStart"); watch(); };
  try {
    ensureGroups(s);
    let broke = false;
    for (const gr of s.groups ?? []) {
      if (gr.to < s.at) continue;
      const from = Math.max(gr.from, s.at);
      const lengths = s.pieces.slice(gr.from, gr.to + 1).map((x) => x.voice.text.length + 1);
      const base = p.scheduled;
      const place = (dur: number, skip: number) => { const st = pieceStarts(lengths, dur); for (let i = from; i <= gr.to; i++) tl[i] = base + st[i - gr.from] - skip; };
      if (!gr.buf && !gr.pending) {
        // the one request for this run (the whole answer, unless it is a long narration)
        place(estimate(gr.text, l), 0);
        tick();
        gr.pending = fetchAudio(gr.text, l, c, (b) => { if (my === token) { start("pcm"); p.push(b); scheduled(); } }).then((b) => { gr.buf = b; gr.pending = null; return b; });
        const b = await Promise.race([gr.pending, blockedP]);
        if (my !== token) return "cut";
        if (blocked) return "failed";
        if (!b) { broke = true; break; }
        place(b.duration, 0);
        continue;
      }
      // audio this answer already has (it was cut, and goes on): from the piece it was on, no second request
      const b = gr.buf ?? (await Promise.race([gr.pending, blockedP]));
      if (my !== token) return "cut";
      if (blocked) return "failed";
      if (!b) { broke = true; break; }
      const skip = pieceStarts(lengths, b.duration)[from - gr.from];
      place(b.duration, skip);
      start("pcm");
      p.push(b, skip);
      scheduled();
    }
    if (broke && !p.started) return "failed";
    p.end();
    tick();
    const ok = await p.done();
    if (my === token && blocked) return "failed";
    if (my !== token || !ok) return "cut";
    // all of it played: every piece was said (after a failed run, the rest is on screen and is not handed to another voice)
    if (!broke) while (said + 1 < s.pieces.length) { said++; if (s.pieces[said].first) s.o.onLine?.(s.pieces[said].line); }
    s.at = s.pieces.length;
    return "played";
  } finally {
    clearInterval(iv);
    if (stallT) clearTimeout(stallT);
  }
}

/**
 * The browser speaks one chunk, its numbers in words (F1), or nothing is said and the words wait on screen. A word boundary is
 * mapped back into the chunk as shown. voiceStart is stamped at the utterance's start where voice.ts passes `onStart` on, else at
 * its first word.
 */
function byBrowser(p: Piece, lang: string, o: SpeakOpts, my: number, how: VoicePath, ack: boolean): Promise<void> {
  return new Promise((done) => {
    if (how === "text" || !browser.canSpeak()) { setTimeout(done, Math.min(6000, 600 + p.text.length * 45)); return; }
    const text = p.voice.text;
    // the last check before the browser's voice: no number sign ever reaches it (F1)
    if (holdsDigit(text)) { refuseDigit(); done(); return; }
    const started = () => { if (!ack && my === token) stamp("voiceStart"); };
    const vo: browser.SpeakOpts & { onStart?: () => void } = {
      rate: o.rate, voice: o.voice, onStart: started,
      onWord: (_, ch) => { if (my !== token) return; started(); lastWordAt = performance.now(); o.onWord?.(p.line, shownIndex(p.voice, ch)); },
      onEnd: () => done()
    };
    const ok = browser.speakText(text, short(lang) === "ta" ? "ta-IN" : "en-IN", vo);
    if (!ok) done();
  });
}

async function run(s: Speech, my: number) {
  const l = short(s.lang);
  // the choice of voice waits until the browser has said which voices it has: deciding early changed the voice later
  await browser.voicesReady();
  if (my !== token) return;
  if (!s.gated) { s.pieces = gate(s.raw, s.o.allowed, l); s.gated = true; }
  if (!s.path) s.path = choosePath(l);
  // v16 (22 Nov): never begun over the Collector. An answer that lands while they speak, or while a newer sentence of theirs is at the
  // transcriber, waits for it: a request handed on cancels it (turn.ts voiceWanted), anything else lets it start. (It began at full volume:
  // the browser's voice cannot be ducked, so a late answer played over the next question)
  await floorFree(s, my);
  if (my !== token) return;
  let started = false;
  const start = (p: VoicePath) => { path = p; if (!started) { started = true; hooks.onStart?.(p, s.ack); } };
  if (s.path === "pcm" && s.at < s.pieces.length) {
    const r = await runPcm(s, my, l, start);
    if (r === "cut" || my !== token) return;
    // the server could not say any of it: the whole answer goes to the next rung (nothing has been heard, so the voice is one)
    if (r === "failed") s.path = browserCan(l) ? "browser" : "text";
  }
  if (s.path !== "pcm") {
    for (; s.at < s.pieces.length; s.at++) {
      if (my !== token) return;
      const piece = s.pieces[s.at];
      if (piece.first) s.o.onLine?.(piece.line);
      start(s.path);
      s.o.onPiece?.(piece.text, piece.line);
      await byBrowser(piece, s.lang, s.o, my, s.path, s.ack);
      if (my !== token) return;
      s.fin = s.at;
      while (paused && my === token) await new Promise((r) => setTimeout(r, 30));
      if (my !== token) return;
      if (s.at < s.pieces.length - 1) await new Promise((r) => setTimeout(r, s.ack ? 0 : 120));
      // v16 (22 Nov): a barge-in ducked this voice, which on the browser's path keeps speaking ("kept"): the next piece waits while the
      // Collector holds the floor, so Jarvis stops at the end of its sentence instead of reading on over them; a bid for the turn cancels it
      // (stopVoice), a backchannel or a noise lets it go on (unduckVoice)
      if (ducked === "kept" && s.at < s.pieces.length - 1) { await floorFree(s, my); if (my !== token) return; }
    }
  }
  if (my !== token) return;
  speakingNow = false;
  cur = null;
  player = null;
  answerGain = null;
  clearDuck();
  hooks.onEnd?.(s.ack);
  s.o.onEnd?.();
}

/**
 * Speak lines one after another: returns false where nothing can be said at all; any later call or stopVoice() cancels it,
 * and onEnd then never fires for the cancelled one.
 */
export function speakLines(lines: string[], lang: string, o: SpeakOpts = {}): boolean {
  stopVoice();
  bookmark = null;
  const list = pieces(lines, short(lang));
  if (!list.length) { o.onEnd?.(); return false; }
  // the trace: the turn's first sentence is handed to speak (the first stamp of a turn wins, so later sentences leave it)
  stamp("speakCalled");
  const my = ++token;
  speakingNow = true;
  paused = false;
  cur = { raw: list, pieces: [], lang, o, at: 0, ack: false, gated: false, path: null, groups: null };
  // v12 (RC3): asked for now, heard later: the turn machine knows a voice is on its way
  hooks.onRequest?.(false);
  void run(cur, my);
  return true;
}

export function speakText(text: string, lang: string, o: SpeakOpts = {}): boolean {
  return speakLines([text], lang, o);
}

/**
 * The acknowledgement ("One moment."), for when no finding is ready by 1.2 s. Refused (false) when the text holds any figure,
 * when anything is already being said (an answer is never cut or held up by one), and where no voice is ready at once: it
 * speaks only with the browser's natural voice, which the answer will use too, or with audio already kept for that line; it
 * never spends a request. speakLines() cuts it the moment the answer exists (the PCM path fades it over 15 ms).
 */
export function speakAck(text: string, lang: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || figuresIn(t).length) return false;
  if (speakingNow || browser.speaking()) return false;
  // v16 (22 Nov): never over the Collector, nor while a newer sentence of theirs is being read: an acknowledgement that waited would no longer be true
  if (hooks.floorHeld?.()) return false;
  const l = short(lang);
  // said in words like any chunk (a code's digits: "Covid-19"); one that would still hold a number sign is not said
  const piece = voiced(t, 0, true, l);
  if (!piece) return false;
  const nat = natural(l);
  if (!nat && !audioCache.has(`${jarvisVoice}|${l}|${piece.voice.text}`)) return false;
  const my = ++token;
  speakingNow = true;
  paused = false;
  cur = { raw: [], pieces: [piece], lang, o: {}, at: 0, ack: true, gated: true, path: nat ? "browser" : "pcm", groups: null };
  hooks.onRequest?.(true);
  void run(cur, my);
  return true;
}

/**
 * Pause at once (the energy gate's onset). PCM: the gain goes to nothing in about a frame and the clock stops, so resume is
 * exact. speechSynthesis has no reliable pause for its natural voices: it goes on until the barge-in is confirmed.
 */
export function pauseVoice() {
  if (!speakingNow || !cur) return;
  if (cur.path === "pcm" && ctx && master) {
    paused = true;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.004);
    void ctx.suspend().catch(() => undefined);
  }
}

/** Go on from where it paused (a cough, a door). */
export function resumeVoice() {
  if (!paused) return;
  paused = false;
  if (ctx && master) {
    void ctx.resume().catch(() => undefined);
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(ducked === "gain" ? DUCK_LEVEL : 1, ctx.currentTime, 0.004);
  }
}

function reportDuck(d: DuckInfo) {
  lastDuckInfo = d;
  hooks.onDuck?.(d);
  // dev only: the end-to-end specs' marks (window.__jv exists only where Thunai.tsx sets it up for them)
  try { (window as unknown as { __jv?: { marks?: { name: string; t: number }[] } }).__jv?.marks?.push({ name: `duck:${d.path}:${d.how}`, t: performance.now() }); } catch { /* no window */ }
}

/**
 * v5 D3: the browser's voice, cut for a duck: cancel() the utterance and keep the speech with its place at the piece that was being
 * said (between two pieces, the next one). The run that was saying it is left behind (its token is old). False when nothing is being
 * said or nothing is left to say: the duck then keeps the voice as it is.
 */
function cutForDuck(): boolean {
  const s = cur;
  if (!s || !s.gated) return false;
  const at = (s.fin ?? -1) >= s.at ? s.at + 1 : s.at;
  if (at >= s.pieces.length) return false;
  token++;
  cur = { ...s, at };
  browser.stopVoice();
  return true;
}

/**
 * v5 D3: say the cut speech again from the start of the piece it was cut on, as a fresh utterance (never resume()). For a false
 * interruption (unduckVoice) or when no bid for the turn came within FALSE_CUT_MS.
 */
function respeak() {
  if (cutT) { clearTimeout(cutT); cutT = null; }
  ducked = false;
  const s = cur;
  if (!s || !speakingNow) return;
  const my = ++token;
  void run(s, my);
}

/**
 * Speech began over Jarvis: the voice drops, it does not stop. PCM: the duck gain to 20 % in 30 ms (a linear ramp on the audio
 * clock). The browser's voice, when the flag is on (setDuckPause): cut with cancel() at once (v5 D3: how soon is reported), to be
 * said again from the cut piece on a false interruption or after FALSE_CUT_MS with no bid for the turn; else it keeps speaking.
 * Never pause()/resume(); the final stop (stopVoice) is the conductor's, once the speech holds two real words or 600 ms.
 */
export function duckVoice(): void {
  // (v16: a speech waiting for the floor has nothing to duck)
  if (!sounding() || !cur || ducked) return;
  const t0 = performance.now();
  const p = cur.path ?? path;
  if (p === "pcm" && ctx && master) {
    const now = ctx.currentTime, g = master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(DUCK_LEVEL, now + DUCK_MS / 1000);
    ducked = "gain";
    const c = ctx as AudioContext & { baseLatency?: number; outputLatency?: number };
    const lat = (c.baseLatency ?? 0) + (c.outputLatency ?? 0);
    reportDuck({ path: "pcm", how: "gain", ms: DUCK_MS, outMs: lat ? Math.round(lat * 1000) : null });
    return;
  }
  if (p !== "browser") return;
  if (duckPause && cutForDuck()) {
    ducked = "cut";
    if (cutT) clearTimeout(cutT);
    cutT = setTimeout(() => { cutT = null; if (ducked === "cut") respeak(); }, FALSE_CUT_MS);
    reportDuck({ path: "browser", how: "cut", ms: Math.round(performance.now() - t0), outMs: null });
    return;
  }
  ducked = "kept";
  reportDuck({ path: "browser", how: "kept", ms: null, outMs: null });
}

/**
 * The speech over Jarvis was a backchannel or a noise: the voice comes back to full (PCM in 60 ms). A cut browser voice says the
 * piece it was cut on again, from its start (v5 D3).
 */
export function unduckVoice(): void {
  if (!ducked) return;
  const was = ducked;
  ducked = false;
  if (was === "gain" && ctx && master && !paused) {
    const now = ctx.currentTime, g = master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(1, now + 0.06);
  }
  if (was === "cut") respeak();
}

function clearDuck() {
  if (cutT) { clearTimeout(cutT); cutT = null; }
  ducked = false;
  if (ctx && master) { const now = ctx.currentTime; master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(1, now); }
}

/** how many chunks a speech has to say: before the gate has run (the voices were still being listed), its chunks as written */
const left = (s: Speech) => (s.gated ? s.pieces.length : s.raw.length);

/** Everything stops; what was being said is kept for "continue". */
export function stopVoice() {
  token++;
  const was = speakingNow, ack = !!cur?.ack;
  if (cur && !cur.ack && cur.at < left(cur)) bookmark = cur;
  cur = null;
  speakingNow = false;
  paused = false;
  if (player && ctx && answerGain) {
    // a 15 ms fade on this answer's own gain, then its sources stop: no click, and the next answer's gain is untouched
    const now = ctx.currentTime;
    answerGain.gain.cancelScheduledValues(now);
    answerGain.gain.setTargetAtTime(0, now, 0.004);
    player.stop(now + 0.015);
  } else player?.stop();
  player = null;
  answerGain = null;
  if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  clearDuck();
  browser.stopVoice();
  // whoever cut it, the turn machine hears that the voice stopped: it must never show Speaking in silence
  if (was) hooks.onEnd?.(ack);
}

/** "Continue": the interrupted answer from the chunk it was on, in the same voice and from the same audio. False when there is nothing to continue. */
export function continueAnswer(): boolean {
  const s = bookmark;
  bookmark = null;
  if (!s || s.at >= left(s)) return false;
  stopVoice();
  bookmark = null;
  // "continue" is a turn of its own: its answer is handed to speak here
  stamp("speakCalled");
  const my = ++token;
  speakingNow = true;
  cur = { ...s };
  hooks.onRequest?.(false);
  void run(cur, my);
  return true;
}
export const canContinue = () => !!bookmark;
/** A new question was asked: what was interrupted before it is gone. */
export const forgetBookmark = () => { bookmark = null; };

/**
 * A soft tone of 110 ms (120 ms with its edges) at the end of the Collector's speech: "heard you", honest, before any answer.
 * It plays only when the ears are told first (MouthHooks.onEarcon, wired to Conductor.earcon), so it is taken as Jarvis's own
 * sound and can never start a barge-in; with no such hook, or while Jarvis's own voice is sounding, there is no tone (false).
 * Call it for an engaged or named sentence only, never for side talk.
 */
export function earconEnd(): boolean {
  // (v16: a speech still waiting for the floor has not sounded: the tone still says "heard you")
  if (!hooks.onEarcon || (sounding() && !paused)) return false;
  const c = fxOut();
  if (!c) return false;
  hooks.onEarcon(EARCON_GUARD_MS, EARCON_TONE_MS);
  try {
    if (c.state === "suspended") void c.resume().catch(() => undefined);
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine";
    o.frequency.value = 740;
    const t = c.currentTime + 0.005, end = t + EARCON_MS / 1000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.04, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(end + 0.005);
    return true;
  } catch { return false; }
}

/**
 * v6, the instant wake reply. "Hi Jarvis" / "Hey Jarvis" is answered by a short spoken line ("Yes?", "சொல்லுங்க.") from audio already in
 * memory: pre-rendered once in Jarvis's server voice (scripts/jarvis6/wake-replies.mjs -> public/thunai/wake/), fetched and decoded
 * when Jarvis opens (Thunai's warm-up) or its closed wake listener starts, and played on the earcon's own context, so it needs no request, no synthesiser and no wait.
 * Never the same variant twice in a row. The ears take it as Jarvis's own sound for its length (like an earcon: it can never start a
 * barge-in, and the Collector's voice over it is still heard). NEXT_PUBLIC_JARVIS_WAKE_REPLY: "clip" (default) or "tone" (v5: the
 * open tone only). Returns how long it plays (ms), or null when it could not play (no audio, not loaded): the caller then sounds
 * the tone as before.
 */
export const wakeReplyMode = (v: string | undefined = flag("NEXT_PUBLIC_JARVIS_WAKE_REPLY", process.env.NEXT_PUBLIC_JARVIS_WAKE_REPLY)): "clip" | "tone" => ((v ?? "").trim().toLowerCase() === "tone" ? "tone" : "clip");
const wakeBufs: Record<"en" | "ta", AudioBuffer[]> = { en: [], ta: [] };
let wakeLoad: Promise<void> | null = null;
let wakeLast: Record<"en" | "ta", number> = { en: -1, ta: -1 };
/** the next variant: any but the last one played (`r` fixed in tests) */
export function nextVariant(n: number, last: number, r: number = Math.random()): number {
  if (n <= 1) return 0;
  const k = Math.floor(r * (n - 1));
  return k >= last && last >= 0 ? k + 1 : k;
}
/** Fetch and decode the wake replies once (no request to any provider: they are the page's own files). */
export function loadWakeReplies(): Promise<void> {
  if (wakeLoad) return wakeLoad;
  const c = fxOut();
  if (!c || typeof fetch === "undefined") return Promise.resolve();
  wakeLoad = (async () => {
    try {
      const m = (await (await fetch("/thunai/wake/manifest.json")).json()) as { files: Record<"en" | "ta", { file: string }[]> };
      for (const lang of ["en", "ta"] as const) {
        const bufs = await Promise.all((m.files?.[lang] ?? []).map(async (f) => c.decodeAudioData(await (await fetch(`/thunai/wake/${f.file}`)).arrayBuffer()).catch(() => null)));
        wakeBufs[lang] = bufs.filter((b): b is AudioBuffer => !!b);
      }
    } catch { wakeLoad = null; }
  })();
  return wakeLoad;
}
export const wakeReady = (lang: string) => wakeBufs[short(lang)].length > 0;

/**
 * v6: warm the voice the next answer will use (voice.ts prewarm): only on the browser's natural voice (the server's PCM voice has
 * nothing to warm), and never while Jarvis is speaking. Called when the Collector starts a sentence to Jarvis, and on a wake: the site's
 * language first, then the other (the answer comes in the language the sentence is heard in).
 */
export function prewarmVoice(langs: string[]): boolean {
  const ls = [...new Set(langs.map(short))].filter((l) => natural(l));
  // (v16: an answer waiting for the floor is warmed too: it is about to speak)
  if (sounding() || !ls.length) return false;
  return browser.prewarm(ls.map((l) => (l === "ta" ? "ta-IN" : "en-IN")));
}
/** v13 (review 1-11): the wake reply now sounding (its source, its gain, its context), or null */
let wakeNow: { s: AudioBufferSourceNode; g: GainNode; c: AudioContext } | null = null;
/**
 * v13 (21 Nov, review 1-11): stop the wake reply now (a 15 ms fade on its own gain, then its source stops), when the Collector begins the
 * request over it: at 400 ms of quiet a "Yes, Collector?" of about a second still sounded over a question begun after a short pause, and
 * nothing could stop it (stopVoice never touches the earcons' context). True when a reply was sounding.
 */
export function stopWakeReply(): boolean {
  const w = wakeNow;
  wakeNow = null;
  if (!w) return false;
  try {
    const now = w.c.currentTime;
    w.g.gain.cancelScheduledValues(now);
    w.g.gain.setTargetAtTime(0, now, 0.004);
    w.s.stop(now + 0.015);
  } catch { /* it had ended */ }
  // the HUD's core no longer reads the reply's level
  wakeUntil = 0;
  return true;
}
/** Play one wake reply now (see above). The `at` it returns is when its first sample is scheduled (performance.now()). */
export function wakeReply(lang: string): { ms: number; at: number } | null {
  if (wakeReplyMode() !== "clip") return null;
  const l = short(lang);
  const list = wakeBufs[l].length ? wakeBufs[l] : wakeBufs.en;
  const c = fxOut();
  if (!c || !list.length) { void loadWakeReplies(); return null; }
  // over Jarvis's own voice it is not said (the turn machine stops that voice first when the name cuts in); v16: a speech waiting for the floor is no voice yet
  if (sounding() && !paused) return null;
  try {
    if (c.state === "suspended") void c.resume().catch(() => undefined);
    const i = nextVariant(list.length, wakeLast[l]);
    wakeLast = { ...wakeLast, [l]: i };
    const b = list[i], ms = Math.round(b.duration * 1000);
    hooks.onEarcon?.(ms + 250, ms + 150);
    const s = c.createBufferSource(), g = c.createGain();
    g.gain.value = 0.9;
    // v6 (Phase 6): the HUD's core moves with the reply's own audio (voiceLevel reads this analyser while it plays)
    const an = c.createAnalyser();
    an.fftSize = 512;
    s.buffer = b; s.connect(g).connect(an).connect(c.destination);
    const t = c.currentTime + 0.005;
    stopWakeReply();
    s.start(t);
    wakeAnalyser = an;
    wakeUntil = performance.now() + 5 + ms;
    // v13 (review 1-11): kept so that a request begun over it can stop it; the ears are told how long it sounds
    wakeNow = { s, g, c };
    s.onended = () => { if (wakeNow?.s === s) wakeNow = null; };
    hooks.onWakeSound?.(ms + 5);
    return { ms, at: performance.now() + 5 };
  } catch { return null; }
}

/**
 * Mode on: the voices are listed, the earcon's context and (where the server's voice will speak) the voice's AudioContext are
 * opened and resumed inside the gesture, so the first answer starts with nothing to set up. Nothing is said and no request is
 * made: the page's own connection to the server is already open, and a speech request would spend the 3-a-minute allowance.
 */
export function warmVoice(lang: string): void {
  browser.warmVoices();
  const f = fxOut();
  if (f && f.state === "suspended") void f.resume().catch(() => undefined);
  const l = short(lang);
  void browser.voicesReady().then(() => {
    if (natural(l) || !serverUp()) return;
    const c = out();
    if (c && c.state === "suspended" && !paused) void c.resume().catch(() => undefined);
  });
}

/**
 * The voice's level, 0..1, for the HUD. The analyser on the PCM path; speechSynthesis gives no signal, so there it is an
 * envelope driven by the state (a syllable-rate pulse while speaking). The HUD shows which one it has (voicePath).
 */
export function voiceLevel(now = performance.now()): number {
  // v6: the wake reply's own audio, while it plays
  if (wakeAnalyser && now < wakeUntil) return rms(wakeAnalyser);
  // (v16: nothing sounds while a speech waits for the floor)
  if (!sounding() || paused || ducked === "cut") return 0;
  if (path === "pcm" && analyser) return rms(analyser);
  if (path === "text") return 0.15;
  // v6 (Phase 6): the browser's voice gives no audio to read, but it says when each word starts: the core pulses on the real words (a
  // swell at each word's start, falling away over about 160 ms), and only where the voice sends no word events does it fall back on v5's
  // steady syllable-rate pulse
  if (now - lastWordAt < 1200) return wordPulse(now - lastWordAt);
  return 0.45 + 0.3 * Math.sin(now / 95) * Math.sin(now / 410);
}
/** v6: the level a word's start gives, `dt` ms after it: a quick swell and a fall over about 160 ms, never below the speaking floor */
export const wordPulse = (dt: number): number => (dt < 0 ? 0.3 : 0.3 + 0.6 * Math.exp(-dt / 160));
function rms(a: AnalyserNode): number {
  a.getFloatTimeDomainData(levelBuf);
  let s = 0;
  for (let i = 0; i < levelBuf.length; i++) s += levelBuf[i] * levelBuf[i];
  return Math.min(1, Math.sqrt(s / levelBuf.length) * 4);
}
