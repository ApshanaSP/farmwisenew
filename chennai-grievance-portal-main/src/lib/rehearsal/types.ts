/**
 * What GET /api/rehearsal/state hands the console: everything the rehearsal map, panel, clock and plan draw, already
 * computed on the server. Types only (safe to import in the browser). Lines are [lat, lon] pairs.
 */
import type { Level, Reason } from "./trigger";

export type Line = [number, number][];

export interface RStreet {
  key: string;
  name: string | null;
  name_ta: string | null;
  near: string | null;
  label: string;
  label_ta: string;
  ward: number;
  tier: 1 | 2;
  rains: number;
  rainDates: string[];
  rainIncidents: number;
  otherIncidents: number;
  lastFlood: string | null;
  length_m: number;
  lat: number;
  lon: number;
  water_m: number;
  main: boolean;
  incidents: string[];
  lines: Line[];
  /** open drain complaints on it */
  chokes: number;
  /** late PWD water work within 300 m */
  lateWork: string | null;
  /** ground height compared with the roads within 500 m (m; negative = lower), null when not built */
  low_m: number | null;
  /** after the rain (replay or a rain that has come) */
  flooded?: boolean;
}

export interface RChoke { id: string; cat: string; title: string; place: string | null; lat: number; lon: number; dept: string; ward: number | null; street: string; tier: 1 | 2; ageDays: number; breached: boolean }

export interface RFacility {
  id: string;
  kind: "hospital" | "fire";
  name: string;
  name_ta: string | null;
  lat: number;
  lon: number;
  government: boolean;
  beds: { total: number | null; occupied: number | null; pct: number | null } | null;
  ambulance: boolean | null;
  ward: number | null;
  routed: boolean;
  normalKm: number;
  rehearsalKm: number;
  normalWards: number;
  rehearsalWards: number;
  cutOff: boolean;
  why: string | null;
  detour: { to: string | null; normal: { min: number; names: string[]; line: Line } | null; rehearsal: { min: number; names: string[]; line: Line } | null } | null;
}

export interface RWard { ward: number; zone: number | null; name: string; fire: { normal: number | null; rehearsal: number | null }; hospital: { normal: number | null; rehearsal: number | null }; loses: ("fire" | "hospital")[] }

export interface RDry { id: string; name: string; name_ta: string | null; lat: number; lon: number; ward: number | null; government: boolean; floodM: number; hospitalMin: number }

export interface RLake { id: string; name: string; lat: number; lon: number; pct: number; slope: number | null; at: string; daysToFull: number | null }
export interface RGauge { id: string; name: string; lat: number | null; lon: number | null; at: string; level: number; warning: number | null; danger: number | null; gap: number | null; suspect: boolean }
export interface RRelease { id: string; name: string; at: string; discharge: number; unit: string }

export interface RJob {
  key: string;
  kind: string;
  dept: string;
  deptName: string;
  en: string;
  ta: string;
  why: string;
  place: string;
  lat: number;
  lon: number;
  ward: number | null;
  incident: string | null;
  due: string | null;
  /** already a task of this rehearsal */
  task: { id: number; status: "todo" | "done" | "late"; doneAt: string | null; photo: string | null; photoM: number | null } | null;
}

export interface RRain { id: string; name: string; district: string; at: string | null; hour: string | null; hourMm: number | null; todayMm: number | null; yesterdayMm: number | null; stale: boolean; lat: number | null; lon: number | null; place: string | null }

export interface RReport { id: string; lat: number; lon: number; first: string; title: string; place: string | null; street: string | null; missed: boolean }

export interface RBacktest {
  event: { id: string; start: string; end: string; sources: string[]; maxMm: number | null };
  asOf: string;
  tested: number;
  covered: number;
  coveredLikely: number;
  share: number;
  randomShare: number;
  randomLo: number;
  randomHi: number;
  lift: number | null;
  km: number;
  likelyStreets: number;
  possibleStreets: number;
}

export interface RehearsalState {
  asOf: string;
  /** the console's now */
  now: string;
  mode: "live" | "replay";
  rehearsal: string;
  replay: { id: string; start: string; end: string; maxMm: number | null } | null;
  trigger: { level: Level; rainAt: string | null; hoursLeft: number | null; days: { day: string; level: number; colour: string; text: string }[]; reasons: Reason[]; manual: boolean };
  counts: { likely: number; possible: number; chokes: number; hospitalsCut: number; fireCut: number; wardsLoseFire: number; wardsLoseHospital: number; dry: number; jobs: number; tasks: number; done: number; late: number };
  streets: RStreet[];
  chokes: RChoke[];
  facilities: RFacility[];
  wards: RWard[];
  dry: RDry[];
  lakes: RLake[];
  gauges: RGauge[];
  releases: RRelease[];
  ribbon: { river: string; reservoir: string; wards: number[]; lines: Line[] } | null;
  bulletins: { id: string; title: string; date: string; kind: string; url: string }[];
  /** live rain at the Flood Monitor's stations (live moments only) */
  rain: { fetchedAt: string | null; error: string | null; source: string; stations: RRain[] } | null;
  jobs: RJob[];
  depts: { code: string; name: string; jobs: number; done: number; late: number }[];
  /** the rain being checked (a replay's rain, or a rain that has come) */
  check: { event: { id: string; start: string; end: string }; reports: RReport[]; onPredicted: number; missed: number; flooded: number; quiet: number; lift: number | null; randomShare: number | null; share: number | null } | null;
  /** the memory once the checked rain's reports are in: streets added or moved up */
  learn: { asOf: string; added: number; upgraded: number; likely: number; possible: number; streets: { key: string; label: string; tier: 1 | 2; lat: number; lon: number; lines: Line[]; isNew: boolean }[] } | null;
  /** rains in the record (for Replay) */
  rains: { id: string; start: string; end: string; sources: string[]; maxMm: number | null; reports: number }[];
  backtest: RBacktest[];
  method: {
    incidentsUsed: number;
    events: number;
    tHelpMin: number;
    speeds: Record<string, number>;
    roads: { km: number; junctions: number; pieces: number; osmBase: string | null };
    notes: string[];
    facilities: { hospitals: number; fire: number; unrouted: number };
  };
  ms: number;
}
