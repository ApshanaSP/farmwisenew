/**
 * News from the districts next to Chennai, for the Collector only: what is happening in Tiruvallur, Kancheepuram and
 * Chengalpattu that could reach Chennai or needs a precaution here. A fever outbreak in Tiruvallur, surplus water
 * let out of Poondi, a gas leak at Gummidipoondi or a clash at Tambaram crosses the border with the people, the rivers
 * and the roads before it shows up in Chennai's own records.
 *
 * Source: Google News search feeds (the news monitor already reads news.google.com/rss/search; robots.txt only bars
 * the article pages, which are never fetched here), in English and Tamil, one query per district and one per language
 * for disease news, all for the last 7 days. Read at most once an hour and kept in data/aws-cache/nearby-news.json;
 * when the feeds cannot be reached the last saved news is shown. Shown on the Overview's Latest news card ("Next
 * door"), grouped by what to prepare for and what to watch, then by district.
 *
 * Rules keep only the headlines that name a district or one of its towns, drop what Chennai's own news already has,
 * drop noise (prices, festivals, elections), sort the rest into risk topics and fold the same headline from several
 * outlets. An AI pass per district then joins the same event across languages, translates the Tamil headlines,
 * keeps what matters for Chennai, and says why and what to do (checked: no number it was not given). Without a
 * model the rules' topics and standard precautions are shown.
 *
 * One event, clicked (nearbyDetail): every outlet's headline for it, and the text of any of those reports the news
 * monitor stored, written up by AI as what happened, where, when, who is affected and what has been done (checked: no
 * number that is not in the reports). Without a model the stored text and the headlines are shown as they are.
 */
import fs from "fs";
import path from "path";
import { z } from "zod";
import { RowDataPacket } from "mysql2";
import intelPool from "@/lib/collector/db";
import { aiJson } from "@/lib/collector/aibrief";
import { when } from "@/lib/collector/analysis";

type Row = Record<string, any>;
async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(sql, params);
  return r as unknown as T[];
}

// ---------------------------------------------------------- districts --

export interface District {
  key: string; name: string; ta: string;
  /** where it lies from Chennai */
  dir: string;
  /** GCC zones on the shared border */
  zones: number[];
  /** names that place a headline here: the district and its towns, English and Tamil */
  en: string[]; tamil: string[];
}
export const DISTRICTS: District[] = [
  { key: "TVR", name: "Tiruvallur", ta: "திருவள்ளூர்", dir: "North and west", zones: [1, 2, 3, 7, 11],
    en: ["Tiruvallur", "Thiruvallur", "Avadi", "Ponneri", "Gummidipoondi", "Poonamallee", "Tiruttani", "Thiruthani", "Uthukottai", "Minjur",
      "Pulicat", "Pazhaverkadu", "Thiruverkadu", "Tiruverkadu", "Periyapalayam", "Sholavaram", "Poondi", "Kavaraipettai", "Pattabiram", "Thirumazhisai"],
    tamil: ["திருவள்ளூர்", "ஆவடி", "பொன்னேரி", "கும்மிடிப்பூண்டி", "பூந்தமல்லி", "திருத்தணி", "ஊத்துக்கோட்டை", "மீஞ்சூர்", "பழவேற்காடு",
      "திருவேற்காடு", "பெரியபாளையம்", "சோழவரம்", "பூண்டி", "கவரைப்பேட்டை", "பட்டாபிராம்", "திருமழிசை"] },
  { key: "KPM", name: "Kancheepuram", ta: "காஞ்சிபுரம்", dir: "South-west", zones: [11, 12],
    en: ["Kancheepuram", "Kanchipuram", "Kanchi", "Sriperumbudur", "Walajabad", "Uthiramerur", "Kundrathur", "Oragadam", "Padappai",
      "Chembarambakkam", "Mangadu", "Irungattukottai"],
    tamil: ["காஞ்சிபுரம்", "காஞ்சி", "ஸ்ரீபெரும்புதூர்", "வாலாஜாபாத்", "உத்திரமேரூர்", "குன்றத்தூர்", "ஒரகடம்", "படப்பை", "செம்பரம்பாக்கம்",
      "மாங்காடு", "இருங்காட்டுக்கோட்டை"] },
  { key: "CGL", name: "Chengalpattu", ta: "செங்கல்பட்டு", dir: "South", zones: [12, 14, 15],
    en: ["Chengalpattu", "Chengalpet", "Tambaram", "Pallavaram", "Guduvanchery", "Guduvancheri", "Maraimalai Nagar", "Mamallapuram",
      "Mahabalipuram", "Madurantakam", "Thiruporur", "Tiruporur", "Kelambakkam", "Vandalur", "Urapakkam", "Singaperumal Koil", "Kalpakkam",
      "Cheyyur", "Chitlapakkam", "Selaiyur", "Perungalathur", "Pammal", "Anakaputhur"],
    tamil: ["செங்கல்பட்டு", "தாம்பரம்", "பல்லாவரம்", "கூடுவாஞ்சேரி", "மறைமலைநகர்", "மாமல்லபுரம்", "மதுராந்தகம்", "திருப்போரூர்",
      "கேளம்பாக்கம்", "வண்டலூர்", "ஊரப்பாக்கம்", "சிங்கப்பெருமாள்", "கல்பாக்கம்", "செய்யூர்", "சிட்லபாக்கம்", "சேலையூர்", "பெருங்களத்தூர்", "பம்மல்"] }
];

