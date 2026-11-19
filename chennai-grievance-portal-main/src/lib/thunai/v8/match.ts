/**
 * v8: matching what the speech-to-text wrote to names and headlines (docs/jarvis/v8-research/40-tamil-matching.md, 10-understanding.md rec 4).
 *
 *   looseKey(word)      the Tamil-loose key: spellings that English, Tamil script and Tanglish disagree on fold to one form
 *                       (th/t/d, zh/l, sh/ch/s, aa/a, ee/i, doubled letters, a final silent e, c as k or s)
 *   tokensOf(text)      the words of a sentence or a headline, Tamil script romanised first
 *   tokenSim(q, t)      0..1: equal keys 1; long enough and close (Jaro-Winkler with an edit-distance ceiling by length); a word cut
 *                       short by the speech-to-text ("Palikan" for Pallikaranai) 0.9; the same consonants across scripts 0.88; a word
 *                       with a Tamil case ending matched by its stem
 *
 * Pure, no I/O. The thresholds are the research's starting values, tuned only on the dev set.
 */
import { romanise } from "../xlit";

const TAMIL = /[஀-௿]/u;

/** Tamil script runs romanised, marks stripped, lower case, punctuation to spaces */
export function fold(text: string): string {
  // the clusters romanise() would blur: ற்ற is "ttr" (திருவொற்றியூர் Thiruvottriyur), ன்ற is "ndr"
  const pre = text.normalize("NFC").replace(/ற்ற/gu, "ட்ர").replace(/ன்ற/gu, "ன்ட்ர");
  const parts = pre.split(/([஀-௿]+)/u);
  const latin = parts.map((p) => (TAMIL.test(p) ? ` ${romanise(p)} ` : p)).join("");
  return latin.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/** The Tamil-loose key of one word (the research's R.3, with English spelling folded as well) */
export function looseKey(word: string): string {
  let s = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return "";
  s = s.replace(/tion$/, "san").replace(/ck/g, "k").replace(/ou/g, "u");
  s = s.replace(/zh/g, "l").replace(/sh/g, "s").replace(/ch/g, "s").replace(/ph/g, "p").replace(/f/g, "p").replace(/q/g, "k").replace(/x/g, "ks").replace(/w/g, "v").replace(/z/g, "s");
  // c: s before e, i, y; k otherwise
  s = s.replace(/c(?=[eiy])/g, "s").replace(/c/g, "k");
  // h after a consonant goes (th, dh, kh, gh, bh, jh); a first h stays
  s = s.replace(/([^aeiouh])h/g, "$1");
  s = s.replace(/d/g, "t").replace(/g/g, "k").replace(/b/g, "p");
  s = s.replace(/t+r(?=[iy])/g, "t");
  s = s.replace(/aa+/g, "a").replace(/ee+/g, "i").replace(/ii+/g, "i").replace(/oo+/g, "u").replace(/uu+/g, "u").replace(/aiy/g, "ay");
  s = s.replace(/(?:ey|y)$/, "i");
  s = s.replace(/([a-z])\1+/g, "$1");
  if (s.length > 4) s = s.replace(/([^aeiou])u$/, "$1").replace(/([^aeiou])e$/, "$1");
  return s;
}

/** the consonants of a key, its first letter kept (a cross-script check: "suprim" and "suprem" are one word) */
export const skeleton = (key: string): string => (key ? key[0] + key.slice(1).replace(/[aeiou]/g, "") : "");

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array<boolean>(a.length).fill(false), bm = new Array<boolean>(b.length).fill(false);
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true; m++; break;
    }
  }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  let l = 0;
  while (l < 4 && l < a.length && l < b.length && a[l] === b[l]) l++;
  return jaro < 0.7 ? jaro : jaro + l * 0.1 * (1 - jaro);
}

