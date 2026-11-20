/**
 * Live traffic, read for the Collector: what TomTom sees on Chennai's roads now (lib/rehearsal/traffic.ts), each jam or
 * closure placed in its ward and zone, given to the body that answers for it, and joined with the district's own records
 * near it (police traffic reports, road accidents, road-damage complaints, flooding on the road, traffic news of the
 * last 30 days), so a jam that keeps coming back shows as one trouble spot with its reports, ready to send as one case.
 *
 * One source for every part of the site: the Traffic view on the Overview map, Ask the Map, Ask District IQ (the
 * chatbot) and Jarvis all read trafficNow(), so they always say the same thing. Every figure is TomTom's or a stored
 * record; nothing is estimated. Read-only. Cached a minute (TomTom itself is read every five).
 *
 * Where the live data comes from: TomTom's traffic service. It has no cameras: speeds come from the GPS of phones, car
 * navigation and fleet devices moving on each road (anonymous probe data), against that road's usual free-flow speed.
 */
import { world } from "@/lib/map/world";
import { bboxOf, distToLineM, expandBboxM, haversineM, inBbox, pointInPolygon, type Pair } from "@/lib/map/geom";
import type { Inc, NewsDoc, World } from "@/lib/map/types";
import { liveIncidents, type LiveIncident } from "@/lib/rehearsal/traffic";

export type TrafficLevel = "very" | "congested" | "slow" | "flood" | "accident" | "closed" | "works";

/** what each level is called, in both languages */
export const LEVEL_WORD: Record<TrafficLevel, { en: string; ta: string }> = {
  very: { en: "Very congested", ta: "கடும் நெரிசல்" },
  congested: { en: "Congested", ta: "நெரிசல்" },
  slow: { en: "Slow traffic", ta: "மெதுவான போக்குவரத்து" },
  flood: { en: "Water on the road", ta: "சாலையில் தண்ணீர்" },
  accident: { en: "Accident or breakdown", ta: "விபத்து / வாகனப் பழுது" },
  closed: { en: "Road closed", ta: "சாலை மூடல்" },
  works: { en: "Road works", ta: "சாலைப் பணி" }
};

export interface Owner { dept: string; name: string; ta: string; why: string }
export interface RepeatReport { id: string; title: string; cat: string; catLabel: string; at: string; open: boolean; dept: string; m: number }
export interface RepeatNews { id: string; title: string; outlet: string; at: string; url: string | null }

export interface TrafficSpot {
  id: string;
  level: TrafficLevel;
  kind: string;
  /** TomTom's own words ("Queuing traffic", "Stationary traffic", "Closed") */
  label: string;
  /** "Anna Salai: Gemini Flyover → Thousand Lights" */
  name: string;
  road: string | null;
  from: string | null;
  to: string | null;
  delayMin: number | null;
  delayS: number | null;
  lengthM: number | null;
  magnitude: number;
  path: Pair[];
  lat: number;
  lon: number;
  ward: number | null;
  zone: number | null;
  zoneName: string | null;
  owner: Owner;
  /** the district's own records near it, last 30 days */
  repeat: { n: number; open: number; reports: RepeatReport[]; news: RepeatNews[]; cats: { label: string; n: number }[] };
  /** needs the Collector's attention now (very congested, water, an accident, a long delay, or a spot that keeps coming back) */
  action: boolean;
  /** why it needs attention, one line */
  why: string;
  score: number;
}

export interface TrafficCluster {
  id: string;
  /** the roads, joined */
  name: string;
  zone: number | null;
  zoneName: string | null;
  ward: number | null;
  lat: number;
  lon: number;
  spots: string[];
  /** live now: the worst level among its spots */
  level: TrafficLevel;
  delayMin: number | null;
  reports: RepeatReport[];
  news: RepeatNews[];
  open: number;
  owner: Owner;
  /** one line: "12 reports in 30 days (8 road blocked, 4 accidents), 3 still open, jammed again now" */
  why: string;
}

