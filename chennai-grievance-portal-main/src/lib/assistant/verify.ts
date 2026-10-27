/**
 * The number verifier. Every number in an answer's headline, text, spoken summary and chart
 * titles must be a fact (at the precision it is written: "97.7%" and "98%" both match 97.65)
 * or context that is not a claim: dates, times, years, incident IDs, zone and ward numbers, street numbers,
 * the length of the window ("last 30 days"), numbers the question itself contains, and
 * numbers inside a headline quoted verbatim from the data. Anything else fails the answer.
 *
 * Numbers written as words are not checked; the composer is told to use digits.
 */
import type { Fact } from "@/lib/assistant/types";

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";
const TA_MONTHS = "ஜன|பிப்|மார்|ஏப்|மே|ஜூன்|ஜூலை|ஆக|செப்|அக்|நவ|டிச";
const WINDOW_WORD = /(last|past|previous|preceding|prior|over|within|in the|for the|next|kadandha|kadaisi|கடந்த|கடைசி|முந்தைய)\s*$/i;
/** Window lengths the console and tools use: 24 hours, 7/14/21/28/30/60/90/180 days, 12 weeks, 6 months, 2-hour buckets. */
const WINDOW_NUMBERS = new Set([1, 2, 6, 7, 12, 14, 21, 24, 28, 30, 60, 90, 180]);

const PATTERNS: RegExp[] = [
  /\b[A-Z]{2,}[-_][A-Za-z0-9_-]*\d[A-Za-z0-9_-]*/g, // IDs: INC-20260928-BF90AB, THR-..., TLK-EGM
  /\b\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/g, // ISO dates and times
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\b\\.?(?:,?\\s+\\d{4})?`, "gi"), // 29 Sep 2026
  new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?:,?\\s+\\d{4})?`, "gi"), // Sep 29
  new RegExp(`\\d{1,2}\\s*(?:${TA_MONTHS})\\S*`, "g"), // 29 செப்.
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, // 29/09
  /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?/gi, // 6:43 PM, 18:43
  /\b\d{1,2}\.\d{2}\s*(?:am|pm|a\.m\.|p\.m\.)/gi, // 6.43 pm (a dot only with am/pm: 97.65 is a number)
  /\b(?:19|20)\d{2}\b/g, // years
  /\b(?:zone|ward|zones|wards|மண்டலம்|மண்டல|வார்டு)\s*(?:no\.?\s*)?\d{1,3}(?:\s*(?:and|&|,|to|-)\s*\d{1,3})*/gi, // Zone 9, wards 64 and 65
  /\bw\/e\b/gi,
  /\b\d{1,3}(?:st|nd|rd|th)?\s+(?:street|st\.?|cross|main|road|rd\.?|lane|avenue|block|sector|floor|phase|stage)\b/gi // addresses: 19th Street, 2nd Main Road
];
const NUMBER = /(?<![\w.])[-−]?(?:\d{1,3}(?:,\d{3})+|\d{1,3}(?:,\d{2})+,\d{3}|\d+)(?:\.\d+)?(?:\s*(lakhs?|crores?|k)\b)?/gi;
const DURATION = /(\d{1,3})\s*[- ]?(?:hours?|hrs?|days?|weeks?|months?|மணி\S*|நாட்\S*|நாள்\S*|வார\S*|மாத\S*|naal|naatkal|vaaram|maasam)/gi;

export interface Verdict { ok: boolean; checked: number; unmatched: string[] }

