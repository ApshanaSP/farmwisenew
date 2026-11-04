/**
 * Gates on what Jarvis says aloud, run in code on every line a screen speaks (docs/qa/JARVIS_VOICE.md):
 *   copy   the line shares no run of 6 or more words with a record it was built from (proper names excepted): it retells, never reads out
 *   labels the line holds no field name, raw id, enum value, snake_case word or ISO date
 * Pure; the narrators fall back to a plainer template when a line fails, never to a field dump.
 */

const toks = (s: string) => s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/** The first run of `n` words the line shares with any source, or null. Runs made only of the given names do not count. */
export function copiedRun(line: string, sources: string[], names: string[] = [], n = 6): string | null {
  const nameWords = new Set(names.flatMap(toks));
  const grams = new Set<string>();
  for (const src of sources) {
    const t = toks(src);
    for (let i = 0; i + n <= t.length; i++) grams.add(t.slice(i, i + n).join(" "));
  }
  if (!grams.size) return null;
  const l = toks(line);
  for (let i = 0; i + n <= l.length; i++) {
    const g = l.slice(i, i + n);
    if (g.every((w) => nameWords.has(w))) continue;
    if (grams.has(g.join(" "))) return g.join(" ");
  }
  return null;
}

const LABELS: [RegExp, string][] = [
  [/\b[a-z]+_[a-z0-9_]+\b/, "snake_case"],
  [/\bINC-[A-Za-z0-9_-]+/, "incident id"],
  [/\b(?:POL|GCC|PWD|HLT|DIST|WRD)-[A-Z]{2,4}\b/, "department code"],
  [/\b\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?/, "ISO date"],
  [/\b(?:status|severity|priority|dept|department|title|category|sla|zone_no)\s*[:=]/i, "field label"],
  [/\bstatus (?:open|closed|resolved|pending|in progress|new|assigned)\b/i, "enum read out"],
  [/\b(?:Severe|High|Medium|Low),\s/, "severity enum"],
  [/\b(?:FLOOD|DRAINAGE|SOLID|ROAD|VECTOR|HEALTH|STREETLIGHT|TRAFFIC|CRIME|FIRE|WATER)_[A-Z_]+\b/, "category code"],
  [/\b(?:undefined|null|NaN|\[object Object\])\b/, "broken value"]
];

/** What in the line reads like a record's fields rather than speech, or null. */
export function labelIn(line: string): string | null {
  for (const [re, why] of LABELS) if (re.test(line)) return why;
  return null;
}

/** Both gates: null when the line may be said. */
export function speechProblem(line: string, sources: string[], names: string[] = []): string | null {
  const l = labelIn(line);
  if (l) return `label: ${l}`;
  const c = copiedRun(line, sources, names);
  return c ? `copied: "${c}"` : null;
}
