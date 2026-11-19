/**
 * v10: the whole dashboard by voice (docs/jarvis/JARVIS_V10.md 4.7; the inventory: docs/jarvis/v10-research/60-controls-inventory.json; the
 * registry design: 40-voice-ui-map-reading.md 5.1). A sentence names one console control, in English, Tamil or Tanglish: the control's id, and
 * how it is done (console steps, or pressing the control itself), or a question back when two controls match. Pure: no React, no network.
 *
 * The registry (controls10.data.ts) has one entry per control a Collector could want by voice: its names in en / ta / tl (the visible label
 * first, then synonyms), its region (said in a question back), its level (A / B / C / never, as risk.ts runs its steps) and how it is done.
 * Matching (5.1): the sentence and the names are normalised alike (NFC, Tamil-letter loanwords to their English word, Tanglish clitics -la / -ku
 * / -a and Tamil case endings by a shared stem, the light verbs pannu / பண்ணு as a frame); a registry name matched whole scores 1.0, a synonym
 * 0.95 (part of a name never acts: it took data requests, so shorter forms are written as synonyms); it acts when the best is at least 0.8 and
 * 0.1 clear of the next control that does something else, else it asks back naming at most three by region; never a silent pick by the shortest
 * name. A one-word name that is everyday talk ("News", "Rows", "Later") needs a "press" word (click, tap, அழுத்து) or its own window open. A "never" control (send, approve, delete, sign out, run a
 * pipeline) comes back as level "never": the console says it is the Collector's to tap. A sentence that is not plainly a control command (a
 * question about the data, a news request, a map question) is null: the other lanes take it.
 */
import type { Lang, PageKey, ScreenState, Step } from "../types";
import { planRisk } from "../risk";
import { isReflex } from "../plan";
import { readPositions } from "../ordinal";
import { localStageCommand } from "../stagelocal";
import { CONTROLS10, REGIONS10, SKIP10 } from "./controls10.data";

export interface ControlHit {
  /** the control's id in the registry (the inventory's ids) */
  id: string;
  /** console steps that do it (types.ts Step), when one exists */
  steps?: Step[];
  /** else the control pressed by its registry selector (dom.ts findControl), never a send, approve or delete */
  press?: string | null;
  /** a select: the option said ("set the station to Nungambakkam"); null: the control is only focused */
  value?: string | null;
  /** a checkbox: tick (true), untick (false), flip (null) */
  tick?: boolean | null;
  /** a text box: the words said replace what it holds ("set the message to …"); else a box holding a draft is added to (dom.ts pressControl) */
  replace?: boolean;
  /** the control is Jarvis's own (its cards, its tray): found inside Jarvis's UI, which a generic click never touches */
  own?: boolean;
  /** two or more controls match: the question back and its choices (by region) */
  which?: { en: string; ta: string; ids: string[] } | null;
  level: "A" | "B" | "C" | "never";
  /** its first names, for what is said about it ("Press Save new version?") */
  label?: { en: string; ta: string };
}

export interface ControlCtx10 {
  state: ScreenState; lang: Lang;
  /** the controls visible now, by registry id (the console's walk), if known */
  visible?: string[] | null;
  /** Jarvis's Stage is open: its own commands ("next", "close", "pin this") stay the Stage's */
  stage?: boolean;
  /** a dataset is open in the Data Studio: the console's steps its intercept keeps are the dataset's (studioLetsThrough) */
  studio?: boolean;
}

// ------------------------------------------------------------------------------------------------------------------------- the registry --
export type Level10 = "A" | "B" | "C" | "never";
export type Act10 =
  /** console steps (types.ts); a layer step's on/off is read from the sentence */
  | { steps: Step[] }
  /** press the control found by its selector (dom.ts findControl: "css" or "css::text|text"); a select is set to the option said, a checkbox
   * ticked or unticked; `own`: inside Jarvis's own UI */
  | { press: string; input?: "select" | "check" | "text"; own?: true; value?: string }
  /** Ask the Map or Rain & flooding: the map lane's (map10.ts), never run from here */
  | { map: true }
  /** never pressed by Jarvis: the Collector's own tap */
  | { never: string };
export interface When10 {
  /** the page it lives on */
  page?: PageKey | PageKey[];
  /** the window open in front of it (ScreenState.panel: a modal kind, "incident", "assistant") */
  panel?: string | string[];
  /** on Jarvis's open Stage only */
  stage?: true;
}
export interface Control10 {
  id: string;
  /** where it is, said in a question back (REGIONS10) */
  region: string;
  level: Level10;
  act: Act10;
  /** names: [0] is the visible label (Apple's rule: say what you see), synonyms after, by importance */
  en: string[]; ta: string[]; tl: string[];
  when?: When10;
}

// ------------------------------------------------------------------------------------------------------------------------ normalising --
const TAMIL = /[஀-௿]/u;
/** Tamil-letter loanwords to the English word (40-voice-ui-map-reading.md 1.6.5); a case ending after the stem is dropped with it */
const LOAN: [string, string][] = [
  ["டாஷ்போர்டு", "dashboard"], ["டாஷ்போர்ட்", "dashboard"], ["மேப்", "map"], ["லேயர்", "layer"], ["ஜூம்", "zoom"], ["எக்ஸ்போர்ட்", "export"],
  ["சேவ்", "save"], ["ஓப்பன்", "open"], ["க்ளோஸ்", "close"], ["குளோஸ்", "close"], ["நெக்ஸ்ட்", "next"], ["ஸ்டாப்", "stop"], ["நியூஸ்", "news"],
  ["பட்டன்", "button"], ["கிளிக்", "click"], ["க்ளிக்", "click"], ["பேஜ்", "page"], ["பேனல்", "panel"], ["ஃபில்டர்", "filter"], ["பில்டர்", "filter"],
  ["டவுன்லோடு", "download"], ["டவுன்லோட்", "download"], ["ரிப்போர்ட்", "report"], ["டார்க்", "dark"], ["லைட்", "light"], ["மோடு", "mode"],
  ["மோட்", "mode"], ["தீம்", "theme"], ["டிரெண்ட்ஸ்", "trends"], ["ட்ரெண்ட்ஸ்", "trends"], ["ஓவர்வியூ", "overview"], ["பிரீஃபிங்", "briefing"],
  ["ப்ரீஃபிங்", "briefing"], ["ஸ்டுடியோ", "studio"], ["மெனு", "menu"], ["செக்யூரிட்டி", "security"], ["அலர்ட்", "alert"], ["சர்ச்", "search"],
  ["ஜார்விஸ்", "jarvis"], ["டேட்டா", "data"], ["சோர்ஸ்", "source"], ["லிஸ்ட்", "list"], ["சாட்", "chat"], ["மியூட்", "mute"],
  ["சாட்டிலைட்", "satellite"], ["டிராஃபிக்", "traffic"], ["ட்ராஃபிக்", "traffic"], ["மெட்ரோ", "metro"], ["ரீலோடு", "reload"], ["ரீலோட்", "reload"],
  ["ரிஃப்ரெஷ்", "refresh"], ["கேன்சல்", "cancel"], ["ஸ்கிரீன்", "screen"], ["எக்செல்", "excel"], ["சிஎஸ்வி", "csv"], ["பிடிஎஃப்", "pdf"]
];
/** loanwords short enough to be part of other words: matched whole only */
const LOAN_EXACT: Record<string, string> = { "டேப்": "tab", "ஆன்": "on", "ஆஃப்": "off", "டிக்": "tick", "மைக்": "mic", "பேக்": "back", "டைப்": "type" };
/** the endings a loanword takes after its stem (மேப்பில், லேயர்களையும், மெனுவைத், டேட்டாவுல, பிரீஃபிங்குக்கு, ஃபில்டர்ஸ், சிஎஸ்வியா): the rest of the word
 * must be a case ending (with its clitic), the plural, or both, never any few letters (v10 review 2, finding 34: சர்ச்சையைக் காட்டு, "show the
 * controversy", opened Search; சாட்சி, a witness, was "chat"; மோட்டார் "mode"; சாட்டிலைட் "chat") */
