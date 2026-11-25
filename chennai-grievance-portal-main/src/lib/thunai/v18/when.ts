/**
 * v18 (24 Nov): any window the Collector names, for every question. The owner: "it only tells for 24 hours, weekly, monthly and quarterly; if I
 * ask for last 2 days, last 48 hours, last 4 days or a particular date, it should map to the correct date and answer for that".
 *
 * Two readers, one answer: code's own reader of time words (lib/period/read.ts readPeriod: "last 10 days", "on 15 Oct", "between 1 and 15
 * Oct", "yesterday", "since Diwali", in English, Tamil and Tanglish, property-tested) goes first; the AI reader's own reading of the time
 * (v16/reader.ts `time`: the words in English, the calendar days, or the hours back) answers what code cannot read ("last weekend", "on the
 * 20th", "two days ago", "Monday", a time carried from the last turn). Every date is checked here: never in the future, never before the
 * records begin, the first day never after the last.
 *
 * A window that is one of the console's four (24 hours, 7, 30, 90 days) stays a period; anything else is a span with its own dates
 * (`needsDates`), and every screen counts that span itself (screens.ts, recipes/summary.ts).
 */
import { KEY_HOURS, MAX_HOURS, MONTH_NAMES, WINDOW_WORDS, dateWords, daysBounds, prevOf, readPeriod, spanOf, type DayOf, type PeriodKey, type PeriodSpec, type Words } from "@/lib/period/read";

/** What the AI reader understood of the time (v16/reader.ts ReadingSchema.time). */
export interface ReaderTime { said: string | null; from: string | null; to: string | null; hours: number | null }

/** The spans a screen counts with its own dates for any recipe ("now" and "compare" stay the cases list's and the trend's own). */
export const WINDOW_KINDS: ReadonlySet<PeriodSpec["kind"]> = new Set(["hours", "day", "last", "lastWeekOf", "month", "days", "since", "holiday"]);
// ("today" is the console's own Daily window, the last 24 hours: a period, never a span of its own; lib/period/read.ts)
export const isWindowSpec = (s: PeriodSpec | null | undefined): boolean => !!s && WINDOW_KINDS.has(s.kind) && !(s.kind === "day" && s.back === 0);

