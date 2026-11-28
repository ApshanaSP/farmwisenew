/**
 * The plan of the daily generated resolutions (lib/cases/synthetic.ts), pure so it is tested without a database: which hours of a day the
 * resolutions fall on, which open cases may be resolved (GENERATED records only), what the officer writes, and the times of each step.
 *
 * The owner's request (28 Nov): "generate some synthetic resolved complaints, as the department officer would do, with remarks and a
 * generated photo upload ... on a daily basis ... some sent to the Collector and the Collector approved it, or resolved without sending
 * to the Collector." Every row this writes is marked as generated in the audit trail (synthetic.ts); the screens show them as they show
 * any resolution, as the owner asked (the owner tells reviewers).
 */
import { isSevere } from "./rules";

// ------------------------------------------------------------------ random --

/** 32-bit FNV-1a of a string: the seed of a day's or a slot's choices, so a run is the same every time. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** mulberry32: a small seeded generator, numbers in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -------------------------------------------------------------------- time --

/** "YYYY-MM-DD HH:MM:SS" (IST wall clock, as the store keeps times) to milliseconds on a UTC-labelled clock, and back. */
export const toMs = (t: string) => Date.parse(String(t).slice(0, 19).replace(" ", "T") + "Z");
export const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
const HOUR = 3_600_000;

/** How many resolutions a day: SYNTH_RESOLUTIONS_PER_DAY when set (1 to 40), else 8 to 12 by the day's seed. */
export function perDay(day: string, fixed?: number | null): number {
  if (fixed && Number.isFinite(fixed)) return Math.max(1, Math.min(40, Math.round(fixed)));
  return 8 + (hash32(`n|${day}`) % 5);
}

/** The times of a day's resolutions: spread through the working day (8:15 AM to 7:45 PM IST), one in each equal part, at a seeded place in it. */
export function daySlots(day: string, n: number): string[] {
  const start = toMs(`${day} 08:15:00`), span = 11.5 * HOUR, part = span / n;
  const r = rng(hash32(`slots|${day}`));
  return Array.from({ length: n }, (_, k) => fromMs(Math.round((start + part * (k + 0.1 + 0.8 * r())) / 1000) * 1000));
}

/** The days to fill: the last `back` days before `today`, then today (oldest first). */
export function daysToFill(today: string, back: number): string[] {
  const t = toMs(`${today} 00:00:00`);
  return Array.from({ length: back + 1 }, (_, k) => fromMs(t - (back - k) * 24 * HOUR).slice(0, 10));
}

// --------------------------------------------------------------- selection --

/**
 * The kinds of work a field officer closes with an "after" photo of the spot, and the photo set each uses (lib/cases/photolib.ts). Crime,
 * missing persons, cases about women and children, self-harm, fire, health, food, admin and other matters are never resolved this way:
 * an "after" photo of those would be wrong, and their records are not the department's to close on a photo.
 */
export const CATEGORY_PHOTOS: Record<string, string> = {
  // the "after" photo must show the work done: flooding and drain cases end on a dry, open street and a water-supply repair on a
  // restored road (the library's waterlogging, drain and pipe-1 pictures still show standing water, so they are not used for these).
  // Road accidents are police cases ("crime and similar"), so they get no generated resolution.
  SOLID_WASTE: "garbage", STREETLIGHT_ELECTRICAL: "streetlight", DARK_SPOT_SAFETY: "streetlight", FLOOD_WATERLOGGING: "street",
  DRAINAGE_SEWAGE: "street", ROAD_DAMAGE: "road", PUBLIC_WORKS: "road", SANITATION_TOILETS: "toilet", DRAIN_WORKS_SAFETY: "barricade",
  TREES_PARKS: "tree", ENCROACHMENT: "footpath", TRAFFIC_OBSTRUCTION: "footpath", BUILDING_SAFETY: "wall",
  WATER_SUPPLY: "road", WATERBODY_INFRA: "bund", VECTOR_DISEASE: "street", STRAY_ANIMALS: "street"
};
export const RESOLVABLE_CATEGORIES = Object.keys(CATEGORY_PHOTOS);

