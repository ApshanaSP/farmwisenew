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

import type { CityTopic } from "./topic";
export { cityTopic, CITY_TOPICS, type CityTopic } from "./topic";

export interface CityFact { id: string; label: string; value: number; unit?: string }
export interface CityRow { part: string; place: string; detail: string; value: number | null; unit: string | null; lat: number | null; lon: number | null }
export interface CityNow {
  topic: CityTopic;
  asOf: string;
  /** what to say, both languages: every figure is in `facts` */
  say: { en: string; ta: string };
  headline: { en: string; ta: string };
  facts: CityFact[];
  rows: CityRow[];
  /** which view of the map shows it: the Traffic view, or a Rain tab */
  view: { kind: "traffic" } | { kind: "rain"; lens: "flood" | "traffic" | "power" | "metro" };
  traffic: TrafficNow | null;
  /** parts that could not be read just now */
  missing: string[];
  sources: string[];
}

// ------------------------------------------------------------------ the data --

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
const n0 = (n: number) => n.toLocaleString("en-IN");
const plural = (n: number, one: string, many = `${one}s`) => `${n0(n)} ${n === 1 ? one : many}`;
const LEVEL_EN: Record<string, string> = { none: "no heavy-rain warning", watch: "a rain watch", rehearse: "heavy rain likely", act: "heavy rain soon" };
const LEVEL_TA: Record<string, string> = { none: "கனமழை எச்சரிக்கை இல்லை", watch: "மழைக் கண்காணிப்பு", rehearse: "கனமழை வாய்ப்பு", act: "விரைவில் கனமழை" };

declare global {
  // eslint-disable-next-line no-var
  var __diqCityNow: Map<string, { at: number; v: CityNow }> | undefined;
}

/** Warm the slow parts (the flood memory, the rain tabs) so the first question does not wait on them. */
export function warmCity(): void {
  void withTimeout(rehearsalState(), 60_000);
  for (const l of ["traffic", "power", "metro"] as const) void withTimeout(impacts(l), 120_000);
}

export async function cityNow(topic: CityTopic, o: { lockDept?: string | null; zone?: number | null } = {}): Promise<CityNow> {
  const key = `${topic}|${o.lockDept ?? ""}|${o.zone ?? ""}`;
  const cache = (global.__diqCityNow ??= new Map());
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 90_000) return hit.v;
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
      traffic.spots.filter((x) => x.action).slice(0, 12).forEach((x, k) => {
        rows.push({ part: LEVEL_WORD[x.level].en, place: x.name, detail: `${x.zoneName ?? "Chennai"} · ${x.owner.name}${x.repeat.n >= 2 ? ` · ${x.repeat.n} reports in 30 days` : ""}`, value: x.delayMin, unit: x.delayMin != null ? "min delay" : null, lat: x.lat, lon: x.lon });
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

  if (missing.length) { en.push(`(${missing.join(" and ")} could not be read just now.)`); ta.push("(சில தகவல்கள் இப்போது கிடைக்கவில்லை.)"); }
  const view: CityNow["view"] = topic === "traffic" || topic === "all" ? { kind: "traffic" } : topic === "rain" ? { kind: "rain", lens: "flood" } : { kind: "rain", lens: topic as "flood" | "power" | "metro" };
  const HEAD: Record<CityTopic, { en: string; ta: string }> = {
    traffic: { en: "Live traffic now", ta: "நேரடி போக்குவரத்து" }, flood: { en: "Streets that flood", ta: "வெள்ளம் தேங்கும் தெருக்கள்" },
    rain: { en: "Rain: warning, streets, power and trains", ta: "மழை நிலவரம்" }, power: { en: "Power in heavy rain", ta: "கனமழையில் மின்சாரம்" },
    metro: { en: "Trains in heavy rain", ta: "கனமழையில் ரயில்கள்" }, all: { en: "The city now: traffic, rain, flooding, power, trains", ta: "நகர நிலவரம்" }
  };
  const v: CityNow = { topic, asOf: traffic?.at ?? state?.asOf ?? new Date().toISOString(), say: { en: en.join(" "), ta: ta.join(" ") }, headline: HEAD[topic], facts, rows, view, traffic, missing, sources };
  cache.set(key, { at: Date.now(), v });
  if (cache.size > 40) cache.delete(cache.keys().next().value!);
  return v;
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
  en.push(`Rain now: ${LEVEL_EN[t.level] ?? t.level}${why && t.level !== "none" ? ` (${why})` : ""}${t.hoursLeft != null && t.hoursLeft > 0 ? `, rain in about ${t.hoursLeft} h` : ""}.${wet ? ` The wettest gauge today is ${wet.name} with ${Math.round((wet.todayMm ?? 0) * 10) / 10} mm${raining ? `; ${plural(raining, "gauge")} had rain in the last hour` : ""}.` : ""}`);
  ta.push(`மழை நிலவரம்: ${LEVEL_TA[t.level] ?? t.level}.${wet ? ` இன்று அதிக மழை ${wet.name}: ${Math.round((wet.todayMm ?? 0) * 10) / 10} மி.மீ.` : ""}`);
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
