/**
 * v10: Ask the Map, all of it, by voice (docs/jarvis/JARVIS_V10.md 4.6; the anatomy: docs/jarvis/v10-research/50-askmap-anatomy.md; the grammar:
 * 40-voice-ui-map-reading.md 5.2). A sentence in English, Tamil script or Tanglish becomes one map operation, or null when it is not plainly
 * the map's: a news request, a console filter, a case, a page move, "next" with no tour running, "export the report" with no answer on the map.
 * Pure: no React, no network; the console runs the operation (components/collector/app/thunai/mapops.ts), the runner scores it (eval10.live.ts).
 *
 * What it reads, in this order:
 *   - a tour's own words while one runs ("next", "back", "stop", "go deeper here", a yes at the check-in), and "take me round the district";
 *   - Rain & flooding (open it, its tabs, a past rain, back and close while it is open);
 *   - the answer's actions: the visit order ("plan my visit to the worst flooded spots tomorrow morning"), send (drafts), export, save, the
 *     analyst's insight, the suggested questions, the camera's shots, the layers, the chips ("wider", "closer", a chip's own label);
 *   - a circle by voice ("within two kilometres of Kasimedu", "Kasimedu-la rendu km kulla", "காசிமேட்டிலிருந்து இரண்டு கிலோமீட்டருக்குள்"): the
 *     number words to digits, and "near X" with no distance gets a radius chosen here by what X is (research 5.2), said back by the console;
 *   - a follow-up that edits the answer (the server's own follow-up words, edits.ts, with Tamil and Tanglish read into them), and a question for
 *     the map ("ask the map ...", "... on the map", or a place question while the map is open).
 */
import type { Lang } from "../types";
import { COUNT_BY, EDIT_ADD, EDIT_ALL_SEV, EDIT_CLEAR, EDIT_COMPARE, EDIT_DEPTS, EDIT_NEWS, EDIT_NOT_NEWS, EDIT_OPEN, EDIT_OVERDUE, EDIT_RADIUS, EDIT_REMOVE, EDIT_SEVERE, EDIT_TRACE,
  EDIT_WHICH_AREA, FOLLOW } from "@/lib/map/edits";
import { dayIn, rehearsalIntent } from "@/lib/rehearsal/intent";
import { taNumber } from "../normalise";
import { asciiDigits } from "../digits";
import { placeWord } from "../v8/lang8";
import { DEPT_CONFIG } from "@/lib/officer/departments";

export type MapOp = "ask" | "followup" | "chip" | "circle" | "layer" | "shot" | "export" | "save" | "visit" | "insight" | "send" | "suggest" | "rain" | "tour";
export interface MapCmd {
  op: MapOp;
  /** the question for ask / followup / a suggested question asked / a circle's question / a visit's cases ("open flooding") */
  question?: string | null;
  /** a place (circle, visit, a tour's "go deeper here") */
  place?: string | null;
  /** a circle's radius in km (as said; the console clamps it to the map's 50 m to 5 km) */
  km?: number | null;
  /** a circle with no distance said ("near the harbour"): the radius is the default for what the place is, said back */
  near?: boolean | null;
  format?: "csv" | "geojson" | null;
  /** a layer's id (schools, hospitals, live_rain, news ...), or "heat", "satellite", "streets" */
  layer?: string | null;
  on?: boolean | null;
  shot?: "next" | "replay" | "previous" | null;
  /** a chip's id (its label is matched here against the answer's chips) */
  chip?: string | number | null;
  /** the chip's option key (null: the chip removed) */
  option?: string | null;
  /** "wider" (2) or "closer" (0.5): the distance chip scaled */
  scale?: number | null;
  /** send to a department: its name as said (drafts only; the Collector's own tap sends) */
  dept?: string | null;
  /** Rain & flooding: a tab or a past rain ("latest" for the last one) */
  tab?: "flooding" | "traffic" | "power" | "metro" | null;
  rain?: string | null;
  /** Rain & flooding: open it (the default), go back one level, close it */
  act?: "open" | "back" | "close" | null;
  /** a tour's step: start, next, back, stop, deeper, repeat */
  tour?: "start" | "next" | "back" | "stop" | "deeper" | "repeat" | null;
  /** a tour's stops: today's hotspots, the places in the news, the flooded places */
  source?: "hotspots" | "news" | "flood" | null;
  /** "the full round": up to 9 stops instead of 5 */
  full?: boolean | null;
  /** the n-th suggested question asked (1-based) */
  n?: number | null;
  /** a visit's time as said ("tomorrow morning"), said back; never a filter */
  when?: { en: string; ta: string } | null;
  /** a save's name as said ("save this view as Kasimedu flooding") */
  name?: string | null;
}

/** a chip of the answer on the map, as the console publishes it (lib/map/chips.ts PlanChip, its labels and options) */
export interface ChipCtx { id: string; en: string; ta: string; removable: boolean; options: { key: string; en: string; ta: string; on: boolean }[] }

/** what the browser knows of Ask the Map when a sentence comes (the console's snapshot, published into Jarvis's state) */
export interface MapCtx10 {
  /** Ask the Map grown and showing */
  open: boolean;
  /** an answer with a plan on the map */
  hasAnswer: boolean;
  /** what is on the map: an answer, an area brief, a sentence */
  kind?: "answer" | "brief" | "say" | "ui" | null;
  /** the answer's count of rows */
  total?: number;
  question?: string | null;
  /** the answer's camera shots, and which one shows */
  shots?: number;
  shot?: number;
  /** the answer's chips' labels */
  chips?: string[];
  /** the answer's chips with their options (the labels above, and what each can change to) */
  chipOpts?: ChipCtx[];
  /** the suggested questions showing (or last read out) */
  suggest?: string[];
  /** Rain & flooding open */
  rainOpen?: boolean;
  /** a narrated tour running */
  tour?: boolean;
  /** the tour asked "shall I go on?" (after its third stop): a plain yes goes on, a no ends it */
  tourCheck?: boolean;
  lang: Lang;
}

// ------------------------------------------------------------------ the words --

/** Tamil-script loanwords written by the speech-to-text, as the English word (research 1.6.5) */
const LOAN: [RegExp, string][] = [
  [/மேப்(?:ல|பில்|பிலே|ல்)/gu, "map la"], [/மேப்/gu, "map"], [/லேயர்/gu, "layer"], [/ஜூம்/gu, "zoom"], [/எக்ஸ்போர்ட்/gu, "export"], [/டவுன்லோட்/gu, "download"],
  [/சேவ்/gu, "save"], [/ஓப்பன்/gu, "open"], [/ஓபன்/gu, "open"], [/க்ளோஸ்/gu, "close"], [/நெக்ஸ்ட்/gu, "next"], [/ஸ்டாப்/gu, "stop"], [/ரீப்ளே/gu, "replay"],
  [/டூர்/gu, "tour"], [/சிஎஸ்வி|சி எஸ் வி/gu, "csv"], [/ஜியோ ?ஜேசன்|ஜியோஜேசான்/gu, "geojson"], [/ஷாட்/gu, "shot"], [/விசிட்/gu, "visit"], [/செண்ட்|சென்ட்/gu, "send"],
  [/சேட்டிலைட்|சாட்டிலைட்/gu, "satellite"], [/ஹீட் ?மேப்/gu, "heat map"], [/டேப்/gu, "tab"]
];
const POLITE_START = /^(?:(?:hey|hi|ok|okay|hello)\s+)?(?:jarvis|jarvish|javis|jervis|thunai|ஜார்விஸ்|துணை)\s+|^(?:please|pls|kindly|can you|could you|would you|will you|தயவுசெய்து)\s+/u;
const POLITE_END = /\s+(?:please|pls|jarvis|sir|madam|ji|சார்|ஐயா|தயவுசெய்து)$/u;

