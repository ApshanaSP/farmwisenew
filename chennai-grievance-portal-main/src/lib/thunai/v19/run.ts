/**
 * v19 (25 Nov): the analyst's data request, run. Server only, read only, parameterised SQL; no figure here comes from a model.
 *
 * Every count uses the dashboard's own rules (the effective status with the Collector's decisions, open as OPEN_NOW, past deadline as
 * pastDueSql, a rolling window after its start and up to now, resolved by when it was closed), so a number Jarvis says is the number on the
 * tile, the zone table, the chatbot and the map for the same window. What was said as a limit is a limit (the police, two places, one kind,
 * a word in the report); the order, the position ("the second") and how many ("two") are applied here, after counting.
 */
import type { RowDataPacket } from "mysql2";
import intelPool, { TITLE, ops } from "@/lib/collector/db";
import { OPEN_NOW, asOf } from "@/lib/collector/intel";
import { pastDueSql } from "@/lib/reference/metrics";
import { CHENNAI_MARKETS } from "@/lib/collector/sources";
import { MAX_HOURS, WINDOW_WORDS, readPeriod, type PeriodKey, type PeriodSpec } from "@/lib/period/read";
import { LEVEL_WORD, jamsRanked, lengthWords } from "@/lib/city/pick";
import { trafficNow, type TrafficSpot } from "@/lib/city/traffic";
import { trafficByHour, trafficHistory } from "@/lib/city/history";
import { CAT_LABEL_TA } from "../narrate";
import { DEPT_TA, ZONE_TA_NAME } from "../lexicon";
import type { World } from "../types";
import { EFF, LOCALITY, winNews, winPrices, winReadings, type WinMetric } from "../v18/window";
import { agoSpec, beforeRecords, boundWords, dateWords, daysOf, hoursSpec, isToday, isWindowSpec, readerSpec, windowOf, type Win } from "../v18/when";
import { TOPICS, topicCats, topicOf, type Topic } from "../v18/topics";
import { lastDayOf } from "./days";
import { wideKey, type Query } from "./shape";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function sql<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(text, params);
  return r as unknown as T[];
}
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const nn = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const r1 = (v: number) => Math.round(v * 10) / 10;
export interface Bi { en: string; ta: string }
const bi = (en: string, ta: string): Bi => ({ en, ta });

/** Everything counted about a set of incidents. */
export interface Measures {
  n: number; severe: number; open: number; overdue: number; resolved: number; dead: number; injured: number;
  /** citizen complaints on incidents still open (the dashboard's tile), and all of them */
  complaints: number; received: number;
  /** average days from the first report to closing (those closed in the window), and average days the open ones have waited; null: none */
  closeDays: number | null; openDays: number | null; closed: number;
}
export interface Group {
  key: string; label: string; ta: string; zone: number | null; lat: number | null; lon: number | null;
  value: number; m: Measures | null; sub: Bi | null;
  /** the query that shows this group's own records */
  inside: Query | null;
  /** traffic: the live stretch */
  spot?: TrafficSpot;
}
export interface Result {
  /** the request as it was run */
  q: Query;
  win: Win | null;
  /** read live, not over a window */
  live: boolean;
  asOf: string | null;
  /** what is counted ("severe incidents handled by Greater Chennai Police in Adyar") and the window's words */
  what: Bi; over: Bi;
  measure: Bi; unit: string | null; groupNoun: Bi;
  total: number; totals: Measures | null;
  prev: { total: number; label: Bi; held: boolean } | null;
  groups: Group[]; shown: Group[];
  /** the place in the order the first shown item holds (1, or the rank asked) */
  from: number;
  rows: Row[]; rowsTotal: number;
  news: Row[]; newsTotal: number;
  readings: { id: string; name: string; zone: number | null; value: number; t: string | null; detail: string | null; lat: number | null; lon: number | null }[];
  method: Bi | null;
  notes: Bi[];
  sources: string[];
  /** nothing can be read for this (before the records, live traffic off): said in place of any figure */
  cannot: Bi | null;
}

export interface AskCtx {
  world: World;
  /** the window for a question that says no time (shape.ts planKey: the dashboard's, or the widest a part of the same screen needs) */
  key: PeriodKey;
  /** the dashboard's own window, when `key` is wider: a widened window is written into what is run, so a click counts it too */
  dash?: PeriodKey;
  lockDept?: string | null;
  /** the dashboard's own filters, for a question that names no place, department or kind */
  base?: { zone: number | null; dept: string | null; cat: string | null; taluk: string | null } | null;
  /** tests: the time */
  now?: string;
}

// ------------------------------------------------------------------- time --

