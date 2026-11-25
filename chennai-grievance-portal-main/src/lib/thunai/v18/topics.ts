/**
 * v18 (24 Nov): kinds of incident in groups, as the Collector names them ("summary of crimes", "everything on flooding", "health issues").
 * The owner: "if I ask the summary of crimes happening, it's giving the overall summary". A group is the pipeline's own family of
 * categories (ref_categories.family), so "crimes" counts violent crime, theft, crimes against women, drugs, missing persons and suicides
 * together, never one category for all of them and never the whole district.
 */

export const TOPICS = {
  CRIME: { en: "Crime", ta: "குற்றங்கள்", cats: ["CRIME_VIOLENT", "CRIME_PROPERTY", "CRIMES_AGAINST_WOMEN", "DRUGS_LIQUOR", "MISSING_PERSON", "SUICIDE_SELF_HARM"],
    said: "crimes of every kind: murder, assault, theft, chain snatching, fraud, crimes against women and children, drugs, liquor, missing persons, suicides" },
  FLOOD: { en: "Flooding and water bodies", ta: "வெள்ளம், நீர்நிலைகள்", cats: ["FLOOD_WATERLOGGING", "FLOOD_RELIEF", "FLOOD_RISK_SIGNAL", "WATERBODY_INFRA"],
    said: "flooding, waterlogging, flood relief, flood warnings, lakes, bunds and sluices" },
  DRAINAGE: { en: "Drains, sewage and water supply", ta: "வடிகால், கழிவுநீர், குடிநீர்", cats: ["DRAINAGE_SEWAGE", "DRAIN_WORKS_SAFETY", "WATER_SUPPLY"],
    said: "drains, sewage overflow, drain works, drinking water supply" },
  ROADS_TRAFFIC: { en: "Roads and traffic", ta: "சாலைகள், போக்குவரத்து", cats: ["ROAD_ACCIDENT", "ROAD_DAMAGE", "TRAFFIC_OBSTRUCTION"],
    said: "road accidents, potholes, damaged roads and bridges, traffic obstruction, parking" },
  WASTE_SANITATION: { en: "Garbage and sanitation", ta: "குப்பை, சுகாதாரம்", cats: ["SOLID_WASTE", "SANITATION_TOILETS"],
    said: "garbage, solid waste, public toilets, open defecation" },
  HEALTH: { en: "Health", ta: "சுகாதாரம்", cats: ["VECTOR_DISEASE", "HEALTH_SERVICES", "FOOD_SAFETY", "STRAY_ANIMALS"],
    said: "dengue and fevers, hospitals, food safety, stray animals" },
  ELECTRICAL: { en: "Street lights and electrical hazards", ta: "தெரு விளக்குகள், மின் ஆபத்துகள்", cats: ["STREETLIGHT_ELECTRICAL"],
    said: "street lights, live wires, electrical hazards" },
  PUBLIC_ORDER: { en: "Public order", ta: "பொது ஒழுங்கு", cats: ["PUBLIC_ORDER", "POLICE_OTHER"],
    said: "protests, public nuisance, other police matters" },
  PUBLIC_SAFETY: { en: "Public safety", ta: "பொதுப் பாதுகாப்பு", cats: ["FIRE_EXPLOSION", "DARK_SPOT_SAFETY"],
    said: "fires, explosions, dark spots" },
  STRUCTURES_LAND: { en: "Buildings and encroachment", ta: "கட்டடங்கள், ஆக்கிரமிப்பு", cats: ["BUILDING_SAFETY", "ENCROACHMENT"],
    said: "unsafe buildings and walls, encroachment, unauthorised construction" },
  ENVIRONMENT: { en: "Pollution", ta: "மாசு", cats: ["AIR_POLLUTION"], said: "air pollution, smoke, burning" },
  GREEN: { en: "Trees and parks", ta: "மரங்கள், பூங்காக்கள்", cats: ["TREES_PARKS"], said: "fallen trees, parks, playgrounds" },
  WORKS: { en: "Public works", ta: "பொதுப் பணிகள்", cats: ["PUBLIC_WORKS", "CIVIC_FACILITIES"], said: "public works quality, worksites, civic buildings" },
  ADMIN: { en: "Civic services", ta: "குடிமைச் சேவைகள்", cats: ["ADMIN_SERVICES"], said: "tax, certificates, electoral services" }
} as const;
export type Topic = keyof typeof TOPICS;
export const TOPIC_KEYS = Object.keys(TOPICS) as Topic[];
export const isTopic = (x: unknown): x is Topic => typeof x === "string" && Object.hasOwn(TOPICS, x);

