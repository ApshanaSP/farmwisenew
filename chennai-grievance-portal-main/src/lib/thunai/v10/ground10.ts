/**
 * v10 (docs/jarvis/JARVIS_V10.md 4.5 and 4.9 feature 1): what the console's own records say about a news story. Code, never a model:
 *
 *   storyTopic   the story's civic kind, from a reviewed table of news words to the console's categories (sewage -> drainage and sewage,
 *                a protest over water -> drinking water, garbage -> solid waste, waterlogging -> flooding), else the monitor's own category
 *   storyPlace   the story's place: the stored document's place, then its headline's place words, resolved by the console's gazetteer
 *                (the resolve_place tool: the locality, its zone), else the district's names (the world's gazetteer)
 *   consoleOn    the open cases of that kind at that place now (the incidents tool: the console's own list, open now, oldest first), the
 *                department that holds them, how old the oldest is, the citizen complaints linked to them; the zone's when none is recorded
 *                under the place's own name; for a storm, the rain gauges (weather10.ts)
 *   the lines    the fact sheet's console facts (for the brief's writer), the console sentence and the offer said by code, the news-to-ground-
 *                truth answer, and the offer the browser keeps for the next turn (what "show it on the map", "draft a note" and "follow it" do)
 *
 * Privacy (v7's rule): no citizen's words. Counts, places, kinds, departments and ages only reach a model; the cases' own rows go to the
 * screen alone. "No complaints near X" is never said as "no problem at X" (research 40, §4.1: under-reporting).
 * The Tamil lines are MODEL-DRAFTED and need a Tamil speaker's review.
 */
import type { ToolResult } from "@/lib/assistant/types";
import { timeOf } from "../brief6";
import { DEPT_TA, ZONE_NAMES, ZONE_TA_NAME } from "../lexicon";
import { CAT_LABEL_TA } from "../narrate";
import { caseRow } from "../screens";
import type { CaseRowT } from "../stage";
import type { Lang, World } from "../types";
import { gazetteer, namesIn, type Gazetteer } from "../aide7/gazetteer";
import type { WeatherLines } from "./weather10";

export type Tool = (name: string, args: Record<string, unknown>) => Promise<ToolResult>;

/** A stored story as the news route holds it. */
export interface Story10 {
  id: string;
  outlet: string | null;
  outletTa: string | null;
  title: string;
  /** the monitor's English of a Tamil headline */
  titleEn: string | null;
  publishedAt: string | null;
  /** the article's text (the stored body, or the page read): news, never a citizen's words */
  text: string;
  /** the place and category the news monitor read */
  place: string | null;
  cat: string | null;
}

export interface Topic10 { cat: string; en: string; ta: string; map: string }
export interface Place10 { name: string; nameTa: string | null; zone: number | null; zoneName: string | null; zoneTa: string | null; level: "place" | "zone" }
export interface Console10 {
  place: Place10 | null;
  topic: Topic10 | null;
  storm: boolean;
  /** where the cases were counted: the place by name, its zone, or the district (a storm with no place) */
  area: { level: "place" | "zone" | "district"; en: string; ta: string } | null;
  /** open cases counted (null: not counted: no place, or no tool) */
  n: number | null;
  complaints: number;
  oldestDays: number | null;
  /** the department holding most of the cases read: `all` of them (every case counted was read), `k` of those read; `whole`: every case
   * counted was read (12 or fewer); `of`: the departments holding the cases read */
  dept: { code: string | null; en: string; ta: string; all: boolean; k: number; whole: boolean; of: number } | null;
  /** cases past their deadline, when every case counted was read (12 or fewer) */
  overdue: number | null;
  /** the cases, oldest first (ids, for the map and a draft), and their rows for the screen (no row reaches a model) */
  ids: string[];
  rows: CaseRowT[];
  gauges: WeatherLines | null;
}

// ------------------------------------------------------------------ the story's kind --

