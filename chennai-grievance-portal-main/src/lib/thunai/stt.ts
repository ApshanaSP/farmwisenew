/**
 * Jarvis's speech to text on the server. One finished sentence of audio (16 kHz WAV) in, its words out. The audio is never
 * stored or logged, and an ambient transcript is never logged either.
 *
 *   engaged and named turns: parallel forced decodes, ta on whisper-large-v3 with the Tamil-script prompt, en on turbo with the
 *     English prompt, chosen by Whisper's own confidence plus a repetition, a script and a translation check. Auto-detect on
 *     Tanglish was about 97 % WER on thunai/v3; a fixed language plus the prompt did far better.
 *     FIRST GOOD DECODE WINS (v4): as soon as a decode in the expected language (the last heard line's when the browser sends
 *     `lastLang`, else the site's) clears the bar (mean log-probability above -0.35, no-speech below 0.6, its own script, no loop or
 *     echo), the other gets at most 250 ms more and is then let go; when that first decode is English and the Tamil one is still
 *     running, the Tamil one gets 700 ms, so a forced-English translation of Tamil speech meets the translation check.
 *     Each Whisper request gives up after 5 s.
 *   (v5, B1: the third racer, gemini-3.5-transcribe, is gone. It returned nothing usable at about 28 calls a day; the two forced
 *     Whisper decodes are the whole race.)
 *   ambient (unengaged) sentences: one decode in the site's language, at most 8 a minute in the ledger. One that names Jarvis
 *     and is unsure is read once more here, in the other language only (the browser no longer posts it a second time).
 *
 * The prompts: one per language (sttPrompt), from the lexicon's names in the script that decode writes, plus the names on the open
 * Stage that the browser sends (cleanVocab: at most 30 short names, no digits), inside Whisper's prompt limit.
 *
 * Whisper bills a 10 s minimum per request: the ledger is told, so the listening budget is what Groq will really count.
 *
 * v8: Sarvam AI (sarvam.ts) is one more way to hear, on engaged and named turns only, behind JARVIS_STT_SARVAM and OFF by default
 * (unset, "0", anything else, or no SARVAM_API_KEY: the race above, unchanged). "tamil": Sarvam's decode takes the forced-Tamil Whisper
 * decode's place in the race (same waits), and that Whisper decode runs only when Sarvam fails. "primary": Sarvam first, the whole
 * Whisper race only when it fails. "shadow": Whisper decides; Sarvam hears alongside and only its timing and agreement are logged.
 * Failing is an error, a timeout, a skip (sarvam.ts) or a reading with nothing usable in it.
 * v16 (22 Nov): "primary" is hedged: Sarvam still out after SARVAM_HEDGE_MS (2 s), the Whisper race starts beside it and the first good
 * reading wins (primaryHedged), so a slow Sarvam no longer spends the browser's whole wait before Whisper is even asked.
 */
import { namedIn } from "./addressed";
import { correctTranscript, gazetteerOn } from "./gazetteer";
import { groqFetch } from "./keepalive";
import { ledger, type Lane } from "./ledger";
import { STT_NAMES, sttTamilName } from "./lexicon";
import { SARVAM_MODEL, sarvamKeyed, sarvamMode, sarvamTranscribe, shadowLog, type SarvamHeard } from "./sarvam";
import { serverClock, type ServerTiming } from "./stagetime";
import { telemetry } from "./telemetry";
import { phonetic } from "./xlit";
import { understandV8 } from "./v8/flag8";
import { deadline } from "@/lib/util/deadline";

const env = (k: string) => (process.env[k] ?? "").trim();
export const MODEL_TA = () => env("JARVIS_STT_MODEL_TA") || env("JARVIS_STT_MODEL") || "whisper-large-v3";
export const MODEL_EN = () => env("JARVIS_STT_MODEL_EN") || "whisper-large-v3-turbo";
export const AMBIENT_PER_MIN = 8;
export const MAX_AUDIO_BYTES = 2_500_000;
/** one Whisper request gives up after this long, ms (it was 12 s) */
export const WHISPER_MS = 5000;
/** after the first good decode, the other decode is given this much longer, ms */
export const GRACE_MS = 250;
/**
 * When the first good decode is English and the Tamil one is still running (an engaged or named turn), the Tamil one gets this long
 * instead: a fluent English decode may be Whisper translating Tamil speech, and only the Tamil decode lets `translated` see it (review,
 * Voice 2). large-v3 is usually back within this of turbo; the wait ends as soon as it is.
 */
export const TRANSLATE_GRACE_MS = 700;
/** Whisper's own confidence that clears the bar */
export const GOOD_LOGPROB = -0.35;
/**
 * v16 (22 Nov, the owner: "what I'm speaking, sometimes it's not getting it"): with JARVIS_STT_SARVAM=primary, Sarvam alone for this long, ms
 * (JARVIS_SARVAM_HEDGE_MS); still no reading, and the Whisper race starts beside it, the first good reading wins. Before v16 Whisper started
 * only once Sarvam had failed: a Sarvam that hung (6.1 s and 8.4 s, 21-22 Nov) used up the browser's wait, and both Whisper decodes were
 * aborted 17-228 ms after they began, the sentence lost. Sarvam answers in 0.2-2.1 s on the owner's turns (telemetry, 21-22 Nov)
 */
