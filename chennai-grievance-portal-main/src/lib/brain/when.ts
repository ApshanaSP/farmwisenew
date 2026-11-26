/**
 * The window a tool counts: the model names it ("today", "last_7_days", "last_month") or gives its dates or hours; code turns it into bounds on
 * the IST wall clock. "today" and the 7, 30 and 90 day windows are the dashboard's own (intel.ts periodSince), so a count is the tile's number.
 */
import { periodSince } from "@/lib/collector/intel";
import { istWords } from "./format";
import { ToolProblem } from "./types";

export const NAMED = ["today", "yesterday", "last_24_hours", "last_7_days", "last_30_days", "last_90_days", "this_week", "last_week", "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "all"] as const;
export type Named = (typeof NAMED)[number];
export interface WhenIn { named?: string | null; from?: string | null; to?: string | null; last_hours?: number | null; last_days?: number | null }

export interface Win {
  from: string; to: string;
  /** the window runs up to now */
  open: boolean;
  label: string;
  prev: { from: string; to: string; label: string } | null;
  /** the dashboard's own period, when it is one */
  period: "daily" | "weekly" | "monthly" | "quarterly" | null;
  days: number;
}

const DAY = 864e5;
const ms = (t: string) => Date.parse(`${t.slice(0, 19).replace(" ", "T")}Z`);
const wall = (n: number) => new Date(n).toISOString().slice(0, 19).replace("T", " ");
const dayStart = (n: number) => Math.floor(n / DAY) * DAY;
const day = (n: number) => istWords(wall(n).slice(0, 10), false);

/** JSON schema of a window, the same for every tool */
export const WHEN_SCHEMA = {
  type: "object", additionalProperties: false,
  description: "The time to count. Give ONE of: named; from + to (dates YYYY-MM-DD, both inclusive, or with HH:MM); last_hours; last_days. Leave out only when the question has no time and none is carried: the tool then says which window it used.",
  properties: {
    named: { type: "string", enum: [...NAMED], description: "today = since 12 AM as the dashboard's Daily; last_7_days/30/90 = the dashboard's Weekly/Monthly/Quarterly; last_week/last_month/last_quarter = the whole calendar one before this one" },
    from: { type: "string", description: "YYYY-MM-DD or YYYY-MM-DD HH:MM" }, to: { type: "string", description: "YYYY-MM-DD (inclusive) or YYYY-MM-DD HH:MM" },
    last_hours: { type: "number" }, last_days: { type: "number" }
  }
} as const;

const stamp = (s: string, end: boolean): string => {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) throw new ToolProblem(`"${s}" is not a date: use YYYY-MM-DD.`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) throw new ToolProblem(`${m[0]} is not a day of the calendar.`);
  return m[4] != null ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] ?? "00"}` : `${m[1]}-${m[2]}-${m[3]} ${end ? "23:59:59" : "00:00:00"}`;
};

export function winOf(w: WhenIn | null | undefined, now: string, dflt: Named = "last_90_days"): Win {
  const n = ms(now), today = dayStart(n);
  const span = (from: number, to: number, label: string, o: Partial<Win> = {}): Win => {
    const len = Math.max(0, to - from);
    return { from: wall(from), to: wall(Math.min(to, n)), open: to >= n - 1000, label, days: Math.max(1, Math.round(len / DAY)), period: null,
      prev: { from: wall(from - len), to: wall(from), label: "the same length just before" }, ...o };
  };
  const whole = (from: number, to: number) => span(from, to - 1000, "");
  const dash = (p: "daily" | "weekly" | "monthly" | "quarterly", label: string): Win => {
    const from = ms(periodSince(p, now)), daily = p === "daily";
    const back = daily ? DAY : n - from;
    return { from: wall(from), to: now, open: true, label, days: daily ? 1 : Math.round((n - from) / DAY), period: p, prev: { from: wall(from - back), to: wall(n - back), label: daily ? "the same hours yesterday" : `the ${Math.round((n - from) / DAY)} days before` } };
  };
  const d = new Date(today), y = d.getUTCFullYear(), m = d.getUTCMonth();
  const monday = today - ((d.getUTCDay() + 6) % 7) * DAY;
  if (w?.from || w?.to) {
    const a = ms(stamp(w.from ?? w.to!, false)), b = ms(stamp(w.to ?? w.from!, true));
    const [x, z] = a <= b ? [a, b] : [ms(stamp(w.to!, false)), ms(stamp(w.from!, true))];
    if (x > n) throw new ToolProblem(`${w.from ?? w.to} is in the future (it is ${istWords(now)} IST): the records hold what has happened. Forecasts and warnings are in the city and dashboard tools.`);
    const one = wall(x).slice(0, 10) === wall(z).slice(0, 10);
    const timed = /\d:\d/.test(`${w.from ?? ""}${w.to ?? ""}`);
    return span(x, z, timed ? `${istWords(wall(x))} to ${istWords(wall(Math.min(z, n)))}` : one ? `${day(x)}${x === today ? " (today, since 12 AM)" : ""}` : `${day(x)} to ${day(Math.min(z, n))}`);
  }
  if (w?.last_hours) return w.last_hours === 168 ? dash("weekly", "the last 7 days") : span(n - w.last_hours * 36e5, n, `the last ${w.last_hours} hours`);
  if (w?.last_days) {
    if (w.last_days === 7) return dash("weekly", "the last 7 days");
    if (w.last_days === 30) return dash("monthly", "the last 30 days");
    if (w.last_days === 90) return dash("quarterly", "the last 90 days");
    return span(n - w.last_days * DAY, n, w.last_days === 1 ? "the last 24 hours" : `the last ${w.last_days} days`);
  }
  switch ((w?.named ?? dflt) as Named) {
    case "today": { const t = dash("daily", ""); t.label = t.from.slice(0, 10) === now.slice(0, 10) ? `today (since 12 AM, ${day(today)})` : `since 12 AM on ${day(ms(t.from))}`; return t; }
    case "yesterday": return { ...whole(today - DAY, today), label: `yesterday (${day(today - DAY)}, 12 AM to 12 AM)`, prev: { from: wall(today - 2 * DAY), to: wall(today - DAY), label: "the day before" } };
    case "last_24_hours": return span(n - DAY, n, "the last 24 hours");
    case "last_7_days": return dash("weekly", "the last 7 days");
    case "last_30_days": return dash("monthly", "the last 30 days");
    case "last_90_days": return dash("quarterly", "the last 90 days");
    case "this_week": return { ...span(monday, n, `this week (${day(monday)} to now)`), prev: { from: wall(monday - 7 * DAY), to: wall(n - 7 * DAY), label: "the same days last week" } };
    case "last_week": return { ...whole(monday - 7 * DAY, monday), label: `last week (${day(monday - 7 * DAY)} to ${day(monday - DAY)})`, prev: { from: wall(monday - 14 * DAY), to: wall(monday - 7 * DAY), label: "the week before" } };
    case "this_month": { const a = Date.UTC(y, m, 1), b = Date.UTC(y, m - 1, 1); return { ...span(a, n, `this month (${day(a)} to now)`), prev: { from: wall(b), to: wall(Math.min(a, b + (n - a))), label: "the same days last month" } }; }
    case "last_month": { const a = Date.UTC(y, m - 1, 1), b = Date.UTC(y, m, 1); return { ...whole(a, b), label: `last month (${day(a)} to ${day(b - DAY)})`, prev: { from: wall(Date.UTC(y, m - 2, 1)), to: wall(a), label: "the month before" } }; }
    case "this_quarter": { const q = Math.floor(m / 3) * 3, a = Date.UTC(y, q, 1); return { ...span(a, n, `this quarter (${day(a)} to now)`), prev: { from: wall(Date.UTC(y, q - 3, 1)), to: wall(Date.UTC(y, q - 3, 1) + (n - a)), label: "the same days last quarter" } }; }
    case "last_quarter": { const q = Math.floor(m / 3) * 3, a = Date.UTC(y, q - 3, 1), b = Date.UTC(y, q, 1); return { ...whole(a, b), label: `last quarter (${day(a)} to ${day(b - DAY)})`, prev: { from: wall(Date.UTC(y, q - 6, 1)), to: wall(a), label: "the quarter before" } }; }
    case "this_year": return span(Date.UTC(y, 0, 1), n, `this year (since 1 Jan ${y})`);
    case "all": return { from: "2000-01-01 00:00:00", to: now, open: true, label: "everything on record", prev: null, period: null, days: 9999 };
  }
  throw new ToolProblem(`"${w?.named}" is not one of the named windows (${NAMED.join(", ")}).`);
}

/** the dashboard's period that holds a window best (for a panel that knows only its four) */
export const periodFor = (w: Win): "daily" | "weekly" | "monthly" | "quarterly" => w.period ?? (w.days <= 1 ? "daily" : w.days <= 7 ? "weekly" : w.days <= 31 ? "monthly" : "quarterly");
