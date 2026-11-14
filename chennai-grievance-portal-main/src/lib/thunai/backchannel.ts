/**
 * Backchannels: what a listener says while someone else is talking ("mm-hmm", "okay", சரி, "seri") to show they are following.
 * They are not a bid for the turn, so they must not stop Jarvis mid-answer. Pure and tested (backchannel.v4.test.ts).
 *
 * The rule is Pipecat's MinWordsInterruptionStrategy, ported as a pattern with no dependency: speech over Jarvis's voice stops it
 * only once its live words hold at least TUNING.bargeWords words that are not backchannels (or it is held TUNING.bargeHoldMs,
 * turn.ts). Fillers ("um", "uh") count as backchannels: they hold no request either.
 */
import { TUNING } from "./vad";

/** English, Tanglish and Tamil-script words that only acknowledge. Closed list: a word not here counts as a real word. */
const WORDS = new Set([
  // English
  "yes", "yeah", "yea", "yep", "yup", "ya", "yah", "right", "alright", "sure", "fine", "good", "nice", "cool", "correct", "exactly", "true", "i-see", "got-it",
  // Tanglish
  "seri", "sari", "seringa", "saringa", "aama", "aamaa", "ama", "amaa", "aamam", "aamaam", "aamanga", "aamaanga", "haan", "ha", "haa", "appadiya", "apdiya",
  // Tamil script
  "சரி", "சரிங்க", "ஆமா", "ஆமாம்", "ஆம்", "ஆமாங்க", "ஓகே", "ஓக்கே", "ஓ", "ஆ", "அப்படியா", "அப்டியா"
].map((w) => w.toLowerCase().normalize("NFC")));
/** "ok", "okay", "okey", "k"; "hmm", "mm", "mhm", "mm-hmm"; "uh", "um", "uh-huh", "ah", "oh", "er"; ம், ம்ம், ஹ்ம் */
const SHAPES = /^(?:o?k+|o+k+a+y+|o+k+e+y*|okie|h?m+h?m*|m+-?h+m+|u+h*|u+m+|uh-?huh|a+h+|o+h+|e+r+|(?:ஹ்)?(?:ம்)+)$/u;

const back = (w: string) => WORDS.has(w) || SHAPES.test(w);

/** The words, lower case, with the two-word backchannels joined ("uh huh", "mm hmm", "i see", "got it", "all right"). */
export function words(text: string): string[] {
  return text.toLowerCase().normalize("NFC").replace(/[’'`]/g, "")
    .replace(/\buh\s+huh\b/g, "uh-huh").replace(/\b(m+)\s+(h+m+)\b/g, "$1-$2").replace(/\bi\s+see\b/g, "i-see").replace(/\bgot\s+it\b/g, "got-it").replace(/\ball\s+right\b/g, "alright")
    .replace(/[^\p{L}\p{M}\p{N}\s-]+/gu, " ")
    .split(/\s+/).map((w) => w.replace(/^-+|-+$/g, "")).filter(Boolean);
}

/** Nothing but backchannels (and at least one word). */
export const isBackchannel = (text: string): boolean => { const w = words(text); return w.length > 0 && w.every(back); };

/** How many of the words are not backchannels. */
export const contentWords = (text: string): number => words(text).filter((w) => !back(w)).length;

/** Do these live words claim the turn? At least `min` words that are not backchannels. */
export const bargesIn = (text: string, min: number = TUNING.bargeWords): boolean => contentWords(text) >= min;
