/**
 * Runs a checked Plan over a World. Pure and deterministic: the same plan on the same store gives the same output,
 * byte for byte (rows sort by priority, then newest first, then id). Every step returns its features, its count and a
 * line for "How this was worked out" in English and Tamil.
 *
 * Membership rules (so the map agrees with the Overview):
 * - inside a ward, zone or taluk: the record's ward_no / zone_no / taluk_code, the console's own rule;
 * - near a point, along a line, inside a drawn circle: the incident's point, and only when it is exact enough to pin
 *   (PIN_PRECISION_M); the others are counted in the trace as "left out: no exact place".
 */
import { GridIndex, M_PER_DEG_LAT, CHENNAI_LAT, distToLineM, expandBboxM, haversineM, inBbox, mPerDegLon, pointInPolygon, type LatLon, type Pair } from "./geom";
import type { AreaRef, Filter, Period, Plan, Step } from "./plan";
import type { Hotspot, Inc, LayerId, LineFeat, PointFeat, PolyFeat, World } from "./types";
import { CAT_TA, FAMILY_WORD, LAYER_WORD, SEV_WORD, STATUS_WORD, isTa, nOf, periodWords, type Lang } from "./words";
import { fmtDistance } from "./geom";

// ------------------------------------------------------------- results --

export interface Near { id: string; name: string | null; name_ta: string | null; layer: LayerId; m: number; lat: number; lon: number }
export interface Hit { inc: Inc; near: Near | null }
export interface Place { ref: string; name: string; name_ta: string | null; lat: number; lon: number; kind: string }
export interface Group { key: string; label: string; label_ta: string; n: number; lat: number; lon: number; ids: string[] }
export interface Cluster { id: string; n: number; lat: number; lon: number; ids: string[]; wards: number[]; place: string | null; open: number }
export interface AreaScore { key: string; label: string; label_ta: string; p90: number; worst: { lat: number; lon: number; m: number; to: Near | null }; lat: number; lon: number }
export interface AreaCount { ref: AreaRef; label: string; label_ta: string; n: number; ids: string[] }

export type Coll =
  | { type: "incidents"; hits: Hit[] }
  | { type: "points"; layer: LayerId; items: PointFeat[] }
  | { type: "lines"; layer: LayerId; items: LineFeat[] }
  | { type: "polys"; layer: LayerId; items: PolyFeat[] }
  | { type: "nearest"; origin: Place | null; layer: LayerId; pairs: { hit: Hit | null; to: Near[] }[]; hits: Hit[] }
  | { type: "areas"; by: "ward" | "zone"; from: LayerId; areas: AreaScore[]; best: AreaScore | null; beyond: number | null }
  | { type: "groups"; by: "ward" | "zone" | "taluk" | "hex500"; groups: Group[]; hits: Hit[]; unassigned: string[] }
  | { type: "hotspots"; method: "stored" | "dbscan"; clusters: Cluster[]; hotWards: { ward: number; z: number; n: number }[]; hits: Hit[] }
  | { type: "compare"; a: AreaCount; b: AreaCount; hits: Hit[] }
  | { type: "change"; now: { period: Period; hits: Hit[] }; before: { period: Period; hits: Hit[] }; hits: Hit[] };

export interface StepOut { as: string; op: Step["op"]; count: number; note_en: string; note_ta: string; layer: LayerId | null; ids: string[] }
export interface RunResult {
  steps: StepOut[];
  show: Coll;
  /** the incidents behind the answer (for the list, the pins and the counts) */
  hits: Hit[];
  /** facilities, lines and areas the answer used, for the map's context layers */
  context: { points: PointFeat[]; lines: { feat: LineFeat; meters: number }[]; polys: PolyFeat[]; areas: AreaRef[]; places: Place[] };
  /** non-pinnable incidents a point rule left out, by step */
  leftOut: number;
  /** the officer lock was applied and a different department had been asked for */
  lockNote: boolean;
}

/** What the executor needs besides the World: places and drawn shapes resolved by the resolver (resolve.ts). */
export interface Ctx {
  place(ref: string): Place | null;
  lang: Lang;
}

export class PlanError extends Error {}

const SEV_ORDER = { Severe: 0, High: 1, Medium: 2, Low: 3 } as const;
/** priority first, then newest, then id: the order of every list */
export function byPriority(a: Hit, b: Hit): number {
  return b.inc.priority - a.inc.priority || (a.inc.first < b.inc.first ? 1 : a.inc.first > b.inc.first ? -1 : 0) || (a.inc.id < b.inc.id ? -1 : a.inc.id > b.inc.id ? 1 : 0);
}

// -------------------------------------------------------------- time --

/** IST wall clock "YYYY-MM-DD HH:MM:SS" plus `hours` (may be negative). */
export function shiftWall(wall: string, hours: number): string {
  const t = Date.parse(wall.replace(" ", "T") + "Z") + hours * 3600_000;
  return new Date(t).toISOString().slice(0, 19).replace("T", " ");
}

/** A period as (from, to]: the console's own window (periodWindow in intel.ts), ending at `now`. */
export function periodRange(p: Period, now: string): { from: string; to: string; fromOpen: boolean } {
  if (p.kind === "last_days") return { from: shiftWall(now, -24 * p.days * (p.offset + 1)), to: shiftWall(now, -24 * p.days * p.offset), fromOpen: true };
  if (p.kind === "month") {
    const y = Number(now.slice(0, 4)), m = Number(now.slice(5, 7)) - 1 - p.offset;
    const start = new Date(Date.UTC(y, m, 1)), end = new Date(Date.UTC(y, m + 1, 1));
    const f = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
    return { from: f(start), to: shiftWall(f(end), -1 / 3600), fromOpen: false };
  }
  return { from: p.from.length === 10 ? `${p.from} 00:00:00` : p.from, to: p.to.length === 10 ? `${p.to} 23:59:59` : p.to, fromOpen: false };
}

