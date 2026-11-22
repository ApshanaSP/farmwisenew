/**
 * The AI's two small jobs in Ask the Map, and nothing more: fill the typed plan for a question the rules could not read
 * (or edit the current plan for a follow-up), and reword the answer's template sentence. It never computes a number,
 * writes SQL, picks a feature to show or moves the map. A plan it returns is checked like any other (checkPlan); a
 * failed check is retried once with the problems, then becomes chips. A rewording whose numbers are not in the facts
 * is dropped and the template stands.
 *
 * Ask the Map final (20 Nov 2026): the calls go out as the "map" feature (lib/ai/gateway.ts featureProviders): Claude Haiku 5.5 first, with the
 * flat plan as structured outputs (every field required, a sentinel for none) and the long fixed part of the prompt (layers, kinds, categories,
 * departments, zones, examples) as the cached system block; then Nova Lite, Groq and Gemini, whatever AI_FORCE_PROVIDER says for the rest of the
 * console. The question, the places it names and the rules' hint are the only per-call text.
 */
import { generateJson, type CallInfo } from "@/lib/ai/gateway";
import { extractNumbers } from "@/lib/assistant/verify";
import { z } from "zod";
import { checkPlan, type AreaRef, type Plan } from "./plan";
import { WirePlan, fromWire, toWire } from "./wire";
import { wordTables } from "./route";

/** v2: a question of one to three words names a layer, a kind of problem or a place ("garbage" is garbage complaints, not junk text). */
const short = (t: string) => t.trim().split(/\s+/).length <= 3;
const SHORT_NOTE = "\nA SHORT QUESTION: it names a layer, a kind of problem (garbage means garbage complaints, not junk text; overdue means cases past deadline; today means today's cases) or a place, and is then a map question: intent plan (or brief for a place), understood true. Random letters, a single letter or a greeting are not_map.";

/**
 * v2: the plan made to use what the model named before writing it: the categories it named on the incidents' take when the take has none (or
 * only their family), each layer it named taken, the zone or ward it named as an area when the plan has none. The model's own reading, kept.
 */
export function withNamed(plan: Plan, w: Pick<WirePlan, "named_categories" | "named_layers" | "named_zone" | "named_ward"> & { named_places?: string[] }, cats: string[], refs: string[] = []): Plan {
  // a broad word ("flooding", "crime") is named as its family; a precise one as its category
  const named = (w.named_categories ?? []).filter((c) => cats.includes(c));
  const namedFam = (w.named_categories ?? []).filter((c) => FAMILIES.includes(c));
  let steps = plan.steps.map((st) => {
    if (st.op !== "take" || st.layer !== "incidents" || !st.filter || (!named.length && !namedFam.length)) return st;
    const f = st.filter;
    if (f.category?.some((c) => named.includes(c)) || f.family?.some((c) => namedFam.includes(c))) return st;
    if (f.category?.length || f.family?.length) return st;
    return { ...st, filter: { ...f, category: named.length ? named : null, family: named.length ? null : namedFam } };
  });
  let show = plan.show;
  const isIncShow = (): boolean => { const chain = (n: string): string | null => { const x = steps.find((y) => y.as === n); return !x ? null : x.op === "take" ? x.layer : "of" in x ? chain(x.of) : null; }; return chain(show) === "incidents"; };
  // an area it named and the plan left out: inside that area, on the answer (when the answer is incidents or a layer's places)
  const hasArea = steps.some((x) => x.op === "along" || x.op === "inside" || x.op === "compare" || x.op === "farthest" || x.op === "rank" || x.op === "speed" || (x.op === "count_by" && x.by !== "near" && x.by !== "category" && x.by !== "dept"));
  // a place it named from the prompt's list: its zone, ward, taluk or point (1 km), as the model read it
  const ref = (w.named_places ?? []).find((x) => refs.includes(x));
  const fromRef = (r: string): AreaRef | null => {
    const m = /^(zone|ward):(\d+)$/.exec(r);
    if (m) return { kind: m[1] as "zone" | "ward", id: Number(m[2]) } as AreaRef;
    if (r.startsWith("taluk:")) return { kind: "taluk", code: r.slice(6) };
    if (/^(road|gcc|waterway):/.test(r)) return null;
    return { kind: "point", ref: r, radius_m: 1000 };
  };
  const area: AreaRef | null = w.named_ward >= 1 && w.named_ward <= 200 ? { kind: "ward", id: Math.round(w.named_ward) } : w.named_zone >= 1 && w.named_zone <= 15 ? { kind: "zone", id: Math.round(w.named_zone) } : ref ? fromRef(ref) : null;
  if (area && !hasArea) {
    const last = steps.find((x) => x.as === show);
    if (last && (last.op === "take" || last.op === "within" || isIncShow())) {
      const as = steps.some((x) => x.as === "in") ? "in_named" : "in";
      steps = [...steps, { op: "inside", as, of: show, area }];
      show = as;
    }
  }
  return { ...plan, steps, show };
}

/** An example plan with its named slots first, filled from its own steps (the order the model writes them). */
function namedOf(p: W): W {
  const steps = (p.steps ?? []) as W[];
  const cats = steps.flatMap((x) => (Array.isArray(x.category) ? (x.category as string[]) : []));
  const layers = steps.filter((x) => x.op === "take" && x.layer && x.layer !== "incidents").map((x) => x.layer as string);
  const zone = steps.find((x) => x.area_kind === "zone")?.area_id ?? -1;
  const ward = steps.find((x) => x.area_kind === "ward")?.area_id ?? -1;
  const { understood, ...rest } = p;
  const places = steps.flatMap((x) => (typeof x.area_ref === "string" ? [x.area_ref] : typeof x.from === "string" && x.from.startsWith("place:") ? [x.from.slice(6)] : []));
  return { understood: understood ?? true, named_categories: cats, named_layers: layers, named_places: places, named_zone: zone, named_ward: ward, ...rest };
}