const TA = "\\u0B80-\\u0BFF";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A Tamil name also matches its inflected forms: "திருவள்ளூர்" -> "திருவள்ளூரில்", "செங்கல்பட்டு" -> "செங்கல்பட்டில்". */
const taStem = (w: string) => (/[ா-்]$/.test(w) ? w.slice(0, -1) : w);
const placeRe = (d: District) => new RegExp(
  `\\b(?:${d.en.map(esc).join("|")})\\b|(?<![${TA}])(?:${d.tamil.map((w) => esc(taStem(w))).join("|")})`, "gi");
const PLACE_RES = DISTRICTS.map((d) => ({ d, re: placeRe(d) }));

/** The district a headline places itself in (the first named); null when it names none. */
export function districtOf(title: string): District | null {
  let best: { d: District; at: number } | null = null;
  for (const { d, re } of PLACE_RES) {
    re.lastIndex = 0;
    const m = re.exec(title);
    if (m && (!best || m.index < best.at)) best = { d, at: m.index };
  }
  return best?.d ?? null;
}

// ------------------------------------------------------------- topics --

export type Topic = "health" | "water" | "hazard" | "order" | "transport" | "civic" | "other";
export const TOPIC_LABEL: Record<Topic, string> = {
  health: "Disease & health", water: "Rain, floods & reservoirs", hazard: "Fire, gas & pollution", order: "Law & order",
  transport: "Roads, rail & supply", civic: "Water, power & waste", other: "Other"
};
const TOPICS: [Topic, RegExp][] = [
  ["health", /\b(dengue|malaria|cholera|typhoid|jaundice|hepatitis|diarrh\w*|fever|flu|influenza|h1n1|h3n2|covid|corona\w*|measles|chikungunya|scrub typhus|leptospir\w*|food poison\w*|outbreak|epidemic|infection|rabies|bird flu|avian|nipah|mpox|conjunctivitis|lumpy skin|anthrax|swine fever|vaccin\w*)\b|டெங்கு|காய்ச்சல்|காலரா|மஞ்சள் காமாலை|வயிற்றுப்போக்கு|கொரோனா|தொற்று|பறவைக் காய்ச்சல்|உணவு விஷ|வெறிநாய்|சுகாதார சீர்கேடு|நோய் பரவ/i],
  ["water", /\b(flood\w*|inundat\w*|waterlog\w*|heavy rain\w*|downpour|cyclone|depression|surplus|cusecs|release[sd]? water|water release|discharge|reservoir|lake (?:breach|full|overflow)|breach|overflow\w*|poondi|chembarambakkam|puzhal|kosasthalaiyar|araniyar|palar|adyar river|cooum)\b|வெள்ள|கனமழை|பலத்த மழை|புயல்|உபரி நீர்|நீர் திறப்பு|திறந்து விட|ஏரி உடை|கரை உடை|நிரம்பி|தாழ்வான பகுதி/i],
  ["hazard", /\b(gas leak|ammonia|oil spill|chemical|toxic|effluent|pollut\w*|fire|blaze|explosion|blast|burst|smoke|factory fire|firecracker)\b|வாயு கசிவு|தீ விபத்து|தீப்பிடி|வெடி|மாசு|ரசாயன|கழிவு நீர் கலப்பு/i],
  ["order", /\b(murder\w*|clash\w*|riot\w*|communal|gang\w*|rowdy|hooch|illicit (?:liquor|arrack)|spurious liquor|ganja|drugs?|narcotic\w*|protest\w*|agitation|bandh|road roko|strike|stabbed|hacked|robbery|chain snatch\w*|attack\w*|tension)\b|கொலை|மோதல்|கலவரம்|கள்ளச்சாராய|கஞ்சா|போதை|போராட்ட|ஆர்ப்பாட்ட|மறியல்|வேலைநிறுத்த|ரவுடி|வெட்டி|பதற்ற|கொள்ளை/i],
  ["transport", /\b(accident|collision|crash\w*|lorry|bus (?:strike|services?)|trains? (?:cancel\w*|diverted|partially)|derail\w*|traffic diversion|diversion|highway|nh-?\d+|gst road|toll plaza|bridge (?:closed|collapse\w*)|supply disrupt\w*|shortage)\b|விபத்து|மோதி|ரயில்.{0,12}ரத்து|ரத்து|போக்குவரத்து|நெரிசல்|தட்டுப்பாடு/i],
  ["civic", /\b(drinking water|water supply|power cut|power outage|outage|garbage|sewage|drain\w*|potholes?|stray dogs?)\b|குடிநீர்|மின்தடை|மின் தடை|குப்பை|கழிவுநீர்|தெருநாய்/i]
];
export const topicOf = (t: string): Topic => TOPICS.find(([, re]) => re.test(t))?.[0] ?? "other";

