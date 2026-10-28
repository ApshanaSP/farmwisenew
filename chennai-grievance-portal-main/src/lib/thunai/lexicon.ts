/**
 * Thunai's vocabulary: the words, in English, Tamil and Tanglish, for everything the console has. Runtime lists
 * (departments, categories, taluks, places, reservoirs) come from the console's own data (World); this file adds the
 * spoken aliases. Phrases are matched after normalise(), so they are lower case, with numbers as digits.
 */
import type { PageKey, Panel, PeriodKey, Sev } from "./types";

/** Greater Chennai Corporation zones: English spellings people use, and the Tamil name. */
export const ZONES: Record<number, { en: string[]; ta: string[] }> = {
  1: { en: ["thiruvottiyur", "tiruvottiyur", "thiruvotriyur", "tiruvotriyur"], ta: ["திருவொற்றியூர்"] },
  2: { en: ["manali"], ta: ["மணலி"] },
  3: { en: ["madhavaram", "madavaram"], ta: ["மாதவரம்"] },
  4: { en: ["tondiarpet", "thandaiyarpet", "tondiarpettai", "thandaiyarpettai"], ta: ["தண்டையார்பேட்டை"] },
  5: { en: ["royapuram", "rayapuram"], ta: ["ராயபுரம்", "இராயபுரம்"] },
  6: { en: ["thiru vi ka nagar", "thiruvika nagar", "tvk nagar", "thiru-vi-ka nagar", "thiruvika"], ta: ["திருவிக நகர்", "திரு.வி.க. நகர்", "திருவிக"] },
  7: { en: ["ambattur", "ambathur", "ambatthur"], ta: ["அம்பத்தூர்"] },
  8: { en: ["anna nagar", "annanagar"], ta: ["அண்ணா நகர்", "அண்ணாநகர்"] },
  9: { en: ["teynampet", "thenampet", "thenampettai", "teynampettai"], ta: ["தேனாம்பேட்டை"] },
  10: { en: ["kodambakkam", "kodambakam"], ta: ["கோடம்பாக்கம்"] },
  11: { en: ["valasaravakkam", "valasarawakkam", "valasaravakam"], ta: ["வளசரவாக்கம்"] },
  12: { en: ["alandur", "aalandur"], ta: ["ஆலந்தூர்"] },
  13: { en: ["adyar", "adayar", "adaiyar", "adaiyaru", "adayaru"], ta: ["அடையாறு", "அடையார்"] },
  14: { en: ["perungudi"], ta: ["பெருங்குடி"] },
  15: { en: ["sholinganallur", "sholinganalur", "solinganallur", "shozhinganallur"], ta: ["சோழிங்கநல்லூர்"] }
};
export const ZONE_TA_NAME: Record<number, string> = Object.fromEntries(Object.entries(ZONES).map(([n, z]) => [n, z.ta[0]]));

/** department code -> extra spoken names (the console's own names are added at runtime) */
export const DEPT_ALIASES: Record<string, string[]> = {
  "GCC-SWD": ["storm water drain", "storm water drains", "storm water", "swd", "drains department", "மழைநீர் வடிகால்"],
  "DIST-DM": ["disaster management", "disaster", "பேரிடர் மேலாண்மை", "பேரிடர்"],
  "PWD-WRD": ["pwd", "public works", "water resources", "பொதுப்பணித்துறை", "பொதுப்பணி"],
  "PWD-BLD": ["pwd buildings", "buildings department"],
  "GCC-ENG": ["engineering", "roads department", "bus route roads"],
  "POL-GCP": ["police", "greater chennai police", "traffic police", "காவல்துறை", "போலீஸ்", "காவல்"],
  "GCC-SWM": ["solid waste management", "conservancy", "swm"],
  "GCC-HLT": ["health department", "corporation health", "public health", "சுகாதாரத் துறை"],
  "GCC-ELE": ["electrical department", "electrical", "electricity"],
  "HLT-DMS": ["hospitals", "medical services", "மருத்துவத் துறை"],
  "TNPCB": ["pollution control board", "tnpcb", "pcb", "மாசு கட்டுப்பாடு வாரியம்"],
  "GCC-PRK": ["parks department", "parks"],
  "CMWSSB": ["metro water", "metrowater", "cmwssb", "water board", "metro water board", "குடிநீர் வாரியம்", "மெட்ரோ வாட்டர்", "water"],
  "GCC-GAD": ["general administration"],
  "GCC-REV": ["revenue", "tax department"]
};

