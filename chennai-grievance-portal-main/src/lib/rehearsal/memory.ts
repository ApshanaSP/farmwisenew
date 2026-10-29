/**
 * Flood memory: the streets where people reported flooding in past heavy rains. Each flooding or drain complaint with a
 * street-level place (≤ 300 m) marks the road pieces next to it (graph.ts); a complaint made during a rain (from the
 * rain's first day to two days after its last) counts for that rain. A street that flooded in two or more rains is
 * LIKELY to flood again, one that flooded in one rain is POSSIBLE. This is a record of the past, never a forecast.
 * Everything takes an explicit asOf and uses only what was known before it (no peeking: replay.ts tests it). Pure.
 */
import { edgeName, edgeNameTa, edgesNear, otherEnd, type GraphIndex, type RoadGraph } from "./graph";

/** One water-related incident, as the memory needs it. Never a complainant's personal data. */
export interface FloodInc {
  id: string;
  cat: string;
  lat: number;
  lon: number;
  /** metres; null = unknown */
  prec: number | null;
  /** IST "YYYY-MM-DD HH:MM:SS" */
  first: string;
  /** IST, null = not closed or no closing time */
  closed: string | null;
  /** open now (the pipeline's status) */
  open: boolean;
  ward: number | null;
  dept: string;
  title: string;
  place: string | null;
  priority: number;
  breached: boolean;
  status: string;
}

/** A heavy rain: one or more consecutive rain days. */
export interface RainEvent {
  id: string;
  /** first and last rain day, "YYYY-MM-DD" */
  start: string;
  end: string;
  /** where the rain days come from: the district pipeline's heavy-rain days, IMD station rainfall ≥ 30 mm */
  sources: ("pipeline" | "imd")[];
  /** the most rain at any IMD station on one of its days, if measured */
  maxMm: number | null;
  maxAt: string | null;
}

/** weight of each category: standing water counts most, drain complaints less */
export const FLOOD_W: Record<string, number> = { FLOOD_WATERLOGGING: 2, FLOOD_RISK_SIGNAL: 1.5, DRAINAGE_SEWAGE: 1, DRAIN_WORKS_SAFETY: 0.5 };
/** categories a still-open complaint becomes a drain job for (chokes.ts) */
export const CHOKE_CATS = new Set(["DRAINAGE_SEWAGE", "FLOOD_WATERLOGGING", "DRAIN_WORKS_SAFETY", "WATERBODY_INFRA"]);
/** a complaint marks a street only if its place is known to this many metres */
export const MEMORY_PREC_M = 300;
/** days after a rain's last day that still count as "during the rain" */
export const RAIN_TAIL_DAYS = 2;

export interface MemoryOpts {
  asOf: string;
  /** how far from an exactly placed complaint (≤ 50 m) a road piece is marked */
  rExact?: number;
  /** … and from a complaint placed to ≤ 300 m */
  rNear?: number;
  /** a rain's weight halves every this many days */
  halfLifeDays?: number;
  /** complaints outside rains that make a street POSSIBLE with one rain ("water stands here anyway"); 0 = off */
  stagnantMin?: number;
  /** a rain complaint counts for every road piece within this distance (the flood spot) */
  rSpot?: number;
  /** rains a spot must have flooded in: LIKELY, POSSIBLE */
  likelyRains?: number;
  possibleRains?: number;
  /** when set: mark a fixed length instead (km of the highest-scoring streets), likely then possible */
  likelyKm?: number;
  possibleKm?: number;
  /** re-order by low ground (up to 1 + lowBoost for 3 m below the roads around) and by water within 300 m */
  lowBoost?: number;
  waterBoost?: number;
}
/** chosen in Phase 2 by replaying the rains before 21 Oct 2026 only (docs/rain-rehearsal/PROGRESS.md) */
export const MEMORY_DEFAULTS = { rExact: 50, rNear: 120, halfLifeDays: 180, stagnantMin: 0, rSpot: 150, likelyRains: 3, possibleRains: 1, likelyKm: 20, possibleKm: 40, lowBoost: 0, waterBoost: 1 };

export const TIER_NONE = 0, TIER_POSSIBLE = 1, TIER_LIKELY = 2;

export interface Hit { inc: number; ev: number; d: number }