/** Never news for this page: prices, festivals, elections, appointments, school events, features. */
const NOISE = /\b(price in|on-road price|bikewale|carwale|gold (?:rate|price)|silver rate|rasi ?palan|horoscope|kolu|navaratri|brahmotsavam|temple car|darshan|by-?polls?|bye-?election|polling|counting of votes|election result|wins? .{0,30}seat|candidate|real estate|plots? for sale|admission|recruitment|job|results? declared|exam|marathon|tournament|cricket|film|movie|actor|actress|webinar|award|inaugurat\w*|launch\w*|felicitat\w*|wedding|weather today)\b|கொலு|நவராத்திரி|பிரம்மோற்சவ|தரிசனம்|இடைத்தேர்தல்|வாக்கு எண்ணிக்கை|வாக்குப்பதிவு|வேட்பாளர்|திரைப்பட|நடிகை|நடிகர்|இன்று இனிதாக|ராசி|தங்கம் விலை|திருமண|வேலைவாய்ப்பு|சேர்க்கை|திறந்து வைத்தார்|தொடங்கி வைத்தார்/i;
const CHENNAI = /\bchennai\b|சென்னை/i;
/** Disease news that is not about an outbreak: films "post-COVID", pandemic-era stories, health tips. */
const NOT_OUTBREAK = /\b(box office|post-?covid|pre-?covid|during covid|covid-?era|cover-?up|lockdown memories|flu shots?|tips|how to|explained|fever grips|garba|chennai metro)\b|சென்னை மெட்ரோ|தற்காத்து கொள்வது எப்படி/i;
/** A figure of three or more digits ("21,655 cases") that two headlines share: the same report, whatever the wording or language. */
const bigNumbers = (t: string) => new Set((t.match(/\d{1,3}(?:,\d{3})+|\d{3,}/g) ?? []).map((x) => x.replace(/,/g, "")).filter((x) => !/^20\d\d$/.test(x)));

/** Prepare: an outbreak, water let out upstream or flooding, a leak or blast; watch: the rest of the risk topics. */
export function levelOf(topic: Topic, title: string, reports: number): Level {
  if (topic === "health" && (/\b(outbreak|surge|spread\w*|cases (?:rise|up|spike)|deaths?|died|cholera|bird flu|avian|covid|nipah|h1n1|epidemic)\b|பரவ|பலி|உயிரிழ|அதிகரிப்பு/i.test(title) || reports >= 3)) return "prepare";
  if (topic === "water" && /\b(surplus|cusecs|release|discharge|flood\w*|breach|inundat\w*|cyclone|red alert|orange alert)\b|உபரி|திறப்பு|வெள்ள|புயல்|உடை/i.test(title)) return "prepare";
  if (topic === "hazard" && /\b(gas leak|ammonia|oil spill|explosion|blast|toxic)\b|வாயு கசிவு|வெடி/i.test(title)) return "prepare";
  if (topic === "order" && /\b(hooch|spurious liquor|illicit liquor|communal|riot\w*|clash\w*|tension)\b|கள்ளச்சாராய|கலவர|மோதல்|பதற்ற/i.test(title)) return "prepare";
  return topic === "other" ? "note" : "watch";
}
export type Level = "prepare" | "watch" | "note";

