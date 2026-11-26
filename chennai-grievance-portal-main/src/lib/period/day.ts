/**
 * The console's Daily window, in ONE place (26 Nov 2026, the owner: "keep the news and incidents for 12 a.m. to 12 a.m., 24 hours").
 *
 * Daily is the calendar day in India, not the 24 hours before the clock: it starts at 12 AM and runs to now (to 12 AM tonight), so
 * nothing that was on the page during the day leaves it before the day is over. Small hours: from 12 AM until 6 AM the day that began at
 * 12 AM yesterday goes on, so the desk never opens to an empty page at 1 AM; at 6 AM the day is today's, from 12 AM.
 *
 *   dayStart(now), dayWindow(now)     12 AM to now (both ends inside)
 *   dayWindow(now, 1)                 the comparison, the same hours one day earlier: "yesterday by this time" (a figure of the day so far
 *                                     set against a whole day, or against a rolling one, always looked like a fall)
 *   wholeDay(now, 1)                  "yesterday" as a person means it: the whole calendar day before today's date, 12 AM to 12 AM
 *   dayBuckets(now)                   the day's chart: 2-hour buckets from 12 AM (12 AM, 2 AM, 4 AM ...), up to the one now is in
 *
 * A question that says "the last 24 hours" still means the 24 hours before the clock (lib/period/read.ts), and weekly, monthly and
 * quarterly are the last 7, 30 and 90 days back from now (lib/collector/intel.ts).
 *
 * Pure: no database, no clock of its own (the words default to the clock when no `now` is given). `now` is the IST wall clock
 * "YYYY-MM-DD HH:MM:SS" that asOf() returns.
 */

/** The hour (IST) the desk's day changes: before it, yesterday's day still goes on. */
export const DAY_ROLLS_AT = 6;
/** The length of one bucket of the day's charts, hours. */
export const DAY_BUCKET_HOURS = 2;

const DAY_MS = 864e5;
const HOUR_MS = 3600_000;
const ms = (wall: string) => Date.parse(`${wall.replace(" ", "T")}Z`);
const wallOf = (t: number) => new Date(t).toISOString().slice(0, 19).replace("T", " ");

/** The IST wall clock now, "YYYY-MM-DD HH:MM:SS". */
export const istClock = (at: number = Date.now()): string => wallOf(at + 330 * 60_000);

