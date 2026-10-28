/**
 * A small hand-made World for Ask the Map's unit tests: three square wards in two zones, 30 incidents with known
 * places and dates, two schools, a hospital and a clinic, a fire station, one road and one canal, a lake, and a few
 * named places (with Tamil names) for the resolver. Every expected answer in the tests is either hand-checked against
 * this table or computed by a brute-force oracle in the test.
 */
import { enRe, taRe } from "@/lib/collector/nlp";
import { bboxOf, type Pair } from "./geom";
import type { Entry, ResolverData } from "./resolve";
import type { Inc, LineFeat, PointFeat, PolyFeat, Sev, WardGeo, World } from "./types";

export const NOW = "2026-10-27 20:00:00";
const sq = (s: number, w: number, n: number, e: number): Pair[] => [[s, w], [s, e], [n, e], [n, w], [s, w]];
const ward = (ward: number, zone: number, zoneName: string, taluk: string, ring: Pair[], adj: number[]): WardGeo => ({
  ward, zone, zoneName, taluk, rings: [ring], bbox: bboxOf(ring.map(([lat, lon]) => ({ lat, lon })))!,
  lat: (ring[0][0] + ring[2][0]) / 2, lon: (ring[0][1] + ring[2][1]) / 2, adj, gi30: null
});
export const WARDS: WardGeo[] = [
  ward(1, 1, "Northpet", "TLK-AAA", sq(13.0, 80.2, 13.01, 80.21), [2, 3]),
  ward(2, 1, "Northpet", "TLK-AAA", sq(13.0, 80.21, 13.01, 80.22), [1, 3]),
  ward(3, 2, "Southpet", "TLK-BBB", sq(13.01, 80.2, 13.02, 80.22), [1, 2])
];

/** days ago -> IST wall clock */
const ago = (d: number) => new Date(Date.parse(NOW.replace(" ", "T") + "Z") - d * 86_400_000).toISOString().slice(0, 19).replace("T", " ");

