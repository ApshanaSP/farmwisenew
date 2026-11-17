/**
 * v7: the grounding checker. Every sentence the answer writer (writer.ts) produces is checked here, in code, before a word of it is
 * spoken. A sentence cites the facts it rests on ("[F2,F5]", facts.ts numbers them); it passes only when everything it claims is in
 * THOSE facts:
 *   numbers      every figure (digits, English and Tamil number words, lakh and crore, percentages) is a value of a cited fact,
 *                exactly, or hedged ("about forty", "over thirty", "கிட்டத்தட்ட") within a stated tolerance; "twice", "half",
 *                "three times" only against a ratio code computed for a cited fact;
 *   names        every district name (zone, department, place, taluk, reservoir, outlet, body: gazetteer.ts) and every other
 *                capitalised name is in a cited fact, and a name and the figure said with it sit in the SAME fact (the binding
 *                check: "Adyar has 38" fails when 38 is Teynampet's);
 *   times        every time word (today, yesterday evening, last week, a weekday, a month, a clock time, in English and spoken
 *                Tamil) is one code put in a cited fact;
 *   claims       a cause word only where a cited fact states a cause; a direction word ("rose", "fell") not against the cited
 *                facts' direction; a superlative only against a rank; "none", "no officer" only against a zero or a "no";
 *                no speculation ("probably", "likely");
 *   speech       no id, field label, markdown, link or code; no run of seven words copied from what the screen shows; no list of
 *                three or more places in a sentence; at most 32 words; a Tamil answer in Tamil.
 * Pure and synchronous: the writer calls it per sentence while the model is still writing the next one.
 * (Research: docs/jarvis/v7-research/10-grounding.md recs 2, 4, 5; 50-evaluation.md rec 1.)
 */
import { isEnglishWord } from "../english";
import { figuresIn, type Figure } from "../numbergate";
import { copiedRun, labelIn } from "../speechcheck";
import type { Lang } from "../types";
import { phonetic } from "../xlit";
import { aliasesOf, namesIn, type Gazetteer, type NameHit } from "./gazetteer";

export interface Fact7 {
  /** "F1", "F2", ... */
  id: string;
  /** the fact as one plain English line: what the model reads, and what the checker reads its values off */
  text: string;
  /** where it comes from: "dashboard", an outlet's name, or "web:<site>" */
  src: string;
  /** figures that are the fact's own beyond those in its text */
  nums?: number[];
  /** names in other forms (the Tamil forms of its zones, departments and outlets) */
  names?: string[];
  /** the time phrases code computed for it, English and Tamil ("since yesterday evening", "நேற்று மாலையிலிருந்து") */
  times?: string[];
  /** ratios code computed (a over b) for "twice", "half" */
  ratios?: number[];
  /** the direction of the change it states */
  dir?: "up" | "down" | null;
  /** it states a rank or an extreme (the highest, the most) */
  rank?: boolean;
  /** it states a cause in the record's or the outlet's own words */
  cause?: boolean;
}

export interface Sheet7 {
  facts: Fact7[];
  lang: Lang;
  /** what the screen shows in words (titles, headlines): an answer must not read them out */
  shown: string[];
  gaz: Gazetteer;
  /**
   * the screen's scope (the place and window its title and scope name: "Why · Adyar · this week"): true of every fact on it, so any sentence may
   * say it, and a figure said with the scope's place needs no fact that names the place again
   */
  scope?: { names: string[]; times: string[] };
}

export type ProblemKind = "number" | "misbound" | "multiplier" | "name" | "time" | "cause" | "direction" | "superlative" | "absolute" | "speculation"
  | "label" | "markup" | "copy" | "list" | "length" | "language" | "cite" | "uncited" | "empty";
export interface Problem { kind: ProblemKind; detail: string }
export interface Checked { ok: boolean; problems: Problem[]; text: string }

// ------------------------------------------------------------------ facts, prepared once a sheet --