/** What it could mean for Chennai and what to do, when no model wrote it. `{zones}` = the border zones. */
const STANDARD: Record<Topic, { why: string; step: string }> = {
  health: { why: "People travel daily between {d} and Chennai, so a disease there can reach the city.", step: "Ask GCC Health to step up fever surveillance and vector control in {zones}." },
  water: { why: "Rain and water released upstream in {d} flow into Chennai's rivers and lakes.", step: "Ask WRD and GCC to check low-lying streets, river mouths and pumps in {zones}." },
  hazard: { why: "Smoke, gas or polluted water can drift across the border.", step: "Ask TNPCB to check air and water readings in {zones}." },
  order: { why: "Trouble near the border can spill into Chennai or draw crowds here.", step: "Ask Greater Chennai Police to keep watch at border check-posts near {zones}." },
  transport: { why: "Traffic, trains or supplies into Chennai may be held up.", step: "Ask Traffic Police and MTC to plan diversions and inform commuters." },
  civic: { why: "Shared water, power and waste services may be affected in Chennai too.", step: "Ask the department concerned whether Chennai's supply is affected." },
  other: { why: "For awareness.", step: "No action needed." }
};

// --------------------------------------------------------------- feeds --

interface Raw { title: string; publisher: string; url: string; t: string; lang: "en" | "ta"; q: string }
interface Saved { fetchedAt: number; items: Raw[]; error: string | null }
const FILE = path.join(process.cwd(), "data", "aws-cache", "nearby-news.json");
const UA = "DistrictIQ/1.0 (Chennai Collector dashboard; reads Google News search feeds once an hour)";
const EVERY_MS = 60 * 60_000;
const ED = { en: "hl=en-IN&gl=IN&ceid=IN:en", ta: "hl=ta&gl=IN&ceid=IN:ta" };

const or = (xs: string[]) => xs.map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(" OR ");
const HEALTH_EN = "dengue OR fever OR cholera OR outbreak OR diarrhoea OR jaundice OR flu OR covid OR typhoid OR \"food poisoning\" OR \"bird flu\"";
const HEALTH_TA = "டெங்கு OR காய்ச்சல் OR காலரா OR கொரோனா OR \"மஞ்சள் காமாலை\" OR வயிற்றுப்போக்கு OR தொற்று";
/** The searches: each district's name and main towns, then disease news in any of them. */
export const QUERIES: { lang: "en" | "ta"; q: string }[] = [
  ...DISTRICTS.flatMap((d) => [
    { lang: "en" as const, q: `${or(d.en.slice(0, 9))} when:7d` },
    { lang: "ta" as const, q: `${or(d.tamil.slice(0, 6))} when:7d` }
  ]),
  { lang: "en", q: `(${HEALTH_EN}) (${or(DISTRICTS.flatMap((d) => d.en.slice(0, 3)))}) when:7d` },
  { lang: "ta", q: `(${HEALTH_TA}) (${or(DISTRICTS.map((d) => d.tamil[0]))}) when:7d` }
];

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const unent = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(1).replace(/^x/i, ""), /^#x/i.test(e) ? 16 : 10)) : ENT[e.toLowerCase()] ?? m);
/** "2026-10-12 08:57:00", IST. */
const ist = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");

/** The items of one Google News feed. */
export function parseFeed(xml: string, lang: "en" | "ta", query: string): Raw[] {
  const out: Raw[] = [];
  for (const it of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const get = (tag: string) => unent(it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? "").trim();
    const publisher = get("source");
    let title = get("title");
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -publisher.length - 3);
    const t = Date.parse(get("pubDate"));
    if (!title || !Number.isFinite(t)) continue;
    out.push({ title: title.replace(/\s+/g, " ").trim(), publisher: publisher || "News", url: get("link"), t: ist(t), lang, q: query });
  }
  return out;
}

declare global {
  // eslint-disable-next-line no-var
  var __nearby: { saved: Saved | null; loading: Promise<void> | null } | undefined;
}
const G = (global.__nearby ??= { saved: null, loading: null });

function saved(): Saved {
  if (G.saved) return G.saved;
  try { G.saved = JSON.parse(fs.readFileSync(FILE, "utf8")) as Saved; } catch { G.saved = { fetchedAt: 0, items: [], error: null }; }
  return G.saved!;
}

async function refresh() {
  const items: Raw[] = [];
  let failed = 0;
  for (const { lang, q: query } of QUERIES) {
    try {
      const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${ED[lang]}`,
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      items.push(...parseFeed(await r.text(), lang, query));
    } catch (e) {
      failed++;
      console.warn(`[nearby] ${lang} "${query.slice(0, 40)}": ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const old = saved();
  // nothing came back: keep the last news, and try again in a quarter of an hour
  const next: Saved = failed === QUERIES.length
    ? { ...old, fetchedAt: Date.now() - EVERY_MS + 15 * 60_000, error: "The news feeds could not be reached." }
    : { fetchedAt: Date.now(), items, error: failed ? `${failed} of ${QUERIES.length} searches failed.` : null };
  G.saved = next;
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(next)); } catch { /* read-only disk */ }
}