/** The window a request means: its own words read by code, then its dates or hours, else the dashboard's window. */
const nightSaid = (t: Query["time"]): boolean => !!t?.said && /\blast night\b|\byesterday night\b|\bovernight\b|நேற்று இரவு|நேத்து ராத்திரி|நேற்றிரவு|நேத்து நைட்|\bneth?u (?:night|raathiri|nite)\b/i.test(t.said);
/** last night, 6 PM to 6 AM (to now, while it is still that night), against the night before */
function nightWin(key: PeriodKey, now: string): Win {
  const base = windowOf(hoursSpec(36), key, now);
  const day = (k: number) => nextIso(now.slice(0, 10), k), early = now.slice(11, 13) < "06";
  const from = `${day(-1)} 18:00:00`, to = early ? now : `${day(0)} 06:00:00`;
  const shift = (x: string) => new Date(Date.parse(`${x.replace(" ", "T")}Z`) - 864e5).toISOString().slice(0, 19).replace("T", " ");
  const a = dayWord(day(-1)), b = dayWord(day(0));
  return { ...base, from, to, rolling: false, partial: early, custom: true, hours: 12, outside: null, note: null, label: { ...base.label, en: `last night (6 PM, ${a.en} to 6 AM, ${b.en})`, ta: `நேற்று இரவு (${a.ta} மாலை 6 முதல் ${b.ta} காலை 6 வரை)` },
    prev: { ...base.prev, from: shift(from), to: shift(to), label: { ...base.prev.label, en: `the night before (${dayWord(day(-2)).en})`, ta: `அதற்கு முந்தைய இரவு (${dayWord(day(-2)).ta})` } }, prevHeld: shift(from) >= base.heldFrom };
}
type Time = { spec: PeriodSpec | null; key: PeriodKey; said: boolean; night?: boolean };
/** the window a time stands for */
const winOf = (tm: Time, key: PeriodKey, now: string): Win => (tm.night ? nightWin(key, now) : windowOf(tm.spec, key, now));
export function timeOf(t: Query["time"], key: PeriodKey, now: string): Time {
  if (!t || (!t.said && !t.from && !t.to && t.hours == null)) return { spec: null, key, said: false };
  // "last night" is one night, 6 in the evening to 6 in the morning (asked at ten at night it ran on through the whole day)
  if (nightSaid(t)) return { spec: null, key, said: true, night: true };
  // a weekend, or a day of the week: the last one
  const dw = t.said && !t.from ? t.said.toLowerCase().match(/\b(weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/) : null;
  if (dw && readPeriod(dateWords(t.said!)).kind === "none") {
    const today = Date.parse(`${now.slice(0, 10)}T00:00:00Z`), dow = new Date(today).getUTCDay();
    const back = (d: number) => { const b = (dow - d + 7) % 7; return b === 0 ? 7 : b; };
    const days = dw[1] === "weekend" ? (dow === 0 ? [8, 7] : dow === 6 ? [7, 6] : [back(6), back(6) - 1]) : (() => { const b = back(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(dw[1])); return [b, b]; })();
    const iso = (b: number) => new Date(today - b * 864e5).toISOString().slice(0, 10);
    const r = readerSpec({ said: null, from: iso(days[0]), to: iso(days[1]), hours: null }, now);
    if (r) return { spec: r, key, said: true };
  }
  const code = t.said ? readPeriod(dateWords(t.said)) : null;
  if (code) {
    if (isToday(code)) return { spec: null, key: "daily", said: true };
    if (code.kind === "window") return { spec: null, key: code.key, said: true };
    if (isWindowSpec(code)) return { spec: code, key, said: true };
    if (code.kind === "now") return { spec: null, key, said: false };
  }
  const r = readerSpec(t, now);
  if (r?.kind === "window") return { spec: null, key: r.key, said: true };
  if (r && isWindowSpec(r)) return { spec: r, key, said: true };
  const ago = t.said ? agoSpec(t.said, now) : null;
  return ago ? { spec: ago, key, said: true } : { spec: null, key, said: false };
}

// ------------------------------------------------------------------ words --

const zName = (w: World, z: number) => w.zones.find((x) => x.n === z)?.name ?? `Zone ${z}`;
const zTa = (w: World, z: number) => w.zones.find((x) => x.n === z)?.ta ?? ZONE_TA_NAME[z] ?? zName(w, z);
const dName = (w: World, d: string) => w.depts.find((x) => x.code === d)?.name ?? d;
const dTa = (w: World, d: string) => DEPT_TA[d] ?? dName(w, d);
const cName = (w: World, c: string) => w.cats.find((x) => x.code === c)?.label ?? c;
const cTa = (w: World, c: string) => CAT_LABEL_TA[c] ?? cName(w, c);
const SEV_TA: Record<string, string> = { Severe: "கடுமையான", High: "அதிக முக்கியத்துவ", Medium: "நடுத்தர", Low: "குறைந்த" };
const and = (xs: string[], word = "and") => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} ${word} ${xs[xs.length - 1]}`);
const lowFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** "in Adyar", "in Velachery", "in Adyar and Anna Nagar" (or nothing for the district) */
export function placeWords(q: Pick<Query, "zones" | "place" | "taluk">, w: World): Bi {
  if (q.place && /^[=~+]/.test(q.place)) {
    const [own, inside] = q.place.slice(1).split(" @").map((x) => x.replace(/_Z\d+$/i, ""));
    const z = q.place.startsWith("+") && q.zones.length === 1 ? q.zones[0] : null;
    return bi(` in ${own}${z ? `, ${zName(w, z)}` : inside ? `, ${inside}` : ""}`, ` ${z ? `${zTa(w, z)}, ` : inside ? `${inside}, ` : ""}${own} பகுதியில்`);
  }
  if (q.place) { const p = w.places.find((x) => [x.name, ...x.aliases].some((a) => a.toLowerCase() === q.place!.toLowerCase())); const t = p?.aliases.find((a) => /[\u0B80-\u0BFF]/.test(a)); return bi(` in ${q.place}`, ` ${t ?? q.place} பகுதியில்`); }
  if (q.zones.length > 6) return bi(` in ${q.zones.length} zones`, ` ${q.zones.length} மண்டலங்களில்`);
  if (q.zones.length) return bi(` in ${and(q.zones.map((z) => zName(w, z)))}`, ` ${and(q.zones.map((z) => zTa(w, z)), "மற்றும்")} பகுதியில்`);
  if (q.taluk) { const t = w.taluks.find((x) => x.code === q.taluk); return bi(` in ${t?.name ?? q.taluk} taluk`, ` ${t?.ta ?? t?.name ?? q.taluk} வட்டத்தில்`); }
  return bi("", "");
}
/** what a request leaves out, in words */
function notWords(q: Query, w: World): Bi {
  if (!q.not.length) return bi("", "");
  const en: string[] = [], ta: string[] = [];
  for (const x of q.not) {
    if (/^\d+$/.test(x)) { en.push(zName(w, Number(x))); ta.push(zTa(w, Number(x))); }
    else if (w.depts.some((d) => d.code === x)) { en.push(dName(w, x)); ta.push(dTa(w, x)); }
    else { en.push(lowFirst(cName(w, x))); ta.push(cTa(w, x)); }
  }
  return bi(`, leaving out ${and(en)}`, `(${ta.join(", ")} தவிர)`);
}
/** "severe, open police incidents in Adyar": what a request counts, in words */
export function whatWords(q: Query, w: World): Bi {
  const place = placeWords(q, w);
  if (q.of === "traffic") return bi(`${q.level === "closed" ? "closed roads" : q.level === "flood" ? "flooded roads" : q.level === "accident" ? "road accidents and breakdowns" : `${q.level === "very" ? "very congested " : q.level === "slow" ? "slow " : ""}traffic jams`}${q.item ? ` on ${q.item}` : ""}${place.en}`, `${place.ta.trim()} ${q.level === "closed" ? "மூடப்பட்ட சாலைகள்" : q.level === "flood" ? "தண்ணீர் தேங்கிய சாலைகள்" : q.level === "accident" ? "சாலை விபத்துகள்" : q.level === "very" ? "கடும் போக்குவரத்து நெரிசல்" : q.level === "slow" ? "மெதுவான போக்குவரத்து" : "போக்குவரத்து நெரிசல்"}`.trim());
  if (q.of === "air") return bi(`air quality${place.en}`, `${place.ta.trim()} காற்றின் தரம்`.trim());
  if (q.of === "rain") return bi(`rainfall${place.en}`, `${place.ta.trim()} மழை அளவு`.trim());
  if (q.of === "lakes") return bi(`lake storage`, `ஏரிகளின் நீர் இருப்பு`);
  if (q.of === "weather") return bi(`${metricOf(q) === "humidity_pct" ? "humidity" : "temperature"}${place.en}`, `${place.ta.trim()} ${metricOf(q) === "humidity_pct" ? "ஈரப்பதம்" : "வெப்பநிலை"}`.trim());
  if (q.of === "prices") return bi(`${q.item ? `${q.item.toLowerCase()} ` : "vegetable "}prices${place.en}`, `${place.ta.trim()} ${q.item ?? "காய்கறி"} விலை`.trim());
  const sev = q.sev.length ? `${and(q.sev.map((x) => x.toLowerCase()), "or")} ` : "";
  const sevTa = q.sev.map((x) => SEV_TA[x] ?? x).join(", ");
  const st = q.status === "open" ? "open " : q.status === "overdue" ? "past-deadline " : q.status === "resolved" ? "resolved " : "";
  const stTa = q.status === "open" ? "நிலுவையில் உள்ள" : q.status === "overdue" ? "காலக்கெடு தாண்டிய" : q.status === "resolved" ? "தீர்க்கப்பட்ட" : "";
  const kind = q.group ? lowFirst(TOPICS[q.group as Topic].en) : q.cats.length ? and(q.cats.map((c) => lowFirst(cName(w, c)))) : "";
  const kindTa = q.group ? TOPICS[q.group as Topic].ta : q.cats.map((c) => cTa(w, c)).join(", ");
  const word = q.words[0] ?? "";
  const gcc = q.depts.length > 4 && q.depts.every((d) => d.startsWith("GCC-"));
  const dep = gcc ? "the Corporation" : q.depts.length > 4 ? `${q.depts.length} departments` : q.depts.length ? and(q.depts.map((d) => dName(w, d))) : "";
  const depTa = gcc ? "மாநகராட்சி" : q.depts.length > 4 ? `${q.depts.length} துறைகள்` : q.depts.map((d) => dTa(w, d)).join(", ");
  const noun = q.of === "news" ? "news reports" : "incidents";
  const nounTa = q.of === "news" ? "செய்திகள்" : "சம்பவங்கள்";
  const harm = q.harm === "deaths" ? " with deaths" : q.harm === "injuries" ? " with injuries" : "";
  const from = q.from === "citizens" ? " reported by citizens" : q.from === "police" ? " in police records" : q.from === "hospital" ? " from hospitals" : q.from === "news" ? " seen only in the news" : "";
  const clock = q.clock_from != null && q.clock_to != null ? ` between ${hourWord(q.clock_from)} and ${hourWord(q.clock_to % 24)}` : "";
  const ward = q.ward ? ` in ward ${q.ward}` : "";
  return bi(`${sev}${st}${word || kind ? `${word || kind} ` : ""}${noun}${harm}${from}${dep ? ` handled by ${dep}` : ""}${ward}${place.en}${clock}${notWords(q, w).en}`.trim(),
    `${[place.ta.trim(), q.ward ? `வார்டு ${q.ward}` : "", clock ? `${hourWord(q.clock_from!)} முதல் ${hourWord(q.clock_to! % 24)} வரை` : "", notWords(q, w).ta, depTa ? `${depTa} கையாளும்` : "", sevTa, stTa, word || kindTa, nounTa].filter(Boolean).join(" ")}`);
}
const MEASURE_WORD: Record<Query["measure"], { en: string; ta: string; unit: string | null }> = {
  count: { en: "incidents", ta: "சம்பவங்கள்", unit: "incidents" }, severe: { en: "severe incidents", ta: "கடுமையான சம்பவங்கள்", unit: "severe incidents" },
  open: { en: "open incidents", ta: "நிலுவையில் உள்ளவை", unit: "open incidents" }, overdue: { en: "past their deadline", ta: "காலக்கெடு தாண்டியவை", unit: "past deadline" },
  resolved: { en: "resolved", ta: "தீர்க்கப்பட்டவை", unit: "resolved" }, deaths: { en: "deaths", ta: "உயிரிழப்புகள்", unit: "deaths" }, injured: { en: "people injured", ta: "காயமடைந்தவர்கள்", unit: "injured" },
  complaints: { en: "open citizen complaints", ta: "நிலுவையில் உள்ள மக்கள் புகார்கள்", unit: "complaints" },
  days_to_close: { en: "days to close, on average", ta: "முடிக்க ஆகும் சராசரி நாட்கள்", unit: "days" }, days_open: { en: "days open, on average", ta: "நிலுவையில் உள்ள சராசரி நாட்கள்", unit: "days" },
  delay: { en: "minutes of delay", ta: "தாமத நிமிடங்கள்", unit: "min" }, jams: { en: "jams", ta: "நெரிசல்கள்", unit: "jams" },
  latest: { en: "latest reading", ta: "சமீபத்திய அளவு", unit: null }, average: { en: "average", ta: "சராசரி", unit: null }, highest: { en: "highest", ta: "அதிகபட்சம்", unit: null }, lowest: { en: "lowest", ta: "குறைந்தபட்சம்", unit: null },
  share: { en: "share of all incidents", ta: "மொத்தத்தில் பங்கு", unit: "%" },
  price: { en: "price a kilo", ta: "கிலோ விலை", unit: "₹/kg" }, change: { en: "change a kilo", ta: "கிலோ விலை மாற்றம்", unit: "₹/kg" }
};
const BY_WORD: Record<NonNullable<Query["by"]>, Bi> = {
  zone: bi("area", "பகுதி"), ward: bi("ward", "வார்டு"), place: bi("locality", "இடம்"), taluk: bi("taluk", "வட்டம்"), dept: bi("department", "துறை"), kind: bi("kind", "வகை"), group: bi("group of problems", "பிரச்சினை வகை"),
  severity: bi("severity", "தீவிரம்"), status: bi("status", "நிலை"), day: bi("day", "நாள்"), hour: bi("hour of the day", "நேரம்"), weekday: bi("day of the week", "கிழமை"), month: bi("month", "மாதம்"),
  road: bi("road", "சாலை"), station: bi("station", "நிலையம்"), item: bi("vegetable", "காய்கறி"), market: bi("market", "சந்தை")
};

// -------------------------------------------------------------- incidents --

const INC_MEASURES = new Set(["count", "severe", "open", "overdue", "resolved", "deaths", "injured", "complaints", "days_to_close", "days_open", "share", "change"]);
export const valueOf = (m: Measures, k: Query["measure"]): number | null => {
  switch (k) {
    case "severe": return m.severe;
    case "open": return m.open;
    case "overdue": return m.overdue;
    case "resolved": return m.resolved;
    case "deaths": return m.dead;
    case "injured": return m.injured;
    case "complaints": return m.complaints;
    case "days_to_close": return m.closeDays;
    case "days_open": return m.openDays;
    default: return m.n;
  }
};

/** a locality's names as the records may write it */
function placeNames(place: string, w: World): string[] {
  const n = (x: string) => x.toLowerCase().replace(/[.]/g, " ").replace(/\s+/g, " ").trim();
  const bare = (x: string) => n(x).replace(/\s/g, "");
  const hit = w.places.find((p) => [p.name, ...p.aliases].some((a) => bare(a) === bare(place)));
  const extra = bare(place) === "tnagar" ? ["thyagaraya nagar", "theagaraya nagar", "t nagar"] : [];
  return [...new Set([n(place), ...extra, ...(hit ? [hit.name, ...hit.aliases] : []).filter((a) => /^[\x20-\x7e]+$/.test(a)).map(n)])].filter((x) => x.length >= 3).slice(0, 6);
}
const like = (x: string) => `%${x.toLowerCase().replace(/[%_\\]/g, "")}%`;
/** the request's own limits, without any window */
function limits(q: Query, w: World, now: string, o: { status?: boolean; lockDept?: string | null } = {}): { parts: string[]; params: unknown[] } {
  const parts: string[] = [], params: unknown[] = [];
  const add = (s: string, ...p: unknown[]) => { parts.push(s); params.push(...p); };
  // ("=", "~": exactly one locality or road, as it is grouped, inside the place it was counted in (" @Velachery"); "+": a place inside its zone alone)
  const exact = q.place && /^[=~]/.test(q.place) ? q.place.slice(1).split(" @") : null;
  if (exact) { add(`LOWER(${q.place!.startsWith("=") ? LOCALITY : ROAD_OF}) = ?`, exact[0].toLowerCase()); if (q.zones.length) add(exact[1] ? "(i.zone_no IN (?) OR i.zone_no IS NULL)" : "i.zone_no IN (?)", q.zones); }
  const named = exact ? exact[1] ?? null : q.place ? q.place.replace(/^\+/, "") : null, inZone = !!exact || !!q.place?.startsWith("+");
  if (named) {
    // a locality's own names ("T Nagar", "T. Nagar", "Thyagaraya Nagar") in its place or headline, from the start of a word; with the zone known,
    // never another zone's place of the same name
    const names = placeNames(named, w).map((x) => `% ${x.replace(/[%_\\]/g, "")}%`);
    const hay = (c: string) => `REPLACE(REPLACE(REPLACE(CONCAT(' ', LOWER(COALESCE(${c}, ''))), '. ', ' '), '.', ' '), ',', ', ')`;
    const any = names.map(() => `(${hay("i.place_text")} LIKE ? OR ${hay("i.title")} LIKE ?)`).join(" OR ");
    const ps = names.flatMap((x) => [x, x]);
    if (q.zones.length && !exact) add(`((${any}) AND (i.zone_no IN (?)${inZone ? "" : " OR i.zone_no IS NULL"}))`, ...ps, q.zones);
    else add(`(${any})`, ...ps);
  } else if (q.zones.length && !exact) add("i.zone_no IN (?)", q.zones);
  if (q.ward) add("i.ward_no = ?", q.ward);
  if (q.older_days) add("i.first_reported_at < ?", new Date(Date.parse(`${now.replace(" ", "T")}Z`) - q.older_days * 864e5).toISOString().slice(0, 19).replace("T", " "));
  if (q.clock_from != null && q.clock_to != null) {
    if (q.clock_from < q.clock_to) add("HOUR(i.first_reported_at) >= ? AND HOUR(i.first_reported_at) < ?", q.clock_from, q.clock_to);
    else add("(HOUR(i.first_reported_at) >= ? OR HOUR(i.first_reported_at) < ?)", q.clock_from, q.clock_to);
  }
  if (q.taluk) add("i.taluk_code = ?", q.taluk);
  if (o.lockDept) add("i.lead_dept = ?", o.lockDept);
  else if (q.depts.length) add("i.lead_dept IN (?)", q.depts);
  for (const x of q.not) {
    if (/^\d+$/.test(x)) add("COALESCE(i.zone_no, 0) <> ?", Number(x));
    else if (w.depts.some((d) => d.code === x)) { if (!o.lockDept) add("COALESCE(i.lead_dept, '') <> ?", x); }
    else add("COALESCE(i.category_code, '') <> ?", x);
  }
  const cats = q.group ? topicCats(q.group as Topic, w.cats) : q.cats;
  if (cats.length) add("i.category_code IN (?)", cats);
  if (q.sev.length) add("i.severity_level IN (?)", q.sev);
  if (q.harm === "deaths") add("COALESCE(i.dead, 0) > 0");
  if (q.harm === "injuries") add("COALESCE(i.injured, 0) > 0");
  if (q.from === "citizens") add("COALESCE(i.citizen_complaints, 0) > 0");
  if (q.from === "police") add("COALESCE(i.police_reports, 0) > 0");
  if (q.from === "hospital") add("LOWER(COALESCE(i.sources, '')) LIKE '%hospital%'");
  if (q.from === "news") add("COALESCE(i.media_only, 0) = 1");
  if (q.words.length) {
    const text = `LOWER(CONCAT(COALESCE(i.headline, ''), ' ', COALESCE(i.title, ''), ' ', COALESCE(i.summary, ''), ' ', COALESCE(i.ai_summary, '')))`;
    // (an attempt on a life is not a murder)
    const not = q.words.some((x) => /murder|homicide/.test(x)) && !q.words.some((x) => /attempt|முயற்சி/.test(x)) ? ` AND ${text} NOT LIKE '%attempt%murder%' AND ${text} NOT LIKE '%murder attempt%' AND ${text} NOT LIKE '%attempt%kill%'` : "";
    // (each way of saying it: all its words, in any order: "tree crash" is "Tree crashes near ...")
    const ways = q.words.map((x) => x.split(/\s+/).filter((t) => t.length >= 3 || /[^\x00-\x7f]/.test(t)).slice(0, 4)).filter((x) => x.length);
    if (ways.length) add(`(${ways.map((ts) => `(${ts.map(() => `HAS_WORD(${text}, ?) = 1`).join(" AND ")})`).join(" OR ")})${not}`, ...ways.flat());
  }
  if (o.status !== false) {
    if (q.status === "open" || q.status === "overdue") parts.push(`${OPEN_NOW} = 1`);
    if (q.status === "overdue") parts.push(pastDueSql(now));
    if (q.status === "resolved") parts.push(`${EFF.open} = 0 AND ${EFF.status} = 'Resolved'`);
  }
  return { parts, params };
}
type Where = { sql: string; params: unknown[] };
const reported = (w: Win, l: { parts: string[]; params: unknown[] }): Where =>
  ({ sql: [w.rolling ? "i.first_reported_at > ?" : "i.first_reported_at >= ?", "i.first_reported_at < ?", ...l.parts].join(" AND "), params: [w.from, w.to, ...l.params] });
const reportedBefore = (w: Win, l: { parts: string[]; params: unknown[] }): Where =>
  ({ sql: [w.rolling ? "i.first_reported_at > ?" : "i.first_reported_at >= ?", w.rolling ? "i.first_reported_at <= ?" : "i.first_reported_at < ?", ...l.parts].join(" AND "), params: [w.prev.from, w.prev.to, ...l.params] });
/** closed in the window, by when it was closed (the dashboard's "Resolved") */
const closedIn = (from: string, to: string, openEnd: boolean, rolling: boolean, l: { parts: string[]; params: unknown[] }): Where =>
  ({ sql: [...(openEnd ? [`${EFF.closedAt} > ?`] : [`${EFF.closedAt} ${rolling ? ">" : ">="} ?`, `${EFF.closedAt} ${rolling ? "<=" : "<"} ?`]), ...l.parts, `${EFF.open} = 0`, `${EFF.status} = 'Resolved'`].join(" AND "), params: [...(openEnd ? [from] : [from, to]), ...l.params] });

const OPEN_HOURS = `CASE WHEN ${OPEN_NOW} = 1 THEN TIMESTAMPDIFF(MINUTE, i.first_reported_at, ?) / 60.0 END`;
const COLS = (now: string) => `COUNT(*) AS n, COALESCE(SUM(i.severity_level = 'Severe'), 0) AS severe, COALESCE(SUM(${OPEN_NOW}), 0) AS open,
  COALESCE(SUM(${OPEN_NOW} = 1 AND ${pastDueSql(now)}), 0) AS overdue, COALESCE(SUM(i.dead), 0) AS dead, COALESCE(SUM(i.injured), 0) AS injured,
  COALESCE(SUM(CASE WHEN ${OPEN_NOW} = 1 THEN COALESCE(i.citizen_complaints, 0) ELSE 0 END), 0) AS complaints, COALESCE(SUM(COALESCE(i.citizen_complaints, 0)), 0) AS received,
  AVG(${OPEN_HOURS}) AS open_hours`;
const CLOSE_HOURS = `TIMESTAMPDIFF(MINUTE, i.first_reported_at, ${EFF.closedAt}) / 60.0`;
const measures = (r: Row | undefined, c: Row | undefined): Measures => ({
  n: n(r?.n), severe: n(r?.severe), open: n(r?.open), overdue: n(r?.overdue), dead: n(r?.dead), injured: n(r?.injured), complaints: n(r?.complaints), received: n(r?.received),
  openDays: r?.open_hours == null ? null : r1(n(r.open_hours) / 24), resolved: n(c?.n), closed: n(c?.closed_n), closeDays: c?.hours == null || n(c?.closed_n) < 1 ? null : r1(n(c.hours) / 24) });

const ROAD_RE = /\b(?:road|rd|salai|street|highway|bypass|flyover|bridge|junction|signal|avenue|nagar main|high road|subway)\b|சாலை|தெரு/i;
const ROAD_OF = `NULLIF(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(i.place_text, ' (', 1), ',', 1)), '')`;
const KEY_OF: Partial<Record<NonNullable<Query["by"]>, string>> = {
  zone: "i.zone_no", ward: "i.ward_no", taluk: "i.taluk_code", dept: "i.lead_dept", kind: "i.category_code", group: "i.category_code", severity: "i.severity_level", status: EFF.status, place: LOCALITY, road: ROAD_OF,
  day: "DATE_FORMAT(i.first_reported_at, '%Y-%m-%d')", hour: "DATE_FORMAT(i.first_reported_at, '%H')", weekday: "WEEKDAY(i.first_reported_at)", month: "DATE_FORMAT(i.first_reported_at, '%Y-%m')"
};
/** the same, by when an incident was closed (the resolved ones of a day) */
const KEY_CLOSED: Partial<Record<NonNullable<Query["by"]>, string>> = {
  day: `DATE_FORMAT(${EFF.closedAt}, '%Y-%m-%d')`, hour: `DATE_FORMAT(${EFF.closedAt}, '%H')`, weekday: `WEEKDAY(${EFF.closedAt})`, month: `DATE_FORMAT(${EFF.closedAt}, '%Y-%m')`
};
const WIDE_PLACES = ["chennai", "chennai city", "chennai district", "greater chennai", "tamil nadu", "tamilnadu", "india"];
const DAYS_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAYS_TA = ["திங்கள்", "செவ்வாய்", "புதன்", "வியாழன்", "வெள்ளி", "சனி", "ஞாயிறு"];
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_TA = ["ஜன.", "பிப்.", "மார்.", "ஏப்.", "மே", "ஜூன்", "ஜூலை", "ஆக.", "செப்.", "அக்.", "நவ.", "டிச."];
function hourWord(h: number): string { return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`; }
const hourBand = (h: number): Bi => bi(`${hourWord(h)} to ${hourWord((h + 1) % 24)}`, `${h < 12 ? "காலை" : "பிற்பகல்/இரவு"} ${h % 12 || 12} மணி`);
const dayWord = (d: string): Bi => { const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? bi(`${Number(m[3])} ${MON_EN[Number(m[2]) - 1]}`, `${Number(m[3])} ${MON_TA[Number(m[2]) - 1]}`) : bi(d, d); };
const KEYS: PeriodKey[] = ["daily", "weekly", "monthly", "quarterly"];
const TIME_BY = new Set(["day", "hour", "weekday", "month"]);
const nextIso = (d: string, k = 1) => new Date(Date.parse(`${d}T00:00:00Z`) + k * 864e5).toISOString().slice(0, 10);

