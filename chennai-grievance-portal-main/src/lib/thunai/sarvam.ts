/**
 * Jarvis v8: Sarvam AI speech to text, one more way to hear, behind JARVIS_STT_SARVAM and OFF by default (the research:
 * docs/jarvis/v8-research/30-sarvam.md; the owner's page: docs/jarvis/SARVAM.md). stt.ts decides when it is asked.
 *
 *   One WAV clip, one REST call: POST https://api.sarvam.ai/speech-to-text, multipart, header api-subscription-key, model saaras:v4,
 *   mode=codemix (English words in Latin letters, Tamil words in Tamil script), language_code=unknown (Sarvam detects the language
 *   and says how sure it is), keyterms: a fixed list of Chennai zone and locality names (saaras:v4 only; at most 50 terms of at most
 *   64 characters; JARVIS_SARVAM_KEYTERMS=0 leaves them out). Back: { transcript, language_code, language_probability }.
 *   The call gives up after JARVIS_SARVAM_TIMEOUT_MS (default 2,500 ms). A clip over 30 s is not sent (Sarvam refuses it).
 *
 *   The key is SARVAM_API_KEY, read on the server only and never logged. No key: the path is skipped (null), never an error. A refused
 *   key or spent credit cools Sarvam for 10 minutes and a 429 for 30 s (the ledger's cooling: no call until then); every failure throws
 *   a SarvamFail, and stt.ts falls back to Whisper.
 *
 *   Every call is counted in the ledger under its own provider, "sarvam", in BILLED seconds (Sarvam bills per second, rounded up, with
 *   a 1 s minimum; Whisper's 10 s minimum is the ledger's own rule for Groq). A rolling day is capped at JARVIS_SARVAM_DAY_S billed
 *   seconds (default 2,400 s = 40 minutes = Rs 19.60 before GST): over it, Sarvam is skipped and Whisper hears alone.
 *
 *   The audio is never stored. Telemetry gets timings, status codes, the language and numbers only, never a word: `stt_sarvam` for each
 *   call (ms, ok, why, status, lang, conf = Sarvam's language probability) and `stt_shadow` for each shadowed turn (shadowLog).
 */
import { ledger, type Lane, type Org } from "./ledger";
import { ZONE_NAMES } from "./lexicon";
import { telemetry } from "./telemetry";

const env = (k: string) => (process.env[k] ?? "").trim();
const positive = (k: string, d: number) => { const n = Number(env(k)); return env(k) && Number.isFinite(n) && n > 0 ? Math.floor(n) : d; };
const DAY = 86_400_000;

export const SARVAM_URL = "https://api.sarvam.ai/speech-to-text";
export const SARVAM_MODEL = "saaras:v4";
export const SARVAM_MODE = "codemix";
/** one Sarvam request gives up after this long, ms (JARVIS_SARVAM_TIMEOUT_MS) */
export const SARVAM_MS = 2500;
/** Sarvam's REST limit per request, seconds of audio */
export const SARVAM_MAX_S = 30;
/** a rolling day's cap, billed seconds (JARVIS_SARVAM_DAY_S): 40 minutes, Rs 19.60 before GST at Rs 0.49 a minute */
export const SARVAM_DAY_S = 2400;
/** a refused key or spent credit: Sarvam is not asked again for this long, ms; a 429 (too many requests): this long */
export const COOL_REFUSED_MS = 600_000;
export const COOL_BUSY_MS = 30_000;
/**
 * The ledger's provider name for Sarvam. ledger.ts's Org type names the providers it was written for; its stores keep any name, so
 * Sarvam's spend is a line of its own ("sarvam" / "saaras:v4") without a change there.
 */
export const SARVAM_ORG = "sarvam" as string as Org;

/**
 * JARVIS_STT_SARVAM, read on every turn: "tamil" = Sarvam takes the forced-Tamil Whisper decode's place in the race (Groq's English
 * decode still runs); "primary" = Sarvam first, the Whisper race only when it fails; "shadow" = Whisper decides, Sarvam hears the same
 * clip alongside and only its timing and agreement are logged. Unset, "0" or anything else: off, today's Whisper race exactly.
 */
export type SarvamMode = "off" | "tamil" | "primary" | "shadow";
export function sarvamMode(): SarvamMode {
  const v = env("JARVIS_STT_SARVAM").toLowerCase();
  return v === "tamil" || v === "primary" || v === "shadow" ? v : "off";
}
/** a key is set (its value is never read out of here) */
export const sarvamKeyed = (): boolean => !!env("SARVAM_API_KEY");
export const sarvamTimeoutMs = (): number => positive("JARVIS_SARVAM_TIMEOUT_MS", SARVAM_MS);
export const sarvamDayS = (): number => positive("JARVIS_SARVAM_DAY_S", SARVAM_DAY_S);

