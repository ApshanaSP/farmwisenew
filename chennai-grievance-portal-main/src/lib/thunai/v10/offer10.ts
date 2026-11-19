/**
 * v10 (docs/jarvis/JARVIS_V10.md 4.5 and 4.9 feature 1): after a news brief, the next steps it offered and the story it was about, kept for the
 * NEXT turn only (one pending offer, forgotten on any other turn: Thunai.tsx clears it as each sentence comes). What a reply does:
 *
 *   "yes" / "sure" / "ஆமா" / "சரி"                         the first step offered (the brief's pick)
 *   "show them on the map", "map-la kaattunga", "வரைபடத்தில் காட்டுங்க"   Ask the Map with the cases' question (the console's own askOnMap)
 *   "draft a note to the officer", "officer-ku note draft pannunga", "அதிகாரிக்கு ஒரு குறிப்பு எழுதுங்க"
 *                                                          a note on the oldest case, into the tray (level C: never sent; the Collector taps Send)
 *   "follow it", "follow pannunga", "கவனிச்சுக்கோங்க"            the story's zone followed, through the follow flow and its yes (level B)
 *   "read it fully", "full-a padinga", "முழுசா படிங்க"            the whole story (the news route, `full: true`)
 *   "what do we have on this?", "idha pathi namma kitta enna irukku?", "இதைப் பற்றி நம்மகிட்ட என்ன இருக்கு?"
 *                                                          news to ground truth: what the console holds on the story (the news route, `ground`)
 *   "no", "not now", "வேண்டாம்"                                 the offer put away
 *
 * A sentence that names another case, place, zone or kind of complaint is no reply ("any complaints in Teynampet?"): the lanes take it.
 *
 * Pure and browser-safe: no network, no React. The Tamil and Tanglish phrasings are MODEL-DRAFTED and need a Tamil speaker's review.
 */
import { readPeriod } from "@/lib/period/read";
import { asciiDigits } from "../digits";
import { DEPT_ALIASES, ZONES } from "../lexicon";
import { fullRead } from "../newsask";
import { catIn, placesIn, zonesIn } from "../quick";
import { checkStage, type StageDocT } from "../stage";
import type { Lang, World } from "../types";

export type OfferKind = "map" | "draft" | "follow" | "full";
export interface Offer10 {
  /** the story's stored id */
  story: string;
  lang: Lang;
  /** the steps offered, the pick first */
  offers: OfferKind[];
  /** the question Ask the Map is asked */
  map: string | null;
  /** the case a note is drafted on */
  draft: string[];
  /** the zone followed */
  follow: { zone: number; en: string; ta: string } | null;
  /** the story names a place in the district */
  civic: boolean;
  /** when it was offered (ms) */
  at: number;
  /** no offer was said aloud (the whole story was read, and it ends on its last sentence): a bare "okay" takes none of the steps */
  unsaid?: true;
}
/** an offer older than this is no longer "the one just made" */
export const OFFER_MS = 120_000;

const ID = /^[A-Za-z0-9_:.-]{1,80}$/;
const KINDS = new Set<OfferKind>(["map", "draft", "follow", "full"]);
/** The offer an "offer" event carries (web/serve.ts), checked: anything malformed is no offer. */
export function offerOf(e: Record<string, unknown>, lang: Lang, now: number): Offer10 | null {
  if (typeof e.story !== "string" || !ID.test(e.story)) return null;
  const offers = (Array.isArray(e.offers) ? e.offers : []).filter((x): x is OfferKind => KINDS.has(x as OfferKind)).slice(0, 2);
  const map = typeof e.map === "string" && e.map.trim() && e.map.length <= 200 ? e.map.trim() : null;
  const draft = (Array.isArray(e.draft) ? e.draft : []).filter((x): x is string => typeof x === "string" && ID.test(x)).slice(0, 3);
  const f = e.follow as { zone?: unknown; en?: unknown; ta?: unknown } | null | undefined;
  const follow = f && Number.isInteger(f.zone) && Number(f.zone) >= 1 && Number(f.zone) <= 15 && typeof f.en === "string" && typeof f.ta === "string"
    ? { zone: Number(f.zone), en: f.en.slice(0, 60), ta: f.ta.slice(0, 60) } : null;
  return { story: e.story, lang, offers, map, draft, follow, civic: e.civic === true, at: now, ...(e.unsaid === true ? { unsaid: true as const } : {}) };
}

export type OfferAct =
  | { act: "map"; q: string }
  | { act: "draft"; ids: string[] }
  | { act: "follow"; zone: number; name: { en: string; ta: string } }
  | { act: "full"; id: string }
  | { act: "ground"; id: string }
  | { act: "no" }
  /** a step this story has none of ("draft a note" with no open case on it): said so */
  | { act: "none"; what: "map" | "draft" | "follow" };

