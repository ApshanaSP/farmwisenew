/**
 * What a search asks for besides incidents and news: air quality, market prices, reservoir levels, rain or river gauges, read from its
 * words (English, Tamil, Tanglish). Pure. The time words are already out of `topic` (when.ts).
 *
 *   "AQI Alandur 3 October"           -> aqi, place words [alandur]
 *   "worst AQI last month"            -> aqi, highest first
 *   "tomato price 10 Nov"             -> price, commodity Tomato
 *   "Chembarambakkam level 1 Nov"     -> lake, reservoir CHEMBARAMBAKKAM
 *   "rain Nungambakkam yesterday"     -> rain
 *   "Basin Bridge river level"        -> gauge
 */
import { stem } from "@/lib/collector/searchwords";

export type ValueKind = "aqi" | "price" | "lake" | "rain" | "gauge";
export interface Intent {
  kinds: ValueKind[];
  /** highest first ("worst AQI", "dearest tomato"), lowest first ("cheapest", "cleanest"), or as the data runs */
  order: "desc" | "asc" | null;
  /** the search asked for news only ("news 52 days ago"): incidents are left out */
  newsOnly: boolean;
  /** the words to look for in news and incidents: no "news", no "worst" */
  text: string;
  /** the words left to name a station, a market or a commodity (lower case, no kind words) */
  words: string[];
}

const AQI = /\b(aqi|air\s*quality|air\s*pollution|pollution|polluted|pm\s?2\.?5|pm\s?10|smog)\b|காற்று\s*(?:தர|மாசு)|காற்றின்\s*தர|மாசு/i;
// ("rate" and "cost" alone are no price: "crime rate", "project cost"; with a vegetable named, the vegetable says it)
const PRICE = /\b(price|prices|priced|pricing|mandi|uzhavar|sandhai|vegetables?|veggies|fruits?|vilai)\b|விலை|காய்கறி|உழவர்\s*சந்தை/i;
const PRICE_WORDS = /\b(rate|rates|cost|costs)\b/gi;
const LAKE = /\b(lakes?|reservoirs?|storage|mcft|eri|tanks?)\b|ஏரி|நீர்த்தேக்க|நீர்\s*இருப்பு/i;
const RAIN = /\b(rain|rains|rainfall|raining|rainy|downpour|showers?|mazhai|malai)\b|மழை/i;
const GAUGE = /\b(gauges?|river\s*levels?|flood\s*levels?|water\s*levels?|danger\s*levels?|warning\s*levels?|anicut)\b|ஆற்றின்\s*நீர்மட்ட|நீர்மட்ட/i;
const LEVEL = /\b(levels?|full|water|storage)\b|நீர்மட்ட|இருப்பு/i;
const NEWS = /\b(news|articles?|headlines?|stories|story|seithi|seidhi)\b|செய்தி/i;
/** a river gauge said outright (a "water level" with a reservoir's name is the reservoir's) */
const GAUGE_STRONG = /\b(gauges?|rivers?|river\s*levels?|flood\s*levels?|danger\s*levels?|warning\s*levels?|anicut|bridge)\b|ஆற்றின்/i;
/** words that say nothing about the subject of a news report or an incident */
const NOISE = /\b(reports?|reported|coverage|happened|occurred)\b/gi;
const DESC = /\b(worst|highest|max|maximum|peak|most\s+polluted|dirtiest|costliest|dearest|most\s+expensive|wettest|fullest|top)\b|மோசமான|அதிகபட்ச/i;
const ASC = /\b(best|lowest|min|minimum|cleanest|cheapest|least|driest|emptiest)\b|குறைந்தபட்ச|மலிவான/i;
/** words that only say which kind of value is meant, or how to sort it: never a place or an item */
const KIND_WORDS = new RegExp([AQI, PRICE, LAKE, RAIN, GAUGE, LEVEL, NEWS, DESC, ASC].map((r) => r.source).join("|"), "giu");
const FILLER = /\b(what|was|were|is|the|of|on|in|at|for|show|find|search|me|a|an|and|day|days|reading|readings|value|values|data|figure|figures|kg|per|rs|rupees|today|level|much|how|reports?|reported|station|stations|chennai)\b/gi;

