/**
 * Is this a plain English word? A word in front of an agency word that is English ("today's police report", "senior citizen police report",
 * "damaged road department") names no other town: only a word that is neither English nor one of ours is taken for another body (RC-01).
 * The list is the 274,000-word word-list package, held as a Bloom filter (about 4 percent of non-words read as English, which only
 * means a rare foreign name is left to the old rules). It is data the browser carries, because the fast lane runs there.
 */
import { ENGLISH_BLOOM } from "./english.bloom";
import { BLOOM_BYTES, bloomIndexes } from "./english.hash.mjs";

let bits: Uint8Array | null = null;
export function isEnglishWord(w: string): boolean {
  if (!/^[a-z]{3,14}$/.test(w)) return false;
  if (!bits) {
    const s = atob(ENGLISH_BLOOM);
    bits = new Uint8Array(BLOOM_BYTES);
    for (let i = 0; i < s.length && i < BLOOM_BYTES; i++) bits[i] = s.charCodeAt(i);
  }
  return bloomIndexes(w).every((i) => (bits![i >> 3] & (1 << (i & 7))) !== 0);
}