/** The families a take may name (the prompt lists them; anything else is refused and asked again). */
const FAMILIES = ["FLOOD", "CRIME", "DRAINAGE", "ROADS_TRAFFIC", "HEALTH", "WASTE_SANITATION", "PUBLIC_SAFETY", "STRUCTURES_LAND", "ELECTRICAL", "PUBLIC_ORDER", "WORKS", "ENVIRONMENT", "GREEN", "ADMIN", "OTHER"];
import { LAYER_IDS, type LayerId } from "./types";
import type { Fact } from "./answer";
import type { Lang } from "./words";

type W = Record<string, unknown>;
const take = (as: string, layer: string, x: W = {}): W => ({ op: "take", as, layer, ...x });
/** Examples in the compact form the prompt shows (fields not shown are none); toWire'd plans for the older ones. */
const NEW_EXAMPLES: [string, W][] = [
  ["wine shops within 100 m of a school or a temple", { understood: true, language: "en", show: "rule", steps: [
    take("f1", "liquor", { kinds: ["wine_shop"] }), take("n1", "schools"), take("n2", "worship", { kinds: ["hindu"] }),
    { op: "within", as: "rule", of: "f1", near: ["n1", "n2"], meters: 100 }] }],
  ["places more than 2 km from a ration shop", { understood: true, language: "en", show: "far", steps: [
    take("f1", "ration_shops"), { op: "farthest", as: "far", areas: "place", from: "f1", beyond_m: 2000 }] }],
  ["wards with no bank within 2 km", { understood: true, language: "en", show: "far", steps: [
    take("f1", "banks"), { op: "farthest", as: "far", areas: "ward", from: "f1", beyond_m: 2000 }] }],
  ["which 10 wards got worse for flooding this month", { understood: true, language: "en", show: "rank", steps: [
    take("a", "incidents", { family: ["FLOOD"], status: "any", period_days: 30, period_offset: 0 }),
    { op: "change", as: "chg", of: "a", period_days: 30, period_offset: 0, before_days: 30, before_offset: 1 },
    { op: "rank", as: "rank", of: "chg", by: "ward", order: "rise" }] }],
  ["ATMs in Zone 13", { understood: true, language: "en", show: "in", steps: [take("f1", "atms"), { op: "inside", as: "in", of: "f1", area_kind: "zone", area_id: 13 }] }],
  ["சந்தைகள் அருகே குப்பை புகார்கள்", { understood: true, language: "ta", show: "near", steps: [
    take("a", "incidents", { category: ["SOLID_WASTE"], status: "open", citizen: true, period_days: 7, period_offset: 0 }), take("f1", "markets"),
    { op: "within", as: "near", of: "a", near: ["f1"], meters: 500 }] }],
  ["indha vaaram endha zone-la vibathu adhigama aachu", { understood: true, language: "tanglish", show: "rank", steps: [
    take("a", "incidents", { category: ["ROAD_ACCIDENT"], status: "any", period_days: 7, period_offset: 0 }),
    { op: "change", as: "chg", of: "a", period_days: 7, period_offset: 0, before_days: 7, before_offset: 1 },
    { op: "rank", as: "rank", of: "chg", by: "zone", order: "rise" }] }],
  ["which hospitals have the most open garbage complaints around them", { understood: true, language: "en", show: "by", steps: [
    take("a", "incidents", { category: ["SOLID_WASTE"], status: "open", period_days: 7, period_offset: 0 }), take("f1", "hospitals"),
    { op: "within", as: "near", of: "a", near: ["f1"], meters: 500 }, { op: "count_by", as: "by", of: "near", by: "near" }] }],
  ["which zone is resolving complaints fastest", { understood: true, language: "en", show: "speed", steps: [
    take("a", "incidents", { status: "any", period_days: 90, period_offset: 0 }), { op: "speed", as: "speed", of: "a", by: "zone", order: "fast" }] }],
  ["what are people complaining about most this month", { understood: true, language: "en", show: "by", steps: [
    take("a", "incidents", { status: "open", period_days: 30, period_offset: 0 }), { op: "count_by", as: "by", of: "a", by: "category" }] }],
  ["school", { understood: true, intent: "plan", city: "none", language: "en", show: "f1", steps: [take("f1", "schools")] }],
  ["garbage", { understood: true, intent: "plan", city: "none", language: "en", show: "a", steps: [take("a", "incidents", { category: ["SOLID_WASTE"], status: "open", period_days: 7, period_offset: 0 })] }],
  ["kuppai", { understood: true, intent: "plan", city: "none", language: "tanglish", show: "a", steps: [take("a", "incidents", { category: ["SOLID_WASTE"], status: "open", period_days: 7, period_offset: 0 })] }],
  ["zone 9", { understood: true, intent: "brief", city: "none", language: "en", show: "in", steps: [take("a", "incidents", { status: "open" }), { op: "inside", as: "in", of: "a", area_kind: "zone", area_id: 9 }] }],
  ["where should i go first", { understood: true, intent: "plan", city: "none", language: "en", show: "by", steps: [take("a", "incidents", { status: "open", overdue: true }), { op: "count_by", as: "by", of: "a", by: "ward" }] }],
  ["chain snatching", { understood: true, intent: "plan", city: "none", language: "en", show: "a", steps: [take("a", "incidents", { category: ["CRIME_PROPERTY"], status: "open", period_days: 7, period_offset: 0 })] }],
  ["dog bite cases in zone 3", { understood: true, intent: "plan", city: "none", language: "en", show: "in", steps: [take("a", "incidents", { category: ["STRAY_ANIMALS"], status: "open", period_days: 7, period_offset: 0 }), { op: "inside", as: "in", of: "a", area_kind: "zone", area_id: 3 }] }],
  ["which ward has the most garbage complaints for its population", { understood: true, intent: "plan", city: "none", language: "en", show: "by", steps: [take("a", "incidents", { category: ["SOLID_WASTE"], status: "open", period_days: 30, period_offset: 0 }), { op: "count_by", as: "by", of: "a", by: "ward", per_people: true }] }],
  ["which taluk needs my attention", { understood: true, intent: "plan", city: "none", language: "en", show: "by", steps: [take("a", "incidents", { status: "open", overdue: true }), { op: "count_by", as: "by", of: "a", by: "taluk" }] }],
  ["accident black spots", { understood: true, intent: "plan", city: "none", language: "en", show: "hot", steps: [take("a", "incidents", { category: ["ROAD_ACCIDENT"], status: "any", period_days: 90, period_offset: 0 }), { op: "hotspot", as: "hot", of: "a" }] }],
  ["status of ward 120", { understood: true, intent: "brief", city: "none", language: "en", show: "in", steps: [take("a", "incidents", { status: "open" }), { op: "inside", as: "in", of: "a", area_kind: "ward", area_id: 120 }] }],
  ["mazhai thanni road la thengi irukku", { understood: true, intent: "plan", city: "none", language: "tanglish", show: "a", steps: [take("a", "incidents", { category: ["FLOOD_WATERLOGGING"], status: "open", period_days: 7, period_offset: 0 })] }],
  ["eve teasing cases taluk wise", { understood: true, intent: "plan", city: "none", language: "en", show: "by", steps: [take("a", "incidents", { category: ["CRIMES_AGAINST_WOMEN"], status: "open", period_days: 30, period_offset: 0 }), { op: "count_by", as: "by", of: "a", by: "taluk" }] }],
  ["restaurant food adulteration", { understood: true, intent: "plan", city: "none", language: "en", show: "a", steps: [take("a", "incidents", { category: ["FOOD_SAFETY"], status: "open", period_days: 30, period_offset: 0 })] }],
  ["will it rain tomorrow", { understood: true, intent: "city", city: "forecast", language: "en", show: "a", steps: [take("a", "incidents", { status: "open" })] }],
  ["is traffic bad right now", { understood: true, intent: "city", city: "traffic", language: "en", show: "a", steps: [take("a", "incidents", { status: "open" })] }],
  ["crime near bars in Zone 13", { understood: true, language: "en", show: "in", steps: [
    take("a", "incidents", { family: ["CRIME"], status: "open", period_days: 7, period_offset: 0 }), take("f1", "liquor", { kinds: ["bar", "pub"] }),
    { op: "within", as: "near", of: "a", near: ["f1"], meters: 500 }, { op: "inside", as: "in", of: "near", area_kind: "zone", area_id: 13 }] }]
];
/** A wire step written with only its fields that have a value: the prompt's examples, a tenth of the full form's length. */
export function compactWire(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(compactWire);
  if (!x || typeof x !== "object") return x;
  return Object.fromEntries(Object.entries(x as W).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, compactWire(v)]));
}