export interface Street {
  key: string;
  name: string | null;
  name_ta: string | null;
  /** for an unnamed lane, the named street it leads off */
  near: string | null;
  ward: number;
  edges: number[];
  tier: 1 | 2;
  /** rains it flooded in */
  rains: number;
  rainDates: string[];
  /** flooding complaints during rains, and water complaints outside rains */
  rainIncidents: number;
  otherIncidents: number;
  lastFlood: string | null;
  score: number;
  length_m: number;
  /** a point on its most-flooded piece */
  lat: number;
  lon: number;
  water_m: number;
  /** complaint ids, newest first (at most 12) */
  incidents: string[];
}

export interface Memory {
  asOf: string;
  events: RainEvent[];
  /** per road piece */
  score: Float32Array;
  rains: Uint8Array;
  tier: Uint8Array;
  /** complaints that mark each piece */
  hits: Map<number, Hit[]>;
  /** the incidents used (index = Hit.inc) */
  incs: FloodInc[];
  streets: Street[];
  likely: number;
  possible: number;
  /** complaints that marked a street, of those with a good-enough place */
  used: number;
}

const day = (t: string) => t.slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => (Date.parse(b.slice(0, 10) + "T00:00:00Z") - Date.parse(a.slice(0, 10) + "T00:00:00Z")) / 86_400_000;

/** Rain days → rain events: consecutive days (a gap of at most one dry day) are one rain. */
export function rainEvents(days: { day: string; source: "pipeline" | "imd"; mm?: number | null }[]): RainEvent[] {
  const byDay = new Map<string, { sources: Set<"pipeline" | "imd">; mm: number | null }>();
  for (const d of days) {
    const x = byDay.get(d.day) ?? byDay.set(d.day, { sources: new Set(), mm: null }).get(d.day)!;
    x.sources.add(d.source);
    if (d.mm != null) x.mm = Math.max(x.mm ?? 0, d.mm);
  }
  const sorted = [...byDay.keys()].sort();
  const out: RainEvent[] = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    const v = byDay.get(d)!;
    if (last && daysBetween(last.end, d) <= 2) {
      last.end = d;
      for (const s of v.sources) if (!last.sources.includes(s)) last.sources.push(s);
      if (v.mm != null && (last.maxMm == null || v.mm > last.maxMm)) { last.maxMm = v.mm; last.maxAt = d; }
    } else out.push({ id: `rain-${d}`, start: d, end: d, sources: [...v.sources], maxMm: v.mm, maxAt: v.mm != null ? d : null });
  }
  return out;
}

/** the rain an incident belongs to (index into events), or -1 */
export function rainOf(events: RainEvent[], first: string): number {
  const d = day(first);
  for (let k = 0; k < events.length; k++) if (d >= events[k].start && d <= addDays(events[k].end, RAIN_TAIL_DAYS)) return k;
  return -1;
}

/**
 * Builds the flood memory as it stood at asOf. Two distances: a complaint MARKS the road pieces it was made on (within
 * rExact / rNear of its place), and it COUNTS for every piece within rSpot, so a piece's "rains" is the number of past
 * rains with flooding reported around it (a flood spot, as GCC lists its vulnerable locations). A marked piece is LIKELY
 * when its spot flooded in likelyRains or more rains, POSSIBLE from possibleRains.
 */
