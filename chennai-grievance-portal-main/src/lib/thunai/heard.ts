/**
 * What the browser does with /hear's reply (lib/thunai/stt.ts Heard), as pure code: the confidence a sentence carries into the
 * console, and one sentence said in two parts joined from its two readings. Tested in heard.v4.test.ts.
 */
export interface HearReply { text?: string; lang?: "en" | "ta"; noise?: boolean; budget?: "low"; conf?: { speech?: number; logprob?: number } | null; model?: string | null }

/** what a reply that carries no confidence (a server that sends none, the dev harness's fixtures) is given: the old fixed value */
export const CONF_UNKNOWN = 0.95;

/**
 * How sure the transcriber was, 0..1: Whisper's probability that it was speech (1 - no_speech_prob) times the average probability
 * of its words (exp of its mean log-probability per token). A clean decode (-0.1 to -0.3) gives about 0.73-0.89; Whisper's own
 * "unsure" line (-0.8) gives about 0.45. The third racer (Gemini) has no confidence of its own: stt.ts gives it -0.75, so 0.47.
 */
export function confOf(c?: { speech?: number; logprob?: number } | null): number {
  if (!c || typeof c.logprob !== "number" || !Number.isFinite(c.logprob)) return CONF_UNKNOWN;
  const speech = typeof c.speech === "number" && Number.isFinite(c.speech) ? Math.min(1, Math.max(0, c.speech)) : 1;
  return Math.round(speech * Math.exp(Math.min(0, c.logprob)) * 100) / 100;
}

/** The readings of one sentence said in two parts: the words in order, the language of the longer part, the lower confidence. */
export function joinHeard(a: HearReply | null, b: HearReply | null): HearReply | null {
  const ta = a?.text?.trim() ?? "", tb = b?.text?.trim() ?? "";
  if (!ta && !tb) return b ?? a;
  if (!ta) return b;
  if (!tb) return a;
  const lang = tb.length >= ta.length ? b!.lang : a!.lang;
  const ca = a!.conf, cb = b!.conf;
  const conf = ca && cb ? { speech: Math.min(ca.speech ?? 1, cb.speech ?? 1), logprob: Math.min(ca.logprob ?? 0, cb.logprob ?? 0) } : ca ?? cb ?? null;
  return { text: `${ta} ${tb}`, lang, noise: false, conf, model: b!.model ?? a!.model ?? null };
}
