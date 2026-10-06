/**
 * Which news the Collector's console shows, and how the same news from many outlets is grouped.
 *
 * Relevant: news about something the district administration handles or must know (crime and accidents,
 * protests, water, drains, roads, power cuts, health, rain, works, court orders on the city, government
 * action in Chennai). Left out: company launches and deals, real estate, courses and admissions, films and
 * sport, prices, leaders' statements about other leaders, and events in other districts or states. A report
 * linked to an incident in our records is always kept.
 *
 * Grouping: the monitor already groups one article's copies (story_id), and often files one event as several
 * incidents. Reports about the same event under different headlines, in Tamil and English, are grouped here:
 * their English headlines (Tamil ones through their English translation) share the event's words and read alike
 * (TF-IDF cosine), within three days. Routine notices of one kind (power shutdown schedules, rain and weather
 * updates, dengue counts) form one group each. Rules only; every group lists all its reports.
 */
import { cleanTitle, tokens } from "@/lib/collector/threads";

type Row = Record<string, any>;

// Business, real estate, education, entertainment, prices, lifestyle: not the Collector's business.
const OFF_TOPIC = new RegExp(
  "\\b(launch(es|ed)?|unveil\\w*|subsidiary|ipo|shares?|stocks?|sensex|nifty|investors?|funding|startup|acqui\\w+|revenue|profit|quarterly results|" +
  "secures?|bags?|wins? (a |an )?(contract|order)|(contract|order) worth|" +
  "real estate|realty|apartments?|villas?|plots?|property (prices|market)|housing project|residential project|" +
  "admissions?|courses?|universit(y|ies)|iit|college fest|scholarships?|exams?|results declared|placements?|recruitment|apprentice\\w*|jobs? fair|" +
  "movies?|films?|actor|actress|box office|trailer|ott|kollywood|songs?|concert|cricket|ipl|match|tournament|chess|marathon|" +
  "gold (rate|price)|silver (rate|price)|petrol price|diesel price|fuel price|horoscope|recipe|fashion|lifestyle|travel|tourism|hotels?|restaurants?|" +
  "airlines?|flights? to|offers?|discount|sale|showroom|store opening|brand ambassador|award(s|ed)?|expo|summit|conclave|migratory|birdwatch\\w*)\\b", "i");
const OFF_TOPIC_TA = /திரைப்பட|நடிகர்|நடிகை|படத்தின்|பாடல்|கிரிக்கெட்|தங்கம் விலை|வெள்ளி விலை|ராசி|ஜாதகம்|படிப்புகள்|மாணவர் சேர்க்கை|வேலைவாய்ப்பு|சலுகை|தள்ளுபடி/;
// A real event wins over an off-topic word ("actor killed", "fire at a showroom")
const STRONG_EVENT = /\b(kill\w*|murder\w*|dead|died|death|injur\w*|arrest\w*|fire (broke|accident|mishap)|caught fire|blaze|gutted|collaps\w*|accident|drown\w*|assault\w*|theft|robbery|protest\w*|detain\w*)\b|கொலை|பலி|உயிரிழ|விபத்து|தீ விபத்து|தீப்பிடி|கைது|போராட்ட/i;
// Other states and districts further away. Towns next to Chennai (Tambaram, Poonamallee) stay: their news reaches the city.
const FAR = new RegExp(
  "\\b(haryana|delhi|mumbai|gujarat|rajasthan|bihar|uttar pradesh|west bengal|kolkata|punjab|odisha|assam|telangana|goa|kerala|karnataka|andhra|" +
  "hyderabad|bengaluru|bangalore|mettur|delta districts?|cauvery delta|madurai|coimbatore|tiruchi|trichy|salem|tirunelveli|nellai|vellore|erode|" +
  "thoothukudi|tuticorin|thanjavur|cuddalore|villupuram|puducherry|pondicherry|tiruttani|thiruttani|kanniyakumari|nagapattinam|dindigul|karur|" +
  "namakkal|krishnagiri|dharmapuri|ulundurpet)\\b", "i");
const FAR_TA = /மதுரை|கோவை|திருச்சி|சேலம|நெல்லை|வேலூ|புதுச்சேரி|பெங்களூ|கேரள|திருத்தணி|மேட்டூர்|டெல்டா|தூத்துக்குடி|தஞ்சா|கடலூ|விழுப்புர|உளுந்தூர்பேட்/;
/**
 * The headline places it in another district or state: it names a far place and not Chennai, or Chennai only as one
 * end of a route ("Chennai-Madurai bus overturns near Ulundurpet"). "DRI seizes ... at Chennai Port" stays.
 */
export function elsewhere(english: string, original = ""): boolean {
  if (!FAR.test(english) && !FAR_TA.test(original)) return false;
  const t = `${english} ${original}`.replace(/chennai\s*[-–]\s*\w+|\w+\s*[-–]\s*chennai|சென்னை\s*[-–]\s*\S+/gi, "");
  return !/\bchennai\b|சென்னை/i.test(t);
}