/** category code -> spoken names */
export const CAT_ALIASES: Record<string, string[]> = {
  FLOOD_WATERLOGGING: ["flooding", "flood", "floods", "waterlogging", "water logging", "waterlogged", "water stagnation", "stagnation",
    "inundation", "rain water", "மழைநீர் தேக்கம்", "நீர்த்தேக்கம்", "தண்ணீர் தேக்கம்", "வெள்ளம்", "mazhai thanni", "thanni thekkam", "vellam"],
  DRAINAGE_SEWAGE: ["drainage", "sewage", "sewer", "sewage overflow", "கழிவுநீர்", "சாக்கடை", "saakkadai"],
  ROAD_DAMAGE: ["road", "roads", "pothole", "potholes", "road damage", "footpath", "சாலை", "பள்ளம்", "road damage complaints"],
  ROAD_ACCIDENT: ["accident", "accidents", "road accident", "road accidents", "விபத்து"],
  TRAFFIC_OBSTRUCTION: ["traffic", "parking", "traffic jam", "போக்குவரத்து"],
  SOLID_WASTE: ["garbage", "waste", "trash", "rubbish", "solid waste", "குப்பை", "kuppai"],
  STREETLIGHT_ELECTRICAL: ["streetlight", "streetlights", "street light", "street lights", "electrical hazard", "தெருவிளக்கு", "தெரு விளக்கு"],
  VECTOR_DISEASE: ["mosquito", "mosquitoes", "dengue", "malaria", "fever", "vector", "கொசு", "டெங்கு", "காய்ச்சல்", "kosu"],
  HEALTH_SERVICES: ["hospital", "hospital capacity", "health services", "மருத்துவமனை"],
  AIR_POLLUTION: ["air pollution", "pollution", "smoke", "காற்று மாசு"],
  TREES_PARKS: ["tree", "trees", "tree fall", "fallen trees", "மரம்", "மரங்கள்"],
  WATER_SUPPLY: ["drinking water", "water supply", "no water", "குடிநீர்", "தண்ணீர் வரல", "water"],
  FIRE_EXPLOSION: ["fire", "fires", "explosion", "தீ", "தீ விபத்து"],
  STRAY_ANIMALS: ["stray dogs", "stray dog", "dogs", "stray cattle", "cattle", "தெருநாய்", "நாய்"],
  ENCROACHMENT: ["encroachment", "encroachments", "ஆக்கிரமிப்பு"],
  CRIME_PROPERTY: ["theft", "thefts", "chain snatching", "snatching", "திருட்டு"],
  CRIME_VIOLENT: ["murder", "assault", "violence", "violent crime", "கொலை"],
  CRIMES_AGAINST_WOMEN: ["women safety", "crimes against women"],
  PUBLIC_ORDER: ["protest", "protests", "போராட்டம்"],
  MISSING_PERSON: ["missing person", "missing", "காணவில்லை"],
  SANITATION_TOILETS: ["toilet", "toilets", "கழிப்பறை"],
  BUILDING_SAFETY: ["building collapse", "unsafe building", "wall collapse"],
  FLOOD_RISK_SIGNAL: ["weather warning", "weather warnings", "flood warning", "எச்சரிக்கை"],
  WATERBODY_INFRA: ["bund", "sluice", "waterbody", "water body"],
  DRUGS_LIQUOR: ["liquor", "drugs", "ganja", "கஞ்சா"],
  FOOD_SAFETY: ["food safety", "hotel hygiene", "food poisoning"]
};

export const SEV_WORDS: [string, Sev][] = [
  ["critical", "Severe"], ["severe", "Severe"], ["urgent", "Severe"], ["serious", "Severe"], ["அவசரமானவை", "Severe"], ["அவசர", "Severe"],
  ["கடுமையான", "Severe"], ["தீவிர", "Severe"], ["high", "High"], ["medium", "Medium"], ["moderate", "Medium"], ["low", "Low"],
  ["நடுத்தர", "Medium"], ["குறைந்த", "Low"]
];

export const PERIOD_WORDS: [string, PeriodKey][] = [
  ["last 24 hours", "daily"], ["24 hours", "daily"], ["today", "daily"], ["daily", "daily"], ["day", "daily"], ["இன்று", "daily"],
  ["இன்னைக்கு", "daily"], ["இன்றைய", "daily"], ["தினசரி", "daily"], ["innaiku", "daily"], ["innaikku", "daily"],
  ["last 7 days", "weekly"], ["7 days", "weekly"], ["this week", "weekly"], ["last week", "weekly"], ["weekly", "weekly"], ["week", "weekly"],
  ["வாராந்திர", "weekly"], ["வாராந்திரம்", "weekly"], ["வாரம்", "weekly"], ["வாரத்துக்கு", "weekly"], ["வாரத்துக்கு", "weekly"],
  ["last 30 days", "monthly"], ["30 days", "monthly"], ["this month", "monthly"], ["last month", "monthly"], ["monthly", "monthly"], ["month", "monthly"],
  ["மாதம்", "monthly"], ["மாசம்", "monthly"], ["மாசத்துக்கு", "monthly"], ["மாதத்தோடு", "monthly"], ["maasam", "monthly"],
  ["last 90 days", "quarterly"], ["90 days", "quarterly"], ["3 months", "quarterly"], ["this quarter", "quarterly"], ["last quarter", "quarterly"],
  ["quarterly", "quarterly"], ["quarter", "quarterly"], ["காலாண்டு", "quarterly"]
];