/** Damerau-Levenshtein (optimal string alignment) */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Latin case endings and clitics a Tamil or Tanglish word may carry, longest first (the research's R.4) */
// (v9: and the spoken locative after a vowel, "-வுல"/"-யுல": "மெரினாவுல" -> merina, "சென்னையுல" -> chennai; v8's holdout)
const ENDINGS = ["ilirundhu", "ilirunthu", "ilirundu", "lerundhu", "lirundhu", "lerunthu", "lendhu", "yikku", "vukku", "voda", "vooda", "ooda", "vula", "vule", "yula", "yule", "yila", "yile", "kitta", "kitte", "ukku",
  // (v9, the review: the accusative with the sandhi consonant before திற, படி, சொல்: -ஐத், -ஐப், -ஐச், "porattattaip")
  "udan", "aale", "yaip", "yait", "yaic", "aip", "ait", "aic", "ais", "yil", "vila", "vil", "ula", "ule", "ile", "ila", "lla", "kku", "oda", "ode", "odu", "aal", "yin", "yai", "yum", "lae", "il", "la", "le", "ku", "in", "ai", "um", "aa", "ah", "ya", "e", "a"];

/** a word and the stems its case endings may hide ("pallikaranaiyila" -> "pallikaranai"; "kodambakkathula" -> "kodambakkam") */
export function stemsOf(word: string): string[] {
  const w = word.toLowerCase();
  const out: string[] = [];
  for (const e of ENDINGS) {
    if (!w.endsWith(e) || w.length - e.length < 4) continue;
    const stem = w.slice(0, -e.length);
    out.push(stem);
    if (/(?:ath|att|athu|attu|atthu)$/.test(stem)) out.push(stem.replace(/(?:ath|att|athu|attu|atthu)$/, "am"));
    if (/(?:atr|attr|aatr)$/.test(stem)) out.push(stem.replace(/(?:atr|attr|aatr)$/, "ar"));
  }
  return [...new Set(out)];
}

/** how close a heard key is to a name's key, by the research's length bands; 0 when not close enough. v9: `cut` false leaves out the "cut short"
 * rule (a Tamil word is not an English word that begins like it: "maram", a tree, is not "marathon"; the review, 19 Nov) */
export function keySim(q: string, t: string, cut = true, skel = true): number {
  if (!q || !t) return 0;
  if (q === t) return 1;
  const n = q.length;
  if (n <= 3 || t.length <= 3) return 0;
  const jw = jaroWinkler(q, t);
  const dl = editDistance(q, t);
  if (n <= 7 ? jw >= 0.9 && dl <= 1 : jw >= 0.88 && dl <= 2) return jw;
  // a cut-off word: all but its last letter begin the longer name ("palikan" in "palikaranai")
  if (cut && n >= 5 && t.length >= n + 2 && t.startsWith(q.slice(0, -1))) return 0.9;
  // across scripts: the same consonants in the same order ("suprim" for "suprem")
  // (v9: `skel` false leaves this out: a joined pair's consonants are no word's, "beach horse" is not "fisheries"; the real store, 19 Nov)
  const sq = skeleton(q), st = skeleton(t);
  if (skel && sq.length >= 4 && sq === st) return 0.88;
  return 0;
}

/** an English word without its ending ("inauguration", "inaugurated" -> "inaugur"; "constables" -> "constable") */
export const enStem = (w: string): string => {
  const x = w.toLowerCase();
  // (v10, the second review of v9: and -ised/-ized, -ment, -age: "hospitalised" is "hospital", "encroachments" "encroach", "drainage" "drain")
  const m = /^(.{4,}?)(?:isations|izations|isation|ization|ations|ation|ated|ating|ates|ate|ised|ized|ises|izes|ise|ize|ments|ment|ages|age|ions|ion|ings|ing|ers|er|ed|es|s)$/.exec(x);
  return m ? m[1].replace(/([^aeiou])\1$/, "$1") : x;
};

/** one heard word against one word of a name or headline: its key, then its stems' keys (a little less) */
export function tokenSim(q: string, t: string): number {
  const qk = looseKey(q), tk = looseKey(t);
  let best = keySim(qk, tk);
  if (best >= 1) return 1;
  // the same English word in another form
  if (/^[a-z]+$/.test(q) && /^[a-z]+$/.test(t) && q.length >= 5 && t.length >= 5 && enStem(q) === enStem(t)) best = Math.max(best, 0.92);
  for (const s of stemsOf(q)) best = Math.max(best, keySim(looseKey(s), tk) * 0.98);
  // a short word across scripts, its vowels apart ("kort" for court): enough to count in a headline, never to name a place alone
  if (!best && qk.length >= 4 && tk.length >= 4 && skeleton(qk).length >= 3 && skeleton(qk) === skeleton(tk)) best = 0.85;
  return best;
}

/**
 * v9: an acronym said letter by letter, as the speech-to-text writes it ("I O C L", "R.B.I.", "H-P-V"), is one word ("IOCL"): capital letters
 * standing alone, two or more in a row; small ones only three or more in a row ("a" and "i" are words). "T. Nagar" (a letter and a word) and
 * "I read" stay as they are. The holdout's "anything new on that I O C L blast?" (v8's RESULTS, "Where v8 still misses").
 */
const SPELLED_UP = /(?<![\p{L}\p{N}])[A-Z](?:[.\-\s]{1,3}[A-Z](?![\p{L}\p{N}]))+\.?/gu;
const SPELLED_LOW = /(?<![\p{L}\p{N}])[a-z](?:[.\-\s]{1,3}[a-z](?![\p{L}\p{N}])){2,}\.?/gu;
export const joinSpelled = (text: string): string =>
  text.replace(SPELLED_UP, (m) => ` ${m.replace(/[^A-Z]/g, "")} `).replace(SPELLED_LOW, (m) => ` ${m.replace(/[^a-z]/g, "")} `);

/** the words of a text, Tamil romanised (an acronym said letter by letter joined first) */
export const tokensOf = (text: string): string[] => fold(joinSpelled(text)).split(" ").filter(Boolean);

/** words that tell one multi-word name from another only together with the rest ("Anna Nagar" is not "Anna Salai") */
const GENERIC = new Set(["nagar", "salai", "road", "street", "main", "east", "west", "north", "south", "colony", "the", "new", "old"]);

/** how well a heard phrase names one name (0..1): the joined keys, or every word of a multi-word name matched */
export function nameScore(heard: string, name: string): number {
  const ht = tokensOf(heard), nt = tokensOf(name).filter((t) => t !== "the");
  if (!ht.length || !nt.length) return 0;
  const nj = looseKey(nt.join(""));
  const joined = ht.join("");
  let s = keySim(looseKey(joined), nj);
  for (const st of stemsOf(joined)) s = Math.max(s, keySim(looseKey(st), nj) * 0.98);
  if (nt.length === 1) {
    for (const h of ht) s = Math.max(s, tokenSim(h, nt[0]));
    return s;
  }
  const every = nt.every((t) => ht.some((h) => tokenSim(h, t) >= 0.88));
  const distinct = nt.filter((t) => !GENERIC.has(t));
  return every && distinct.length ? Math.max(s, 0.9) : s >= 0.95 ? s : 0;
}

/** The one name a heard phrase means, or null: nothing close enough, or two names too close to tell apart (ask, never guess) */
export function bestName(heard: string, names: string[], floor = 0.88): { name: string; score: number } | null {
  const scored = names.map((name) => ({ name, score: nameScore(heard, name) })).filter((x) => x.score >= floor).sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score - scored[1].score < 0.04 && looseKey(scored[0].name) !== looseKey(scored[1].name)) return null;
  return scored[0];
}