export function buildMemory(g: RoadGraph, ix: GraphIndex, all: FloodInc[], allEvents: RainEvent[], opts: MemoryOpts): Memory {
  const o = { ...MEMORY_DEFAULTS, ...opts };
  const asOf = o.asOf;
  // only rains that had begun, and complaints made, before asOf
  const events = allEvents.filter((e) => e.start < day(asOf));
  const incs = all.filter((i) => i.first < asOf && FLOOD_W[i.cat] != null && i.prec != null && i.prec <= MEMORY_PREC_M);
  const score = new Float32Array(g.m), rainsSet = new Map<number, Set<number>>(), other = new Float32Array(g.m), tier = new Uint8Array(g.m);
  const hits = new Map<number, Hit[]>();
  let used = 0;
  incs.forEach((inc, k) => {
    const r = inc.prec! <= 50 ? o.rExact : o.rNear;
    const ev = rainOf(events, inc.first);
    const counts = ev >= 0 && inc.cat !== "DRAIN_WORKS_SAFETY";
    const near = edgesNear(g, ix, inc.lat, inc.lon, Math.max(r, counts ? o.rSpot : 0));
    if (!near.length) return;
    const age = Math.max(0, daysBetween(inc.first, asOf));
    const w = FLOOD_W[inc.cat] * 0.5 ** (age / o.halfLifeDays);
    let marked = false;
    for (const { e, d } of near) {
      if (counts && d <= o.rSpot) {
        (rainsSet.get(e) ?? rainsSet.set(e, new Set()).get(e)!).add(ev);
        score[e] += w * (1 - (0.5 * d) / o.rSpot);
      }
      // the piece it was made on, and any other within 40 m more (a complaint at a junction wets every arm)
      if (d <= r && d <= near[0].d + 40) {
        marked = true;
        (hits.get(e) ?? hits.set(e, []).get(e)!).push({ inc: k, ev, d: Math.round(d) });
        if (ev < 0) { score[e] += 0.3 * w; other[e] += 1; }
      }
    }
    if (marked) used++;
  });
  const rains = new Uint8Array(g.m);
  for (const [e, s] of rainsSet) rains[e] = Math.min(255, s.size);
  // hints that only re-order streets that already have flooding complaints (never mark a street on their own):
  // ground lower than the roads around it, and a canal, river or lake close by
  if (o.lowBoost > 0 && g.relElev.length) for (const e of hits.keys()) { const r = g.relElev[e]; if (r < 0) score[e] *= 1 + o.lowBoost * Math.min(1, -r / 3); }
  if (o.waterBoost > 0) for (const e of hits.keys()) if (g.water[e] < 300) score[e] *= 1 + o.waterBoost * (1 - g.water[e] / 300);
  if (o.likelyKm > 0) {
    // a fixed length of street, the worst first: LIKELY = the top likelyKm of pieces that flooded in 2+ rains, then
    // POSSIBLE = the next possibleKm of pieces with 1+ rain (a Collector's list is cut off by length, not by a score)
    const cand = [...hits.keys()].filter((e) => rains[e] >= 1).sort((a, b) => score[b] - score[a] || a - b);
    let L = 0, P = 0;
    for (const e of cand) {
      if (rains[e] >= o.likelyRains && L < o.likelyKm * 1000) { tier[e] = TIER_LIKELY; L += g.len[e]; }
      else if (P < o.possibleKm * 1000) { tier[e] = TIER_POSSIBLE; P += g.len[e]; }
    }
  } else for (const e of hits.keys())
    tier[e] = rains[e] >= o.likelyRains ? TIER_LIKELY : rains[e] >= o.possibleRains || (o.stagnantMin > 0 && other[e] >= o.stagnantMin && rains[e] >= 1) ? TIER_POSSIBLE : TIER_NONE;
  const streets = groupStreets(g, tier, score, rainsSet, hits, incs, events);
  return {
    asOf, events, score, rains, tier, hits, incs, streets, used,
    likely: streets.filter((s) => s.tier === TIER_LIKELY).length, possible: streets.filter((s) => s.tier === TIER_POSSIBLE).length
  };
}

/**
 * Marked pieces → streets: named pieces in the same ward share a street; unnamed pieces that touch form one lane,
 * named after the street it leads off.
 */
