/**
 * The console's metric glossary (LT-07, LT-08, LT-10, LT-37): every figure the Collector sees has one definition here,
 * one SQL rule and one label that says what it counts and over which window. The Overview tiles, My Tasks, the
 * Briefing, the Trends page, the AI write-ups and Ask District IQ all take their figures from these, so the same
 * scope gives the same number everywhere ("My Tasks 0" beside "128 waiting" was two definitions of one thing).
 *
 * Windows:
 *   reported  incidents first reported in the period (the console's period filter: 24 hours, 7, 30 or 90 days)
 *   updated   incidents last updated in the period (closed work comes to My Tasks when the department reports it)
 *   any       every open incident, whenever it was reported
 */

export type MetricKey = "reported" | "severe" | "severe_open" | "open" | "past_deadline" | "past_deadline_any" | "awaiting_check"
  | "left_to_departments" | "complaints" | "complaint_incidents" | "deaths";
export type Window = "reported" | "updated" | "any";

export interface Metric {
  key: MetricKey;
  /** the short label on a tile or in an answer */
  label: string;
  /** what one unit is */
  measure: string;
  window: Window;
}

export const METRICS: Record<MetricKey, Metric> = {
  reported: { key: "reported", label: "Reported", measure: "incidents", window: "reported" },
  severe: { key: "severe", label: "Severe", measure: "incidents rated Severe, open or closed", window: "reported" },
  severe_open: { key: "severe_open", label: "Severe, still open", measure: "open incidents rated Severe", window: "reported" },
  open: { key: "open", label: "Still open", measure: "open incidents", window: "reported" },
  past_deadline: { key: "past_deadline", label: "Past deadline, still open", measure: "open incidents past their resolution deadline", window: "reported" },
  past_deadline_any: { key: "past_deadline_any", label: "Past deadline, any date", measure: "open incidents past their resolution deadline", window: "any" },
  awaiting_check: { key: "awaiting_check", label: "Waiting for your check", measure: "closed work on severe incidents, and reports officers sent you, not yet verified (one per group)", window: "updated" },
  left_to_departments: { key: "left_to_departments", label: "Verified by departments", measure: "other closed work the departments verify themselves", window: "updated" },
  complaints: { key: "complaints", label: "Citizen complaints", measure: "complaints citizens filed", window: "reported" },
  complaint_incidents: { key: "complaint_incidents", label: "Incidents with complaints", measure: "incidents that have at least one citizen complaint", window: "reported" },
  deaths: { key: "deaths", label: "Deaths", measure: "people who died, counted once per incident", window: "reported" }
};

const PERIOD_WORDS: Record<string, string> = { daily: "the last 24 hours", weekly: "the last 7 days", monthly: "the last 30 days", quarterly: "the last 90 days" };

/** "reported in the last 24 hours", "updated in the last 7 days", "any date". */
export function windowText(w: Window, period: string): string {
  const p = PERIOD_WORDS[period] ?? period;
  return w === "any" ? "any date" : `${w === "updated" ? "updated" : "reported"} in ${p}`;
}

/** What a figure counts and over which window, for a tile's caption or tooltip: "open incidents past their resolution deadline · reported in the last 24 hours". */
export const caption = (k: MetricKey, period: string) => `${METRICS[k].measure} · ${windowText(METRICS[k].window, period)}`;

/** The label with its window: "Past deadline, still open · reported in the last 24 hours". */
export const labelled = (k: MetricKey, period: string) => `${METRICS[k].label} · ${windowText(METRICS[k].window, period)}`;

// ------------------------------------------------------------------ SQL --

/**
 * The SQL rules. `open` is the effective open flag (the Collector's latest decision on top, intel.ts EFF.open) and
 * `routed` says a news complaint was sent to a department (it is the department's work, not an incident on the console).
 */
export interface SqlCtx { open: string; routed: string; a?: string }
export const SQL = {
  severe: (c: SqlCtx) => `${c.a ?? "i"}.severity_level = 'Severe'`,
  severe_open: (c: SqlCtx) => `${c.open} = 1 AND ${c.a ?? "i"}.severity_level = 'Severe' AND NOT ${c.routed}`,
  open: (c: SqlCtx) => `${c.open} = 1 AND NOT ${c.routed}`,
  past_deadline: (c: SqlCtx) => `${c.open} = 1 AND ${c.a ?? "i"}.sla_breached = 1 AND NOT ${c.routed}`,
  complaint_incidents: (c: SqlCtx) => `COALESCE(${c.a ?? "i"}.citizen_complaints, 0) > 0`
};

// ----------------------------------------------------------- comparisons --

/** Below this many in the period before, a percentage says more about the small base than about the change. */
export const MIN_PCT_BASE = 20;

/**
 * The change on the period before in percent, or null when the base is too small to make a percentage honest
 * ("+767%" on 3 incidents): say the two counts instead (changeWords).
 */
