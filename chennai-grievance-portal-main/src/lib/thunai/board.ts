/**
 * 28 Nov (the owner: "When I asked Jarvis to create a comparative dashboard of two areas, with its incidents, news, etc., it didn't create a
 * summary of those. It just gave a textual answer"; "if I ask for a comparison of two areas with the severe incidents, the dashboard should be
 * customised for severe incident comparison, not the overall everything"; "if I ask for the overall summary of something, then news,
 * grievances, reports, including vegetable prices and AQI, should be included"; "understand the question and answer it the way the user asks").
 *
 * Code's reading of a dashboard request, in English, Tamil and Tanglish, with no model: a comparison of two to four places or departments
 * ("compare Anna Nagar and Adyar", "Adyar vs Alandur this week", "comparative dashboard of A and B for severe incidents"), or the dashboard of one
 * subject ("create a dashboard of Royapuram", "overall summary of Anna Nagar", "weekly report for Anna Nagar"): which sides, which subject
 * (severe only, a group of kinds, one kind) and which parts were asked (incidents, news, complaints, reports, prices, air, rain, traffic; none
 * named: all of them). And the form an answer should take (answerForm): a count gets a number sentence, a list a list, "which/where" the place,
 * a dashboard a dashboard. Pure and browser-safe (Thunai.tsx reads it to keep a dashboard request off the console-control lane).
 */
import { DEPT_ALIASES } from "./lexicon";
import { catIn, periodIn, placesIn, sevIn, statusIn, zonesIn } from "./quick";
import { TOPIC_KEYS, topicOf, topicSaid, type Topic } from "./v18/topics";
import { asciiDigits } from "./digits";
import type { PeriodKey, World } from "./types";

export type BoardPart = "incidents" | "news" | "complaints" | "reports" | "prices" | "air" | "rain" | "traffic";
export const BOARD_PARTS: readonly BoardPart[] = ["incidents", "news", "complaints", "reports", "prices", "air", "rain", "traffic"];

export interface BoardAsk {
  recipe: "compare" | "summary";
  /** the sides of a comparison, or the one subject of a summary, in the order said */
  zones: number[]; places: string[]; depts: string[];
  sev: "Severe" | "High" | null; family: Topic | null; cat: string | null; status: "open" | "overdue" | "resolved" | null;
  /** what the dashboard holds; [] = everything for the subject (the overall set) */
  parts: BoardPart[];
  /** a console window said ("this week", "monthly"); a window of its own dates is read by the round (v18 turnWhen) */
  period: PeriodKey | null;
  /** why code read it so, for the record */
  why: string;
}

const norm = (s: string) => ` ${asciiDigits(s.normalize("NFC").toLowerCase()).replace(/[’']/g, "").replace(/[^a-z0-9஀-௿]+/g, " ").replace(/\s+/g, " ").trim()} `;