/** Numbers written in a text, with how many decimals each was written with. */
export function extractNumbers(text: string, quotable: string[] = []): { raw: string; value: number; decimals: number; scale: number; before: string; after: string }[] {
  let t = ` ${String(text ?? "").replace(/[௦-௯]/g, (c) => String(c.charCodeAt(0) - 0x0be6))} `;
  // a headline quoted verbatim from the data carries its own numbers
  t = t.replace(/[“"‘']([^“”"‘’']{6,240})[”"’']/g, (m, inner: string) => (quotable.some((q) => q.includes(inner.trim())) ? " " : m));
  for (const re of PATTERNS) t = t.replace(re, " ");
  // the window's own length ("last 30 days", "28-day mean"), not a claim
  t = t.replace(DURATION, (m, n: string, offset: number, all: string) =>
    WINDOW_NUMBERS.has(Number(n)) || WINDOW_WORD.test(all.slice(Math.max(0, offset - 20), offset)) ? " " : m);
  const out: { raw: string; value: number; decimals: number; scale: number; before: string; after: string }[] = [];
  for (const m of t.matchAll(NUMBER)) {
    const at = m.index ?? 0;
    const before = t.slice(Math.max(0, at - 28), at).toLowerCase();
    const after = t.slice(at + m[0].length, at + m[0].length + 24).toLowerCase();
    const raw = m[0].trim();
    const digits = raw.replace(/[−]/g, "-").replace(/[^0-9.-]/g, "");
    let value = Number(digits);
    if (!Number.isFinite(value)) continue;
    const decimals = (digits.split(".")[1] ?? "").length;
    const unit = (m[1] ?? "").toLowerCase();
    const scale = unit.startsWith("lakh") ? 1e5 : unit.startsWith("crore") ? 1e7 : unit === "k" ? 1e3 : 1;
    value *= scale;
    out.push({ raw, value, decimals, scale, before, after });
  }
  return out;
}

/**
 * What a number is said to measure, from the word right after it ("24 deaths", "12 injured", "40%"): its value must then
 * come from a fact about that measure, not merely equal some other fact ("24 deaths" from a fact about 24 complaints fails).
 */
const MEASURES: { said: RegExp; fact: RegExp; strict?: boolean }[] = [
  { said: /^\s*(deaths?|dead|died|killed|fatalit|lives? lost|people (died|were killed))/, fact: /death|dead|died|killed|fatal/ },
  { said: /^\s*(injur|people injured|hurt|wounded)/, fact: /injur|hurt|wound/ },
  { said: /^\s*(citizen )?complaints?/, fact: /complaint/ },
  // a percentage is the claim a model most often works out itself: it must come from a percent fact, never an equal count
  { said: /^\s*(%|per ?cent|percent)/, fact: /pct|percent|share|rate|%|occupancy/, strict: true },
  { said: /^\s*(severe)\b/, fact: /severe/ },
  { said: /^\s*(open|pending|unresolved|still open)\b/, fact: /open|pending|unresolved|backlog/ }
];
const UP = /\b(rose|rise|rising|risen|increase[ds]?|up|higher|more|jump(ed)?|grew|growth|surge[ds]?)\b[^.]{0,18}$/;
const DOWN = /\b(fell|fall|falling|fallen|decrease[ds]?|down|lower|fewer|less|drop(ped)?|declin(e|ed)|dipped)\b[^.]{0,18}$/;

/**
 * Check the texts of an answer against the facts. `context` = numbers that are not claims (the question's own, the scope's).
 * A number passes when a fact has its value (at the precision written) and, where the words say what it measures or which
 * way it moved, a fact of that measure and direction has it: "24 deaths" needs a death fact, "rose 21.2%" a positive change.
 */
