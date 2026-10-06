/**
 * "Locations needing review" (Trends page): open incidents the map cannot show because nobody knows where they
 * happened. An incident with no zone is not listed when its place is known after all, or is not needed:
 *
 *   district   about the district as a whole: IMD warnings, and city-wide news (dengue totals, power-cut schedules,
 *              reservoir storage, drives, camps and announcements) that is not about one spot;
 *   located    its own coordinates are within 2.5 km of a GCC ward, or its place text or headline names a known
 *              Chennai locality, zone or taluk: the zone is found;
 *   outside    its coordinates are beyond the corporation's wards, or its headline places it in a town outside
 *              Chennai district (Mangadu, Tambaram, Tiruttani...);
 *   missing    what is left: a specific event (a murder, an accident, a fire, a complaint about one road) reported
 *              only as "in Chennai", or under a place name the map does not know. These are listed.
 *
 * Rules only; every verdict says how it was reached.
 */
import type { Placed } from "@/lib/collector/nlp";

type Row = Record<string, any>;
export type LocKind = "missing" | "district" | "located" | "outside";
export interface LocVerdict { kind: LocKind; how: string; place?: string | null; zone?: number | null }
export interface Ward { ward_no: number; zone_no: number; lat: number; lon: number }

/** The point the news monitor gives a report it could only place "in Chennai". */
const CITY = { lat: 13.0827, lon: 80.2707 };
const GENERIC = /^\s*(chennai|chennai district|chennai city|greater chennai|tamil ?nadu|tn|india)?\s*$/i;

// A specific happening at one place: deaths, injuries, crime, accidents, fires, collapses, protests, rescues.
const EVENT_EN = new RegExp(
  "\\b(kill(ed|s|ing)?|murder\\w*|hack(ed)?|dead|dies|died|death|bod(y|ies)|corpse|injur\\w*|hurt|accident|crash(ed|es)?|collid\\w*|" +
  "run over|fire|blaze|ablaze|gutted|explosion|blast|collaps\\w*|cave[sd]?[ -]?in|sinkhole|arrest\\w*|held|nabbed|detained|booked|" +
  "stabb?\\w*|attack\\w*|assault\\w*|rob(bed|bery|bers?)|theft|thie(f|ves)|stole\\w*|snatch\\w*|loot\\w*|burglar\\w*|drown\\w*|suicide|" +
  "hanged|electrocut\\w*|protest\\w*|road roko|blockade|clash\\w*|riot\\w*|seiz\\w*|raid\\w*|rape\\w*|molest\\w*|abduct\\w*|" +
  "kidnap\\w*|missing|rescued|bitten|mauled|uprooted|waterlogg\\w*|inundat\\w*|flooded|overflow\\w*|burst|fraud|cheat\\w*|stunts?|" +
  "bike rac\\w*|unsafe|stagnat\\w*|pothole\\w*|exposed|locked|encroach\\w*)\\b", "i");
const EVENT_TA = /கொலை|கொல்ல|பலி|உயிரிழ|சடலம்|பிணம்|விபத்து|மோதி|தீப்பிடித்|எரிந்து|காயம்|கைது|திருட்டு|கொள்ளை|வழிப்பறி|தற்கொலை|தூக்கு|மறியல்|போராட்ட|ஆர்ப்பாட்ட|முற்றுகை|மூழ்கி|பறிமுதல்|மோசடி|தாக்கி|தாக்குதல்|வெட்டி|கடத்த|காணவில்லை|மீட்பு|இடிந்து|பள்ளம்|பாலியல்|வன்கொடுமை|சாகசம்|ரேஸ்|புகார்|அவதி|தேங்கி|கழிவுநீர் கலப்ப/;