// Leaders' statements about other leaders
const STATEMENT = /\b(condemn\w*|slams?|lashes out|hits out|criticis\w*|backs down|blames?|accus\w*|statement)\b|கண்டனம்|விமர்சனம்|அறிக்கை/i;
const ROUNDUP = /latest news today|news today live|live updates|top news|news highlights|headlines today|#gallery|cases (listed|coming up)|வழக்குகள்\?|இன்றைய முக்கிய செய்திகள்/i;
const NOT_NEWS_TYPES = new Set(["entertainment_sport", "business", "opinion_feature"]);

/** Is this report something the Collector should see? `english` is the headline in English (the translation for Tamil). */
export function relevantNews(d: Row, english: string): boolean {
  const original = String(d.title ?? "");
  // the monitor sometimes links a report from another district to an incident: it still does not belong here
  if (elsewhere(english, original)) return false;
  if (d.linked_incident_id) return true;
  const t = `${original} ${english}`;
  if (ROUNDUP.test(t)) return false;
  const event = STRONG_EVENT.test(t);
  if (NOT_NEWS_TYPES.has(String(d.report_type ?? "")) && !event) return false;
  if ((OFF_TOPIC.test(english) || OFF_TOPIC_TA.test(original)) && !event) return false;
  // a statement about an event is not news of the event
  if (STATEMENT.test(t) && (d.report_type === "politics" || !STRONG_EVENT.test(english.replace(new RegExp(STATEMENT.source, "gi"), "")))) return false;
  return true;
}

// Routine notices: one group per kind
const TOPICS: [string, RegExp][] = [
  ["power", /power (cut|shutdown|outage)|shutdown areas|மின்தடை|மின் தடை|மின்சாரத் தடை/i],
  ["weather", /\b(rain|rains|rainfall|weather|monsoon|imd|forecast|thunderstorm)\b|மழை|வானிலை/i],
  ["dengue", /\bdengue\b|டெங்கு/i]
];
export const topicOf = (english: string, original: string) => TOPICS.find(([, re]) => re.test(english) || re.test(original))?.[0] ?? null;

/** Words that say nothing about which event it is. */
const PLAIN = new Set(["city", "corporation", "gcc", "government", "tamil", "nadu", "special", "team", "update", "breaking", "shock", "shocking",
  "incident", "sensation", "horror", "tragedy", "just", "now", "big", "near", "area", "public", "case", "service", "work", "crime", "cctv", "hospital", "train"]);

export interface NewsGroup { key: string; docs: Row[]; english: string; ms: number; incident: string | null }

/**
 * Groups the monitor's stories that report the same event. `groups` are its stories (documents of one article,
 * newest first), each with its English headline and newest time, and its incident if linked. Returns clusters.
 */
export function clusterNews(groups: NewsGroup[]): NewsGroup[][] {
  const n = groups.length;
  const parent = groups.map((_, k) => k);
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  const join = (a: number, b: number) => { const x = find(a), y = find(b); if (x !== y) parent[Math.max(x, y)] = Math.min(x, y); };

  // English words of every headline in the story (each outlet words it differently)
  const tk = groups.map((g) => [...new Set(g.docs.flatMap((d) => tokens(cleanTitle(String((d.lang !== "en" && d.title_en) || d.title || "")).replace(/bike ?rac(e|ing)s?|rac(e|ing)s?/gi, (m) => (/bike/i.test(m) ? "bike race" : "race")))))]
    .filter((w) => !w.startsWith("ta:") && !PLAIN.has(w)));
  const df = new Map<string, number>();
  for (const t of tk) for (const w of t) df.set(w, (df.get(w) ?? 0) + 1);
  const wt = tk.map((t) => new Map(t.map((w) => [w, Math.log(1 + n / (df.get(w) ?? 1))])));
  const norm = wt.map((m) => Math.hypot(...m.values()) || 1);

  const topics = groups.map((g) => (g.incident ? null : topicOf(g.english, String(g.docs[0]?.title ?? ""))));
  const firstOf = new Map<string, number>();
  for (let a = 0; a < n; a++) {
    // routine notices of one kind, and reports of one incident, are one story
    const key = topics[a] ? `topic:${topics[a]}` : groups[a].incident ? `inc:${groups[a].incident}` : null;
    if (key) { if (firstOf.has(key)) join(firstOf.get(key)!, a); else firstOf.set(key, a); }
    if (topics[a]) continue;
    for (let b = 0; b < a; b++) {
      if (topics[b] || Math.abs(groups[a].ms - groups[b].ms) > 3 * 864e5) continue;
      let dot = 0, shared = 0;
      for (const [w, v] of wt[a]) { const u = wt[b].get(w); if (u) { dot += v * u; shared++; } }
      const cos = dot / (norm[a] * norm[b]);
      // the pipeline often files one event as two incidents: two incidents need a closer match than news alone
      const two = groups[a].incident && groups[b].incident && groups[a].incident !== groups[b].incident;
      if (cos >= (two ? 0.5 : 0.42) || (shared >= 2 && cos >= (two ? 0.3 : 0.22)) || (shared >= 3 && cos >= 0.18)) join(a, b);
    }
  }
  const out = new Map<number, NewsGroup[]>();
  for (let k = 0; k < n; k++) (out.get(find(k)) ?? out.set(find(k), []).get(find(k))!).push(groups[k]);
  return [...out.values()];
}
