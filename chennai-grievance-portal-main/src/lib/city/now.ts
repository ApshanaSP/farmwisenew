/**
 * "How is the city now": live traffic, the rain and its warning, the streets that flood, the wards that lose power and
 * the trains that run late in heavy rain, in one place, so every part of the site answers from the same data:
 * Ask District IQ (the chatbot, tool city_now), Jarvis (screen recipe "city"), Ask the Map (it opens the Traffic view or
 * the Rain tab and says the same lines) and the Traffic view itself.
 *
 *   traffic  lib/city/traffic.ts (TomTom live, with the district's repeat trouble spots)
 *   rain     the rain rehearsal's trigger (IMD warning, flood monitor gauges, reservoirs) and live rain gauges
 *   flood    the flood memory: streets that flooded in past heavy rains (lib/rehearsal/engine.ts)
 *   power    wards that lose power in heavy rain, and for how long (lib/rehearsal/impacts.ts)
 *   metro    metro and suburban lines that run late in heavy rain, and stations that close
 *
 * Every figure comes from those; every sentence is written here by code, in English and Tamil. Read-only.
 */
import { pastRains, rehearsalState } from "@/lib/rehearsal/engine";
import { impacts, type ImpactData } from "@/lib/rehearsal/impacts";
import type { RehearsalState } from "@/lib/rehearsal/types";
import { LEVEL_WORD, trafficNow, trafficSay, type TrafficNow } from "./traffic";
import { clusterLine, inZone, lengthTile, NO_JAM, NO_REPEAT, noJamIn, noRepeatIn, spotLine, topRepeat, worstJam } from "./pick";
import type { CityFocus } from "./intent";
import { ZONE_NAMES } from "@/lib/thunai/lexicon";

import type { CityTopic } from "./topic";
export { cityTopic, CITY_TOPICS, type CityTopic } from "./topic";

export interface CityFact { id: string; label: string; value: number; unit?: string }
/** `spot`: v12, the TomTom spot's id of a traffic row (the Traffic view opens on it) */
export interface CityRow { part: string; place: string; detail: string; value: number | null; unit: string | null; lat: number | null; lon: number | null; spot?: string | null }
/** v12 (21 Nov): the one place a focused question asked about: the most congested stretch, or the trouble spot that keeps coming back */
export interface CityFocusPart {
  kind: "spot" | "cluster"; focus: CityFocus; id: string; name: string; lat: number; lon: number; level: string; zoneName: string | null;
  owner: { dept: string; name: string; ta: string; why: string }; why: string;
  delayMin: number | null; lengthM: number | null; reports: number; open: number;
  /** what Jarvis says about it, written by code from its own fields (lib/city/pick.ts) */
  line: { en: string; ta: string };
}
/** v12 (21 Nov): one past heavy rain (the last one with reports, or the day asked): the streets its flooding reports stood on */
export interface CityRainOf {
  id: string; start: string; latest: boolean; reports: number;
  streets: { key: string; label: string; label_ta: string; ward: number; lat: number; lon: number; n: number }[];
  line: { en: string; ta: string };
}
export interface CityNow {
  topic: CityTopic;
  asOf: string;
  /** what to say, both languages: every figure is in `facts` */
  say: { en: string; ta: string };
  headline: { en: string; ta: string };
  facts: CityFact[];
  rows: CityRow[];
  /** which view of the map shows it: the Traffic view (v12: on a spot, or on a trouble spot's tab), or a Rain tab (v12: on a past rain) */
  view: { kind: "traffic"; spot?: string | null; cluster?: string | null; tab?: "repeat" | null } | { kind: "rain"; lens: "flood" | "traffic" | "power" | "metro"; replay?: string | null };
  traffic: TrafficNow | null;
  /** v12: the place a focused question asked about (null when none was asked, or nothing is jammed) */
  focus: CityFocusPart | null;
  /** v12: the past rain asked about (null when none was asked, or the record has none) */
  rainOf: CityRainOf | null;
  /** parts that could not be read just now */
  missing: string[];
  sources: string[];
}

