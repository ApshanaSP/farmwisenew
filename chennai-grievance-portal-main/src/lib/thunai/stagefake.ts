/**
 * Fake data hands for Thunai's agent and screen tests: the shapes Ask District IQ's tools, the console's severity list and
 * news, and Ask the Map really return (taken from the local store on 29 Oct 2026, trimmed and with made-up values), so the
 * screen builders and the agent run without a database. Used by tests only.
 */
import type { ToolResult } from "@/lib/assistant/types";
import type { Hands } from "./screens";

const AS_OF = "2026-10-29 07:00:00";
type Row = Record<string, unknown>;

export const SEVERE: Row[] = [
  { id: "INC-A1", title: "Respected sir, retaining wall near New Colony caved in, call 9876543210", type: "Unsafe buildings & walls", cat_code: "BUILDING_SAFETY", zone: 5, zone_name: "Royapuram",
    loc: "Chetpet", lat: 13.0796, lon: 80.2612, sev: "Severe", status: "In progress", complaints: 0, t: "2026-10-28 07:41:25", breached: 1, dept: "PWD-WRD", dept_name: "PWD Water Resources",
    why: { summary: "Wall collapse at Chetpet" } },
  { id: "INC-A2", title: "Murder at Meenambakkam", type: "Violent crime", zone: 12, zone_name: "Alandur", loc: "Meenambakkam", lat: 12.98, lon: 80.18, sev: "Severe", status: "In progress",
    complaints: 2, t: "2026-10-28 12:00:00", breached: 0, dept: "POL-GCP", dept_name: "Greater Chennai Police", why: { summary: "Murder at Meenambakkam" } },
  { id: "INC-A3", title: "Bed Capacity Critical at Stanley Medical College", type: "Health services", zone: 5, zone_name: "Royapuram", loc: "Stanley Hospital", lat: 13.106, lon: 80.287,
    sev: "Severe", status: "Open", complaints: 0, t: "2026-10-29 00:00:00", breached: 1, dept: "HLT-DMS", dept_name: "Government Hospitals", why: { summary: "Hospital beds critical at Stanley" } },
  { id: "INC-A4", title: "Bridge railing broken, Saidapet", type: "Roads", zone: 13, zone_name: "Adyar", loc: "Saidapet", lat: 13.02, lon: 80.22, sev: "Severe", status: "Open", complaints: 5,
    t: "2026-10-29 06:30:00", breached: 0, dept: "PWD-WRD", dept_name: "PWD Water Resources", why: null },
  { id: "INC-A5", title: "Dengue surge at a government hospital", type: "Vector- & water-borne disease", zone: 13, zone_name: "Adyar", loc: "Guindy", lat: 13.01, lon: 80.21, sev: "Severe",
    status: "Open", complaints: 1, t: "2026-10-29 05:00:00", breached: 0, dept: "GCC-HLT", dept_name: "GCC Public Health", why: { summary: "Dengue surge at Guindy" } },
  { id: "INC-A6", title: "Chain snatching spree, Anna Nagar", type: "Theft", zone: 8, zone_name: "Anna Nagar", loc: "Anna Nagar", lat: 13.085, lon: 80.21, sev: "Severe", status: "Open", complaints: 3,
    t: "2026-10-29 03:00:00", breached: 0, dept: "POL-GCP", dept_name: "Greater Chennai Police", why: null },
  { id: "INC-H1", title: "Pothole, Royapuram", sev: "High", zone: 5, zone_name: "Royapuram", t: "2026-10-29 01:00:00" }
];

export const NEWS: Row[] = [
  { id: "N1", title: "Velachery lake overflows after night rain, flooding on 100 Feet Road", outletNames: ["The Hindu"], t: "2026-10-29 06:00:00", loc: "Velachery", incident: "INC-F1", url: "https://example.org/a" },
  { id: "N2", title: "Metro water supply cut in Anna Nagar on Thursday", outletNames: ["Dinamani"], t: "2026-10-29 05:00:00", loc: "Anna Nagar", incident: null, url: "javascript:alert(1)" },
  { id: "N3", title: "Flooding in Velachery: residents wade through knee-deep water", outletNames: ["DT Next"], t: "2026-10-29 04:00:00", loc: "Velachery", incident: "INC-F1", url: null }
];

const zoneRows = [
  { zone: 13, name: "Adyar", score: 36, severe: 4, high: 24, n: 120, open: 101, complaints: 64, n_prev: 100 },
  { zone: 7, name: "Ambattur", score: 20, severe: 4, high: 8, n: 80, open: 64, complaints: 35, n_prev: 85 },
  { zone: 14, name: "Perungudi", score: 30, severe: 2, high: 24, n: 59, open: 53, complaints: 20, n_prev: 40 },
  { zone: 8, name: "Anna Nagar", score: 59, severe: 8, high: 35, n: 143, open: 109, complaints: 62, n_prev: 95 }
];

const res = (data: unknown, facts: { id: string; label: string; value: number; unit?: string }[] = []): ToolResult =>
  ({ tool: "", args: {}, scope: null, asOf: AS_OF, data, facts, sources: [], incidentIds: [], testData: true, caveats: [] });

