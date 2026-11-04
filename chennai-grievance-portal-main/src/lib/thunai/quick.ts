/**
 * Jarvis's fast lane: the questions a Collector asks every day are read by rules and answered from the data at once, with
 * no AI model (a model round took 2-20 s, and the free tiers run out). English, Tamil and Tanglish. A question the rules
 * are not sure of returns null and goes to the agent as before.
 *   severe / high cases (in a place, this week), the news (of a place or on a topic), vegetable prices, air quality,
 *   rain, the reservoirs, why something is rising, where something happened, a comparison of two zones, what needs
 *   attention today.
 */
import { CAT_ALIASES, SEV_WORDS, ZONES } from "./lexicon";
import type { Recipe } from "./stage";
import type { PeriodKey, Sev, World } from "./types";

export interface Quick { recipe: Recipe; slots: Record<string, unknown> }

const norm = (s: string) => ` ${s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9஀-௿]+/g, " ").replace(/\s+/g, " ").trim()} `;
const has = (t: string, words: string[]) => words.some((w) => t.includes(` ${w} `) || (/[஀-௿]/.test(w) && t.includes(w)));

/** the zones named in the sentence (by their names in either language, or a locality inside one), in the order said */
export function zonesIn(t: string, w: World): number[] {
  const hits: { n: number; at: number }[] = [];
  for (const [k, z] of Object.entries(ZONES)) {
    for (const word of [...z.en, ...z.ta]) {
      const at = /[஀-௿]/.test(word) ? t.indexOf(word) : t.indexOf(` ${word} `);
      if (at >= 0) { hits.push({ n: Number(k), at }); break; }
    }
  }
  for (const z of w.zones) {
    const nm = norm(z.name).trim();
    const at = t.indexOf(` ${nm} `);
    if (at >= 0 && !hits.some((h) => h.n === z.n)) hits.push({ n: z.n, at });
  }
  // a locality (Velachery, T. Nagar, Kolathur): the zone it is in
  if (!hits.length) for (const p of w.places) {
    if (p.zone == null) continue;
    for (const a of [p.name, ...p.aliases]) {
      const nm = norm(a).trim();
      if (nm.length >= 4 && t.includes(` ${nm} `)) { hits.push({ n: p.zone, at: t.indexOf(` ${nm} `) }); break; }
    }
  }
  const m = / zone (\d{1,2}) /.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 15 && !hits.some((h) => h.n === +m[1])) hits.push({ n: +m[1], at: m.index });
  return [...new Set(hits.sort((a, b) => a.at - b.at).map((h) => h.n))];
}

/** the topic named first in the sentence ("fire accident" is a fire, not a road accident); a longer name wins a tie */
function catIn(t: string): string | null {
  let best: { code: string; at: number; len: number } | null = null;
  for (const [code, words] of Object.entries(CAT_ALIASES)) {
    for (const raw of words) {
      const w = raw.toLowerCase();
      const at = /[\u0B80-\u0BFF]/.test(w) ? t.indexOf(w) : t.indexOf(` ${w} `);
      if (at < 0) continue;
      if (!best || at < best.at || (at === best.at && w.length > best.len)) best = { code, at, len: w.length };
    }
  }
  return best?.code ?? null;
}
function sevIn(t: string): Sev | null {
  for (const [word, sev] of SEV_WORDS) if (has(t, [word.toLowerCase()])) return sev;
  if (has(t, ["serious", "critical", "urgent", "danger", "dangerous", "கடுமையான", "கடுமை", "அவசர", "severe"])) return "Severe";
  return null;
}
function periodIn(t: string): PeriodKey | null {
  if (has(t, ["today", "now", "24 hours", "இன்று", "இன்னைக்கு", "innaiku", "inniki", "ippo"])) return "daily";
  if (has(t, ["this week", "week", "weekly", "7 days", "இந்த வாரம்", "வாரம்", "vaaram"])) return "weekly";
  if (has(t, ["this month", "month", "monthly", "30 days", "இந்த மாதம்", "மாதம்", "maasam"])) return "monthly";
  if (has(t, ["quarter", "3 months", "90 days", "காலாண்டு"])) return "quarterly";
  return null;
}