// id, cat, sev, open, lat, lon, precision, ward, zone, taluk, days ago, dept, citizen complaints, priority
type R = [string, string, Sev, 0 | 1, number, number, number | null, number | null, number | null, string | null, number, string, number, number];
const ROWS: R[] = [
  ["I01", "FLOOD_WATERLOGGING", "Severe", 1, 13.0052, 80.2052, 30, 1, 1, "TLK-AAA", 1, "GCC-SWD", 2, 90], // ~ 30 m from S1
  ["I02", "FLOOD_WATERLOGGING", "High", 1, 13.0070, 80.2050, 40, 1, 1, "TLK-AAA", 3, "GCC-SWD", 0, 70], // ~ 220 m from S1
  ["I03", "FLOOD_WATERLOGGING", "Medium", 1, 13.0090, 80.2050, 40, 1, 1, "TLK-AAA", 5, "GCC-SWD", 1, 50], // ~ 445 m from S1
  ["I04", "FLOOD_WATERLOGGING", "Low", 0, 13.0051, 80.2049, 30, 1, 1, "TLK-AAA", 2, "GCC-SWD", 0, 20], // closed, next to S1
  ["I05", "FLOOD_WATERLOGGING", "Severe", 1, 13.0150, 80.2152, 2500, 3, 2, "TLK-BBB", 1, "GCC-SWD", 0, 95], // at S2 but 2.5 km precision: never pinned
  ["I06", "FLOOD_WATERLOGGING", "High", 1, 13.0152, 80.2150, 2000, 3, 2, "TLK-BBB", 4, "GCC-SWD", 3, 80], // exactly 2,000 m: pinnable
  ["I07", "FLOOD_WATERLOGGING", "Medium", 1, 13.0153, 80.2155, 50, 3, 2, "TLK-BBB", 40, "GCC-SWD", 0, 40], // 40 days ago
  ["I08", "SOLID_WASTE", "Low", 1, 13.0010, 80.2101, 30, 1, 1, "TLK-AAA", 2, "GCC-SWM", 1, 30], // on Test Salai
  ["I09", "SOLID_WASTE", "Low", 1, 13.0012, 80.2102, 30, 2, 1, "TLK-AAA", 6, "GCC-SWM", 1, 31],
  ["I10", "SOLID_WASTE", "Medium", 1, 13.0013, 80.2101, 30, 2, 1, "TLK-AAA", 8, "GCC-SWM", 2, 45],
  ["I11", "SOLID_WASTE", "Low", 1, 13.0011, 80.2099, 30, 1, 1, "TLK-AAA", 9, "GCC-SWM", 0, 25], // 4 within 30 m: a cluster
  ["I12", "SOLID_WASTE", "Low", 0, 13.0185, 80.2185, 30, 3, 2, "TLK-BBB", 12, "GCC-SWM", 1, 10],
  ["I13", "SOLID_WASTE", "Low", 1, 13.0186, 80.2190, 30, 3, 2, "TLK-BBB", 15, "GCC-SWM", 1, 12],
  ["I14", "ROAD_ACCIDENT", "Severe", 1, 13.0100, 80.2105, 30, 1, 1, "TLK-AAA", 1, "POL-GCP", 0, 99], // 54 m east of Test Salai
  ["I15", "ROAD_ACCIDENT", "High", 0, 13.0160, 80.2098, 30, 3, 2, "TLK-BBB", 20, "POL-GCP", 0, 60], // 22 m west of Test Salai
  ["I16", "ROAD_ACCIDENT", "Medium", 1, 13.0040, 80.2180, 30, 2, 1, "TLK-AAA", 25, "POL-GCP", 0, 41],
  ["I17", "CRIME_PROPERTY", "Medium", 1, 13.0101, 80.2108, 30, 3, 2, "TLK-BBB", 7, "POL-GCP", 1, 55], // 86 m from the road
  ["I18", "CRIME_PROPERTY", "Low", 1, 13.0170, 80.2030, 30, 3, 2, "TLK-BBB", 100, "POL-GCP", 0, 15],
  ["I19", "STREETLIGHT_ELECTRICAL", "Low", 1, 13.0030, 80.2160, 30, 2, 1, "TLK-AAA", 3, "GCC-ELE", 1, 22],
  ["I20", "STREETLIGHT_ELECTRICAL", "Low", 1, 13.0031, 80.2161, 30, 2, 1, "TLK-AAA", 10, "GCC-ELE", 1, 21],
  ["I21", "DRAINAGE_SEWAGE", "High", 1, 13.0028, 80.2175, 30, 2, 1, "TLK-AAA", 2, "GCC-SWD", 2, 75], // ~ 80 m from H1
  ["I22", "DRAINAGE_SEWAGE", "Medium", 1, 13.0120, 80.2025, 30, 3, 2, "TLK-BBB", 14, "GCC-SWD", 1, 35], // ~ 55 m from the clinic
  ["I23", "FLOOD_RELIEF", "Severe", 1, 13.0189, 80.2187, 30, 3, 2, "TLK-BBB", 1, "DIST-DM", 0, 88], // ~ 40 m from F1
  ["I24", "WATERBODY_INFRA", "High", 1, 13.0110, 80.2190, 30, 3, 2, "TLK-BBB", 6, "PWD-WRD", 0, 65], // at the lake edge
  ["I25", "FLOOD_WATERLOGGING", "Medium", 1, 13.0827, 80.2707, 15000, null, null, null, 2, "GCC-SWD", 0, 30], // district centroid: no exact place
  ["I26", "SOLID_WASTE", "Low", 1, 13.0055, 80.2150, 300, 2, 1, "TLK-AAA", 5, "GCC-SWM", 1, 26], // 300 m precision, at Testpet
  ["I27", "SOLID_WASTE", "Medium", 1, 13.0049, 80.2148, 800, 2, 1, "TLK-AAA", 6, "GCC-SWM", 2, 46],
  ["I28", "CRIME_PROPERTY", "Severe", 1, 13.0051, 80.2152, 30, 2, 1, "TLK-AAA", 12, "POL-GCP", 0, 85],
  ["I29", "FLOOD_WATERLOGGING", "High", 1, 13.0145, 80.2150, 40, 3, 2, "TLK-BBB", 9, "GCC-SWD", 0, 72], // ~ 75 m from S2
  ["I30", "FLOOD_WATERLOGGING", "Low", 1, 13.0010, 80.2195, 40, 2, 1, "TLK-AAA", 18, "GCC-SWD", 0, 18]
];
const FAMILY: Record<string, string> = { FLOOD_WATERLOGGING: "FLOOD", FLOOD_RELIEF: "FLOOD", WATERBODY_INFRA: "FLOOD", SOLID_WASTE: "WASTE_SANITATION", ROAD_ACCIDENT: "ROADS_TRAFFIC",
  CRIME_PROPERTY: "CRIME", STREETLIGHT_ELECTRICAL: "ELECTRICAL", DRAINAGE_SEWAGE: "DRAINAGE" };

