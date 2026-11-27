/**
 * The briefing's AI opening (the pipeline's stored summary of a period, briefings.ai_summary, and the briefing book's daily "situation"
 * note, briefing_notes) is shown under "Written by AI from today's figures; every number is checked against the data". The pipeline wrote
 * it for the window of its own build (to its as_of) and checked its numbers against that build's facts; the console shows the live figures
 * of its own window beside it. hunt2-ops-12: a summary of the week to 6 Nov said "more incidents than the previous period" beside
 * the live week's "78% fewer". Since 26 Nov 2026 the console's Daily is the calendar day from 12 AM, while the pipeline's is the 24 hours to
 * its build: a stored daily summary is of the same window only around midnight, so it is all but never shown and the live figures are.
 *
 * So a stored summary is shown as today's only when
 *   1. it is the summary of the console's window: its as_of is the console's now, within a twentieth of the period (at least 2 hours, as
 *      builds run hourly and the notes take a few minutes to write), and it begins where the console's window begins (`from`);
 *   2. every claim of a rise or a fall it makes, clause by clause, about all incidents or about severe ones, agrees with the live change of
 *      that figure (a percentage it states must be that change; "about the same" is within 5%; "sharply", "doubled", "halved" need a
 *      change that size); a clause that says both ways, or a percentage it cannot place, keeps it off;
 *   3. every figure it states (in digits or in words) is the live figure of the noun it counts ("22 severe" must be the live severe
 *      count, not the previous day's or the overdue count); a figure with no noun must be one of the live figures (dates, warning levels
 *      and durations aside).
 * Otherwise the rule-based headline, always current, is shown. The Tamil text is the same summary translated: it is kept only when its
 * digits are the English ones and it says the same way (more, fewer, about the same) as the English. Pure: no database.
 */

/** The live figures shown with the briefing. `prev*` are the previous period's. Any may be null (not shown on that page). */
export interface LiveFacts {
  reported: number; prev: number | null; severe?: number | null; prevSevere?: number | null; open?: number | null; overdue?: number | null;
  multi?: number | null; newsOnly?: number | null; complaints?: number | null; deaths?: number | null; injured?: number | null; awaiting?: number | null;
}
export interface StoredOpening { asOf: string | null; en: string | null; ta: string | null }
export interface LiveBrief {
  /** the console's now, and the length in hours of the window the pipeline writes this period's summary for (its as_of back) */
  now: string;
  hours: number;
  /** where the live figures' window begins (IST), when it is not `hours` back from now: Daily's 12 AM */
  from?: string | null;
  facts: LiveFacts;
  /** other figures on the page a summary may state without a noun the checker knows */
  extra?: number[];
  /**
   * 27 Nov: the window's incidents with deaths or injuries, with their places: "violent crimes resulting in 1 death in Kellys" states one
   * incident's figure, not the district's (3 deaths), and holds when an incident of the window at a place the clause names has that many
   */
  incidents?: { places: (string | null | undefined)[]; dead?: number | null; injured?: number | null }[];
}
export interface CheckedOpening { opening: { en: string; ta: string | null } | null; why: string | null }

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
const ms = (t: string) => Date.parse(t.trim().slice(0, 19).replace(" ", "T") + "Z");
const pct = (a: number | null | undefined, b: number | null | undefined) => (a != null && b ? Math.round(((a - b) / b) * 1000) / 10 : null);

// ------------------------------------------------------------------ figures --

const UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
  "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
/** "twelve" -> "12", "twenty-two" -> "22", "a hundred" -> "100": numbers written as words are checked as figures too. */
function wordsToDigits(t: string): string {
  const unit = UNITS.join("|"), ten = TENS.filter(Boolean).join("|");
  return t
    .replace(new RegExp(`\\b(${ten})(?:[ -](one|two|three|four|five|six|seven|eight|nine))?\\b`, "gi"),
      (_m, a: string, b?: string) => String(TENS.indexOf(a.toLowerCase()) * 10 + (b ? UNITS.indexOf(b.toLowerCase()) : 0)))
    .replace(new RegExp(`\\b(${unit})\\b`, "gi"), (m: string) => String(UNITS.indexOf(m.toLowerCase())))
    .replace(/\ba (hundred|thousand)\b/gi, (_m, w: string) => (w.toLowerCase() === "hundred" ? "100" : "1000"));
}

/**
 * "one" that is no number: "the previous one", "this one", "each one", "one of the ...", "one another", "one-off". 27 Nov: "This period saw
 * more incidents than the previous one." was kept off the Overview as "1 is not a live figure" (the hosted log, every refresh from 22:35).
 */
