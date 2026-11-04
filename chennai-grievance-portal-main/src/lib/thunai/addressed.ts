/**
 * Was that said to Jarvis? Pure: after speech-to-text and before anything acts. No speaker identification exists, so anyone
 * in the room can command it; this decides only whether a sentence was addressed to it.
 *   1 named:    contains "Jarvis" or ஜார்விஸ் -> act
 *   2 engaged:  within 20 s of Jarvis's last turn, and it parses as a request or follow-up -> act
 *   3 command:  the rules resolve a sure intent with slots, or an imperative plus a district noun -> act, level A only
 *   0 ignored:  a faint line on screen for 2 s, not logged, and the planner never sees it
 * Levels B and C need tier 1 or 2. When unsure, do not act: a wrong silent ignore is put right by saying "Jarvis"; acting on
 * someone's side conversation is not.
 */
import { talkedAbout, wakeIn } from "@/components/collector/app/thunai/wake";

export type Tier = 0 | 1 | 2 | 3;
export interface Addressed { tier: Tier; act: boolean; text: string; maxLevel: "A" | "B" | "C" | null; why: string }
export interface GateInput {
  text: string;
  /** when Jarvis last finished a turn (ms), or null */
  lastTurnAt: number | null;
  now: number;
  /** does the rules layer resolve this with confidence and slots (quick.ts or understand)? */
  rulesSure: boolean;
  /** a zone, department or topic the district knows is in the sentence */
  districtNoun: boolean;
}

export const ENGAGED_MS = 20_000;

const norm = (s: string) => ` ${s.toLowerCase().normalize("NFC").replace(/[’']/g, "").replace(/[^a-z0-9஀-௿]+/g, " ").replace(/\s+/g, " ").trim()} `;

