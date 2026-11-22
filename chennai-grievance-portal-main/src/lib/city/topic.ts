/**
 * Which part of the city a question is about (live traffic, the rain, the streets that flood, power or trains in heavy
 * rain), read by rules in English, Tamil and Tanglish. Pure and safe in the browser: Jarvis reads it before any model,
 * the chatbot and Ask the Map on the server; all three then answer from lib/city/now.ts.
 */
export type CityTopic = "traffic" | "flood" | "rain" | "power" | "metro" | "all";
export const CITY_TOPICS: CityTopic[] = ["traffic", "flood", "rain", "power", "metro", "all"];

const INCIDENT_WORDS = /\b(complaints?|grievances?|petitions?|cases?|incidents?|fir|firs)\b|புகார்|சம்பவ/i;
const LIVE_WORDS = /\b(live|now|right now|currently|at the moment|today|this (hour|morning|evening)|repeat\w*|again and again|cluster\w*|trouble spots?|hotspots?)\b|இப்போ|இப்போது|இப்ப|நேரடி/i;
// (v14, 21 Nov review of v13, routing 2: the stem நெரிசல without its pulli, so "ரொம்ப நெரிசலான இடம்" reads as traffic; ட்ராபிக் too)
const TRAFFIC = /\b(traffic|jams?|jammed|congest\w*|gridlock\w*|snarl\w*|bottlenecks?|road closures?|roads? (closed|blocked)|closed roads?|diversions?|slow[- ]moving|vehicles? (stuck|crawling)|bumper[- ]to[- ]bumper)\b|போக்குவரத்து|நெரிசல|டிராஃபிக்|டிராபிக்|ட்ராஃபிக்|ட்ராபிக்|\b(traffic|vandi) (jaasthi|adhigam|athigam|romba)\b/i;
// v13 (21 Nov review, finding 1 4): the Tamil-script "the current goes" when it rains ("கரண்ட் போகும்", "கரண்ட் எங்க போகும்", "மின்சாரம்
// துண்டிக்கப்படும்") read as power too; only "கரண்ட் இல்லை / போச்சு / கட்" were (the Tanglish form already reads as power in rehearsal/intent.ts)
const POWER = /\b((lose|loses|losing|lost|without) (power|electricity|current)|power (goes|went|going) (off|out)|power ?(cuts?|outages?|off|failures?|shut ?downs?|supply)|outages?|blackouts?|load[- ]?shedding|electricity (cuts?|off|failures?|outages?|supply)|current (cut|illa|illai|pochu|poch\w*)|no (power|electricity|current))\b|மின் ?(வெட்டு|தடை|நிறுத்தம்|விநியோகம்)|கரண்ட் ?(இல்லை|போச்சு|கட்)|கரண்ட்\s*(?:(?:எங்க|எங்கே|எங்கெல்லாம்|எந்த\s*\S+)\s*)?(?:போகும்|போயிடும்|போயிரும்|போகுமா|போயிருச்சு|கட்\s*ஆகும்)|மின்(?:சாரம்)?\s*(?:(?:எங்க|எங்கே|எங்கெல்லாம்)\s*)?(?:போகும்|தடை\s*ஆகும்|துண்டிக்கப்படும்|துண்டிக்கப்பட்ட)/i;
/**
 * v14 (21 Nov review of v13, routing 6 and scenarios 5): power in the rain said other ways: "where does power go off when it rains", "will
 * the power go if it rains tonight", "what about power if it rains", "power in heavy rain", the Tanglish "mazhai vandha current enga pogum"
 * (each fell to the rain gauges or to the planner). English "current" only with a Tanglish verb ("the current rain" is no power)
 */