/** Sources whose records are generated in this product (the police, PWD, hospital and grievance generators). */
export const GENERATED_SOURCES = ["grievance", "police", "pwd", "hospital"] as const;

/**
 * Whether a case is GENERATED data only, so a generated resolution may be laid on it. Every one of these must hold:
 *   - it has member events, and every one is is_synthetic = 1 (a real portal complaint, a Manu petition, a news article, an IMD or CPCB
 *     reading is 0: the 13 real portal complaints of 28 Nov came through the same citizen_app channel as generated ones, so the channel
 *     alone cannot tell them apart);
 *   - its sources are only the generated ones (no news, IMD, CPCB, CFM) and it is not news-only;
 *   - no website channel (citizen_grievance: filed on this site; manu: a paper petition) on the case;
 *   - no complaint filed into it is a real one in the portal's complaints table (is_synthetic = 0), and no petition is linked to it.
 */
export interface CandidateFacts {
  events: number;
  realEvents: number;
  sources: string | null;
  channels: string | null;
  mediaOnly: unknown;
  realComplaints: number;
  petitions: number;
}
export function isGeneratedOnly(c: CandidateFacts): boolean {
  if (!(c.events > 0) || c.realEvents > 0) return false;
  const src = String(c.sources ?? "").split("|").filter(Boolean);
  if (!src.length || src.some((s) => !(GENERATED_SOURCES as readonly string[]).includes(s))) return false;
  if (Number(c.mediaOnly) === 1) return false;
  if (/(^|\|)(citizen_grievance|manu)(\||$)/.test(String(c.channels ?? ""))) return false;
  return c.realComplaints === 0 && c.petitions === 0;
}

export interface Candidate {
  id: string;
  dept: string;
  cat: string;
  sev: string | null;
  reportedAt: string;
  slaDueAt: string | null;
  place: string | null;
  zoneName: string | null;
  ward: number | null;
  officer: string | null;
}

/**
 * Picks the case for one slot: one not taken yet, reported at least 3 hours and at most 21 days before the slot, departments in turn so a
 * day covers several; about a third of the time a case reported earlier the same day (quick fixes), and mostly one still inside its
 * deadline at the slot (some late, as in life). Null when nothing fits.
 */
export function pickCandidate(pool: Candidate[], slot: string, taken: Set<string>, deptTurn: string[], seed: string): Candidate | null {
  const r = rng(hash32(`pick|${seed}`));
  const s = toMs(slot);
  const fits = pool.filter((c) => !taken.has(c.id) && toMs(c.reportedAt) <= s - 3 * HOUR && toMs(c.reportedAt) >= s - 21 * 24 * HOUR);
  if (!fits.length) return null;
  const depts = [...new Set(fits.map((c) => c.dept))];
  // the next department in turn that has a case that fits
  const dept = deptTurn.find((d) => depts.includes(d)) ?? depts[Math.floor(r() * depts.length)];
  let set = fits.filter((c) => c.dept === dept);
  const sameDay = set.filter((c) => c.reportedAt.slice(0, 10) === slot.slice(0, 10));
  if (sameDay.length && r() < 0.35) set = sameDay;
  const inTime = set.filter((c) => !c.slaDueAt || toMs(c.slaDueAt) >= s);
  if (inTime.length && r() < 0.8) set = inTime;
  set = [...set].sort((a, b) => a.id.localeCompare(b.id));
  return set[Math.floor(r() * set.length)] ?? null;
}

/**
 * Which of a day's slots go to the Collector for approval, fixed for the day before any case is picked (so a slot's way never changes
 * between runs): a seeded 40-60 % of them. The rest the officer closes, except a severe case, which always goes to the Collector
 * (`viaCollector`, the owner's rule), so a day with severe picks may send a little more.
 */
export function collectorSlots(n: number, day: string): boolean[] {
  const r = rng(hash32(`via|${day}`));
  const target = Math.round(n * (0.4 + 0.2 * r()));
  const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => hash32(`${day}|${a}`) - hash32(`${day}|${b}`));
  const out = Array<boolean>(n).fill(false);
  for (const k of order.slice(0, target)) out[k] = true;
  return out;
}