/** Things people say to each other: other people as the subject or object, past and future plans, chatter. */
/** said of other people, or of the past: side talk even within the 20 s of being engaged */
const SIDE_STRONG = /\b(him|her|she|he|his|they|them|their|we|our|us|sir|madam|boss|colleague|anna(?! (?:nagar|salai|university|flyover|arch|square))|akka|after lunch|lunch|leave|transfer|cricket|match|movie|wife|husband|son|daughter|kids|report by|call him|call her|should we|shall we|lets|let us|told|said|heard|saw|see you|wants)\b/;
/** said to someone, or about oneself: side talk unless Jarvis is already in the conversation */
const SIDE_WEAK = /\b(your|you|i|im|ive|ill|my|me and|tomorrow|later|meeting|files?|phone|has|have you|are you|do you|will you)\b/;
const SIDE_KEEP_EN = /^ (show me|show us|give me|give us|tell me|tell us|get me|get us|take me|bring me|pull up|remind me|let me see) /;
const SIDE_TA = /(சாப்பாடு|சாப்பிட|மீட்டிங்|லீவு|அவரு|அவர் |அவங்க|அவன்|அவள்|நீங்க|நீ |நான் |நாம |நாங்க|என் |என்னோட|உங்க|போனேன்|பார்த்தேன்|பாத்தேன்|சொன்னார்|சொன்னாரு|சொன்னாங்க|வந்தார்|வந்தாரு|போனார்|ஆச்சா|தெரியுமா|கிரிக்கெட்|(?<!வரை)படம் பார்)/;
const SIDE_TG = /\b(saapadu|sapadu|saptiya|saptingala|meeting|leave|avaru|avanga|avan|aval|nee|neenga|naan|naanga|naama|enoda|unga|ponen|paathen|parthen|sonnaru|sonnanga|vandharu|ponaru|aacha|theriyuma|cricket|padam)\b/;
/** the past and the day around today: side talk, unless Jarvis is in the conversation and it is asked as a question or a request */
const SIDE_TENSE = /\b(yesterday|last night|did|didnt|was|were|had|netthu|nethu|nethiku|naalaiku|naliku)\b/;
const SIDE_TENSE_TA = /(நேத்து|நேற்று|நாளைக்கு|நாளை )/;
/** chatter, unless a district noun makes it a topic ("traffic complaints in Adyar") */
const SIDE_TOPIC = /\b(tea|coffee|traffic)\b/;
const SIDE_TOPIC_TA = /(டீ |காபி|டிராபிக்)/;
const IMPERATIVE_EN = /^ (please )?(show|open|go to|go|list|display|compare|pull up|bring up|read|filter|switch|change|set|zoom|sort|give me|tell me|get me|take me|find|map|rank|build|make|create|draft|export|close|summarise|summarize|brief me|update me) /;
const IMPERATIVE_TA = /(?:^|\s)(காட்டு|காட்டுங்க|காட்டுங்கள்|காமி|காமிங்க|திற|திறங்க|திறந்து|சொல்லு|சொல்லுங்க|சொல்லுங்கள்|ஒப்பிடு|ஒப்பிடுங்க|ஒப்பிட்டு|பாரு|பாருங்க|போங்க|மாத்து|மாத்துங்க|மாற்று|படி|படிங்க|வாசி|போடு|போடுங்க|கொடு|கொடுங்க|தா) *$/;
const IMPERATIVE_TG = /\b(kaattu|kaatu|kattu|katu|kaami|kaminga|kaatunga|kattunga|katunga|thira|thiranga|thirandhu|sollu|sollunga|oppidu|oppidunga|paaru|paarunga|ponga|maathu|mathu|maathunga|padi|padinga|podu|podunga|kudu|kudunga|show pannu|open pannu|compare pannu|list pannu|filter pannu|map pannu|sort pannu)\s*$/;
/** the shape of a request or a follow-up: for tier 2 */
const REQUEST_EN = /^ (and|what|whats|why|how|which|where|who|when|same|also|now|only|just|no|not|then|next|compare|show|open|go|list|read|tell|give|filter|sort|zone|in|for|at|more|less|top|worst|best|first|second|third|last|today|please|ok|okay|yes|can|could|would|is|are|was|were|do|does|did(?! you| i )|put|make|build|create|get|bring|check|look|find|pull|prepare|summarise|summarize|brief|run|add|change|set|switch|draft|export|map|rank|save|pin|remember|remind) /;
const QUESTION_TA = /(என்ன|எங்க|எங்கே|ஏன்|எத்தனை|எவ்வளவு|எது|(?:^|\s)யார்|எப்படி|எப்போ|ஆ\?|ஆ *$)/;
const QUESTION_TG = /\b(enna|enga|yen|ethana|evvalavu|edhu|yaaru|eppadi|eppo)\b/;
/** what the console talks about: with one of these, a sentence with a chore's shape is still work */
const WORK_EN = /\b(complaints?|grievances?|cases?|incidents?|accidents?|reports?|status|situation|news|levels?|counts?|numbers?|figures?|totals?|data|trends?|charts?|graphs?|maps?|lists?|pages?|panels?|screens?|dashboard|overview|briefing|brief|summary|update|forecast|readings?|rainfall|alerts?|zones?|wards?|taluks?|departments?|dept|officers?|severe|overdue|backlog|prices?|markets?|environment|aqi|lakes?|reservoirs?|pugar|nilavaram|alavu|evvalavu|ethana|seidhi)\b/;
const WORK_TA = /(புகார்|சம்பவ|நிலவரம்|அளவு|எத்தனை|எவ்வளவு|செய்தி|பக்கம்|வரைபடம்|பட்டியல்|மண்டல|துறை|சுருக்கம்|விலை|அறிக்கை|அதிகாரி)/;
/** asking someone in the room for something, or about one's own things: "give me some water", "where is my phone", "can you pass the salt" */
const ERRAND_EN = /^ (?:please )?(?:give|get|bring|pass|fetch|hand) (?:me|us) (?:some|a|an) /;
const ROOM_ASK = /^ (?:where (?:is|are)|wheres) (?:my|your) |^ (?:can|could|would|will) you (?:please )?(?!(?:show|open|go|list|display|compare|pull|bring up|read|filter|switch|change|set|zoom|sort|give|tell|get|take|find|map|rank|build|make|create|draft|export|close|summari[sz]e|brief|update|explain|check|look|prepare|run|add|save|pin|remember|remind|put|repeat|stop)\b)/;
const ROOM_THING = /\b(door|fan|lights|salt|sugar|keys?|bag|pen|chair|glass|cup|bottle|plate|snacks?|biscuits?|tiffin)\b/;
/** only when nobody has said Jarvis: "take me to the hospital", "தண்ணீர் கொடு" (the same words engaged can be follow-ups) */
const TAKE_ME = /^ (?:please )?take me (?:to|home|back)\b/;
const ERRAND_TA = /(?:^|\s)(?:கொடு|கொடுங்க|தா|போடு|போடுங்க) *$/;
const ERRAND_TG = /\b(?:kudu|kudunga|podu|podunga) $/;
/** a statement, not an order: "there are too many complaints in Adyar", "close the door the rain is coming", "மழை வருது" */
const STATEMENT_EN = /^ (?!(?:what|whats|which|where|wheres|when|why|how|who|whos|is|are|was|were|am|do|does|did|can|could|would|will)\b)(?:.*? )?(?<!(?:that|which|who|where) )(?:is|are|isnt|arent|was|were|wasnt|werent|will|wont|would|must|cant|cannot|has|have|hasnt|havent) /;
const ASIDE_TA = /(?:இப்படி|அப்படி|வந்தா|போனா|ஆனா|இருந்தா)[.!?]* *$/;
const FINITE_TA = /\S\s+(?:இருக்கு|இல்ல|இல்லை|வருது|போகுது|ஆச்சு)[.!?]* *$/;
/** first person with no request in it: "I am going home", but not "I want the Adyar ones" */
const FIRST_PERSON = /^ (?:i|im|ive|ill|id)(?! (?:want|need|would|wanna|like)\b) /;