/** saaras:v4's keyterms limits (the research, section 2.1) */
export const KEYTERMS_MAX = 50;
export const KEYTERM_CHARS = 64;
/** The fixed list: the fifteen zones (lexicon.ts) and the localities and reservoirs most asked about. */
export const SARVAM_KEYTERMS: readonly string[] = [...ZONE_NAMES, "Velachery", "Mylapore", "Pallikaranai", "Guindy", "T. Nagar", "Egmore",
  "Chembarambakkam", "Puzhal", "Poondi", "Greater Chennai Corporation"];
/** the keyterms field: a JSON array, cut to Sarvam's limits */
export const keytermsField = (terms: readonly string[] = SARVAM_KEYTERMS): string =>
  JSON.stringify(terms.filter((t) => t.length > 0 && t.length <= KEYTERM_CHARS).slice(0, KEYTERMS_MAX));

/** Sarvam's billing: per second, rounded up, 1 s minimum */
export const billedSeconds = (secs: number): number => Math.max(1, Math.ceil(Math.max(0, secs) - 1e-6));

export type SarvamWhy = "too-long" | "day-cap" | "cooling" | "bad-request" | "refused" | "quota" | "busy" | "server" | "http" | "timeout"
  | "aborted" | "network" | "malformed" | "other-script";
/** A Sarvam call that did not give a usable reading. The message holds the reason and the status only. */
export class SarvamFail extends Error {
  constructor(readonly why: SarvamWhy, readonly status?: number) { super(`sarvam ${why}${status ? ` ${status}` : ""}`); this.name = "SarvamFail"; }
}

export interface SarvamHeard {
  text: string;
  lang: "en" | "ta";
  /** Sarvam's language_probability, 0..1 (how sure it is of the language, not of the words); null when it sent none */
  prob: number | null;
  /** the call's own time, ms */
  ms: number;
  model: string;
}
export interface SarvamOpts {
  /** the clip's length, seconds (stt.ts wavSeconds): the 30 s guard and the ledger's billed seconds */
  secs: number;
  lane?: Lane;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  /** this call's limit, ms (default JARVIS_SARVAM_TIMEOUT_MS) */
  ms?: number;
}

const count = (t: string, re: RegExp) => t.match(re)?.length ?? 0;
/**
 * The language of a reading, for Jarvis: Tamil letters anywhere (codemix writes Tanglish's Tamil words in Tamil script) is Tamil;
 * else Sarvam's language_code (ta-IN is Tamil, en-IN English); else English. Mostly another script (Sarvam heard Hindi or Malayalam)
 * is no use to Jarvis: null.
 */
export function sarvamLang(text: string, code: string | null | undefined): "en" | "ta" | null {
  const all = count(text, /\p{L}/gu), ta = count(text, /(?=\p{L})\p{sc=Tamil}/gu), la = count(text, /(?=\p{L})\p{sc=Latin}/gu);
  if (all && (all - ta - la) / all > 0.2) return null;
  if (ta) return "ta";
  return (code ?? "").toLowerCase().startsWith("ta") ? "ta" : "en";
}

const whyOfError = (e: unknown): SarvamWhy => (e as Error)?.name === "TimeoutError" ? "timeout" : (e as Error)?.name === "AbortError" ? "aborted" : "network";

/** What a refusal means, from its status and Sarvam's error code; a refused key, spent credit or a 429 cools Sarvam. */
async function failOf(r: Response): Promise<SarvamFail> {
  const code = await r.json().then((j: unknown) => (j as { error?: { code?: unknown } } | null)?.error?.code, () => null);
  const cool = (ms: number) => ledger().cool(SARVAM_ORG, SARVAM_MODEL, ms);
  const s = r.status;
  if (s === 401 || s === 403) { cool(COOL_REFUSED_MS); return new SarvamFail("refused", s); }
  // spent credit: 402 on the billing page, 429 insufficient_quota_error in the API reference (the research, section 2.1): both
  if (s === 402 || (s === 429 && code === "insufficient_quota_error")) { cool(COOL_REFUSED_MS); return new SarvamFail("quota", s); }
  if (s === 429) { cool(COOL_BUSY_MS); return new SarvamFail("busy", s); }
  if (s === 400) return new SarvamFail("bad-request", s);
  return new SarvamFail(s >= 500 ? "server" : "http", s);
}

/**
 * One clip to Sarvam. Null: skipped (no key; a clip over 30 s, Sarvam cooling or the day's cap, each logged). A reading: its words,
 * language, language probability and time. Anything else throws a SarvamFail. The request goes out before the first await.
 */