/** news words -> the console's categories, the specific before the general (a protest over water is a water story) */
const TOPICS: (Topic10 & { re: RegExp })[] = [
  { cat: "DRAINAGE_SEWAGE", en: "drainage and sewage", ta: "கழிவுநீர்", map: "drainage", re: /sewage|sewer|\bdrain(?:s|age)?\b|manholes?|\bugd\b|கழிவுநீர்|சாக்கடை|வடிகால்/iu },
  { cat: "WATER_SUPPLY", en: "drinking water", ta: "குடிநீர்", map: "water supply",
    re: /drinking water|water (?:supply|shortage|scarcity|crisis|cuts?)|no water|empty[- ]pots?|water tankers?|குடிநீர்|தண்ணீர் (?:தட்டுப்பாடு|பற்றாக்குறை)|காலிக்குட/iu },
  { cat: "FLOOD_WATERLOGGING", en: "flooding and waterlogging", ta: "வெள்ளம், நீர்த்தேக்கம்", map: "waterlogging",
    re: /waterlog|inundat|\bflood(?:ed|ing|s)?\b|stagnant water|water stagnation|submerged|வெள்ள|நீர் ?தேங்|தண்ணீர் தேங்/iu },
  { cat: "SOLID_WASTE", en: "garbage", ta: "குப்பை", map: "garbage", re: /garbage|\bwaste\b|trash|rubbish|dump ?yard|dumping|குப்பை/iu },
  { cat: "ROAD_DAMAGE", en: "road damage", ta: "சாலை சேதம்", map: "road damage",
    re: /potholes?|craters?|cave-?in|(?:broken|damaged|battered|dug[- ]up|bad|crumbling) roads?|roads? (?:damaged|in bad shape|caved)|footpaths?|பள்ளம்|சாலை சேத|குண்டும் குழியுமா/iu },
  { cat: "STREETLIGHT_ELECTRICAL", en: "streetlight and electrical", ta: "தெருவிளக்கு", map: "streetlight", re: /street ?lights?|electrocut|live wires?|தெருவிளக்கு|மின்கம்பி/iu },
  { cat: "VECTOR_DISEASE", en: "mosquito and water-borne disease", ta: "கொசு, நீர்வழி நோய்", map: "dengue", re: /dengue|malaria|mosquito|cholera|diarrhoea|டெங்கு|கொசு|மலேரியா/iu },
  { cat: "STRAY_ANIMALS", en: "stray animal", ta: "தெரு விலங்கு", map: "stray animal", re: /stray (?:dogs?|cattle|cows?|animals?)|dog bites?|தெரு நாய்/iu },
  { cat: "TREES_PARKS", en: "fallen tree", ta: "மரம் விழுந்த", map: "fallen tree", re: /(?:fallen|uprooted) trees?|tree fall|மரம் (?:விழு|சாய)/iu },
  { cat: "ENCROACHMENT", en: "encroachment", ta: "ஆக்கிரமிப்பு", map: "encroachment", re: /encroach|ஆக்கிரமிப்பு/iu },
  { cat: "TRAFFIC_OBSTRUCTION", en: "traffic obstruction", ta: "போக்குவரத்து நெரிசல்", map: "traffic", re: /traffic (?:jam|congestion|snarl)|congestion|போக்குவரத்து நெரிசல்/iu },
  { cat: "PUBLIC_ORDER", en: "protest", ta: "போராட்டம்", map: "protest", re: /protest|agitation|road roko|dharna|demonstration|போராட்ட|மறியல்|ஆர்ப்பாட்ட/iu }
];
const STORM = /cyclone|deep depression|heavy rain|very heavy rain|rain alert|red alert|orange alert|landfall|புயல்|கனமழை|காற்றழுத்த|சைக்ளோன்/iu;
/** a bare "storm" is the weather's only with a weather word in the story: "storm water drain" is a drain (the GCC's department), and "a political
 * storm erupts over" a row (v10 review 2, finding 3: both were briefed with the rain gauges and a flooding offer) */
const BARE_STORM = /\bstorms?\b(?![- ]?water)/iu;
const STORM_FIGURE = /\b(?:political|social media|online|media|legal|verbal|diplomatic) storms?\b|\bstorms? (?:of|over) (?:protests?|criticism|outrage|controvers\w*|questions|anger|allegations?)\b|\bstorms? erupt(?:s|ed)?\b|\b(?:kick(?:s|ed)? up|creat(?:es?|ed)|trigger(?:s|ed)?|spark(?:s|ed)?|rais(?:es?|ed)) (?:a )?storms?\b/iu;
const WEATHER = /\b(?:rain\w*|winds?|gales?|cyclon\w*|imd|meteorolog\w*|landfall|depressions?|monsoon|thunder\w*|lightning|squalls?|weather|surge)\b|மழை|புயல்|காற்று/iu;
const label = (s: string) => s.replace(/\s*&\s*/g, " and ").toLowerCase();

