/**
 * The time a search names (28 Nov 2026, the owner: "if I search for some news that was reported 52 days ago, I couldn't find it").
 *
 * The search box reads dates with the product's one reader of time words (lib/period/read.ts readPeriod, used by Jarvis and Ask District
 * IQ): "3 October", "on 7/10/2026", "1 Oct to 15 Oct", "October", "last week", "last month", "yesterday", "today", "since Diwali", Tamil
 * month names (அக்டோபர் 3). Two differences, both because a search looks back through the whole record and a question about counts does not:
 *
 *   - "52 days ago", "3 weeks ago", "2 months ago" (and the Tamil and Tanglish forms, "52 நாட்களுக்கு முன்", "52 naal munnadi") name that
 *     calendar day, that Monday-to-Sunday week, that calendar month. readPeriod calls these "unheld" (a count cannot be answered for them);
 *     a search can show what was reported then.
 *   - no 180-day cap: the news record goes back to August 2026 and further; a day before what the store holds simply finds nothing.
 *
 * Pure: no clock of its own. `now` is the store's IST wall clock "YYYY-MM-DD HH:MM:SS" (intel.asOf()). Bounds are IST wall-clock strings,
 * `from` inclusive and `to` exclusive, the form every store column (published_at, observed_at, first_reported_at) is kept in.
 */
import { MONTH_NAMES, dateWords, daysBounds, periodWordsOut, readPeriod, spanOf, type PeriodSpec } from "@/lib/period/read";
import { englishMonths } from "@/lib/windowspan";
import { dayStart } from "@/lib/period/day";

export interface When {
  /** IST wall clock, inclusive */ from: string;
  /** IST wall clock, exclusive */ to: string;
  /** in words, with its dates: "7 Oct 2026 (52 days ago)", "October 2026", "last week (16 Nov to 22 Nov)" */
  label: string;
  /** the one calendar day it is, "YYYY-MM-DD" (null: a span of days) */
  day: string | null;
  /** it runs up to now (today, this month so far) */
  partial: boolean;
}
export interface SearchWhen {
  when: When | null;
  /** the search with its time words taken out: what to look for */
  topic: string;
  /** a time was named that the search could not place ("next week", "a few days ago"): every day is searched, and the box says so */
  unread: boolean;
}

const DAY = 864e5;
/** wall clock as UTC milliseconds, and back */
const wallMs = (w: string) => Date.parse(`${w.replace(" ", "T").slice(0, 19)}Z`);
const wall = (t: number) => new Date(t).toISOString().slice(0, 19).replace("T", " ");
const short = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const withYear = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// ------------------------------------------------------------------ "N days ago" --

const NUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  oru: 1, rendu: 2, irandu: 2, moonu: 3, naalu: 4, anju: 5,
  "ஒரு": 1, "இரண்டு": 2, "மூன்று": 3, "நான்கு": 4, "ஐந்து": 5
};
const NUM_ALT = String.raw`(\d{1,3}|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|oru|rendu|irandu|moonu|naalu|anju|ஒரு|இரண்டு|மூன்று|நான்கு|ஐந்து)`;
/** "52 days ago", "3 weeks back", "two months before"; Tanglish "52 naal munnadi"; Tamil "52 நாட்களுக்கு முன்", "3 வாரங்களுக்கு முன்பு" */
const AGO: [RegExp, "day" | "week" | "month"][] = [
  [new RegExp(String.raw`\b${NUM_ALT}\s+days?\s+(?:ago|back|before|earlier)\b`, "i"), "day"],
  [new RegExp(String.raw`\b${NUM_ALT}\s+weeks?\s+(?:ago|back|before|earlier)\b`, "i"), "week"],
  [new RegExp(String.raw`\b${NUM_ALT}\s+months?\s+(?:ago|back|before|earlier)\b`, "i"), "month"],
  [new RegExp(String.raw`\b${NUM_ALT}\s+naal[a-z]*\s+(?:munnaadi|munnadi|mundhi|munbu|mun)\b`, "i"), "day"],
  [new RegExp(String.raw`\b${NUM_ALT}\s+vaara[a-z]*\s+(?:munnaadi|munnadi|mundhi|munbu|mun)\b`, "i"), "week"],
  [new RegExp(String.raw`\b${NUM_ALT}\s+(?:maasa|maatha)[a-z]*\s+(?:munnaadi|munnadi|mundhi|munbu|mun)\b`, "i"), "month"],
  [new RegExp(String.raw`${NUM_ALT}\s*(?:நாட்களுக்கு|நாளுக்கு|நாள்|நாட்கள்)\s*(?:முன்பு|முன்னர்|முன்னாடி|முன்)(?![஀-௿])`, "u"), "day"],
  [new RegExp(String.raw`${NUM_ALT}\s*(?:வாரங்களுக்கு|வாரத்துக்கு|வாரம்)\s*(?:முன்பு|முன்னர்|முன்னாடி|முன்)(?![஀-௿])`, "u"), "week"],
  [new RegExp(String.raw`${NUM_ALT}\s*(?:மாதங்களுக்கு|மாதத்துக்கு|மாதம்)\s*(?:முன்பு|முன்னர்|முன்னாடி|முன்)(?![஀-௿])`, "u"), "month"]
];
const numOf = (w: string): number | null => (/^\d+$/.test(w) ? Number(w) : NUM[w.toLowerCase()] ?? null);

