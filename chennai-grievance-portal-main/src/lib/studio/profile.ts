/**
 * Column profiling: each column's type, fill, distinct values, range and a first reading of what it is for, from
 * its header (English and Tamil) and its values. The AI reads this profile, not the raw file; when no AI is
 * available the rules' reading is used as is.
 */
import type { Cell, Table } from "@/lib/studio/parse";
import type { ColType, ColumnProfile, Role } from "@/lib/studio/types";
import { excelDate, median, parseBool, parseDate, parseNum, tidy } from "@/lib/studio/values";

const DATE_HDR = /(date|\bdt\b|dated|reported|received|created|registered|logged|on\b|\bday\b|\bmonth\b|\bweek\b|\btime\b|தேதி|நாள்)/i;
const STATUS_WORDS = /^(pending|completed?|closed|open|resolved|in[\s-]?progress|under[\s-]?progress|ongoing|done|not[\s-]?started|started|work[\s-]?(in[\s-]?)?progress|yet to start|approved|rejected|sanctioned|tender(ed)?|finished|delayed|stalled|active|inactive|adequate|low|out of stock|nil|available|full|critical|normal|alert|warning|danger|yes|no|நிலுவை|முடிந்தது|நடைபெறுகிறது)$/i;

/** Day-first unless the values prove month-first (a middle part above 12). */
export function dateOrder(values: string[]): boolean {
  let dayFirst = 0, monthFirst = 0;
  for (const v of values.slice(0, 2000)) {
    const m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (!m) continue;
    if (Number(m[1]) > 12) dayFirst++;
    if (Number(m[2]) > 12) monthFirst++;
  }
  return monthFirst <= dayFirst;
}

/** A column's value as a date, reading Excel day numbers when the header says it is a date. */
export function dateOf(v: Cell, dayFirst: boolean, serialOk: boolean, yearOk = false): string | null {
  if (v == null) return null;
  // a year column (2019, "2020-21"): the year's first day
  if (yearOk) {
    const y = String(v).trim().match(/^((19|20)\d\d)(\s*[-–/]\s*\d{2,4})?$/)?.[1];
    if (y) return `${y}-01-01`;
  }
  if (typeof v === "number") return serialOk ? excelDate(v) : null;
  return parseDate(v, dayFirst);
}

export const YEAR_HDR = /^(year|yr|fy|financial year|calendar year|ஆண்டு|வருடம்)\b|\byear\b/i;

export function unitOf(header: string): string | null {
  const h = header.toLowerCase();
  if (/crore|\bcr\b/.test(h) && /(rs|₹|amount|cost|value|crore)/.test(h)) return "Rs crore";
  if (/lakh|lakhs|\blac\b/.test(h)) return "Rs lakh";
  if (/(\brs\b|rs\.|₹|inr|rupees|amount|\bcost\b|price|budget|expenditure|sanction|spent|fee|fine|revenue|tax|ரூ|தொகை)/.test(h)) return "Rs";
  if (/%|percent|\bpct\b|ratio/.test(h)) return "%";
  const p = header.match(/\(([^)]{1,14})\)\s*$/)?.[1]?.trim();
  if (p && !/^\d+$/.test(p)) return p.replace(/^in\s+/i, "");
  if (/\b(km|kms)\b/.test(h)) return "km";
  if (/\b(metres|meters|mtrs|mtr)\b/.test(h)) return "m";
  if (/\b(tonnes|tons|mt)\b/.test(h)) return "tonnes";
  if (/\b(kg|kgs)\b/.test(h)) return "kg";
  if (/\b(litres|liters|kl|mld)\b/.test(h)) return h.match(/\b(litres|liters|kl|mld)\b/)![1];
  return null;
}

export function profileTable(t: Table): ColumnProfile[] {
  return t.headers.map((header, i) => profileColumn(`c${i}`, header, t.rows.map((r) => r[i]), t.rows.length));
}