export const SARVAM_HEDGE_MS = 2000;
export const sarvamHedgeMs = (): number => { const v = env("JARVIS_SARVAM_HEDGE_MS"), n = Number(v); return v && Number.isFinite(n) && n >= 0 ? Math.floor(n) : SARVAM_HEDGE_MS; };

// ---- the prompts ----

/**
 * Whisper reads at most 224 prompt tokens (OpenAI's documentation; Groq's own handling of a longer one is unverified), so each
 * prompt is built to stay under this estimate, with room to spare.
 */
export const PROMPT_TOKENS = 200;
const HEAD = { en: "Jarvis, Chennai District Collector console.", ta: "ஜார்விஸ்." } as const;
const hasTamil = (s: string) => /[஀-௿]/.test(s);
const ACRONYM = /^[A-Z]{2,8}$/;

/**
 * Whisper's tokens, over-estimated on purpose: about one per three Latin characters, and 1.2 per Tamil code point (its byte-level
 * BPE spends one to two tokens on a Tamil letter; unverified against Whisper's own tokenizer, which is not on this machine).
 */
export function approxTokens(s: string): number {
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) < 128 ? 1 / 3 : 1.2;
  return Math.ceil(n);
}

/** At most this many names from the browser, each short; no digits (a phone or Aadhaar number cannot pass), no sentences. */
export const VOCAB_MAX = 30;
export function cleanVocab(raw: unknown): string[] {
  let list: unknown = raw;
  if (typeof raw === "string") { try { list = JSON.parse(raw); } catch { list = raw.split(/[\n,;]/); } }
  if (!Array.isArray(list)) return [];
  const out: string[] = [], seen = new Set<string>();
  for (const x of list.slice(0, 200)) {
    if (typeof x !== "string") continue;
    const s = x.normalize("NFC").replace(/[^\p{L}\p{M}\s.'&-]+/gu, " ").replace(/\s+/g, " ").trim();
    if (s.length < 2 || s.length > 40 || s.split(" ").length > 4) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= VOCAB_MAX) break;
  }
  return out;
}

/**
 * The prompt for one forced decode: the lexicon's names in that decode's script, then the open Stage's names (Tamil-script ones
 * and the Tamil form of a known English name go to the Tamil decode, English ones to the English decode). The Stage's names are
 * taken first when room runs out, and written last, nearest the audio.
 */
export function sttPrompt(lang: "en" | "ta", vocab: string[] = []): string {
  const own = lang === "ta"
    ? vocab.map((v) => (hasTamil(v) ? v : ACRONYM.test(v) ? v : sttTamilName(v))).filter((v): v is string => !!v)
    : vocab.filter((v) => !hasTamil(v));
  let used = approxTokens(HEAD[lang]) + 1;
  const seen = new Set<string>();
  const take = (list: string[]) => {
    const out: string[] = [];
    for (const n of list) {
      const k = n.toLowerCase(), c = approxTokens(n) + 1;
      if (seen.has(k) || used + c > PROMPT_TOKENS) continue;
      seen.add(k); used += c; out.push(n);
    }
    return out;
  };
  const stage = take(own), base = take(STT_NAMES[lang]);
  return `${HEAD[lang]} ${[...base, ...stage].join(", ")}.`;
}
/** The English prompt with no Stage names (what a decode with no prompt of its own is checked against for an echo). */
export const PROMPT = sttPrompt("en");

/** what Whisper writes on silence or noise (it was trained on subtitles) */
export const INVENTED = /^(thank you\.?|thanks( for watching)?\.?|you\.?|bye\.?|okay\.?|ok\.?|hmm+\.?|uh+\.?|so\.?|\.+|subtitles? by.*|amara\.org.*|please subscribe.*|நன்றி\.?|வணக்கம்\.?)$/i;

export interface Seg { no_speech_prob?: number; avg_logprob?: number; compression_ratio?: number; text?: string }
/** `prompt`: the prompt or vocabulary this decode was given (checked for an echo of it) */
export interface Decode { lang: "en" | "ta"; model: string; text: string; segments: Seg[]; duration?: number; via?: "whisper" | "sarvam"; prompt?: string }
export interface Scored extends Decode { logprob: number; noSpeech: number; compression: number; ok: boolean; why: string | null; score: number }

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const tamilShare = (t: string) => { const l = t.replace(/[^\p{L}\p{M}]/gu, ""); return l ? (l.match(/[஀-௿]/g)?.length ?? 0) / l.length : 0; };
const latinShare = (t: string) => { const l = t.replace(/[^\p{L}\p{M}]/gu, ""); return l ? (l.match(/[a-z]/gi)?.length ?? 0) / l.length : 0; };

/** "the the the the" and Whisper's looping habit: one word or short phrase says most of the text */
export function repeats(t: string): boolean {
  const w = t.toLowerCase().split(/\s+/).filter(Boolean);
  if (w.length < 6) return false;
  const count = new Map<string, number>();
  for (let i = 0; i < w.length; i++) { count.set(w[i], (count.get(w[i]) ?? 0) + 1); if (i + 1 < w.length) { const b = `${w[i]} ${w[i + 1]}`; count.set(b, (count.get(b) ?? 0) + 1); } }
  const top = Math.max(...count.values());
  return top >= 4 && top / w.length >= 0.4;
}

const flat = (s: string) => s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{M}\s]/gu, " ").replace(/\s+/g, " ").trim();