export const INCIDENTS: Inc[] = ROWS.map(([id, cat, sev, open, lat, lon, prec, w, z, t, days, dept, citizen, priority]) => ({
  id, cat, family: FAMILY[cat], dept, ward: w, zone: z, taluk: t, lat, lon, prec, pinnable: prec == null || prec <= 2000, place: id === "I17" ? "Test Salai junction" : null,
  status: open ? "Open" : "Resolved", open: open === 1, sev, priority, reasons: `priority rule for ${id}`, slaDue: null, breached: ["I02", "I21", "I28"].includes(id),
  first: ago(days), title: `Incident ${id}`, citizen, sources: 1, hotspot: null
}));

const pt = (id: string, layer: PointFeat["layer"], name: string, lat: number, lon: number, kind: string, extra: Partial<PointFeat> = {}): PointFeat =>
  ({ id, layer, name, name_ta: null, lat, lon, kind, in_district: true, ward: null, ...extra });
export const SCHOOLS = [pt("osm:n1", "schools", "Govt School Northpet", 13.005, 80.205, "school", { government: true }), pt("osm:n2", "schools", "St. Test School", 13.015, 80.215, "school")];
export const HOSPITALS = [pt("osm:n3", "hospitals", "Test General Hospital", 13.0021, 80.2181, "hospital", { government: true }), pt("osm:n4", "hospitals", "Corner Clinic", 13.0124, 80.2021, "clinic")];
export const FIRE = [pt("osm:n5", "fire_stations", "Southpet Fire Station", 13.0192, 80.2189, "fire_station")];
const line = (id: string, layer: LineFeat["layer"], name: string, path: Pair[], kind: string, alt: string[] = [], name_ta: string | null = null): LineFeat =>
  ({ id, layer, name, name_ta, alt, kind, ref: null, lines: [path], bbox: bboxOf(path.map(([lat, lon]) => ({ lat, lon })))!, length_m: 2224, wards: [1, 2, 3], in_district: true });
export const ROAD = line("road:test-salai", "roads", "Test Salai", [[13.0, 80.21], [13.02, 80.21]], "primary", ["Old Test Road"], "டெஸ்ட் சாலை");
export const CANAL = line("water:test-canal", "waterways", "Test Canal", [[13.0, 80.2195], [13.02, 80.2195]], "canal", [], "டெஸ்ட் கால்வாய்");
const lakeRing = sq(13.0105, 80.2192, 13.0115, 80.2199);
export const LAKE: PolyFeat = { id: "osm:w9", layer: "water_bodies", name: "Test Eri", name_ta: "டெஸ்ட் ஏரி", kind: "lake", polys: [[lakeRing]],
  bbox: bboxOf(lakeRing.map(([lat, lon]) => ({ lat, lon })))!, lat: 13.011, lon: 80.21955, area_ha: 0.8, in_district: true, ward: 3 };

export function fixtureWorld(): World {
  const empty: PointFeat[] = [];
  return {
    now: NOW, dataAsOf: NOW, incidents: INCIDENTS,
    points: { schools: SCHOOLS, colleges: empty, hospitals: HOSPITALS, fire_stations: FIRE, police: empty, rail_metro: empty, osm_places: empty, lakes_store: empty, gauges: empty, pwd_assets: empty },
    lines: { roads: [ROAD], waterways: [CANAL] }, water: [LAKE], wards: WARDS,
    zones: [{ zone: 1, name: "Northpet", lat: 13.005, lon: 80.21 }, { zone: 2, name: "Southpet", lat: 13.015, lon: 80.21 }],
    taluks: [{ code: "TLK-AAA", name: "Aaa", name_ta: "ஆஆ", lat: 13.005, lon: 80.21 }, { code: "TLK-BBB", name: "Bbb", name_ta: null, lat: 13.015, lon: 80.21 }],
    hotspots: [], meta: {},
    cats: new Map(Object.keys(FAMILY).map((c) => [c, { label: c.replace(/_/g, " ").toLowerCase(), label_ta: null, family: FAMILY[c], lead: "GCC-SWD" }])),
    depts: new Map([["GCC-SWD", { name: "Storm Water Drain" }], ["GCC-SWM", { name: "Solid Waste Management" }], ["POL-GCP", { name: "Greater Chennai Police" }]]),
    district: { s: 13.0, w: 80.2, n: 13.02, e: 80.22 }
  };
}