const EXAMPLES: [string, unknown][] = [
  ["garbage complaints within 200 m of hospitals", { steps: [
    { op: "take", as: "a", layer: "incidents", filter: { category: ["SOLID_WASTE"], family: null, severity: null, status: "open", dept: null, overdue: null, citizen: true, period: { kind: "last_days", days: 7, offset: 0 }, text: null }, where: null },
    { op: "take", as: "f1", layer: "hospitals", filter: null, where: { government: null, kinds: ["hospital", "health_centre"] } },
    { op: "within", as: "near", of: "a", near: ["f1"], meters: 200 }], show: "near", language: "en" }],
  ["பள்ளிகள் அருகே மழைநீர் தேக்கம்", { steps: [
    { op: "take", as: "a", layer: "incidents", filter: { category: ["FLOOD_WATERLOGGING"], family: null, severity: null, status: "open", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 7, offset: 0 }, text: null }, where: null },
    { op: "take", as: "f1", layer: "schools", filter: null, where: null },
    { op: "within", as: "near", of: "a", near: ["f1"], meters: 500 }], show: "near", language: "ta" }],
  ["Zone 10 vs Zone 13 open cases", { steps: [
    { op: "take", as: "a", layer: "incidents", filter: { category: null, family: null, severity: null, status: "open", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 7, offset: 0 }, text: null }, where: null },
    { op: "compare", as: "cmp", of: "a", a: { kind: "zone", id: 10 }, b: { kind: "zone", id: 13 } }], show: "cmp", language: "en" }],
  ["flooding zone wise this month", { steps: [
    { op: "take", as: "a", layer: "incidents", filter: { category: null, family: ["FLOOD"], severity: null, status: "open", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 30, offset: 0 }, text: null }, where: null },
    { op: "count_by", as: "by", of: "a", by: "zone" }], show: "by", language: "en" }],
  ["schools in Zone 11", { steps: [
    { op: "take", as: "f1", layer: "schools", filter: null, where: null },
    { op: "inside", as: "in", of: "f1", area: { kind: "zone", id: 11 } }], show: "in", language: "en" }],
  ["areas with no fire station within 3 km", { steps: [
    { op: "take", as: "f1", layer: "fire_stations", filter: null, where: null },
    { op: "farthest", as: "far", areas: "ward", from: "f1", beyond_m: 3000 }], show: "far", language: "en" }]
];