/** The story's civic kind: the table's, else the monitor's own category when the console has it; null when it names none. */
export function storyTopic(text: string, cat: string | null | undefined, world: Pick<World, "cats">): Topic10 | null {
  const t = TOPICS.find((x) => x.re.test(text));
  if (t) return { cat: t.cat, en: t.en, ta: t.ta, map: t.map };
  const c = cat ? world.cats.find((x) => x.code === cat) : null;
  // (a warning signal is the monitor's kind for a forecast, no kind of case a citizen files: a storm's cases are its flooding)
  if (!c || c.code === "OTHER" || c.code === "FLOOD_RISK_SIGNAL") return null;
  return { cat: c.code, en: label(c.label), ta: CAT_LABEL_TA[c.code] ?? label(c.label), map: label(c.label) };
}
/** Is the story a storm's? `text` is its headline; `context` its opening, where a bare "storm" finds its weather word. */
export const stormy = (text: string, context = ""): boolean => STORM.test(text) || (BARE_STORM.test(text) && !STORM_FIGURE.test(text) && WEATHER.test(`${text} ${context}`));

// ------------------------------------------------------------------ the story's place --

const gazCache = new WeakMap<object, Gazetteer>();
const gazFor = (w: World) => { let g = gazCache.get(w); if (!g) { g = gazetteer(w); gazCache.set(w, g); } return g; };
const zoneTa = (n: number | null) => (n != null ? ZONE_TA_NAME[n] ?? null : null);
const zoneNameOf = (w: Pick<World, "zones">, n: number | null) => (n == null ? null : w.zones.find((z) => z.n === n)?.name ?? ZONE_NAMES[n - 1] ?? null);

/**
 * The story's place: the monitor's place first, then the headline's (in English, then as written). The console's gazetteer (resolve_place)
 * names the locality and its zone; without it, the district's names in the world (a place, a zone).
 */
export async function storyPlace(s: Pick<Story10, "place" | "title" | "titleEn">, world: World, tool?: Tool, placeTa?: (name: string) => string | null): Promise<Place10 | null> {
  const texts = [s.place, s.titleEn, s.title].map((x) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, 120)).filter((x) => x.length >= 2);
  const ta = (name: string, zone: number | null, level: Place10["level"]) => (level === "zone" ? zoneTa(zone) : (() => { try { return placeTa?.(name) ?? null; } catch { return null; } })());
  if (tool) {
    for (const text of texts) {
      const r = await tool("resolve_place", { text }).catch(() => null);
      const d = r?.data as { place?: unknown; zone?: unknown; zone_name?: unknown } | null | undefined;
      const name = typeof d?.place === "string" ? d.place.trim() : "";
      if (!name) continue;
      const zone = Number.isInteger(Number(d?.zone)) && Number(d?.zone) >= 1 && Number(d?.zone) <= 15 ? Number(d?.zone) : null;
      const zoneName = typeof d?.zone_name === "string" && d.zone_name ? d.zone_name : zoneNameOf(world, zone);
      const level: Place10["level"] = zoneName && name.toLowerCase() === zoneName.toLowerCase() ? "zone" : "place";
      return { name, nameTa: ta(name, zone, level), zone, zoneName, zoneTa: zoneTa(zone), level };
    }
  }
  const g = gazFor(world);
  for (const text of texts) {
    const hits = namesIn(text, g).filter((h) => h.kind === "place" || h.kind === "zone");
    const h = hits.find((x) => x.kind === "place") ?? hits[0];
    if (!h) continue;
    if (h.kind === "zone") {
      const zone = Number(h.key.slice(5));
      const zoneName = zoneNameOf(world, zone);
      return { name: zoneName ?? h.form, nameTa: zoneTa(zone), zone, zoneName, zoneTa: zoneTa(zone), level: "zone" };
    }
    const p = world.places.find((x) => `place:${x.name.toLowerCase()}` === h.key);
    const zone = p?.zone ?? null;
    return { name: p?.name ?? h.form, nameTa: ta(p?.name ?? h.form, zone, "place"), zone, zoneName: zoneNameOf(world, zone), zoneTa: zoneTa(zone), level: "place" };
  }
  return null;
}

// ------------------------------------------------------------------ the console's records --