/** The request for one group's own records ("the cases in Adyar" from "which area"). */
function insideOf(q: Query, by: NonNullable<Query["by"]>, key: string, now: string, win: Win | null = null): Query | null {
  const base: Query = { ...q, by: null, rank: null, take: null, list: true, before: false, measure: "count", sort: q.measure === "complaints" ? "complaints" : q.measure === "deaths" ? "deaths" : q.measure === "days_open" ? "oldest" : "priority",
    sev: q.measure === "severe" && !q.sev.length ? ["Severe"] : q.sev, status: q.status ?? (q.measure === "open" || q.measure === "complaints" || q.measure === "days_open" ? "open" : q.measure === "overdue" ? "overdue" : q.measure === "resolved" || q.measure === "days_to_close" ? "resolved" : null),
    harm: q.measure === "deaths" ? "deaths" : q.measure === "injured" ? "injuries" : q.harm, from: q.measure === "complaints" ? "citizens" : q.from };
  switch (by) {
    // (in the road or place the question named, when it named one)
    case "zone": return { ...base, zones: [Number(key)], place: base.place ? (/^[=~+]/.test(base.place) ? base.place : `+${base.place}`) : null };
    case "ward": return { ...base, ward: Number(key) };
    // (exactly the locality, or the road, as it is grouped: "=" and "~" are read by limits below)
    case "place": return { ...base, place: `=${key}${base.place ? ` @${base.place.replace(/^[=~+]/, "").split(" @")[0]}` : ""}` };
    case "road": return { ...base, place: `~${key}${base.place ? ` @${base.place.replace(/^[=~+]/, "").split(" @")[0]}` : ""}` };
    case "taluk": return { ...base, taluk: key };
    case "dept": return { ...base, depts: [key] };
    case "kind": return { ...base, cats: [key], group: null };
    case "group": return { ...base, group: key, cats: [] };
    case "severity": return (["Severe", "High", "Medium", "Low"] as string[]).includes(key) ? { ...base, sev: [key as Query["sev"][number]] } : null;
    // (a split by status counts what was reported in the window; a list of the resolved ones counts what was closed in it)
    case "status": return null;
    // (today's point counts since midnight; "today" alone would be the dashboard's 24 hours)
    case "day": return { ...base, time: { said: key === now.slice(0, 10) ? "since midnight" : null, from: key, to: key, hours: null } };
    // (as much of the month as the window holds)
    case "month": { const [y, m] = key.split("-").map(Number); const last = `${key}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`, first = `${key}-01`;
      const a = win && win.from.slice(0, 10) > first ? win.from.slice(0, 10) : first, e = win ? lastDayOf(win) : last, b = e < last ? e : last;
      return { ...base, time: { said: a === b && a === now.slice(0, 10) ? "since midnight" : null, from: a, to: b, hours: null } }; }
    default: return null;
  }
}

async function incidentRows(wh: Where, now: string, sort: Query["sort"], limit: number): Promise<Row[]> {
  const order = sort === "newest" ? "i.first_reported_at DESC" : sort === "oldest" ? "i.first_reported_at ASC" : sort === "complaints" ? "COALESCE(i.citizen_complaints, 0) DESC, i.priority_score DESC"
    : sort === "deaths" ? "COALESCE(i.dead, 0) DESC, COALESCE(i.injured, 0) DESC, i.priority_score DESC" : `${OPEN_NOW} DESC, i.priority_score DESC, i.first_reported_at DESC`;
  const rows = await sql(`SELECT i.incident_id AS id, ${TITLE} AS title, i.category_label AS type, i.category_code AS cat, i.lead_dept AS dept, dp.name AS dept_name, i.zone_no AS zone, i.zone_name,
      i.ward_no AS ward, i.place_text AS loc, i.severity_level AS sev, ${EFF.status} AS status, ${OPEN_NOW} AS open, i.citizen_complaints AS complaints, i.sla_breached AS breached,
      i.priority_score AS priority, i.attention_reason, i.ai_summary, i.dead, i.injured, i.lat, i.lon, DATE_FORMAT(i.first_reported_at, '%Y-%m-%d %H:%i:%s') AS t, ${pastDueSql(now)} AS late
    FROM incidents i LEFT JOIN ref_departments dp ON dp.code = i.lead_dept WHERE ${wh.sql} ORDER BY ${order} LIMIT ?`, [...wh.params, limit]);
  return rows.map((r) => ({ ...r, open: n(r.open) === 1, overdue: n(r.late) === 1 && n(r.open) === 1 }));
}