export function verifyNumbers(texts: string[], facts: Fact[], context: number[] = [], quotable: string[] = []): Verdict {
  const unmatched: string[] = [];
  let checked = 0;
  for (const text of texts) {
    for (const n of extractNumbers(text, quotable)) {
      checked++;
      const tol = 0.5 * 10 ** -n.decimals * n.scale + 1e-9;
      const near = (a: number) => Math.abs(Math.abs(a) - Math.abs(n.value)) <= tol;
      const matches = facts.filter((f) => near(f.value));
      const inContext = context.some(near);
      if (!matches.length) { if (!inContext) unmatched.push(n.raw); continue; }
      const measure = MEASURES.find((m) => m.said.test(n.after));
      const about = (f: Fact) => `${f.id} ${f.label}`.toLowerCase();
      // only a fact clearly about another measure is ruled out ("24 deaths" on a complaints fact); an unlabelled one still counts
      const otherMeasure = (f: Fact) => !measure!.fact.test(about(f)) && MEASURES.some((m) => m !== measure && m.fact.test(about(f)));
      let ok = measure ? matches.filter((f) => (measure.strict ? measure.fact.test(about(f)) || !!f.unit?.startsWith("%") : !otherMeasure(f))) : matches;
      // a change's direction: "rose 21%" must not rest on a fact of -21%
      const change = ok.filter((f) => /change|delta|diff|vs|pct/.test(about(f)));
      if (change.length && UP.test(n.before)) ok = ok.filter((f) => !change.includes(f) || f.value > 0);
      else if (change.length && DOWN.test(n.before)) ok = ok.filter((f) => !change.includes(f) || f.value < 0);
      // a number the question itself contains ("beds above 85%") may be repeated, whatever it measures
      if (!ok.length && !inContext) unmatched.push(n.raw);
    }
  }
  return { ok: unmatched.length === 0, checked, unmatched: [...new Set(unmatched)] };
}

/** Units printed with a figure: measurements whose number means nothing without them (counts carry none). */
const MEASURE_UNIT = /^(mm|cm|°c|aqi|% full|cusec|mcft|tmc|hours?|days?|km|rs\/kg|₹\/kg|beds?)$/i;

/**
 * Grounded citations: the composer writes a figure as {{fact_id}} and the code prints the fact's exact value, so a number
 * cannot be mistyped or misquoted. A change prints without its sign (the words say "rose" or "fell", and the verifier then
 * checks that direction); a percent fact prints with "%". Ids that are not facts come back in `unknown`.
 */