/** The way one pick goes: to the Collector when its slot says so, and always when the case is severe. */
export const viaCollector = (slotSaysCollector: boolean, severity: unknown): boolean => slotSaysCollector || isSevere(severity);

export interface Timeline { approve: string; action: string; report: string; close: string }

/**
 * The times of the officer's steps and the close, ending at the slot: approved some time after the report, work started after that, and
 * the report sent; a case that goes to the Collector is sent 40 minutes to 6 hours before the Collector approves it at the slot, one the
 * officer closes is closed at the slot with its report. Every time is after the report and in order.
 */
export function stepTimes(reportedAt: string, slot: string, via: boolean, seed: string): Timeline {
  const r = rng(hash32(`times|${seed}`));
  const R = toMs(reportedAt), S = toMs(slot);
  const gap = Math.max(3 * HOUR, S - R);
  const sendBefore = via ? Math.min(Math.max(40 * 60_000, gap * 0.15), 6 * HOUR) * (0.6 + 0.4 * r()) : 0;
  const report = S - sendBefore;
  const approve = R + Math.min(Math.max(20 * 60_000, (report - R) * (0.08 + 0.12 * r())), 8 * HOUR);
  const action = approve + (report - approve) * (0.15 + 0.25 * r());
  const sec = (ms: number) => fromMs(Math.round(ms / 1000) * 1000);
  return { approve: sec(approve), action: sec(action), report: sec(report), close: sec(S) };
}

// ----------------------------------------------------------------- remarks --

const T: Record<string, string[]> = {
  SOLID_WASTE: [
    "Accumulated garbage at {place} cleared (about {tonnes} tonnes) and the spot disinfected with bleaching powder; the bin point is now on the twice-daily collection route.",
    "Overflowing bins at {place} emptied, the area swept and lime applied; the compactor will pick up here every morning.",
    "Household waste and debris removed from {place} by the conservancy crew; the spot was washed and a no-dumping board fixed."
  ],
  STREETLIGHT_ELECTRICAL: [
    "{n} non-working street lights at {place} replaced with LED fittings; the feeder pillar was checked and the lights tested after dusk.",
    "Damaged street light cable at {place} re-laid and the pole earthed; the lights are working from this evening.",
    "Exposed wiring in the junction box at {place} insulated and the box closed; supply to the street lights restored."
  ],
  DARK_SPOT_SAFETY: [
    "Dark stretch at {place} lit with {n} new LED street lights; the beat patrol now passes here after 9 PM.",
    "Non-working lights at {place} restored and two additional poles fitted; the stretch is lit through the night."
  ],
  FLOOD_WATERLOGGING: [
    "Stagnant water at {place} pumped out with {n} suction pumps; the storm-water drain inlet was de-silted and the road is open to traffic.",
    "Water cleared from {place} after the choked culvert was opened; the road is dry and open, and the inlet grating was cleaned.",
    "Waterlogging at {place} drained with a {hp} HP motor pump; silt removed from the side drain to prevent a repeat."
  ],
  DRAINAGE_SEWAGE: [
    "Choked sewer line at {place} cleared with the jetting machine; the manhole cover was reset and the street washed.",
    "Overflowing drain at {place} de-silted for about {m} metres; the silt was removed the same day and the flow is normal.",
    "Blocked drain at {place} cleared and the broken slab replaced; the area was disinfected."
  ],
  ROAD_DAMAGE: [
    "Potholes at {place} filled with hot-mix bitumen and compacted; the stretch is open to traffic.",
    "Damaged road surface at {place} patched over about {m} metres and the edges sealed; barricades removed.",
    "Broken footpath slabs at {place} replaced and levelled; the footpath is safe to use."
  ],
  PUBLIC_WORKS: [
    "Debris left at the worksite at {place} cleared and the road surface restored; the contractor has closed the site.",
    "Unfinished patch at {place} completed and compacted; the excavated earth was removed."
  ],
  SANITATION_TOILETS: [
    "Public toilet at {place} cleaned and disinfected; the water supply and the door latches were repaired and a cleaning schedule is posted.",
    "Blocked toilet outlet at {place} cleared and the block washed; a caretaker is posted for the morning and evening hours."
  ],
  DRAIN_WORKS_SAFETY: [
    "Open drain trench at {place} barricaded on both sides with reflective boards; steel plates placed at the crossing.",
    "Unsafe excavation at {place} covered and barricaded; warning lights fitted for the night."
  ],
  TREES_PARKS: [
    "Fallen tree at {place} cut and cleared; branches removed from the footpath and the road reopened.",
    "Overgrown branches at {place} pruned clear of the overhead lines; the cuttings were removed the same day."
  ],
  ENCROACHMENT: [
    "Encroachment on the footpath at {place} removed after notice; the footpath is clear for pedestrians.",
    "Temporary structures blocking the footpath at {place} removed; the owners were warned in writing."
  ],
  TRAFFIC_OBSTRUCTION: [
    "Vehicles parked on the carriageway at {place} cleared and no-parking boards fixed; traffic is moving normally.",
    "Obstruction at {place} removed and the lane cleared; a traffic constable posted for the peak hours."
  ],
  ROAD_ACCIDENT: [
    "Accident spot at {place} attended; the damaged vehicles were removed, the debris swept and traffic restored. The case is registered at the station.",
    "Spot at {place} cleared after the accident and the traffic restored; a speed-breaker request has been sent to the Corporation."
  ],
  BUILDING_SAFETY: [
    "Unsafe compound wall at {place} propped and the area barricaded; the owner has been served notice to rebuild it.",
    "Loose parapet at {place} brought down safely and the debris cleared; the building owner was given notice."
  ],
  WATER_SUPPLY: [
    "Leaking pipeline at {place} repaired and the pit filled; supply restored and the water tested satisfactory.",
    "Damaged service connection at {place} replaced; supply restored to the street."
  ],
  WATERBODY_INFRA: [
    "Weak section of the bund at {place} strengthened with sandbags; the sluice was cleared of silt.",
    "Silt and weeds cleared at the inlet near {place}; the sluice shutter was greased and checked."
  ],
  VECTOR_DISEASE: [
    "Fogging done across {n} streets around {place}; breeding sources in stagnant water removed and larvicide applied.",
    "Anti-larval work done at {place}: stagnant water drained, containers removed and the drains treated."
  ],
  STRAY_ANIMALS: [
    "Stray dogs at {place} picked up by the dog-catching team for sterilisation and vaccination at the ABC centre.",
    "Stray cattle at {place} impounded and the owners fined; the stretch is clear."
  ]
};