const PRONOUN_ONE = /\b(the|this|that|previous|prior|last|earlier|preceding|next|each|every|no|any|another|same|latest|other)\s+one\b(?!\s*(?:%|per ?cent)|\s+(?:more\s+)?(?:incidents?|cases?|deaths?|dead|injur\w*|reports?|persons?|people|severe|complaints?|items?|matters?|events?)\b)/gi;
const notANumber = (t: string): string => t
  // (27 Nov review) unless what follows it in its clause is what the checker counts: "the one man killed" is a death figure, and it went
  // unchecked beside the live 2; "no one was hurt" is 0 injured
  .replace(PRONOUN_ONE, (m: string, det: string, at: number, all: string) => (countsNext(all.slice(at + m.length)) ? (/^no$/i.test(det) ? `${det} 0` : m) : det))
  .replace(/\bone\s+(?=of\b|another\b)/gi, "").replace(/\bone-(?=off\b|time\b|way\b|stop\b|sided\b)/gi, "single-");
/** Does the rest of a clause begin with a noun a figure there would count (the checker's own NOUNS)? */
const countsNext = (rest: string): boolean => {
  const r = rest.split(/[.,;:!?]|\s+(?:while|whereas|though|although|but|with|and|yet)\s+/i)[0].trim();
  return !!r && NOUNS.some(([re]) => re.test(r));
};