async function runIncidents(q0: Query, c: AskCtx, now: string): Promise<Result> {
  const w = c.world;
  let q: Query = { ...q0, measure: INC_MEASURES.has(q0.measure) ? q0.measure : "count", by: q0.by === "station" || q0.by === "item" || q0.by === "market" ? "place" : q0.by };
  const notes: Bi[] = [];
  // an officer's console counts its own department, whatever is asked
  if (c.lockDept) q = { ...q, depts: [c.lockDept], by: q.by === "dept" ? null : q.by };
  q = inherit(q, c, notes);
  // a rise or a fall of one thing is its number against the one before
  if (q.measure === "change" && !q.by) q = { ...q, measure: "count", before: true };
  const tm = timeOf(q.time, c.key, now);
  const nowSaid = q.time?.said === "now";
  const auto = !tm.said && !tm.spec;
  const key = auto ? wideKey(q, c.key) : tm.key;
  const backlog = auto && key === "quarterly" && c.key !== "quarterly";
  // (a window code chose is carried: a row clicked, or a follow-up, counts the same one)
  const carry = (k: PeriodKey): Query["time"] => ({ said: WINDOW_WORDS[k].en, from: null, to: null, hours: null });
  if (auto && !nowSaid && !q.older_days && key !== (c.dash ?? c.key)) q = { ...q, time: carry(key) };
  // a wait ("pending for more than a month") is looked for in everything the records hold
  if (tm.night) q = { ...q, clock_from: null, clock_to: null };
  let win = !tm.said && q.older_days ? windowOf(hoursSpec(MAX_HOURS), key, now) : winOf(tm, key, now);
  const empty = (cannot: Bi | null): Result => blank(q, win, w, notes, cannot);
  // a day by day, or month by month, split is of whole calendar days and months (a rolling week began at eleven in the morning of its first day,
  // and that part day was said to be the quietest)
  if ((q.by === "day" || q.by === "month") && win.rolling && win.hours >= 48) {
    const today = Date.parse(`${now.slice(0, 10)}T00:00:00Z`), iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    let a = today - (Math.round(win.hours / 24) - 1) * 864e5;
    if (q.by === "month") {
      const d = new Date(today), held = Date.parse(`${win.heldFrom.slice(0, 10)}T00:00:00Z`);
      a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (tm.said ? Math.max(0, Math.round(win.hours / 720) - 1) : 5), 1);
      while (a < held) { const x = new Date(a); a = Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1); }
    }
    const spec = readerSpec({ said: null, from: iso(a), to: iso(today), hours: null }, now);
    if (spec && spec.kind !== "window") { win = windowOf(spec, key, now); q = { ...q, time: { said: null, from: iso(a), to: iso(today), hours: null } }; }
  }
  if (win.outside === "all" || win.outside === "future") return empty(beforeRecords(win));
  if (win.note) notes.push(bi(win.note, win.note));
  const run = async (): Promise<{ t: Measures; p: Measures; cur: Where; list: Where }> => {
    const l = limits(q, w, now, { lockDept: c.lockDept }), lAny = limits(q, w, now, { status: false, lockDept: c.lockDept });
    const cur = reported(win, l), pre = reportedBefore(win, l);
    const cl = closedIn(win.from, win.to, win.rolling && win.partial, win.rolling, lAny), clPre = closedIn(win.prev.from, win.prev.to, false, win.rolling, lAny);
    const closeCols = `COUNT(*) AS n, SUM(CASE WHEN ${EFF.closedAt} >= i.first_reported_at THEN 1 ELSE 0 END) AS closed_n, AVG(CASE WHEN ${EFF.closedAt} >= i.first_reported_at THEN ${CLOSE_HOURS} END) AS hours`;
    // a list or count of the resolved ones is those closed in the window, as the tile counts them
    const resolved = q.status === "resolved";
    // (the closed ones are read only for a question about them; the window before, only for a number or a rise asked)
    const closing = resolved || q.measure === "resolved" || q.measure === "days_to_close", before = !q.by || q.before || q.measure === "change";
    const none: Row[] = [];
    const [[a], [b], [x], [y]] = await Promise.all([
      sql(`SELECT ${COLS(now)} FROM incidents i WHERE ${(resolved ? cl : cur).sql}`, [now, ...(resolved ? cl : cur).params]),
      before ? sql(`SELECT ${COLS(now)} FROM incidents i WHERE ${(resolved ? clPre : pre).sql}`, [now, ...(resolved ? clPre : pre).params]) : none,
      closing ? sql(`SELECT ${closeCols} FROM incidents i WHERE ${cl.sql}`, cl.params) : none, closing && before ? sql(`SELECT ${closeCols} FROM incidents i WHERE ${clPre.sql}`, clPre.params) : none]);
    return { t: measures(a, x), p: measures(b, y), cur, list: resolved ? cl : cur };
  };
  let got = await run();
  // a locality no record names: the zone it lies in, and said so
  if (q.place && q.zones.length && !got.t.n && !got.t.resolved) {
    const place = q.place;
    notes.push(bi(`No record of this kind names ${place} in this window, so ${and(q.zones.map((z) => zName(w, z)))}, the zone it lies in, is counted.`, `இந்தக் காலத்தில் ${place} பெயரில் பதிவு இல்லை; அது உள்ள ${and(q.zones.map((z) => zTa(w, z)), "மற்றும்")} மண்டலம் கணக்கிடப்பட்டது.`));
    q = { ...q, place: null };
    got = await run();
  }
  // a narrow thing the records file under another kind ("tree falls" under flooding): looked for in every kind
  // (never for a crime: a murder, a rape or a theft is not looked for among road and garbage reports)
  if (q.words.length && (q.cats.length || q.group) && !got.t.n && !got.t.resolved) {
    const keep = q;
    const crime = keep.group === "CRIME" || keep.cats.some((x) => (TOPICS.CRIME.cats as readonly string[]).includes(x));
    q = crime ? keep : { ...q, cats: [], group: null };
    const g2 = crime ? got : await run();
    if (g2.t.n || g2.t.resolved) { got = g2; notes.push(bi(`Looked for in reports of every kind.`, "எல்லா வகைப் பதிவுகளிலும் தேடப்பட்டது.")); }
    else if (crime) q = keep;
    else {
      // no report uses those words: the kind itself, and said so
      q = { ...keep, words: [] };
      const g3 = await run();
      if (g3.t.n || g3.t.resolved) { got = g3; notes.push(bi(`No report here uses the words "${keep.words[0]}", so all ${whatWords(q, w).en} are counted.`, `"${keep.words[0]}" என்ற சொல் எந்தப் பதிவிலும் இல்லை; ${whatWords(q, w).ta} கணக்கிடப்பட்டது.`)); }
      else q = keep;
    }
  }
  // nothing past its deadline (or open) among the last day's reports: the whole backlog, and said so
  if (!tm.said && !tm.spec && !backlog && !nowSaid && !q.older_days && (q.status === "overdue" || q.status === "open") && !got.t.n && key !== "quarterly") {
    notes.push(bi(`None among the reports of ${win.label.en}, so the last 90 days are counted.`, "இந்தக் காலத்தில் எதுவும் இல்லை; கடந்த 90 நாட்கள் கணக்கிடப்பட்டன."));
    win = windowOf(null, "quarterly", now);
    q = { ...q, time: carry("quarterly") };
    got = await run();
  }
  // "the latest three" with fewer than three in the window: as far back as it takes
  if (!tm.said && !tm.spec && !q.by && q.list && q.take && q.take < 60) for (const k of ["weekly", "monthly", "quarterly"] as const) {
    const have = q.status === "resolved" ? got.t.resolved : got.t.n;
    if (have >= q.take! || KEYS.indexOf(k) <= KEYS.indexOf(win.key)) continue;
    const short = win.label.en;
    win = windowOf(null, k, now);
    q = { ...q, time: carry(k) };
    got = await run();
    if (((q.status === "resolved" ? got.t.resolved : got.t.n) >= q.take! || k === "quarterly")) notes.push(bi(`Fewer than ${q.take} in the ${short}, so ${win.label.en} were looked at.`, `${win.label.ta} வரை பார்க்கப்பட்டது.`));
  }
  // an average of nothing is no figure
  if (!q.by && (q.measure === "days_to_close" || q.measure === "days_open") && valueOf(got.t, q.measure) == null) {
    return { ...blank(q, win, w, notes, bi(`None of the ${whatWords({ ...q, status: null }, w).en} ${q.measure === "days_to_close" ? "were closed" : "are open"} in the ${win.label.en}, so there is no time to give.`, `${win.label.ta}: கணக்கிட எதுவும் இல்லை.`)), sources: ["incidents"] };
  }
  let total = valueOf(got.t, q.measure) ?? 0;
  // a share: of every incident in the same place and window
  let whole: number | null = null;
  if (q.measure === "share" && !q.by) {
    // ("what percent of police cases are resolved" is of the police cases; "what share are the police's" is of all of them)
    const state = q.sev.length > 0 || !!q.status || !!q.harm || !!q.from || !!q.older_days;
    const subject = q.depts.length > 0 || !!q.group || q.cats.length > 0 || q.words.length > 0;
    const all: Query = { ...q, sev: [], status: null, harm: null, from: null, older_days: null, ...(state && subject ? {} : { depts: [], group: null, cats: [], words: [] }),
      // ("what share does Adyar have": of the whole district)
      ...(!state && !subject ? { zones: [], place: null, taluk: null, ward: null, clock_from: null, clock_to: null } : {}) };
    const wh = reported(win, limits(all, w, now, { lockDept: c.lockDept })), part = reported(win, limits(q, w, now, { lockDept: c.lockDept }));
    const [[r], [p]] = await Promise.all([sql(`SELECT COUNT(*) AS n FROM incidents i WHERE ${wh.sql}`, wh.params), sql(`SELECT COUNT(*) AS n FROM incidents i WHERE ${part.sql}`, part.params)]);
    whole = n(r?.n);
    const have = n(p?.n);
    total = whole ? Math.round((have / whole) * 1000) / 10 : 0;
    const ofWhat = whatWords({ ...all, measure: "count" }, w);
    notes.push(bi(`${have} of ${whole} ${ofWhat.en} reported ${win.label.en.startsWith("last") ? `in the ${win.label.en}` : `(${win.label.en})`}.`, `${ofWhat.ta}: ${whole} இல் ${have}.`));
  }
  const res: Result = { ...blank(q, win, w, notes, null), asOf: now, total, totals: got.t, prev: q.measure === "share" ? null : { total: valueOf(got.p, q.measure) ?? 0, label: bi(win.prev.label.en, win.prev.label.ta), held: win.prevHeld } };
  if (q.by) {
    res.groups = q.per ? await perGroups(q, w, win, now, c.lockDept ?? null) : await incidentGroups(q, w, win, now, c.lockDept ?? null);
    // a ranking with nothing in it, with no time said ("which street in Adyar floods the most", on a dry day): as far back as it takes
    if (!q.per && !tm.said && !tm.spec && q.order === "most" && !TIME_BY.has(q.by) && res.groups.every((g) => !g.value)) for (const k of ["weekly", "monthly", "quarterly"] as const) {
      if (KEYS.indexOf(k) <= KEYS.indexOf(win.key)) continue;
      const was = win.label.en;
      win = windowOf(null, k, now);
      const wider: Query = { ...q, time: carry(k) };
      const gs = await incidentGroups(wider, w, win, now, c.lockDept ?? null);
      if (gs.every((g) => !g.value)) continue;
      q = wider; res.q = wider;
      got = await run();
      res.groups = gs; res.win = win; res.over = bi(win.label.en, win.label.ta); res.totals = got.t; res.total = valueOf(got.t, q.measure) ?? 0; res.prev = null;
      notes.push(bi(`None in the ${was}, so the ${win.label.en} are counted.`, `${win.label.ta} கணக்கிடப்பட்டது.`));
      break;
    }
    // a rise or a fall: each against its own count in the window before (which must lie inside the records)
    if (q.measure === "change") {
      if (!win.prevHeld) return { ...blank(q, win, w, notes, bi("The window before is not fully in the records, so no rise or fall can be given.", "முந்தைய காலம் பதிவுகளில் முழுமையாக இல்லை.")), sources: ["incidents"] };
      const was = await incidentGroups({ ...q, measure: "count" }, w, win, now, c.lockDept ?? null, true);
      const before = new Map(was.map((g) => [g.key, g.m?.n ?? 0]));
      // (one that has none now is a fall too)
      for (const g of was) if (!res.groups.some((x) => x.key === g.key)) res.groups.push({ ...g, m: { ...g.m!, n: 0 } });
      for (const g of res.groups) { const p = before.get(g.key) ?? 0, v = g.m?.n ?? 0; g.value = v - p; g.sub = bi(`${v} now, ${p} in ${win.prev.label.en}`, `இப்போது ${v}, முன்பு ${p}`); }
      if (q.order === "least") res.groups = res.groups.filter((g) => g.value < 0); else res.groups = res.groups.filter((g) => g.value > 0);
      res.prev = null;
      res.total = got.t.n - got.p.n;
      res.measure = bi("rise or fall", "உயர்வு / குறைவு");
      res.unit = null;
    }
    if (q.measure === "share") { res.total = 100; const all = res.groups.reduce((a, g) => a + (g.m?.n ?? 0), 0); for (const g of res.groups) { g.sub = bi(`${g.m?.n ?? 0} of ${all} incidents`, `${all} இல் ${g.m?.n ?? 0}`); g.value = all ? Math.round(((g.m?.n ?? 0) / all) * 1000) / 10 : 0; } }
    cut(res);
    if (q.measure === "days_to_close") notes.push(bi("Only those with 3 or more closed in the window are ranked.", "3 அல்லது அதற்கு மேல் முடிக்கப்பட்டவை மட்டும்."));
  }
  // the records behind the answer: the list asked for, the one group asked for, or what a number counts
  const one = q.by && res.shown.length === 1 && res.shown[0].inside ? res.shown[0] : null;
  if (!q.by || one || q.list) {
    let wh = got.list;
    if (one?.inside) {
      const iq = one.inside;
      const tm2 = timeOf(iq.time, key, now);
      const win2 = iq.time !== q.time ? winOf(tm2, tm2.key, now) : win;
      const l = limits(iq, w, now, { lockDept: c.lockDept });
      wh = iq.status === "resolved" ? closedIn(win2.from, win2.to, win2.rolling && win2.partial, win2.rolling, limits(iq, w, now, { status: false, lockDept: c.lockDept })) : reported(win2, l);
    } else if (!q.by && q.measure === "share") {
      wh = reported(win, limits(q, w, now, { lockDept: c.lockDept }));
    } else if (!q.by) {
      // a number with a measure of its own ("how many severe", "how many deaths") is shown by the records it counts
      const iq = insideOf(q, "zone", "0", now)!;
      const own: Query = { ...iq, zones: q.zones, place: q.place, sort: q.sort !== "priority" ? q.sort : iq.sort };
      const l = limits(own, w, now, { lockDept: c.lockDept });
      wh = own.status === "resolved" ? closedIn(win.from, win.to, win.rolling && win.partial, win.rolling, limits(own, w, now, { status: false, lockDept: c.lockDept })) : reported(win, l);
    }
    if (!q.by || one) {
      const limit = q.by ? (q.list ? 60 : 12) : Math.min(60, q.take ?? 60);
      const [rows, [t]] = await Promise.all([incidentRows(wh, now, q.sort !== "priority" ? q.sort : one?.inside?.sort ?? insideOf(q, "zone", "0", now)!.sort, limit), sql(`SELECT COUNT(*) AS n FROM incidents i WHERE ${wh.sql}`, wh.params)]);
      res.rows = rows; res.rowsTotal = n(t?.n);
    }
  }
  res.sources = ["incidents"];
  return res;
}

