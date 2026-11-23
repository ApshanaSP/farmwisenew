/**
 * v12 (21 Nov): one shared reading of "show me the city on the ground" for every lane, so voice no longer depends on a model to find the
 * views that already exist (the Live traffic view, Rain & flooding on a past rain). The owner's session of 21 Nov 06:33-06:42 is why:
 * "Okay, show me live traffic in map." became a traffic-complaints filter, "Show me live traffic in the map." an Ask the Map question
 * "me live traffic", "Where are the flooded roads?" the Roads & potholes cases, "Zoom in the map to the most congested area" a generic
 * screen, and "Go to the show me the roads. which was flooded in. Rain. In the last range." today's flooding complaints.
 *
 * cityAsk(text, { last }) gives the part of the city (lib/city/topic.ts cityTopic, widened here for the flooded-streets phrasings), a focus
 * (the most congested stretch, or the trouble spot that keeps coming back), whether the map was asked for ("in map", "on the map", "map la",
 * வரைபடத்தில், a zoom), and a past rain ("the last rain", the speech-to-text's "last range", a date). It reads nothing when the sentence asks
 * for complaints, cases or incidents, the news, a brief, a dashboard, a tour, a visit plan or a layer: those stay with their own lanes.
 * `last`: the part of the city the last answer showed, for "show me in the map" said after it. Pure and safe in the browser.
 *
 * Read by: map10.ts (the map lane: op "city"), quick.ts (the server's fast lane: the city screen with its focus and rain), round.ts (a
 * sentence starting "Okay," or "Now" is not held back from the fast lane for it), agent.ts finish() (a planner's complaint filter for one
 * of these becomes the city screen), understand.ts and quick.ts catIn (a broad word never makes a category of it).
 */
import { cityTopic, type CityTopic } from "./topic";
import { dayIn } from "@/lib/rehearsal/intent";
// v14 (routing 3): the one period reader (pure), for "last week", "yesterday", "this month" on live traffic, power and trains
import { readPeriod } from "@/lib/period/read";
// 23 Nov: how many were asked for ("top three"), shared with the cases and the chatbot
import { countAsked } from "@/lib/askcount";

export type CityFocus = "worst-jam" | "repeat";
/**
 * 23 Nov 2026: a ranked list of live traffic, by road or by area, most or least congested, as many as asked ("top three most congested
 * roads", "which areas have the least traffic", "the three congested ones in Anna Nagar"). Every such question got one road or the
 * overview (the owner's morning session, 10:36-10:45).
 */
export interface CityRank { n: number; order: "most" | "least"; by: "road" | "area" }
export interface CityAsk {
  topic: CityTopic;
  /** "the most congested", "the worst jam", "zoom to the jam": worst-jam; "keeps coming back", "repeating", "trouble spots": repeat */
  focus: CityFocus | null;
  /** 23 Nov: a ranked list asked for (live traffic only); when set, focus is null */
  rank?: CityRank | null;
  /** the map was asked for: "in map", "on the map", "map la", வரைபடத்தில், a zoom or "take me to" */
  map: boolean;
  /** a past rain: "latest" (the last heavy rain with reports, as Rain & flooding opens it) or "rain-YYYY-MM-DD" */
  rain: string | null;
}

/** asking for the records themselves: the incidents' lanes, never the city view ("flooding complaints in Adyar") */
const INCIDENTS = /\b(?:complaints?|grievances?|petitions?|cases?|incidents?|tickets?|firs?|pugar\w*)\b|புகார்|சம்பவ/i;
/**
 * v13 (21 Nov review, finding 0 2): the reports people sent ("any reports of flooded streets today?", "the traffic issues reported this week")
 * are the records too, as quick.ts DATA_NOUN reads them. Live traffic said with "now" or "live" stays the view ("any traffic problems right now")
 */