const NEWS = ["news", "headline", "headlines", "seithi", "seithigal", "செய்தி", "செய்திகள்", "செய்திகளை", "நியூஸ்"];
const PRICE = ["price", "prices", "rate", "rates", "cost", "mandi", "market price", "vilai", "விலை", "விலைகள்", "ரேட்"];
// whole words only in English ("price" holds "rice"); Tamil words as they are written
const VEG = / (tomato|tomatoes|onion|onions|potato|potatoes|brinjal|carrot|beans|cabbage|chilli|chili|ginger|garlic|banana|lemon|drumstick|okra|ladies finger|cauliflower|beetroot|coconut|rice|thakkali|vengayam) |(தக்காளி|வெங்காயம்|உருளை|கத்தரி|கேரட்|பீன்ஸ்|மிளகாய்|இஞ்சி|பூண்டு|வாழை|எலுமிச்சை|முருங்கை|வெண்டை|தேங்காய்)/;
const AIR = ["air quality", "aqi", "air pollution", "pollution", "காற்று", "காற்றின் தரம்", "மாசு", "kaatru"];
const RAIN = ["rain", "rainfall", "raining", "மழை", "mazhai", "malai"];
const LAKE = ["reservoir", "reservoirs", "lake", "lakes", "dam", "water storage", "storage", "ஏரி", "ஏரிகள்", "நீர்த்தேக்க", "தண்ணீர் இருப்பு", "eri"];
const WHY = ["why", "reason", "cause", "ஏன்", "காரணம்", "yen"];
const WHERE = ["where", "எங்கே", "எங்கு", "enga", "engey"];
const CASES = ["case", "cases", "complaint", "complaints", "incident", "incidents", "issue", "issues", "problem", "problems", "புகார்", "புகார்கள்", "சம்பவம்", "சம்பவங்கள்", "பிரச்சனை", "pugar"];
const COMPARE = ["compare", "comparison", "versus", "vs", "ஒப்பிடு", "ஒப்பிட்டு", "oppidu"];
const ATTENTION = ["attention", "priority", "priorities", "what is happening", "whats happening", "brief", "briefing", "summary", "update", "கவனம்", "சுருக்கம்", "நிலவரம்", "என்ன நடக்குது", "என்ன நடக்கிறது"];

/** words that tie a question to the district and this console (any one of them keeps the question in) */
const DISTRICT = ["chennai", "madras", "district", "zone", "zones", "ward", "wards", "taluk", "taluks", "area", "collector", "console", "dashboard", "department", "departments",
  "officer", "officers", "complaint", "complaints", "grievance", "incident", "incidents", "case", "cases", "issue", "problem", "news", "headline", "rain", "rainfall", "flood",
  "flooding", "waterlogging", "drain", "price", "prices", "market", "vegetable", "air", "aqi", "pollution", "lake", "lakes", "reservoir", "water", "power", "electricity",
  "garbage", "waste", "road", "roads", "police", "crime", "accident", "fire", "hospital", "school", "dengue", "fever", "health", "cyclone", "weather", "temperature",
  "severe", "deadline", "overdue", "brief", "briefing", "trend", "trends", "map", "report", "alert", "gcc", "cmwssb", "tneb", "imd", "pwd", "mandi", "jarvis",
  "சென்னை", "மாவட்ட", "மண்டல", "வார்டு", "புகார்", "சம்பவ", "செய்தி", "மழை", "வெள்ள", "விலை", "சந்தை", "காற்று", "ஏரி", "தண்ணீர்", "மின்", "குப்பை", "சாலை",
  "காவல்", "விபத்து", "மருத்துவ", "பள்ளி", "துறை", "அதிகாரி", "ஆட்சியர்", "வானிலை", "புயல்"];
