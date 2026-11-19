/**
 * Adaptive end of utterance: how much quiet ends the Collector's sentence, read from the browser captions' live words while it
 * is being said. Pure and tested (eou.v4.test.ts); the numbers are in TUNING (vad.ts) for the owner to change.
 *
 *   open      the words end on a connective, a filler, a preposition or an article ("show Adyar and", "Adyar apram", "அடையாறு
 *             மற்றும்", "complaints in"): the sentence is still going, so it ends only after TUNING.eouOpenMs (600-700 ms).
 *   complete  the rules already resolve the words with confidence >= 0.85, or they end on a district noun (a zone, a place, a
 *             department): TUNING.eouCompleteMs (300 ms).
 *   neutral   anything else, and "none" when no captions are running: the fixed TUNING.endOfUtteranceMs.
 *
 * The browser's captions arrive a little after the audio, so this only ever lengthens or shortens the sentence it is in; the
 * detector goes back to the fixed value at the end of each sentence (vad.ts endAfter).
 */
import { TUNING } from "./vad";

/** Closed lists of the last words that leave a sentence open, in English, Tanglish and Tamil script. */
const OPEN = new Set([
  // English connectives, prepositions, articles and words that need what follows
  "and", "also", "then", "or", "but", "so", "because", "plus", "with", "without", "except", "including", "versus", "vs", "than", "compared",
  "in", "on", "at", "for", "of", "to", "into", "from", "by", "about", "between", "near", "the", "a", "an", "like", "which", "whose", "if", "when", "where",
  // Tanglish
  "matrum", "mattrum", "maatrum", "apram", "aprom", "aprm", "aprum", "apparam", "appuram", "appram", "piragu", "piraku", "athoda", "adhoda", "athukku", "aana", "illana", "appo",
  // Tamil script
  "மற்றும்", "அப்புறம்", "அப்பறம்", "அப்றம்", "பிறகு", "அதோட", "அதோடு", "அதுக்கு", "ஆனா", "ஆனால்", "அல்லது", "இல்லன்னா", "அப்போ", "உம்"
].map((w) => w.normalize("NFC")));
/** fillers: "um", "uh", "er", "hmm", ம்ம் */
const FILLER = /^(?:u+m+|u+h+|e+r+m*|h?m+|(?:ஹ்)?(?:ம்)+)$/u;

const wordsOf = (text: string) => text.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ").split(/\s+/).filter(Boolean);

/** Do the words stop where the sentence cannot (a connective, a filler, a preposition or an article)? */
export function endsOpen(text: string): boolean {
  const last = wordsOf(text).at(-1);
  return !!last && (OPEN.has(last) || FILLER.test(last));
}

/** The last one, two and three words, shortest first: what "ends on a district noun" is checked against. */
export function tails(text: string, n = 3): string[] {
  const w = text.trim().split(/\s+/).filter(Boolean);
  return Array.from({ length: Math.min(n, w.length) }, (_, i) => w.slice(w.length - i - 1).join(" "));
}

export type EouWhy = "open" | "complete" | "neutral" | "none";

/** The quiet that ends this sentence, from its live words (null or empty: no captions, the fixed value). */
export function eouFor(text: string | null | undefined, o: { sure: boolean; endsInNoun: boolean }): { ms: number; why: EouWhy } {
  const t = (text ?? "").trim();
  if (!t) return { ms: TUNING.endOfUtteranceMs, why: "none" };
  if (endsOpen(t)) return { ms: TUNING.eouOpenMs, why: "open" };
  if (o.sure || o.endsInNoun) return { ms: TUNING.eouCompleteMs, why: "complete" };
  return { ms: TUNING.endOfUtteranceMs, why: "neutral" };
}
