/**
 * Place names across the three ways they arrive: English spelling, Tamil script and Tanglish, as Whisper and people write them.
 * A phonetic key folds what these spellings disagree on (th/t/d, sh/s/ch, zh/l, doubled letters, long vowels). Used only as the
 * last resort after the exact forms in lexicon.ts. Tamil text is only ever NFC-normalised and stripped of punctuation for this;
 * nothing else touches it (never Whisper's BasicTextNormalizer).
 */
const VOWEL: Record<string, string> = { "அ": "a", "ஆ": "a", "இ": "i", "ஈ": "i", "உ": "u", "ஊ": "u", "எ": "e", "ஏ": "e", "ஐ": "ai", "ஒ": "o", "ஓ": "o", "ஔ": "au" };
const SIGN: Record<string, string> = { "ா": "a", "ி": "i", "ீ": "i", "ு": "u", "ூ": "u", "ெ": "e", "ே": "e", "ை": "ai", "ொ": "o", "ோ": "o", "ௌ": "au" };
const CONS: Record<string, string> = { "க": "k", "ங": "n", "ச": "s", "ஞ": "n", "ட": "t", "ண": "n", "த": "t", "ந": "n", "ப": "p", "ம": "m", "ய": "y", "ர": "r", "ல": "l", "வ": "v", "ழ": "l", "ள": "l", "ற": "r", "ன": "n", "ஜ": "j", "ஷ": "s", "ஸ": "s", "ஹ": "h" };

/** Tamil script to plain Latin letters, for the key only. */
export function romanise(tamil: string): string {
  let out = "";
  const t = tamil.normalize("NFC");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (VOWEL[c]) { out += VOWEL[c]; continue; }
    if (CONS[c]) {
      const next = t[i + 1];
      if (next === "்") { out += CONS[c]; i++; }
      else if (next && SIGN[next]) { out += CONS[c] + SIGN[next]; i++; }
      else out += `${CONS[c]}a`;
      continue;
    }
    if (/\s/.test(c)) out += " ";
  }
  return out;
}

/** The folded key: spelling differences gone. */
export function phonetic(s: string): string {
  const latin = /[஀-௿]/.test(s) ? romanise(s) : s.toLowerCase().normalize("NFC");
  return latin
    .replace(/[^a-z ]+/g, "")
    .replace(/zh|lh/g, "l").replace(/sh|ch|c(?=[ei])/g, "s").replace(/th|dh|d/g, "t").replace(/ph|bh|b/g, "p").replace(/kh|gh|g|q/g, "k").replace(/w/g, "v").replace(/j/g, "s")
    .replace(/aa|ah/g, "a").replace(/ee|ie/g, "i").replace(/oo|ou/g, "u").replace(/ai|ay|ei/g, "e").replace(/y/g, "")
    .replace(/(.)\1+/g, "$1")
    .replace(/\s+/g, " ").trim();
}

function near(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length] <= max;
}

/**
 * Names in the text that match by key. `names` is [id, name]; a name's key must be long enough to mean something, and one edit is
 * allowed only on keys of 6 letters or more. Whole-word (or two-word) matches only: nothing is found inside a longer word.
 */
export function fuzzyNames<T>(text: string, names: [T, string][]): T[] {
  const words = text.replace(/[^\p{L}\p{M}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const grams = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    // Tamil and Tanglish case endings on a name: "Adyar-la", "அடையாறில்"
    const w = words[i];
    for (const g of [w, w.replace(/(la|le|ku|lla|il|ile|kku)$/i, ""), w.replace(/(இல்|ில்|க்கு|ல்)$/, "")]) grams.add(g);
    if (i + 1 < words.length) grams.add(`${w} ${words[i + 1]}`);
  }
  const keys = [...grams].map(phonetic).filter((k) => k.length >= 4);
  const out: T[] = [];
  for (const [id, name] of names) {
    const k = phonetic(name);
    if (k.length < 4) continue;
    if (keys.some((g) => g === k || (k.length >= 6 && near(g, k, 1)))) out.push(id);
  }
  return out;
}
