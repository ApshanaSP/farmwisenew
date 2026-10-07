/**
 * Groups incidents that are the same problem in the same area, so the console shows each once with every source
 * it came from. The pipeline already merges reports into incidents; it still files one problem as several when
 * citizens report it days apart from neighbouring streets, or when many outlets cover one event.
 *
 * Two kinds of incident, two rules, both one pass over the incidents in time order:
 *
 *   placed    a point on the map (a ward-level place or better), same category, within `hours` of the group's first
 *             report, and one of:
 *               - within `radiusM` of the group's first report (map pins dropped a street apart); for events
 *                 (crimes, accidents, fires: EVENT_CATEGORIES) only when the reports also read alike;
 *               - citizen complaints only (a standing problem; two accidents "in Velachery" are two events):
 *                 the same named place (street, locality, landmark) in the same zone, within `placeRadiusM`: citizens
 *                 drop their pins anywhere along "Gandhi Street", the street is the same;
 *                 or the same person reporting it again in the same zone, within `reporterRadiusM`.
 *             The first report anchors the group in place and time (leader clustering), so a chain of reports cannot
 *             drift across the city or run on for weeks. Groups are found through a grid of `radiusM` cells keyed by
 *             category (each incident checks the 9 cells around it) and two hash indexes (place, reporter).
 *   unplaced  only "Chennai" (city-level news, IMD warnings): same category and the headlines read alike (TF-IDF
 *             cosine over English words, Tamil word stems), within `hours` of the group's first report; routine
 *             notices of one kind (power shutdown lists, rain updates, dengue counts) are one group a week.
 *
 * O(n) grid lookups for placed incidents; unplaced ones compare only with the open groups of their category.
 */
import { cleanTitle, tokens } from "@/lib/collector/threads";
import { topicOf } from "@/lib/collector/newsrel";

export interface ClusterInput {
  id: string;
  cat: string;
  /** first reported, epoch ms */
  t: number;
  lat: number | null;
  lon: number | null;
  /** the point stands for a real place (not the city centre the monitor uses for "Chennai") */
  placed: boolean;
  /** headline, English where there is a translation */
  text: string;
  /** the headline as published (Tamil), for routine-notice topics */
  original?: string;
  /** GCC zone and the named place (street, locality, landmark) of a placed incident */
  zone?: number | null;
  place?: string | null;
  /** who reported it (hashed reporter ids of its citizen complaints) */
  reporters?: string[];
  /** it holds citizen complaints: a standing problem at a place. Police and hospital records are events, each its own */
  civic?: boolean;
  /** known only from official records (police, hospital, PWD): each record is its own case, the pipeline already joined duplicates */
  official?: boolean;
}

export interface ClusterOptions { radiusM: number; placeRadiusM: number; reporterRadiusM: number; hours: number; minCos: number; topicDays: number }
export const CLUSTER_DEFAULTS: ClusterOptions = { radiusM: 300, placeRadiusM: 1500, reporterRadiusM: 600, hours: 72, minCos: 0.45, topicDays: 7 };

/** A place name as a key: lower case, letters and digits; "" for a name too general to group by. */
export function placeKey(p: string | null | undefined): string {
  const k = String(p ?? "").normalize("NFC").toLowerCase().replace(/(st|rd)\.?/g, (m) => (m.startsWith("s") ? "street" : "road"))
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return k.length < 4 || CITY_ONLY.test(k) ? "" : k;
}

/**
 * Events, not standing problems: two thefts, accidents or fires reported near each other are usually two events, so
 * nearby incidents of these categories join only when their reports also read alike (the same event). A dark street,
 * a garbage heap or a blocked drain reported again nearby is the same problem, so those group by place alone.
 */
export const EVENT_CATEGORIES = new Set(["CRIME_PROPERTY", "CRIME_VIOLENT", "CRIMES_AGAINST_WOMEN", "SUICIDE_SELF_HARM", "MISSING_PERSON",
  "DRUGS_LIQUOR", "PUBLIC_ORDER", "POLICE_OTHER", "ROAD_ACCIDENT", "FIRE_EXPLOSION", "OTHER"]);

/** Report boilerplate that says nothing about which event it was ("reported around 9.40 pm; no injuries"). */
const EVENT_STOP = new Set(["around", "reported", "report", "reports", "caller", "called", "pm", "am", "no", "injuries", "injury", "injured", "were",
  "was", "person", "persons", "people", "man", "woman", "one", "two", "three", "near", "lost", "after", "police", "case", "incident", "station",
  "said", "says", "today", "yesterday", "night", "morning", "evening", "area", "road", "street", "main", "chennai"]);

/** Words that say nothing about which event it is. */
const PLAIN = new Set(["chennai", "city", "corporation", "gcc", "government", "tamil", "nadu", "news", "update", "breaking", "today", "near", "area"]);