/** Is the name in it? Returns the sentence with the name taken out, or null. Talked about is not named. */
export function namedIn(text: string): string | null {
  if (talkedAbout(text)) return null;
  const w = wakeIn(text);
  if (w != null) return w;
  return /(jarvis|ஜார்விஸ்)/i.test(text) ? text.replace(/,?\s*(jarvis|ஜார்விஸ்)\s*,?/gi, " ").replace(/\s+/g, " ").trim() : null;
}

export const isImperative = (text: string): boolean => {
  const t = norm(text);
  return IMPERATIVE_EN.test(t) || IMPERATIVE_TA.test(text.replace(/[.!?,]+\s*$/, "").trim()) || IMPERATIVE_TG.test(t.trim());
};
/** asked as a request or a question, whatever its length */
const shaped = (text: string, t: string) => REQUEST_EN.test(t) || isImperative(text) || QUESTION_TA.test(text) || QUESTION_TG.test(t) || /\?\s*$/.test(text);
const statement = (text: string, t: string) => STATEMENT_EN.test(t) || ASIDE_TA.test(text) || (FINITE_TA.test(text) && !QUESTION_TA.test(text));
/** a chore for someone in the room, not work for the console */
const chore = (text: string, engaged = false): boolean => {
  const t = norm(text);
  if (WORK_EN.test(t) || WORK_TA.test(text)) return false;
  if (ERRAND_EN.test(t) || ROOM_ASK.test(t) || ROOM_THING.test(t)) return true;
  return !engaged && (TAKE_ME.test(t) || ERRAND_TA.test(text.replace(/[.!?,]+\s*$/, "").trim()) || ERRAND_TG.test(t));
};

const sideEn = (t: string, weak: boolean) => SIDE_STRONG.test(t) || (weak && SIDE_WEAK.test(t));
export const looksSide = (text: string, engaged = false, districtNoun = false): boolean => {
  const t = norm(text);
  if (SIDE_TA.test(text) || SIDE_TG.test(t)) return true;
  if (!districtNoun && (SIDE_TOPIC.test(t) || SIDE_TOPIC_TA.test(text))) return true;
  if ((SIDE_TENSE.test(t) || SIDE_TENSE_TA.test(text)) && !(engaged && shaped(text, t))) return true;
  if (SIDE_KEEP_EN.test(t)) return sideEn(t.replace(SIDE_KEEP_EN, " "), !engaged);
  return sideEn(t, !engaged);
};
export const looksRequest = (text: string): boolean => {
  const t = norm(text);
  return shaped(text, t) || (t.trim().split(" ").length <= 4 && !FIRST_PERSON.test(t) && !statement(text, t));
};

export function addressed(i: GateInput): Addressed {
  const text = i.text.trim();
  const named = namedIn(text);
  if (named != null) return { tier: 1, act: true, text: named || text, maxLevel: "C", why: "named" };
  // the name talked about: someone else is being spoken to, engaged or not
  if (talkedAbout(text)) return { tier: 0, act: false, text, maxLevel: null, why: "about" };
  const engaged = i.lastTurnAt != null && i.now - i.lastTurnAt <= ENGAGED_MS;
  if (engaged && looksRequest(text) && !looksSide(text, true, i.districtNoun) && !chore(text, true)) return { tier: 2, act: true, text, maxLevel: "C", why: "engaged" };
  if (looksSide(text, false, i.districtNoun)) return { tier: 0, act: false, text, maxLevel: null, why: "side" };
  if (chore(text) || statement(text, norm(text))) return { tier: 0, act: false, text, maxLevel: null, why: "aside" };
  if (i.rulesSure && (isImperative(text) || i.districtNoun)) return { tier: 3, act: true, text, maxLevel: "A", why: "rules" };
  if (isImperative(text) && i.districtNoun) return { tier: 3, act: true, text, maxLevel: "A", why: "imperative" };
  return { tier: 0, act: false, text, maxLevel: null, why: "unaddressed" };
}

/** May a plan of this risk run from this tier? Levels B and C need tier 1 or 2. */
export function levelAllowed(a: Addressed, risk: "A" | "B" | "C"): boolean {
  if (!a.maxLevel) return false;
  return risk === "A" || a.tier === 1 || a.tier === 2;
}

// ---- the self-hearing guard --

const words = (s: string) => norm(s).trim().split(" ").filter(Boolean);
/** Share of the transcript's words that Jarvis is saying right now (normalised). */
export function overlap(heard: string, speaking: string): number {
  const h = words(heard), s = new Set(words(speaking));
  if (!h.length || !s.size) return 0;
  return h.filter((w) => s.has(w)).length / h.length;
}
/** While speaking: a transcript that overlaps more than 60 % with what Jarvis is saying is Jarvis. */
export const selfHeard = (heard: string, speaking: string | null) => !!speaking && overlap(heard, speaking) > 0.6;
