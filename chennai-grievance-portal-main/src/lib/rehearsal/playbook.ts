/**
 * The rehearsal plan: from what the map shows to jobs for departments. Rules, not AI: each rule reads one thing on the
 * map (an open drain complaint on a flood street, a cut-off hospital, a ward losing quick help, a dry school, a river
 * downstream of a release) and writes one job with its department, place, reason and deadline before the rain.
 * Departments are the store's own codes (ref_departments); a complaint's job goes to the complaint's own department.
 * Pure. Each job has a stable key, so the same rehearsal never sends the same job twice.
 */
import { streetLabel, TIER_LIKELY, type Street } from "./memory";
import type { Choke, DrySchool } from "./places";
import type { Facility, FacilityReach, WardHelp } from "./reach";
import type { Level } from "./trigger";
import type { Work } from "@/lib/map/types";

export type JobKind = "drain" | "street" | "works" | "pump" | "hospital" | "fire" | "diversion" | "shelter" | "release";
export interface Job {
  key: string;
  kind: JobKind;
  dept: string;
  en: string;
  ta: string;
  /** why, in one line */
  why: string;
  place: string;
  lat: number;
  lon: number;
  ward: number | null;
  /** the complaint it acts on, if any */
  incident: string | null;
  /** IST "YYYY-MM-DD HH:MM:SS"; null = as soon as possible */
  due: string | null;
  /** higher first */
  rank: number;
}

/** who does what (store codes): drains, pumps, hospitals, emergency cover, traffic, shelters, river alerts */
export const DEPT = { drains: "GCC-SWD", pumps: "GCC-MEC", pwd: "PWD-WRD", health: "HLT-DMS", disaster: "DIST-DM", police: "POL-GCP", education: "GCC-EDU", revenue: "DIST-REV" } as const;
/** hours before the rain each kind of job is due */
export const DUE_H: Record<JobKind, number> = { drain: 24, street: 24, works: 24, pump: 12, hospital: 12, fire: 12, diversion: 6, shelter: 6, release: 0 };
/** a cluster of likely streets this close together gets a pump */
export const PUMP_CLUSTER_M = 800;
export const PUMP_CLUSTER_MIN = 3;

