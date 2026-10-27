/**
 * Checks on incidents known only from the news, applied to each build once it is loaded (derive.ts). They keep a
 * news item from inflating the console's counts and casualty totals:
 *
 *   archival      a "this day in history" item ("13.10.1976: 95 killed in a Bombay air crash", Dinamani's daily slot)
 *                 is not an incident of today: an incident whose every article is dated years before it was
 *                 published, or is a history column, is taken out.
 *   one story     the pipeline groups articles about one event into a story (story_id), but can still file the
 *                 story's articles as several news-only incidents (13 incidents for one car accident, the same
 *                 Tamil headline twice). News-only incidents of one story, in a compatible zone and within
 *                 STORY_HOURS of the earliest, become one incident; its casualties count once (the largest
 *                 figure any of them reported, never the sum).
 *   gas deaths    workers killed by gas in a drain, sewer or well were read as "vector-borne disease" (the word
 *                 for poison in Tamil, விஷ, also appears in disease reports): moved to drain works site safety.
 *   unconfirmed   a death toll of MASS_DEATHS or more from a single news outlet, with no department record, is
 *                 kept on the incident as dead_reported but not counted until a second source or a person
 *                 confirms it (needs_review).
 *   death counts  the pipeline's pattern count read labels as tolls ("Class 12 student killed" → 12, "19 year old
 *                 dies" → 19, "diesel" → "die"): counted again here by casualties(), the same rule as district_intel
 *                 textproc.casualties; a lower count replaces the old one when the LLM gave none.
 */

export const STORY_HOURS = 72;
export const MASS_DEATHS = 10;

const HISTORY = /this day in history|on this day|years ago today|today in history|இதே நாளில்|அன்று இதே நாள்|வரலாற்றில் இன்று|இன்றைய வரலாறு/i;
/** a headline that opens with a date: "13.10.1976:", "13/10/1976 -" */
const DATED = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*[:：\-–—]/;
/** a headline that opens with a year: "1976:" */
const YEAR = /^\s*(1[5-9]\d\d|20\d\d)\s*[:：\-–—]/;

const wall = (t: string) => Date.parse(String(t).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? "" : "+05:30"));

/** The article is about the past: a history column, or it opens with a date more than 30 days before publication. */
export function isArchival(title: string | null | undefined, publishedAt: string | null | undefined): boolean {
  const t = String(title ?? "");
  if (HISTORY.test(t)) return true;
  const pub = publishedAt ? wall(publishedAt) : NaN;
  const d = t.match(DATED);
  if (d) {
    const [day, month, year] = [Number(d[1]), Number(d[2]), Number(d[3])];
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const when = Date.UTC(year, month - 1, day);
    return Number.isFinite(pub) ? when < pub - 30 * 864e5 : year < new Date().getUTCFullYear() - 1;
  }
  const y = t.match(YEAR);
  if (y) {
    const pubYear = Number.isFinite(pub) ? new Date(pub).getUTCFullYear() : new Date().getUTCFullYear();
    return Number(y[1]) < pubYear - 1;
  }
  return false;
}

const GAS = /\b(gas|fumes?|toxic|asphyxia\w*|suffocat\w*|manhole|septic|sewer|sewage tank|stormwater well|poisonous)\b|விஷவாயு|விஷ வாயு|கழிவுநீர்த் ?தொட்டி|மூச்சுத் ?திணற/i;
const DISEASE = /\b(dengue|malaria|chikungunya|cholera|typhoid|fever|mosquito|diarr\w*|jaundice|hepatitis|leptospir\w*|outbreak|infection|virus|viral|cases)\b|டெங்கு|காய்ச்சல்|கொசு|மலேரியா/i;

/** Workers overcome by gas in a drain, sewer or tank, misread as disease. */
export function isGasNotDisease(...texts: (string | null | undefined)[]): boolean {
  const t = texts.filter(Boolean).join(" \n ");
  return GAS.test(t) && !DISEASE.test(t);
}

const ANIMAL = String.raw`(?:stray\s+)?(?:dogs?|pupp(?:y|ies)|cows?|cattle|calf|calves|bulls?|buffalo(?:es)?|goats?|sheep|elephants?|monkeys?|cats?|horses?|deer|peacocks?|birds?|crows?|fish|crocodiles?|snakes?|leopards?)`;
const DIED = String.raw`(?:found\s+dead|dead|die[sd]?|killed|poisoned|mauled|electrocuted|drowned|perish(?:ed)?)`;
/** deaths said of animals: "17 stray dogs found dead", "spotted deer mauled by stray dogs dies", "cows electrocuted" */
const ANIMAL_DEATH = new RegExp(String.raw`\b(?:\d+|two|three|four|five|six|seven|eight|nine|ten|several|many)?\s*${ANIMAL}\b.{0,30}\b${DIED}\b|\b${DIED}\b.{0,15}\b${ANIMAL}\b`, "i");
const ANIMAL_TA = /(நாய்|மாடு|பசு|ஆடு|யானை|குரங்கு|மான்|மயில்|பூனை|குதிரை|பாம்பு)[^.]{0,30}(உயிரிழ|பலி|இறந்|செத்த)/;
/** deaths said of people: "man killed", "2 workers die", "woman found dead" */
const PERSON_DEATH = new RegExp(String.raw`\b(?:men|man|woman|women|boy|girl|child|children|youth|youths|workers?|persons?|people|students?|drivers?|riders?|pedestrians?|residents?|labou?rers?|elderly|victims?|employee|wife|husband|son|daughter|mother|father|couple)\b.{0,25}\b(?:found\s+dead|dead|die[sd]?|killed|drowned|electrocuted|murdered|charred)\b`, "i");
const PERSON_TA = /(ஒருவர்|பேர்|நபர்|சிறுவன்|சிறுமி|பெண்|இளைஞர்|தொழிலாளி|மாணவ|முதியவர்|ஓட்டுநர்)[^.]{0,30}(உயிரிழ|பலி|இறந்|கொலை)/;