/** The categories of a group that the world knows (a test's world may hold fewer). */
export function topicCats(t: Topic, known?: readonly { code: string }[]): string[] {
  const cats = [...TOPICS[t].cats] as string[];
  return known?.length ? cats.filter((c) => known.some((k) => k.code === c)) : cats;
}

/** The group a single category belongs to (for "and the rest of crime?"). */
export function topicOf(cat: string | null | undefined): Topic | null {
  if (!cat) return null;
  for (const k of TOPIC_KEYS) if ((TOPICS[k].cats as readonly string[]).includes(cat)) return k;
  return null;
}

/**
 * The words that name each group, in English, Tamil and Tanglish. The reader's group is kept only when the sentence (or the reader's own
 * restatement of it, which carries what a follow-up points back to) says one of them: the probe of 24 Nov read "which zone had the most cases
 * between 15 and 20 November" as the civic-services group, with no word of it said.
 */
const TOPIC_WORDS: Record<Topic, RegExp> = {
  CRIME: /crime|criminal|theft|thie[fv]|robber|murder|assault|snatch|fraud|kidnap|drug|ganja|liquor|missing|suicide|rape|harass|stab|குற்ற|கொலை|திருட்டு|கொள்ளை|வழிப்பறி|கஞ்சா|kutra|kolai|thiruttu|kollai/i,
  FLOOD: /flood|waterlog|inundat|lake|bund|sluice|surplus|வெள்ள|ஏரி|தண்ணீர் தேங்|vellam|thanni/i,
  DRAINAGE: /drain|sewage|sewer|manhole|water supply|drinking water|metro ?water|வடிகால்|கழிவுநீர்|குடிநீர்|சாக்கடை/i,
  ROADS_TRAFFIC: /road|pothole|traffic|accident|parking|bridge|footpath|சாலை|போக்குவரத்து|விபத்து|பள்ளம்|trafic/i,
  WASTE_SANITATION: /garbage|waste|trash|dump|sanitation|toilet|defecat|kuppai|குப்பை|கழிப்பறை|சுகாதாரக்கேடு/i,
  HEALTH: /health|dengue|fever|malaria|disease|hospital|food safety|meat|stray|dog|சுகாதார|டெங்கு|காய்ச்சல்|மருத்துவ|நாய்/i,
  ELECTRICAL: /street ?light|lamp|electric|live wire|power cable|மின்|விளக்கு/i,
  PUBLIC_ORDER: /protest|nuisance|public order|agitation|rally|police matter|போராட்ட|மறியல்|ஆர்ப்பாட்ட/i,
  PUBLIC_SAFETY: /fire|explosion|blast|dark spot|unsafe|public safety|தீ விபத்து|வெடி|இருட்டு/i,
  STRUCTURES_LAND: /building|wall|collapse|encroach|construction|கட்டட|கட்டிட|சுவர்|ஆக்கிரமிப்/i,
  ENVIRONMENT: /pollution|smoke|burning|air quality|மாசு|புகை/i,
  GREEN: /tree|park|playground|மரம்|பூங்கா/i,
  WORKS: /public works|worksite|work site|civic building|பொதுப்பணி|பணியிட/i,
  ADMIN: /tax|certificate|electoral|voter|civic service|வரி|சான்றிதழ்|வாக்காளர்/i
};
/** Does this text name the group? */
export const topicSaid = (t: Topic, text: string): boolean => TOPIC_WORDS[t].test(text);

/** The groups as the reader's prompt lists them. */
export const topicsLine = (): string => TOPIC_KEYS.map((k) => `${k} (${TOPICS[k].said})`).join("; ");