export interface TrafficNow {
  enabled: boolean;
  at: string | null;
  why: string | null;
  source: string;
  counts: { total: number; jams: number; very: number; congested: number; slow: number; closed: number; flooded: number; accidents: number; works: number; action: number; clusters: number };
  spots: TrafficSpot[];
  clusters: TrafficCluster[];
  zones: { zone: number; name: string; jams: number; very: number; delayMin: number }[];
  /** the district's records over 30 days that the clusters draw on */
  window: { from: string; to: string };
}

export const SOURCE_LINE = "TomTom live traffic: road speeds from the GPS of phones, car navigation and fleet devices (no cameras), against each road's usual speed. Incidents every 5 minutes, road colours every 2.";

const TRAFFIC_CATS = new Set(["TRAFFIC_OBSTRUCTION", "ROAD_ACCIDENT", "ROAD_DAMAGE"]);
const WATER_CATS = new Set(["FLOOD_WATERLOGGING", "DRAINAGE_SEWAGE"]);
const TRAFFIC_NEWS = /traffic|congest|snarl|gridlock|diversion|divert|subway|underpass|stranded|crawl|jam\b|bumper|pile-?up|போக்குவரத்து|சுரங்கப்பாதை|நெரிசல்/i;
const NEAR_M = 250;
const NEWS_NEAR_M = 500;
const DAYS = 30;

const OWNERS: Record<string, { name: string; ta: string }> = {
  "POL-GCP": { name: "Greater Chennai Traffic Police", ta: "சென்னை போக்குவரத்துக் காவல்" },
  "GCC-SWD": { name: "GCC Storm Water Drains", ta: "மாநகராட்சி மழைநீர் வடிகால் துறை" },
  "GCC-ENG": { name: "GCC Roads (Engineering)", ta: "மாநகராட்சி சாலைத் துறை" },
  "GCC-BRG": { name: "GCC Bridges (subways)", ta: "மாநகராட்சி பாலங்கள் துறை" }
};

function ownerOf(level: TrafficLevel, s: { label: string; from: string | null; to: string | null }): Owner {
  const words = `${s.label} ${s.from ?? ""} ${s.to ?? ""}`;
  const pick = (dept: string, why: string): Owner => ({ dept, ...OWNERS[dept], why });
  if (level === "flood") return /subway|underpass/i.test(words) ? pick("GCC-BRG", "Water in a subway: pumps and the subway's drain are the Bridges department's.")
    : pick("GCC-SWD", "Water on the road: pumps and drain clearing are Storm Water Drains' job.");
  if (level === "works") return pick("GCC-ENG", "Road works: the Roads department can speed them up, barricade them safely or open a lane.");
  if (level === "closed") return pick("POL-GCP", "A closed road: the Traffic Police set the diversion and keep it moving.");
  if (level === "accident") return pick("POL-GCP", "An accident or a broken-down vehicle: the Traffic Police clear the road.");
  return pick("POL-GCP", "A jam: the Traffic Police put men at the junctions and divert traffic.");
}

function levelOf(x: LiveIncident): TrafficLevel {
  if (x.flooding) return "flood";
  if (x.kind === "Road closed") return "closed";
  if (x.kind === "Road works" || x.kind === "Lane closed") return "works";
  if (x.kind === "Accident" || x.kind === "Broken-down vehicle" || x.kind === "Dangerous conditions") return "accident";
  if (x.magnitude >= 3) return "very";
  if (x.magnitude === 2) return "congested";
  return "slow";
}

const istCutoff = (now: string, days: number) => {
  const t = Date.parse(now.replace(" ", "T") + "+05:30") - days * 86_400_000;
  return new Date(t + 5.5 * 3_600_000).toISOString().replace("T", " ").slice(0, 19);
};

function placeOf(w: World, lat: number, lon: number): { ward: number | null; zone: number | null; zoneName: string | null } {
  const p = { lat, lon };
  for (const wd of w.wards) if (inBbox(p, wd.bbox) && pointInPolygon(p, wd.rings)) return { ward: wd.ward, zone: wd.zone, zoneName: wd.zoneName };
  // just outside every ward (a road on the edge): the nearest ward's zone
  let best: { d: number; wd: World["wards"][number] } | null = null;
  for (const wd of w.wards) { const d = haversineM(p, wd); if (!best || d < best.d) best = { d, wd }; }
  return best && best.d < 2500 ? { ward: null, zone: best.wd.zone, zoneName: best.wd.zoneName } : { ward: null, zone: null, zoneName: "Outside the GCC wards" };
}