/** the words of a comparison, said in any of the three ways */
const COMPARE = /\b(?:compare|compared|comparing|comparison|comparisons|comparative|compar[ae]tive|versus|vs|v s|side by side|difference between|differences between|contrast|stack up|stacks up)\b|ஒப்பி|ஒப்பீ|கம்பே|கம்பா|கம்பரி|வித்தியாசம்|\b(?:oppidu|oppittu|oppidunga|compare pannu|compare panni|vithiyasam)\b/;
/** "X and Y, which is worse" is a question with an answer, not a dashboard; "compare" makes it one */
// ("overview" alone is the console's page: "show Adyar on the overview map" is a move; "an overview of Adyar" is a dashboard)
const DASH_NOUN = /\b(?:dashboard|dashboards|dash board|report card|scorecard|score card)\b|\boverview (?:of|for|on|about)\b|\b(?:full|complete|overall|whole|detailed) overview\b|டாஷ்போர்டு|டேஷ்போர்டு|டாஷ்போர்ட்|டேஷ்போர்ட்/;
/** a dashboard of the console's own (the Data Studio's named ones, a chart added to one): never a request for Jarvis's */
const STUDIO_DASH = /\b(?:add|pin|put|move|save)\b.{0,40}\b(?:to|on|into|in) (?:the |my |this )?dashboard\b|\bdashboard (?:named|called)\b|டாஷ்போர்டில் சேர்/;
const SUMMARY = /\b(?:summary|summaries|summarise|summarize|summarised|summarized|sum up|full picture|whole picture|overall picture|big picture|everything about|all about|all the details of|overall status|overall situation)\b|சுருக்கம்|சுருக்கமா|சுருக்கமாக|முழு விவரம்|முழு நிலவரம்/;
/** "weekly report for Anna Nagar", "Anna Nagar-க்கு weekly report எடு": the dashboard of that place over that window */
const PERIOD_REPORT = /\b(?:daily|weekly|monthly|quarterly|week s|month s|today s|todays|this week s|full|overall|complete|area|zone)\s+(?:report|reports|status report|update)\b|வாராந்திர அறிக்கை|மாதாந்திர அறிக்கை|தினசரி அறிக்கை/;
const MAKE = /\b(?:create|make|build|prepare|generate|give|show|open|get|draw|put up|set up|bring up|display|need|want|do|pull up|take)\b|காட்டு|காமி|போடு|உருவாக்கு|தயார் செய்|தயாரி|கொடு|குடு|எடு|பண்ணு|\b(?:kaattu|kaatu|kaami|podu|kudu|edu|pannu|ready pannu)\b/;
/** what happened in a place over a window ("Anna Nagar-ல 3 நாள்-ல என்ன நடந்துச்சு?"): its summary, when no kind or severity narrows it */
const WHAT_HAPPENED = /\bwhat (?:all )?(?:has |have )?happened\b|\bwhat (?:all )?(?:is |s )?(?:been )?going on\b|என்ன நடந்த|என்ன நடந்துச்சு|என்னென்ன நடந்த|\benna nadandh?(?:uchu|udhu|uthu|adhu)\b/;
/** a question of a single figure: never a dashboard, however it names one ("how many severe in the dashboard today") */
const COUNT = /\b(?:how many|how much|number of|count of|total number)\b|எத்தனை|எவ்வளவு|\b(?:evlo|evalo|evvalo|evvalavu|ethana|ethanai|eththanai)\b/;
/** the console's own pages and controls: "customise this dashboard", "the dashboard shows one" are about the console, not a request for one */
const ABOUT_CONSOLE = /\b(?:this|the|my|that) (?:dashboard|page|screen)\b(?! (?:of|for|on|about|comparing))|\b(?:in|on) the (?:dashboard|page|screen)\b|\bdata studio\b|\bcustomi[sz]e\b|\bpage\b/;
/** a follow-up that compares what the screen shows ("compare them", "compare these two") names its sides by pointing: the brain reads the thread */
const POINTING = /\b(?:them|these|those|both|the two|these two|those two|it)\b|இவை|அவை|இரண்டையும்/;

/** words that name a part of a dashboard (cleared before a kind of problem is read, so "air quality" is a part, not the pollution kind) */
const PART_WORDS: [BoardPart, RegExp][] = [
  ["news", /\b(?:news|headlines?|newspapers?|media reports?|press)\b|செய்தி|நியூஸ்|\bseithi\w*\b/g],
  ["complaints", /\b(?:complaints?|grievances?|petitions?|citizen reports?)\b|புகார்|குறைதீர்|மனு|\bpugar\w*\b/g],
  ["reports", /\b(?:police (?:reports?|records?|cases?|data)|pwd (?:reports?|records?|works?|data)|hospital (?:reports?|records?|data)|department (?:reports?|records?)|reports from (?:police|pwd|hospitals?)|(?:all )?reports)\b|அறிக்கைகள்/g],
  ["prices", /\b(?:prices?|vegetables?|vegetable prices?|veg prices?|market prices?|tomato|onion|potato|mandi|uzhavar sandhai)\b|விலை|காய்கறி|உழவர் சந்தை|தக்காளி|வெங்காய/g],
  ["air", /\b(?:aqi|air quality|air pollution|pollution|air)\b|காற்று|மாசு/g],
  ["rain", /\b(?:rain|rainfall|reservoirs?|lakes?|water levels?|lake levels?|flood warnings?|imd)\b|மழை|ஏரி|நீர்த்தேக்க/g],
  ["traffic", /\b(?:traffic|congestion|jams?|road conditions?)\b|போக்குவரத்து|நெரிசல்|டிராபிக்/g],
  ["incidents", /\b(?:incidents?|cases?|events?|issues?|problems?)\b|சம்பவ|பிரச்சனை|பிரச்சினை|\bsambavam\w*\b/g]
];
const OVERALL = /\b(?:overall|everything|all of it|all things|all the things|whole|entire|complete|full|in total|altogether|every thing|all aspects|all details)\b|எல்லா|முழு|மொத்த/;
/** crimes as a whole, not one kind of crime ("crime" said, and no word of one kind) */
const ALL_CRIME = /\bcrimes?\b|\bcriminal\b|குற்ற/;
const ONE_CRIME = /\b(?:violent|murder|assault|theft|thefts|snatch\w*|fraud|women|child|drugs?|ganja|liquor|missing|suicide|robbery|burglary)\b|கொலை|திருட்டு|வழிப்பறி|கஞ்சா/;