/** The saved news, read again from the feeds when it is an hour old (the first visit waits; later ones never do). */
async function feed(): Promise<Saved> {
  const s = saved();
  if (Date.now() - s.fetchedAt > EVERY_MS && !G.loading) G.loading = refresh().finally(() => { G.loading = null; });
  if (!s.items.length && G.loading) await G.loading;
  return saved();
}

// ------------------------------------------------------------- events --

export interface Report { title: string; publisher: string; url: string; t: string; lang: string }
export interface NearbyEvent {
  id: string; district: string; topic: Topic; level: Level;
  /** English headline (the AI's translation for Tamil-only news) and the headline as published */
  title: string; original: string | null;
  why: string; step: string; first: string; last: string; reports: Report[]; outlets: number;
  /** written by AI (else the rules' standard text) */
  ai: boolean;
}
export interface DistrictView {
  key: string; name: string; ta: string; dir: string; zones: { no: number; name: string }[];
  events: NearbyEvent[]; summary: string | null;
}
export interface Nearby {
  fetchedAt: string | null; error: string | null; days: number; model: string | null;
  districts: DistrictView[];
  /** the events to prepare for or watch, across districts, most serious and newest first */
  watch: NearbyEvent[];
}

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const words = (t: string) => new Set(norm(t).split(" ").filter((w) => w.length > 2));
const jaccard = (a: Set<string>, b: Set<string>) => {
  let x = 0;
  for (const k of a) if (b.has(k)) x++;
  return x / Math.max(1, a.size + b.size - x);
};

interface Draft { district: string; topic: Topic; reports: Report[]; w: Set<string>; big: Set<string> }