interface Row { id?: unknown; t?: unknown; dept?: unknown; dept_name?: unknown; overdue?: unknown }
const DAY = 864e5;
/** a department's name as said ("Metro Water (CMWSSB)" -> "Metro Water") */
export const plainDept = (s: string) => s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();

export interface ConsoleDeps {
  world: World;
  tool?: Tool;
  /** a storm's rain gauges (weather10.ts weatherLines over the same tool) */
  weather?: () => Promise<WeatherLines | null>;
  /** a locality's Tamil name (the console's gazetteer), when it has one */
  placeTa?: (name: string) => string | null;
}

/** What the console holds on the story: never throws (a tool that fails counts nothing). */
export async function consoleOn(s: Story10, d: ConsoleDeps): Promise<Console10> {
  const text = [s.title, s.titleEn ?? "", s.text.slice(0, 600)].join(" ");
  const storm = stormy([s.title, s.titleEn ?? ""].join(" "), s.text.slice(0, 600));
  // a storm's cases are its flooding
  const flood = TOPICS.find((x) => x.cat === "FLOOD_WATERLOGGING")!;
  const topic = storyTopic([s.title, s.titleEn ?? ""].join(" "), s.cat, d.world) ?? storyTopic(text, null, d.world) ?? (storm ? { cat: flood.cat, en: flood.en, ta: flood.ta, map: flood.map } : null);
  const [place, gauges] = await Promise.all([
    storyPlace(s, d.world, d.tool, d.placeTa).catch(() => null),
    storm && d.weather ? d.weather().catch(() => null) : Promise.resolve(null)
  ]);
  const out: Console10 = { place, topic, storm, area: null, n: null, complaints: 0, oldestDays: null, dept: null, overdue: null, ids: [], rows: [], gauges };
  // a story of no civic kind (a library opened) is not counted: every open case of every kind at the place is no record of it, and the oldest
  // of them no case to draft a note on (v10 review 2, finding 5); a storm always has its kind (its flooding)
  if (!d.tool || (!place && !storm) || !topic) return out;
  // a storm with no place: the district's open flooding cases
  const cat = topic.cat;
  const ask = async (zone: number | null, q: string | null) => {
    const r = await d.tool!("incidents", { scope: { period: "monthly", zone, cat, dept: null, taluk: null }, status: "open", q, sort: "t", dir: 1, page: 0, allTime: true }).catch(() => null);
    const data = r?.data as { rows?: Row[]; incidents?: unknown; complaints?: unknown } | undefined;
    return data && Array.isArray(data.rows) ? { rows: data.rows, n: Number(data.incidents ?? data.rows.length) || 0, complaints: Number(data.complaints ?? 0) || 0, asOf: r?.asOf ?? null } : null;
  };
  let got = place ? await ask(place.zone, place.level === "place" ? place.name : null) : await ask(null, null);
  let level: "place" | "zone" | "district" = place ? place.level : "district";
  // none recorded under the place's own name: its zone's
  if (got && got.n === 0 && place?.level === "place" && place.zone != null) {
    const z = await ask(place.zone, null);
    if (z) { got = z; level = "zone"; }
  }
  if (!got) return out;
  const zn = place?.zoneName ?? zoneNameOf(d.world, place?.zone ?? null);
  out.area = level === "place" ? { level, en: `at ${place!.name}`, ta: `${place!.nameTa ?? place!.name} பகுதியில்` }
    : level === "zone" ? { level, en: `in ${zn ?? place!.name} zone`, ta: `${place?.zoneTa ?? zn ?? place!.name} மண்டலத்தில்` }
    : { level, en: "in the district", ta: "மாவட்டத்தில்" };
  out.n = got.n;
  out.complaints = got.complaints;
  const now = timeOf(got.asOf) ?? Date.now();
  const times = got.rows.map((r) => timeOf(r.t)).filter((x): x is number => x != null && x <= now + 300_000);
  if (got.n > 0 && times.length) out.oldestDays = Math.max(0, Math.floor((now - Math.min(...times)) / DAY));
  // the department: the one holding most of the cases read
  const by = new Map<string, { code: string | null; name: string; k: number }>();
  for (const r of got.rows) {
    const name = typeof r.dept_name === "string" && r.dept_name.trim() ? r.dept_name.trim() : null;
    if (!name) continue;
    const e = by.get(name) ?? { code: typeof r.dept === "string" ? r.dept : null, name, k: 0 };
    e.k++;
    by.set(name, e);
  }
  const top = [...by.values()].sort((a, b) => b.k - a.k)[0];
  // "all" only over every case counted: one page (12) of 30 read all with one department says nothing of the other 18 (v10 review 2, finding 6)
  const whole = got.n <= got.rows.length;
  if (top && got.rows.length) out.dept = { code: top.code, en: top.name, ta: (top.code && DEPT_TA[top.code]) || plainDept(top.name), all: whole && top.k === got.rows.length, k: top.k, whole, of: by.size };
  if (whole) out.overdue = got.rows.filter((r) => r.overdue === true).length;
  // oldest first, as listed
  const order = got.rows.map((r, i) => ({ r, i, t: timeOf(r.t) ?? Infinity })).sort((a, b) => a.t - b.t || a.i - b.i).map((x) => x.r);
  out.ids = order.map((r) => String(r.id ?? "")).filter((x) => /^[A-Za-z0-9_:.-]{1,80}$/.test(x));
  out.rows = order.slice(0, 12).map((r) => caseRow(r as Parameters<typeof caseRow>[0], d.world));
  return out;
}

