/**
 * Ask the Map's rules router: a question in English, Tamil or Tanglish becomes a typed Plan with no AI. Category words
 * come from the console's own topic and keyword lists, departments from deptwords.ts, places from resolve.ts, distances
 * from "300 m", "1.5 km", "half a km" or "300 மீட்டர்". A follow-up ("only severe", "make it 500 m", "add hospitals",
 * "compare with Adyar") edits the current plan instead of starting over. Questions the rules cannot read return null,
 * and the caller may ask the AI to fill the same schema (ai.ts). Pure.
 */
import { tokens, hasPhrase, topicOf, OVERDUE } from "@/lib/assistant/intent";
import { zoneNosIn } from "@/lib/zone-no";
import { detectLanguage } from "@/lib/assistant/lang";
import { classify } from "@/lib/collector/nlp";
import { AGE, checkSpec, MAX_HOURS, periodWordsOut, readPeriod, spanOf, type PeriodKey, type PeriodSpec } from "@/lib/period/read";
import { isCalendar, LIMITS, OPEN_FILTER, type AreaRef, type Filter, type Period, type Plan, type Step } from "./plan";
import { areaFor, isLine, type Found, type Verb } from "./resolve";
import type { LayerId } from "./types";
import type { Lang } from "./words";

// --------------------------------------------------------------- words --

type Facility = { layer: LayerId; where: { government: boolean | null; kinds: string[] | null } | null; words: string[] };
/** Facility types a question can be "near", longest phrases first within each. */
export const FACILITIES: Facility[] = [
  { layer: "hospitals", where: { government: true, kinds: null }, words: ["government hospital", "government hospitals", "govt hospital", "govt hospitals", "gh", "phc", "uphc", "health centre", "health centres", "health center", "அரசு மருத்துவமனை", "அரசு மருத்துவமனைகள்", "ஆரம்ப சுகாதார நிலைய", "govt aaspathri"] },
  { layer: "hospitals", where: { government: null, kinds: ["clinic"] }, words: ["clinic", "clinics", "கிளினிக்"] },
  { layer: "hospitals", where: { government: null, kinds: ["hospital", "health_centre"] }, words: ["hospital", "hospitals", "மருத்துவமனை", "மருத்துவமனைகள்", "மருத்துவமனைகளுக்கு", "aaspathri", "aspathri", "aspatri", "hospitalu", "hospital kitta"] },
  { layer: "schools", where: null, words: ["school", "schools", "பள்ளி", "பள்ளிகள்", "பள்ளிக்கூட", "schoolu"] },
  { layer: "colleges", where: null, words: ["college", "colleges", "university", "universities", "கல்லூரி", "கல்லூரிகள்", "பல்கலைக்கழக", "collegeu"] },
  { layer: "fire_stations", where: null, words: ["fire station", "fire stations", "fire service", "தீயணைப்பு நிலைய", "தீயணைப்பு"] },
  { layer: "police", where: null, words: ["police station", "police stations", "காவல் நிலைய", "காவல் நிலையங்கள்", "police stationu"] },
  { layer: "rail_metro", where: null, words: ["metro station", "metro stations", "railway station", "railway stations", "train station", "train stations", "rail station", "மெட்ரோ நிலைய", "ரயில் நிலைய"] },
  { layer: "water_bodies", where: null, words: ["lake", "lakes", "pond", "ponds", "water body", "water bodies", "ஏரி", "ஏரிகள்", "குளம்", "குளங்கள்", "eri"] },
  { layer: "waterways", where: null, words: ["canal", "canals", "river", "rivers", "waterway", "waterways", "nullah", "கால்வாய்", "கால்வாய்கள்", "ஆறு", "ஆறுகள்"] }
];

const NEAR = ["near", "nearby", "around", "close to", "next to", "beside", "within", "surrounding", "அருகே", "அருகில்", "அருகிலுள்ள", "அருகாமையில்", "பக்கத்தில்", "பக்கம்", "சுற்றி",
  "pakkathula", "pakkathil", "pakkam", "kitta", "kitte", "arugil", "arugey", "aruge", "arukil", "around-la"];
const ALONG = ["along", "on", "alongside", "stretch of", "சாலையில்", "வழியாக", "நெடுகிலும்", "road la", "salai la", "roadla", "salaila"];

/** Map words for categories, checked before the console's topics: precise, and in Tamil and Tanglish. */
const CAT_WORDS: { cats?: string[]; family?: string[]; words: string[] }[] = [
  { cats: ["FLOOD_WATERLOGGING"], words: ["waterlogging", "waterlogged", "water logging", "water-logging", "water stagnation", "stagnant water", "standing water", "inundation", "inundated",
    "மழைநீர் தேக்கம்", "மழைநீர் தேங்", "நீர் தேக்கம்", "தண்ணீர் தேங்", "நீர் தேங்", "water stagnation-a", "thanni thengi", "thanni nikkudhu", "thanni nikuthu", "water nikkudhu"] },
  { family: ["FLOOD"], words: ["flooding", "flood", "floods", "flooded", "வெள்ளம்", "வெள்ளப்", "vellam"] },
  { cats: ["SOLID_WASTE"], words: ["garbage", "waste", "trash", "rubbish", "dumping", "குப்பை", "குப்பைகள்", "kuppai"] },
  { cats: ["STREETLIGHT_ELECTRICAL"], words: ["streetlight", "streetlights", "street light", "street lights", "live wire", "electrical hazard", "தெருவிளக்கு", "மின் விளக்கு", "street light-u"] },
  { cats: ["ROAD_DAMAGE"], words: ["pothole", "potholes", "road damage", "damaged road", "damaged roads", "பள்ளம்", "சாலை சேதம்", "kuzhi"] },
  // before road accidents: a "fire accident" (தீ விபத்து) is a fire
  { cats: ["FIRE_EXPLOSION"], words: ["fire accident", "fire accidents", "fires", "blaze", "explosion", "தீ விபத்து", "தீ விபத்துகள்"] },
  { cats: ["ROAD_ACCIDENT"], words: ["accident", "accidents", "crash", "crashes", "collision", "road accident", "road accidents", "விபத்து", "விபத்துகள்", "vibathu", "vibaththu"] },
  { cats: ["CRIME_PROPERTY"], words: ["theft", "thefts", "robbery", "robberies", "snatching", "chain snatching", "burglary", "திருட்டு", "கொள்ளை", "thiruttu"] },
  { cats: ["DRAINAGE_SEWAGE"], words: ["sewage", "drainage", "drain overflow", "overflowing drain", "manhole", "கழிவுநீர்", "சாக்கடை", "kazhivuneer", "saakadai"] },
  { cats: ["WATER_SUPPLY"], words: ["drinking water", "water supply", "no water", "water shortage", "குடிநீர்", "kudineer"] },
  { cats: ["VECTOR_DISEASE"], words: ["dengue", "mosquito", "mosquitoes", "malaria", "fever", "டெங்கு", "கொசு", "kosu"] },
  { cats: ["STRAY_ANIMALS"], words: ["stray dog", "stray dogs", "dog bite", "dog bites", "stray cattle", "தெருநாய்", "நாய் கடி"] },
  { cats: ["TREES_PARKS"], words: ["tree fall", "fallen tree", "trees fell", "tree fell", "uprooted", "மரம் விழுந்", "மரம் சாய்ந்"] },
  { cats: ["ENCROACHMENT"], words: ["encroachment", "encroachments", "ஆக்கிரமிப்பு"] },
  { cats: ["TRAFFIC_OBSTRUCTION"], words: ["traffic jam", "traffic snarl", "illegal parking", "traffic", "போக்குவரத்து நெரிசல்"] },
  { cats: ["BUILDING_SAFETY"], words: ["wall collapse", "building collapse", "unsafe building", "unsafe buildings", "சுவர் இடிந்"] },
  { family: ["CRIME"], words: ["crime", "crimes", "குற்றம்", "குற்றங்கள்", "kuttram"] }
];
const COMPLAINT = ["complaint", "complaints", "grievance", "grievances", "petition", "petitions", "புகார்", "புகார்கள்", "pugar", "pugaar", "complaintu"];
/** "in the news": incidents a news outlet reported (not a category: "garbage in the news" is garbage, reported in the news) */
const NEWS = ["in the news", "in the papers", "in the paper", "news", "newspaper", "newspapers", "news report", "news reports", "news reported", "press", "press reports", "media",
  "media reports", "headlines", "செய்தி", "செய்திகள்", "செய்திகளில்", "செய்தியில்", "நாளிதழ்", "நாளிதழ்களில்", "பத்திரிகை", "பத்திரிகைகளில்", "ஊடக", "ஊடகங்களில்",
  "news la", "newsla", "paper la", "paperla", "news-la"];
