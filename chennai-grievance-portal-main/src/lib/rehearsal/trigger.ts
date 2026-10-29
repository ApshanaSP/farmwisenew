/**
 * When the rain band appears, and what it says. The trigger is always someone else's word: IMD's district warning
 * (0 green … 3 red, by the day it is valid for), a CFM-DSS river point near its warning level, a reservoir releasing
 * water, a lake nearly full and rising, a new CFM street-flood or rainfall bulletin, or the Collector's own switch.
 * Levels: WATCH (look), REHEARSE (≤ 48 h: get ready), ACT (≤ 24 h or water already moving). Pure.
 */
import type { Bulletin, Gauge, Release, Warning } from "./source";

export type Level = "none" | "watch" | "rehearse" | "act";
export const LEVELS: Level[] = ["none", "watch", "rehearse", "act"];
export const COLOUR = ["Green", "Yellow", "Orange", "Red"] as const;
export const COLOUR_TA = ["பச்சை", "மஞ்சள்", "ஆரஞ்சு", "சிவப்பு"] as const;
/** a river point this close below its warning level counts (metres) */
export const GAUGE_NEAR_M = 0.5;
/** a lake this full and rising */
export const LAKE_WATCH_PCT = 85;

export interface Reason {
  kind: "imd" | "gauge" | "lake" | "release" | "bulletin" | "manual" | "rain";
  level: Level;
  en: string;
  ta: string;
  at: string;
  source: string;
}
export interface Trigger {
  level: Level;
  /** the start of the day the heavy rain is expected (IST "YYYY-MM-DD 00:00:00"), or null */
  rainAt: string | null;
  hoursLeft: number | null;
  /** IMD's colour for the next three days */
  days: { day: string; level: number; colour: string; text: string }[];
  reasons: Reason[];
  manual: boolean;
}
export interface LakeNow { id: string; name: string; pct: number; slope: number | null; at: string; daysToFull: number | null }

const max = (a: Level, b: Level): Level => (LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b);
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const hoursBetween = (a: string, b: string) => (Date.parse(b.replace(" ", "T") + "Z") - Date.parse(a.replace(" ", "T") + "Z")) / 3_600_000;
const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString("en-IN");

export interface TriggerInput {
  asOf: string;
  warnings: Warning[];
  gauges: Gauge[];
  releases: Release[];
  bulletins: Bulletin[];
  lakes: LakeNow[];
  /** the Collector switched the rehearsal on ("rehearse a heavy rain now") */
  manual?: boolean;
  /** a replay knows when the rain came */
  rainAt?: string | null;
  /** heavy rain falling now at a Flood Monitor station (cfmlive.heavyNow) */
  rainNow?: { level: "act" | "watch" | null; station: { name: string; at: string | null; hour: string | null; hourMm: number | null; todayMm: number | null } | null } | null;
}