/** Headlines -> events: placed, de-noised, the same headline from several outlets folded. Exported for the tests. */
export function draftEvents(items: Raw[], chennaiTitles: Set<string>, nowIst: string, days = 7): Draft[] {
  const since = ist(Date.parse(nowIst.replace(" ", "T") + "+05:30") - days * 864e5);
  const seen = new Set<string>();
  const out: Draft[] = [];
  for (const r of [...items].sort((a, b) => a.t.localeCompare(b.t))) {
    if (r.t < since || NOISE.test(r.title)) continue;
    const n = norm(r.title);
    if (chennaiTitles.has(n)) continue; // on Chennai's own pages already
    const d = districtOf(r.title);
    const topic = topicOf(r.title);
    if (topic === "health" && NOT_OUTBREAK.test(r.title)) continue;
    if (!d) continue;
    // Chennai's own news that mentions a nearby town ("Chennai Metro's Poonamallee stretch") is not nearby news
    if (CHENNAI.test(r.title) && (topic === "other" || topic === "civic")) continue;
    const key = `${n}|${r.publisher}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const district = d.name;
    const rep: Report = { title: r.title, publisher: r.publisher, url: r.url, t: r.t, lang: r.lang };
    const w = words(r.title), big = bigNumbers(r.title);
    const same = out.find((e) => e.district === district && e.topic === topic &&
      (norm(e.reports[0].title) === n || jaccard(e.w, w) >= 0.5 || [...big].some((x) => e.big.has(x))));
    if (same) { same.reports.push(rep); big.forEach((x) => same.big.add(x)); }
    else out.push({ district, topic, reports: [rep], w, big });
  }
  return out;
}

// ------------------------------------------------------------------ AI --

// every field is required (strict JSON-schema providers refuse optional ones); an irrelevant event leaves the text empty and
// topic and level "none", so the answer stays short
const AiSchema = z.object({
  summary: z.string().describe("1 or 2 sentences: what is happening in this district that matters for Chennai; empty if nothing does"),
  events: z.array(z.object({
    e: z.number().describe("the E number"),
    same_as: z.number().describe("the E number of an earlier event that is the same real-world event, else 0"),
    relevant: z.boolean().describe("true if it could reach or affect Chennai, or calls for a precaution in Chennai"),
    title: z.string().describe("a plain English headline, at most 14 words; empty when not relevant"),
    topic: z.enum(["health", "water", "hazard", "order", "transport", "civic", "other", "none"]),
    level: z.enum(["prepare", "watch", "note", "none"]),
    why: z.string().describe("how it could reach or affect Chennai, at most 22 words; empty when not relevant"),
    step: z.string().describe("one precaution for the Chennai administration naming the department, at most 20 words; empty when not relevant")
  }))
});
const SYSTEM = `You brief the District Collector of Chennai on news from a NEIGHBOURING district. The Collector wants to know early what
could cross into Chennai or needs a precaution in Chennai: disease outbreaks (dengue, fever, cholera, flu, COVID, food poisoning,
animal disease), rain, floods and water released from reservoirs and rivers that flow into Chennai (Poondi, Chembarambakkam, Puzhal,
Kosasthalaiyar, Adyar, Cooum), gas leaks, fires and pollution near the border, illicit liquor, clashes and gangs that may spill over,
strikes and road, rail or supply disruption into Chennai, and shortages of water or power that Chennai shares.
For each event E1, E2...: say whether it is the same real-world event as an earlier one (same_as), whether it is relevant to Chennai,
a plain English headline (translate Tamil), its topic, and a level: "prepare" (likely to reach Chennai soon or already serious: an
outbreak, water let out upstream, a leak), "watch" (could affect Chennai), "note" (relevant but minor). Not relevant: personal
tragedies and family disputes, local crime with no wider risk, temple festivals, politics and elections, inaugurations, new services
and passenger numbers, prices, school events, features, and news about Chennai itself. why: how it could reach or affect Chennai. step: one precaution for the Chennai administration, naming the
department (GCC Health, Greater Chennai Police, WRD, TNPCB, CMWSSB, Traffic Police). For an event that is not relevant, leave
title, why and step empty and set topic and level to "none". Use only the facts in the headlines: never add a number, place or name that is not given. Plain formal
English, no markdown.`;

interface Built { events: NearbyEvent[]; summary: string | null; model: string | null }

const fill = (s: string, d: string, zones: string) => s.replace("{d}", d).replace("{zones}", zones || "the border zones");

function standard(dr: Draft, zones: string, k: number): NearbyEvent {
  const reports = [...dr.reports].sort((a, b) => b.t.localeCompare(a.t));
  // an English headline names the event; Tamil-only news keeps its own headline
  const en = reports.find((r) => r.lang === "en");
  const s = STANDARD[dr.topic];
  return {
    id: `${dr.district}-${k}-${norm(reports[0].title).slice(0, 24)}`, district: dr.district, topic: dr.topic,
    level: levelOf(dr.topic, reports.map((r) => r.title).join(" "), new Set(reports.map((r) => r.publisher)).size),
    title: (en ?? reports[0]).title, original: en ? null : reports[0].title,
    why: fill(s.why, dr.district, zones), step: fill(s.step, dr.district, zones),
    first: reports[reports.length - 1].t, last: reports[0].t, reports, outlets: new Set(reports.map((r) => r.publisher)).size, ai: false
  };
}

async function explain(district: string, drafts: Draft[], zones: string, user: string): Promise<Built> {
  const base = drafts.map((d, k) => standard(d, zones, k));
  // risk topics first, newest first; "other" only as room allows (the model may still find it relevant)
  const pick = base.map((e, k) => ({ e, k })).sort((a, b) => Number(a.e.topic === "other") - Number(b.e.topic === "other") || b.e.last.localeCompare(a.e.last)).slice(0, 32);
  if (!pick.length) return { events: [], summary: null, model: null };
  const facts = `District: ${district} (borders Chennai's ${zones || "border zones"}).\n` + pick.map(({ e }, j) =>
    `E${j + 1} | ${when(e.last)} | ${e.outlets} outlet${e.outlets > 1 ? "s" : ""} | ${e.reports.slice(0, 2).map((r) => r.title).join(" || ")}`).join("\n");
  const r = await aiJson({ kind: "nearby4", system: SYSTEM, facts, schema: AiSchema, user, temperature: 0, maxOutputTokens: 4000,
    text: (o) => [o.summary ?? "", ...o.events.filter((x) => x.relevant).flatMap((x) => [x.title ?? "", x.why ?? "", x.step ?? ""])].join(" "),
    ok: (o) => o.events.length > 0 });
  if (!r) return { events: base.filter((e) => e.topic !== "other"), summary: null, model: null };
  const out = new Map<number, NearbyEvent>();
  for (const x of [...r.o.events].sort((a, b) => a.e - b.e)) {
    const p = pick[x.e - 1];
    if (!p) continue;
    const target = x.same_as && x.same_as > 0 && x.same_as < x.e ? out.get(x.same_as) : undefined;
    if (target) { // the same event in another language or under another headline
      target.reports = [...target.reports, ...p.e.reports].sort((a, b) => b.t.localeCompare(a.t));
      target.outlets = new Set(target.reports.map((y) => y.publisher)).size;
      target.first = target.reports[target.reports.length - 1].t;
      target.last = target.reports[0].t;
      continue;
    }
    if (!x.relevant) continue;
    const topic: Topic = x.topic && x.topic !== "none" ? x.topic : p.e.topic;
    let level: Level = x.level && x.level !== "none" ? x.level : levelOf(topic, p.e.title, p.e.outlets);
    // delays and shortages are to watch; "prepare" is for what can cross the border: disease, water, a leak, unrest
    if (level === "prepare" && (topic === "transport" || topic === "civic" || topic === "other")) level = "watch";
    out.set(x.e, { ...p.e, title: x.title?.trim() || p.e.title, original: p.e.reports.find((y) => y.lang !== "en")?.title ?? null, topic,
      level, why: x.why?.trim() || p.e.why, step: x.step?.trim() || p.e.step, ai: true });
  }
  // the same event under two English titles the model did not join ("EMU trains partially cancelled" twice)
  const events: NearbyEvent[] = [];
  for (const e of out.values()) {
    const w = words(e.title);
    const same = events.find((x) => x.topic === e.topic && jaccard(words(x.title), w) >= 0.45);
    if (!same) { events.push(e); continue; }
    same.reports = [...same.reports, ...e.reports].sort((a, b) => b.t.localeCompare(a.t));
    same.outlets = new Set(same.reports.map((y) => y.publisher)).size;
    same.first = same.reports[same.reports.length - 1].t;
    same.last = same.reports[0].t;
    if (RANK[e.level] < RANK[same.level]) same.level = e.level;
  }
  return { events, summary: r.o.summary?.trim() || null, model: r.model };
}

// -------------------------------------------------------------- Chennai --

/** Chennai's news headlines of the last three weeks (normalised): nearby news that Chennai's pages already carry is left out. */
async function chennaiTitles(now: string): Promise<Set<string>> {
  const rows = await q(`SELECT title, title_en FROM documents WHERE source_kind = 'news' AND is_district = 1 AND published_at > (? - INTERVAL 21 DAY)`, [now])
    .catch(() => [] as Row[]);
  return new Set(rows.flatMap((r) => [r.title, r.title_en]).filter(Boolean).map((t) => norm(String(t))));
}

// ----------------------------------------------------------------- page --

const RANK: Record<Level, number> = { prepare: 0, watch: 1, note: 2 };
const V = 4;
declare global {
  // eslint-disable-next-line no-var
  var __nearbyView: { key: string; at: number; v: Nearby } | undefined;
}

/** "Next door": each district's news of the last 7 days that matters for Chennai, and what to prepare for or watch. */
export async function nearby(now: string, user: string): Promise<Nearby> {
  const s = await feed();
  const key = `${V}|${s.fetchedAt}|${now.slice(0, 13)}`;
  if (global.__nearbyView?.key === key && Date.now() - global.__nearbyView.at < 30 * 60_000) return global.__nearbyView.v;

  const [titles, zoneRows] = await Promise.all([
    chennaiTitles(now),
    q(`SELECT zone_no, zone_name FROM ref_zones`).catch(() => [] as Row[])
  ]);
  const zoneName = new Map(zoneRows.map((z) => [Number(z.zone_no), String(z.zone_name)]));
  const drafts = draftEvents(s.items, titles, now, 7);

  let model: string | null = null;
  // one district at a time: the free AI tiers allow few tokens a minute
  const views: DistrictView[] = [];
  for (const d of DISTRICTS) {
    const zones = d.zones.map((no) => ({ no, name: zoneName.get(no) ?? `Zone ${no}` }));
    const built = await explain(d.name, drafts.filter((x) => x.district === d.name), zones.map((z) => z.name).join(", "), user);
    model ??= built.model;
    const events = built.events.sort((a, b) => RANK[a.level] - RANK[b.level] || b.last.localeCompare(a.last));
    views.push({ key: d.key, name: d.name, ta: d.ta, dir: d.dir, zones, events, summary: built.summary });
  }
  const watch = views.flatMap((v) => v.events).filter((e) => e.level !== "note")
    .sort((a, b) => RANK[a.level] - RANK[b.level] || b.outlets - a.outlets || b.last.localeCompare(a.last));
  const v: Nearby = { fetchedAt: s.fetchedAt ? ist(s.fetchedAt) : null, error: s.error, days: 7, model, districts: views, watch };
  // without a model, try again in 5 minutes rather than 30
  global.__nearbyView = { key, at: model ? Date.now() : Date.now() - 25 * 60_000, v };
  return v;
}

// -------------------------------------------------------------- detail --

export interface NearbyDetail {
  id: string;
  /** what happened, in 2 or 3 sentences */
  what: string;
  /** Where, When, Affected, Action taken: only those the reports state */
  facts: { label: string; text: string }[];
  why: string; step: string;
  /** stored report text it was read from: outlet and the first lines */
  texts: { publisher: string; text: string }[];
  ai: boolean;
}

const DetailSchema = z.object({
  what: z.string().describe("2 or 3 plain sentences: what happened, to whom, where and when, from the reports only"),
  where: z.string().describe("the exact localities named (villages, towns, roads, a factory), not just the district; empty if none"),
  when: z.string().describe("when it happened or is expected, as the reports say it; empty if not stated"),
  affected: z.string().describe("the people or things affected and how many, e.g. '2 workers died', '300 families moved'; NOT a place; empty if not stated"),
  action: z.string().describe("what officials have done, e.g. 'schools closed', '3 arrested', 'water released'; empty if the reports do not say")
});
const DETAIL_SYSTEM = `You brief the District Collector of Chennai on ONE event in a neighbouring district, from several news reports of
it (headlines in English or Tamil, and the text of some reports). Write what happened in 2 or 3 plain sentences, then the place,
the time, who and how many are affected, and what the officials have done, each only if the reports state it: leave a field empty
rather than repeat the district or write a general word. Use only the facts in the reports: never add a number, place, name or
cause that is not given. Translate Tamil into English. Plain formal English, no markdown.`;

/** Stored news (the news monitor's documents) with the same headline as one of the event's reports: its text. */
async function storedTexts(e: NearbyEvent, now: string): Promise<{ publisher: string; text: string }[]> {
  const rows = await q(
    `SELECT title, title_en, publisher, summary, SUBSTR(body, 1, 1400) AS body FROM documents
     WHERE source_kind = 'news' AND published_at > (? - INTERVAL 10 DAY)`, [now]).catch(() => [] as Row[]);
  const want = e.reports.map((r) => words(r.title));
  const out: { publisher: string; text: string }[] = [];
  for (const r of rows) {
    const text = String(r.body || r.summary || "").replace(/\s+/g, " ").trim();
    if (text.length < 60) continue;
    const w = [r.title, r.title_en].filter(Boolean).map((t) => words(String(t)));
    if (!w.some((x) => want.some((y) => jaccard(x, y) >= 0.6))) continue;
    if (out.some((o) => o.text.slice(0, 120) === text.slice(0, 120))) continue;
    out.push({ publisher: String(r.publisher ?? "News"), text });
    if (out.length >= 3) break;
  }
  return out;
}

/** First sentences of a text, up to about `max` characters. */
const firstLines = (t: string, max: number) => {
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("। "));
  return end > max / 3 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
};

