/**
 * Words that look like an event and are not (24 Nov 2026, from the owner's own screens):
 *
 *   "Kolathur MLA dies of cardiac ARREST"         was shown as a police arrest in the story's timeline
 *   "Heavy rain in 9 districts on KARTHIGAI DEEPAM" was shown as a storm named Karthigai Deepam
 *   "Why GTA 6 is a big deal" (Grand THEFT Auto)  was filed as theft
 *
 * Every rule that reads an event from a headline reads it through plainEvents() first, and every name taken from a weather
 * headline is checked with stormName(). Pure: no store, no model, safe in the browser.
 */

const IDIOMS: [RegExp, string][] = [
  // deaths, not arrests or attacks
  [/\b(?:sudden\s+)?(?:cardiac|cardio-?\s?respiratory|cardio-?\s?pulmonary|respiratory|heart)\s+arrests?\b/gi, "heart failure"],
  [/\bheart\s+attacks?\b/gi, "heart failure"],
  [/(?:கார்டியாக்|இதய|கார்டியக்)\s*(?:அரெஸ்ட்|அரஸ்ட்)/g, "மாரடைப்பு"],
  // an online fraud, not an arrest
  [/\bdigital(?:ly)?\s+arrest(?:s|ed)?\b/gi, "online fraud"],
  [/டிஜிட்டல்\s*(?:அரெஸ்ட்|கைது)/g, "ஆன்லைன் மோசடி"],
  // a video game, not a theft
  [/\bgrand\s+theft\s+auto\b|\bgta\s*(?:[ivx]+|\d)?\b/gi, "video game"],
  // a meeting, camp or function that took place, not a person held by the police
  [/\b(meetings?|meets?|camps?|talks|rall(?:y|ies)|functions?|events?|drives?|workshops?|consultations?|festivals?|exams?|examinations?|elections?|polls?|protests?|drills?|hearings?|inspections?|fairs?|conferences?|ceremon(?:y|ies)|reviews?|sessions?|programmes?|programs?|celebrations?|demonstrations?)\s+(?:(?:was|were|is|are|being|to be|will be|has been|have been)\s+)?held\b/gi, "$1 took place"],
  [/\b(?:to be|be|being|is|was|were|been|are)\s+held\s+(?=(?:on|at|in|from|across|today|tomorrow|this|next|every|between|during|till|until)\b)/gi, "taking place "],
  [/\b(?:hold|holds|held|holding)\s+(?:an?\s+|the\s+)?(?:\w+\s+){0,2}?(?=(?:meeting|talks|rally|protest|camp|inspection|review|drive|demonstration|function|workshop|consultation|hearing|press|discussion)s?\b)/gi, "conduct "],
  // organisations, not bodies
  [/\b(civic|local|student|students'?|governing|general|apex|statutory|trade|industry|regulatory|traders'?|merchants'?|farmers'?|doctors'?|teachers'?|sports|world|international|national|state)\s+bod(y|ies)\b/gi, "$1 organisation"],
  // protest by sitting, not the Special Investigation Team
  [/\bsit-?ins?\b/gi, "protest"],
  [/\b(?:food|tennis|basketball|badminton|squash|volleyball)\s+courts?\b/gi, "venue"],
  [/\bcrash\s+(?:course|diet)s?\b/gi, "course"]
];

/** The text with every look-alike phrase replaced by what it means, so an event word left in it is a real one. */
export function plainEvents(text: string): string {
  let t = String(text ?? "");
  for (const [re, to] of IDIOMS) t = t.replace(re, to);
  return t;
}

// ------------------------------------------------------------- occasions --

/**
 * Festivals, holidays, religious and public days: a date a forecast falls on, never part of the weather and never a storm's
 * name. English spellings as Chennai's outlets write them, and Tamil.
 */