/** "the biggest problem of each zone": the first of what is ranked, inside each */
async function perGroups(q: Query, w: World, win: Win, now: string, lockDept: string | null): Promise<Group[]> {
  const per = q.per!;
  const base = await incidentGroups({ ...q, per: null, by: per, order: "most", rank: null, take: null }, w, win, now, lockDept);
  const out = await Promise.all(base.filter((g) => g.inside && (g.m?.n ?? 0) > 0).slice(0, 25).map(async (g): Promise<Group | null> => {
    const iq: Query = { ...q, per: null, place: per === "zone" && q.place && !/^[=~+]/.test(q.place) ? `+${q.place}` : q.place, zones: per === "zone" ? [Number(g.key)] : q.zones, depts: per === "dept" ? [g.key] : q.depts, cats: per === "kind" ? [g.key] : q.cats, group: per === "kind" ? null : q.group };
    const inner = (await incidentGroups(iq, w, win, now, lockDept)).filter((x) => x.value > 0).sort((a, b) => (q.order === "least" ? a.value - b.value : b.value - a.value) || a.label.localeCompare(b.label));
    const top = inner[0];
    return top ? { ...top, key: `${g.key}:${top.key}`, label: `${g.label}: ${top.label}`, ta: `${g.ta}: ${top.ta}`, zone: per === "zone" ? Number(g.key) : top.zone } : null;
  }));
  return out.filter((x): x is Group => !!x);
}

async function incidentGroups(q: Query, w: World, win: Win, now: string, lockDept: string | null, pre = false): Promise<Group[]> {
  const by = q.by!;
  const l = limits(q, w, now, { lockDept }), lAny = limits(q, w, now, { status: false, lockDept });
  const resolved = q.status === "resolved";
  const cl = closedIn(win.from, win.to, win.rolling && win.partial, win.rolling, lAny);
  const wh = pre ? (resolved ? closedIn(win.prev.from, win.prev.to, false, win.rolling, lAny) : reportedBefore(win, l)) : resolved ? cl : reported(win, l);
  const key = (resolved && KEY_CLOSED[by]) || KEY_OF[by]!;
  const keyC = KEY_CLOSED[by] ?? KEY_OF[by]!;
  const closing = resolved || q.measure === "resolved" || q.measure === "days_to_close";
  const [rows, closed] = await Promise.all([
    sql(`SELECT k, MIN(lbl) AS lbl, MIN(zone) AS zone, AVG(lat) AS lat, AVG(lon) AS lon, COUNT(*) AS n, SUM(sv) AS severe, SUM(op) AS open, SUM(od) AS overdue, SUM(dd) AS dead, SUM(ij) AS injured, SUM(oc) AS complaints, SUM(rc) AS received, AVG(oh) AS open_hours FROM (
        SELECT ${key} AS k, ${by === "kind" || by === "group" ? "i.category_label" : by === "zone" ? "i.zone_name" : "NULL"} AS lbl, i.zone_no AS zone, i.lat AS lat, i.lon AS lon, (i.severity_level = 'Severe') AS sv, ${OPEN_NOW} AS op,
          (${OPEN_NOW} = 1 AND ${pastDueSql(now)}) AS od, COALESCE(i.dead, 0) AS dd, COALESCE(i.injured, 0) AS ij, CASE WHEN ${OPEN_NOW} = 1 THEN COALESCE(i.citizen_complaints, 0) ELSE 0 END AS oc, COALESCE(i.citizen_complaints, 0) AS rc, ${OPEN_HOURS} AS oh
        FROM incidents i WHERE ${wh.sql}) x WHERE k IS NOT NULL GROUP BY k`, [now, ...wh.params]),
    !closing ? ([] as Row[]) : sql(`SELECT k, COUNT(*) AS n, SUM(ok) AS closed_n, AVG(hrs) AS hours FROM (
        SELECT ${keyC} AS k, CASE WHEN ${EFF.closedAt} >= i.first_reported_at THEN 1 ELSE 0 END AS ok, CASE WHEN ${EFF.closedAt} >= i.first_reported_at THEN ${CLOSE_HOURS} END AS hrs FROM incidents i WHERE ${cl.sql}) x WHERE k IS NOT NULL GROUP BY k`, cl.params)]);
  const byKey = new Map<string, Row>(rows.map((r) => [String(r.k), r]));
  const closedBy = new Map<string, Row>(closed.map((r) => [String(r.k), r]));
  const keys = new Set([...byKey.keys(), ...closedBy.keys()]);
  // every zone, day, hour or weekday of the window, also the ones with nothing (the fewest, a trend with a quiet day)
  if (by === "zone" && !q.place && !q.ward && !q.taluk) for (const z of w.zones) if ((!q.zones.length || q.zones.includes(z.n)) && !q.not.includes(String(z.n))) keys.add(String(z.n));
  if (by === "taluk" && !q.zones.length && !q.place && !q.ward) for (const t of w.taluks) keys.add(t.code);
  if (by === "dept" && q.depts.length && !lockDept) for (const d of q.depts) keys.add(d);
  // the fewest of a department's counts: every department, with those that have none
  if (by === "dept" && q.order === "least" && !lockDept && !q.depts.length) for (const d of w.depts) if (!q.not.includes(d.code)) keys.add(d.code);
  if (by === "day") for (const d of daysOf(win)) keys.add(d);
  if (by === "hour") for (let h = 0; h < 24; h++) keys.add(String(h).padStart(2, "0"));
  if (by === "weekday" && win.hours >= 7 * 24) for (let d = 0; d < 7; d++) keys.add(String(d));
  let out: Group[] = [];
  const groupAgg = new Map<string, { rows: Row[]; closed: Row[] }>();
  for (const k of keys) {
    const r = byKey.get(k), x = closedBy.get(k);
    if (by === "group") {
      const t = topicOf(k);
      if (!t) continue;
      const g = groupAgg.get(t) ?? groupAgg.set(t, { rows: [], closed: [] }).get(t)!;
      if (r) g.rows.push(r);
      if (x) g.closed.push(x);
      continue;
    }
    const lab = labelOf(by, k, r, w);
    if (!lab) continue;
    const m = measures(r, x);
    out.push({ key: k, label: lab.en, ta: lab.ta, zone: by === "zone" ? Number(k) : r?.zone == null || by !== "place" && by !== "road" ? null : n(r.zone), lat: nn(r?.lat), lon: nn(r?.lon), value: valueOf(m, q.measure) ?? 0, m, sub: null, inside: by === "day" && win.from.slice(0, 10) === k && win.from.slice(11) !== "00:00:00" ? null : insideOf(q, by, k, now, win) });
  }
  for (const [t, g] of groupAgg) {
    const sum = (f: string) => g.rows.reduce((a, r) => a + n(r[f]), 0);
    const open = sum("open"), cn = g.closed.reduce((a, r) => a + n(r.closed_n), 0);
    const m = measures({ n: sum("n"), severe: sum("severe"), open, overdue: sum("overdue"), dead: sum("dead"), injured: sum("injured"), complaints: sum("complaints"), received: sum("received"),
      open_hours: open ? g.rows.reduce((a, r) => a + n(r.open_hours) * n(r.open), 0) / open : null } as Row,
    { n: g.closed.reduce((a, r) => a + n(r.n), 0), closed_n: cn, hours: cn ? g.closed.reduce((a, r) => a + n(r.hours) * n(r.closed_n), 0) / cn : null } as Row);
    out.push({ key: t, label: TOPICS[t as Topic].en, ta: TOPICS[t as Topic].ta, zone: null, lat: null, lon: null, value: valueOf(m, q.measure) ?? 0, m, sub: null, inside: insideOf(q, "group", t, now) });
  }
  // an average rests on enough closed cases, and something that has none is not the fastest
  if (q.measure === "days_to_close") out = out.filter((g) => (g.m?.closed ?? 0) >= 3 && g.m?.closeDays != null);
  if (q.measure === "days_open") out = out.filter((g) => (g.m?.open ?? 0) >= 1 && g.m?.openDays != null);
  for (const g of out) g.sub = subOf(g.m!, q);
  return out;
}

function labelOf(by: NonNullable<Query["by"]>, k: string, r: Row | undefined, w: World): Bi | null {
  switch (by) {
    case "zone": { const z = Number(k); return w.zones.some((x) => x.n === z) ? bi(zName(w, z), zTa(w, z)) : null; }
    case "taluk": { const t = w.taluks.find((x) => x.code === k); return bi(t?.name ?? k, t?.ta ?? t?.name ?? k); }
    case "ward": return bi(`Ward ${k}`, `வார்டு ${k}`);
    case "dept": return bi(dName(w, k), dTa(w, k));
    case "kind": return bi(String(r?.lbl ?? cName(w, k)), cTa(w, k));
    case "severity": return bi(k, SEV_TA[k] ?? k);
    case "status": return bi(k, k);
    case "place": { const low = k.toLowerCase(); const name = k.replace(/_Z\d+$/i, ""); return WIDE_PLACES.includes(low) || /chennai -|tnpcb|cpcb/.test(low) ? null : bi(name, name); }
    case "road": return ROAD_RE.test(k) ? bi(k, k) : null;
    case "day": return dayWord(k);
    case "month": { const [y, m] = k.split("-").map(Number); return bi(`${MON_EN[m - 1]} ${y}`, `${MON_TA[m - 1]} ${y}`); }
    case "hour": return hourBand(Number(k));
    case "weekday": return bi(DAYS_EN[Number(k)] ?? k, DAYS_TA[Number(k)] ?? k);
    default: return bi(k, k);
  }
}
/** what else is worth a glance beside a group's own figure (never the figure again) */
function subOf(m: Measures, q: Query): Bi | null {
  const en: string[] = [], ta: string[] = [];
  const add = (v: number, e: string, t: string) => { if (v) { en.push(`${v} ${e}`); ta.push(`${t} ${v}`); } };
  if (q.measure === "days_to_close") add(m.closed, "closed", "முடிந்தவை");
  else if (q.measure === "days_open") add(m.open, "open", "நிலுவை");
  else {
    // (with a figure of its own, the rest are about all its incidents, and say so)
    const own = q.measure !== "count" && q.measure !== "share" && !(q.measure === "severe" && q.sev.length) && !(q.measure === "open" && q.status === "open") && !(q.measure === "overdue" && q.status === "overdue") && !(q.measure === "resolved" && q.status === "resolved");
    if (own) add(m.n, q.status === "open" ? "open in all" : "incidents in all", "மொத்தம்");
    if (q.measure !== "severe" && !q.sev.length) add(m.severe, "severe", "கடுமையானவை");
    if (q.measure !== "open" && !q.status) add(m.open, "open", "நிலுவை");
    if (q.measure !== "overdue" && q.status !== "overdue" && q.status !== "resolved") add(m.overdue, "past deadline", "கெடு தாண்டியவை");
    if (q.measure === "complaints") add(m.received, "complaints received in all", "மொத்தப் புகார்கள்");
  }
  return en.length ? bi(en.slice(0, 3).join(", ").replace(/ in all, /, " in all, of them "), ta.slice(0, 3).join(", ")) : null;
}

/** the dashboard's own filters, for a question that names none of its own and does not say the whole district */
function inherit(q: Query, c: AskCtx, notes: Bi[]): Query {
  const b = c.base;
  if (!b || q.not.length || q.zones.length || q.place || q.ward || q.taluk || q.depts.length || q.group || q.cats.length) return q;
  const out = { ...q };
  const said: Bi[] = [];
  if (b.zone && q.by !== "zone" && q.by !== "taluk") { out.zones = [b.zone]; said.push(bi(zName(c.world, b.zone), zTa(c.world, b.zone))); }
  if (b.taluk && !b.zone && q.by !== "taluk" && q.by !== "zone") { out.taluk = b.taluk; said.push(bi(c.world.taluks.find((t) => t.code === b.taluk)?.name ?? b.taluk, b.taluk)); }
  if (b.dept && q.by !== "dept") { out.depts = [b.dept]; said.push(bi(dName(c.world, b.dept), dTa(c.world, b.dept))); }
  if (b.cat && q.by !== "kind" && q.by !== "group" && !q.words.length) { out.cats = [b.cat]; said.push(bi(cName(c.world, b.cat), cTa(c.world, b.cat))); }
  if (said.length) notes.push(bi(`Counted for ${and(said.map((x) => x.en))}, as the dashboard is filtered now.`, `இப்போது டாஷ்போர்டில் உள்ள வடிகட்டியின்படி: ${said.map((x) => x.ta).join(", ")}.`));
  return out;
}

