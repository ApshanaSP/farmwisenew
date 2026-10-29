/**
 * Rain Rehearsal on the server: loads the road network, the inputs (source.ts) and Ask the Map's world (hospitals,
 * fire stations, schools, rivers, PWD works) once per store build, then computes one rehearsal for a moment: the flood
 * memory, reach of help, choke points, dry schools, the trigger, the plan with its tasks, and (for a replay, or a rain
 * that has come) the check. A moment's result is cached, so the console's polling is cheap.
 */
import { asOf as consoleNow } from "@/lib/collector/intel";
import { world } from "@/lib/map/world";
import type { World } from "@/lib/map/types";
import { edgeShape, flatDistM, indexGraph, loadGraph, MAIN_CLASS_MAX, type GraphIndex, type RoadGraph } from "./graph";
import { buildMemory, rainEvents, rehearsalFactor, streetLabel, type Memory, type RainEvent } from "./memory";
import { SPEED_KMH } from "./paths";
import { chokes as findChokes, drySchools, RELEASE_RIVER, ribbon as ribbonOf } from "./places";
import { plan, type Job } from "./playbook";
import { computeReach, mergeHospitals, nodeWards, T_HELP_MIN, type Facility, type ReachResult } from "./reach";
import { checkRain } from "./report";
import { backtestAll, judge, rainReports, rainWindow, replayAsOf, type Backtest } from "./replay";
import { lakesAt, rehearsalSources, type Sources } from "./source";
import { readTasks, type Task } from "./tasks";
import { trigger } from "./trigger";
import { CFM_BASE, heavyNow, liveRain } from "./cfmlive";
import type { Line, RehearsalState, RJob, RStreet } from "./types";
import { CLASSES } from "./graph";

interface Base {
  key: string;
  g: RoadGraph;
  ix: GraphIndex;
  src: Sources;
  w: World;
  events: RainEvent[];
  facilities: Facility[];
  nw: Uint16Array;
  wardPoint: Map<number, { lat: number; lon: number; name: string }>;
  backtest: Promise<Backtest[]> | null;
  /** a point for a place name (the resolver's own patterns), for stations that publish no coordinates */
  placeOf: (name: string) => { lat: number; lon: number; place: string } | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __rehearsalBase: { key: string; p: Promise<Base> } | undefined;
  // eslint-disable-next-line no-var
  var __rehearsalMoments: Map<string, { at: number; mem: Memory; reach: ReachResult }> | undefined;
}

export class RehearsalUnavailable extends Error {}

/** raised when the way the base is built changes, so a running server rebuilds it */
const ENGINE_VERSION = 3;

