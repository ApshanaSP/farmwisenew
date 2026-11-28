/**
 * Ask the Map's words, in English and Tamil: categories, severities, layers, periods and areas. Every chip, trace
 * line, legend entry and answer is built from these, so no label exists in one language only. Tanglish answers use the
 * English words (the Collector types Tanglish in Latin letters). Pure.
 */
import type { Period } from "./plan";
import { dayWords } from "@/lib/period/day";
import type { LayerId, Sev } from "./types";

export type Lang = "en" | "ta" | "tanglish";

/** The 15 GCC zones' names in Tamil (the zone file has English names only): a Tamil answer never prints an English zone name. */
export const ZONE_TA: Record<number, string> = {
  1: "திருவொற்றியூர்", 2: "மணலி", 3: "மாதவரம்", 4: "தண்டையார்பேட்டை", 5: "ராயபுரம்", 6: "திரு.வி.க. நகர்", 7: "அம்பத்தூர்", 8: "அண்ணா நகர்",
  9: "தேனாம்பேட்டை", 10: "கோடம்பாக்கம்", 11: "வளசரவாக்கம்", 12: "ஆலந்தூர்", 13: "அடையாறு", 14: "பெருங்குடி", 15: "சோழிங்கநல்லூர்"
};
export const zoneTa = (zone: number, en: string): string => ZONE_TA[zone] ?? en;
export const isTa = (l: Lang) => l === "ta";

/** Tamil names for the 35 categories (the reference file has English labels only). */
export const CAT_TA: Record<string, string> = {
  FLOOD_WATERLOGGING: "வெள்ளம் & நீர் தேக்கம்", FLOOD_RELIEF: "வெள்ள நிவாரணத் தேவைகள்", WATERBODY_INFRA: "ஏரிகள், கரைகள் & மதகுகள்",
  FLOOD_RISK_SIGNAL: "வானிலை & வெள்ள எச்சரிக்கைகள்", DRAINAGE_SEWAGE: "வடிகால் & கழிவுநீர்", DRAIN_WORKS_SAFETY: "வடிகால் பணியிடப் பாதுகாப்பு",
  ROAD_DAMAGE: "சாலைகள், நடைபாதைகள் & பாலங்கள்", ROAD_ACCIDENT: "சாலை விபத்து", TRAFFIC_OBSTRUCTION: "போக்குவரத்து இடையூறு & வாகன நிறுத்தம்",
  ENCROACHMENT: "ஆக்கிரமிப்பு & அனுமதியற்ற கட்டுமானம்", BUILDING_SAFETY: "பாதுகாப்பற்ற கட்டடங்கள் & சுவர்கள்", SOLID_WASTE: "குப்பை & திடக்கழிவு",
  SANITATION_TOILETS: "பொதுக் கழிப்பறைகள் & சுகாதாரம்", STREETLIGHT_ELECTRICAL: "தெருவிளக்குகள் & மின் அபாயங்கள்", DARK_SPOT_SAFETY: "இருண்ட இடங்கள் & பொதுப் பாதுகாப்பு",
  VECTOR_DISEASE: "கொசு & நீர்வழி நோய்கள்", FOOD_SAFETY: "உணவுப் பாதுகாப்பு", STRAY_ANIMALS: "தெரு விலங்குகள்", HEALTH_SERVICES: "சுகாதார சேவைகள்",
  AIR_POLLUTION: "காற்று மாசு", TREES_PARKS: "மரங்கள் & பூங்காக்கள்", CRIME_PROPERTY: "திருட்டு, பறிப்பு & மோசடி", CRIME_VIOLENT: "வன்முறைக் குற்றம்",
  CRIMES_AGAINST_WOMEN: "பெண்கள் & குழந்தைகளுக்கு எதிரான குற்றங்கள்", SUICIDE_SELF_HARM: "தற்கொலை & தற்காயம்", FIRE_EXPLOSION: "தீ & வெடிப்பு",
  MISSING_PERSON: "காணாமல் போனவர்கள்", DRUGS_LIQUOR: "போதைப்பொருள் & கள்ளச்சாராயம்", PUBLIC_ORDER: "போராட்டங்கள் & பொதுத் தொல்லை",
  POLICE_OTHER: "பிற காவல் விஷயங்கள்", PUBLIC_WORKS: "பொதுப்பணிகள் & பணியிடங்கள்", WATER_SUPPLY: "குடிநீர் விநியோகம்", CIVIC_FACILITIES: "குடிமை வசதிகள்",
  ADMIN_SERVICES: "வரி, சான்றிதழ் & வாக்காளர் சேவைகள்", OTHER: "பிற"
};
export const FAMILY_WORD: Record<string, { en: string; ta: string }> = {
  FLOOD: { en: "Flooding (all kinds)", ta: "வெள்ளம் (அனைத்தும்)" }, DRAINAGE: { en: "Drainage and water", ta: "வடிகால் & நீர்" },
  ROADS_TRAFFIC: { en: "Roads and traffic", ta: "சாலை & போக்குவரத்து" }, CRIME: { en: "Crime", ta: "குற்றம்" }, HEALTH: { en: "Health", ta: "சுகாதாரம்" },
  WASTE_SANITATION: { en: "Waste and sanitation", ta: "குப்பை & சுகாதாரம்" }, PUBLIC_SAFETY: { en: "Public safety", ta: "பொதுப் பாதுகாப்பு" },
  STRUCTURES_LAND: { en: "Buildings and land", ta: "கட்டடங்கள் & நிலம்" }, ELECTRICAL: { en: "Electrical", ta: "மின்சாரம்" },
  PUBLIC_ORDER: { en: "Public order", ta: "பொது ஒழுங்கு" }, WORKS: { en: "Public works", ta: "பொதுப்பணிகள்" }, ENVIRONMENT: { en: "Environment", ta: "சுற்றுச்சூழல்" },
  GREEN: { en: "Trees and parks", ta: "மரங்கள் & பூங்காக்கள்" }, ADMIN: { en: "Admin services", ta: "நிர்வாக சேவைகள்" }, OTHER: { en: "Other", ta: "பிற" }
};

