/**
 * Reading the values people actually type in department sheets: Indian day-first dates (05-10-2026, 5.10.26,
 * 05-Oct-2026), Excel day numbers, amounts with Rs / ₹ / commas / lakh grouping, percentages, yes/no. Pure functions,
 * unit-tested (values.test.ts).
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
};

export const pad = (n: number) => String(n).padStart(2, "0");

function valid(y: number, m: number, d: number): boolean {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= days;
}
const year = (y: number) => (y < 100 ? (y > 70 ? 1900 + y : 2000 + y) : y);

function time(rest: string): string {
  const t = rest.match(/(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(am|pm)?/i);
  if (!t) return "";
  let h = Number(t[1]);
  const ap = t[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23) return "";
  return ` ${pad(h)}:${t[2]}`;
}

/** Excel's day number (1900 system) to YYYY-MM-DD. */
export function excelDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const ms = Math.round((serial - 25569) * 86400_000);
  const d = new Date(ms);
  const s = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const frac = serial % 1;
  if (frac > 0.0001) {
    const mins = Math.round(frac * 1440);
    return `${s} ${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
  }
  return s;
}

/**
 * A date as YYYY-MM-DD (with " HH:MM" when the value has a time), or null. Ambiguous a/b/yyyy is read day-first,
 * as Indian offices write it; b > 12 means the sheet is month-first.
 */
export function parseDate(raw: unknown, dayFirst = true): string | null {
  if (raw == null) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
  const s = String(raw).trim();
  if (!s || s.length > 40) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](.*))?$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}${m[4] ? time(m[4]) : ""}` : null;
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[T\s,]+(.*))?$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), y = year(Number(m[3]));
    let d = dayFirst ? a : b, mo = dayFirst ? b : a;
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}${m[4] ? time(m[4]) : ""}` : null;
  }
  // 5 Oct 2026, 05-Oct-26, 5-October-2026
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]+([A-Za-z]{3,9})[\s\-/.,]+(\d{2}|\d{4})(?:[T\s,]+(.*))?$/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const d = Number(m[1]), mo = MONTHS[m[2].toLowerCase()], y = year(Number(m[3]));
    return valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}${m[4] ? time(m[4]) : ""}` : null;
  }
  // Oct 5, 2026
  m = s.match(/^([A-Za-z]{3,9})[\s\-.]+(\d{1,2})(?:st|nd|rd|th)?,?[\s\-.]+(\d{4})(?:[T\s,]+(.*))?$/);
  if (m && MONTHS[m[1].toLowerCase()]) {
    const d = Number(m[2]), mo = MONTHS[m[1].toLowerCase()], y = Number(m[3]);
    return valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}${m[4] ? time(m[4]) : ""}` : null;
  }
  // Oct 2026, October-2026 (a month): its first day
  m = s.match(/^([A-Za-z]{3,9})[\s\-.,']+(\d{2}|\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()]) {
    const mo = MONTHS[m[1].toLowerCase()], y = year(Number(m[2]));
    return valid(y, mo, 1) ? `${y}-${pad(mo)}-01` : null;
  }
  return null;
}

/** Is the text a number as written in a sheet? Returns the number (Rs, ₹, commas, %, spaces removed) or null. */
export function parseNum(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "boolean") return null;
  let s = String(raw).trim();
  if (!s || s.length > 32) return null;
  // a code that only looks numeric: a leading zero (pin codes are fine at 6 digits) or a phone number stays text
  if (/^0\d{3,}$/.test(s) && !/^0\d{5}$/.test(s)) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/^(rs\.?|inr|₹)\s*/i, "").replace(/\s*(\/-|rs\.?|inr|₹)$/i, "").replace(/%$/, "").replace(/[,\s ]/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const YES = new Set(["yes", "y", "true", "t", "1", "ஆம்", "aam"]);
const NO = new Set(["no", "n", "false", "f", "0", "இல்லை", "illai"]);
export function parseBool(raw: unknown): boolean | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (YES.has(s)) return true;
  if (NO.has(s)) return false;
  return null;
}

/** Tidy text: trimmed, single spaces, no zero-width characters. */
export function tidy(raw: unknown): string {
  return String(raw ?? "").replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
}

/** A key for spotting the same value written differently: case, spaces, dots and hyphens ignored. */
export function normKey(s: string): string {
  return s.toLowerCase().normalize("NFKC").replace(/[\s.\-_'’,/()]+/g, "");
}

/** Edit distance (Damerau, optimal string alignment), capped: returns cap+1 once the distance exceeds `cap`. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > cap) return cap + 1;
  }
  return d[a.length][b.length];
}

/** Two spellings of one value? Same key, or a small typo in a long enough word with the same digits. */
export function sameValue(a: string, b: string): boolean {
  const ka = normKey(a), kb = normKey(b);
  if (ka === kb) return true;
  if ((ka.match(/\d+/g) ?? []).join(",") !== (kb.match(/\d+/g) ?? []).join(",")) return false;
  const len = Math.min(ka.length, kb.length);
  if (len < 6) return false;
  // a different first letter is usually a different word (Adyar / Ayanavaram), not a typo
  if (ka[0] !== kb[0]) return false;
  const allowed = len >= 10 ? 2 : 1;
  return editDistance(ka, kb, allowed) <= allowed;
}

/**
 * "Velachery" for "VELACHERY" and "velachery"; names already in mixed case are kept as written. Short capitals are
 * codes and acronyms and stay as they are: "PWD", "NDTV", "WLD", "GCC SWD" (up to 3 capitals, or 4 with at most one vowel; ZONE and OPEN are words).
 */
export function niceCase(s: string): string {
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  if (!/[a-z]/i.test(s)) return s;
  const upper = s === s.toUpperCase();
  return s.replace(/[A-Za-zÀ-ɏ]+/g, (w) => (upper && (w.length <= 3 || (w.length === 4 && (w.match(/[AEIOU]/gi) ?? []).length <= 1)) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()));
}

/** Median of a numeric list (copy sorted). */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Spearman rank correlation of two equal-length lists (ties get their average rank). */
export function spearman(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const rank = (xs: number[]) => {
    const o = xs.map((v, i) => ({ v, i })).sort((p, q) => p.v - q.v);
    const r = new Array(xs.length).fill(0);
    for (let i = 0; i < o.length;) {
      let j = i;
      while (j + 1 < o.length && o[j + 1].v === o[i].v) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[o[k].i] = avg;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a.slice(0, n)), rb = rank(b.slice(0, n));
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Monday of the week holding the date (YYYY-MM-DD). */
export function weekStart(d: string): string {
  const t = Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  const day = new Date(t).getUTCDay();
  const m = new Date(t - ((day + 6) % 7) * 86400_000);
  return `${m.getUTCFullYear()}-${pad(m.getUTCMonth() + 1)}-${pad(m.getUTCDate())}`;
}

/** Days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const p = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((p(b) - p(a)) / 86400_000);
}

export function addDays(d: string, n: number): string {
  const t = Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) + n * 86400_000;
  const x = new Date(t);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "5 Oct 2026" (or "Oct 2026" for a YYYY-MM key). */
export function fmtDay(d: string | null | undefined, withYear = true): string {
  if (!d) return "—";
  const y = d.slice(0, 4), m = Number(d.slice(5, 7)), day = Number(d.slice(8, 10));
  if (d.length === 7) return `${MON[m - 1]} ${y}`;
  return `${day} ${MON[m - 1]}${withYear ? ` ${y}` : ""}`;
}

/** Today in India (YYYY-MM-DD). */
export function todayIST(): string {
  const d = new Date(Date.now() + 5.5 * 3600_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
