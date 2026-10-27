/**
 * Earn the dashboard: how much a table can honestly show. Before anything is drawn, the table's readiness is measured
 * (usable rows and columns; number, date and place columns; distinct periods and places; what one row is) and a tier
 * picked. Every threshold the Studio uses to refuse a chart lives here, in one place, with its tests.
 *
 *   empty  no usable row or column          nothing to show (NO DATA)
 *   fact   1-5 rows, or a single figure     a fact card: the numbers and one sentence; no chart
 *   small  6-20 rows                        a sorted table with in-cell bars, up to 3 KPIs, at most one sorted bar
 *   full   more than 20 rows with structure the dashboard, every chart through the Chart Doctor (chartlint.ts)
 */
import type { Table } from "@/lib/studio/parse";
import { parseDate, parseNum } from "@/lib/studio/values";

export type Tier = "empty" | "fact" | "small" | "full";
export type RowKind = "event" | "item" | "return" | "period" | "facility" | "unknown";

/** The guards that hold in every tier. */
export const GUARD = {
  /** a trend needs this many periods */
  minTrendPeriods: 3,
  /** a map needs this many distinct places, and this share of rows placed */
  minMapPlaces: 5,
  minMapPlacedShare: 0.2,
  /** a % change is never shown on a smaller base */
  minPctBase: 20,
  /** a donut has at most this many parts, and they make a whole */
  maxDonutParts: 5,
  /** a bar chart shows at most this many bars (the rest: top 10 + Others) */
  maxBars: 12,
  /** a column counts when this share of rows fills it */
  minFill: 0.3,
  /** rows: fact tier up to, small tier up to */
  factRows: 5,
  smallRows: 20
} as const;

export interface Readiness {
  rows: number;
  cols: number;
  numeric: number;
  dates: number;
  places: number;
  /** distinct periods (days, months or years in the date column, or year-like columns) and places */
  periods: number;
  placesDistinct: number;
  /** the best-filled column's share, and the emptiest usable column's */
  fill: number;
  kind: RowKind;
  tier: Tier;
  /** in words, for the Collector: "40 rows · 5 columns · 3 numbers · 12 periods · 15 places" */
  summary: string;
}

const TOTAL = /^(grand\s*total|sub[\s-]?total|total|totals|overall|மொத்தம்|கூடுதல்)\b/i;
const PLACE_HDR = /\b(zone|ward|taluk|district|area|locality|place|location|village|block|division|circle|station|address|பகுதி|மண்டலம்|வார்டு|மாவட்டம்)\b/i;
const YEAR_HDR = /^(19|20)\d{2}(-\d{2,4})?$/;
const DATE_HDR = /\b(date|day|week|month|year|period|time|as on|dated|தேதி)\b/i;
const STATUS_HDR = /\b(status|stage|progress|state|நிலை)\b/i;
const TARGET_HDR = /\b(target|achieved|achievement|sanctioned|completed|progress)\b/i;

const filled = (c: unknown) => c != null && String(c).trim() !== "";

/** The rows that count: not empty, not a "Total" line. */
export function usableRows(t: Table): Table["rows"] {
  return t.rows.filter((r) => r.some(filled) && !r.slice(0, 3).some((c) => typeof c === "string" && TOTAL.test(c.trim())));
}

/** The readiness profile and tier of a raw table. */
export function readiness(t: Table): Readiness {
  const rows = usableRows(t);
  const n = rows.length;
  let numeric = 0, dates = 0, places = 0, best = 0, worst = 1, usable = 0;
  const periodSet = new Set<string>();
  let placesDistinct = 0, statusCol = false;
  t.headers.forEach((h, i) => {
    const vals = rows.map((r) => r[i]).filter(filled);
    const fill = n ? vals.length / n : 0;
    if (fill < GUARD.minFill || !vals.length) return;
    usable++;
    best = Math.max(best, fill);
    worst = Math.min(worst, fill);
    const sample = vals.slice(0, 400);
    const nums = sample.filter((v) => typeof v === "number" || parseNum(String(v)) != null).length;
    const ds = sample.filter((v) => typeof v === "string" && parseDate(v) != null).length;
    const isDate = ds >= sample.length * 0.8 || (DATE_HDR.test(h) && ds >= sample.length * 0.5);
    if (isDate) {
      dates++;
      for (const v of vals) { const d = parseDate(String(v)); if (d) periodSet.add(d.slice(0, 10)); }
    } else if (nums >= sample.length * 0.8) {
      numeric++;
      // a year written as a number in a "Year" column is a period
      if (/\byear\b/i.test(h) && sample.every((v) => /^(19|20)\d{2}$/.test(String(v).trim()))) { dates++; numeric--; for (const v of vals) periodSet.add(String(v)); }
    } else if (PLACE_HDR.test(h)) {
      places++;
      placesDistinct = Math.max(placesDistinct, new Set(vals.map((v) => String(v).trim().toLowerCase())).size);
    }
    if (STATUS_HDR.test(h)) statusCol = true;
  });
  // a period table: years across the top ("2021-22 | 2022-23 | ...")
  const yearCols = t.headers.filter((h) => YEAR_HDR.test(h.trim())).length;
  if (yearCols >= 2) for (const h of t.headers) if (YEAR_HDR.test(h.trim())) periodSet.add(h.trim());
  const periods = periodSet.size;
  const kind: RowKind = yearCols >= 2 || (dates && places && periods >= 2 && n <= periods * Math.max(1, placesDistinct) * 1.05 && placesDistinct >= 2) ? (yearCols >= 2 ? "period" : "return")
    : dates && (statusCol || numeric <= 1) ? "event"
    : !dates && places && numeric <= 2 && n >= 6 ? "facility"
    : !dates && (numeric >= 1 || t.headers.some((h) => TARGET_HDR.test(h))) ? "item"
    : "unknown";
  const single = n === 1 && numeric <= 1;
  const structured = numeric >= 1 || dates >= 1 || places >= 1 || usable >= 3;
  const tier: Tier = n === 0 || usable === 0 ? "empty"
    : n <= GUARD.factRows || single ? "fact"
    : n <= GUARD.smallRows || !structured ? "small"
    : "full";
  const summary = [`${n.toLocaleString("en-IN")} ${n === 1 ? "row" : "rows"}`, `${usable} ${usable === 1 ? "column" : "columns"}`,
    numeric ? `${numeric} ${numeric === 1 ? "number" : "numbers"}` : "", periods ? `${periods} ${periods === 1 ? "period" : "periods"}` : "",
    placesDistinct ? `${placesDistinct} places` : ""].filter(Boolean).join(" · ");
  return { rows: n, cols: usable, numeric, dates, places, periods, placesDistinct, fill: usable ? worst : 0, kind, tier, summary };
}

/** Whether a tier earns a dashboard of charts (the strict gate's part b: Small or above). */
export const earns = (t: Tier) => t === "small" || t === "full";

export const TIER_LABEL: Record<Tier, { en: string; ta: string }> = {
  empty: { en: "No usable rows", ta: "பயன்படுத்தக்கூடிய வரிசைகள் இல்லை" },
  fact: { en: "A few figures: shown as a fact card", ta: "சில எண்கள்: ஒரு தகவல் அட்டையாக" },
  small: { en: "A small table: a sorted table with bars", ta: "சிறிய அட்டவணை: வரிசைப்படுத்திய அட்டவணை" },
  full: { en: "Enough data for a dashboard", ta: "டாஷ்போர்டுக்குப் போதுமான தரவு" }
};
