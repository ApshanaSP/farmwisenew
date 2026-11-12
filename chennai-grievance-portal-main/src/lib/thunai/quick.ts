/**
 * Jarvis's fast lane: the questions a Collector asks every day are read by rules and answered from the data at once, with
 * no AI model (a model round took 2-20 s, and the free tiers run out). English, Tamil and Tanglish. A question the rules
 * are not sure of returns null and goes to the agent as before.
 *   severe / high cases (in a place, this week), the news (of a place or on a topic), vegetable prices, air quality,
 *   rain, the reservoirs, why something is rising, where something happened, a comparison of two zones, what needs
 *   attention today.
 */
import { CAT_ALIASES, CHANGE_RECORD, DEPT_ALIASES, EXPLAIN_TA, GENERAL, HARSH_BESIDE, KEEPING, PERIOD_TABLE, SEV_NOUN, SEV_WORDS, SUBJECTS, WEAK_SEV, ZONES } from "./lexicon";
import { foreignIn } from "./entities";
import { betterCategory, saidStems } from "./catlabels";
import { CATEGORY_LABELS } from "./narrate";
import { fuzzyNames, romanise } from "./xlit";
import { normalise } from "./normalise";
import type { Recipe } from "./stage";
import type { PeriodKey, Sev, World } from "./types";
import { asksForbidden } from "./privacy";
import { heldPeriod, unheldPhraseIn, windowIn } from "@/lib/windowspan";
import { zoneNosIn } from "@/lib/zone-no";
import { asciiDigits } from "./digits";

export interface Quick { recipe: Recipe; slots: Record<string, unknown> }

// the digits of every script are 0-9 first: the filter below drops any other character, so "zone ٥" and "zone ５" would lose their number (SKG1-33); and the text is NFC first, so a letter
// written decomposed (o + a combining mark) is read as the composed one and the same sentence gets the same answer (resolver.pass4.test.ts, NFC and NFD)
const norm = (s: string) => ` ${asciiDigits(s.normalize("NFC").toLowerCase()).replace(/[’']/g, "").replace(/[^a-z0-9஀-௿]+/g, " ").replace(/\s+/g, " ").trim()} `;
/** the endings a short Tamil word takes (தீ: தீயில், தீக்கு), so that a short word is a word and not the start of another (தீவிர, "severe", is not தீ, "fire") (RC-03) */
/** a Tamil word of this many code points or fewer (தீ, "fire") is strict at its right edge; a longer one may be the start of a compound (மழைநீர், தெருவிளக்கு) */
export const TA_SHORT = 2;
const TA_ENDING = /^(ல்|ில்|யில்|ல|க்கு|ுக்கு|யை|ை|யால்|ால்|ின்|யின்|ும்|ம்|கள்|களை|களில்|ங்கள்|யும்|உம்|ே)/;
/** a Tamil word inside the text, at a word edge: nothing Tamil before it; and after it either more of a long word (its case endings and compounds) or, for a short word, only an ending */
export function tamilAt(t: string, w: string): number {
  const ww = w.trim();
  if (!ww) return -1;
  const long = [...ww].length > TA_SHORT;
  let i = t.indexOf(ww);
  while (i >= 0) {
    const before = t[i - 1], after = t.slice(i + ww.length);
    const leftOk = !before || !/[஀-௿]/.test(before) || (w.startsWith(" "));
    // an alias written with a space after it (" வெள்ள ") is the whole word and nothing longer
    const whole = w.endsWith(" ");
    const rightOk = after === "" || !/^[஀-௿]/.test(after) || (!whole && (long || TA_ENDING.test(after)));
    if (leftOk && rightOk) return i;
    i = t.indexOf(ww, i + 1);
  }
  return -1;
}
const has = (t: string, words: string[]) => words.some((w) => t.includes(` ${w} `) || (/[஀-௿]/.test(w) && tamilAt(t, w) >= 0));

const isComparing = (t: string) => has(t, COMPARE) || /(ஒப்பி|oppid|கம்பே|கம்பா)/.test(t);

