/**
 * Replay and proof: for a past rain, build the flood memory as it stood two days before (only what was known then),
 * and count how many of that rain's flooding reports fell on the streets it marked. The honest comparison is luck:
 * the same length of street picked at random, many times. Lift = our share ÷ the random share. Pure; seeded random.
 */
import { edgesNear, type GraphIndex, type RoadGraph } from "./graph";
import { buildMemory, RAIN_TAIL_DAYS, TIER_LIKELY, type FloodInc, type Memory, type MemoryOpts, type RainEvent } from "./memory";

/** a flooding report counts as "on a predicted street" within this distance of one */
export const COVER_M = 100;
/** the reports a rain is judged on: standing water, placed to the street */
export const TEST_CATS = new Set(["FLOOD_WATERLOGGING"]);
/** fewer reports than this and a rain is not judged */
export const MIN_TESTED = 20;

const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
/** the moment a replay shows: 09:00 two days before the rain's first day */
export const replayAsOf = (e: RainEvent) => `${addDays(e.start, -2)} 09:00:00`;
/** the window a rain's reports are counted in */
export const rainWindow = (e: RainEvent) => ({ from: `${e.start} 00:00:00`, to: `${addDays(e.end, RAIN_TAIL_DAYS)} 23:59:59` });

export interface Judged {
  /** reports judged */
  tested: number;
  /** of them, on a predicted street (likely or possible), and on a likely one */
  covered: number;
  coveredLikely: number;
  /** km of street marked */
  km: number;
  kmLikely: number;
  /** the same km picked at random: median and 90 % range of the share caught */
  random: { median: number; lo: number; hi: number; draws: number };
  randomLikely: { median: number; lo: number; hi: number; draws: number };
  /** our share ÷ random median (null when random caught nothing) */
  lift: number | null;
  liftLikely: number | null;
  /** report ids and whether each was caught (for the map's Check stop) */
  reports: { id: string; covered: boolean }[];
}

export function seeded(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

/** Judges a memory against the reports of one rain. */
export function judge(g: RoadGraph, ix: GraphIndex, mem: Memory, reports: FloodInc[], draws = 400, seed = 7): Judged {
  const near = reports.map((r) => edgesNear(g, ix, r.lat, r.lon, COVER_M).map((x) => x.e));
  const caught = (pick: (e: number) => boolean) => near.reduce((n, es) => n + (es.some(pick) ? 1 : 0), 0);
  const covered = caught((e) => mem.tier[e] > 0), coveredLikely = caught((e) => mem.tier[e] === TIER_LIKELY);
  let km = 0, kmLikely = 0;
  for (let e = 0; e < g.m; e++) { if (mem.tier[e] > 0) km += g.len[e]; if (mem.tier[e] === TIER_LIKELY) kmLikely += g.len[e]; }
  const pool: number[] = [];
  for (let e = 0; e < g.m; e++) if (g.ward[e] > 0) pool.push(e);
  const rnd = seeded(seed);
  const chosen = new Uint8Array(g.m);
  const randomShare = (lengthM: number) => {
    const shares: number[] = [];
    for (let k = 0; k < draws && lengthM > 0; k++) {
      const picked: number[] = [];
      let L = 0;
      while (L < lengthM && picked.length < pool.length) { const e = pool[Math.floor(rnd() * pool.length)]; if (!chosen[e]) { chosen[e] = 1; picked.push(e); L += g.len[e]; } }
      shares.push(reports.length ? caught((e) => chosen[e] === 1) / reports.length : 0);
      for (const e of picked) chosen[e] = 0;
    }
    shares.sort((a, b) => a - b);
    const at = (p: number) => (shares.length ? shares[Math.min(shares.length - 1, Math.floor(p * shares.length))] : 0);
    return { median: at(0.5), lo: at(0.05), hi: at(0.95), draws: shares.length };
  };
  const random = randomShare(km), randomLikely = randomShare(kmLikely);
  const share = reports.length ? covered / reports.length : 0, shareL = reports.length ? coveredLikely / reports.length : 0;
  return {
    tested: reports.length, covered, coveredLikely, km: km / 1000, kmLikely: kmLikely / 1000, random, randomLikely,
    lift: random.median > 0 ? share / random.median : null, liftLikely: randomLikely.median > 0 ? shareL / randomLikely.median : null,
    reports: reports.map((r, k) => ({ id: r.id, covered: near[k].some((e) => mem.tier[e] > 0) }))
  };
}

/** the flooding reports of one rain (standing water, placed to the street) */
export function rainReports(all: FloodInc[], e: RainEvent): FloodInc[] {
  const w = rainWindow(e);
  return all.filter((i) => TEST_CATS.has(i.cat) && i.prec != null && i.prec <= 300 && i.first >= w.from && i.first <= w.to);
}

export interface Backtest { event: RainEvent; asOf: string; judged: Judged; likelyStreets: number; possibleStreets: number }

/** Replays every past rain with enough reports: the memory from before it, judged on its reports. */
export function backtestAll(g: RoadGraph, ix: GraphIndex, all: FloodInc[], events: RainEvent[], opts: Omit<MemoryOpts, "asOf"> = {}, draws = 400): Backtest[] {
  const out: Backtest[] = [];
  for (const ev of events) {
    const reports = rainReports(all, ev);
    if (reports.length < MIN_TESTED) continue;
    const asOf = replayAsOf(ev);
    const mem = buildMemory(g, ix, all, events, { ...opts, asOf });
    if (!mem.events.length) continue;
    out.push({ event: ev, asOf, judged: judge(g, ix, mem, reports, draws), likelyStreets: mem.likely, possibleStreets: mem.possible });
  }
  return out;
}