const REPORTS = /\b(?:reports?|reported|reporting|issues?|problems?)\b/i;
const LIVE = /\b(?:live|now|right now|currently|at the moment)\b/i;
/**
 * v13 (finding 0 2): a flooded-road sentence about today's records, their follow-up, who handles them or what the papers said is the
 * cases' or the news' question, never the streets that flooded in heavy rain: "the update on the flooded subway in Velachery", "which
 * department handles the flooded roads", "who is responsible for the flooded streets in Adyar", "what did the papers say about the flooded subway"
 */
const FLOOD_RECORDS = /\b(?:updates?|status of|department|dept|responsible|in charge|who (?:handles|handled|is handling|looks after|deals with|fixes|will fix|cleared|clears)|papers?|newspapers?|press|media)\b/i;
/** v13 (finding 0 2): flooded now or today is today's reports ("which roads are flooded now?"), not a past rain's streets */
const FLOOD_NOW = /\b(?:today|todays|right now|currently|at the moment|this (?:morning|evening|afternoon|hour))\b|\bnow$/i;
/**
 * v14 (21 Nov review of v13, routing 3): who handles it, its follow-up and the papers are the records' or the contacts' question for every
 * part of the city, not only the flood streets: "which officer handles traffic in Adyar", "who is responsible for the traffic jam on OMR",
 * "the update on the traffic jam on OMR", "which department handles power cuts", "is the power supply restored" (each was the live view)
 */
const CITY_RECORDS = /\b(?:department|dept|responsible|accountable|in charge|handles?|handled|handling|looks after|deals with|officers?|officials?|contacts?|police|papers?|newspapers?|press|media|restored|restoration)\b|\bupdates? (?:on|about|regarding|of)\b|\bstatus of\b/i;
/** v14 (routing 3): an accident is a record ("traffic accidents this month": ROAD_ACCIDENT); "any accidents right now" stays live traffic */
const ACCIDENT = /\b(?:accidents?|crash(?:es)?|collisions?)\b|விபத்து/i;
/** v14 (routing 3): power and trains are Rain & flooding's heavy-rain record: read only with a rain said, as map10.ts RAIN_SAID ("when is the next metro train" is not) */
const RAIN_SAID = /\b(?:rain|rains|raining|rainy|rained|monsoon|downpour|cyclone|storm|mazhai)\b|மழை/i;
/**
 * v13 (finding 0 7): "close the traffic view", "hide live traffic", "turn off the traffic view" put a view away: the control and console
 * lanes keep them (the fast lane opened Live traffic for each)
 */