const ms = (ist: string) => Date.parse(`${ist.replace(" ", "T")}+05:30`);
const ist = (t: number) => new Date(t + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");
/** an instant as the IST wall clock ("2026-11-24 15:05:00"), the shape lib/period/read.ts takes as "now" */
export const istWall = (t: number): string => ist(t);
const DAY = 864e5;

/** "2026-11-20" as a day of the calendar, or null. */
function dayOfIso(s: string | null | undefined): DayOf | null {
  const m = String(s ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  if (mo < 0 || mo > 11 || d < 1 || d > new Date(Date.UTC(y, mo + 1, 0)).getUTCDate()) return null;
  return { day: d, month: mo, year: y };
}
const dayMs = (d: DayOf) => Date.UTC(d.year ?? 2000, d.month, d.day);

/** The window as the AI reader gave it, checked against today: calendar days first, else hours back from now. */
export function readerSpec(rt: ReaderTime | null | undefined, nowIst: string): PeriodSpec | null {
  if (!rt) return null;
  const nowWall = ms(nowIst) + 330 * 60_000;
  if (!Number.isFinite(nowWall)) return null;
  const today = Math.floor(nowWall / DAY) * DAY;
  let a = dayOfIso(rt.from), b = dayOfIso(rt.to);
  if (a && !b) b = a;
  if (b && !a) a = b;
  if (a && b) {
    let x = dayMs(a), y = dayMs(b);
    if (y < x) [x, y, a, b] = [y, x, b, a];
    // a day in the future is today at most; a window wholly in the future, or wholly before the records begin, is none
    if (x > today) return null;
    // (the reader's "today": the Daily window)
    if (x === today && y >= today && !/midnight/i.test(rt.said ?? "")) return { kind: "window", key: "daily" };
    if (y > today) b = dayOfIso(new Date(today).toISOString().slice(0, 10));
    // (a window before the records begin is still the window asked: windowOf says the records do not reach it, never another window)
    return { kind: "days", from: a!, to: b! };
  }
  const h = Number(rt.hours);
  if (Number.isFinite(h) && h >= 1 && h <= MAX_HOURS) return hoursSpec(Math.round(h));
  return null;
}

/** A count back from now: one of the console's four windows when it is one, else that many hours (said in days when whole days). */
export function hoursSpec(h: number): PeriodSpec {
  const key = (Object.keys(KEY_HOURS) as PeriodKey[]).find((k) => KEY_HOURS[k] === h);
  if (key) return { kind: "window", key };
  return h >= 48 && h % 24 === 0 ? { kind: "hours", hours: h, n: h / 24, unit: "day" } : { kind: "hours", hours: h, n: h, unit: "hour" };
}

const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2,
  oru: 1, rendu: 2, irandu: 2, moonu: 3, naalu: 4, anju: 5, aaru: 6, ezhu: 7, ettu: 8, onbadhu: 9, pathu: 10 };
const TA_NUM: [RegExp, number][] = [[/ஒரு|ஒன்று/, 1], [/இரண்டு|ரெண்டு/, 2], [/மூன்று|மூணு/, 3], [/நான்கு|நாலு/, 4], [/ஐந்து|அஞ்சு/, 5], [/ஆறு/, 6], [/ஏழு/, 7], [/எட்டு/, 8], [/ஒன்பது/, 9], [/பத்து/, 10]];

/**
 * "two days ago", "3 days back", "rendu naal munnadi", "இரண்டு நாட்களுக்கு முன்": that calendar day (lib/period/read.ts calls it a time the
 * records cannot answer, for Ask District IQ's lane; for Jarvis it is a day like any other). Weeks ago: that week, seven days.
 */
export function agoSpec(text: string, nowIst: string): PeriodSpec | null {
  const t = ` ${text.toLowerCase()} `;
  let n: number | null = null, unit: "day" | "week" | null = null;
  const en = t.match(/\b(\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|couple of)\s+(days?|weeks?)\s+(?:ago|back|before|earlier)\b/);
  if (en) { n = /^\d/.test(en[1]) ? Number(en[1]) : NUM_WORDS[en[1].replace(/ of$/, "")] ?? null; unit = en[2].startsWith("week") ? "week" : "day"; }
  const tg = !en && t.match(/\b(\d{1,3}|oru|rendu|irandu|moonu|naalu|anju|aaru|ezhu|ettu|onbadhu|pathu)\s+(naal|vaaram)[a-z]*\s+(?:munnadi|munnaadi|mundhi|munbu|mun)\b/);
  if (tg) { n = /^\d/.test(tg[1]) ? Number(tg[1]) : NUM_WORDS[tg[1]] ?? null; unit = tg[2].startsWith("vaar") ? "week" : "day"; }
  const ta = !en && !tg ? t.match(/(\d{1,3}|ஒரு|ஒன்று|இரண்டு|ரெண்டு|மூன்று|மூணு|நான்கு|நாலு|ஐந்து|அஞ்சு|ஆறு|ஏழு|எட்டு|ஒன்பது|பத்து)\s*(நாள்|நாட்க|நாளைக்|வார)[஀-௿]*\s*(?:முன்பு|முன்னாடி|முன்னர்|முன்)/) : null;
  if (ta) { n = /^\d/.test(ta[1]) ? Number(ta[1]) : TA_NUM.find(([re]) => re.test(ta[1]))?.[1] ?? null; unit = ta[2].startsWith("வார") ? "week" : "day"; }
  if (!n || !unit || n < 1) return null;
  const nowWall = ms(nowIst) + 330 * 60_000;
  if (!Number.isFinite(nowWall)) return null;
  const today = Math.floor(nowWall / DAY) * DAY;
  const back = unit === "day" ? n : n * 7;
  if (back * 24 > MAX_HOURS) return null;
  const end = today - back * DAY, start = unit === "day" ? end : end - 6 * DAY;
  const d = (x: number): DayOf => { const z = new Date(x); return { day: z.getUTCDate(), month: z.getUTCMonth(), year: z.getUTCFullYear() }; };
  return { kind: "days", from: d(start), to: d(end) };
}

/**
 * The window a turn names, or null when it names none of its own (the console's four windows stay periods: `period` carries them). Code's
 * reading of the sentence first, then the reader's words read by code, then the reader's own dates or hours, then "N days ago".
 */
export function turnWhen(text0: string, rt: ReaderTime | null | undefined, nowIst: string): PeriodSpec | null {
  const text = dateWords(text0);
  const code = readPeriod(text);
  if (isWindowSpec(code)) return code;
  // a time code reads as the console's own window ("this week", "last 7 days") is a period, not a span; "open now" and "up or down from last
  // month" are the lanes' own (the cases open now; a window against the one before)
  if (code.kind === "window" || code.kind === "now" || code.kind === "compare" || isToday(code)) return null;
  if (rt?.said) {
    const said = readPeriod(dateWords(rt.said));
    if (isWindowSpec(said)) return said;
    if (isToday(said) || (said.kind === "window" && !rt.from && !rt.to)) return null;
  }
  const r = readerSpec(rt, nowIst);
  if (r && (isWindowSpec(r))) return r;
  if (r?.kind === "window") return null;
  return agoSpec(text, nowIst) ?? (rt?.said ? agoSpec(rt.said, nowIst) : null);
}

export { dateWords } from "@/lib/period/read";

/**
 * v18 round 2 (24 Nov, the owner's own words in the log: "Give me. From March 30, 2026 to April 30, 2026." was answered "which one do you
 * mean?"): whether a sentence names a window and asks for nothing else ("what about the last four days?", "and from 1 to 15 November",
 * "how was it yesterday"). Only English words are read; a sentence with any other word ("prices", "Adyar", "crimes") is not window-only.
 */
const WINDOW_FILLER = new Set(("hey hi hello ok okay jarvis please pls now so then and also just only give show tell me us let see look check can could would you i " +
  "want need the a an what whats about how hows was were is are it its things everything all data details report picture status situation summary " +
  "overview update updates happened happening going on for of in during over within period time window between from to till until through " +
  "since at last past previous this that these those day days hour hours week weeks month months year years ago today yesterday tonight " +
  "morning afternoon evening night jan january feb february mar march apr april may jun june jul july aug august sep sept september oct " +
  "october nov november dec december one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen " +
  "seventeen eighteen nineteen twenty thirty forty fifty sixty ninety hundred first second third fourth fifth sixth seventh eighth ninth " +
  "tenth st nd rd th same again").split(" "));
export function windowOnly(text: string): boolean {
  if (/[^\x00-\x7F]/.test(text)) return false;
  const words = text.toLowerCase().replace(/'s\b/g, "s").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  return words.length > 0 && words.every((w) => WINDOW_FILLER.has(w) || /^\d+(st|nd|rd|th)?$/.test(w));
}

/** "today" (since midnight): the console's 24-hour window answers it on the screens that know only their four windows */
export const isToday = (s: PeriodSpec | null | undefined): boolean => !!s && s.kind === "day" && s.back === 0;

/** One calendar day as a span (a day on a trend, clicked). */
export function daySpec(isoDay: string): PeriodSpec | null {
  const d = dayOfIso(isoDay.slice(0, 10));
  return d ? { kind: "days", from: d, to: d } : null;
}

/** The console window that holds a span's length best (for the four buttons and tools that know only them). */
export const keyOfHours = (h: number): PeriodKey => (h <= 24 ? "daily" : h <= 168 ? "weekly" : h <= 720 ? "monthly" : "quarterly");

/** A window with its bounds on the IST wall clock: what every v18 read counts. */
export interface Win {
  from: string; to: string; hours: number; label: Words; key: PeriodKey;
  /** the window of the same length just before it */
  prev: { from: string; to: string; label: Words };
  /** it runs up to now */
  partial: boolean;
  /** a window of its own dates, not one of the console's four */
  custom: boolean;
  note: string | null;
  /**
   * v18 round 2: the window asked reaches back before the records begin (the store keeps about 180 days): "all", nothing of it is held (the
   * screen says so, never another window); "part", it is counted from the records' first day (from is moved there, and the note says it)
   */
  outside: "all" | "part" | "future" | null;
  /** the first day the records hold, IST */
  heldFrom: string;
  /** v18 round 2: a count back from now (the console's own windows, "last 48 hours"): counted as the console counts it, after its start and up to now */
  rolling: boolean;
  /**
   * v18 round 2's review: the window before lies wholly inside the records. When it does not (it reaches before 28 May), its count is short
   * or nothing, and no change against it is said ("up from 0" was said as if real)
   */
  prevHeld: boolean;
}

const dl = (wall: number) => new Date(wall).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const MONTH_TA = ["ஜன.", "பிப்.", "மார்.", "ஏப்.", "மே", "ஜூன்", "ஜூலை", "ஆக.", "செப்.", "அக்.", "நவ.", "டிச."];
const dlTa = (wall: number) => { const d = new Date(wall); return `${d.getUTCDate()} ${MONTH_TA[d.getUTCMonth()]}`; };

/** The window a screen counts: the span's own dates when it has one, else the console's window back from now. */
export function windowOf(spec: PeriodSpec | null | undefined, key: PeriodKey, nowIst: string): Win {
  const nowMs = ms(nowIst);
  const toNow = ist(nowMs + 1000);
  const heldFromMs = Math.floor((nowMs + 330 * 60_000 - MAX_HOURS * 3600_000) / DAY) * DAY - 330 * 60_000;
  const heldFrom = ist(heldFromMs);
  const span = spec && isWindowSpec(spec) ? spanOf(spec, nowIst) : null;
  // a calendar window lib/period/read.ts will not date (it lies before the records begin): dated here, so the screen can say so
  const old = !span && spec ? oldRange(spec, nowIst) : null;
  // a calendar window said with its year that has not begun ("on 5 December 2026" on 24 Nov): named, never answered with another window
  const ahead = !span && !old && spec ? aheadRange(spec, nowIst) : null;
  let from: string, to: string, label: Words, partial = true, note: string | null = null, outside: Win["outside"] = null, custom = !!span, rolling = false;
  if (span?.range) {
    from = span.range.from; to = span.range.to; label = span.label; partial = span.partial; note = span.note;
  } else if (span?.hours) {
    from = ist(nowMs - span.hours * 3600_000); to = toNow; label = span.label; note = span.note; rolling = true;
  } else if (old) {
    from = old.from; to = old.to; label = old.label; partial = false; custom = true;
  } else if (ahead) {
    from = ahead.from; to = ahead.to; label = ahead.label; partial = false; custom = true; outside = "future";
  } else {
    from = ist(nowMs - KEY_HOURS[key] * 3600_000); to = toNow; label = WINDOW_WORDS[key]; rolling = true;
  }
  if (outside === "future") { /* named as to come */ }
  else if (custom && ms(to) <= heldFromMs) outside = "all";
  else if (custom && ms(from) < heldFromMs) {
    outside = "part";
    note = `The records begin on ${dl(heldFromMs + 330 * 60_000)}, so this window is counted from then.`;
    from = heldFrom;
  }
  // (in whole hours: a window that runs to now ends a second past it, so the store's as-of second is inside; the one before is as long as asked)
  const a = ms(from), b = ms(to), len = Math.max(3600_000, Math.round((b - a) / 3600_000) * 3600_000);
  const hours = Math.round(len / 3600_000);
  // the window before. A calendar window still running ("today", "since 20 Nov") is set against the same hours of the days before it, shifted
  // by whole days so the time of day matches (v18 round 2's review: "today" to 3 PM was set against yesterday's last 15 hours, and called the
  // whole day before); every other window, the same length just before it
  const shift = custom && partial && !rolling ? Math.ceil(len / DAY) * DAY : len;
  // (a finished calendar period, "yesterday", "last week", "October", is set against the calendar period before it, "September", as Ask
  // District IQ sets it (lib/period/read.ts prevOf): one question, one "before" figure in both lanes)
  const cal = span && !span.partial && spec ? prevOf(spec, nowIst) : null;
  const pa = cal?.range ? ms(cal.range.from) : a - shift, pb = cal?.range ? ms(cal.range.to) : shift === len ? a : b - shift;
  // the window before, in words with its dates ("the 2 days before (20 Nov to 22 Nov)")
  const wa = pa + 330 * 60_000, wb = pb - 1000 + 330 * 60_000;
  const sameDay = dl(wa) === dl(wb);
  const toHour = shift !== len;
  const prevLabel: Words = cal?.range ? cal.label : toHour && sameDay
    ? { en: `the day before, to the same hour (${dl(wa)})`, ta: `அதற்கு முந்தைய நாள், அதே நேரம் வரை (${dlTa(wa)})`, tg: `munnadi naal, adhe neram varai (${dl(wa)})` }
    : toHour
      ? { en: `the same stretch before (${dl(wa)} to ${dl(wb)})`, ta: `அதற்கு முந்தைய அதே காலம் (${dlTa(wa)} முதல் ${dlTa(wb)} வரை)`, tg: `munnadi (${dl(wa)} to ${dl(wb)})` }
      : hours <= 24 && sameDay
        ? { en: `the day before (${dl(wa)})`, ta: `அதற்கு முந்தைய நாள் (${dlTa(wa)})`, tg: `munnadi naal (${dl(wa)})` }
        : { en: `the ${hours <= 72 && (hours % 24 || hours === 24) ? `${hours} hours` : `${Math.round(hours / 24)} days`} before (${dl(wa)} to ${dl(wb)})`,
          ta: `அதற்கு முந்தைய ${hours <= 72 && (hours % 24 || hours === 24) ? `${hours} மணி நேரம்` : `${Math.round(hours / 24)} நாட்கள்`} (${dlTa(wa)} முதல் ${dlTa(wb)} வரை)`,
          tg: `munnadi (${dl(wa)} to ${dl(wb)})` };
  return { from, to, hours, label, key: span ? span.key : old ? keyOfHours(hours) : key, prev: { from: ist(pa), to: ist(pb), label: prevLabel }, partial, custom, note, outside, heldFrom, rolling,
    prevHeld: pa >= heldFromMs };
}

/** The bounds of a calendar window older than the records ("30 Mar to 30 Apr 2026", "in April"), which lib/period/read.ts spanOf leaves undated. */
function oldRange(spec: PeriodSpec, nowIst: string): { from: string; to: string; label: Words } | null {
  const nowWall = ms(nowIst) + 330 * 60_000;
  if (!Number.isFinite(nowWall)) return null;
  const year = new Date(nowWall).getUTCFullYear();
  const wall = (t: number) => new Date(t).toISOString().slice(0, 19).replace("T", " ");
  const yr = (t: number) => ` ${new Date(t).getUTCFullYear()}`;
  if (spec.kind === "days") {
    // (the year a speaker leaves out is filled in as every lane fills it: lib/period/read.ts daysBounds)
    const bounds = daysBounds(spec, nowWall);
    if (!bounds || bounds.a > nowWall) return null;
    const { a, b } = bounds;
    const en = a === b ? `${dl(a)}${yr(a)}` : `${dl(a)} to ${dl(b)}${yr(b)}`;
    return { from: wall(a), to: wall(Math.min(b + DAY, nowWall + 1000)), label: { en, ta: a === b ? `${dlTa(a)}${yr(a)}` : `${dlTa(a)} முதல் ${dlTa(b)}${yr(b)} வரை`, tg: en } };
  }
  if (spec.kind === "month") {
    let y = spec.year ?? year;
    if (spec.year == null && Date.UTC(y, spec.month, 1) > nowWall) y -= 1;
    const a = Date.UTC(y, spec.month, 1), b = Date.UTC(spec.month === 11 ? y + 1 : y, spec.month === 11 ? 0 : spec.month + 1, 1);
    if (a > nowWall) return null;
    const en = `${MONTH_NAMES[spec.month]} ${y}`;
    return { from: wall(a), to: wall(Math.min(b, nowWall + 1000)), label: { en, ta: `${MONTH_TA[spec.month]} ${y}`, tg: en } };
  }
  return null;
}

/** The bounds of a calendar window said with its year that has not begun yet ("5 December 2026", "December 2026" on 24 Nov), or null. */
function aheadRange(spec: PeriodSpec, nowIst: string): { from: string; to: string; label: Words } | null {
  const nowWall = ms(nowIst) + 330 * 60_000;
  if (!Number.isFinite(nowWall)) return null;
  const wall = (t: number) => new Date(t).toISOString().slice(0, 19).replace("T", " ");
  let a: number | null = null, b = 0, en = "", taL = "";
  if (spec.kind === "days" && (spec.from.year != null || spec.to.year != null)) {
    const bounds = daysBounds(spec, nowWall);
    if (!bounds) return null;
    a = bounds.a; b = bounds.b + DAY;
    const y = ` ${new Date(bounds.b).getUTCFullYear()}`;
    en = bounds.a === bounds.b ? `${dl(bounds.a)}${y}` : `${dl(bounds.a)} to ${dl(bounds.b)}${y}`;
    taL = bounds.a === bounds.b ? `${dlTa(bounds.a)}${y}` : `${dlTa(bounds.a)} முதல் ${dlTa(bounds.b)}${y} வரை`;
  } else if (spec.kind === "month" && spec.year != null) {
    a = Date.UTC(spec.year, spec.month, 1); b = Date.UTC(spec.month === 11 ? spec.year + 1 : spec.year, (spec.month + 1) % 12, 1);
    en = `${MONTH_NAMES[spec.month]} ${spec.year}`; taL = `${MONTH_TA[spec.month]} ${spec.year}`;
  }
  if (a == null || a <= nowWall) return null;
  return { from: wall(a), to: wall(b), label: { en, ta: taL, tg: en } };
}

/** A window screen's read found the window wholly before the records: screens.ts says so in place of the screen. */
export class OutsideRecords extends Error {
  constructor(readonly w: Win) { super("the window lies before the records begin"); this.name = "OutsideRecords"; }
}

/** "the records begin on 28 May 2026 (they keep about the last 180 days)", for a screen whose window lies before them */
export function beforeRecords(w: Pick<Win, "heldFrom" | "label"> & { outside?: Win["outside"] }): { en: string; ta: string } {
  const d = boundWords(w.heldFrom.slice(0, 10) + " 00:00");
  const y = w.heldFrom.slice(0, 4);
  // (v18 round 2's review: a date to come, said with its year, is said to be so: it was answered for the last 7 days)
  if (w.outside === "future") return {
    en: `${w.label.en} has not come yet, so nothing is held for it. Ask for a day that has passed.`,
    ta: `${w.label.ta} இன்னும் வரவில்லை; அதற்குத் தரவு இல்லை. கடந்துவிட்ட ஒரு நாளைக் கேளுங்கள்.`
  };
  return {
    en: `Nothing is held for ${w.label.en}: the district's records begin on ${d} ${y} (they keep about the last 180 days). Ask for any day from ${d} onward.`,
    ta: `${w.label.ta}: தரவு இல்லை. மாவட்டப் பதிவுகள் ${d} ${y} முதல் மட்டுமே உள்ளன (சுமார் கடைசி 180 நாட்கள்).`
  };
}

/**
 * A window's label as a sentence says it after a verb: "over the last 2 days", "on 20 Nov", "from 15 Nov to 20 Nov", "in November 2026",
 * "yesterday (23 Nov)", "since 1 Nov".
 */
export function overWords(label: string): string {
  const l = label.trim();
  if (/^last\b/i.test(l)) return `over the ${l}`;
  if (/^(yesterday|today|since|the |open now)/i.test(l)) return l;
  // ("15 Sept": the date words write September with four letters)
  if (/^\d{1,2} [A-Z][a-z]{2,3}(?: \d{4})?$/.test(l)) return `on ${l}`;
  if (/ to /.test(l)) return `from ${l}`;
  return `in ${l}`;
}

/** "22 Nov, 4 PM" for an IST wall-clock bound. */
export function boundWords(t: string): string {
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return t;
  const h = Number(m[4]);
  const day = `${Number(m[3])} ${MONTH_NAMES[Number(m[2]) - 1].slice(0, 3)}`;
  return m[4] === "00" && m[5] === "00" ? day : `${day}, ${h % 12 || 12}${m[5] !== "00" ? `:${m[5]}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

/** The days a window covers, IST calendar days, oldest first (a trend's x axis). At most 120. */
export function daysOf(w: Pick<Win, "from" | "to">): string[] {
  const a = Math.floor((ms(w.from) + 330 * 60_000) / DAY) * DAY, b = ms(w.to) + 330 * 60_000 - 1000;
  const out: string[] = [];
  for (let t = a; t <= b && out.length < 120; t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