const KX = 111320 * Math.cos(13.05 * Math.PI / 180), KY = 110574;
const dist = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => Math.hypot((a.lon - b.lon) * KX, (a.lat - b.lat) * KY);
const at = (rainAt: string | null, h: number, asOf: string): string | null => {
  if (!rainAt) return null;
  const t = new Date(Date.parse(rainAt.replace(" ", "T") + "Z") - h * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
  return t <= asOf ? null : t;
};
const mins = (s: number) => Math.max(1, Math.round(s / 60));

export interface PlanInput {
  asOf: string;
  level: Level;
  rainAt: string | null;
  streets: Street[];
  chokes: Choke[];
  works: Work[];
  facilities: Facility[];
  reach: FacilityReach[];
  wards: WardHelp[];
  /** a point in each ward (for jobs about a ward) */
  wardPoint: Map<number, { lat: number; lon: number; name: string }>;
  dry: DrySchool[];
  ribbon: { river: string; reservoir: string; wards: number[] } | null;
  /** which kinds of road a street is (to plan diversions on main roads) */
  mainStreet: (s: Street) => boolean;
  /** the nearest fire station and its dry point, for a ward that loses fire cover */
  fireFor: (ward: number) => { name: string; lat: number; lon: number } | null;
}

export function plan(p: PlanInput): Job[] {
  const jobs: Job[] = [];
  const due = (k: JobKind) => at(p.rainAt, DUE_H[k], p.asOf);
  const likely = p.streets.filter((s) => s.tier === TIER_LIKELY);
  const byKey = new Map(p.streets.map((s) => [s.key, s]));

  // 1. open drain / flooding complaints on flood streets: clear them first (the complaint's own department)
  for (const c of p.chokes) {
    const s = byKey.get(c.street);
    const where = c.place ?? (s ? streetLabel(s) : `ward ${c.ward}`);
    jobs.push({ key: `drain:${c.id}`, kind: "drain", dept: c.dept || DEPT.drains, incident: c.id, lat: c.lat, lon: c.lon, ward: c.ward, place: where, due: due("drain"),
      en: `Clear the drain at ${where} (complaint open ${c.ageDays} days)`, ta: `${where}: வடிகாலைச் சுத்தம் செய்யவும் (${c.ageDays} நாட்களாகத் திறந்த புகார்)`,
      why: `${s ? `${streetLabel(s)} flooded in ${s.rains} past ${s.rains === 1 ? "rain" : "rains"}` : "On a flood street"}${c.breached ? "; past its deadline" : ""}`,
      rank: 1000 + (c.tier === TIER_LIKELY ? 300 : 0) + (c.breached ? 100 : 0) + Math.min(99, c.priority) });
  }
  // 2. likely streets flooded in 3+ rains with no open complaint: check the drains along them
  const withChoke = new Set(p.chokes.map((c) => c.street));
  for (const s of likely) {
    if (s.rains < 3 || withChoke.has(s.key)) continue;
    const name = streetLabel(s);
    jobs.push({ key: `street:${s.key}`, kind: "street", dept: DEPT.drains, incident: null, lat: s.lat, lon: s.lon, ward: s.ward, place: name, due: due("street"),
      en: `Check and clear the drains along ${name}`, ta: `${streetLabel(s, "ta")}: வடிகால்களைச் சரிபார்த்துச் சுத்தம் செய்யவும்`,
      why: `Flooded in ${s.rains} past rains; no open complaint now`, rank: 800 + s.rains * 10 + Math.min(9, s.score) });
  }
  // 3. late PWD water works within 300 m of a likely street
  for (const w of p.works) {
    if (!/desilting|flood_mitigation|canal_lining|sluice_repair|bund_strengthening|encroachment_removal/.test(w.type)) continue;
    const late = (w.gap != null && w.gap < -10) || (!!w.target && w.target < p.asOf.slice(0, 10));
    if (!late) continue;
    const s = likely.find((x) => dist(x, w) <= 300);
    if (!s) continue;
    jobs.push({ key: `works:${w.id}`, kind: "works", dept: DEPT.pwd, incident: null, lat: w.lat, lon: w.lon, ward: s.ward, place: w.asset ?? w.title, due: due("works"),
      en: `Finish or make safe "${w.title}" before the rain (${w.progress ?? "?"} % done)`, ta: `மழைக்கு முன் "${w.title}" பணியை முடிக்கவும் அல்லது பாதுகாப்பாக்கவும் (${w.progress ?? "?"} %)`,
      why: `${w.gap != null && w.gap < -10 ? `${Math.round(-w.gap)} points behind plan` : `past its target ${w.target}`}; next to ${streetLabel(s)}`, rank: 700 + Math.round(-(w.gap ?? 0)) });
  }
  // 4. clusters of likely streets: a pump ready nearby
  const used = new Set<string>();
  for (const s of likely) {
    if (used.has(s.key)) continue;
    const group = likely.filter((x) => !used.has(x.key) && dist(x, s) <= PUMP_CLUSTER_M);
    if (group.length < PUMP_CLUSTER_MIN) continue;
    for (const x of group) used.add(x.key);
    const name = streetLabel(s);
    jobs.push({ key: `pump:${s.key}`, kind: "pump", dept: DEPT.pumps, incident: null, lat: s.lat, lon: s.lon, ward: s.ward, place: name, due: due("pump"),
      en: `Keep a pump ready near ${name} (${group.length} flood streets within ${PUMP_CLUSTER_M} m)`, ta: `${streetLabel(s, "ta")} அருகே நீர் இறைக்கும் இயந்திரம் தயாராக வைக்கவும் (${group.length} வெள்ளத் தெருக்கள்)`,
      why: `${group.length} streets nearby flooded in past rains`, rank: 650 + group.length });
  }
  // 5. cut-off hospitals: an ambulance on the dry side, and the hospital told its dry route
  const fac = new Map(p.facilities.map((f) => [f.id, f]));
  for (const r of p.reach) {
    const f = fac.get(r.id);
    if (!f || !r.cutOff) continue;
    const route = r.detour?.rehearsal;
    const via = route?.names.length ? ` via ${route.names.join(", ")}` : "";
    if (f.kind === "hospital") {
      jobs.push({ key: `hospital:${f.id}`, kind: "hospital", dept: DEPT.health, incident: null, lat: f.lat, lon: f.lon, ward: f.ward, place: f.name, due: due("hospital"),
        en: `Keep an ambulance on the dry side of ${f.name}; tell the hospital its dry route${via}`, ta: `${f.name_ta ?? f.name}: உலர்ந்த பக்கத்தில் ஆம்புலன்ஸ் நிறுத்தவும்; உலர்ந்த பாதையைத் தெரிவிக்கவும்`,
        why: r.why === "own-road" ? "Its own road is a flood street" : `Its 10-minute reach shrinks from ${r.normalKm} to ${r.rehearsalKm} km of road`, rank: 900 });
    } else {
      jobs.push({ key: `fire:${f.id}`, kind: "fire", dept: DEPT.disaster, incident: null, lat: f.lat, lon: f.lon, ward: f.ward, place: f.name, due: due("fire"),
        en: `${f.name} may be cut off: plan its dry exit${via}`, ta: `${f.name} துண்டிக்கப்படலாம்: உலர்ந்த வெளியேறும் வழியைத் திட்டமிடவும்`,
        why: r.why === "own-road" ? "Its own road is a flood street" : `Its 10-minute reach shrinks from ${r.normalKm} to ${r.rehearsalKm} km of road`, rank: 880 });
    }
  }
  // 6. wards that lose quick fire cover: pre-position a fire tender
  for (const w of p.wards) {
    if (!w.loses.includes("fire")) continue;
    const pt = p.wardPoint.get(w.ward);
    if (!pt) continue;
    const near = p.fireFor(w.ward);
    jobs.push({ key: `cover:${w.ward}`, kind: "fire", dept: DEPT.disaster, incident: null, lat: pt.lat, lon: pt.lon, ward: w.ward, place: `Ward ${w.ward}${pt.name ? ` (${pt.name})` : ""}`, due: due("fire"),
      en: `Pre-position a fire tender in ward ${w.ward}: fire cover ${w.fire.normal} → ${w.fire.rehearsal ?? "no road"} min`, ta: `வார்டு ${w.ward}: தீயணைப்பு வாகனத்தை முன்கூட்டியே நிறுத்தவும் (${w.fire.normal} → ${w.fire.rehearsal ?? "சாலை இல்லை"} நிமி)`,
      why: `Nearest fire station${near ? ` (${near.name})` : ""} ${w.fire.normal} min away now, ${w.fire.rehearsal == null ? "cut off" : `${w.fire.rehearsal} min`} in the rehearsal`, rank: 860 });
  }
  // 7. main roads that are likely flood streets: plan a diversion
  for (const s of likely) {
    if (!p.mainStreet(s)) continue;
    const name = streetLabel(s);
    jobs.push({ key: `diversion:${s.key}`, kind: "diversion", dept: DEPT.police, incident: null, lat: s.lat, lon: s.lon, ward: s.ward, place: name, due: due("diversion"),
      en: `Plan a traffic diversion for ${name}`, ta: `${streetLabel(s, "ta")}: போக்குவரத்து மாற்று வழியைத் திட்டமிடவும்`, why: `Main road; flooded in ${s.rains} past rains`, rank: 600 + s.rains });
  }
  // 8. at ACT level (or a release): dry schools ready as relief centres
  if (p.level === "act" || p.ribbon) {
    for (const d of p.dry.slice(0, 8)) {
      jobs.push({ key: `shelter:${d.id}`, kind: "shelter", dept: DEPT.education, incident: null, lat: d.lat, lon: d.lon, ward: d.ward, place: d.name, due: due("shelter"),
        en: `Keep ${d.name} ready as a relief centre`, ta: `${d.name_ta ?? d.name}: நிவாரண மையமாகத் தயார் செய்யவும்`,
        why: `Not on a flood street; ${d.hospitalMin} min from a hospital on rehearsal roads`, rank: 500 + (d.government ? 50 : 0) });
    }
  }
  // 9. a reservoir is releasing: alert the wards along the river at once
  if (p.ribbon && p.ribbon.wards.length) {
    const pt = p.wardPoint.get(p.ribbon.wards[0]);
    jobs.push({ key: `release:${p.ribbon.reservoir}`, kind: "release", dept: DEPT.revenue, incident: null, lat: pt?.lat ?? 13.05, lon: pt?.lon ?? 80.23, ward: null,
      place: `${p.ribbon.river} (wards ${p.ribbon.wards.slice(0, 8).join(", ")}${p.ribbon.wards.length > 8 ? "…" : ""})`, due: null,
      en: `Alert the ward officers of ${p.ribbon.wards.length} wards within 500 m of the ${p.ribbon.river}: ${p.ribbon.reservoir} is releasing water`,
      ta: `${p.ribbon.reservoir} நீர் திறப்பு: ${p.ribbon.river} ஆற்றின் 500 மீ உள்ள ${p.ribbon.wards.length} வார்டு அலுவலர்களுக்குத் தெரிவிக்கவும்`,
      why: "Water released upstream reaches these wards first", rank: 1500 });
  }
  return jobs.sort((a, b) => b.rank - a.rank || a.key.localeCompare(b.key));
}

/** minutes, for job text */
export { mins };
