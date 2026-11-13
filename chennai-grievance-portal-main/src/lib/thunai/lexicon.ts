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
  5: { en: ["royapuram", "rayapuram", "royapuram zone"], ta: ["ராயபுரம்", "இராயபுரம்", "ரோயபுரம்"] },
  6: { en: ["thiru vi ka nagar", "thiruvika nagar", "tvk nagar", "thiru-vi-ka nagar", "thiruvika"], ta: ["திருவிக நகர்", "திரு.வி.க. நகர்", "திருவிக"] },
  7: { en: ["ambattur", "ambathur", "ambatthur", "ambatur"], ta: ["அம்பத்தூர்", "அம்பட்டூர்"] },
  8: { en: ["anna nagar", "annanagar", "annan nagar"], ta: ["அண்ணா நகர்", "அண்ணாநகர்", "அன்னா நகர்"] },
  9: { en: ["teynampet", "thenampet", "thenampettai", "teynampettai"], ta: ["தேனாம்பேட்டை"] },
  10: { en: ["kodambakkam", "kodambakam"], ta: ["கோடம்பாக்கம்"] },
  11: { en: ["valasaravakkam", "valasarawakkam", "valasaravakam"], ta: ["வளசரவாக்கம்"] },
  12: { en: ["alandur", "aalandur", "alandhur", "aalandhur", "allandur"], ta: ["ஆலந்தூர்", "அலந்தூர்", "ஆளந்தூர்", "ஆலந்துர்"] },
  13: { en: ["adyar", "adayar", "adaiyar", "adaiyaru", "adayaru", "adyaru", "adiyar", "adyaar", "adaiyaar"], ta: ["அடையாறு", "அடையார்", "அடயார்", "அட்யார்"] },
  14: { en: ["perungudi", "perungudy", "perunkudi", "peringudi"], ta: ["பெருங்குடி", "பெரும்குடி"] },
  15: { en: ["sholinganallur", "sholinganalur", "solinganallur", "shozhinganallur", "cholinganallur"], ta: ["சோழிங்கநல்லூர்", "சோளிங்கநல்லூர்", "ஷோலிங்கநல்லூர்"] }
};
export const ZONE_TA_NAME: Record<number, string> = Object.fromEntries(Object.entries(ZONES).map(([n, z]) => [n, z.ta[0]]));
export const ZONE_NAMES = ["Thiruvottiyur", "Manali", "Madhavaram", "Tondiarpet", "Royapuram", "Thiru-Vi-Ka Nagar", "Ambattur", "Anna Nagar",
  "Teynampet", "Kodambakkam", "Valasaravakkam", "Alandur", "Adyar", "Perungudi", "Sholinganallur"];

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
  "TNPCB": ["pollution control board", "tamil nadu pollution control board", "tnpcb", "pcb", "மாசு கட்டுப்பாடு வாரியம்", "தமிழ்நாடு மாசு கட்டுப்பாட்டு வாரியம்", "மாசு கட்டுப்பாட்டு வாரியம்"],
  "GCC-PRK": ["parks department", "parks"],
  "CMWSSB": ["metro water", "metrowater", "cmwssb", "water board", "metro water board", "குடிநீர் வாரியம்", "மெட்ரோ வாட்டர்", "water"],
  "GCC-GAD": ["general administration"],
  "GCC-REV": ["revenue", "tax department", "property tax department", "property tax"],
  // the district's own revenue administration (the Collector's), not the Corporation's Revenue: "district revenue" is the longer name, so it wins over the word "revenue" (RC-02, open-baseline-37)
  "DIST-REV": ["district revenue", "district revenue administration", "மாவட்ட வருவாய்"]
};

/**
 * "Explain" in Tamil, on text with a space at each end. விளக்கு alone also means a lamp and sits inside தெருவிளக்கு (a street light), so it counts only as the
 * sentence's last word, with no street or power word before it (BUG-032).
 */
export const EXPLAIN_TA = / (?:விளக்குங்க|விளக்குங்கள்|விளக்கவும்|விளக்கி|விளக்கம்|விளக்கமா|விளக்கமாக) |(?<! தெரு| மின்) விளக்கு $/;