// ------------------------------------------------------------------ the data --

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
const n0 = (n: number) => n.toLocaleString("en-IN");
const plural = (n: number, one: string, many = `${one}s`) => `${n0(n)} ${n === 1 ? one : many}`;
/** v14: a street with no name of its own ("A lane off X", "A lane in ward N") */
const UNNAMED = /^A lane (?:off|in) /;
/**
 * v14 (21 Nov live check): the line as it is heard. The record's street names come in capitals ("BALAMURUGAN ST", read letter by letter
 * by the voice), and its places joined by " · " ("Ward 127 · Koyambedu"). A run of two or more capital words, one of five letters or more,
 * is a name in title case; a lone short one (IMD, TANGEDCO, PWD) and one with digits (SH49A) stay as they are.
 */
export function spoken(s: string): string {
  return s.replace(/ · /g, ", ").replace(/\b[A-Z]{2,}(?:[ .'-]+[A-Z]{2,})+\b/g, (run) =>
    run.split(/([ .'-]+)/).some((w) => w.length >= 5 && /^[A-Z]+$/.test(w))
      ? run.replace(/[A-Z]+/g, (w) => w[0] + w.slice(1).toLowerCase())
      : run);
}
const LEVEL_EN: Record<string, string> = { none: "no heavy-rain warning", watch: "a rain watch", rehearse: "heavy rain likely", act: "heavy rain soon" };
const LEVEL_TA: Record<string, string> = { none: "கனமழை எச்சரிக்கை இல்லை", watch: "மழைக் கண்காணிப்பு", rehearse: "கனமழை வாய்ப்பு", act: "விரைவில் கனமழை" };

declare global {
  // eslint-disable-next-line no-var
  var __diqCityNow: Map<string, { at: number; v: CityNow }> | undefined;
  // eslint-disable-next-line no-var
  var __diqCityRun: Map<string, Promise<CityNow>> | undefined;
}
/** an answer this young is served as it is; up to STALE_MS it is served at once and read again behind it (v12) */
const FRESH_MS = 90_000;
const STALE_MS = 300_000;
const MONTH_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_TA = ["ஜனவரி", "பிப்ரவரி", "மார்ச்", "ஏப்ரல்", "மே", "ஜூன்", "ஜூலை", "ஆகஸ்ட்", "செப்டம்பர்", "அக்டோபர்", "நவம்பர்", "டிசம்பர்"];
/** a rain's start as said: "21 October" (with the year when it is not this year's) */
const dayOf = (iso: string, ta = false): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso.slice(0, 10);
  // v12 (21 Nov): this year as Chennai counts it (UTC plus 5:30), not the server's zone (RC-16, ist-dates.pass4)
  const year = m[1] !== String(new Date(Date.now() + 330 * 60_000).getUTCFullYear()) ? ` ${m[1]}` : "";
  return `${Number(m[3])} ${(ta ? MONTH_TA : MONTH_EN)[Number(m[2]) - 1]}${year}`;
};

/** Warm the slow parts (the flood memory, the rain tabs) so the first question does not wait on them. */
export function warmCity(): void {
  void withTimeout(rehearsalState(), 60_000);
  for (const l of ["traffic", "power", "metro"] as const) void withTimeout(impacts(l), 120_000);
}

export interface CityOpts {
  lockDept?: string | null; zone?: number | null;
  /** v12: the most congested stretch ("worst-jam") or the trouble spot that keeps coming back ("repeat"), traffic only */
  focus?: CityFocus | null;
  /** v12: a past rain, flood only: "latest" (the last heavy rain with reports, as Rain & flooding opens it) or "rain-YYYY-MM-DD" */
  rain?: string | null;
}

/**
 * The city now, for a topic. v12 (21 Nov): served stale-while-revalidate: an answer under 90 s old as it is; one under 5 minutes at once,
 * read again behind it; older, or none, read now (one read at a time per key). The first live-traffic answer of the morning waited 7.8 s
 * on a cold read inline (06:37:44 "Show me live traffic.").
 */
export async function cityNow(topic: CityTopic, o: CityOpts = {}): Promise<CityNow> {
  const focus = topic === "traffic" ? o.focus ?? null : null;
  const rain = topic === "flood" && o.rain && /^(?:latest|rain-\d{4}-\d{2}-\d{2})$/.test(o.rain) ? o.rain : null;
  const key = `${topic}|${o.lockDept ?? ""}|${o.zone ?? ""}|${focus ?? ""}|${rain ?? ""}`;
  const cache = (global.__diqCityNow ??= new Map());
  const runs = (global.__diqCityRun ??= new Map());
  const hit = cache.get(key);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < FRESH_MS) return hit.v;
  const run = (): Promise<CityNow> => {
    let p = runs.get(key);
    if (!p) {
      p = buildCity(topic, { ...o, focus, rain }).then((v) => {
        cache.set(key, { at: Date.now(), v });
        if (cache.size > 40) cache.delete(cache.keys().next().value!);
        return v;
      }).finally(() => runs.delete(key));
      runs.set(key, p);
    }
    return p;
  };
  if (hit && age < STALE_MS) { void run().catch(() => undefined); return hit.v; }
  return run();
}

async function buildCity(topic: CityTopic, o: CityOpts): Promise<CityNow> {
  const want = (x: CityTopic) => topic === x || topic === "all" || (topic === "rain" && x !== "traffic");
  const missing: string[] = [];
  const [traffic, state, past, power, metro, rainJams] = await Promise.all([
    want("traffic") ? withTimeout(trafficNow({ lockDept: o.lockDept ?? null }), 12_000) : Promise.resolve(null),
    want("flood") || want("rain") ? withTimeout(rehearsalState(), 15_000) : Promise.resolve(null),
    want("flood") ? withTimeout(pastRains(), 15_000) : Promise.resolve(null),
    want("power") ? withTimeout(impacts("power"), 15_000) : Promise.resolve(null),
    want("metro") ? withTimeout(impacts("metro"), 15_000) : Promise.resolve(null),
    topic === "rain" || topic === "traffic" ? withTimeout(impacts("traffic"), 8_000) : Promise.resolve(null)
  ]);
  if (want("traffic") && !traffic) missing.push("live traffic");
  if ((want("flood") || want("rain")) && !state) missing.push("the rain and flood record");
  if (want("power") && !power) missing.push("the power record");
  if (want("metro") && !metro) missing.push("the train record");

  const facts: CityFact[] = [];
  const rows: CityRow[] = [];
  const en: string[] = [], ta: string[] = [];
  const sources: string[] = [];
  const f = (id: string, label: string, value: number, unit?: string) => { facts.push({ id, label, value, ...(unit ? { unit } : {}) }); return value; };

  // ---- rain now
  if (state && (topic === "rain" || topic === "all" || topic === "flood")) rainPart(state, f, rows, en, ta, topic);
  // ---- live traffic
  if (traffic) {
    sources.push("TomTom live traffic");
    const s = trafficSay(traffic, o.zone ?? null);
    en.push(s.en); ta.push(s.ta);
    if (traffic.enabled) {
      const c = traffic.counts;
      f("traffic.very", "Very congested stretches now", c.very); f("traffic.congested", "Congested stretches now", c.congested);
      f("traffic.closed", "Roads closed now", c.closed); f("traffic.flooded", "Roads with water on them now", c.flooded);
      f("traffic.accidents", "Accidents or breakdowns now", c.accidents); f("traffic.action", "Spots that need action now", c.action);
      f("traffic.clusters", "Trouble spots that keep coming back (30 days)", c.clusters);
      // v14 (21 Nov review 13, routing 0 and 5): a zone's question lists that zone's stretches (the map and the ranking were the district's)
      inZone(traffic, o.zone ?? null).spots.filter((x) => x.action).slice(0, 12).forEach((x, k) => {
        rows.push({ part: LEVEL_WORD[x.level].en, place: x.name, detail: `${x.zoneName ?? "Chennai"} · ${x.owner.name}${x.repeat.n >= 2 ? ` · ${x.repeat.n} reports in 30 days` : ""}`, value: x.delayMin, unit: x.delayMin != null ? "min delay" : null, lat: x.lat, lon: x.lon, spot: x.id });
        if (x.delayMin != null) f(`traffic.spot.${k}.delay`, `Delay at ${x.name}`, x.delayMin, "min");
        if (x.repeat.n) f(`traffic.spot.${k}.reports`, `Reports near ${x.name} in 30 days`, x.repeat.n);
      });
      traffic.clusters.slice(0, 5).forEach((c2, k) => { f(`traffic.cluster.${k}.reports`, `Reports at the trouble spot ${c2.name} in 30 days`, c2.reports.length); f(`traffic.cluster.${k}.open`, `Still open at ${c2.name}`, c2.open); });
      traffic.zones.slice(0, 5).forEach((z) => f(`traffic.zone.${z.zone}.jams`, `Jams now in ${z.name}`, z.jams));
    }
    if (rainJams && topic === "traffic") {
      const often = rainJams.items.filter((x) => x.rains.length >= 3).length;
      if (often) {
        f("traffic.rainRoads", "Roads that jam in 3 or more heavy rains", often);
        en.push(`In heavy rain, ${plural(often, "road")} jam again and again; the Rain view's Traffic tab shows them.`);
        ta.push(`கனமழையில் ${often} சாலைகள் மீண்டும் மீண்டும் நெரிசலாகின்றன.`);
      }
    }
  }
  // ---- the flood streets
  if (state && want("flood")) {
    sources.push("Flood memory (past heavy rains)");
    const top = [...state.streets].filter((s) => s.tier === 2).sort((a, b) => b.rains - a.rains || b.chokes - a.chokes).slice(0, 5);
    const rains = past?.rains.length ?? state.rains.length;
    f("flood.likely", "Streets that flood in 3 or more heavy rains", state.counts.likely);
    f("flood.possible", "Streets that flooded once or twice", state.counts.possible);
    f("flood.chokes", "Blocked-drain complaints still open on flood streets", state.counts.chokes);
    f("flood.rains", "Heavy rains in the record", rains);
    const openJobs = state.jobs.filter((j) => !j.task).length;
    f("flood.jobs", "Jobs ready to send before the next heavy rain", openJobs);
    top.forEach((s, k) => { rows.push({ part: "Flood street", place: s.label, detail: `Ward ${s.ward}${s.chokes ? ` · ${s.chokes} blocked drains open` : ""}`, value: s.rains, unit: "rains", lat: s.lat, lon: s.lon }); f(`flood.street.${k}`, `Heavy rains ${s.label} flooded in`, s.rains); });
    en.push(`${plural(state.counts.likely, "street")} flood in 3 or more heavy rains${top[0] ? `; the worst is ${top[0].label} (${top[0].rains} of ${rains} rains)` : ""}. ${state.counts.chokes ? `${plural(state.counts.chokes, "blocked-drain complaint")} ${state.counts.chokes === 1 ? "is" : "are"} still open on them. ` : ""}${openJobs ? `${plural(openJobs, "job")} ${openJobs === 1 ? "is" : "are"} ready to send before the next rain.` : ""}`.trim());
    ta.push(`${state.counts.likely} தெருக்கள் 3 அல்லது அதிக கனமழைகளில் வெள்ளத்தில் மூழ்குகின்றன${top[0] ? `; மிக மோசம் ${top[0].label_ta || top[0].label} (${rains} மழைகளில் ${top[0].rains})` : ""}.${openJobs ? ` அடுத்த மழைக்கு முன் ${openJobs} பணிகள் அனுப்பத் தயார்.` : ""}`);
  }
  // ---- power and metro in heavy rain
  if (power && want("power")) impactPart("power", power, f, rows, en, ta, sources);
  if (metro && want("metro")) impactPart("metro", metro, f, rows, en, ta, sources);

  // ---- v12 (21 Nov): the one place a focused question asked about, said first and alone ("the most congested road", "the repeating traffic")
  let focus: CityFocusPart | null = null;
  if (o.focus && traffic?.enabled) {
    // v14 (routing 0): the zone's own worst jam or trouble spot ("the worst jam in Adyar" named Teynampet's)
    focus = focusPart(o.focus, inZone(traffic, o.zone ?? null));
    if (focus) {
      f("traffic.focus.reports", `Reports near ${focus.name} in 30 days`, focus.reports);
      f("traffic.focus.open", `Still open near ${focus.name}`, focus.open);
      if (focus.delayMin != null) f("traffic.focus.delay", `Delay at ${focus.name}`, focus.delayMin, "min");
      const lt = lengthTile(focus.lengthM);
      if (lt) f("traffic.focus.length", `Length of the jam at ${focus.name}`, lt.value, lt.unit);
      rows.splice(0, rows.length, ...rows.filter((r) => r.spot === focus!.id), ...rows.filter((r) => r.spot !== focus!.id));
    }
    const zn = o.zone != null ? traffic.zones.find((z) => z.zone === o.zone)?.name ?? ZONE_NAMES[o.zone - 1] ?? null : null;
    const line = focus?.line ?? (o.focus === "repeat" ? (zn ? noRepeatIn(zn) : NO_REPEAT) : (zn ? noJamIn(zn) : NO_JAM));
    en.splice(0, en.length, line.en); ta.splice(0, ta.length, line.ta);
  }
  // ---- v12 (21 Nov): one past heavy rain ("the flooded streets in the last rain"): the streets its flooding reports stood on, said first
  let rainOf: CityRainOf | null = null;
  if (o.rain && state && want("flood")) {
    rainOf = past ? rainPartOf(o.rain, past.rains, state) : null;
    if (rainOf) {
      f("flood.rain.streets", `Streets with flooding reports in the rain of ${dayOf(rainOf.start)}`, rainOf.streets.length);
      f("flood.rain.reports", `Flooding reports in the rain of ${dayOf(rainOf.start)}`, rainOf.reports);
      rainOf.streets.slice(0, 5).forEach((s, k) => f(`flood.rain.street.${k}`, `Flooding reports on ${s.label} in that rain`, s.n));
      rows.unshift(...rainOf.streets.slice(0, 8).map((s) => ({ part: "Flooded in that rain", place: s.label, detail: `Ward ${s.ward} · ${plural(s.n, "flooding report")}`, value: s.n, unit: "reports", lat: s.lat, lon: s.lon })));
      en.unshift(rainOf.line.en); ta.unshift(rainOf.line.ta);
    } else {
      const none = o.rain === "latest" ? { en: "No heavy rain in the record has flooding reports yet.", ta: "பதிவில் உள்ள கனமழைகளில் இன்னும் வெள்ளப் புகார் இல்லை." }
        : { en: `There is no heavy rain on ${dayOf(o.rain.replace(/^rain-/, ""))} in the record.`, ta: "அந்த நாளில் கனமழை பதிவில் இல்லை." };
      en.unshift(none.en); ta.unshift(none.ta);
    }
  }

  if (missing.length) { en.push(`(${missing.join(" and ")} could not be read just now.)`); ta.push("(சில தகவல்கள் இப்போது கிடைக்கவில்லை.)"); }
  const view: CityNow["view"] = topic === "traffic" || topic === "all"
    ? { kind: "traffic", ...(focus?.kind === "spot" ? { spot: focus.id } : focus?.kind === "cluster" ? { cluster: focus.id, tab: "repeat" as const } : o.focus === "repeat" ? { tab: "repeat" as const } : {}) }
    : topic === "rain" ? { kind: "rain", lens: "flood" } : { kind: "rain", lens: topic as "flood" | "power" | "metro", ...(topic === "flood" && o.rain ? { replay: rainOf?.id ?? o.rain } : {}) };
  const HEAD: Record<CityTopic, { en: string; ta: string }> = {
    traffic: { en: "Live traffic now", ta: "நேரடி போக்குவரத்து" }, flood: { en: "Streets that flood", ta: "வெள்ளம் தேங்கும் தெருக்கள்" },
    rain: { en: "Rain: warning, streets, power and trains", ta: "மழை நிலவரம்" }, power: { en: "Power in heavy rain", ta: "கனமழையில் மின்சாரம்" },
    metro: { en: "Trains in heavy rain", ta: "கனமழையில் ரயில்கள்" }, all: { en: "The city now: traffic, rain, flooding, power, trains", ta: "நகர நிலவரம்" }
  };
  // (v12: kept by cityNow, stale-while-revalidate)
  return { topic, asOf: traffic?.at ?? state?.asOf ?? new Date().toISOString(), say: { en: spoken(en.join(" ")), ta: spoken(ta.join(" ")) }, headline: HEAD[topic], facts, rows, view, traffic, focus, rainOf, missing, sources };
}

/** v12: the most congested stretch (lib/city/pick.ts worstJam) or the trouble spot that keeps coming back, with its line; null when none */
function focusPart(want: CityFocus, t: TrafficNow): CityFocusPart | null {
  if (want === "repeat") {
    const c = topRepeat(t);
    if (!c) return null;
    return { kind: "cluster", focus: want, id: c.id, name: c.name, lat: c.lat, lon: c.lon, level: c.level, zoneName: c.zoneName, owner: c.owner, why: c.why,
      delayMin: c.delayMin, lengthM: null, reports: c.reports.length, open: c.open, line: { en: clusterLine(c, "en"), ta: clusterLine(c, "ta") } };
  }
  const s = worstJam(t);
  if (!s) return null;
  return { kind: "spot", focus: want, id: s.id, name: s.name, lat: s.lat, lon: s.lon, level: s.level, zoneName: s.zoneName, owner: s.owner, why: s.why,
    delayMin: s.delayMin, lengthM: s.lengthM, reports: s.repeat.n, open: s.repeat.open, line: { en: spotLine(s, "en"), ta: spotLine(s, "ta") } };
}

/**
 * v12: one past heavy rain, in the order Rain & flooding opens them (newest first; "latest" is the newest with flooding reports), and the
 * flood streets its reports stood on, most reports first, with the line said for it: "In the last heavy rain (21 October), 14 streets
 * flooded: A, B, C." Null when the record has no such rain.
 */
function rainPartOf(want: string, rains: { id: string; start: string; reports: { street: string | null }[] }[], state: RehearsalState): CityRainOf | null {
  const newest = [...rains].sort((a, b) => b.start.localeCompare(a.start));
  const r = want === "latest" ? newest.find((x) => x.reports.length > 0) : newest.find((x) => x.id === want);
  if (!r) return null;
  const byKey = new Map(state.streets.map((s) => [s.key, s]));
  const n = new Map<string, number>();
  for (const x of r.reports) if (x.street && byKey.has(x.street)) n.set(x.street, (n.get(x.street) ?? 0) + 1);
  const streets = [...n.entries()].map(([key, c]) => ({ s: byKey.get(key)!, c })).sort((a, b) => b.c - a.c || b.s.rains - a.s.rains || a.s.key.localeCompare(b.s.key))
    .map(({ s, c }) => ({ key: s.key, label: s.label, label_ta: s.label_ta || s.label, ward: s.ward, lat: s.lat, lon: s.lon, n: c }));
  const latest = want === "latest";
  const when = latest ? `In the last heavy rain (${dayOf(r.start)})` : `In the heavy rain of ${dayOf(r.start)}`;
  const whenTa = latest ? `கடந்த கனமழையில் (${dayOf(r.start, true)})` : `${dayOf(r.start, true)} கனமழையில்`;
  // v14 (21 Nov live check): the streets said are named ones first; "A lane off Chennai - Ennore Road, A lane off Alamelumangapuram" was
  // what the Collector heard. The rows keep every street, most reports first
  const top = [...streets.filter((s) => !UNNAMED.test(s.label)), ...streets.filter((s) => UNNAMED.test(s.label))].slice(0, 3);
  const line = streets.length
    ? { en: `${when}, ${plural(streets.length, "street")} flooded: ${top.map((s) => s.label).join(", ")}${streets.length > 3 ? " and more" : ""}.`,
      ta: `${whenTa} ${streets.length} தெருக்களில் வெள்ளம்: ${top.map((s) => s.label_ta).join(", ")}${streets.length > 3 ? " மற்றும் பல" : ""}.` }
    : { en: `${when}, ${plural(r.reports.length, "flooding report")} came in, none of them on a known flood street.`, ta: `${whenTa} ${r.reports.length} வெள்ளப் புகார்கள் வந்தன; அவை அறியப்பட்ட வெள்ளத் தெருக்களில் இல்லை.` };
  return { id: r.id, start: r.start, latest, reports: r.reports.length, streets, line };
}

function rainPart(state: RehearsalState, f: (id: string, label: string, value: number, unit?: string) => number, rows: CityRow[], en: string[], ta: string[], topic: CityTopic) {
  const t = state.trigger;
  const lv = ["none", "watch", "rehearse", "act"].indexOf(t.level);
  f("rain.level", "Rain warning level now (0 none, 1 watch, 2 heavy rain likely, 3 heavy rain soon)", Math.max(0, lv));
  const stations = (state.rain?.stations ?? []).filter((x) => !x.stale && x.todayMm != null).sort((a, b) => (b.todayMm ?? 0) - (a.todayMm ?? 0));
  const wet = stations[0] ?? null;
  if (wet) { f("rain.today.top", `Rain today at ${wet.name}`, Math.round((wet.todayMm ?? 0) * 10) / 10, "mm"); rows.push({ part: "Rain gauge", place: wet.name, detail: "rain today (Chennai Flood Monitor)", value: Math.round((wet.todayMm ?? 0) * 10) / 10, unit: "mm", lat: wet.lat, lon: wet.lon }); }
  const raining = stations.filter((x) => (x.hourMm ?? 0) > 0).length;
  f("rain.raining", "Rain gauges with rain in the last hour", raining);
  const why = t.reasons[0]?.en ?? null;
  // v14 (21 Nov live check): a dry day is said as one ("The wettest gauge today is Karapakkam with 0 mm" was heard)
  const wetMm = wet ? Math.round((wet.todayMm ?? 0) * 10) / 10 : 0;
  const dry = !!wet && wetMm <= 0 && !raining;
  en.push(`Rain now: ${LEVEL_EN[t.level] ?? t.level}${why && t.level !== "none" ? ` (${why})` : ""}${t.hoursLeft != null && t.hoursLeft > 0 ? `, rain in about ${t.hoursLeft} h` : ""}.${dry ? " No gauge has recorded rain today." : wet ? ` The wettest gauge today is ${wet.name} with ${wetMm} mm${raining ? `; ${plural(raining, "gauge")} had rain in the last hour` : ""}.` : ""}`);
  ta.push(`மழை நிலவரம்: ${LEVEL_TA[t.level] ?? t.level}.${dry ? " இன்று எந்த மழைமானியிலும் மழை பதிவாகவில்லை." : wet ? ` இன்று அதிக மழை ${wet.name}: ${wetMm} மி.மீ.` : ""}`);
  if (topic === "rain") {
    if (t.hoursLeft != null && t.hoursLeft > 0) f("rain.hoursLeft", "Hours until heavy rain", t.hoursLeft, "h");
    const lakes = state.lakes.filter((l) => l.pct >= 85).sort((a, b) => b.pct - a.pct).slice(0, 3);
    lakes.forEach((l, k) => { f(`rain.lake.${k}`, `${l.name} full`, Math.round(l.pct), "%"); rows.push({ part: "Lake", place: l.name, detail: l.daysToFull != null ? `full in about ${Math.round(l.daysToFull)} days` : "storage", value: Math.round(l.pct), unit: "%", lat: l.lat, lon: l.lon }); });
    if (lakes.length) { en.push(`${plural(lakes.length, "lake")} over 85 % full: ${lakes.map((l) => `${l.name} ${Math.round(l.pct)} %`).join(", ")}.`); ta.push(`${lakes.length} ஏரிகள் 85% க்கு மேல் நிரம்பியுள்ளன.`); }
  }
}

function impactPart(lens: "power" | "metro", d: ImpactData, f: (id: string, label: string, value: number, unit?: string) => number, rows: CityRow[], en: string[], ta: string[], sources: string[]) {
  const rains = d.rains.length;
  const hit = d.items.filter((x) => x.rains.length).sort((a, b) => b.rains.length - a.rains.length || a.label.localeCompare(b.label));
  if (lens === "power") {
    sources.push("Power cuts in past heavy rains");
    const often = hit.filter((x) => x.rains.length >= 3);
    const last = [...d.rains].sort((a, b) => b.start.localeCompare(a.start))[0];
    const hours = hit.flatMap((x) => Object.values(x.byRain).map((h) => h.hours ?? 0)).filter((h) => h > 0);
    const avg = hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null;
    f("power.wards", "Wards that lost power in a past heavy rain", hit.length); f("power.often", "Wards that lose power in 3 or more heavy rains", often.length);
    if (avg != null) f("power.avgHours", "Hours without power, on average, in a heavy rain", avg, "h");
    if (last) f("power.lastRain", "Wards that lost power in the latest heavy rain", last.hit);
    hit.slice(0, 6).forEach((x, k) => { rows.push({ part: "Power", place: x.label, detail: x.sub, value: x.rains.length, unit: "rains", lat: x.lat, lon: x.lon }); f(`power.ward.${k}`, `Heavy rains ${x.label} lost power in`, x.rains.length); });
    en.push(`Power: ${plural(hit.length, "ward")} lost power in past heavy rains${avg != null ? `, for about ${avg} h on average` : ""}; ${plural(often.length, "ward")} lose it in 3 or more rains${hit[0] ? `, the most ${hit[0].label} (${hit[0].rains.length} of ${rains})` : ""}.${last ? ` In the latest heavy rain ${plural(last.hit, "ward")} lost power.` : ""} Ask TANGEDCO to check those wards' feeders before the next rain.`);
    ta.push(`மின்சாரம்: கடந்த கனமழைகளில் ${hit.length} வார்டுகளில் மின்தடை${avg != null ? `, சராசரி ${avg} மணி நேரம்` : ""}; ${often.length} வார்டுகளில் 3 அல்லது அதிக மழைகளில். அடுத்த மழைக்கு முன் TANGEDCO-விடம் சரிபார்க்கக் கேளுங்கள்.`);
  } else {
    sources.push("Train delays in past heavy rains");
    const lines = d.items;
    const late = lines.filter((x) => x.rains.length).sort((a, b) => b.rains.length - a.rains.length);
    const mins = lines.flatMap((x) => Object.values(x.byRain).map((h) => h.minutes ?? 0)).filter((m) => m > 0);
    const avg = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
    const closed = new Map<string, number>();
    for (const x of lines) for (const h of Object.values(x.byRain)) for (const c of h.closed ?? []) closed.set(c.name, (closed.get(c.name) ?? 0) + 1);
    const topClosed = [...closed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    f("metro.lines", "Train lines", lines.length); f("metro.late", "Lines that ran late in a past heavy rain", late.length);
    if (avg != null) f("metro.avgMin", "Minutes late, on average, in a heavy rain", avg, "min");
    topClosed.forEach(([name, n], k) => f(`metro.closed.${k}`, `Heavy rains ${name} closed in`, n));
    late.forEach((x, k) => { rows.push({ part: "Train line", place: x.label, detail: x.facts[0] ?? x.sub, value: x.rains.length, unit: "rains", lat: x.lat, lon: x.lon }); f(`metro.line.${k}`, `Heavy rains ${x.label} ran late in`, x.rains.length); });
    en.push(`Trains: ${late.length} of ${plural(lines.length, "line")} ran late in past heavy rains${avg != null ? `, about ${avg} min on average` : ""}${late[0] ? `; the worst is ${late[0].label} (${late[0].rains.length} of ${rains} rains)` : ""}.${topClosed.length ? ` Stations that close most: ${topClosed.map(([n, c]) => `${n} (${c})`).join(", ")}.` : ""}`);
    ta.push(`ரயில்கள்: கடந்த கனமழைகளில் ${lines.length} வழித்தடங்களில் ${late.length} தாமதமாக ஓடின${avg != null ? `, சராசரி ${avg} நிமிடம்` : ""}.`);
  }
}