/** the departments a sentence names, in the order said (the console's own names, and the spoken ones); "water" alone names none */
export function deptsIn(t: string, w: World): string[] {
  const hits: { code: string; at: number; len: number }[] = [];
  const names: [string, string][] = [...Object.entries(DEPT_ALIASES).flatMap(([code, xs]) => xs.map((x): [string, string] => [code, x])), ...w.depts.map((d): [string, string] => [d.code, d.name])];
  for (const [code, raw] of names) {
    const x = norm(raw).trim();
    if (x.length < 3 || x === "water" || x === "electricity" || x === "disaster" || x === "parks" || x === "revenue" || x === "hospitals") continue;
    if (!w.depts.some((d) => d.code === code)) continue;
    const at = /[஀-௿]/.test(x) ? t.indexOf(x) : t.indexOf(` ${x} `);
    if (at < 0) continue;
    const had = hits.find((h) => h.code === code);
    if (!had) hits.push({ code, at, len: x.length });
  }
  // a longer name said in the same place wins over a shorter one inside it ("pwd buildings" over "pwd")
  const kept = hits.filter((h) => !hits.some((o) => o !== h && o.len > h.len && o.at <= h.at && o.at + o.len >= h.at + h.len));
  return [...new Set(kept.sort((a, b) => a.at - b.at).map((h) => h.code))].slice(0, 4);
}

/** the places a sentence names as sides: zones by their own names, and localities that are not zones ("Velachery vs T. Nagar") */
function sidesIn(t: string, w: World): { zones: number[]; places: string[] } {
  const zs = zonesIn(t, w);
  // (in the order said: "compare Velachery and T. Nagar" is Velachery first)
  const said = (p: string) => { const x = w.places.find((y) => y.name === p); const at = [p, ...(x?.aliases ?? [])].map((a) => t.indexOf(norm(a).trim())).filter((i) => i >= 0); return at.length ? Math.min(...at) : 1e9; };
  const ps = placesIn(t, w).filter((p) => !w.zones.some((z) => z.name.toLowerCase() === p.toLowerCase())).sort((a, b) => said(a) - said(b));
  // a zone that was found only through a locality inside it (zonesIn's last resort) is that locality, not the whole zone
  const viaPlace = (z: number) => ps.some((p) => w.places.find((x) => x.name === p)?.zone === z) && !zoneNamed(t, w, z);
  const zones = zs.filter((z) => !viaPlace(z));
  const places = ps.filter((p) => { const z = w.places.find((x) => x.name === p)?.zone; return z == null || !zones.includes(z) || viaPlace(z); });
  return { zones: zones.slice(0, 4), places: places.slice(0, 4) };
}
function zoneNamed(t: string, w: World, z: number): boolean {
  const nm = w.zones.find((x) => x.n === z)?.name;
  return !!nm && t.includes(` ${norm(nm).trim()} `);
}

/** the parts a sentence asks for, in the dashboard's order; [] when none, or the overall set, is asked */
export function partsIn(t: string): BoardPart[] {
  if (OVERALL.test(t)) return [];
  const got = new Set<BoardPart>();
  for (const [p, re] of PART_WORDS) { re.lastIndex = 0; if (re.test(t)) got.add(p); }
  // "police reports" are reports, not the police department's complaints; a lone "reports" beside "weekly" is the report asked for, not a part
  if (got.has("reports") && PERIOD_REPORT.test(t) && !/\b(?:police|pwd|hospital|department|all) (?:reports?|records?)\b|reports from/.test(t)) got.delete("reports");
  return BOARD_PARTS.filter((p) => got.has(p));
}

function strip(t: string): string {
  let x = t;
  for (const [, re] of PART_WORDS) if (re !== PART_WORDS[7][1]) x = x.replace(re, " ");
  return x;
}

