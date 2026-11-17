/**
 * Jarvis v6, Phase 4: the PUBLIC words of a news item or a question, found by code from fixed lists. Server only, no network.
 *
 *   places   the console's own names: the 15 zones (lexicon ZONES, English and Tamil), the reservoirs (RESERVOIR_ALIASES), the
 *            Corporation's area-name words (areas.ts, less plain English and common nouns of a place name), the prompt's
 *            localities, and the metro's districts and towns ("region": Chennai, Chengalpattu ... as SACHET writes them);
 *   types    what happened (fire, flood, collapse, accident ...), English and Tamil;
 *   weather  the Met words (rain, cyclone, alert ...), English and Tamil;
 *   cyclones the names of past Bay of Bengal cyclones (public names);
 *   day      today / tonight / tomorrow / yesterday.
 * Anything else in the text (a name, a phone number, an address, a complaint's words) is never returned, so a query built from
 * Terms can carry nothing personal. Matching related coverage uses the same lists, locally.
 */
import { AREA_WORDS } from "../areas";
import { isEnglishWord } from "../english";
import { RESERVOIR_ALIASES, ZONE_NAMES, ZONES } from "../lexicon";
import { phonetic, romanise } from "../xlit";

export interface Terms {
  /** canonical place names (Velachery, Adyar), most specific first */
  places: string[];
  /** districts and the state (Chennai, Chengalpattu, Tamil Nadu): too wide to tell one event from another */
  region: string[];
  /** incident types (fire, flood ...) */
  types: string[];
  /** Met words found (rain, cyclone, alert ...) */
  weather: string[];
  cyclones: string[];
  /** -1 yesterday, 0 today or tonight, 1 tomorrow; null when the text names no day */
  day: number | null;
  /** English content words of the text (for headline overlap; used locally only, never sent) */
  words: string[];
}

// ------------------------------------------------------------------ places --

/** area-name words that are a common noun of a place name or a person's name, not a place on their own */
const GENERIC = new Set(("nagar salai kuppam palayam puram pettai pakkam chavadi thangal colony extension extn street road main cross east west north south " +
  "gandhi anna indira annai george besant lenin raman sastri annamalai alagappa assisi dunlop ganesh gangai hindu thillai vivek washermen parrys mahathma madura shenoy").split(" "));

/** the prompt's localities (lexicon STT_NAMES) in both scripts, and the metro's other towns */
const EXTRA: [string, string][] = [["Velachery", "velachery"], ["Velachery", "வேளச்சேரி"], ["Mylapore", "mylapore"], ["Mylapore", "மயிலாப்பூர்"],
  ["Tambaram", "tambaram"], ["Tambaram", "தாம்பரம்"], ["Avadi", "avadi"], ["Avadi", "ஆவடி"], ["Poonamallee", "poonamallee"], ["Poonamallee", "பூந்தமல்லி"],
  ["Pallavaram", "pallavaram"], ["Pallavaram", "பல்லாவரம்"], ["Pallikaranai", "pallikaranai"], ["Pallikaranai", "பள்ளிக்கரணை"], ["Ennore", "ennore"], ["Ennore", "எண்ணூர்"]];
/** districts and the state, with the short forms the SACHET feed uses ("Cpattu", "Kanche") */
const REGION: [string, string][] = [["Chennai", "chennai"], ["Chennai", "madras"], ["Chennai", "சென்னை"],
  ["Chengalpattu", "chengalpattu"], ["Chengalpattu", "chengalpet"], ["Chengalpattu", "cpattu"], ["Chengalpattu", "செங்கல்பட்டு"],
  ["Kancheepuram", "kancheepuram"], ["Kancheepuram", "kanchipuram"], ["Kancheepuram", "kanche"], ["Kancheepuram", "காஞ்சிபுரம்"],
  ["Tiruvallur", "tiruvallur"], ["Tiruvallur", "thiruvallur"], ["Tiruvallur", "திருவள்ளூர்"],
  ["Tamil Nadu", "tamil nadu"], ["Tamil Nadu", "tamilnadu"], ["Tamil Nadu", "தமிழ்நாடு"], ["Tamil Nadu", "தமிழகம்"], ["Tamil Nadu", "தமிழக"]];

interface Name { id: string; key: string; region: boolean }
interface Index { latin: Map<string, Name>; tamil: Map<string, Name>; tamilByFirst: Map<string, Name[]> }
let index: Index | null = null;

