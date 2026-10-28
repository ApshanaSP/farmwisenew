/**
 * Ask the Map's words, in English and Tamil: categories, severities, layers, periods and areas. Every chip, trace
 * line, legend entry and answer is built from these, so no label exists in one language only. Tanglish answers use the
 * English words (the Collector types Tanglish in Latin letters). Pure.
 */
import type { Period } from "./plan";
import type { LayerId, Sev } from "./types";

export type Lang = "en" | "ta" | "tanglish";
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
  hotspots: { en: "hotspots", one: "hotspot", ta: "அதிக இடங்கள்", ta_one: "அதிக இடம்", letter: "", shape: "circle" }
};

/** "last 30 days", "the 7 days before", "October 2026" (EN / TA). */
export function periodWords(p: Period | null, lang: Lang): string {
  const ta = isTa(lang);
  if (!p) return ta ? "எல்லா நாட்களும்" : "any time";
  if (p.kind === "last_days") {
    if (p.offset === 0) return p.days === 1 ? (ta ? "கடந்த 24 மணி நேரம்" : "last 24 hours") : ta ? `கடந்த ${p.days} நாட்கள்` : `last ${p.days} days`;
    return ta ? `அதற்கு முந்தைய ${p.days} நாட்கள்` : p.offset === 1 ? `the ${p.days} days before` : `${p.days} days, ${p.offset} periods back`;
  }
  if (p.kind === "month") return ta ? (p.offset === 0 ? "இந்த மாதம்" : `${p.offset} மாதம் முன்`) : p.offset === 0 ? "this calendar month" : p.offset === 1 ? "last calendar month" : `${p.offset} months back`;
  return ta ? `${p.from.slice(0, 10)} முதல் ${p.to.slice(0, 10)} வரை` : `${p.from.slice(0, 10)} to ${p.to.slice(0, 10)}`;
}

export const word = (lang: Lang, en: string, ta: string) => (isTa(lang) ? ta : en);

/** "1 incident" / "5 incidents"; Tamil nouns do not change with the number here. */
export const nOf = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