export const SEV_WORD: Record<Sev, { en: string; ta: string }> = {
  Severe: { en: "severe", ta: "கடுமையான" }, High: { en: "high", ta: "அதிக" }, Medium: { en: "medium", ta: "நடுத்தர" }, Low: { en: "low", ta: "குறைந்த" }
};
export const STATUS_WORD = {
  open: { en: "open", ta: "திறந்த" }, closed: { en: "closed", ta: "முடிந்த" }, any: { en: "any status", ta: "எந்த நிலையும்" }
} as const;

/** Layers: plural noun, singular noun, Tamil, the glyph letter and shape used on the map. */
export const LAYER_WORD: Record<LayerId, { en: string; one: string; ta: string; ta_one: string; letter: string; shape: "square" | "cross" | "shield" | "circle" | "drop" | "diamond" | "line" | "dot" }> = {
  incidents: { en: "incidents", one: "incident", ta: "சம்பவங்கள்", ta_one: "சம்பவம்", letter: "", shape: "dot" },
  schools: { en: "schools", one: "school", ta: "பள்ளிகள்", ta_one: "பள்ளி", letter: "S", shape: "square" },
  colleges: { en: "colleges", one: "college", ta: "கல்லூரிகள்", ta_one: "கல்லூரி", letter: "C", shape: "square" },
  hospitals: { en: "hospitals", one: "hospital", ta: "மருத்துவமனைகள்", ta_one: "மருத்துவமனை", letter: "H", shape: "cross" },
  fire_stations: { en: "fire stations", one: "fire station", ta: "தீயணைப்பு நிலையங்கள்", ta_one: "தீயணைப்பு நிலையம்", letter: "F", shape: "diamond" },
  police: { en: "police stations", one: "police station", ta: "காவல் நிலையங்கள்", ta_one: "காவல் நிலையம்", letter: "P", shape: "shield" },
  water_bodies: { en: "lakes and ponds", one: "lake or pond", ta: "ஏரிகள் & குளங்கள்", ta_one: "ஏரி / குளம்", letter: "L", shape: "drop" },
  waterways: { en: "rivers and canals", one: "river or canal", ta: "ஆறுகள் & கால்வாய்கள்", ta_one: "ஆறு / கால்வாய்", letter: "W", shape: "line" },
  roads: { en: "roads", one: "road", ta: "சாலைகள்", ta_one: "சாலை", letter: "", shape: "line" },
  rail_metro: { en: "rail and metro stations", one: "station", ta: "ரயில் / மெட்ரோ நிலையங்கள்", ta_one: "நிலையம்", letter: "M", shape: "circle" },
  osm_places: { en: "neighbourhoods", one: "neighbourhood", ta: "பகுதிகள்", ta_one: "பகுதி", letter: "", shape: "dot" },
  lakes_store: { en: "PWD lakes", one: "PWD lake", ta: "பொதுப்பணித்துறை ஏரிகள்", ta_one: "ஏரி", letter: "L", shape: "drop" },
  gauges: { en: "gauges and stations", one: "gauge", ta: "அளவீட்டு நிலையங்கள்", ta_one: "அளவீட்டு நிலையம்", letter: "G", shape: "circle" },
  pwd_assets: { en: "PWD water works", one: "PWD water work", ta: "பொதுப்பணி நீர்க் கட்டமைப்புகள்", ta_one: "நீர்க் கட்டமைப்பு", letter: "W", shape: "circle" },
  hotspots: { en: "hotspots", one: "hotspot", ta: "அதிக இடங்கள்", ta_one: "அதிக இடம்", letter: "", shape: "circle" },
  // the Collector's own layers (OpenStreetMap; lib/map/types.ts COLLECTOR_LAYERS)
  banks: { en: "banks", one: "bank", ta: "வங்கிகள்", ta_one: "வங்கி", letter: "B", shape: "square" },
  atms: { en: "ATMs", one: "ATM", ta: "ஏடிஎம்கள்", ta_one: "ஏடிஎம்", letter: "A", shape: "square" },
  worship: { en: "places of worship", one: "place of worship", ta: "வழிபாட்டுத் தலங்கள்", ta_one: "வழிபாட்டுத் தலம்", letter: "R", shape: "circle" },
  parks: { en: "parks and playgrounds", one: "park", ta: "பூங்காக்கள்", ta_one: "பூங்கா", letter: "G", shape: "circle" },
  water_tanks: { en: "water tanks", one: "water tank", ta: "நீர்த்தொட்டிகள்", ta_one: "நீர்த்தொட்டி", letter: "T", shape: "drop" },
  toilets: { en: "public toilets", one: "public toilet", ta: "பொதுக் கழிப்பறைகள்", ta_one: "பொதுக் கழிப்பறை", letter: "WC", shape: "square" },
  bus_stations: { en: "bus stations", one: "bus station", ta: "பேருந்து நிலையங்கள்", ta_one: "பேருந்து நிலையம்", letter: "Bu", shape: "circle" },
  gov_offices: { en: "government offices", one: "government office", ta: "அரசு அலுவலகங்கள்", ta_one: "அரசு அலுவலகம்", letter: "O", shape: "shield" },
  pharmacies: { en: "pharmacies", one: "pharmacy", ta: "மருந்தகங்கள்", ta_one: "மருந்தகம்", letter: "Rx", shape: "cross" },
  fuel: { en: "fuel stations", one: "fuel station", ta: "எரிபொருள் நிலையங்கள்", ta_one: "எரிபொருள் நிலையம்", letter: "Fu", shape: "diamond" },
  markets: { en: "markets", one: "market", ta: "சந்தைகள்", ta_one: "சந்தை", letter: "Mk", shape: "square" },
  cemeteries: { en: "cemeteries and crematoriums", one: "cemetery or crematorium", ta: "இடுகாடுகள், மயானங்கள்", ta_one: "இடுகாடு / மயானம்", letter: "+", shape: "circle" },
  liquor: { en: "wine shops and bars", one: "wine shop or bar", ta: "மதுக்கடைகள்", ta_one: "மதுக்கடை", letter: "L", shape: "diamond" },
  ration_shops: { en: "ration shops", one: "ration shop", ta: "நியாய விலைக் கடைகள்", ta_one: "நியாய விலைக் கடை", letter: "PD", shape: "square" }
};