/** the kind of problem a dashboard is about: a group ("crimes", "flooding") or one kind ("violent crime", "garbage") */
function subjectIn(t: string): { family: Topic | null; cat: string | null } {
  const s = strip(t);
  const fams = TOPIC_KEYS.filter((k) => topicSaid(k, s));
  // (several kinds at once: none of them alone; the dashboard shows them all, by kind)
  if (fams.length >= 2) return { family: null, cat: null };
  if (ALL_CRIME.test(s) && !ONE_CRIME.test(s)) return { family: "CRIME", cat: null };
  const cat = catIn(s, { strict: false });
  if (cat) return { family: null, cat };
  return fams.length === 1 && fams[0] !== "ROADS_TRAFFIC" && fams[0] !== "HEALTH" ? { family: fams[0], cat: null } : { family: null, cat: null };
}

/**
 * The dashboard a sentence asks for, or null when it asks for something else (a figure, a list, a move, a question about the console). Two to
 * four sides with a comparison's words: a comparison; one subject (an area, a locality, a department, a kind) with a dashboard's or a
 * summary's words, a period's report, or "what happened in X" over a window: its summary. A summary of the day with no subject is the brief's.
 */
export function boardAsk(text: string, w: World): BoardAsk | null {
  if (!text || text.length > 600) return null;
  const t = norm(text);
  const { zones, places } = sidesIn(t, w);
  // ("police reports", "reports from PWD and hospitals" name a part of the dashboard, not a department to count)
  const depts = deptsIn(t.replace(/\b(?:police|pwd|hospital|hospitals) (?:reports?|records?|data)\b|\breports from (?:the )?(?:police|pwd|hospitals?)(?: (?:and|or) (?:the )?(?:police|pwd|hospitals?))*/g, " "), w);
  const sides = zones.length + places.length;
  const parts = partsIn(t);
  const { family, cat } = subjectIn(t);
  const sev0 = sevIn(t);
  const sev = sev0 === "Severe" || sev0 === "High" ? sev0 : null;
  const status = statusIn(t);
  const period = periodIn(t);
  const base = { zones, places, depts, sev, family, cat, status, period };
  const comparing = COMPARE.test(t);
  // ---- a comparison: two to four places, or two to four departments
  if (comparing) {
    if (sides >= 2) return { recipe: "compare", ...base, depts: depts.length === 1 ? depts : [], parts: subjectParts(parts, sev, family, cat), why: "compare:places" };
    if (depts.length >= 2 && sides === 0) return { recipe: "compare", ...base, parts: subjectParts(parts, sev, family, cat), why: "compare:depts" };
    // one side named and a pointer ("compare it with Adyar"), or none: the conversation knows the rest (the brain), or the frame does
    return null;
  }
  if (COUNT.test(t) && !DASH_NOUN.test(t)) return null;
  const subject = sides > 0 || depts.length > 0 || !!family || !!cat;
  const dash = DASH_NOUN.test(t) && !STUDIO_DASH.test(t) && (MAKE.test(t) || /\b(?:dashboard|overview) (?:of|for|on|about)\b/.test(t)) && !(ABOUT_CONSOLE.test(t) && !/\b(?:dashboard|overview) (?:of|for|on|about)\b/.test(t));
  const summary = SUMMARY.test(t);
  const report = PERIOD_REPORT.test(t) && (MAKE.test(t) || /\b(?:report|reports) (?:of|for|on)\b/.test(t) || /அறிக்கை/.test(t));
  const happened = WHAT_HAPPENED.test(t) && !sev && !cat && !family && sides === 1;
  if (!subject) return null;
  if (!(dash || summary || report || happened)) return null;
  // a summary of several kinds at once ("the weekly summary of road accidents, flooding and public infrastructure") is a report of parts, each
  // counted: the brain's (demo-001), not one kind's dashboard
  if (TOPIC_KEYS.filter((k) => topicSaid(k, strip(t))).length >= 2) return null;
  // (a summary of several areas together is one dashboard over them; "compare" makes it sides)
  return { recipe: "summary", ...base, zones: zones.slice(0, 4), places: places.slice(0, 1), depts: depts.slice(0, 1), parts: subjectParts(parts, sev, family, cat),
    why: dash ? "dashboard" : summary ? "summary" : report ? "report" : "happened" };
}

/**
 * What the dashboard holds: what was asked; a subject alone (severe, a kind) with no part named is that subject's incidents only, never the
 * news, prices and air of the overall set ("comparison of two areas with the severe incidents"); nothing narrowed: everything.
 */
function subjectParts(parts: BoardPart[], sev: string | null, family: string | null, cat: string | null): BoardPart[] {
  if (parts.length) return parts;
  return sev || family || cat ? ["incidents"] : [];
}

