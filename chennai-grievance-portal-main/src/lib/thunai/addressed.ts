/**
 * Was that said to Jarvis? Pure: after speech-to-text and before anything acts. No speaker identification exists, so anyone
 * in the room can command it; this decides only whether a sentence was addressed to it.
 *   1 named:    contains "Jarvis" or ஜார்விஸ் -> act
 *   2 engaged:  within 20 s of Jarvis's last turn, and it parses as a request or follow-up -> act
 *   3 command:  the bare stop word -> act, level A only. v4 also took, at level A, a line the rules resolve with confidence and
 *               slots, or an imperative plus a district noun, that tier 2 did not take. v5 (C1) cut those two returns, inside the
 *               20 s and outside it: unnamed, a console-shaped line that is not asked as a request is most often said to someone
 *               else. JARVIS_GATE_COMMAND_TIER=1 (NEXT_PUBLIC_JARVIS_GATE_COMMAND_TIER=1 in the browser) or `commandTier` brings
 *               them back
 *   0 ignored:  a faint line on screen for 2 s, not logged, and the planner never sees it
 * Levels B and C need tier 1 or 2. When unsure, do not act: a wrong silent ignore is put right by saying "Jarvis"; acting on
 * someone's side conversation is not.
 */
import { talkedAbout, wakeIn } from "@/components/collector/app/thunai/wake";
import { isEnglishWord } from "./english";
import { understandV8 } from "./v8/flag8";
import { areaWord } from "./v8/lang8";
import { ordinalOf } from "./v8/refs8";
import { understandV10 } from "./v10/flag10";

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
  /** v4's command tier (both returns, in the engaged window and out of it): true brings it back, false keeps it cut; unset, the env decides (commandTierOn) */
  commandTier?: boolean;
  /** v8: Jarvis waits for a yes or a choice (a card, a question back): a plain "okay" or "yes" is an answer, not a filler */
  awaitingAnswer?: boolean;
  /** v8: said right after "Hey Jarvis" (the device's wake word), before Jarvis answered anything: the call's own request */
  called?: boolean;
}

// ---- v8 (the owner's example 5; docs/jarvis/v8-research/20-addressee-language.md R1): hard silences, before the engaged window's rule.
// The owner's own session (18 Nov) answered "Alexa, when was it open?", "What are the", "தயவுசெய்து," and an unclear Tamil word.

/** another assistant's name, called: "Alexa, ...", "Siri ...", "Hey Google, ..." ("google it" is a look-up, not a call: the review, 18 Nov) */
const ASSISTANT8 = /^\s*(?:hey |ok |okay )?(?:alexa|siri|cortana|bixby)\b|^\s*(?:hey |ok |okay )?(?:google|gemini|chatgpt)\s*[,.!?]|^\s*(?:hey|ok|okay) google\b/i;
/** the same names as Whisper writes them in Tamil letters ("அலேக்சா When was it open?": the real run, 18 Nov) */
const ASSISTANT8_TA = /^\s*(?:அலெக்சா|அலேக்சா|அலெக்ஸா|அலேக்ஸா|அலெக்ஸ்ஸா)|^\s*(?:சிரி|கூகுள்|கூகிள்)\s*,/u;
/**
 * v10 (v10-research/30-side-talk.md 3.3-3.4, 5.4): talk about the screen to someone beside it ("See, this one has gone up", "Look at this, Adyar is
 * the worst again", "Idhu romba jaasthi aagiduchu, paarunga", "இதோ பாருங்க ..."): a perception verb with a demonstrative, never "look up", "look
 * for" or "show"; a phone call's opener ("Hello? Haan, sollunga"); hearsay ("... illaiyaam", "... வருமாம்": they say ...).
 */