const TAMIL = /[஀-௿]/;
const cap = (s: string) => s.replace(/(^|\s)(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
const keyOf = (s: string) => phonetic(TAMIL.test(s) ? romanise(s) : s).replace(/ /g, "");

function build(): Index {
  const ix: Index = { latin: new Map(), tamil: new Map(), tamilByFirst: new Map() };
  const add = (id: string, spelling: string, region = false) => {
    const n: Name = { id, key: keyOf(spelling), region };
    if (TAMIL.test(spelling)) {
      if (n.key.length < 4 || ix.tamil.has(n.key)) return;
      ix.tamil.set(n.key, n);
      const l = ix.tamilByFirst.get(n.key[0]) ?? [];
      l.push(n);
      ix.tamilByFirst.set(n.key[0], l);
    } else {
      const k = spelling.toLowerCase().replace(/[-.]/g, " ").replace(/\s+/g, " ").trim();
      if (!ix.latin.has(k)) ix.latin.set(k, n);
      // an English spelling also matches a Tamil word that sounds the same (romanised)
      if (n.key.length >= 5 && !ix.tamil.has(n.key)) { ix.tamil.set(n.key, n); const l = ix.tamilByFirst.get(n.key[0]) ?? []; l.push(n); ix.tamilByFirst.set(n.key[0], l); }
    }
  };
  for (const [id, sp] of REGION) add(id, sp, true);
  for (const [n, z] of Object.entries(ZONES)) { const id = ZONE_NAMES[Number(n) - 1]; for (const v of [...z.en, ...z.ta]) add(id, v); }
  for (const [alias, canon] of RESERVOIR_ALIASES) add(canon, alias);
  for (const [id, sp] of EXTRA) add(id, sp);
  for (const w of AREA_WORDS) if (w.length >= 6 && !GENERIC.has(w) && !isEnglishWord(w)) add(cap(w), w);
  return ix;
}

/** at most one edit apart (insert, delete or change), for Tamil words written a little differently */
function oneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Tamil case endings a place name takes in a sentence (அடையாறில், வேளச்சேரியில், சென்னைக்கு) */
const TA_END = /(?:இல்|ில்|க்கு|ுக்கு|ின்|இன்|ிலிருந்து|ில்லிருந்து|ைச்|ையில்|ை|ல்|ு)$/;

/** The places a text names: specific ones and the region, each canonical, in order of first mention. */
export function placesIn(text: string): { places: string[]; region: string[] } {
  index ??= build();
  const places: string[] = [], region: string[] = [];
  const put = (n: Name) => { const l = n.region ? region : places; if (!l.includes(n.id)) l.push(n.id); };
  const words = String(text ?? "").normalize("NFC").replace(/['’]s\b/g, "").replace(/[^\p{L}\p{M}\s-]/gu, " ").split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (TAMIL.test(w)) {
      for (const g of new Set([w, w.replace(TA_END, "")])) {
        const k = keyOf(g);
        if (k.length < 4) continue;
        const exact = index.tamil.get(k);
        if (exact) { put(exact); break; }
        if (k.length >= 6) { const near = (index.tamilByFirst.get(k[0]) ?? []).find((n) => n.key.length >= 6 && oneEdit(n.key, k)); if (near) { put(near); break; } }
      }
      continue;
    }
    const lw = w.toLowerCase().replace(/^-+|-+$/g, "");
    const two = i + 1 < words.length ? `${lw} ${words[i + 1].toLowerCase()}`.replace(/-/g, " ") : null;
    const hit = (two && index.latin.get(two)) || index.latin.get(lw.replace(/-/g, " "));
    if (hit) put(hit);
  }
  return { places, region };
}

// ------------------------------------------------------------------- types --

/** incident types, English and Tamil (what happened, not where) */
export const TYPES: [string, RegExp][] = [
  ["fire", /\b(fire|blaze|ablaze|gutted|burnt|charred)\b|தீ\s?விபத்து|தீப்பிடி|தீ பற்றி|எரிந்து/i],
  ["flood", /\b(flood\w*|inundat\w*|waterlog\w*|water-logg\w*|submerg\w*|stagnat\w*)\b|வெள்ள|தண்ணீர் தேங்|மழைநீர் தேங்|நீர் தேங்/i],
  ["rain", /\b(rain\w*|downpour|showers?|cyclone|depression|thunderstorm|storm)\b|மழை|புயல்/i],
  ["collapse", /\b(collaps\w*|caved in|cave-in|crumbl\w*|wall fell)\b|இடிந்து|சரிந்து/i],
  ["accident", /\b(accident|collision|collided|crash\w*|overturn\w*|mishap|run over|knocked down)\b|விபத்து|மோதி|கவிழ்ந்து/i],
  ["drowning", /\b(drown\w*)\b|நீரில் மூழ்கி|மூழ்கி/i],
  ["death", /\b(died|dead|death|killed|bodies|body found|succumbed)\b|உயிரிழ|பலி|சடலம்|இறந்/i],
  ["crime", /\b(murder\w*|stabb\w*|assault\w*|robbery|robbed|theft|stolen|snatch\w*|arrest\w*)\b|கொலை|கொள்ளை|திருட்டு|கைது|வழிப்பறி/i],
  ["protest", /\b(protest\w*|agitation|road roko|blockade|strike|dharna)\b|போராட்ட|மறியல்|ஆர்ப்பாட்ட/i],
  ["power", /\b(power cut|power outage|outage|power supply|transformer|tangedco|tneb)\b|மின்தடை|மின் தடை|மின்வெட்டு|மின்சாரம்/i],
  ["water", /\b(drinking water|water supply|metrowater|cmwssb|water scarcity)\b|குடிநீர்/i],
  ["sewage", /\b(sewage|sewer|drainage|overflow\w*|manhole)\b|கழிவுநீர்|பாதாள சாக்கடை/i],
  ["garbage", /\b(garbage|waste|dump\w*|landfill)\b|குப்பை/i],
  ["tree", /\b(tree fell|trees? (?:fell|uprooted|fall)|uprooted)\b|மரம் (?:விழுந்து|முறிந்து|சாய்ந்து)/i],
  ["road", /\b(pothole\w*|road damage|road cave|sinkhole)\b|பள்ளம்/i],
  ["health", /\b(dengue|fever|outbreak|cholera|diarrhoea)\b|டெங்கு|காய்ச்சல்/i]
];
export function typesIn(text: string): string[] { return TYPES.filter(([, re]) => re.test(text)).map(([t]) => t); }

/** the Met department's words: a question with one of them is a weather question */
const WEATHER: [string, RegExp][] = [
  ["rain", /\b(rain\w*|downpour|showers?|drizzle)\b|மழை/i], ["cyclone", /\b(cyclone\w*|depression|low pressure|deep depression)\b|புயல்|தாழ்வு/i],
  ["storm", /\b(thunder\w*|lightning|storm\w*|gale|gusty|squall)\b|இடி|மின்னல்|சூறாவளி/i], ["wind", /\b(winds?|windy)\b|காற்று/i],
  ["flood", /\b(flood\w*|inundat\w*|waterlog\w*)\b|வெள்ள/i], ["alert", /\b(alert|warning|warns?|red|orange|yellow)\b|எச்சரிக்கை/i],
  ["met", /\b(imd|met (?:department|dept|office)|meteorolog\w*|weather|forecast|regional meteorological)\b|வானிலை/i],
  ["monsoon", /\b(monsoon)\b|பருவமழை/i], ["heat", /\b(heat\s?wave|heat|temperature|humid\w*|hot)\b|வெப்ப|வெயில்/i]
];
export function weatherIn(text: string): string[] { return WEATHER.filter(([, re]) => re.test(text)).map(([t]) => t); }

/** past Bay of Bengal cyclones that reached Tamil Nadu (their names are public) */
const CYCLONES = ["michaung", "fengal", "vardah", "gaja", "nivar", "mandous", "thane", "nilam", "ditwah", "jal", "nisha", "burevi", "ockhi", "fani", "montha"];
export function cyclonesIn(text: string): string[] {
  const t = String(text ?? "").toLowerCase();
  return CYCLONES.filter((c) => new RegExp(`\\b${c}\\b`).test(t)).map(cap);
}

/** the day a question asks about: -1, 0, 1 or null */
export function dayIn(text: string): number | null {
  const t = String(text ?? "").toLowerCase();
  if (/\b(tomorrow|next 24 hours)\b|நாளை/.test(t)) return 1;
  if (/\b(yesterday|last night)\b|நேற்று/.test(t)) return -1;
  if (/\b(today|tonight|this (?:morning|afternoon|evening)|now|right now|currently)\b|இன்று|இன்றிரவு|இப்போது|தற்போது/.test(t)) return 0;
  return null;
}

// ------------------------------------------------------------------- words --

const STOP = new Set(("the and for with from that this was were are has have had its into over after near amid about than then their them they there " +
  "said says will would could been being also more most other such only when where which while who whom what why how not but all any one two new " +
  "city chennai tamil nadu news report reports today yesterday tomorrow week day days police official officials people residents area areas " +
  "government corporation district state minister department").split(" "));
/** English content words, lower case and roughly stemmed, for headline overlap (local only) */
export function wordsIn(text: string): string[] {
  const out: string[] = [];
  for (let w of String(text ?? "").toLowerCase().replace(/['’]s\b/g, "").split(/[^a-z]+/)) {
    if (w.length < 3 || STOP.has(w)) continue;
    if (w.length > 4) w = w.replace(/(ing|ed|es|s)$/, "");
    if (w.length >= 3 && !STOP.has(w) && !out.includes(w)) out.push(w);
  }
  return out;
}

/** Every public term of a text. */
export function termsOf(text: string): Terms {
  const { places, region } = placesIn(text);
  return { places, region, types: typesIn(text), weather: weatherIn(text), cyclones: cyclonesIn(text), day: dayIn(text), words: wordsIn(text) };
}
