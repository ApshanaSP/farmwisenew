/**
 * v10: Ask the Map answers for the map-by-voice tests (map10, tour10, mapops): a hotspot answer and a "within 500 m of hospitals" answer, built
 * by hand in the shape lib/map/ask.ts AskResponse has. No store, no network.
 */
import type { AskResponse } from "@/lib/map/ask";
import { planChips } from "@/lib/map/chips";
import type { Plan } from "@/lib/map/plan";

const BASE = {
  kind: "answer", lang: "en", edited: null, trace: [], unplaced: [], hidden: 0, context: { points: [], lines: [], polys: [], areas: [], places: [], rings: [] },
  insights: [], conditions: [], news: null, before: [], brief: null, say: null, followups: [], ui: null, uiDept: null, asOf: { now: "", data: "", layers: [] }, ai_used: false, ms: 1
};

/** a hotspot answer with `k` clusters: cluster i has 10 - i cases, the first two of them severe, its last one closed */
export function hotspotAnswer(k: number): AskResponse {
  const places = ["Kasimedu", "Royapuram", null, "Adyar", "Velachery", "Tondiarpet", "Mylapore"];
  const clusters = Array.from({ length: k }, (_, i) => ({ id: `c${i}`, n: 10 - i, lat: 13 + i / 100, lon: 80.2 + i / 100, ids: Array.from({ length: 10 - i }, (_, j) => `I${i}-${j}`), place: places[i] ?? null }));
  const features = clusters.flatMap((c, i) => c.ids.map((id, j) => ({ id, lat: c.lat, lon: c.lon, sev: j < 2 ? "Severe" : "Medium", open: j !== 9 - i, cat: "SOLID_WASTE", pinnable: true, prec: 10, title: "t", rank: j, citizen: false, news: false })));
  const rows = features.map((f, n) => ({ id: f.id, ward: 40 + Number(f.id.slice(1, f.id.indexOf("-"))), open: f.open, pinnable: true, priority: 100 - n, title: "t", place: null }));
  const tour = clusters.slice(0, 5).map((c, i) => ({ id: c.id, lat: c.lat, lon: c.lon, caption_en: `${i + 1}. ${c.n} reports${c.place ? ` near ${c.place}` : ""}, Ward ${40 + i}`, caption_ta: `${i + 1}. ${c.n} அறிக்கைகள்` }));
  const shots = [{ caption_en: "", caption_ta: "" }, ...tour.slice(0, 3).map((t) => ({ caption_en: t.caption_en, caption_ta: t.caption_ta }))];
  return { ...BASE, plan: { steps: [{ op: "take", as: "a", layer: "incidents", filter: null, where: null }, { op: "hotspot", as: "h", of: "a" }], show: "h", language: "en" }, chips: [],
    answer: { count: features.length, headline: `${features.length} open incidents (today)`, meaning: null, depts: [], miss: null, facts: [], lang: "en" },
    rows, total: rows.length, features, extra: { clusters },
    camera: { shape: "hotspot", areas: [], points: [], line: null, focus: null, tour, district: { s: 12.8, w: 80, n: 13.3, e: 80.4 } }, shots: k ? shots : [{ caption_en: "", caption_ta: "" }],
    glance: null } as unknown as AskResponse;
}

export const WITHIN_PLAN: Plan = {
  steps: [
    { op: "take", as: "a", layer: "incidents", where: null, filter: { category: null, family: ["FLOOD"], severity: null, status: "open", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 7, offset: 0 }, text: null } },
    { op: "take", as: "f1", layer: "hospitals", filter: null, where: { government: null, kinds: ["hospital", "health_centre"] } },
    { op: "within", as: "near", of: "a", near: ["f1"], meters: 500 }
  ], show: "near", language: "en"
} as Plan;