/** Each layer's colour on the map (the Layers menu's dots, the legend, an overlay's points): one table for all three. */
export const LAYER_COL: Partial<Record<LayerId, string>> = {
  schools: "#F59E0B", colleges: "#A855F7", hospitals: "#EF4444", fire_stations: "#F97316", police: "#3B82F6", rail_metro: "#14B8A6", lakes_store: "#60A5FA", gauges: "#22C55E",
  banks: "#0EA5E9", atms: "#38BDF8", worship: "#8B5CF6", parks: "#22C55E", water_tanks: "#06B6D4", toilets: "#94A3B8", bus_stations: "#F472B6", gov_offices: "#6366F1",
  pharmacies: "#F43F5E", fuel: "#EAB308", markets: "#FB923C", cemeteries: "#64748B", liquor: "#DC2626", ration_shops: "#84CC16"
};

/** What a layer's kinds are called ("courts", "playgrounds", "crematoriums"): the answer names the kind when a question asks for one. */
export const KIND_WORD: Record<string, { en: string; one: string; ta: string }> = {
  court: { en: "courts", one: "court", ta: "நீதிமன்றங்கள்" }, town_hall: { en: "town halls", one: "town hall", ta: "நகர மன்றங்கள்" },
  government_office: { en: "government offices", one: "government office", ta: "அரசு அலுவலகங்கள்" }, playground: { en: "playgrounds", one: "playground", ta: "விளையாட்டுத் திடல்கள்" },
  park: { en: "parks", one: "park", ta: "பூங்காக்கள்" }, crematorium: { en: "crematoriums", one: "crematorium", ta: "மயானங்கள்" }, cemetery: { en: "cemeteries", one: "cemetery", ta: "இடுகாடுகள்" },
  wine_shop: { en: "wine shops", one: "wine shop", ta: "மதுக்கடைகள்" }, bar: { en: "bars", one: "bar", ta: "மதுக்கூடங்கள்" }, pub: { en: "pubs", one: "pub", ta: "மதுக்கூடங்கள்" },
  hindu: { en: "temples", one: "temple", ta: "கோயில்கள்" }, muslim: { en: "mosques", one: "mosque", ta: "பள்ளிவாசல்கள்" }, christian: { en: "churches", one: "church", ta: "தேவாலயங்கள்" }
};