const SCREEN_TALK_EN = /^\s*(?:see|look)\s*[,.!]\s|^\s*look\s+(?:at\s+(?:this|that|it|these|those|here)|here)\b/i;
const SCREEN_TALK_TG = /\b(?:idhu|idho|ithu|itho|inga|ingey|adho|atho)\b.*\b(?:paarunga|paaru|parunga|paru|paarungo|paarungal)\b|\b(?:paarunga|parunga|paarungo)\b[\s,.!]+(?:idhu|idho|ithu|itho|inga)\b/i;
const SCREEN_TALK_TA = /(?:^|\s)(?:இதோ|இதைப்|இதை|இங்க|இங்கே|அதோ)\s*(?:பாருங்க|பாரு|பாருங்கள்|பாருங்கோ)/u;
// (a lookahead, not \b: \b knows only ASCII letters, so it never ends a Tamil word)
const PHONE_OPEN = /^\s*(?:hello|hallo|halo|ஹலோ)\s*[?!.,]+\s*(?:(?:haan|han|ha|aan|yes|yeah|ok|okay|sollunga|sollungo|sollu|speaking|tell me|sir|madam|ஆ|ஆமா|சொல்லுங்க|சொல்லு|சொல்லுங்கோ)(?=[\s,.!?]|$)[\s,.!?]*)+/iu;
// (not a yes or a no that ends so: "aamaam", "Map vendaam", ஆமாம் is ஆ + மாம்: v10 review 2, finding 21)
const HEARSAY_TG = /\b(?!(?:aama?am|vendaam|vendam|venaam)\b)[a-z]{3,}(?:iyaam|yaam|maam|chaam|daam|taam)\s*[.!?]*\s*$/i;
const HEARSAY_TA = /\S(?<!(?:^|[\s,.!?])ஆ)(?:மாம்|களாம்|ச்சாம்|தாம்)\s*[.!?]*\s*$/u;
/** a person addressed by a title, set off by a comma: "Sir, the car is ready", "Madam, ...", "..., sir" ("Amma Unavagam complaints" is no title) */
const HONORIFIC8 = /^\s*(?:sir|madam|ma'?am|mam|saar|ayya|amma|akka|thambi|boss|anna)\s*[,.!]|,\s*(?:sir|madam|saar|boss)\s*[.!?]*\s*$/i;
/** v10: the same in Tamil script ("சார், ...", "தம்பி, ...", "..., சார்"); "ஏங்க", "ஏய்", "டேய்" call a person with or without the comma. A title with
 * no comma is a name or a place ("அண்ணா நகர்", "அம்மா உணவகம்") */
const HONORIFIC_TA = /^\s*(?:சார்|சாரு|மேடம்|ஐயா|அய்யா|அம்மா|அக்கா|தம்பி|அண்ணா|அண்ணே|மச்சான்|மச்சி|தங்கச்சி|பாப்பா)\s*[,.!]|^\s*(?:ஏங்க|ஏய்|டேய்|ஏம்பா|ஏம்மா)(?:\s|[,.!]|$)|,\s*(?:சார்|மேடம்|ஐயா)\s*[.!?]*\s*$/u;
/** an errand for a person in the room: call, tell, ask, inform ... someone; bring or send them a thing ("send it to the AE" may be the console's: kept) */
const ERRAND8 = /^ (?:(?:yes|yeah|ok|okay|and|so|then|please|also) )*(?:(?:call|phone|ring|inform|ask|tell|remind|message|text) (?:him|her|them|(?:the |our )?(?:pa|ae|aee|ee|dro|rdo|vao|tahsildar|driver|commissioner|secretary|engineer|officer|inspector|mla|mp|minister|staff|peon|clerk|team|deputy))|(?:bring|fetch|hand|send|forward) (?:him|her|them|the file|the letter|the papers|the car|tea|coffee))\b/;
const ERRAND8_TA = /(?:அவரை|அவனை|அவளை|அவங்களை|அவர்களை|அவருக்கு|அவங்களுக்கு|அவர்களுக்கு|அவர்கிட்ட|அவங்ககிட்ட)|(?:^|\s)\S+\s*கிட்ட\s+(?:சொல்|கொடு|குடு|அனுப்பு)|கொண்டு\s*வா/u;
const ERRAND8_TG = /\b(?:avarai|avanai|avanga(?:lai|ukku)?|avarukku)\b|\bkitta\s+(?:sollu|sollunga|kudu|kudunga|anuppu|anuppunga)\b|\bkondu\s+(?:vaa|va|vaanga|varunga)\b/;
/** asking a person in the room about themselves or what they did ("did you speak to the engineer", "have you eaten") */
const YOU_PAST8 = /^ (?:did|have|had|were|was) you (?!(?:show|open|find|get|have the|check|read|tell|compare|explain|see the (?:report|cases|list|news))\b)/;
/** words that carry nothing alone: backchannels, thanks, "please" (a yes or a no is an answer to Jarvis's offer, and stays one) */
const FILLER8 = new Set(["hmm", "hm", "mm", "mmm", "uh", "um", "ah", "oh", "aha", "please", "thanks", "thank", "you", "ம்ம்", "ம்", "நன்றி", "தயவுசெய்து"]);
/** an acknowledgement said twice over ("okay okay", "seri seri"): talk, not an answer */
const ACK8 = new Set(["ok", "okay", "okk", "yes", "yeah", "sari", "seri", "haan", "achha", "acha", "fine", "right", "சரி", "ஓகே", "ஆமா"]);
/** a sentence cut off before its point: it ends on a word that cannot end one ("Who is this assigned to?", "Open that." can: the review, 18 Nov) */
const DANGLING8 = / (?:the|a|an|and|or|but|of|my|your|our|their|is|are|was|were|if|because|than|what|which|whats) $/;
/** v10: a question embedded in a request ends on its verb and is whole ("Tell me where the Adyar zonal office is", "Find out who the AE for
 * Velachery is"): words before the question word, two words or more after it. Not "if", "whether", "why" or "which" ("Tell me if the drain is"
 * is cut off). v10 review 2, finding 19: these were held as cut off, and never answered. Round 2: a cleft ("And what I need is", "Okay what I want
 * is") or a relative clause ("Show me the complaints where the status is") cut off before its point stays cut off. Round 3: those two shapes are
 * all that is left out (round 2 took only a listed verb right before the question word for the frame, and "Tell me exactly where ...", "Any idea
 * who ...", "Can you find where ..." were cut off again) */
const EMBEDDED_ASK = /^(?:\S+ )+(?:where|what|who|when|how) \S+(?: \S+)* (?:is|are|was|were)$/;
/** the cleft: nothing but a filler or the name before the question word ("and what I need is", "jarvis what I need is") */
const CLEFT = /^(?:(?:and|so|ok|okay|but|now|well|then|also|yes|yeah|right|haan|seri|sari|hey|hi|jarvis|ஜார்விஸ்) )+(?:where|what|who|when|how) /;
/** the relative clause: the question word right after a noun the sentence names ("the complaints where", "those wards where") */
const RELATIVE = /(?:^| )(?:the|these|those) \S+ (?:where|when|who) /;
/** v10 review 2, round 4: the same on a request's object with no article, or with a phrase between ("Show me complaints where the status is", "List
 * complaints in Adyar where the road is"): a show or list verb, its object, then where/when/who. A question is no object: "Show me where", "Show me
 * again where", "Find out who" (a pronoun, particle, adverb or preposition first), "Show me the map and tell me where" ("and", "tell" in it), "Give me
 * an update on where" (a preposition right before it) */
const RELATIVE_OBJ = /(?:^| )(?:show|list|give|get|display|filter|find|count|map|mark|highlight|sort|rank|pull up|bring up|open) (?:(?:me|us) )?(?:(?:only|just|\S+ly) )?(?:(?:all|the|these|those|any|some) ){0,2}(?!(?:me|us|out|up|again|now|just|also|then|here|there|please|on|in|at|for|from|to|with|by|about|where|when|who|what|how|which|\S+ly)\b)(?:(?!(?:and|or|tell|me|us|you|where|when|who|what|how|which)\b)\S+ ){0,6}(?!(?:and|or|tell|me|us|you|where|when|who|what|how|which|on|about|of|in|at|for|from|to|with|by|as|regarding|over|into|is|are|was|were)\b)\S+ (?:where|when|who) /;
export const embeddedAsk = (text: string): boolean => {
  const t = norm(text).trim();
  return EMBEDDED_ASK.test(t) && !CLEFT.test(t) && !RELATIVE.test(t) && !RELATIVE_OBJ.test(t);
};
/** one Tamil word that is a whole command or answer ("அடுத்து": next) */
const ONE_WORD_TA8 = /^(?:அடுத்து|அடுத்தது|முந்தையது|நிறுத்து|போதும்|மீண்டும்|மூடு|திற|படி|காட்டு|சரி|பின்னால்|வேண்டாம்|இல்லை|ஆமாம்|ஆம்)$/u;
/** a request said with its verb at the end: "the Nungambakkam subway one, open it"; "Supreme Court news open pannunga" */
const LATE_VERB8 = / (?:open|show|read|play|close|pull up|bring up|explain|summari[sz]e) (?:it|that|this|them|me|it up|that one|this one)? ?$|\b(?:open|show|read|compare|list|filter|map|sort|close|explain) (?:pa+n+[iy]?u+(?:nga|ngal|ngo)?|panni kaattunga)\s*$/;

/** a capitalised word ending the clause or opening it with a comma, that is no English word, no place and not Jarvis: a person's name */
function vocative8(raw: string, districtNoun: boolean): boolean {
  const t = raw.trim();
  const lead = /^([A-Z][a-z]{2,15})\s*,/.exec(t)?.[1];
  const tail = /,\s*([A-Z][a-z]{2,15})[.!?]*$/.exec(t)?.[1];
  // not a name: the Collector's own backchannels ("Seri, open the news", "Haan, show me ...") and a district place ("..., Velachery")
  const named = (w: string | undefined) => !!w && !/^(?:jarvis|okay|ok|yes|yeah|now|so|well|then|also|please|sorry|first|next|and|but|tell|show|open|read|seri|sari|haan|han|achha|acha|aama|sure|right|alright|fine|good|great|hmm)$/i.test(w)
    && !isEnglishWord(w.toLowerCase()) && !areaWord(w);
  // a name that is a district place ("Adyar, the severe ones") is the topic, not a person
  return (named(lead) && !(districtNoun && t.toLowerCase().startsWith(String(lead).toLowerCase()) && !/\b(?:send|tell|call|ask|bring|give)\b/i.test(t))) || named(tail);
}

/** Why a line the open mic heard is not for Jarvis (v8's hard silences), or null. Named lines never reach this. */
export function sideTalk8(text: string, o: { awaiting?: boolean; districtNoun?: boolean } = {}): string | null {
  const t = norm(text);
  const words = t.trim().split(" ").filter(Boolean);
  if (ASSISTANT8.test(text) || ASSISTANT8_TA.test(text)) return "another-assistant";
  if ((HONORIFIC8.test(text) || (understandV10() && HONORIFIC_TA.test(text.normalize("NFC")))) && !o.awaiting) return "title";
  if (vocative8(text, !!o.districtNoun)) return "person";
  if (understandV10()) {
    const nfc = text.normalize("NFC");
    if (PHONE_OPEN.test(nfc)) return "phone";
    if (SCREEN_TALK_EN.test(text) || SCREEN_TALK_TG.test(t) || SCREEN_TALK_TA.test(nfc)) return "screen-talk";
    if (!o.awaiting && (HEARSAY_TG.test(t.trim()) || HEARSAY_TA.test(nfc))) return "hearsay";
  }
  // Jarvis waits for an answer (a yes, a choice, a question back): whatever else is said is that answer ("rendavadhu", "Yes, tell them.": the
  // review, 19 Nov); only another assistant or a person named above is someone else's
  if (o.awaiting) return null;
  if (ERRAND8.test(t) || ERRAND8_TA.test(text) || ERRAND8_TG.test(t)) return "errand";
  if (YOU_PAST8.test(t)) return "asked-a-person";
  if (words.length && (words.every((w) => FILLER8.has(w)) || (words.length >= 2 && words.every((w) => ACK8.has(w) || FILLER8.has(w))))) return o.awaiting ? null : "filler";
  if (DANGLING8.test(t) && !o.awaiting && !(understandV10() && embeddedAsk(text))) return "cut-off";
  if (words.length === 1 && ONE_WORD_TA8.test(words[0])) return null;
  // an ordinal or "both" alone is a follow-up on the list ("rendavadhu", "இரண்டாவது", "rendum")
  if (words.length <= 2 && (ordinalOf(text) != null || /^(?:rendum|irandum|ரெண்டும்|இரண்டும்|both)$/iu.test(words.join(" ")))) return null;
  if (unclearWord(text, !!o.districtNoun)) return "unclear";
  return null;
}

/** one word no lexicon knows (a noise Whisper wrote down): neither English, nor a district word, nor a Tamil question or command, nor a yes or a
 * no. v10: also asked by the browser's lanes (browser10.ts), for a line that reached them named, called or engaged ("வாயமுர்ரா.") */
export function unclearWord(text: string, districtNoun: boolean): boolean {
  const t = norm(text);
  const words = t.trim().split(" ").filter(Boolean);
  if (words.length !== 1 || districtNoun || ACK8.has(words[0]) || FILLER8.has(words[0]) || /^(?:no|nope|இல்லை|இல்ல|வேண்டாம்|வேணாம்|ஆம்|ஆமாம்|illa|venaam|vendaam|aama|aamam)$/u.test(words[0])) return false;
  if (ONE_WORD_TA8.test(words[0]) || ordinalOf(text) != null) return false;
  const w = words[0];
  const tamil = /[஀-௿]/u.test(w);
  return tamil ? !QUESTION_TA.test(text) && !IMPERATIVE_TA.test(text.replace(/[.!?,]+\s*$/, "").trim()) : !isEnglishWord(w) && !QUESTION_TG.test(t) && !IMPERATIVE_TG.test(t.trim());
}

export const ENGAGED_MS = 20_000;

/**
 * v4's command tier, cut in v5 (C1) in the engaged window and out of it. JARVIS_GATE_COMMAND_TIER=1 on the server or in a harness;
 * NEXT_PUBLIC_JARVIS_GATE_COMMAND_TIER=1 in the browser, where only NEXT_PUBLIC_ is inlined at build time (read first: it never
 * touches `process` once inlined). Default off.
 */
export const commandTierOn = (o?: boolean): boolean => {
  if (o !== undefined) return o;
  try {
    return process.env.NEXT_PUBLIC_JARVIS_GATE_COMMAND_TIER === "1" || process.env.JARVIS_GATE_COMMAND_TIER === "1";
  } catch {
    return false;
  }
};

/** a bare stop: it only ever stops Jarvis, so it needs no name and no recent turn (a typed question, or a long answer, is stopped by it) */
const STOP_CORE = "stop|stop it|stop that|stop this|enough|nirutthu|niruthu|nirutha|nirutthunga|niruthunga|nirutthungal|stop pannu|stop pannunga|stop pannungal|நிறுத்து|நிறுத்துங்க|நிறுத்துங்கள்|நிறுத்துங்கோ|நிறுத்தவும்|போதும் நிறுத்து";
const STOP_WORD = new RegExp("^ (?:jarvis )?(?:" + STOP_CORE + ")(?: (?:jarvis|please|pls|plz|ji))* $");
export const isStopWord = (text: string): boolean => STOP_WORD.test(norm(text));

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
const IMPERATIVE_TG = /\b(kaattu|kaatu|kattu|katu|kaami|kaminga|kaattunga|kaatunga|kattunga|katunga|thira|thiranga|thirandhu|sollu|sollunga|oppidu|oppidunga|paaru|paarunga|ponga|maathu|mathu|maathunga|padi|padinga|podu|podunga|kudu|kudunga|show pannu|open pannu|compare pannu|list pannu|filter pannu|map pannu|sort pannu)\s*$/;
/** the shape of a request or a follow-up: for tier 2 */
const REQUEST_EN = /^ (and|what|whats|why|how|which|where|who|when|same|also|now|only|just|no|not|then|next|compare|show|open|go|list|read|tell|give|filter|sort|zone|in|for|at|more|less|top|worst|best|first|second|third|last|today|please|ok|okay|yes|can|could|would|is|are|was|were|do|does|did(?! you| i )|put|make|build|create|get|bring|check|look|find|pull|prepare|summarise|summarize|brief|run|add|change|set|switch|draft|export|map|rank|save|pin|remember|remind) /;
const QUESTION_TA = /(என்ன|எங்க|எங்கே|ஏன்|எத்தனை|எவ்வளவு|எது|(?:^|\s)யார்|எப்படி|எப்போ|ஆ\?|ஆ *$)/;
// (epdi: the clipped "how" of spoken Tanglish, "idhu epdi theriyum": lane D2's how-do-you-know forms)
const QUESTION_TG = /\b(enna|enga|yen|ethana|evvalavu|edhu|yaaru|eppadi|epdi|eppo)\b/;
/** what the console talks about: with one of these, a sentence with a chore's shape is still work */
const WORK_EN = /\b(complaints?|grievances?|cases?|incidents?|accidents?|reports?|status|situation|news|levels?|counts?|numbers?|figures?|totals?|data|trends?|charts?|graphs?|maps?|lists?|pages?|panels?|screens?|dashboard|overview|briefing|brief|summary|update|forecast|readings?|rainfall|gauges?|records|petitions?|alerts?|zones?|wards?|taluks?|departments?|dept|officers?|severe|overdue|backlog|prices?|markets?|environment|aqi|lakes?|reservoirs?|pugar|nilavaram|alavu|evvalavu|ethana|seidhi)\b/;
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
  return /(jarvis|ஜார்விஸ்|ஜர்விஸ்)/i.test(text) ? text.replace(/,?\s*(jarvis|ஜார்விஸ்|ஜர்விஸ்)\s*,?/gi, " ").replace(/\s+/g, " ").trim() : null;
}