/** said straight after the stem (மேப்ல, மேப்க்கு, டேட்டால) */
const LOAN_DIRECT = /^(?:ல|லே|ல்ல|க்கு(?:ப்|க்|த்|ம்)?)$/u;
/** a case ending, alone or with its clitic (ும், ஆ, ஏ), on the vowel after the stem's doubled consonant, its glide or a plural */
const LOAN_CASE = /^(?:ை(?:க்|த்|ப்|ச்|யும்|யா|யே)?|ில்|ிலே|ில|ிலும்|ிலா|ிலேயே|ிலிருந்து|ுக்கு(?:ப்|க்|த்|ம்)?|ுல|ுலே|ோட|ோடு|ோடே|ின்|ுடைய|ால்|ும்|ா|ே|ு)$/u;
/** Tamil words spelled as a loanword's case form: சர்ச்சை (a controversy) is சர்ச் + ஐ, சாட்டை (a whip) சாட் + ஐ. They, with their own endings,
 * stay themselves (v10 review 2, round 2: "இந்த சர்ச்சை", this controversy, opened Search), but for the loan's own case form with the doubled
 * consonant before a verb (round 3: "சர்ச்சைத் திற" is "open the search") */
const LOAN_NOT = ["சர்ச்சை", "சாட்டை"];
function loanEnds(stem: string, rest: string): boolean {
  if (!rest || LOAN_DIRECT.test(rest)) return true;
  // the plural: Tamil's கள் (லேயர்கள், லேயர்களையும்), or the English s in Tamil letters (ஃபில்டர்ஸ், ஃபில்டர்ஸை)
  if (rest === "கள்" || (rest.startsWith("கள") && LOAN_CASE.test(rest.slice(2)))) return true;
  if (!stem.endsWith("ஸ்") && (rest === "ஸ்" || (rest.startsWith("ஸ") && LOAN_CASE.test(rest.slice(1))))) return true;
  // the stem's last consonant said again (மேப் + பில்; ங் takes க: பிரீஃபிங் + குக்கு), or after a vowel its glide: ய after i, e and ai
  // (சிஎஸ்வி + யா), வ after the others (மெனு + வை, டேட்டா + வுல)
  const v = stem.endsWith("்") ? "" : stem.slice(-1);
  const x = v ? (/[ிீெேை]/u.test(v) ? "ய" : "வ") : stem[stem.length - 2] === "ங" ? "க" : stem[stem.length - 2];
  return rest.startsWith(x) && LOAN_CASE.test(rest.slice(x.length));
}

