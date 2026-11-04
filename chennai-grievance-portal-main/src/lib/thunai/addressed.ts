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
import { wakeIn } from "@/components/collector/app/thunai/wake";

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
const SIDE_EN = /\b(him|her|she|he|his|they|them|their|your|you|we|our|us|i|im|ive|ill|my|me and|sir|madam|boss|colleague|anna|akka|yesterday|last night|tomorrow|later|after lunch|lunch|tea|coffee|meeting|leave|transfer|traffic|cricket|match|movie|wife|husband|son|daughter|kids|files?|report by|phone|call him|call her|did|didnt|was|were|had|has|have you|are you|do you|will you|should we|shall we|lets|let us|told|said|heard|saw|see you|wants)\b/;
const SIDE_KEEP_EN = /^ (show me|give me|tell me|get me|take me|bring me|pull up|remind me|let me see) /;
const SIDE_TA = /(நேத்து|நேற்று|நாளைக்கு|நாளை |சாப்பாடு|சாப்பிட|டீ |காபி|மீட்டிங்|லீவு|அவரு|அவர் |அவங்க|அவன்|அவள்|நீங்க|நீ |நான் |நாம |நாங்க|என் |என்னோட|உங்க|போனேன்|பார்த்தேன்|பாத்தேன்|சொன்னார்|சொன்னாரு|சொன்னாங்க|வந்தார்|வந்தாரு|போனார்|ஆச்சா|தெரியுமா|கிரிக்கெட்|டிராபிக்|படம் பார்)/;
const SIDE_TG = /\b(netthu|nethu|nethiku|naalaiku|naliku|saapadu|sapadu|saptiya|saptingala|tea|coffee|meeting|leave|avaru|avanga|avan|aval|nee|neenga|naan|naanga|naama|enoda|unga|ponen|paathen|parthen|sonnaru|sonnanga|vandharu|ponaru|aacha|theriyuma|cricket|traffic|padam)\b/;
const IMPERATIVE_EN = /^ (please )?(show|open|go to|go|list|display|compare|pull up|bring up|read|filter|switch|change|set|zoom|sort|give me|tell me|get me|take me|find|map|rank|build|make|create|draft|export|close|summarise|summarize|brief me|update me) /;
const IMPERATIVE_TA = /(காட்டு|காட்டுங்க|காட்டுங்கள்|காமி|காமிங்க|திற|திறங்க|திறந்து|சொல்லு|சொல்லுங்க|சொல்லுங்கள்|ஒப்பிடு|ஒப்பிடுங்க|ஒப்பிட்டு|பாரு|பாருங்க|போங்க|மாத்து|மாத்துங்க|மாற்று|படி|படிங்க|வாசி|போடு|போடுங்க|கொடு|கொடுங்க|தா) *$/;
const IMPERATIVE_TG = /\b(kaattu|kaatu|kattu|katu|kaami|kaminga|kaatunga|kattunga|katunga|thira|thiranga|thirandhu|sollu|sollunga|oppidu|oppidunga|paaru|paarunga|ponga|maathu|mathu|maathunga|padi|padinga|podu|podunga|kudu|kudunga|show pannu|open pannu|compare pannu|list pannu|filter pannu|map pannu|sort pannu)\s*$/;
/** the shape of a request or a follow-up: for tier 2 */
const REQUEST_EN = /^ (and|what|whats|why|how|which|where|who|when|same|also|now|only|just|no|not|then|next|the|that|this|those|these|compare|show|open|go|list|read|tell|give|filter|sort|zone|in|for|at|more|less|top|worst|best|first|second|third|last|today|this|please|ok|okay|yes|can|could|is|are|do|does) /;
const QUESTION_TA = /(என்ன|எங்க|எங்கே|ஏன்|எத்தனை|எவ்வளவு|எது|யார்|எப்படி|எப்போ|ஆ\?|ஆ *$)/;
const QUESTION_TG = /\b(enna|enga|yen|ethana|evvalavu|edhu|yaaru|eppadi|eppo)\b/;

/** Is the name in it? Returns the sentence with the name taken out, or null. */
export function namedIn(text: string): string | null {
  const w = wakeIn(text);
  if (w != null) return w;
  return /(jarvis|ஜார்விஸ்)/i.test(text) ? text.replace(/,?\s*(jarvis|ஜார்விஸ்)\s*,?/gi, " ").replace(/\s+/g, " ").trim() : null;
}

export const looksSide = (text: string): boolean => {
  const t = norm(text);
  if (SIDE_TA.test(text) || SIDE_TG.test(t)) return true;
  if (SIDE_KEEP_EN.test(t)) return SIDE_EN.test(t.replace(SIDE_KEEP_EN, " "));
  return SIDE_EN.test(t);
};
export const isImperative = (text: string): boolean => {
  const t = norm(text);
  return IMPERATIVE_EN.test(t) || IMPERATIVE_TA.test(text.replace(/[.!?,]+\s*$/, "").trim()) || IMPERATIVE_TG.test(t.trim());
};
export const looksRequest = (text: string): boolean => {
  const t = norm(text);
  return REQUEST_EN.test(t) || isImperative(text) || QUESTION_TA.test(text) || QUESTION_TG.test(t) || /\?\s*$/.test(text) || t.trim().split(" ").length <= 4;
};

export function addressed(i: GateInput): Addressed {
  const text = i.text.trim();
  const named = namedIn(text);
  if (named != null) return { tier: 1, act: true, text: named || text, maxLevel: "C", why: "named" };
  const engaged = i.lastTurnAt != null && i.now - i.lastTurnAt <= ENGAGED_MS;
  if (engaged && looksRequest(text) && !looksSide(text)) return { tier: 2, act: true, text, maxLevel: "C", why: "engaged" };
  if (looksSide(text)) return { tier: 0, act: false, text, maxLevel: null, why: "side" };
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