/** "last 30 days", "the 7 days before", "October 2026" (EN / TA). */
export function periodWords(p: Period | null, lang: Lang): string {
  const ta = isTa(lang);
  if (!p) return ta ? "எல்லா நாட்களும்" : "any time";
  if (p.kind === "last_days") {
    if (p.offset === 0) return p.days === 1 ? (ta ? "கடந்த 24 மணி நேரம்" : "last 24 hours") : ta ? `கடந்த ${p.days} நாட்கள்` : `last ${p.days} days`;
    if (p.days === 1) return ta ? "அதற்கு முந்தைய 24 மணி நேரம்" : p.offset === 1 ? "the 24 hours before" : `24 hours, ${p.offset} periods back`;
    return ta ? `அதற்கு முந்தைய ${p.days} நாட்கள்` : p.offset === 1 ? `the ${p.days} days before` : `${p.days} days, ${p.offset} periods back`;
  }
  if (p.kind === "month") return ta ? (p.offset === 0 ? "இந்த மாதம்" : `${p.offset} மாதம் முன்`) : p.offset === 0 ? "this calendar month" : p.offset === 1 ? "last calendar month" : `the calendar month ${p.offset} months back`;
  // the calendar periods Jarvis and Ask District IQ say the same way (src/lib/period/read.ts): today since 12 AM (lib/period/day.ts), the calendar week before
  if (p.kind === "day") {
    if (ta) return p.offset === 0 ? dayWords().ta.plain : p.so_far && p.offset === 1 ? dayWords().ta.prev : p.offset === 1 ? "நேற்று" : p.offset === 2 ? "நேற்று முன்தினம்" : `${p.offset} நாட்கள் முன்`;
    return p.offset === 0 ? dayWords().en.plain : p.so_far && p.offset === 1 ? dayWords().en.prev : p.offset === 1 ? "yesterday" : p.offset === 2 ? "the day before yesterday" : `the calendar day ${p.offset} days back`;
  }
  if (p.kind === "week") {
    if (ta) return p.offset === 0 ? "இந்த வாரம், திங்கள் முதல்" : p.offset === 1 ? "கடந்த வாரம், திங்கள் முதல் ஞாயிறு வரை" : `${p.offset} வாரங்கள் முன்`;
    return p.offset === 0 ? "this calendar week, since Monday" : p.offset === 1 ? "last calendar week, Monday to Sunday" : `the calendar week ${p.offset} weeks back`;
  }
  if (p.kind === "quarter") {
    if (ta) return p.offset === 0 ? "இந்த காலாண்டு" : p.offset === 1 ? "கடந்த காலாண்டு" : `${p.offset} காலாண்டுகள் முன்`;
    return p.offset === 0 ? "this calendar quarter" : p.offset === 1 ? "last calendar quarter" : `the calendar quarter ${p.offset} quarters back`;
  }
  // a range the question named ("September", "last 36 hours", "reported more than 30 days ago") keeps the reader's words
  if (p.label) return ta ? p.label.ta : p.label.en;
  return ta ? `${p.from.slice(0, 10)} முதல் ${p.to.slice(0, 10)} வரை` : `${p.from.slice(0, 10)} to ${p.to.slice(0, 10)}`;
}

/**
 * The period as it reads after a count in an English sentence ("12 flooding incidents <in the last 7 days>, up from 9 <in the 7 days before>"):
 * "yesterday", not "in the yesterday"; "in the last calendar month"; "in September". Tamil puts the period first and needs no such words.
 */
export function inPeriodWords(p: Period | null): string {
  const w = periodWords(p, "en");
  if (!p) return "at any time";
  if (p.kind === "day") return p.offset <= 2 ? w : `on ${w}`;
  if (p.kind === "last_days" && p.offset === 0) return `in the ${w}`;
  if (p.kind === "range") return /^(today|yesterday|the day before|since|between|from|reported|on|in)\b/.test(w) ? w : /^(last|past)\b/.test(w) ? `in the ${w}` : /^\d/.test(w) ? `on ${w}` : `in ${w}`;
  if (p.offset === 0 && p.kind !== "last_days") return `in ${w}`;
  return /^the\b/.test(w) ? `in ${w}` : `in the ${w}`;
}

export const word = (lang: Lang, en: string, ta: string) => (isTa(lang) ? ta : en);

/** "1 incident" / "5 incidents"; Tamil nouns do not change with the number here. */
export const nOf = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