const PUT_AWAY = /^(?:(?:ok|okay|now|so|then|please|jarvis|and|just|can you|could you)\s+)*(?:close|hide|exit|dismiss|remove|clear|shut|stop showing|turn off|switch off|get rid of|take (?:away|off|down))\b|\b(?:turn|switch|put|shut) (?:\w+ ){0,4}off\b|\b(?:close|hide|off) (?:pannu|pannunga|panni)\b|(?:^|\s)மூடு(?:ங்க|ங்கள்)?$/i;
/** ...unless a request to see follows it: "close this and show me live traffic", "hide the panel, then zoom to the worst jam" */
const THEN_SEE = /\b(?:and|then|now)\s+(?:(?:just|please)\s+)?(?:show|open|display|zoom|take me|go to|bring|put)\b/i;
/** another lane's own: the news, a brief, a dashboard, a tour, a visit plan, a layer */
const NOT_CITY = /\b(?:news|story|stories|articles?|headlines?|seithi\w*|seidhi\w*|brief|briefing|briefings|summary|dashboards?|tours?|touring|visits?|visiting|itinerary|layers?)\b|\bplan (?:my|a|the|our)\b|செய்தி|நியூஸ்|டாஷ்போர்டு|சுற்றுலா/i;
/** what will flood is the rain rehearsal's question; it is no past rain */
const FORECAST = /\b(?:will|would|forecast|tomorrow|tonight|going to|next rain|if it rains|expected to)\b|நாளை|\bnaalai\w*/i;
/** a flood word, past or present: "flooded", "water stood", "waterlogged", Tamil and Tanglish */
const FLOOD_WORD = /\b(?:flooded|flooding|floods?|waterlogged|water[- ]?logging|water[- ]?logged|inundated|submerged|under ?water|went under|go under)\b|\bwater (?:stood|stagnated|stagnating|standing|collected)\b|\bstanding water\b|வெள்ள|தண்ணீர் தேங்|தண்ணி தேங்|நீர் தேங்|தண்ணி நின்|தண்ணீர் நின்|மூழ்கி|\bvellam\b|\bthanni (?:nikk|ninn|thekk)\w*/i;
/** where: a street, road, subway, area */
const STREET_WORD = /\b(?:streets?|roads?|lanes?|subways?|underpass\w*|areas?|places?|spots?|localit(?:y|ies)|junctions?|stretch(?:es)?)\b|தெரு|சாலை|\btheru\w*|\bsaalai\w*/i;
/** the last heavy rain: "last rain", "previous rains", "the last range" (the speech-to-text's "rain", 21 Nov 06:41), "rein", "pona mazhai", போன மழை */
const PAST_RAIN = /\b(?:last|latest|previous|recent|most recent) (?:heavy |big |major )?(?:rains?|range|ranges|reign|rein|raine|downpour|monsoon|spell)\b|\bwhen it (?:last )?rained(?: last)?\b|\blast time it rained\b|\bpona (?:periya )?mazhai\w*|(?:கடந்த|போன|சமீபத்திய)\s*(?:பெரிய\s*|கன\s*)?மழை/i;
/** rain as when ("in the rain", "during heavy rain"): a flood street's question, not a past rain */
const IN_RAIN = /\b(?:in|during|after) (?:the |a |heavy |the heavy )?rains?\b|மழையில்|மழையில|மழைல|\bmazhai ?la\b/i;
/** a traffic sentence that mentions water stays traffic ("roads flooded and jammed": the Traffic view shows water on the road too) */
// (v14, routing 2: the stem நெரிசல without its pulli, so நெரிசலான and நெரிசலா read too; ட்ராபிக் as the speech-to-text spells it too)
const TRAFFIC_WORD = /\b(?:traffic|jams?|jammed|congest\w*|gridlock\w*|snarl\w*)\b|போக்குவரத்து|நெரிசல|டிராஃபிக்|டிராபிக்|ட்ராஃபிக்|ட்ராபிக்/i;
/**
 * v14 (21 Nov review of v13, routing 2): "where is the traffic worst" in Tamil and Tanglish, the way people say it: "டிராபிக் எங்க அதிகமா
 * இருக்கு", "அதிகமான நெரிசல் எந்த ரோட்ல", "ரொம்ப நெரிசலான இடம்", "traffic adhigama irukka idam" (each read as the generic overview). A
 * "most" word (அதிக, அதிகமா, ரொம்ப, மோசமான; romba, adhigama, jaasthi) within two words of a traffic word, either side; அதிகரி (rise) is not one
 */