interface Prepared { f: Fact7; nums: number[]; keys: Set<string>; low: string; atoms: Set<string>; ratios: number[] }
const prepCache = new WeakMap<Sheet7, Map<string, Prepared>>();

const lowWords = (s: string) => ` ${s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}%]+/gu, " ").trim()} `;

function prepared(sheet: Sheet7): Map<string, Prepared> {
  let m = prepCache.get(sheet);
  if (m) return m;
  m = new Map();
  for (const f of sheet.facts) {
    const all = [f.text, ...(f.names ?? []), ...(f.times ?? [])].join(" ; ");
    const nums = [...figuresIn(all).map((x) => x.value).filter(Number.isFinite), ...(f.nums ?? [])];
    // a ratio a fact's own pair of figures implies ("26 against 8"): code's arithmetic, not the model's
    const ratios = [...(f.ratios ?? [])];
    m.set(f.id, { f, nums, keys: new Set(namesIn(all, sheet.gaz).map((h) => h.key)), low: lowWords(all), atoms: timeAtoms(all), ratios });
  }
  prepCache.set(sheet, m);
  return m;
}

// ------------------------------------------------------------------ the writer's lines --

/** "S: Standing water at Guindy since yesterday. [F1,F3]" -> the sentence and its citations; the cites are never spoken */
export function parseLine(line: string): { text: string; cites: string[] } {
  const l = line.replace(/^\s*(?:S\s*[:：]|[-*•]\s+|\d+[.)]\s+)/u, "").trim();
  const cites: string[] = [];
  const text = l.replace(/\s*[[(（【]\s*((?:F\d{1,3}\s*[,;]?\s*)+)[\])）】]/giu, (_, ids: string) => { for (const id of ids.match(/F\d{1,3}/gi) ?? []) cites.push(id.toUpperCase()); return " "; })
    .replace(/\s+([.?!,;:।])/g, "$1").replace(/\s{2,}/g, " ").trim();
  return { text, cites: [...new Set(cites)] };
}

// ------------------------------------------------------------------ numbers --

const HEDGE_ABOUT = /(?:about|around|nearly|almost|roughly|approximately|close to|some|just over|just under|kittathatta|சுமார்|சுமாராக|கிட்டத்தட்ட|ஏறக்குறைய|ஏறத்தாழ)\s*$/iu;
const HEDGE_OVER = /(?:over|more than|above|upwards of|at least|மேல்)\s*$/iu;
const HEDGE_UNDER = /(?:under|fewer than|less than|below|almost|nearly|up to)\s*$/iu;
/** Tamil puts "over" after the number: "முப்பதுக்கும் மேல்", "முப்பதுக்கு மேல்" */
const TA_OVER_AFTER = /^\s*(?:க்கும்|க்கு|கும்|ுக்கும்)?\s*(?:மேல்|மேற்பட்ட|அதிகமான)/u;
const MULT_WORDS: [RegExp, number][] = [
  [/^(?:twice|double[ds]?|two times|two-fold|twofold)$/i, 2], [/^(?:half|halved)$/i, 0.5], [/^(?:triple[ds]?|thrice|three times|three-fold|threefold)$/i, 3],
  [/^(?:four times|fourfold|quadruple[ds]?)$/i, 4]
];
const MULT_TA: [RegExp, number][] = [[/இரண்டு\s*மடங்கு|ரெண்டு\s*மடங்கு|இரு\s*மடங்கு|இரட்டிப்பு|இரட்டிப்பா/u, 2], [/மூன்று\s*மடங்கு|மும்மடங்கு/u, 3], [/நான்கு\s*மடங்கு/u, 4], [/பாதி(?:யாக|யா)?\b/u, 0.5]];
const MULT_EN = /\b(?:twice|double[ds]?|two times|twofold|half|halved|triple[ds]?|thrice|three times|threefold|four times|fourfold|quadruple[ds]?)\b/gi;