/** A wall clock as this file reads it; a value that is none falls back to the clock. */
function clean(now: string | null | undefined): string {
  const t = String(now ?? "").trim().replace("T", " ").slice(0, 19);
  const full = /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t} 00:00:00` : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t) ? `${t}:00` : t;
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(full) && Number.isFinite(ms(full)) ? full : istClock();
}

// ------------------------------------------------------------------ the window --

/** Between 12 AM and 6 AM: the day that began at 12 AM yesterday still goes on. */
export function smallHours(now: string): boolean {
  return Number(clean(now).slice(11, 13)) < DAY_ROLLS_AT;
}

/** The start of the day the desk is in, "YYYY-MM-DD 00:00:00". */
export function dayStart(now: string): string {
  const t = clean(now);
  const midnight = ms(`${t.slice(0, 10)} 00:00:00`);
  return wallOf(smallHours(t) ? midnight - DAY_MS : midnight);
}

/** The day the desk is in, by its date: the key of anything kept "for the day". */
export const dayKey = (now: string): string => dayStart(now).slice(0, 10);

/** When the desk's day ends and the next one starts: 6 AM after the midnight that closes it. */
export const dayRollsAt = (now: string): string => wallOf(ms(dayStart(now)) + DAY_MS + DAY_ROLLS_AT * HOUR_MS);

/** The Daily window, both ends inside. `back` 1: the same hours one day earlier (the comparison), 2: two days earlier. */
export function dayWindow(now: string, back = 0): { from: string; to: string } {
  const t = clean(now);
  return { from: wallOf(ms(dayStart(t)) - back * DAY_MS), to: wallOf(ms(t) - back * DAY_MS) };
}

/** A whole calendar day, from its 12 AM up to (not including) the next 12 AM. `back` 1 is yesterday, by today's date on the calendar. */
export function wholeDay(now: string, back = 1): { from: string; before: string } {
  const midnight = ms(`${clean(now).slice(0, 10)} 00:00:00`);
  return { from: wallOf(midnight - back * DAY_MS), before: wallOf(midnight - (back - 1) * DAY_MS) };
}

/** Hours from the start of the day to now (0 to 24; up to 30 in the small hours). */
export const dayHours = (now: string): number => (ms(clean(now)) - ms(dayStart(now))) / HOUR_MS;

/** How many 2-hour buckets the day has so far, the one now is in included. */
export const dayBuckets = (now: string): number => Math.floor(dayHours(now) / DAY_BUCKET_HOURS) + 1;

/** Is a stored time inside the day the desk is in? */
export function inDay(t: unknown, now: string): boolean {
  const x = String(t ?? "").replace("T", " ").slice(0, 19);
  const w = dayWindow(now);
  return x >= w.from && x <= w.to;
}

// ------------------------------------------------------------------ the periods --

/**
 * The console's reporting windows. `resolved` is the Resolved tile's name on the console and in the PDF, which says that window
 * (console-sync-01, hunt2-ops-10). This table holds the daytime words; periodInfo() gives the ones for a time, with the day's own length
 * and chart buckets.
 */
export interface PeriodInfo { hours: number; buckets: number; unit: string; prev: string; label: string; word: string; resolved: string }
export const PERIODS = {
  daily: { hours: 24, buckets: 12, unit: "Day", prev: "yesterday by this time", label: "Today (since 12 AM)", word: "Daily", resolved: "Resolved today" },
  weekly: { hours: 168, buckets: 7, unit: "Week", prev: "prev. week", label: "Last 7 days", word: "Weekly", resolved: "Resolved, last 7 days" },
  monthly: { hours: 720, buckets: 30, unit: "Month", prev: "prev. month", label: "Last 30 days", word: "Monthly", resolved: "Resolved, last 30 days" },
  quarterly: { hours: 2160, buckets: 13, unit: "Quarter", prev: "prev. quarter", label: "Last 90 days", word: "Quarterly", resolved: "Resolved, last 90 days" }
} as const;
export type Period = keyof typeof PERIODS;

/**
 * A period's table row at a time: for Daily the words of the day the desk is in, and the day so far as its chart draws it, in 2-hour buckets
 * from 12 AM up to the one now is in (`hours` is those buckets' length, so hours / buckets is one bucket's).
 */
export function periodInfo(period: Period, now: string): PeriodInfo {
  if (period !== "daily") return PERIODS[period];
  const w = dayWords(now).en, buckets = dayBuckets(now);
  return { ...PERIODS.daily, hours: buckets * DAY_BUCKET_HOURS, buckets, label: w.label, prev: w.prev, resolved: w.resolved };
}
/** The period inside a line: "today (since 12 AM)", "last 7 days". */
export const periodLower = (period: Period, now?: string | null): string => (period === "daily" ? dayWords(now).en.lower : PERIODS[period].label.toLowerCase());
/** The period after a verb: "reported today", "reported in the last 7 days". */
export const periodIn = (period: Period, now?: string | null): string => (period === "daily" ? dayWords(now).en.inWords : `in the ${PERIODS[period].label.toLowerCase()}`);
/** A period's own label inside a line, its capitals kept: "today (since 12 AM)", "last 7 days". */
export const labelLower = (label: string): string => label.charAt(0).toLowerCase() + label.slice(1);
/** A period's own label after a verb: "reported today (since 12 AM)", "reported in the last 7 days". */
export const labelIn = (label: string): string => (/^last\b/i.test(label) ? `in the ${labelLower(label)}` : labelLower(label));
/** The window before, named: "yesterday by this time", "the prev. week". */
export const periodBefore = (period: Period, now?: string | null): string => (period === "daily" ? dayWords(now).en.prev : `the ${PERIODS[period].prev}`);
/** How many hours of the period lie before now (Daily: since 12 AM). */
export const periodHours = (period: Period, now: string): number => (period === "daily" ? dayHours(now) : PERIODS[period].hours);

// ------------------------------------------------------------------- the words --

export interface DayWords {
  /** a heading: "Today (since 12 AM)" */
  label: string;
  /** inside a line: "today (since 12 AM)" */
  lower: string;
  /** inside brackets or a list of words: "today, since 12 AM" */
  plain: string;
  /** after a verb, and spoken (no figure in it): "reported today", "reported since the start of yesterday" */
  inWords: string;
  /** the comparison: "yesterday by this time" */
  prev: string;
  /** the Resolved tile: "Resolved today" */
  resolved: string;
  /** one or two words for a tile's corner: "today" */
  short: string;
}
export interface DayWordsAll { en: DayWords; ta: DayWords; tg: DayWords }

const DAYTIME: DayWordsAll = {
  en: { label: "Today (since 12 AM)", lower: "today (since 12 AM)", plain: "today, since 12 AM", inWords: "today", prev: "yesterday by this time", resolved: "Resolved today", short: "today" },
  ta: { label: "இன்று (நள்ளிரவு 12 மணி முதல்)", lower: "இன்று (நள்ளிரவு 12 மணி முதல்)", plain: "இன்று, நள்ளிரவு 12 மணி முதல்", inWords: "இன்று", prev: "நேற்று இதே நேரம் வரை", resolved: "இன்று தீர்க்கப்பட்டவை", short: "இன்று" },
  tg: { label: "Inniki (raathiri 12 mani mudhal)", lower: "inniki (raathiri 12 mani mudhal)", plain: "inniki, raathiri 12 mani mudhal", inWords: "inniki", prev: "netru idhe neram varai", resolved: "Inniki resolve aanavai", short: "inniki" }
};
const SMALL: DayWordsAll = {
  en: { label: "Since 12 AM yesterday", lower: "since 12 AM yesterday", plain: "since 12 AM yesterday", inWords: "since the start of yesterday", prev: "the day before by this time", resolved: "Resolved since 12 AM yesterday", short: "since yesterday" },
  ta: { label: "நேற்று நள்ளிரவு 12 மணி முதல்", lower: "நேற்று நள்ளிரவு 12 மணி முதல்", plain: "நேற்று நள்ளிரவு 12 மணி முதல்", inWords: "நேற்றின் தொடக்கம் முதல்", prev: "அதற்கு முந்தைய நாள் இதே நேரம் வரை", resolved: "நேற்று நள்ளிரவு 12 மணி முதல் தீர்க்கப்பட்டவை", short: "நேற்று முதல்" },
  tg: { label: "Netru raathiri 12 mani mudhal", lower: "netru raathiri 12 mani mudhal", plain: "netru raathiri 12 mani mudhal", inWords: "netru aarambathula irundhu", prev: "munthaa naal idhe neram varai", resolved: "Netru raathiri 12 mani mudhal resolve aanavai", short: "netru mudhal" }
};

/** the clock a text with no `now` of its own is written at (a unit test's is always daytime, so its words do not change with the night) */
const textClock = (): string => (typeof process !== "undefined" && process.env?.VITEST ? "2026-01-01 12:00:00" : istClock());

/** What the Daily window is called at this time; with no `now`, at this moment in India. */
export function dayWords(now?: string | null): DayWordsAll {
  return smallHours(now == null ? textClock() : now) ? SMALL : DAYTIME;
}

/** The words of the Daily window that never change with the clock (a constant table): the daytime ones. */
export const DAY_WORDS: DayWordsAll = DAYTIME;
/** The words from 12 AM to 6 AM. */
export const SMALL_HOURS_WORDS: DayWordsAll = SMALL;