/**
 * A speech span (or a clip) this short, in seconds, is very short. Whisper's invented fillers (`invented`) and its prompt echoes
 * (`promptEcho`) are judged on it. The value is the bar `invented` already used; it is not a new one.
 */
export const SHORT_S = 0.8;

/**
 * What the echo guard knows about the turn (v5 B2). `clarify`: a clarifying question is pending in the browser. `spanS`: the
 * detector's speech span, in seconds (null when the browser did not say).
 */
export interface EchoCtx { clarify?: boolean; spanS?: number | null }

/** The prompt's names, in order: its items between commas and full stops, flattened ("jarvis", "chennai district collector console", "adyar"...). */
const promptNames = (prompt: string): string[] => prompt.split(/[,.]/).map(flat).filter(Boolean);
/** Three or more of the prompt's names back to back, in the prompt's order. */
function namesInOrder(s: string, prompt: string): boolean {
  const names = promptNames(prompt), padded = ` ${s} `;
  for (let i = 0; i + 2 < names.length; i++) if (padded.includes(` ${names[i]} ${names[i + 1]} ${names[i + 2]} `)) return true;
  return false;
}

/**
 * Whisper on near-silence sometimes writes its own prompt back; that is not what was said. v5 (B2): a transcript is dropped as an
 * echo only when it is a run of the prompt's words (all of it, as Whisper writes its prompt back) and
 *   (a) three or more of the prompt's names come back in it in the prompt's order, or
 *   (b) no clarifying question is pending, the detector's speech span is very short (SHORT_S; a span the browser did not send
 *       counts as short, as in v4) and the decode looks like silence (`unsure`: scoreDecode's own bars, no_speech_prob >= 0.3 or
 *       avg_logprob < -0.6).
 * So a short run of the prompt's words ("storm water drain") said with confidence or at length is a sentence, a sentence that holds
 * prompt names among its own words ("Chembarambakkam, Puzhal, Poondi levels") is a sentence, and a one-word answer to a pending
 * question ("Sholinganallur") is never dropped. (v4 also dropped any text holding one of four fixed phrases, even a confident
 * sentence, and any prompt run of 40 or more letters, confident or not.)
 */
export function promptEcho(t: string, unsure = true, prompt: string = PROMPT, ctx: EchoCtx = {}): boolean {
  const s = flat(t);
  if (!s || !` ${flat(prompt)} `.includes(s)) return false;
  if (namesInOrder(s, prompt)) return true;
  const short = ctx.spanS == null || ctx.spanS < SHORT_S;
  return s.length >= 12 && !ctx.clarify && short && unsure;
}

/** `ctx`: what the echo guard knows about the turn (EchoCtx); left out, as in v4: no question pending and the span not known. */
export function scoreDecode(d: Decode, ctx: EchoCtx = {}): Scored {
  const text = d.text.replace(/\s+/g, " ").trim();
  const logprob = mean(d.segments.map((x) => x.avg_logprob ?? 0));
  const noSpeech = mean(d.segments.map((x) => x.no_speech_prob ?? 0));
  const compression = Math.max(0, ...d.segments.map((x) => x.compression_ratio ?? 0));
  let why: string | null = null;
  if (!text || text.length < 2) why = "empty";
  else if (noSpeech >= 0.6) why = "no-speech";
  else if (compression >= 2.4) why = "compression";
  else if (repeats(text)) why = "repeats";
  else if (promptEcho(text, noSpeech >= 0.3 || logprob < -0.6, d.prompt ?? PROMPT, ctx)) why = "echo";
  // a forced Tamil decode must come back mostly in Tamil letters, a forced English one mostly in Latin (v8: not Sarvam's, which is not
  // forced: its codemix writes Tanglish in both scripts, and its language is read from the script in the first place, sarvamLang)
  else if (d.via !== "sarvam" && d.lang === "ta" && tamilShare(text) < 0.5) why = "script";
  else if (d.via !== "sarvam" && d.lang === "en" && latinShare(text) < 0.6) why = "script";
  return { ...d, text, logprob, noSpeech, compression, ok: !why, why, score: logprob };
}

/** Good enough to stop waiting: Whisper's own confidence clears the bar. */
export const good = (s: Scored): boolean => s.ok && s.logprob > GOOD_LOGPROB && s.noSpeech < 0.6;

// ---- the forced English decode may not translate Tamil speech ----

/** the consonant skeleton of the sounds (xlit.ts's phonetic key, vowels out): Tamil script and English letters for the same speech share it */
const skeleton = (s: string) => phonetic(s).replace(/c/g, "k").replace(/f/g, "p").replace(/x/g, "ks").replace(/z/g, "s").replace(/[aeiou\s]/g, "");
function dice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a && a === b ? 1 : 0;
  const grams = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
  const A = grams(a), B = grams(b);
  let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
  return (2 * inter) / (a.length - 1 + (b.length - 1));
}
/** a Tamil decode this sure, mostly in Tamil letters, says the speech was Tamil */
const CONFIDENT_TA = -0.5;

/**
 * Forced to English, Whisper can quietly TRANSLATE Tamil speech into fluent English. When the Tamil decode is confident Tamil,
 * an English decode is taken only if it follows the same sounds (Tanglish in English letters, an English sentence written in
 * Tamil script): its consonant skeleton must match the Tamil decode's, and be of a like length.
 */