const TA_MOST = "(?:அதிக(?:ம்|மா|மான|மாக|மாய்)?|ரொம்ப|மோசம்|மோசமா|மோசமான|கடும்|கடுமையான|ஜாஸ்தி)(?=\\s|$)";
const TA_JAM = "(?:போக்குவரத்து|நெரிசல|டிராஃபிக்|டிராபிக்|ட்ராஃபிக்|ட்ராபிக்)";
const TG_MOST = "(?:romba|rombha|adhiga|athiga|adhigam\\w*|athigam\\w*|jaasthi\\w*|jasthi\\w*|jasti)";
const TG_JAM = "(?:traffic|jam\\w*|nerisal\\w*)";
const MOST_TA_TG = new RegExp(`${TA_MOST}\\s+(?:\\S+\\s+){0,2}?${TA_JAM}|${TA_JAM}\\S*\\s+(?:\\S+\\s+){0,2}?${TA_MOST}|\\b${TG_MOST}\\s+(?:\\w+\\s+)?${TG_JAM}\\b|\\b${TG_JAM}\\s+(?:\\w+\\s+){0,2}?${TG_MOST}\\b`, "i");
/** the most congested: "most congested area", "worst jam", "heaviest traffic", "where is the traffic worst", Tamil and Tanglish (MOST_TA_TG above) */
const MOST = /\b(?:most|worst|heaviest|biggest|longest|highest|maximum|max|severest)\s+(?:\w+\s+){0,2}?(?:congest\w*|jam\w*|traffic|delay\w*|blocked|crowded|road|roads|stretch|stretches|junction|junctions|spot|area)\b|\b(?:traffic|jams?|congestion)\b(?:\s+\w+){0,3}?\s+(?:is |are )?(?:the )?(?:worst|heaviest|most)\b|அதிக நெரிசல்|மோசமான நெரிசல்|கடும் நெரிசல்|\b(?:romba|adhigam|athigam|jaasthi) (?:traffic|jam)\b|\b(?:traffic|jam) (?:romba|adhigam|athigam|jaasthi)\b/i;
/** a jam that keeps coming back: the Traffic view's "Keeps coming" tab */
const REPEAT = /\b(?:repeat\w*|recurr\w*|keeps? coming back|keeps? happening|again and again|over and over|trouble ?spots?|chronic|black ?spots?|hot ?spots?)\b|மீண்டும் மீண்டும்|\b(?:thirumba thirumba|marupadi marupadi)\b/i;
/** "on the map", "in map" (no "the": the owner's 06:33 sentence), "map la", வரைபடத்தில், மேப்ல */
const ON_MAP = /\b(?:on|in|into|onto) (?:the )?maps?\b|\bmap ?la\b|\bmap le\b|வரைபடத்தில்|மேப்ல|மேப்பில்/i;
/** a move of the camera: "zoom", "fly to", "focus on", "take me to"; "go to" too, unless it names a page, panel or tab */
// (v14, routing 2: the Tamil-script "zoom", ஜூம், too: "ரொம்ப நெரிசலான இடத்துக்கு ஜூம் பண்ணு" read nothing)
const ZOOMISH = /\b(?:zoom\w*|fly|pan|centre|center|focus)\b|\btake me (?:to|there)\b|ஜூம்/i;
const GO_TO = /\bgo to\b/i;
const NOT_A_MOVE = /\b(?:trends|briefing|environment|studio|page|panel|tab|news|workspace)\b/i;
/** a camera move or "take me to" says which jam: the worst one, unless a view is named ("take me to the traffic view") */
const MOVE_FOCUS = /\b(?:zoom\w*|fly|focus|centre|center)\b|\btake me (?:to|there)\b(?!.*\b(?:view|page|panel|tab|screen)\b)|ஜூம்/i;
/** "show me in the map", "show it on the map", "put that on the map", "map la kaattu": the last answer on the map, nothing new asked */
const REF_MAP = /^(?:(?:ok|okay|now|so|then|alright|and|tell me|just|please|jarvis|hey jarvis|can you|could you)\s+)*(?:show|put|display|bring|kaattu|kattu|kaatu|open)(?: me)?(?: (?:it|this|that|them|these|those|the same|that one|this one))?\s+(?:(?:on|in) (?:the )?map|map ?la)$|^(?:(?:it|this|that|adha|idha|adhu|idhu)\s+)?(?:map ?la|on the map|in the map)\s+(?:kaattu|kattu|kaatu|show)$|^(?:அதை\s+|இதை\s+)?(?:வரைபடத்தில்|மேப்ல|மேப்பில்)\s+காட்டு$/i;