/** What each layer holds and the kinds a take may keep (where.kinds): the model's whole map, fixed per process. */
const LAYER_HELP: Partial<Record<LayerId, string>> = {
  incidents: "the district's grievances and incidents (the only layer with categories, periods, status and departments)",
  schools: "schools", colleges: "colleges and universities", hospitals: "hospitals and clinics; kinds hospital, health_centre, clinic; government true for government ones",
  fire_stations: "fire stations", police: "police stations (district store)", water_bodies: "lakes and ponds (polygons)", waterways: "rivers, canals, drains (lines; along needs a line id)",
  roads: "roads (lines; along needs a line id)", rail_metro: "rail and metro stations; kinds metro, rail", osm_places: "named neighbourhoods (points)",
  lakes_store: "PWD lakes with their levels (district store): only when the question says PWD, reservoir or lake levels; lakes and ponds in general are water_bodies", gauges: "rain, river and air gauges", pwd_assets: "PWD water works", hotspots: "never take: use the hotspot op",
  banks: "bank branches (partial list)", atms: "ATMs (partial list)", worship: "places of worship; kinds hindu (temples), muslim (mosques), christian (churches), jain, sikh, buddhist, other",
  parks: "parks and playgrounds (children's play areas are playgrounds); kinds park, playground", water_tanks: "overhead water tanks", toilets: "public toilets", bus_stations: "bus stations and stands",
  gov_offices: "government offices, courts and town halls; kinds government_office, court, town_hall", pharmacies: "pharmacies and medical shops", fuel: "petrol bunks and fuel stations",
  markets: "markets", cemeteries: "cemeteries and crematoriums; kinds cemetery, crematorium", liquor: "TASMAC wine shops, bars and pubs (partial list); kinds wine_shop, bar, pub",
  ration_shops: "ration (fair price, PDS) shops, found by name (partial list)", my_list: "the officer's own uploaded and approved list (\"my list\", \"the places on my list\", \"my places\"): take it like any facility layer"
};

/**
 * The fixed part of every plan call, the prompt-cache prefix: byte-stable for a world (the categories, departments and zones come from it, in its
 * own order), so every question after the first reads it from the cache.
 */