export function translated(ta: Scored, en: Scored): boolean {
  if (!ta.ok || !en.ok || ta.lang !== "ta" || en.lang !== "en") return false;
  if (ta.logprob < CONFIDENT_TA || tamilShare(ta.text) < 0.8 || latinShare(en.text) < 0.9) return false;
  // v6 (defect, measured): which one is the translation? Two forced decodes of different shapes are a translation EITHER way: English
  // speech comes back from the forced-Tamil decode as a Tamil translation just as Tamil speech comes back from the forced-English one.
  // On the Phase 0 real run (17 Nov) 10 of 22 English sentences were heard as Tamil this way, the English decode the surer on all 10 (by
  // 0.01-0.29); on Tamil speech the Tamil decode was always the surer (by 0.08-1.07), on Tanglish as sure or surer. So the English decode
  // is refused only when the Tamil one is at least as sure (JARVIS_STT_DIRECTION=0: v5's rule, which refused it whatever the confidences)
  if (env("JARVIS_STT_DIRECTION") !== "0" && ta.logprob < en.logprob) return false;
  return differentShapes(ta.text, en.text);
}

/** two decodes of one clip that are translations of each other, not the same sounds in two scripts */
function differentShapes(taText: string, enText: string): boolean {
  const a = skeleton(taText), b = skeleton(enText);
  // on hand-made pairs, translations scored 0.22-0.36 and the same sounds in the other script 0.80-1.00 (stt.v4.test.ts)
  const sim = dice(a, b), ratio = Math.min(a.length, b.length) / Math.max(1, a.length, b.length);
  return sim < 0.45 || (sim < 0.6 && ratio < 0.6);
}

/**
 * The better of the decodes. Both languages are forced, so each comes back in its own script; Whisper's logprob decides, with
 * a small lean to the site's language (Tanglish scores close on both). An English decode that translated confident Tamil speech
 * is refused. Nothing acceptable: null. `ctx`: what the echo guard knows about the turn.
 */
export function choose(ds: Decode[], site: "en" | "ta", ctx: EchoCtx = {}): Scored | null {
  const all = ds.map((d) => scoreDecode(d, ctx));
  const ta = all.find((x) => x.lang === "ta" && x.ok);
  const scored = all.map((x) => (ta && x.lang === "en" && translated(ta, x) ? { ...x, ok: false, why: "translated" } : x)).filter((x) => x.ok);
  if (!scored.length) return null;
  // v8: Sarvam's decode has no log-probability to weigh against Whisper's, so its own language decides: Tamil or Tanglish is Sarvam's
  // reading (a fluent English decode beside it may be Whisper translating); English is Whisper's English decode when that one is
  // acceptable, else Sarvam's
  const sv = scored.find((x) => x.via === "sarvam");
  if (sv) return sv.lang === "ta" ? sv : scored.find((x) => x.via !== "sarvam" && x.lang === "en") ?? sv;
  // v8 (the owner's example 4): two decodes that are translations of each other (different shapes, not the same sounds in two scripts)
  // are weighed by their own confidence alone; the console's language leans only between the same sounds (Tanglish) (stt.v8.test.ts)
  const sTa = scored.find((x) => x.lang === "ta"), sEn = scored.find((x) => x.lang === "en");
  // (an exact tie still goes to the console's language)
  const lean = understandV8() && sTa && sEn && differentShapes(sTa.text, sEn.text) ? 0.001 : 0.1;
  return scored.sort((a, b) => (b.score + (b.lang === site ? lean : 0)) - (a.score + (a.lang === site ? lean : 0)))[0];
}

/**
 * v8: Sarvam returns no confidence for its words (only how sure it is of the language), so its decode carries this stand-in, a clean
 * Whisper decode's mean log-probability: it clears the bar (GOOD_LOGPROB), and the console reads it as about 0.82 sure (heard.ts confOf).
 */
export const SARVAM_LOGPROB = -0.2;
/** Sarvam's reading as a decode in the race: its own language and words, no prompt, the clip's length. */
export const sarvamDecode = (h: SarvamHeard, secs: number): Decode =>
  ({ lang: h.lang, model: h.model, text: h.text, segments: [{ avg_logprob: SARVAM_LOGPROB, no_speech_prob: 0 }], duration: secs, via: "sarvam" });
/** Sarvam's reading by scoreDecode's bars (nothing heard, a loop, an echo); null when there is none or it fails one. */
const sarvamScored = (h: SarvamHeard | null, secs: number, ctx: EchoCtx): Scored | null => {
  const s = h ? scoreDecode(sarvamDecode(h, secs), ctx) : null;
  return s?.ok ? s : null;
};

function keys(): string[] {
  return [...new Set([env("GROQ_API_KEY"), ...[2, 3, 4, 5].map((k) => env(`GROQ_API_KEY_${k}`))].filter(Boolean))];
}
export const sttAvailable = () => keys().length > 0;

/** The clip's length from its WAV header (16 kHz mono 16-bit from the console); falls back on the byte count. */
export function wavSeconds(b: ArrayBuffer | Uint8Array): number {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  if (u.length < 44) return 0;
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const rate = v.getUint32(24, true) || 16000, bytes = v.getUint32(28, true) || rate * 2;
  return Math.max(0, u.length - 44) / bytes;
}

export type Fetcher = typeof fetch;