/** The sentence as the grammar reads it: NFC, lower case, ASCII digits, no punctuation, Tanglish hyphens split, loanwords in English. */
export function prep10(text: string): string {
  let t = asciiDigits(text.normalize("NFC")).toLowerCase();
  t = t.replace(/கி\s*\.\s*மீ\.?/gu, "கிமீ").replace(/\bk\s*\.\s*m\b\.?/g, "km");
  t = t.replace(/(\d)\s*\.\s*(\d)/g, "$1\u0001$2");
  t = t.replace(/[“”"`’‘']/g, "").replace(/[?!.,;:()[\]{}…|/\\*]+/g, " ").replace(/\u0001/g, ".");
  t = t.replace(/&/g, " and ").replace(/-/g, " ");
  t = t.replace(/(\d)(km|kms|m|mtrs?|kilomet(?:er|re)s?|met(?:er|re)s?)\b/g, "$1 $2").replace(/\bkilo\s+met(?:er|re)s?\b/g, "km");
  for (const [re, w] of LOAN) t = t.replace(re, ` ${w} `);
  t = t.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) t = t.replace(POLITE_START, "").replace(POLITE_END, "").trim();
  return t;
}
const words = (t: string) => t.split(" ").filter(Boolean);

const NEWS = /\b(?:news|story|stories|article|articles|headlines?|seithi|seidhi|newspapers?)\b|செய்தி|நியூஸ்/u;
const CASE = /\binc\s*\d|\b(?:case|incident|complaint|ticket)\s+(?:no\s+|number\s+)?\d{2,}\b|\bdraft (?:an? )?(?:action|reply|instruction|note)s? for\b|\btray\b|\bdrafts\b/;
const NOT_MINE = /\bworkspace\b|\bpage\b|\bdashboard\b|\bbriefing\b|\breport\b|\bpdf\b|\bscreen\b|\bchart\b|\bgraph\b|\btheme\b|\bdark mode\b|\blight mode\b/;
const MAP_WORD = /\b(?:map|maps|mapla)\b|வரைபட/u;
const ON_THE_MAP = /\b(?:on|in) (?:the )?map\b|\bmap la\b|\bmapla\b|\bmap le\b|வரைபடத்தில்/u;

/** English, Tanglish and Tamil number words read as numbers (a distance's count) */
const EN_NUM: Record<string, number> = {
  zero: 0, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, half: 0.5, quarter: 0.25, couple: 2,
  // Tanglish
  oru: 1, onnu: 1, rendu: 2, randu: 2, irandu: 2, moonu: 3, munu: 3, naalu: 4, nalu: 4, anju: 5, aindhu: 5, aaru: 6, ezhu: 7, ettu: 8, ombodhu: 9, ombadhu: 9,
  pathu: 10, padhu: 10, arai: 0.5, onnarai: 1.5, rendarai: 2.5, moonarai: 3.5, nooru: 100, irunooru: 200, munnooru: 300, naanooru: 400, ainooru: 500, anjooru: 500,
  aranooru: 600, ezhunooru: 700, ennooru: 800, aayiram: 1000
};
/** Tamil hundreds and fractions (taNumber reads one to twenty) */
const TA_EXTRA: [RegExp, number][] = [
  [/^ஒன்றரை/u, 1.5], [/^இரண்டரை|^ரெண்டரை/u, 2.5], [/^மூன்றரை/u, 3.5], [/^அரை/u, 0.5], [/^ஒரு$/u, 1], [/^இருநூறு/u, 200], [/^மு(?:ந்ந|ன்ன)ூறு/u, 300], [/^நானூறு/u, 400],
  [/^ஐ(?:ந்ந|ன்ன|ந)ூறு/u, 500], [/^அறுநூறு/u, 600], [/^எழுநூறு/u, 700], [/^எண்ணூறு/u, 800], [/^நூறு/u, 100], [/^ஆயிரம்/u, 1000]
];
function oneNum(w: string): number | null {
  if (/^\d+(?:\.\d+)?$/.test(w)) return Number(w);
  if (Object.hasOwn(EN_NUM, w)) return EN_NUM[w];
  if (/[஀-௿]/u.test(w)) {
    for (const [re, n] of TA_EXTRA) if (re.test(w)) return n;
    return taNumber(w);
  }
  return null;
}
/** "hundred" and "thousand" in the three languages: they multiply the count said before them ("two thousand", "anju nooru") */
const MULT = (w: string): number => (/^(?:hundred|nooru|நூறு)$/u.test(w) ? 100 : /^(?:thousand|aayiram|ayiram|ஆயிரம்)$/u.test(w) ? 1000 : 0);
/** the digits said after "point" ("two point five") */
const POINT_DIGIT: Record<string, number> = { zero: 0, oh: 0, o: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
/** a whole number said in words: "twenty five", "two thousand", "twenty five hundred", "two hundred and fifty", "anju nooru"; null when the words
 * are not one number ("one two", "within two") */
function intPhrase(ws: string[]): number | null {
  if (!ws.length) return null;
  let total = 0, cur = 0, lastMul = 0;
  let last: "num" | "mul" | "and" | null = null;
  for (const w of ws) {
    if (w === "and") { if (last !== "mul") return null; last = "and"; continue; }
    const mul = MULT(w);
    if (mul) {
      if (last === "mul" || last === "and") return null;
      if (mul === 100) cur = (cur || 1) * 100;
      else { total += (cur || 1) * 1000; cur = 0; }
      lastMul = mul; last = "mul"; continue;
    }
    const n = oneNum(w);
    if (n == null || !Number.isInteger(n)) return null;
    // a count joins the one before it only as tens and ones ("twenty five"), or after a hundred or a thousand when it is smaller ("two thousand
    // five hundred", "two hundred and fifty")
    if (last === "num") { if (!(cur % 100 >= 20 && cur % 10 === 0 && n < 10 && /^[a-z]+$/.test(w))) return null; }
    else if (last && n >= lastMul) return null;
    cur += n; last = "num";
  }
  return last === "and" ? null : total + cur;
}
/** words that are one number as said: one word ("two", "2.5", "arai", "இரண்டு"), "X and a half" / "X and half", "X point Y", or a whole number */
function phraseNum(ws: string[]): number | null {
  const k = ws.length;
  if (!k) return null;
  if (k === 1) return oneNum(ws[0]);
  // "one and a half", "one and half" (both said in Indian English)
  if (ws[k - 1] === "half" && ws[k - 2] === "and") { const x = intPhrase(ws.slice(0, -2)); return x == null ? null : x + 0.5; }
  if (ws[k - 1] === "half" && ws[k - 2] === "a" && ws[k - 3] === "and") { const x = intPhrase(ws.slice(0, -3)); return x == null ? null : x + 0.5; }
  // "two point five", "point five"
  const p = ws.indexOf("point");
  if (p >= 0) {
    const whole = p === 0 ? 0 : intPhrase(ws.slice(0, p));
    const ds = ws.slice(p + 1).map((w) => (/^\d$/.test(w) ? Number(w) : POINT_DIGIT[w] ?? null));
    if (whole == null || !ds.length || ds.length > 2 || ds.some((x) => x == null)) return null;
    return Number(`${whole}.${ds.join("")}`);
  }
  return intPhrase(ws);
}
/** a number said in the last words before a unit: "two", "2.5", "half a", "one and a half", "one and half", "two point five", "five hundred",
 * "two thousand", "twenty five", "anju nooru", "rendu", "இரண்டு": the longest run of words that is one number (v10 review 2, finding 16: "one
 * and half km" was 500 m, "two point five" 5 km, "two thousand metres" 1 km, "anju nooru meter" 100 m) */
function numBefore(ws: string[]): { n: number; len: number } | null {
  const k = ws.length;
  const at = (i: number) => ws[k - i] ?? "";
  // "half a", "half an", "a quarter of a"
  if ((at(1) === "a" || at(1) === "an") && at(2) === "half") return { n: 0.5, len: 2 };
  if ((at(1) === "a" || at(1) === "an") && at(2) === "of" && at(3) === "quarter") return { n: 0.25, len: at(4) === "a" ? 4 : 3 };
  for (let len = Math.min(k, 7); len >= 1; len--) {
    const n = phraseNum(ws.slice(k - len));
    if (n != null) return { n, len };
  }
  return null;
}
const KM_UNIT = /^(?:km|kms|kilomet(?:er|re)s?|kilo|கிமீ\S*|கிலோமீட்ட\S*|கிலோ)$/u;
const M_UNIT = /^(?:m|mtrs?|met(?:er|re)s?|மீட்ட\S*|மீ)$/u;

/** A distance said in the sentence, as km, and where its words are (to put digits in their place). */
export function distance10(t: string): { km: number; from: number; to: number } | null {
  const ws = words(t);
  for (let i = 0; i < ws.length; i++) {
    const km = KM_UNIT.test(ws[i]), m = !km && M_UNIT.test(ws[i]);
    if (!km && !m) continue;
    const nb = numBefore(ws.slice(Math.max(0, i - 7), i));
    if (!nb) continue;
    // "a km" alone is one; "m" needs a real number ("I'm", "m" said alone)
    if (m && ws[i] === "m" && !/^\d/.test(ws[i - 1] ?? "")) continue;
    return { km: km ? nb.n : nb.n / 1000, from: i - nb.len, to: i };
  }
  return null;
}
/** the sentence with a distance's number words as digits ("two kilometres" -> "2 kilometres"), the unit as said */
export function withDigits(t: string): string {
  const d = distance10(t);
  if (!d) return t;
  const ws = words(t);
  const km = KM_UNIT.test(ws[d.to]);
  // a Tamil unit keeps its own word (the map reads "2 கிலோமீட்டருக்குள்"); English and Tanglish units are written "km" and "m" (the follow-up
  // words read only those)
  const unit = /[஀-௿]/u.test(ws[d.to]) ? ws[d.to] : km ? "km" : "m";
  const n = km ? Math.round(d.km * 1000) / 1000 : Math.round(d.km * 1000);
  return [...ws.slice(0, d.from), String(n), unit, ...ws.slice(d.to + 1)].join(" ");
}

// ------------------------------------------------------------------ places --

/** Tamil case endings on a place name, longest first: "-இலிருந்து" (from), "-இல்" (in), "-க்கு" (to), "-க்குள்" (within) */
const TA_END = ["யிலிருந்து", "விலிருந்து", "த்திலிருந்து", "ிலிருந்து", "லிருந்து", "இலிருந்து", "யிலே", "யில்", "வில்", "த்தில்", "ிலே", "ில்", "இல்", "ுக்குள்ள", "ுக்குள்", "க்குள்",
  "த்துக்கு", "ுக்கு", "க்கு", "யை", "ை", "யின்", "ின்", "ோடு", "ுடன்"];
/** A Tamil place word to its name: "காசிமேட்டிலிருந்து" -> "காசிமேடு", "அடையாற்றில்" -> "அடையாறு", "வேளச்சேரியில்" -> "வேளச்சேரி", "மயிலாப்பூரில்" -> "மயிலாப்பூர்". */
export function taBase(word: string): string {
  let w = word.normalize("NFC");
  for (const e of TA_END) {
    if (w.length > e.length + 2 && w.endsWith(e)) { w = w.slice(0, -e.length); break; }
  }
  // a doubled stop before the ending was the name's last letter with ு: ட்ட -> டு, ற்ற -> று (காசிமேட்ட, அடையாற்ற)
  if (/ட்ட$/u.test(w)) return w.replace(/ட்ட$/u, "டு");
  if (/ற்ற$/u.test(w)) return w.replace(/ற்ற$/u, "று");
  // a consonant left bare (மயிலாப்பூர, அண்ணா நகர) had its pulli
  if (/[கஙசஞடணதநபமயரலவழளறன]$/u.test(w) && !/[ாிீுூெேைொோௌ்]$/u.test(w)) return `${w}்`;
  return w;
}
const titleCase = (s: string) => s.split(" ").map((w) => (/^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");

/** words that end a place's name in English ("near Kasimedu within 2 km", "around the harbour this week") */
const PLACE_STOP = new Set(("within inside in on at for from with which that who where when what how today yesterday tomorrow this last past these those please and or but only " +
  "show tell give near around of km kms m metres meters kilometres kilometers today's tonight now map la le irundhu lerundhu kulla ulla kitta pakkathula pakkathil pakkam suthi " +
  "enna ennenna irukku nadakkudhu kaattu kattu sollu paaru ku kku is are was were has have").split(" "));
const NOT_PLACE = new Set("here there it this that them these those me us you map the map everything anything all".split(" "));
/** subject words: what is asked about, never the place */
const SUBJECT_WORDS = new Set(("complaints complaint cases case incidents incident issues issue problems problem reports report flooding flood floods garbage waste trash potholes " +
  "accidents accident sewage drainage streetlights streetlight thefts theft crime fires fire dengue waterlogging pugar pugaar prachanai vellam kuppai open severe " +
  "serious closed pending overdue what's whats happening going").split(" "));
const REL_EN = /^(?:within|inside|around|near|nearby|beside|surrounding|round|from|of)$/;
/** a noun that makes the word before it part of a place's name ("fire station", "flood control office") */
const PLACE_NOUN = /^(?:stations?|stands?|schools?|colleges?|hospitals?|offices?|depots?|markets?|bridges?|roads?|streets?|grounds?|rooms?|centres?|centers?)$/;

/** The place a spatial sentence is about, as said (English and Tanglish title-cased, Tamil without its case ending). */
export function anchorOf(t: string): string | null {
  const ws = words(t);
  // English: after the last relation word that a name follows ("within 2 km of Kasimedu", "near the Koyambedu bus stand", "close to Adyar")
  let best: string | null = null;
  for (let i = 0; i < ws.length; i++) {
    let j = -1;
    if (REL_EN.test(ws[i])) j = i + 1;
    else if ((ws[i] === "close" || ws[i] === "next" || ws[i] === "right") && (ws[i + 1] === "to" || ws[i + 1] === "by")) j = i + 2;
    if (j < 0 || j >= ws.length) continue;
    if (ws[j] === "the" || ws[j] === "a") j++;
    const name: string[] = [];
    for (let k = j; k < ws.length && name.length < 4; k++) {
      // "ward 5", "zone 13": the number is the name's
      if (/^\d{1,3}$/.test(ws[k]) && /^(?:ward|zone)$/.test(name[name.length - 1] ?? "")) { name.push(ws[k]); break; }
      if (PLACE_STOP.has(ws[k]) || /^\d/.test(ws[k]) || KM_UNIT.test(ws[k]) || M_UNIT.test(ws[k]) || /[஀-௿]/u.test(ws[k])) break;
      name.push(ws[k]);
    }
    if (name.length && !NOT_PLACE.has(name.join(" ")) && (!SUBJECT_WORDS.has(name[0]) || PLACE_NOUN.test(name[1] ?? ""))) best = titleCase(name.join(" "));
  }
  if (best) return best;
  // Tanglish: the words before a case clitic ("Kasimedu-la rendu km kulla", "Adyar pakkathula", "harbour kitta")
  for (let i = 1; i < ws.length; i++) {
    if (!/^(?:la|le|lerundhu|lerunthu|laerundhu|ilerundhu|kitta|kitte|pakkathula|pakkathil|pakkam|suthi|suththi|sutthi|arugil|arugey|aruge)$/.test(ws[i])) continue;
    const name: string[] = [];
    for (let k = i - 1; k >= 0 && name.length < 3; k--) {
      // (a subject word is the place's own before a place noun: "Kasimedu fire station pakkathula": v10 review 2, round 2)
      if (PLACE_STOP.has(ws[k]) || (SUBJECT_WORDS.has(ws[k]) && !PLACE_NOUN.test(name[0] ?? "")) || /^\d/.test(ws[k]) || oneNum(ws[k]) != null || /[஀-௿]/u.test(ws[k])) break;
      name.unshift(ws[k]);
    }
    if (name.length && !NOT_PLACE.has(name.join(" "))) return titleCase(name.join(" "));
  }
  // Tamil: a word with "-இலிருந்து" (from), or the word before அருகில் / அருகே / பக்கத்தில் / சுற்றி
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (/[஀-௿]/u.test(w) && /(?:இலிருந்து|லிருந்து)$/u.test(w)) return taBase(w);
    if (/^(?:அருகில்|அருகே|அருகிலுள்ள|அருகாமையில்|பக்கத்தில்|பக்கத்துல|சுற்றி|சுற்றியுள்ள)$/u.test(w) && i > 0 && /[஀-௿]/u.test(ws[i - 1]) && !TA_NOT_PLACE.test(ws[i - 1])) return taBase(ws[i - 1]);
  }
  return null;
}
const TA_NOT_PLACE = /^(?:இங்கே|இங்கு|அங்கே|அங்கு|இதன்|இந்த|அந்த|என்|எங்கள்|புகார்|சம்பவ|பிரச்சனை)/u;

/** What a place is, for the default "near" radius (research 5.2): a point, a line, a large area, a locality, or a ward or zone (inside it). */
export function anchorKind(place: string): "point" | "line" | "large" | "locality" | "area" {
  const p = place.toLowerCase();
  if (/^(?:ward|zone|zone no|ward no)\s*\d+$|^(?:வார்டு|மண்டலம்)\s*\d+$/u.test(p)) return "area";
  if (/\b(?:harbou?r|port|lake|eri|park|beach|marina|airport|campus|zoo|reservoir|tank|estuary|backwaters?)\b|துறைமுக|ஏரி|பூங்கா|கடற்கரை|விமான நிலைய/u.test(p)) return "large";
  if (/\b(?:road|salai|street|st|high road|avenue|canal|river|nadhi|highway|omr|ecr|gst road|link road|main road)\b|சாலை|தெரு|கால்வாய்|ஆறு$/u.test(p)) return "line";
  if (/\b(?:bus (?:stand|stop|terminus|depot)|stand|station|junction|signal|school|college|hospital|temple|koil|kovil|church|mosque|market|bridge|flyover|office|depot|theatre|theater|mall|stadium|gate|circle|corner|subway)\b|நிலைய|பள்ளி|மருத்துவமனை|கோயில்|சந்தை|பாலம்/u.test(p)) return "point";
  return "locality";
}
/** The default "near" radius in km by what the place is: 500 m for a point or a line, 1 km for a large area or a locality (the map's own default). */
export function nearKm(place: string): number {
  const k = anchorKind(place);
  return k === "point" || k === "line" ? 0.5 : 1;
}

// ------------------------------------------------------------------ categories --

/** a case category said in any of the three languages, as the map's English words (the visit's and a Tanglish circle's question) */
const CATS: [RegExp, string][] = [
  [/\bflood\w*|\bwaterlog\w*|\bwater ?stagnation|\binundat\w*|\bvellam\b|\bthanni (?:thengi|nikkudhu|nikuthu)|வெள்ள|நீர் தேங்|தண்ணீர் தேங்|மழைநீர்/u, "flooding"],
  [/\bgarbage\b|\btrash\b|\bwaste\b|\bkuppai\b|குப்பை/u, "garbage"],
  [/\bpot ?holes?\b|\broad damage\b|\bkuzhi\b|சாலை சேதம்|பள்ளங்கள்/u, "potholes"],
  [/\bsewage\b|\bdrainage\b|\bmanholes?\b|\bsaakadai\b|\bkazhivuneer\b|கழிவுநீர்|சாக்கடை/u, "sewage"],
  [/\bstreet ?lights?\b|தெருவிளக்கு/u, "streetlight complaints"],
  [/\bdrinking water\b|\bwater supply\b|\bkudineer\b|குடிநீர்/u, "drinking water complaints"],
  [/\baccidents?\b|\bvibathu\b|விபத்து/u, "accidents"],
  [/\btree ?falls?\b|\bfallen trees?\b|மரம் விழு/u, "fallen trees"],
  [/\bthefts?\b|\bthiruttu\b|திருட்டு/u, "thefts"],
  [/\bcomplaints?\b|\bpugaa?r\b|புகார்/u, "complaints"],
  [/\bincidents?\b|\bcases?\b|\bissues?\b|\bproblems?\b|\bprachanai\b|பிரச்சனை|சம்பவ/u, "incidents"]
];
const catOf = (t: string): string | null => CATS.find(([re]) => re.test(t))?.[1] ?? null;
const SEVERE_WORD = /\bsevere\b|\bserious\b|\bcritical\b|\bkadumaiyana\w*|கடுமையான/u;

// ------------------------------------------------------------------ tour --

/** the words that name which tour, between "a" or "the" and "tour" ("give me the news tour", "start a quick district tour": v10 review 2, round 2) */
const TOUR_KIND = "(?:(?:district|city|hotspots?|news|flood|morning|full|whole|quick|short|guided|narrated|today'?s|todays|map) )*";
/** the same words where a tour is given: a day only before the map tour's name ("give me today's news tour"; "give me today's tour
 * programme" and "the full tour plan for tomorrow" are the Collector's own: v10 review 2, round 3); a size also right before "tour", never a
 * tour programme or plan ("give me a quick tour", "give me the whole tour": round 4) */
const TOUR_NAMED = "(?:(?:(?:morning|full|whole|quick|short|today'?s|todays) )*(?:district|city|hotspots?|news|flood|guided|narrated|map) )*(?:(?:full|whole|quick|short) )?";
const TOUR_OWN = "(?! (?:programme|program|plans?|schedule|itinerary|diary)\\b)";
/** a tour asked for in so many words: "take me round", "give me a tour", "start the news tour", "suthi kaattu", "சுற்றிக் காட்டு", "சுற்றுலா தொடங்கு" */
const TOUR_FRAME = [
  "\\btake me (?:a)?round\\b", `\\btake me on (?:a |the )?${TOUR_KIND}(?:tour|round)\\b`, "\\bshow me (?:a)?round\\b", `\\bgive me (?:a |the )?${TOUR_NAMED}tour\\b${TOUR_OWN}`,
  "\\bgo (?:a)?round the (?:district|city)\\b",
  `\\b(?:start|begin|do|run|play) (?:a |the )?${TOUR_KIND}tour\\b`, "\\b(?:start|begin|do|run|play) (?:a |the )?(?:district|city|hotspots?|morning) round\\b",
  "\\bwalk me through (?:the |today'?s |todays )?(?:district|hotspots|city)\\b", "\\bfly me (?:a)?round\\b", "^(?:(?:the|a|today'?s|todays) )*news tour$",
  // a tour of the news itself ("tour of the places in the news", "a tour of today's headlines"): "news about the CM's tour of the district" is the news
  "\\btour (?:of|round|around|through) (?:the |today'?s |todays )?(?:(?:places|spots|locations|stories|areas|hotspots) (?:in|from|of) (?:the |today'?s |todays )?)?(?:news|headlines)\\b",
  "சுற்றிக் ?காட்டு", "சுற்றிப் ?பார்க்க",
  // the Tamil nouns for a tour only with a verb that starts one, or goes, or takes the Collector on it: alone they are tourism and the CM's tours
  // in the news (v10 review 2, finding 12; round 2: "சுற்றுலா செல்வோம்", "சுற்றுலா அழைத்துச் செல்லுங்கள்" were not heard; never போதும், enough;
  // round 3: நடத்து only as asked, never the CM's "சுற்றுப்பயணம் நடத்துகிறார்" or "நடத்தும்")
  "(?:சுற்றுலா|சுற்றுப்பயண)\\S*\\s+(?:தொடங்கு|ஆரம்பி|காட்டு|காண்பி|நடத்து(?:ங்கள்|ங்க|வோம்)?(?=\\s|$)|போகலாம்|போவோம்|போங்க|போ(?=\\s|$)|செல்வோம்|செல்லலாம்|செல்லுங்க|செல்லவும்|செல்(?=\\s|$)|(?:அழைத்து|கூட்டி)\\S*\\s*(?:செல்|போ(?!தும்))\\S*)",
  "\\b(?:suthi|suththi|sutthi|chuthi|suthi) ?(?:kaattu|kattu|kaatu|kaami|kaaminga|kaatunga|kaattunga|paakalam|paaru)\\b", "\\bround (?:kootitu po|kootittu po|pogalam|kaattu|adikkalam)\\b",
  "\\btour (?:kaattu|pannu|pannalam|kootitu po|start pannu|pogalam)\\b"
];
const TOUR_ASKED = new RegExp(TOUR_FRAME.join("|"), "u");
/** the tour named with no frame ("today's hotspots tour", "the full round of the district tour", "மாவட்டச் சுற்றுலா"): a start when no news is
 * asked about ("news round-up" and "the CM's district tour" are the news: v10 review 2, finding 12) */
const TOUR_START = new RegExp([...TOUR_FRAME, "\\btour (?:of |round |around )?(?:the |today'?s |todays )?(?:district|city|chennai|hotspots?|places)\\b",
  "\\b(?:district|city|hotspots?|morning|daily|flood|storm) (?:tour|round)\\b", "ஒரு சுற்று",
  // "district tour" in Tamil, said as the whole request ("மாவட்டச் சுற்றுலா அலுவலர்", the District Tourism Officer, is not one: v10 review 2, round 2)
  "மாவட்ட\\S*\\s+(?:சுற்றுலா|சுற்றுப்பயண)\\S*$"].join("|"), "u");
const STOP_VERB = /\b(?:stop|end|cancel|finish|quit|halt|niruthu\w*|nirutthu\w*|podhum|pothum)\b|நிறுத்து|போதும்/u;
/** "stop" and "end" said as nouns ("the next stop", "at the end of this round") and a stop said not to ("don't stop the tour", "niruthaadheenga"
 * is not a stop verb at all): blanked before a stop is looked for (v10 review 2, round 2: these ended a running tour; round 3: "an end" is a
 * stop, "bring the tour to an end", and the not only right before the stop, "never mind, stop the tour" and "not now, stop the tour" stop it) */
const stopWords = (t: string): string =>
  t.replace(/\b(?:next|the|this|that|each|every|last|first|second|third|previous|final|one|another|any|its|bus)(?: tour| touring)? (?:stop|stops|end|halt)\b/g, " ")
    .replace(/\b(?:dont|don t|do not|never|not|no need to|shouldnt|should not|wont|will not|cant|cannot|without)\s+(?:stop|end|cancel|finish|quit|halt)\w*/g, " ")
    .replace(/(?:niruthu|nirutthu|stop pannu|நிறுத்து|நிறுத்த)\S*\s+(?:vendaam|venaam|vendam|வேண்டாம்|வேணாம்)/gu, " ");
/** the tour named as what is stopped, wherever it is said ("ok stop the news tour", "alright, end the district tour", "news tour-a niruthu",
 * "செய்திச் சுற்றுலாவை நிறுத்து", "சுற்றுலா போதும்"): it ends a running tour, news word or not, and never starts one (v10 review 2, finding 10:
 * these restarted the tour; round 2: one word before the stop and the news tour kept running) */
const STOP_TOUR = new RegExp([
  `\\b(?:stop|end|cancel|finish|quit|halt|close|exit)\\s+(?:(?:the|this|that|our|a) )?${TOUR_KIND}(?:tour|touring|round)\\b`,
  "\\b(?:tour|round)(?: ?a| ?ah| ?ai)? (?:niruthu\\w*|nirutthu\\w*|stop pannu\\w*|end pannu\\w*|podhum|pothum)\\b",
  "(?:சுற்றுலா|சுற்றுப்பயண)\\S*\\s+(?:நிறுத்து\\S*|போதும்|முடி(?:க்கவும்|யுங்கள்|ங்கள்|த்துவிடு\\S*)?(?=\\s|$))"
].join("|"), "u");
/** with no tour running, the whole sentence a stop of the map's tour ("stop the tour", "end the news tour", "tour-a niruthu"): told none is
 * running; "cancel my tour tomorrow" and "cancel tomorrow's tour" are the Collector's own and the planner's (v10 review 2, round 2) */
const STOP_ALONE = new RegExp([
  "^(?:(?:ok|okay|now|alright|so) )*(?:stop|end|cancel|finish|quit|halt) (?:(?:the|this|that) )?(?:(?:district|news|hotspots?|city|flood|map|narrated|guided) )?(?:tour|touring)(?: now)?$",
  "^(?:the )?(?:(?:district|news|hotspots?|city|flood) )?tour(?: ?a| ?ah| ?ai)? (?:niruthu\\w*|nirutthu\\w*|stop pannu\\w*)$",
  "^(?:\\S+ )?(?:சுற்றுலா|சுற்றுப்பயண)\\S*\\s+(?:நிறுத்து\\S*|போதும்)$"
].join("|"), "u");
const TOUR_WORD = /\b(?:tour|touring|round)\b|சுற்றுலா|சுற்றுப்பயண/u;
const TOUR_NEXT = /^(?:next|next stop|next one|next place|go on|go ahead|continue|carry on|keep going|move on|onwards?|next please|aduthu|adutha|aduththu|adutha(?:dhu|thu)|adutha (?:stop|idam|place)|next po|adutha po|அடுத்து|அடுத்தது|அடுத்த இடம்|அடுத்த நிறுத்தம்|தொடர்|தொடருங்கள்|தொடரவும்|அடுத்ததுக்கு போ|அடுத்து போ)$/u;
/** the next stop asked for in a sentence ("next stop on the tour", "go to the next stop of the tour": v10 review 2, round 2) */
const TOUR_NEXT_SAID = /^(?:(?:go|move|take me|skip|fly|on) (?:on )?to )?(?:the )?next (?:stop|place|one)(?: (?:on|of|in) (?:the |this )?(?:tour|round))?(?: please| now)?$/;
const TOUR_YES = /^(?:yes|yeah|yep|yup|ok|okay|sure|go on|please do|do it|yes please|yes go on|sari|seri|saringa|aama|aamaa|aamam|ஆம்|ஆமா|ஆமாம்|சரி|சரி போ|சரி தொடர்)$/u;
const TOUR_NO = /^(?:no|nope|no thanks|not now|that'?s it|illa|illai|vendaam|venaam|இல்லை|இல்ல|வேண்டாம்|வேணாம்)$/u;
const TOUR_BACK = /^(?:back|go back|previous|previous stop|previous one|previous place|last stop|the one before|before that|munnadi|munnaadi|pinnaadi|pinnadi|munnadi po|pinnadi po|munnadi stop|முந்தைய(?:து| இடம்| நிறுத்தம்)?|பின்னால்|பின்னாடி|முன்பு இருந்தது)$/u;
const TOUR_REPEAT = /^(?:repeat|repeat that|repeat it|say (?:that|it) again|again|once more|one more time|back to the tour|resume(?: the)? tour|continue the tour|show (?:it|this stop) again|marubadiyum|marubadi sollu|thirumba sollu|மீண்டும் சொல்|மறுபடி சொல்|திரும்பச் சொல்|மறுபடியும்)$/u;
const TOUR_STOP = /^(?:stop|stop it|stop the tour|end the tour|end tour|finish the tour|stop touring|cancel the tour|that'?s enough|enough|no more|niruthu|nirutthu|niruthunga|podhum|pothum|tour niruthu|tour stop pannu|stop pannu|நிறுத்து|நிறுத்துங்கள்|நிறுத்துங்க|போதும்|சுற்றுலாவை நிறுத்து)$/u;
const TOUR_DEEPER = /\b(?:go deeper|deeper|dig deeper|dig in|zoom in here|look closer|tell me more(?: about (?:this|here|it|this place|this one))?|more (?:about|on) (?:this|here|this place)|what(?:s| is) happening here|what(?:s| is) going on here|show me more(?: here)?|details? here|more details?)\b|\binga (?:enna nadakkudhu|enna nadakudhu|detail\w*|innum)\b|\binge enna\b|\bdeeper po\b|இங்கே என்ன நடக்கிறது|இங்கு என்ன|இதைப் பற்றி மேலும்|இன்னும் விவரமாக|ஆழமாக|விவரமாக சொல்/u;

function tourCmd(t: string, c: MapCtx10): MapCmd | null {
  const news = NEWS.test(t);
  // stop works wherever the console is, so the Collector can always end the tour; "stop" said as a noun or said not to is no stop
  const s = stopWords(t);
  const stopVerb = STOP_VERB.test(s), stopsTour = STOP_TOUR.test(s);
  if (c.tour) {
    // the tour named as what is stopped; or a stop verb and a tour word, a news word only in a stop said first ("please stop touring now", "end
    // the headlines tour", "stop playing the news tour"; "news about the tour being cancelled" is the news; "round" is a tour's word only while
    // one runs: "stop the round of calls") (v10 review 2, round 3)
    if (stopsTour || (stopVerb && TOUR_WORD.test(t) && !TOUR_ASKED.test(t) && (!news || /^(?:stop|end|cancel|finish|quit|halt)\b/.test(t)))) return { op: "tour", tour: "stop" };
    if (TOUR_STOP.test(t) || (c.tourCheck && TOUR_NO.test(t))) return { op: "tour", tour: "stop" };
    // the tour's other words only with the map on screen: once it is shrunk "go back" is the console's undo again, and "show me more news" the
    // news (v10 review 2, finding 14)
    if (c.open) {
      if (TOUR_NEXT.test(t) || TOUR_NEXT_SAID.test(t) || (c.tourCheck && TOUR_YES.test(t))) return { op: "tour", tour: "next" };
      if (TOUR_BACK.test(t)) return { op: "tour", tour: "back" };
      if (TOUR_REPEAT.test(t)) return { op: "tour", tour: "repeat" };
      if (TOUR_DEEPER.test(t) && !news && words(t).length <= 8) return { op: "tour", tour: "deeper" };
    }
  } else if (STOP_ALONE.test(t)) return { op: "tour", tour: "stop" };
  // a stop never starts a tour; a stop word, verb or noun, only beside a tour asked for in so many words ("take me round the district and stop at
  // each hotspot"; "what was the last stop of the district tour" is the Collector's own: v10 review 2, round 3)
  if (stopsTour || (STOP_VERB.test(t) && !TOUR_ASKED.test(t)) || (news && !TOUR_ASKED.test(t))) return null;
  if (TOUR_START.test(t) && !/\b(?:page|tab|report|workspace)\b/.test(t)) {
    const source = NEWS.test(t) ? "news" : /\bflood\w*|\bstorm\b|\bcyclone\b|\brain\w*|\bwaterlog\w*|\bpuyal\b|\bmazhai\b|\bvellam\b|வெள்ள|புயல்|மழை/u.test(t) ? "flood" : "hotspots";
    const full = /\b(?:full|whole|complete|entire|long|all) (?:round|tour)\b|\bfull\b|முழு/u.test(t);
    return { op: "tour", tour: "start", source, ...(full ? { full: true } : {}) };
  }
  return null;
}

// ------------------------------------------------------------------ Rain & flooding --

const RAIN_VIEW = /\brain (?:and|n) flood(?:ing|s)?\b|\b(?:rain|flood) (?:view|panel|rehearsal|memory)\b|\bpast rains\b|\bflood prone (?:areas?|streets?|roads?|places?|spots?|zones?)\b|\bwhere (?:does it|it) floods?\b|\bstreets? that flood\b|\bmazhai (?:and )?vellam\b|மழை\s*(?:and|மற்றும்)?\s*வெள்ள|வெள்ள நினைவு|மழை ஒத்திகை|வெள்ளம் வரும் பகுதி/u;
const TAB_WORD: [RegExp, NonNullable<MapCmd["tab"]>][] = [
  [/\bflooding\b|\bflood\b|வெள்ள/u, "flooding"], [/\btraffic\b|போக்குவரத்து/u, "traffic"], [/\bpower\b|\belectricity\b|\bcurrent\b|மின்/u, "power"], [/\bmetro\b|\btrains?\b|மெட்ரோ|ரயில்/u, "metro"]
];
const TA_MONTH: [RegExp, string][] = [[/ஜனவரி/u, "jan"], [/பிப்ரவரி/u, "feb"], [/மார்ச்/u, "mar"], [/ஏப்ரல்/u, "apr"], [/மே(?:\s|$)/u, "may"], [/ஜூன்/u, "jun"], [/ஜூலை/u, "jul"],
  [/ஆகஸ்ட்/u, "aug"], [/செப்டம்பர்/u, "sep"], [/அக்டோபர்/u, "oct"], [/நவம்பர்/u, "nov"], [/டிசம்பர்/u, "dec"]];
const RAIN_WORD = /\brains?\b|\bmazhai\b|மழை/u;
const TAB_FILL = new Set("show open go to switch the tab tabs view one la a me kaattu kattu kaatu pannu please rain rains in of on for mazhai and flooding".split(" "));
const OPEN_VERB = /\b(?:show|open|go to|bring up|pull up|switch to|take me to|kaattu|kattu|kaatu|open pannu|display|start)\b|காட்டு|திற/u;
const CLOSE_RAIN = /^(?:close|close it|close this|close that|close (?:the )?rain(?: and flooding)?(?: view| panel)?|exit|exit rain|done|back to (?:the )?(?:overview|map)|close pannu|moodu|மூடு|மூடவும்|வெளியேறு)$/u;
const BACK_RAIN = /^(?:back|go back|back one|one level back|back pannu|pinnadi|pinnaadi|பின்னால்|பின்னாடி|பின்செல்)$/u;

function rainCmd(t: string, c: MapCtx10): MapCmd | null {
  if (c.rainOpen && !c.tour) {
    if (CLOSE_RAIN.test(t)) return { op: "rain", act: "close" };
    if (BACK_RAIN.test(t)) return { op: "rain", act: "back" };
  }
  // a news request about the rain is the news's ("show the latest rain news", "mazhai vellam news kaattu", "news on power cuts when it rains":
  // v10 review 2, finding 9; v9 sent all of them to the news)
  if (NEWS.test(t)) return null;
  // a past rain:"show the 21 October rain", "replay the last rain", "October 21 mazhai kaattu", "அக்டோபர் 21 மழையைக் காட்டு"
  if (RAIN_WORD.test(t) && !/\b(?:will|forecast|tomorrow|tonight|going to)\b|நாளை/u.test(t)) {
    let en = t;
    for (const [re, m] of TA_MONTH) en = en.replace(re, ` ${m} `);
    const day = dayIn(en.replace(/\s+/g, " "));
    const last = /\b(?:last|latest|previous|recent) (?:heavy )?rains?\b|\bpona mazhai\b|கடந்த மழை|போன மழை/u.test(t);
    if ((day || last) && (OPEN_VERB.test(t) || /\breplay\b|\bthirumba\b|மீண்டும்/u.test(t) || c.rainOpen)) {
      return { op: "rain", act: "open", rain: day ? `rain-${day}` : "latest" };
    }
  }
  // a tab: "show the traffic tab", with Rain open "power", "metro kaattu"
  const tabSaid = /\btabs?\b/.test(t);
  if (tabSaid || c.rainOpen) {
    const hit = TAB_WORD.find(([re]) => re.test(t));
    // nothing else said but the tab and a verb ("power", "show traffic", "metro kaattu", "the power tab")
    const rest = hit ? words(t.replace(hit[0], " ")).filter((w) => !TAB_FILL.has(w) && !/^(?:காட்டு|திற|tab|பக்கம்)$/u.test(w)) : ["-"];
    if (hit && !rest.length && (tabSaid ? c.rainOpen || RAIN_WORD.test(t) : true)) return { op: "rain", act: "open", tab: hit[1] };
  }
  // the view itself: "open rain and flooding", "show the flood-prone areas", "மழை வெள்ளம் காட்டு"
  if (RAIN_VIEW.test(t)) {
    const hit = TAB_WORD.slice(1).find(([re]) => re.test(t.replace(RAIN_VIEW, " ")));
    return { op: "rain", act: "open", tab: hit ? hit[1] : "flooding" };
  }
  // a rain question with Rain's other tabs, while the map or Rain is open ("where does traffic jam when it rains")
  if (c.open || c.rainOpen) {
    const r = rehearsalIntent(t);
    if (r?.lens) return { op: "rain", act: "open", tab: r.lens };
  }
  return null;
}

// ------------------------------------------------------------------ the answer's actions --

const VISIT = new RegExp([
  "\\b(?:plan|schedule|organi[sz]e|arrange|map out|work out|route|sequence)\\s+(?:my |a |the |our |today'?s |tomorrow'?s |todays |tomorrows )?(?:field |site |inspection )?(?:visits?|trip|inspections?|round)\\b",
  // (a field or site visit only with a verb that plans it: said alone it is a visit mentioned, "I have a site visit in Velachery tomorrow": v10
  // review 2, finding 13)
  "\\bvisit (?:order|plan|route|list|sequence)\\b", "\\b(?:which|what) order (?:should|do|can|shall) i (?:visit|go)\\b",
  "\\bvisit (?:plan |order )?(?:pannu|podu|kaattu)\\b", "\\bpoi paakka plan\\b", "\\bvisit pannanum\\b",
  "வருகை(?:யை|களை|களைத்|களைத்)?\\s*(?:திட்டமிடு|வரிசை)", "பார்வையிடும் வரிசை", "பார்வையிட(?:த்)?\\s*திட்டமிடு", "(?:களப் ?|ஆய்வுப் ?)பயண\\S*\\s*(?:திட்டமிடு|ஏற்பாடு|வரிசை)",
  "செல்ல திட்டமிடு", "சென்று பார்க்க"
].join("|"), "u");
/** a visit told of or a brief asked for it, not a route to plan: "I have a site visit in X, what should I know?", "brief me", "how many field
 * visits" (v7's visit brief and the planner's, as in v9: v10 review 2, finding 13) */
const VISIT_BRIEF = /\bwhat (?:should|do|must) i (?:know|look (?:at|for|out for)|check|ask)\b|\bbrief me\b|\bbriefing\b|\bhow many\b|என்ன தெரிந்து|என்ன தெரிய/u;
const WHEN: [RegExp, { en: string; ta: string }][] = [
  [/\btomorrow morning\b|\bnaalaiku kaalai\w*|\bnaalai kaalai\w*|நாளை காலை/u, { en: "tomorrow morning", ta: "நாளை காலை" }],
  [/\btomorrow evening\b|\bnaalaiku saayangalam\b|நாளை மாலை/u, { en: "tomorrow evening", ta: "நாளை மாலை" }],
  [/\btomorrow afternoon\b|நாளை மதியம்/u, { en: "tomorrow afternoon", ta: "நாளை மதியம்" }],
  [/\btomorrow\b|\bnaalaiku\b|\bnaalai\b|நாளை/u, { en: "tomorrow", ta: "நாளை" }],
  [/\bthis evening\b|\btonight\b|\binniku saayangalam\b|இன்று மாலை/u, { en: "this evening", ta: "இன்று மாலை" }],
  [/\bthis afternoon\b|இன்று மதியம்/u, { en: "this afternoon", ta: "இன்று மதியம்" }],
  [/\bthis morning\b|இன்று காலை/u, { en: "this morning", ta: "இன்று காலை" }],
  [/\btoday\b|\binniku\b|\binnaiku\b|இன்று|இன்னைக்கு/u, { en: "today", ta: "இன்று" }]
];
/** a visit's own place: "in Adyar", "at Royapuram", "Adyar-la"; Tamil "அடையாற்றில்" */
function visitPlace(t: string): string | null {
  const m = /\b(?:in|at|around|near) (?:the )?([a-z][a-z]+(?: [a-z]+){0,2})/.exec(t.replace(/\b(?:tomorrow|today|this|morning|evening|tonight|first thing)\b.*$/, ""));
  if (m) {
    const name = m[1].split(" ").filter((w) => !PLACE_STOP.has(w) && !SUBJECT_WORDS.has(w) && !/^(?:spots?|places?|areas?|locations?|sites?|worst|ones?)$/.test(w));
    if (name.length) return titleCase(name.join(" "));
  }
  const tg = /\b([a-z]{4,})(?: |)(?:la|le) (?:irukura|ulla|iruka|irukka)\b/.exec(t);
  if (tg && !SUBJECT_WORDS.has(tg[1])) return titleCase(tg[1]);
  const ta = words(t).find((w) => /[஀-௿]/u.test(w) && /(?:யில்|ில்|த்தில்)$/u.test(w) && !/^(?:இடங்க|பகுதிக|தெருக்க|இடத்த|பகுதிய|வெள்ள|மழை|காலை|மாலை)/u.test(w));
  return ta ? taBase(ta) : null;
}
function visitCmd(t: string, c: MapCtx10): MapCmd | null {
  if (!VISIT.test(t) || VISIT_BRIEF.test(t)) return null;
  const when = WHEN.find(([re]) => re.test(t))?.[1] ?? null;
  const cat = catOf(t);
  const place = visitPlace(t);
  const sev = SEVERE_WORD.test(t);
  const question = cat || place ? ["open", sev ? "severe" : "", cat ?? "incidents", place ? `in ${place}` : ""].filter(Boolean).join(" ") : null;
  // with no cases named, the visit is planned from the answer on the map: there must be one
  if (!question && !c.hasAnswer) return null;
  return { op: "visit", question, ...(place ? { place } : {}), ...(when ? { when } : {}) };
}

// ("assign" is the console's case action, never the map's drafts: v10 review 2, finding 17)
const SEND_VERB = /\b(?:send|forward|mail|email|e mail|escalate)\b|\banupp?u\w*|அனுப்பு/u;
const NEVER_SEND = /\b(?:drafts?|tray|approve|approved|all of them now|everything now)\b|ஒப்புதல்/u;
/** a case sent, or a person sent to: the planner's, which has the case in focus ("send this case to SWD", "send this to the zonal officer": v10
 * review 2, finding 17) */
const SEND_CASE = /\b(?:this|that|the) (?:case|incident|complaint|ticket|petition)\b|\b(?:officers?|ae|aee|ee|je|engineers?|commissioner|inspector|collector|secretary|minister|mla|councillor|him|her|staff|deputy|assistant)\b|அதிகாரி|பொறியாளர்|ஆணையர்/u;
/** a department's own words ("Storm Water Drains", "SWD", "Metro Water", "the electricity board"; any Tamil name the console reads) */
const DEPT_LIKE = /\b(?:department|dept|board|drains?|drainage|water|waste|works|corporation|police|electricity|power|metro|metrowater|highways?|health|revenue|fire|sanitation|wing|swd|swm|pwd|gcc|tangedco|tneb|cmwssb|tnpcb)\b|[஀-௿]/u;
/** the console's departments' own words, from their names and short names ("Parks", "Buildings", "Bridges", "Electrical", "Education", "Town
 * Planning", "Family Welfare"), singular or plural: a send to any of them is the map's drafts (v10 review 2, round 2: DEPT_LIKE knew only some) */
const DEPT_WORDS: Set<string> = (() => {
  const s = new Set<string>();
  for (const [code, d] of Object.entries(DEPT_CONFIG)) {
    for (const w of `${code.replace(/^[A-Z]+-/, "")} ${d.short} ${d.portalName ?? ""}`.toLowerCase().replace(/[()&,]/g, " ").split(/\s+/)) {
      if (w.length >= 3 && !/^(?:department|dept|the|and|unit|general|management|mgmt|play|field|fields)$/.test(w)) s.add(w.replace(/s$/, ""));
    }
  }
  return s;
})();
/** every word said a department's ("Family Welfare", "town planning"): one of them beside a person ("the road contractor", "the hospital dean",
 * "the victim's family") is the planner's (v10 review 2, round 3); the words DEPT_WORDS leaves out as too common are a department's own beside
 * one of its words ("Disaster Management", "General Administration", "Parks and Play Fields", "the bridges unit"), and a purpose after "for"
 * is not the department's name ("town planning for action") (round 4) */
const deptWord = (said: string): boolean => {
  const ws = words(said.replace(/ for .*$/, "")).filter((w) => !/^(?:and|of|the|department|dept|unit|general|management|mgmt|play|fields?)$/.test(w));
  return ws.length > 0 && ws.every((w) => DEPT_WORDS.has(w.replace(/s$/, "")));
};
/** the map's answer plainly the thing sent ("send these", "send the results", "idha ... anuppu") */
const MAP_OBJECT = /\b(?:these|them|the (?:answer|list|results|lot)|this list|idha|idhai|ithu|ithai|ivai|ellaam|ellam)\b|இவற்றை|இவை|இதை/u;
/** the department said with a send: "send these to Storm Water Drains", "idha Metro Water-ku anuppu", "இதை மெட்ரோ வாட்டருக்கு அனுப்பு" */
function deptSaid(t: string): string | null {
  const en = /\b(?:send|forward|mail|email|e mail|escalate)\b(?: (?:this|these|them|it|the (?:answer|list|cases|results|lot)|all))?(?: (?:over|across))? (?:to|with) (?:the )?(.+?)(?: (?:department|dept|team|office|wing))?$/.exec(t);
  if (en) return en[1].trim() || null;
  const tg = /^(?:idha|idhai|ithu|ithai|indha|ivai|ivanga|ivangala|ivangalai|these|this|ellaam|ellam)?\s*(.+?) (?:ku|kku|kitta) (?:anuppu|anupu|anuppunga|anupunga|send pannu|forward pannu)\b/.exec(t);
  if (tg) return tg[1].trim() || null;
  const ta = /^(?:இதை|இவற்றை|இவைகளை|இவை)?\s*(.+?)\s*அனுப்பு/u.exec(t);
  if (ta) {
    const w = ta[1].trim().split(" ");
    const last = w.pop() ?? "";
    const base = taBase(last.replace(/(?:க்கு|ுக்கு)$/u, ""));
    return [...w, base].join(" ").trim() || null;
  }
  return null;
}
function sendCmd(t: string, c: MapCtx10): MapCmd | null {
  if (!SEND_VERB.test(t) || NEVER_SEND.test(t) || SEND_CASE.test(t) || !c.hasAnswer || !(c.open || MAP_WORD.test(t))) return null;
  // a send needs something to send: "send these", "send it to SWD", "idha SWD-ku anuppu"
  const dept = deptSaid(t);
  if (!dept && !/\b(?:these|them|this|it)\b|இதை|இவற்றை|\bidha\b/u.test(t)) return null;
  const d = dept && !/^(?:me|us|my (?:phone|email|mail)|whatsapp|someone|everyone|all|it|them|these)$/.test(dept) ? dept.replace(/^(?:the) /, "") : null;
  if (dept && !d) return null;
  // the map's drafts only for a department, or for the map's answer plainly sent; anyone else is the planner's
  if (d && !DEPT_LIKE.test(d) && !deptWord(d) && !MAP_OBJECT.test(t)) return null;
  return { op: "send", dept: d };
}

const EXPORT = /\b(?:export|download)\b|\bsave (?:it |this |these |them )?as (?:a )?(?:csv|geojson|geo json|spreadsheet|excel|gis)\b|\bgive me (?:a |the )?(?:csv|geojson|spreadsheet|excel file)\b|ஏற்றுமதி|பதிவிறக்கு|பதிவிறக்கம்/u;
function exportCmd(t: string, c: MapCtx10): MapCmd | null {
  if (!EXPORT.test(t) || NOT_MINE.test(t) || !c.hasAnswer || !(c.open || MAP_WORD.test(t))) return null;
  const format = /\bcsv\b|\bspreadsheet\b|\bexcel\b/.test(t) ? "csv" : /\bgeo ?json\b|\bgis\b/.test(t) ? "geojson" : null;
  return { op: "export", format };
}

// (save or bookmark only: "keep the map open" is not a save: v10 review 2, finding 18)
const SAVE = /\b(?:save|bookmark)\b(?: (?:this|the|my|that))?(?: map)? (?:view|answer|question|map|search|result|results|it|this)\b|\bsave (?:this|it)\b|\bview (?:a )?save pannu\b|\bsave pannu\b|சேமி|பார்வையைச் சேமி|save/u;
function saveCmd(t: string, c: MapCtx10): MapCmd | null {
  if (!/\bsave\b|\bbookmark\b|சேமி/u.test(t) || !SAVE.test(t) || NOT_MINE.test(t) || EXPORT.test(t) || !c.hasAnswer || !(c.open || MAP_WORD.test(t))) return null;
  if (/\b(?:note|reminder|remember)\b/.test(t)) return null;
  const nm = /\b(?:as|called|named) (.{2,60})$/.exec(t);
  return { op: "save", ...(nm ? { name: titleCase(nm[1].trim()) } : {}) };
}

const INSIGHT = /\bwhat stands out\b|\bwhat does (?:this|it|that) (?:mean|tell (?:me|us)|say)\b|\b(?:any |the |an? |your )?(?:insights?|analysis)\b|\banaly[sz]e (?:this|it|these|them|that)\b|\bwhat should i (?:do|make) (?:about|of) (?:this|it|these)\b|\bai analyst\b|\bwhat(?:s| is) the takeaway\b|\bkey (?:points|takeaways?)\b|\bwhat do you (?:see|make of (?:this|it))\b|\binga enna special\w*|\bidhu enna solludhu\b|\banaly[sz]e pannu\b|\benna special\w*|\bidhula enna (?:mukkiyam|important)\b|தனித்து நிற்கிறது|இதன் அர்த்தம்|இது என்ன சொல்கிறது|ஆய்வு செய்|பகுப்பாய்வு|முக்கியமானது என்ன/u;
function insightCmd(t: string, c: MapCtx10): MapCmd | null {
  return INSIGHT.test(t) && c.hasAnswer && c.open ? { op: "insight" } : null;
}

// ("suggest" only about questions, and "suggestions" asked for alone: "suggest an action for this" is the planner's: v10 review 2, finding 18)
// (round 2: any words for a question suggested, "suggest a question", "suggest another question"; "suggest" with "ask" at the end, "what do you
// suggest I ask", "suggest something to ask"; and the suggestions asked for with only words that read or show them, "read out the suggestions",
// "tell me the suggestions", "suggestions sollu", "enna suggestions irukku", "பரிந்துரைகளைக் காட்டு")
// (round 3: "ask" at the end only after "I" or "something", never a person, "suggest who to ask", "suggest someone to ask"; a follow-up only as
// the whole thing suggested, never "suggest a follow up action for this case")
// (round 4: "ask" at the end after any three words but a person's, "suggest what to ask", "suggest some things to ask", "suggest what i should
// ask"; "suggest which officer to ask" is the planner's; follow-ups "for this", never "for this case")
const SUGGEST_READ = /\bwhat (?:else )?(?:can|should|could|may) (?:i|we) ask(?: (?:the map|here|it|next))?\b|\bsuggest(?:ed)? (?:me |us )?(?:(?:a|an|some|few|more|other|any|another|one|two|three|good|useful|next|new|follow up|followup) )*(?:(?:questions?|queries|query)\b|(?:follow ups?|followups?)(?: (?:for|on|about) (?:this|it|that|these|here|the map|this map|the answer|this answer))?$)|\bsuggest\w*(?: (?!(?:who|whom|whose|whoever|someone|somebody|anyone|anybody|person|people|officers?|officials?|engineers?|staff|ae)\b)\w+){0,3} (?:to )?ask(?: (?:the map|here|it|next|now))?$|\bgive me (?:some )?(?:ideas|questions)\b|\bwhat questions\b|\bwhat can (?:you|the map) (?:answer|do)\b|\benna (?:kekkalaam|kekalaam|kekalam|ketkalaam|ketkalam|kelvi kekkalam)\b|என்ன கேட்கலாம்|கேள்விகள் பரிந்துரை|பரிந்துரைக்கப்பட்ட கேள்வி/u;
const SUGGEST_NOUN = /^(?:suggestions?|பரிந்துரைகள்\S*|பரிந்துரைகளை\S*)$/u;
const SUGGEST_FILL = new Set(("show read out tell list give open what whats are is the your some any map maps me us all again please now say those these tray its " +
  "sollu sollunga solunga kaattu kaattunga kaatu kaatunga kattu kattunga padi padinga irukku iruku irukka enna ena ennenna காட்டு காட்டுங்கள் சொல் சொல்லு சொல்லுங்கள் படி " +
  "என்ன என்னென்ன உள்ளன").split(" "));
/** the suggestions asked for, and nothing but words that read or show them ("any suggestions for this case" is the planner's) */
const suggestionsAsked = (t: string): boolean => {
  const ws = words(t);
  return ws.length <= 6 && ws.some((w) => SUGGEST_NOUN.test(w)) && ws.every((w) => SUGGEST_NOUN.test(w) || SUGGEST_FILL.has(w));
};
const ORD: [RegExp, number][] = [[/\b(?:first|1st|mudhal|muthal|number (?:1|one))\b|முதல்|முதலாவது|ஒன்றாவது/u, 1], [/\b(?:second|2nd|rendaavadhu|randaavadhu|number (?:2|two))\b|இரண்டாவது|ரெண்டாவது/u, 2],
  [/\b(?:third|3rd|moonaavadhu|number (?:3|three))\b|மூன்றாவது/u, 3], [/\b(?:fourth|4th|naalaavadhu|number (?:4|four))\b|நான்காவது/u, 4]];
function suggestCmd(t: string, c: MapCtx10): MapCmd | null {
  if ((SUGGEST_READ.test(t) || suggestionsAsked(t)) && (c.open || MAP_WORD.test(t)) && words(t).length <= 9) return { op: "suggest" };
  // "ask the second one", "the second suggestion", "rendaavadhu kelvi kelu", "இரண்டாவது கேள்வியைக் கேள்"
  const asks = /\bask\b|\bkelu\b|\bkel\b|கேள்|கேளுங்கள்/u.test(t) || /\bsuggestion\b/.test(t);
  if (asks && c.suggest?.length && words(t).length <= 6 && !NEWS.test(t)) {
    const last = /\b(?:last|kadaisi)\b|கடைசி/u.test(t);
    const hit = last ? c.suggest.length : ORD.find(([re]) => re.test(t))?.[1];
    if (hit && hit <= c.suggest.length) return { op: "suggest", n: hit, question: c.suggest[hit - 1] };
  }
  return null;
}

const SHOT_REPLAY = /\breplay(?: (?:it|that|this|the (?:shot|view|camera|answer|flight)))?$|\bplay (?:it|that|the (?:shot|view|flight)) again\b|\bshow (?:it|that) again\b|\bback to the answer\b|\b(?:first|opening) (?:shot|view)\b|\breplay pannu\b|\bthirumba kaattu\b|மீண்டும் காட்டு|மறுபடி(?:யும்)? காட்டு|திரும்பக் காட்டு/u;
const SHOT_NEXT = /\bnext (?:shot|view|camera|frame|hotspot|cluster|spot|angle)\b|\badutha (?:shot|view|hotspot|spot)\b|\bfollow the (?:road|river|line|canal|street)\b|அடுத்த (?:காட்சி|படம்|ஷாட்|shot)/u;
const SHOT_PREV = /\b(?:previous|prev|last) (?:shot|view|camera|frame|hotspot|cluster|spot|angle)\b|\bgo back a (?:shot|view)\b|\bmunnadi (?:shot|view)\b|முந்தைய (?:காட்சி|படம்|ஷாட்|shot)/u;
function shotCmd(t: string, c: MapCtx10): MapCmd | null {
  if (!(c.shots ?? 0) && !c.hasAnswer && c.kind !== "brief") return null;
  if (SHOT_NEXT.test(t)) return { op: "shot", shot: "next" };
  if (SHOT_PREV.test(t)) return { op: "shot", shot: "previous" };
  if (SHOT_REPLAY.test(t) && words(t).length <= 6 && (c.open || /\b(?:shot|view|camera|answer)\b/.test(t))) return { op: "shot", shot: "replay" };
  return null;
}

/** Ask the Map's layers (askmap/Chrome.tsx), the heat view and the base map, in the three languages; live ones first ("hospital beds" before "hospitals") */
const LAYERS: [RegExp, string][] = [
  [/\brain(?:fall)? (?:gauges?|readings?|layer|last 24)\b|\brain gauges?\b|மழை அளவு|மழைமானி/u, "live_rain"],
  [/\blake levels?\b|\breservoir levels?\b|ஏரி நீர்மட்ட/u, "live_lakes"],
  [/\bpwd works?\b|\bworks under way\b|\broad works\b|பொதுப்பணி/u, "live_works"],
  [/\bhospital beds?\b|\bbeds\b|படுக்கை/u, "live_hospitals"],
  [/\bair quality\b|\baqi\b|\bair pollution\b|காற்றின் தரம்|காற்று மாசு/u, "live_air"],
  [/\bheat ?(?:map|view|layer)\b|\bheatmap\b|வெப்ப வரைபட/u, "heat"],
  [/\bsatellite(?: view| map| image(?:ry)?)?\b|செயற்கைக்கோள்/u, "satellite"],
  [/\bstreets? (?:map|view)\b|\broad map\b|\bstreet map\b|தெரு வரைபட/u, "streets"],
  [/\bschools?\b|\bschoolu\b|பள்ளி/u, "schools"],
  [/\bcolleges?\b|\buniversit(?:y|ies)\b|கல்லூரி/u, "colleges"],
  [/\bfire (?:stations?|service)\b|தீயணைப்பு/u, "fire_stations"],
  [/\bpolice(?: stations?)?\b|காவல் நிலைய/u, "police"],
  [/\bhospitals?\b|\baaspathri\b|மருத்துவமனை/u, "hospitals"],
  [/\b(?:rail(?:way)?|metro|train)(?: and metro)?(?: stations?| lines?)?\b(?! water)|மெட்ரோ நிலைய|ரயில் நிலைய/u, "rail_metro"],
  [/\blakes?\b|\bponds?\b|\bwater bodies\b|\beri\b|ஏரி|குளம்/u, "water_bodies"],
  [/\brivers?\b|\bcanals?\b|\bwaterways?\b|\bnullahs?\b|கால்வாய்|ஆறுகள்/u, "waterways"],
  [/\bnews (?:reports?|layer|pins)\b|செய்தி அடுக்கு/u, "news"]
];
const LAYER_OFF = /\b(?:hide|remove|turn off|turn it off|switch off|take off|take away|clear|disable|no more|off|edu|eduthudu|maraikku|maraichidu)\b|மறை|அகற்று|நீக்கு|ஆஃப்/u;
const LAYER_ON = /\b(?:show|turn on|switch on|switch to|add|display|put|enable|overlay|on|kaattu|kattu|podu|go to|use)\b|காட்டு|போடு|சேர்|ஆன்/u;
const LAYER_FILL = new Set(("show turn switch on off to add display put enable overlay the me a all also too layer layers map maps la le kaattu kattu podu pannu hide remove " +
  "take away clear disable no more edu eduthudu maraikku maraichidu view go use mode in please and of base").split(" "));
function layerCmd(t: string, c: MapCtx10): MapCmd | null {
  const hit = LAYERS.find(([re]) => re.test(t));
  if (!hit) return null;
  const id = hit[1];
  // the word "layer", "on the map", or the map open: a layer; and nothing else said (no place, no question: "hospitals near Adyar" is a question)
  if (!(c.open || /\blayers?\b|அடுக்கு/u.test(t) || ON_THE_MAP.test(t) || ((id === "satellite" || id === "streets") && MAP_WORD.test(t)))) return null;
  const rest = words(t.replace(hit[0], " ")).filter((w) => !LAYER_FILL.has(w) && !/[஀-௿]/u.test(w));
  if (rest.length > 1 || (rest.length === 1 && !/^(?:stations?|reports?|now|again)$/.test(rest[0]))) return null;
  if (/[஀-௿]/u.test(t) && words(t).length > 5) return null;
  if (id === "satellite" || id === "streets") return { op: "layer", layer: id, on: true };
  const off = LAYER_OFF.test(t);
  if (!off && !LAYER_ON.test(t) && words(t).length > 2) return null;
  return { op: "layer", layer: id, on: !off };
}

const WIDER = /^(?:wider|widen(?: it)?|bigger(?: radius| circle)?|larger(?: radius| circle)?|expand(?: it)?|further out|make it (?:wider|bigger|larger)|go wider|(?:innum )?(?:perisa|periyadha)(?: (?:pannu|aakku))?|பெரிதாக்கு|விரிவாக்கு|இன்னும் பெரிதாக)$/u;
const CLOSER = /^(?:closer|narrower|narrow(?: it)?(?: down)?|smaller(?: radius| circle)?|tighter|shrink(?: it)?|make it (?:smaller|closer|narrower|tighter)|go closer|(?:innum )?chinna(?:dha)?(?: (?:pannu|aakku))?|kammi pannu|சிறிதாக்கு|குறைத்து|இன்னும் அருகில்|நெருக்கமாக)$/u;
const flatLabel = (s: string) => s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
function chipCmd(t: string, c: MapCtx10): MapCmd | null {
  if (!c.hasAnswer || !c.open) return null;
  const chips = c.chipOpts ?? [];
  const wide = WIDER.test(t), close = CLOSER.test(t);
  if (wide || close) {
    const d = chips.find((x) => /^[dr]:/.test(x.id));
    if (!d) return null;
    return { op: "chip", chip: d.id, scale: wide ? 2 : 0.5 };
  }
  if (!chips.length) return null;
  // a chip removed by its label: "remove past deadline", "drop the news filter", "<label> நீக்கு"
  const rm = /^(?:remove|drop|clear|take off|take away|without|no)\s+(?:the\s+)?(.+?)(?:\s+(?:filter|chip|part))?$/.exec(t) ?? /^(.+?)\s+(?:நீக்கு|எடு|remove pannu|edu)$/u.exec(t);
  if (rm) {
    const said = flatLabel(rm[1]);
    const x = chips.find((y) => y.removable && (flatLabel(y.en).replace(/^of /, "") === said || flatLabel(y.ta) === said || flatLabel(y.en).includes(said) && said.length >= 4));
    if (x) return { op: "chip", chip: x.id, option: null };
  }
  // an option said by its label ("last 30 days", "any status", "severe or high", "500 m", "by zone"), on exactly one chip, and not already on
  const said = flatLabel(t.replace(/^(?:change|set|switch|make)(?: it| the \w+)? to |^(?:make it|change it to) /, ""));
  const hits: { id: string; key: string }[] = [];
  for (const x of chips) for (const o of x.options) if (!o.on && (flatLabel(o.en) === said || flatLabel(o.ta) === said)) hits.push({ id: x.id, key: o.key });
  if (hits.length === 1) return { op: "chip", chip: hits[0].id, option: hits[0].key };
  return null;
}

// ------------------------------------------------------------------ circles and questions --

const REL = /\b(?:within|inside|around|near|nearby|close to|next to|right by|beside|surrounding|radius|circle|kulla|ulla|kitta|pakkathula|pakkathil|pakkam|suthi|suththi|arugil)\b|க்குள்|அருகில்|அருகே|பக்கத்தில்|சுற்றி|லிருந்து/u;
const DRAW = /\bdraw (?:a |the )?circle\b|\bcircle (?:of|around)\b|வட்டம் வரை/u;
/** what a circle asks about beyond the case categories: a map layer or a reading, in the map's English words ("schools within 2 km of Adyar",
 * "Adyar la rendu km kulla schools") */
const CIRCLE_SUBJECT: [RegExp, string][] = [
  [/\bschools?\b|\bschoolu\b|பள்ளி/u, "schools"], [/\bcolleges?\b|கல்லூரி/u, "colleges"], [/\bhospitals?\b|\baaspathri\b|மருத்துவமனை/u, "hospitals"],
  [/\bfire stations?\b|தீயணைப்பு/u, "fire stations"], [/\bpolice(?: stations?)?\b|காவல் நிலைய/u, "police stations"],
  [/\b(?:metro|railway|rail|train) stations?\b|மெட்ரோ நிலைய|ரயில் நிலைய/u, "metro stations"], [/\blakes?\b|\bponds?\b|ஏரி|குளம்/u, "lakes"],
  [/\brain(?:fall)?\b|\bmazhai\b|மழை/u, "rainfall"]
];
const subjectOf = (t: string): string | null => catOf(t) ?? CIRCLE_SUBJECT.find(([re]) => re.test(t))?.[1] ?? null;
/** where the place's own words are in the sentence (its last mention; a Tamil word by its base, "மருத்துவமனையிலிருந்து"), so what a place is named
 * for ("Stanley Hospital", "the Adyar school", "Egmore railway station") is never read as what was asked about (v10 review 2, round 2) */
function placeAt(ws: string[], place: string): Set<number> {
  const pw = words(place.toLowerCase());
  for (let i = ws.length - pw.length; i >= 0; i--) {
    if (pw.every((w, k) => ws[i + k] === w || (/[஀-௿]/u.test(w) && taBase(ws[i + k]) === w))) return new Set(pw.map((_, k) => i + k));
  }
  return new Set();
}
/** words that ask only "what is there" around a place: with nothing else said, the circle asks what is happening there */
const CIRCLE_FILL = new Set(("show me us tell give what whats is are there happening going on in the a an within inside around near nearby of from close to next right by " +
  "beside surrounding radius circle draw map maps everything anything all please can could you say").split(" "));

function circleCmd(t: string, c: MapCtx10): MapCmd | null {
  if (!REL.test(t) && !DRAW.test(t)) return null;
  const d = distance10(t);
  const place = anchorOf(t);
  if (!place) return null;
  const tamil = /[஀-௿]/u.test(t);
  // what was asked about: a case category, a layer or a reading; the rest said beside the place and the distance ("how many ...", "show ...")
  // (v10 review 2, finding 11: "show schools within two kilometres of Adyar" was asked "what is happening within 2 km of Adyar")
  // (read from the words beside the place, never the place's own: "near Stanley Hospital" is what is happening there, not hospitals: v10
  // review 2, round 2)
  const ws = words(t), placeWs = new Set(words(place.toLowerCase())), at = placeAt(ws, place);
  const subject = subjectOf(ws.filter((_, i) => !at.has(i)).join(" "));
  const said = ws.filter((w, i) => !(d && i >= d.from && i <= d.to) && !placeWs.has(w) && !CIRCLE_FILL.has(w));
  if (d) {
    const unit = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${Math.round(km * 1000) / 1000} km`);
    // the question the map's rules read: the sentence with digits (English, Tamil), or the same in English words (Tanglish, a drawn circle)
    const english = !tamil && !/\b(?:la|kulla|ulla|irundhu|lerundhu|kitta|pakkathula|suthi|enna|kaattu|nadakkudhu)\b/.test(t) && !DRAW.test(t);
    const question = tamil ? `${withDigits(t)}${subject ? "" : " என்ன நடக்கிறது"}`
      : english && (subject || said.length) ? withDigits(t).replace(place.toLowerCase(), place) : `${subject ?? "what is happening"} within ${unit(d.km)} of ${place}`;
    return { op: "circle", place, km: d.km, question };
  }
  // "near the harbour" with no distance: the map's, when the map is open or named; the radius by what the place is, said back
  if (!(c.open || MAP_WORD.test(t) || DRAW.test(t))) return null;
  if (anchorKind(place) === "area") return { op: "ask", question: `${subject ?? "what is happening"} in ${place}` };
  const km = nearKm(place);
  const unit = km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`;
  // something else said in English and no subject read here ("how many toilets near Adyar"): the sentence, with the radius in place of "near"
  const nearRe = new RegExp(`\\b(?:near|nearby|around|close to|next to|right by|beside|surrounding)(?: the)? ${place.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "u");
  if (!subject && !tamil && said.length && nearRe.test(t)) {
    return { op: "circle", place, km, near: true, question: t.replace(nearRe, `within ${unit} of ${place}`).replace(/\s+(?:on|in) (?:the )?map$/, "") };
  }
  return { op: "circle", place, km, near: true, question: `${subject ?? "what is happening"} within ${unit} of ${place}` };
}

/** Tamil and Tanglish follow-ups in the words the map's rules read (edits.ts and route.ts's time words) */
const FOLLOW_TA: [RegExp, string][] = [
  [/\b(?:only|just) (?:the )?(?:severe|serious|critical)(?: ones?| cases)?\b|\bsevere (?:ones )?only\b|\bsevere(?: a)? mattum\b|\bkadumaiyana\w* mattum\b|கடுமையான(?:வை|வற்றை)?\s*மட்டும்/u, "only severe"],
  [/\b(?:open|pending) (?:a )?mattum\b|திறந்த(?:வை)?\s*மட்டும்|நிலுவையில் உள்ளவை மட்டும்/u, "only open"],
  [/\bclosed (?:a )?mattum\b|முடிந்த(?:வை)?\s*மட்டும்/u, "closed ones"],
  [/\boverdue (?:a )?mattum\b|காலக்கெடு\s*(?:தாண்டிய|கடந்த)(?:வை)?/u, "only the overdue ones"],
  [/\bnews(?: la)? vandha\w* mattum\b|செய்தி(?:களில்|யில்)?\s*வந்த(?:வை)?/u, "only the ones in the news"],
  [/\bward ?(?:wise|vaari)\b|வார்டு\s*வாரி/u, "by ward"], [/\bzone ?(?:wise|vaari)\b|மண்டல\s*வாரி/u, "by zone"],
  [/\bendha department\w*\b|எந்த\s*துறை/u, "which department has the most"],
  [/\bpona maasa\w*|\bpona month\b|கடந்த மாத|போன மாத/u, "last month"], [/\bindha maasa\w*|\bindha month\b|இந்த மாத/u, "this month"],
  [/\bpona vaara\w*|\bpona week\b|கடந்த வார|போன வார/u, "last week"], [/\bindha vaara\w*|\bindha week\b|இந்த வார/u, "this week"],
  [/\binniku\b|\binnaiku\b|இன்று|இன்னைக்கு/u, "today"], [/\bnethu\b|\bneththu\b|நேற்று/u, "yesterday"],
  [/\bean indha\b|\bwhy these\b|ஏன் இவை/u, "why these?"]
];
/** a time alone, said as a follow-up: "now for last month", "this week", "last 30 days", "today" */
const TIME_ONLY = /^(?:(?:now|and|then|only|just|show|make it|change it to|switch to)\s+)*(?:for\s+)?(?:the\s+)?(?:today|yesterday|this (?:week|month|quarter|year)|last (?:week|month|quarter|\d+ days|\w+ days)|past (?:week|month|\d+ days|\w+ days)|the last (?:week|month|\d+ days)|since \w+(?: \w+)?)(?:\s+(?:only|instead|please))?$/;

function followCmd(t: string, c: MapCtx10): MapCmd | null {
  if (!c.open || !c.hasAnswer) return null;
  // the console's own period names ("make it weekly") stay the console's
  if (/\b(?:daily|weekly|monthly|quarterly)\b/.test(t)) return null;
  const ws = words(t);
  const tamilish = /[஀-௿]/u.test(t) || /\b(?:mattum|kaattu|pona|indha|vaari|wise|inniku|innaiku|nethu|endha)\b/.test(t);
  if (tamilish) {
    const hit = FOLLOW_TA.find(([re]) => re.test(t));
    if (hit && ws.length <= 7) return { op: "followup", question: hit[1] };
  }
  // a radius said again: "இரண்டு கிலோமீட்டர் ஆக மாற்று", "rendu km aakku", "500 meter a maathu"
  const d = distance10(t);
  if (d && ws.length <= 6 && /மாற்று|ஆக்கு|\b(?:maathu|mathu|aakku|aaku|pannu|podu)\b/u.test(t)) return { op: "followup", question: `make it ${d.km < 1 ? `${Math.round(d.km * 1000)} m` : `${d.km} km`}` };
  const q = withDigits(t);
  const edits = [EDIT_SEVERE, EDIT_ALL_SEV, EDIT_NEWS, EDIT_NOT_NEWS, EDIT_OPEN, EDIT_OVERDUE, EDIT_DEPTS, EDIT_WHICH_AREA, EDIT_TRACE, EDIT_CLEAR, EDIT_RADIUS, EDIT_COMPARE];
  if (edits.some((re) => re.test(q)) && ws.length <= 8) return { op: "followup", question: q };
  if (FOLLOW_TA[0][0].test(t) && ws.length <= 6) return { op: "followup", question: "only severe" };
  if ((EDIT_ADD.test(q) || EDIT_REMOVE.test(q)) && ws.length <= 5 && /\b(?:hospitals?|schools?|colleges?|police|fire stations?|metro stations?|lakes?|canals?|rivers?)\b/.test(q)) return { op: "followup", question: q };
  if (COUNT_BY.some(([re]) => re.test(q)) && ws.length <= 5) return { op: "followup", question: q };
  if (TIME_ONLY.test(q)) return { op: "followup", question: q.replace(/^(?:(?:now|and|then|only|just|show|make it|change it to|switch to)\s+)*(?:for\s+)?/, "").replace(/\s+(?:only|instead|please)$/, "") };
  // a short sentence leaning on the answer: "and thefts?", "what about Velachery?", "in Velachery", "same for garbage"; not a console command that
  // happens to say "these" ("close these", "then go to trends")
  const leans = /^(?:what about|how about|and|also|plus|in|at|near|around|same (?:for|in)|only|just)\b/.test(q) || !!catOf(q);
  if (FOLLOW.test(q) && leans && ws.length <= 6 && !/\b(?:go|close|open|read|tell|stop|undo|draft|page|panel|tab|filters?)\b/.test(q)) return { op: "followup", question: q };
  return null;
}

const ASK_MAP = /^(?:ask (?:the )?map(?: to| about| for| whether| if)?|on the map|show (?:me )?on the map|in the map|map la|mapla|வரைபடத்தில்|வரைபடத்திடம் கேள்)(?:\s+|$)(.*)$|^(.*?)\s+(?:on the map|in the map|on map|map la|mapla|map le|வரைபடத்தில்(?: காட்டு)?)(?:\s+(?:kaattu|kattu|show|paaru|காட்டு))?$/u;
const OPEN_ASK = /^(?:open |show )?(?:the )?ask the map$|^ask the map$|^வரைபடத்திடம் கேள்$/u;
const PLACE_Q = /\b(?:within|near|nearest|nearby|closest|farthest|around|along|hotspots?|clusters?|clustering|where (?:is|are)|which wards?|which zones?|what(?:s| is) happening in|how far)\b|\bpakkathula\b|\benga (?:adhigam|athigam)\b|அருகில்|அருகே|அருகிலுள்ள|எங்கே அதிகம்|என்ன நடக்கிறது/u;

/** a question that is only a zone's or a place's name (with "zone", "area", a zone number): no topic for the map to answer */
const placeOnly = (q: string): boolean => {
  const ws = q.split(/\s+/).filter((w) => w && !/^(?:the|zone|zones|mandalam|மண்டலம்|area|areas|ward|taluk|\d+)$/iu.test(w));
  return ws.length > 0 && ws.length <= 3 && ws.every((w) => placeWord(w) || placeWord(w.charAt(0).toUpperCase() + w.slice(1)));
};

/** "this case", "that incident", "it", "these", "this one": a thing on the screen, not a question */
const REF_ONLY = /^(?:this|that|these|those|it|them)(?: (?:case|cases|incident|incidents|complaint|complaints|ticket|tickets|one|ones|issue|issues))?$|^(?:idhu|idha|adhu|adha|இதை|அதை|இது|அது)$/u;

function askCmd(t: string, c: MapCtx10): MapCmd | null {
  if (OPEN_ASK.test(t)) return { op: "ask", question: null };
  const m = ASK_MAP.exec(t);
  if (m) {
    const q = (m[1] ?? m[2] ?? "").replace(/^(?:show|kaattu|kattu|about|for)\s+/, "").replace(/\s+(?:kaattu|kattu|show)$/, "").trim();
    if (!q) return { op: "ask", question: null };
    if (NOT_MINE.test(q)) return null;
    // (a zone or a place alone, "map la Manali zone kaattu", is the console's own map view, the rules' zone on the map page: news9's
    // n9-command-7, the merged dry run of 19 Nov)
    if (placeOnly(q)) return null;
    // (a reference alone, "show this case on the map", "show it on the map", is not a question the map can read: the planner has the case in
    // focus, as in v9: v10 review 2, finding 15)
    if (REF_ONLY.test(q)) return null;
    return { op: "ask", question: withDigits(q) };
  }
  // the map open: a place question is the map's ("where are garbage complaints clustering", "what is happening in Teynampet")
  // ("where is ..." only about cases: "where is the commissioner" is not the map's)
  if (c.open && PLACE_Q.test(t) && words(t).length >= 3 && !/^(?:open|read|draft|send|go to)\b/.test(t) && (!/\bwhere (?:is|are)\b/.test(t) || catOf(t))) return { op: "ask", question: withDigits(t) };
  return null;
}

// ------------------------------------------------------------------ the whole grammar --

/** The map operation a sentence asks for, or null. */
export function mapCommand10(text: string, c: MapCtx10): MapCmd | null {
  const t = prep10(text);
  if (!t) return null;
  // a tour's own words first: "next", "stop", "go deeper here" belong to it while it runs; "take me round the district" starts one
  const tour = tourCmd(t, c);
  if (tour) return tour;
  if (CASE.test(t)) return null;
  const rain = rainCmd(t, c);
  if (rain) return rain;
  // a news request is never the map's, but "only the ones in the news" edits the answer, and "the news layer" is a layer
  const news = NEWS.test(t);
  if (news) {
    if (c.open && c.hasAnswer && (EDIT_NEWS.test(t) || /செய்தி(?:களில்|யில்)?\s*வந்த/u.test(t))) return { op: "followup", question: EDIT_NEWS.test(t) ? t : "only the ones in the news" };
    const l = layerCmd(t, c);
    return l?.layer === "news" ? l : null;
  }
  return visitCmd(t, c) ?? sendCmd(t, c) ?? exportCmd(t, c) ?? saveCmd(t, c) ?? insightCmd(t, c) ?? suggestCmd(t, c) ?? shotCmd(t, c) ?? layerCmd(t, c) ?? chipCmd(t, c)
    ?? (NOT_MINE.test(t) ? null : circleCmd(t, c) ?? followCmd(t, c) ?? askCmd(t, c));
}