/** The text with what is not a figure taken out: dates, times, warning levels, durations ("24 hours", "the past 7 days"). */
function figureText(text: string): string {
  return wordsToDigits(notANumber(text))
    .replace(/\b\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}\s*(?:am|pm)?\b/gi, " ")
    .replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\b`, "gi"), " ")
    .replace(new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "gi"), " ")
    .replace(/\blevel\s+\d\b/gi, " ")
    .replace(/\b\d+\s*(?:-\s*)?(?:hours?|hrs?|h|days?|weeks?|months?|years?)\b/gi, " ");
}

/** The figures a text states (digits or words), dates, levels and durations aside. */
export function statedFigures(text: string): number[] {
  return (figureText(text).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => Number(x.replace(/,/g, ""))).filter((v) => Number.isFinite(v));
}

type FactKey = keyof LiveFacts;
/** The noun after a figure says which live figure it is; the first match in the next few words wins. */
const NOUNS: [RegExp, FactKey, FactKey | null][] = [
  [/^(?:\S+\s+){0,3}?(?:deaths?|dead|killed|died|lives)\b/i, "deaths", null],
  [/^(?:\S+\s+){0,3}?(?:injur\w*|hurt)\b/i, "injured", null],
  [/^(?:\S+\s+){0,3}?severe\b/i, "severe", "prevSevere"],
  [/^(?:\S+\s+){0,4}?(?:overdue|past\s+(?:the|their|its)\s+deadline|late)\b/i, "overdue", null],
  [/^(?:\S+\s+){0,5}?(?:news|unrecorded|media)\b/i, "newsOnly", null],
  [/^(?:\S+\s+){0,5}?(?:sources)\b/i, "multi", null],
  [/^(?:\S+\s+){0,3}?(?:await\w*|wait\w*|to check|verification)\b/i, "awaiting", null],
  [/^(?:\S+\s+){0,3}?(?:still\s+)?(?:open|unresolved|pending)\b/i, "open", null],
  [/^(?:\S+\s+){0,3}?(?:complaints?|grievances?|petitions?)\b/i, "complaints", null],
  [/^(?:\S+\s+){0,3}?(?:incidents?|reports?|cases?|events?|matters?|items?)\b/i, "reported", "prev"]
];
const PREVIOUS = /\b(previous|prior|yesterday|last (?:day|week|month|quarter)|the day before|before)\b/i;

// ------------------------------------------------------------------- claims --

type Way = "more" | "fewer" | "same" | "not-more" | "not-fewer";
const SAME = /\b(?:about|roughly|nearly|much|largely|broadly) the same\b|\bsimilar (?:number|level|volume|count)s?\b|\bsame (?:number|level)\b|\bunchanged\b|\bsteady\b|\bstable\b|\bflat\b|\bno (?:real |significant )?change\b|\bin line with\b|\bon par with\b/i;
const MORE = /\b(?:more|higher|increase[sd]?|increasing|rise|rises|rose|risen|rising|climb(?:ed|ing|s)?|soar(?:ed|ing|s)?|jump(?:ed|s)?|surge[sd]?|surging|grew|grow(?:n|s|th|ing)?|doubl(?:ed|e|ing)|tripl(?:ed|e)|twice|spike[sd]?|upswing|uptick|(?:went|gone|is|are|was|were)\s+up|upward)\b/i;
const FEWER = /\b(?:fewer|less|lower|decrease[sd]?|decreasing|decline[sd]?|declining|fell|fall|falls|fallen|falling|drop(?:ped|s)?|dip(?:ped|s)?|plunge[sd]?|plunging|halv(?:ed|e|ing)|half|shr[ai]nk|(?:went|gone|is|are|was|were)\s+down|downward|eased?)\b/i;
const STRONG = /\b(?:sharp(?:ly)?|steep(?:ly)?|significant(?:ly)?|considerabl[ey]|dramatic(?:ally)?|substantial(?:ly)?|soar\w*|surg\w*|plung\w*|jump\w*|spike\w*)\b/i;
const NEG = /\b(?:not|no|never|neither|nor)\b|n't\b/i;

/** Clauses: a sentence cut at punctuation and at the words that start another claim ("..., with more severe cases", "while ..."). */
function clauses(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).flatMap((s) => s.split(/[,;:]|\s+(?:while|whereas|though|although|but|with|and|yet)\s+/i)).map((c) => c.trim()).filter(Boolean);
}

/** What a clause is about: all incidents, severe ones, or something the briefing has no live change for (a category, the news). */
function subjectOf(c: string): "total" | "severe" | null {
  if (/\bsevere\b/i.test(c)) return "severe";
  if (/\bcategor|\btypes? of\b|\bkinds? of\b/i.test(c)) return null;
  // "the past 24 hours remained about the same as the previous day": a comparison with the previous period that names nothing else
  return /\b(?:incidents?|reports?|cases|matters|events|number of)\b/i.test(c) || PREVIOUS.test(c) ? "total" : null;
}

function wayOf(c: string): { ways: Way[]; strong: boolean; times: number | null } {
  const ways: Way[] = [];
  const neg = NEG.test(c);
  if (SAME.test(c)) ways.push("same");
  if (MORE.test(c)) ways.push(neg ? "not-more" : "more");
  if (FEWER.test(c)) ways.push(neg ? "not-fewer" : "fewer");
  const times = /\b(?:doubl\w*|twice)\b/i.test(c) ? 100 : /\btripl\w*\b/i.test(c) ? 200 : /\bhalv\w*|\bhalf\b/i.test(c) ? -50 : null;
  return { ways, strong: STRONG.test(c), times };
}

function agrees(w: Way, change: number | null, strong: boolean, times: number | null): boolean {
  if (change == null) return false;
  if (times != null) return times > 0 ? change >= times * 0.8 : change <= times * 0.8;
  if (w === "same") return Math.abs(change) <= 5;
  if (w === "not-more") return change <= 5;
  if (w === "not-fewer") return change >= -5;
  if (strong && Math.abs(change) < 10) return false;
  return w === "more" ? change > 0 : change < 0;
}

/** The comparisons with the previous period a text makes: one entry per clause with a way and a subject. */
export function claimedChanges(text: string): { subject: "total" | "severe"; ways: Way[] }[] {
  return clauses(text).map((c) => ({ subject: subjectOf(c), ...wayOf(c) }))
    .filter((x): x is { subject: "total" | "severe"; ways: Way[]; strong: boolean; times: number | null } => !!x.subject && x.ways.length > 0)
    .map(({ subject, ways }) => ({ subject, ways }));
}

/** a place's own words (four letters or more, the generic ones of a street or an area aside), lower case */
const GENERIC_PLACE = new Set(["road", "street", "nagar", "main", "salai", "colony", "area", "near", "opposite", "junction", "lane", "cross", "east", "west", "north",
  "south", "chennai", "zone", "ward", "taluk", "district", "city", "high", "first", "second", "third", "extension", "layout", "avenue", "bridge", "station", "police"]);
const placeWords = (p: string): string[] => p.toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length >= 4 && !GENERIC_PLACE.has(w));
/** Does the clause name a place of one of these incidents with exactly `v` deaths (or injured)? */
function incidentFigure(c: string, v: number, key: "deaths" | "injured", incidents: NonNullable<LiveBrief["incidents"]>): boolean {
  const words = new Set(c.toLowerCase().split(/[^\p{L}]+/u));
  return incidents.some((i) => Number(key === "deaths" ? i.dead : i.injured) === v && i.places.some((p) => !!p && placeWords(p).some((w) => words.has(w))));
}

/** Why the English text does not say what the live figures say, or null when every claim and figure holds. */
function contradiction(en: string, f: LiveFacts, extra: number[], incidents: NonNullable<LiveBrief["incidents"]> = []): string | null {
  const change = { total: pct(f.reported, f.prev), severe: pct(f.severe, f.prevSevere) };
  const all = new Set([...Object.values(f), ...extra].filter((v): v is number => typeof v === "number"));
  for (const c of clauses(en)) {
    const subject = subjectOf(c), { ways, strong, times } = wayOf(c);
    const t = figureText(c);
    // a percentage is a change: it must be the live change of the clause's subject, in the clause's way
    for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|per ?cent)/gi)) {
      const v = Number(m[1]), ch = subject ? change[subject] : null;
      if (ch == null || Math.abs(Math.abs(ch) - v) >= 1) return `"${c}": ${v}% is not the live change${ch == null ? "" : ` (${Math.round(ch)}%)`}`;
    }
    if (ways.length) {
      if (!subject) continue; // a category or the news rising: the briefing has no live change to hold it to
      if (ways.length > 1) return `"${c}" says both ways`;
      const ch = change[subject];
      if (!agrees(ways[0], ch, strong, times)) return `"${c}" beside a live ${subject === "severe" ? "severe " : ""}change of ${ch == null ? "unknown" : `${Math.round(ch)}%`}`;
    }
    // a figure is the live figure of the noun it counts; one with no noun the checker knows must be one of the live figures
    const prev = PREVIOUS.test(c);
    for (const m of t.matchAll(/(\d[\d,]*(?:\.\d+)?)(?!\s*(?:%|per ?cent))/gi)) {
      const v = Number(m[1].replace(/,/g, "")), after = t.slice((m.index ?? 0) + m[0].length).trim();
      const hit = NOUNS.find(([re]) => re.test(after));
      if (hit) {
        const key = prev && hit[2] ? hit[2] : hit[1];
        const live = f[key];
        if ((key === "deaths" || key === "injured") && live !== v && !prev && incidentFigure(c, v, key, incidents)) continue;
        if (live == null || live !== v) return `"${c}": ${v} is not the live ${String(key)} figure${live == null ? "" : ` (${live})`}`;
      } else if (!all.has(v)) return `"${c}": ${v} is not a live figure`;
    }
  }
  return null;
}

/** The way a Tamil summary's comparison says it went: the first clause that compares with the previous period. */
function tamilWay(ta: string): Way | null {
  for (const s of ta.split(/(?<=[.!?।])\s+/)) {
    if (!/முந்தைய|விட|ஒப்பி/.test(s)) continue;
    if (/அதே|ஏறக்குறைய|மாற்றமில்லை|நிலையாக/.test(s)) return "same";
    if (/அதிக|கூடுதல்|உயர்|பெருக/.test(s)) return "more";
    if (/குறை|சரிவு|வீழ்ச்சி/.test(s)) return "fewer";
  }
  return null;
}

declare global {
  // eslint-disable-next-line no-var
  var __openingLogged: Map<string, number> | undefined;
}
/** how long a reason already logged stays quiet */
export const LOG_AGAIN_MS = 6 * 3_600_000;
/**
 * 27 Nov: true the first time a reason is given for `tag` (then again after LOG_AGAIN_MS): the hosted log repeated the same "AI opening not
 * shown" line on every refresh of the Overview (more than 60 times in an evening). The check runs every time; only the log is quieter.
 */
export function firstTimeWhy(tag: string, why: string, now: number = Date.now()): boolean {
  const m = (globalThis.__openingLogged ??= new Map());
  const k = `${tag}|${why}`, at = m.get(k);
  if (at != null && now - at < LOG_AGAIN_MS) return false;
  m.set(k, now);
  if (m.size > 200) for (const key of [...m.keys()].slice(0, m.size - 200)) m.delete(key);
  return true;
}

export function checkOpening(s: StoredOpening, live: LiveBrief): CheckedOpening {
  const en = (s.en ?? "").trim();
  if (!en) return { opening: null, why: null };
  const at = s.asOf ? ms(String(s.asOf)) : NaN, now = ms(live.now);
  if (!Number.isFinite(at) || !Number.isFinite(now)) return { opening: null, why: "the stored summary has no window to compare" };
  const slackH = Math.max(2, live.hours / 20);
  if (Math.abs(now - at) / 3_600_000 > slackH) {
    return { opening: null, why: `written for the window to ${String(s.asOf).slice(0, 16)}, not the console's window to ${live.now.slice(0, 16)}` };
  }
  const start = live.from ? ms(live.from) : NaN, began = at - live.hours * 3_600_000;
  if (Number.isFinite(start) && Math.abs(began - start) / 3_600_000 > slackH) {
    return { opening: null, why: `counts the ${live.hours} hours to ${String(s.asOf).slice(0, 16)}, not the console's window from ${String(live.from).slice(0, 16)}` };
  }
  const wrong = contradiction(en, live.facts, live.extra ?? [], live.incidents ?? []);
  if (wrong) return { opening: null, why: wrong };
  // the Tamil: the same digits as the English, and the same way for all incidents
  const digits = (t: string) => (t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => Number(x.replace(/,/g, "")));
  const enFigs = new Set(digits(en));
  const enWay = claimedChanges(en).find((x) => x.subject === "total")?.ways[0] ?? null;
  const taWay = s.ta ? tamilWay(s.ta) : null;
  const ta = s.ta && digits(s.ta).every((v) => enFigs.has(v)) && (taWay == null || taWay === enWay) ? s.ta : null;
  return { opening: { en, ta }, why: null };
}