export async function sarvamTranscribe(audio: Blob | ArrayBuffer, o: SarvamOpts): Promise<SarvamHeard | null> {
  const key = env("SARVAM_API_KEY");
  if (!key) return null;
  const lane: Lane = o.lane ?? "other", l = ledger(), t0 = Date.now(), billed = billedSeconds(o.secs);
  const log = (ok: boolean, more: { why?: string; status?: number; lang?: string; conf?: number }) =>
    telemetry("stt_sarvam", { lane, provider: "sarvam", model: SARVAM_MODEL, ms: Date.now() - t0, ok, ...more });
  const skip = (why: SarvamWhy) => { log(false, { why }); return null; };
  if (o.secs > SARVAM_MAX_S) return skip("too-long");
  if (l.coolingUntil(SARVAM_ORG, SARVAM_MODEL) > Date.now()) return skip("cooling");
  if (l.spent(SARVAM_ORG, SARVAM_MODEL, DAY).audioS + billed > sarvamDayS()) return skip("day-cap");

  const f = new FormData();
  f.append("file", audio instanceof Blob ? audio : new Blob([audio], { type: "audio/wav" }), "speech.wav");
  f.append("model", SARVAM_MODEL);
  f.append("mode", SARVAM_MODE);
  f.append("language_code", "unknown");
  if (env("JARVIS_SARVAM_KEYTERMS") !== "0") f.append("keyterms", keytermsField());
  l.record(SARVAM_ORG, SARVAM_MODEL, { audioS: billed, lane });
  const limit = AbortSignal.timeout(o.ms ?? sarvamTimeoutMs());
  const signal = o.signal ? AbortSignal.any([o.signal, limit]) : limit;
  try {
    const r = await (o.fetcher ?? fetch)(SARVAM_URL, { method: "POST", headers: { "api-subscription-key": key }, body: f, signal });
    if (!r.ok) throw await failOf(r);
    const j = (await r.json().catch((e: unknown) => { throw whyOfError(e) === "network" ? new SarvamFail("malformed", r.status) : e; })) as
      { transcript?: unknown; language_code?: unknown; language_probability?: unknown } | null;
    if (!j || typeof j !== "object" || typeof j.transcript !== "string") throw new SarvamFail("malformed", r.status);
    const text = j.transcript.normalize("NFC").replace(/\s+/g, " ").trim();
    const lang = sarvamLang(text, typeof j.language_code === "string" ? j.language_code : null);
    if (!lang) throw new SarvamFail("other-script", r.status);
    const p = j.language_probability;
    const prob = typeof p === "number" && Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : null;
    log(true, { status: r.status, lang, ...(prob != null ? { conf: Math.round(prob * 100) / 100 } : {}), ...(text ? {} : { why: "empty" }) });
    return { text, lang, prob, ms: Date.now() - t0, model: SARVAM_MODEL };
  } catch (e) {
    const fail = e instanceof SarvamFail ? e : new SarvamFail(whyOfError(e));
    log(false, { why: fail.why, status: fail.status });
    throw fail;
  }
}

// ---- shadow mode: agreement only ----

const words = (t: string) => t.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
/** How far two readings agree word for word, 0..1 (1 - the word edit distance over the longer one); two empty readings agree. */
export function agreement(a: string, b: string): number {
  const x = words(a), y = words(b);
  if (!x.length && !y.length) return 1;
  const d = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let k = 1; k <= y.length; k++) { const t = d[k]; d[k] = Math.min(d[k] + 1, d[k - 1] + 1, prev + (x[i - 1] === y[k - 1] ? 0 : 1)); prev = t; }
  }
  return Math.round((1 - d[y.length] / Math.max(x.length, y.length)) * 100) / 100;
}

const pending = new Set<Promise<void>>();
/**
 * Shadow mode: once Sarvam's reading is in, it is compared with the one Whisper chose, and `stt_shadow` gets Sarvam's time (ms), its
 * language (lang), Whisper's (sttWinner), whether the two agree on the language (hit) and how far their words agree (conf, 0..1).
 * Never a word. A failed or skipped call logs ok:false (its own stt_sarvam line has the reason). It never throws and is never waited on.
 */
export function shadowLog(p: Promise<SarvamHeard | null>, chosen: { text: string; lang: "en" | "ta" } | null, lane: Lane): void {
  const winner = chosen?.lang ?? "none";
  const q: Promise<void> = p.then((h) => {
    telemetry("stt_shadow", h
      ? { lane, provider: "sarvam", model: h.model, ms: h.ms, ok: true, lang: h.lang, sttWinner: winner, hit: !!chosen && chosen.lang === h.lang, conf: agreement(h.text, chosen?.text ?? "") }
      : { lane, provider: "sarvam", model: SARVAM_MODEL, ok: false, sttWinner: winner });
  }, () => { /* the call's own stt_sarvam line has its status */ }).finally(() => { pending.delete(q); });
  pending.add(q);
}
/** Resolves once every shadow comparison started so far is logged (tests and the bench). */
export async function shadowSettled(): Promise<void> {
  while (pending.size) await Promise.allSettled([...pending]);
}