export function trigger(i: TriggerInput): Trigger {
  const today = i.asOf.slice(0, 10);
  const reasons: Reason[] = [];
  // ---- IMD: the worst warning for each of the next three days (only warnings known by asOf: valid from today on)
  const days = [0, 1, 2].map((k) => {
    const d = addDays(today, k);
    const ws = i.warnings.filter((w) => w.at.slice(0, 10) === d);
    const top = ws.reduce<Warning | null>((m, w) => (!m || w.level > m.level ? w : m), null);
    return { day: d, level: top?.level ?? 0, colour: COLOUR[top?.level ?? 0], text: top?.text ?? (ws.length ? "No warning" : "No warning issued") };
  });
  let level: Level = "none";
  let rainAt: string | null = i.rainAt ?? null;
  for (const d of days) {
    if (d.level <= 0) continue;
    const start = `${d.day} 00:00:00`;
    const h = Math.max(0, hoursBetween(i.asOf, start));
    const l: Level = d.level >= 2 ? (h <= 24 ? "act" : h <= 48 ? "rehearse" : "watch") : "watch";
    level = max(level, l);
    if (d.level >= 2 && !rainAt) rainAt = start;
    reasons.push({
      kind: "imd", level: l, at: start, source: "IMD district warning",
      en: `IMD ${COLOUR[d.level]} for Chennai on ${fmtDay(d.day)}: ${d.text}`,
      ta: `${fmtDay(d.day)} சென்னைக்கு IMD ${COLOUR_TA[d.level]} எச்சரிக்கை: ${d.text}`
    });
  }
  // ---- CFM river points close to warning level (a point whose danger stage is below its warning stage is suspect: shown, never a trigger)
  for (const g of i.gauges) {
    if (g.warning == null || g.at > i.asOf || /suspect/i.test(g.quality)) continue;
    const gap = g.warning - g.level;
    if (gap > GAUGE_NEAR_M) continue;
    const l: Level = gap <= 0 ? "act" : "rehearse";
    level = max(level, l);
    reasons.push({ kind: "gauge", level: l, at: g.at, source: "Chennai Flood Monitor",
      en: gap <= 0 ? `${g.name}: river at or above its warning level (${n1(g.level)} m)` : `${g.name}: river ${n1(gap)} m below its warning level`,
      ta: gap <= 0 ? `${g.name}: ஆற்று நீர் எச்சரிக்கை அளவை எட்டியது (${n1(g.level)} மீ)` : `${g.name}: எச்சரிக்கை அளவுக்கு ${n1(gap)} மீ கீழே` });
  }
  // ---- reservoirs releasing water
  for (const r of i.releases) {
    if (r.at > i.asOf || !(r.discharge > 0)) continue;
    level = max(level, "act");
    reasons.push({ kind: "release", level: "act", at: r.at, source: "Chennai Flood Monitor",
      en: `${r.name} is releasing ${Math.round(r.discharge).toLocaleString("en-IN")} ${r.unit}`, ta: `${r.name} ஏரியிலிருந்து ${Math.round(r.discharge).toLocaleString("en-IN")} ${r.unit} நீர் திறப்பு` });
  }
  // ---- lakes nearly full and rising
  for (const k of i.lakes) {
    if (k.at > i.asOf || k.pct < LAKE_WATCH_PCT || !(k.slope != null && k.slope > 0)) continue;
    level = max(level, "watch");
    reasons.push({ kind: "lake", level: "watch", at: k.at, source: "PWD lake levels",
      en: `${k.name} is ${Math.round(k.pct)} % full and rising`, ta: `${k.name} ${Math.round(k.pct)} % நிரம்பி உயர்கிறது` });
  }
  // ---- a CFM street-flood or rainfall forecast issued today or yesterday
  for (const b of i.bulletins) {
    if (!b.date || b.date > today || b.date < addDays(today, -1) || !(b.kind === "street" || b.kind === "rain")) continue;
    const l: Level = b.kind === "street" ? "rehearse" : "watch";
    level = max(level, l);
    reasons.push({ kind: "bulletin", level: l, at: `${b.date} 00:00:00`, source: "Chennai Flood Monitor", en: `CFM issued "${b.title}" on ${fmtDay(b.date)}`, ta: `CFM "${b.title}" வெளியிட்டது (${fmtDay(b.date)})` });
  }
  // ---- heavy rain falling now at a Flood Monitor station
  if (i.rainNow?.level && i.rainNow.station) {
    const st = i.rainNow.station;
    level = max(level, i.rainNow.level);
    if (i.rainNow.level === "act" && !rainAt) rainAt = `${today} 00:00:00`;
    reasons.push({ kind: "rain", level: i.rainNow.level, at: st.at ?? i.asOf, source: "Chennai Flood Monitor rain gauge",
      en: `Rain now at ${st.name}: ${n1(st.todayMm ?? 0)} mm since 08:30${st.hourMm ? `, ${n1(st.hourMm)} mm in the hour ${st.hour ?? ""}` : ""}`,
      ta: `${st.name} இல் இப்போது மழை: காலை 08:30 முதல் ${n1(st.todayMm ?? 0)} மி.மீ` });
  }
  if (i.manual) {
    level = max(level, "rehearse");
    reasons.push({ kind: "manual", level: "rehearse", at: i.asOf, source: "Collector", en: "Rehearsal switched on by the Collector", ta: "ஆட்சியர் ஒத்திகையைத் தொடங்கினார்" });
    if (!rainAt) rainAt = `${addDays(today, 2)} 00:00:00`;
  }
  const hoursLeft = rainAt ? Math.round(hoursBetween(i.asOf, rainAt)) : null;
  reasons.sort((a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level) || a.at.localeCompare(b.at));
  return { level, rainAt, hoursLeft, days, reasons, manual: !!i.manual };
}

export function fmtDay(d: string): string {
  return new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