/** The words of a sentence or a name, normalised alike. */
export function words10(text: string): string[] {
  const t = String(text ?? "").normalize("NFC").toLowerCase()
    .replace(/[​-‍⁠﻿]/gu, "")
    .replace(/(\p{L})'s\b/gu, "$1")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
  if (!t) return [];
  const out: string[] = [];
  for (const w of t.split(" ")) {
    if (TAMIL.test(w)) {
      if (LOAN_EXACT[w]) { out.push(LOAN_EXACT[w]); continue; }
      if (LOAN_NOT.some((n) => w.startsWith(n) && !/^[கசதப]்$/u.test(w.slice(n.length)))) { out.push(w); continue; }
      const l = LOAN.find(([stem]) => w.startsWith(stem) && loanEnds(stem, w.slice(stem.length)));
      out.push(l ? l[1] : w);
    } else out.push(w);
  }
  return out;
}

/** a Tanglish clitic or an English ending on a Latin word ("page-ku", "mapla", "zones", "opened") */
const LATIN_END = /^(?:s|es|ed|d|ing|la|le|lla|ku|kku|ukku|a|ah|ai|um|oda|ode|e|aa|ye|ya|va)$/;
/** Is the spoken word the name's word (1), the name's word with an ending (0.97), or not (0)? */
export function wordEq(s: string, n: string): number {
  if (s === n) return 1;
  if (!s || !n) return 0;
  if (TAMIL.test(n)) {
    if (!TAMIL.test(s) || n.length < 3) return 0;
    let k = 0;
    while (k < s.length && k < n.length && s[k] === n[k]) k++;
    // a case ending or a sandhi changes the end of the stem (பக்கம் -> பக்கத்துக்கு, வரைபடம் -> வரைபடத்தை): a shared stem of all but two letters
    return k >= Math.max(3, n.length - 2) && s.length <= n.length + 9 ? 0.97 : 0;
  }
  if (n.length >= 3 && s.startsWith(n) && LATIN_END.test(s.slice(n.length))) return 0.97;
  if (s.length >= 4 && n.startsWith(s) && /^(?:s|es|e|d)$/.test(n.slice(s.length))) return 0.97;
  return 0;
}

// --------------------------------------------------------------------------------------------------------------------- frames, cues --
/** words a command is said with, around a control's name; they add nothing of their own */
const FILLER = new Set(`the a an please pls plz kindly jarvis hey hi hello ok okay can could would will you u i want wanna need to me us let lets now just for my
 this that it there here into onto on at up of in page tab tabs button panel window card menu link option screen section box view mode do again quickly
 open opening show showing display go goto take bring pull get see click press tap hit select choose pick switch use set change make move navigate jump
 turn put find launch also then
 pannu pannunga pannungo panni pannuga pannidu kaattu kaattunga kattu kattunga kaatu kaatunga kaami kaaminga kaamiunga kamiunga kami po ponga poi poyi
 poonga maathu maathunga mathu mathunga maattu maathi thora thorandhu thoranga thorangal thira thiranga thirandhu thirangal podu podunga podungo vai
 vainga vaiyunga amukku amukkunga amukkungo thattu thattunga konjam enakku andha indha adha idha da ma la le ku kku ukku ah aa ai um sollunga
 polaam polam pogalaam pogalam povom varattum varatum varanum
 திற திறங்க திறங்கள் திறக்க திறக்கவும் திறந்து திறந்துடு தொற தொறங்க காட்டு காட்டுங்க காட்டுங்கள் காட்டவும் காட்டி காமி காமிங்க காண்பி காண்பிங்க
 காண்பிக்கவும் போ போங்க போங்கள் போய் போகவும் செல் செல்லவும் மாத்து மாத்துங்க மாற்று மாற்றுங்கள் மாற்றவும் அழுத்து அழுத்துங்க அழுத்துங்கள்
 அழுத்தவும் தட்டு தட்டுங்க தட்டுங்கள் தட்டவும் பண்ணு பண்ணுங்க பண்ணுங்கள் பண்ணவும் பண்ணி செய் செய்யுங்க செய்யுங்கள் செய்யவும் வை வைங்க
 வையுங்கள் போடு போடுங்க போடுங்கள் போட்டு கொஞ்சம் தயவுசெய்து அந்த இந்த அதை இதை எனக்கு ப்ளீஸ் பக்கம் சாளரம் அட்டை பொத்தான் ஒரு
 இந்தத் அந்தத் இந்தச் அந்தச் இந்தப் அந்தப் போகலாம் போலாம் போவோம் வரட்டும் வரணும்`.split(/\s+/).filter(Boolean));
// (v10 dev2, dB-control-8, dB-control-11: the frame's verbs "let's go" (polaam, போகலாம்) and "let it come" (varattum, வரட்டும்) are a move or a
// placing said, as po and podu are; இந்த and அந்த with the doubled consonant before a word, இந்தத் திரை, are themselves)
/** words that put a thing first in an order: "first", "on top", "at the top", mela, முதல்ல, மேலே. Said in place of a name's "first" they are that
 * word, and said beside it ("rising first mela varattum") they add nothing (v10 dev2, dB-control-11: the prices card's "Rising first") */
const FIRST_W = new Set(["first", "top", "mela", "mele", "melae", "mudhalla", "mudhala", "mudhal", "munnadi", "முதலில்", "முதல்ல", "முதலாவதாக", "மேலே", "மேல", "முன்னாடி"]);
/** a word that says "press it": a one-word name that is also everyday talk ("News", "Rows", "Later") is taken with one of these, or in the
 * window it belongs to */
const CUE = new Set(`click press tap hit tab button toggle checkbox tick untick link amukku amukkunga thattu thattunga அழுத்து அழுத்துங்க அழுத்துங்கள்
 அழுத்தவும் தட்டு தட்டுங்க தட்டுங்கள் தட்டவும் பொத்தான்`.split(/\s+/).filter(Boolean));
const ON_W = new Set(`on tick check enable enabled show tik ஆன் டிக் போடு போடுங்க காட்டு காட்டுங்க`.split(/\s+/));
const OFF_W = new Set(`off untick uncheck disable disabled hide remove clear எடு எடுங்க நீக்கு நீக்குங்க அணை அணைங்க மறை மறைங்க வேண்டாம் vendaam venaam edu edunga
 maraicchu maraiyunga`.split(/\s+/).filter(Boolean));
/**
 * A text box takes the words said around its name only in a frame that types them, and the frame's words are never typed (v10 review 2, finding 28:
 * "read the message" cleared Take action's draft and typed "read"; round 2: "write the message in Tamil" typed "tamil", and podu / போடு typed
 * nothing). The frame is where the words stand against the box's name, not a word anywhere in the sentence:
 *   the box as the place the words go: "type drain overflow in the subject", "add … to the message", "subject la … podu", "தலைப்பில் … போடு";
 *   the box set to them: "set the subject to …", "replace the message with …" (they replace what it holds);
 *   a search box searched for them: "search the list for …";
 *   the words quoted: "subject-a … nu maathu", "தலைப்பை … என்று மாற்று", "… called Daily Briefing";
 *   the box's own name says to type ("search the list adyar").
 * The box as the thing written ("write the message in Tamil", "செய்தியைத் தமிழில் எழுது", "find the message from the zonal officer") is a
 * request about the draft, not words to type; nor is a box set to a manner ("change the message to a formal tone").
 */
/** put words in: type, write, put, enter, fill, add, paste (டைப் is "type"); podu, ezhudhu; போடு, எழுது, சேர், ஒட்டு */
const PUT_V = /^(?:type|typing|write|enter|fill|put|add|append|insert|paste|dictate|ezhudh\w*|ezhuth\w*|podu|podunga|podungo|poodu|pottu|pottudu|serthu|ottu)$|^(?:எழுது|எழுதுங்க|எழுதுங்கள்|எழுதவும்|எழுதி|போடு|போடுங்க|போடுங்கள்|போடவும்|போட்டு|போட்டுடு|சேர்|சேர்க்கவும்|சேர்த்து|சேருங்க|ஒட்டு|ஒட்டுங்க|ஒட்டவும்)$/u;
/** make it hold them: set, change, replace, rename; maathu; மாற்று, மாத்து */
const SET_V = /^(?:set|change|make|replace|rename|update|edit|correct|maathu|maathunga|mathu|mathunga|maathi|maatru\w*)$|^(?:மாற்று|மாற்றுங்க|மாற்றுங்கள்|மாற்றவும்|மாற்றி|மாத்து|மாத்துங்க|மாத்தி|ஆக்கு)$/u;
/** look for them (a search box's own frame): search, find, filter, look; thedu; தேடு, வடிகட்டு */
const SEARCH_V = /^(?:search|searching|find|filter|look|lookup|seek|thed\w*|thaed\w*)$|^(?:தேடு|தேடுங்க|தேடுங்கள்|தேடவும்|தேடி|வடிகட்டு|வடிகட்டுங்க|வடிகட்டவும்)$/u;
const TYPE_VERB = (w: string) => PUT_V.test(w) || SET_V.test(w) || SEARCH_V.test(w);
/** before the box: where the words go ("in the subject", "to the message") */
const INTO_W = new Set(["in", "into", "inside", "on", "onto", "to"]);
/** after the box (Tanglish): "subject la", "box kulla" */
const LA_W = new Set(["la", "le", "lla", "ile", "ula", "ulla", "kulla", "ulle", "kulle"]);
/** a Tamil locative on the box's own word (தலைப்பில், பெட்டியில், தலைப்புல, பெட்டிக்குள்) */
const TA_LOC = /(?:ல்|ல|லே|க்குள்|குள்|குள்ளே)$/u;
/** after the box: what it becomes ("set the subject to …", "replace it with …") */
const TO_W = new Set(["to", "as", "with"]);
/** the words quoted: after them (nu, என்று) or before them (called, named) */
const QUOTE_AFTER = new Set(["nu", "nnu", "apdinu", "appadinu", "endru", "enru", "என்று", "என", "னு", "ன்னு", "அப்படின்னு", "எனும்"]);
const QUOTE_BEFORE = new Set(["called", "named", "saying", "says", "say", "titled", "as"]);
/** "type it": words said to be typed as they are, an article or an object's case among them ("type the drain is blocked in the subject") */
const DICTATE = /^(?:type|typing|enter|dictate)$/u;
/** a thing to write about, not the words: an article before it ("add a line to the message"), an object's case after it in Tanglish
 * ("address-a message la podu") or on it in Tamil ("முகவரியைச் செய்தியில் சேர்"), or as the first of the words: someone's, something ("add his
 * phone number to the message", "அவருடைய எண்ணைச் சேர்": v10 review 2, round 3) */
const DESCRIBE_BEFORE = new Set(["a", "an", "the", "some", "this", "that", "my", "his", "her", "their", "your", "our", "its", "something", "anything",
  "அவருடைய", "அவரது", "அவனுடைய", "அவனது", "அவளுடைய", "அவளது", "அவர்களுடைய", "அவர்களது", "ஏதாவது", "ஏதோ",
  "avaroda", "avanoda", "avaloda", "avangaloda", "avangaludaya", "edhavadhu", "ethavathu", "edho"]);
const ACC_AFTER = new Set(["a", "ai", "ah", "aa"]);
/** the object's case: ை with the doubled consonant after it (முகவரியைச்), the glide before it (முகவரியை) or -த்தை (விவரத்தை); a bare ை ends a noun
 * of its own (மழை, குப்பை, சாலை, பிரச்சினை: round 3, they were dropped), but for a plural's (விவரங்களை) and the things a draft is filled with,
 * a name, a number, a complaint, the information, a reply, him or her (round 4: "அவர் பெயரை தலைப்பில் போடு" typed "அவர் பெயரை" over the subject) */
const TA_ACC = /(?:யை|த்தை|ை[கசதப]்|.களை|பெயரை|பேரை|எண்ணை|புகாரை|தகவலை|பதிலை|அவரை|அவனை|அவளை)$/u;
/** a question's own word in the words (NOT_CONTROL's why, what, which, enna, என்ன): a thing to write about or a question, never words to type; a
 * title's "how to …" is words ("search the list for how to apply") (v10 review 2, round 3) */
const ASKS = /\b(?:why|how|what|whats|which|who|whom|whose|when|where|enna|evlo|eppadi|yen|endha|yaaru)\b(?!\s+to\b)|(?:^|\s)(?:ஏன்|எப்படி|என்ன|எந்த|எத்தனை|எவ்வளவு|யார்|எப்போ)(?:[கசதப]்|து)?(?=\s|$)/iu;
/** the little words between a preposition and the box ("in the subject", "to my message") */
const ARTICLE = new Set(["the", "a", "an", "my", "this", "that", "its", "your", "our", "அந்த", "இந்த"]);
/** a box's own nouns said after its name ("the subject box la", "the subject line to …": round 4, "line" was typed) */
const BOX_W = new Set(["box", "field", "bar", "area", "space", "column", "line", "பெட்டி", "புலம்"]);
/** a redraft's words before how it should read ("to be more polite", "to a lot more formal", "to sound friendlier") */
const LEAD_GLUE = /^(?:be|sound|sounds|sounding|so|much|lot|very|too|slightly|somewhat|rather|more|less|bit|little|a|an|the)$/u;
/** a sentence's own verb after its subject ("the drain was cleared today", "the zonal officer will inspect tomorrow"): words said, not a thing
 * after an article; a relative "that"/"which" before it is still a thing ("a new draft that is polite") */
const CLAUSE_W = /^(?:is|are|was|were|will|would|shall|should|has|have|had|can|could|may|might|must|does|did)$/u;
const REL_W = new Set(["that", "which", "who"]);
/** how a draft is written, not what it says: a language, a tone, a length ("in Tamil", "to a formal tone", "shorter", "சுருக்கமாக") */
const MANNER = /^(?:tone|formal\w*|informal\w*|polite\w*|friendl\w*|firm\w*|strict\w*|short\w*|brief\w*|long|longer|detail\w*|simple|simpler|simply|clear|clearer|concise\w*|crisp\w*|professional\w*|casual\w*|tamil\w*|english\w*|language|version|way|manner|style|more|less|bit|little|mariyadh\w*|mariyaadh\w*|churukk\w*|surukk\w*|viriv\w*|elimai\w*)$|^(?:தமிழ்|தமிழி|ஆங்கில|இங்கிலீஷ்|முறையா|மரியாதை|சுருக்க|விரிவா|விரிவான|எளிமை|தொனி|நடை|மொழி|நீளமா|நீளமான)/u;
/** a select's name said as something's own: "the status of the second one", "second one oda status", "இரண்டாவதின் நிலை" (its status, a question
 * about that thing), never the option it is set to (v10 review 2, round 2) */
const GEN_W = new Set(["oda", "ode", "odaya", "odaiya", "udaya", "udeya", "yoda", "voda"]);
const TA_GEN = /(?:இன்|ின்|உடைய|ுடைய|ோட|ோடைய)$/u;
/** words that make a sentence a question about the data, a news request, or talk: not a control's, unless it says a control's whole name */
const NOT_CONTROL = /\b(?:why|how|what|whats|which|who|whom|whose|when|where|tell|explain|compare|versus|vs|is there|are there|should|many|much|latest|update|updates|about|pathi|patthi|paththi|enna|evlo|eppadi|yen|endha|yaaru)\b|\?|ஏன்|எப்படி|என்ன|எந்த|எத்தனை|எவ்வளவு|யார்|எப்போ|பற்றி|பத்தி|சொல்லு/iu;

const isFiller = (w: string): boolean => {
  if (FILLER.has(w) || OPTIONAL.has(w)) return true;
  if (!TAMIL.test(w)) { const m = /^(.{3,}?)(?:la|le|ku|kku|ukku|a|ah|ai|um)$/.exec(w); return !!m && FILLER.has(m[1]); }
  // a Tamil frame word with an ending (பக்கத்துக்கு, சாளரத்தை)
  for (const f of ["பக்கம்", "சாளரம்", "அட்டை", "பொத்தான்"]) if (wordEq(w, f)) return true;
  return false;
};

// -------------------------------------------------------------------------------------------------------------------------- matching --
/** words of a name that need not be said ("Back to live" is "back live"; "the", "my", "this" come and go) */
const OPTIONAL = new Set(`the a an please pls my this that these those its to of for your our with ஒரு அந்த இந்த`.split(/\s+/));
interface Prepared { e: Control10; names: { w: string[]; first: boolean; lang: "en" | "ta" | "tl" }[]; qual: string[] }
let PREPARED: Prepared[] | null = null;
function prepared(): Prepared[] {
  if (PREPARED) return PREPARED;
  PREPARED = CONTROLS10.map((e) => {
    const names: Prepared["names"] = [];
    for (const lang of ["en", "ta", "tl"] as const) e[lang].forEach((n, i) => {
      const all = words10(n);
      const req = all.filter((x) => !OPTIONAL.has(x));
      const w = req.length ? req : all;
      if (w.length) names.push({ w, first: i === 0, lang });
    });
    const r = REGIONS10[e.region];
    return { e, names, qual: r ? [...words10(r.en), ...words10(r.ta), ...(r.words ?? []).flatMap(words10)].filter((w) => !isFiller(w)) : [] };
  });
  return PREPARED;
}

export interface Match10 {
  id: string; score: number; e: Control10; value: string | null; tick: boolean | null; whole: boolean;
  /** a text box's value given by a typing frame (its words may be a question's: "search the list for how to apply") */
  typed?: boolean;
  /** the frame sets the box to the words ("set the message to …") */
  replace?: boolean;
}
type Scored = { s: number; value: string | null; tick: boolean | null; whole: boolean; typed?: boolean; replace?: boolean };

/** How well one name says the sentence: every word of the name heard, and nothing else said but frame words, the region's own words, a select's
 * option, or on / off. */
function scoreName(spoken: string[], name: string[], p: Prepared): Scored | null {
  const used = new Array<boolean>(spoken.length).fill(false);
  /** the name's word heard at each place of the sentence */
  const at: (string | null)[] = new Array<string | null>(spoken.length).fill(null);
  let q = 1, matched = 0;
  const firstName = name.some((w) => FIRST_W.has(w));
  for (const nw of name) {
    let best = -1, bq = 0;
    for (let i = 0; i < spoken.length; i++) {
      if (used[i]) continue;
      const v = Math.max(wordEq(spoken[i], nw), FIRST_W.has(nw) && FIRST_W.has(spoken[i]) ? 0.97 : 0);
      if (v > bq) { bq = v; best = i; if (v === 1) break; }
    }
    if (best >= 0) { used[best] = true; at[best] = nw; q = Math.min(q, bq); matched++; }
  }
  const a = p.e.act;
  const takesValue = "press" in a && (a.input === "select" || a.input === "text");
  const text = "press" in a && a.input === "text";
  const check = ("press" in a && a.input === "check") || ("steps" in a && a.steps.some((s) => s.a === "layer"));
  // tick or untick, said anywhere in the sentence ("untick My tasks", "hide the severe pins"); neither: flip it
  const tick: boolean | null = !check ? null : spoken.some((w) => OFF_W.has(w)) ? false : spoken.some((w) => ON_W.has(w)) ? true : null;
  const qual = (w: string) => p.qual.some((r) => wordEq(w, r) > 0);
  const restAt: number[] = [];
  for (let i = 0; i < spoken.length; i++) {
    if (used[i]) continue;
    const w = spoken[i];
    if (check && (ON_W.has(w) || OFF_W.has(w))) continue;
    if (text && (TYPE_VERB(w) || QUOTE_AFTER.has(w) || QUOTE_BEFORE.has(w))) continue;
    // a box's own noun straight after its name ("the subject line to …"): the name's, never words to type (round 4)
    if (text && i > 0 && at[i - 1] !== null && BOX_W.has(w)) continue;
    if (firstName && FIRST_W.has(w)) continue;
    if (isFiller(w)) continue;
    if (qual(w)) continue;
    restAt.push(i);
  }
  const rest = restAt.map((i) => spoken[i]);
  // every word of the name heard; part of a name never acts on its own (5.1's 0.8 for "most of a long name" took data requests: "show open
  // complaints" pressed the Open complaints tile), so a control's shorter forms are written as its synonyms instead
  if (matched !== name.length) return null;
  if (rest.length && !takesValue) return null;
  // a text box: the words a typing frame gives it, or none (typedFrame)
  if (text) {
    if (!rest.length) return { s: q, value: null, tick, whole: true };
    const f = typedFrame(spoken, at, restAt, name, p, qual);
    if (!f) return null;
    return { s: f.value ? 0.9 * q : q, value: f.value, tick, whole: true, typed: f.typed, ...(f.replace ? { replace: true } : {}) };
  }
  // a select: its name said as something's own ("the status of the second one", "second one oda status", "இரண்டாவதின் நிலை") or a row's place
  // said as its option ("status second one") is a question about that row, not an option (v10 review 2, round 2)
  if (rest.length) {
    const named = at.flatMap((x, i) => (x === null ? [] : [i]));
    const first = Math.min(...named), last = Math.max(...named);
    if (spoken[last + 1] === "of" && restAt.some((i) => i > last + 1)) return null;
    const before = spoken[first - 1];
    if (first > 0 && at[first - 1] === null && (GEN_W.has(before) || (TAMIL.test(before) && TA_GEN.test(before)))) return null;
    if (readPositions(rest)) return null;
  }
  const value = takesValue && rest.length ? rest.join(" ").replace(/^(?:by|as|with|into|at|from|called|named)\s+/u, "").trim() || null : null;
  // a name with an option after it explains fewer of the words than a name said alone ("sort by severity" is the column, not Severity "sort by")
  return { s: value ? 0.9 * q : q, value, tick, whole: true };
}

/** A text box's words, by the frame they are said in (PUT_V .. MANNER above), or null: words left over that no frame types. */
function typedFrame(spoken: string[], at: (string | null)[], restAt: number[], name: string[], p: Prepared, qual: (w: string) => boolean):
  { value: string | null; typed: boolean; replace: boolean } | null {
  const n = spoken.length;
  const put = spoken.some((w) => PUT_V.test(w)), set = spoken.some((w) => SET_V.test(w));
  // a search box's own frame: its names say search, find or filter ("Filter the list", "Search chats")
  const search = p.names.some((nm) => nm.w.some((w) => SEARCH_V.test(w))) && spoken.some((w) => SEARCH_V.test(w));
  // where the box's name stands: its nouns, not a verb inside the name ("search the list" stands at "list")
  const named = at.flatMap((x, i) => (x === null ? [] : [i]));
  const nouns = named.filter((i) => !TYPE_VERB(spoken[i]));
  const first = Math.min(...(nouns.length ? nouns : named)), last = Math.max(...(nouns.length ? nouns : named));
  // the words typed: from the first left-over word to the last, the little words between them kept ("how to apply")
  const lo = restAt[0], hi = restAt[restAt.length - 1];
  const value = () => spoken.slice(lo, hi + 1).filter((_, k) => at[lo + k] === null).join(" ").replace(/^(?:by|as|with|into|at|from|called|named)\s+/u, "").trim() || null;
  // a thing to write about is not the words ("add a line to the message", "write the address in the subject"), unless told to type it
  const describes = () => !spoken.some((w) => DICTATE.test(w)) && ((lo > 0 && at[lo - 1] === null && DESCRIBE_BEFORE.has(spoken[lo - 1]))
    || DESCRIBE_BEFORE.has(spoken[lo]) || ACC_AFTER.has(spoken[hi + 1] ?? "") || (TAMIL.test(spoken[hi]) && TA_ACC.test(spoken[hi])));
  const typed = (replace: boolean) => {
    // a manner, not words: "change the message to a formal tone", "set the subject to Tamil" (a redraft, the planner's)
    if (!search && restAt.every((i) => MANNER.test(spoken[i]))) return null;
    // a question's words: "write what happened at Adyar in the message", "search the list for which ones are overdue" (round 3)
    const v = value();
    if (v && ASKS.test(v)) return null;
    // they replace what the box holds only when they are plainly words: a redraft asked for is added to the draft as in round 1, never wiping it
    // (round 3)
    return { value: v, typed: true, replace: replace && !redraft() };
  };
  // a redraft asked for: the words begin with how the draft should read ("change the message to be more polite", "to a more polite one"), or are
  // a thing after an article ("replace the message with a new draft") (round 3); never a manner word inside words said ("set the message to
  // please send more workers to Adyar"), nor a sentence that begins with "the" ("replace the message with the drain was cleared today": its own
  // verb says it is words) (round 4)
  const redraft = () => {
    let j = lo;
    while (j < hi && LEAD_GLUE.test(spoken[j])) j++;
    if (MANNER.test(spoken[j])) return true;
    const ws = spoken.slice(lo, hi + 1), k = ws.findIndex((w) => CLAUSE_W.test(w));
    return !(k > 0 && !ws.slice(0, k).some((w) => REL_W.has(w))) && describes();
  };
  const after = (k: number) => lo > k, before = (k: number) => hi < k;
  // the verbs that put or look for words, where they stand
  const verbs = spoken.flatMap((w, i) => (PUT_V.test(w) || (search && SEARCH_V.test(w)) ? [i] : []));
  // put somewhere
  const placed = () => (describes() && !search ? null : typed(false));
  // the box as the place the words go, the verb before them: "type drain overflow in the subject", "type in the subject drain overflow", "in the
  // subject type drain overflow" (round 3), "search for Adyar in the list" (never "what should I write in the message": the words before the verb
  // are not what it writes)
  let jb = first - 1;
  while (jb >= 0 && at[jb] === null && (ARTICLE.has(spoken[jb]) || BOX_W.has(spoken[jb]) || qual(spoken[jb]))) jb--;
  if (jb >= 0 && at[jb] === null && INTO_W.has(spoken[jb]) && (before(jb) || after(last)) && verbs.some((v) => v < lo)) return placed();
  // the box said with a locative: "subject la drain overflow podu", "தலைப்பில் வடிகால் அடைப்பு போடு", "drain overflow subject la podu"
  let ka = last + 1;
  while (ka < n && at[ka] === null && BOX_W.has(spoken[ka])) ka++;
  const sw = spoken[last], nw = at[last] ?? sw;
  const la = ka < n && LA_W.has(spoken[ka]);
  const loc = la || (sw !== nw && (TAMIL.test(sw) ? TA_LOC.test(sw) && !TA_LOC.test(nw) : sw.startsWith(nw) && LA_W.has(sw.slice(nw.length))));
  if (verbs.length && loc && (after(la ? ka : last) || before(first))) return placed();
  // the box set to them: "set the subject to …", "replace the message with …", "fill the subject with …", "write the subject as …" (what it held
  // is replaced); a put "to" is someone the draft is for ("write a message to the zonal officer"), never words
  const to = ka < n ? spoken[ka] : "";
  if (((set && TO_W.has(to)) || (put && (to === "with" || to === "as"))) && after(ka)) return typed(true);
  // "set the subject: drain overflow", "set subject drain overflow": set, the box, its words straight after it (typed in round 1; round 3)
  if (spoken.slice(0, first).includes("set") && lo === ka) return typed(false);
  // a search box searched for them: "search the list for …"
  if (search && ka < n && spoken[ka] === "for" && after(ka)) return typed(false);
  // the words quoted: "subject-a drain overflow nu maathu", "தலைப்பை … என்று மாற்று", "… called Daily Briefing"
  if ((set || put) && ((hi + 1 < n && QUOTE_AFTER.has(spoken[hi + 1])) || (lo > 0 && QUOTE_BEFORE.has(spoken[lo - 1])))) return typed(set);
  // the box's own name says to type into it ("search the list adyar"): its words, as a question's are not (decide10)
  if (name.some(TYPE_VERB)) return { value: value(), typed: false, replace: false };
  return null;
}

const inList = <T,>(v: T, l: T | T[] | undefined) => l === undefined || (Array.isArray(l) ? l.includes(v) : l === v);
/** Is the control there in this state (its page, its window, the Stage), and on screen when the console has said what is? */
function available(e: Control10, c: ControlCtx10): boolean {
  const w = e.when;
  if (w?.page && !inList(c.state.page, w.page)) return false;
  if (w?.panel && !inList(c.state.panel ?? "", w.panel)) return false;
  if (w?.stage && !c.stage) return false;
  if (c.visible && "press" in e.act && !c.visible.includes(e.id)) return false;
  return true;
}
const focused = (e: Control10, c: ControlCtx10) => !!e.when?.panel && !!c.state.panel && inList(c.state.panel, e.when.panel);
const actKey = (e: Control10) => JSON.stringify("steps" in e.act ? e.act.steps : "press" in e.act ? [e.act.press, e.act.value ?? null] : e.act);

/** steps a one-word name may do on its own ("Trends", "Weekly", "Taluks", "Workspaces"): the moves the rules make by a name alone */
const NAV_ONE = new Set<Step["a"]>(["page", "period", "theme", "mapMode", "panel"]);

/** Every control the sentence may name, best first (scores of 5.1: a name 1.0, a synonym 0.95, with an option said after it x0.9, a word with
 * an ending x0.97, +0.1 in the window open).
 * `withMap`: Ask the Map's and Rain & flooding's own too (the map lane runs them; the coverage test reads them here). */
export function matchControls10(text: string, c: ControlCtx10, withMap = false): Match10[] {
  const spoken = words10(text);
  if (!spoken.length || spoken.length > 14) return [];
  const cue = spoken.some((w) => CUE.has(w));
  const out: Match10[] = [];
  for (const p of prepared()) {
    if (!withMap && "map" in p.e.act) continue;
    if (!available(p.e, c)) continue;
    const navOne = "steps" in p.e.act && p.e.act.steps.every((s) => NAV_ONE.has(s.a));
    let best: Match10 | null = null;
    for (const n of p.names) {
      const r = scoreName(spoken, n.w, p);
      if (!r) continue;
      // a one-word name that is everyday talk ("News", "Rows", "Later", "Clear") is a control's only with a "press" word or in its own window;
      // a page, a period, a panel or the theme is a move by its name alone, as the rules have it
      if (n.w.length === 1 && !cue && !focused(p.e, c) && !navOne) continue;
      const s = Math.min(1.1, (n.first ? 1 : 0.95) * r.s + (focused(p.e, c) ? 0.1 : 0));
      if (!best || s > best.score) best = { id: p.e.id, score: s, e: p.e, value: r.value, tick: r.tick, whole: r.whole, ...(r.typed ? { typed: true } : {}), ...(r.replace ? { replace: true } : {}) };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.score - a.score);
}

/** "the map's Export, the report's Export or the dataset's Export": the question back, at most three, by region */
function whichOf(ms: Match10[]): NonNullable<ControlHit["which"]> {
  const top = ms.slice(0, 3);
  const name = (m: Match10, l: "en" | "ta") => {
    const r = REGIONS10[m.e.region];
    const label = (l === "ta" ? m.e.ta[0] : m.e.en[0]) ?? m.e.en[0];
    return l === "ta" ? `${r?.ta ?? m.e.region}: ${label}` : `${label} in ${r?.en ?? m.e.region}`;
  };
  const join = (xs: string[], or: string) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${or} ${xs[xs.length - 1]}`);
  return {
    en: `Which one: ${join(top.map((m) => name(m, "en")), "or")}?`,
    ta: `எது: ${join(top.map((m) => name(m, "ta")), "அல்லது")}?`,
    ids: top.map((m) => m.id)
  };
}

/** a move said ("go to", "navigate", "open", "switch to", po, maathu, போங்க, மாத்து) */
const MOVE = /\b(?:go|goto|navigate|jump|take me|open|po|ponga|poonga|poi|poyi|maathu|maathunga|mathu|mathunga|maathi)\b|\b(?:switch|change|move|head|skip)\s+(?:over\s+)?to\b|(?:^|\s)(?:போ|போங்க|போங்கள்|போய்|போகவும்|செல்|செல்லவும்|திற|திறங்க|திறங்கள்|மாத்து|மாத்துங்க|மாற்று|மாற்றுங்க|மாற்றுங்கள்|மாற்றவும்)(?=\s|$)/iu;
const isPageMove = (m: Match10) => "steps" in m.e.act && m.e.act.steps.every((s) => s.a === "page");
const isNavMove = (m: Match10) => "steps" in m.e.act && m.e.act.steps.every((s) => NAV_ONE.has(s.a));
const isTick = (m: Match10) => "press" in m.e.act && m.e.act.input === "check";

/** What the sentence names: one control (`top`), or two or more that tie (`which`, at most three, by distinct action), or null. */
export function decide10(text: string, c: ControlCtx10, withMap = false): { top: Match10; which: Match10[] | null } | null {
  const t = String(text ?? "").trim();
  if (!t) return null;
  let ms = matchControls10(t, c, withMap);
  // a page's (a period's, a panel's) name with no tick or press word said is the move, not the open window's tick of that name: the tick is
  // ticked by a word that says so ("tick trends", "hide the briefing", "click Trends") (v10 review 2, round 2: "switch to trends", "trends ku
  // maathu", "போக்குகளுக்கு மாத்து" with Customize open flipped its Trends tick, the window's +0.1 put it first)
  if (ms.some(isNavMove) && !words10(t).some((w) => ON_W.has(w) || OFF_W.has(w) || CUE.has(w))) ms = ms.filter((m) => !isTick(m));
  // a move said with a page's name is the page, not the open window's tick of that name (v10 review 2, finding 32: "go to trends" with Customize
  // open flipped its Trends tick, the window's +0.1 put it first)
  if (MOVE.test(t) && ms.some(isPageMove)) ms = [...ms.filter(isPageMove), ...ms.filter((m) => !isPageMove(m) && !isTick(m))];
  if (!ms.length) return null;
  const top = ms[0];
  if (top.score < 0.8) return null;
  // a question about the data or a news request is not a control's, unless it says a control's whole name ("What else is near here?"); never when
  // the question's words are what is left over as a select's or a box's value (v10 review 2, finding 29: "what is the status of the second one"
  // set the list's Status to "what is second one")
  // A box's words given by a typing frame are what to type, a question's words included ("search the list for how to apply"): only the rest of the
  // sentence is asked about (v10 review 2, round 2: "search the list for complaints about garbage" was dropped), and a question there is never
  // excused by the box's whole name ("why did you type drain overflow in the subject")
  if (top.typed && top.value) { if (NOT_CONTROL.test(words10(t).join(" ").replace(top.value, " "))) return null; }
  else if (NOT_CONTROL.test(t) && (!(top.whole && top.score >= 0.95) || (top.value && NOT_CONTROL.test(top.value)))) return null;
  // the next best that does something else; the same action under two names is one control
  const rival = ms.find((m) => m !== top && actKey(m.e) !== actKey(top.e));
  if (rival && rival.score >= 0.8 && top.score - rival.score < 0.1) {
    const close = ms.filter((m) => m.score >= 0.8 && top.score - m.score < 0.1);
    const uniq = close.filter((m, i) => close.findIndex((x) => actKey(x.e) === actKey(m.e)) === i);
    return { top, which: uniq.slice(0, 3) };
  }
  return { top, which: null };
}

/** The press controls a sentence may name, whatever is on screen: the console checks these (dom.ts visibleControls) and passes what it sees
 * as `visible`, so a control not on screen is never pressed or offered in a question back. */
export function candidates10(text: string, state: ScreenState): { id: string; press: string; own?: boolean }[] {
  return matchControls10(text, { state, lang: "en", visible: null }).flatMap((m) => ("press" in m.e.act ? [{ id: m.id, press: m.e.act.press, ...(m.e.act.own ? { own: true } : {}) }] : []));
}

/** The control a sentence names, or null (not a control's: the other lanes take it). */
export function controlCommand10(text: string, c: ControlCtx10): ControlHit | null {
  const t = String(text ?? "").trim();
  if (!t) return null;
  // the Stage's own commands stay the Stage's while it is open ("next", "close", "pin this", "show as a table")
  if (c.stage && localStageCommand(t)) return null;
  const d = decide10(t, c);
  if (!d) return null;
  if (d.which) return { id: d.top.id, which: whichOf(d.which), level: d.top.e.level };
  const hit = hitOf(d.top);
  // with a dataset open, a console step the Studio's intercept keeps ("clear the filters", "this month": the dataset's own focus and period) is
  // left to it (v10 review 2, finding 30: the control lane ran them first, on the console's hidden filter band); what the intercept passes on
  // stays here (round 2: "stop speaking", "close Jarvis", "forget all my notes" went to the dataset)
  if (c.studio && hit?.steps?.length && !studioPasses(t, hit.steps, c.state)) return null;
  return hit;
}

/** With a dataset open in the Data Studio, what still reaches the console, as its intercept (Thunai.tsx) has it: a page move, an instant control
 * (plan.ts isReflex: stop, off, undo, …), Jarvis's own notes (remember, forget: the intent markers run before the intercept), or a plain console
 * command (studioLetsThrough). Everything else is the dataset's. */
export function studioPasses(said: string, steps: Step[], state: ScreenState): boolean {
  if (!steps.length) return false;
  return steps.every((s) => s.a === "page") || isReflex(steps, state) || steps.every((s) => s.a === "forget" || s.a === "remember") || studioLetsThrough(said, steps, 1);
}

function hitOf(m: Match10): ControlHit | null {
  const a = m.e.act;
  const label = { en: m.e.en[0], ta: m.e.ta[0] };
  if ("map" in a) return null; // the map lane's (map10.ts): it runs before this one and owns these
  if ("never" in a) return { id: m.id, level: "never", label };
  if ("steps" in a) {
    const steps = a.steps.map((s) => (s.a === "layer" && m.tick !== null ? { ...s, on: m.tick } : s));
    return { id: m.id, steps, level: m.e.level, label };
  }
  const own = a.own ? { own: true } : {};
  if (a.input === "select") {
    // the console's own filters (zone, taluk, department) with a value said are the rules' (they know the names, the numbers, the Tamil): not here
    if (m.value && /^filter\.(?:zone|taluk|department)$/.test(m.id)) return null;
    return { id: m.id, press: a.press, value: a.value ?? (m.value ? valueWords(m.value) : null), level: m.e.level, label, ...own };
  }
  if (a.input === "check") return { id: m.id, press: a.press, tick: m.tick, level: m.e.level, label, ...own };
  // a text box: focused, and the words a typing frame gives typed into it ("search the list for Adyar"); "set … to" replaces what it holds
  if (a.input === "text") return { id: m.id, press: a.press, value: m.value, level: m.e.level, label, ...own, ...(m.replace && m.value ? { replace: true } : {}) };
  return { id: m.id, press: a.press, level: m.e.level, label, ...own };
}

/** a select's option said in Tamil or Tanglish, in the console's English option words (dom.ts also matches the option's own text) */
const VALUE_WORDS: [RegExp, string][] = [
  [/கடுமை\S*|kadumai\w*/giu, "severe"], [/அதிக\S*|adhigam\w*/giu, "high"], [/நடுத்தர\S*|naduththaram\w*|nadutharam\w*/giu, "medium"],
  [/குறைவு\S*|kuraivu\w*/giu, "low"], [/எல்லா\S*|அனைத்து\S*|ellaa?\w*/giu, "all"], [/தீர்க்கப்பட்ட\S*|theerkkapatta\w*/giu, "resolved"],
  [/திறந்த\S*|thirandha\w*/giu, "open"], [/தமிழ்|tamil/giu, "tamil"], [/ஆங்கிலம்|english/giu, "english"]
];
export function valueWords(v: string): string {
  let out = v;
  for (const [re, en] of VALUE_WORDS) out = out.replace(re, en);
  return out.replace(/\s+/g, " ").trim();
}

// ------------------------------------------------------------------------------------------------------------- the coverage, read out --
export interface Coverage10 { total: number; steps: number; press: number; map: number; never: number; skipped: number; missing: string[] }
/** The inventory's ids against the registry: how each is reached by voice (a step, a press, the map lane), refused (never), or skipped with a
 * reason; `missing` is what has neither (the coverage test fails on it). */
export function coverage10(ids: string[]): Coverage10 {
  const by = new Map(CONTROLS10.map((e) => [e.id, e]));
  const cov: Coverage10 = { total: ids.length, steps: 0, press: 0, map: 0, never: 0, skipped: 0, missing: [] };
  for (const id of ids) {
    const e = by.get(id);
    if (!e) { if (SKIP10[id]) cov.skipped++; else cov.missing.push(id); continue; }
    if ("steps" in e.act) cov.steps++; else if ("press" in e.act) cov.press++; else if ("map" in e.act) cov.map++; else cov.never++;
  }
  return cov;
}

/** a registry entry's level must be the level risk.ts runs its steps at (reach.ts ACTION_LEVEL agrees with it: reach.test.ts) */
export const stepsLevel = (steps: Step[]): Level10 => planRisk(steps);

// --------------------------------------------------------------------------------------- the Data Studio: what still reaches the console --
const STUDIO_PASS = new Set<Step["a"]>(["page", "panel", "view", "period", "theme", "close", "mapMode", "layer", "mode", "lang", "numbers", "help", "whereAmI", "scroll"]);
/** the console's own filters named ("set the zone to 7", "department filter", "the dashboard's filters"): a filter said with no such word on the
 * Data Studio ("only Adyar") is the dataset's own focus */
const CONSOLE_FILTER = /\b(?:zones?|taluks?|departments?|dept|category|categories|severity|period|weekly|monthly|daily|quarterly|dashboard|console)\b|மண்டல|வட்ட|துறை|காலம்|வாராந்திர|மாதாந்திர|தினசரி|டாஷ்போர்டு|dashboard/iu;
/**
 * v10 (the inventory's third finding): with a dataset open in the Data Studio every sentence went to the dataset's engine. A plain console
 * command still reaches the console there: a page, a panel, the theme, close, the map, the numbers, and a filter that names the console's own
 * (the dataset answers its own questions, "only Adyar" included). `sure` is the rules' confidence (understand()).
 */
export function studioLetsThrough(said: string, steps: Step[], sure: number): boolean {
  if (!steps.length || sure < 0.9 || !steps.every((s) => STUDIO_PASS.has(s.a))) return false;
  if (NOT_CONTROL.test(said)) return false;
  if (steps.some((s) => s.a === "view" || s.a === "period") && !CONSOLE_FILTER.test(said)) return false;
  return true;
}

// ------------------------------------------------------------------------------------------- "open the third one" in the window open --
/**
 * v10 (the inventory's first finding): the item step counted the Overview's By severity list whatever window was open. The window in front's
 * own list is counted instead: the 1-based position said, or next / previous of the row opened last. `past`: a position after the end, said
 * plainly (RC-42), never clamped.
 */
export function itemPick(which: number | "next" | "prev", rows: number, cur: number | null): { idx: number } | { past: number } | { none: true } {
  if (!rows) return { none: true };
  if (typeof which === "number") return which > rows ? { past: rows } : { idx: Math.max(0, which - 1) };
  const at = cur ?? -1;
  const idx = which === "next" ? at + 1 : at - 1;
  if (idx >= rows) return { past: rows };
  return { idx: Math.max(0, idx) };
}