/** The deaths in these headlines are of animals, not people: they must not reach a death count. */
export function animalDeathsOnly(...titles: (string | null | undefined)[]): boolean {
  const t = titles.filter(Boolean).join(" \n ");
  return (ANIMAL_DEATH.test(t) || ANIMAL_TA.test(t)) && !PERSON_DEATH.test(t) && !PERSON_TA.test(t);
}

const HOROSCOPE = /\b(horoscope|rasi ?palan|astrology|zodiac|panchang(?:am)?|nalla neram|rahu kalam|raghu kalam)\b|ராசி ?பலன்|இன்றைய ராசி|பஞ்சாங்கம்|ராகு காலம்|நல்ல நேரம்/i;
const OBITUARY = /\b(obituary|passes away|passed away|breathes? (?:his|her) last|demise|condolences?|last rites|final rites|funeral)\b|காலமானார்|இயற்கை எய்தினார்|இரங்கல்/i;
const NOT_NATURAL = /\b(accident|crash|collision|murder|murdered|stabbed|hacked|attack|fire|blaze|drown\w*|electrocut\w*|fell|fall|falls|falling|fallen|collapse\w*|suicide|assault|gas|explosion|run over|hit by|killed|drain|sewer|manhole|injur\w*)\b|விபத்து|கொலை|தீ விபத்து|மூழ்கி|தற்கொலை|தாக்குதல்/i;

/** A horoscope column or the obituary of a natural death: news, but not an incident anyone has to act on. */
export function notAnIncident(title: string | null | undefined): boolean {
  const t = String(title ?? "");
  return HOROSCOPE.test(t) || (OBITUARY.test(t) && !NOT_NATURAL.test(t));
}

// ------------------------------------------------------------ death counts --
// The same rule as district_intel/dintel/textproc.py casualties(): keep the two in step.

const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, several: 3, few: 2 };
const NUM = String.raw`(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|several|few)`;
const toNum = (t: string) => (/^\d+$/.test(t) ? Number(t) : NUM_WORDS[t.toLowerCase()] ?? 1);
const DEATH = new Set(["killed", "dead", "died", "dies", "die", "electrocuted", "drowned", "drown", "பலி", "உயிரிழ"]);
/** the count next to the casualty word: at most two words between, no number, no "and" */
const CASUALTY_EN = new RegExp(String.raw`\b${NUM}\b(?![-\s]*(?:year|yr|month|day|week|hour)s?[-\s]*old)(?!\s*(?:th|st|nd|rd)\b)` +
  String.raw`(?![-\s]*(?:years?|yrs?|%|per\s?cent|km|kms|crore|lakh|rupees?)\b)\s+((?:(?!and\b|or\b|but\b|\d)[a-z'-]+\s+){0,2}?)` +
  String.raw`(?:were\s+|was\s+|are\s+|have\s+been\s+|has\s+been\s+|got\s+)?(killed|dead|died|dies|die|injured|hurt|wounded|electrocuted|drowned|drown)\b`, "gi");