// ---------------------------------------------------------------- slicing --

/** what stands level with the last one shown, said when a number or a position was asked ("the least congested area" with four at none) */
function level(res: Result, pool: Group[], end: number): void {
  const last = res.shown.at(-1);
  if (!last || (!res.q.take && !res.q.rank) || (res.q.take ?? 0) > 3 || res.q.of === "prices") return;
  const same = [...pool.slice(0, Math.max(0, res.from - 1)), ...pool.slice(end)].filter((g) => g.value === last.value && !res.shown.includes(g));
  if (!same.length || (res.q.of === "traffic" && res.q.by === "road") || (res.q.of === "traffic" && res.q.order !== "least")) return;
  const names = same.slice(0, 4);
  res.notes.push(bi(`The same figure: ${same.length > 4 ? `${names.map((g) => g.label).join(", ")} and ${same.length - 4} more` : and(names.map((g) => g.label))}.`, `அதே அளவு: ${names.map((g) => g.ta).join(", ")}${same.length > 4 ? `, மேலும் ${same.length - 4}` : ""}.`));
}

/** Order the groups, and keep what was asked: the position, the number, or a screenful. */
export function cut(res: Result): void {
  const q = res.q;
  const least = q.order === "least";
  // a time split is read in time order unless a position or a number is asked
  const timeSplit = q.by && TIME_BY.has(q.by) && !q.rank && !q.take && !q.per;
  if (timeSplit) res.groups.sort((a, b) => a.key.localeCompare(b.key, "en", { numeric: true }));
  else {
    const tie = (a: Group, b: Group) => (b.m?.n ?? 0) - (a.m?.n ?? 0) || a.label.localeCompare(b.label);
    res.groups.sort((a, b) => (least ? a.value - b.value : b.value - a.value) || tie(a, b));
  }
  // "the most" never names something with none of it
  // (today or this month, still running, is never the fewest)
  const now = res.asOf ?? null, live = least && res.win?.partial && now ? (q.by === "day" ? now.slice(0, 10) : q.by === "month" ? now.slice(0, 7) : null) : null;
  const pool = least || timeSplit ? res.groups.filter((g) => g.key !== live || timeSplit) : res.groups.filter((g) => g.value !== 0 || (g.spot != null));
  if (q.rank && q.rank > 1) {
    res.from = q.rank;
    res.shown = pool.slice(q.rank - 1, q.rank);
    if (!res.shown.length) res.notes.push(bi(`There are only ${pool.length} to rank.`, `வரிசையில் ${pool.length} மட்டுமே உள்ளன.`));
    level(res, pool, q.rank);
  } else if (q.per) res.shown = pool.slice(0, 25);
  else if (q.take) {
    res.shown = pool.slice(0, Math.min(25, q.take));
    // "which area had none": every one that had none
    if (least && q.take === 1 && res.shown[0]?.value === 0 && pool.filter((g) => g.value === 0).length > 1) res.shown = pool.filter((g) => g.value === 0).slice(0, 25);
    else level(res, pool, res.shown.length);
  }
  else res.shown = timeSplit ? pool.slice(-120) : pool.slice(0, q.by === "zone" ? 15 : 10);
}

const GROUP_FALLBACK = bi("group", "பிரிவு");
function blank(q: Query, win: Win | null, w: World, notes: Bi[], cannot: Bi | null): Result {
  const mw = MEASURE_WORD[q.measure];
  return { q, win, live: false, asOf: null, what: whatWords(q, w), over: win ? bi(win.label.en, win.label.ta) : bi("now", "இப்போது"), measure: bi(mw.en, mw.ta), unit: mw.unit, groupNoun: q.by ? BY_WORD[q.by] : GROUP_FALLBACK,
    total: 0, totals: null, prev: null, groups: [], shown: [], from: 1, rows: [], rowsTotal: 0, news: [], newsTotal: 0, readings: [], method: null, notes, sources: [], cannot };
}

// ---------------------------------------------------------------- traffic --

const JAM = new Set(["very", "congested", "slow"]);
const nameHas = (s: TrafficSpot, x: string) => `${s.name} ${s.road ?? ""} ${s.from ?? ""} ${s.to ?? ""}`.toLowerCase().includes(x.toLowerCase());
/** one stretch once, as the Traffic view lists them (one road number is many stretches in many areas) */
const roadKey = (s: TrafficSpot) => s.name.toLowerCase().replace(/\s+/g, " ").trim();

async function runTraffic(q0: Query, c: AskCtx, now: string): Promise<Result> {
  const w = c.world;
  const notes: Bi[] = [];
  let q: Query = { ...q0, depts: [], group: null, cats: [], sev: [], status: null };
  const tm = timeOf(q.time, c.key, now);
  if (tm.said && q.by !== null && TIME_BY.has(q.by) || (tm.said && !/\b(?:now|today|currently|right now|tonight|this (?:morning|evening))\b|இப்போ|இன்று|இன்னைக்கு/i.test(q.time?.said ?? ""))) return trafficPast(q, c, now, tm, notes);
  if (q.by && TIME_BY.has(q.by)) return trafficPast(q, c, now, tm, notes);
  if (q.by !== "zone" && q.by !== "road") q = { ...q, by: (q.measure === "jams" || q.measure === "count") && !q.by && !q.list && q.take == null ? null : "road" };
  q = { ...q, measure: q.by === "zone" ? "jams" : q.by === "road" ? "delay" : "jams" };
  const t = await Promise.race([trafficNow({ lockDept: c.lockDept ?? null }), new Promise<null>((r) => setTimeout(() => r(null), 9000))]);
  const res = { ...blank(q, null, w, notes, null), live: true, asOf: t?.at ?? null, sources: ["TomTom live traffic"] };
  if (!t || (!t.enabled && !t.spots.length)) return { ...res, cannot: bi("Live traffic cannot be read right now.", "நேரடிப் போக்குவரத்துத் தகவலை இப்போது படிக்க முடியவில்லை.") };
  const spot = (s: TrafficSpot) => !(s.zone != null && q.not.includes(String(s.zone))) && (!q.zones.length || (s.zone != null && q.zones.includes(s.zone)) || (!!q.place && nameHas(s, q.place))) && (!q.place || q.zones.length > 0 || nameHas(s, q.place)) && (!q.item || nameHas(s, q.item));
  let pool = t.spots.filter(spot);
  if (q.place && q.zones.length) {
    const own = pool.filter((s) => nameHas(s, q.place!));
    if (own.length) pool = own;
    else { notes.push(bi(`No live jam names ${q.place}, so ${and(q.zones.map((z) => zName(w, z)))}, the area it lies in, is counted.`, `${q.place} பெயரில் நெரிசல் இல்லை; அது உள்ள ${and(q.zones.map((z) => zTa(w, z)), "மற்றும்")} பகுதி கணக்கிடப்பட்டது.`)); q = { ...q, place: null }; res.q = q; }
  }
  if (q.level) pool = pool.filter((s) => s.level === q.level);
  // (closed and flooded roads and accidents, when they are asked for by name, are not jams but are counted the same way)
  const jams = pool.filter((s) => (q.level ? s.level === q.level : JAM.has(s.level)));
  res.total = jams.length;
  const count = (f: (s: TrafficSpot) => boolean) => pool.filter(f).length;
  const very = count((s) => s.level === "very"), cong = count((s) => s.level === "congested"), slow = count((s) => s.level === "slow");
  if (q.by === "zone") {
    const zs = q.zones.length ? q.zones : w.zones.map((z) => z.n);
    res.groups = zs.map((z): Group => {
      const sp = jams.filter((s) => s.zone === z);
      const v = sp.filter((s) => s.level === "very").length, d = sp.reduce((a, s) => a + (s.delayMin ?? 0), 0);
      return { key: String(z), label: zName(w, z), ta: zTa(w, z), zone: z, lat: sp.length ? sp.reduce((a, s) => a + s.lat, 0) / sp.length : null, lon: sp.length ? sp.reduce((a, s) => a + s.lon, 0) / sp.length : null, value: sp.length, m: null,
        sub: sp.length ? bi([v ? `${v} very congested` : "", d ? `${d} min of delay in all` : ""].filter(Boolean).join(", "), [v ? `கடும் நெரிசல் ${v}` : "", d ? `மொத்தத் தாமதம் ${d} நிமிடம்` : ""].filter(Boolean).join(", ")) : bi("no jam now", "நெரிசல் இல்லை"),
        inside: { ...q, zones: [z], by: "road", rank: null, take: 99, measure: "delay" } };
    });
    // ranked as the Traffic view ranks areas: very congested stretches, then all jams, then the minutes of delay
    const v = (g: Group) => jams.filter((s) => s.zone === Number(g.key) && s.level === "very").length, d = (g: Group) => jams.filter((s) => s.zone === Number(g.key)).reduce((a, s) => a + (s.delayMin ?? 0), 0);
    res.groups.sort((a, b) => (q.order === "least" ? a.value - b.value || v(a) - v(b) || d(a) - d(b) : v(b) - v(a) || b.value - a.value || d(b) - d(a)));
    keep(res);
    res.method = bi(q.order === "least" ? "Areas with the fewest jams first (TomTom live)." : "Ranked by very congested stretches, then the number of jams, then the minutes of delay added up (TomTom live).", "கடும் நெரிசல், பிறகு நெரிசல்களின் எண்ணிக்கை, பிறகு மொத்தத் தாமதம் (TomTom நேரடி).");
    // the roads of the one area asked about
    if (res.shown.length === 1) res.readings = jamsRanked({ spots: jams.filter((s) => s.zone === Number(res.shown[0].key)) }, "most").slice(0, 8).map(spotReading);
  } else if (q.by === "road") {
    // one road once, by its worst stretch; the order is the Traffic view's (very congested, congested, slow, then the delay, then the length)
    const seen = new Map<string, Group>();
    for (const s of q.level && !JAM.has(q.level) ? [...pool].sort((a, b) => (b.delayMin ?? 0) - (a.delayMin ?? 0) || (b.lengthM ?? 0) - (a.lengthM ?? 0) || a.name.localeCompare(b.name)) : jamsRanked({ spots: pool }, "most")) {
      const k = roadKey(s);
      const had = seen.get(k);
      if (had) continue;
      const len = lengthWords(s.lengthM, "en"), lenTa = lengthWords(s.lengthM, "ta");
      seen.set(k, { key: s.id, label: s.name, ta: s.name, zone: s.zone, lat: s.lat, lon: s.lon, value: s.delayMin ?? 0, m: null, spot: s, inside: null,
        sub: bi(`${LEVEL_WORD[s.level].en.toLowerCase()}${len ? `, over ${len}` : ""}${s.zoneName && q.zones.length !== 1 ? `, ${s.zone ? s.zoneName : "outside the city's wards"}` : ""}`, `${LEVEL_WORD[s.level].ta}${lenTa ? `, ${lenTa}` : ""}${s.zoneName && q.zones.length !== 1 ? `, ${s.zone ? zTa(w, s.zone) : s.zoneName}` : ""}`) });
    }
    res.groups = [...seen.values()];
    if (q.order === "least") res.groups.reverse();
    keep(res, 10);
    res.method = q.order === "least"
      ? bi("TomTom lists only stretches slower than usual; every road it does not list is moving normally. Of those listed, the mildest come first.", "வழக்கத்தைவிட மெதுவான சாலைகள் மட்டுமே பட்டியலில் உள்ளன; மற்றவை இயல்பாக உள்ளன.")
      : bi("Ranked by how bad the jam is (very congested, congested, slow), then the minutes of delay, then its length (TomTom live).", "நெரிசலின் அளவு, பிறகு தாமத நிமிடங்கள், பிறகு நீளம் (TomTom நேரடி).");
  }
  const parts = [very ? `${very} very congested` : "", cong ? `${cong} congested` : "", slow ? `${slow} slow` : ""].filter(Boolean).join(", ");
  if (!jams.length) notes.push(q.level && !JAM.has(q.level) ? bi("There are none right now.", "இப்போது எதுவும் இல்லை.") : bi("No road there is jammed right now.", "இப்போது அங்கு நெரிசல் இல்லை."));
  else if (!q.by && !q.level) notes.push(bi(`Of these, ${parts}.`, `இவற்றில்: கடும் நெரிசல் ${very}, நெரிசல் ${cong}, மெதுவானவை ${slow}.`));
  return res;
}
const spotReading = (s: TrafficSpot) => ({ id: s.id, name: s.name, zone: s.zone, value: s.delayMin ?? 0, t: null, detail: `${LEVEL_WORD[s.level].en}${s.lengthM ? `, ${lengthWords(s.lengthM, "en")}` : ""}`, lat: s.lat, lon: s.lon });
/** the position, the number or a screenful, in an order already made */
function keep(res: Result, screen = 15): void {
  const q = res.q;
  const pool = q.order === "least" ? res.groups : res.groups.filter((g) => g.value > 0 || g.spot);
  if (q.rank && q.rank > 1) {
    res.from = q.rank;
    res.shown = pool.slice(q.rank - 1, q.rank);
    if (!res.shown.length) res.notes.push(bi(`Only ${pool.length} ${pool.length === 1 ? "is" : "are"} jammed now.`, `இப்போது ${pool.length} மட்டுமே நெரிசலில் உள்ளன.`));
    level(res, pool, q.rank);
  } else { res.shown = pool.slice(0, q.take ? Math.min(25, q.take) : screen); if (q.take) level(res, pool, res.shown.length); }
}