/**
 * One decode. Keys are tried in turn for a refused key; a 429 is the organisation's, so another key will not help. With no fetcher
 * given, the request goes through keepalive.ts (v5 E3: undici's fetch on a keep-alive Agent with JARVIS_KEEPALIVE on, else the
 * built-in fetch).
 */
export async function decode(audio: Blob, lang: "en" | "ta", model: string, signal: AbortSignal | undefined, fetcher: Fetcher = groqFetch, prompt: string = sttPrompt(lang), ms: number = WHISPER_MS): Promise<Decode> {
  let last: Error = new Error("no-key");
  for (const key of keys()) {
    const f = new FormData();
    f.append("file", audio, "speech.wav");
    f.append("model", model);
    f.append("response_format", "verbose_json");
    f.append("temperature", "0");
    f.append("prompt", prompt);
    f.append("language", lang);
    // v12 (21 Nov): a strongly held timer with the caller's signal forwarded (util/deadline.ts), over the request and its body: the composite
    // AbortSignal.any([signal, AbortSignal.timeout(ms)]) lost its timer to the garbage collector on Node 22.14
    const dl = deadline(ms, signal);
    try {
      const r = await fetcher("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: f, signal: dl.signal });
      if (r.status === 429) { ledger().cool("groq", model, 30_000); telemetry("fallback_429", { provider: "groq", model, status: 429, fallback: "none" }); throw new SttBusy(); }
      if (r.status === 401 || r.status === 403) { last = new Error(`refused ${r.status}`); continue; }
      if (!r.ok) throw new Error(`whisper ${r.status}`);
      const j = (await r.json()) as { text?: string; segments?: Seg[]; duration?: number };
      return { lang, model, text: j.text ?? "", segments: j.segments ?? [], duration: j.duration, via: "whisper", prompt };
    } finally {
      dl.done();
    }
  }
  throw last;
}
export class SttBusy extends Error { constructor() { super("busy"); } }

/**
 * `timing` (v5 trace, section 6.4): ms from the request's receipt (the route's clock, HearOpts.clock) or else from the start of
 * hearUtterance. `sttSent`: the decode request(s) went out; `sttBack`: the
 * winning decode is in hand (the race decided, so any grace given to the other decode is inside it). Timings only, never words.
 */
export interface Heard { text: string; lang: "en" | "ta"; noise: boolean; ms: number; lane: Lane; conf: { speech: number; logprob: number }; model: string | null; budget?: "low"; timing?: ServerTiming }

const heard = (o: Partial<Heard> & { lane: Lane; lang: "en" | "ta"; ms: number }): Heard => ({ text: "", noise: true, conf: { speech: 0, logprob: 0 }, model: null, ...o });

/** A filler Whisper is known to invent counts as noise when it is unsure of it, or always for an ambient sentence. */
function invented(c: Scored, lane: Lane): boolean {
  return INVENTED.test(c.text) && (lane === "ambient" || c.logprob < -0.6 || (c.duration ?? 1) < SHORT_S);
}

/** What the ledger says about the lane's budget, model by model: `models` keeps those with room; low only when none is left. */
export function budget(lane: Lane, want: string[] = [MODEL_EN(), MODEL_TA()]): { ok: boolean; why: string | null; ambientThisMinute: number; models: string[] } {
  const l = ledger();
  const turbo = l.spent("groq", MODEL_EN(), 60_000, "ambient").requests, large = l.spent("groq", MODEL_TA(), 60_000, "ambient").requests;
  const ambient = turbo + large;
  if (lane === "ambient" && ambient >= AMBIENT_PER_MIN) return { ok: false, why: "ambient-cap", ambientThisMinute: ambient, models: [] };
  const rooms = want.map((m) => ({ m, r: l.room("groq", m, { audioS: 10 }) }));
  const models = rooms.filter((x) => x.r.ok).map((x) => x.m);
  if (!models.length) return { ok: false, why: rooms[0]?.r.why ?? null, ambientThisMinute: ambient, models };
  return { ok: true, why: null, ambientThisMinute: ambient, models };
}

// ---- the race ----

type Kind = "ta" | "en";
interface Racer { kind: Kind; model: string; t0: number; ctl: AbortController; done: boolean; aborted: boolean; ms: number; d: Decode | null; err: unknown; p: Promise<void> }

/** One decode in the race: its own abort, its own clock; it never throws (the error is kept). */
function racer(kind: Kind, model: string, outer: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<Decode | null>): Racer {
  const ctl = new AbortController();
  const stop = () => ctl.abort();
  if (outer?.aborted) ctl.abort(); else outer?.addEventListener("abort", stop, { once: true });
  const r: Racer = { kind, model, t0: Date.now(), ctl, done: false, aborted: false, ms: 0, d: null, err: null, p: Promise.resolve() };
  r.p = run(ctl.signal).then((d) => { r.d = d; }, (e: unknown) => { r.err = e; }).finally(() => { r.done = true; r.ms = Date.now() - r.t0; outer?.removeEventListener("abort", stop); });
  return r;
}
const letGo = (r: Racer | null) => { if (r && !r.done) { r.aborted = true; r.ctl.abort(); } };

/**
 * Wait for the Whisper decodes: until all are back, or until one in the expected language clears the bar and the grace after it
 * has run (then the rest are let go). `guard`: the grace instead when that first good decode is English and the Tamil one is still
 * running (TRANSLATE_GRACE_MS on a turn someone waits on; 0 keeps `grace`).
 */
async function whisperRace(rs: Racer[], expected: "en" | "ta", grace: number, guard = 0, ctx: EchoCtx = {}): Promise<void> {
  if (!rs.length) return;
  const want = rs.some((r) => r.kind === expected) ? expected : rs[0].kind;
  await new Promise<void>((done) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (rs.every((r) => r.done)) { if (timer) clearTimeout(timer); done(); return; }
      // v6: a good decode in EITHER language that is the name alone ("Hi Jarvis", "ஹாய் ஜார்விஸ்") ends the race at once: a call is
      // the same call in both, there is no request to mistranslate, and the Collector is waiting for the reply (nameFast)
      const call = nameFast() ? rs.find((r) => r.done && r.d && good(scoreDecode(r.d, ctx)) && isCall(r.d.text)) : null;
      if (call) { if (timer) clearTimeout(timer); done(); return; }
      const first = timer ? null : rs.find((r) => r.done && r.d && r.kind === want && good(scoreDecode(r.d, ctx)));
      if (first) timer = setTimeout(done, first.kind === "en" && rs.some((r) => r.kind === "ta" && !r.done) ? Math.max(grace, guard) : grace);
    };
    for (const r of rs) void r.p.then(check);
  });
  for (const r of rs) letGo(r);
}