/** a figure a fact allows: exact, or hedged within its tolerance */
function allows(nums: number[], v: number, hedge: "about" | "over" | "under" | null): boolean {
  for (const n of nums) {
    if (n === v || Math.abs(n - v) < 1e-9) return true;
    // a decimal said rounded ("13.6 mm" as "about fourteen")
    if (!Number.isInteger(n) && Math.round(n) === v) return true;
    if (hedge === "about" && Math.abs(n - v) <= Math.max(1, 0.15 * Math.abs(n))) return true;
    if (hedge === "over" && n > v && n <= v * 1.35 + 1) return true;
    if (hedge === "under" && n < v && n >= v * 0.8 - 1) return true;
  }
  return false;
}

interface Placed { fig: Figure; at: number; hedge: "about" | "over" | "under" | null }
/** the figures of a sentence, each with where it sits and its hedge */
function placedFigures(s: string): Placed[] {
  const out: Placed[] = [];
  const low = s.toLowerCase();
  // figuresIn lists digits before words, not in reading order: each figure is found on its own, never at a place another took
  const used = new Set<number>();
  for (const fig of figuresIn(s)) {
    if (!Number.isFinite(fig.value)) continue;
    if (MULT_WORDS.some(([re]) => re.test(fig.raw.trim()))) continue;
    let i = low.indexOf(fig.raw.toLowerCase());
    while (i >= 0 && used.has(i)) i = low.indexOf(fig.raw.toLowerCase(), i + 1);
    const at = Math.max(0, i);
    if (i >= 0) used.add(i);
    const before = s.slice(Math.max(0, at - 24), at);
    const after = s.slice(at + fig.raw.length, at + fig.raw.length + 20);
    const hedge = HEDGE_ABOUT.test(before) ? "about" : HEDGE_OVER.test(before) || TA_OVER_AFTER.test(after) ? "over" : HEDGE_UNDER.test(before) ? "under" : null;
    out.push({ fig, at, hedge });
  }
  return out;
}

// ------------------------------------------------------------------ time words --

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const TA_WEEKDAY: [RegExp, string][] = [[/ஞாயிறு|ஞாயிற்று/u, "sunday"], [/திங்கள்|திங்கட்/u, "monday"], [/செவ்வாய்/u, "tuesday"], [/புதன்/u, "wednesday"], [/வியாழ/u, "thursday"], [/வெள்ளிக்கிழமை|வெள்ளியன்று/u, "friday"], [/சனிக்கிழமை|சனியன்று/u, "saturday"]];
const TA_ATOMS: [RegExp, string][] = [
  [/இன்று|இன்னைக்கு|இன்னிக்கு|இன்றைய/u, "today"], [/நேற்று|நேத்து|நேற்றைய/u, "yesterday"], [/நாளை|நாளைக்கு/u, "tomorrow"],
  [/அதிகாலை/u, "early"], [/காலை/u, "morning"], [/மதிய|மத்தியான/u, "afternoon"], [/மாலை|சாயங்கால/u, "evening"], [/இரவு|ராத்திரி|ராத்திரி/u, "night"],
  [/(?:இந்த|இந்தப்)\s*வார/u, "this-week"], [/(?:போன|கடந்த|முந்தைய|முந்தின)\s*வார/u, "last-week"], [/(?:அடுத்த)\s*வார/u, "next-week"],
  [/(?:இந்த|இந்தப்)\s*மாத/u, "this-month"], [/(?:போன|கடந்த|முந்தைய)\s*மாத/u, "last-month"], [/(?:அடுத்த)\s*மாத/u, "next-month"],
  [/(?:இந்த|இந்தப்)\s*(?:வருட|ஆண்டு)/u, "this-year"], [/(?:போன|கடந்த)\s*(?:வருட|ஆண்டு)/u, "last-year"]
];
const TA_MONTHS: [RegExp, string][] = [[/ஜனவரி/u, "january"], [/பிப்ரவரி/u, "february"], [/மார்ச்/u, "march"], [/ஏப்ரல்/u, "april"], [/ஜூன்/u, "june"], [/ஜூலை/u, "july"], [/ஆகஸ்ட்/u, "august"], [/செப்டம்பர்/u, "september"], [/அக்டோபர்/u, "october"], [/நவம்பர்/u, "november"], [/டிசம்பர்/u, "december"]];