export function pctChange(now: number, before: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(before) || before < MIN_PCT_BASE) return null;
  return Math.round(((now - before) / before) * 100);
}

/** "up 12% on the period before", or, on a small base, "26, against 3 in the period before". */
export function changeWords(now: number, before: number, unit = ""): string {
  const p = pctChange(now, before);
  const u = unit ? ` ${unit}` : "";
  if (p == null) return before ? `${now.toLocaleString("en-IN")}${u}, against ${before.toLocaleString("en-IN")} in the period before` : `none in the period before`;
  return p === 0 ? "the same as the period before" : `${p > 0 ? "up" : "down"} ${Math.abs(p)}% on the period before`;
}

/** The window in a few characters, for a tile's label: "24 h", "7 days". */
export const shortWindow = (period: string) => ({ daily: "24 h", weekly: "7 days", monthly: "30 days", quarterly: "90 days" } as Record<string, string>)[period] ?? period;

// -------------------------------------------------------------- deadlines --

/** Where an incident stands against its resolution deadline, computed when it is shown (LT-11), not when the AI wrote. */
export interface DeadlineState { dueAt: string | null; overdue: boolean; hoursToDeadline: number | null }

const wall = (t: string) => Date.parse(t.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? "" : "+05:30"));

/** `dueAt` is IST "YYYY-MM-DD HH:MM:SS"; `breached` is the store's flag, used only when there is no due time. */
export function deadlineState(dueAt: string | null | undefined, now: string, breached?: unknown): DeadlineState {
  if (!dueAt || !Number.isFinite(wall(dueAt))) return { dueAt: null, overdue: Number(breached) === 1, hoursToDeadline: null };
  const h = (wall(dueAt) - wall(now)) / 3600_000;
  return { dueAt, overdue: h <= 0, hoursToDeadline: Math.round(h * 10) / 10 };
}

/** A sentence that says the deadline has passed. */
export const MISSED_CLAIM = /\b(deadline (was |has been |had been |has |had |is )?(missed|passed|breached|lapsed|exceeded|crossed|over)|missed (its|the|their) (\d+[- ]hour )?deadline|past (its|the|their) (\d+[- ]hour )?deadline|beyond (its|the) deadline|overdue|sla (breach|breached)|deadline breach)\b|காலக்கெடு\s*(தாண்டி|கடந்த|முடிந்த)/i;

/** The sentences of an AI text that claim a missed deadline the computed state does not support (empty when all hold). */
export function falseDeadlineClaims(text: string, s: DeadlineState): string[] {
  if (s.overdue) return [];
  return String(text ?? "").split(/(?<=[.!?])\s+|\n+/).filter((x) => MISSED_CLAIM.test(x));
}

/** The text without the sentences that claim a missed deadline before it has passed. */
export function withoutFalseDeadline(text: string, s: DeadlineState): string {
  const bad = new Set(falseDeadlineClaims(text, s));
  return bad.size ? String(text).split(/(?<=[.!?])\s+|\n+/).filter((x) => !bad.has(x)).join(" ").trim() : text;
}

/**
 * How old a day's figures are against the store's time. Older than STALE_DAYS is stale: never shown as "today" (R-05:
 * vegetable prices of 6 Oct sat under "Prices today" on 27 Oct).
 */
export const STALE_DAYS = 3;
export function dataAge(day: string | null | undefined, now: string): { days: number | null; stale: boolean; label: string } {
  if (!day) return { days: null, stale: true, label: "date unknown" };
  const days = Math.floor((Date.parse(now.slice(0, 10) + "T00:00:00Z") - Date.parse(day.slice(0, 10) + "T00:00:00Z")) / 86_400_000);
  if (!Number.isFinite(days)) return { days: null, stale: true, label: "date unknown" };
  return { days, stale: days > STALE_DAYS, label: days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days old` };
}

/**
 * An "unusual rise" needs enough reports to mean something (R-18: "3 tree and park complaints … 41× usual"). A one-day spike
 * counts from MIN_UNUSUAL reports; a slow rise over several days already needs many.
 */
export const MIN_UNUSUAL = 5;
export const unusualEnough = (a: { observed?: unknown }) => Number(a.observed ?? 0) >= MIN_UNUSUAL;

/**
 * What a confidence figure rests on (LT-13: "100%" for 4 reports, all from one department, with nothing beside it): the
 * reports and the separate sources behind it.
 */
export function confidenceBasis(src: Record<string, unknown> | null | undefined): string | null {
  if (!src) return null;
  const kinds = ["grievance", "police", "pwd", "hospital", "imd", "news"];
  const total = Number(src.total ?? 0);
  const sources = kinds.filter((k) => Number(src[k] ?? 0) > 0).length;
  if (!total) return null;
  return `${total} ${total === 1 ? "report" : "reports"} · ${sources} ${sources === 1 ? "source" : "sources"}`;
}