/**
 * v16 (22 Nov): JARVIS_STT_SARVAM=primary with its hedge. Sarvam is asked; a reading (or a failure) by `hedgeMs` decides as before v16: the
 * reading is the answer, a failure runs the whole Whisper race after it (`raced` false: the caller runs it). Past `hedgeMs` with Sarvam still
 * out, the Whisper race starts beside it and the first good reading wins: Sarvam's (the Whisper decodes are let go) or the race's choice
 * (Sarvam is let go). A race with nothing acceptable waits for Sarvam, whose own timeout bounds the wait.
 */
async function primaryHedged(o: {
  sarvam: (signal?: AbortSignal) => Promise<SarvamHeard | null>; signal?: AbortSignal; secs: number; echo: EchoCtx; hedgeMs: number;
  start: () => Racer[]; race: (rs: Racer[]) => Promise<void>; site: "en" | "ta"; mark: () => void;
}): Promise<{ first: Scored | null; whisper: Racer[]; raced: boolean }> {
  // Sarvam's own abort (to let it go when Whisper wins), the request's forwarded
  const ctl = new AbortController();
  const off = () => ctl.abort();
  if (o.signal?.aborted) ctl.abort(); else o.signal?.addEventListener("abort", off, { once: true });
  try {
    const sp = o.sarvam(ctl.signal).then((h) => sarvamScored(h, o.secs, o.echo), () => null);
    o.mark();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const lead = await Promise.race([sp.then((s) => ({ s })), new Promise<null>((r) => { timer = setTimeout(() => r(null), Math.max(0, o.hedgeMs)); })]);
    if (timer) clearTimeout(timer);
    if (lead) return { first: lead.s, whisper: [], raced: false };
    // Sarvam is slow: the Whisper race beside it (words-free: when, and that it happened)
    telemetry("stt_hedge", { provider: "sarvam", model: SARVAM_MODEL, after: o.hedgeMs });
    const rs = o.start();
    if (!rs.length) return { first: await sp, whisper: rs, raced: true };
    o.mark();
    const raceDone = o.race(rs);
    // Sarvam's reading once back (undefined: still out), and whether the race is over
    const st: { sv: Scored | null | undefined; over: boolean } = { sv: undefined, over: false };
    await new Promise<void>((done) => {
      const check = () => {
        if (st.sv) { done(); return; }
        if (st.over && (st.sv === null || choose(rs.filter((r) => r.d).map((r) => r.d!), o.site, o.echo))) done();
      };
      void sp.then((s) => { st.sv = s; check(); });
      void raceDone.then(() => { st.over = true; check(); });
    });
    if (st.sv) { for (const r of rs) letGo(r); return { first: st.sv, whisper: rs, raced: true }; }
    // the race's choice (or nothing at all): a Sarvam still out is let go
    ctl.abort();
    return { first: null, whisper: rs, raced: true };
  } finally {
    o.signal?.removeEventListener("abort", off);
  }
}

const NAMED = /(?:^|[^a-z])(?:jarvis|jarviz|jarvish|jervis|javis|jaarvis)(?:[^a-z]|$)|ஜார்விஸ்|ஜார்வீஸ்|ஜாவிஸ்/i;
/** v6: JARVIS_STT_NAME_FAST=0 turns the name-only early finish off (default on) */
export const nameFast = () => env("JARVIS_STT_NAME_FAST") !== "0";
/** the decode is the name alone, a call ("Hi Jarvis.", "Jarvis?", "ஹாய் ஜார்விஸ்"), as the address gate reads it */
export const isCall = (text: string): boolean => namedIn(text.trim()) === "";
const whyOf = (e: unknown) => e instanceof SttBusy ? "busy" : (e as Error)?.name === "TimeoutError" ? "timeout" : (e as Error)?.name === "AbortError" ? "aborted" : "error";