/** One "Next door" event, clicked: what happened, from every outlet's report of it. */
export async function nearbyDetail(id: string, now: string, user: string): Promise<NearbyDetail | null> {
  const view = await nearby(now, user);
  const e = view.districts.flatMap((d) => d.events).find((x) => x.id === id);
  if (!e) return null;
  const texts = (await storedTexts(e, now)).map((t) => ({ ...t, text: firstLines(t.text, 700) }));
  const input = `District: ${e.district}. Event: ${e.title}.\n` +
    e.reports.slice(0, 10).map((r, k) => `H${k + 1} | ${when(r.t)} | ${r.publisher} | ${r.title}`).join("\n") +
    (texts.length ? "\n" + texts.map((t, k) => `TEXT${k + 1} (${t.publisher}): ${t.text}`).join("\n") : "");
  const r = await aiJson({ kind: "nearby-detail2", system: DETAIL_SYSTEM, facts: input, schema: DetailSchema, user, temperature: 0, maxOutputTokens: 900,
    text: (o) => [o.what, o.where, o.when, o.affected, o.action].join(" "), ok: (o) => o.what.trim().length > 20 });
  if (!r) {
    // no model: the stored text as it is, else the reports' headlines say what happened
    return { id, what: "", facts: [], why: e.why, step: e.step, texts, ai: false };
  }
  const o = r.o;
  const list: [string, string][] = [["Where", o.where], ["When", o.when], ["Affected", o.affected], ["Action taken", o.action]];
  // a fact worth a box: two words or more, not "none", and not the place again ("Affected: Kancheepuram district")
  const seen: string[] = [];
  const facts = list.map(([label, text]) => ({ label, text: text.trim().replace(/\.$/, "") })).filter((f) => {
    const k = norm(f.text);
    if (k.split(" ").length < 2 || /^(none|not stated|not mentioned|unknown|n a|no information)\b/.test(k)) return false;
    if (seen.some((x) => x === k || x.includes(k) || k.includes(x))) return false;
    seen.push(k);
    return true;
  });
  // why it matters and the precaution stay the list's (written with the other events of the district in view)
  return { id, what: o.what.trim(), facts, why: e.why, step: e.step, texts, ai: true };
}