async function base(): Promise<Base> {
  const g = loadGraph();
  if (!g) throw new RehearsalUnavailable("The road network has not been built yet (node scripts/build-road-graph.mjs).");
  const [src, { world: w, resolver }] = await Promise.all([rehearsalSources(), world()]);
  const key = `${src.key}|${g.hash}|${g.elev.length}|${w.dataAsOf}|${ENGINE_VERSION}`;
  const cur = global.__rehearsalBase;
  if (cur && cur.key === key) return cur.p;
  const p = (async (): Promise<Base> => {
    const ix = indexGraph(g);
    const events = rainEvents(src.rainDays);
    // hospitals: OSM government hospitals and health centres, joined with the store's hospitals (beds, ambulance)
    const osmH: Facility[] = w.points.hospitals.filter((h) => h.government && (h.kind === "hospital" || h.kind === "health_centre") && h.name)
      .map((h) => ({ id: h.id, kind: "hospital", name: h.name!, name_ta: h.name_ta, lat: h.lat, lon: h.lon, government: true, source: "osm", beds: null, ambulance: null, ward: h.ward }));
    const storeH: Facility[] = (w.conds?.places ?? []).filter((c) => c.kind === "hospital").map((c) => ({
      id: `store:${c.id}`, kind: "hospital", name: c.name, name_ta: null, lat: c.lat, lon: c.lon, government: true, source: "store",
      beds: { total: c.m.total_beds?.v ?? null, occupied: c.m.occupied_beds?.v ?? null, pct: c.m.bed_occupancy_pct?.v ?? null },
      ambulance: c.m.ambulance_available ? c.m.ambulance_available.v >= 1 : null, ward: null
    }));
    const places = w.points.osm_places.filter((p) => p.name);
    const nearPlace = (lat: number, lon: number) => places.reduce<{ n: string | null; d: number }>((m, p) => { const d = flatDistM(lat, lon, p.lat, p.lon); return d < m.d ? { n: p.name, d } : m; }, { n: null, d: 3000 }).n;
    const fire: Facility[] = w.points.fire_stations.map((f) => ({
      id: f.id, kind: "fire", name: f.name ?? (nearPlace(f.lat, f.lon) ? `Fire station, ${nearPlace(f.lat, f.lon)}` : "Fire station"), name_ta: f.name_ta, lat: f.lat, lon: f.lon,
      government: true, source: "osm", beds: null, ambulance: null, ward: f.ward
    }));
    const facilities = [...mergeHospitals(osmH, storeH), ...fire];
    const wardPoint = new Map(w.wards.map((x) => [x.ward, { lat: x.lat, lon: x.lon, name: x.zoneName }]));
    const named = resolver.entries.filter((e) => e.lat != null && e.lon != null && (e.kind === "locality" || e.kind === "osm_place" || e.kind === "facility"))
      .sort((a, c) => (a.kind === "locality" ? 0 : a.kind === "osm_place" ? 1 : 2) - (c.kind === "locality" ? 0 : c.kind === "osm_place" ? 1 : 2));
    const placeOf = (name: string) => {
      const n = name.replace(/\b(aws|isro|lab|amfu|anaicut|lake|port)\b/gi, " ").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
      // the place must carry the station's first word ("Thervoy Kandigai" is not "Kandigai")
      const first = n.split(" ")[0].toLowerCase();
      const e = named.find((x) => x.res.some((re) => re.test(n)) && x.name_en.toLowerCase().includes(first));
      return e ? { lat: e.lat!, lon: e.lon!, place: e.name_en } : null;
    };
    return { key, g, ix, src, w, events, facilities, nw: nodeWards(g), wardPoint, backtest: null, placeOf };
  })();
  global.__rehearsalBase = { key, p };
  global.__rehearsalMoments = new Map();
  p.catch(() => { if (global.__rehearsalBase?.p === p) global.__rehearsalBase = undefined; });
  return p;
}

/** memory and reach for one moment, cached (the six most recent moments) */
function moment(b: Base, asOf: string, tHelp: number): { at: number; mem: Memory; reach: ReachResult } {
  const k = `${asOf}|${tHelp}`;
  const cache = (global.__rehearsalMoments ??= new Map<string, { at: number; mem: Memory; reach: ReachResult }>());
  const hit = cache.get(k);
  if (hit) return hit;
  const mem = buildMemory(b.g, b.ix, b.src.incidents, b.events, { asOf });
  const reach = computeReach(b.g, b.ix, b.facilities, rehearsalFactor(mem), tHelp);
  const v = { at: Date.now(), mem, reach };
  cache.set(k, v);
  if (cache.size > 6) cache.delete([...cache.entries()].sort((a, c) => a[1].at - c[1].at)[0][0]);
  return v;
}

export interface StateOpts { replay?: string | null; manual?: boolean; tHelp?: number }

const lineOf = (g: RoadGraph, edges: number[]): Line[] => edges.map((e) => edgeShape(g, e));
/** joins a route's pieces into one line */
const joinLine = (g: RoadGraph, edges: number[]): Line => {
  const out: Line = [];
  for (const l of lineOf(g, edges)) {
    if (out.length) {
      const last = out[out.length - 1];
      const d0 = Math.abs(l[0][0] - last[0]) + Math.abs(l[0][1] - last[1]), d1 = Math.abs(l[l.length - 1][0] - last[0]) + Math.abs(l[l.length - 1][1] - last[1]);
      out.push(...(d1 < d0 ? [...l].reverse() : l).slice(1));
    } else out.push(...l);
  }
  return out;
};