export interface HearOpts {
  lane: Lane; site: "en" | "ta"; signal?: AbortSignal; fetcher?: Fetcher;
  /** names on the open Stage, from the browser (cleaned here again) */
  vocab?: string[];
  /**
   * the language of the last line the browser heard (readHear `lastLang`), when it says: on an engaged or named turn the race waits for a
   * good decode in this language rather than the site's, so a Collector who has just spoken Tamil on the English site is heard in Tamil
   */
  lastLang?: "en" | "ta" | null;
  /** v5 B2: a clarifying question is pending in the browser; a short answer to it is never taken for a prompt echo */
  clarify?: boolean;
  /** v5 B2: the detector's speech span for this sentence, ms (the voice detector's end event). Not sent: the echo guard counts it as short */
  speechMs?: number | null;
  /** v5 trace: the route's serverClock(), started when the request arrived; left out, a clock is started when hearUtterance begins */
  clock?: ReturnType<typeof serverClock>;
  /** test knobs, ms: one Whisper request's limit, the grace after the first good decode, the Tamil decode's longer grace; v16: Sarvam's lead before the Whisper hedge */
  ms?: { whisper?: number; grace?: number; translate?: number; hedge?: number };
  /** v10: the day's keyterms for Sarvam (v10/lexserver.ts dayKeytermsNow); absent, sarvam.ts's fixed list */
  keyterms?: readonly string[] | null;
}

/** One utterance. `lane`: ambient gets one decode in the site's language; engaged and named get the parallel forced decodes. */
export async function hearUtterance(buf: ArrayBuffer, o: HearOpts): Promise<Heard> {
  const t0 = Date.now();
  const clock = o.clock ?? serverClock();
  const audio = new Blob([buf], { type: "audio/wav" });
  const secs = wavSeconds(buf);
  const l = ledger();
  const vocab = cleanVocab(o.vocab ?? []);
  const wMs = o.ms?.whisper ?? WHISPER_MS, grace = o.ms?.grace ?? GRACE_MS, guard = o.ms?.translate ?? TRANSLATE_GRACE_MS;
  const wanted: { lang: "en" | "ta"; model: string }[] = o.lane === "ambient"
    ? [{ lang: o.site, model: o.site === "ta" ? MODEL_TA() : MODEL_EN() }]
    : [{ lang: "ta", model: MODEL_TA() }, { lang: "en", model: MODEL_EN() }];
  const b = budget(o.lane, wanted.map((a) => a.model));
  if (!b.ok) { telemetry("stt_budget", { lane: o.lane, why: b.why }); return heard({ lane: o.lane, lang: o.site, ms: 0, budget: "low", timing: clock.timing() }); }
  const whisperOf = (a: { lang: "en" | "ta"; model: string }, lane: Lane) => {
    l.record("groq", a.model, { audioS: secs, lane });
    return racer(a.lang, a.model, o.signal, (s) => decode(audio, a.lang, a.model, s, o.fetcher, sttPrompt(a.lang, vocab), wMs));
  };

  // what the echo guard knows about the turn (B2): a clarifying question pending, and the detector's speech span when the browser sent it
  const echo: EchoCtx = { clarify: o.clarify === true, spanS: typeof o.speechMs === "number" && Number.isFinite(o.speechMs) && o.speechMs >= 0 ? o.speechMs / 1000 : null };

  let lane = o.lane;
  // v8 (sarvam.ts): JARVIS_STT_SARVAM, off by default and without SARVAM_API_KEY; never on the ambient lane (room talk would spend it)
  const sv = lane === "ambient" || !sarvamKeyed() ? "off" : sarvamMode();
  const sarvam = (signal?: AbortSignal) => sarvamTranscribe(audio, { secs, lane, signal, fetcher: o.fetcher, keyterms: o.keyterms ?? null });
  // tamil: Sarvam's decode takes the forced-Tamil Whisper decode's place (and its waits); that Whisper decode runs only when Sarvam fails
  const tamilSlot = (a: { lang: "en" | "ta"; model: string }, lane: Lane) => racer(a.lang, SARVAM_MODEL, o.signal, async (s) => {
    const d = sarvamScored(await sarvam(s).catch(() => null), secs, echo);
    if (d || s.aborted) return d;
    l.record("groq", a.model, { audioS: secs, lane });
    return decode(audio, a.lang, a.model, s, o.fetcher, sttPrompt(a.lang, vocab), wMs);
  });
  const startWhisper = () => wanted.filter((a) => b.models.includes(a.model)).map((a) => (sv === "tamil" && a.lang === "ta" ? tamilSlot(a, lane) : whisperOf(a, lane)));
  // the language waited for: the last heard line's, when the browser says it, on a turn someone waits on; else the site's
  const expected = lane !== "ambient" && (o.lastLang === "ta" || o.lastLang === "en") ? o.lastLang : o.site;
  const guardMs = lane !== "ambient" ? guard : 0;

  // primary: Sarvam first; the Whisper race runs when it fails, or (v16) beside it once it has been out SARVAM_HEDGE_MS
  let first: Scored | null = null;
  let whisper: Racer[] = [];
  let raced = false;
  if (sv === "primary") {
    const h = await primaryHedged({ sarvam, signal: o.signal, secs, echo, hedgeMs: o.ms?.hedge ?? sarvamHedgeMs(), start: startWhisper,
      race: (rs) => whisperRace(rs, expected, grace, guardMs, echo), site: o.site, mark: () => clock.mark("sttSent") });
    first = h.first; whisper = h.whisper; raced = h.raced;
  }
  if (!first && !raced) whisper = startWhisper();
  // shadow: Whisper decides; Sarvam hears the same clip alongside (shadowLog below)
  const shadow = sv === "shadow" ? sarvam(o.signal).catch(() => null) : null;
  // each racer's request has gone out by now (decode() calls fetch before its first await)
  if (whisper.length) clock.mark("sttSent");
  if (!raced) await whisperRace(whisper, expected, grace, guardMs, echo);
  let c = first ?? choose(whisper.filter((r) => r.d).map((r) => r.d!), o.site, echo);

  // an ambient sentence that names Jarvis, read unsure: once more, in the other language only
  if (lane === "ambient" && c && NAMED.test(c.text) && c.logprob < -0.7) {
    const other = c.lang === "ta" ? "en" : "ta", model = other === "ta" ? MODEL_TA() : MODEL_EN();
    if (l.room("groq", model, { audioS: 10 }).ok) {
      lane = "named";
      const more = whisperOf({ lang: other, model }, lane);
      whisper.push(more);
      await whisperRace([more], other, 0, 0, echo);
      c = choose(whisper.filter((r) => r.d).map((r) => r.d!), o.site, echo);
    }
  }

  // the winning decode is in hand (after the ambient lane's second read, when there was one)
  if (c) clock.mark("sttBack");
  const timing = clock.timing();
  if (shadow) shadowLog(shadow, c, lane);

  const got = whisper.filter((r) => r.d);
  const used: Kind | null = c ? c.lang : null;
  const ms = Date.now() - t0;
  for (const r of whisper) {
    const s = r.d ? scoreDecode(r.d, echo) : null;
    const model = r.d?.model ?? r.model;
    telemetry("stt_decode", { lane, provider: model === SARVAM_MODEL ? "sarvam" : "groq", model, decode: r.kind, ms: r.ms || Date.now() - r.t0, ok: !!s?.ok, why: s ? s.why ?? undefined : r.aborted ? "aborted" : r.d === null && !r.err ? "none" : whyOf(r.err), conf: s ? Math.round(s.logprob * 100) / 100 : undefined, aborted: r.aborted || undefined, sttWinner: used ?? "none" });
  }
  telemetry("stt", { lane, ms, ok: !!c, calls: whisper.length, model: c?.model ?? undefined, sttWinner: used ?? "none", lang: c?.lang, ...(raced ? { hedged: true } : {}) });
  if (!c) {
    const nothing = !got.length;
    if (nothing && whisper.some((r) => r.err instanceof SttBusy)) return heard({ lane, lang: o.site, ms, budget: "low", timing });
    if (nothing && whisper.length && whisper.every((r) => r.err)) throw new Error("stt-failed");
  }
  if (!c || invented(c, lane)) return heard({ lane, lang: c?.lang ?? o.site, ms, model: c?.model ?? null, timing });
  // v5 B3: after the decode, and only with JARVIS_GAZETTEER=1 (default off), a misheard place name is put back from the console's own
  // lists (gazetteer.ts); counts only to telemetry. Off, the transcript is exactly Whisper's.
  const text = gazetteerOn() ? correctTranscript(c.text, { lane, lang: c.lang }) : c.text;
  return { text, lang: c.lang, noise: false, ms, lane, conf: { speech: Math.round((1 - c.noSpeech) * 100) / 100, logprob: Math.round(c.logprob * 100) / 100 }, model: c.model, timing };
}