function system(cats: string[], depts: string[], zones?: { zone: number; name: string; lat: number; lon: number }[], catLabels?: Map<string, string>): string {
  return [
    "You turn a District Collector's question about a map of Chennai into a JSON plan. You never answer the question and never invent numbers: the server runs the plan and counts.",
    "Officers type fast, on phones, in English, Tamil or Tanglish (Tamil in Latin letters), mixed freely. Read them as a colleague would: misspelt words (hospitls, garbge, floding), Tamil names spelt many ways (Velacheri or Velachery, Adayar or Adyar, Mylapur or Mylapore, Tnagar or T. Nagar), shorthand (nr = near, arnd = around), half sentences and missing words all have one plain meaning; find it.",
    "A name may be given to you several times, as a zone, a taluk, a ward or a point (Anna Nagar = zone zone:8 and a neighbourhood point). \"In X\", \"X la\", \"X-il\", \"X இல்\" use the zone (else the taluk, else the ward); \"near X\", \"around X\", \"X pakkathula\", \"X அருகே\" use the point with a radius. Use only the place refs given in the prompt; never a zone or ward number that is not 1-15 or 1-200.",
    "Steps run in order over named collections (`as`); each later step reads earlier ones by name. Ops:",
    "- take: a layer (incidents with a filter; a facility layer with government and kinds, or nothing).",
    "- within: keep the `of` collection within `meters` of any of the `near` collections. `of` is incidents, or facilities for a rule check (wine shops within 100 m of schools).",
    "- inside: keep incidents or facilities in an area. along: incidents within `meters` of a road or waterway line id given in the prompt.",
    "- nearest: the k nearest facilities (`to`) from each incident (`from` a collection) or from a place (`from` place:<ref>).",
    "- farthest: rank areas by distance from the nearest facility (`from`); areas ward (90 % of its ground), zone, or place (each neighbourhood's point); beyond_m keeps only those farther than that.",
    "- count_by: incidents by ward, zone, taluk or hex500; or by near, after a within step: each incident counted at the place it was found near (which school, hospital or market has the most complaints near it). hotspot: clusters of incidents. compare: two areas (area_* and b_*).",
    "- count_by by category (what people complain about most, top problems, type wise) or by dept (which department holds most, department wise).",
    "- speed: how fast cases are closed (median days from first report to closing) by ward, zone, taluk, category or dept; order fast (resolving fast, best performing, quickest) or slow (slowest, taking longest, delays). Take incidents with status any and period_days 90 unless the question names a period.",
    "- Which school, hospital, college, market, bus stand, temple, wine shop, ration shop, park, ATM or any other kind of facility (or its area, surroundings, around it) has the most problems or cases: a within step to that facility layer and count_by near (never by ward); the kind of problem, if named, on the incidents.",
    "- What kinds or types of complaints, what are the problems in an area (zone 7, Adyar): count_by category inside that area (a plan, not a brief).",
    "- Least, fewest, lowest, which area has the least complaints: count_by (ward, zone or taluk) with fewest_first true (never for most, highest or worst).",
    "- Per person, per head, per capita, per 1000 people, for its population, relative to people living there: count_by ward, zone or taluk with per_people true (the map ranks by cases for every 10,000 people).",
    "- Which area needs my attention, where should I focus or go first, worst or problem areas: open incidents past deadline (overdue true, no period), count_by ward (or zone if the question says zone).",
    "- What is happening or what happened near a kind of place (near schools, near wine shops): open incidents within 500 m of that layer. Near one named place: inside its point.",
    "- change: the same incidents in two windows. rank: a change counted by ward, zone or taluk and ranked by the rise (order rise) or the fall (order fall): \"which wards got worse\", \"most improved zones\", \"league table\".",
    "LAYERS:",
    ...LAYER_IDS.map((l) => `- ${l}: ${LAYER_HELP[l] ?? l}`),
    `Incident categories: ${cats.map((c) => (catLabels?.get(c) ? `${c} (${catLabels.get(c)})` : c)).join(", ")}.`,
    "WORDS PEOPLE USE (English, Tamil, Tanglish; read misspellings of them too). For each category or family:",
    ...wordTables().cats.map((x) => `- ${x}`),
    "For each layer (a facility the map holds):",
    ...wordTables().layers.map((x) => `- ${x}`),
    "First write what the question names: named_categories (each kind of problem it names: a category code, or a family code for a broad word such as flooding or crime), named_layers (the facilities it names), named_places (the refs of the places it names, from the prompt's list), named_zone and named_ward (-1 when none). Then write the steps, which must use them.",
    "HOW TO READ A QUESTION, in this order: (1) the kind of problem: find its word in WORDS PEOPLE USE (misspelt or not) and put that exact category on the incidents' take (the family only for a broad word such as flooding or crime); (2) the place: an area named after in, la, il (zone, taluk, ward) is an inside step with that area, a place after near is a point; never drop a zone or ward the question names; (3) the shape: list, near, count by area, clusters, change, ranking, speed, gap; (4) the time: this week 7 days, this month 30, today calendar day.",
    "When the question names a kind of problem, put that category (or family) on the incidents' take; a single named kind is never counted by category.",
    "What happened or what is happening near a kind of place in Tanglish (tasmac kadai pakkathula enna aachu, school pakkathula enna nadakkudhu): the open incidents within 500 m of that layer. Piling up, keeps happening, prone: hotspot. Taking too long, slow to close: speed order slow. Today alone: the incidents reported today (period_calendar day).",
    "Needs attention, look at first, go first, focus, urgent: overdue true on the open incidents and count_by ward (zone or taluk if said). Improved or got better: rank order fall; got worse or rose: order rise.",
    "count_by category only when the question asks which kinds are most or for the top problems; never when it names one kind.",
    "Has X gone up or is X getting worse (the district as a whole): change. Which areas got worse or improved: rank. Prone areas, black spots, where it keeps happening: hotspot.",
    "Families: FLOOD, CRIME, DRAINAGE, ROADS_TRAFFIC, HEALTH, WASTE_SANITATION, PUBLIC_SAFETY, STRUCTURES_LAND, ELECTRICAL, PUBLIC_ORDER, WORKS, ENVIRONMENT, GREEN, ADMIN, OTHER.",
    `Departments: ${depts.join(", ")}.`,
    ...(zones?.length ? [`ZONES: ${zones.map((z) => `${z.zone} ${z.name} (${z.lat > 13.12 ? "north" : z.lat < 13.02 ? "south" : "central"})`).join("; ")}. Wards are numbered 1 to 200.`] : []),
    "Defaults: status open; period last 7 days (offset 0) unless the question names a period. Distances 10 to 5000 metres (a gap's beyond_m up to 20000). Areas: ward 1-200, zone 1-15, taluk codes TLK-XXX,",
    "point refs are given to you as place refs in the prompt; use only those. A road or waterway is used only by a line id given in the prompt.",
    "A rule check (licensed premises near schools or places of worship) uses the distance the question says; if it says none, 100. Never state a legal distance.",
    "Tanglish words: aaspathri hospital, kuppai garbage, vibathu accident, thiruttu theft, thanni water, nikkudhu stagnating, kosu mosquito, theeppidi fire, kadai shop, kovil temple, pugar complaint, pakkathula near, kitta near, illa or illadha without, evlo how many, enga where, jaasthi more, la in, naai or nai dog (stray animals), naai thollai dog nuisance, maadu or maattu cow or cattle (stray animals, never roads), makkal thogai population (per_people true: for its population), thengi or nikkudhu stagnating (thanni thengi, thanni nikkudhu = standing water: waterlogging FLOOD_WATERLOGGING, never water supply), mazhai rain, pallam pothole (road damage), vilakku light (streetlight), saakadai sewage, enna problem what is wrong (the open incidents there or near it), tasmac or wine shop (liquor layer: incidents near it, not the shops themselves, when the question asks what is happening or what problem).",
    "Facilities near a place (\"pharmacies near Saidapet\", \"banks around Egmore\") list those within its radius (inside a point); nearest only when the question says nearest or closest.",
    "Categories: use the most exact category whose label matches the question's words (sewage: DRAINAGE_SEWAGE, chain snatching: CRIME_PROPERTY, road accidents: ROAD_ACCIDENT, mosquitoes and dengue: VECTOR_DISEASE); a family only when the question names a broad kind (\"flooding\", \"crime\", \"roads\"). Never a code that is not listed.",
    "A question that measures licensed premises (wine shops, liquor shops, TASMAC, bars) from schools, colleges or places of worship is a rule check: take the premises, take the places, within of the premises near the places.",
    "Words for clustering (bunching up, piling up, concentrated, where most) ask for a hotspot; words for a rise by area (got worse, increased the most, jaasthi aagiruchu, adhigama aachu) ask for a change ranked by that area.",
    "language is en, ta (Tamil script) or tanglish (Tamil in Latin letters), as the question is written.",
    "understood is false only when the text is not a question about incidents, places or facilities in Chennai (random letters, greetings, other topics); a loosely worded question that names a kind of incident, a layer, a place or the officer's list is understood.",
    "intent says what kind of answer the question needs:",
    "- plan: a map answer from the steps (lists, counts, near, along, gaps, clusters, changes, rankings, speed). Most questions.",
    "- brief (only when the question names no kind of problem and asks for no list: accidents near Guindy, open complaints near Saidapet, complaints in Kilpauk this month, traffic problems in T Nagar, all complaints in ward 120 including closed, closed cases in zone 5 are plans: a list of the cases): what is happening in, at or near ONE area or named place (\"what is happening in Saidapet\", \"status of ward 120\", \"what happened near Marina Beach\", \"tell me about Adyar\"): the steps take incidents and one inside step with that area (a named place: its point, radius 1000 m).",
    "- scorecard: one ward's scorecard, report card or performance (\"ward 178 scorecard\", \"how is ward 45 doing\"): the steps take incidents and one inside step with that ward.",
    "- city: the live state of the city now, not the records: live traffic or jams now (city traffic), the rain now or today (rain), the rain to come: will it rain, tomorrow, the next hours, where will it rain most, rain forecast (forecast), which streets or wards flood in heavy rain (flood), power cuts in rain (power), trains or metro running or late (metro). The steps may be a single take of incidents.",
    "- not_map: not a question about Chennai's map (general knowledge, chit-chat, a forecast of the future, other cities). understood false too.",
    "Near a KIND of place (\"what is happening near the schools\", \"near wine shops\"): intent plan, the open incidents within 500 m of that layer, not a brief.",
    "With intent other than city, city is none.",
    "A single word or two is a question too: a layer (\"school\", \"atm\", \"tasmac\") lists that layer; a kind of problem (\"garbage\", \"kuppai\", \"potholes\") shows those open incidents; a place (\"Adyar\", \"ward 178\") shows the open incidents in it. Never refuse them.",
    "Each step is one flat object with every field; a field a step does not use is none. Areas: area_kind with area_id (ward, zone), area_code (taluk), or area_ref with area_radius_m (point); compare uses area_* for A and b_* for B. Periods: period_days with period_offset (0 = ending now).",
    "Calendar periods (period_calendar, period_days none): today = day offset 0 (since midnight), yesterday = day offset 1, last week / last month / last quarter = week, month or quarter offset 1 (the calendar one before).",
    "This week, last 7 days, this month and last 30 days count back from now: period_days 7 or 30, period_calendar none.",
    "A change compares two equal windows counted back from now: period_days with period_offset 0, before_days the same, before_offset 1; never a calendar period so far (today, this week) against a whole one.",
    "Examples (each step shows only its fields with a value; every other field is none):",
    ...EXAMPLES.map(([q, p]) => `Q: ${q}\nPLAN: ${JSON.stringify(namedOf(compactWire(toWire(p as Plan)) as W))}`),
    ...NEW_EXAMPLES.map(([q, p]) => `Q: ${q}\nPLAN: ${JSON.stringify(namedOf({ intent: "plan", city: "none", ...p }))}`)
  ].join("\n");
}