const flat = (s: string) => s.normalize("NFC").toLowerCase().replace(/[’']/g, "'").replace(/[.?!,;:]+/g, " ").replace(/\s+/g, " ").trim();
// ("okay thanks", "thanks": that's all, as v9's plainYes reads it, never a yes: v10 review 2, finding 8)
const NO = /^(?:no|nope|not now|no thanks|no thank you|leave it|that's all|that's it|nothing|later|(?:ok |okay )?(?:thanks|thank you)|வேண்டாம்|இல்லை|இல்ல|இப்போ வேண்டாம்|இப்போது வேண்டாம்|vendaam|venaam|vendam|venam|illa|illai|parava illa|paravaillai)(?: (?:thanks|thank you|jarvis|now))*$/u;
// (round 3: and a "don't" said as the verb's own ending: "இதை கவனிக்காதீங்க", "ஃபாலோ பண்ணாதீங்க", "கவனிக்காதே", "map-la kaattadheenga")
// (round 4: on the offer's own verbs only, show, write, send, follow, read, tell, put, or "do nothing": a "don't" on another verb asks for the step,
// "எழுத மறக்காதீங்க" (don't forget to write), "கவலைப்படாதீங்க" (don't worry), "தாமதிக்காதீங்க", "எதையும் விடாதீங்க", "anuppa marakkadheenga"; and the
// verb's "go ahead and" form, "அனுப்பிடாதீங்க", "anuppidaadheenga")
const NEGATED = /\b(?:don't|dont|do not|no need|never)\b|வேண்டாம்|வேணாம்|\bvendaam\b|\bvenaam\b|\bvendam\b|(?:காட்ட|எழுத|அனுப்ப|கவனிக்க|படிக்க|சொல்ல|போட|(?:ஃபாலோ|பாலோ|டிராக்|டிராஃப்ட்|டிராப்ட்|வரைவு|இதை|அதை|இதைக்|அதைக்|எதுவும்|எதையும்|ஒன்றும்|ஒண்ணும்)\s*(?:பண்ண|செய்ய))(?:ி[டற])?(?:ாதீங்க|ாதீர்|ாதே(?=\s|$))|\b(?:kaa?tt?|ezhudh|ezhuth|eludh|eluth|anupp?|kavanikk?|padikk?|soll|pod|(?:follow|track|draft|map|adha|idha|adhai|idhai|edhuvum|ethuvum|edhayum|onnum)\s+pann)(?:i[dr])?aa?(?:dh|th)(?:ee|i)nga\b/u;
/** the offer's own question ("Shall I show them on the map, ...", "வரைபடத்தில் காட்டட்டுமா"): Jarvis's words, not the Collector's */
const OWN = /\bshall i\b|காட்டட்டுமா|செய்யட்டுமா|படிக்கட்டுமா|சொல்லட்டுமா/u;
const YES = /^(?:(?:jarvis|ok|okay)\s+)?(?:yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|please do|please|yes please|ஆமா|ஆமாம்|ஆம்|சரி|சரிங்க|பண்ணுங்க|aama|aamam|aamaa|sari|seri|seringa|pannunga)(?:\s+(?:please|jarvis|sir|do it|go ahead|பண்ணுங்க|பண்ணு|pannu|pannunga))*$/u;
/** the map named, in any of the three languages; or a plain "show them" */
const MAP = /\bmaps?\b|\bmap-?(?:la|le|il|ula|ah|a)\b|வரைபட|மேப்/u;
/**
 * the map's own controls: one as the sentence's verb ("close the map", "can you zoom in on the map", "map-a close pannunga", "வரைபடத்தை மூடுங்க"),
 * or the map's furniture (its legend, layers, satellite view); not the story's cases on it. A control word inside the sentence is no control: "the
 * cases close to the bus stop", "show them on the map and zoom in" are the story's (v10 review 2, finding 2; round 2)
 */
const MAP_CONTROL = /^(?:(?:ok|okay|jarvis|please|now|hey|can you|could you|would you|will you)\s+)*(?:close|hide|clear|reset|zoom|switch|turn|toggle|remove|export|save|download|print|share|exit|minimi[sz]e|maximi[sz]e|pan|centre|center)\b|\b(?:legend|layers?|satellite|base ?map|heat ?map|street view|terrain)\b|\b(?:close|hide|clear|reset|zoom|switch off|off|remove|save|download)\s*(?:pannu\w*|panni\w*|pannidu\w*)|மூடு|மறைத்|மறைச்|மறையுங்க|ஜூம்|பெரிதாக்கு|சிறிதாக்கு/u;
/**
 * A control word anywhere is the map's own, as it was before round 2, unless the Collector asked to show first ("show them on the map and zoom
 * in", "show the cases close to the bus stop"): "just close the map", "no, close the map", "you can hide the map now" (v10 review 2, round 3)
 */
const CONTROL_ANY = /\b(?:close|hide|clear|reset|zoom|switch|turn off|export|save|download)\b/;
const SHOW_VERB = /\b(?:show|plot|pull up|put|mark|display)\b/;
function mapControl(t: string): boolean {
  if (MAP_CONTROL.test(t)) return true;
  const c = t.search(CONTROL_ANY), v = t.search(SHOW_VERB);
  return c >= 0 && (v < 0 || v > c);
}
const SHOW = /^(?:(?:yes|ok|okay|sure|please|jarvis)\s+)*(?:show|plot|pull up)(?: (?:it|them|those|that|these|me|me them|the area|the cases|the complaints|the place))?(?: (?:please|jarvis))*$|^(?:சரி |ஆமா )?(?:காட்டு|காட்டுங்க|காட்டுங்கள்)$|^(?:sari |aama )?(?:kaattu|kaatu|kaattunga|kaatunga)$/u;
const DRAFT = /\bdraft\b|\b(?:write|send|prepare)(?: (?:a|an|the))? (?:note|letter|mail|e-?mail|message|memo)\b|\b(?:note|letter|mail|message|memo) to (?:the )?(?:officer|ae|ee|aee|engineer|department|dept|official)\b|\b(?:officer|ae|department|dept)-?(?:ku|kku|ukku|kitta)\b.*\b(?:note|letter|mail|ezhudhu\w*|ezhuthu\w*|eluthu\w*)\b|டிராஃப்ட்|டிராப்ட்|வரைவு|குறிப்பு\s*எழுது|கடிதம்\s*எழுது|மெயில்\s*எழுது|அதிகாரிக்கு.*(?:எழுது|குறிப்பு|அனுப்பு)/u;
// (Tanglish and Tamil anchored as the English is, the story or nothing followed: "Teynampet zone follow pannunga" and "officer-a follow pannunga"
// are another zone's and an officer's: v10 review 2, finding 2)
// (round 2: the zone the offer itself names is the story's, said as "this" first by ownAsThis: "Adyar zone-a follow pannunga", "அடையாறு
// மண்டலத்தைக் கவனியுங்க"; and "ஜார்விஸ்", "ஓகே" before it in Tamil as "jarvis", "ok" are in English and Tanglish)
const FOLLOW = /^(?:(?:yes|ok|okay|sure|please|jarvis|hey)\s+)*(?:follow|track|keep (?:an )?eye on|keep watching|watch)(?: (?:it|this|that|them|the story|this story|that story|this one|that one|the area|the zone|the place))?(?: (?:for me|please|jarvis))*$|^(?:(?:sari|seri|ok|okay|aama|yes|jarvis|hey)\s+)*(?:(?:idha|idhai|ithai|adha|adhai|athai|this|it|that|(?:indha|intha|andha|antha) (?:story|news|zone|area|place)(?:-?a)?)\s+)?(?:follow\s*(?:pannu|pannunga|pannungo|panni|pannidunga|pannidu)|kavanich\w*)(?:\s+(?:please|jarvis|sir))*$|^(?:(?:சரி|ஆமா|ஆமாம்|ஓகே|ஜார்விஸ்|sari|ok|okay|jarvis)\s+)*(?:(?:இதை|அதை|இந்தச்?\s*\S+|அந்தச்?\s*\S+)\s+)?(?:(?:ஃபாலோ|பாலோ|டிராக்)\s*பண்ண\S*|கவனி\S*(?:\s+கொள்\S*)?)(?:\s+(?:ப்ளீஸ்|ஜார்விஸ்|please|jarvis))*$/u;
/**
 * "the full report on overdue cases": a report of the console's own records (its cases, complaints, zones, wards, departments), not the story read
 * whole (v10 review 2, finding 2); "the full report in Tamil" or "of The Hindu" is still the story's (round 2: any word after "report on/of/in" was
 * taken for the console's). A place, a kind, a time or a status named is aboutElse's.
 */
// (round 3: in Tamil the console's records, many of them: "புகார்கள் பற்றி முழுசா சொல்லுங்க"; one incident or case is the story's: "அந்த சம்பவத்தைப்
// பற்றி முழுசா படிங்க")
const FULL_OF = /\b(?:report|list|details?|data|summary|breakdown|status|numbers|figures|stats|statistics) (?:on|of|about|for|in|from) (?:\S+ ){0,4}?(?:cases?|complaints?|incidents?|grievances?|petitions?|tickets?|records?|zones?|wards?|departments?|depts?|the console|the dashboard)\b|புகார்கள்|வழக்குகள்|சம்பவங்கள்/u;

/** "what do we have on this?": the console's records on the story just read (it must point at the story, or be short enough to) */
const GROUND_EN = /\bwhat (?:do|have|did) we (?:got|have|know|hold)\b|\bwhat have we got\b|\bdo we have (?:any(?:thing)?|complaints?|cases?|records?|incidents?|grievances?)\b|\b(?:any|are there(?: any)?) (?:open )?(?:complaints?|cases?|incidents?|grievances?)\b|\bwhat (?:does|do|did) (?:the console|our (?:data|records?|console)|the records?|the data|the dashboard) (?:say|show|have|hold)\b|\b(?:anything|what'?s|what is) (?:on|in) (?:the console|our (?:records?|data|console|side)|the dashboard)\b|\bground truth\b|\bcheck (?:it |this |that )?(?:against|with) (?:the console|our (?:records?|data))\b|\bhave (?:people|citizens|residents) complained\b/;
// ("are there any ..." and "this week" are no pointing: only a "there" after the ask, and a "this" that is no time, is: v10 review 2, finding 2)
const DEIXIS = /\b(?:this|that)\b(?! (?:week|month|year|morning|evening|afternoon|night|quarter|time)\b)|\b(?:it|these|those|here|the story|this story|that story|the place|that place|this one|the area)\b|(?<!\b(?:are|is|was|were) )\bthere\b|\bground truth\b|\b(?:the console|our (?:records?|data|console|side)|the dashboard)\b/;
const GROUND_TA = /(?:நம்ம?\s*(?:கிட்ட|கிட்டே|இடம்)|நம்மகிட்ட|நம்மிடம்|நம்மளோட|கன்சோல்(?:ல|லே|ில்)).*(?:என்ன|இருக்கா|இருக்கிறதா|உள்ளதா)|புகார்(?:கள்)?\s*(?:ஏதாவது|ஏதும்|எதுவும்)?\s*(?:இருக்கா|இருக்கிறதா|உள்ளதா|வந்திருக்கா|வந்திருக்கிறதா)/u;
const GROUND_TG = /\bnamma (?:kitta|kita|kitte|data ?la|records? ?la|console ?la)\b|\b(?:complaints?|cases?) (?:edhavadhu |ethavathu |edhachum |ethachum |ethuvum )?(?:irukka|irukaa|irukkaa|iruka|vandhirukka|vanthirukka)\b/;
/** the ask's words: Tamil and Tanglish as they are, English pointing at the story or short (where it names is the caller's to tell) */
const groundWords = (t: string, nfc: string) => GROUND_TA.test(nfc) || GROUND_TG.test(t) || (GROUND_EN.test(t) && (DEIXIS.test(t) || t.split(" ").length <= 6));
export function groundAsk(raw: string): boolean {
  const t = flat(raw), nfc = raw.normalize("NFC");
  if (!t || t.length > 200) return false;
  if (GROUND_TA.test(nfc) || GROUND_TG.test(t)) return true;
  // a short ask that names a place or a time is a question of its own ("any complaints in Teynampet?"); "at all", "in the system", "for now" name
  // neither (v10 review 2, round 2: any word after "in", "at" or "for" was taken for a place)
  return GROUND_EN.test(t) && (DEIXIS.test(t) || (t.split(" ").length <= 6 && !namesWhere(raw, t)));
}

/** no world given (a test, or before the console's names load): the zones' names from the lexicon alone (quick.ts reads them), a locality by placeWords */
const BARE: World = { zones: [], depts: [], cats: [], taluks: [], places: [], reservoirs: [] };
/** the sentence as quick.ts reads it: lower case, words between single spaces, a space at each end */
const spaced = (s: string) => ` ${asciiDigits(s.normalize("NFC").toLowerCase()).replace(/[’']/g, "").replace(/[^a-z0-9஀-௿]+/g, " ").replace(/\s+/g, " ").trim()} `;
/** a case by its id ("INC-2026-123", "case number 45"), and a ward */
const CASE_ID = /\b[a-z]{2,6}-\d[\w-]*|\b(?:case|incident|complaint|ticket|petition)s?(?: (?:no|number))? #?\d{2,}\b/g;
const WARD = /\bwards?(?: (?:no|number))? ?\d|வார்டு/u;
/** a status: a question of the console's own ("the overdue cases") */
const STATUS = /\b(?:overdue|pending|closed|resolved|escalated|reopened|sla|severity|severe|critical)\b|காலக்கெடு|நிலுவை/u;
/** the departments' names of more than one word ("metro water", "storm water drains"): a kind's word inside one is no kind of complaint */
const DEPT_PHRASES = [...new Set(Object.values(DEPT_ALIASES).flat().filter((a) => /\s/.test(a.trim())).map(spaced))];
const withoutDepts = (s: string, w: World) => [...DEPT_PHRASES, ...w.depts.map((d) => spaced(d.name.replace(/\s*\([^)]*\)/g, "")))].reduce((x, a) => (a.trim().includes(" ") ? x.split(a).join(" ") : x), s);
/** the departments' and public bodies' names, and their codes' parts ("metro water", "cmwssb", "gcc"): one after "at" is no place ("the officer at
 * Metro Water", "at GCC": v10 review 2, round 2) */
const ORGS = new Set([...Object.values(DEPT_ALIASES).flat(), ...Object.keys(DEPT_ALIASES).flatMap((c) => c.split("-"))].map((a) => spaced(a).trim()).filter((a) => a.length >= 2));
/** a body's head noun ("Greater Chennai Corporation", "the zonal office"), and an officer's */
const ORG_HEAD = new Set(["corporation", "department", "dept", "board", "office", "collectorate", "secretariat", "headquarters", "division", "wing", "section", "authority", "commission", "ministry", "directorate", "station", "cell", "unit", "officer", "engineer"]);
function orgsOf(w: World): Set<string> {
  const out = new Set(ORGS);
  for (const d of [...w.depts, ...(w.bodies ?? [])]) {
    out.add(spaced(d.name.replace(/\s*\([^)]*\)/g, "")).trim());
    for (const m of d.name.matchAll(/\(([^)]+)\)/g)) out.add(spaced(m[1]).trim());
    for (const p of d.code.split("-")) out.add(spaced(p).trim());
  }
  return out;
}
/** words after "in", "at", "near" or "around" that name no place: an amount, a manner, a language, the console, the map, a pronoun, a preposition
 * ("at all", "in the system", "at the moment", "in Tamil", "in charge", "at once"); a time or a period is readPeriod's */
const NOT_PLACE_EN = new Set(("the a an this that these those it its them us me my our your their his her here there all once charge general total full detail details short " +
  "brief particular question progress time present least last first most any some every each one now today tonight tomorrow yesterday morning evening " +
  "afternoon night english tamil tanglish writing person mind order view front advance fact sum depth case cases place area places areas between " +
  "which what where whole effect bulk common future system console dashboard screen data records record list tray news story report article map maps " +
  "zone zones ward wards jarvis on of for to with by from into onto and or but if so as up down out over under near around at in about").split(" "));
/** the words before a Tanglish "-la" that name no place ("map-la", "namma data la", "zone-la") */
const NOT_PLACE_TG = new Set(("map maps console data record records dashboard screen system idhu adhu ithu athu inga anga enga namma news story tamil english list zone " +
  "area place idam page phone office report mail tray week month year morning evening today ippo ippa total mothama case cases complaint complaints full").split(" "));
/** a Tamil word with a place's case ending ("வேளச்சேரியில்", "பெரம்பூர்ல", "அடையாறுல"), never a doubled "ல்ல" (இல்ல, சொல்ல) */
const taLocative = (x: string) => /^[஀-௿]{2,}(?:ில்|ிலே|ில|ுல|ுலே)$/u.test(x) || (x.length >= 4 && /்ல$/u.test(x) && !/ல்ல$/u.test(x));
/** such Tamil words that name no place: this, there, the console, the map, the data, the story, an area, a zone, a time, a language, the office */
const TA_NOT_PLACE = /^(?:இத|அத|இங்க|அங்க|எங்க|இந்த|அந்த|கன்சோல|வரைபட|மேப|டேட்டா|தரவ|பதிவ|செய்த|பகுத|இடத|இடம|மண்டல|தமிழ|ஆங்கில|இங்கிலீஷ|சிஸ்ட|மொத்த|லிஸ்ட|பட்டியல|திரை|ஸ்க்ரீன|நம்ம|வார|மாத|நாள|வருட|காலை|மாலை|இரவ|இப்போ|தற்போ|கணக்க|ரிப்போர்ட|ஸ்டோர|நியூஸ|கணின|டேஷ்போர்ட|புகார|அலுவல|ஆபீஸ|துறை|உண்மை|நிஜ)/u;
/** "this", "that", "last", "next" before it: the area pointed at, or a time ("இந்தப் பகுதியில்", "கடந்த வாரத்தில்") */
const TA_POINT = /^(?:இந்த|இந்தப்|இந்தச்|இந்தத்|அந்த|அந்தப்|அந்தச்|அந்தத்|இதே|அதே|கடந்த|போன|அடுத்த)$/u;
/** a word ending as the district's and its suburbs' localities do (Chetpet, Medavakkam, Gopalapuram, Tambaram, Shenoy Nagar, Selaiyur; in Tamil, in its
 * case forms: சேத்துப்பட்டில், மேடவாக்கத்துல, தாம்பரத்தில், குரோம்பேட்டையில், சேலையூர்ல), or the district's own (Chennai, சென்னையில்): a place, in lower
 * case or Tamil, though the console's names lack it */
const PLACE_EN = /^(?:[a-z.]{2,}(?:pet|pett(?:ai|ah)|[bpv]akkam|puram|[bv]aram|nagar|chavadi|thangal|[mb]edu|kuppam|palayam|pore|[^aeiou](?:ur|oor))|chennai|madras)$/;
const PLACE_TA = /(?:ப்பட்டு?|பேட்டை?|பாக்கத்து?|வாக்கத்து?|புரத்து?|வரத்து?|பரத்து?|ூர்?|நகர்?|சாவடி|தாங்கல்?|மேட்டு?|^சென்னை)(?:ில்|ிலே|ுல|ுலே|யில்|யிலே|்ல|ல)$/u;

/**
 * The places a sentence names by the words around them, held by the world or not: a name after "in", "at", "near" or "around" (in any case, as typed
 * or captioned), one with a Tanglish "-la", a Tamil word with a place's case ending. Each is given as the ways it may be read (an English name as
 * its first one, two and three words; a Tamil one alone and with the word before it). The words that name no place, a department or public body,
 * a time are left out (v10 review 2, round 2: only a capitalised English name was found without the world, so "வேளச்சேரியில் புகார் ஏதாவது
 * இருக்கா?" and "show the drainage complaints in velachery on the map" were taken for the story's).
 */
function placeWords(raw: string, t: string, w: World, from = false): string[][] {
  const nfc = raw.normalize("NFC"), orgs = orgsOf(w), out: string[][] = [];
  // With the console's names (the district's localities and taluks), a lower-case or Tamil word they do not hold is far likelier an ordinary
  // word ("in terms of", "in bullet points", "email-la", "விஷயத்துல", "வாட்ஸ்அப்பில்") than a place: only a name written as one (capitalised, as
  // round 1 read it) is read by the words around it, the rest by the world's names (v10 review 2, round 3). Without them, every script, as round 2.
  // (round 4: and, with them, a word shaped as a locality's name is one, in lower case or Tamil: "any complaints in chetpet?", "தாம்பரத்தில்")
  const world = w.places.length > 0 || w.taluks.length > 0;
  const cased = nfc.replace(/[’']/g, "'").replace(/[.?!,;:]+/g, " ").replace(/\s+/g, " ").trim();
  const named = (i: number) => !world || (cased.length === t.length && /\p{Lu}/u.test(cased[i] ?? ""));
  // an acronym alone after "at" ("at GCC", "at CMWSSB"): a body; after "near" or "in" it is a road or a place ("near OMR", "in ECR": round 3)
  const acr = new Set([...nfc.matchAll(/\b[Aa]t (?:the )?([A-Z]{2,8})\b(?! \p{Lu})/gu)].map((m) => m[1].toLowerCase()));
  // (each "in", "at", "near" read, none swallowed by the one before: "in velachery near adyar"; a name ends at a word that names no place)
  // ("from" too, for an ask of the cases or a note, not the story read whole, whose "from" is its outlet: "any complaints from Medavakkam?": round 3)
  for (const m of t.matchAll(/\b(in|at|near|around|from) (?=([a-z][\w.]*(?:-[a-z]+)*(?: [a-z][\w.]*){0,2}))/g)) {
    if (m[1] === "from" && !from) continue;
    const all = m[2].replace(/-(?:la|le|ula|a|ah|aa)$/, "").split(" ");
    if (NOT_PLACE_EN.has(all[0]) || (m[1] === "at" && acr.has(all[0]))) continue;
    const cut = all.findIndex((x) => NOT_PLACE_EN.has(x));
    const ws = cut > 0 ? all.slice(0, cut) : all;
    if (!named(m.index + m[0].length) && !ws.some((x) => PLACE_EN.test(x))) continue;
    // a department or body after "in", "at" or "from" ("the officer at Metro Water"); after "near" or "around", a name is a place ("near Central
    // Station", "near Chetpet station": round 3)
    if (m[1] !== "near" && m[1] !== "around" && ws.some((x, i) => orgs.has(ws.slice(0, i + 1).join(" ")) || ORG_HEAD.has(x))) continue;
    if (readPeriod(ws.join(" ")).kind !== "none") continue;
    out.push(ws.map((_, i) => ws.slice(0, i + 1).join(" ")));
  }
  for (const m of t.matchAll(/\b([a-z][a-z.]{2,})(?:-| )(?:la|le|ula|lae)\b/g)) if ((named(m.index) || PLACE_EN.test(m[1])) && !NOT_PLACE_TG.has(m[1]) && !orgs.has(m[1])) out.push([m[1]]);
  for (const m of nfc.matchAll(/\b(\p{Lu}\p{L}{3,})(?:la|ula)\b/gu)) { const x = m[1].toLowerCase(); if (!NOT_PLACE_TG.has(x) && !orgs.has(x)) out.push([x]); }
  const toks = t.split(" ");
  toks.forEach((x, i) => {
    const before = toks[i - 1] ?? "";
    if (!taLocative(x) || TA_NOT_PLACE.test(x) || TA_POINT.test(before) || (world && !PLACE_TA.test(x))) return;
    out.push(/[஀-௿]/u.test(before) ? [x, `${before} ${x}`] : [x]);
  });
  return out;
}
/** does a short ask name a place (by its words, or a zone's name) or a time? */
const namesWhere = (raw: string, t: string, w: World = BARE) => placeWords(raw, t, w).length > 0 || zonesIn(spaced(t), w).length > 0 || !["none", "now"].includes(readPeriod(t).kind);
const saysName = (s: string, en: string, ta: string | null | undefined) => {
  const e = spaced(en).trim(), a = ta ? spaced(ta).trim().replace(/[்ுூ]$/, "") : "";
  return (e.length >= 4 && s.includes(` ${e} `)) || (a.length >= 3 && s.includes(` ${a}`));
};
/** the localities a sentence names, a Tamil name that ends in ம் in its case form too (கோட்டூர்புரம்: கோட்டூர்புரத்தில், கோட்டூர்புரத்துல), as zonesIn
 * reads a zone's (v10 review 2, round 3: placesIn looks for "கோட்டூர்புரம", so the story's own place in Tamil went to the lanes) */
function placesAt(s: string, w: World): string[] {
  const out = new Set(placesIn(s, w));
  for (const p of w.places) for (const a of p.aliases) {
    const x = a.normalize("NFC").trim();
    if (/ம்$/u.test(x) && x.length >= 5 && s.includes(` ${x.slice(0, -2)}த்`)) { out.add(p.name); break; }
  }
  return [...out];
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** the offer's own zone's names: English (the offer's and the lexicon's), and Tamil stems that its case forms start with (அடையாறு: அடையாற) */
const ownEnglish = (o: Offer10) => (o.follow ? [...new Set([o.follow.en.toLowerCase(), ...(ZONES[o.follow.zone]?.en ?? [])])].filter((x) => x.length >= 3) : []);
const ownTamil = (o: Offer10) => (o.follow ? [...new Set([o.follow.ta, ...(ZONES[o.follow.zone]?.ta ?? [])])].map((x) => x.normalize("NFC").replace(/ம்$/u, "").replace(/[்ுூ]$/u, "")).filter((x) => x.length >= 3) : []);
/**
 * The offer's own zone, named in a reply, said as "this" ("follow Adyar zone", "Adyar zone-a follow pannunga", "அடையாறு மண்டலத்தைக் கவனியுங்க"):
 * the zone the offer names is the story's to follow, as "follow it" is (v10 review 2, round 2: the anchored follow refused the offer's own words).
 */
function ownAsThis(t: string, o: Offer10): string {
  const en = ownEnglish(o).map(esc), ta = ownTamil(o).map(esc);
  let s = t;
  if (en.length) s = s.replace(new RegExp(`\\b(?:the )?(?:${en.join("|")})(?:[ -]zone)?(?:-?(?:a|ah|aa|ai))?\\b`, "g"), "this");
  if (ta.length) s = s.replace(new RegExp(`(?:${ta.join("|")})\\S*(?:\\s+(?:மண்டல|ஜோன்|சோன்)\\S*)?`, "gu"), "இதை");
  return s;
}

/**
 * Does the sentence name something the offer is not about: another case, a ward, another zone, locality or taluk, another kind of complaint;
 * and, asking for the map, the console's cases or the story (`scoped`), a time or a status? Then it is a question of its own, and the lanes take
 * it (v10 review 2, finding 2: "any complaints in Teynampet?", "draft a note on INC-123" and "show the garbage complaints in Teynampet on the
 * map" all acted on the story's offer). The story's own: its case, its zone, and the places and the kind its map question names (when that
 * names no locality, a locality inside the story's zone is taken for the story's). A place the world does not hold is told by the words around
 * it (placeWords), in the three scripts (round 2).
 */
function aboutElse(raw: string, t: string, o: Offer10, w: World, scoped: boolean, from: boolean): boolean {
  if ([...t.matchAll(CASE_ID)].some((m) => !o.draft.some((id) => id.toLowerCase() === m[0])) || WARD.test(t)) return true;
  const s = spaced(t), own = spaced(o.map ?? "");
  const ownWords = spaced(`${o.map ?? ""} ${ownEnglish(o).join(" ")}`), ownTa = ownTamil(o);
  for (const ways of placeWords(raw, t, w, from)) {
    const mine = ways.some((p) => ownWords.includes(` ${p} `) || ownTa.some((x) => p.includes(x)));
    // a name the world or the lexicon holds (a zone, a locality, a taluk) is told below, the story's own from another's
    const known = ways.some((p) => { const q = spaced(p); return zonesIn(q, w).length > 0 || placesAt(q, w).length > 0 || w.taluks.some((k) => saysName(q, k.name, k.ta)); });
    if (!mine && !known) return true;
  }
  const zones = new Set([...(o.follow ? [o.follow.zone] : []), ...zonesIn(own, w)]);
  if (zonesIn(s, w).some((z) => !zones.has(z))) return true;
  const places = new Set(placesAt(own, w));
  if (placesAt(s, w).some((p) => !places.has(p) && (places.size > 0 || !zones.has(w.places.find((x) => x.name === p)?.zone ?? 0)))) return true;
  if (w.taluks.some((k) => !w.zones.some((z) => z.name.toLowerCase() === k.name.toLowerCase()) && saysName(s, k.name, k.ta) && !saysName(own, k.name, k.ta))) return true;
  const kind = catIn(withoutDepts(s, w));
  if (kind && kind !== catIn(own)) return true;
  return scoped && (STATUS.test(t) || !["none", "now"].includes(readPeriod(t).kind));
}

/**
 * What a reply to the brief's offer does; null: not a reply to it (the turn goes on to the lanes, and the offer is forgotten). `world`: the
 * console's names (the zones', localities' and taluks'), to tell a sentence about somewhere else.
 */
export function offerAct(raw: string, o: Offer10 | null, now: number, world: World = BARE): OfferAct | null {
  if (!o || now - o.at > OFFER_MS || now < o.at - 5000) return null;
  const t = flat(raw);
  if (!t || t.length > 200) return null;
  const nfc = raw.normalize("NFC");
  // Jarvis's own offer, heard back (the captions can catch its voice): no reply to it
  if (OWN.test(t) || OWN.test(nfc)) return null;
  if (NO.test(t)) return { act: "no" };
  // (an offer never said aloud, after the whole story, takes no bare yes or "okay": v10 review 2, finding 8)
  // (round 2: a ground ask's place is aboutElse's, which knows the story's own; the offer's own zone named is "this" to follow)
  const wants = fullRead(raw) && !FULL_OF.test(t) ? "full" : groundWords(t, nfc) ? "ground" : DRAFT.test(t) || DRAFT.test(nfc) ? "draft" : (MAP.test(t) && !mapControl(t)) || SHOW.test(t) ? "map"
    : FOLLOW.test(ownAsThis(t, o)) || FOLLOW.test(nfc) ? "follow" : YES.test(t) && !o.unsaid ? o.offers[0] ?? null : null;
  if (!wants) return null;
  // "don't draft anything", "map vendaam": put away
  if (NEGATED.test(t) || NEGATED.test(nfc)) return { act: "no" };
  // about another case, place, zone or kind (or for the map, the cases or the story, another time or status): the lanes' (review 2, finding 2)
  if (aboutElse(raw, t, o, world, wants === "map" || wants === "ground" || wants === "full", wants !== "full")) return null;
  if (wants === "full") return { act: "full", id: o.story };
  if (wants === "ground") return { act: "ground", id: o.story };
  if (wants === "map") return o.map ? { act: "map", q: o.map } : { act: "none", what: "map" };
  if (wants === "draft") return o.draft.length ? { act: "draft", ids: o.draft } : { act: "none", what: "draft" };
  return o.follow ? { act: "follow", zone: o.follow.zone, name: { en: o.follow.en, ta: o.follow.ta } } : { act: "none", what: "follow" };
}

/** What is said for a reply code answers itself (the map is shown, the offer put away, a step there is none of). */
export function offerSaid(a: OfferAct, lang: Lang): string | null {
  const ta = lang === "ta";
  if (a.act === "no") return ta ? "சரி." : "Okay.";
  if (a.act !== "none") return null;
  if (a.what === "draft") return ta ? "இந்தச் செய்திக்கு கன்சோலில் திறந்த புகார் எதுவும் இல்லை; அதனால் குறிப்பு வரைவு செய்ய எதுவும் இல்லை." : "There's no open case on the console for this story, so there's nothing to draft a note on.";
  if (a.what === "follow") return ta ? "இந்தச் செய்தி எந்த மண்டலம் என்று தெரியவில்லை; அதனால் கவனிக்க முடியாது." : "I can't tell which zone this story is in, so there's nothing to follow.";
  return ta ? "இந்தச் செய்தியை வரைபடத்தில் காட்ட இடம் தெரியவில்லை." : "I can't place this story on the map.";
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
/**
 * News to ground truth's screen: what was said (a Note) and the open cases on the story (a CaseList, the panel the Stage already draws: "open
 * the first one" opens a case). Checked; the cases left out if they fail; null if even the note does.
 */
export function groundScreen(o: { lang: Lang; en: string[]; ta: string[]; rows: unknown; title: { en: string; ta: string }; now?: number }): StageDocT | null {
  const L = (en: string, ta: string) => (o.lang === "ta" ? ta : en);
  const said = (o.lang === "ta" ? o.ta : o.en).join(" ").trim();
  const rows = Array.isArray(o.rows) ? o.rows.slice(0, 12) : [];
  const note = { kind: "Note", id: "ground", text: clip(said || L("Nothing on the console for this story.", "இந்தச் செய்திக்கு கன்சோலில் எதுவும் இல்லை."), 400) };
  const doc = (withRows: boolean) => ({
    v: 1, id: `ground-${(o.now ?? Date.now()).toString(36)}`, recipe: "cases", title: clip(L(o.title.en, o.title.ta), 200), takeaway: null,
    say: { en: clip(o.en.join(" "), 600), ta: clip(o.ta.join(" "), 900) },
    blocks: withRows && rows.length ? [note, { kind: "CaseList", id: "ground-cases", title: L("Open cases on the console for this story", "இந்தச் செய்திக்கான கன்சோலின் திறந்த புகார்கள்"), source: "list", sev: null, total: rows.length, rows }] : [note],
    scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null }, slots: { ground: true }, sources: [], asOf: null,
    notes: [L("Matched by the story's place and kind, from the console's own records; few cases may only mean few were reported.", "செய்தியின் இடம், வகை கொண்டு கன்சோலின் பதிவுகளில் பொருத்தியது; புகார் குறைவு என்றால் பிரச்சினை குறைவு என்று அர்த்தமில்லை.")],
    lang: o.lang, titles: { en: clip(o.title.en, 200), ta: clip(o.title.ta, 200) }
  });
  const a = checkStage(doc(true));
  if (a.ok) return a.doc;
  const b = checkStage(doc(false));
  return b.ok ? b.doc : null;
}