// About the city as a whole: totals and trends, schedules, storage, drives, camps, announcements, warnings, opinion.
const TOPIC_EN = new RegExp(
  "\\b(cases?|dengue|fever|power (cut|shutdown|outage)s?|outages|vaccinat\\w*|awareness|campaign|drives?|camps?|scheme|launch\\w*|" +
  "introduc\\w*|inaugurat\\w*|tender|budget|apprentice\\w*|recruit\\w*|training|forecast|alert|advisory|warnings?|storage|reservoirs?|" +
  "water (level|scarcity|shortage)|latest news today|live updates|statistics|survey|prevention|control measures|steps up|" +
  "intensif\\w*|across (the )?(city|chennai)|city-?wide|public opinion|slams|criticis\\w*|(to|will) be held)\\b", "i");
const TOPIC_TA = /முழுவதும்|பல்வேறு பகுதிகளில்|பகுதிகளில்|மின்தடை|மின் தடை|மின்சாரத் தடை|நீர் இருப்பு|பாதிப்பு அதிகரி|பாதிப்பு இரு|மடங்கு|முகாம்|தடுப்பூசி|விழிப்புணர்வு|எச்சரிக்கை|அறிவிப்பு|அறிமுகம்|திட்டம்|பயிற்சி|விமர்சனம்|கண்டனம்|ஏற்பாடுகள்|தட்டுப்பாடு|பரவல்|அச்சம்|விலை|கட்டண/;

// Towns around Chennai that are not in Chennai district, and other districts and states, as a headline names them.
const OUT_EN = new RegExp(
  "\\b(Mangadu|Pallavaram|Tambaram|Chromepet|Pammal|Anakaputhur|Pattabiram|Avadi|Thirumullaivoyal|Poonamallee|Thiruverkadu|" +
  "Kundrathur|Tiruttani|Thiruttani|Periyapalayam|Ponneri|Gummidipoondi|Minjur|Sholavaram|Guduvanchery|Urapakkam|Vandalur|" +
  "Kelambakkam|Siruseri|Thiruporur|Medavakkam|Selaiyur|Madambakkam|Perungalathur|Iyyappanthangal|Thirumazhisai|Maraimalai ?Nagar|" +
  "Thirunindravur|Tirunindravur|Sriperumbudur|Oragadam|Padappai|Tiruvallur|Thiruvallur|Kancheepuram|Kanchipuram|Chengalpattu|" +
  "Mamallapuram|Mahabalipuram|Madurai|Coimbatore|Tiruchi|Trichy|Salem|Tirunelveli|Nellai|Vellore|Erode|Thoothukudi|Thanjavur|" +
  "Cuddalore|Villupuram|Puducherry|Pondicherry|Bengaluru|Bangalore|Hyderabad|Kerala|Karnataka|Andhra|Ulundurpet|Thiruneermalai)\\b", "i");
const OUT_TA = /உளுந்தூர்பேட்|திருநீர்மலை|மாங்காட்|பல்லாவர|தாம்பர|குரோம்பேட்ட|பம்மல்|அனகாபுத்தூ|பட்டாபிரா|ஆவடி|திருமுல்லைவாய|பூந்தமல்ல|திருவேற்கா|குன்றத்தூ|திருத்தணி|பெரியபாளைய|பொன்னேரி|கும்மிடிப்பூண்டி|மீஞ்சூ|சோழவர|கூடுவாஞ்சேரி|ஊரப்பாக்க|வண்டலூ|கேளம்பாக்க|சிறுசேரி|திருப்போரூ|மேடவாக்க|சேலையூ|பெருங்களத்தூ|ஐயப்பன்தாங்க|திருமழிசை|மறைமலை|திருநின்றவூ|ஸ்ரீபெரும்புதூ|திருவள்ளூ|காஞ்சிபுர|செங்கல்பட்ட|மாமல்லபுர|மதுரை|கோவை|திருச்சி|சேலம|நெல்லை|வேலூ|புதுச்சேரி|பெங்களூ|கேரள/;

// A daily round-up lists many unrelated items: it is not one event.
const ROUNDUP = /latest news today|news today live|live updates|top news|news highlights|headlines today|#gallery/i;