/** Everyday words a Collector uses and what they mean on this map: the AI's vocabulary beyond the rules'. */
const CONCEPTS = [
  "kids, children, students, pupils -> layer schools (and colleges for students)",
  "patients, sick, elderly care, medical -> layer hospitals (kinds hospital, health_centre)",
  "commuters, passengers, travellers -> layer rail_metro",
  "water bodies, tanks, ponds, eri -> layer water_bodies; rivers, canals, nullah -> layer waterways",
  "law and order, safety of women -> families CRIME; civic complaints -> citizen true",
  "in the news, newspapers, press, media reports, headlines -> news true (incidents a news outlet reported; status any unless the question says open)",
  "by the sea, coast, beach, seashore -> the coastal zones (use count_by zone or inside one zone): 1 Thiruvottiyur, 4 Tondiarpet, 5 Royapuram, 9 Teynampet, 13 Adyar, 15 Sholinganallur",
  "north / central / south of the city -> zones by direction (see ZONES); a question about one direction may use count_by zone",
  "worst, most urgent -> severity Severe (or Severe and High); pending too long, overdue -> overdue true",
  "TASMAC, liquor shop, wine shop -> layer liquor kinds wine_shop; bar, pub -> liquor kinds bar, pub; temple, mosque, church -> worship with that kind",
  "PDS, fair price shop, ration kadai -> ration_shops; cash machine -> atms; bank branch -> banks; petrol bunk -> fuel; medical shop, chemist -> pharmacies",
  "courts, collectorate, taluk office -> gov_offices (kinds court for courts); burial ground, mayanam -> cemeteries; overhead tank -> water_tanks",
  "got worse, rose most, worsened, league table, ranking of wards -> change then rank (order rise); improved, fell most -> rank order fall",
  "far from, more than N km from, no X within N km, underserved -> farthest (areas place for places, localities, streets; ward otherwise)"
];