/** the shape of a general-knowledge question ("what is deep learning", "who is the president", "write a poem") */
const GENERAL = /^\s*(what is|what are|whats|what does|who is|who was|who are|define|explain|meaning of|tell me a|tell me about|how does|how do i|how to|write|translate|calculate|solve|teach me|give me a|sing|recommend)\b|joke|poem|story|recipe|என்றால் என்ன|யார்|விளக்கு|கதை சொல்|பாடல்|கவிதை/;
const SUBJECTS = /deep learning|machine learning|artificial intelligence|\bai\b|neural network|programming|python|javascript|java\b|coding|cricket|football|ipl|movie|film|actor|actress|song|music|president|prime minister|capital of|bitcoin|crypto|stock market|share price|history of|physics|chemistry|biology|mathematics|chatgpt|google|facebook|instagram|youtube/;

/**
 * A question that is not about the district (general knowledge, chat, other subjects): Jarvis says what it can help with
 * instead of answering. A question that names anything of the district (a place, a topic, the console) stays in.
 */
export function offTopic(text: string, w: World): boolean {
  const t = norm(text), raw = text.toLowerCase();
  if (zonesIn(t, w).length || catIn(t) || has(t, DISTRICT) || DISTRICT.some((d) => /[\u0B80-\u0BFF]/.test(d) && raw.includes(d))) return false;
  return GENERAL.test(raw) || SUBJECTS.test(raw);
}

/** Does the sentence name a zone, a place, a topic or a department of the district? (the address gate's "district noun") */
export function districtNounIn(text: string, w: World): boolean {
  const t = norm(text), raw = text.toLowerCase();
  return zonesIn(t, w).length > 0 || !!catIn(t) || has(t, DISTRICT) || DISTRICT.some((d) => /[஀-௿]/.test(d) && raw.includes(d));
}

/** The fast lane's reading of one sentence, or null to let the agent decide. */
export function quickScreen(text: string, w: World): Quick | null {
  const t = norm(text);
  if (t.trim().length < 3) return null;
  // follow-ups and edits of an open screen ("only the Adyar ones", "same for", "open 3") are the agent's
  if (has(t, ["same", "also", "only", "instead", "open", "draft", "send", "that", "those", "அதே", "அதையே", "மட்டும்"])) return null;
  const zones = zonesIn(t, w), cat = catIn(t), sev = sevIn(t), period = periodIn(t);
  if (has(t, PRICE) || (VEG.test(t) && /(price|rate|cost|விலை|vilai|எவ்வளவு|evvalavu|how much)/.test(t))) {
    const m = VEG.exec(t);
    const veg = m ? (m[1] ?? m[2]).replace(/es$/, "").replace(/s$/, "") : null;
    return { recipe: "prices", slots: { q: veg } };
  }
  if (has(t, NEWS)) return { recipe: "news", slots: { zones: zones.slice(0, 1), cat, period: period ?? "weekly", fresh: true } };
  if (has(t, AIR)) return { recipe: "readings", slots: { metric: "aqi", zones: zones.slice(0, 1), name: zones.length ? w.zones.find((z) => z.n === zones[0])?.name ?? null : null } };
  if (has(t, LAKE) && !cat) return { recipe: "readings", slots: { metric: "lakes" } };
  if (has(t, RAIN) && !has(t, CASES) && !cat) return { recipe: "readings", slots: { metric: "rain", zones: zones.slice(0, 1) } };
  if (has(t, COMPARE) && zones.length >= 2) return { recipe: "compare", slots: { zones: zones.slice(0, 2), cat, period: period ?? "weekly" } };
  if (has(t, WHY) && (cat || zones.length)) return { recipe: "why", slots: { zones: zones.slice(0, 1), cat, period: period ?? "weekly" } };
  if (has(t, WHERE) && (cat || sev)) return { recipe: "cases", slots: { cat, sev, zones: zones.slice(0, 1), period: period ?? "daily", sort: "priority", n: 20, fresh: true } };
  if (sev || ((has(t, CASES) || cat) && (zones.length || period || cat))) {
    return { recipe: "cases", slots: { sev, cat, zones: zones.slice(0, 1), period: period ?? (sev ? "daily" : "weekly"), sort: "priority", n: 20,
      // a new question starts clean: a filter an earlier answer put on the console (Fire, say) must not narrow it
      fresh: true } };
  }
  if (has(t, ATTENTION) && !zones.length) return { recipe: "brief", slots: { period: period ?? "daily" } };
  return null;
}
