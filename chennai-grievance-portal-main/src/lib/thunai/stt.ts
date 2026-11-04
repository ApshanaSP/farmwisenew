/**
 * Jarvis's speech to text on the server. One finished sentence of audio (16 kHz WAV) in, its words out. The audio is never
 * stored or logged, and an ambient transcript is never logged either.
 *
 *   engaged and named turns: parallel forced decodes, ta on whisper-large-v3 with the place-name prompt, en on turbo with the
 *     prompt, chosen by Whisper's own confidence plus a repetition and a script check. Auto-detect on Tanglish was about 97 %
 *     WER on thunai/v3; a fixed language plus the prompt did far better.
 *   ambient (unengaged) sentences: one decode in the site's language, at most 8 a minute in the ledger.
 *   a third racer, gemini-3.5-transcribe, the Phase 0 probe's winner by CER on Tamil clips (0.127 against large-v3's 0.151 on 12
 *     clips, but p50 2.6 s against 0.4 s): asked only when Whisper is unsure of an engaged turn and the budget allows.
 *
 * Whisper bills a 10 s minimum per request: the ledger is told, so the listening budget is what Groq will really count.
 */
import { ledger, type Lane } from "./ledger";
import { ZONE_NAMES } from "./lexicon";
import { telemetry } from "./telemetry";

const env = (k: string) => (process.env[k] ?? "").trim();
export const MODEL_TA = () => env("JARVIS_STT_MODEL_TA") || env("JARVIS_STT_MODEL") || "whisper-large-v3";
export const MODEL_EN = () => env("JARVIS_STT_MODEL_EN") || "whisper-large-v3-turbo";
export const AMBIENT_PER_MIN = 8;
export const MAX_AUDIO_BYTES = 2_500_000;

export const PROMPT = `Jarvis, Chennai District Collector console. ${ZONE_NAMES.join(", ")}, Velachery, Mylapore, Chembarambakkam, Puzhal, Poondi, GCC, CMWSSB, TNEB, IMD, AQI, storm water drain, waterlogging, dengue. ஜார்விஸ், அடையாறு, அம்பத்தூர், அண்ணா நகர், வெள்ளம், மழை, புகார்.`;
/** what Whisper writes on silence or noise (it was trained on subtitles) */
export const INVENTED = /^(thank you\.?|thanks( for watching)?\.?|you\.?|bye\.?|okay\.?|ok\.?|hmm+\.?|uh+\.?|so\.?|\.+|subtitles? by.*|amara\.org.*|please subscribe.*|நன்றி\.?|வணக்கம்\.?)$/i;

export interface Seg { no_speech_prob?: number; avg_logprob?: number; compression_ratio?: number; text?: string }
export interface Decode { lang: "en" | "ta"; model: string; text: string; segments: Seg[]; duration?: number; via?: "whisper" | "gemini" }
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

/** Whisper on near-silence sometimes writes its own prompt back; that is not what was said. */
export function promptEcho(t: string): boolean {
  const s = t.toLowerCase().replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (s.length < 12) return false;
  const p = PROMPT.toLowerCase().replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ");
  if (p.includes(s)) return true;
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
  else if (promptEcho(text)) why = "echo";
  // a forced Tamil decode must come back mostly in Tamil letters, a forced English one mostly in Latin
  else if (d.lang === "ta" && tamilShare(text) < 0.5) why = "script";
  else if (d.lang === "en" && latinShare(text) < 0.6) why = "script";
  return { ...d, text, logprob, noSpeech, compression, ok: !why, why, score: logprob };
}

/**
 * The better of the decodes. Both languages are forced, so each comes back in its own script; Whisper's logprob decides, with
 * a small lean to the site's language (Tanglish scores close on both). Nothing acceptable: null.
 */
export function choose(ds: Decode[], site: "en" | "ta"): Scored | null {
  const scored = ds.map(scoreDecode).filter((x) => x.ok);
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
/** below this average logprob Whisper is unsure enough to ask the third racer */
const UNSURE = -0.8;
const THIRD_MS = 3000;

/** The third racer: Gemini's transcriber, inside its own deadline. null when it is out of budget, slow or refuses. */
export async function third(audio: Blob, signal: AbortSignal | undefined, fetcher: Fetcher = fetch): Promise<Decode | null> {
  const key = env("GEMINI_API_KEY"), model = THIRD_MODEL();
  if (!key || !ledger().room("gemini", model).ok) return null;
  ledger().record("gemini", model, { lane: "engaged" });
  try {
    const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
    const deadline = AbortSignal.timeout(THIRD_MS);
    const r = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
      body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: "audio/wav", data } }] }], generationConfig: { temperature: 0 } })
    });
    if (r.status === 429) { ledger().cool("gemini", model, 60_000); return null; }
    if (!r.ok) return null;
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string; audioTranscription?: { text?: string } }[] } }[] };
    const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.audioTranscription?.text ?? p.text ?? "").join("").trim();
    return text ? { lang: tamilShare(text) >= 0.5 ? "ta" : "en", model, text, segments: [{ avg_logprob: UNSURE + 0.05 }], via: "gemini" } : null;
  } catch { return null; }
}

