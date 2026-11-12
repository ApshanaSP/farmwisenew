/**
 * The one reader of the time a question names, for both rules lanes: Jarvis (src/lib/thunai) and Ask District IQ (src/lib/assistant).
 * QA pass 7 (P6-022, P6-023, pass4-open-14/16/17/18): each lane had its own period words, and they meant different things ("today" was the last
 * 24 hours, "right now" was the last 24 hours, "last month" was the last 30 days in Jarvis and the calendar month in Ask District IQ, "up or down
 * from last month" was a list in one lane and October against September in the other). One phrase now has one meaning, in English, Tamil and
 * Tanglish alike:
 *
 *   "today", "this morning", இன்று, innaiku ........... today's calendar day in India, from midnight to now
 *   "right now", "currently", "open now", இப்போது, ippo  the current state: what is open now, whatever day it was reported (no reporting window)
 *   "yesterday", நேற்று, nethu ........................ the calendar day before today; "the day before yesterday" the one before that
 *   "last week / month / quarter", கடந்த மாதம், pona maasam   the previous calendar week (Monday to Sunday), month or quarter
 *   "this week", "last 7 days", "this month", "last 30 days", "weekly" ... the console's rolling windows, as said
 *   "in the last week", "since last month" ............ rolling (the last 7 or 30 days), as the words say
 *   "last 10 days", "past 3 weeks", கடந்த 10 நாட்கள் .... that much time back from now
 *   "in September", "since 1 October", "since Diwali", "the last week of October": those calendar bounds
 *   "up or down from last month", "compared with last week", "than yesterday", கடந்த மாதத்தை விட, pona maasatha vida:
 *                                                         a comparison of two periods: the window against the one just before it, of equal length
 *   "two weeks ago", "next week", "last year" .......... a time the records cannot answer (unheld): never answered with the current window
 *
 * readPeriod() is pure and has no clock: it says WHAT was named. spanOf() puts dates on it from the store's "now" (the IST wall clock string
 * "YYYY-MM-DD HH:MM:SS" that asOf() returns), so a frozen clock, the 1st of a month and midnight IST all come out of one place.
 */

export type PeriodKey = "daily" | "weekly" | "monthly" | "quarterly";
export type CalUnit = "week" | "month" | "quarter";

export type PeriodSpec =
  | { kind: "none" }
  /** the current state: open now, whatever day it was reported */
  | { kind: "now" }
  /** one of the console's rolling windows, as said */
  | { kind: "window"; key: PeriodKey }
  /** "last 10 days": that much time back from now (never one of the console's four windows: those are `window`) */
  | { kind: "hours"; hours: number; n: number; unit: "hour" | "day" | "week" | "month" }
  /** a calendar day: 0 today, 1 yesterday, 2 the day before yesterday */
  | { kind: "day"; back: 0 | 1 | 2 }
  /** the previous calendar week (Monday to Sunday), month or quarter */
  | { kind: "last"; unit: CalUnit }
  /** "the last week of October": the final 7 days of that finished month */
  | { kind: "lastWeekOf"; month: number; year: number | null }
  /** "in September": that calendar month (to now when it is this month) */
  | { kind: "month"; month: number; year: number | null }
  /** "since 1 October": from that day to now */
  | { kind: "since"; month: number; day: number }
  /** "since Diwali": from the last time it fell to now */
  | { kind: "holiday"; name: string; dates: string[] }
  /** "up or down from last month": the window `key` against the one just before it */
  | { kind: "compare"; key: PeriodKey }
  /** "two weeks ago", "next week", "last year": not a stretch the records can answer, and not the current window either */
  | { kind: "unheld" };

export interface Words { en: string; ta: string; tg: string }

/** A period with dates on it. */
export interface Span {
  /** the console window that holds it (for tools that know only the four windows) */
  key: PeriodKey;
  /** exact bounds on the IST wall clock, from inclusive, to exclusive; null: the rolling window `key` (or `hours`) back from now */
  range: { from: string; to: string } | null;
  /** a rolling window that is not one of the four ("last 10 days") */
  hours: number | null;
  label: Words;
  /** the span runs up to now (today, this month so far) */
  partial: boolean;
  /** the current state: open now, whatever day it was reported */
  now: boolean;
  /** the records do not reach back that far */
  note: string | null;
}

// ------------------------------------------------------------------ the words --

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_TA = ["ஜனவரி", "பிப்ரவரி", "மார்ச்", "ஏப்ரல்", "மே", "ஜூன்", "ஜூலை", "ஆகஸ்ட்", "செப்டம்பர்", "அக்டோபர்", "நவம்பர்", "டிசம்பர்"];
/** Days a Collector counts from, as observed in Tamil Nadu (dates, IST). */
const HOLIDAYS: [RegExp, string, string[]][] = [
  [/\b(diwali|deepavali|deepawali)\b|தீபாவளி/i, "Deepavali", ["2025-10-20", "2026-11-08"]],
  [/\bpongal\b|பொங்கல்/i, "Pongal", ["2026-01-15"]],
  [/\bnew year\b|புத்தாண்டு/i, "New Year", ["2026-01-01"]],
  [/\bchristmas\b/i, "Christmas", ["2025-12-25"]],
  [/\brepublic day\b/i, "Republic Day", ["2026-01-26"]],
  [/\bindependence day\b/i, "Independence Day", ["2026-08-15"]]
];
/** The store keeps about 180 days: a window reaching further back is cut there, and says so. */
export const MAX_HOURS = 180 * 24;