/** the sentence as these rules read it: NFC, no apostrophes, punctuation as spaces (the speech-to-text's periods split one request) */
const clean = (text: string): string => String(text ?? "").normalize("NFC").replace(/[’']/g, "").replace(/[.,!?;:…"“”()[\]]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * v13 (21 Nov review, finding 1 7): what the last city answer showed, not only its part of the city: its focus, its past rain and the spot
 * it was on, so "show me in the map" after "the most congested traffic now" maps that spot (it reopened the generic view)
 */
// v14 (21 Nov review 13, routing 5): and the zone it was about ("show me in the map" after Adyar's live traffic kept the district's view)
export interface CityLast { topic: CityTopic; focus?: CityFocus | null; rain?: string | null; spot?: string | null; lat?: number | null; lon?: number | null; zone?: number | null }
/** the last city answer as the callers hold it: its topic alone (v12's callers), or its slots */
export type CityLastIn = CityTopic | CityLast | null | undefined;
export const cityLastOf = (x: CityLastIn): CityLast | null => (!x ? null : typeof x === "string" ? { topic: x } : x);

/** v13 (finding 1 7): "show me in the map", "show it on the map", "map la kaattu": the last answer on the map, nothing new asked */
export const refersToMap = (text: string): boolean => REF_MAP.test(clean(text));

/** The part of the city a sentence asks to see, with its focus, the map and a past rain; null when it asks for something else. Pure. */
export function cityAsk(text: string, o: { last?: CityLastIn } = {}): CityAsk | null {
  const t = clean(text);
  if (!t || NOT_CITY.test(t)) return null;
  // the last answer on the map ("Okay, now tell me, show me in the map."): only with something shown before; else the planner asks what
  // (v13, finding 1 7: with its focus and its rain, so the map opens on the spot or the rain the answer was about)
  const last = cityLastOf(o.last);
  if (REF_MAP.test(t)) return last ? { topic: last.topic, focus: last.focus ?? null, map: true, rain: last.rain ?? null } : null;
  if (INCIDENTS.test(t)) return null;
  // v13 (finding 0 7): putting a view away is no request to see it ("close this and show live traffic" still asks to see it)
  if (PUT_AWAY.test(t) && !THEN_SEE.test(t)) return null;
  const map = ON_MAP.test(t) || ZOOMISH.test(t) || (GO_TO.test(t) && !NOT_A_MOVE.test(t));
  // a flood word with a street or a rain: the streets that flood (cityTopic needs "streets that flood"; "flooded roads", "roads that
  // flooded in the last rain" and "water stood" missed it, 21 Nov)
  const flood = FLOOD_WORD.test(t) && (STREET_WORD.test(t) || PAST_RAIN.test(t) || IN_RAIN.test(t)) && !FORECAST.test(t) && !TRAFFIC_WORD.test(t);
  const topic: CityTopic | null = flood ? "flood" : cityTopic(t);
  if (!topic) return null;
  // v13 (finding 0 2): the reports people sent are the records' lanes (live traffic said with "now" stays the view); for the flood streets,
  // so are today's floods, their follow-up, who handles them and the papers (the past rain's streets keep "now": "now show the last rain's")
  if (REPORTS.test(t) && (topic === "flood" || !LIVE.test(t))) return null;
  if (topic === "flood" && (FLOOD_RECORDS.test(t) || (FLOOD_NOW.test(t) && !FORECAST.test(t) && !PAST_RAIN.test(t)))) return null;
  // v14 (21 Nov review of v13, routing 3): for every part of the city, who handles it, its follow-up, the papers and an accident are the
  // records' (an accident said with "now" stays live traffic); power and trains need a rain said (their record is the heavy rains'); and live
  // traffic, power and trains over a past or closed period ("how was traffic last week", "the worst jam yesterday", "this month") are the
  // records' too ("today", "now" and no time at all stay the view)
  if (CITY_RECORDS.test(t) || (ACCIDENT.test(t) && !LIVE.test(t))) return null;
  if ((topic === "power" || topic === "metro") && !RAIN_SAID.test(t)) return null;
  if (topic === "traffic" || topic === "power" || topic === "metro") {
    const p = readPeriod(t);
    if (!(p.kind === "none" || p.kind === "now" || (p.kind === "day" && p.back === 0))) return null;
  }
  const day = topic === "flood" && !FORECAST.test(t) ? dayIn(t) : null;
  const rain = topic === "flood" && !FORECAST.test(t) ? (day ? `rain-${day}` : PAST_RAIN.test(t) ? "latest" : null) : null;
  // (v14, routing 2: the Tamil and Tanglish "most" too, MOST_TA_TG)
  const rank = topic === "traffic" && !REPEAT.test(t) ? cityRank(t) : null;
  const focus: CityFocus | null = topic !== "traffic" || rank ? null : REPEAT.test(t) ? "repeat" : MOST.test(t) || MOST_TA_TG.test(t) || MOVE_FOCUS.test(t) ? "worst-jam" : null;
  return { topic, focus, map, rain, ...(rank ? { rank } : {}) };
}

/** "least", "lowest", "smoothest", "free", "clear", குறைந்த, கம்மி: the calmest first */
const LEAST = /\b(?:least|lowest|minimum|fewest|less|lesser|smoothest|lightest|clearest|freest|calmest|best|no traffic|not congested|without traffic|free[- ]?flowing|moving freely|free of traffic|traffic[- ]?free|clear roads?)\b|குறைந்த|குறைவான|குறைவா|குறைவு|கம்மி|\b(?:kammi|kuraiv\w*|korachu|kuranja)\b/i;
/** areas, zones, localities: the zones ranked, not the roads */
const AREA = /\b(?:areas?|zones?|localit(?:y|ies)|regions?|neighbou?rhoods?|parts? of (?:the )?(?:city|chennai|district)|wards?)\b|பகுதி|ஏரியா|மண்டல|\b(?:area|mandalam)\b/i;
/** roads, streets, stretches: the roads ranked */
const ROAD = /\b(?:roads?|streets?|stretch(?:es)?|junctions?|signals?|highways?|salai|flyovers?|bridges?|routes?|lanes?)\b|சாலை|ரோடு|தெரு/i;
/** a "which/where" question with a ranking word: "which areas have the highest congestion", "where is traffic heaviest" */
const WHICH = /\b(?:which|where|what are the|list|name the|tell me the|show me the|show the)\b|எந்த|எங்கே|எங்க|\b(?:endha|enga|yedhu)\b/i;
const MOST_WORD = /\b(?:most|worst|heaviest|highest|maximum|max|biggest|busiest|more|top)\b|அதிக|மோசம|ரொம்ப|\b(?:romba|adhigam|athigam|jaasthi)\b/i;

/**
 * 23 Nov: the ranked list a live-traffic sentence asks for, or null when it asks about one road or the whole picture. A count of two or more
 * ("top three", "the 3 worst", "three congested ones"), the least congested (any count), or the areas with the most congestion each make one;
 * "the most congested road" alone stays the one-spot screen (focus worst-jam). Pure.
 */
export function cityRank(text: string): CityRank | null {
  const t = clean(text);
  const n = countAsked(t);
  const order: CityRank["order"] = LEAST.test(t) && !/\bat least\b/i.test(t) ? "least" : "most";
  const by: CityRank["by"] = AREA.test(t) && !ROAD.test(t) ? "area" : "road";
  if ((n != null && n >= 2) || order === "least") return { n: Math.min(n ?? 3, 10), order, by };
  if (by === "area" && (MOST_WORD.test(t) || MOST.test(t) || MOST_TA_TG.test(t)) && WHICH.test(t)) return { n: Math.min(n ?? 3, 10), order, by };
  return null;
}

const TOPICS: readonly string[] = ["traffic", "flood", "rain", "power", "metro", "all"];
/**
 * The part of the city the last answer showed: the open screen's (a city screen's q), else the newest turn that kept a screen, when that was
 * a city screen; null otherwise (a list of cases asked after the traffic is what "show it on the map" means then). For "show me in the map"
 * said after "Show me live traffic." (21 Nov 06:38).
 */
export function lastCityOf(stage: { recipe?: string | null; slots?: Record<string, unknown> | null } | null | undefined,
  turns: readonly { recipe?: string | null; slots?: Record<string, unknown> | null }[] | null | undefined = []): CityTopic | null {
  const of = (x: { recipe?: string | null; slots?: Record<string, unknown> | null } | null | undefined): CityTopic | null => {
    if (x?.recipe !== "city") return null;
    const q = String(x.slots?.q ?? "all");
    return (TOPICS.includes(q) ? q : "all") as CityTopic;
  };
  if (stage?.recipe) return of(stage);
  // v14 (21 Nov review 13, scenarios 0 and routing 8): the newest turn only. A later answer that kept no screen (words, the news, a map
  // answer) is the last answer, so "show them on the map" after it is not an older question's city view (it searched back past it)
  return of(newest(turns));
}
/** v14: the newest remembered turn (the turns are kept oldest first) */
const newest = <T,>(turns: readonly T[] | null | undefined): T | null => (turns?.length ? turns[turns.length - 1] ?? null : null);

type Shown = { recipe?: string | null; slots?: Record<string, unknown> | null; blocks?: readonly { kind: string; id?: string; points?: readonly unknown[] }[] | null };
const FOCI: readonly string[] = ["worst-jam", "repeat"];
/**
 * v13 (21 Nov review, finding 1 7): the same, with the slots that answer held: its focus, its past rain, and the spot its "spot" map point
 * was on (a screen's blocks; a remembered turn has only its slots). What "show me in the map" reopens after it, on that spot or that rain.
 */
export function lastCitySlotsOf(stage: Shown | null | undefined, turns: readonly Shown[] | null | undefined = []): CityLast | null {
  const topic = lastCityOf(stage, turns);
  if (!topic) return null;
  // (v14: the newest turn, as lastCityOf reads it)
  const x = stage?.recipe ? stage : newest(turns);
  const sl = x?.slots ?? {};
  const focus = typeof sl.focus === "string" && FOCI.includes(sl.focus) ? (sl.focus as CityFocus) : null;
  const rain = typeof sl.rain === "string" && /^(?:latest|rain-\d{4}-\d{2}-\d{2})$/.test(sl.rain) ? sl.rain : null;
  const b = (x?.blocks ?? []).find((y) => y.kind === "MapView" && y.id === "spot");
  const p = b?.points?.[0] as { id?: unknown; lat?: unknown; lon?: unknown } | undefined;
  const ok = !!p && typeof p.id === "string" && Number.isFinite(p.lat) && Number.isFinite(p.lon);
  // v14 (routing 5): the one zone a traffic answer was about (screens.ts city() reads one zone only)
  const zs = Array.isArray(sl.zones) ? sl.zones.filter((z): z is number => Number.isInteger(z) && z >= 1 && z <= 15) : [];
  const zone = topic === "traffic" && zs.length === 1 ? zs[0] : null;
  return { topic, focus, rain, spot: ok ? (p!.id as string) : null, lat: ok ? (p!.lat as number) : null, lon: ok ? (p!.lon as number) : null, ...(zone ? { zone } : {}) };
}

/**
 * v14 (21 Nov review 13, routing 10): the city view a sentence puts away ("hide the live traffic", "turn off the traffic view", "close rain
 * and flooding"): "traffic" for the Live traffic view, "rain" for Rain & flooding; null when it puts nothing of the city away, when a
 * request to see follows ("close this and show live traffic"), or when it is about the records or a filter ("hide the traffic complaints").
 * cityAsk reads nothing for these (PUT_AWAY), and no lane closed the view: the rules set a traffic-complaints filter instead.
 */
export function viewPutAway(text: string): "traffic" | "rain" | null {
  const t = clean(text);
  if (!t || !PUT_AWAY.test(t) || THEN_SEE.test(t) || INCIDENTS.test(t) || REPORTS.test(t) || /\bfilters?\b/i.test(t)) return null;
  if (TRAFFIC_WORD.test(t)) return "traffic";
  if (/\brain\b|\bflood(?:ing|s)?\b|மழை|வெள்ள/i.test(t)) return "rain";
  return null;
}