/**
 * The time words of a text as canonical atoms: "today", "yesterday", "morning", "this-week", "last-week", a weekday, a month, a clock time.
 * "the week before", "the 7 days before" and "the period before" read as last-week; "the last 24 hours" as today-window.
 */
export function timeAtoms(text: string): Set<string> {
  const t = text.normalize("NFC");
  const low = ` ${t.toLowerCase()} `;
  const out = new Set<string>();
  for (const w of ["today", "tonight", "yesterday", "tomorrow", "morning", "afternoon", "evening"]) if (new RegExp(`\\b${w}\\b`).test(low)) out.add(w === "tonight" ? "night" : w);
  if (/\b(?:night|overnight)\b/.test(low)) out.add("night");
  if (/\b(?:early this|early yesterday|small hours)\b/.test(low)) out.add("early");
  for (const u of ["week", "month", "year", "quarter"]) {
    if (new RegExp(`\\bthis (?:past )?${u}\\b`).test(low)) out.add(`this-${u}`);
    if (new RegExp(`\\b(?:last|past|previous|prior) ${u}\\b|\\bthe ${u} before\\b|\\ba ${u} ago\\b`).test(low)) out.add(`last-${u}`);
    if (new RegExp(`\\b(?:next|coming) ${u}\\b`).test(low)) out.add(`next-${u}`);
  }
  if (/\bthe (?:\d+|seven|thirty) days before\b|\bthe period before\b|\bthe window before\b|\bthe \d+ hours before\b|\bthe 24 hours before\b/.test(low)) out.add("before-window");
  if (/\b(?:the )?(?:last|past) (?:24|twenty[- ]four) hours\b/.test(low)) out.add("last-24h");
  // the console's windows: "the last 7 days" is this week, "the last 30 days" this month (screens.ts windowWords)
  if (/\b(?:the )?(?:last|past) (?:7|seven) days\b/.test(low)) out.add("this-week");
  if (/\b(?:the )?(?:last|past) (?:30|thirty) days\b/.test(low)) out.add("this-month");
  for (const d of WEEKDAYS) if (new RegExp(`\\b${d}s?\\b`).test(low)) out.add(d);
  for (const mo of MONTHS) if (mo !== "may" ? new RegExp(`\\b${mo}\\b|\\b${mo.slice(0, 3)}\\b(?= \\d)|(?<=\\d )${mo.slice(0, 3)}\\b`).test(low) : /\bmay \d|\d may\b/.test(low)) out.add(mo);
  for (const m of low.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s?(am|pm|a\.m\.|p\.m\.)/g)) out.add(`clock:${m[1]}:${m[2] ?? "00"}${m[3][0]}`);
  for (const [re, a] of TA_ATOMS) if (re.test(t)) out.add(a);
  for (const [re, a] of TA_WEEKDAY) if (re.test(t)) out.add(a);
  for (const [re, a] of TA_MONTHS) if (re.test(t)) out.add(a);
  return out;
}
/** atoms a fact's wording covers for another: a window "before" covers last-week/last-month; the last 24 hours covers today */
function covered(atom: string, have: Set<string>): boolean {
  if (have.has(atom)) return true;
  if (/^last-(?:week|month|quarter|year)$/.test(atom) && have.has("before-window")) return true;
  if (atom === "today" && have.has("last-24h")) return true;
  if (atom === "before-window" && [...have].some((a) => a.startsWith("last-"))) return true;
  return false;
}