/** A Tamil word at a word edge (nothing Tamil before it). */
const TA_EDGE = "(?<![\\u0B80-\\u0BFF])";
const ta = (alts: string) => new RegExp(`${TA_EDGE}(?:${alts})`);

/**
 * "yesterday" in every form the app reads: English, Tanglish (nethu, netru, neththu, nethaiki) and Tamil (நேற்று, நேற்றைய, நேத்து, நேத்தைய).
 * The same pattern as assistant/when.ts (kept there for the lanes that import it).
 */
const YESTERDAY = /\b(yesterday|yesterday'?s|nethu|netru|neththu|nethaiki|nethikku|nethaiya|netraiya|nethiku|netraikku|netrikku|nethaikku)\b|நேற்று|நேற்றைய|நேத்து|நேத்தைய|நேத்திக்கு|நேற்றைக்கு|நேத்தைக்கு/i;
const DAY_BEFORE = /\b(day before yesterday|munthaa naal|munthanaal|mundhaa naal|mundhanaal|mundhanaaal)\b|முந்தா ?நாள்|முந்தாநாள்|நேற்று முன்தினம்|நேற்று முந்தைய நாள்/i;
const SINCE_YESTERDAY = /\b(since|from) yesterday\b|நேற்றிலிருந்து|nethu(la)? irundhu/i;
const TODAY = /\b(today'?s?|todays|tonight|this (morning|afternoon|evening)|so far today|innaiku|innaikku|inniki|innaiki|innikku|innikki|indru|inaiku)\b|இன்று|இன்றைய|இன்னைக்கு|இன்னிக்கு|இன்றிரவு|இன்று காலை/i;
/** the current state: what is open now. "now" on its own counts ("show severe cases now"); "now" as a sequence word at the start ("now show Adyar") does not */
const NOW = /\b(right now|just now|as of now|as on now|at (the|this) moment|at present|presently|currently|current(?:ly)? open|open now|now open|still open now)\b|(?<!^\s*)\bnow\b|\b(ippo|ippodhu|ippothu|ipo|ippa|ippove|ipodhu|ipothaikku|ippothaikku|ippa varaikkum)\b|இப்போது|இப்போ(?![஀-௿])|இப்ப(?![஀-௿])|தற்போது|தற்சமயம்|தற்போதைய|இந்த நேரத்தில்/i;
/** Ago, next, last year: a stretch the console does not hold (quick.ts held these for Jarvis alone; now both lanes) */
const UNIT = "(?:days?|weeks?|months?|quarters?|years?)";
const AGO_EN = new RegExp(String.raw`\b(?:an?|one|two|three|four|five|six|seven|eight|nine|ten|\d{1,3}|couple of|few|several|many) ${UNIT} (?:ago|back|before|earlier|prior)\b|\b(?:week|month|quarter|year) before last\b|\blast year\b|\bnext (?:week|month|quarter|year)s?\b|\b(?:tomorrow|next day)\b`, "i");
const AGO_TG = /\b(?:oru|rendu|irandu|moonu|naalu|anju|\d{1,3}) (?:naal|vaaram|maasam|maatham|varusham) (?:munnaadi|munnadi|mundhi|mundhaiya|munbu|mun|pinnadi|back)\b|\badutha (?:vaaram|maasam|maatham|varusham|naal)\b|\bpona (?:varusham|varudam)\b|\bnaalaiku|naalaikku|naalai\b/i;
const AGO_TA = /(?:நாள்|நாட்கள்|வாரம்|வாரங்கள்|வாரத்துக்கு|மாதம்|மாதங்கள்|மாசம்|மாசத்துக்கு|ஆண்டு|வருடம்|வருஷம்)(?:த்துக்கு|க்கு|கள்)?\s*(?:முன்பு|முன்னாடி|முன்னர்|முன்)(?![஀-௿])|அடுத்த (?:வாரம்|வார|மாதம்|மாத|மாசம்|காலாண்டு|ஆண்டு|வருடம்|வருஷம்|நாள்)|(?:கடந்த|போன) (?:ஆண்டு|வருடம்|வருஷம்)|நாளை/;

/** an age, not a period: "open for more than 7 days", "pending over 30 days" */
const AGE = /\b(for\s+)?(more than|longer than|older than|beyond|at least)\s+(\d+|seven|thirty|an?|one|two|three)\s+(days?|weeks?|months?)\b|\bfor\s+over\s+(\d+|seven|thirty|an?|one|two|three)\s+(days?|weeks?|months?)\b/gi;

// the previous calendar unit: English, Tanglish, Tamil (with no Tamil case ending after it: "கடந்த வாரத்தில்", "in the past week", is the rolling week)
const LAST_EN = /\b(?:last|previous|prior|pona|poona|ponna|kadandha|kadantha|kadanda|munthaiya|mundhaiya) (week|month|quarter|vaaram|varam|maasam|masam|maatham|kaalaandu)(?:'s|s)?\b(?!\s*(?:\d|of\b))/i;
const LAST_TA = /(?:கடந்த|போன|சென்ற|முந்தைய) ?(வாரம்|மாதம்|மாசம்|காலாண்டு)(?![஀-௿])/;
/** "கடந்த", "போன", "pona" left over when the unit after them carried a case ending ("கடந்த மாதத்தை விட"): part of the time phrase, not an unknown word */
const LAST_LONE = /(?<![\u0B80-\u0BFF])(?:கடந்த|போன|சென்ற|முந்தைய)(?![\u0B80-\u0BFF])|\b(?:pona|kadandha|kadantha)\b/;
/** "in the last week", "since last month", "over the past month": rolling, as the words say */
const ROLLING_LAST = /\b(?:since|in the|during the|over the|within the|for the|throughout the) (?:last|past|previous|pona|kadandha|kadantha) (?:week|month|quarter|vaaram|maasam)\b/i;
const LAST_WEEK_OF = /\b(?:the )?(?:last|final) week of (january|february|march|april|may|june|july|august|september|october|november|december)\b(?:\s+(20\d{2}))?/i;

// comparison words: a period set against the one before it
/** asked which way it went, with no reference period in the words: "up or down?" */
const EITHER_WAY = /\b(up or down|down or up|higher or lower|lower or higher|more or (?:less|fewer)|fewer or more|rise or fall|risen or fallen|rising or falling|increased? or decreased?|go(?:ne)? up or down)\b/i;
/** "(vs | compared to | against | than | from | over | relative to) last month", "this month and last month" */
const REF_EN = /\b(?:vs\.?|versus|compared?(?: to| with)?|comparing|against|than|relative to|over|from|with)\s+(?:the\s+)?(?:last|previous|prior|past|pona|kadandha|kadantha)\s+(day|week|month|quarter|period|vaaram|maasam|naal)\b|\b(?:vs\.?|versus|compared?(?: to| with)?|than|from|against|over)\s+(yesterday|nethu|netru)\b|\b(this|current|indha|intha)\s+(week|month|quarter|vaaram|maasam)\s+(?:and|with|to|vs\.?|versus|against)\s+(?:the\s+)?(?:last|previous|prior|pona)\s+(?:week|month|quarter|vaaram|maasam)\b|\b(today|innaiku|inniki)\s+(?:and|with|to|vs\.?|versus|against)\s+(yesterday|nethu)\b|\b(month|week|day|quarter)[- ]on[- ](?:month|week|day|quarter)\b|\b(month|week|day|quarter)[- ]over[- ](?:month|week|day|quarter)\b/i;
/** a word of change: with it, "from last month" sets two periods side by side */
const CHANGE_EN = /\b(up|down|higher|lower|more|less|fewer|rise|rose|risen|rising|fall|fell|fallen|falling|increase[ds]?|increasing|decrease[ds]?|decreasing|drop(?:ped|s)?|jump(?:ed|s)?|grew|grown|growth|change[ds]?|changing|difference|differ|better|worse)\b/i;
/** Tanglish: "pona maasatha vida", "last month vida", "nethai vida", "pona maasathoda compare", "kooduchaa korainjaa" */
const VS_TG = /\b(?:pona|kadandha|kadantha|last|previous|munthaiya) (?:maasatha|maasam|maasathai|maasathoda|month|monthoda|vaaratha|vaaram|vaarathai|vaarathoda|week|weekoda) (?:vida|vidha|compare|oppittaa|oppidum)\b|\b(?:nethai|nethu|netrai|yesterday) (?:vida|vidha|compare|oppittaa)\b|\b(?:koodicha|kooduchaa|koodiyirukka|athigama(?:yirukka)?|jaasthiyaa|increase aa|up aa)\s*(?:illa\s+)?(?:korainjaa|korainjirukka|korachalaa|kammiyaa|kammiya|decrease aa|down aa)\b/i;
/** Tamil: "கடந்த மாதத்தை விட", "நேற்றை விட", "கடந்த வாரத்துடன் ஒப்பிடும்போது", "கூடியதா குறைந்ததா" */
const VS_TA = /(?:மாதத்தை|மாசத்தை|வாரத்தை|காலாண்டை|நேற்றை|நேற்றைய\s*நாளை)\s*(?:விட|விடவும்)|(?:மாதத்துடன்|மாசத்துடன்|வாரத்துடன்|நேற்றுடன்|மாதத்தோடு|வாரத்தோடு|நேற்றோடு)\s*ஒப்பி|(?:கூடியதா|அதிகரித்ததா|ஏறியதா|உயர்ந்ததா|அதிகமா)\s*(?:இல்லை\s*)?(?:குறைந்ததா|இறங்கியதா|குறைவா|சரிந்ததா)/;

// the console's rolling windows, as said
const THIS_EN = /\b(this|current|indha|intha|inda) (week|month|quarter|vaaram|maasam|maatham)(?:'s|s)?\b/i;
/** a Tamil week or month word: வாரம், வாரத்தில், வார ("this week's"); never வார்டு (a ward) or மாதவரம் (Madhavaram zone), which start with the same letters */
const WEEK_TA = "வார(?:ம்|த்|ங்|ாந்|ந்|(?![\\u0B80-\\u0BFF]))";
const MONTH_TA_W = "(?:மாத(?:ம்|த்|ங்|ாந்|(?![\\u0B80-\\u0BFF]))|மாச(?:ம்|த்|(?![\\u0B80-\\u0BFF])))";
const THIS_TA = new RegExp(`இந்த ?(${WEEK_TA}|${MONTH_TA_W}|காலாண்டு)`);
const SPAN_N = /\b(?:last|past|previous|kadandha|kadantha|kadaisi|the last|the past)\s+(\d{1,3})\s*(hours?|hrs?|h\b|days?|weeks?|months?|naal|naatkal|naal-la|mani neram)/i;
const SPAN_N_TA = /(?:கடந்த|கடைசி)\s*(\d{1,3})\s*(மணி|நாட்கள்|நாள்|வாரங்கள்|வாரம்|மாதங்கள்|மாதம்)/;
const N_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30, sixty: 60, ninety: 90 };
const SPAN_W = /\b(?:last|past|previous)\s+(one|two|three|four|five|six|seven|ten|fourteen|fifteen|twenty|thirty|sixty|ninety)\s+(hours?|days?|weeks?|months?)\b/i;
const DAILY = /\b(24 ?(?:hrs?|hours?|h)|past day|daily)\b|தினசரி|24 மணி/i;
/** "7 days", "30 days" said bare: the console's own windows */
const BARE_DAYS = /\b(7|seven) days\b|\b(30|thirty) days\b/i;
const WEEKLY = new RegExp(`\\b(weekly|weeks?|vaaram|vaara|vaarathukku|varam)\\b|${TA_EDGE}${WEEK_TA}`, "i");
const MONTHLY = new RegExp(`\\b(monthly|months?|maasam|maatham|maasathukku|masam)\\b|${TA_EDGE}${MONTH_TA_W}`, "i");
const QUARTERLY = /\b(quarterly|quarters?|90 days|three months|3 months|kaalaandu)\b|காலாண்டு|மூன்று மாத/i;

function normal(text: string): string {
  return ` ${text.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim()} `;
}

/** What time the question names. Pure: no clock. */
export function readPeriod(text: string): PeriodSpec {
  const raw = normal(text);
  const t = raw.replace(AGE, " ");
  // 1. a comparison of two periods ("up or down from last month", "than yesterday", "கடந்த மாதத்தை விட", "pona maasatha vida")
  const cmp = compareIn(t);
  if (cmp) return { kind: "compare", key: cmp };
  // 2. a time the records cannot answer, before any window word inside it ("a month ago" holds "month")
  if (AGO_EN.test(t) || AGO_TG.test(t) || AGO_TA.test(t)) return { kind: "unheld" };
  // 3. the last week of a month
  const lwo = LAST_WEEK_OF.exec(t);
  if (lwo) return { kind: "lastWeekOf", month: MONTHS.indexOf(lwo[1].slice(0, 3)), year: lwo[2] ? Number(lwo[2]) : null };
  // 4. calendar days
  if (DAY_BEFORE.test(t)) return { kind: "day", back: 2 };
  if (YESTERDAY.test(t) && !SINCE_YESTERDAY.test(t)) return { kind: "day", back: 1 };
  if (SINCE_YESTERDAY.test(t)) return { kind: "window", key: "daily" };
  // 5. a stretch in the question's own words ("last 10 days"); the console's four windows are windows
  const span = spanIn(t);
  if (span) return span;
  // 6. the previous calendar week, month or quarter; "in the last week", "since last month": rolling
  if (ROLLING_LAST.test(t)) return { kind: "window", key: /month|maasam/.test(ROLLING_LAST.exec(t)![0]) ? "monthly" : /quarter/.test(ROLLING_LAST.exec(t)![0]) ? "quarterly" : "weekly" };
  const le = LAST_EN.exec(t) ?? LAST_TA.exec(t);
  if (le) return { kind: "last", unit: unitOf(le[1]) };
  // 7. a day or month named by date
  const since = t.match(/\b(?:since|from)\s+(?:(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})|([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?)\b/);
  if (since) {
    const d = Number(since[1] ?? since[4]), mi = MONTHS.indexOf(String(since[2] ?? since[3]).slice(0, 3));
    if (mi >= 0 && d >= 1 && d <= 31) return { kind: "since", month: mi, day: d };
  }
  if (/\b(since|from|after)\b|இலிருந்து|முதல்/.test(t)) { const h = HOLIDAYS.find(([re]) => re.test(t)); if (h) return { kind: "holiday", name: h[1], dates: h[2] }; }
  const mm = t.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b(?:\s+(20\d{2}))?/);
  if (mm && !(mm[1] === "may" && !mm[2] && !/\bin may\b/.test(t)) && !(mm[1] === "mar" && !mm[2])) return { kind: "month", month: MONTHS.indexOf(mm[1].slice(0, 3)), year: mm[2] ? Number(mm[2]) : null };
  // 8. the current state
  if (NOW.test(t)) return { kind: "now" };
  // 9. today
  if (TODAY.test(t)) return { kind: "day", back: 0 };
  // 10. the console's windows, as said
  const th = THIS_EN.exec(t) ?? THIS_TA.exec(t);
  if (th) return { kind: "window", key: keyOfUnit(th[2] ?? th[1]) };
  if (DAILY.test(t)) return { kind: "window", key: "daily" };
  const bare = BARE_DAYS.exec(t);
  if (bare) return { kind: "window", key: bare[1] ? "weekly" : "monthly" };
  if (QUARTERLY.test(t)) return { kind: "window", key: "quarterly" };
  if (WEEKLY.test(t)) return { kind: "window", key: "weekly" };
  if (MONTHLY.test(t)) return { kind: "window", key: "monthly" };
  return { kind: "none" };
}

function unitOf(w: string): CalUnit {
  return /^(week|vaaram|varam|வாரம்)$/.test(w) ? "week" : /^(quarter|kaalaandu|காலாண்டு)$/.test(w) ? "quarter" : "month";
}
function keyOfUnit(w: string): PeriodKey {
  return /^(week|vaaram|வார|வாரம்)/.test(w) ? "weekly" : /^(quarter|காலாண்டு)/.test(w) ? "quarterly" : "monthly";
}
const keyOfHours = (h: number): PeriodKey => (h <= 24 ? "daily" : h <= 168 ? "weekly" : h <= 720 ? "monthly" : "quarterly");

function spanIn(t: string): PeriodSpec | null {
  const m = SPAN_N.exec(t) ?? SPAN_N_TA.exec(t);
  const w = m ? null : SPAN_W.exec(t);
  const n = m ? Number(m[1]) : w ? N_WORDS[w[1].toLowerCase()] : NaN;
  const u = (m?.[2] ?? w?.[2] ?? "").toLowerCase();
  if (!Number.isFinite(n) || !u) return null;
  const unit = /^(h|மணி|mani)/.test(u) ? "hour" : /^(w|வார)/.test(u) ? "week" : /^(mo|மாத)/.test(u) ? "month" : "day";
  const per = unit === "hour" ? 1 : unit === "week" ? 168 : unit === "month" ? 720 : 24;
  if (!n) return { kind: "hours", hours: 0, n: 0, unit };
  const hours = Math.min(n * per, MAX_HOURS);
  const key = ({ 24: "daily", 168: "weekly", 720: "monthly", 2160: "quarterly" } as Record<number, PeriodKey>)[hours];
  return key ? { kind: "window", key } : { kind: "hours", hours, n, unit };
}

/** The window a comparison sets against the one before it, or null when the question compares no periods. */
function compareIn(t: string): PeriodKey | null {
  const ref = REF_EN.exec(t);
  // "from last month" alone ("complaints from last month") names a month, not a comparison: it needs a word of change with it ("up or down from last month")
  if (ref && (!/^\s*(from|with|over)\b/.test(ref[0]) || CHANGE_EN.test(t) || /\b(vs|versus|compared?|against|than)\b/.test(t))) return keyOfRef(unitNear(ref[0]) || "month");
  const tg = VS_TG.exec(t);
  if (tg) return keyOfRef(unitNear(tg[0]) || unitNear(t) || "week");
  const ta = VS_TA.exec(t);
  if (ta) return keyOfRef(/நேற்/.test(ta[0]) ? "day" : /வார/.test(ta[0]) ? "week" : /காலாண்/.test(ta[0]) ? "quarter" : /மாத|மாச/.test(ta[0]) ? "month" : unitNear(t));
  // "garbage complaints, up or down?" with a month named elsewhere in the sentence ("this month", "pona maasam")
  // "are garbage complaints up or down?": the unit named elsewhere ("this month", "pona maasam"), else the week
  if (EITHER_WAY.test(t)) return keyOfRef(unitNear(t) || "week");
  return null;
}
function unitNear(t: string): string {
  return /\b(yesterday|today|nethu|netru|nethai|netrai|innaiku|inniki|day|naal)\b|நேற்|இன்று/.test(t) ? "day"
    : /\b(weeks?|vaaram|vaaratha|vaarathai|vaarathoda|weekoda)\b|வார(?!்)/.test(t) ? "week"
      : /\b(quarters?|kaalaandu)\b|காலாண்/.test(t) ? "quarter"
        : /\b(months?|maasam|maasatha|maasathai|maasathoda|monthoda|period)\b|மாத(?!வ)|மாச/.test(t) ? "month" : "";
}
function keyOfRef(w: string): PeriodKey {
  const x = w.toLowerCase();
  return /^(day|yesterday|nethu|netru|naal|today|innaiku|inniki)$/.test(x) ? "daily" : /^(week|vaaram)$/.test(x) ? "weekly" : /^quarter$/.test(x) ? "quarterly" : "monthly";
}

// ------------------------------------------------------------------ dates --

const ms = (ist: string) => Date.parse(`${ist.replace(" ", "T")}+05:30`);
/** the IST wall clock of an instant */
const ist = (t: number) => new Date(t + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");
/** the IST wall clock of a "wall clock as UTC" number (Date.UTC(y, m, d) used as an IST date) */
const wall = (t: number) => new Date(t).toISOString().slice(0, 19).replace("T", " ");
const dayLabel = (wallMs: number) => new Date(wallMs).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dayTa = (wallMs: number) => { const d = new Date(wallMs); return `${d.getUTCDate()} ${MONTH_TA[d.getUTCMonth()]}`; };

export const WINDOW_WORDS: Record<PeriodKey, Words> = {
  daily: { en: "last 24 hours", ta: "கடந்த 24 மணி நேரம்", tg: "kadandha 24 mani neram" },
  weekly: { en: "last 7 days", ta: "கடந்த 7 நாட்கள்", tg: "kadandha 7 naal" },
  monthly: { en: "last 30 days", ta: "கடந்த 30 நாட்கள்", tg: "kadandha 30 naal" },
  quarterly: { en: "last 90 days", ta: "கடந்த 90 நாட்கள்", tg: "kadandha 90 naal" }
};
export const KEY_HOURS: Record<PeriodKey, number> = { daily: 24, weekly: 168, monthly: 720, quarterly: 2160 };

/**
 * The span with dates on it, from the store's "now" (IST wall clock "YYYY-MM-DD HH:MM:SS"). Null for none, a comparison (compareOf) and a time the records
 * cannot answer. A range ends at now + 1 s when it runs to now, so the store's as-of second is inside it.
 */
export function spanOf(spec: PeriodSpec, now: string): Span | null {
  const nowMs = ms(now);
  if (!Number.isFinite(nowMs)) return null;
  const nowWall = nowMs + 330 * 60_000;
  const cur = new Date(nowWall);
  const todayMid = Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate());
  const year = cur.getUTCFullYear();
  const toNow = ist(nowMs + 1000);
  const base = { hours: null, partial: false, now: false, note: null } as const;
  const tooOld = (fromWall: number) => nowWall - fromWall > MAX_HOURS * 3600_000 + 31 * 864e5;
  const yr = (y: number) => (y === year ? "" : ` ${y}`);
  switch (spec.kind) {
    case "now":
      // every record the store holds, up to now: the current state is whatever is open, whenever it was reported
      return { ...base, key: "quarterly", range: { from: "2000-01-01 00:00:00", to: toNow }, now: true, partial: true,
        label: { en: "open now, whatever the day reported", ta: "இப்போது நிலுவையில், எந்த நாள் பதிவானாலும்", tg: "ippo open-la irukkiravai, endha naal report aanaalum" } };
    case "window":
      return { ...base, key: spec.key, range: null, label: WINDOW_WORDS[spec.key] };
    case "hours": {
      const unit = spec.unit;
      const en = `last ${spec.n} ${unit}${spec.n === 1 ? "" : "s"}`;
      const taU = unit === "hour" ? "மணி நேரம்" : unit === "week" ? "வாரங்கள்" : unit === "month" ? "மாதங்கள்" : "நாட்கள்";
      const tgU = unit === "hour" ? "mani neram" : unit === "week" ? "vaaram" : unit === "month" ? "maasam" : "naal";
      return { ...base, key: keyOfHours(spec.hours), range: null, hours: spec.hours, label: { en, ta: `கடந்த ${spec.n} ${taU}`, tg: `kadandha ${spec.n} ${tgU}` },
        note: spec.n * (unit === "hour" ? 1 : unit === "week" ? 168 : unit === "month" ? 720 : 24) > MAX_HOURS ? "The records go back about 180 days, so this counts from then." : null };
    }
    case "day": {
      const a = todayMid - spec.back * 864e5;
      const d = dayLabel(a);
      if (spec.back === 0) return { ...base, key: "daily", range: { from: wall(a), to: toNow }, partial: true,
        label: { en: `today (${d}, since midnight)`, ta: `இன்று (${dayTa(a)}, நள்ளிரவு முதல்)`, tg: `inniki (${d}, nadu raathiri-lerndhu)` } };
      return { ...base, key: "daily", range: { from: wall(a), to: wall(a + 864e5) },
        label: spec.back === 1 ? { en: `yesterday (${d})`, ta: `நேற்று (${dayTa(a)})`, tg: `nethu (${d})` }
          : { en: `the day before yesterday (${d})`, ta: `நேற்று முன்தினம் (${dayTa(a)})`, tg: `munthaa naal (${d})` } };
    }
    case "last": {
      let a: number, b: number;
      let label: Words;
      if (spec.unit === "week") {
        b = todayMid - ((cur.getUTCDay() + 6) % 7) * 864e5; // this Monday 00:00
        a = b - 7 * 864e5;
        const r = `${dayLabel(a)} to ${dayLabel(b - 864e5)}`;
        label = { en: `last week (${r})`, ta: `கடந்த வாரம் (${dayTa(a)} முதல் ${dayTa(b - 864e5)} வரை)`, tg: `pona vaaram (${r})` };
      } else if (spec.unit === "month") {
        b = Date.UTC(year, cur.getUTCMonth(), 1);
        a = Date.UTC(year, cur.getUTCMonth() - 1, 1);
        const m = new Date(a).getUTCMonth(), y = new Date(a).getUTCFullYear();
        label = { en: `last month (${MONTH_NAMES[m]}${yr(y)})`, ta: `கடந்த மாதம் (${MONTH_TA[m]}${yr(y)})`, tg: `pona maasam (${MONTH_NAMES[m]}${yr(y)})` };
      } else {
        const q0 = Math.floor(cur.getUTCMonth() / 3) * 3;
        b = Date.UTC(year, q0, 1);
        a = Date.UTC(year, q0 - 3, 1);
        const m0 = new Date(a).getUTCMonth(), m1 = new Date(b - 864e5).getUTCMonth(), y = new Date(a).getUTCFullYear();
        label = { en: `last quarter (${MONTH_NAMES[m0]} to ${MONTH_NAMES[m1]}${yr(y)})`, ta: `கடந்த காலாண்டு (${MONTH_TA[m0]} முதல் ${MONTH_TA[m1]} வரை)`, tg: `pona kaalaandu (${MONTH_NAMES[m0]} to ${MONTH_NAMES[m1]})` };
      }
      const hours = Math.round((b - a) / 3600_000);
      return { ...base, key: keyOfHours(hours), range: { from: wall(a), to: wall(b) }, label,
        note: tooOld(a) ? "The records go back about 180 days, so the start of this period is not covered." : null };
    }
    case "lastWeekOf": {
      const mi = spec.month;
      let y = spec.year ?? year;
      if (spec.year == null && mi > cur.getUTCMonth()) y -= 1;
      const end = Date.UTC(mi === 11 ? y + 1 : y, mi === 11 ? 0 : mi + 1, 1);
      if (end > nowWall) return null;
      const a = end - 7 * 864e5;
      const r = `${new Date(a).getUTCDate()} to ${new Date(end - 864e5).getUTCDate()} ${MONTH_NAMES[mi]}`;
      return { ...base, key: "weekly", range: { from: wall(a), to: wall(end) },
        label: { en: `last week of ${MONTH_NAMES[mi]} ${y} (${r})`, ta: `${MONTH_TA[mi]} கடைசி வாரம் (${r})`, tg: `${MONTH_NAMES[mi]} kadaisi vaaram (${r})` },
        note: tooOld(a) ? "The records go back about 180 days, so the start of this period is not covered." : null };
    }
    case "month": {
      const mi = spec.month;
      let y = spec.year ?? year;
      if (spec.year == null && (y > year || mi > cur.getUTCMonth())) y -= 1;
      const s = Date.UTC(y, mi, 1), e0 = Date.UTC(mi === 11 ? y + 1 : y, mi === 11 ? 0 : mi + 1, 1);
      if (s >= nowWall || tooOld(s)) return null;
      const toDate = e0 > nowWall;
      const from = Math.max(s, nowWall - MAX_HOURS * 3600_000);
      const name = `${MONTH_NAMES[mi]} ${y}${toDate ? " (to date)" : ""}`;
      return { ...base, key: "monthly", range: { from: wall(from), to: toDate ? toNow : wall(e0) }, partial: toDate,
        label: { en: name, ta: `${MONTH_TA[mi]} ${y}${toDate ? " (இதுவரை)" : ""}`, tg: `${MONTH_NAMES[mi]} ${y}${toDate ? " (ippo varaikkum)" : ""}` },
        note: from > s ? "The records go back about 180 days, so the start of this month is not covered." : null };
    }
    case "since":
    case "holiday": {
      let start: number | null = null, en = "", taL = "";
      if (spec.kind === "since") {
        start = Date.UTC(year, spec.month, spec.day);
        if (start > nowWall) start = Date.UTC(year - 1, spec.month, spec.day);
        en = `since ${dayLabel(start)}${yr(new Date(start).getUTCFullYear())}`;
        taL = `${dayTa(start)} முதல்`;
      } else {
        const past = spec.dates.map((x) => Date.parse(`${x}T00:00:00Z`)).filter((x) => x <= nowWall).sort((a, b) => b - a)[0];
        if (past == null) return null;
        start = past;
        en = `since ${spec.name} (${dayLabel(past)}${yr(new Date(past).getUTCFullYear())})`;
        taL = `${spec.name} (${dayTa(past)}) முதல்`;
      }
      if (start == null || start >= nowWall) return null;
      const want = Math.ceil((nowWall - start) / 3600_000), hours = Math.min(want, MAX_HOURS);
      return { ...base, key: keyOfHours(hours), range: { from: ist(nowMs - hours * 3600_000), to: toNow }, hours, partial: true, label: { en, ta: taL, tg: en },
        note: want > hours ? "The records go back about 180 days, so this counts from then." : null };
    }
    default:
      return null;
  }
}

/** A comparison with dates on it: the window `key` back from now, against the window of the same length just before it. */
export interface Comparison { key: PeriodKey; cur: Span; prev: Span; label: Words }
export function compareOf(key: PeriodKey, now: string): Comparison | null {
  const nowMs = ms(now);
  if (!Number.isFinite(nowMs)) return null;
  const h = KEY_HOURS[key];
  const b = nowMs + 1000, a = b - h * 3600_000, p = a - h * 3600_000;
  const dl = (t: number) => dayLabel(t + 330 * 60_000);
  const w = WINDOW_WORDS[key];
  // in words, with its dates: "the 30 days before" puts a figure no count explains into a spoken line
  const unitW = { daily: ["day", "நாள்", "naal"], weekly: ["week", "வாரம்", "vaaram"], monthly: ["month", "மாதம்", "maasam"], quarterly: ["quarter", "காலாண்டு", "kaalaandu"] }[key];
  const before: Words = key === "daily" ? { en: "the day before", ta: "அதற்கு முந்தைய நாள்", tg: "adhukku munnadi naal" }
    : { en: `the ${unitW[0]} before (${dl(p)} to ${dl(a - 1000)})`, ta: `அதற்கு முந்தைய ${unitW[1]} (${dl(p)} முதல் ${dl(a - 1000)} வரை)`, tg: `adhukku munnadi ${unitW[2]} (${dl(p)} to ${dl(a - 1000)})` };
  const span = (from: number, to: number, label: Words): Span => ({ key, range: { from: ist(from), to: ist(to) }, hours: null, label, partial: false, now: false, note: null });
  return { key, cur: span(a, b, w), prev: span(p, a, before), label: { en: `the ${w.en} against ${before.en}`, ta: `${w.ta}, ${before.ta} உடன் ஒப்பிட்டு`, tg: `${w.tg}, ${before.tg} oda compare` } };
}

/**
 * The calendar span just before a finished calendar span, for "against the month before": September before October, the Monday-to-Sunday week before,
 * the day before yesterday before yesterday. Null when the span runs to now (today, this month so far, since a day) or is no calendar unit.
 */
export function prevOf(spec: PeriodSpec, now: string): Span | null {
  const s = spanOf(spec, now);
  if (!s?.range || s.partial || s.now) return null;
  const a = Date.parse(`${s.range.from.replace(" ", "T")}Z`), b = Date.parse(`${s.range.to.replace(" ", "T")}Z`); // wall clock as UTC
  let p: number;
  let label: Words;
  if (spec.kind === "day") { p = a - 864e5; const d = dayLabel(p); label = { en: `the day before (${d})`, ta: `அதற்கு முந்தைய நாள் (${dayTa(p)})`, tg: `adhukku munnadi naal (${d})` }; }
  else if ((spec.kind === "last" && spec.unit === "week") || spec.kind === "lastWeekOf") { p = a - 7 * 864e5; const r = `${dayLabel(p)} to ${dayLabel(a - 864e5)}`; label = { en: `the week before (${r})`, ta: `அதற்கு முந்தைய வாரம் (${r})`, tg: `adhukku munnadi vaaram (${r})` }; }
  else if ((spec.kind === "last" && spec.unit === "month") || spec.kind === "month") { const d = new Date(a); p = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1); const m = new Date(p).getUTCMonth(); label = { en: MONTH_NAMES[m], ta: MONTH_TA[m], tg: MONTH_NAMES[m] }; }
  else if (spec.kind === "last" && spec.unit === "quarter") { const d = new Date(a); p = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 3, 1); label = { en: "the quarter before", ta: "அதற்கு முந்தைய காலாண்டு", tg: "adhukku munnadi kaalaandu" }; }
  else return null;
  if (Date.parse(`${now.replace(" ", "T")}Z`) - p > MAX_HOURS * 3600_000 + 31 * 864e5) return null;
  return { key: s.key, range: { from: wall(p), to: wall(a) }, hours: null, label, partial: false, now: false, note: b - a > 0 ? null : null };
}

/** The console window a span fits in, when it lies wholly inside it (today is inside the last 24 hours; last month is not inside the last 30 days). */
export function heldBy(span: Span, now: string): PeriodKey | null {
  if (span.now) return null;
  if (!span.range) return span.hours == null ? span.key : null;
  const lo = ms(span.range.from), nowMs = ms(now);
  for (const k of ["daily", "weekly", "monthly", "quarterly"] as PeriodKey[]) if (nowMs - lo <= KEY_HOURS[k] * 3600_000 && ms(span.range.to) >= nowMs) return k;
  return null;
}

/** A period spec read back from slots or JSON (only the kinds and fields above survive), or null. */
export function checkSpec(x: unknown): PeriodSpec | null {
  if (!x || typeof x !== "object") return null;
  const s = x as Record<string, unknown>;
  const key = (v: unknown): v is PeriodKey => v === "daily" || v === "weekly" || v === "monthly" || v === "quarterly";
  const int = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
  switch (s.kind) {
    case "none": case "now": case "unheld": return { kind: s.kind };
    case "window": return key(s.key) ? { kind: "window", key: s.key } : null;
    case "compare": return key(s.key) ? { kind: "compare", key: s.key } : null;
    case "day": return s.back === 0 || s.back === 1 || s.back === 2 ? { kind: "day", back: s.back } : null;
    case "last": return s.unit === "week" || s.unit === "month" || s.unit === "quarter" ? { kind: "last", unit: s.unit } : null;
    case "hours": return int(s.hours, 0, MAX_HOURS) && int(s.n, 0, 999) && ["hour", "day", "week", "month"].includes(String(s.unit)) ? { kind: "hours", hours: s.hours as number, n: s.n as number, unit: s.unit as "day" } : null;
    case "lastWeekOf": return int(s.month, 0, 11) && (s.year == null || int(s.year, 2000, 2100)) ? { kind: "lastWeekOf", month: s.month as number, year: (s.year as number) ?? null } : null;
    case "month": return int(s.month, 0, 11) && (s.year == null || int(s.year, 2000, 2100)) ? { kind: "month", month: s.month as number, year: (s.year as number) ?? null } : null;
    case "since": return int(s.month, 0, 11) && int(s.day, 1, 31) ? { kind: "since", month: s.month as number, day: s.day as number } : null;
    case "holiday": { const h = HOLIDAYS.find(([, n]) => n === s.name); return h ? { kind: "holiday", name: h[1], dates: h[2] } : null; }
    default: return null;
  }
}

/** The console window that holds a spec, or stands for it in a label when no clock is at hand (the screen puts the dates on it). */
export function keyOf(s: PeriodSpec): PeriodKey | null {
  switch (s.kind) {
    case "window": case "compare": return s.key;
    case "day": return "daily";
    case "last": return s.unit === "week" ? "weekly" : s.unit === "month" ? "monthly" : "quarterly";
    case "lastWeekOf": return "weekly";
    case "month": case "since": case "holiday": return "monthly";
    case "hours": return s.hours ? keyOfHours(s.hours) : null;
    case "now": return "quarterly";
    default: return null;
  }
}

/** The sentence with every time phrase the reader knows blanked out (for a lane that counts the words it could not read). */
export function periodWordsOut(text: string): string {
  let t = ` ${text} `;
  // the longest phrases first: a comparison holds a month word ("மாதத்தை விட"), and a month word taken out first would leave the rest of it behind
  for (const re of [REF_EN, VS_TG, VS_TA, EITHER_WAY, AGO_EN, AGO_TG, AGO_TA, LAST_WEEK_OF, DAY_BEFORE, SINCE_YESTERDAY, YESTERDAY, ROLLING_LAST, LAST_EN, LAST_TA, THIS_EN, THIS_TA, SPAN_N, SPAN_N_TA, SPAN_W, TODAY, NOW, DAILY, BARE_DAYS, QUARTERLY, WEEKLY, MONTHLY, LAST_LONE])
    t = t.replace(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`), " ");
  return t.replace(/\s+/g, " ");
}

/** Does the spec need its own dates (a calendar span, the current state, a comparison), rather than one of the console's four windows? */
export const needsDates = (s: PeriodSpec): boolean => !["none", "window", "unheld"].includes(s.kind);