const POWER_RAIN = /\b(?:power|electricity) (?:will |would |might |may |could |does |do )?(?:go|goes|going|went|gone) (?:off|out)\b|\b(?:power|electricity)\b[^.]{0,40}\b(?:if|when|whenever|once) it rains\b|\b(?:if|when|whenever) it rains\b[^.]{0,40}\b(?:power|electricity)\b|\b(?:power|electricity) (?:in|during|after) (?:the |a )?(?:heavy )?rains?\b|\b(?:current|karent|karant) (?:\w+ ){0,2}?(?:pogum|poghum|poidum|poyidum|poyirum|poirum|pogudhu|poguthu|povum|cut aagum|cut agum|kat aagum|off aagum)\b/i;
const METRO = /\b(metro (rail|trains?|lines?|stations?|services?)|cmrl|suburban (trains?|rail|lines?)|mrts|local trains?|electric trains?|train (delays?|services?|timings?)|trains? (late|delayed|running|cancel\w*)|railway (lines?|stations?))\b|மெட்ரோ ரயில்|மின்சார ரயில்|ரயில் (தாமத|சேவை)/i;
/** v14 (routing 6): trains in the rain said other ways: "which trains get delayed in rain", "metro in heavy rain" (both were the rain gauges) */
const METRO_RAIN = /\btrains? (?:get|gets|got|are|is|run|runs|go|goes) (?:\w+ )?(?:delayed|late|cancel\w*|stopped|disrupted|affected)\b|\b(?:metro|trains?|railways?) (?:in|during|after) (?:the |a )?(?:heavy )?rains?\b/i;
const FLOOD_STREETS = /\b(flood[- ]?(prone|streets?|spots?|risk|memory|zones? map)|streets? (that )?(flood|get flooded|go under)|(which|what) (streets?|roads?|areas?|places?|wards?) (flood|get flooded|go under|will flood|are flooded)|water[- ]?logging (prone|spots?|streets?)|where (does|will|did) (it|water) (flood|stand|stagnate)|low[- ]lying (streets?|areas?))\b|வெள்ள (அபாய|பாதிப்பு) (தெரு|இடங்)|தண்ணீர் தேங்கும் (தெரு|இடம்)/i;
/** how the rain stands now and what it does ("prepare for heavy rain" is Jarvis's rain mission and the Rain view's own: not here) */
const RAIN_IMPACT = /\b(rain (impact|effects?|situation|update|status)|what happens (when|if) it rains|in (heavy|the) rains?\b.{0,30}\b(what|which|how)|monsoon (status|update|situation)|rain (warning|alert) (now|today)|is it raining)\b|மழை (நிலவரம்|பாதிப்பு|எச்சரிக்கை)/i;
const ALL = /\b((city|chennai|district)('s)? (conditions?|status|situation) (now|today|right now)|on the ground now|live (situation|status|conditions|picture|update)|how is (the )?(city|chennai) (now|today|doing)|rain,? traffic|traffic,? rain|traffic and (power|rain|metro|flood\w*))\b|நகர நிலவரம்|சென்னை நிலவரம்/i;
const METRO_WATER = /\bmetro ?water\b|cmwssb|மெட்ரோ குடிநீர்/i;

/**
 * The part of the city a question is about, or null when it is not one of these (an incident question stays with the
 * incidents: "road accidents this month", "flooding complaints in Adyar"). Pure.
 */
export function cityTopic(text: string): CityTopic | null {
  const t = ` ${text.toLowerCase()} `;
  const incidents = INCIDENT_WORDS.test(t) && !LIVE_WORDS.test(t);
  if (ALL.test(t)) return "all";
  if (TRAFFIC.test(t) && !incidents && !/\btraffic (obstruction|violation|fines?|challans?|police (station|complaint))\b/i.test(t)) return "traffic";
  if ((POWER.test(t) || POWER_RAIN.test(t)) && !incidents) return "power";
  if ((METRO.test(t) || METRO_RAIN.test(t)) && !METRO_WATER.test(t) && !incidents) return "metro";
  if (FLOOD_STREETS.test(t) && !incidents) return "flood";
  if (RAIN_IMPACT.test(t) && !incidents) return "rain";
  return null;
}