// ------------------------------------------------------------------ word lists --

const CAUSE_EN = /\b(?:because|due to|caused|causing|cause of|as a result|resulted in|results in|led to|leads to|leading to|owing to|thanks to|on account of|triggered|blamed?)\b/i;
const CAUSE_TA = /காரணமாக|காரணம்|ஏனெனில்|ஏன்னா|என்பதால்|விளைவாக|ஆனதால்/u;
const UP_EN = /\b(?:rose|risen|rising|rises|increased?|increases|increasing|grew|grown|growing|jump(?:ed|s)?|spiked?|spikes|surged?|surges|climb(?:ed|ing|s)?|doubled|tripled|went up|gone up|worsen(?:ed|ing)?|on the rise)\b/i;
const DOWN_EN = /\b(?:fell|fallen|falling|falls|dropp(?:ed|ing)|drops|decreased?|decreases|decreasing|declin(?:e|ed|ing|es)|eased|easing|halved|went down|gone down|improv(?:ed|ing))\b/i;
const UP_TA = /அதிகரித்|அதிகரிச்|உயர்ந்|கூடியிருக்|கூடி(?:ய|ருக்|ச்)|அதிகமாகியிருக்/u;
const DOWN_TA = /குறைந்|குறைஞ்|சரிந்|இறங்கி|குறைவாகியிருக்/u;
const SUPER_EN = /\b(?:worst|highest|biggest|largest|top|least|lowest|fewest|best|slowest|fastest|busiest|maximum|minimum)\b|\bthe most\b|\bmost (?:complaints|incidents|cases|reports|open|severe|overdue)\b/i;
const SUPER_TA = /மிக அதிக|அதிகபட்ச|முதலிட|மிகக் குறைந்த|மிகவும் மோசம|மிக மோசம|மிகப்பெரிய|மிக மெதுவா/u;
const ABSOLUTE_EN = /\b(?:none|nobody|no one|zero|not a single|not one)\b|\bno (?:cases?|incidents?|complaints?|reports?|officers?|officials?|deaths?|injur\w*|casualt\w*|department|action|update|progress)\b/i;
const NEGATION_IN_FACT = /\b(?:0|no|none|nothing|not|zero|never|without)\b|இல்லை|எதுவும்/u;
const SPECULATION_EN = /\b(?:probably|likely|unlikely|presumably|apparently|perhaps|maybe|i think|i believe|i guess|i suspect|seems?|seemingly|must have|might have|may have|could have|bound to)\b/i;
const SPECULATION_TA = /இருக்கலாம்|போலிருக்கு|போலத் தெரிகிறது|என்று நினைக்கிறேன்|வாய்ப்பு அதிகம்/u;
const ADVICE = /\b(?:i'd|i would|you (?:may|might|could) want|worth|suggest|consider|ask(?:ing)? (?:them|the|for|metro|pwd)|call|chase|push|a word with|would (?:move|help|get|speed)|it would help|follow(?:ing)? up)\b|கேட்கலாம்|சொல்லலாம்|பார்க்கலாம்|பேசலாம்|நல்லது|சொன்னால்|கேட்டால்/iu;
/** time words a suggestion may use of its own: when to act, never when something happened */
const FORWARD = new Set(["today", "tomorrow", "night", "evening", "this-week", "this-month", "next-week"]);
const MARKUP = /[*_#`|<>{}×÷=]|^\s*[-•]\s|\bhttps?:\/\/|\bwww\.|\.(?:com|in|org)\b/i;
/** capitalised words that are no claim: the persona, the district, sentence furniture */
const PLAIN_CAPS = new Set(["i", "i'd", "i'll", "i'm", "i've", "collector", "jarvis", "chennai", "tamil", "nadu", "district", "corporation", "ok", "okay", "ist", "want", "shall", "should", "nothing", "no"]);

/** a time unit right after a figure: the figure is a window's length */
const WINDOW_UNIT = /^\s*-?\s*(?:hours?|days?|weeks?|months?|மணி|நாள்|நாட்|நாளி|வார|மாத)/iu;
/** plain words of one or two letters a sentence may start with */
const SHORT_PLAIN = new Set(["a", "an", "it", "is", "in", "on", "at", "as", "so", "no", "if", "or", "by", "to", "of", "up", "we", "he", "my", "do", "be", "go", "us", "ok"]);
const tamilShare = (s: string) => {
  const letters = s.match(/\p{L}/gu)?.length ?? 0;
  const ta = s.match(/[஀-௿]/gu)?.length ?? 0;
  return letters ? ta / letters : 0;
};
const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
/** edit distance at most one (a name's English spelling against a Tamil word's romanised key: Thiruvottiyur, திருவொற்றியூர்) */
function oneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}
/** is this name (its phonetic key) the English spelling of one of these Tamil words (their keys), allowing a case ending on the Tamil word */
function spelledFrom(key: string, taKeys: string[]): boolean {
  if (key.length < 4) return false;
  return taKeys.some((w) => oneEdit(key, w) || (w.startsWith(key) && w.length - key.length <= 4) || (key.length >= 6 && oneEdit(key, w.slice(0, key.length))));
}
/** the clause around a position: commas, semicolons, colons, dashes and "and/but/while/against" end it */
function clauseStart(s: string, at: number): number {
  const before = s.slice(0, at);
  const m = [...before.matchAll(/[,;:–—]|\b(?:and|but|while|whereas|against|compared with|versus|vs)\b/gi)].pop();
  return m ? (m.index ?? 0) + m[0].length : 0;
}

// ------------------------------------------------------------------ the check --

/**
 * One sentence against the facts it cites. `text` is the sentence as it may be spoken (no citation marks). `soFar`: the places the
 * answer already named (an answer names at most three).
 */
export function checkSentence(line: string, sheet: Sheet7, soFar: Set<string> = new Set()): Checked {
  const { text, cites } = parseLine(line);
  const problems: Problem[] = [];
  const p = (kind: ProblemKind, detail: string) => problems.push({ kind, detail });
  if (!text) return { ok: false, problems: [{ kind: "empty", detail: "no sentence" }], text };
  const prep = prepared(sheet);
  const bad = cites.filter((c) => !prep.has(c));
  if (bad.length) p("cite", `unknown fact ${bad.join(", ")}`);
  // one report is one source: citing one of an outlet's sentences cites that report's others (never the dashboard's facts: those stay bound)
  const direct = cites.map((c) => prep.get(c)).filter((x): x is Prepared => !!x);
  const outlets = new Set(direct.map((c) => c.f.src).filter((s) => s !== "dashboard"));
  const cited = [...direct, ...[...prep.values()].filter((x) => !direct.includes(x) && outlets.has(x.f.src))];
  const others = [...prep.values()].filter((x) => !cites.includes(x.f.id));
  const lang = sheet.lang;

  // speech: labels, markup, length, language
  const label = labelIn(text);
  if (label) p("label", label);
  if (MARKUP.test(text)) p("markup", "markdown, a symbol or a link");
  const n = words(text).length;
  if (n > 32) p("length", `${n} words`);
  const share = tamilShare(text);
  if (lang === "ta" && share < 0.45) p("language", "not in Tamil");
  if (lang === "en" && share > 0.05) p("language", "Tamil in an English answer");

  // the screen's scope: its place and its window, true of every fact on it
  const scopeText = [...(sheet.scope?.names ?? []), ...(sheet.scope?.times ?? [])].join(" ; ");
  const scopeKeys = new Set(scopeText ? namesIn(scopeText, sheet.gaz).flatMap((h) => aliasesOf(h.key, sheet.gaz)) : []);
  const scopeAtoms = timeAtoms(scopeText);
  // names: the district's (bound to the cited facts, or the scope's), then any other capitalised word. A name two reference lists hold
  // (Thiruvottiyur is a zone and a taluk) is the same name in either
  const hits = namesIn(text, sheet.gaz);
  const has = (keys: Set<string>, key: string) => aliasesOf(key, sheet.gaz).some((k) => keys.has(k));
  const covered_ = (h: NameHit) => scopeKeys.has(h.key) || cited.some((c) => has(c.keys, h.key));
  for (const h of hits) if (!covered_(h)) p("name", `${h.form} is in no cited fact${others.some((o) => has(o.keys, h.key)) ? " (another fact has it)" : ""}`);
  const spans = hits.map((h) => [h.at, h.at + h.form.length] as const);
  const lowCited = `${cited.map((c) => c.low).join(" ")} ${lowWords(sheet.scope?.names.join(" ") ?? "")}`;
  // a Tamil word of the cited facts, as a name said in English would spell it (a report in Tamil, the answer in English)
  const taWords = cited.flatMap((c) => c.f.text.match(/[஀-௿]+/gu) ?? []).map((w) => phonetic(w)).filter((w) => w.length >= 3);
  // (letters right after a digit are an ordinal's or a unit's, "4Th Main Road", "10Km": no name)
  const tokens = [...text.matchAll(/(?<![\p{L}\p{M}\p{N}'’])[\p{Lu}][\p{L}\p{M}'’.-]*/gu)];
  for (const m of tokens) {
    const at = m.index ?? 0;
    if (spans.some(([a, b]) => at >= a && at < b)) continue;
    // a Latin name with a Tamil case ending ("Veeramaniக்கு") is the name
    const raw = m[0].replace(/[஀-௿].*$/u, "").replace(/[.'’-]+$/u, "").replace(/['’]s$/u, "");
    const w = raw.toLowerCase();
    if (!w || PLAIN_CAPS.has(w) || WEEKDAYS.includes(w) || MONTHS.includes(w)) continue;
    const first = text.slice(0, at).trim() === "" || /[.!?:"“]\s*$/.test(text.slice(0, at));
    // a sentence's first word is a name only if it is not plain English (the word list holds words of three letters or more; "A", "It", "So" are plain)
    if (first && lang === "en" && (isEnglishWord(w) || SHORT_PLAIN.has(w))) continue;
    if (lowCited.includes(` ${w} `) || lowCited.includes(` ${w.replace(/s$/, "")} `)) continue;
    if (spelledFrom(phonetic(raw), taWords)) continue;
    p("name", `"${raw}" is in no cited fact`);
  }
  // an answer names at most three places, and a sentence never lists three
  const places = new Set(hits.filter((h) => h.kind === "zone" || h.kind === "place" || h.kind === "taluk").map((h) => h.key));
  if (places.size >= 3) p("list", `${places.size} places in one sentence`);
  const answerPlaces = new Set([...soFar, ...places]);
  if (answerPlaces.size > 3 && places.size) p("list", `the answer would name ${answerPlaces.size} places`);

  // a sentence of four figures or more reads the screen's numbers out (the tiles are on the screen)
  const figs = placedFigures(text);
  // a window's length ("the last 7 days", "24 மணி நேர") is how long, not a figure read off the screen
  const dataFigs = figs.filter((x) => !WINDOW_UNIT.test(text.slice(x.at + x.fig.raw.length, x.at + x.fig.raw.length + 12)));
  if (dataFigs.length >= 4) p("list", `${dataFigs.length} figures in one sentence`);
  // numbers: in a cited fact, hedged within tolerance, and bound to the name said with them
  for (const x of figs) {
    const v = x.fig.value;
    const inCited = cited.some((c) => allows(c.nums, v, x.hedge));
    if (!inCited) { p(others.some((o) => allows(o.nums, v, x.hedge)) ? "misbound" : "number", `${x.fig.raw} (${v}) is in no cited fact`); continue; }
    const start = clauseStart(text, x.at);
    const near = hits.filter((h) => h.at >= start && h.at < x.at && h.kind !== "outlet").pop();
    if (near && !scopeKeys.has(near.key) && !cited.some((c) => has(c.keys, near.key) && allows(c.nums, v, x.hedge))) p("misbound", `${x.fig.raw} is not ${near.form}'s in the cited facts`);
  }
  // twice, half, three times: only against a ratio code computed
  const mults: number[] = [];
  for (const m of text.matchAll(MULT_EN)) { const v = MULT_WORDS.find(([re]) => re.test(m[0]))?.[1]; if (v) mults.push(v); }
  for (const [re, v] of MULT_TA) if (re.test(text)) mults.push(v);
  for (const k of mults) {
    const ok = cited.some((c) => c.ratios.some((r) => (r >= k * 0.85 && r <= k * 1.18) || (r > 0 && 1 / r >= k * 0.85 && 1 / r <= k * 1.18)));
    if (!ok) p("multiplier", `"${k === 0.5 ? "half" : `${k} times`}" matches no ratio in the cited facts`);
  }

  // time words
  const atoms = timeAtoms(text);
  const have = new Set(cited.flatMap((c) => [...c.atoms]));
  // a suggestion's own time ("ask them for a status today", "இன்றே கேட்கலாம்") is advice about what to do, not a claim about the record
  const advice = ADVICE.test(text);
  for (const a of atoms) if (!covered(a, have) && !covered(a, scopeAtoms) && !(advice && FORWARD.has(a))) p("time", `"${a}" is in no cited fact`);

  // claims
  const causal = lang === "ta" ? CAUSE_TA.test(text) || CAUSE_EN.test(text) : CAUSE_EN.test(text);
  if (causal && !cited.some((c) => c.f.cause || CAUSE_EN.test(c.f.text) || CAUSE_TA.test(c.f.text))) p("cause", "a cause no cited fact states");
  const up = UP_EN.test(text) || UP_TA.test(text), down = DOWN_EN.test(text) || DOWN_TA.test(text);
  const dirs = cited.map((c) => c.f.dir).filter((d): d is "up" | "down" => d === "up" || d === "down");
  if (dirs.length && up && !down && !dirs.includes("up")) p("direction", "says it rose; the cited facts fell");
  if (dirs.length && down && !up && !dirs.includes("down")) p("direction", "says it fell; the cited facts rose");
  if ((SUPER_EN.test(text) || SUPER_TA.test(text)) && !cited.some((c) => c.f.rank || SUPER_EN.test(c.f.text) || SUPER_TA.test(c.f.text) || /\brank\b/i.test(c.f.text)))
    p("superlative", "an extreme no cited fact ranks");
  if (ABSOLUTE_EN.test(text) && !cited.some((c) => NEGATION_IN_FACT.test(c.f.text))) p("absolute", "a none or no that no cited fact states");
  if ((SPECULATION_EN.test(text) || SPECULATION_TA.test(text)) && !cited.some((c) => SPECULATION_EN.test(c.f.text))) p("speculation", "a guess");

  // what the screen shows is not read out
  const copied = copiedRun(text, sheet.shown, hits.map((h) => h.form), 7);
  if (copied) p("copy", `reads the screen: "${copied}"`);

  // a claim must cite: a sentence with a figure, a name or a time and no citation is not checked against anything
  if (!cites.length && (placedFigures(text).length || hits.length || atoms.size)) p("uncited", "a claim with no fact cited");
  return { ok: problems.length === 0, problems, text };
}

/** The places a checked sentence names (for the answer's running count). */
export function placesOf(text: string, g: Gazetteer): string[] {
  return [...new Set(namesIn(text, g).filter((h) => h.kind === "zone" || h.kind === "place" || h.kind === "taluk").map((h) => h.key))];
}
