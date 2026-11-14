/**
 * Jarvis's speech to text on the server. One finished sentence of audio (16 kHz WAV) in, its words out. The audio is never
 * stored or logged, and an ambient transcript is never logged either.
 *
 *   engaged and named turns: parallel forced decodes, ta on whisper-large-v3 with the Tamil-script prompt, en on turbo with the
 *     English prompt, chosen by Whisper's own confidence plus a repetition, a script and a translation check. Auto-detect on
 *     Tanglish was about 97 % WER on thunai/v3; a fixed language plus the prompt did far better.
 *     FIRST GOOD DECODE WINS (v4): as soon as a decode in the expected language (the site's) clears the bar (mean log-probability
 *     above -0.35, no-speech below 0.6, its own script, no loop or echo), the other gets at most 250 ms more and is then let go.
 *     Each Whisper request gives up after 5 s.
 *   a third racer, gemini-3.5-transcribe, the Phase 0 probe's winner by CER on Tamil clips (0.127 against large-v3's 0.151 on 12
 *     clips, but p50 2.6 s against 0.4 s): started IN PARALLEL with Whisper on an engaged or named turn when the ledger has room
 *     for it, used only when Whisper is unsure, let go as soon as Whisper is sure. It is told the same names as Whisper.
 *   ambient (unengaged) sentences: one decode in the site's language, at most 8 a minute in the ledger. One that names Jarvis
 *     and is unsure is read once more here, in the other language only (the browser no longer posts it a second time).
 *
 * The prompts: one per language (sttPrompt), from the lexicon's names in the script that decode writes, plus the names on the open
 * Stage that the browser sends (cleanVocab: at most 30 short names, no digits), inside Whisper's prompt limit.
 *
 * Whisper bills a 10 s minimum per request: the ledger is told, so the listening budget is what Groq will really count.
 */
import { ledger, type Lane } from "./ledger";
import { STT_NAMES, sttTamilName } from "./lexicon";
import { telemetry } from "./telemetry";
import { phonetic } from "./xlit";

const env = (k: string) => (process.env[k] ?? "").trim();
export const MODEL_TA = () => env("JARVIS_STT_MODEL_TA") || env("JARVIS_STT_MODEL") || "whisper-large-v3";
export const MODEL_EN = () => env("JARVIS_STT_MODEL_EN") || "whisper-large-v3-turbo";
export const AMBIENT_PER_MIN = 8;
export const MAX_AUDIO_BYTES = 2_500_000;
/** one Whisper request gives up after this long, ms (it was 12 s) */
export const WHISPER_MS = 5000;
/** after the first good decode, the other decode is given this much longer, ms */
export const GRACE_MS = 250;
/** Whisper's own confidence that clears the bar */
export const GOOD_LOGPROB = -0.35;

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
export interface Decode { lang: "en" | "ta"; model: string; text: string; segments: Seg[]; duration?: number; via?: "whisper" | "gemini"; prompt?: string }
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
 * Whisper on near-silence sometimes writes its own prompt back; that is not what was said. A short run of the prompt's words
 * ("storm water drain") can be a real sentence: it counts as echo only when the decode also looks like silence (`unsure`).
 */
export function promptEcho(t: string, unsure = true, prompt: string = PROMPT): boolean {
  const s = flat(t);
  if (s.length < 12) return false;
  const p = ` ${flat(prompt)} `;
  if (p.includes(s) && (unsure || s.length >= 40)) return true;
  const hits = ["chennai district collector console", "storm water drain waterlogging", "chembarambakkam puzhal poondi", "gcc cmwssb tneb"].filter((x) => s.includes(x));
  return hits.length >= 1;
}

export function scoreDecode(d: Decode): Scored {
  const text = d.text.replace(/\s+/g, " ").trim();
  const logprob = mean(d.segments.map((x) => x.avg_logprob ?? 0));
  const noSpeech = mean(d.segments.map((x) => x.no_speech_prob ?? 0));
  const compression = Math.max(0, ...d.segments.map((x) => x.compression_ratio ?? 0));
  let why: string | null = null;
  if (!text || text.length < 2) why = "empty";
  else if (noSpeech >= 0.6) why = "no-speech";
  else if (compression >= 2.4) why = "compression";
  else if (repeats(text)) why = "repeats";
  // the third racer's logprob is a stand-in, so it is never "unsure" for this
  else if (promptEcho(text, d.via !== "gemini" && (noSpeech >= 0.3 || logprob < -0.6), d.prompt ?? PROMPT)) why = "echo";
  // a forced Tamil decode must come back mostly in Tamil letters, a forced English one mostly in Latin
  else if (d.lang === "ta" && tamilShare(text) < 0.5) why = "script";
  else if (d.lang === "en" && latinShare(text) < 0.6) why = "script";
  return { ...d, text, logprob, noSpeech, compression, ok: !why, why, score: logprob };
}