/** "52 days ago" as dates; null when the text has no such phrase. `said` is the phrase as written. */
export function agoIn(text: string, now: string): { when: When; said: string } | null {
  for (const [re, unit] of AGO) {
    const m = re.exec(text);
    if (!m) continue;
    const n = numOf(m[1]);
    if (n == null || n < 1 || n > 800) continue;
    const today = wallMs(`${now.slice(0, 10)} 00:00:00`);
    if (!Number.isFinite(today)) return null;
    const nowT = wallMs(now);
    const ago = `${n} ${unit}${n === 1 ? "" : "s"} ago`;
    if (unit === "day") {
      const a = today - n * DAY;
      return { said: m[0], when: { from: wall(a), to: wall(a + DAY), label: `${withYear(a)} (${ago})`, day: wall(a).slice(0, 10), partial: false } };
    }
    if (unit === "week") {
      const d = today - n * 7 * DAY;
      const monday = d - ((new Date(d).getUTCDay() + 6) % 7) * DAY;
      const end = Math.min(monday + 7 * DAY, nowT + 1000);
      return { said: m[0], when: { from: wall(monday), to: wall(end), label: `the week of ${short(monday)} to ${withYear(monday + 6 * DAY)} (${ago})`, day: null, partial: end > nowT } };
    }
    const c = new Date(today);
    const a = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() - n, 1), b = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() - n + 1, 1);
    const mm = new Date(a);
    return { said: m[0], when: { from: wall(a), to: wall(b), label: `${MONTH_NAMES[mm.getUTCMonth()]} ${mm.getUTCFullYear()} (${ago})`, day: null, partial: false } };
  }
  return null;
}

// ------------------------------------------------------------------ the reader --