const CASUALTY_TA = /(\d+)\s*(?:பேர்|நபர்கள்|பேருக்கு)?\s*(பலி|உயிரிழ|காயம்|படுகாய)/g;
/** a number that labels something ("Class 12", "Route 21", "Rs 87", "aged 19", வகுப்பு 12), not a count of people */
const NOT_A_COUNT = /(?:\b(?:class|std|standard|grade|form|route|bus|ward|no|number|platform|gate|sector|block|phase|plot|door|flat|aged|age|nh|sh|zone|division|unit|batch|room|seat|bay|pier|berth|section|sec|rs|inr|km|chapter|lane|cross|street)\.?|₹|#|வகுப்பு|வார்டு)\s*$/i;
const SINGULAR = /^(?:student|boy|girl|man|woman|child|youth|worker|person|labourer|driver|rider|pedestrian|resident|teen|teenager|toddler|infant|baby|son|daughter|wife|husband|mother|father|victim|employee|guard|constable|officer|fisherman|farmer|patient)\b/i;
const COUNT_BEFORE_LABEL = new RegExp(String.raw`\b${NUM}\s+(?:class|std|standard|grade)\s+\d+\w*\s+(?:[a-z]+\s+){0,1}?(?:were\s+|was\s+)?(killed|dead|died|dies|drowned|drown|electrocuted)\b`, "gi");
const ONE_DEATH_EN = /\b(?:man|woman|boy|girl|youth|worker|person|labourer|student|driver|rider|pedestrian|resident|teen|teenager|child|toddler|infant|baby|son|daughter|wife|husband|mother|father|victim|employee|guard|constable|fisherman|patient|elderly|techie|\d{1,3}[-\s]year[-\s]old)\s+(?:was\s+|is\s+)?(?:found\s+)?(?:killed|dies|died|dead|electrocuted|drowns|drowned)\b/i;
const ONE_DEATH_TA = /(?:மாணவர்|மாணவி|மாணவன்|இளைஞர்|பெண்|சிறுவன்|சிறுமி|தொழிலாளி|முதியவர்|ஓட்டுநர்|குழந்தை)\s*(?:பலி|உயிரிழ)/;

/** [dead, injured] said in a news text; a number counts only next to the casualty word and when it is not a label. */
export function casualties(text: string | null | undefined): [number, number] {
  const s = String(text ?? "");
  let dead = 0, injured = 0;
  const labelled = (at: number) => NOT_A_COUNT.test(s.slice(Math.max(0, at - 14), at));
  for (const m of s.matchAll(CASUALTY_EN)) {
    const n = toNum(m[1]);
    if (n > 200 || labelled(m.index!) || (n > 1 && SINGULAR.test(m[2] ?? ""))) continue;
    if (DEATH.has(m[3].toLowerCase())) dead = Math.max(dead, n); else injured = Math.max(injured, n);
  }
  for (const m of s.matchAll(CASUALTY_TA)) {
    const n = Number(m[1]);
    if (n > 200 || labelled(m.index!)) continue;
    if (DEATH.has(m[2])) dead = Math.max(dead, n); else injured = Math.max(injured, n);
  }
  for (const m of s.matchAll(COUNT_BEFORE_LABEL)) {
    const n = toNum(m[1]);
    if (n <= 200 && DEATH.has(m[2].toLowerCase())) dead = Math.max(dead, n);
  }
  if (!dead && (ONE_DEATH_EN.test(s) || ONE_DEATH_TA.test(s))) dead = 1;
  return [dead, injured];
}

export interface NewsIncident {
  id: string;
  /** first reported, "YYYY-MM-DD HH:MM:SS" IST */
  t: string;
  zone: number | null;
  /** has a department record or citizen complaint: never merged here */
  mediaOnly: boolean;
}

export const CASUALTY_HOURS = 48;

export interface Casualty { id: string; t: string; zone: number | null; /** placeKey of the named place ("" when only the city) */ place: string; dead: number }

/**
 * News-only reports of the same deaths at the same place, filed under different stories (the pipeline put five articles on
 * two workers killed by gas in Kodungaiyur into four stories, and one counted the deaths in three categories): the same
 * named place in the same zone, the same death toll, within CASUALTY_HOURS of the first report. Each duplicate's id →
 * the first report's. Two separate fatal events at one locality with the same toll inside two days are rare enough that
 * counting them once is the safer mistake for a briefing's death total.
 */
export function casualtyMerges(list: Casualty[]): Map<string, string> {
  const into = new Map<string, string>();
  const groups = new Map<string, Casualty[]>();
  for (const c of list) {
    if (!(c.dead > 0) || !c.place || c.zone == null) continue;
    const k = `${c.zone}|${c.place}|${c.dead}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
  }
  for (const g of groups.values()) {
    g.sort((a, b) => wall(a.t) - wall(b.t) || a.id.localeCompare(b.id));
    let lead = g[0];
    for (const c of g.slice(1)) {
      if (wall(c.t) - wall(lead.t) <= CASUALTY_HOURS * 36e5) into.set(c.id, lead.id);
      else lead = c;
    }
  }
  return into;
}

/**
 * News-only incidents that are the same story: each duplicate's id → the incident it joins. The group's anchor is its
 * earliest incident; an incident more than STORY_HOURS after it, or in another zone, stays on its own. The incident
 * kept is the earliest with a zone (it is on the map), else the earliest.
 */
export function storyMerges(stories: Map<string, NewsIncident[]>): Map<string, string> {
  const into = new Map<string, string>();
  for (const list of stories.values()) {
    const media = [...new Map(list.filter((i) => i.mediaOnly).map((i) => [i.id, i])).values()]
      .sort((a, b) => wall(a.t) - wall(b.t) || a.id.localeCompare(b.id));
    if (media.length < 2) continue;
    const first = wall(media[0].t);
    const group = media.filter((i) => wall(i.t) - first <= STORY_HOURS * 36e5);
    // articles placed in two different zones may be two events of one running story ("protests across the city"): leave them
    if (group.length < 2 || new Set(group.map((i) => i.zone).filter((z) => z != null)).size > 1) continue;
    const keep = group.find((i) => i.zone != null) ?? group[0];
    for (const i of group) if (i.id !== keep.id) into.set(i.id, keep.id);
  }
  return into;
}