/** Returns each incident's group: the id of the group's first incident (itself when alone). */
export function clusterIncidents(rows: ClusterInput[], opt: ClusterOptions = CLUSTER_DEFAULTS): Map<string, string> {
  const out = new Map<string, string>();
  const order = [...rows].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  const span = opt.hours * 36e5;

  // ---- placed: leader clustering on a grid
  interface Leader { id: string; lat: number; lon: number; first: number; v?: Vec; official?: boolean }
  const cellDeg = opt.radiusM / 111_320;
  const grid = new Map<string, Leader[]>(), byPlace = new Map<string, Leader[]>(), byReporter = new Map<string, Leader[]>();
  const metres = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const dy = (a.lat - b.lat) * 111_320, dx = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
    return Math.hypot(dx, dy);
  };

  // ---- TF-IDF over the headlines of unplaced incidents and of events (which must read alike to join)
  const event = (r: ClusterInput) => EVENT_CATEGORIES.has(r.cat);
  const words = new Map<string, string[]>();
  const df = new Map<string, number>();
  for (const r of order) {
    if (r.placed && r.lat != null && r.lon != null && !event(r)) continue;
    // an event's own place name and the reports' boilerplate are shared by different events at one place: left out
    const placeWords = event(r) ? new Set(tokens(String(r.place ?? ""))) : null;
    const w = [...new Set(tokens(cleanTitle(r.text)).filter((x) => !PLAIN.has(x) && !(placeWords && (placeWords.has(x) || EVENT_STOP.has(x)))))];
    words.set(r.id, w);
    for (const x of w) df.set(x, (df.get(x) ?? 0) + 1);
  }
  const nU = Math.max(1, words.size);
  const vec = (id: string) => {
    const m = new Map((words.get(id) ?? []).map((w) => [w, Math.log(1 + nU / (df.get(w) ?? 1))]));
    return { m, norm: Math.hypot(...m.values()) || 1 };
  };
  type Vec = ReturnType<typeof vec>;
  /** cosine of two headlines, and whether they read as the same event */
  const alike = (a: Vec, b: Vec, strict = false) => {
    let dot = 0, shared = 0;
    for (const [w, x] of a.m) { const y = b.m.get(w); if (y) { dot += x * y; shared++; } }
    const cos = dot / (a.norm * b.norm);
    // two events near each other must read clearly alike to be one event
    return { cos, ok: strict ? cos >= 0.5 || (shared >= 4 && cos >= 0.35) : cos >= opt.minCos || (shared >= 3 && cos >= 0.25) };
  };
  interface Group { id: string; v: Vec; topic: string | null; first: number }
  const open = new Map<string, Group[]>(); // by category

  for (const r of order) {
    if (r.placed && r.lat != null && r.lon != null) {
      const p = { lat: r.lat, lon: r.lon };
      const gx = Math.floor(r.lon / cellDeg), gy = Math.floor(r.lat / cellDeg);
      const ev = event(r) ? vec(r.id) : undefined;
      let best: Leader | null = null, bestD = Infinity;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const l of grid.get(`${r.cat}|${gx + dx}|${gy + dy}`) ?? []) {
          if (r.t - l.first > span) continue;
          // an event joins only the same event: near it and reported alike
          if (ev && (!l.v || (r.official && l.official) || !alike(ev, l.v, true).ok)) continue;
          const d = metres(p, l);
          if (d <= opt.radiusM && d < bestD) { best = l; bestD = d; }
        }
      }
      // the same named place in the same zone, or the same person, a little further away
      const pk = r.civic && r.zone != null && placeKey(r.place) ? `${r.cat}|${r.zone}|${placeKey(r.place)}` : null;
      const rk = r.civic && r.zone != null ? (r.reporters ?? []).map((x) => `${r.cat}|${r.zone}|${x}`) : [];
      if (!best) {
        for (const [keys, idx, lim] of [[pk ? [pk] : [], byPlace, opt.placeRadiusM], [rk, byReporter, opt.reporterRadiusM]] as const) {
          for (const k of keys) for (const l of idx.get(k) ?? []) {
            if (r.t - l.first > span) continue;
            const d = metres(p, l);
            if (d <= lim && d < bestD) { best = l; bestD = d; }
          }
        }
      }
      const add = (idx: Map<string, Leader[]>, k: string, l: Leader) => { const a = idx.get(k) ?? idx.set(k, []).get(k)!; if (!a.includes(l)) a.push(l); };
      if (best) {
        // a later report can reach the group through this one's street or reporter too
        if (pk) add(byPlace, pk, best);
        for (const k of rk) add(byReporter, k, best);
        out.set(r.id, best.id);
        continue;
      }
      const lead: Leader = { id: r.id, ...p, first: r.t, v: ev, official: r.official };
      add(grid, `${r.cat}|${gx}|${gy}`, lead);
      if (pk) add(byPlace, pk, lead);
      for (const k of rk) add(byReporter, k, lead);
      out.set(r.id, r.id);
      continue;
    }
    const v = vec(r.id);
    const topic = topicOf(r.text, r.original ?? "");
    const live = (open.get(r.cat) ?? []).filter((g) => r.t - g.first <= (g.topic ? opt.topicDays * 864e5 : span));
    let best: Group | null = null, bestCos = 0;
    for (const g of live) {
      if (topic || g.topic) {
        if (topic && topic === g.topic) { best = g; bestCos = 1; break; }
        continue;
      }
      const { cos, ok } = alike(v, g.v);
      if (ok && cos > bestCos) { best = g; bestCos = cos; }
    }
    if (best) out.set(r.id, best.id);
    else { live.push({ id: r.id, v, topic, first: r.t }); out.set(r.id, r.id); }
    open.set(r.cat, live);
  }
  return out;
}

/** A place the monitor gives news that names only the city: not a real point to group by. */
export const CITY_ONLY = /^\s*(chennai|chennai district|greater chennai|tamil nadu)?\s*$/i;