const roadName = (x: { road: string | null; from: string | null; to: string | null }) => {
  const ends = x.from && x.to ? (x.from === x.to ? x.from : `${x.from} → ${x.to}`) : x.from ?? x.to ?? null;
  return [x.road, ends].filter(Boolean).join(": ") || "Unnamed road";
};

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** the district's records near a road, last 30 days */
function nearRecords(path: Pair[], incs: Inc[], news: NewsDoc[], water: boolean, w: World): TrafficSpot["repeat"] {
  const box = bboxOf(path.map(([lat, lon]) => ({ lat, lon })));
  if (!box) return { n: 0, open: 0, reports: [], news: [], cats: [] };
  const near = expandBboxM(box, NEAR_M), nearNews = expandBboxM(box, NEWS_NEAR_M);
  const reports: RepeatReport[] = [];
  for (const i of incs) {
    if (!(TRAFFIC_CATS.has(i.cat) || (water && WATER_CATS.has(i.cat)))) continue;
    if (!inBbox(i, near)) continue;
    const m = path.length > 1 ? distToLineM(i, path).m : haversineM(i, { lat: path[0][0], lon: path[0][1] });
    if (m > NEAR_M) continue;
    reports.push({ id: i.id, title: i.title, cat: i.cat, catLabel: w.cats.get(i.cat)?.label ?? i.cat, at: i.first, open: i.open, dept: i.dept, m: Math.round(m) });
  }
  reports.sort((a, b) => Number(b.open) - Number(a.open) || b.at.localeCompare(a.at));
  const nn: RepeatNews[] = [];
  for (const d of news) {
    if (d.lat == null || d.lon == null || !inBbox({ lat: d.lat, lon: d.lon }, nearNews)) continue;
    const m = path.length > 1 ? distToLineM({ lat: d.lat, lon: d.lon }, path).m : haversineM({ lat: d.lat, lon: d.lon }, { lat: path[0][0], lon: path[0][1] });
    if (m <= NEWS_NEAR_M) nn.push({ id: d.id, title: d.title_en ?? d.title, outlet: d.outlet, at: d.at, url: d.url });
  }
  const cats = new Map<string, number>();
  for (const r of reports) cats.set(r.catLabel, (cats.get(r.catLabel) ?? 0) + 1);
  return { n: reports.length, open: reports.filter((r) => r.open).length, reports: reports.slice(0, 20), news: nn.slice(0, 6),
    cats: [...cats.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n) };
}

function whyLine(s: Pick<TrafficSpot, "level" | "delayMin" | "repeat" | "lengthM">): string {
  const parts: string[] = [];
  if (s.level === "very") parts.push(`Very congested${s.delayMin ? `, about ${s.delayMin} min delay` : ""}`);
  else if (s.level === "congested") parts.push(`Congested${s.delayMin ? `, about ${s.delayMin} min delay` : ""}`);
  else if (s.level === "flood") parts.push("Water on the road now");
  else if (s.level === "accident") parts.push("An accident or breakdown blocking the road");
  else if (s.level === "closed") parts.push(`Closed${s.lengthM ? ` for ${s.lengthM >= 1000 ? `${(s.lengthM / 1000).toFixed(1)} km` : `${s.lengthM} m`}` : ""}`);
  else if (s.level === "works") parts.push("Road works slowing traffic");
  else parts.push("Slow traffic");
  if (s.repeat.n >= 2) parts.push(`${plural(s.repeat.n, "report")} here in ${DAYS} days${s.repeat.open ? `, ${s.repeat.open} still open` : ""}`);
  else if (s.repeat.news.length) parts.push(`in the news ${plural(s.repeat.news.length, "time")} in ${DAYS} days`);
  return parts.join(" · ");
}

declare global {
  // eslint-disable-next-line no-var
  var __diqTrafficNow: { key: string; at: number; v: TrafficNow } | undefined;
}