/** Good enough to stop waiting: Whisper's own confidence clears the bar (the third racer's stand-in never does). */
export const good = (s: Scored): boolean => s.ok && s.via !== "gemini" && s.logprob > GOOD_LOGPROB && s.noSpeech < 0.6;

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
  const a = skeleton(ta.text), b = skeleton(en.text);
  // on hand-made pairs, translations scored 0.22-0.36 and the same sounds in the other script 0.80-1.00 (stt.v4.test.ts)
  const sim = dice(a, b), ratio = Math.min(a.length, b.length) / Math.max(1, a.length, b.length);
  return sim < 0.45 || (sim < 0.6 && ratio < 0.6);
}

/**
 * The better of the decodes. Both languages are forced, so each comes back in its own script; Whisper's logprob decides, with
 * a small lean to the site's language (Tanglish scores close on both). An English decode that translated confident Tamil speech
 * is refused. Nothing acceptable: null.
 */
export function choose(ds: Decode[], site: "en" | "ta"): Scored | null {
  const all = ds.map(scoreDecode);
  const ta = all.find((x) => x.lang === "ta" && x.via !== "gemini" && x.ok);
  const scored = all.map((x) => (ta && x.lang === "en" && x.via !== "gemini" && translated(ta, x) ? { ...x, ok: false, why: "translated" } : x)).filter((x) => x.ok);
  if (!scored.length) return null;
  return scored.sort((a, b) => (b.score + (b.lang === site ? 0.1 : 0)) - (a.score + (a.lang === site ? 0.1 : 0)))[0];
}

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

export const THIRD_MODEL = () => env("JARVIS_STT_THIRD") || "gemini-3.5-transcribe";
/** below this average logprob Whisper is unsure enough to use the third racer */
const UNSURE = -0.8;
const THIRD_MS = 3000;
/** the transcriber refused a request with the instruction in it (400): it is asked with the audio alone from then on */
let thirdPlain = false;

/** The instruction the third racer is given: transcribe, do not translate, and the names it may hear. */
export function thirdInstruction(vocab: string[] = []): string {
  const names: string[] = [], seen = new Set<string>();
  for (const n of [...vocab, ...STT_NAMES.en, ...STT_NAMES.ta]) { const k = n.toLowerCase(); if (!seen.has(k)) { seen.add(k); names.push(n); } }
  return `Transcribe the speech exactly as it is spoken. Write Tamil words in Tamil script and English words in English letters. Do not translate. Names that may be said: ${names.join(", ").slice(0, 900)}.`;
}

/** The third racer: Gemini's transcriber, inside its own deadline. null when it is out of budget, slow or refuses. */
export async function third(audio: Blob, signal: AbortSignal | undefined, fetcher: Fetcher = fetch, o: { lane?: Lane; vocab?: string[]; ms?: number } = {}): Promise<Decode | null> {
  const key = env("GEMINI_API_KEY"), model = THIRD_MODEL();
  if (!key || !ledger().room("gemini", model).ok) return null;
  ledger().record("gemini", model, { lane: o.lane ?? "engaged" });
  const instr = thirdInstruction(o.vocab);
  const withText = !thirdPlain;
  try {
    const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
    const deadline = AbortSignal.timeout(o.ms ?? THIRD_MS);
    const r = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
      body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: "audio/wav", data } }, ...(withText ? [{ text: instr }] : [])] }], generationConfig: { temperature: 0 } })
    });
    if (r.status === 429) { ledger().cool("gemini", model, 60_000); telemetry("fallback_429", { provider: "gemini", model, status: 429, fallback: "whisper" }); return null; }
    // a transcriber that will not take the instruction (unverified whether it does): the next request sends the audio alone
    if (r.status === 400 && withText) { thirdPlain = true; return null; }
    if (!r.ok) return null;
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string; audioTranscription?: { text?: string } }[] } }[] };
    const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.audioTranscription?.text ?? p.text ?? "").join("").trim();
    return text ? { lang: tamilShare(text) >= 0.5 ? "ta" : "en", model, text, segments: [{ avg_logprob: UNSURE + 0.05 }], via: "gemini", prompt: withText ? instr : undefined } : null;
  } catch { return null; }
}