/** The system block, built once per world's categories, departments and zones (byte-stable: the cache reads it on every later question). */
let sysCache: { key: string; text: string } | null = null;
function systemFor(ctx: { cats: string[]; depts: string[]; zones?: { zone: number; name: string; lat: number; lon: number }[]; catLabels?: Map<string, string> }): string {
  const key = JSON.stringify([ctx.cats, ctx.depts, ctx.zones ?? [], [...(ctx.catLabels ?? new Map()).entries()]]);
  if (sysCache?.key !== key) sysCache = { key, text: system(ctx.cats, ctx.depts, ctx.zones, ctx.catLabels) };
  return sysCache.text;
}
/** The system block as a plan call sends it (for the cache tests and the eval's token count). */
export const mapSystemPrompt = systemFor;
/** The last plan call's provider, model, tokens and time (the eval runner reads it; the app does not). */
let lastInfo: CallInfo | null = null;
/** The last plan call's info, cleared as it is read. */
export function takeMapCallInfo(): CallInfo | null { const x = lastInfo; lastInfo = null; return x; }

/** A plan from the AI for `text` (or `prev` edited by `text`), checked; null when it cannot be made valid. */
export async function aiPlan(text: string, prev: Plan | null, ctx: { cats: string[]; depts: string[]; places: { ref: string; kind: string; name: string }[]; user: string; lang: Lang; signal?: AbortSignal;
  /** the rules' plan for the parts they could read, and the words they could not */
  hint?: Plan | null; unread?: string[];
  /** v2 (AI first): the question exactly as the officer typed it, when the speller changed words; with suggest, the hint is only a suggestion */
  typed?: string | null; suggest?: boolean;
  zones?: { zone: number; name: string; lat: number; lon: number }[];
  /** the categories' labels, for the cached prompt */
  catLabels?: Map<string, string> }):
  Promise<{ plan: Plan; intent?: "plan" | "brief" | "scorecard" } | { city: "traffic" | "rain" | "forecast" | "flood" | "power" | "metro"; intent: "city"; language: Lang } | { problems: string[] }> {
  const places = ctx.places.length ? `Places named (use these refs): ${ctx.places.map((p) => `${p.name} = ${p.kind} ${p.ref}`).join("; ")}` : "No place was recognised.";
  // the zones are in the cached system block now; the prompt carries only what this question adds
  const zones = "";
  const typed = ctx.typed && ctx.typed !== text ? `\nAS TYPED: ${ctx.typed} (the question above is the same with its spelling read; if a correction looks wrong, read the typed words yourself)` : "";
  const hint = !ctx.hint ? "" : ctx.suggest
    ? `\nA SIMPLE WORD-MATCHER SUGGESTS: ${JSON.stringify(toWire(ctx.hint))}. It can be wrong or miss words${ctx.unread?.length ? ` (it could not use: ${ctx.unread.join(", ")})` : ""}: read the question yourself and keep only what fits it.`
    : `\nTHE RULES READ IT AS: ${JSON.stringify(toWire(ctx.hint))}\nWORDS THE RULES COULD NOT USE: ${(ctx.unread ?? []).join(", ")}. Keep what the rules got right and use these words too.`;
  let prompt = prev
    ? `CURRENT PLAN: ${JSON.stringify(toWire(prev))}\nFOLLOW-UP: ${text}\n${places}\n${zones}\nReturn the current plan edited by the follow-up (never a fresh plan unless the follow-up starts a new topic). Use the previous answer's places ONLY when the follow-up points at one of them in words (there, that place, that school, that ward, the first, the second, number 2); a follow-up that only changes the kind of problem, the time, the status or the distance (only garbage, last week, include closed, 300 m) keeps the plan's places exactly as they are and adds no place. A follow-up that points (there, that place, that school, that ward, the first, the second, number 2) means the place listed as the previous answer's number N (number 1 when no number is said): use its ref (an inside step for a ward or zone ref, a 1000 m point for a facility ref), and keep the kind of problem. A follow-up that points at a place asks about that place: the incidents inside it, with the kind of problem it names (what kinds or types: count_by category inside it); it drops the ranking (count_by ward or near, speed, rank) unless it asks for a new one. Keep the current plan's shape and grouping (count_by by, speed by, nearest from the same place, within the same facilities) unless the follow-up asks for another: after complaints by department, "which is slowest" is speed by dept; after nearest hospital from Guindy, "police station?" is nearest police from Guindy; after a count near schools, "same for hospitals" is the same count near hospitals; after cases near schools, "which school is the worst" or "which one has the most" is count_by near; "temples also", "and hospitals too" ADD that layer to the within step's near list (keep the ones there).`
    : `QUESTION: ${text}${typed}\n${places}\n${zones}${hint}${short(text) ? SHORT_NOTE : ""}\nCONCEPTS: ${CONCEPTS.join(" | ")}\nReturn the plan.`;
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await generateJson({ role: "fast", name: "map-plan", schema: WirePlan, system: systemFor(ctx), prompt, temperature: 0, maxOutputTokens: 1200, user: ctx.user, abortSignal: ctx.signal,
      chat: true, feature: "map", timeoutMs: 12_000 });
    lastInfo = r.info;
    if (process.env.MAP_AI_DEBUG === "1") console.log("MAPAI", JSON.stringify(r.object));
    // not a map question: say so, never answer with a guessed plan ("asdf" became "all open incidents")
    if (r.object.intent === "not_map") return { problems: ["not a map question"] };
    // the live city (traffic, rain, flooding streets, power, trains): no plan to run, the shared live answer
    if (r.object.intent === "city" && r.object.city && r.object.city !== "none") return { city: r.object.city, intent: "city" as const, language: r.object.language };
    // v2: "garbage", "are there any wine shops near schools" came back not understood with no steps though the intent was a plan: asked once more
    if (r.object.understood === false || !r.object.steps.length) {
      if (attempt === 0) { prompt = `${prompt}\nThis IS a map question (a short or loose question about Chennai's places, problems or facilities): set understood true and return its plan.`; continue; }
      return { problems: ["not a map question"] };
    }
    // v3: the last answer's places only when the model says the follow-up points at one ("there", "the second one");
    // otherwise a step it pinned to one of them is taken out again ("last 7 days" is not "at the top hospital")
    const prevRefs = new Set(ctx.places.filter((x) => x.kind.startsWith("the previous answer")).map((x) => x.ref));
    const keepRef = (ref: string) => r.object.points_at_previous || !prevRefs.has(ref) || (prev?.steps ?? []).some((x) => x.op === "inside" && JSON.stringify(x.area).includes(ref));
    const raw = fromWire(r.object);
    const wired = { ...raw, steps: raw.steps.filter((x) => x.op !== "inside" || keepRef(x.area.kind === "point" ? x.area.ref : `${x.area.kind}:${x.area.kind === "taluk" ? (x.area as { code: string }).code : (x.area as { id: number }).id}`)) };
    if (wired.steps.length !== raw.steps.length && !wired.steps.some((x) => x.as === wired.show)) wired.show = wired.steps[wired.steps.length - 1].as;
    const named = { ...r.object, named_places: (r.object.named_places ?? []).filter(keepRef) };
    const c = checkPlan(withNamed(wired, named, ctx.cats, ctx.places.map((x) => x.ref)));
    // v2: only the world's own category and family codes ("VECTOR_DISEASE" is a category, not a family; "DRINKING_WATER" is no code)
    const bad = r.object.steps.flatMap((st) => [...(st.category ?? []).filter((x) => !ctx.cats.includes(x)).map((x) => `"${x}" is not a category code`),
      ...(st.family ?? []).filter((x) => !FAMILIES.includes(x)).map((x) => `"${x}" is not a family (families: ${FAMILIES.join(", ")})`),
      // a place ref the prompt did not give (a made-up one cannot be found on the map)
      ...[st.area_ref, st.b_ref, st.from?.startsWith("place:") ? st.from.slice(6) : null].filter((x): x is string => !!x && !x.startsWith("drawn:") && !ctx.places.some((pl) => pl.ref === x)).map((x) => `"${x}" is not a place ref given in the prompt`)]);
    // a brief is for a question that names no kind of problem: when the model named one, its plan answers (its own two answers made to agree)
    const intentOf = (): "plan" | "brief" | "scorecard" => (r.object.intent === "scorecard" ? "scorecard" : r.object.intent === "brief" && !(r.object.named_categories ?? []).some((x) => ctx.cats.includes(x) || FAMILIES.includes(x)) && !(r.object.named_layers ?? []).length
      && !r.object.steps.some((st) => st.layer === "incidents" && ((st.category ?? []).length || (st.family ?? []).length || (st.status && st.status !== "open") || st.overdue || st.severity?.length))
      ? "brief" : "plan");
    if (c.ok && !bad.length) return { plan: c.plan, intent: intentOf() };
    if (c.ok && bad.length && attempt === 1) return { plan: c.plan, intent: intentOf() };
    problems = c.ok ? bad : [...c.problems, ...bad];
    prompt = `${prompt}\nYOUR LAST PLAN WAS REFUSED: ${problems.join("; ")}. Fix it.`;
  }
  return { problems };
}