const ent = (kind: Entry["kind"], ref: string, name_en: string, name_ta: string | null, lat: number | null, lon: number | null, en: string[], ta: string[] = [], layer?: Entry["layer"]): Entry =>
  ({ kind, ref, name_en, name_ta, lat, lon, layer, res: [...en.map(enRe), ...ta.map(taRe)] });

/** Resolver entries for the router tests: Chennai names (so the questions read naturally) with the fixture's coordinates. */
export function fixtureResolver(): ResolverData {
  return {
    entries: [
      ent("zone", "zone:13", "Adyar", null, 13.006, 80.257, ["Adyar"], ["அடையாறு"]),
      ent("zone", "zone:10", "Kodambakkam", null, 13.05, 80.22, ["Kodambakkam"], ["கோடம்பாக்கம்"]),
      ent("zone", "zone:1", "Northpet", null, 13.005, 80.21, ["Northpet"]),
      ent("locality", "loc:Adyar", "Adyar", "அடையாறு", 13.0012, 80.2565, ["Adyar"], ["அடையாறு"]),
      ent("locality", "loc:Velachery", "Velachery", "வேளச்சேரி", 12.9815, 80.218, ["Velachery"], ["வேளச்சேரி"]),
      ent("locality", "loc:Saidapet", "Saidapet", "சைதாப்பேட்டை", 13.0213, 80.2231, ["Saidapet"], ["சைதாப்பேட்டை"]),
      ent("locality", "loc:T. Nagar", "T. Nagar", "தி.நகர்", 13.0418, 80.2341, ["T. Nagar", "Thyagaraya Nagar"], ["தி.நகர்"]),
      ent("locality", "loc:Marina", "Marina", "மெரினா", 13.05, 80.2824, ["Marina", "Marina Beach"], ["மெரினா"]),
      ent("locality", "loc:Testpet", "Testpet", "டெஸ்ட்பேட்டை", 13.005, 80.215, ["Testpet"], ["டெஸ்ட்பேட்டை"]),
      ent("locality", "loc:Koyambedu", "Koyambedu", "கோயம்பேடு", 13.0694, 80.1948, ["Koyambedu"], ["கோயம்பேடு"]),
      ent("taluk", "taluk:TLK-VLC", "Velachery", "வேளச்சேரி", null, null, ["Velachery"], ["வேளச்சேரி"]),
      ent("taluk", "taluk:TLK-MYL", "Mylapore", "மயிலாப்பூர்", null, null, ["Mylapore"], ["மயிலாப்பூர்"]),
      ent("facility", "osm:n77", "Stanley Hospital", null, 13.1053, 80.2857, ["Stanley Hospital", "Stanley Medical College Hospital"], [], "hospitals"),
      ent("facility", "osm:n78", "Koyambedu Bus Terminus", null, 13.0679, 80.2058, ["Koyambedu Bus Terminus", "Koyambedu bus stand", "CMBT"], [], "rail_metro"),
      ent("road", "road:anna-salai", "Anna Salai", "அண்ணா சாலை", null, null, ["Anna Salai", "Mount Road"], ["அண்ணா சாலை"], "roads"),
      ent("road", "road:rajiv-gandhi-salai", "Rajiv Gandhi Salai", null, null, null, ["Rajiv Gandhi Salai", "OMR", "Old Mahabalipuram Road"], [], "roads"),
      ent("road", "road:gst-road", "Grand Southern Trunk Road", null, null, null, ["Grand Southern Trunk Road", "GST Road", "GST"], [], "roads"),
      ent("road", "road:ecr", "East Coast Road", null, null, null, ["East Coast Road", "ECR"], [], "roads"),
      ent("road", "road:poonamallee-high-road", "Poonamallee High Road", null, null, null, ["Poonamallee High Road", "PH Road"], [], "roads"),
      ent("road", "road:test-salai", "Test Salai", "டெஸ்ட் சாலை", null, null, ["Test Salai", "Old Test Road"], ["டெஸ்ட் சாலை"], "roads"),
      ent("waterway", "water:buckingham-canal", "Buckingham Canal", "பக்கிங்ஹாம் கால்வாய்", null, null, ["Buckingham Canal"], ["பக்கிங்ஹாம் கால்வாய்"], "waterways"),
      ent("waterway", "water:adyar-river", "Adyar River", "அடையாறு", null, null, ["Adyar River"], ["அடையாறு ஆறு"], "waterways"),
      ent("waterway", "water:test-canal", "Test Canal", null, null, null, ["Test Canal"], [], "waterways")
    ],
    streets: new Map([["lake view road", "Lake View Road"], ["bakthavatchalam road", "Bakthavatchalam Road"]])
  };
}