export const isImperative = (text: string): boolean => {
  const t = norm(text);
  return IMPERATIVE_EN.test(t) || IMPERATIVE_TA.test(text.replace(/[.!?,]+\s*$/, "").trim()) || IMPERATIVE_TG.test(t.trim());
};
/** asked as a request or a question, whatever its length (v8: a verb at the end too, "the X one, open it", "news open pannunga") */
const shaped = (text: string, t: string) => REQUEST_EN.test(t) || isImperative(text) || QUESTION_TA.test(text) || QUESTION_TG.test(t) || /\?\s*$/.test(text) || (understandV8() && LATE_VERB8.test(t))
  || (understandV10() && clauseShaped(text));
/** v10 dev2: the clauses the speech-to-text set off with its punctuation. A request in a later clause, after a lead-in or a topic said first ("hold
 * on. go deeper here", "rain gauges, last 24 hours, what have we got"), or a Tamil verb ending its own clause ("full-aa padinga, endha endha
 * area-nu ellam"), is a request's shape as much as one at the line's start or end. Not after a remark of its own ("rain is heavy, close the
 * windows": an errand after a statement), nor after a person's name ("Ramesh, show the Adyar cases.") */
const clausesOf = (text: string): string[] => text.split(/[,.;:!?…]+/u).map((x) => x.trim()).filter(Boolean);
const clauseShaped = (text: string): boolean => {
  const cs = clausesOf(text);
  if (cs.length < 2 || vocativeLead(text)) return false;
  for (const c of cs) {
    if (REQUEST_EN.test(norm(c)) || isImperative(c)) return true;
    if (statement(c, norm(c))) return false;
  }
  return false;
};
/** a first clause that is a person's name alone ("Ramesh, show the Adyar cases."): the request after it is said to that person */
const vocativeLead = (text: string): boolean => {
  const w = /^\s*([A-Z][a-z]{2,15})\s*,/.exec(text)?.[1];
  return !!w && !isEnglishWord(w.toLowerCase()) && !areaWord(w) && !/^(?:jarvis|okay|ok|yes|yeah|seri|sari|haan|han|achha|acha|aama|hmm)$/i.test(w);
};
const statement = (text: string, t: string) => STATEMENT_EN.test(t) || ASIDE_TA.test(text) || (FINITE_TA.test(text) && !QUESTION_TA.test(text));
/** v10 review 2, round 3: a statement of its own ("the driver is waiting downstairs", "my phone is not working", "மழை வருது"): never the rest of a
 * line held as cut off (conductor.ts gateFor) */