/** Live traffic for the whole site. `lockDept`: an officer sees only their own department's records in the clusters. */
export async function trafficNow(o: { lockDept?: string | null } = {}): Promise<TrafficNow> {
  const live = await liveIncidents();
  const { world: w } = await world();
  const key = `${live.at}|${w.now}|${live.incidents.length}|${o.lockDept ?? ""}`;
  const c = global.__diqTrafficNow;
  if (c && c.key === key && Date.now() - c.at < 60_000) return c.v;
  const from = istCutoff(w.now, DAYS);
  const incs = w.incidents.filter((i) => i.first >= from && i.pinnable && (i.prec == null || i.prec <= 300) && (!o.lockDept || i.dept === o.lockDept));
  const news = (w.news ?? []).filter((d) => d.at >= from && TRAFFIC_NEWS.test(`${d.title} ${d.title_en ?? ""}`));

  // one spot per road stretch: TomTom gives a closed street once for each direction
  const seen = new Map<string, LiveIncident>();
  for (const x of live.incidents) {
    const ends = [x.from ?? "", x.to ?? ""].sort().join("|");
    const k = `${x.kind}|${ends}|${Math.round(x.lat * 500)}|${Math.round(x.lon * 500)}`;
    const had = seen.get(k);
    if (!had || (x.delayS ?? 0) > (had.delayS ?? 0)) seen.set(k, x);
  }
  const spots: TrafficSpot[] = [...seen.values()].map((x) => {
    const level = levelOf(x);
    const where = placeOf(w, x.lat, x.lon);
    const repeat = nearRecords(x.path, incs, news, level === "flood" || level === "closed", w);
    const delayMin = x.delayS != null ? Math.max(0, Math.round(x.delayS / 60)) : x.delayMin;
    const owner = ownerOf(level, x);
    const base = { very: 80, flood: 90, accident: 85, congested: 55, works: 30, closed: 25, slow: 15 }[level];
    // what the Collector should act on now: water on a road, an accident, a very congested stretch that costs real time
    // (3 min or more), sits on a main road or keeps coming back, a long congested one, or any jam where reports pile up
    const action = level === "flood" || level === "accident" || (level === "very" && ((delayMin ?? 0) >= 3 || !!x.road || repeat.n >= 2))
      || (level === "congested" && (delayMin ?? 0) >= 5) || (repeat.n >= 3 && level !== "closed" && level !== "works") || (level === "closed" && !!x.road && (x.lengthM ?? 0) >= 300);
    const s: TrafficSpot = { id: x.id, level, kind: x.kind, label: x.label, name: roadName(x), road: x.road, from: x.from, to: x.to, delayMin, delayS: x.delayS, lengthM: x.lengthM,
      magnitude: x.magnitude, path: x.path, lat: x.lat, lon: x.lon, ...where, owner, repeat, action, why: "", score: base + Math.min(30, delayMin ?? 0) + Math.min(20, repeat.n * 2) + (x.road ? 5 : 0) };
    s.why = whyLine(s);
    return s;
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  // trouble spots: live spots with reports near them, close ones (500 m) joined into one
  const hot = spots.filter((s) => s.repeat.n >= 2 && s.level !== "slow");
  const parent = hot.map((_, k) => k);
  const root = (k: number): number => (parent[k] === k ? k : (parent[k] = root(parent[k])));
  for (let a = 0; a < hot.length; a++) for (let b = a + 1; b < hot.length; b++)
    if (haversineM(hot[a], hot[b]) <= 500 || hot[a].repeat.reports.some((r) => hot[b].repeat.reports.some((q) => q.id === r.id))) parent[root(a)] = root(b);
  const groups = new Map<number, TrafficSpot[]>();
  hot.forEach((s, k) => { const r = root(k); (groups.get(r) ?? groups.set(r, []).get(r)!).push(s); });
  const RANK: TrafficLevel[] = ["flood", "accident", "very", "congested", "closed", "works", "slow"];
  const clusters: TrafficCluster[] = [...groups.values()].map((g) => {
    const reps = new Map<string, RepeatReport>(), nws = new Map<string, RepeatNews>();
    for (const s of g) { for (const r of s.repeat.reports) reps.set(r.id, r); for (const n of s.repeat.news) nws.set(n.id, n); }
    const reports = [...reps.values()].sort((a, b) => Number(b.open) - Number(a.open) || b.at.localeCompare(a.at));
    const worst = [...g].sort((a, b) => RANK.indexOf(a.level) - RANK.indexOf(b.level) || (b.delayMin ?? 0) - (a.delayMin ?? 0))[0];
    const cats = new Map<string, number>();
    for (const r of reports) cats.set(r.catLabel, (cats.get(r.catLabel) ?? 0) + 1);
    const open = reports.filter((r) => r.open).length;
    // named by its worst stretch ("Anna Salai: Gemini → Thousand Lights"), and how many more stretches are in it
    const others = g.length - 1;
    const lat = g.reduce((a, s) => a + s.lat, 0) / g.length, lon = g.reduce((a, s) => a + s.lon, 0) / g.length;
    const catText = [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l, n]) => `${n} ${l.toLowerCase()}`).join(", ");
    // who answers for a spot that keeps coming back: the body most of its reports were about (water: Storm Water Drains;
    // broken roads: Roads; jams, parking and accidents: the Traffic Police), else the live spot's own
    const by = { water: 0, road: 0, traffic: 0 };
    for (const r of reports) { if (WATER_CATS.has(r.cat)) by.water++; else if (r.cat === "ROAD_DAMAGE") by.road++; else by.traffic++; }
    const lead = by.water > by.traffic && by.water >= by.road ? "GCC-SWD" : by.road > by.traffic && by.road > by.water ? "GCC-ENG" : "POL-GCP";
    const owner: Owner = lead === "GCC-SWD" ? { dept: lead, ...OWNERS[lead], why: "Most reports here are water on the road: drains and pumps are Storm Water Drains' job; it keeps the road open." }
      : lead === "GCC-ENG" ? { dept: lead, ...OWNERS[lead], why: "Most reports here are a broken road: a lasting repair is the Roads department's job." }
        : worst.level === "flood" || worst.level === "works" ? worst.owner : { dept: "POL-GCP", ...OWNERS["POL-GCP"], why: "Most reports here are jams, parking and accidents: the Traffic Police fix the junction." };
    return { id: `tc-${worst.id.slice(-12)}`, name: `${worst.name}${others ? ` (+${others} more ${others === 1 ? "stretch" : "stretches"})` : ""}`, zone: worst.zone, zoneName: worst.zoneName, ward: worst.ward, lat, lon, spots: g.map((s) => s.id), level: worst.level,
      delayMin: worst.delayMin, reports, news: [...nws.values()], open, owner,
      why: `${plural(reports.length, "report")} in ${DAYS} days${catText ? ` (${catText})` : ""}${open ? `, ${open} still open` : ""}; ${LEVEL_WORD[worst.level].en.toLowerCase()} again now${worst.delayMin ? `, about ${worst.delayMin} min delay` : ""}` };
  }).sort((a, b) => Number(b.level !== "closed" && b.level !== "works") - Number(a.level !== "closed" && a.level !== "works") || b.reports.length - a.reports.length || (b.delayMin ?? 0) - (a.delayMin ?? 0));

  const jams = spots.filter((s) => s.level === "very" || s.level === "congested" || s.level === "slow");
  const zm = new Map<number, { zone: number; name: string; jams: number; very: number; delayMin: number }>();
  for (const s of jams) if (s.zone != null) {
    const z = zm.get(s.zone) ?? zm.set(s.zone, { zone: s.zone, name: s.zoneName ?? `Zone ${s.zone}`, jams: 0, very: 0, delayMin: 0 }).get(s.zone)!;
    z.jams++; if (s.level === "very") z.very++; z.delayMin += s.delayMin ?? 0;
  }
  const v: TrafficNow = {
    enabled: live.enabled, at: live.at, why: live.why, source: SOURCE_LINE,
    counts: { total: spots.length, jams: jams.length, very: spots.filter((s) => s.level === "very").length, congested: spots.filter((s) => s.level === "congested").length,
      slow: spots.filter((s) => s.level === "slow").length, closed: spots.filter((s) => s.level === "closed").length, flooded: spots.filter((s) => s.level === "flood").length,
      accidents: spots.filter((s) => s.level === "accident").length, works: spots.filter((s) => s.level === "works").length, action: spots.filter((s) => s.action).length, clusters: clusters.length },
    spots, clusters,
    zones: [...zm.values()].sort((a, b) => b.very - a.very || b.jams - a.jams),
    window: { from, to: w.now }
  };
  global.__diqTrafficNow = { key, at: Date.now(), v };
  return v;
}