const SEVERE = ["severe", "serious", "critical", "கடுமையான", "கடுமை", "தீவிர", "gambhir", "serious-a", "severe-a"];
const SEVERE_HIGH = ["severe or high", "high or severe", "severe and high", "high and severe", "urgent", "high severity", "high-severity", "அவசர"];
const OPEN = ["open", "pending", "unresolved", "not resolved", "active", "ongoing", "திறந்த", "நிலுவை", "நிலுவையில்", "தீர்க்கப்படாத", "pending-a"];
const CLOSED = ["closed", "resolved", "completed", "fixed", "தீர்க்கப்பட்ட", "முடிந்த", "முடிக்கப்பட்ட"];
const ANY_STATUS = ["all status", "any status", "including closed", "open or closed", "open and closed", "all cases", "all incidents", "every incident", "அனைத்து", "எல்லா"];
const COUNT_BY: [RegExp, "ward" | "zone" | "taluk"][] = [
  [/\b(by|per|each|every|across)\s+wards?\b|\bward[- ]?wise\b|வார்டு\s*வாரி|வார்டுவாரி|ward\s*wise/i, "ward"],
  [/\b(by|per|each|every|across)\s+zones?\b|\bzone[- ]?wise\b|மண்டல\s*வாரி|zone\s*wise/i, "zone"],
  [/\b(by|per|each|every|across)\s+taluks?\b|\btaluk[- ]?wise\b|வட்ட\s*வாரி/i, "taluk"]
];
const HOTSPOT = /\b(hot ?spots?|clusters?|clustering|clustered|concentrat\w+|bunch\w*)\b|கொத்து|அதிகம் குவிந்த|hotspot|\benga\s+(adhigam|adhigama|athigam|athigama|jaasthi|jasthi)\b/i;
const NEAREST = /\b(nearest|closest)\b|அருகிலுள்ள\s*\S*\s*(எது|எவை|எங்கே)|மிக அருகில்|kitta irukura|pakkathula irukura/i;
const FARTHEST = /\b(farthest|furthest|far from|most remote|least served|underserved|gaps?|no\s+\w+(\s+\w+)?\s+within|without (a|any)\s+\w+(\s+\w+)?\s+within)\b|தொலைவில்|வசதி இல்லாத/i;
const COMPARE = /\b(compare|comparison|vs\.?|versus)\b|ஒப்பிடு|ஒப்பீடு|compare pannu/i;
const CHANGE = /\b(this|current|indha|intha)\s+(week|month|vaaram|maasam)\s+(vs\.?|versus|and|against|compared (to|with))\s+(the\s+)?(last|previous|pona|munnadi)\s+(week|month|vaaram|maasam)\b|\b(than|from|vs\.?|versus|compared (to|with))\s+(the\s+)?(last|previous)\s+(week|month)\b|\b(go(ne)?|went|going)\s+(down|up)\b|\b(increased|decreased|increasing|decreasing|dropped)\b|கடந்த\s+(வாரத்தை|மாதத்தை)\s+விட|குறைந்த(தா|ுள்ளதா)|அதிகரித்த(தா|ுள்ளதா)/i;
const BRIEF = /\b(what is happening|what's happening|whats happening|what is going on|what's going on|summary|summarise|summarize|brief me|situation|area brief|overview of)\b|என்ன நடக்கிறது|நிலைமை|சுருக்கம்|enna nadakkudhu|enna nadakuthu|enna aagudhu/i;
const OUT_OF_SCOPE: [RegExp, { en: string; ta: string }][] = [
  [/\b(route|directions?|how long (does it|to) (take|drive|reach)|travel time|fastest way|drive to|traffic time|eta)\b|வழி காட்டு|எவ்வளவு நேரம்/i,
    { en: "I measure straight-line distance, not travel time. Open the place in Google Maps for the route and travel time.", ta: "நான் நேர்கோட்டுத் தூரத்தை மட்டுமே அளக்கிறேன், பயண நேரத்தை அல்ல. வழிக்கும் பயண நேரத்திற்கும் Google Maps ஐத் திறக்கவும்." }],
  [/\b(forecast|predict|prediction|will (it|there) (flood|rain|be)|tomorrow|next week|next month)\b|நாளை|முன்னறிவிப்பு/i,
    { en: "The map shows what has been reported; it does not forecast. For weather warnings, see the Environment page.", ta: "வரைபடம் பதிவானவற்றை மட்டும் காட்டும்; முன்னறிவிப்பு செய்யாது. வானிலை எச்சரிக்கைகளுக்கு சுற்றுச்சூழல் பக்கத்தைப் பார்க்கவும்." }],
  [/\b(who (is|was) the complainant|complainant'?s? (name|phone|address|number)|phone number of|address of the (person|complainant)|personal details)\b|புகார்தாரர் பெயர்/i,
    { en: "The map never shows a complainant's name, phone, email or address.", ta: "புகார்தாரரின் பெயர், தொலைபேசி, மின்னஞ்சல் அல்லது முகவரியை வரைபடம் காட்டாது." }]
];

const any = (toks: string[], phrases: string[]) => phrases.some((p) => hasPhrase(toks, p));
const firstHit = (toks: string[], phrases: string[]) => phrases.find((p) => hasPhrase(toks, p)) ?? null;

// ------------------------------------------------------------- numbers --

/** A distance in metres said in the question: "300 m", "300 meters", "1.5 km", "half a km", "300 மீட்டர்", "அரை கிலோமீட்டர்". */
export function distanceOf(text: string): number | null {
  const t = text.toLowerCase();
  if (/\bhalf\s+(a\s+)?(km|kilomet(er|re))\b|அரை\s*(கி\.?\s*மீ|கிலோ)/.test(t)) return 500;
  if (/\bquarter\s+(of\s+)?(a\s+)?(km|kilomet(er|re))\b/.test(t)) return 250;
  if (/\b(a|one)\s+(km|kilomet(er|re))\b|ஒரு\s*(கி\.?\s*மீ|கிலோமீட்டர்)/.test(t)) return 1000;
  const km = t.match(/(\d+(?:\.\d+)?)\s*(km|kms|kilomet(?:er|re)s?|கி\.?\s*மீ|கிலோமீட்டர்)/);
  if (km) return Math.round(Number(km[1]) * 1000);
  const m = t.match(/(\d+(?:\.\d+)?)\s*(m|mtr|mtrs|meters?|metres?|மீட்டர்|மீ)(?![a-z஀-௿])/);
  if (m) return Math.round(Number(m[1]));
  return null;
}

/** "5 nearest", "top 3 nearest", "3 closest" -> 5; else null. */
function kOf(text: string): number | null {
  const m = text.match(/\b(\d{1,2})\s+(nearest|closest)\b|\b(nearest|closest)\s+(\d{1,2})\b|(\d{1,2})\s*(அருகிலுள்ள)|\b(\d{1,2})\s+(police stations?|hospitals?|schools?|colleges?|fire stations?|metro stations?)\b/i);
  const n = Number(m?.[1] ?? m?.[4] ?? m?.[5] ?? m?.[7]);
  return n >= 1 ? Math.min(LIMITS.k, n) : null;
}

/** The console's rolling windows in days. */
const KEY_DAYS: Record<PeriodKey, number> = { daily: 1, weekly: 7, monthly: 30, quarterly: 90 };
/** A calendar period's rolling window of about the same length, for a change between two equal windows. */
const ROLLING_DAYS = { day: 1, week: 7, month: 30, quarter: 90 } as const;

/**
 * What a question says about time, for the map: a window; "all" (any time); "now" (the current state: what is open now, whatever day it was
 * reported); "unheld" (a time the records cannot answer: "two weeks ago", "last year", "next week"); null (no time said, or one the map does not
 * take as the window).
 */
export type SaidPeriod = Period | null | "all" | "now" | "unheld";
export const isPeriod = (p: SaidPeriod | undefined): p is Period => typeof p === "object" && p !== null;

const ALL_TIME = /\b(all time|ever|since may|whole period|all dates|any time)\b|எல்லா காலமும்/;
// a time the question bounds or leaves out ("reported before yesterday", "leaving out today", "except this week") is not the window it asks for
// ("the day before yesterday" is a day, not a bound)
const BOUNDED = new RegExp([
  String.raw`\b(?:(?<!\b(?:day|week|month)\s)before|prior to|earlier than|older than|newer than|later than|except|excluding|leaving out|other than|apart from|not including|but not|not|outside(?:\s+of)?)\s+(?:(?:on|in|during|for|from|the|of)\s+)*`
    + String.raw`(?:today|tonight|yesterday|(?:this|last|past|previous)\s+(?:\d+\s+)?(?:days?|weeks?|months?|quarters?|years?)\b`
    + String.raw`|january|february|march|april|june|july|august|september|october|november|december|(?:jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d`
    + String.raw`|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))`,
  String.raw`(?:இன்று|இன்றை|நேற்று|நேற்றை|இந்த|கடந்த)[஀-௿]*\s*(?:க்கு\s*)?(?:முன்(?!தினம்)|தவிர)`,
  String.raw`\b(?:innaiki|inniki|innaiku|nethu|indha|pona)\S*\s+(?:munnadi|thavira)\b`
].join("|"), "i");
const BOUNDED_ALL = new RegExp(BOUNDED.source, "gi");
// a plain "now" is mostly a sequence word ("by ward now", "இப்போது வார்டு வாரியாக காட்டு"): only these name the current state
const NOW_STATE = /\b(?:right now|currently|at present|presently|as of now|at the moment|at this moment)\b|தற்போது/i;
// a time the records cannot reach: ahead of now, or a year back. A weekday, "a few days" or "a fortnight" the reader does not read is not one
const FAR = /\b(?:next|coming|upcoming)\s+(?:week|month|quarter|year)\b|\btomorrow\b|\b(?:last|previous|past)\s+year\b|\bnext year\b|\b(?:\d+|a|one|two|three)\s+years?\s+ago\b|அடுத்த\s*(?:வாரம்|மாதம்|ஆண்டு|வருடம்)|நாளை|கடந்த\s*(?:ஆண்டு|வருடம்)/i;
// "5 naal kulla", "10 naatkal la": the map's own Tanglish count, which the reader does not hold
const DAYS_TG = /(\d{1,3})\s*(?:naal|naatkal|days)\s*(?:la|kulla)\b/i;
// a count longer than the records reach (the reader calls it unheld): "last 200 days", "past 12 months", "last 30 weeks"
const LONG_COUNT = /\b(?:last|past|previous|over the past|over the last|in the last|in the past)\s+(\d{1,4})\s+(days?|weeks?|months?|years?)\b|கடந்த\s*(\d{1,4})\s*(நா|வார|மாத)/i;
const AGE_N: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, seven: 7, thirty: 30 };
// "8 months ago", "200 days back": a time further back than the records reach (the reader's MAX_HOURS, about 180 days)
const AGO = /\b(\d{1,5}|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(days?|weeks?|months?)\s+(?:ago|back)\b/i;
const NUM_WORD: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
function agoBeyondRecords(text: string): boolean {
  const m = text.match(AGO);
  if (!m) return false;
  const n = /^\d/.test(m[1]) ? Number(m[1]) : NUM_WORD[m[1].toLowerCase()] ?? 1, u = m[2].toLowerCase();
  return n * (u.startsWith("day") ? 24 : u.startsWith("week") ? 168 : 720) > MAX_HOURS;
}

/** The map's IST wall clock "YYYY-MM-DD HH:MM:SS" moved by `hours` (may be negative). */
const wallPlus = (wall: string, hours: number): string => new Date(Date.parse(wall.replace(" ", "T") + "Z") + Math.round(hours * 3600_000)).toISOString().slice(0, 19).replace("T", " ");

/** "open for more than 30 days", "pending for a week": the age asked for, in hours (the reader's AGE phrases), or null. */
function ageHours(text: string): { hours: number; n: number; unit: "day" | "week" | "month" } | null {
  for (const m of text.matchAll(AGE)) {
    const words = m[0].toLowerCase().match(/(\d+|seven|thirty|an?|one|two|three)\s+(day|week|month)/);
    if (!words) continue;
    const n = /^\d+$/.test(words[1]) ? Number(words[1]) : AGE_N[words[1]] ?? 1;
    const unit = words[2] as "day" | "week" | "month";
    return { hours: n * (unit === "day" ? 24 : unit === "week" ? 168 : 720), n, unit };
  }
  return null;
}

/** A window of the reader's, with dates put on it at `now`, as the map's inclusive range and the reader's own words. */
function rangeOf(spec: PeriodSpec, now: string): Period | "unheld" {
  const span = spanOf(spec, now);
  if (!span) return "unheld";
  if (span.range) return { kind: "range", from: span.range.from, to: wallPlus(span.range.to, -1 / 3600), label: { en: span.label.en, ta: span.label.ta }, said: spec };
  // a rolling count of hours: the hours back from now, (from, to] as the reader counts them
  const hours = span.hours ?? KEY_DAYS[span.key] * 24;
  return { kind: "range", from: wallPlus(now, -hours + 1 / 3600), to: now, label: { en: span.label.en, ta: span.label.ta }, said: spec };
}

/**
 * Period words: "today", "this week", "last 10 days", "இந்த மாதம்", "indha vaaram". Read by the one reader of Jarvis and Ask District IQ
 * (src/lib/period/read.ts, fixall3-map-today), so a phrase means one window on the whole console:
 * - "today" is the calendar day since midnight IST, "yesterday" the day before, "last week / month / quarter" the calendar one before;
 * - "this week", "last 7 days", "this month" are the console's rolling windows, "last 10 days" that much back, "last 36 hours" 36 hours back;
 * - "in September", "on 20 Oct", "since 1 October", "the last week of September": those calendar bounds (`now` is the map's clock; without it null);
 * - "right now": the current state (no reporting window); "two weeks ago", "last year": unheld, a time the records cannot answer;
 * - an age ("open for more than 30 days") is the incidents reported before then, never a window of the last 30 days;
 * - a count past what the records hold ("last 12 months") is that many days, at most a year: every record the store keeps;
 * - a time the question bounds or leaves out ("before yesterday") is not taken as the window: null, so its words stay unread.
 */
export function periodOf(text: string, now?: string | null): SaidPeriod {
  const t = text.toLowerCase();
  if (ALL_TIME.test(t)) return "all";
  // the bound and its time are taken out and the rest is read: "the last 30 days excluding today" is the last 30 days
  if (BOUNDED.test(text)) return periodOf(text.replace(BOUNDED_ALL, " "), now);
  const age = ageHours(text);
  if (age) {
    if (age.hours >= 24 * LIMITS.days) return "unheld";
    if (!now) return null;
    const unit = { day: ["day", "நாட்கள்"], week: ["week", "வாரங்கள்"], month: ["month", "மாதங்கள்"] }[age.unit];
    return { kind: "range", from: wallPlus(now, -24 * LIMITS.days + 1 / 3600), to: wallPlus(now, -age.hours),
      label: { en: `reported more than ${age.n} ${unit[0]}${age.n === 1 ? "" : "s"} ago`, ta: `${age.n} ${unit[1]}க்கு முன் பதிவானவை` }, age_hours: age.hours };
  }
  const s = readPeriod(text);
  switch (s.kind) {
    case "window": case "compare": return { kind: "last_days", days: KEY_DAYS[s.key], offset: 0 };
    case "hours":
      if (s.hours % 24 === 0) return { kind: "last_days", days: Math.min(LIMITS.days, s.hours / 24), offset: 0 };
      return now ? rangeOf(s, now) : null;
    case "day": return { kind: "day", offset: s.back };
    case "last": return { kind: s.unit, offset: 1 };
    case "now": return NOW_STATE.test(text) ? "now" : null;
    case "month": case "days": case "since": case "holiday": case "lastWeekOf": return now ? rangeOf(s, now) : null;
    case "unheld": {
      const m = t.match(LONG_COUNT);
      if (!m && (FAR.test(text) || agoBeyondRecords(text))) return "unheld";
      // not a time the map reads ("since Monday", "a few days", "7 days ago"): no window, and its words stay unread for the AI or the note.
      // The map's own fallback below would read "7 days" in "7 days ago" as the current window (YRULES-05)
      if (!m) return null;
      const n = Number(m[1] ?? m[3]), u = (m[2] ?? m[4] ?? "").toLowerCase();
      const days = /^(week|வார)/.test(u) ? n * 7 : /^(month|மாத)/.test(u) ? n * 30 : /^year/.test(u) ? n * 365 : n;
      return { kind: "last_days", days: Math.min(LIMITS.days, days), offset: 0 };
    }
    case "none": break;
  }
  // the map's own words the reader does not hold ("5 naal kulla"); calendar words keep the reader's meaning here too
  const n = t.match(/\b(?:last|past|previous)\s+(\d{1,3})\s+days?\b|கடந்த\s*(\d{1,3})\s*நா(?:ள்|ட்)/) ?? t.match(DAYS_TG);
  if (n) return { kind: "last_days", days: Math.min(LIMITS.days, Number(n[1] ?? n[2])), offset: 0 };
  const mo = t.match(/\b(?:last|past)\s+(\d{1,2})\s+months?\b/);
  if (mo) return { kind: "last_days", days: Math.min(LIMITS.days, Number(mo[1]) * 30), offset: 0 };
  if (/\btoday\b|இன்று|innaiki|inniki|indru/.test(t)) return { kind: "day", offset: 0 };
  if (/\b(last 24 hours|past 24 hours|since yesterday)\b/.test(t)) return { kind: "last_days", days: 1, offset: 0 };
  if (/\blast week\b|கடந்த வாரம்/.test(t)) return { kind: "week", offset: 1 };
  if (/\blast month\b|கடந்த மாதம்/.test(t)) return { kind: "month", offset: 1 };
  if (/\blast quarter\b/.test(t)) return { kind: "quarter", offset: 1 };
  if (/\b(this week|last 7 days|past 7 days|past week|7 days|one week|a week)\b|இந்த வாரம்|indha vaaram|intha vaaram|indha week|intha week|this vaaram/.test(t)) return { kind: "last_days", days: 7, offset: 0 };
  if (/\b(this quarter|last 3 months|past 3 months|90 days|three months)\b/.test(t)) return { kind: "last_days", days: 90, offset: 0 };
  if (/\b(this month|last 30 days|past 30 days|past month|30 days|one month)\b|இந்த மாதம்|indha maasam|intha maasam|indha month|intha month/.test(t)) return { kind: "last_days", days: 30, offset: 0 };
  return null;
}

const MONTH_WORDS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"];
// what a follow-up may hold besides its time and still be a time edit alone ("show me today's", "only this month", "இப்போது காட்டு")
const EDIT_FILLER = new Set(["show", "only", "just", "me", "the", "them", "those", "these", "ones", "one", "it", "please", "pls", "now", "then", "and",
  "so", "ok", "okay", "also", "make", "set", "change", "to", "for", "in", "of", "list", "give", "instead", "what", "about", "s", "கட்டு", "காட்டு",
  "காட்டுங்கள்", "காண்பி", "மட்டும்", "kaattu", "kaatunga", "sollu", "sollunga", "mattum", "ippo", "இப்போது",
  // the glue of a time phrase the reader leaves behind ("last" in "last 30 days", the month in "in September")
  "last", "past", "previous", "this", "since", "from", "till", "until", "between", "on", "at", "day", "days", "week", "weeks", "month", "months", "hour",
  "hours", "quarter", ...MONTH_WORDS]);
const onlyTime = (t: string): boolean => tokens(periodWordsOutMap(t)).every((w) => EDIT_FILLER.has(w) || /^\d+$/.test(w));

/**
 * A plan with each date range put on `now` (XPATHS-04, YRANGES-02): a range the words gave ("since 1 October", "last 36 hours", an age) is
 * counted, labelled and exported for the run's own now, so a saved view never names one window and counts another.
 */
export function freshPlan(plan: Plan, now: string): Plan {
  const fresh = (p: Period | null): Period | null => {
    if (!p || p.kind !== "range") return p;
    if (p.age_hours) return { ...p, from: wallPlus(now, -24 * LIMITS.days + 1 / 3600), to: wallPlus(now, -p.age_hours) };
    const spec = p.said ? checkSpec(p.said) : null;
    const r = spec ? rangeOf(spec, now) : null;
    return r && r !== "unheld" ? r : p;
  };
  if (!plan.steps.some((s) => (s.op === "take" && s.filter?.period?.kind === "range") || (s.op === "change" && (s.now.kind === "range" || s.before.kind === "range")))) return plan;
  return { ...plan, steps: plan.steps.map((s) => s.op === "take" && s.filter ? { ...s, filter: { ...s.filter, period: fresh(s.filter.period) } }
    : s.op === "change" ? { ...s, now: fresh(s.now)!, before: fresh(s.before)! } : s) };
}

/** The sentence with the time words the map read taken out, so they are never counted as words it could not use. */
export function periodWordsOutMap(text: string): string {
  const out = periodWordsOut(text.replace(AGE, " ")).replace(new RegExp(DAYS_TG.source, "gi"), " ").replace(new RegExp(ALL_TIME.source, "gi"), " ");
  // a month the map read is read, not a word left for the AI
  return out.replace(new RegExp(String.raw`\b(?:${MONTH_WORDS.join("|")})\b`, "gi"), " ");
}

/** A word that names a time ("yesterday", "last month", "vaaram"), as opposed to a comparison alone ("up or down?"). */
const TIME_WORD = /\b(?:today|yesterday|tonight|days?|weeks?|months?|quarters?|years?|hours?|innaiki|inniki|innaiku|nethu|nethai\w*|vaaram|vaarath\w*|maasam|maasath\w*|kadandha|pona)\b|இன்ற|நேற்ற|வாரம்|வாரத்|மாதம்|மாதத்|நாள்|நாட்/i;
// a comparison word and a date or month ("compared to August", "vs 20 Oct"): a comparison the map cannot plan as one change
const CMP_WORDS = /\b(?:compared?\s+(?:to|with)|vs\.?|versus|than|against|relative to)\b|\bvida\b|விட/i;
const DATE_WORD = /\b(?:january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b|\bmay\s+\d|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

/** The reader reads a comparison of two periods: "up or down", "than yesterday", "pona maasatha vida", "நேற்றை விட". */
// never a bound ("older than yesterday" is the incidents before yesterday, not a comparison with it)
export const isComparison = (text: string): boolean => readPeriod(text).kind === "compare" && !BOUNDED.test(text);
// the period after a comparison word is the one compared against, not the window asked about: "up from last month", "more than last week"
const REFERENCE = /\b(?:than|from|vs\.?|versus|compared (?:to|with)|against|relative to|over)\s+(?:the\s+)?(?:last|previous|past)\s+(?:week|month|quarter)\b|\b(?:than|from|vs\.?|versus|compared (?:to|with)|against)\s+yesterday\b|(?:வாரத்தை|மாதத்தை|நேற்றை)\s*விட|\b(?:vaaratha|maasatha|nethai|nethaiya)\s+vida\b/i;

/**
 * The two windows of a change, of equal length, the one before ending where this one starts (read.ts's comparison). A calendar period so far
 * (today since midnight, this calendar week) is compared as its rolling window, never against the whole period before it; so is a period named
 * as the one compared against ("up from last month": this month's window against last month's). A whole calendar period said as the window
 * ("did flooding go up last month") is compared with the calendar period before it.
 */
export function changeWindows(said: Period | null, reference = false): { now: Period; before: Period } {
  const now: Period = !said || said.kind === "range" ? { kind: "last_days", days: 7, offset: 0 }
    : isCalendar(said) && (said.offset === 0 || reference) ? { kind: "last_days", days: ROLLING_DAYS[said.kind], offset: 0 } : said;
  return { now, before: { ...now, offset: (now as { offset: number }).offset + 1 } as Period };
}

/**
 * A model's plan held to the question's own time words (fixall3-map-today): any period the words name wins over the model's, "right now" is what
 * is open now with no window, "all time" has no window, and a change compares the two equal windows changeWindows gives, as the rules' plans do.
 * A follow-up that names no time keeps the last answer's window when the model's flat form cannot carry it (a date range).
 */
export function fitModelPlan(plan: Plan, text: string, now?: string | null, prev?: Plan | null): Plan {
  const said = periodOf(text, now);
  const incTake = (s: Step): s is Extract<Step, { op: "take" }> => s.op === "take" && s.layer === "incidents" && !!s.filter;
  const chg = plan.steps.find((s) => s.op === "change") as Extract<Step, { op: "change" }> | undefined;
  if (chg) {
    const w = changeWindows(isPeriod(said) ? said : chg.now, REFERENCE.test(text));
    return { ...plan, steps: plan.steps.map((s) => (s.op === "change" ? { ...s, now: w.now, before: w.before } : incTake(s) ? { ...s, filter: { ...s.filter!, period: w.now } } : s)) };
  }
  if (said === null || said === "unheld") {
    const kept = prev?.steps.find(incTake)?.filter?.period;
    if (said === null && kept?.kind === "range") return { ...plan, steps: plan.steps.map((s) => (incTake(s) && !s.filter!.period ? { ...s, filter: { ...s.filter!, period: kept } } : s)) };
    return plan;
  }
  const period = isPeriod(said) ? said : null;
  return { ...plan, steps: plan.steps.map((s) => (incTake(s) ? { ...s, filter: { ...s.filter!, period, ...(said === "now" && s.filter!.status === "any" ? { status: "open" as const } : {}) } } : s)) };
}

/** The words for a time the records cannot answer, said instead of answering with another window. */
export const UNHELD_SAY = {
  en: "The map cannot pick out that time: it holds about the last 180 days. Ask for today, yesterday, last week, the last 30 days, a month such as September, or since a date.",
  ta: "அந்தக் காலத்தை வரைபடத்தால் தனியாகக் காட்ட முடியாது: ஏறக்குறைய கடந்த 180 நாட்களின் பதிவுகளே உள்ளன. இன்று, நேற்று, கடந்த வாரம், கடந்த 30 நாட்கள், செப்டம்பர் போன்ற ஒரு மாதம், அல்லது ஒரு தேதி முதல் எனக் கேளுங்கள்."
};

// ---------------------------------------------------------------- types --

export interface Chip {
  id: string;
  /** what the chip edits: a part of the plan */
  part: "category" | "status" | "period" | "severity" | "distance" | "facility" | "place" | "dept" | "citizen" | "news" | "group" | "overdue" | "k";
  en: string;
  ta: string;
  /** a default the question did not state */
  isDefault: boolean;
  /** other places the name could mean, as chips ("Adyar zone", "Adyar River") */
  alternatives?: { en: string; ta: string; ref: string; kind: string }[];
}

export type RouteOut =
  | { kind: "plan"; plan: Plan; defaults: string[]; places: Found[]; ai: false; edited: string | null; unread?: string[] }
  | { kind: "brief"; area: AreaRef; label: string; plan: Plan | null; places: Found[] }
  | { kind: "ui"; ui: "open_trace" | "send" | "clear" | "export" | "visits"; dept: string | null; plan: Plan | null }
  | { kind: "say"; en: string; ta: string; chips: string[] };

export interface RouteEnv {
  resolve: (text: string, verb: Verb) => Found[];
  /** department code a question names ("SWD", "Metrowater"), from deptwords.ts */
  dept: (text: string) => string | null;
  lang?: Lang;
  /** the map's clock (the world's IST wall clock "YYYY-MM-DD HH:MM:SS"), to put dates on "in September" or "last 36 hours"; without it those are not read */
  now?: string | null;
}

// ---------------------------------------------------------------- parse --

interface Parsed {
  /** meaningful words the rules could not use ("kids", "sea", "north"): the AI reads the question when there are any */
  unread: string[];
  lang: Lang;
  toks: string[];
  facilities: Facility[];
  cats: string[] | null;
  family: string[] | null;
  citizen: boolean | null;
  news: boolean | null;
  severity: string[] | null;
  status: "open" | "closed" | "any" | null;
  period: SaidPeriod;
  dept: string | null;
  overdue: boolean | null;
  meters: number | null;
  k: number | null;
  places: Found[];
  verb: Verb;
  /** "near schools", "school pakkathula": something near the facility, not the facility itself ("schools in Adyar") */
  facNear: boolean;
  /** a follow-up keeps the last answer's place when it names none ("and thefts?", "hospitals there") */
  keep?: { area: AreaRef | null; line: { ref: string; meters: number } | null };
  /** changeRef: the period said is the one compared against ("up from last month"), not the window asked about */
  shape: { countBy: "ward" | "zone" | "taluk" | null; hotspot: boolean; nearest: boolean; farthest: boolean; compare: boolean; change: boolean; changeRef?: boolean; brief: boolean };
}

/** Words that only ask, point or join ("show me the", "எத்தனை", "evlo"): never a reason to call the AI. */
const FILLER = new Set(("a an the of in on at to for from with by and or not no is are was were be been do does did can could should would will show me list give tell find get see "
  + "my our your their this that these those there here which what where when how why who many much more most less least all any every each some only just also "
  + "please kindly now currently today right case cases incident incidents report reports reported issue issues problem problems event events complaint complaints "
  + "thing things spot spots place places area areas map city chennai district side part parts number count total wise about around near nearby within close along "
  + "open pending closed resolved severe serious high low medium status last past previous week weeks month months day days year time "
  + "meter meters metre metres km kms m it its them they we us i you he she is iruku irukku irukka enna evlo evvalo kaattu sollu la le ku kitta pakkathula pakkam "
  + "உள்ள உள்ளன எத்தனை என்ன காட்டு எங்கே மற்றும் இந்த அந்த அனைத்து எல்லா வந்த வந்தவை வந்துள்ள vandha vandhadhu vandhathu make change same instead too well ones one then so but how else again same").split(/\s+/));

/**
 * The rest of the question after places, facilities and filters were read: content words the rules did not use.
 * Category words the console's keyword lists know, numbers and fillers are not counted.
 */
export function unreadWords(rest: string[], classified: string[]): string[] {
  const known = new Set(classified.flatMap((t) => tokens(t)));
  const allWords = new Set([...CAT_WORDS.flatMap((c) => c.words), ...COMPLAINT, ...NEWS, ...SEVERE, ...SEVERE_HIGH, ...OPEN, ...CLOSED, ...ANY_STATUS, ...NEAR, ...ALONG,
    ...FACILITIES.flatMap((f) => f.words)].flatMap((w) => tokens(w)));
  return [...new Set(rest.filter((t) => t.length >= 3 && !/^\d/.test(t) && !FILLER.has(t) && !known.has(t) && !allWords.has(t) && !topicOf([t])
    && !/^(by|per|ward|zone|taluk|hotspot|cluster|compare|vs|versus|nearest|closest|farthest|furthest|summary|happening|clustering|wise|vaariyaga|வாரியாக)/i.test(t)))];
}

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Is a facility the thing measured from ("near schools", "within 300 m of hospitals", "பள்ளி அருகே") rather than the thing asked for? */
function facilityIsNear(text: string, facWords: string[]): boolean {
  if (!facWords.length) return false;
  const fw = facWords.map(reEsc).join("|");
  const before = new RegExp(`(\\bnear(by)?|\\baround|\\bclose to|\\bnext to|\\bbeside|\\bsurrounding|\\bwithin\\s+[\\d.]+\\s*(m|km|kms|metres?|meters?)?\\s+(of|from)|\\bwithin\\s+(a|one|half a)\\s+km\\s+(of|from)|\\bwithin)\\s+(the\\s+|a\\s+|an\\s+|any\\s+|all\\s+)?(government\\s+|govt\\s+)?(${fw})`, "i");
  const after = new RegExp(`(${fw})[\\u0B80-\\u0BFF]*\\s*(அருகே|அருகில்|அருகிலுள்ள|அருகாமையில்|பக்கத்தில்|பக்கம்|சுற்றி|pakkathula|pakkathil|pakkam|kitta|kitte|arugil|arugey|aruge|arukil)`, "i");
  return before.test(text) || after.test(text);
}

/** Removes the words a phrase covers, so "lakes" in "incidents near lakes" is a facility, never the flood topic. */
function strip(text: string, phrases: string[]): string {
  let t = ` ${text} `;
  for (const p of phrases.sort((a, b) => b.length - a.length)) {
    const re = /[஀-௿]/.test(p) ? new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\u0B80-\\u0BFF]*", "g") : new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    t = t.replace(re, " ");
  }
  return t.trim();
}

function verbOf(text: string, toks: string[]): Verb {
  if (/\b(along|alongside|on)\s+(the\s+)?(?!map\b)[A-Za-z]/i.test(text) || any(toks, ["சாலையில்", "வழியாக", "road la", "salai la", "roadla", "salaila"])) return "along";
  if (any(toks, NEAR) || distanceOf(text) != null) return "near";
  if (/\b(in|inside|at)\s+(the\s+)?[A-Za-z0-9]/i.test(text) || /[஀-௿](இல்|யில்|ில்)\b/.test(text)) return "in";
  return null;
}

/** Tanglish words a map question uses that the assistant's list may not ("school pakkathula", "thanni nikkudhu"). */
const TANGLISH = /\b(pakkathula|pakkathil|pakkam|kitta|kitte|irukku|iruku|irukka|enga|enna|evlo|evvalo|mattum|kaattu|sollu|aaspathri|aspathri|thanni|nikkudhu|nikuthu|kuppai|vibathu|thiruttu|pugar|pugaar|vaaram|maasam|innaiki|ellaam|ellam)\b/i;

/** The question's language, read without its place names ("Anna Salai" is not Tanglish). */
export function mapLang(text: string, places: { start: number; end: number }[]): Lang {
  let t = text;
  for (const p of [...places].sort((a, b) => b.start - a.start)) t = t.slice(0, p.start) + " " + t.slice(p.end);
  const d = detectLanguage(t).lang;
  return d === "en" && TANGLISH.test(t) ? "tanglish" : d;
}

export function parse(text: string, env: RouteEnv): Parsed {
  const toks = tokens(text);
  // "compare Adyar and Velachery" compares areas, so the names resolve as areas
  const verb = COMPARE.test(text) && !CHANGE.test(text) ? "in" : verbOf(text, toks);
  const lang: Lang = env.lang ?? mapLang(text, env.resolve(text, verb));
  const places = env.resolve(text, verb);
  // a place's own words are not facility or category words ("Stanley Hospital", "Lake View Road", "Buckingham Canal")
  let free = text;
  for (const p of [...places].sort((a, b) => b.start - a.start)) free = free.slice(0, p.start) + " " + free.slice(p.end);
  const ftoks = tokens(free);
  const facilities: Facility[] = [];
  const facWords: string[] = [];
  for (const f of FACILITIES) {
    if (!firstHit(ftoks, f.words)) continue;
    // "fire station" is a facility, "fire" alone is not; "police" alone is a department
    if (!facilities.some((x) => x.layer === f.layer)) facilities.push(f);
    facWords.push(...f.words.filter((w) => hasPhrase(ftoks, w)));
  }
  const news = any(tokens(free), NEWS) ? true : null;
  // news words are a source, never a category ("news" is not read as a topic)
  const rest = strip(free, [...facWords, ...(news ? NEWS.filter((w) => hasPhrase(tokens(free), w)) : [])]);
  const rtoks = tokens(rest);

  let cats: string[] | null = null, family: string[] | null = null;
  for (const c of CAT_WORDS) if (any(rtoks, c.words)) { cats = c.cats ?? null; family = c.family ?? null; break; }
  if (!cats && !family) {
    const topic = topicOf(rtoks);
    if (topic) cats = topic.cats;
    else {
      const c = classify(rest);
      if (c && c.conf >= 0.6) cats = [c.code];
    }
  }
  const citizen = any(rtoks, COMPLAINT) ? true : null;
  const severity = any(rtoks, SEVERE_HIGH) ? ["Severe", "High"] : any(rtoks, SEVERE) ? ["Severe"] : null;
  const status = any(rtoks, ANY_STATUS) ? "any" : any(rtoks, CLOSED) ? "closed" : any(rtoks, OPEN) ? "open" : null;
  const overdue = OVERDUE.test(rest) || /காலக்கெடு\s*(தாண்டி|கடந்த)|past[- ]deadline/i.test(rest) ? true : null;
  const classified = classify(rest)?.terms ?? [];
  // a period the map read is read: "hours" in "in the last 24 hours" and "since yesterday" sent a question the rules had read whole to the AI
  // (fixall3-map-today). A time the map has no window for ("in September") keeps its words unread, so the AI may still read them.
  const period = periodOf(text, env.now);
  const twoAreas = places.filter((x) => !isLine(x.pick.entry) && placeArea(x, null)).length >= 2;
  const cmpWords = isComparison(text), cmpTime = cmpWords && !twoAreas;
  return {
    unread: unreadWords(period ? tokens(periodWordsOutMap(rest)) : rtoks, classified),
    lang, toks, facilities, cats, family, citizen, news, severity, status, period, dept: env.dept(text), overdue, meters: distanceOf(text), k: kOf(text), places, verb,
    facNear: facilityIsNear(free, facWords),
    shape: {
      countBy: COUNT_BY.find(([re]) => re.test(text))?.[1] ?? null, hotspot: HOTSPOT.test(text), nearest: NEAREST.test(text), farthest: FARTHEST.test(text),
      // a comparison the reader reads ("up or down", "today vs yesterday", "pona maasatha vida") is a change too, as in Jarvis and Ask District
      // IQ; with two areas named ("Adyar vs Velachery, higher or lower?", "Adyar or Velachery, which is higher?") it is an area comparison
      compare: !CHANGE.test(text) && !cmpTime && (COMPARE.test(text) || (cmpWords && twoAreas)), change: CHANGE.test(text) || cmpTime,
      changeRef: REFERENCE.test(text), brief: BRIEF.test(text)
    }
  };
}

// ----------------------------------------------------------------- build --

const DEFAULT_PERIOD: Period = { kind: "last_days", days: 7, offset: 0 };

function incidentFilter(p: Parsed, defaults: string[], opts: { status?: "open" | "any"; period?: Period | null } = {}): Filter {
  // what was in the news is asked about whether or not it is still open
  // "right now" is what is open now, whatever day it was reported: open, with no reporting window, even for a hotspot or the news
  const nowState = p.period === "now";
  const status = p.status ?? (nowState ? "open" : opts.status ?? (p.news ? "any" : "open"));
  if (!p.status) defaults.push("status");
  let period: Period | null;
  if (isPeriod(p.period)) period = p.period;
  else if (p.period) period = null; // "all", "now" (and "unheld", which is said, never planned): no reporting window
  else { period = opts.period === undefined ? DEFAULT_PERIOD : opts.period; defaults.push("period"); }
  return {
    category: p.cats, family: p.family, severity: p.severity as Filter["severity"], status, dept: p.dept ? [p.dept] : null, overdue: p.overdue,
    citizen: p.citizen, ...(p.news ? { news: true } : {}), period, text: null
  };
}

const placeArea = (f: Found, meters: number | null): AreaRef | null => areaFor(f.pick.entry, meters);

/** A plan for a new question, or null when the rules cannot read it. */
export function buildPlan(p: Parsed): { plan: Plan; defaults: string[] } | null {
  const defaults: string[] = [];
  const steps: Step[] = [];
  const subject = !!(p.cats || p.family || p.citizen || p.news || p.severity || p.overdue || p.dept || p.status || hasIncidentNoun(p.toks));
  const take = (opts?: Parameters<typeof incidentFilter>[2]) => steps.push({ op: "take", as: "a", layer: "incidents", filter: incidentFilter(p, defaults, opts), where: null });
  const takeFac = () => p.facilities.forEach((f, i) => steps.push({ op: "take", as: `f${i + 1}`, layer: f.layer, filter: null, where: f.where }));
  const lines = p.places.filter((x) => isLine(x.pick.entry));
  const areas = p.places.filter((x) => !isLine(x.pick.entry) && placeArea(x, null));
  const done = (show: string) => ({ plan: { steps, show, language: p.lang } as Plan, defaults });

  // nearest: "5 nearest police stations to Marina", "nearest hospital to each open severe flooding case"
  if (p.shape.nearest && p.facilities.length) {
    const f = p.facilities[0];
    const k = p.k ?? 1;
    if (p.k == null) defaults.push("k");
    if (areas.length && !subject) {
      const e = areas[0].pick.entry;
      const ref = e.kind === "zone" || e.kind === "ward" || e.kind === "taluk" ? null : e.ref;
      if (!ref) return null;
      steps.push({ op: "take", as: "f1", layer: f.layer, filter: null, where: f.where });
      steps.push({ op: "nearest", as: "n", from: `place:${ref}`, to: "f1", k });
      return done("n");
    }
    take();
    if (areas[0]) steps.push({ op: "inside", as: "b", of: "a", area: placeArea(areas[0], p.meters)! });
    steps.push({ op: "take", as: "f1", layer: f.layer, filter: null, where: f.where });
    steps.push({ op: "nearest", as: "n", from: areas[0] ? "b" : "a", to: "f1", k: Math.min(k, 3) });
    return done("n");
  }
  // farthest: "which ward is farthest from a hospital", "areas with no fire station within 3 km"
  if (p.shape.farthest && p.facilities.length && !subject) {
    const f = p.facilities[0];
    steps.push({ op: "take", as: "f1", layer: f.layer, filter: null, where: f.where });
    steps.push({ op: "farthest", as: "far", areas: /\bzones?\b|மண்டல/i.test(p.toks.join(" ")) ? "zone" : "ward", from: "f1", beyond_m: p.meters });
    return done("far");
  }

  // the places themselves: "schools in Valasaravakkam", "police stations near Adyar", "hospitals" (never incidents near them)
  const pointFac = p.facilities.filter((f) => f.layer !== "water_bodies" && f.layer !== "waterways");
  if (pointFac.length && !subject && !p.facNear && !lines.length && !p.shape.hotspot && !p.shape.countBy && !p.shape.compare && !p.shape.change) {
    const f = pointFac[0];
    steps.push({ op: "take", as: "f1", layer: f.layer, filter: null, where: f.where });
    if (!areas.length && !p.keep?.area) return done("f1");
    const area = areas.length ? placeArea(areas[0], p.meters)! : p.keep!.area!;
    if (area.kind === "point" && p.meters == null) defaults.push("radius");
    steps.push({ op: "inside", as: "in", of: "f1", area });
    return done("in");
  }

  const hot = p.shape.hotspot;
  // hotspots look at all reports of the last 90 days by default, as the pipeline's clusters do
  take(hot ? { status: "any", period: { kind: "last_days", days: 90, offset: 0 } } : p.shape.change ? { status: "any" } : undefined);
  let cur = "a";
  const next = (s: Step) => { steps.push(s); cur = s.as; };

  if (p.shape.compare && areas.length >= 2) {
    next({ op: "compare", as: "cmp", of: cur, a: placeArea(areas[0], p.meters)!, b: placeArea(areas[1], p.meters)! });
    return done(cur);
  }
  if (p.facilities.length) {
    takeFac();
    const meters = p.meters ?? 500;
    if (p.meters == null) defaults.push("distance");
    next({ op: "within", as: "near", of: cur, near: p.facilities.map((_, i) => `f${i + 1}`), meters: clampM(meters) });
  }
  if (lines.length && !p.facilities.length) {
    const l = lines[0];
    const waterway = l.pick.entry.kind === "waterway";
    const meters = p.meters ?? (waterway ? 200 : 75);
    if (p.meters == null) defaults.push("distance");
    next({ op: "along", as: "line", of: cur, line: l.pick.entry.ref, meters: clampM(meters) });
  } else if (areas.length) {
    const area = placeArea(areas[0], p.facilities.length ? null : p.meters)!;
    if (area.kind === "point" && (p.meters == null || p.facilities.length)) defaults.push("radius");
    next({ op: "inside", as: "in", of: cur, area });
  } else if (p.keep?.line && !p.facilities.length) next({ op: "along", as: "line", of: cur, line: p.keep.line.ref, meters: p.keep.line.meters });
  else if (p.keep?.area) next({ op: "inside", as: "in", of: cur, area: p.keep.area });
  if (p.shape.compare && areas.length === 1 && !lines.length) return null; // "compare X" with one place: a follow-up only
  if (hot) next({ op: "hotspot", as: "hot", of: cur });
  else if (p.shape.countBy) next({ op: "count_by", as: "by", of: cur, by: p.shape.countBy });
  else if (p.shape.change) {
    const { now: per, before } = changeWindows(isPeriod(p.period) ? p.period : null, p.shape.changeRef);
    const t = steps[0] as Extract<Step, { op: "take" }>;
    t.filter = { ...t.filter!, period: per };
    next({ op: "change", as: "chg", of: cur, now: per, before });
  }
  // nothing to ask about: no category, place, facility or shape
  if (!subject && !p.facilities.length && !lines.length && !areas.length && !p.keep?.area && !p.keep?.line && !hot && !p.shape.countBy) return null;
  return done(cur);
}
const clampM = (m: number) => Math.max(LIMITS.minM, Math.min(LIMITS.maxM, m));
function hasIncidentNoun(toks: string[]) {
  return any(toks, ["incident", "incidents", "case", "cases", "issue", "issues", "problem", "problems", "report", "reports", "event", "events", "சம்பவம்", "சம்பவங்கள்", "பிரச்சனை", "பிரச்சனைகள்", "prachanai", "pirachanai", "everything", "anything"]);
}

// ------------------------------------------------------------- follow-ups --

const EDIT_SEVERE = /^\s*(only|just)\s+(severe|serious|critical)(\s+ones?)?\s*$|^\s*(severe|serious)\s+only\s*$|கடுமையான(வை|வற்றை)?\s*மட்டும்|severe mattum|severe-a mattum/i;
const EDIT_ALL_SEV = /^\s*(all|any)\s+severit(y|ies)\s*$|^\s*(include|with)\s+(all|every)\s+severit/i;
const EDIT_RADIUS = /^\s*(make it|change (it )?to|increase (it )?to|reduce (it )?to|within|expand to|widen to|narrow to|use|try|set)?\s*(\d+(\.\d+)?\s*(m|km|meters?|metres?|kms?|மீட்டர்|கி\.?\s*மீ)|half a km|a km|one km)\s*(instead|radius|please|only)?\s*$|(\d+)\s*(மீட்டர்|கி\.?மீ)\s*(ஆக|க்குள்)?\s*(மாற்று|வை)?\s*$/i;
const EDIT_ADD = /^\s*(add|also|plus|and|include|with)\s+(.+)$|(.+?)(களையும்|யும்)\s*சேர்/i;
const EDIT_REMOVE = /^\s*(remove|drop|without|exclude|not)\s+(.+)$|(.+?)\s*நீக்கு/i;
const EDIT_COMPARE = /^\s*(compare|vs\.?|versus)\s+(it\s+)?(with|to|against)?\s*(.+)$|(.+?)\s*(உடன்|ஓடு)\s*ஒப்பிடு/i;
const EDIT_TRACE = /^\s*(why( these| this| those)?|how (did you|was this) (get|work|worked) (this|that|it)( out)?|show (the )?(method|working|steps)|explain( this)?)\s*\??\s*$|ஏன் இவை|எப்படி கணக்கிட/i;
const EDIT_SEND = /\b(send|forward|assign|escalate)\b.*\b(to|these|them|this)\b|அனுப்பு/i;
const EDIT_CLEAR = /^\s*(start over|clear( it| all| the map)?|reset|new question|forget (it|that)|clear map)\s*$|மீண்டும் தொடங்கு|அழி/i;
/** "plan my visits today", "visit order", "route my visits": the officer's visit order for the current answer */
const VISITS = /\b(plan|order|route|sequence)\s+(my|the|today'?s)?\s*(site\s+)?visits?\b|\bvisit\s+(order|plan|route)\b|என் வருகை|visit plan pannu/i;
const EDIT_EXPORT =/^\s*(export|download)(\s+(these|them|this|it|csv|geojson|the list))*\s*$|பதிவிறக்கு/i;
const EDIT_NEWS = /^\s*(only|just)?\s*(the\s+)?(ones\s+)?(that\s+were\s+)?((in|from)\s+(the\s+)?)?(news|newspapers?|papers?|press|media)(\s+(ones|only|reports?))?\s*$|^\s*(only|just)?\s*(news|media)[- ]reported(\s+ones)?\s*$|செய்தி(களில்|யில்)?\s*(வந்த(வை)?)?\s*மட்டும்|^\s*news\s*(la)?\s*(vandhadhu|vandhathu)?\s*mattum\s*$/i;
const EDIT_NOT_NEWS = /^\s*(all|any)\s+sources?\s*$|^\s*(not only|not just)\s+(the\s+)?news\s*$|^\s*include\s+(all|everything|non-news)\s*$/i;
const EDIT_OPEN =/^\s*(only )?open( ones| only)?\s*$|^\s*include closed\s*$|^\s*(all|any) status(es)?\s*$|^\s*closed( ones| only)?\s*$/i;
const EDIT_OVERDUE = /^\s*(show\s+)?(me\s+)?(only\s+|just\s+)?(the\s+)?(overdue|past[- ]deadline|delayed|late|breached)(\s+(ones|cases|only|complaints|incidents))?\s*\??\s*$|^\s*how many (are|of them are|of these are)\s+(overdue|past[- ]deadline|late|delayed)\s*\??\s*$|காலக்கெடு\s*(தாண்டிய|கடந்த)(வை)?\s*(மட்டும்)?\s*$|overdue\s*(mattum)?\s*$/i;
const EDIT_DEPTS = /^\s*(which|what)\s+(department|dept|departments|office)s?\b|\b(by|per)\s+department\b|\bdepartment[- ]?wise\b|^\s*(who|which team)\s+(has|holds|handles|owns)\b|எந்த\s*துறை|துறை\s*வாரி|endha department/i;
const EDIT_WHICH_AREA = /^\s*(which|what)\s+(zone|ward|taluk)s?\b|எந்த\s*(மண்டல|வார்டு|வட்ட)/i;

/** "ward 999", "zone 22", "வார்டு 250": an area number the district does not have. */
export function noSuchArea(t: string): { en: string; ta: string } | null {
  const w = t.match(/\bward\s*(?:no\.?\s*|number\s*)?(\d{1,5})\b|வார்டு\s*(\d{1,5})/i);
  const n = w ? Number(w[1] ?? w[2]) : null;
  if (n != null && (n < 1 || n > 200)) return { en: `There is no Ward ${n}: Chennai's wards are numbered 1 to 200.`, ta: `வார்டு ${n} இல்லை: சென்னை வார்டுகள் 1 முதல் 200 வரை.` };
  const z = t.match(/\bzone\s*(?:no\.?\s*|number\s*)?(\d{1,4})\b|மண்டலம்\s*(\d{1,4})/i);
  const m = z ? Number(z[1] ?? z[2]) : zoneNosIn(t).find((n) => n < 1 || n > 15) ?? null; // a zone said in words or in another script is read too ("zone ninety nine")
  if (m != null && (m < 1 || m > 15)) return { en: `There is no Zone ${m}: Chennai has 15 zones, numbered 1 to 15.`, ta: `மண்டலம் ${m} இல்லை: சென்னையில் 1 முதல் 15 வரை 15 மண்டலங்கள்.` };
  return null;
}

/** Applies a follow-up to the current plan; null when the text is not an edit (a new question). */
export function editPlan(text: string, prev: Plan, env: RouteEnv): RouteOut | null {
  const t = text.trim();
  const plan: Plan = JSON.parse(JSON.stringify(prev));
  const take = plan.steps.find((s) => s.op === "take" && s.layer === "incidents") as Extract<Step, { op: "take" }> | undefined;
  const filt = () => (take!.filter ??= { ...OPEN_FILTER });
  const ok = (edited: string): RouteOut => ({ kind: "plan", plan, defaults: [], places: [], ai: false, edited });

  if (EDIT_CLEAR.test(t)) return { kind: "ui", ui: "clear", dept: null, plan: null };
  if (VISITS.test(t)) return { kind: "ui", ui: "visits", dept: null, plan: prev };
  if (EDIT_TRACE.test(t)) return { kind: "ui", ui: "open_trace", dept: null, plan: prev };
  if (EDIT_EXPORT.test(t)) return { kind: "ui", ui: "export", dept: null, plan: prev };
  if (EDIT_SEND.test(t)) return { kind: "ui", ui: "send", dept: env.dept(t), plan: prev };
  if (take && EDIT_SEVERE.test(t)) { filt().severity = ["Severe"]; return ok("severity"); }
  if (take && EDIT_ALL_SEV.test(t)) { filt().severity = null; return ok("severity"); }
  if (take && EDIT_NEWS.test(t)) { filt().news = true; return ok("news"); }
  if (take && EDIT_NOT_NEWS.test(t) && take.filter?.news) { delete filt().news; return ok("news"); }
  if (take && EDIT_OVERDUE.test(t)) { filt().overdue = true; return ok("overdue"); }
  // "which department has the most?": the same answer, said by department
  if (take && EDIT_DEPTS.test(t)) return ok("depts");
  // "which zone has the most?": counted by zone
  const whichArea = t.match(EDIT_WHICH_AREA);
  if (take && whichArea) {
    const by = /ward|வார்டு/i.test(whichArea[0]) ? "ward" : /taluk|வட்ட/i.test(whichArea[0]) ? "taluk" : "zone";
    const last = plan.steps[plan.steps.length - 1];
    if (last.op === "count_by") last.by = by;
    else {
      if (plan.steps.length >= LIMITS.steps) return null;
      plan.steps.push({ op: "count_by", as: uniq(plan, "by"), of: plan.show, by });
      plan.show = plan.steps[plan.steps.length - 1].as;
    }
    return ok("group");
  }
  if (take && EDIT_OPEN.test(t)) {
    filt().status = /closed/i.test(t) && !/include/i.test(t) ? "closed" : /include|all|any/i.test(t) ? "any" : "open";
    return ok("status");
  }
  if (EDIT_RADIUS.test(t)) {
    const m = distanceOf(t);
    const s = plan.steps.find((x) => x.op === "within" || x.op === "along" || (x.op === "inside" && x.area.kind === "point"));
    if (m && s) {
      if (s.op === "within" || s.op === "along") s.meters = clampM(m);
      else if (s.op === "inside" && s.area.kind === "point") s.area.radius_m = clampM(m);
      return ok("distance");
    }
  }
  // "up or down?", "compared to yesterday", "pona maasatha vida": the same answer as a change between two equal windows, the reader's comparison
  // (fixall3-map-today; before, the comparison was dropped and only the period was edited)
  if (take && isComparison(t) && tokens(t).length <= 6 && !parseSubject(t, env)) {
    const last = plan.steps[plan.steps.length - 1];
    if (plan.steps.length >= LIMITS.steps || plan.steps.some((s) => s.op === "change") || !["take", "inside", "within", "along"].includes(last.op)) return null;
    // "up or down?" names no time of its own (the reader's default week): the answer's own window is compared
    const said = TIME_WORD.test(t) ? periodOf(t, env.now) : null;
    const { now: per, before } = changeWindows(isPeriod(said) ? said : take.filter?.period ?? null, REFERENCE.test(t));
    filt().period = per;
    const as = uniq(plan, "chg");
    plan.steps.push({ op: "change", as, of: last.as, now: per, before });
    plan.show = as;
    return ok("change");
  }
  // "compared to August", "vs 20 Oct", "vs the month before": a comparison with a time the rules do not plan as a change goes to the AI, never a period edit
  if (take && CMP_WORDS.test(t) && (TIME_WORD.test(t) || DATE_WORD.test(t)) && !env.resolve(t, null).some((f) => !isLine(f.pick.entry))) return null;
  // a period alone: "last 7 days", "this month", "today"
  const per = periodOf(t, env.now);
  if (take && per && per !== "unheld" && tokens(t).length <= 5 && onlyTime(t) && !parseSubject(t, env)) {
    if (plan.steps.some((s) => s.op === "change")) return null;
    filt().period = isPeriod(per) ? per : null;
    // "right now": what is open now, whatever day it was reported
    if (per === "now" && filt().status === "any") filt().status = "open";
    return ok("period");
  }
  // "show by ward", "zone wise" (and "by ward right now": the time said with it is applied too)
  const by = COUNT_BY.find(([re]) => re.test(t))?.[1];
  // "show by ward" edits the answer; "garbage complaints by ward" is a new question
  if (by && take && tokens(t).length <= 5 && !parseSubject(t.replace(COUNT_BY.find(([re]) => re.test(t))![0], " "), env)) {
    const last = plan.steps[plan.steps.length - 1];
    if (per && per !== "unheld" && !plan.steps.some((s) => s.op === "change")) {
      filt().period = isPeriod(per) ? per : null;
      if (per === "now" && filt().status === "any") filt().status = "open";
    }
    if (last.op === "count_by") last.by = by;
    else {
      if (plan.steps.length >= LIMITS.steps) return null;
      plan.steps.push({ op: "count_by", as: uniq(plan, "by"), of: plan.show, by });
      plan.show = plan.steps[plan.steps.length - 1].as;
    }
    return ok("group");
  }
  const add = t.match(EDIT_ADD);
  if (add) {
    const words = tokens(add[2] ?? add[3] ?? "");
    const fac = FACILITIES.find((f) => any(words, f.words));
    const within = plan.steps.find((s) => s.op === "within") as Extract<Step, { op: "within" }> | undefined;
    if (fac && within && within.near.length < 4) {
      const as = uniq(plan, "f");
      plan.steps.splice(plan.steps.indexOf(within), 0, { op: "take", as, layer: fac.layer, filter: null, where: fac.where });
      within.near.push(as);
      return ok("facility");
    }
  }
  const rem = t.match(EDIT_REMOVE);
  if (rem) {
    const words = tokens(rem[2] ?? rem[3] ?? "");
    const fac = FACILITIES.find((f) => any(words, f.words));
    const within = plan.steps.find((s) => s.op === "within") as Extract<Step, { op: "within" }> | undefined;
    if (fac && within && within.near.length > 1) {
      const gone = plan.steps.find((s) => s.op === "take" && s.layer === fac.layer && within.near.includes(s.as));
      if (gone) {
        within.near = within.near.filter((n) => n !== gone.as);
        plan.steps = plan.steps.filter((s) => s !== gone);
        return ok("facility");
      }
    }
    // the only facility: drop the distance step, and the steps after it read what it read
    if (fac && within && within.near.length === 1) {
      const gone = plan.steps.find((s) => s.op === "take" && s.layer === fac.layer && s.as === within.near[0]);
      if (gone) {
        plan.steps = plan.steps.filter((s) => s !== gone && s !== within);
        for (const s of plan.steps) if ("of" in s && s.of === within.as) s.of = within.of;
        if (plan.show === within.as) plan.show = within.of;
        return ok("facility");
      }
    }
  }
  const cmp = t.match(EDIT_COMPARE);
  // "compare zone 9 and zone 10" names both sides: a new question, not "compare this with ..."
  if (cmp && env.resolve(cmp[4] ?? cmp[5] ?? "", "in").filter((f) => placeArea(f, null)).length >= 2) return null;
  if (cmp) {
    const other = env.resolve(cmp[4] ?? cmp[5] ?? "", "in").find((f) => placeArea(f, null));
    if (other) {
      const inside = plan.steps.find((s) => s.op === "inside") as Extract<Step, { op: "inside" }> | undefined;
      const b = placeArea(other, null)!;
      const b2: AreaRef = b.kind === "point" && other.pick.entry.kind === "locality" ? zoneOrPoint(other, b) : b;
      // compare the current area, or else the zone that holds most of the current answer (the server fills "top_zone")
      const a: AreaRef = inside ? inside.area : { kind: "zone", id: -1 };
      if (plan.steps.length >= LIMITS.steps) return null;
      plan.steps.push({ op: "compare", as: uniq(plan, "cmp"), of: inside ? inside.of : plan.show, a, b: b2 });
      plan.show = plan.steps[plan.steps.length - 1].as;
      return { kind: "plan", plan, defaults: [], places: [other], ai: false, edited: "compare" };
    }
  }
  return null;
}
/** Words that make a short question lean on the last answer ("and thefts?", "what about Velachery", "same for flooding"). */
const FOLLOW = /^\s*(and|also|plus|now|then|so|what about|how about|same|for|in|at|on|near|around|only|just|but|make it|change (it )?to|instead|அப்போ|அதே)\b|\b(there|same|instead|too|as well|those|them|these)\b|அங்கே|அங்கு|அதே|அவற்றில்/i;
const THERE = /\b(there|same area|same place|that area|in it|nearby there)\b|அங்கே|அங்கு|அதே இடத்தில்|anga\b/i;

/**
 * A short follow-up merged with the last answer: whatever the new words do not say is kept. "in Adyar" keeps the topic
 * and the period and moves the place; "and thefts?" keeps the place and the period and changes the topic; "near schools"
 * adds the distance; "hospitals there" lists the hospitals in the last answer's area. Null when the text is a question
 * of its own ("flooding in Adyar"), so a full question is never bent to the last one.
 */
export function mergeFollowUp(text: string, prev: Plan, env: RouteEnv): RouteOut | null {
  const p = parse(text, env);
  if (p.shape.brief || p.shape.nearest || p.shape.farthest || (p.shape.compare && p.places.length >= 2)) return null;
  const subject = !!(p.cats || p.family || p.citizen || p.news || p.severity || p.overdue || p.dept || hasIncidentNoun(p.toks));
  const lines = p.places.filter((x) => isLine(x.pick.entry));
  const areas = p.places.filter((x) => !isLine(x.pick.entry) && placeArea(x, null));
  const hasPlace = lines.length + areas.length > 0;
  const marker = FOLLOW.test(text);

  const take = prev.steps.find((s) => s.op === "take" && s.layer === "incidents") as Extract<Step, { op: "take" }> | undefined;
  const inside = prev.steps.find((s) => s.op === "inside") as Extract<Step, { op: "inside" }> | undefined;
  const along = prev.steps.find((s) => s.op === "along") as Extract<Step, { op: "along" }> | undefined;
  const within = prev.steps.find((s) => s.op === "within") as Extract<Step, { op: "within" }> | undefined;
  const prevFacs: Facility[] = (within?.near ?? []).map((nm) => prev.steps.find((s) => s.as === nm))
    .filter((s): s is Extract<Step, { op: "take" }> => s?.op === "take").map((s) => ({ layer: s.layer, where: s.where, words: [] }));
  // the last answer was places ("schools in Valasaravakkam"): its layer is the subject
  const placesOnly = !take ? prev.steps.find((s) => s.op === "take") as Extract<Step, { op: "take" }> | undefined : undefined;
  const last = prev.steps.find((s) => s.as === prev.show);

  const placeOnly = !subject && !p.facilities.length && hasPlace;
  const nearOnly = !subject && p.facilities.length > 0 && p.facNear && !!take;
  const thereFacs = !subject && p.facilities.length > 0 && !p.facNear && THERE.test(text) && !hasPlace && !!inside;
  const topicSwap = subject && marker && !hasPlace && !!take;
  // "garbage near them" after "schools in Valasaravakkam": incidents near those places, in that area
  const nearThem = !!placesOnly && !p.facilities.length && /\b(near|around|close to|next to|within\s+[\d.]+\s*(m|km)?\s+of)\s+(them|those|these|it)\b|அவற்றின்\s*அருகே|அவை\s*அருகே|adhu pakkathula/i.test(text);
  if (nearThem) {
    const m: Parsed = { ...p, facilities: [{ layer: placesOnly!.layer, where: placesOnly!.where, words: [] }], facNear: true, keep: { area: inside?.area ?? null, line: null } };
    if (!subject) m.status = "open";
    const built = buildPlan(m);
    return built ? { kind: "plan", plan: built.plan, defaults: built.defaults, places: [], ai: false, edited: "follow", unread: p.unread } : null;
  }
  if (!placeOnly && !nearOnly && !thereFacs && !topicSwap) return null;

  const m: Parsed = { ...p, shape: { ...p.shape }, keep: { area: null, line: null } };
  if (!hasPlace) m.keep = { area: inside?.area ?? null, line: along ? { ref: along.line, meters: along.meters } : null };
  if (placesOnly && placeOnly) {
    m.facilities = [{ layer: placesOnly.layer, where: placesOnly.where, words: [] }];
    m.facNear = false;
  } else if (take && !thereFacs) {
    const f = take.filter;
    if (!subject) { m.cats = f?.category ?? null; m.family = f?.family ?? null; m.citizen = f?.citizen ?? null; if (f?.news) m.news = true; }
    m.severity = p.severity ?? f?.severity ?? null;
    m.overdue = p.overdue ?? f?.overdue ?? null;
    m.dept = p.dept ?? f?.dept?.[0] ?? null;
    m.status = p.status ?? (p.period === "now" ? "open" : f?.status ?? null);
    m.period = p.period ?? (f ? f.period ?? "all" : null);
    if (!p.facilities.length && prevFacs.length) { m.facilities = prevFacs; m.facNear = true; m.meters = p.meters ?? within!.meters; }
    if (!p.shape.countBy && last?.op === "count_by" && last.by !== "hex500") m.shape.countBy = last.by;
    if (!p.shape.hotspot && last?.op === "hotspot") m.shape.hotspot = true;
  }
  const built = buildPlan(m);
  if (!built) return null;
  return { kind: "plan", plan: built.plan, defaults: built.defaults, places: p.places, ai: false, edited: "follow", unread: p.unread };
}

/** "compare with Adyar": Adyar is compared as an area; a locality that is also a zone's name means the zone. */
function zoneOrPoint(f: Found, b: AreaRef): AreaRef {
  const z = f.alternatives.find((a) => a.entry.kind === "zone");
  return z ? { kind: "zone", id: Number(z.entry.ref.split(":")[1]) } : b;
}
function uniq(plan: Plan, base: string): string {
  for (let i = 1; ; i++) { const n = i === 1 && !plan.steps.some((s) => s.as === base) ? base : `${base}${i}`; if (!plan.steps.some((s) => s.as === n)) return n; }
}
/** Does the text name a subject of its own (a category or a facility), i.e. a new question? */
function parseSubject(t: string, env: RouteEnv): boolean {
  const toks = tokens(t);
  // "all incidents this quarter" names its own subject too
  return CAT_WORDS.some((c) => any(toks, c.words)) || FACILITIES.some((f) => any(toks, f.words)) || env.resolve(t, null).length > 0 || hasIncidentNoun(toks);
}

// ------------------------------------------------------------------ route --

/** The rules router: a follow-up edit, a new plan, an area brief, a polite refusal, or null (for the AI). */
export function rulesRoute(text: string, prev: Plan | null, env: RouteEnv): RouteOut | null {
  const t = text.trim();
  if (!t) return null;
  for (const [re, msg] of OUT_OF_SCOPE) if (re.test(t)) return { kind: "say", ...msg, chips: [] };
  // a ward or zone that does not exist: say so, never answer for the whole district instead
  const bad = noSuchArea(t);
  if (bad) return { kind: "say", ...bad, chips: [] };
  // a time the records cannot answer ("two weeks ago", "last year"): say so, as Jarvis and Ask District IQ do, never answer another window
  if (periodOf(t, env.now) === "unheld") return { kind: "say", ...UNHELD_SAY, chips: [] };
  if (!prev && VISITS.test(t)) return { kind: "say", en: "First ask which cases to visit, then plan the visits:", ta: "முதலில் எந்தச் சம்பவங்கள் என்று கேளுங்கள், பிறகு வருகைகளைத் திட்டமிடுங்கள்:",
    chips: ["my open cases this week", "open severe cases near schools"] };
  if (prev) {
    const e = editPlan(t, prev, env) ?? mergeFollowUp(t, prev, env);
    if (e) return e;
  }
  const p = parse(t, env);
  // "what is happening in Saidapet?", "ward 170 summary": the area brief
  if (p.shape.brief && p.places.length && !p.facilities.length) {
    const area = placeArea(p.places[0], p.meters);
    if (area) return { kind: "brief", area, label: p.places[0].pick.entry.name_en, plan: null, places: p.places };
  }
  // "5 nearest police stations to <a place the map does not know>": say so, never answer for the whole district
  if (p.shape.nearest && p.facilities.length && !p.places.length && !p.cats && !p.family && !p.citizen && !hasIncidentNoun(p.toks)) {
    const m = t.match(/\b(?:to|from|near|of)\s+(.+?)\s*\??$/i);
    if (m) return { kind: "say", en: `I could not find "${m[1]}" on the map. Try a locality, a ward or zone number, or a road name.`,
      ta: `"${m[1]}" வரைபடத்தில் கிடைக்கவில்லை. ஒரு பகுதி, வார்டு அல்லது மண்டல எண், அல்லது சாலைப் பெயரை முயலுங்கள்.`, chips: [] };
  }
  const built = buildPlan(p);
  if (!built) return null;
  return { kind: "plan", plan: built.plan, defaults: built.defaults, places: p.places, ai: false, edited: null, unread: p.unread };
}