/** One decode. Keys are tried in turn for a refused key; a 429 is the organisation's, so another key will not help. */
export async function decode(audio: Blob, lang: "en" | "ta", model: string, signal: AbortSignal | undefined, fetcher: Fetcher = fetch, prompt: string = sttPrompt(lang), ms: number = WHISPER_MS): Promise<Decode> {
  let last: Error = new Error("no-key");
  for (const key of keys()) {
    const f = new FormData();
    f.append("file", audio, "speech.wav");
    f.append("model", model);
    f.append("response_format", "verbose_json");
    f.append("temperature", "0");
    f.append("prompt", prompt);
    f.append("language", lang);
    const r = await fetcher("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: f, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms) });
    if (r.status === 429) { ledger().cool("groq", model, 30_000); telemetry("fallback_429", { provider: "groq", model, status: 429, fallback: "none" }); throw new SttBusy(); }
    if (r.status === 401 || r.status === 403) { last = new Error(`refused ${r.status}`); continue; }
    if (!r.ok) throw new Error(`whisper ${r.status}`);
    const j = (await r.json()) as { text?: string; segments?: Seg[]; duration?: number };
    return { lang, model, text: j.text ?? "", segments: j.segments ?? [], duration: j.duration, via: "whisper", prompt };
  }
  throw last;
}
export class SttBusy extends Error { constructor() { super("busy"); } }

export interface Heard { text: string; lang: "en" | "ta"; noise: boolean; ms: number; lane: Lane; conf: { speech: number; logprob: number }; model: string | null; budget?: "low" }

const heard = (o: Partial<Heard> & { lane: Lane; lang: "en" | "ta"; ms: number }): Heard => ({ text: "", noise: true, conf: { speech: 0, logprob: 0 }, model: null, ...o });

/** A filler Whisper is known to invent counts as noise when it is unsure of it, or always for an ambient sentence. */
function invented(c: Scored, lane: Lane): boolean {
  return INVENTED.test(c.text) && (lane === "ambient" || c.logprob < -0.6 || (c.duration ?? 1) < 0.8);
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

type Kind = "ta" | "en" | "gemini";
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
 * has run (then the rest are let go).
 */
async function whisperRace(rs: Racer[], expected: "en" | "ta", grace: number): Promise<void> {
  if (!rs.length) return;
  const want = rs.some((r) => r.kind === expected) ? expected : rs[0].kind;
  await new Promise<void>((done) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (rs.every((r) => r.done)) { if (timer) clearTimeout(timer); done(); return; }
      if (!timer && rs.some((r) => r.done && r.d && r.kind === want && good(scoreDecode(r.d)))) timer = setTimeout(done, grace);
    };
    for (const r of rs) void r.p.then(check);
  });
  for (const r of rs) letGo(r);
}

const NAMED = /(?:^|[^a-z])(?:jarvis|jarviz|jarvish|jervis|javis|jaarvis)(?:[^a-z]|$)|ஜார்விஸ்|ஜார்வீஸ்|ஜாவிஸ்/i;
const whyOf = (e: unknown) => e instanceof SttBusy ? "busy" : (e as Error)?.name === "TimeoutError" ? "timeout" : (e as Error)?.name === "AbortError" ? "aborted" : "error";

export interface HearOpts {
  lane: Lane; site: "en" | "ta"; signal?: AbortSignal; fetcher?: Fetcher;
  /** names on the open Stage, from the browser (cleaned here again) */
  vocab?: string[];
  /** test knobs, ms: one Whisper request's limit, the grace after the first good decode, the third racer's limit */
  ms?: { whisper?: number; grace?: number; third?: number };
}