// ------------------------------------------------------------------ what is said --

const s = (n: number, one: string, many: string) => (n === 1 ? one : many);
const kindEn = (c: Console10) => (c.topic ? `${c.topic.en} ` : "");
const kindTa = (c: Console10) => (c.topic ? `${c.topic.ta} தொடர்பான ` : "");
const daysEn = (d: number) => `${d} ${s(d, "day", "days")}`;
/**
 * How the department holds the cases counted, said only as far as the cases read show it: all (every case read), most (more than half of all
 * counted), spread (every case read, no majority), else some (how many of them) (v10 review 2, finding 6: "most with" was said for 1 of 4).
 */
export function deptHold(c: Pick<Console10, "dept" | "n">): "all" | "most" | "spread" | "some" | null {
  const d = c.dept;
  if (!d || !c.n) return null;
  return d.all ? "all" : d.k * 2 > c.n ? "most" : d.whole && d.of > 1 ? "spread" : "some";
}

/** The console's facts for the brief's fact sheet: plain English, one line a fact, figures in digits (the checker holds each sentence to them). */
export function consoleFacts(c: Console10): { text: string; rank?: boolean }[] {
  const out: { text: string; rank?: boolean }[] = [];
  const p = c.place;
  if (p) out.push({ text: `The story's place: ${p.name}${p.level === "place" && p.zoneName ? `, in ${p.zoneName} zone` : p.level === "zone" ? " zone" : ""}` });
  else if (!c.storm) out.push({ text: "The story names no place the console can match in the district" });
  if (c.n != null && c.area) {
    const k = kindEn(c);
    if (c.n > 0) {
      out.push({ text: `Open ${k}cases ${c.area.en} on the console now: ${c.n}` });
      if (c.complaints > 0) out.push({ text: `Citizen complaints linked to these open cases: ${c.complaints}` });
      if (c.oldestDays != null) out.push({ text: c.oldestDays === 0 ? (c.n === 1 ? "This open case was opened today" : "These open cases were all opened today")
        : c.n === 1 ? `This open case has been open ${daysEn(c.oldestDays)}` : `The oldest of these open cases has been open ${daysEn(c.oldestDays)}`, rank: true });
      if (c.dept) out.push({ text: c.dept.all ? `${c.n === 1 ? "It is" : "All of these open cases are"} held by ${c.dept.en}` : `${c.dept.k} of these open cases ${s(c.dept.k, "is", "are")} held by ${c.dept.en}`, rank: !c.dept.all });
      else out.push({ text: "No department holds these open cases yet" });
      if (c.overdue) out.push({ text: `${c.overdue} of these open cases ${s(c.overdue, "is", "are")} past ${s(c.overdue, "its", "their")} deadline` });
    } else {
      out.push({ text: `No open ${k}case ${c.area.en} is on the console now` });
      out.push({ text: "Caution: few cases on the console may only mean few were reported, not that all is well" });
    }
  }
  for (const [i, l] of (c.gauges?.en ?? []).entries()) out.push({ text: l, rank: i === 0 });
  return out;
}

/** The console's sentence, said by code (the brief's third part when the writer's is missing, and its template when no model answers): a
 * storm with no place of its own is the rain gauges */