const GOVT_PLACE = /\b(office|taluk|collectorate|corporation|government|govt|police station|school|hospital|court|secretariat|depot)\b/i;
const GOVT_BUILDING = [
  "Unsafe portion of the building at {place} propped and the area barricaded; the department's engineers have taken up the repair.",
  "Loose parapet at {place} brought down safely and the debris cleared; the repair is entered in the department's works list."
];

/** The officer's remark for a case: a template of its kind, with its place and numbers filled in by the case's seed. */
export function remarkFor(cat: string, place: string | null, seed: string): string {
  const r = rng(hash32(`remark|${seed}`));
  const where = (place ?? "").split(",")[0].trim() || "the site";
  // a government building gets no "notice to the owner": the department's own engineers make it safe
  const list = cat === "BUILDING_SAFETY" && GOVT_PLACE.test(place ?? "") ? GOVT_BUILDING : (T[cat] ?? T.SOLID_WASTE);
  const t = list[Math.floor(r() * list.length)];
  return t.replace("{place}", where).replace("{n}", String(2 + Math.floor(r() * 9))).replace("{tonnes}", String(2 + Math.floor(r() * 5)))
    .replace("{m}", String(10 * (3 + Math.floor(r() * 12)))).replace("{hp}", String([5, 7.5, 10][Math.floor(r() * 3)]));
}

/** The Collector's note when approving a report (most approvals carry none, as on the console). */
export function approvalNote(seed: string): string | null {
  const r = rng(hash32(`approve|${seed}`));
  const notes = [null, null, "Work checked from the photos; closed.", null, "Report and photos checked; closed."];
  return notes[Math.floor(r() * notes.length)];
}