/** a board's slots for its screen (screens.ts Slots, kept by agent.ts checkScreen) */
export function boardSlots(a: BoardAsk): Record<string, unknown> {
  return {
    zones: a.zones, ...(a.places.length ? (a.recipe === "compare" ? { places: a.places } : { place: a.places[0] }) : {}),
    ...(a.recipe === "compare" && a.depts.length >= 2 ? { depts: a.depts } : a.depts.length === 1 ? { dept: a.depts[0] } : {}),
    ...(a.family ? { family: a.family } : a.cat ? { cat: a.cat } : {}), ...(a.sev ? { sev: a.sev } : {}), ...(a.status ? { status: a.status } : {}),
    ...(a.parts.length ? { parts: a.parts } : {}), ...(a.period ? { period: a.period } : {}), fresh: true
  };
}

// ------------------------------------------------------------------ the form of an answer --

/**
 * The form the answer should take, from the question's own shape: a dashboard (board), how many (count), a list (list), which or where
 * (where: the place, on the map), yes or no (yesno), why (why), a move or an action on the console (action), or null (any form fits).
 */
export type AnswerForm = "board" | "count" | "list" | "where" | "yesno" | "why" | "action" | null;
const LIST = /\b(?:list|lists|show me (?:the |all )?|show (?:the |all )?|what are (?:the |all )?|tell me (?:the|all|about (?:the|that|those|these))|give me (?:the |all )?(?:list|cases|incidents|complaints|news)|which are|name (?:the|all)|read (?:out )?(?:the|all))\b|\b(?:tell me|show me|give me|name)\b.*\b(?:colleges|schools|cases|incidents|complaints|news|roads|streets|places|hospitals|shops|stations|markets|wards)\b|பட்டியல்|லிஸ்ட்|காட்டு|என்னென்ன|\b(?:list pannu|kaattu|kaami)\b/;
const WHERE = /\bwhere\b|\bwhich (?:area|areas|zone|zones|place|places|ward|wards|locality|localities|road|roads|street|streets|college|colleges|school|schools|hospital|hospitals|market|markets|station|stations|taluk|taluks|part|location)\b|எங்க|எங்கே|எங்கு|எந்த (?:இடம்|இடத்|பகுதி|மண்டல|ஏரியா|சாலை|ரோடு|வார்டு|கல்லூரி|பள்ளி)|\b(?:enga|engey|endha (?:area|zone|place|road|edam))\b/;
const YESNO = /^\s*(?:is|are|was|were|has|have|did|does|do|any|anything|can|should)\b|இருக்கா|உண்டா|இருக்கிறதா|\b(?:irukka|irukkaa|undaa)\b/;
const WHY = /\bwhy\b|\breason\b|\bcause\b|ஏன்|காரணம்|\byen\b/;
const ACTION = /\b(?:go to|open the|switch to|close|send|draft|mail|email|remind|remember|save|pin|export|turn (?:on|off)|zoom)\b|அனுப்பு|திற|போ |மூடு|\b(?:anuppu|thira|podu)\b/;

export function answerForm(text: string, w: World): AnswerForm {
  if (boardAsk(text, w)) return "board";
  const t = norm(text);
  if (ACTION.test(t) && !COUNT.test(t) && !WHERE.test(t)) return "action";
  if (WHY.test(t)) return "why";
  // ("how many, and which are they": the list too)
  if (COUNT.test(t)) return LIST.test(t) || /\b(?:which|what are they|name them|list them)\b|எவை|என்னென்ன/.test(t) ? "list" : "count";
  if (WHERE.test(t)) return "where";
  if (YESNO.test(text.toLowerCase()) || /^\s*(?:is|are) there\b/.test(t)) return "yesno";
  if (LIST.test(t)) return "list";
  return null;
}

/** the line put before the brain on how to answer (prompt.ts contextText): only for the forms that have a rule */
export function formLine(f: AnswerForm): string | null {
  switch (f) {
    case "count": return "ASKED: how many. say is ONE sentence with the figure and the window (add a second only for what matters most). points []. Draw at most one kpis or the list it counts.";
    case "where": return "ASKED: which or where. The first sentence names the place or places with their figures. points []. Draw them as a map when the results have their points, else a ranking.";
    case "list": return "ASKED: a list. say gives how many and names the first two or three in one or two sentences; draw the list in full (cases, news or table). points [].";
    case "yesno": return "ASKED: yes or no. Start with yes or no and the figure, in one or two sentences. points [] unless they asked for details.";
    case "why": return "ASKED: why. Say what the records show moved (kinds, places, days) in two or three sentences; a cause only when a record says it.";
    default: return null;
  }
}