// Chennai places a headline names that the map's gazetteer knows only by another name: a landmark, a road, or a
// locality's Tamil spelling. Each points to a gazetteer place, which gives the zone.
const LANDMARKS: [RegExp, string][] = [
  [/பெரியமேட|periyamet|periamet/i, "Periamet"],
  [/ரெட்டேரி|retteri/i, "Kolathur"],
  [/\bchennai airport\b|சென்னை விமான நிலைய|meenambakkam airport/i, "Meenambakkam"],
  [/ராஜாஜி சாலை|\brajaji salai\b|\bnscb(ose)? road\b/i, "Parrys"],
  [/தலைமை ?செயலக|\bsecretariat\b|fort st\.? george/i, "George Town"],
  [/\bpaper mills? road\b/i, "Perambur"],
  [/\bcentral station\b|சென்ட்ரல் ரயில்/i, "Park Town"],
  [/\bkoyambedu market\b|கோயம்பேடு சந்தை/i, "Koyambedu"],
  [/\banna salai\b|\bmount road\b|அண்ணா ?சாலை/i, "Thousand Lights"],
  [/\b(chennai )?fort (railway )?station\b|கோட்டை ரயில் நிலைய|கோட்டை ரெயில் நிலைய/i, "George Town"],
  [/\bchennai port\b|சென்னை துறைமுக/i, "Royapuram"],
  [/\brajarathinam stadium\b|ராஜரத்தினம் ஸ்டேடிய|ராஜரத்தினம் மைதான/i, "Egmore"],
  [/\bgovt\.? general hospital\b|\brajiv gandhi government general hospital\b|\bgh\b|அரசு பொது மருத்துவமனை/i, "Park Town"],
  [/எழும்பூ/i, "Egmore"],
  [/மெரினா/i, "Marina Beach"]
];

export const isEvent = (t: string) => EVENT_EN.test(t) || EVENT_TA.test(t);

/** A landmark, road or Tamil spelling the text names, with the gazetteer place it stands for. */
export function landmark(text: string, resolve: (text: string) => Placed | null): { named: string; p: Placed } | null {
  for (const [re, name] of LANDMARKS) {
    const m = text.match(re);
    const p = m ? resolve(name) : null;
    if (m && p?.zone) return { named: m[0].trim(), p };
  }
  return null;
}
export const isCityTopic = (t: string) => TOPIC_EN.test(t) || TOPIC_TA.test(t);
export function outsidePlace(t: string): string | null {
  return t.match(OUT_EN)?.[0] ?? t.match(OUT_TA)?.[0] ?? null;
}

const km = (aLat: number, aLon: number, bLat: number, bLon: number) =>
  Math.hypot((aLat - bLat) * 111.2, (aLon - bLon) * 111.2 * Math.cos((aLat * Math.PI) / 180));

function nearestWard(wards: Ward[], lat: number, lon: number) {
  let best: Ward | null = null, bd = Infinity;
  for (const w of wards) {
    const d = km(lat, lon, w.lat, w.lon);
    if (d < bd) { bd = d; best = w; }
  }
  return { ward: best, km: bd };
}

