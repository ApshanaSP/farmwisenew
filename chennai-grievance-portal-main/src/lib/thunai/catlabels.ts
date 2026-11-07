/**
 * One rule for every lane that reads a kind of complaint from a word (the fast lane's catIn, the console lane's category names): a one-word name for a category
 * ("drain" for Drainage & sewage) is only a stem of that word. When another category's label holds the same word and the sentence says more of that label's words
 * ("drain work ... safety issue" against "Drain works site safety"), the sentence is about that other category. Counted by stems of the labels' own words, so no phrase
 * is typed per category (QA4 G1, tanglish-explain-20).
 */
export const stemOf = (w: string): string => w.replace(/(ing|es|s)$/, "");
export const labelStems = (label: string): string[] => label.toLowerCase().replace(/&/g, " ").split(/\s+/).filter((x) => x.length >= 3).map(stemOf);
export const saidStems = (words: string[]): Set<string> => new Set(words.map(stemOf));

/** `code` is the category a one-word name gave; the result is that code, or the category whose label the sentence says more of. */
export function betterCategory(code: string, word: string, said: Set<string>, labels: Iterable<{ code: string; label: string }>): string {
  const all = [...labels];
  const score = (c: string) => new Set(labelStems(all.find((x) => x.code === c)?.label ?? "").filter((x) => x.length >= 4 && said.has(x))).size;
  const w = stemOf(word.toLowerCase());
  const own = score(code);
  let best: { code: string; n: number } | null = null;
  for (const c of all) {
    if (c.code === code || !labelStems(c.label).includes(w)) continue;
    const n = score(c.code);
    if (n >= 2 && n > own && (!best || n > best.n)) best = { code: c.code, n };
  }
  return best ? best.code : code;
}