export function consoleLine(c: Console10, lang: Lang): string {
  if (c.storm && c.gauges && (c.n == null || c.area?.level === "district")) return (lang === "ta" ? c.gauges.ta : c.gauges.en)[0] ?? "";
  return countLine(c, lang);
}

/** The open cases counted, in one sentence: how many, of what kind, where, the oldest's age and the department holding them. */
export function countLine(c: Console10, lang: Lang): string {
  const ta = lang === "ta";
  if (!c.place && !c.storm) return ta ? "இந்தச் செய்தி மாவட்டத்தில் எந்த இடம் என்று தெரியவில்லை; அதனால் கன்சோல் பதிவுகளுடன் ஒப்பிட முடியவில்லை." : "I can't place this story in the district, so I have no console records to match it with.";
  if (c.n == null || !c.area) return "";
  if (c.n === 0) return ta ? `கன்சோலில் ${c.area.ta} ${kindTa(c)}திறந்த புகார் எதுவும் இல்லை; புகார் குறைவு என்றால் பிரச்சினை இல்லை என்று அர்த்தமில்லை.`
    : `The console has no open ${kindEn(c)}case ${c.area.en}; few reports may only mean few were filed, not that all is well.`;
  const d = c.dept, n = c.n, h = deptHold(c);
  if (ta) {
    const old = c.oldestDays == null ? "" : c.oldestDays === 0 ? (n === 1 ? ", இன்றுதான் பதிவானது" : ", எல்லாம் இன்று பதிவானவை") : n === 1 ? `, ${c.oldestDays} நாட்களாகத் திறந்திருக்கிறது` : `, பழையது ${c.oldestDays} நாட்களாகத் திறந்திருக்கிறது`;
    const who = !d ? "; எந்தத் துறையிடமும் இன்னும் ஒப்படைக்கப்படவில்லை" : n === 1 || h === "all" || h === "most" ? `; ${n === 1 ? "அது" : h === "all" ? "எல்லாமே" : "பெரும்பாலானவை"} ${d.ta} வசம் உள்ளன`
      : h === "spread" ? `; ${d.of} துறைகளிடம் பிரிந்துள்ளன` : `; அவற்றில் ${d.k} ${d.ta} வசம் உள்ளன`;
    return `கன்சோலில் ${c.area.ta} ${kindTa(c)}${n} புகார்கள் திறந்த நிலையில் உள்ளன${old}${who}.`;
  }
  const old = c.oldestDays == null ? "" : c.oldestDays === 0 ? (n === 1 ? ", opened today" : ", all opened today") : n === 1 ? `, open ${daysEn(c.oldestDays)}` : `, the oldest open ${daysEn(c.oldestDays)}`;
  const who = !d ? ", with no department on them yet" : n === 1 ? `, held by ${plainDept(d.en)}` : h === "all" ? `, all with ${plainDept(d.en)}` : h === "most" ? `, most with ${plainDept(d.en)}`
    : h === "spread" ? `, spread across ${d.of} departments` : `, ${d.k} of them with ${plainDept(d.en)}`;
  return `The console has ${n} open ${kindEn(c)}${s(n, "case", "cases")} ${c.area.en}${old}${who}.`;
}

// ------------------------------------------------------------------ the offer --

export type OfferKind = "map" | "draft" | "follow" | "full";
/** What the browser keeps after a brief for the next turn (offer10.ts): what each offered step does. */
export interface OfferPayload {
  story: string;
  offers: OfferKind[];
  /** the question Ask the Map is asked */
  map: string | null;
  /** the case a note is drafted on (the oldest), into the tray only */
  draft: string[];
  /** the zone followed */
  follow: { zone: number; en: string; ta: string } | null;
  /** the story names a place: "what do we have on this?" has an answer */
  civic: boolean;
}

