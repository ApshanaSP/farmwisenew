/**
 * The Ask box's six suggested questions, made by rules from the live data so that each returns a non-empty answer:
 * the category with the most open severe cases near schools, this week's busiest category as hotspots, the zone with
 * the most past-deadline cases, flooding near hospitals, the top complaint by ward, and one in Tamil. Every candidate
 * is run through the same router and executor; an empty one is dropped. Cached per store build.
 */
import { makeResolver } from "./resolve";
import { rulesRoute } from "./route";
import { runMapPlan, type Ctx } from "./execute";
import { placeLookup } from "./ask";
import { world } from "./world";

/** Everyday words for the categories a suggestion may name ("garbage", not "Garbage & solid waste"). */
const WORDS: Record<string, { en: string; ta: string }> = {
  SOLID_WASTE: { en: "garbage", ta: "குப்பை" }, FLOOD_WATERLOGGING: { en: "waterlogging", ta: "மழைநீர் தேக்கம்" }, ROAD_ACCIDENT: { en: "road accidents", ta: "சாலை விபத்துகள்" },
  CRIME_PROPERTY: { en: "thefts", ta: "திருட்டு" }, STREETLIGHT_ELECTRICAL: { en: "streetlight problems", ta: "தெருவிளக்கு" }, DRAINAGE_SEWAGE: { en: "drainage complaints", ta: "கழிவுநீர்" },
  ROAD_DAMAGE: { en: "potholes", ta: "சாலை சேதம்" }, VECTOR_DISEASE: { en: "dengue cases", ta: "டெங்கு" }, WATER_SUPPLY: { en: "drinking water complaints", ta: "குடிநீர்" },
  STRAY_ANIMALS: { en: "stray dog complaints", ta: "தெருநாய்" }
};

declare global {
  // eslint-disable-next-line no-var
  var __askMapSuggest: { key: string; list: string[] } | undefined;
}

export async function suggestions(): Promise<string[]> {
  const { world: w, resolver } = await world();
  const key = `${w.incidents.length}|${w.dataAsOf}|${w.now.slice(0, 13)}`;
  if (global.__askMapSuggest?.key === key) return global.__askMapSuggest.list;
  const resolve = makeResolver(resolver);
  const ctx: Ctx = { place: placeLookup(w, resolver), lang: "en" };
  const count = (q: string): number => {
    const r = rulesRoute(q, null, { resolve, dept: () => null });
    if (r?.kind !== "plan") return 0;
    try { return runMapPlan(r.plan, w, ctx).hits.length; } catch { return 0; }
  };
  // which categories are open now, most first
  const open = new Map<string, number>();
  for (const i of w.incidents) if (i.open && WORDS[i.cat]) open.set(i.cat, (open.get(i.cat) ?? 0) + 1);
  const cats = [...open.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const out: string[] = [];
  const add = (q: string | null) => { if (q && !out.includes(q) && count(q) > 0) out.push(q); };

  // 1. the category with the most open cases within 300 m of a school
  let best: [string, number] | null = null;
  for (const c of cats.slice(0, 6)) { const n = count(`${WORDS[c].en} within 300 m of schools`); if (!best || n > best[1]) best = [c, n]; }
  if (best) add(`${WORDS[best[0]].en} within 300 m of schools`);
  // 2. this week's busiest category, as hotspots
  const week = new Map<string, number>();
  for (const i of w.incidents) if (WORDS[i.cat] && i.first > shift(w.now, -7 * 24)) week.set(i.cat, (week.get(i.cat) ?? 0) + 1);
  const top = [...week.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top) add(`where are ${WORDS[top].en} clustering`);
  // 3. the zone with the most open past-deadline cases
  const over = new Map<number, number>();
  for (const i of w.incidents) if (i.open && i.breached && i.zone != null) over.set(i.zone, (over.get(i.zone) ?? 0) + 1);
  const z = [...over.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (z) add(`past-deadline cases in zone ${z}`);
  // 4. flooding near hospitals, 5. the top complaint by ward, 6. one in Tamil
  add("open flooding within 500 m of hospitals");
  if (cats[0]) add(`${WORDS[cats[0]].en} complaints by ward`);
  add("அடையாறு அருகே திறந்த புகார்கள்");
  for (const q of ["thefts along Anna Salai this month", "compare Adyar and Velachery flooding", "which ward is farthest from a fire station", `${WORDS[cats[1] ?? "SOLID_WASTE"].ta} பள்ளிகள் அருகே`]) {
    if (out.length >= 6) break;
    add(q);
  }
  const list = out.slice(0, 6);
  global.__askMapSuggest = { key, list };
  return list;
}
const shift = (wall: string, h: number) => new Date(Date.parse(wall.replace(" ", "T") + "Z") + h * 3600_000).toISOString().slice(0, 19).replace("T", " ");