export function fillFacts(text: string, facts: Fact[]): { text: string; unknown: string[] } {
  const by = new Map(facts.map((f) => [f.id, f]));
  const unknown: string[] = [];
  const out = String(text ?? "").replace(/\{\{\s*([A-Za-z0-9_.:-]+)\s*\}\}(%?)/g, (_m, id: string, pctAfter: string, at: number, all: string) => {
    const f = by.get(id);
    if (!f) { unknown.push(id); return `{{${id}}}${pctAfter}`; }
    const v = /change|delta/i.test(id) ? Math.abs(f.value) : f.value;
    const s = Number.isInteger(v) ? v.toLocaleString("en-IN") : v.toLocaleString("en-IN", { maximumFractionDigits: 1 });
    if (f.unit === "%" || pctAfter) return `${s}%`;
    // a measurement keeps its unit ("0 mm", "85 AQI", "34.1% full"), unless the sentence already writes it after the figure
    const unit = f.unit && MEASURE_UNIT.test(f.unit) ? f.unit : "";
    // what follows the figure, past markdown ("**{{x}}** days")
    const next = all.slice(at + _m.length, at + _m.length + 20).replace(/^[\s*_`]+/, "").toLowerCase();
    if (!unit) return s;
    if (unit.startsWith("%")) return next.startsWith("%") ? s : next.startsWith(unit.slice(1).trim().toLowerCase()) ? `${s}%` : `${s}${unit}`;
    return next.startsWith(unit.toLowerCase().split(" ")[0]) ? s : `${s} ${unit}`;
  });
  return { text: out, unknown: [...new Set(unknown)] };
}

/** Numbers in the question and the scope line: repeating them is not a claim. */
export function contextNumbers(...texts: string[]): number[] {
  const out: number[] = [];
  for (const t of texts) for (const n of extractNumbers(t)) out.push(n.value);
  for (const re of [/\b(?:zone|ward|மண்டலம்)\s*(\d{1,3})/gi]) for (const t of texts) for (const m of String(t).matchAll(re)) out.push(Number(m[1]));
  return out;
}

/**
 * A draft whose numbers fail the check twice used to be thrown away whole for a template. Most of it is usually right:
 * only the sentences holding an unverified number go (`ok` checks one piece of text), the rest of the model's wording
 * stays. The headline and voice line are kept or dropped whole (null when dropped). Null when no sentence survives.
 */
export function pruneUnverified(d: { headline: string; answerMarkdown: string; voiceSummary: string }, ok: (text: string) => boolean):
  { headline: string | null; answerMarkdown: string; voiceSummary: string | null; dropped: number } | null {
  let dropped = 0;
  const lines = d.answerMarkdown.split("\n").map((line) => {
    if (!line.trim()) return line;
    const lead = line.match(/^\s*(?:[-*]|\d+\.)\s+/)?.[0] ?? "";
    const parts = line.slice(lead.length).split(/(?<=[.!?।])\s+/);
    const kept = parts.filter((s) => (ok(s) ? true : (dropped++, false)));
    return kept.length ? lead + kept.join(" ") : null;
  }).filter((l): l is string => l !== null);
  const md = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!md) return null;
  return { headline: ok(d.headline) ? d.headline : null, answerMarkdown: md, voiceSummary: ok(d.voiceSummary) ? d.voiceSummary : null, dropped };
}

/** The places and departments a fact id can belong to, by family: zone number, department code, taluk code -> name. */
export type EntityNames = Partial<Record<"zone" | "dept" | "taluk", Map<string, string>>>;
const FAMILY: Record<string, keyof EntityNames> = { zone: "zone", dept: "dept", backlog: "dept", resolution: "dept", taluk: "taluk" };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A figure written against the wrong place: "Royapuram ... (104 open incidents)" where 104 is {{zone.8.open}}, Anna Nagar's.
 * The number check passes (104 is a fact), so this checks the binding: in each sentence, a placeholder of a zone's,
 * department's or taluk's fact must not sit in a sentence that names another one of the same kind and not its own.
 * A sentence that names none ("it has {{zone.5.open}} open") is not judged. Returns one line per misplaced figure.
 */
export function misboundFacts(text: string, names: EntityNames): string[] {
  const out: string[] = [];
  for (const sentence of String(text ?? "").split(/(?<=[.!?;])\s+|\n+/)) {
    const plain = sentence.replace(/\{\{[^}]*\}\}/g, " ").toLowerCase();
    const has = (n: string) => new RegExp(`(^|[^a-z])${esc(n.toLowerCase())}($|[^a-z])`).test(plain);
    for (const m of sentence.matchAll(/\{\{\s*([a-z_]+)\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_.]+\s*\}\}/g)) {
      const map = FAMILY[m[1]] ? names[FAMILY[m[1]]] : undefined;
      const own = map?.get(m[2]);
      if (!map || !own || has(own)) continue;
      const other = [...map.entries()].find(([k, n]) => k !== m[2] && n.length >= 4 && has(n));
      if (other) out.push(`${m[0].replace(/\s+/g, "")} is ${own}'s figure, but its sentence is about ${other[1]}`);
    }
  }
  return [...new Set(out)];
}

/** Dataset rows the composer sometimes cites as if they were facts, and the facts that hold the same figures. */
const ROW_ALIAS: Record<string, string> = { drivers: "type", driver_places: "place", driver_depts: "dept", driver_top: "top" };
const FIELD_ALIAS: Record<string, string> = { n: "now", n_prev: "prev", prev: "prev", delta: "change", overdue: "overdue", open: "open", dead: "deaths",
  injured: "injured", severe: "severe", rain: "rain" };

/**
 * "{{driver_places.0.n}}" for the first place's count: a row of a dataset written as a fact id. Rewritten to the fact that
 * holds that figure ("{{place1.now}}") when it exists; anything else is left for the unknown-id check.
 */
export function aliasRowIds(text: string, factIds: Set<string>): string {
  return String(text ?? "").replace(/\{\{\s*([a-z_]+)\.(\d+)\.([a-z_]+)\s*\}\}/g, (m, ds: string, row: string, field: string) => {
    const prefix = ROW_ALIAS[ds], f = FIELD_ALIAS[field];
    const id = prefix && f ? `${prefix}${Number(row) + 1}.${f}` : null;
    return id && factIds.has(id) ? `{{${id}}}` : m;
  });
}

/**
 * A figure written as the wrong measure of the right place: "Teynampet has the most open citizen complaints at 199", where 199
 * is {{zone.9.open}} (open incidents; its complaints are 112). The word right after the placeholder (or just before it)
 * says complaints or incidents; the fact's label must say the same when the place has a fact for the other one.
 */
export function mismeasuredFacts(text: string, facts: Fact[]): string[] {
  const by = new Map(facts.map((f) => [f.id, f]));
  const out: string[] = [];
  const s = String(text ?? "");
  for (const m of s.matchAll(/\{\{\s*([A-Za-z0-9_.:-]+)\s*\}\}/g)) {
    const f = by.get(m[1]);
    const prefix = m[1].replace(/\.[^.]+$/, ".");
    if (!f || !/^(zone|dept|taluk)\./.test(m[1])) continue;
    const after = s.slice(m.index! + m[0].length, m.index! + m[0].length + 40).split("{{")[0];
    const before = s.slice(Math.max(0, m.index! - 40), m.index!).split("}}").pop() ?? "";
    const word = after.match(/^[\s*_]*(?:open\s+|citizen\s+|open citizen\s+|still open\s+)?(complaints?|incidents?|cases?)\b/i)?.[1]
      ?? before.match(/\b(complaints?|incidents?|cases?)\b[^.\d{]{0,22}$/i)?.[1];
    if (!word) continue;
    const saysComplaint = /^complaint/i.test(word), isComplaint = /complaint/i.test(f.label);
    const sibling = facts.some((x) => x.id.startsWith(prefix) && x.id !== f.id && /complaint/i.test(x.label) !== isComplaint);
    if (saysComplaint !== isComplaint && sibling) out.push(`${m[0]} is "${f.label}" but the text calls it ${word}`);
  }
  return [...new Set(out)];
}

/**
 * A draft that argues with itself, the model's own correction left in the answer ("453 vs 487 is incorrect, Royapuram
 * is 487"): every number in it can be a real fact, so the number check passes it. Returns the sentences that do it.
 */
const SELF_CORRECTION = /\b(is|was|are|were) (incorrect|wrong|a mistake|a typo)\b|\b(correction:|i mean\b|let me (correct|rephrase|fix)|my (mistake|apologies|bad)|sorry\b|scratch that|oops)|\bwait,|\bactually,? (no|that|it'?s not)\b/i;
const sentencesOf = (line: string) => line.split(/(?<=[.!?])\s+/);

export function selfCorrections(text: string): string[] {
  return text.split("\n").flatMap(sentencesOf).filter((x) => SELF_CORRECTION.test(x));
}

/** The text without its self-correcting sentences (each line keeps its other sentences; a line left empty goes). */
export function withoutSelfCorrections(text: string): { text: string; dropped: number } {
  let dropped = 0;
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    const parts = sentencesOf(line);
    const ok = parts.filter((x) => !SELF_CORRECTION.test(x));
    dropped += parts.length - ok.length;
    if (ok.length === parts.length) kept.push(line);
    else if (ok.length) kept.push(ok.join(" "));
  }
  return { text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), dropped };
}

/** Caveats without those that repeat an earlier one: the same opening words, or most of the shorter one's words. */
export function dedupeCaveats(caveats: string[]): string[] {
  const STOP = /^(was|is|are|were|the|a|an|of|in|on|for|to|and|its|has|have|been|by|their|this|that|not|no|it|be|as|with|within|only)$/;
  const words = (c: string) => String(c).toLowerCase().replace(/[^a-z0-9஀-௿ ]+/g, " ").split(/\s+/).filter((w) => w && !STOP.test(w)).map((w) => w.replace(/(es|ed|s)$/, ""));
  const kept: { text: string; w: string[] }[] = [];
  for (const c of caveats) {
    const w = words(c);
    const repeats = kept.some((k) => {
      if (w.slice(0, 5).join(" ") === k.w.slice(0, 5).join(" ")) return true;
      const [small, big] = w.length <= k.w.length ? [w, new Set(k.w)] : [k.w, new Set(w)];
      return small.length >= 4 && small.filter((x) => big.has(x)).length / small.length >= 0.7;
    });
    if (!repeats) kept.push({ text: c, w });
  }
  return kept.map((k) => k.text);
}

/**
 * A figure written twice, as a word and then as digits ("one person was reported injured 1.", "no citizen complaints have
 * been logged 0."): the model filled a placeholder after already saying the number. The digits go when they repeat the word.
 */
const NUMBER_WORDS: Record<string, number> = { no: 0, zero: 0, none: 0, one: 1, a: 1, an: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10 };
export function withoutEchoedNumbers(text: string): string {
  return text.replace(/\b(no|zero|none|one|single|two|three|four|five|six|seven|eight|nine|ten)\b([^.\n\d]{1,80}?)\s+(\d{1,2})(?=\s*[.,;:)]|\s*$|\s+(?:and|but|with|while|so|as|after)\b)/gi,
    (all, word: string, middle: string, digits: string) => (NUMBER_WORDS[word.toLowerCase()] === Number(digits) ? `${word}${middle}` : all));
}

/**
 * Claims a draft may not make (R-12, 27 Oct 2026: "Complaints rose because … all linked to rain" beside the caveat "Rain link
 * indicates timing, not proven cause", and "address first is **INC-20261022-66346E** in Perambur"):
 * - an incident id in the prose (ids belong in the chips; the prose names what happened and where);
 * - a causal word about rain when a caveat says the link is timing, not cause.
 */
const RAW_ID = /\*{0,2}\bINC-[A-Z0-9]{6,}(?:-[A-Z0-9]+)*\b\*{0,2}/g;
const CAUSAL = /\b(because( of)?|caused by|due to|driven by|owing to|as a result of|led to|resulting from|attributable to)\b[^.!?\n]{0,80}\brain/i;
const RAIN_TIMING = (caveats: string[]) => caveats.some((c) => /timing,? not (a )?(proven )?cause|not (a )?proven cause/i.test(c));
export function overclaims(text: string, caveats: string[], body?: string): string[] {
  const out: string[] = [];
  const ids = text.match(RAW_ID);
  if (ids?.length) out.push(`incident id in the text (${ids[0].replace(/\*/g, "")})`);
  if (RAIN_TIMING(caveats) && CAUSAL.test(text)) out.push("rain given as the cause, though the caveat says the link is timing only");
  // (the body only: a headline restates the body's figures by design)
  const twice = body != null ? repeatedFigures(body) : null;
  if (twice) out.push(`the same figures said twice (${twice})`);
  return out;
}

/**
 * Two sentences that state the same two or more figures (R-25: "the highest open incidents (15 severe and 159 total). Its open
 * count tops the district at 15 severe and 159 total"). Returns the figures, or null.
 */
export function repeatedFigures(text: string): string | null {
  const sentences = text.replace(/\*\*/g, "").split(/(?<=[.!?])\s+|\n+/).map((x) => [...new Set(x.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])]);
  for (let a = 0; a < sentences.length; a++)
    for (let b = a + 1; b < sentences.length; b++) {
      const same = sentences[a].filter((n) => sentences[b].includes(n));
      if (same.length >= 2) return same.join(", ");
    }
  return null;
}
/** The last resort when a redraft still overclaims: ids taken out of the prose, causal words about rain made a timing link. */
export function withoutOverclaims(text: string, caveats: string[]): string {
  let t = text.replace(/\s*\(\s*\*{0,2}INC-[A-Z0-9-]+\*{0,2}\s*\)/g, "").replace(/\b(incident|is|was)\s+\*{0,2}INC-[A-Z0-9-]+\*{0,2}\s+/g, "$1 ")
    .replace(RAW_ID, "this incident");
  if (RAIN_TIMING(caveats))
    t = t.replace(/\b(because( of)?|caused by|due to|driven by|owing to|as a result of|led to|resulting from|attributable to)\b(?=[^.!?\n]{0,80}\brain)/gi, "at the same time as");
  return t;
}