/** One decode. Keys are tried in turn for a refused key; a 429 is the organisation's, so another key will not help. */
export async function decode(audio: Blob, lang: "en" | "ta", model: string, signal: AbortSignal | undefined, fetcher: Fetcher = fetch): Promise<Decode> {
  let last: Error = new Error("no-key");
  for (const key of keys()) {
    const f = new FormData();
    f.append("file", audio, "speech.wav");
    f.append("model", model);
    f.append("response_format", "verbose_json");
    f.append("temperature", "0");
    f.append("prompt", PROMPT);
    f.append("language", lang);
    const r = await fetcher("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: f, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000) });
    if (r.status === 429) { ledger().cool("groq", model, 30_000); throw new SttBusy(); }
    if (r.status === 401 || r.status === 403) { last = new Error(`refused ${r.status}`); continue; }
    if (!r.ok) throw new Error(`whisper ${r.status}`);
    const j = (await r.json()) as { text?: string; segments?: Seg[]; duration?: number };
    return { lang, model, text: j.text ?? "", segments: j.segments ?? [], duration: j.duration, via: "whisper" };
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

/** What the ledger says about the lane's budget. */
export function budget(lane: Lane): { ok: boolean; why: string | null; ambientThisMinute: number } {
  const l = ledger();
  const turbo = l.spent("groq", MODEL_EN(), 60_000, "ambient").requests, large = l.spent("groq", MODEL_TA(), 60_000, "ambient").requests;
  const ambient = turbo + large;
  if (lane === "ambient" && ambient >= AMBIENT_PER_MIN) return { ok: false, why: "ambient-cap", ambientThisMinute: ambient };
  const r = l.room("groq", MODEL_EN(), { audioS: 10 });
  if (!r.ok) return { ok: false, why: r.why, ambientThisMinute: ambient };
  return { ok: true, why: null, ambientThisMinute: ambient };
}

/** One utterance. `lane`: ambient gets one decode in the site's language; engaged and named get the parallel forced decodes. */
export async function hearUtterance(buf: ArrayBuffer, o: { lane: Lane; site: "en" | "ta"; signal?: AbortSignal; fetcher?: Fetcher }): Promise<Heard> {
  const t0 = Date.now();
  const audio = new Blob([buf], { type: "audio/wav" });
  const secs = wavSeconds(buf);
  const l = ledger();
  const b = budget(o.lane);
  if (!b.ok) { telemetry("stt_budget", { lane: o.lane, why: b.why }); return heard({ lane: o.lane, lang: o.site, ms: 0, budget: "low" }); }
  const asks: { lang: "en" | "ta"; model: string }[] = o.lane === "ambient"
    ? [{ lang: o.site, model: o.site === "ta" ? MODEL_TA() : MODEL_EN() }]
    : [{ lang: "ta", model: MODEL_TA() }, { lang: "en", model: MODEL_EN() }];
  const res = await Promise.allSettled(asks.map((a) => { l.record("groq", a.model, { audioS: secs, lane: o.lane }); return decode(audio, a.lang, a.model, o.signal, o.fetcher); }));
  const ms = Date.now() - t0;
  const good = res.filter((r): r is PromiseFulfilledResult<Decode> => r.status === "fulfilled").map((r) => r.value);
  telemetry("stt", { lane: o.lane, ms, ok: good.length > 0, calls: asks.length });
  if (!good.length) {
    if (res.some((r) => r.status === "rejected" && r.reason instanceof SttBusy)) return heard({ lane: o.lane, lang: o.site, ms, budget: "low" });
    throw new Error("stt-failed");
  }
  let c = choose(good, o.site);
  // Whisper is unsure of a turn someone is waiting on, or only the other language's decode came back and it is not sure:
  // the third racer, if the budget allows; else the site's own language has a say
  const loneOther = !!c && good.length === 1 && c.lang !== o.site && c.logprob < -0.45;
  if (o.lane !== "ambient" && (!c || c.logprob < UNSURE || loneOther)) {
    const g = await third(audio, o.signal, o.fetcher);
    if (g) c = scoreDecode(g).ok ? scoreDecode(g) : c;
  }
  if (!c || invented(c, o.lane)) return heard({ lane: o.lane, lang: c?.lang ?? o.site, ms, model: c?.model ?? null });
  return { text: c.text, lang: c.lang, noise: false, ms, lane: o.lane, conf: { speech: Math.round((1 - c.noSpeech) * 100) / 100, logprob: Math.round(c.logprob * 100) / 100 }, model: c.model };
}