const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }) : null);

/** Traffic in two or three sentences, English and Tamil: the same words wherever they are said */
export function trafficSay(t: TrafficNow, zone: number | null = null): { en: string; ta: string } {
  if (!t.enabled) return { en: "Live traffic is not switched on: it needs the TomTom key on the server.", ta: "நேரடி போக்குவரத்துத் தகவல் இயக்கப்படவில்லை: சர்வரில் TomTom சாவி தேவை." };
  const spots = zone == null ? t.spots : t.spots.filter((s) => s.zone === zone);
  const where = zone == null ? "across the district" : `in ${t.zones.find((z) => z.zone === zone)?.name ?? `Zone ${zone}`}`;
  const whereTa = zone == null ? "மாவட்டம் முழுவதும்" : `${t.zones.find((z) => z.zone === zone)?.name ?? `மண்டலம் ${zone}`} பகுதியில்`;
  const very = spots.filter((s) => s.level === "very"), cong = spots.filter((s) => s.level === "congested");
  const flood = spots.filter((s) => s.level === "flood"), acc = spots.filter((s) => s.level === "accident");
  const closed = spots.filter((s) => s.level === "closed");
  // the worst now: water on a road or an accident first, then the longest delay
  const rankOf = (s: TrafficSpot) => (s.level === "flood" || s.level === "accident" ? 2 : s.level === "very" ? 1 : s.level === "congested" ? 0 : -1);
  const worst = [...spots].filter((s) => rankOf(s) >= 0).sort((a, b) => rankOf(b) - rankOf(a) || (b.delayMin ?? 0) - (a.delayMin ?? 0))[0] ?? null;
  const at = hm(t.at);
  if (!spots.length) return { en: `Traffic is moving ${where}: no jam or closure reported${at ? ` as of ${at}` : ""}.`, ta: `${whereTa} போக்குவரத்து சீராக உள்ளது: நெரிசல் இல்லை.` };
  const top = zone == null ? t.zones[0] : null;
  const hotCl = zone == null ? t.clusters[0] : t.clusters.find((c) => c.zone === zone) ?? null;
  const en = [
    `Live traffic ${where}${at ? ` at ${at}` : ""}: ${plural(very.length, "very congested stretch", "very congested stretches")}, ${plural(cong.length, "congested one", "congested ones")}${flood.length ? `, ${plural(flood.length, "road")} with water on it` : ""}${acc.length ? `, ${plural(acc.length, "accident or breakdown", "accidents or breakdowns")}` : ""} and ${plural(closed.length, "closed road")}.`,
    worst ? `Worst now: ${worst.name}${worst.zoneName ? ` (${worst.zoneName})` : ""}, ${worst.why.split(" · ")[0].toLowerCase()}.` : "",
    top && top.jams ? `Most jams in ${top.name} (${top.jams}).` : "",
    hotCl ? `Trouble spot: ${hotCl.name}, ${hotCl.why}; send it to ${hotCl.owner.name}.` : ""
  ].filter(Boolean).join(" ");
  const ta = [
    `${whereTa} நேரடி போக்குவரத்து: ${very.length} இடங்களில் கடும் நெரிசல், ${cong.length} இடங்களில் நெரிசல்${flood.length ? `, ${flood.length} சாலைகளில் தண்ணீர்` : ""}${acc.length ? `, ${acc.length} விபத்து / பழுது` : ""}, ${closed.length} சாலைகள் மூடல்.`,
    worst ? `மிக மோசம்: ${worst.name}${worst.delayMin ? `, சுமார் ${worst.delayMin} நிமிட தாமதம்` : ""}.` : "",
    hotCl ? `மீண்டும் மீண்டும் சிக்கல்: ${hotCl.name}, ${DAYS} நாளில் ${hotCl.reports.length} புகார்கள்; ${hotCl.owner.ta} துறைக்கு அனுப்பலாம்.` : ""
  ].filter(Boolean).join(" ");
  return { en, ta };
}