export const isStatement = (text: string): boolean => statement(text, norm(text));
/** a chore for someone in the room, not work for the console */
const chore = (text: string, engaged = false): boolean => {
  const t = norm(text);
  if (WORK_EN.test(t) || WORK_TA.test(text)) return false;
  if (ERRAND_EN.test(t) || ROOM_ASK.test(t) || ROOM_THING.test(t)) return true;
  return !engaged && (TAKE_ME.test(t) || ERRAND_TA.test(text.replace(/[.!?,]+\s*$/, "").trim()) || ERRAND_TG.test(t));
};

const sideEn = (t: string, weak: boolean) => SIDE_STRONG.test(t) || (weak && SIDE_WEAK.test(t));
/**
 * v10 dev2: the office's own "we" and "our" asking what it holds ("rain gauges, last 24 hours, what have we got", "and on our side? any complaints
 * there", "how many complaints do we have in Adyar", "what do our records say"): the Collector asking the console's records, not talk about other
 * people. Taken out before the side-talk words are looked for, only in the conversation and only beside the console's own things; "shall we",
 * "should we", "let us", "our car", "what have we got for lunch" stay side talk
 */
const OUR_OWN = /\b(?:what (?:have|do|did) we (?:got|get|have)|whatve we got|(?:do|did|have) we (?:have|got)|how (?:are|is) we (?:doing|placed|looking)|where are we (?:on|with)|what are we (?:looking at|seeing|dealing with)|(?:on|from|at) our (?:side|end)|(?:in |from )?our (?:own )?(?:side|end|records?|data|system|console|numbers|figures|gauges|readings|complaints|grievances|petitions|cases))\b/g;
export const looksSide = (text: string, engaged = false, districtNoun = false): boolean => {
  const t0 = norm(text);
  const t = engaged && understandV10() && (WORK_EN.test(t0) || WORK_TA.test(text)) ? t0.replace(OUR_OWN, " ") : t0;
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

/**
 * v10 dev2: in the conversation, the list wanted said with no verb and asked for ("severe ones in adair zone, quick", "overdue ones in Teynampet zone,
 * fast", "the oldest open complaints in Royapuram please", "அடையாறு மண்டலத்துல சீரியஸ் புகார்கள், சீக்கிரம்"): a follow-up. Only the console's own
 * things with a word that picks from them (severe, overdue, pending, oldest ...), and asked: "ones" pointing back at what was on screen, or a word
 * said to the hearer (quick, please). Eight words at most, no verb, no person and no statement ("the zone officer called about the meeting",
 * "status meeting at five" stay someone else's). A list named and not asked ("severe cases in Perungudi this week") stays unaddressed: v5's C1
 */
const LIST_PICK = /\b(?:severe|serious|critical|urgent|overdue|pending|open|unresolved|unassigned|escalated|closed|resolved|new|latest|recent|oldest|top|worst|biggest|highest)\b/;
const LIST_PICK_TA = /சீரியஸ்|தீவிர|அவசர|நிலுவை|பெண்டிங்|புதிய|மோசமான|அதிக/u;
const VERB_EN = /\b(?:is|are|was|were|be|been|has|have|had|will|would|can|could|should|must|do|does|did|come|comes|came|go|goes|went|gone|say|says|said|tell|tells|told|ask|asks|asked|want|wants|need|needs|left|leaving|arrived|waiting|coming|going|sent|gave|took|got|brought|spoke|met|ate|eaten|happened|happens|call|calls|called|joined|ready)\b/;
/** a word in -ed that is a verb's past, not a list's state ("closed", "flooded", "escalated" are the console's) */
/** asked of the hearer: "ones" pointing back, or a word said to the one who does it */
const LIST_ASKED = /\b(?:ones|quick|quickly|fast|asap|please|pls|plz|seekiram|seekram|sikiram|sikkiram)\b/;
const LIST_ASKED_TA = /சீக்கிரம்|உடனே|தயவுசெய்து/u;
const PAST_ED = /\b(?!(?:closed|resolved|unresolved|escalated|assigned|unassigned|flooded|waterlogged|blocked|delayed|registered|reported|affected|damaged|logged|filed|need)\b)[a-z]{2,}ed\b/;
const consoleList = (text: string): boolean => {
  const t = norm(text);
  if (t.trim().split(" ").length > 8 || !(WORK_EN.test(t) || WORK_TA.test(text)) || !(LIST_PICK.test(t) || LIST_PICK_TA.test(text))
    || !(LIST_ASKED.test(t) || LIST_ASKED_TA.test(text))) return false;
  return !VERB_EN.test(t) && !PAST_ED.test(t) && !FIRST_PERSON.test(t) && !/\b(?:you|your|i|me|my)\b/.test(t) && !statement(text, t);
};

export function addressed(i: GateInput): Addressed {
  const text = i.text.trim();
  const named = namedIn(text);
  if (named != null) return { tier: 1, act: true, text: named || text, maxLevel: "C", why: "named" };
  // the name talked about: someone else is being spoken to, engaged or not
  if (talkedAbout(text)) return { tier: 0, act: false, text, maxLevel: null, why: "about" };
  if (isStopWord(text)) return { tier: 3, act: true, text, maxLevel: "A", why: "stop" };
  // v8: said to someone else (another assistant, a person by name or title, an errand for a person), a filler or a cut-off line: silent
  if (understandV8()) {
    const why = sideTalk8(text, { awaiting: i.awaitingAnswer, districtNoun: i.districtNoun });
    if (why) return { tier: 0, act: false, text, maxLevel: null, why };
    // the request said right after "Hey Jarvis": the Collector called Jarvis, so it is answered however loosely it is said ("Supreme Court News
    // Open Panyunga.", the real run o8b, 18 Nov); only the hard silences above hold
    if (i.called) return { tier: 1, act: true, text, maxLevel: "C", why: "called" };
    // Jarvis waits for an answer and has just spoken: this is the answer ("Yes, tell them.": the review, 19 Nov), not side talk
    if (i.awaitingAnswer && i.lastTurnAt != null && i.now - i.lastTurnAt <= ENGAGED_MS) return { tier: 2, act: true, text, maxLevel: "C", why: "answer" };
  }
  const engaged = i.lastTurnAt != null && i.now - i.lastTurnAt <= ENGAGED_MS;
  // v8: a leading backchannel ("Haan, show me the severe cases", "Seri, open the news") does not hide the request's shape (the review, 18 Nov)
  const core = understandV8() ? text.replace(/^\s*(?:haan|han|seri|sari|ok|okay|so|achha|acha|aama|yes|yeah|right)\s*[,.]\s*/i, "") || text : text;
  if (engaged && (looksRequest(core) || (understandV10() && consoleList(core))) && !looksSide(core, true, i.districtNoun) && !chore(core, true)) return { tier: 2, act: true, text, maxLevel: "C", why: "engaged" };
  if (looksSide(text, false, i.districtNoun)) return { tier: 0, act: false, text, maxLevel: null, why: "side" };
  if (chore(text) || statement(text, norm(text))) return { tier: 0, act: false, text, maxLevel: null, why: "aside" };
  // the command tier, cut in v5 (C1), inside the 20 s window and outside it: only the switch brings both returns back. Unnamed, a
  // command-shaped line that tier 2 did not take is most often someone else's, and saying "Jarvis" puts a wrong ignore right
  if (commandTierOn(i.commandTier)) {
    if (i.rulesSure && (isImperative(text) || i.districtNoun)) return { tier: 3, act: true, text, maxLevel: "A", why: "rules" };
    if (isImperative(text) && i.districtNoun) return { tier: 3, act: true, text, maxLevel: "A", why: "imperative" };
  }
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