/** the shape of a general-knowledge question ("what is deep learning", "who is the president", "write a poem"), and subjects that are not the district's */
export const GENERAL = /^\s*(what is|what are|whats|what does|who is|who was|who are|define|explain|meaning of|tell me a|tell me about|how does|how do i|how to|write|translate|calculate|solve|teach me|give me a|sing|recommend)\b|joke|poem|story|recipe|என்றால் என்ன|யார்|விளக்கு|கதை சொல்|பாடல்|கவிதை/;
export const SUBJECTS = /deep learning|machine learning|artificial intelligence|\bai\b|neural network|programming|python|javascript|java\b|coding|cricket|football|ipl|movie|film|actor|actress|song|music|president|prime minister|capital of|bitcoin|crypto|stock market|share price|history of|physics|chemistry|biology|mathematics|chatgpt|google|facebook|instagram|youtube/;

/** department code -> its name in Tamil, as said aloud (the Tamil voice says this, never the English name) */
export const DEPT_TA: Record<string, string> = {
  "POL-GCP": "பெருநகர சென்னை காவல்துறை", "GCC-SWD": "மழைநீர் வடிகால் துறை", "GCC-SWM": "திடக்கழிவு மேலாண்மைத் துறை", "GCC-ENG": "சாலைகள் மற்றும் கட்டட அனுமதித் துறை",
  "GCC-ELE": "தெருவிளக்கு மற்றும் மின் துறை", "GCC-HLT": "மாநகராட்சி சுகாதாரத் துறை", "GCC-PRK": "பூங்காக்கள் துறை", "GCC-REV": "வருவாய்த் துறை", "PWD-WRD": "பொதுப்பணித்துறை நீர்வளம்",
  "PWD-BLD": "பொதுப்பணித்துறை கட்டடங்கள்", "HLT-DMS": "அரசு மருத்துவமனைகள்", "CMWSSB": "சென்னை குடிநீர் வாரியம்", "TANGEDCO": "மின் பகிர்மானக் கழகம்", "TNPCB": "மாசு கட்டுப்பாடு வாரியம்",
  "DIST-DM": "மாவட்டப் பேரிடர் மேலாண்மை", "DIST-REV": "மாவட்ட வருவாய்த் துறை",
  // the rest of the Corporation's departments (the table in officer/departments.ts): complete, so no Tamil line has to say an English department name (QA pass 4, RC-15)
  "GCC-BRG": "பாலங்கள் துறை", "GCC-BLD": "கட்டடங்கள் துறை", "GCC-CNL": "மன்றத் துறை", "GCC-EDU": "கல்வித் துறை", "GCC-FWD": "குடும்ப நலத் துறை",
  "GCC-FMU": "நிதி மேலாண்மைப் பிரிவு", "GCC-GAD": "பொது நிர்வாகத் துறை", "GCC-LND": "நிலம் மற்றும் சொத்துத் துறை", "GCC-MEC": "இயந்திரப் பொறியியல் துறை"
};