function groupStreets(g: RoadGraph, tier: Uint8Array, score: Float32Array, spot: Map<number, Set<number>>, hits: Map<number, Hit[]>, incs: FloodInc[], events: RainEvent[]): Street[] {
  const groups = new Map<string, number[]>();
  const marked = [...hits.keys()].filter((e) => tier[e] > 0).sort((a, b) => a - b);
  const markedSet = new Set(marked);
  const done = new Set<number>();
  for (const e of marked) {
    if (g.name[e] >= 0) { const k = `n${g.name[e]}|w${g.ward[e]}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(e); continue; }
    if (done.has(e)) continue;
    // an unnamed lane: the touching unnamed marked pieces
    const lane: number[] = [];
    const stack = [e];
    done.add(e);
    while (stack.length) {
      const x = stack.pop()!;
      lane.push(x);
      for (const u of [g.from[x], g.to[x]]) for (let k = g.adjStart[u]; k < g.adjStart[u + 1]; k++) {
        const y = g.adjEdge[k];
        if (!done.has(y) && markedSet.has(y) && g.name[y] < 0) { done.add(y); stack.push(y); }
      }
    }
    groups.set(`e${Math.min(...lane)}`, lane);
  }
  const out: Street[] = [];
  for (const [key, edges] of groups) {
    const evs = new Set<number>();
    const ids = new Map<string, string>();
    let rainN = 0, otherN = 0, sc = 0, len = 0, best = edges[0], water = 1000;
    for (const e of edges) {
      sc += score[e];
      len += g.len[e];
      water = Math.min(water, g.water[e]);
      if (score[e] > score[best]) best = e;
      // the rains its flood spot flooded in
      for (const k of spot.get(e) ?? []) evs.add(k);
      for (const h of hits.get(e) ?? []) {
        if (ids.has(incs[h.inc].id)) continue;
        ids.set(incs[h.inc].id, incs[h.inc].first);
        if (h.ev >= 0) { rainN++; if (incs[h.inc].cat !== "DRAIN_WORKS_SAFETY") evs.add(h.ev); } else otherN++;
      }
    }
    const t = edges.reduce((m, e) => Math.max(m, tier[e]), 0);
    const mid = Math.floor((g.shapeStart[best] + g.shapeStart[best + 1] - 1) / 2);
    const name = edgeName(g, edges[0]);
    out.push({
      key, name, name_ta: edgeNameTa(g, edges[0]), near: name ? null : nearName(g, edges), ward: g.ward[best], edges, tier: t as 1 | 2,
      rains: evs.size, rainDates: [...evs].sort((a, b) => a - b).map((k) => events[k].start),
      rainIncidents: rainN, otherIncidents: otherN, lastFlood: [...ids.values()].sort().at(-1) ?? null, score: Math.round(sc * 100) / 100,
      length_m: Math.round(len), lat: g.shape[2 * mid], lon: g.shape[2 * mid + 1], water_m: water,
      incidents: [...ids.entries()].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : a[0].localeCompare(b[0]))).slice(0, 12).map(([id]) => id)
    });
  }
  return out.sort((a, b) => b.tier - a.tier || b.score - a.score || a.key.localeCompare(b.key));
}

/** the named street an unnamed lane leads off (a named piece at one of its ends), or null */
function nearName(g: RoadGraph, edges: number[]): string | null {
  const own = new Set(edges);
  const count = new Map<number, number>();
  for (const e of edges) for (const u of [g.from[e], g.to[e]]) for (let k = g.adjStart[u]; k < g.adjStart[u + 1]; k++) {
    const y = g.adjEdge[k];
    if (!own.has(y) && g.name[y] >= 0) count.set(g.name[y], (count.get(g.name[y]) ?? 0) + g.len[y]);
  }
  const best = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return best ? g.names[best[0]] : null;
}

/** "Velachery Main Road" or "a lane off Velachery Main Road" or "a lane in ward 177" */
export function streetLabel(s: Pick<Street, "name" | "near" | "ward">, lang: "en" | "ta" = "en"): string {
  if (s.name) return s.name;
  if (s.near) return lang === "ta" ? `${s.near} அருகே ஒரு சந்து` : `A lane off ${s.near}`;
  return lang === "ta" ? `வார்டு ${s.ward} இல் ஒரு சந்து` : `A lane in ward ${s.ward}`;
}

/** Was the incident open at asOf? Reported before it, and still open now or closed after it. Today: the live status. */
export function openAt(i: FloodInc, asOf: string, live: boolean): boolean {
  if (i.first >= asOf) return false;
  if (live) return i.open;
  return i.open ? !i.closed || i.closed > asOf : !!i.closed && i.closed > asOf;
}

/** the road state for a rehearsal: likely pieces closed, possible pieces slow */
export const SLOW_FACTOR = 0.3;
export function rehearsalFactor(m: Memory): Float32Array {
  const f = new Float32Array(m.tier.length).fill(1);
  for (let e = 0; e < m.tier.length; e++) f[e] = m.tier[e] === TIER_LIKELY ? 0 : m.tier[e] === TIER_POSSIBLE ? SLOW_FACTOR : 1;
  return f;
}

export { otherEnd };