const langOf = (v: unknown): "en" | "ta" | null => (v === "en" || v === "ta" ? v : null);
/** a yes mark: "1" or "true"; anything else is no */
const flagOf = (v: unknown): boolean => v === "1" || v === "true";
/** a speech span in ms: a whole number of ms, not negative; anything else is null */
const spanOf = (v: unknown): number | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

export interface HearBody { buf: ArrayBuffer; vocab: string[]; lastLang: "en" | "ta" | null; clarify: boolean; speechMs: number | null }

/**
 * The /hear request's body: the WAV as it is (the old form), or multipart with `audio` and an optional `vocab` (JSON list of names).
 * `lastLang` ("en" or "ta"): the language of the last line the browser heard, as a multipart field or, with the bare WAV, a query
 * parameter (?lastLang=ta); anything else is null. The same for v5 B2's `clarify` ("1": a clarifying question is pending; anything
 * else is no) and `speechMs` (the detector's speech span, ms; anything that is not a number is null). These are a mark and a number
 * only, never words.
 */
export async function readHear(req: Request): Promise<HearBody | null> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_AUDIO_BYTES + 16_000) return null;
  let q: URLSearchParams | null = null;
  try { q = new URL(req.url).searchParams; } catch { /* no URL to read */ }
  const fromQuery = langOf(q?.get("lastLang"));
  if (/^multipart\/form-data/i.test(req.headers.get("content-type") ?? "")) {
    const f = await req.formData().catch(() => null);
    const a = f?.get("audio");
    if (!a || typeof a === "string") return null;
    return {
      buf: await a.arrayBuffer(), vocab: cleanVocab(f?.get("vocab") ?? null), lastLang: langOf(f?.get("lastLang")) ?? fromQuery,
      clarify: flagOf(f?.get("clarify") ?? q?.get("clarify")), speechMs: spanOf(f?.get("speechMs") ?? q?.get("speechMs"))
    };
  }
  return { buf: await req.arrayBuffer(), vocab: [], lastLang: fromQuery, clarify: flagOf(q?.get("clarify")), speechMs: spanOf(q?.get("speechMs")) };
}