export const PAGE_WORDS: [string, PageKey][] = [
  ["overview", "overview"], ["home", "overview"], ["main page", "overview"], ["dashboard", "overview"], ["முகப்பு", "overview"],
  ["briefing", "briefing"], ["brief page", "briefing"], ["சுருக்கம் பக்கம்", "briefing"],
  ["trends", "trends"], ["trend", "trends"], ["போக்கு", "trends"], ["ட்ரெண்ட்ஸ்", "trends"],
  ["environment", "environment"], ["environment and markets", "environment"], ["weather", "environment"], ["சுற்றுச்சூழல்", "environment"],
  ["வானிலை", "environment"], ["data studio", "studio"], ["studio", "studio"], ["datasets", "studio"], ["தரவு", "studio"]
];

export const PANEL_WORDS: [string, Panel][] = [
  ["in the news but not", "gaps"], ["not in our records", "gaps"], ["not in records", "gaps"], ["only in the news", "gaps"], ["news gaps", "gaps"],
  ["gaps", "gaps"], ["பதிவுல இல்லாதது", "gaps"], ["பதிவில் இல்லாதது", "gaps"], ["record la illa", "gaps"],
  ["developing stories", "stories"], ["stories", "stories"], ["முக்கியச் செய்திகளை", "stories"],
  ["outlets disagree", "conflicts"], ["disagree", "conflicts"], ["conflicts", "conflicts"], ["reports differ", "conflicts"], ["contradict", "conflicts"],
  ["முரண்படுகின்றன", "conflicts"], ["முரண்", "conflicts"],
  ["latest news", "news"], ["all the news", "news"], ["all news", "news"], ["news", "news"], ["செய்திகளையும்", "news"], ["செய்திகள்", "news"], ["செய்தி", "news"],
  ["next door", "nextdoor"], ["neighbouring districts", "nextdoor"], ["neighboring districts", "nextdoor"], ["பக்கத்து மாவட்டங்கள்", "nextdoor"],
  ["pakkathu districts", "nextdoor"],
  ["mandi prices", "markets"], ["vegetable prices", "markets"], ["markets", "markets"], ["prices", "markets"], ["price", "markets"], ["mandi", "markets"],
  ["காய்கறி விலை", "markets"], ["விலை", "markets"], ["vilai", "markets"],
  ["list of zones", "zones"], ["zones list", "zones"], ["all zones list", "zones"], ["zone table", "zones"],
  ["departments list", "depts"], ["list of departments", "depts"], ["departments", "depts"], ["துறைகள்", "depts"],
  ["data sources", "sources"], ["sources", "sources"], ["feeds", "sources"],
  ["locations to review", "review"], ["review list", "review"], ["review", "review"],
  ["workspaces", "workspace"], ["workspace", "workspace"],
  ["export report", "export"], ["export", "export"], ["download report", "export"], ["pdf report", "export"],
  ["customize dashboard", "customize"], ["customize", "customize"], ["customise", "customize"],
  ["command palette", "palette"], ["search", "palette"],
  ["audit trail", "trail"], ["trail", "trail"], ["action log", "trail"],
  ["ask the map", "map"], ["map search", "map"],
  ["chatbot", "assistant"], ["assistant", "assistant"]
];

/** the Overview map's layers (console layer keys) */
export const LAYER_WORDS: [string, string][] = [
  ["severe", "severe"], ["severe pins", "severe"], ["complaints", "complaint"], ["complaint", "complaint"], ["other incidents", "other"],
  ["other", "other"], ["added sources", "added"], ["added", "added"], ["stations", "stations"], ["sensors", "stations"], ["gauges", "stations"],
  ["rain gauges", "stations"], ["rain layer", "stations"]
];

/** reservoirs: static spoken names (the console's own station names are added at runtime) */
export const RESERVOIR_ALIASES: [string, string][] = [
  ["chembarambakkam", "Chembarambakkam"], ["chembarampakkam", "Chembarambakkam"], ["செம்பரம்பாக்கம்", "Chembarambakkam"],
  ["puzhal", "Puzhal"], ["red hills", "Puzhal"], ["redhills", "Puzhal"], ["புழல்", "Puzhal"],
  ["poondi", "Poondi"], ["பூண்டி", "Poondi"], ["cholavaram", "Cholavaram"], ["சோழவரம்", "Cholavaram"],
  ["kannankottai", "Kannankottai"], ["thervoy kandigai", "Kannankottai"], ["கண்ணன்கோட்டை", "Kannankottai"],
  ["veeranam", "Veeranam"], ["வீராணம்", "Veeranam"]
];

/** words that undo the entity just before them: "Adyar, no, Perungudi", "அடையாறு வேண்டாம்" */
export const REPAIR = new Set(["no", "not", "illa", "illai", "இல்ல", "இல்லை", "வேண்டாம்", "vendaam", "venaam", "sorry", "instead", "mean", "rather"]);

/** destructive verbs: there is no such action, so the request is refused with no state change */
export const DESTRUCTIVE = /\b(delete|remove|erase|wipe|drop|destroy|purge)\b|அழி|நீக்கிடு/;