/** The six reservoirs Chennai Metro Water publishes (lakes.ts keys), by the names people use for them. */
export const RESERVOIRS: [string, RegExp][] = [
  ["CHEMBARAMBAKKAM", /chembarambakkam|chembaram|செம்பரம்பாக்க/i],
  ["PUZHAL", /puzhal|puzal|red\s*hills?|redhills|புழல்/i],
  ["POONDI", /poondi|sathyamurthy|sathyamoorthy|பூண்டி/i],
  ["CHOLAVARAM", /cholavaram|சோழவரம்/i],
  ["KANNANKOTTAI THERVOY KANDIGAI", /kannankottai|thervoy|kandigai|\btkk\b|கண்ணன்கோட்டை|தேர்வாய்/i],
  ["VEERANAM", /veeranam|வீராணம்/i]
];
/** The common Tamil and other names of the staple vegetables, as the price list names them (tnprices.ts, AGMARKNET's spellings). */
export const COMMODITY_ALIASES: [RegExp, string][] = [
  [/தக்காளி|\bthakkali\b|\btomatoes?\b/i, "Tomato"], [/சின்ன\s*வெங்காய|\bsmall\s*onions?\b|\bshallots?\b|\bsambar\s*onions?\b/i, "Small Onion"],
  [/(?<!சின்ன\s*)வெங்காய|\bvengayam\b|\bbig\s*onions?\b/i, "Onion"], [/உருளை|\bpotato(?:es)?\b|\burulai\b/i, "Potato"],
  [/கத்தரி|\bbrinjals?\b|\beggplants?\b|\bkathirikai\b/i, "Brinjal"], [/வெண்டை|\bokra\b|\blad(?:y|ies)\s*fingers?\b|\bvendakkai\b|\bbhindi\b/i, "Bhindi(Ladies Finger)"],
  [/பச்சை\s*மிளகாய்|மிளகாய்|\bgreen\s*chill(?:i|y|ies)\b|\bchill(?:i|y|ies)\b/i, "Green Chilli"], [/கேரட்|\bcarrots?\b/i, "Carrot"],
  [/பீன்ஸ்|\bbeans\b/i, "Beans"], [/முருங்கை|\bdrumsticks?\b|\bmurungai\b/i, "Drumstick"], [/தேங்காய்|\bcoconuts?\b|\bthengai\b/i, "Coconut"],
  [/எலுமிச்சை|\blemons?\b/i, "Lemon"], [/இஞ்சி|\bginger\b/i, "Ginger(Green)"], [/பூண்டு|\bgarlic\b/i, "Garlic"], [/முட்டைக்கோ|\bcabbages?\b/i, "Cabbage"],
  [/காலிஃப்ளவர்|காலிபிளவர்|\bcauliflowers?\b/i, "Cauliflower"], [/பீட்ரூட்|\bbeetroots?\b|\bbeets?\b/i, "Beetroot"], [/கொத்தமல்லி|\bcoriander\b/i, "Coriander(Leaves)"],
  [/புதினா|\bmint\b|\bpudina\b/i, "Mint(Pudina)"], [/கறிவேப்பிலை|\bcurry\s*leaf\b|\bcurry\s*leaves\b/i, "Curry Leaf"], [/பாகற்காய்|\bbitter\s*gourd\b/i, "Bitter gourd"],
  [/சுரைக்காய்|\bbottle\s*gourd\b/i, "Bottle gourd"], [/பூசணி|\bpumpkins?\b/i, "Pumpkin"], [/முள்ளங்கி|\bradish(?:es)?\b/i, "Raddish"], [/வெள்ளரி|\bcucumbers?\b/i, "Cucumbar(Kheera)"]
];

/** Commodity names that a search names: by an alias, or by every main word of the item's own name ("ash gourd" -> Ashgourd is by alias only). */
export function commoditiesIn(text: string, known: string[]): string[] {
  const t = ` ${text.toLowerCase()} `;
  const out = new Set<string>();
  for (const [re, name] of COMMODITY_ALIASES) if (re.test(text) && known.some((k) => k.toLowerCase() === name.toLowerCase())) out.add(known.find((k) => k.toLowerCase() === name.toLowerCase())!);
  const words = new Set(t.split(/[^\p{L}\p{M}]+/u).filter((w) => w.length >= 3).map(stem));
  for (const k of known) {
    const main = k.replace(/\(.*$/, "").toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length >= 3).map(stem);
    if (main.length && main.every((w) => words.has(w))) out.add(k);
  }
  // "small onion" names Small Onion, not Onion as well
  const list = [...out];
  return list.filter((k) => !list.some((o) => o !== k && o.toLowerCase().endsWith(` ${k.toLowerCase()}`)));
}

/** What the search asks for. `topic` is the search without its time words. */
export function readIntent(topic: string): Intent {
  const t = String(topic ?? "");
  const kinds: ValueKind[] = [];
  if (AQI.test(t)) kinds.push("aqi");
  if (PRICE.test(t) || COMMODITY_ALIASES.some(([re]) => re.test(t))) kinds.push("price");
  if (LAKE.test(t) || RESERVOIRS.some(([, re]) => re.test(t))) kinds.push("lake");
  if (RAIN.test(t)) kinds.push("rain");
  if (GAUGE.test(t) && (GAUGE_STRONG.test(t) || !kinds.includes("lake"))) kinds.push("gauge");
  const order = DESC.test(t) ? "desc" : ASC.test(t) ? "asc" : null;
  const newsOnly = NEWS.test(t) && !kinds.length;
  // news and incidents are looked for by the subject: "worst" and "news" are no subject
  const text = t.replace(new RegExp(NEWS.source, "gi"), " ").replace(NOISE, " ").replace(new RegExp(DESC.source, "gi"), " ").replace(new RegExp(ASC.source, "gi"), " ")
    .replace(/\s+/g, " ").trim();
  const left = kinds.includes("price") ? t.replace(PRICE_WORDS, " ") : t;
  const words = left.replace(KIND_WORDS, " ").replace(FILLER, " ").toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter((w) => w.length >= 3);
  return { kinds, order, newsOnly, text, words };
}