export async function rehearsalState(o: StateOpts = {}): Promise<RehearsalState> {
  const t0 = Date.now();
  const b = await base();
  const now = await consoleNow();
  const tHelp = o.tHelp && [5, 10, 15].includes(o.tHelp) ? o.tHelp : T_HELP_MIN;
  const ev = o.replay ? b.events.find((e) => e.id === o.replay) ?? null : null;
  if (o.replay && !ev) throw new RehearsalUnavailable("No such rain in the record.");
  // a live moment: the console's now, to the minute (so polling within a minute reuses the cache)
  const asOf = ev ? replayAsOf(ev) : now.slice(0, 16) + ":00";
  const live = !ev;
  const { g, ix } = b;
  // the memory and the reach of help change with the data, which is collected hourly: one computation per hour
  // (the countdown, the trigger and the tasks still use the minute)
  const memAt = ev ? asOf : asOf.slice(0, 13) + ":00:00";
  const { mem, reach } = moment(b, memAt, tHelp);

  // ---- choke points, works, dry schools, water
  const chokes = findChokes(g, ix, mem, b.src.incidents, live);
  const works = (b.w.conds?.works ?? []);
  const dry = drySchools(g, ix, mem, b.w.points.schools, reach.hospRain);
  const lakes = lakesAt(b.src.lakes, asOf);
  const gauges = b.src.gauges.filter((x) => x.at <= asOf);
  const releases = b.src.releases.filter((r) => r.at <= asOf);
  const rain = live ? await Promise.race([liveRain(), new Promise<null>((r) => setTimeout(() => r(null), 8000))]).catch(() => null) : null;
  const trig = trigger({ asOf, warnings: b.src.warnings, gauges, releases, bulletins: b.src.bulletins, lakes, manual: !!o.manual, rainAt: ev ? `${ev.start} 00:00:00` : null,
    rainNow: rain ? heavyNow(rain.stations) : null });
  const rel = releases.find((r) => r.discharge > 0 && RELEASE_RIVER[r.id]);
  const riverLines = rel ? b.w.lines.waterways.filter((l) => RELEASE_RIVER[rel.id].test(l.name)) : [];
  const rb = rel && riverLines.length ? ribbonOf(g, riverLines) : null;
  const ribbon = rel && rb ? { river: riverLines[0].name, reservoir: rel.name, wards: rb.wards, lines: rb.lines.map((l) => l.map(([a, c]) => [Math.round(a * 1e5) / 1e5, Math.round(c * 1e5) / 1e5] as [number, number])) } : null;

  // ---- the plan, and the tasks already sent for this rehearsal
  const fac = new Map(b.facilities.map((f) => [f.id, f]));
  const isMain = (s: { edges: number[] }) => s.edges.some((e) => g.cls[e] <= MAIN_CLASS_MAX);
  const fires = b.facilities.filter((f) => f.kind === "fire");
  const jobs: Job[] = plan({
    asOf, level: trig.level, rainAt: trig.rainAt, streets: mem.streets, chokes, works, facilities: b.facilities, reach: reach.facilities, wards: reach.wards,
    wardPoint: b.wardPoint, dry, ribbon: ribbon ? { river: ribbon.river, reservoir: ribbon.reservoir, wards: ribbon.wards } : null, mainStreet: isMain,
    fireFor: (ward) => { const p = b.wardPoint.get(ward); if (!p || !fires.length) return null; const f = fires.reduce((m, x) => (flatDistM(p.lat, p.lon, x.lat, x.lon) < flatDistM(p.lat, p.lon, m.lat, m.lon) ? x : m)); return { name: f.name, lat: f.lat, lon: f.lon }; }
  });
  // a rehearsal is named by its rain day; a manual one keeps the newest manual rehearsal of the last 3 days that has
  // tasks, so jobs sent yesterday still count today
  const manualOnly = trig.manual && !trig.reasons.some((r) => r.kind !== "manual");
  let rid = ev ? `replay-${ev.start}` : `R-${(trig.rainAt ?? asOf).slice(0, 10)}${manualOnly ? "-m" : ""}`;
  if (live && manualOnly) {
    const since = new Date(Date.parse(asOf.replace(" ", "T") + "Z") - 3 * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
    const recent = (await readTasks().catch(() => [] as Task[])).filter((x) => x.rehearsal.endsWith("-m") && x.createdAt >= since).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (recent.length) rid = recent[0].rehearsal;
  }
  const tasks: Task[] = live ? await readTasks({ rehearsal: rid }).catch(() => []) : [];
  const taskBy = new Map(tasks.map((t) => [t.key, t]));
  const deptName = (c: string) => b.w.depts.get(c)?.name ?? c;
  const rjobs: RJob[] = jobs.map((j) => {
    const t = taskBy.get(j.key);
    return { ...j, deptName: deptName(j.dept), task: t ? { id: t.id, status: t.status, doneAt: t.doneAt, photo: t.photo, photoM: t.photoM } : null };
  });
  // jobs sent earlier that the plan no longer has (the complaint was closed, say) still count as tasks
  for (const t of tasks) if (!jobs.some((j) => j.key === t.key))
    rjobs.push({ key: t.key, kind: t.key.split(":")[0], dept: t.dept, deptName: deptName(t.dept), en: t.text, ta: t.text, why: "Sent earlier", place: t.text, lat: t.lat, lon: t.lon, ward: t.ward,
      incident: t.incident, due: t.due, task: { id: t.id, status: t.status, doneAt: t.doneAt, photo: t.photo, photoM: t.photoM } });
  const depts = [...new Set(rjobs.map((j) => j.dept))].map((code) => {
    const mine = rjobs.filter((j) => j.dept === code);
    return { code, name: deptName(code), jobs: mine.length, done: mine.filter((j) => j.task?.status === "done").length, late: mine.filter((j) => j.task?.status === "late").length };
  }).sort((a, c) => c.jobs - a.jobs || a.code.localeCompare(c.code));

  // ---- the check: a replay's rain, or a rain whose window holds now
  const checkEv = ev ?? b.events.find((e) => { const w = rainWindow(e); return w.from <= asOf && asOf <= w.to; }) ?? null;
  let check: RehearsalState["check"] = null;
  const flooded = new Map<string, boolean>();
  if (checkEv) {
    const reports = rainReports(b.src.incidents, checkEv).filter((r) => !live || r.first <= asOf);
    const c = checkRain(g, ix, mem, reports);
    for (const s of c.streets) flooded.set(s.key, s.flooded);
    const j = ev ? judge(g, ix, mem, reports, 300) : null;
    check = { event: { id: checkEv.id, start: checkEv.start, end: checkEv.end }, reports: c.reports.map((r) => ({ ...r, lat: Math.round(r.lat * 1e5) / 1e5, lon: Math.round(r.lon * 1e5) / 1e5 })),
      onPredicted: c.onPredicted, missed: c.missed, flooded: c.flooded, quiet: c.quiet, lift: j?.lift ?? null, randomShare: j ? j.random.median : null, share: j && j.tested ? j.covered / j.tested : null };
  }
  // ---- learn: the memory once the rain's reports are in (a replay, or a rain that has ended)
  let learn: RehearsalState["learn"] = null;
  if (checkEv) {
    const after = `${new Date(Date.parse(checkEv.end + "T00:00:00Z") + 3 * 86_400_000).toISOString().slice(0, 10)} 09:00:00`;
    if (after <= now) {
      const m2 = buildMemory(g, ix, b.src.incidents, b.events, { asOf: after });
      const changed = m2.streets.filter((s) => s.edges.some((e) => m2.tier[e] > mem.tier[e]));
      learn = { asOf: after, added: changed.filter((s) => s.edges.every((e) => mem.tier[e] === 0)).length, upgraded: changed.filter((s) => s.edges.some((e) => mem.tier[e] > 0)).length,
        likely: m2.likely, possible: m2.possible,
        streets: changed.slice(0, 120).map((s) => ({ key: s.key, label: streetLabel(s), tier: s.tier, lat: Math.round(s.lat * 1e5) / 1e5, lon: Math.round(s.lon * 1e5) / 1e5, lines: lineOf(g, s.edges), isNew: s.edges.every((e) => mem.tier[e] === 0) })) };
    }
  }

  // ---- streets for the map
  const chokeCount = new Map<string, number>();
  for (const c of chokes) chokeCount.set(c.street, (chokeCount.get(c.street) ?? 0) + 1);
  const lateWorks = works.filter((w) => (w.gap != null && w.gap < -10) || (!!w.target && w.target < asOf.slice(0, 10)));
  const streets: RStreet[] = mem.streets.map((s) => ({
    key: s.key, name: s.name, name_ta: s.name_ta, near: s.near, label: streetLabel(s), label_ta: streetLabel(s, "ta"), ward: s.ward, tier: s.tier, rains: s.rains, rainDates: s.rainDates,
    rainIncidents: s.rainIncidents, otherIncidents: s.otherIncidents, lastFlood: s.lastFlood, length_m: s.length_m, lat: Math.round(s.lat * 1e5) / 1e5, lon: Math.round(s.lon * 1e5) / 1e5,
    water_m: s.water_m, main: isMain(s), incidents: s.incidents, lines: lineOf(g, s.edges), chokes: chokeCount.get(s.key) ?? 0,
    low_m: g.relElev.length ? Math.round(Math.min(...s.edges.map((e) => g.relElev[e])) * 10) / 10 : null,
    lateWork: lateWorks.find((w) => flatDistM(s.lat, s.lon, w.lat, w.lon) <= 300)?.title ?? null, ...(flooded.size ? { flooded: flooded.get(s.key) ?? false } : {})
  }));

  // ---- facilities, wards
  const facilities = b.facilities.map((f) => {
    const r = reach.facilities.find((x) => x.id === f.id);
    const d = r?.detour;
    return {
      id: f.id, kind: f.kind, name: f.name, name_ta: f.name_ta, lat: f.lat, lon: f.lon, government: f.government, beds: f.beds, ambulance: f.ambulance,
      ward: f.ward ?? (r ? b.nw[r.node] || null : null), routed: !!r, normalKm: r?.normalKm ?? 0, rehearsalKm: r?.rehearsalKm ?? 0, normalWards: r?.normalWards ?? 0,
      rehearsalWards: r?.rehearsalWards ?? 0, cutOff: !!r?.cutOff, why: r?.why ?? null,
      detour: d ? {
        to: d.to,
        normal: d.normal ? { min: Math.max(1, Math.round(d.normal.sec / 60)), names: d.normal.names, line: joinLine(g, d.normal.edges) } : null,
        rehearsal: d.rehearsal ? { min: Math.max(1, Math.round(d.rehearsal.sec / 60)), names: d.rehearsal.names, line: joinLine(g, d.rehearsal.edges) } : null
      } : null
    };
  });
  void fac;
  const wards = reach.wards.map((x) => ({ ...x, zone: b.w.wards.find((y) => y.ward === x.ward)?.zone ?? null, name: b.wardPoint.get(x.ward)?.name ?? "" }));

  // ---- the record of past rains, and how the memory did on each (computed once per build)
  b.backtest ??= Promise.resolve().then(() => backtestAll(g, ix, b.src.incidents, b.events, {}, 200));
  const bt = await b.backtest;
  const meta = g.meta as Record<string, any>;
  const km = Math.round([...g.len].reduce((s, x) => s + x, 0) / 1000);

  return {
    asOf, now, mode: ev ? "replay" : "live", rehearsal: rid, replay: ev ? { id: ev.id, start: ev.start, end: ev.end, maxMm: ev.maxMm } : null,
    trigger: trig,
    counts: {
      likely: mem.likely, possible: mem.possible, chokes: chokes.length, hospitalsCut: facilities.filter((f) => f.kind === "hospital" && f.cutOff).length,
      fireCut: facilities.filter((f) => f.kind === "fire" && f.cutOff).length, wardsLoseFire: wards.filter((x) => x.loses.includes("fire")).length,
      wardsLoseHospital: wards.filter((x) => x.loses.includes("hospital")).length, dry: dry.length, jobs: rjobs.length, tasks: tasks.length,
      done: tasks.filter((t) => t.status === "done").length, late: tasks.filter((t) => t.status === "late").length
    },
    streets, chokes: chokes.map((c) => ({ id: c.id, cat: c.cat, title: c.title, place: c.place, lat: c.lat, lon: c.lon, dept: c.dept, ward: c.ward, street: c.street, tier: c.tier, ageDays: c.ageDays, breached: c.breached })),
    facilities, wards, dry, lakes, gauges: gauges.map((x) => ({ id: x.id, name: x.name, lat: x.lat, lon: x.lon, at: x.at, level: x.level, warning: x.warning, danger: x.danger,
      gap: x.warning != null ? Math.round((x.warning - x.level) * 100) / 100 : null, suspect: /suspect/i.test(x.quality) })),
    releases: releases.map((r) => ({ id: r.id, name: r.name, at: r.at, discharge: r.discharge, unit: r.unit })), ribbon,
    bulletins: b.src.bulletins.filter((x) => x.date && x.date <= asOf.slice(0, 10)).sort((a, c) => c.date.localeCompare(a.date) || Number(c.id) - Number(a.id)).slice(0, 6)
      .map((x) => ({ ...x, url: `${CFM_BASE}/HomePage/DownloadImagesFromBulletin/${encodeURIComponent(x.id)}` })),
    rain: rain ? { fetchedAt: rain.fetchedAt, error: rain.error, source: rain.source, stations: rain.stations.map((st) => { const p = b.placeOf(st.name); return { ...st, lat: p?.lat ?? null, lon: p?.lon ?? null, place: p?.place ?? null }; }) } : null,
    jobs: rjobs, depts, check, learn,
    rains: b.events.map((e) => ({ id: e.id, start: e.start, end: e.end, sources: e.sources, maxMm: e.maxMm, reports: rainReports(b.src.incidents, e).length })),
    backtest: bt.map((x) => ({
      event: { id: x.event.id, start: x.event.start, end: x.event.end, sources: x.event.sources, maxMm: x.event.maxMm }, asOf: x.asOf, tested: x.judged.tested, covered: x.judged.covered,
      coveredLikely: x.judged.coveredLikely, share: x.judged.tested ? x.judged.covered / x.judged.tested : 0, randomShare: x.judged.random.median, randomLo: x.judged.random.lo,
      randomHi: x.judged.random.hi, lift: x.judged.lift, km: Math.round(x.judged.km * 10) / 10, likelyStreets: x.likelyStreets, possibleStreets: x.possibleStreets
    })),
    method: {
      incidentsUsed: mem.used, events: mem.events.length, tHelpMin: tHelp, speeds: Object.fromEntries(CLASSES.map((c, k) => [c, SPEED_KMH[k]])),
      roads: { km, junctions: g.n, pieces: g.m, osmBase: meta.osm_base ?? null }, notes: b.src.notes,
      facilities: { hospitals: b.facilities.filter((f) => f.kind === "hospital").length, fire: b.facilities.filter((f) => f.kind === "fire").length, unrouted: reach.unrouted.length }
    },
    ms: Date.now() - t0
  };
}

/** the server's own plan for a rehearsal (Send tasks never trusts the browser's list) */
export async function planFor(o: StateOpts): Promise<{ rid: string; jobs: Job[]; headline: string; deptName: (c: string) => string; trigger: RehearsalState["trigger"] }> {
  const s = await rehearsalState(o);
  const b = await base();
  const jobs: Job[] = s.jobs.filter((j) => !j.task).map((j) => ({ key: j.key, kind: j.kind as Job["kind"], dept: j.dept, en: j.en, ta: j.ta, why: j.why, place: j.place, lat: j.lat, lon: j.lon, ward: j.ward, incident: j.incident, due: j.due, rank: 0 }));
  const r0 = s.trigger.reasons[0];
  const headline = r0 && r0.kind !== "manual" ? `${r0.en}.` : "The Collector is rehearsing a heavy rain.";
  return { rid: s.rehearsal, jobs, headline, deptName: (c) => b.w.depts.get(c)?.name ?? c, trigger: s.trigger };
}

/** a facility's 10-minute reach on normal and rehearsal roads, for the map when it is tapped */
export async function facilityReach(id: string, o: StateOpts): Promise<{ kept: Line[]; lost: Line[] } | null> {
  const b = await base();
  const f = b.facilities.find((x) => x.id === id);
  if (!f) return null;
  const ev = o.replay ? b.events.find((e) => e.id === o.replay) ?? null : null;
  const now = await consoleNow();
  const asOf = ev ? replayAsOf(ev) : now.slice(0, 13) + ":00:00";
  const tHelp = o.tHelp && [5, 10, 15].includes(o.tHelp) ? o.tHelp : T_HELP_MIN;
  const { mem, reach } = moment(b, asOf, tHelp);
  const r = reach.facilities.find((x) => x.id === id);
  if (!r) return null;
  const { facilityReachEdges } = await import("./reach");
  const { kept, lost } = facilityReachEdges(b.g, r.node, rehearsalFactor(mem), tHelp);
  return { kept: lineOf(b.g, kept), lost: lineOf(b.g, lost) };
}

/** a route on normal or rehearsal roads between two points */
export async function routeBetween(a: { lat: number; lon: number }, z: { lat: number; lon: number }, state: "normal" | "rehearsal", o: StateOpts) {
  const b = await base();
  const { nearestNode } = await import("./graph");
  const { route, routeNames } = await import("./paths");
  const u = nearestNode(b.g, b.ix, a.lat, a.lon, 600), v = nearestNode(b.g, b.ix, z.lat, z.lon, 600);
  if (u < 0 || v < 0) return null;
  let factor: Float32Array | undefined;
  if (state === "rehearsal") {
    const ev = o.replay ? b.events.find((e) => e.id === o.replay) ?? null : null;
    const now = await consoleNow();
    const asOf = ev ? replayAsOf(ev) : now.slice(0, 13) + ":00:00";
    factor = rehearsalFactor(moment(b, asOf, T_HELP_MIN).mem);
  }
  const r = route(b.g, u, v, { factor });
  if (!r) return { reachable: false as const };
  return { reachable: true as const, min: Math.max(1, Math.round(r.sec / 60)), km: Math.round(r.m / 100) / 10, names: routeNames(b.g, r.edges, 6), line: joinLine(b.g, r.edges) };
}