/** the zones named in the sentence (by their names in either language, or a locality inside one), in the order said */
export function zonesIn(t: string, w: World): number[] {
  const hits: { n: number; at: number }[] = [];
  for (const [k, z] of Object.entries(ZONES)) {
    for (const word of [...z.en, ...z.ta]) {
      const at = /[஀-௿]/.test(word) ? t.indexOf(word) : t.indexOf(` ${word} `);
      if (at >= 0) { hits.push({ n: Number(k), at }); break; }
    }
    // a Tamil name with a case ending changes its last letter: அடையாறு, அடையாறில்; அம்பத்தூர், அம்பத்தூரில்
    if (!hits.some((h) => h.n === Number(k))) for (const word of z.ta) {
      const stem = word.replace(/[்ுூ]$/, "");
      const at = stem.length >= 4 ? t.indexOf(stem) : -1;
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
  // "zone 5", "zone five", "zone number 5", Tamil "மண்டலம் 5" / "மண்டலம் ஐந்து", Tanglish "zone anju": the number is read the way the rest of the console reads one (normalise.ts: words and
  // every script's digits), and every zone named by number counts, not the first only ("zone 5 and zone 6") (RC-05, RC-07; jarvis2-1, -2, -11)
  const nt = ` ${normalise(t).text} `;
  for (const m of nt.matchAll(/ (?:zone|zones|மண்டலம்[஀-௿]*|மண்டல[஀-௿]*|mandalam) (?:number |no |num )?(\d{1,2})(?: (?:and|&|vs|versus|matrum|மற்றும்|um) (?:zone )?(\d{1,2}))? /g)) {
    for (const g of [m[1], m[2]]) if (g && +g >= 1 && +g <= 15 && !hits.some((h) => h.n === +g)) hits.push({ n: +g, at: m.index + (g === m[2] ? 1 : 0) });
  }
  // the last resort: a spelling or a transliteration the lexicon does not list
  // (for a comparison the second place too: one name misheard must not leave a comparison of one)
  if (!hits.length || (hits.length === 1 && isComparing(t))) {
    const names: [number, string][] = [...w.zones.map((z): [number, string] => [z.n, z.name]), ...w.places.filter((p) => p.zone != null && p.name.length >= 6).map((p): [number, string] => [p.zone as number, p.name])];
    for (const n of fuzzyNames(t, names)) if (!hits.some((h) => h.n === n)) hits.push({ n, at: t.length });
  }
  return [...new Set(hits.sort((a, b) => a.at - b.at).map((h) => h.n))];
}

/** the localities named in the sentence (with a Tamil case ending too), for the planner's hint: most have no zone of their own */
export function placesIn(t: string, w: World): string[] {
  const out: string[] = [];
  for (const p of w.places) {
    for (const a of [p.name, ...p.aliases]) {
      const nm = norm(a).trim();
      if (nm.length < 4) continue;
      const hit = /[஀-௿]/.test(nm) ? t.includes(` ${nm.replace(/[்ுூ]$/, "")}`) : t.includes(` ${nm} `);
      if (hit) { out.push(p.name); break; }
    }
  }
  return [...new Set(out)].slice(0, 4);
}

/** the topic named first in the sentence ("fire accident" is a fire, not a road accident); a longer name wins a tie */
export function catIn(t: string): string | null {
  let best: { code: string; at: number; len: number; word: string } | null = null;
  for (const [code, words] of Object.entries(CAT_ALIASES)) {
    for (const raw of words) {
      const w = raw.toLowerCase();
      const raw0 = /[\u0B80-\u0BFF]/.test(w) ? tamilAt(t, w) : t.indexOf(` ${w} `);
      if (raw0 < 0) continue;
      // the position of the word itself (not of the space before it), so a Tamil word and an English one compare fairly
      const at = raw0 + (/[\u0B80-\u0BFF]/.test(w) ? 0 : 1);
      // a broad word loses to a specific one in the same sentence: "lakes la water level" is the lakes, not the water supply (RC-05)
      if (w === "water" && / (lake|lakes|reservoir|reservoirs|dam|storage|rain) |ஏரி|நீர்த்தேக்க/.test(t)) continue;
      if (!best || at < best.at || (at === best.at && w.length > best.len)) best = { code, at, len: w.length, word: w };
    }
  }
  // a one-word name that another category's label says more of in this sentence is that other category (catlabels.ts)
  return best ? (best.word.includes(" ") ? best.code : betterCategory(best.code, best.word, saidStems(t.split(/\s+/).filter(Boolean)), CATEGORY_LABELS)) : null;
}
/**
 * past the deadline, or still open: every way it is said in the three languages, read by every lane that builds a list (RC-05). overdue wins over open.
 */
const OVERDUE_RE = /\b(overdue|over due|delayed|delay)\b|\b(past|beyond|after|crossed|crossing|missed|breached|breaching|breach|exceeded|exceeding|violated)( the| their| its| a)? (deadline|due date|sla|time limit)\b|\bdeadline (passed|crossed|missed|miss|over|exceeded|breached|mudinj[a-z]*|thaand[a-z]*|thand[a-z]*)\b|\bnot (resolved|closed|done|attended|fixed) (in|on|within) time\b|\blate (cases|complaints|ones|severe)\b|\b(thaamadham|thamadham|thaamathamaana)\b|தாமத|கெடு (தாண்ட|முடிந்த|மீறி|கடந்த)|காலக்கெடு|கெடுவை/;
const OPEN_RE = /\b(still open|unresolved|pending|not (yet )?(closed|resolved|done|fixed)|yet to be (closed|resolved|fixed)|open (cases|complaints|incidents|issues|ones|problems)|(cases|complaints|incidents|issues|problems|ones|reports|grievances) (that are |which are |are |still |now |currently )?open (in|at|near|for|now|today|here|across|within)|(that|which) are (still |now |currently )?open|innum mudiyaadha|innum mudiyala|mudiyaadha|mudiyalai?|thirandha|nilluvai)\b|தீர்க்கப்படாத|முடியாத|நிலுவை|திறந்த|இன்னும் முடி/;
/** finished cases: "resolved", "closed", "solved" (English), the Tamil and Tanglish words; a lane that dropped this word answered with every case (SK-3) */
const RESOLVED_RE = /\b(resolved|closed|solved|completed|settled|rectified|mudinjadhu|mudinja|theerthu vecha|theerthaachu|close (aachu|aayiduchu|aagi|pannitanga|pannita))\b|தீர்க்கப்பட்ட|தீர்க்கப்பட்டவை|முடிக்கப்பட்ட|முடிந்த|தீர்வான|மூடப்பட்ட/;
export function statusIn(t: string): "overdue" | "open" | "resolved" | null {
  return OVERDUE_RE.test(t) ? "overdue" : OPEN_RE.test(t) ? "open" : RESOLVED_RE.test(t) ? "resolved" : null;
}
/** the department a sentence names, by its own words in any language: a filter the lane cannot apply must not be dropped (RC-05) */
export function deptWordIn(t: string): string | null {
  for (const [code, words] of Object.entries(DEPT_ALIASES)) for (const raw of words) {
    const x = raw.toLowerCase();
    if (x.length < 4 || x === "water") continue;
    if (/[஀-௿]/.test(x) ? t.includes(x) : t.includes(` ${x} `)) return code;
  }
  return null;
}
export function sevIn(t: string): Sev | null {
  t = t.replace(new RegExp(HARSH_BESIDE, "g"), " ");
  for (const [word, sev] of SEV_WORDS) if (!WEAK_SEV.has(word) && has(t, [word.toLowerCase()])) return sev;
  // high, low, medium are severities only beside a word that says so (RC-03)
  const tk = t.trim().split(" ");
  for (let i = 0; i < tk.length; i++) if (WEAK_SEV.has(tk[i]) && (SEV_NOUN.has(tk[i + 1] ?? "") || SEV_NOUN.has(tk[i - 1] ?? ""))) return SEV_WORDS.find(([x]) => x === tk[i])?.[1] ?? null;
  if (has(t, ["serious", "critical", "urgent", "danger", "dangerous", "கடுமையான", "கடுமை", "அவசர", "severe"])) return "Severe";
  return null;
}
/**
 * A window the console does not hold: yesterday, the day before, next week or month (and the Tamil and Tanglish words for them, with last week and last month, which the Tamil lanes
 * have never mapped to a window). The windows it holds are the last 24 hours, 7, 30 and 90 days; a lane that answered these with the current window would say the wrong period with a straight face, so it hands them on (RC-06). English "last week/month/quarter" stay the matching window, named in the screen's title (BUG-003, an accepted decision).
 */
const CALENDAR_EN = /\b(yesterdays?|day before( yesterday)?|next (week|month|quarter)s?)\b|\b(nethu|neththu|netru|netraiya|pona (vaaram|maasam|maatham)|kadantha (vaaram|maasam|maatham)|last (vaaram|maasam)|adutha (vaaram|maasam))\b/;
const CALENDAR_TA = ["நேற்று", "நேத்து", "நேற்றைய", "கடந்த வாரம்", "கடந்த வார", "போன வாரம்", "போன வார", "கடந்த மாதம்", "கடந்த மாத", "கடந்த மாசம்", "போன மாதம்", "போன மாசம்", "போன மாச", "கடந்த காலாண்டு", "போன காலாண்டு", "முந்தைய வாரம்", "முந்தைய மாதம்", "அடுத்த வாரம்", "அடுத்த மாதம்"];
/**
 * A time that is not one of the console's windows and is not "last week/month" either: "two weeks ago", "a month ago", "3 months back", "last year", "next week" (and the Tamil and
 * Tanglish words for them). The matching window (the last 7 or 30 days) is the answer to "last week", never to "two weeks ago": that is a different stretch of time (RC-06, SK-5).
 * `t` is the sentence as a lane reads it (lower case, number words or digits), `raw` the Tamil letters as spoken.
 */
const UNIT = "(?:days?|weeks?|months?|quarters?|years?)";
const AGO_EN = new RegExp(String.raw`\b(?:an?|one|two|three|four|five|six|seven|eight|nine|ten|\d{1,3}|couple of|few|several|many) ${UNIT} (?:ago|back|before|earlier|prior)\b|\b(?:week|month|quarter|year) before last\b|\blast year\b|\bnext (?:week|month|quarter|year)s?\b`);
const AGO_TG = /\b(?:oru|rendu|irandu|moonu|naalu|anju|\d{1,3}) (?:naal|vaaram|maasam|maatham|varusham) (?:munnaadi|munnadi|mundhi|mundhaiya|munbu|mun|pinnadi|back)\b|\badutha (?:vaaram|maasam|maatham|varusham)\b|\bpona (?:varusham|varudam)\b/;
const AGO_TA = /(?:நாள்|நாட்கள்|வாரம்|வாரங்கள்|வாரத்துக்கு|மாதம்|மாதங்கள்|மாசம்|மாசத்துக்கு|ஆண்டு|வருடம்|வருஷம்)(?:த்துக்கு|க்கு|கள்)?\s*(?:முன்பு|முன்னாடி|முன்னர்|முன்)(?![஀-௿])|அடுத்த (?:வாரம்|வார|மாதம்|மாத|மாசம்|காலாண்டு|ஆண்டு|வருடம்|வருஷம்)|(?:கடந்த|போன) (?:ஆண்டு|வருடம்|வருஷம்)/;
/**
 * A count of time that is not one of the console's windows (3 days, 2 weeks, 14 days, "last -5 days"), or a time that names no count and is not held ("since monday", "this year"): read by the one window
 * reader (windowspan.ts) in the three languages, so "pona 2 vaaram" is never one week and "last 3 days" is never today (RC-06, SKG1-31, SKG1-32, g-review 3).
 */
const countedUnheld = (t: string): boolean => { const w = windowIn(t); return !!w && (w.kind === "bad" || heldPeriod(w.hours) === null); };
export const unheldWindowIn = (t: string, raw = t): boolean => AGO_EN.test(t) || AGO_TG.test(t) || AGO_TA.test(raw) || countedUnheld(raw) || countedUnheld(t) || unheldPhraseIn(raw) || unheldPhraseIn(t);
export const calendarWindowIn = (t: string): boolean => CALENDAR_EN.test(t) || CALENDAR_TA.some((w) => tamilAt(t, w) >= 0) || unheldWindowIn(t);
export function periodIn(t: string): PeriodKey | null {
  // a count of time says its own window: 3 months is the quarter, not the month inside it; any count the console does not hold is no period (and calendarWindowIn hands the sentence on)
  const counted = windowIn(t);
  if (counted) return counted.kind === "span" ? heldPeriod(counted.hours) : null;
  // the one table of period words (lexicon.ts PERIOD_TABLE); "now" and "ippo" are daily only in this lane (a spoken "now" is no window in the rules lane's token reader)
  if (has(t, [...PERIOD_TABLE.daily, "now", "ippo"])) return "daily";
  // the quarter first: "மூன்று மாதம்" (three months) holds the word for a month, and was read as the last 30 days
  for (const k of ["quarterly", "weekly", "monthly"] as const) if (has(t, PERIOD_TABLE[k])) return k;
  return null;
}

const NEWS = ["news", "headline", "headlines", "seithi", "seithigal", "செய்தி", "செய்திகள்", "செய்திகளை", "நியூஸ்"];
const PRICE = ["price", "prices", "mandi", "market price", "vilai", "விலை", "விலைகள்"];
/** "closure rates", "Sensex rate": these mean a market price only beside a vegetable or a market */
const PRICE_WEAK = ["rate", "rates", "cost", "ரேட்"];
const MARKET = / (market|vegetable|vegetables|koyambedu) |காய்கறி|கோயம்பேடு|சந்தை/;
// whole words only in English ("price" holds "rice"); Tamil words as they are written
const VEG = / (tomato|tomatoes|onion|onions|potato|potatoes|brinjal|carrot|beans|cabbage|chilli|chili|ginger|garlic|banana|lemon|drumstick|okra|ladies finger|cauliflower|beetroot|coconut|rice|thakkali|vengayam) |(தக்காளி|வெங்காயம்|உருளை|கத்தரி|கேரட்|பீன்ஸ்|மிளகாய்|இஞ்சி|பூண்டு|வாழை|எலுமிச்சை|முருங்கை|வெண்டை|தேங்காய்)/;
const AIR = ["air quality", "aqi", "air pollution", "pollution", "காற்று", "காற்றின் தரம்", "மாசு", "kaatru"];
const RAIN = ["rain", "rainfall", "raining", "மழை", "mazhai", "malai"];
const LAKE = ["reservoir", "reservoirs", "lake", "lakes", "dam", "water storage", "storage", "ஏரி", "ஏரிகள்", "நீர்த்தேக்க", "தண்ணீர் இருப்பு", "நீர் மட்டம்", "நீர்மட்டம்", "eri", "டேம்", "லேக்"];
/** the district's reservoirs by name, with the spelling that goes in the readings slot */
const RESERVOIRS: [string, RegExp][] = [["Chembarambakkam", / chembarambakkam |செம்பரம்பாக்க/], ["Puzhal", / puzhal |புழல்/], ["Poondi", / poondi |பூண்டி/], ["Cholavaram", / cholavaram |சோழவரம்/], ["Veeranam", / veeranam |வீராண/]];
export const reservoirIn = (t: string): string | null => RESERVOIRS.find(([, re]) => re.test(t))?.[0] ?? null;
const WHY = ["why", "reason", "cause", "ஏன்", "காரணம்", "yen"];
const WHERE = ["where", "எங்கே", "எங்கு", "enga", "engey"];
const CASES = ["case", "cases", "complaint", "complaints", "incident", "incidents", "issue", "issues", "problem", "problems", "புகார்", "புகார்கள்", "சம்பவம்", "சம்பவங்கள்", "பிரச்சனை", "pugar"];
const COMPARE = ["compare", "comparison", "versus", "vs", "side by side", "stack up", "difference between", "ஒப்பிடு", "ஒப்பிட்டு", "ஒப்பீடு", "oppidu", "oppittu", "சைடு பை சைடு",
  // English as it is said in Tamil, in either script
  "கம்பேர்", "கம்பேரிசன்", "கம்பேரு", "கம்பார்", "compare pannu", "compare panni", "vithiyasam", "வித்தியாசம் சொல்லு"];
const INSIGHT = ["stand out", "stands out", "standing out", "outlier", "outliers", "anomaly", "anomalies", "unusual", "abnormal", "spike", "spikes", "odd one", "out of line", "red flag", "red flags", "தனித்து", "அசாதாரண", "வித்தியாசம்", "வித்தியாசமா", "unusual a", "weird"];
const COMPLETE = ["complete this", "complete the data", "complete the table", "complete data", "fill in", "fill the", "fill what", "fill missing", "missing data", "missing fields", "missing values", "missing details", "blanks", "unresolved location", "unresolved locations", "no location", "unlocated", "complete pannu", "fill pannu", "missing data fill", "விடுபட்ட", "நிரப்பு", "முழுமையாக்கு", "முழுமை செய்", "தீர்க்கப்படாத இடம்", "தீர்க்கப்படாத இடங்கள்", "இடம் தெரியாத"];
const PERFORMANCE = ["performance", "department wise", "department-wise", "departmentwise", "zone wise", "zone-wise", "zonewise", "slowest department", "fastest department", "slowest", "turnaround", "செயல்பாடு", "துறைவாரி", "மண்டலவாரி", "performance eppadi"];
const RANK = ["top", "worst", "highest", "lowest", "most", "least", "best", "rank", "ranking", "அதிகம்", "அதிக", "குறைவு", "மோசமான", "romba"];
const TREND = ["trend", "trends", "over time", "how has", "moved", "movement", "graph", "போக்கு", "ட்ரெண்ட்", "trend enna"];
const DASHBOARD = ["dashboard", "டாஷ்போர்டு", "டேஷ்போர்டு", "dashboard pannu", "dashboard podu"];
const ON_MAP = ["on a map", "on the map", "on map", "map the", "map of", "plot", "map la", "வரைபடத்தில்", "மேப்ல", "மேப்பில்"];
const NEARBY = /\b(within|near|nearby|close to|around|km|kilometre|kilometer|metres?)\b|அருகில்|பக்கத்தில்|கிமீ|கி\.மீ|pakkathula|kitta/;
const FACILITY = /(school|hospital|shelter|fire station|police station|பள்ளி|மருத்துவமனை|முகாம்|hospitals|schools|shelters)/;
const ATTENTION = ["attention", "priority", "priorities", "what is happening", "whats happening", "brief", "briefing", "summary", "update", "கவனம்", "சுருக்கம்", "நிலவரம்", "என்ன நடக்குது", "என்ன நடக்கிறது"];

/** words that tie a question to the district and this console (any one of them keeps the question in) */
const DISTRICT = ["chennai", "madras", "district", "zone", "zones", "ward", "wards", "taluk", "taluks", "area", "collector", "console", "dashboard", "department", "departments",
  "officer", "officers", "complaint", "complaints", "grievance", "incident", "incidents", "case", "cases", "issue", "problem", "news", "headline", "rain", "rainfall", "flood",
  "flooding", "waterlogging", "drain", "price", "prices", "market", "vegetable", "air", "aqi", "pollution", "lake", "lakes", "reservoir", "water", "power", "electricity",
  "garbage", "waste", "road", "roads", "police", "crime", "accident", "fire", "hospital", "school", "dengue", "fever", "health", "cyclone", "weather", "temperature",
  "severe", "deadline", "overdue", "brief", "briefing", "trend", "trends", "map", "report", "alert", "gcc", "cmwssb", "tneb", "imd", "pwd", "mandi", "jarvis",
  "சென்னை", "மாவட்ட", "மண்டல", "வார்டு", "புகார்", "சம்பவ", "செய்தி", "மழை", "வெள்ள", "விலை", "சந்தை", "காற்று", "ஏரி", "தண்ணீர்", "மின்", "குப்பை", "சாலை",
  "காவல்", "விபத்து", "மருத்துவ", "பள்ளி", "துறை", "அதிகாரி", "ஆட்சியர்", "வானிலை", "புயல்"];

/**
 * A question that is not about the district (general knowledge, chat, other subjects): Jarvis says what it can help with
 * instead of answering. A question that names anything of the district (a place, a topic, the console) stays in.
 */
export function offTopic(text: string, w: World): boolean {
  const t = norm(text), raw = text.toLowerCase();
  if (zonesIn(t, w).length || catIn(t) || has(t, DISTRICT) || DISTRICT.some((d) => /[\u0B80-\u0BFF]/.test(d) && raw.includes(d))) return false;
  return GENERAL.test(raw) || SUBJECTS.test(raw);
}

/** Does the sentence name a zone, or a locality inside one? */
export const namesZone = (text: string, w: World): boolean => zonesIn(norm(text), w).length > 0;

/** Does the sentence name a zone, a place, a topic or a department of the district? (the address gate's "district noun") */
export function districtNounIn(text: string, w: World): boolean {
  const t = norm(text), raw = text.toLowerCase();
  return zonesIn(t, w).length > 0 || !!catIn(t) || has(t, DISTRICT) || DISTRICT.some((d) => /[஀-௿]/.test(d) && raw.includes(d));
}

/**
 * What the fast lane must leave to the planner: more than one thing asked at once, a request for judgement, and getting ready
 * for something (the planner's rain mission). The rules answer one plain question, fast; they do not reason.
 */
const MULTI = / (and then|then|after that|also|as well as|plus|அப்புறம்|பிறகு|அதன் பிறகு|apram|appuram) /;
const ADVICE = / (what should|what do i do|what can i do|how should|should i|should we|advise|advice|recommend|suggest|suggestion|what next|ennna pannalam|enna pannalam|என்ன செய்ய|என்ன செய்யலாம்|என்ன பண்ணலாம்|பரிந்துரை) /;
const MISSION = / (prepare|prepare for|get ready|get everything ready|readiness|be ready|expect heavy|expecting heavy|expect rain|heavy rain tonight|heavy rain tomorrow|storm is coming|cyclone is coming|tayar|thayar|ready pannu|தயார்|தயாராக) /;

// ---- is the fast lane sure? A wrong screen shown at once costs more than a planner call: half of what went wrong in the
// held-out run was this lane confidently reading one word of a sentence that meant something else. So it answers only when it
// can account for the sentence and only one kind of question is being asked; otherwise it says nothing and the planner decides.

/** the sentence's grammar and the asking itself: these say nothing about what is wanted */
const PLAIN = new Set(("a an the this that these those is are was were be been am do does did has have had of in on at to for from by with about across around over under into per and or but not no any all some each every much many more less me my us our i you it its they them there here what whats which where when why how who please can could would will shall may might must should show give tell get list display see find check look bring pull up out want need like let just now current currently latest new recent right so very too sir madam ok okay reading readings level levels reported morning evening tonight yesterday anything everything happening going on "
  + "la le ku kku lla ah a nu oru enna ennaa epdi eppadi enga yen evlo evvalavu ethana irukku iruku irukka irukkaa sollu sollunga kaattu kaatu kattu katu kaami kaatunga kattunga paaru paarunga pannu pannunga podu eduthu vaa konjam inga anga ellam ella "
  + "என்ன என்னென்ன எங்க எங்கே எப்படி ஏன் எத்தனை எவ்வளவு இருக்கு இருக்கா இருக்கிறது உள்ள காட்டு காட்டுங்க காட்டுங்கள் சொல்லு சொல்லுங்க பாரு பாருங்க போடு எல்லாம் ஒரு இந்த அந்த கொஞ்சம் இப்போ இப்போது").split(" "));
const words = (list: string[]) => list.flatMap((x) => norm(x).trim().split(" ")).filter(Boolean);
const LISTED = new Set([...PLAIN, "tamil", "english", "தமிழில்", "தமிழ்", ...words([...NEWS, ...PRICE, ...PRICE_WEAK, ...AIR, ...RAIN, ...LAKE, ...WHY, ...WHERE, ...CASES, ...COMPARE, ...INSIGHT, ...COMPLETE, ...PERFORMANCE, ...RANK, ...TREND, ...DASHBOARD, ...ON_MAP, ...ATTENTION, ...DISTRICT, ...Object.values(CAT_ALIASES).flat(), ...Object.values(DEPT_ALIASES).flat(), ...Object.values(ZONES).flatMap((z) => [...z.en, ...z.ta]), ...SEV_WORDS.map(([x]) => x), "within", "near", "nearby", "close", "km", "kilometre", "kilometer", "metres", "school", "hospital", "shelter", "station", "severe", "serious", "critical", "urgent", "today", "week", "month", "quarter", "weekly", "monthly", "daily", "இன்று", "இன்னைக்கு", "வாரம்", "மாதம்", "innaiku", "inniki", "ippo", "vaaram", "maasam", "vegetables", "vegetable", "tomato", "onion", "potato", "thakkali", "vengayam", "தக்காளி", "வெங்காயம்", "chembarambakkam", "puzhal", "poondi", "cholavaram", "veeranam", "செம்பரம்பாக்கம்", "புழல்", "பூண்டி", "சோழவரம்", "வீராணம்"])]);
/**
 * Is this (roman) word one the fast lane knows, in any of the three languages: a word of its lists, the sentence's grammar, a topic, a place or a body of ours, in Tamil letters
 * or romanised, with a case ending? A word nothing here knows, in front of an agency word, is another place's or body's name (RC-01).
 */
let romanListed: string[] | null = null;
export function listedWord(word: string): boolean {
  if (LISTED.has(word)) return true;
  romanListed ??= [...new Set([...LISTED].filter((x) => /[஀-௿]/.test(x)).map((x) => romanise(x).replace(/\s+/g, "")))];
  return romanListed.some((r) => r === word || (r.length >= 4 && word.startsWith(r) && /^(a|u|i|e|ai|ku|kku|ukku|ukkum|la|le|il|in|um|ul|al|ala|oda|ode|irundhu|gal|kal|ngal)$/.test(word.slice(r.length))));
}
/** is this exact (Latin) word on one of the fast lane's own lists? (not romanised Tamil: "polis" is the Corporation's police, spelt as heard) */
export const isListedExact = (word: string): boolean => LISTED.has(word);
const WORLD_WORDS = new WeakMap<World, Set<string>>();
function worldWords(w: World): Set<string> {
  let s = WORLD_WORDS.get(w);
  if (!s) { s = new Set(words([...w.zones.map((z) => z.name), ...w.depts.flatMap((d) => [d.code, d.name]), ...w.places.flatMap((p) => [p.name, ...p.aliases])])); WORLD_WORDS.set(w, s); }
  return s;
}
const TAMIL_STEMS = [...LISTED].filter((x) => /[஀-௿]/.test(x) && x.length >= 3).map((x) => x.replace(/[்ுூ]$/, ""));
function explained(word: string, w: World): boolean {
  const known = worldWords(w);
  if (LISTED.has(word) || known.has(word) || /^\d+$/.test(word)) return true;
  // a Tamil word's case ending (அடையாறில், புகாருக்கு); a Tanglish place with its ending joined on (Adyarla); an English plural
  if (/[஀-௿]/.test(word)) return TAMIL_STEMS.some((x) => word.startsWith(x)) || [...known].some((x) => /[஀-௿]/.test(x) && x.length >= 3 && word.startsWith(x.replace(/[்ுூ]$/, "")));
  const bare = word.replace(/(la|le|ku|kku|s)$/, "");
  return bare !== word && (LISTED.has(bare) || known.has(bare));
}

const SAVE_ASK = /\b(save|pin|bookmark|workspace|remember)\b|சேவ்|சேமி|பின் பண்ண|பின் செய்|ஒர்க்ஸ்பேஸ்|நினைவில்/;
const MAPISH = /\b(map|maps|gis|overlay|plot)\b|மேப்|வரைபட/;
const HOW = /\b(how|epdi|eppadi)\b|எப்படி/;
const RANK_SHAPE = RANK.filter((x) => x !== "romba");
/** asked for the day as a whole; "நிலவரம்" or "update" beside a topic only asks how that topic stands */
const BRIEF_SHAPE = ["brief", "briefing", "summary", "சுருக்கம்"];
/** asking for a list: a topic named with no such word ("the boiling point of heavy water") is not a request for its cases */
const LIST_ASK = /\b(show|list|display|any|which|give|pull|bring|get|where|kaattu|kaatu|kattu|katu|kaatunga|kattunga|sollu|sollunga|enna|ennenna|edhu|enga)\b|காட்டு|பட்டியல்|லிஸ்ட்|என்னென்ன|சொல்லு|எங்க|எங்கே|எது/;

const isPrice = (t: string) => has(t, PRICE) || (has(t, PRICE_WEAK) && (VEG.test(t) || MARKET.test(t))) || (VEG.test(t) && /(price|rate|cost|விலை|vilai|எவ்வளவு|evvalavu|how much)/.test(t));

/** a word some other reader of this lane takes as a filter (a status, a severity, a window): it is not an unread topic */
const readAsSlot = (x: string): boolean => statusIn(` ${x} `) != null || sevIn(` ${x} `) != null || periodIn(` ${x} `) != null;

/** The word in front of "complaint(s)" that nothing reads (not a topic, place, body, status, severity or window), or null: the kind of complaint asked about is unread (RC-05). */
export function unknownTopicIn(t: string, w: World): string | null {
  const all = t.trim().split(" ");
  for (let i = 1; i < all.length; i++) if (/^(complaints?|issues?|problems?|grievances?)$/.test(all[i]) && /^[a-z]{3,}$/.test(all[i - 1]) && !explained(all[i - 1], w) && !readAsSlot(all[i - 1]) && statusIn(` ${all[i - 1]} ${all[i]} `) == null) return all[i - 1];
  return null;
}

/** A complaint noun with three or more words around it that nothing here reads ("work-site quality complaints"): the kind of complaint asked about is a clause the rules cannot read, in any language (RC-05, ta-list-16). */
export function unreadClauseIn(t: string, w: World): boolean {
  const all = t.trim().split(" ");
  if (!all.some((x) => /^(complaints?|issues?|problems?|grievances?|cases?)$/.test(x) || /^(புகார்|கேஸ்|சம்பவ)/.test(x))) return false;
  return all.filter((x) => !explained(x, w)).length >= 3;
}

/** Why the fast lane should not answer this sentence, or null when it is sure. */
export function unsureWhy(text: string, t: string, w: World, zones: number[], cat: string | null): string | null {
  // an order Jarvis never carries out (close, send, delete ...) is not a screen with a filter: the refusal answers it, not "Severe" (RC-04, PB-283)
  if (asksForbidden(text)) return "forbidden-order";
  const all = t.trim().split(" ");
  const left = all.filter((x) => !explained(x, w)).length;
  if (left >= 3 || (left >= 2 && left / all.length > 0.4)) return "unknown-words";
  // a kind of complaint no category names ("the power cut complaint", "noise complaints"): listing every case of the place would answer about something else. The word in front of
  // "complaint" that nothing here reads is the topic; the planner, which can search the records, takes it (RC-05, audit-understanding-16)
  if (!cat && unknownTopicIn(t, w)) return "unknown-topic";
  if (SUBJECTS.test(text.toLowerCase())) return "other-subject";
  if (SAVE_ASK.test(t)) return "save";
  if (MAPISH.test(t) && !has(t, ON_MAP)) return "map-word";
  if (NEARBY.test(t) && !FACILITY.test(t)) return "nearby-word";
  if (isComparing(t)) return zones.length >= 2 ? null : "compare-needs-two";
  // two places and no word for comparing: every screen below keeps one place, and would silently drop the other
  if (zones.length >= 2) return "two-places";
  const why = has(t, WHY) && (!!cat || zones.length > 0);
  const shapes = [why, !why && has(t, INSIGHT), has(t, TREND), has(t, RANK_SHAPE), has(t, PERFORMANCE), has(t, COMPLETE), has(t, DASHBOARD), has(t, ON_MAP), has(t, BRIEF_SHAPE)].filter(Boolean).length;
  if (shapes >= 2) return "two-questions";
  const topics = [isPrice(t), has(t, NEWS), has(t, AIR), has(t, LAKE) || reservoirIn(t) != null, has(t, RAIN)].filter(Boolean).length;
  // an explicit dashboard, a request for what stands out or for what is missing names its own screen, whatever its topic
  if (shapes === 1 && topics >= 1 && !has(t, DASHBOARD) && !has(t, COMPLETE) && !has(t, INSIGHT)) return "shape-and-topic";
  if (topics >= 2 && !has(t, NEWS)) return "two-topics";
  if (HOW.test(t) && cat && !topics && !LIST_ASK.test(t)) return "how-about-a-topic";
  return null;
}

/** asking for one issue to be explained */
const EXPLAIN = / (explain|explain to me|whats going on with|what is going on with|whats wrong with|what is wrong with|what happened (with|to|at)|tell me (more )?about the [a-z ]{0,40}(complaint|issue|case|incident|problem)|vilakku|vilakkam|vilakkama|vilakkunga|puriyala|puriyalai|enna aachu|ennanu|enna problem|simple ah|simpleah) |என்ன ஆச்சு|என்னன்னு|புரியல/;
/** not one issue: a list, a count, a rise, a trend or the reason behind one (BUG-032) */
/** the words of asking: with a place and nothing but these, the Collector named no topic ("explain the complaint in Adyar") */
const ASKING = new Set(("explain to me tell more about the a an of in at on with whats what is going wrong happened complaint issue case incident problem this that please here there today week month " +
  "pathi pathiya patri simple simpleah ah sollu sollunga enna aachu ennanu la le nu adhu vilakku vilakkam vilakkama vilakkunga puriyala puriyalai " +
  "புகார் பிரச்சனை பிரச்சினை சம்பவம் பற்றி பத்தி சொல்லு சொல்லுங்க சொல்லுங்கள் விளக்கு விளக்குங்க விளக்குங்கள் விளக்கவும் விளக்கி விளக்கம் விளக்கமா விளக்கமாக என்னன்னு என்ன ஆச்சு புரியல உள்ள இருக்கும் வந்த இந்த அந்த கொஞ்சம் பகுதி பகுதியில் மண்டலம் மண்டலத்தில் எளிமையா").split(" "));
const NOT_ONE = / (cases|complaints|incidents|issues|problems|reports|all|every|list|rise|rising|increase|increasing|spike|spiking|jump|drop|fall|falling|trend|trends|why|pattern|patterns|high|low|many|count|stats|statistics) |புகார்கள்|சம்பவங்கள்|பிரச்சனைகள்|பிரச்சினைகள்|ஏன்|அதிகரி|போக்கு|பட்டியல்/;

/** The fast lane's reading of one sentence, or null to let the agent decide. */
export function quickScreen(text: string, w: World, o: { noBail?: boolean } = {}): Quick | null {
  const t = norm(text);
  if (t.trim().length < 3) return null;
  // another place's or body's question is never answered with ours: the brief turn says so (RC-01)
  if (foreignIn(text, w)) return null;
  // a note to keep, a reminder, or an order to change a record is never a question about the data, in any language (RC-04)
  if (!o.noBail && (KEEPING.test(text) || CHANGE_RECORD.test(text))) return null;
  // yesterday, last week, last month: windows the console does not hold are never answered with the current one (RC-06)
  if (!o.noBail && calendarWindowIn(t)) return null;
  // follow-ups and edits of an open screen ("only the Adyar ones", "same for", "open 3") are the agent's
  if (!o.noBail && has(t, ["same", "also", "only", "instead", "open", "draft", "send", "that", "those", "click", "கிளிக்", "அதே", "அதையே", "மட்டும்"])) return null;
  if (!o.noBail && (MULTI.test(t) || MISSION.test(t))) return null;
  // a ward (there are 200, the lane holds 15 zones) is not a zone: answering with the district list would drop it (RC-05)
  if (!o.noBail && /\b(wards?|ward no)\b|வார்டு/.test(t)) return null;
  // a zone said by a number that is no zone ("zone 99", "zone 0"), or several zones by number: the brief turn says so, the district list would drop them (SKG1-34, SKG1-35)
  if (!o.noBail) { const nos = zoneNosIn(text); if (nos.some((n) => n < 1 || n > 15) || (nos.length > 1 && !isComparing(t))) return null; }
  const zones = zonesIn(t, w), cat = catIn(t), sev = sevIn(t), period = periodIn(t);
  // "explain the flooding complaint in Velachery", "what's going on with the garbage in Adyar": one issue, retold
  if ((EXPLAIN.test(t) || EXPLAIN_TA.test(t)) && !NOT_ONE.test(t) && (cat || zones.length) && !isComparing(t)) {
    // a topic the rules cannot read ("the power cut complaint in Ambattur"): the zone's top case would be a confident answer about something else (BUG-032)
    const zoneWords = zones.flatMap((n) => [...(ZONES[n]?.en ?? []), ...(ZONES[n]?.ta ?? []), w.zones.find((z) => z.n === n)?.name ?? ""]).flatMap((x) => norm(x).trim().split(" "));
    const isZoneWord = (x: string) => zoneWords.some((z) => z && (x === z || x === `${z}la` || (/[஀-௿]/.test(z) && z.length >= 4 && x.startsWith(z.replace(/[்ுூ]$/, "")))));
    // a word that is no asking word, no zone word and no word of the topic that was read is another topic ("the flood relief need in Adyar"): the lane does not answer it as the flood (RC-05)
    const catWords = (cat ? CAT_ALIASES[cat] ?? [] : []).flatMap((a) => norm(a).trim().split(" ")).filter(Boolean);
    const isSevWord = (x: string) => SEV_WORDS.some(([s]) => x === s.toLowerCase() || (/[஀-௿]/.test(s) && x.startsWith(s)));
    const isCatWord = (x: string) => isSevWord(x) || catWords.some((c) => x === c || (/[஀-௿]/.test(c) && c.length >= 3 && x.startsWith(c.replace(/[்ுூ]$/, ""))));
    const namedOther = t.trim().split(" ").some((x) => !ASKING.has(x) && !LISTED.has(x) && !isZoneWord(x) && !isCatWord(x));
    if (!namedOther) return { recipe: "case", slots: { zones: zones.slice(0, 1), cat, sev, period: period ?? "monthly", fresh: true } };
    if (!o.noBail) return null;
  }
  if (!o.noBail && unsureWhy(text, t, w, zones, cat)) return null;
  // "what should I do about flooding in Adyar": what needs the Collector first, reasoned in code from the data
  if (ADVICE.test(t)) return { recipe: "advise", slots: { zones: zones.slice(0, 1), cat, period: period ?? "weekly" } };
  if (has(t, COMPLETE)) return { recipe: "complete", slots: { zones: zones.slice(0, 1), cat, period: period ?? "weekly", fresh: has(t, ["unresolved location", "unresolved locations", "no location", "unlocated"]) } };
  // "why did complaints spike": asked why, so the reasons, not the outliers
  if (has(t, WHY) && (cat || zones.length)) return { recipe: "why", slots: { zones: zones.slice(0, 1), cat, period: period ?? "weekly" } };
  if (has(t, INSIGHT) || false) return { recipe: "insight", slots: { zones: zones.slice(0, 1), cat, period: period ?? "weekly" } };
  if (NEARBY.test(t) && FACILITY.test(t)) return { recipe: "nearby", slots: { q: text.trim().slice(0, 240) } };
  if (has(t, DASHBOARD)) return { recipe: "dashboard", slots: { zones: zones.slice(0, 1), cat, period: period ?? "weekly" } };
  if (has(t, ON_MAP) && !cat && !sev && !has(t, ["hotspot", "hotspots", "severe"])) return null;
  if (has(t, ON_MAP) && (cat || sev || has(t, ["hotspot", "hotspots", "severe"]))) return { recipe: "map", slots: { what: has(t, ["hotspot", "hotspots"]) ? "hotspots" : sev ? "severe" : "cases", sev, cat, zones: zones.slice(0, 1), period: period ?? "weekly" } };
  if (isPrice(t)) {
    const m = VEG.exec(t);
    const veg = m ? (m[1] ?? m[2]).replace(/es$/, "").replace(/s$/, "") : null;
    return { recipe: "prices", slots: { q: veg } };
  }
  if (isComparing(t) && zones.length >= 2) return { recipe: "compare", slots: { zones: zones.slice(0, 2), cat, period: period ?? "weekly" } };
  if (has(t, NEWS)) return { recipe: "news", slots: { zones: zones.slice(0, 1), cat, period: period ?? "weekly", fresh: true } };
  if (has(t, COMPARE) && zones.length >= 2 && (has(t, AIR) || has(t, LAKE))) return { recipe: "compare", slots: { zones: zones.slice(0, 2), cat, period: period ?? "weekly" } };
  if (has(t, AIR)) return { recipe: "readings", slots: { metric: "aqi", zones: zones.slice(0, 1), name: zones.length ? w.zones.find((z) => z.n === zones[0])?.name ?? null : null } };
  const reservoir = reservoirIn(t);
  if (reservoir) return { recipe: "readings", slots: { metric: "lakes", name: reservoir } };
  if (has(t, LAKE) && !cat) return { recipe: "readings", slots: { metric: "lakes" } };
  if (isComparing(t) && zones.length >= 2) return { recipe: "compare", slots: { zones: zones.slice(0, 2), cat, period: period ?? "weekly" } };
  // a comparison the rules cannot fill (two departments, a period against another) is the planner's, never a plain list
  if (isComparing(t)) return null;
  if (has(t, RAIN) && !has(t, CASES) && !cat) return { recipe: "readings", slots: { metric: "rain", zones: zones.slice(0, 1) } };
  if (has(t, PERFORMANCE)) return { recipe: "performance", slots: { by: has(t, ["zone wise", "zone-wise", "zonewise", "மண்டலவாரி"]) ? "zone" : "dept", period: period ?? "weekly" } };
  if (!/^ (go to|open|switch to|take me to|navigate to|click|press|tap|select|hit|jarvis click|jarvis press) /.test(t) && has(t, TREND)) return { recipe: "trend", slots: { cat, zones: zones.slice(0, 1), period: period ?? "monthly" } };
  // a ranking has no topic slot: with a topic named it would rank every kind of case and say it ranked the topic (RC-06)
  if (has(t, RANK) && !cat && has(t, ["zone", "zones", "area", "areas", "மண்டலம்", "மண்டலங்கள்", "பகுதி", "பகுதிகள்"])) return { recipe: "ranking", slots: { measure: has(t, ["severe", "கடுமையான"]) ? "zone_severe" : "zone_attention", n: Number(/ (\d{1,2}) /.exec(t)?.[1]) || 5, order: has(t, ["lowest", "least", "best", "குறைவு"]) ? "bottom" : "top", period: period ?? "weekly" } };
  // "which zone has the most garbage complaints": a ranking of zones on one topic; the ranking screen has no topic slot, so the planner answers it, not a list of cases (RC-06)
  if (has(t, RANK) && cat && has(t, ["zone", "zones", "area", "areas", "மண்டலம்", "மண்டலங்கள்", "பகுதி", "பகுதிகள்"])) return null;
  if (has(t, RANK) && has(t, ["department", "departments", "dept", "துறை", "துறைகள்"])) return { recipe: "ranking", slots: { measure: "dept_open", n: Number(/ (\d{1,2}) /.exec(t)?.[1]) || 5, period: period ?? "weekly" } };
  if (has(t, WHERE) && (cat || sev)) return { recipe: "cases", slots: { cat, sev, zones: zones.slice(0, 1), period: period ?? "daily", sort: "priority", n: 20, fresh: true } };
  // a topic alone is not a request for its cases: it needs a word for cases, or to be asked for as a list
  if (sev || ((has(t, CASES) || (cat && (o.noBail || LIST_ASK.test(t)))) && (zones.length || period || cat))) {
    // "past the deadline", "overdue": only those (BUG-024)
    const status = statusIn(t);
    // a department named with no topic would be dropped here: the lane says nothing it cannot apply, the agent asks (RC-05)
    if (!cat && deptWordIn(t)) return null;
    return { recipe: "cases", slots: { sev, cat, status, zones: zones.slice(0, 1), period: period ?? (sev ? "daily" : "weekly"), sort: "priority", n: 20,
      // a new question starts clean: a filter an earlier answer put on the console (Fire, say) must not narrow it
      fresh: true } };
  }
  if (has(t, ATTENTION) && !zones.length) return { recipe: "brief", slots: { period: period ?? "daily" } };
  return null;
}