// ------------------------------------------------------------ filters --

export function matches(i: Inc, f: Filter | null, now: string): boolean {
  if (!f) return true;
  if (f.category?.length && !f.category.includes(i.cat)) return false;
  if (f.family?.length && !f.family.includes(i.family)) return false;
  if (f.severity?.length && !f.severity.includes(i.sev)) return false;
  // "open" is what the console's Open incidents list and Ongoing tile count: open, and not already routed to a department
  if (f.status === "open" && (!i.open || i.routed)) return false;
  if (f.status === "closed" && i.open) return false;
  if (f.dept?.length && !f.dept.includes(i.dept)) return false;
  if (f.overdue === true && !i.breached) return false;
  if (f.overdue === false && i.breached) return false;
  if (f.citizen === true && !(i.citizen > 0)) return false;
  if (f.citizen === false && i.citizen > 0) return false;
  if (f.period) {
    const r = periodRange(f.period, now);
    if (r.fromOpen ? !(i.first > r.from) : !(i.first >= r.from)) return false;
    if (!(i.first <= r.to)) return false;
  }
  if (f.text) {
    const t = normText(f.text);
    if (!normText(`${i.place ?? ""} ${i.title}`).includes(t)) return false;
  }
  return true;
}
export const normText = (s: string) => s.toLowerCase().normalize("NFC").replace(/[.,'’()\-_/]/g, " ").replace(/\s+/g, " ").trim()
  .replace(/\brd\b/g, "road").replace(/\bst\b/g, "street");

/** "open severe Flooding & waterlogging incidents, last 30 days" */
export function filterWords(f: Filter | null, w: World, lang: Lang): string {
  const ta = isTa(lang);
  const parts: string[] = [];
  if (!f) return ta ? "அனைத்து சம்பவங்கள்" : "all incidents";
  if (f.status !== "any") parts.push(STATUS_WORD[f.status][ta ? "ta" : "en"]);
  if (f.severity?.length) parts.push(f.severity.map((s) => SEV_WORD[s as keyof typeof SEV_WORD][ta ? "ta" : "en"]).join(ta ? " / " : " or "));
  const what = f.category?.length
    ? f.category.map((c) => (ta ? CAT_TA[c] ?? c : w.cats.get(c)?.label ?? c)).join(ta ? ", " : ", ")
    : f.family?.length ? f.family.map((x) => FAMILY_WORD[x]?.[ta ? "ta" : "en"] ?? x).join(", ") : "";
  if (what) parts.push(what);
  parts.push(f.citizen ? (ta ? "குடிமக்கள் புகார்கள்" : "citizen complaints") : ta ? "சம்பவங்கள்" : "incidents");
  const tail: string[] = [];
  if (f.overdue) tail.push(ta ? "காலக்கெடு தாண்டியவை" : "past their deadline");
  if (f.dept?.length) tail.push(f.dept.map((d) => w.depts.get(d)?.name ?? d).join(", ") + (ta ? " மட்டும்" : " only"));
  if (f.period) tail.push(periodWords(f.period, lang));
  if (f.text) tail.push(ta ? `"${f.text}" எனக் குறிப்பிடும்` : `naming "${f.text}"`);
  return [parts.join(" "), ...tail].join(", ");
}

// --------------------------------------------------------------- areas --

export function areaLabel(a: AreaRef, w: World, ctx: Ctx): { en: string; ta: string } {
  if (a.kind === "ward") return { en: `Ward ${a.id}`, ta: `வார்டு ${a.id}` };
  if (a.kind === "zone") {
    const z = w.zones.find((x) => x.zone === a.id);
    return { en: z ? `${z.name} (Zone ${a.id})` : `Zone ${a.id}`, ta: z ? `${z.name} (மண்டலம் ${a.id})` : `மண்டலம் ${a.id}` };
  }
  if (a.kind === "taluk") {
    const t = w.taluks.find((x) => x.code === a.code);
    return { en: `${t?.name ?? a.code} taluk`, ta: `${t?.name_ta ?? t?.name ?? a.code} வட்டம்` };
  }
  const p = a.kind === "point" ? ctx.place(a.ref) : ctx.place(`drawn:${a.id}`);
  const r = a.kind === "point" ? a.radius_m : drawnRadius(a.id) ?? 0;
  if (!p) return { en: "the chosen place", ta: "தேர்ந்த இடம்" };
  return { en: `within ${fmtDistance(r)} of ${p.name}`, ta: `${p.name_ta ?? p.name} இலிருந்து ${fmtDistance(r, "ta")} க்குள்` };
}

/** A drawn circle's id is "lat,lon,radius" (the map's circle tool and right-click). */
export function drawnRadius(id: string): number | null {
  const r = Number(id.split(",")[2]);
  return Number.isFinite(r) && r > 0 ? r : null;
}

/** Is this incident inside the area, by the membership rule for the area's kind? */
function inArea(i: Inc, a: AreaRef, w: World, ctx: Ctx): boolean {
  if (a.kind === "ward") return i.ward === a.id;
  if (a.kind === "zone") return i.zone === a.id;
  if (a.kind === "taluk") return i.taluk === a.code;
  if (!i.pinnable) return false;
  const p = a.kind === "point" ? ctx.place(a.ref) : ctx.place(`drawn:${a.id}`);
  const r = a.kind === "point" ? a.radius_m : drawnRadius(a.id);
  if (!p || r == null) throw new PlanError("The place in the question could not be found on the map.");
  return haversineM(i, p) <= r;
}
const byRecord = (a: AreaRef) => a.kind === "ward" || a.kind === "zone" || a.kind === "taluk";

// ------------------------------------------------------------ helpers --

function pointLayer(w: World, layer: LayerId): PointFeat[] | null {
  return (w.points as Record<string, PointFeat[]>)[layer] ?? null;
}

/** Nearest facility to p among point, polygon and line collections, within `max` metres (Infinity = any). */
function nearestIn(p: LatLon, sets: Coll[], idx: Map<Coll, GridIndex<PointFeat>>, max: number): Near | null {
  let best: Near | null = null;
  for (const s of sets) {
    if (s.type === "points") {
      const g = idx.get(s)!;
      const r = Number.isFinite(max) ? g.within(p, max)[0] : g.nearest(p, 1)[0];
      if (r && (!best || r.m < best.m)) best = { id: r.item.id, name: r.item.name, name_ta: r.item.name_ta, layer: s.layer, m: r.m, lat: r.item.lat, lon: r.item.lon };
    } else if (s.type === "polys") {
      for (const f of s.items) {
        if (Number.isFinite(max) && !inBbox(p, expandBboxM(f.bbox, max))) continue;
        const inside = pointInPolygon(p, f.polys);
        const d = inside ? { m: 0, at: { lat: p.lat, lon: p.lon } } : f.polys.reduce((b, poly) => {
          const x = distToLineM(p, poly[0]);
          return x.m < b.m ? x : b;
        }, { m: Infinity, at: null as LatLon | null });
        if (d.m <= max && (!best || d.m < best.m)) best = { id: f.id, name: f.name, name_ta: f.name_ta, layer: s.layer, m: d.m, lat: d.at?.lat ?? f.lat, lon: d.at?.lon ?? f.lon };
      }
    } else if (s.type === "lines") {
      for (const f of s.items) {
        if (Number.isFinite(max) && !inBbox(p, expandBboxM(f.bbox, max))) continue;
        const d = distToLineM(p, f.lines);
        if (d.m <= max && (!best || d.m < best.m)) best = { id: f.id, name: f.name, name_ta: f.name_ta, layer: s.layer, m: d.m, lat: d.at?.lat ?? 0, lon: d.at?.lon ?? 0 };
      }
    }
  }
  return best;
}

const hitsOf = (c: Coll): Hit[] | null => ("hits" in c ? c.hits : null);
const layerOf = (c: Coll): LayerId | null => (c.type === "points" || c.type === "lines" || c.type === "polys" ? c.layer : c.type === "nearest" ? c.layer : "hits" in c ? "incidents" : null);
const countOf = (c: Coll): number =>
  c.type === "points" || c.type === "lines" || c.type === "polys" ? c.items.length
    : c.type === "areas" ? (c.beyond != null ? c.areas.length : c.areas.length)
      : c.type === "groups" ? c.groups.length
        : c.type === "hotspots" ? c.clusters.length
          : c.hits.length;
const idsOf = (c: Coll): string[] =>
  c.type === "points" || c.type === "lines" || c.type === "polys" ? c.items.map((x) => x.id)
    : c.type === "areas" ? c.areas.map((a) => a.key)
      : c.hits.map((h) => h.inc.id);

// ---------------------------------------------------------- algorithms --

/** DBSCAN on incident points (haversine, eps metres, min points counting the point itself), as the pipeline runs it. */
export function dbscan(hits: Hit[], eps = 250, min = 3): Hit[][] {
  const pts = hits.filter((h) => h.inc.pinnable).map((h, k) => ({ lat: h.inc.lat, lon: h.inc.lon, k, h }));
  const idx = new GridIndex(pts);
  const label = new Int32Array(pts.length).fill(-2); // -2 unvisited, -1 noise
  let c = 0;
  for (let i = 0; i < pts.length; i++) {
    if (label[i] !== -2) continue;
    const nb = idx.within(pts[i], eps);
    if (nb.length < min) { label[i] = -1; continue; }
    label[i] = c;
    const queue = nb.map((x) => x.item.k);
    for (let q = 0; q < queue.length; q++) {
      const j = queue[q];
      if (label[j] === -1) label[j] = c;
      if (label[j] !== -2) continue;
      label[j] = c;
      const nb2 = idx.within(pts[j], eps);
      if (nb2.length >= min) for (const x of nb2) queue.push(x.item.k);
    }
    c++;
  }
  const out: Hit[][] = Array.from({ length: c }, () => []);
  pts.forEach((p, i) => { if (label[i] >= 0) out[label[i]].push(p.h); });
  return out;
}

/** Getis-Ord Gi* per ward with binary contiguity, self included: the pipeline's formula (analytics.py gi_star), rounded to 2. */
export function giStar(values: Map<number, number>, adj: Map<number, number[]>): Map<number, number> {
  const wards = [...values.keys()];
  const x = wards.map((w) => values.get(w) ?? 0);
  const n = x.length;
  const xbar = x.reduce((s, v) => s + v, 0) / n;
  const s = Math.sqrt(x.reduce((t, v) => t + v * v, 0) / n - xbar * xbar);
  const pos = new Map(wards.map((w, i) => [w, i]));
  const out = new Map<number, number>();
  wards.forEach((w, i) => {
    const nb = [...(adj.get(w) ?? []).filter((j) => pos.has(j)).map((j) => pos.get(j)!), i];
    const wsum = nb.length;
    const num = nb.reduce((t, k) => t + x[k], 0) - xbar * wsum;
    const den = s > 0 ? s * Math.sqrt((n * wsum - wsum * wsum) / (n - 1)) : 1;
    // numpy rounds half to even; at two decimals that differs from Math.round only on exact ties
    out.set(w, den ? Math.round((num / den) * 100) / 100 : 0);
  });
  return out;
}
/** z above this is "more than usual for its neighbours" (two-sided 95 %, as the pipeline's hot_ward) */
export const GI_HOT = 1.959964;

/** A 500 m hexagon's key and centre for a point (pointy-top, axial coordinates on a local flat projection). */
export function hex500(p: LatLon): { key: string; lat: number; lon: number } {
  const size = 500 / Math.sqrt(3); // flat-to-flat 500 m
  const kx = mPerDegLon(CHENNAI_LAT);
  const x = p.lon * kx, y = p.lat * M_PER_DEG_LAT;
  const qf = ((Math.sqrt(3) / 3) * x - y / 3) / size, rf = ((2 / 3) * y) / size;
  let q = Math.round(qf), r = Math.round(rf);
  const sf = -qf - rf, s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  const cx = size * Math.sqrt(3) * (q + r / 2), cy = size * 1.5 * r;
  return { key: `${q},${r}`, lat: cy / M_PER_DEG_LAT, lon: cx / kx };
}

/** Points on a grid inside a ward, for "how far is this ward from a hospital" (never fewer than the centroid). */
function wardGrid(rings: Pair[][], stepM: number, centroid: LatLon): LatLon[] {
  let s = 90, n = -90, wst = 180, e = -180;
  for (const r of rings) for (const [la, lo] of r) { s = Math.min(s, la); n = Math.max(n, la); wst = Math.min(wst, lo); e = Math.max(e, lo); }
  const dLat = stepM / M_PER_DEG_LAT, dLon = stepM / mPerDegLon((s + n) / 2);
  const out: LatLon[] = [];
  for (let la = s + dLat / 2; la < n; la += dLat) for (let lo = wst + dLon / 2; lo < e; lo += dLon) if (pointInPolygon({ lat: la, lon: lo }, rings)) out.push({ lat: la, lon: lo });
  return out.length ? out : [centroid];
}
function pct(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

// ---------------------------------------------------------------- run --

/**
 * Runs the plan. `lockDept` (an officer's department, from the database) is forced into every take of incidents,
 * whatever the plan says.
 */
export function runMapPlan(plan: Plan, w: World, ctx: Ctx, lockDept: string | null = null): RunResult {
  const env = new Map<string, Coll>();
  const idx = new Map<Coll, GridIndex<PointFeat>>();
  const steps: StepOut[] = [];
  const context: RunResult["context"] = { points: [], lines: [], polys: [], areas: [], places: [] };
  let leftOut = 0, lockNote = false;
  const lang = ctx.lang;
  const ta = isTa(lang);
  const need = (name: string): Coll => {
    const c = env.get(name);
    if (!c) throw new PlanError(`No step makes "${name}".`);
    return c;
  };
  const incHits = (name: string): Hit[] => {
    const h = hitsOf(need(name));
    if (!h) throw new PlanError(`"${name}" is not a set of incidents.`);
    return h;
  };
  const note = (en: string, tamil: string) => ({ note_en: en, note_ta: tamil });

  for (const s of plan.steps) {
    let out: Coll;
    let n: { note_en: string; note_ta: string };
    switch (s.op) {
      case "take": {
        if (s.layer === "incidents") {
          let f = s.filter;
          if (lockDept) {
            if (f?.dept?.length && !(f.dept.length === 1 && f.dept[0] === lockDept)) lockNote = true;
            f = { ...(f ?? { category: null, family: null, severity: null, status: "any", overdue: null, citizen: null, period: null, text: null }), dept: [lockDept] };
          }
          const hits = w.incidents.filter((i) => matches(i, f, w.now)).map((inc) => ({ inc, near: null })).sort(byPriority);
          out = { type: "incidents", hits };
          n = note(`Took ${filterWords(f, w, "en")} (${hits.length.toLocaleString("en-IN")}).`, `${filterWords(f, w, "ta")} எடுக்கப்பட்டன (${hits.length.toLocaleString("en-IN")}).`);
        } else if (s.layer === "roads" || s.layer === "waterways") {
          out = { type: "lines", layer: s.layer, items: w.lines[s.layer] };
          n = note(`Took ${LAYER_WORD[s.layer].en} from OpenStreetMap (${out.items.length}).`, `OpenStreetMap இலிருந்து ${LAYER_WORD[s.layer].ta} (${out.items.length}).`);
        } else if (s.layer === "water_bodies") {
          out = { type: "polys", layer: s.layer, items: w.water };
          n = note(`Took lakes and ponds from OpenStreetMap (${w.water.length}).`, `OpenStreetMap இலிருந்து ஏரிகள் & குளங்கள் (${w.water.length}).`);
        } else if (s.layer === "hotspots") {
          throw new PlanError("Hotspots are found with the hotspot step, not taken as a layer.");
        } else {
          const all = pointLayer(w, s.layer) ?? [];
          const kinds = s.where?.kinds;
          const gov = s.where?.government;
          const items = all.filter((p) => (!kinds?.length || kinds.includes(p.kind)) && (gov == null || !!p.government === gov));
          out = { type: "points", layer: s.layer, items };
          idx.set(out, new GridIndex(items));
          const src = w.meta[s.layer]?.source ?? "OpenStreetMap";
          const which = gov ? (ta ? "அரசு " : "government ") : "";
          const kindsWord = kinds?.length ? ` (${kinds.join(", ").replace(/_/g, " ")})` : "";
          n = note(`Took ${which}${LAYER_WORD[s.layer].en}${kindsWord} from ${src} (${items.length}).${gov ? " Government by name or operator." : ""}`,
            `${src} இலிருந்து ${which}${LAYER_WORD[s.layer].ta} (${items.length}).`);
        }
        break;
      }
      case "within": {
        const src = incHits(s.of);
        const sets = s.near.map(need);
        for (const c of sets) if (c.type !== "points" && c.type !== "polys" && c.type !== "lines") throw new PlanError(`"within" needs facilities, roads or water to measure from.`);
        const placed = src.filter((h) => h.inc.pinnable);
        leftOut += src.length - placed.length;
        const hits: Hit[] = [];
        for (const h of placed) {
          const near = nearestIn(h.inc, sets, idx, s.meters);
          if (near) hits.push({ inc: h.inc, near });
        }
        hits.sort(byPriority);
        out = { type: "incidents", hits };
        const used = new Set(hits.map((h) => h.near!.id));
        for (const c of sets) {
          if (c.type === "points") context.points.push(...c.items.filter((p) => used.has(p.id)));
          if (c.type === "polys") context.polys.push(...c.items.filter((p) => used.has(p.id)));
          if (c.type === "lines") for (const l of c.items.filter((p) => used.has(p.id))) context.lines.push({ feat: l, meters: s.meters });
        }
        const what = sets.map((c) => LAYER_WORD[layerOf(c)!]).map((x) => x.one);
        const whatTa = sets.map((c) => LAYER_WORD[layerOf(c)!].ta_one);
        n = note(`Kept the incidents within ${fmtDistance(s.meters)} of any ${what.join(" or ")} (${hits.length.toLocaleString("en-IN")}; ${used.size} ${used.size === 1 ? "place has" : "places have"} one nearby). Straight-line distance.`,
          `ஏதேனும் ${whatTa.join(" அல்லது ")} இலிருந்து ${fmtDistance(s.meters, "ta")} க்குள் உள்ளவை (${hits.length.toLocaleString("en-IN")}). நேர்கோட்டுத் தூரம்.`);
        if (src.length - placed.length > 0) {
          steps.push({ as: s.as, op: s.op, count: hits.length, ...n, layer: "incidents", ids: hits.map((h) => h.inc.id) });
          const c = src.length - placed.length;
          n = note(`Left out ${nOf(c, "incident", "incidents")} that ${c === 1 ? "has" : "have"} no exact location.`, `துல்லியமான இடம் இல்லாத ${c} சம்பவங்கள் சேர்க்கப்படவில்லை.`);
          steps.push({ as: `${s.as}_unplaced`, op: s.op, count: c, ...n, layer: null, ids: src.filter((h) => !h.inc.pinnable).map((h) => h.inc.id) });
          env.set(s.as, out);
          continue;
        }
        break;
      }
      case "inside": {
        const src = incHits(s.of);
        const hits = src.filter((h) => inArea(h.inc, s.area, w, ctx));
        if (!byRecord(s.area)) {
          const c = src.filter((h) => !h.inc.pinnable).length;
          leftOut += c;
        }
        out = { type: "incidents", hits };
        context.areas.push(s.area);
        if (s.area.kind === "point") { const p = ctx.place(s.area.ref); if (p) context.places.push(p); }
        const al = areaLabel(s.area, w, ctx);
        n = byRecord(s.area)
          ? note(`Kept the incidents recorded in ${al.en} (${hits.length.toLocaleString("en-IN")}), by their recorded ${s.area.kind}, as the Overview counts them.`,
            `${al.ta} இல் பதிவானவை (${hits.length.toLocaleString("en-IN")}).`)
          : note(`Kept the incidents ${al.en} (${hits.length.toLocaleString("en-IN")}), by their map point. Straight-line distance.`, `${al.ta} உள்ளவை (${hits.length.toLocaleString("en-IN")}).`);
        break;
      }
      case "along": {
        const src = incHits(s.of);
        const placed = src.filter((h) => h.inc.pinnable);
        let hits: Hit[];
        let name: string, nameTa: string;
        if (s.line.startsWith("gcc:")) {
          // a GCC street with no map line: incidents whose recorded place or title names it
          const street = s.line.slice(4);
          const t = normText(street);
          hits = src.filter((h) => normText(`${h.inc.place ?? ""} ${h.inc.title}`).includes(t));
          name = nameTa = street;
          n = note(`"${street}" is in GCC's street list but has no map line: kept the incidents whose recorded place names it (${hits.length}). Matched on text, not distance.`,
            `"${street}" GCC தெருப் பட்டியலில் உள்ளது, வரைபடக் கோடு இல்லை: பதிவான இடத்தில் அந்தப் பெயர் உள்ளவை (${hits.length}).`);
          out = { type: "incidents", hits };
          break;
        }
        const line = [...w.lines.roads, ...w.lines.waterways].find((l) => l.id === s.line);
        if (!line) throw new PlanError("That road or waterway is not on the map.");
        leftOut += src.length - placed.length;
        const box = expandBboxM(line.bbox, s.meters);
        hits = [];
        for (const h of placed) {
          if (!inBbox(h.inc, box)) continue;
          const d = distToLineM(h.inc, line.lines);
          if (d.m <= s.meters) hits.push({ inc: h.inc, near: { id: line.id, name: line.name, name_ta: line.name_ta, layer: line.layer, m: d.m, lat: d.at!.lat, lon: d.at!.lon } });
        }
        hits.sort(byPriority);
        out = { type: "incidents", hits };
        context.lines.push({ feat: line, meters: s.meters });
        name = line.name; nameTa = line.name_ta ?? line.name;
        n = note(`Kept the incidents within ${fmtDistance(s.meters)} of ${name} (${hits.length.toLocaleString("en-IN")}), along its ${fmtDistance(line.length_m)} on the map. Straight-line distance.`,
          `${nameTa} இலிருந்து ${fmtDistance(s.meters, "ta")} க்குள் உள்ளவை (${hits.length.toLocaleString("en-IN")}).`);
        break;
      }
      case "nearest": {
        const to = need(s.to);
        if (to.type !== "points" && to.type !== "polys") throw new PlanError(`"nearest" measures to facilities or lakes.`);
        const lw = LAYER_WORD[to.layer];
        const g = to.type === "points" ? idx.get(to)! : null;
        const k = (p: LatLon): Near[] => g
          ? g.nearest(p, s.k).map((r) => ({ id: r.item.id, name: r.item.name, name_ta: r.item.name_ta, layer: to.layer, m: r.m, lat: r.item.lat, lon: r.item.lon }))
          : (to as Extract<Coll, { type: "polys" }>).items.map((f) => ({ f, m: pointInPolygon(p, f.polys) ? 0 : Math.min(...f.polys.map((poly) => distToLineM(p, poly[0]).m)) }))
            .sort((a, b) => a.m - b.m || (a.f.id < b.f.id ? -1 : 1)).slice(0, s.k)
            .map(({ f, m }) => ({ id: f.id, name: f.name, name_ta: f.name_ta, layer: to.layer, m, lat: f.lat, lon: f.lon }));
        if (s.from.startsWith("place:")) {
          const p = ctx.place(s.from.slice(6));
          if (!p) throw new PlanError("The place in the question could not be found on the map.");
          const near = k(p);
          out = { type: "nearest", origin: p, layer: to.layer, pairs: [{ hit: null, to: near }], hits: [] };
          context.places.push(p);
          if (to.type === "points") context.points.push(...to.items.filter((x) => near.some((y) => y.id === x.id)));
          if (to.type === "polys") context.polys.push(...to.items.filter((x) => near.some((y) => y.id === x.id)));
          n = note(`Found the ${s.k === 1 ? `nearest ${lw.one}` : `${s.k} nearest ${lw.en}`} to ${p.name}: ${near.map((x) => `${x.name ?? lw.one} ${fmtDistance(x.m)}`).join(", ")}. Straight-line distance.`,
            `${p.name_ta ?? p.name} அருகிலுள்ள ${lw.ta}: ${near.map((x) => `${x.name ?? lw.ta_one} ${fmtDistance(x.m, "ta")}`).join(", ")}.`);
          out = { ...out };
          steps.push({ as: s.as, op: s.op, count: near.length, ...n, layer: to.layer, ids: near.map((x) => x.id) });
          env.set(s.as, out);
          continue;
        }
        const src = incHits(s.from);
        const placed = src.filter((h) => h.inc.pinnable);
        leftOut += src.length - placed.length;
        const pairs = placed.map((h) => ({ hit: { inc: h.inc, near: null as Near | null }, to: k(h.inc) }));
        for (const p of pairs) p.hit.near = p.to[0] ?? null;
        const hits = pairs.map((p) => p.hit).sort(byPriority);
        out = { type: "nearest", origin: null, layer: to.layer, pairs, hits };
        const used = new Set(pairs.flatMap((p) => p.to.map((x) => x.id)));
        if (to.type === "points") context.points.push(...to.items.filter((x) => used.has(x.id)));
        if (to.type === "polys") context.polys.push(...to.items.filter((x) => used.has(x.id)));
        const ds = pairs.map((p) => p.to[0]?.m ?? Infinity).filter(Number.isFinite).sort((a, b) => a - b);
        n = note(`Found the nearest ${lw.one} to each of them (${pairs.length}); the median distance is ${ds.length ? fmtDistance(pct(ds, 0.5)) : "not known"}. Straight-line distance.`,
          `ஒவ்வொன்றுக்கும் அருகிலுள்ள ${lw.ta_one} (${pairs.length}); நடுநிலைத் தூரம் ${ds.length ? fmtDistance(pct(ds, 0.5), "ta") : "தெரியவில்லை"}.`);
        break;
      }
      case "farthest": {
        const from = need(s.from);
        if (from.type !== "points") throw new PlanError(`"farthest" measures from facilities.`);
        const g = idx.get(from)!;
        const lw = LAYER_WORD[from.layer];
        const scoreOf = (pts: LatLon[]) => {
          const ds = pts.map((p) => ({ p, r: g.nearest(p, 1)[0] })).filter((x) => x.r);
          const sorted = ds.map((x) => x.r!.m).sort((a, b) => a - b);
          const worst = ds.reduce((b, x) => (x.r!.m > b.r!.m ? x : b), ds[0]);
          return { p90: pct(sorted, 0.9), worst: { lat: worst.p.lat, lon: worst.p.lon, m: worst.r!.m, to: { id: worst.r!.item.id, name: worst.r!.item.name, name_ta: worst.r!.item.name_ta, layer: from.layer, m: worst.r!.m, lat: worst.r!.item.lat, lon: worst.r!.item.lon } } };
        };
        const grids = new Map(w.wards.map((wd) => [wd.ward, wardGrid(wd.rings, 200, wd)]));
        let areas: AreaScore[];
        if (s.areas === "ward") {
          areas = w.wards.map((wd) => ({ key: String(wd.ward), label: `Ward ${wd.ward}`, label_ta: `வார்டு ${wd.ward}`, lat: wd.lat, lon: wd.lon, ...scoreOf(grids.get(wd.ward)!) }));
        } else {
          areas = w.zones.map((z) => ({ key: String(z.zone), label: `${z.name} (Zone ${z.zone})`, label_ta: `${z.name} (மண்டலம் ${z.zone})`, lat: z.lat, lon: z.lon,
            ...scoreOf(w.wards.filter((wd) => wd.zone === z.zone).flatMap((wd) => grids.get(wd.ward)!)) }));
        }
        areas.sort((a, b) => b.p90 - a.p90 || a.key.localeCompare(b.key, "en", { numeric: true }));
        const best = [...areas].sort((a, b) => a.p90 - b.p90)[0] ?? null;
        const kept = s.beyond_m != null ? areas.filter((a) => a.p90 > s.beyond_m!) : areas;
        out = { type: "areas", by: s.areas, from: from.layer, areas: kept, best, beyond: s.beyond_m };
        const top = kept[0];
        context.points.push(...from.items.filter((p) => kept.slice(0, 5).some((a) => a.worst.to?.id === p.id)));
        n = top
          ? note(`Measured every ${s.areas}'s ground on a 200 m grid against the nearest ${lw.one}; a ${s.areas}'s distance is how far 90 % of its ground is within. ${top.label}: 90 % within ${fmtDistance(top.p90)}; the district's best ${s.areas} is ${fmtDistance(best!.p90)}.${s.beyond_m != null ? ` ${kept.length} ${s.areas}s are beyond ${fmtDistance(s.beyond_m)}.` : ""}`,
            `ஒவ்வொரு ${s.areas === "ward" ? "வார்டின்" : "மண்டலத்தின்"} நிலமும் 200 மீ கட்டத்தில் அருகிலுள்ள ${lw.ta_one} உடன் அளக்கப்பட்டது. ${top.label_ta}: 90% நிலம் ${fmtDistance(top.p90, "ta")} க்குள்.`)
          : note(`Every ${s.areas} is within ${fmtDistance(s.beyond_m ?? 0)} of a ${lw.one} for 90 % of its ground.`, `எல்லாப் பகுதிகளும் ${fmtDistance(s.beyond_m ?? 0, "ta")} க்குள் உள்ளன.`);
        break;
      }
      case "count_by": {
        const src = incHits(s.of);
        const groups = new Map<string, Group>();
        const unassigned: string[] = [];
        for (const h of src) {
          let key: string | null = null, label = "", label_ta = "", lat = 0, lon = 0;
          if (s.by === "ward" && h.inc.ward != null) {
            const wd = w.wards.find((x) => x.ward === h.inc.ward);
            key = String(h.inc.ward); label = `Ward ${h.inc.ward}`; label_ta = `வார்டு ${h.inc.ward}`; lat = wd?.lat ?? h.inc.lat; lon = wd?.lon ?? h.inc.lon;
          } else if (s.by === "zone" && h.inc.zone != null) {
            const z = w.zones.find((x) => x.zone === h.inc.zone);
            key = String(h.inc.zone); label = z ? `${z.name} (Zone ${z.zone})` : `Zone ${h.inc.zone}`; label_ta = z ? `${z.name} (மண்டலம் ${z.zone})` : `மண்டலம் ${h.inc.zone}`; lat = z?.lat ?? 0; lon = z?.lon ?? 0;
          } else if (s.by === "taluk" && h.inc.taluk) {
            const t = w.taluks.find((x) => x.code === h.inc.taluk);
            key = h.inc.taluk; label = `${t?.name ?? h.inc.taluk} taluk`; label_ta = `${t?.name_ta ?? t?.name ?? h.inc.taluk} வட்டம்`; lat = t?.lat ?? 0; lon = t?.lon ?? 0;
          } else if (s.by === "hex500" && h.inc.pinnable) {
            const x = hex500(h.inc);
            key = x.key; label = `500 m cell ${x.key}`; label_ta = `500 மீ கட்டம் ${x.key}`; lat = x.lat; lon = x.lon;
          }
          if (key == null) { unassigned.push(h.inc.id); continue; }
          const g = groups.get(key) ?? groups.set(key, { key, label, label_ta, n: 0, lat, lon, ids: [] }).get(key)!;
          g.n++;
          g.ids.push(h.inc.id);
        }
        const list = [...groups.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key, "en", { numeric: true }));
        out = { type: "groups", by: s.by, groups: list, hits: src, unassigned };
        const unit = { ward: ["ward", "wards", "வார்டுகள்"], zone: ["zone", "zones", "மண்டலங்கள்"], taluk: ["taluk", "taluks", "வட்டங்கள்"], hex500: ["500 m cell", "500 m cells", "500 மீ கட்டங்கள்"] }[s.by];
        n = note(`Counted them by ${unit[0]}: ${list.length} ${unit[1]}${list[0] ? `; the most in ${list[0].label} (${list[0].n})` : ""}.${unassigned.length ? ` ${unassigned.length} have no ${unit[0]} on record.` : ""}`,
          `${unit[2]} வாரியாக எண்ணப்பட்டது: ${list.length}${list[0] ? `; அதிகம் ${list[0].label_ta} (${list[0].n})` : ""}.`);
        break;
      }
      case "hotspot": {
        const src = incHits(s.of);
        const take = plan.steps.find((x) => x.as === s.of && x.op === "take");
        const f = take?.op === "take" ? take.filter : null;
        const storedOk = !lockDept && f && f.category?.length === 1 && !f.family && !f.severity && f.status === "any" && !f.dept && f.overdue == null && f.citizen == null && !f.text
          && (!f.period || (f.period.kind === "last_days" && f.period.days === 90 && f.period.offset === 0));
        let clusters: Cluster[];
        let method: "stored" | "dbscan";
        if (storedOk) {
          method = "stored";
          clusters = w.hotspots.filter((h) => h.cat === f!.category![0]).map((h: Hotspot) => ({
            id: h.id, n: h.incidents, lat: h.lat, lon: h.lon, wards: h.wards, place: h.place, open: h.open,
            ids: src.filter((x) => x.inc.hotspot === h.id).map((x) => x.inc.id)
          })).sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
        } else {
          method = "dbscan";
          clusters = dbscan(src).map((m) => {
            const lat = m.reduce((t, h) => t + h.inc.lat, 0) / m.length, lon = m.reduce((t, h) => t + h.inc.lon, 0) / m.length;
            const places = new Map<string, number>();
            for (const h of m) if (h.inc.place) places.set(h.inc.place, (places.get(h.inc.place) ?? 0) + 1);
            const place = [...places.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
            const ids = m.map((h) => h.inc.id).sort();
            return { id: `C-${ids[0]}`, n: m.length, lat, lon, ids, wards: [...new Set(m.map((h) => h.inc.ward).filter((x): x is number => x != null))].sort((a, b) => a - b), place, open: m.filter((h) => h.inc.open).length };
          }).sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
        }
        // wards with more than usual for their neighbours: Gi* over the same incidents, counted by recorded ward
        const counts = new Map(w.wards.map((wd) => [wd.ward, 0]));
        for (const h of src) if (h.inc.ward != null && counts.has(h.inc.ward)) counts.set(h.inc.ward, counts.get(h.inc.ward)! + 1);
        const z = giStar(counts, new Map(w.wards.map((wd) => [wd.ward, wd.adj])));
        const hotWards = [...z.entries()].filter(([, v]) => v > GI_HOT).map(([ward, v]) => ({ ward, z: v, n: counts.get(ward)! })).sort((a, b) => b.z - a.z || a.ward - b.ward);
        out = { type: "hotspots", method, clusters, hotWards, hits: src };
        n = note(method === "stored"
          ? `Took the pipeline's ${clusters.length} clusters for this category (reports within 250 m of each other, 3 or more, last 90 days). ${hotWards.length} wards have more than usual for their neighbours.`
          : `Grouped them into clusters of 3 or more within 250 m of each other (${clusters.length}). ${hotWards.length} wards have more than usual for their neighbours.`,
        `250 மீ க்குள் 3 அல்லது அதற்கு மேற்பட்டவை கொத்துகளாக (${clusters.length}). ${hotWards.length} வார்டுகளில் அண்டை வார்டுகளை விட அதிகம்.`);
        break;
      }
      case "compare": {
        const src = incHits(s.of);
        const cnt = (a: AreaRef): AreaCount => {
          const ids = src.filter((h) => inArea(h.inc, a, w, ctx)).map((h) => h.inc.id);
          const l = areaLabel(a, w, ctx);
          return { ref: a, label: l.en, label_ta: l.ta, n: ids.length, ids };
        };
        const a = cnt(s.a), b = cnt(s.b);
        const keep = new Set([...a.ids, ...b.ids]);
        out = { type: "compare", a, b, hits: src.filter((h) => keep.has(h.inc.id)) };
        context.areas.push(s.a, s.b);
        for (const r of [s.a, s.b]) if (r.kind === "point") { const p = ctx.place(r.ref); if (p) context.places.push(p); }
        n = note(`Counted them in ${a.label} (${a.n}) and in ${b.label} (${b.n}).`, `${a.label_ta} (${a.n}), ${b.label_ta} (${b.n}) இல் எண்ணப்பட்டது.`);
        break;
      }
      case "change": {
        // the same steps again with the incidents' period set to each window
        const rerun = (p: Period): Hit[] => {
          const upto = plan.steps.slice(0, plan.steps.findIndex((x) => x.as === s.of) + 1).map((x) =>
            x.op === "take" && x.layer === "incidents" ? { ...x, filter: { ...(x.filter ?? { category: null, family: null, severity: null, status: "any" as const, dept: null, overdue: null, citizen: null, period: null, text: null }), period: p } } : x);
          const r = runMapPlan({ steps: upto, show: s.of, language: plan.language }, w, ctx, lockDept);
          return r.hits;
        };
        const now = rerun(s.now), before = rerun(s.before);
        out = { type: "change", now: { period: s.now, hits: now }, before: { period: s.before, hits: before }, hits: now };
        n = note(`Counted the same in the ${periodWords(s.now, "en")} (${now.length}) and in ${periodWords(s.before, "en")} (${before.length}).`,
          `${periodWords(s.now, "ta")} (${now.length}), ${periodWords(s.before, "ta")} (${before.length}).`);
        break;
      }
    }
    env.set(s.as, out);
    steps.push({ as: s.as, op: s.op, count: countOf(out), ...n, layer: layerOf(out), ids: idsOf(out).slice(0, LIMIT_IDS) });
  }
  const show = env.get(plan.show);
  if (!show) throw new PlanError(`No step makes "${plan.show}".`);
  const hits = hitsOf(show) ?? [];
  if (lockNote) steps.push({ as: "lock", op: "take", count: hits.length, note_en: "Your department only: the question named another department, so it was answered for yours.",
    note_ta: "உங்கள் துறை மட்டும்: கேள்வி வேறு துறையைக் குறிப்பிட்டதால் உங்கள் துறைக்கான பதில்.", layer: null, ids: [] });
  dedupe(context);
  return { steps, show, hits, context, leftOut, lockNote };
}
const LIMIT_IDS = 5000;

function dedupe(c: RunResult["context"]) {
  const u = <T,>(a: T[], k: (x: T) => string) => { const seen = new Set<string>(); return a.filter((x) => (seen.has(k(x)) ? false : (seen.add(k(x)), true))); };
  c.points = u(c.points, (p) => p.id).sort((a, b) => a.id.localeCompare(b.id));
  c.polys = u(c.polys, (p) => p.id).sort((a, b) => a.id.localeCompare(b.id));
  c.lines = u(c.lines, (l) => `${l.feat.id}|${l.meters}`);
  c.places = u(c.places, (p) => p.ref);
  c.areas = u(c.areas, (a) => JSON.stringify(a));
}

export { SEV_ORDER };