/** "open flooding within 500 m of hospitals": 12 cases, 9 open with an exact place, 3 past deadline, held by two departments */
export function withinAnswer(plan: Plan = WITHIN_PLAN): AskResponse {
  const pts = Array.from({ length: 12 }, (_, i) => ({ id: `F${i}`, lat: 13 + (i % 4) / 100, lon: 80.2 + Math.floor(i / 4) / 100 }));
  const rows = pts.map((p, i) => ({ id: p.id, title: `Water stagnation ${i}`, sev: i < 4 ? "Severe" : "High", status: i < 9 ? "open" : "closed", open: i < 9, cat: "FLOOD_WATERLOGGING", catLabel: "Flooding",
    dept: i % 2 ? "GCC-SWD" : "CMWSSB", deptName: i % 2 ? "Storm Water Drains" : "Metro Water", ward: 170 + (i % 3), zone: 13, zoneName: "Adyar", first: "", place: i === 0 ? "Kotturpuram" : null,
    pinnable: true, prec: 10, priority: 100 - i, reasons: null, near: null, overdue: i < 3, citizen: false, news: false, press: [] }));
  const features = pts.map((p, i) => ({ ...p, sev: rows[i].sev, open: rows[i].open, cat: rows[i].cat, pinnable: true, prec: 10, title: rows[i].title, rank: i, citizen: false, news: false }));
  const names = { cat: (c: string) => c, dept: (c: string) => c, area: () => ({ en: "Adyar", ta: "அடையாறு" }), line: () => ({ en: "road", ta: "சாலை" }) };
  const days = plan.steps[0].op === "take" && plan.steps[0].filter?.period?.kind === "last_days" ? plan.steps[0].filter.period.days : 7;
  const within = plan.steps.find((s) => s.op === "within");
  const m = within?.op === "within" ? within.meters : 500;
  return { ...BASE, plan, chips: planChips(plan, names),
    answer: { count: 12, headline: `12 flooding incidents within ${m} m of hospitals (last ${days} days)`, meaning: "Most are held by Storm Water Drains.", lang: "en", miss: null, facts: [{ id: "open", value: 9, label: "open" }],
      depts: [{ code: "GCC-SWD", name: "Storm Water Drains", n: 6 }, { code: "CMWSSB", name: "Metro Water", n: 6 }] },
    trace: [{ as: "near", op: "within", count: 12, note_en: `Kept those within ${m} m of a hospital.`, note_ta: "", layer: null, ids: [] }],
    rows, total: 12, features, extra: {}, camera: { shape: "district", areas: [], points: [], line: null, focus: null, tour: [], district: { s: 12.8, w: 80, n: 13.3, e: 80.4 } },
    shots: [{ caption_en: "", caption_ta: "" }],
    glance: { open: { n: 9, ids: [] }, overdue: { n: 3, ids: [] }, severe: { n: 4, ids: [] }, where: null, who: null },
    followups: ["only severe", "which department has the most?", "send these to Storm Water Drains", "make it 1 km"] } as unknown as AskResponse;
}

/** an area brief ("what is happening within 500 m of ..."): 7 open issues, mostly garbage, 2 past deadline */
export function briefAnswer(label = "Within 500 m of the spot"): AskResponse {
  return { ...BASE, kind: "brief", plan: null, chips: [], answer: null, rows: [], total: 7, features: [], extra: {}, glance: null,
    camera: { shape: "area", areas: [], points: [], line: null, focus: null, tour: [], district: { s: 12.8, w: 80, n: 13.3, e: 80.4 } }, shots: [{ caption_en: label, caption_ta: label }],
    brief: { area: { kind: "drawn", id: "13,80.2,500" }, label: { en: label, ta: label }, open: { n: 7, ids: [] }, byType: [{ cat: "SOLID_WASTE", en: "Garbage", ta: "குப்பை", n: 4, ids: [] }],
      worst: [], depts: [{ code: "GCC-SWM", name: "Solid Waste", open: 4, overdue: 2, ids: [], overdueIds: [] }], change: { now: 7, before: 5, nowIds: [], beforeIds: [], pct: 40, en: "", ta: "" },
      facilities: [], citizen: { n: 3, ids: [] }, unplaced: { n: 0, ids: [] }, rule_en: "", rule_ta: "" } } as unknown as AskResponse;
}