/** Dates of a period spec for a search: as lib/period/read.ts spanOf, without its 180-day cap. Null for none, now and unheld. */
export function boundsOf(spec: PeriodSpec, now: string): When | null {
  const nowT = wallMs(now);
  if (!Number.isFinite(nowT)) return null;
  const end = nowT + 1000;
  const cur = new Date(nowT);
  const year = cur.getUTCFullYear();
  const yr = (t: number) => (new Date(t).getUTCFullYear() === year ? short(t) : withYear(t));
  const span = (from: number, to: number, label: string, day: string | null = null): When | null =>
    from >= nowT ? null : { from: wall(from), to: wall(Math.min(to, end)), label, day, partial: to > nowT };
  switch (spec.kind) {
    case "window":
    case "compare": {
      const key = spec.key;
      if (key === "daily") return span(wallMs(dayStart(now)), end, "today (since 12 AM)");
      const hours = key === "weekly" ? 168 : key === "monthly" ? 720 : 2160;
      return span(nowT - hours * 3600_000, end, key === "weekly" ? "the last 7 days" : key === "monthly" ? "the last 30 days" : "the last 90 days");
    }
    case "hours": {
      const s = spanOf(spec, now);
      return span(nowT - spec.hours * 3600_000, end, `the ${s?.label.en ?? `last ${spec.hours} hours`}`);
    }
    case "day": {
      if (spec.back === 0) return span(wallMs(dayStart(now)), end, "today (since 12 AM)");
      const a = wallMs(`${now.slice(0, 10)} 00:00:00`) - spec.back * DAY;
      return span(a, a + DAY, `${spec.back === 1 ? "yesterday" : "the day before yesterday"} (${yr(a)})`, wall(a).slice(0, 10));
    }
    case "last":
    case "lastWeekOf": {
      const s = spanOf(spec, now);
      if (s?.range) return span(wallMs(s.range.from), wallMs(s.range.to), s.label.en);
      if (spec.kind === "lastWeekOf") {
        // older than the console's 180 days: the same week, worked out here
        let y = spec.year ?? year;
        if (spec.year == null && spec.month > cur.getUTCMonth()) y -= 1;
        const b = Date.UTC(spec.month === 11 ? y + 1 : y, (spec.month + 1) % 12, 1), a = b - 7 * DAY;
        return span(a, b, `the last week of ${MONTH_NAMES[spec.month]} ${y} (${short(a)} to ${short(b - DAY)})`);
      }
      return null;
    }
    case "month": {
      let y = spec.year ?? year;
      if (spec.year == null && spec.month > cur.getUTCMonth()) y -= 1;
      const a = Date.UTC(y, spec.month, 1), b = Date.UTC(spec.month === 11 ? y + 1 : y, (spec.month + 1) % 12, 1);
      return span(a, b, `${MONTH_NAMES[spec.month]} ${y}${b > nowT ? " (to date)" : ""}`);
    }
    case "days": {
      const bd = daysBounds(spec, nowT);
      if (!bd) return null;
      const one = bd.a === bd.b;
      return span(bd.a, bd.b + DAY, one ? withYear(bd.a) : `${short(bd.a)} to ${withYear(bd.b)}`, one ? wall(bd.a).slice(0, 10) : null);
    }
    case "since": {
      let a = Date.UTC(year, spec.month, spec.day);
      if (a > nowT) a = Date.UTC(year - 1, spec.month, spec.day);
      return span(a, end, `since ${yr(a)}`);
    }
    case "holiday": {
      const past = spec.dates.map((x) => Date.parse(`${x}T00:00:00Z`)).filter((x) => x <= nowT).sort((p, q) => q - p)[0];
      return past == null ? null : span(past, end, `since ${spec.name} (${yr(past)})`);
    }
    default:
      return null;
  }
}

const MON = "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)";
/** "Oct 3" as "3 Oct", so the time words are found in either order */
const turnDays = (t: string) => t.replace(new RegExp(String.raw`\b${MON}\s+(\d{1,2})(?:st|nd|rd|th)?\b`, "gi"), "$2 $1");
/** words that only joined the time phrase */
const JOINERS = /\b(?:since|between|during|till|until|ago|back|before|after|dated|dt)\b/gi;

/** The time a search names, and the search without it. */
export function readSearch(text: string, now: string): SearchWhen {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  // Tamil month names as English ones, dates written with numbers as words ("7/10/2026" -> "7 october 2026"), "Oct 3" as "3 Oct"
  const t = turnDays(dateWords(englishMonths(raw)));
  const ago = agoIn(t, now);
  if (ago) return { when: ago.when, topic: tidy(t.replace(ago.said, " ")), unread: false };
  const spec = readPeriod(t);
  if (spec.kind === "none") return { when: null, topic: raw, unread: false };
  // "now", "currently": the search is of every date anyway; the word is no subject
  if (spec.kind === "now") return { when: null, topic: tidy(periodWordsOut(t)), unread: false };
  if (spec.kind === "unheld") return { when: null, topic: tidy(periodWordsOut(t)), unread: true };
  const when = boundsOf(spec, now);
  let topic = periodWordsOut(t);
  // the month and the year of "October", "3 October 2026" (the period reader blanks a day with its month, not a month alone)
  if (spec.kind === "month" || spec.kind === "days" || spec.kind === "lastWeekOf" || spec.kind === "since") topic = topic.replace(new RegExp(String.raw`\b${MON}\b`, "gi"), " ");
  topic = topic.replace(/\b20\d{2}\b/g, " ");
  return { when, topic: tidy(topic), unread: when == null };
}

function tidy(s: string): string {
  return s.replace(JOINERS, " ").replace(/\b(?:the|of|on|in|from|to|and)\s*$/i, " ").replace(/\s+/g, " ").trim();
}