/** At most two next steps, the pick first: the cases on the map and a note on them; the place's zone to follow; a storm's flooding on the map. */
export function offerOf(story: Pick<Story10, "id">, c: Console10): OfferPayload {
  const p = c.place;
  const where = c.area?.level === "place" && p ? `near ${p.name}` : c.area?.level === "zone" && p?.zone != null ? `in Zone ${p.zone}` : p ? `near ${p.name}` : "";
  const kind = c.topic ? `${c.topic.map} ` : c.storm ? "waterlogging " : "";
  const follow = p?.zone != null ? { zone: p.zone, en: p.zoneName ?? ZONE_NAMES[p.zone - 1] ?? `Zone ${p.zone}`, ta: p.zoneTa ?? zoneTa(p.zone) ?? `மண்டலம் ${p.zone}` } : null;
  const base = { story: story.id, civic: !!p, follow };
  // a storm over the district: its flooding on the map, or the story itself (a note on one case is no answer to a storm)
  if (c.storm && !p) return { ...base, offers: ["map", "full"], map: "open waterlogging complaints", draft: [] };
  if (c.n && c.n > 0 && c.ids.length) return { ...base, offers: ["map", "draft"], map: `open ${kind}complaints ${where}`.replace(/\s+/g, " ").trim(), draft: c.ids.slice(0, 1) };
  if (p) return { ...base, offers: follow ? ["map", "follow"] : ["map"], map: `open complaints near ${p.name}`, draft: [] };
  return { ...base, offers: ["full"], map: null, draft: [] };
}

/** The offer, said by code as the brief's last sentence: one question, at most two steps, the pick first. */
export function offerLine(o: OfferPayload, lang: Lang): string {
  const ta = lang === "ta";
  const [a, b] = o.offers;
  if (a === "map" && b === "draft") return ta ? "வரைபடத்தில் காட்டட்டுமா, இல்லை அதிகாரிக்கு ஒரு குறிப்பு வரைவு செய்யட்டுமா?" : "Shall I show them on the map, or draft a note to the officer?";
  if (a === "map" && b === "follow" && o.follow) return ta ? `அந்த இடத்தை வரைபடத்தில் காட்டட்டுமா, இல்லை ${o.follow.ta} மண்டலத்தைக் கவனித்துச் சொல்லட்டுமா?` : `Shall I show the area on the map, or follow ${o.follow.en} zone for you?`;
  if (a === "map" && b === "full") return ta ? "வெள்ளப் புகார்களை வரைபடத்தில் காட்டட்டுமா, இல்லை முழுச் செய்தியையும் படிக்கட்டுமா?" : "Shall I show the flooding complaints on the map, or read the whole story?";
  if (a === "map") return ta ? "அந்த இடத்தை வரைபடத்தில் காட்டட்டுமா?" : "Shall I show the area on the map?";
  return ta ? "முழுச் செய்தியையும் படிக்கட்டுமா?" : "Shall I read the whole story?";
}

/**
 * News to ground truth ("what do we have on this?"): what the console holds on the story, said by code: the cases, how old, who holds them,
 * the complaints linked and those past their deadline, then the offer. The cases themselves go to the screen.
 */
export function groundLines(c: Console10, o: OfferPayload, lang: Lang): string[] {
  const ta = lang === "ta";
  const out: string[] = [];
  // a story of no civic kind was not counted: said so, not left unsaid (v10 review 2, finding 5)
  const first = countLine(c, lang) || (c.place && !c.topic ? (ta ? "இந்தச் செய்தி கன்சோல் கண்காணிக்கும் எந்தக் குடிமைப் பிரச்சினையையும் குறிப்பிடவில்லை; அதனால் ஒப்பிட புகார்கள் இல்லை."
    : "This story names no civic problem the console tracks, so I have no cases to match it with.") : "");
  if (first) out.push(first);
  if (c.n && c.n > 0) {
    const late = c.overdue ?? 0, linked = c.complaints;
    const parts = ta
      ? [linked > 0 ? `மொத்தம் ${linked} பேர் புகார் அளித்துள்ளனர்` : "", late > 0 ? `${late} புகார்கள் காலக்கெடுவைத் தாண்டிவிட்டன` : ""].filter(Boolean)
      : [linked > 0 ? `${linked} citizen ${s(linked, "complaint is", "complaints are")} linked to them` : "", late > 0 ? `${late} ${s(late, "is", "are")} past ${s(late, "its", "their")} deadline` : ""].filter(Boolean);
    const said = ta ? parts.join("; ") : parts.join(", and ");
    out.push(ta ? `${said ? `${said}. ` : ""}அவை திரையில் உள்ளன.` : said ? `${said[0].toUpperCase()}${said.slice(1)}; they're on your screen.` : "They're on your screen.");
  }
  // a storm: the rain gauges too
  if (c.storm && c.gauges) out.push(...(ta ? c.gauges.ta : c.gauges.en).slice(0, 1));
  out.push(offerLine(o, lang));
  return out.filter(Boolean);
}