/** Where an open incident with no zone stands: see the file comment. `resolve` finds a known place named in a text. */
export function judgeLocation(i: Row, wards: Ward[], resolve: (text: string) => Placed | null): LocVerdict {
  const sources = String(i.sources ?? "").split("|").filter(Boolean);
  const title = String(i.title ?? "");
  const loc = String(i.loc ?? "").trim();
  const casualties = Number(i.dead ?? 0) > 0 || Number(i.injured ?? 0) > 0;

  if (sources.length && sources.every((s) => s === "imd")) return { kind: "district", how: "IMD warning for the whole district" };

  // 1. its own point, unless it is only the city's centre point
  const lat = Number(i.lat), lon = Number(i.lon);
  const hasPoint = i.lat != null && i.lon != null && Number.isFinite(lat) && Number.isFinite(lon) && km(lat, lon, CITY.lat, CITY.lon) > 0.1;
  if (hasPoint) {
    const n = nearestWard(wards, lat, lon);
    if (n.ward && n.km <= 2.5) return { kind: "located", how: `its map point is ${n.km < 0.5 ? "inside" : `${n.km.toFixed(1)} km from`} ward ${n.ward.ward_no}`, place: loc || null, zone: n.ward.zone_no };
    return { kind: "outside", how: `its map point is ${n.km.toFixed(0)} km beyond the corporation's wards`, place: loc || null };
  }

  // 2. a place given in words
  if (!GENERIC.test(loc)) {
    const p = resolve(loc);
    if (p?.zone) return { kind: "located", how: `"${loc}" is in ${p.place}`, place: p.place, zone: p.zone };
    const out = outsidePlace(loc);
    if (out) return { kind: "outside", how: `"${loc}" is outside Chennai district`, place: out };
  }

  // 3. the headline: a town outside the district, or a known Chennai place (by name, or a landmark or Tamil spelling)
  const out = outsidePlace(title);
  if (out) return { kind: "outside", how: `the headline places it in ${out}, outside Chennai district`, place: out };
  const lm = landmark(title, resolve);
  if (lm) return { kind: "located", how: `the headline names ${lm.named} (${lm.p.place})`, place: lm.p.place, zone: lm.p.zone };
  const p = title ? resolve(title) : null;
  if (p?.zone) return { kind: "located", how: `the headline names ${p.place}`, place: p.place, zone: p.zone };

  // 4. city-wide news is not about one spot
  if (ROUNDUP.test(title)) return { kind: "district", how: "daily news round-up" };
  if (!casualties && isCityTopic(title) && !(isEvent(title) && !TOPIC_STRONG.test(title))) return { kind: "district", how: "city-wide report" };
  if (casualties || isEvent(title)) {
    return { kind: "missing", how: GENERIC.test(loc) ? "only \"Chennai\" is known" : `"${loc}" is not a place on the map`, place: GENERIC.test(loc) ? null : loc };
  }
  return { kind: "district", how: "general news about Chennai" };
}

/** City-wide words that win over an event word in the same headline ("dengue cases rise", "power cut tomorrow"). */
const TOPIC_STRONG = /\b(cases|dengue|power (cut|shutdown)|vaccinat\w*|camps?|drives?|statistics|across|(to|will) be held)\b|டெங்கு|மின்தடை|மின் தடை|முகாம்|முழுவதும்|விமர்சனம்|விலை|கட்டண|\d+\s*(நாள்|days?)/i;

/** One row per headline: the same story filed as two incidents is one thing to review. */
const headKey = (t: string) => t.toLowerCase().replace(/\s*[|–-]\s*[^|–-]{2,32}$/, "").replace(/[^a-z0-9஀-௿]+/g, " ").trim();

/** Every no-zone incident judged; the missing ones listed most important first (one per headline), with counts of the rest. */
export function reviewLocations<T extends Row>(rows: T[], wards: Ward[], resolve: (text: string) => Placed | null) {
  const judged = rows.map((i) => ({ ...i, loc_verdict: judgeLocation(i, wards, resolve) }) as T & { loc_verdict: LocVerdict; also: string[] });
  const by = (k: LocKind) => judged.filter((x) => x.loc_verdict.kind === k);
  const missing: (T & { loc_verdict: LocVerdict; also: string[] })[] = [];
  const seen = new Map<string, T & { also: string[] }>();
  for (const x of by("missing")) {
    const k = headKey(String(x.title ?? x.id));
    const first = seen.get(k);
    if (first) { first.also.push(String(x.id)); continue; }
    x.also = [];
    seen.set(k, x);
    missing.push(x);
  }
  return {
    missing,
    counts: { missing: missing.length, district: by("district").length, located: by("located").length, outside: by("outside").length },
    /** placed after all: zone found from coordinates or a place name (for a check of the pipeline's geocoding) */
    located: by("located").map((x) => ({ id: x.id as string, title: x.title as string, zone: x.loc_verdict.zone ?? null, how: x.loc_verdict.how }))
  };
}