const series = (ns: number[]) => ({ buckets: ns.map((n, i) => ({ from: `2026-08-${String(1 + i * 7).padStart(2, "0")} 00:00:00`, to: "", n, severe: 0, open: Math.round(n / 2) })), unit: "week",
  normal: { lo: 9, hi: 18, mean: 13.7 } });

/** A fake of every data call the screens make; `calls` records them in order. */
export function fakeHands(over: Partial<Record<string, (args: Record<string, unknown>) => unknown>> = {}): Hands & { calls: string[] } {
  const calls: string[] = [];
  const TOOLS: Record<string, (a: Record<string, unknown>) => ToolResult> = {
    zones: () => res({ rows: zoneRows }, zoneRows.map((z) => ({ id: `zone.${z.zone}.severe`, label: `Severe in ${z.name}`, value: z.severe }))),
    change_drivers: (a) => {
      const z = (a.scope as { zone?: number } | undefined)?.zone ?? null;
      return res({ totals: { n: z === 14 ? 59 : 50, prev: 40, severe: 2, severePrev: 1, open: 40, overdue: 20, dead: 0, injured: 0, rainLinked: 23 }, rainDays: 4, rainDaysPrev: 7,
        categories: [{ code: "STREETLIGHT_ELECTRICAL", label: "Street lights & electrical hazards", n: 10, prev: 6, delta: 4 }, { code: "DRAINAGE_SEWAGE", label: "Drainage & sewage", n: 9, prev: 5, delta: 4 },
          { code: "ROAD_DAMAGE", label: "Roads", n: 3, prev: 6, delta: -3 }],
        places: [{ category: "Street lights", place: "Tharamani", n: 3, prev: 1 }], depts: [{ name: "Storm Water Drain", open: 12, overdue: 6 }],
        top: [{ id: "INC-P1", title: "Card game killing in Perungudi", place: "Perungudi", severity: "High", status: "Open", overdue: true, reasons: "High violent crime" }] },
      [{ id: "reported.now", label: "Incidents reported", value: 59 }, { id: "reported.prev", label: "before", value: 40 }]);
    },
    incident_series: () => res(series([12, 21, 10, 14, 29, 13, 16, 22, 24, 26, 20, 25, 17])),
    environment: (a) => res({ rows: a.metric === "lake_pct_full"
      ? [{ place_id: "L1", place: "Chembarambakkam", lat: 13.01, lon: 80.06, t: "2026-10-28 06:00:00", value: 40.2, mean28: 38.1, zscore: null, anomaly: false, detail: "storage" },
        { place_id: "L2", place: "Puzhal (Red Hills)", lat: 13.16, lon: 80.18, t: "2026-10-28 06:00:00", value: 72.9, mean28: 60, zscore: null, anomaly: false, detail: null },
        { place_id: "L3", place: "Veeranam", lat: 11.33, lon: 79.54, t: "2026-10-28 06:00:00", value: 73.9, mean28: 43.5, zscore: null, anomaly: false, detail: null }]
      : [{ place_id: "S1", place: "Chennai-Nungambakkam", lat: 13.06, lon: 80.24, t: "2026-10-28 08:30:00", value: 64.2, mean28: 12, zscore: 2.4, anomaly: true },
        { place_id: "S2", place: "Chennai-Meenambakkam", lat: 12.99, lon: 80.18, t: "2026-10-28 08:30:00", value: 31.5, mean28: 10, zscore: 1.1, anomaly: false },
        { place_id: "S3", place: "Chennai-Ennore", lat: 13.26, lon: 80.33, t: "2026-10-28 08:30:00", value: 12, mean28: 9, zscore: 0.2, anomaly: false },
        { place_id: "S4", place: "Chennai-Madhavaram", lat: 13.15, lon: 80.23, t: "2026-10-28 08:30:00", value: 4, mean28: 8, zscore: -0.4, anomaly: false }] }),
    departments: () => res({ rows: [{ code: "POL-GCP", name: "Greater Chennai Police", open: 392, n: 447, severe: 17, unverified: 1 }, { code: "GCC-SWD", name: "Storm Water Drain", open: 162, n: 200, severe: 0, unverified: 3 },
      { code: "PWD-WRD", name: "PWD Water Resources", open: 80, n: 90, severe: 5, unverified: 0 }] }),
    dept_backlog: () => res({ rows: [{ code: "POL-GCP", name: "Greater Chennai Police", hours: 856, n: 1264, overdue: 180, days: 36 }, { code: "PWD-WRD", name: "PWD Water Resources", hours: 744, n: 80, overdue: 30, days: 31 },
      { code: "GCC-SWD", name: "Storm Water Drain", hours: 168, n: 162, overdue: 54, days: 7 }] }),
    resolution_times: () => res({ rows: [{ code: "POL-GCP", name: "Greater Chennai Police", n: 300, days: 20, onTimePct: 40 }, { code: "GCC-SWD", name: "Storm Water Drain", n: 100, days: 5, onTimePct: 70 }] }),
    dept_followups: () => res({ rows: [{ code: "POL-GCP", name: "Greater Chennai Police", open: 392, overdue: 76, serious: 149, awaiting: 1, complaints: 16 }, { code: "GCC-SWD", name: "Storm Water Drain", open: 162, overdue: 54, serious: 20, awaiting: 3, complaints: 40 }] }),
    overview_kpis: () => res({ cur: { reported: 153, severe: 21, ongoing: 120, complaints: 60 }, prev: { reported: 158, severe: 18, ongoing: 110, complaints: 55 }, series: { reported: [20, 25, 22], severe: [3, 4, 2] } }),
    hotspots: () => res({ rows: [{ id: "HOT-1", cat: "FLOOD_WATERLOGGING", label: "Flooding & waterlogging", incidents_30d: 20, open: 7, lat: 13.08, lon: 80.26, top_place: "Periamet", zone: 5, zone_name: "Royapuram" },
      { id: "HOT-2", cat: "FLOOD_WATERLOGGING", label: "Flooding & waterlogging", incidents_30d: 18, open: 3, lat: 13.07, lon: 80.22, top_place: "Aminjikarai", zone: 8, zone_name: "Anna Nagar" }] }),
    incidents: (a) => res({ rows: SEVERE.slice(0, 4).map((r) => ({ ...r, place: r.loc, overdue: r.breached === 1, cat: a.scope ? "FLOOD_WATERLOGGING" : null })), total: 23, complaints: 8 },
      [{ id: "list.total", label: "Incidents matching", value: 23 }]),
    incident_detail: (a) => res({ incident: { ...SEVERE[2], id: a.id, place: "Stanley Hospital", sla_due: "2026-10-29 06:00:00", open_for: "6 hours", why: { what: ["Hospital alert level critical"], why: ["Past deadline"], next: "Move patients" } },
      reports: [{ t: "29 Oct 2026, 12:00 AM", source: "hospital", title: "Bed Capacity Critical" }], officials: [{ name: "N. Officer", designation: "Assistant Commissioner" }] }),
    briefing: () => res({ headline: ["158 incidents were reported in Chennai district (last 24 hours), 16% fewer than the previous period."], stats: { reported: 158, change: -16, open: 158, overdue: 5, severe: 6, newsOnly: 9 },
      attention: [{ id: "INC-A1", title: "Wall collapse at Chetpet", zone: "Royapuram", why: { attention: ["Past its deadline"] } }], emerging: [{ text: "Air pollution in Tondiarpet: 5 reports on 28 Oct" }], conditions: "rainfall 0 mm in 24 h" }),
    taluks: () => res({ rows: [{ code: "TLK-EGM", name: "Egmore", open: 50, severe: 3 }, { code: "TLK-MAM", name: "Mambalam", open: 40, severe: 1 }] }),
    search_records: () => res({ news: [] }),
    mandi_prices: () => res({ rows: [{ market: "Koyambedu", commodity: "Tomato", price: 42 }] }, [{ id: "price.tomato", label: "Tomato, Koyambedu, Rs/kg", value: 42, unit: "Rs/kg" }])
  };
  return {
    calls,
    tool: async (name, args) => {
      calls.push(name);
      if (over[name]) return over[name]!(args) as ToolResult;
      const f = TOOLS[name];
      if (!f) throw new Error(`no fake for ${name}`);
      return { ...f(args), tool: name, args };
    },
    severe: async () => { calls.push("console_severe"); return { rows: SEVERE, counts: { Severe: 6, High: 1, Medium: 0, Low: 0 }, asOf: AS_OF }; },
    news: async () => { calls.push("console_news"); return { rows: NEWS, total: 34, asOf: AS_OF }; },
    map: async () => {
      calls.push("ask_map");
      return { answer: { headline: "23 open flooding incidents in Adyar (Zone 13) (last 30 days) · map layer ready." }, total: 2,
        rows: [{ id: "INC-F1", title: "Waterlogging, Velachery Main Road", sev: "High", zoneName: "Adyar", place: "Velachery", lat: 12.98, lon: 80.22, first: "2026-10-27 10:00:00" },
          { id: "INC-F2", title: "Lake surplus overflowing near PHC", sev: "Severe", zoneName: "Adyar", place: "Velachery", lat: 12.975, lon: 80.215, first: "2026-10-24 20:00:00" }],
        features: [{ id: "INC-F1", lat: 12.98, lon: 80.22 }, { id: "INC-F2", lat: 12.975, lon: 80.215 }],
        context: { points: [{ id: "osm:1", layer: "schools", name: "Akshaya School", lat: 12.9805, lon: 80.2205 }, { id: "osm:2", layer: "schools", name: "Far School", lat: 13.2, lon: 80.3 },
          { id: "osm:3", layer: "schools", name: "Velachery Govt School", lat: 12.979, lon: 80.223 }] },
        trace: [{ note_en: "Kept the incidents within 1 km of any school. Straight-line distance." }], asOf: { data: AS_OF } };
    }
  };
}