/** traffic over days: the readings the website keeps every 10 minutes */
async function trafficPast(q0: Query, c: AskCtx, now: string, tm: ReturnType<typeof timeOf>, notes: Bi[]): Promise<Result> {
  const w = c.world;
  const win = winOf(tm, tm.key, now);
  const zone = q0.zones.length === 1 ? q0.zones[0] : null;
  let q: Query = { ...q0, by: q0.by && ["road", "zone", "day", "hour"].includes(q0.by) ? q0.by : "road", measure: "jams" };
  const res = { ...blank(q, win, w, notes, null), sources: ["TomTom readings kept every 10 minutes"] };
  if (win.outside === "all" || win.outside === "future") return { ...res, cannot: beforeRecords(win) };
  // (two or more areas: each read on its own and added up)
  const many = q0.zones.length > 1 ? await Promise.all(q0.zones.map((z) => trafficHistory(win.from, win.to, z))) : null;
  const h = await trafficHistory(win.from, win.to, zone);
  if (!h.readings) return { ...res, cannot: h.since ? bi(`No traffic reading is kept for ${win.label.en}: the website began keeping them on ${boundWords(h.since)}.`, `${win.label.ta}: போக்குவரத்துப் பதிவு இல்லை.`) : bi("No past traffic is kept yet.", "கடந்த போக்குவரத்துப் பதிவு இன்னும் இல்லை.") };
  if (h.since && h.since > win.from) notes.push(bi(`The website has kept traffic readings since ${boundWords(h.since)}.`, `${boundWords(h.since)} முதல் பதிவுகள் உள்ளன.`));
  res.total = h.days.length ? r1(h.days.reduce((a, d) => a + d.jams * d.readings, 0) / Math.max(1, h.days.reduce((a, d) => a + d.readings, 0))) : 0;
  const days = many ? h.days.map((d) => ({ ...d, jams: r1(many.reduce((a, x) => a + (x.days.find((y) => y.d === d.d)?.jams ?? 0), 0)), peak: many.reduce((a, x) => a + (x.days.find((y) => y.d === d.d)?.peak ?? 0), 0), peakAt: null as string | null })) : h.days;
  // (slow and congested are not kept apart from the other jams; by the day only very congested and closed ones are, and only for the whole district)
  if (q.level === "slow" || q.level === "congested") { q = { ...q, level: null }; notes.push(bi("Slow and congested stretches are kept together, as jams.", "மெதுவான, நெரிசலான இடங்கள் ஒன்றாகவே பதிவாகின்றன.")); }
  if (q.level && (q.by === "hour" || (q.by === "day" && (!!zone || many || (q.level !== "very" && q.level !== "closed"))))) { notes.push(bi(`By the ${q.by}, only jams of every kind are kept.`, "நேர வாரியாக எல்லா நெரிசல்களும் ஒன்றாகவே பதிவாகின்றன.")); q = { ...q, level: null }; }
  const of = (s: (typeof h.stretches)[number]): number => (q.level === "very" ? s.very : q.level === "closed" ? s.closed : q.level === "flood" ? s.flooded : q.level === "accident" ? s.accidents : s.seen);
  let pool = h.stretches.filter((s) => of(s) > 0 && (!q.item || `${s.name} ${s.road ?? ""}`.toLowerCase().includes(q.item.toLowerCase())) && (!q.zones.length || (s.zone != null && q.zones.includes(s.zone))));
  if (q.place) {
    const place = q.place, own = pool.filter((s) => s.name.toLowerCase().includes(place.toLowerCase()));
    if (own.length || !q.zones.length) pool = own;
    else { notes.push(bi(`No reading names ${place}, so ${and(q.zones.map((z) => zName(w, z)))}, the area it lies in, is counted.`, `${place} பெயரில் பதிவு இல்லை; அது உள்ள ${and(q.zones.map((z) => zTa(w, z)), "மற்றும்")} பகுதி கணக்கிடப்பட்டது.`)); q = { ...q, place: null }; }
  }
  if (q.by === "zone") {
    const by = new Map<number, { seen: number; n: number; very: number }>();
    for (const s of pool) if (s.zone != null) { const x = by.get(s.zone) ?? by.set(s.zone, { seen: 0, n: 0, very: 0 }).get(s.zone)!; x.seen += of(s); x.n++; x.very += s.very; }
    res.groups = [...by.entries()].map(([z, x]): Group => ({ key: String(z), label: zName(w, z), ta: zTa(w, z), zone: z, lat: null, lon: null, value: x.seen, m: null, sub: bi(`${x.n} ${x.n === 1 ? "stretch" : "stretches"}${x.very && !q.level ? `, ${x.very} sightings very congested` : ""}`, `${x.n} இடங்கள்`), inside: { ...q, zones: [z], by: "road", rank: null, take: 99 } }));
  } else if (q.by === "day") res.groups = days.map((d): Group => ({ key: d.d, label: dayWord(d.d).en, ta: dayWord(d.d).ta, zone: null, lat: null, lon: null, value: q.level === "very" ? d.very : q.level === "closed" ? d.closed : d.jams, m: null,
    sub: q.level ? null : bi(`at most ${d.peak}${d.peakAt ? `, ${boundWords(d.peakAt).replace(/^.*, /, "at ")}` : ""}`, `அதிகபட்சம் ${d.peak}`), inside: null }));
  else if (q.by === "hour") res.groups = (many ? await (async () => { const each = await Promise.all(q.zones.map((z) => trafficByHour(win.from, win.to, z))); return each[0].map((x) => ({ ...x, jams: r1(each.reduce((a, y) => a + (y.find((k) => k.hour === x.hour)?.jams ?? 0), 0)) })); })() : await trafficByHour(win.from, win.to, zone)).map((x): Group => ({ key: String(x.hour).padStart(2, "0"), label: hourBand(x.hour).en, ta: hourBand(x.hour).ta, zone: null, lat: null, lon: null, value: x.jams, m: null, sub: null, inside: null }));
  else {
    q = { ...q, by: "road" };
    res.groups = pool.map((s): Group => {
      const sub = [q.level === "very" ? `jammed in ${s.seen}` : !q.level && s.very ? `very congested in ${s.very}` : "", s.maxDelayS && (!q.level || q.level === "very") ? `worst delay ${Math.round(s.maxDelayS / 60)} min` : ""].filter(Boolean).join(", ");
      return { key: s.stretch, label: s.name, ta: s.name, zone: s.zone, lat: s.lat, lon: s.lon, value: of(s), m: null, inside: null, sub: sub ? bi(sub, s.maxDelayS ? `அதிகபட்சத் தாமதம் ${Math.round(s.maxDelayS / 60)} நிமிடம்` : "") : null };
    });
  }
  res.q = q;
  cut(res);
  const by = q.by;
  res.measure = by === "day" || by === "hour" ? bi("jammed stretches at a time, on average", "சராசரியாக நெரிசலான இடங்கள்") : bi(`readings ${q.level === "very" ? "very congested" : q.level === "closed" ? "closed" : q.level === "flood" ? "flooded" : q.level === "accident" ? "with an accident" : "jammed"} (of ${h.readings})`, `நெரிசலாக இருந்த பதிவுகள் (${h.readings} இல்)`);
  res.unit = by === "day" || by === "hour" ? "jams" : "readings";
  res.method = bi(`Counted from ${h.readings} readings of TomTom's live traffic, one every 10 minutes.`, `10 நிமிடத்துக்கு ஒரு முறை எடுத்த ${h.readings} பதிவுகளிலிருந்து.`);
  return res;
}

// --------------------------------------------------------------- readings --

export const metricOf = (q: Pick<Query, "of" | "item" | "words">): WinMetric => (q.of === "rain" ? "rainfall_24h_mm" : q.of === "lakes" ? "lake_pct_full" : q.of === "weather" ? (/humid|ஈரப்பத/i.test(`${q.item ?? ""} ${q.words.join(" ")}`) ? "humidity_pct" : "temp_max_c") : "aqi");
const METRIC_UNIT: Record<WinMetric, { unit: string; en: string; ta: string }> = { aqi: { unit: "AQI", en: "AQI", ta: "காற்றுத் தரக் குறியீடு" }, rainfall_24h_mm: { unit: "mm", en: "rain in 24 hours", ta: "24 மணி நேர மழை" }, lake_pct_full: { unit: "%", en: "full", ta: "நிறைவு" },
  temp_max_c: { unit: "°C", en: "temperature", ta: "வெப்பநிலை" }, humidity_pct: { unit: "%", en: "humidity", ta: "ஈரப்பதம்" } };

