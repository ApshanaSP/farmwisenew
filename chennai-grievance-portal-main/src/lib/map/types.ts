/**
 * Ask the Map's in-memory world: incidents from the store, facilities, roads and water from the store and from
 * OpenStreetMap (data/layers), and the wards. The executor and the router are pure functions over a World, so the unit
 * tests build a small one by hand and the server builds the real one once per store build (world.ts).
 * Points are { lat, lon }; lines and rings are [lat, lon] pairs, as mapGeo() hands them out.
 */
import type { Bbox, Pair } from "./geom";

export type Sev = "Severe" | "High" | "Medium" | "Low";
export const SEVS: Sev[] = ["Severe", "High", "Medium", "Low"];

/** One incident: only what the map, the list and the answer need. Never a complainant's personal data. */
export interface Inc {
  id: string;
  cat: string;
  family: string;
  dept: string;
  ward: number | null;
  zone: number | null;
  taluk: string | null;
  lat: number;
  lon: number;
  /** metres; null = a source's own point */
  prec: number | null;
  /** may be drawn as a pin (PIN_PRECISION_M) */
  pinnable: boolean;
  place: string | null;
  /** effective status and open flag: the pipeline's, with the Collector's latest decision laid on top (effective.ts) */
  status: string;
  open: boolean;
  /** a news complaint the Collector already handed to a department: not listed as an open incident (intel.ts ROUTED) */
  routed?: boolean;
  sev: Sev;
  priority: number;
  reasons: string | null;
  slaDue: string | null;
  breached: boolean;
  /** IST wall clock "YYYY-MM-DD HH:MM:SS" */
  first: string;
  title: string;
  citizen: number;
  sources: number;
  /** news outlets that reported it (0 or missing = not in the news) */
  outlets?: number;
  hotspot: string | null;
  /** who or what the reports mention ("school|children", "hospital", "elderly"): mentions, never distances */
  tags?: string | null;
}

/** A facility or place point (school, hospital, police station, gauge, neighbourhood...). */
export interface PointFeat {
  id: string;
  layer: LayerId;
  name: string | null;
  name_ta: string | null;
  alt?: string[];
  lat: number;
  lon: number;
  kind: string;
  government?: boolean;
  in_district: boolean;
  ward: number | null;
}

/** A road or a waterway: one named line (several OSM ways that touch), [lat, lon] pairs. */
export interface LineFeat {
  id: string;
  layer: LayerId;
  name: string;
  name_ta: string | null;
  alt: string[];
  kind: string;
  ref: string | null;
  lines: Pair[][];
  bbox: Bbox;
  length_m: number;
  wards: number[];
  in_district: boolean;
}

/** A lake or pond outline. */
export interface PolyFeat {
  id: string;
  layer: LayerId;
  name: string | null;
  name_ta: string | null;
  kind: string;
  polys: Pair[][][];
  bbox: Bbox;
  lat: number;
  lon: number;
  area_ha: number;
  in_district: boolean;
  ward: number | null;
}

export interface WardGeo {
  ward: number;
  zone: number;
  zoneName: string;
  taluk: string | null;
  rings: Pair[][];
  bbox: Bbox;
  lat: number;
  lon: number;
  /** contiguous wards, from the pipeline (ref_wards.adjacent_wards) */
  adj: number[];
  /** the pipeline's Gi* z-score over all incidents of the last 30 days */
  gi30: number | null;
}

/**
 * A news article about an incident in the district (documents: is_district and is_incident). `level` is how precisely
 * the article names its place: only "locality" is drawn as a pin; taluk, zone and district are counted, never pinned.
 */
export interface NewsDoc {
  id: string;
  title: string;
  title_en: string | null;
  url: string | null;
  outlet: string;
  /** IST wall clock "YYYY-MM-DD HH:MM:SS" */
  at: string;
  cat: string | null;
  /** the department the pipeline assigned (an officer sees only their own) */
  dept: string | null;
  lat: number | null;
  lon: number | null;
  level: string;
  place: string | null;
  /** the incident the pipeline linked it to, if any */
  inc: string | null;
}
export const NEWS_PIN_LEVEL = "locality";

/** One reading of a live feed at a place (observation_signals: the latest per place and metric). */
export interface Reading { v: number; unit: string; z: number | null; anomaly: boolean; detail: string | null; full: number | null }
/**
 * A place a live feed measures: an IMD weather station, a PWD lake, a CPCB air station, a government hospital, a
 * reservoir, or the district's IMD warning. Readings by metric ("rainfall_24h_mm", "lake_pct_full", "aqi" ...).
 */
export interface CondPlace {
  id: string;
  kind: "rain" | "lake" | "air" | "hospital" | "reservoir" | "weather";
  name: string;
  lat: number;
  lon: number;
  /** newest reading, IST wall clock */
  at: string;
  source: string;
  m: Record<string, Reading>;
}
/** A PWD work with a site (desilting, drain, bund ...): progress against plan. */
export interface Work {
  id: string;
  title: string;
  type: string;
  asset: string | null;
  lat: number;
  lon: number;
  status: string;
  progress: number | null;
  /** progress minus planned progress, in points: below -10 is behind schedule */
  gap: number | null;
  target: string | null;
  office: string | null;
}

export interface Hotspot { id: string; cat: string; lat: number; lon: number; incidents: number; incidents30: number; open: number; wards: number[]; place: string | null }

export interface LayerMeta {
  id: LayerId;
  name_en: string;
  name_ta: string;
  kind: "point" | "line" | "polygon";
  source: string;
  licence: string;
  attribution: string;
  as_of: string | null;
  count: number;
}

export const LAYER_IDS = [
  "incidents", "schools", "colleges", "hospitals", "fire_stations", "police", "water_bodies", "waterways", "roads", "rail_metro", "osm_places",
  "lakes_store", "gauges", "pwd_assets", "hotspots"
] as const;
export type LayerId = (typeof LAYER_IDS)[number];
export type PointLayer = "schools" | "colleges" | "hospitals" | "fire_stations" | "police" | "rail_metro" | "osm_places" | "lakes_store" | "gauges" | "pwd_assets";
export type LineLayer = "roads" | "waterways";
export type PolyLayer = "water_bodies";
export const POINT_LAYERS: PointLayer[] = ["schools", "colleges", "hospitals", "fire_stations", "police", "rail_metro", "osm_places", "lakes_store", "gauges", "pwd_assets"];
export const LINE_LAYERS: LineLayer[] = ["roads", "waterways"];

export interface World {
  /** the console's "now" (asOf()): every default period ends here */
  now: string;
  /** the store's own as-of (newest record), for the "as of" line */
  dataAsOf: string;
  incidents: Inc[];
  points: Record<PointLayer, PointFeat[]>;
  lines: Record<LineLayer, LineFeat[]>;
  water: PolyFeat[];
  wards: WardGeo[];
  zones: { zone: number; name: string; lat: number; lon: number }[];
  taluks: { code: string; name: string; name_ta: string | null; lat: number; lon: number }[];
  hotspots: Hotspot[];
  /** news articles about incidents in the district, newest first (none in the unit-test world) */
  news?: NewsDoc[];
  /** live feeds with a place: weather, lakes, air, hospitals, reservoirs, PWD works (none in the unit-test world) */
  conds?: { places: CondPlace[]; works: Work[] };
  meta: Record<string, LayerMeta>;
  cats: Map<string, { label: string; label_ta: string | null; family: string; lead: string }>;
  depts: Map<string, { name: string }>;
  /** district bounds (all ward rings) */
  district: Bbox;
}