const OCCASION = new RegExp("\\b(?:" + [
  "kar+th?i(?:g|k|h)ai", "kartik(?:a|i)?", "thirukarth?igai", "deepam", "maha ?deepam", "bharani ?deepam", "deepa(?:vali|thirunal|\\s+thirunal)?", "diwali", "pongal", "bhogi", "mattu", "kaanum",
  "thai(?:ppoosam|poosam| poosam|\\s+amavasai)", "panguni", "masi ?magam", "vaikunta", "ekadasi", "aadi", "aavani", "navarat(?:h)?ri", "saraswathi", "ayudha", "vijayadasami", "dussehra", "dasara",
  "vinayagar?", "vinayaka", "ganesh(?:a)?", "chathurthi", "krishna", "janmashtami", "gokulashtami", "rama ?navami", "maha ?shivarat(?:h)?ri", "shivarat(?:h)?ri", "holi", "onam", "ugadi",
  "ramzan", "ramadan", "eid", "bakrid", "muharram", "milad", "christmas", "easter", "good friday", "new year", "republic day", "independence day", "gandhi jayanthi", "may day",
  "children'?s day", "teachers'? day", "margazhi", "karthigai month", "sabarimala", "ayyappa", "brahmotsavam", "car festival", "theppam", "kumbabishekam", "kumbhabhishekam", "arubathimoovar",
  "festival", "thiruvizha", "thirunal", "jayanthi", "jayanti", "pournami", "amavasai", "poornima", "diwali day", "holiday", "weekend", "election day", "wedding", "match day"
].join("|") + ")\\b|கார்த்திகை|தீப(?:ம்|த்|ாவளி)|திருவிழா|திருநாள்|பொங்கல்|பண்டிகை|நவராத்திரி|விநாயகர்|சதுர்த்தி|ரம்ஜான்|கிறிஸ்துமஸ்|பௌர்ணமி|அமாவாசை|மார்கழி", "i");

/** Is this the name of a festival, holiday or other occasion? */
export const isOccasion = (name: string | null | undefined): boolean => !!name && OCCASION.test(String(name));

/** A storm word beside the name, in either order: "Cyclone Arnab", "'Arnab' cyclone", "Arnab storm", "அர்னாப் புயல்". */
const STORM = "(?:cyclone|cyclonic storm|severe cyclone|super cyclone|storm|புயல்)";
const STORM_ANY = /cyclone|cyclonic|\bstorm\b|புயல்/i;
const NOT_NAMES = new Set(("chennai tamil nadu tamilnadu india bay bengal severe breaking arabian the a an live approaching rains rain weather update latest very cyclonic storm cyclone " +
  "super new big massive heavy imd red orange yellow alert today tomorrow warning sea southwest southeast northeast northwest low pressure depression deep intense intensified coastal tropical " +
  "thunderstorm dust hail sand next another first second this that monsoon after before during due because when will has news").split(" "));
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A storm's name as one of these headlines gives it, or null. A name counts only when a headline writes it beside the word
 * cyclone or storm ("Cyclone Arnab", "'Arnab' cyclone", "Arnab storm"); a Tamil-only headline counts when it says புயல். A
 * festival or other occasion is never a storm's name, whatever a model answered.
 */
export function stormName(name: string | null | undefined, ...headlines: (string | null | undefined)[]): string | null {
  const n = String(name ?? "").replace(/^(?:cyclone|cyclonic storm|severe cyclonic storm|storm)\s+/i, "").replace(/['"‘’“”]/g, "").replace(/\s+/g, " ").trim();
  // the weather office gives one-word names
  if (!n || /\s/.test(n) || n.length < 3 || n.length > 14 || NOT_NAMES.has(n.toLowerCase()) || isOccasion(n)) return null;
  const q = "['\"‘’“”]?";
  const beside = new RegExp(`${STORM}\\s*${q}${escRe(n)}\\b|${q}\\b${escRe(n)}${q}\\s*(?:-\\s*)?${STORM}|${q}\\b${escRe(n)}${q}[^.!?]{0,60}\\bcyclon`, "i");
  for (const h of headlines) {
    const t = String(h ?? "");
    if (!t || !STORM_ANY.test(t)) continue;
    if (beside.test(t)) return n;
    // a Tamil headline spells the name in Tamil letters: the English name cannot be matched, the storm word vouches for it
    if (/[஀-௿]/.test(t) && !/[A-Za-z]{4}/.test(t) && /புயல்/.test(t)) return n;
  }
  return null;
}

/**
 * Does a text run a hazard and an occasion together as one thing ("Heavy rain Karthigai Deepam", "Cyclone Deepam")? "Rain on
 * Karthigai Deepam day" is a date and is fine.
 */
export function joinsOccasion(text: string): boolean {
  const m = /\b(?:heavy rains?|rainfall|rains?|cyclone|storm|thunderstorms?|floods?|flooding|heat ?wave|weather)\s+(?!(?:on|during|for|ahead|before|after|and|in|at|near|with|from|over|by|of|as|to)\b)([A-Za-z]+(?:\s+[A-Za-z]+)?)/gi;
  for (const x of String(text ?? "").matchAll(m)) if (isOccasion(x[1])) return true;
  return false;
}