async function runReadings(q0: Query, c: AskCtx, now: string): Promise<Result> {
  const w = c.world;
  const notes: Bi[] = [];
  const metric = metricOf(q0);
  const q: Query = { ...q0, by: q0.by && ["station", "zone", "day"].includes(q0.by) ? q0.by : "station", measure: ["latest", "average", "highest", "lowest"].includes(q0.measure) ? q0.measure : "latest" };
  const tm = timeOf(q.time, "daily", now);
  const win = winOf(tm, tm.key, now);
  const res = { ...blank(q, win, w, notes, null), unit: METRIC_UNIT[metric].unit, sources: ["observations"] };
  if (win.outside === "all" || win.outside === "future") return { ...res, cannot: beforeRecords(win) };
  const zone = q.zones.length === 1 ? q.zones[0] : null;
  // (an area's own name is its zone, not a station's)
  const isArea = !!q.item && (w.zones.some((z) => z.name.toLowerCase() === q.item!.toLowerCase()) || w.places.some((p) => p.name.toLowerCase() === q.item!.toLowerCase())) && q.zones.length > 0;
  const pickName = (name: string) => !q.item || isArea || /humid|temp|rain|air|aqi|lake|level|quality/i.test(q.item) || name.toLowerCase().includes(q.item.toLowerCase().replace(/\s*(?:lake|reservoir|station|dam)\s*$/i, "").trim());
  const got = await winReadings(metric, win, metric === "lake_pct_full" ? null : zone);
  let rows = got.rows.filter((r) => pickName(r.name));
  if (q.place && !zone) rows = rows.filter((r) => r.name.toLowerCase().includes(q.place!.toLowerCase()));
  else if (q.zones.length > 1) rows = rows.filter((r) => r.zone != null && q.zones.includes(r.zone));
  else if (zone && metric !== "lake_pct_full") {
    const own = rows.filter((r) => r.zone === zone);
    if (own.length) rows = own;
    else if (rows[0]) {
      const near = rows.find((r) => r.inWindow) ?? rows[0];
      rows = [near];
      notes.push(bi(`No station stands in ${zName(w, zone)}; the nearest is ${near.name}${got.nearest && got.nearest.id === near.id ? `, ${got.nearest.km} km away` : ""}.`, `${zTa(w, zone)} பகுதியில் நிலையம் இல்லை; அருகில் உள்ளது ${rows[0].name}.`));
    }
  }
  if (!rows.length) return { ...res, cannot: bi(`No ${METRIC_UNIT[metric].en} reading is held for this.`, "இதற்கான அளவீடு இல்லை.") };
  // (days or hours asked by name with no reading in them: said so, with the last one there is; never another day's figure as theirs)
  if (tm.spec && rows.every((r) => !r.inWindow)) {
    const last = [...rows].sort((a, b) => b.lastAt.localeCompare(a.lastAt))[0];
    return { ...res, cannot: bi(`No ${metric === "rainfall_24h_mm" ? "rain" : METRIC_UNIT[metric].en} reading is held for ${win.label.en}. The last one, at ${last.name}, was ${r1(last.last)} ${METRIC_UNIT[metric].unit} on ${boundWords(last.lastAt)}.`,
      `${win.label.ta}: அளவீடு இல்லை. கடைசி அளவீடு ${last.name}, ${boundWords(last.lastAt)}: ${r1(last.last)} ${METRIC_UNIT[metric].unit}.`) };
  }
  // a station whose last reading is older than the window says nothing about it, while others do
  const older = rows.filter((r) => !r.inWindow);
  if (older.length && older.length < rows.length) { rows = rows.filter((r) => r.inWindow); notes.push(bi(`${older.length} station${older.length === 1 ? "" : "s"} with no reading in this time ${older.length === 1 ? "is" : "are"} left out.`, `இந்த நேரத்தில் அளவீடு இல்லாத ${older.length} நிலையம் சேர்க்கப்படவில்லை.`)); }
  const stale = rows.filter((r) => !r.inWindow);
  if (stale.length === rows.length) res.over = bi(`the latest readings, ${boundWords(stale.map((r) => r.lastAt).sort().at(-1)!)}`, `கடைசி அளவீடு, ${boundWords(stale.map((r) => r.lastAt).sort().at(-1)!)}`);
  if (stale.length === rows.length) notes.push(bi(`The latest readings held were taken on ${boundWords(stale.map((r) => r.lastAt).sort().at(-1)!)}.`, `கடைசி அளவீடு: ${boundWords(stale.map((r) => r.lastAt).sort().at(-1)!)}.`));
  // rain over several days is the daily readings added up (the 8:30 reading is the last 24 hours' alone), unless the highest or the average is asked
  const rainSum = metric === "rainfall_24h_mm" && win.hours > 36 && rows.some((r) => r.inWindow) && (q0.measure === "latest" || q0.measure === "count" || !["average", "highest", "lowest"].includes(q0.measure));
  const sums = new Map<string, number>();
  if (rainSum) for (const x of await sql(`SELECT id, SUM(v) AS s FROM (SELECT place_id AS id, DATE_FORMAT(observed_at, '%Y-%m-%d') AS d, MAX(value) AS v FROM observations WHERE metric = ? AND observed_at >= ? AND observed_at < ? GROUP BY place_id, d) y GROUP BY id`, [metric, win.from, win.to])) sums.set(String(x.id), r1(n(x.s)));
  if (rainSum) {
    const days = (await sql(`SELECT DATE_FORMAT(observed_at, '%Y-%m-%d') AS d FROM observations WHERE metric = ? AND observed_at >= ? AND observed_at < ? GROUP BY d`, [metric, win.from, win.to])).length;
    const all = Math.max(1, Math.round((Date.parse(`${lastDayOf(win)}T00:00:00Z`) - Date.parse(`${win.from.slice(0, 10)}T00:00:00Z`)) / 864e5) + 1);
    if (days < all - 1) notes.push(bi(`Rain was read on ${days} of these ${all} days.`, `இந்த ${all} நாட்களில் ${days} நாட்களின் மழை அளவு உள்ளது.`));
  }
  const val = (r: (typeof rows)[number]) => rainSum ? sums.get(r.id) ?? 0 : r1(q.measure === "average" ? r.avg : q.measure === "highest" ? r.max : q.measure === "lowest" ? r.min : r.last);
  if (q.by === "day") {
    const ids = rows.map((r) => r.id);
    const ds = await sql(`SELECT DATE_FORMAT(observed_at, '%Y-%m-%d') AS d, AVG(value) AS a, MAX(value) AS hi, MIN(value) AS lo FROM observations WHERE metric = ? AND observed_at >= ? AND observed_at < ? AND place_id IN (?) GROUP BY d ORDER BY d`, [metric, win.from, win.to, ids]);
    res.groups = ds.map((d): Group => { const v = r1(n(q.measure === "highest" ? d.hi : q.measure === "lowest" ? d.lo : d.a)); return { key: String(d.d), label: dayWord(String(d.d)).en, ta: dayWord(String(d.d)).ta, zone: null, lat: null, lon: null, value: v, m: null, sub: null, inside: null }; });
    if (q.measure === "latest") res.measure = bi("average of the day", "அன்றைய சராசரி");
  } else if (q.by === "zone") {
    const by = new Map<number, number[]>();
    for (const r of rows) if (r.zone != null) (by.get(r.zone) ?? by.set(r.zone, []).get(r.zone)!).push(val(r));
    res.groups = [...by.entries()].map(([z, xs]): Group => ({ key: String(z), label: zName(w, z), ta: zTa(w, z), zone: z, lat: null, lon: null, value: r1(xs.reduce((a, b) => a + b, 0) / xs.length), m: null, sub: bi(`${xs.length} station${xs.length === 1 ? "" : "s"}`, `${xs.length} நிலையம்`), inside: null }));
    notes.push(bi("Only areas with a station are compared.", "நிலையம் உள்ள பகுதிகள் மட்டும்."));
  } else {
    res.groups = rows.map((r): Group => ({ key: r.id, label: r.name, ta: r.name, zone: r.zone, lat: r.lat, lon: r.lon, value: val(r), m: null, sub: bi(`${rainSum ? "the daily readings added up" : q.measure === "latest" ? `at ${boundWords(r.lastAt)}` : `${r.count} reading${r.count === 1 ? "" : "s"}`}`, boundWords(r.lastAt)), inside: null }));
  }
  const vals = rows.map(val);
  res.total = r1(vals.reduce((a, b) => a + b, 0) / vals.length);
  res.measure = rainSum ? bi("rain in all over the window", "மொத்த மழை") : bi(`${METRIC_UNIT[metric].en}${q.measure !== "latest" ? `, ${q.measure}` : ""}`, METRIC_UNIT[metric].ta);
  cut(res);
  if (q.by === "station" || q.by === "zone") {
    // a station that read nothing (0 mm) still answers "which stations had rain"; the order never drops it
    if (q.order === "most" && !res.shown.length) res.shown = res.groups.slice(0, q.take ?? 10);
  }
  if (q.by === "station") res.readings = res.shown.map((g) => { const r = rows.find((x) => x.id === g.key)!; return { id: g.key, name: g.label, zone: g.zone, value: g.value, t: r.lastAt, detail: r.inWindow ? null : "before this window", lat: g.lat, lon: g.lon }; });
  return res;
}

// ----------------------------------------------------------------- prices --

async function runPrices(q0: Query, c: AskCtx, now: string): Promise<Result> {
  const w = c.world;
  const notes: Bi[] = [];
  const q: Query = { ...q0, by: q0.by === "market" ? "market" : "item", measure: q0.measure === "change" ? "change" : "price" };
  const tm = timeOf(q.time, "weekly", now);
  const win = winOf(tm, tm.key, now);
  const res = { ...blank(q, win, w, notes, null), sources: ["AGMARKNET market prices"] };
  if (win.outside === "future") return { ...res, cannot: beforeRecords(win) };
  const named = q.place ? CHENNAI_MARKETS.find((m) => m.key.toLowerCase().replace(/[^a-z]/g, "") === q.place!.toLowerCase().replace(/[^a-z]/g, "").replace(/market$/, ""))?.key ?? null : null;
  const zone = q.zones.length === 1 ? q.zones[0] : null;
  const want = (q.item ?? "").toLowerCase().replace(/(?:oes|es|s)$/, "").trim();
  const has = (x: string) => !want || x.toLowerCase().includes(want);
  if (q.by === "market") {
    const all = await Promise.all(CHENNAI_MARKETS.map(async (m) => ({ m, p: await winPrices(win, null, m.key, { fetch: false }) })));
    res.groups = all.flatMap(({ m, p }): Group[] => {
      const r = p.rows.filter((x) => has(x.commodity));
      if (!r.length) return [];
      const v = want ? r[0].perKg : r1(r.reduce((a, x) => a + x.perKg, 0) / r.length);
      return [{ key: m.key, label: m.key, ta: m.key, zone: m.zone, lat: null, lon: null, value: v, m: null, sub: bi(`${want ? r[0].commodity : `average of ${r.length} vegetables`}, ${dayWord(p.latest ?? "").en}`, dayWord(p.latest ?? "").ta), inside: null }];
    });
  } else {
    const p = await winPrices(win, zone, named, { fetch: true });
    if (zone && !p.market && !named) notes.push(bi(`No vegetable market that reports prices stands in ${zName(w, zone)}: these are the Chennai markets together.`, `${zTa(w, zone)} பகுதியில் விலை தரும் சந்தை இல்லை; இது சென்னைச் சந்தைகளின் விலை.`));
    if (p.market) notes.push(bi(`At the ${p.market} market.`, `${p.market} சந்தை.`));
    if (p.latest && !p.inWindow) res.over = bi(`the last report, ${dayWord(p.latest).en}`, `கடைசி விலைப் பதிவு, ${dayWord(p.latest).ta}`);
    if (p.latest && !p.inWindow) notes.push(bi(`The markets last reported on ${dayWord(p.latest).en}.`, `கடைசி விலைப் பதிவு: ${dayWord(p.latest).ta}.`));
    else if (p.latest) notes.push(bi(`The latest report is of ${dayWord(p.latest).en}.`, `கடைசி விலைப் பதிவு: ${dayWord(p.latest).ta}.`));
    res.groups = p.rows.filter((x) => has(x.commodity)).map((x): Group => {
      const ch = Math.round((x.perKg - x.firstPerKg) * 100) / 100;
      return { key: x.commodity, label: x.commodity, ta: x.commodity, zone: null, lat: null, lon: null, value: q.measure === "change" ? ch : x.perKg, m: null,
        sub: bi(x.firstDate !== x.date ? `${ch > 0 ? "up" : ch < 0 ? "down" : "same as"} ${ch ? `₹${Math.abs(ch)} from` : ""} ${dayWord(x.firstDate).en}`.replace(/\s+/g, " ") : `${x.markets} market${x.markets === 1 ? "" : "s"}, ${dayWord(x.date).en}`, dayWord(x.date).ta), inside: null };
    });
    // the order is the household staples' unless a most or least is asked
    if (!q.rank && !q.take && !want && q0.order === "most" && q0.measure !== "change" && q0.by !== "item") { res.shown = res.groups.slice(0, 12); res.total = res.groups.length; return res.groups.length ? res : { ...res, cannot: bi("No price is held for this.", "இதற்கான விலை இல்லை.") }; }
  }
  if (!res.groups.length) return { ...res, cannot: bi(q.item ? `No price of ${q.item} is held for this.` : "No price is held for this.", "இதற்கான விலை இல்லை.") };
  // (one vegetable asked about keeps its real change, up or down)
  if (q.measure === "change" && !want && q.order === "most") res.groups = res.groups.filter((g) => g.value > 0);
  if (q.measure === "change" && !want && q.order === "least") res.groups = res.groups.filter((g) => g.value < 0);
  res.total = res.groups.length;
  cut(res);
  return res;
}

// ------------------------------------------------------------------- news --

async function runNews(q0: Query, c: AskCtx, now: string): Promise<Result> {
  const w = c.world;
  const notes: Bi[] = [];
  const q: Query = { ...q0, by: null, measure: "count", list: true };
  const tm = timeOf(q.time, c.key, now);
  const win = winOf(tm, tm.key, now);
  const res = { ...blank(q, win, w, notes, null), sources: ["news"] };
  if (win.outside === "all" || win.outside === "future") return { ...res, cannot: beforeRecords(win) };
  const cats = q.group ? topicCats(q.group as Topic, w.cats) : q.cats;
  // (about the place, AND about the thing: a story that is only one of them is not it)
  const placeNames2 = q.place ? placeNames(q.place.replace(/^[=~+]/, "").split(" @")[0], w) : q.zones.flatMap((z) => [zName(w, z), ...w.places.filter((p) => p.zone === z).map((p) => p.name)]);
  const ask = (x: Win) => winNews(x, { words: placeNames2, also: q.words, cats: cats.length ? cats : null, dept: c.lockDept ?? null, depts: c.lockDept ? null : q.depts, newest: q.sort !== "oldest", oldest: q.sort === "oldest" }, q.take ? Math.min(30, q.take) : 20);
  let got = await ask(win);
  // "the latest two on ..." with no time said and too few in the window: as far back as it takes, and said so
  if (!tm.said && !tm.spec) for (const k of ["weekly", "monthly"] as const) {
    if (got.total >= (q.take ?? 1) || KEYS.indexOf(k) <= KEYS.indexOf((res.win ?? win).key)) continue;
    const was = (res.win ?? win).label.en, x = windowOf(null, k, now), g = await ask(x);
    if (g.total <= got.total) continue;
    got = g; res.win = x; res.over = bi(x.label.en, x.label.ta);
    notes.push(bi(`Fewer than ${q.take ?? 1} in the ${was}, so the ${x.label.en} were looked at.`, `${x.label.ta} வரை பார்க்கப்பட்டது.`));
  }
  res.news = got.rows; res.newsTotal = got.total; res.total = got.total;
  return res;
}

// -------------------------------------------------------------------- all --

/** One request, run. */
export async function runQuery(q: Query, c: AskCtx): Promise<Result> {
  const now = c.now ?? await asOf();
  const r = q.of === "traffic" ? await runTraffic(q, c, now) : q.of === "air" || q.of === "rain" || q.of === "lakes" || q.of === "weather" ? await runReadings(q, c, now) : q.of === "prices" ? await runPrices(q, c, now)
    : q.of === "news" ? await runNews(q, c, now) : await runIncidents(q, c, now);
  r.asOf ??= now;
  // the words of what was counted, as it was run (an inherited filter, a zone in place of a locality)
  r.what = whatWords(r.q, c.world);
  return r;
}

/** the store's own tables this file reads beside the window reads (a guard for the tests) */
export const READS = ["incidents", "ref_departments", "observations", "documents", ops("mandi_market_prices")];