const Reworded = z.object({ sentence: z.string().max(400) });
/**
 * The template's meaning sentence, reworded by the AI into at most two plain sentences in the answer's language. Every
 * number it writes must be one of the facts (or appear in the template); otherwise the template stands.
 */
export async function aiReword(template: string, facts: Fact[], lang: Lang, user: string, signal?: AbortSignal): Promise<string | null> {
  const allowed = new Set([...facts.map((f) => f.value), ...extractNumbers(template).map((x) => x.value)]);
  const r = await generateJson({
    role: "fast", name: "map-word", schema: Reworded, temperature: 0.2, maxOutputTokens: 220, user, abortSignal: signal, chat: true, feature: "map",
    system: "Reword the sentence for a District Collector in plain words, at most two sentences, in the language given. Keep every number exactly; add no number, cause or claim.",
    prompt: `LANGUAGE: ${lang === "ta" ? "Tamil (script)" : lang === "tanglish" ? "Tanglish (Tamil in Latin letters)" : "English"}\nSENTENCE: ${template}\nFACTS: ${facts.map((f) => `${f.label} = ${f.value}`).join("; ")}`
  });
  const s = r.object.sentence.trim();
  // the same numbers as the template, no more and no fewer: a rewording may not add a fact, even a true one
  const nums = (t: string) => extractNumbers(t).map((x) => x.value).sort((a, b) => a - b).join(",");
  if (!s || nums(s) !== nums(template) || extractNumbers(s).some((x) => !allowed.has(x.value)) || s.split(/(?<=[.!?।])\s+/).length > 2) return null;
  return s;
}
