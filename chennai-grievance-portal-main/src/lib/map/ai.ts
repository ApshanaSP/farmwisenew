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
import { checkPlan, type Plan } from "./plan";
import { WirePlan, fromWire, toWire } from "./wire";
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
  lakes_store: "PWD lakes (district store)", gauges: "rain, river and air gauges", pwd_assets: "PWD water works", hotspots: "never take: use the hotspot op",
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
    "When the question says in a zone, taluk or ward by name (Anna Nagar zone, Velachery taluk), use that area; near a place uses its point. Use only the place refs given in the prompt.",
    "Steps run in order over named collections (`as`); each later step reads earlier ones by name. Ops:",
    "- take: a layer (incidents with a filter; a facility layer with government and kinds, or nothing).",
    "- within: keep the `of` collection within `meters` of any of the `near` collections. `of` is incidents, or facilities for a rule check (wine shops within 100 m of schools).",
    "- inside: keep incidents or facilities in an area. along: incidents within `meters` of a road or waterway line id given in the prompt.",
    "- nearest: the k nearest facilities (`to`) from each incident (`from` a collection) or from a place (`from` place:<ref>).",
    "- farthest: rank areas by distance from the nearest facility (`from`); areas ward (90 % of its ground), zone, or place (each neighbourhood's point); beyond_m keeps only those farther than that.",
    "- count_by: incidents by ward, zone, taluk or hex500. hotspot: clusters of incidents. compare: two areas (area_* and b_*).",
    "- change: the same incidents in two windows. rank: a change counted by ward, zone or taluk and ranked by the rise (order rise) or the fall (order fall): \"which wards got worse\", \"most improved zones\", \"league table\".",
    "LAYERS:",
    ...LAYER_IDS.map((l) => `- ${l}: ${LAYER_HELP[l] ?? l}`),
    `Incident categories: ${cats.map((c) => (catLabels?.get(c) ? `${c} (${catLabels.get(c)})` : c)).join(", ")}.`,
    "Families: FLOOD, CRIME, DRAINAGE, ROADS_TRAFFIC, HEALTH, WASTE_SANITATION, PUBLIC_SAFETY, STRUCTURES_LAND, ELECTRICAL, PUBLIC_ORDER, WORKS, ENVIRONMENT, GREEN, ADMIN, OTHER.",
    `Departments: ${depts.join(", ")}.`,
    ...(zones?.length ? [`ZONES: ${zones.map((z) => `${z.zone} ${z.name} (${z.lat > 13.12 ? "north" : z.lat < 13.02 ? "south" : "central"})`).join("; ")}. Wards are numbered 1 to 200.`] : []),
    "Defaults: status open; period last 7 days (offset 0) unless the question names a period. Distances 10 to 5000 metres (a gap's beyond_m up to 20000). Areas: ward 1-200, zone 1-15, taluk codes TLK-XXX,",
    "point refs are given to you as place refs in the prompt; use only those. A road or waterway is used only by a line id given in the prompt.",
    "A rule check (licensed premises near schools or places of worship) uses the distance the question says; if it says none, 100. Never state a legal distance.",
    "Categories: use the most exact category whose label matches the question's words (sewage: DRAINAGE_SEWAGE, chain snatching: CRIME_PROPERTY, road accidents: ROAD_ACCIDENT, mosquitoes and dengue: VECTOR_DISEASE); a family only when the question names a broad kind (\"flooding\", \"crime\", \"roads\"). Never a code that is not listed.",
    "A question that measures licensed premises (wine shops, liquor shops, TASMAC, bars) from schools, colleges or places of worship is a rule check: take the premises, take the places, within of the premises near the places.",
    "Words for clustering (bunching up, piling up, concentrated, where most) ask for a hotspot; words for a rise by area (got worse, increased the most, jaasthi aagiruchu, adhigama aachu) ask for a change ranked by that area.",
    "language is en, ta (Tamil script) or tanglish (Tamil in Latin letters), as the question is written.",
    "understood is false only when the text is not a question about incidents, places or facilities in Chennai (random letters, greetings, other topics); a loosely worded question that names a kind of incident, a layer, a place or the officer's list is understood.",
    "Each step is one flat object with every field; a field a step does not use is none. Areas: area_kind with area_id (ward, zone), area_code (taluk), or area_ref with area_radius_m (point); compare uses area_* for A and b_* for B. Periods: period_days with period_offset (0 = ending now).",
    "Calendar periods (period_calendar, period_days none): today = day offset 0 (since midnight), yesterday = day offset 1, last week / last month / last quarter = week, month or quarter offset 1 (the calendar one before).",
    "This week, last 7 days, this month and last 30 days count back from now: period_days 7 or 30, period_calendar none.",
    "A change compares two equal windows counted back from now: period_days with period_offset 0, before_days the same, before_offset 1; never a calendar period so far (today, this week) against a whole one.",
    "Examples (each step shows only its fields with a value; every other field is none):",
    ...EXAMPLES.map(([q, p]) => `Q: ${q}\nPLAN: ${JSON.stringify(compactWire(toWire(p as Plan)))}`),
    ...NEW_EXAMPLES.map(([q, p]) => `Q: ${q}\nPLAN: ${JSON.stringify(p)}`)
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
  Promise<{ plan: Plan } | { problems: string[] }> {
  const places = ctx.places.length ? `Places named (use these refs): ${ctx.places.map((p) => `${p.name} = ${p.kind} ${p.ref}`).join("; ")}` : "No place was recognised.";
  // the zones are in the cached system block now; the prompt carries only what this question adds
  const zones = "";
  const typed = ctx.typed && ctx.typed !== text ? `\nAS TYPED: ${ctx.typed} (the question above is the same with its spelling read; if a correction looks wrong, read the typed words yourself)` : "";
  const hint = !ctx.hint ? "" : ctx.suggest
    ? `\nA SIMPLE WORD-MATCHER SUGGESTS: ${JSON.stringify(toWire(ctx.hint))}. It can be wrong or miss words${ctx.unread?.length ? ` (it could not use: ${ctx.unread.join(", ")})` : ""}: read the question yourself and keep only what fits it.`
    : `\nTHE RULES READ IT AS: ${JSON.stringify(toWire(ctx.hint))}\nWORDS THE RULES COULD NOT USE: ${(ctx.unread ?? []).join(", ")}. Keep what the rules got right and use these words too.`;
  let prompt = prev
    ? `CURRENT PLAN: ${JSON.stringify(toWire(prev))}\nFOLLOW-UP: ${text}\n${places}\n${zones}\nReturn the current plan edited by the follow-up (never a fresh plan unless the follow-up starts a new topic).`
    : `QUESTION: ${text}${typed}\n${places}\n${zones}${hint}\nCONCEPTS: ${CONCEPTS.join(" | ")}\nReturn the plan.`;
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await generateJson({ role: "fast", name: "map-plan", schema: WirePlan, system: systemFor(ctx), prompt, temperature: 0, maxOutputTokens: 1200, user: ctx.user, abortSignal: ctx.signal,
      chat: true, feature: "map", timeoutMs: 12_000 });
    lastInfo = r.info;
    // not a map question: say so, never answer with a guessed plan ("asdf" became "all open incidents")
    if (r.object.understood === false) return { problems: ["not a map question"] };
    const c = checkPlan(fromWire(r.object));
    if (c.ok) return { plan: c.plan };
    problems = c.problems;
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