function profileColumn(key: string, header: string, cells: Cell[], rowCount: number): ColumnProfile {
  const vals = cells.filter((c) => c != null && tidy(c) !== "");
  const strs = vals.map((v) => tidy(v));
  const n = vals.length;
  const h = header.toLowerCase();
  const dayFirst = dateOrder(strs);
  const serialOk = DATE_HDR.test(header);
  const yearOk = YEAR_HDR.test(header);
  const dates = vals.map((v) => dateOf(v, dayFirst, serialOk, yearOk)).filter((d): d is string => !!d);
  const nums = vals.map((v) => parseNum(v)).filter((x): x is number => x != null);
  const bools = strs.map(parseBool).filter((b) => b != null);
  let type: ColType = "empty";
  if (n) {
    if (dates.length >= n * 0.8 && (nums.length < n * 0.5 || serialOk || yearOk)) type = "date";
    else if (nums.length >= n * 0.85) type = "number";
    else if (bools.length === n && new Set(strs.map((s) => s.toLowerCase())).size <= 2) type = "bool";
    else type = "text";
  }
  const counts = new Map<string, number>();
  for (const s of strs) counts.set(s, (counts.get(s) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v, c]) => ({ v: v.slice(0, 60), n: c }));
  const sortedDates = [...dates].sort();
  const sample = [...new Set(strs)].slice(0, 5).map((s) => s.slice(0, 60));
  const avgLen = n ? strs.reduce((s, x) => s + x.length, 0) / n : 0;
  const prof: ColumnProfile = {
    key, header, type, filled: n, distinct: counts.size, top,
    min: type === "number" && nums.length ? Math.min(...nums) : null,
    max: type === "number" && nums.length ? Math.max(...nums) : null,
    median: type === "number" ? median(nums) : null,
    dmin: type === "date" ? sortedDates[0]?.slice(0, 10) ?? null : null,
    dmax: type === "date" ? sortedDates[sortedDates.length - 1]?.slice(0, 10) ?? null : null,
    avgLen: Math.round(avgLen), sample, guess: "ignore", unit: type === "number" ? unitOf(header) : null
  };
  prof.guess = guessRole(h, prof, rowCount, strs);
  return prof;
}

/** The rules' reading of a column, from its header and values. */
export function guessRole(h: string, p: ColumnProfile, rows: number, strs: string[]): Role {
  const { type, distinct, filled } = p;
  if (type === "empty") return "ignore";
  if (type === "number" && /^(lat|latitude)\b/.test(h) && p.min != null && p.min > 5 && (p.max ?? 0) < 40) return "lat";
  if (type === "number" && /^(lon|lng|long|longitude)\b/.test(h) && p.min != null && p.min > 60 && (p.max ?? 0) < 100) return "lon";
  if (/^(s\.?\s?no\.?|sl\.?\s?no\.?|sr\.?\s?no\.?|serial( no\.?)?|row( no\.?)?|#|no\.?|வ\.?\s?எண்)$/.test(h.trim())) return "id";
  // personal: contact details and ids, or a name column that names a person ("Applicant name", or just "Name");
  // "Country name", "Hospital name", "Scheme name" are not personal
  if (/(mobile|phone|contact( no)?|e-?mail|aadhaa?r|complainant|applicant|petitioner|beneficiary|patient( name)?|father|husband|guardian|card ?holder|owner name|கைபேசி|தொலைபேசி|ஆதார்|மனுதாரர்)/.test(h)
    || /^(name|full name|person name|name of (the )?(person|citizen|officer|staff|employee|student|farmer|head of (the )?family)|பெயர்)$/.test(h.trim())
    || (/\bname\b/.test(h) && /(citizen|person|officer|staff|employee|student|farmer|head of family|mother|wife|resident|voter|member)/.test(h))) return "person";
  if (/\bward\b|வார்டு|^wd\b/.test(h)) return "ward";
  if (/\bzone\b|மண்டலம்/.test(h)) return "zone";
  if (/taluk|tehsil|tahsil|வட்டம்/.test(h)) return "taluk";
  if (type === "date") return "date";
  if (/(status|stage|\bstate\b|progress|remarks? on status|நிலை|நிலவரம்)/.test(h) && distinct <= 15) return "status";
  if (type === "text" && distinct <= 15 && p.top.slice(0, 4).every((t) => STATUS_WORDS.test(t.v.trim()))) return "status";
  if (type === "text" && /(area|locality|location|place|street|road|address|village|division|site|landmark|colony|nagar|neighbourhood|pakkam|பகுதி|இடம்|ஊர்|தெரு|முகவரி|கிராமம்)/.test(h)) return "place";
  if (/(\bid\b|\bcode\b|\bref\b|reference|\bno\.?$|\bnumber$|எண்)/.test(h) && distinct >= filled * 0.9) return "id";
  if (type === "number") {
    // a running number 1, 2, 3 ... is a row id, not a measure
    const ints = strs.map(Number);
    if (distinct >= filled * 0.98 && filled > 10 && ints.every((x, i) => i === 0 || x === ints[i - 1] + 1)) return "id";
    return "measure";
  }
  if (type === "bool") return "category";
  if (type === "text" && p.avgLen > 40) return "text";
  if (type === "text" && distinct <= Math.max(30, filled * 0.2)) return "category";
  if (type === "text" && distinct >= filled * 0.9) return p.avgLen > 18 ? "text" : "id";
  return type === "text" ? "category" : "ignore";
}