/** category code -> spoken names */
export const CAT_ALIASES: Record<string, string[]> = {
  FLOOD_WATERLOGGING: [" வெள்ள ", " வெள்ளப் ", "flooding", "flood", "floods", "waterlogging", "water logging", "waterlogged", "water stagnation", "stagnation",
    "inundation", "rain water", "மழைநீர் தேக்கம்", "நீர்த்தேக்கம்", "தண்ணீர் தேக்கம்", "வெள்ளம்", "mazhai thanni", "thanni thekkam", "vellam"],
  DRAINAGE_SEWAGE: ["drainage", "sewage", "sewer", "sewage overflow", "கழிவுநீர்", "சாக்கடை", "saakkadai"],
  ROAD_DAMAGE: ["road", "roads", "pothole", "potholes", "road damage", "footpath", "சாலை", "பள்ளம்", "road damage complaints"],
  ROAD_ACCIDENT: ["accident", "accidents", "road accident", "road accidents", "விபத்து"],
  TRAFFIC_OBSTRUCTION: ["traffic", "parking", "traffic jam", "போக்குவரத்து"],
  SOLID_WASTE: ["garbage", "waste", "trash", "rubbish", "solid waste", "குப்பை", "kuppai"],
  // a drain-works site (a pit left open where the drain is being built) is that category, not the road's "pothole": the longer phrase wins over "பள்ளம்" (RC-02, open-baseline-38)
  DRAIN_WORKS_SAFETY: ["drain work", "drain works", "drain worksite", "drain work site", "வடிகால் வேலை", "வடிகால் பணி", "வடிகால் பணியிட"],
  STREETLIGHT_ELECTRICAL: ["streetlight", "streetlights", "street light", "street lights", "electrical hazard", "தெருவிளக்கு", "தெரு விளக்கு", "மின்விளக்கு", "மின் விளக்கு", "street lamp", "lamp post", "high mast"],
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

/**
 * The Tamil word for severe is also the everyday word for harsh: "கடுமையான வெயில்" is harsh sun, "கடுமையான குளிர்" harsh cold, not a list of severe cases. Beside a word of the weather or the
 * land it is the weather's adjective (RC-03, audit-understanding-21). Closed list: the nouns of weather and season a Collector can say; any other noun leaves it a severity.
 */
export const HARSH_BESIDE = /(?:கடுமையான|கடுமை)\s*(?:வெயில்|வெப்பம்|குளிர்|மழை|புயல்|காற்று|வறட்சி|பனி|மூடுபனி|கோடை|குளிர்காலம்)/;
export const SEV_WORDS: [string, Sev][] = [
  ["critical", "Severe"], ["severe", "Severe"], ["urgent", "Severe"], ["serious", "Severe"], ["அவசரமானவை", "Severe"], ["அவசர", "Severe"],
  ["கடுமையான", "Severe"], ["தீவிர", "Severe"], ["high", "High"], ["medium", "Medium"], ["moderate", "Medium"], ["low", "Low"],
  ["நடுத்தர", "Medium"], ["குறைந்த", "Low"]
];

/**
 * The words for each window: ONE table, read by the fast lane (quick.ts periodIn), by the rules lane (PERIOD_WORDS below) and so by every language. A word added for one lane or one
 * language is added here, so "pona vaaram" cannot be a week in one lane and nothing in another (QA pass 4, RC-06). The console's own windows only: "last week" and "last month"
 * are the previous calendar week and month (lib/period/read.ts, the reader both lanes share, QA pass 7; BUG-003 had made them the last 7 and 30 days in Jarvis alone, while
 * Ask District IQ read the calendar month), and "two weeks ago" or "yesterday" are no window here either. The shared reader reads every one of these words the same way.
 */
export const PERIOD_TABLE: Record<PeriodKey, string[]> = {
  daily: ["last 24 hours", "24 hours", "today", "daily", "இன்று", "இன்னைக்கு", "இன்றைய", "தினசரி", "innaiku", "innaikku", "inniki"],
  weekly: ["last 7 days", "7 days", "this week", "this weeks", "weekly", "week", "இந்த வாரம்", "இந்த வார", "வாராந்திர", "வாராந்திரம்", "வாரம்", "வாரத்துக்கு", "வாரந்தோறும்",
    "vaaram", "vaara", "vaarathukku"],
  monthly: ["last 30 days", "30 days", "this month", "this months", "monthly", "month", "இந்த மாதம்", "இந்த மாத", "மாதாந்திர", "மாதம்", "மாசம்", "மாசத்துக்கு", "மாதத்தோடு",
    "maasam", "maatham", "maasathukku"],
  quarterly: ["last 90 days", "90 days", "3 months", "three months", "this quarter", "quarterly", "quarter", "காலாண்டு", "மூன்று மாதம்", "மூன்று மாத"]
};
/** the rules lane's list: the table, and the words only that lane reads ("day", for the token reader) */
export const PERIOD_WORDS: [string, PeriodKey][] = [
  ...(Object.entries(PERIOD_TABLE) as [PeriodKey, string[]][]).flatMap(([k, ws]) => ws.map((w): [string, PeriodKey] => [w, k])),
  ["day", "daily"]
];

export const PAGE_WORDS: [string, PageKey][] = [
  ["overview", "overview"], ["home", "overview"], ["main page", "overview"], ["dashboard", "overview"], ["முகப்பு", "overview"],
  ["briefing", "briefing"], ["brief page", "briefing"], ["சுருக்கம் பக்கம்", "briefing"],
  ["trends", "trends"], ["trend", "trends"], ["போக்கு", "trends"], ["ட்ரெண்ட்ஸ்", "trends"], ["டிரெண்ட்ஸ்", "trends"], ["டிரெண்ட்", "trends"], ["ட்ரெண்ட்", "trends"],
  ["ஓவர்வியூ", "overview"], ["டாஷ்போர்டு", "overview"], ["டாஷ்போர்ட்", "overview"], ["பிரீஃபிங்", "briefing"], ["ப்ரீஃபிங்", "briefing"], ["ப்ரீபிங்", "briefing"],
  ["என்விரான்மென்ட்", "environment"], ["ஸ்டுடியோ", "studio"],
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

/**
 * The sentence's intent classes, one table by language, read by every lane before it builds anything (RC-04). A Tamil word has no \b, so the Tamil half starts at a
 * word edge (no Tamil letter before it) and takes any ending.
 *  keep    the Collector's own note or a reminder: nothing about the data is asked
 *  change  an order to change, close, assign or delete a record: the console does not do it
 */
export const KEEPING = /\b(remember|remind|reminder|reminders|note|notes|save|pin|bookmark|workspace|type|search box|draft|write|letter|email|e-mail|mail|send|compose|forward|forget|make a note|for later|keep (it|them|this|that|the [a-z ]{3,40}) (aside|for later|handy)|nyabagam|nyabagapaduthu|nyabagapaduthunga|ninaivoottu|ninaivil vai|vechukko|vechuko)\b|(?<![஀-௿])(நினைவூட்டு|நினைவில்|நினைவு படுத்து|ஞாபக|சேவ்|சேமி|டைப்|மெயில்|அனுப்பு|குறிப்பு எடு|குறித்து வை|மறந்துடாத|மறக்காம)/i;
export const CHANGE_RECORD = /\b(change|edit|modify|update the (status|record)|reassign|assign|close it|mark\b[^.]{0,40}\b(as )?(closed|resolved|done)|set (the )?status|maathu\w*|maathid\w*|maatru\w*|maattu\w*|maathi\w*|mathidu)\b|(?<![஀-௿])(மாற்று|மாத்து|மாற்றி|திருத்து|ஒதுக்கு|முடிச்சிடு|மூடிடு)/i;

/**
 * More spoken names for the categories (RC-05). Two parts, both derived, not typed per sentence:
 *  1. the stem of a word the table already holds ("drainage" is also "drain", "encroachment" is also "encroach"), kept only when it names one category and no other;
 *  2. the topics Collectors say that the data files under a category (power cuts, flood alerts), with the source of each in the comment.
 * Tamil, Tanglish and English all read the same table, so the same question has the same topic whatever language it is in.
 */
const CATEGORY_TOPICS: Record<string, string[]> = {
  // "theru vilakku" is the Tanglish of the street light. Power cuts are not here: the data holds no power-cut category, so they stay unread and the lane asks
  STREETLIGHT_ELECTRICAL: ["theru vilakku", "therukku vilakku", "street lamp"],
  // IMD alerts are the flood-risk signal category
  FLOOD_RISK_SIGNAL: ["flood alert", "flood alerts", "red alert", "orange alert", "வெள்ள எச்சரிக்கை"],
  STRAY_ANIMALS: ["stray animal", "stray animals", "animal", "animals", "stray", "street dog", "street dogs"],
  DRAINAGE_SEWAGE: ["drain", "drains", "drainage problem", "manhole", "sewerage", "வடிகால்"]
};
(function deriveCategoryAliases() {
  for (const [code, words] of Object.entries(CATEGORY_TOPICS)) { const have = CAT_ALIASES[code]; if (have) for (const w of words) if (!have.includes(w)) have.push(w); }
  const owner = new Map<string, Set<string>>();
  const note = (w: string, code: string) => { const s = owner.get(w) ?? new Set<string>(); s.add(code); owner.set(w, s); };
  for (const [code, words] of Object.entries(CAT_ALIASES)) {
    for (const a of words) note(a.trim().toLowerCase(), code);
  }
  const add = (code: string, w: string) => { if (w.length >= 5 && (owner.get(w)?.size ?? 0) <= 1 && ![...(owner.get(w) ?? [])].some((c) => !c.startsWith(code)) && !CAT_ALIASES[code].includes(w)) CAT_ALIASES[code].push(w); };
  for (const code of Object.keys(CAT_ALIASES)) {
    for (const a of [...CAT_ALIASES[code]]) {
      const m = /^([a-z]{5,})(age|ment)$/.exec(a.trim());
      if (m && m[1].length >= 5) add(code, m[1]);
    }
  }
})();

/**
 * High, low, medium and moderate are ordinary words ("High Court", "high tide", "low lying", "medium sized"): they name a severity only beside a word that says
 * so (high priority, low severity, medium level, high cases). One rule for the fast lane and the rules (RC-03).
 */
export const WEAK_SEV = new Set(["high", "medium", "moderate", "low"]);
export const SEV_NOUN = new Set(["priority", "severity", "risk", "level", "urgency", "cases", "complaints", "incidents", "issues", "problems", "ones", "case", "complaint", "incident", "issue"]);