/** One utterance. `lane`: ambient gets one decode in the site's language; engaged and named get the parallel forced decodes and the third racer. */
export async function hearUtterance(buf: ArrayBuffer, o: HearOpts): Promise<Heard> {
  const t0 = Date.now();
  const audio = new Blob([buf], { type: "audio/wav" });
  const secs = wavSeconds(buf);
  const l = ledger();
  const vocab = cleanVocab(o.vocab ?? []);
  const wMs = o.ms?.whisper ?? WHISPER_MS, grace = o.ms?.grace ?? GRACE_MS, tMs = o.ms?.third ?? THIRD_MS;
  const wanted: { lang: "en" | "ta"; model: string }[] = o.lane === "ambient"
    ? [{ lang: o.site, model: o.site === "ta" ? MODEL_TA() : MODEL_EN() }]
    : [{ lang: "ta", model: MODEL_TA() }, { lang: "en", model: MODEL_EN() }];
  const b = budget(o.lane, wanted.map((a) => a.model));
  if (!b.ok) { telemetry("stt_budget", { lane: o.lane, why: b.why }); return heard({ lane: o.lane, lang: o.site, ms: 0, budget: "low" }); }
  const whisperOf = (a: { lang: "en" | "ta"; model: string }, lane: Lane) => {
    l.record("groq", a.model, { audioS: secs, lane });
    return racer(a.lang, a.model, o.signal, (s) => decode(audio, a.lang, a.model, s, o.fetcher, sttPrompt(a.lang, vocab), wMs));
  };
  const geminiOf = (lane: Lane) => (env("GEMINI_API_KEY") && l.room("gemini", THIRD_MODEL()).ok ? racer("gemini", THIRD_MODEL(), o.signal, (s) => third(audio, s, o.fetcher, { lane, vocab, ms: tMs })) : null);

  let lane = o.lane;
  const whisper = wanted.filter((a) => b.models.includes(a.model)).map((a) => whisperOf(a, lane));
  // the third racer runs beside Whisper from the start on a turn someone is waiting on (third() checks the ledger itself)
  let gem = lane !== "ambient" ? geminiOf(lane) : null;
  await whisperRace(whisper, o.site, grace);
  let c = choose(whisper.filter((r) => r.d).map((r) => r.d!), o.site);

  // an ambient sentence that names Jarvis, read unsure: once more, in the other language only, with the third racer beside it
  if (lane === "ambient" && c && NAMED.test(c.text) && c.logprob < -0.7) {
    const other = c.lang === "ta" ? "en" : "ta", model = other === "ta" ? MODEL_TA() : MODEL_EN();
    if (l.room("groq", model, { audioS: 10 }).ok) {
      lane = "named";
      const more = whisperOf({ lang: other, model }, lane);
      gem = geminiOf(lane) ?? gem;
      whisper.push(more);
      await whisperRace([more], other, 0);
      c = choose(whisper.filter((r) => r.d).map((r) => r.d!), o.site);
    }
  }

  const got = whisper.filter((r) => r.d);
  const loneOther = !!c && got.length === 1 && c.lang !== o.site && c.logprob < -0.45;
  let used: Kind | null = c ? (c.lang as Kind) : null;
  if (gem) {
    if (!c || c.logprob < UNSURE || loneOther) {
      // Whisper is unsure, or only the other language's decode came back unsure: the third racer, inside its own deadline
      await gem.p;
      const g = gem.d ? scoreDecode(gem.d) : null;
      if (g?.ok) { c = g; used = "gemini"; }
    } else letGo(gem);
  }
  const ms = Date.now() - t0;
  for (const r of [...whisper, ...(gem ? [gem] : [])]) {
    const s = r.d ? scoreDecode(r.d) : null;
    telemetry("stt_decode", { lane, provider: r.kind === "gemini" ? "gemini" : "groq", model: r.model, decode: r.kind, ms: r.ms || Date.now() - r.t0, ok: !!s?.ok, why: s ? s.why ?? undefined : r.aborted ? "aborted" : r.d === null && !r.err ? "none" : whyOf(r.err), conf: s && r.kind !== "gemini" ? Math.round(s.logprob * 100) / 100 : undefined, aborted: r.aborted || undefined, sttWinner: used ?? "none" });
  }
  telemetry("stt", { lane, ms, ok: !!c, calls: whisper.length + (gem ? 1 : 0), model: c?.model ?? undefined, sttWinner: used ?? "none", lang: c?.lang });
  if (!c) {
    const nothing = !got.length && !gem?.d;
    if (nothing && whisper.some((r) => r.err instanceof SttBusy)) return heard({ lane, lang: o.site, ms, budget: "low" });
    if (nothing && whisper.length && whisper.every((r) => r.err)) throw new Error("stt-failed");
  }
  if (!c || invented(c, lane)) return heard({ lane, lang: c?.lang ?? o.site, ms, model: c?.model ?? null });
  return { text: c.text, lang: c.lang, noise: false, ms, lane, conf: { speech: Math.round((1 - c.noSpeech) * 100) / 100, logprob: Math.round(c.logprob * 100) / 100 }, model: c.model };
}

/** The /hear request's body: the WAV as it is (the old form), or multipart with `audio` and an optional `vocab` (JSON list of names). */
export async function readHear(req: Request): Promise<{ buf: ArrayBuffer; vocab: string[] } | null> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_AUDIO_BYTES + 16_000) return null;
  if (/^multipart\/form-data/i.test(req.headers.get("content-type") ?? "")) {
    const f = await req.formData().catch(() => null);
    const a = f?.get("audio");
    if (!a || typeof a === "string") return null;
    return { buf: await a.arrayBuffer(), vocab: cleanVocab(f?.get("vocab") ?? null) };
  }
  return { buf: await req.arrayBuffer(), vocab: [] };
}
