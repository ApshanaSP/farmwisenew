/**
 * v19 (25 Nov): the analyst's plan as code holds it: its schema, and the checks that keep it to what was said. Pure and browser-safe (the
 * stage's recipes read a plan back from a screen's slots); the model's call is plan.ts.
 */
import { z } from "zod";
import { countAsked } from "@/lib/askcount";
import { WINDOW_WORDS, dateWords, readPeriod, type PeriodKey } from "@/lib/period/read";
import { DEPT_ALIASES } from "../lexicon";
import { catIn, placesIn, zonesIn } from "../quick";
import type { World } from "../types";
import { isTopic, topicCats, type Topic } from "../v18/topics";
import { WHOLE_SAID } from "./whole";

export const SOURCES = ["incidents", "traffic", "air", "rain", "lakes", "weather", "prices", "news"] as const;
export const MEASURES = ["count", "severe", "open", "overdue", "resolved", "deaths", "injured", "complaints", "days_to_close", "days_open", "delay", "jams", "latest", "average", "highest", "lowest", "price", "change", "share"] as const;
export const BYS = ["zone", "ward", "place", "taluk", "dept", "kind", "group", "severity", "status", "day", "hour", "weekday", "month", "road", "station", "item", "market"] as const;
export const VIEWS = ["summary", "brief", "tasks", "focus", "changed", "news", "nearby", "map", "case", "compare", "warning", "flooding", "power", "metro"] as const;
const SEVS = ["Severe", "High", "Medium", "Low"] as const;

export const QuerySchema = z.object({
  of: z.enum(SOURCES).describe("what is asked about"),
  zones: z.array(z.number().int()).max(15).describe("zone numbers, when areas are named that are zones or lie in one"),
  place: z.string().nullable().describe("a locality, road or spot named that is not itself a zone, in English letters; else null"),
  ward: z.number().int().nullable().describe("a ward number, when a ward is named"),
  taluk: z.string().nullable().describe("a taluk code, when a taluk is named"),
  depts: z.array(z.string()).max(20).describe("department codes named or meant ('police incidents', 'corporation complaints' name one)"),
  group: z.string().nullable().describe("a group of kinds (CRIME, FLOOD...), when a whole group is named"),
  cats: z.array(z.string()).max(16).describe("kind codes, when particular kinds are named"),
  not: z.array(z.string()).max(8).describe("what is left out, as codes: 'other than the police' [POL-GCP], 'except Adyar' ['13'], 'excluding road accidents' that kind's code; [] when nothing is"),
  sev: z.array(z.enum(SEVS)).max(4).describe("severities said; [] when none"),
  status: z.enum(["open", "overdue", "resolved"]).nullable().describe("open, overdue (past deadline) or resolved, when said"),
  from: z.enum(["citizens", "police", "hospital", "news"]).nullable().describe("only when the Collector names who reported it: citizen complaints, police records, hospitals, or seen only in the news"),
  harm: z.enum(["deaths", "injuries"]).nullable().describe("only cases with deaths, or with injuries, when said"),
  words: z.array(z.string()).max(6).describe("a thing narrower than any kind ('murder', 'tree fall', 'school bus'): the word and its other usual English words; [] otherwise"),
  item: z.string().nullable().describe("prices: the vegetable; traffic: the road named; air, rain, lakes: the station or lake named; else null"),
  time: z.object({
    said: z.string().nullable(), from: z.string().nullable().describe("YYYY-MM-DD"), to: z.string().nullable().describe("YYYY-MM-DD, inclusive"), hours: z.number().nullable()
  }).nullable().describe("the time said or carried; null when none is said"),
  clock_from: z.number().int().nullable().describe("an hour of the day, 0-23, when hours of the clock are said ('between 6 pm and 9 pm' 18); else null"),
  clock_to: z.number().int().nullable().describe("the hour it ends, 1-24 ('between 6 pm and 9 pm' 21); else null"),
  older_days: z.number().int().nullable().describe("'pending for more than a month' 30, 'older than 10 days' 10: cases reported longer ago than this many days; else null (never a time window)"),
  level: z.enum(["very", "congested", "slow", "closed", "flood", "accident"]).nullable().describe("traffic: only roads of this kind, when they are counted or listed by it ('how many very congested roads', 'closed roads', 'accidents on the road now'); else null"),
  measure: z.enum(MEASURES).describe("what is counted or ranked by"),
  by: z.enum(BYS).nullable().describe("how it is split, when the question is which area, department, kind, day, road...; null for one total or a list"),
  per: z.enum(["zone", "dept", "kind"]).nullable().describe("'the biggest problem of EACH zone', 'the worst area for EACH department': the thing said after each; by is what is ranked inside it; else null"),
  order: z.enum(["most", "least"]),
  rank: z.number().int().nullable().describe("the one position asked ('second' 2, 'third' 3); null otherwise"),
  take: z.number().int().nullable().describe("how many are asked for ('top two' 2, 'one area' 1, 'all' 99); null when no number is said"),
  list: z.boolean().describe("true when the cases themselves are to be shown ('show', 'list', 'which cases', 'what are the')"),
  sort: z.enum(["priority", "newest", "oldest", "complaints", "deaths"]).describe("the order of listed cases"),
  before: z.boolean().describe("true when a rise or fall against the time before is asked")
});
/** `part`: code's own mark on a share, which limit is the part of the rest (shareOf); never asked of the model */
export type Query = z.infer<typeof QuerySchema> & { part?: "sev" | "sev+state" | "dept" | null };

export const PlanSchema = z.object({
  understood: z.string().describe("the request said again as one complete plain English question, with everything it points back at put in"),
  kind: z.enum(["answer", "view", "not_held", "other"]),
  view: z.enum(VIEWS).nullable(),
  gap: z.string().nullable().describe("not_held only: what the dashboard does not hold, in a few words"),
  title: z.string().describe("the screen's heading: exactly what is shown, at most 9 words, no figure except one said"),
  title_ta: z.string().describe("the same heading in Tamil"),
  queries: z.array(QuerySchema).max(3)
});
export type Plan = Omit<z.infer<typeof PlanSchema>, "queries"> & { queries: Query[] };
/** a plan as a screen keeps it: with code's own marks */
const KeptPlan = PlanSchema.extend({ queries: z.array(QuerySchema.extend({ part: z.enum(["sev", "sev+state", "dept"]).nullable().optional() })).max(3) });

// ------------------------------------------------------------- code's guards --

const ORD_EN: Record<string, number> = { second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, fifth: 5, "5th": 5, sixth: 6, "6th": 6, seventh: 7, "7th": 7, eighth: 8, "8th": 8, ninth: 9, "9th": 9, tenth: 10, "10th": 10,
  rendavadhu: 2, rendaavadhu: 2, irandavadhu: 2, moonavadhu: 3, moonaavadhu: 3, naalavadhu: 4, anjavadhu: 5 };
const ORD_TA: [RegExp, number][] = [[/இரண்டாவது|ரெண்டாவது|இரண்டாம்|ரெண்டாம்/, 2], [/மூன்றாவது|மூணாவது|மூன்றாம்/, 3], [/நான்காவது|நாலாவது/, 4], [/ஐந்தாவது|அஞ்சாவது/, 5]];
const RANKED = "(?:most|least|highest|lowest|largest|biggest|smallest|worst|best|top|heaviest|busiest|busy|longest|shortest|slowest|fastest|costliest|cheapest|maximum|minimum|max|min|high|low|congested|common|frequent|dangerous|polluted|affected|overdue|severe|jammed)";
/**
 * The position a sentence asks for ("second highest", "the third worst", "2nd most congested", "ரெண்டாவது அதிக"), or null. An ordinal that is a date
 * ("3rd October"), a place ("Second Street", "4th Main Road") or an item of the open screen ("open the second one") is not one.
 */
export function ordinalAsked(text: string): number | null {
  const t = ` ${String(text ?? "").normalize("NFC").toLowerCase().replace(/[.,!?;:…"“”()[\]]+/g, " ").replace(/\s+/g, " ")} `;
  const en = t.match(new RegExp(`\\b(second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|seventh|7th|eighth|8th|ninth|9th|tenth|10th|rendavadhu|rendaavadhu|irandavadhu|moonavadhu|moonaavadhu|naalavadhu|anjavadhu)\\s+(?:very\\s+)?${RANKED}`));
  if (en) return ORD_EN[en[1]] ?? null;
  for (const [re, n] of ORD_TA) if (re.test(t) && /அதிக|மிக|குறை|மோசமான|most|highest|worst|congest|top/.test(t)) return n;
  return null;
}
const POLICE = /\bpolice\b|\bcops?\b|போலீஸ்|போலிஸ்|காவல்/i;
/** a police station as a place, or Jarvis asked to send to the police: not a department filter */
const NOT_POLICE_FILTER = /police\s+(?:stations?|commissioner|quarters|booth)|காவல்\s*நிலைய|(?:போலீஸ்|போலிஸ்)\s*(?:ஸ்டேஷன்|நிலைய)|(?:send|inform|tell|call|alert)\s+(?:the\s+)?police/i;

/** a name that is set apart, not asked about ("apart from the police", "not only Adyar", "more than the police", "போலீஸ் தவிர") */
const negated = (text: string, word: string): boolean => new RegExp(`\\b(?:not(?: only| just)?|other than|apart from|except(?: for)?|excluding|outside|besides|than|after|without|leaving out|minus|everywhere but|all but|non|not (?:handled|registered|filed|reported|taken) (?:by|with))[\\s-]+(?:the\\s+)?(?:[a-z]+\\s+){0,2}?(?:${word})|(?:${word})\\S*\\s*(?:தவிர|இல்லாம|அல்லாத|விட்டு|விட)`, "i").test(text);
/** "the three newest", "five oldest" */
const latestOf = (text: string): number | null => { const m = noNames(text).match(/\b(two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s+(?:newest|oldest|latest|most recent)\b/i); return m ? (/^\d/.test(m[1]) ? Number(m[1]) : NUM_WORDS.find(([re]) => re.test(m[1]))?.[1] ?? null) : null; };
const FIRE_SERVICE = /\bfire (?:department|dept|services?|brigade|force|team|station)\b|தீயணைப்பு|\btheeyanaippu\b/i;
/** the sewer itself is meant: never put right to "severe" */
const SEWER_SAID = /\bsevere\b|metro ?water|water board|cmwssb|\bdrain|manhole|sewage|sewerage|septic|overflow|\bblocked\b|blockage|clogg|chok(?:e|ed|ing)\b|\bpipes?\b|pipeline|water supply|\bunderground\b|stagnat|manual scaveng|\b(?:sanitation|sewer) workers?\b|\b(?:workers?|labou?rers?)\b[^.?]{0,20}\b(?:died|dead|killed|deaths?|dying)\b|poison|\btoxic|suffocat|asphyxia|\bsmell|\bstench|கழிவுநீர்|சாக்கடை|மெட்ரோ ?வாட்டர்|குடிநீர்|வடிகால்/i;
/** a word speech recognition mishears, put right where only one reading makes sense ("sewer cases" are severe cases; "sewer overflow" is the sewer) */
export const heardRight = (text: string): string => SEWER_SAID.test(text) ? text : text.replace(/\b(?:sewer|sever|saver|saviou?r|server)(?=\s+(?:cases?|events?|incidents?)\b)/gi, (x, k: number) => (/\b(?:life|water|power|cyber|screen)\s+$/i.test(text.slice(0, k)) ? x : "severe"));
/** all that is waiting, said so: never only what came in the last day (water that stands, or garbage piled up, is no backlog) */
const BACKLOG = /\bback\s?log(?:s|ged)?\b|\b(?:cases?|complaints?|petitions?|grievances?|files?)\s+(?:(?:that\s+)?(?:have|has|had|are|is|were)\s+)?(?:been\s+)?(?:pil(?:ed|ing)[- ]up|in arrears)\b|\bpile[- ]?up of (?:the )?(?:\w+ )?(?:cases|complaints|petitions|grievances|files)\b|(?:வழக்கு|புகார்|கேஸ்|மனு|கோப்பு)\S*\s+(?:தேக்க(?:ம்|மாக|த்தில்)|தேங்கி)/i;
/** the backlog set apart ("leaving the backlog aside", "not counting the backlog") is not asked for */
const noBacklog = (t: string): string => t.replace(/\b(?:other than|apart from|except(?: for)?|exclud(?:e|ing)|besides|without(?: counting| including)?|not(?: counting| including)?|leav(?:e|ing)(?: out| aside)?|(?:setting|keeping) aside|ignor(?:e|ing)|minus|don'?t (?:want|count|include|need))\s+(?:(?:the|our|any|old|existing|earlier)\s+)*back\s?log\w*|\bback\s?log\w*\s+(?:aside|apart|excluded|left out|thavira)\b/gi, " ");
/** a part of what was just counted ("how many of them are overdue") */
const OF_THOSE = /\b(?:of|among|out of) (?:them|those|these|which)\b|அதுல|அதில்|அவற்றில்|இதுல|இதில்|\b(?:adhula|athula|idhula)\b/i;
const NOW_TIME = /^(?:(?:right|just|as of)\s+)?now$|^(?:currently|presently|at (?:the moment|present))$|^இப்ப(?:ோ|ோது)?$/i;
/** "now" said of the time (not the "now" that opens a sentence: "now show me ...") */
const nowSaidIn = (t: string): boolean => /\b(?:right now|just now|now|currently|at the moment|at present)\b|இப்போ/i.test(t.replace(/^\W*(?:(?:ok(?:ay)?|so|and|but|jarvis)\W+)*now\b/i, " "));
const LASTU = "(?:the\\s+)?(?:last|previous|past)\\s+(week|month)\\b";
const CH = "(?:up|down|risen|rising|rose|fallen|falling|fell|drop(?:ped|ping)?|increas(?:e|ed|ing)|decreas(?:e|ed|ing)|chang(?:e|ed|ing)|difference|improv(?:ed|ing)|worsened|worse|better|reduc(?:ed|ing)|higher|lower|more|fewer|less|jumped|grown?|grew|grow|eased)";
/** set against the week or month before: "than last week" is the comparison itself, "from last week" needs the change beside it, "since last week" a rise or fall before it */
const AGAINST: RegExp[] = [
  new RegExp(`(?<!\\b(?:older|longer|earlier|later)\\s)\\b(?:(?:than|compared? (?:to|with)|comparing (?:to|with)|against|versus|vs\\.?)\\s+|than\\s+(?:(?:it|they|we|there)\\s+(?:was|were|had)|in)\\s+)${LASTU}(?!\\s+(?:days?|hours?))`, "i"),
  new RegExp(`(?<=\\bcompare\\b[^.?]{0,40})\\bwith\\s+${LASTU}`, "i"),
  new RegExp(`\\b(?!(?<=\\b(?:any|anything|some|show|me|see|there|what)\\s+)(?:more|fewer|less)\\b)${CH}\\s+(?:(?:a lot|a little|much|sharply|slightly)\\s+)?from\\s+${LASTU}`, "i"),
  new RegExp(`\\b(?:(?:come|came|gone|went|go|going|coming)\\s+(?:up|down)|risen|rising|rose|fallen|falling|fell|dropped|increased|decreased|changed|improved|worsened|worse|better|reduced|higher|lower|jumped|grown?|grew|eased|up|down)\\b(?<!\\b(?:list|pull|bring|show|break|sum|clean|cleaned|follow|followed|pick|picked|call|called)\\s+(?:up|down))[^.?]{0,40}\\b(?:since|over)\\s+${LASTU}`, "i"),
  /(?:போன|கடந்த|சென்ற|முந்தைய)\s*(வார|மாத|மாச)த்\S*\s*(?:விட(?:வும்)?(?![஀-௿])|காட்டிலும்|ஒப்பி\S*|கம்பேர்)|(?:போன|கடந்த|சென்ற|முந்தைய)\s*(வார|மாத|மாச)த்தோட\s*(?:ஒப்பி\S*|கம்பேர்)/i,
  /\b(?:pona|kadandha|kadantha|last|previous)\s+(vaar\w*|maas\w*|maath\w*|week|month)\s+(?:vida|vidha|compare)\b(?!\s+(?:with|to|against)\b)/i
];
/** and, when the model marked a rise or fall (before): "since last week" anywhere, "any increase in thefts from last week", "over last week", "போன வாரத்துல இருந்து குறைஞ்சிருக்கா" */
const AGAINST_BEFORE: RegExp[] = [
  new RegExp(`\\b(?:since|over)\\s+${LASTU}`, "i"),
  new RegExp(`(?<=\\b(?:increase|decrease|rise|fall|drop|reduction|improvement|decline|change|difference|spike|jump)\\b[^.?]{0,40})\\bfrom\\s+${LASTU}`, "i"),
  /(?:போன|கடந்த|சென்ற)\s*(வார|மாத|மாச)த்(?:துல|துலே|தில்|தில)\s*(?:இருந்து|ிருந்து)|(?:போன|கடந்த|சென்ற)\s*(வார|மாத|மாச)த்(?:தி|து)லிருந்து|\b(?:pona|kadandha|kadantha)\s+(vaar\w*|maas\w*|maath\w*)\s+(?:la\s+)?(?:irun\w+|lerndhu)\b/i
];
/** the window a comparison with last week or month counts (this one), or null: none, or the sentence names another window of its own */
export function againstLast(text: string, time: NonNullable<Query["time"]>, before = false): "weekly" | "monthly" | null {
  const m = (before ? [...AGAINST, ...AGAINST_BEFORE] : AGAINST).map((re) => text.match(re)).find(Boolean);
  if (!m) return null;
  // only a time that stands for the week or month set against
  if (time.said && !/\b(?:last|previous|past)\s+(?:week|month)\b|(?:போன|கடந்த|சென்ற|முந்தைய)\s*(?:வார|மாத|மாச)|\b(?:pona|kadandha|kadantha)\s+(?:vaar|maas)/i.test(time.said)) return null;
  const cut = text.replace(m[0], " "), rest = readPeriod(dateWords(cut));
  // ("compare last month's thefts with the previous month": last month is the window itself)
  if (/\b(?:last|previous|past)\s+(?:week|month)\b/i.test(cut)) return null;
  if (["last", "day", "days", "month", "months", "hours", "since", "holiday"].includes(rest.kind)) return null;
  return /month|மாத|மாச|maa/i.test(m.slice(1).find(Boolean) ?? "") ? "monthly" : "weekly";
}
/** a kind of jam is a limit only when it is said: "congested traffic" is every jam (a closed, flooded or accident road is never invented) */
const JAM_SAID: Partial<Record<NonNullable<Query["level"]>, RegExp>> = {
  very: /\b(?:very|highly|heavily|heavy|severe|severely|extremely|badly|critical|critically|completely|totally|fully|terribly|standstill|serious|seriously|choked|gridlock(?:ed)?)\b|\breally (?:bad|bad(?:ly)?|congested|jammed|heavy)\b|\bmajor (?:traffic|jams?|congestion|hold[- ]?ups?|bottlenecks?)\b|மிக(?!வும்?\s*அதிக|\s*அதிக)|ரொம்ப(?!\s*(?:அதிக|டிரா|ட்ரா|நெரிச))|கடு(?:ம்|மை)|\bromba\b(?!\s+(?:traffic|adhig|athig))/i,
  congested: /\b(?:only|just|merely)\s+(?:the\s+)?congested\b|\bcongested (?:ones |roads )?(?:only|alone)\b|\bnot very congested\b|\bmoderate(?:ly)?\b/i,
  slow: /\bslow(?!er|est|ly)|மெதுவ|ஸ்லோ|medhuva/i
};
const ANY_VERY = /மிக|ரொம்ப|\b(?:romba|miga)\b/i;
function strayLevel(q: Query, p: { understood: string }, text: string, last: Plan | null, all: Query[]): boolean {
  const re = q.level ? JAM_SAID[q.level] : undefined;
  if (!re || re.test(text)) return false;
  // ("ரொம்ப நெரிசலான ரோடு எத்தனை" counts the very congested ones; "எங்க ரொம்ப நெரிசல்" asks where there is most)
  if (q.level === "very" && !q.by && !/எங்க|எந்த|எது|\b(?:enga|endha|entha|edhu)\b/i.test(text) && ANY_VERY.test(text)) return false;
  const was = last?.queries.filter((x) => x.of === "traffic" && x.level && x.level in JAM_SAID) ?? [];
  if (was.some((x) => x.level === q.level)) return false;
  // ("and the congested ones?" after the very congested)
  if (was.length && q.level === "congested" && FOLLOWS.test(text) && /\b(?:the|only|just|many) congested\b|\bcongested ones?\b/i.test(text)) return false;
  if (new Set(all.map((x) => x.level).filter((l) => l && l in JAM_SAID)).size > 1) return false;
  return !(q.level !== "congested" && re.test(p.understood) && !/[஀-௿]/.test(text) && !!last && FOLLOWS.test(text));
}
const SEV_WORD = /\b(?:severe|serious|critical|high[- ]priority|severity)\b/i;
const STATE_WORD = /\b(?:open|pending|unresolved|not (?:yet )?(?:resolved|closed)|back\s?log|overdue|past (?:the |their )?deadline|resolved|closed|waiting|citizen\w*|public|deaths?|injur\w+|older than|more than)\b/i;
/** "what percent of X are Y": which of the limits is the part (Y) when the limits alone cannot say; null: the plain reading */
export function shareOf(text: string, w: World): "sev" | "sev+state" | "dept" | null {
  // ("the cases that are severe": its verb is not the sentence's)
  const t = text.replace(/\b(?:that|which|who)\s+(?:are|is|were|was|(?:have|has|had) been)\s+/gi, " ").replace(/\s+/g, " ").trim();
  // ("out of all the cases, what percent are Y"; "what percentage of X do Y make up", "Y are what percent of X", "the share of Y in the total")
  const front = t.match(/\b(?:out of|of|among|amongst|from)\s+((?:all|the|our|this|every|total|cases|incidents|complaints|\d+)\b[^,?]*?),?\s+(?:what|how (?:much|many))\s+(?:per ?cent(?:age)?|share|proportion|fraction)?\s*(?:of (?:them|those|these) )?(?:are|is|was|were|have been|has been)\s+(.+?)[?.!]*$/i);
  const makes = t.match(/\b(?:per ?cent(?:age)?|share|proportion|fraction)\s+of\s+(.+?)\s+(?:do|does|did)\s+(.+?)\s+(?:make up|form|account for|constitute|represent)\b/i);
  const back = t.match(/^(.+?)\s+(?:are|is|make up|form|account for|constitute)\s+(?:what|how much)\s+(?:per ?cent(?:age)?|share|proportion|fraction)\s+of\s+(.+?)[?.!]*$/i);
  const m0 = front ?? makes ?? (back && ["", back[2], back[1]]);
  const m = m0 ?? t.match(/\b(?:per ?cent(?:age)?|share|proportion|fraction|how (?:much|many))\s+of\s+(.+?)\s+(?:are|is|was|were|have been|has been|lie|lies|sit|sits|belong|belongs)\s+(.+?)[?.!]*$/i);
  const r = m ? null : t.match(/\b(?:per ?cent(?:age)?|share|proportion)\s+of\s+(.+?)\s+(?:among|amongst|out of|within|in)\s+((?:all |the |our |this )*(?:open|pending|unresolved|overdue|back\s?log|resolved|citizen|total|cases|incidents|complaints)\b.*)[?.!]*$/i);
  if (!m && !r) return null;
  const x = m ? m[1] : r![2], y = m ? m[2] : r![1];
  if (deptSaid(y, w) && !deptSaid(x, w) && (SEV_WORD.test(x) || STATE_WORD.test(x))) return "dept";
  if (SEV_WORD.test(y) && !SEV_WORD.test(x)) return STATE_WORD.test(x) ? "sev" : STATE_WORD.test(y) ? "sev+state" : "sev";
  return null;
}
const ENDS: [string, string][] = [["fastest|quickest", "slowest"], ["highest|most|top|maximum|max", "lowest|least|fewest|bottom|minimum|min"], ["worst|busiest", "least|quietest"], ["best", "worst|bottom"], ["top", "worst"], ["costliest|dearest|most expensive|priciest", "cheapest|least expensive"], ["hottest|warmest", "coldest|coolest"], ["safest|cleanest", "worst|most dangerous|least safe|dirtiest|most polluted"], ["longest", "shortest"], ["biggest|largest", "smallest"], ["wettest", "driest"]];
const THINGS = "areas?|zones?|wards?|departments?|depts?|roads?|streets?|localit(?:y|ies)|places?|days?|stations?|vegetables?|kinds?|ones?|markets?|taluks?|lakes?";
const THING1 = "area|zone|ward|department|dept|road|street|locality|place|day|station|vegetable|kind|one|market|taluk|lake";
const NUM = "\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten";
const KINDLY = "(?:efficient|responsive|improved|safe|peaceful|reliable|performing|rated|ranked|active|prompt|helpful)";
const numOf = (x: string | undefined): number | null => (!x ? null : /^\d/.test(x) ? Number(x) : NUM_WORDS.find(([re]) => re.test(x))?.[1] ?? null);
const AND = `(?:and|&|as well as|plus) (?:also )?(?:(?:which|who|what|where) (?:(?<n1>${NUM}) )?(?:(?<thing>${THINGS}) )?(?:(?<verb>has|have|had|is|are|was|were|close|closes|closed|takes?|took|gets?|got|sees?|saw) )?(?:they |it )?)?(?:the )?(?:(?<n2>${NUM}) )?(?:(?:ones? )?(?:with|having) (?:the )?)?`;
/** both ends of one ranking asked for ("the two fastest and the two slowest"): how many of each, in the order said (null: no number), and the words; null: one end */
export function otherEnd(text: string): { a: string; na: number | null; b: string; nb: number | null } | null {
  const t = ` ${text.toLowerCase().replace(/[,;:"“”()?!]+/g, " ").replace(/\s+/g, " ").trim()} `;
  if (/\b(?:from|in order of|ranked|sorted)\b[^.?]{0,20}\b(?:highest|most|top|best|fastest|worst)\b[^.?]{0,12}\bto\b/.test(t)) return null;
  // each end with its own number: beside it, or before the things it ranks ("which two departments close fastest"); one number serves both
  // only when both words share one noun ("top and bottom three areas", "the three fastest and slowest departments")
  const out = (g: Record<string, string | undefined>, at: number, mid: string): { a: string; na: number | null; b: string; nb: number | null } | null => {
    const before = t.slice(0, at);
    if (g.thing && !/^ones?$/.test(g.thing) && !before.includes(` ${g.thing.replace(/ies$/, "y").replace(/s$/, "")}`)) return null;
    const own = numOf(g.na ?? g.na2), pre = own ?? numOf(noNames(before).match(new RegExp(`\\b(${NUM}) (?:(?!and )[a-z]+ ){0,1}?(?:${THINGS}) (?!(?:(?:that|which|who) are )?(?:the )?$)(?:[a-z-]+ ){1,6}$`))?.[1]);
    const nb = numOf(g.n1 ?? g.n2 ?? g.nb2);
    const single = (own != null && !!mid) || /^(?:has|is|was|closes|takes|gets|sees)$/.test(g.verb ?? "") || new RegExp(` ${g.b} (?:${THING1}) `).test(t);
    return { a: g.a!, na: pre ?? (g.nb2 && !mid ? nb : null), b: g.b!, nb: nb ?? (pre != null && !single ? pre : null) };
  };
  for (const [a, b] of [...ENDS, ...ENDS.map(([x, y]) => [y, x] as [string, string])]) {
    const m = t.match(new RegExp(`\\b(?:(?<na>${NUM}) )?(?<a>${a})\\b(?: (?<na2>${NUM}))?(?<mid>(?: (?!and |& )[a-z0-9-]+){0,6}?) ${AND}(?<b>${b})(?: (?<nb2>${NUM}))?(?: (?:${THINGS}))?(?= [.?!]? ?$|[.?!]| (?:in|this|last|now|right now|currently|today|yesterday|since|on|to|among|by|during|over|at|for) )`));
    if (m) {
      // ("top for theft and lowest for accidents": two subjects)
      const of = (x: string) => x.match(/ (?:for|in|on) (?!the last |the past |this |last )(?:the )?([a-z]+)/)?.[1];
      const s1 = of(`${m.groups!.mid} `), s2 = t.slice(m.index! + m[0].length).match(/^ (?:for|in|on) (?!the last |the past |this |last )(?:the )?([a-z]+)/)?.[1];
      if (s1 && s2 && s1 !== s2) return null;
      return out(m.groups!, m.index!, m.groups!.mid);
    }
    // ("the most and the fewest accidents": one thing, both ends; never "the best and most efficient")
    const near = t.match(new RegExp(`\\b(?:(?<na>${NUM}) )?(?<a>${a}) (?:and|&) (?:the )?(?:(?<n2>${NUM}) )?(?<b>${b}) (?!${KINDLY}\\b)[a-z]+`));
    if (near) return out(near.groups!, near.index!, "");
    // ("most complaints and least complaints", "... and which area has the least complaints")
    const rep = t.match(new RegExp(`\\b(?:(?<na>${NUM}) )?(?<a>${a})(?<mid> (?<what>[a-z]+)(?: [a-z]+){0,2}) ${AND}(?<b>${b}) \\k<what>\\b`));
    if (rep) return out(rep.groups!, rep.index!, rep.groups!.mid);
  }
  return null;
}
/** something is left out by name (more than "than", "after": a comparison leaves nothing out) */
const LEFT_OUT = /\b(?:other than|apart from|except|excluding|besides|everywhere but|all but|leaving out|without counting)\b|தவிர|அல்லாத/i;
/** a sentence that goes on from the last one */
const FOLLOWS = /^\W*(?:(?:ok(?:ay)?|so|then|now|jarvis)\W+)*(?:and\b|what about\b|how about\b|only\b|just\b|in\s|for\s|same\b|also\b|which of\b|the (?:second|third|next|first|other)\b|show (?:me )?(?:those|them|these|it|all)\b|those\b|these\b|them\b|அதுல|அதில|அதே|அப்போ|மட்டும்|எல்லா|(?:ரெண்டா|இரண்டா|மூணா|மூன்றா|அடுத்த)\S*|adhula|athula)/i;
/** a word of position anywhere ("second", "3rd", "இரண்டாவது"), for a plan's rank the sentence must support */
const ORD_ANY = /\b(?:second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|seventh|7th|eighth|8th|ninth|9th|tenth|10th|next|after|behind|runner)\b|வது|அடுத்த|rendavadhu|moonavadhu|aduttha|adutha/i;
const NUM_WORDS: [RegExp, number][] = [[/\b(?:one|single)\b|ஒரு|ஒன்று|ஒண்ணு|\boru\b/i, 1], [/\b(?:two|couple|both|pair)\b|இரண்டு|ரெண்டு|\brendu\b/i, 2], [/\bthree\b|மூன்று|மூணு|\bmoonu\b/i, 3], [/\bfour\b|நான்கு|நாலு|\bnaalu\b/i, 4],
  [/\bfive\b|ஐந்து|அஞ்சு|\banju\b/i, 5], [/\bsix\b|ஆறு\b/i, 6], [/\bseven\b|ஏழு/i, 7], [/\beight\b|எட்டு/i, 8], [/\bnine\b|ஒன்பது/i, 9], [/\bten\b|பத்து|\bpathu\b/i, 10]];
/** the sentence without its time words ("in the last two days" says no "two" of anything) */
const noTime = (t: string): string => t.replace(/\b(?:last|past|previous|next|since|for|in)\s+(?:the\s+)?(?:last\s+|past\s+)?(?:\d{1,3}|a|one|two|three|four|five|six|seven|eight|nine|ten|couple of|few)\s+(?:hours?|days?|weeks?|months?)\b/gi, " ")
  .replace(/(?:\d{1,3}|ஒரு|இரண்டு|ரெண்டு|மூன்று|மூணு|நான்கு|நாலு|ஐந்து|அஞ்சு|ஆறு|ஏழு|பத்து|rendu|moonu|naalu|anju)\s*-?\s*(?:நாள்|நாட்|நாள|மணி|வார|மாத|naal|vaaram|maasam|days?|hours?|weeks?|months?)\S*/gi, " ").replace(/\b\d{1,2}(?:st|nd|rd|th)\b/gi, " ");
/** and without its dates, clock times and numbers that name a place ("zone 9", "20 November", "6 pm", "the first ten days") */
const noNames = (t: string): string => noTime(t).replace(/\b(?:between|from)?\s*\d{1,2}(?::\d\d)?\s*(?:am|pm|a\.m\.?|p\.m\.?)?\s*(?:and|to|-)\s*\d{1,2}(?::\d\d)?\s*(?:am|pm|a\.m\.?|p\.m\.?)/gi, " ").replace(/\b\d{1,2}(?::\d\d)?\s*(?:am|pm)\b/gi, " ")
  .replace(/\b(?:\d{1,2}(?:\s*(?:to|and|-)\s*\d{1,2})?\s+(?:of\s+)?)(?:jan|feb|mar|apr|may|june?|july?|aug|sept?|oct|nov|dec)[a-z]*\b|\b(?:jan|feb|mar|apr|may|june?|july?|aug|sept?|oct|nov|dec)[a-z]*\s+\d{1,2}\b/gi, " ")
  .replace(/\b(?:two|three|four|2|3|4)[ -]?wheel\w*/gi, " ").replace(/\b(?:zone|ward|class|std|standard|no|number|division|bus)\s*(?:no\.?\s*)?\d{1,3}\b/gi, " ").replace(/\b(?:first|last|past)\s+(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|\d{1,3})\s+){1,2}(?:hours?|days?|weeks?|months?)\b/gi, " ");
/** the number of things a short follow-up says ("only two", "just 3") */
export const numberSaid = (text: string): number | null => { const t = noNames(text); const d = t.match(/(?<!\d)(\d{1,2})(?!\d)/); if (d) return Number(d[1]); return NUM_WORDS.find(([re]) => re.test(t))?.[1] ?? null; };
/** whether the sentence says a number of things, so a list may be cut to it: that number, or for one the single thing it asks for */
function takeSaid(text: string, n: number): boolean {
  const t = noNames(text);
  if (n === 1) return new RegExp(`\\b${LAST_OK}`, "i").test(t) || /\b(?:one|single|latest|newest|oldest|first|most|worst|biggest|top)\b|ஒரு|ஒன்று|ஒண்ணு|முதல்|சமீப|\boru\b/i.test(t);
  if (n >= 60) return true;
  return new RegExp(`(?<!\\d)${n}(?!\\d)`).test(t) || NUM_WORDS.some(([re, v]) => v === n && re.test(t));
}
/** citizens' own complaints, said so (any other "complaints" are the incidents: "police complaints", "garbage complaints") */
const CITIZEN = /citizen|public complaint|\b(?:people|persons|residents|public)(?:'s)?\s+(?:[a-z]+\s+){0,3}complain|residents?'? complaint|\b(?:from|by) (?:the )?(?:public|people|citizens?|residents?)\b|\bhow many (?:have |had )?complained\b|\bcomplainants?\b|மக்கள்|பொதுமக்கள்|எத்தனை பேர[்ு]|எவ்வளவு பேர[்ு]|makkal|\b(?:ethana|evlo|evvalo) peru?\b/i;

/** the plain kind a word names ("garbage" is Garbage & solid waste, "accident" Road accident): the first part of the kind's own label */
export function kindOfWord(word: string, w: World, among: string[] | null): string | null {
  const stem = (x: string) => x.toLowerCase().replace(/[^a-z]/g, "").replace(/(?:ings?|ies|es|s)$/, "").slice(0, 7);
  const toks = word.split(/[\s-]+/).map(stem).filter((x) => x.length >= 3);
  if (!toks.length) return null;
  for (const c of w.cats) {
    if (among?.length && !among.includes(c.code)) continue;
    const label = c.label.split(/[,&]/)[0].split(/[\s-]+/).map(stem).filter((x) => x.length >= 3);
    if (toks.every((t) => label.some((l) => l === t || (l.length >= 5 && t.startsWith(l)) || (t.length >= 5 && l.startsWith(t))))) return c.code;
  }
  return null;
}

/** the things a split counts, as a sentence names them: one ("which area", "the cheapest vegetable") or several ("two zones", "areas") */
const NOUNS: Partial<Record<NonNullable<Query["by"]>, string>> = {
  zone: "area|zone|place|region|part of (?:the )?(?:city|district)", ward: "ward", place: "locality|place|area|spot|neighbou?rhood|street", taluk: "taluk", dept: "department|dept|team|agency|office", kind: "kind|type|problem|issue|category|crime",
  group: "kind|type|group|category", road: "road|street|stretch|lane|junction", station: "station|area|place|lake|reservoir|location", item: "vegetable|item|commodity", market: "market", day: "day|date", month: "month", hour: "hour|time of (?:the )?day|time", weekday: "day of the week|weekday|day"
};
const plurals = (n: string): string => n.split("|").map((x) => (/y$/.test(x) ? `${x.slice(0, -1)}ies` : /(?:ch|sh|s)$/.test(x) ? `${x}es` : `${x}s`)).join("|");
/** how many of the split's things a plain English sentence asks for: "two zones" 2, "the three biggest traffic jams" 3, "which area", "the cheapest vegetable" 1; null: not said */
export function howMany(text: string, by: NonNullable<Query["by"]>): number | null {
  const nouns = NOUNS[by];
  if (!nouns) return null;
  const t = ` ${noNames(text.toLowerCase()).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()} `;
  const many = plurals(nouns);
  // (a number of jams is a number of the roads ranked; "traffic jams" alone asks for no number of roads)
  const counted = by === "road" ? `${many}|${nouns}|jam|jams` : `${many}|${nouns}`;
  const m = t.match(new RegExp(` (\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten) (?:(?!and |or |with |by |which |what |where |than |in |at )[a-z]+ ){0,3}?(?:${counted}) `));
  if (m) { const v = /^\d/.test(m[1]) ? Number(m[1]) : NUM_WORDS.find(([re]) => re.test(m[1]))?.[1] ?? null; if (v && v <= 20) return v; }
  if (new RegExp(` (?:${many}) `).test(t) || / (?:all|every|each|wise|list|ranking|rank|compare|breakdown|trend) /.test(t) || / by (?:area|zone|department|kind|type|day|road|hour) /.test(t)) return null;
  return new RegExp(` (?:which|what|whose) (?:one )?(?:[a-z]+ ){0,2}?(?:${nouns}) | (?:the|one) (?:[a-z]+ ){0,2}?(?:most|least|highest|lowest|worst|best|cheapest|costliest|busiest|biggest) (?:[a-z]+ ){0,3}?(?:${nouns}) | (?:${nouns}) (?:has|have|had|with|is|got|saw|takes?|gets?|handles?) (?:the )?(?:[a-z]+ )?(?:most|least|highest|higher|lowest|worst|best|more|longest|slowest|fastest|maximum) `).test(t)
    || new RegExp(`^ (?:the )?(?:cheapest|costliest|worst|busiest|least congested|most congested) (?:${nouns}) `).test(t) ? 1 : null;
}
const AGE_N: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
/** "pending for more than a month", "older than 10 days": how long a case has waited, in days (a wait, never a time window); null: not said */
export function olderSaid(t: string): number | null {
  if (!/\b(?:pending|open|old|older|unresolved|waiting|not (?:closed|resolved)|delayed|stuck)\b|நிலுவை/i.test(t)) return null;
  const m = t.match(/\b(?:more than|over|older than|longer than|beyond|at least)\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d{1,3})\s+(day|week|month)s?\b/i);
  if (!m) return null;
  const n = AGE_N[m[1].toLowerCase()] ?? Number(m[1]);
  return n ? Math.min(179, n * (m[2].toLowerCase() === "day" ? 1 : m[2].toLowerCase() === "week" ? 7 : 30)) : null;
}
/** "between 6 pm and 9 pm", "from 6 to 9 in the evening": the hours of the clock */
export function clockSaid(t: string): [number, number] | null {
  // ("10 at night and 4 in the morning" is 10 pm and 4 am)
  t = t.toLowerCase().replace(/\b(\d{1,2})(?::00)?(?:\s*o'?clock)?\s+(?:at|in the)\s+(night|evening|afternoon|morning)\b/g, (x, h: string, p: string) => (p === "morning" ? `${h} am` : p === "night" && Number(h) < 6 ? `${h} am` : `${h} pm`));
  const m = t.match(/\b(?:between|from)\s+(\d{1,2})(?::00)?\s*(am|pm|a\.m\.?|p\.m\.?)?\s*(?:and|to|till|until|-)\s*(\d{1,2})(?::00)?\s*(am|pm|a\.m\.?|p\.m\.?|o'?clock)?\s*(?:in the (morning|evening|afternoon|night))?/);
  if (!m || !(m[2] || m[4] || m[5])) return null;
  const pm = (x: string | undefined) => (x ? /^p/.test(x) : null);
  const part = m[5] ? m[5] !== "morning" : null;
  const b = pm(m[4]) ?? part ?? pm(m[2]), a = pm(m[2]) ?? part ?? b;
  if (a == null || b == null) return null;
  const h = (v: number, p: boolean) => (v % 12) + (p ? 12 : 0);
  const x = h(Number(m[1]), a), y = h(Number(m[3]), b);
  return Number(m[1]) <= 12 && Number(m[3]) <= 12 && x !== y ? [x, y === 0 ? 24 : y] : null;
}
/** "between 10 at night and 4 in the morning": the two numbers with nothing but words of time between them */
const TIME_W = "(?:[ap]\\.?m(?![a-z])\\.?|o'?clock|st\\b|nd\\b|rd\\b|th\\b|at night|at noon|last night|yesterday|today|(?:in the |this |yesterday )?(?:morning|evening|afternoon|night)|(?:jan|feb|mar|apr|may|june?|july?|aug|sept?|oct|nov|dec)[a-z]*)";
const CLOCK_SPAN = new RegExp(`\\b(?:between|from)\\s+\\d{1,2}(?:[:.]\\d\\d)?(?:\\s*${TIME_W})*\\s+(?:and|to|till|until)\\s+\\d{1,2}(?:[:.]\\d\\d)?(?:\\s*${TIME_W})*\\s*,?`, "gi");
const WHY_START = /^\W*(?:(?:and|but|so|then|ok(?:ay)?|jarvis)\W+)*(?:why\b|what(?:'s| is| was) the (?:reason|cause)|reasons? (?:for|behind)|cause of)|ஏன்|எதனால்|காரணம் என்ன|^\W*yen\b|\bedhanala\b/i;
/** kinds named in so many words inside a group the model took whole ("road accidents" is Road accident, not every road problem) */
const WHOLE_GROUP = /\bcrimes?\b|\bflood|\bhealth\b|road (?:problems|issues)|roads and|civic|குற்ற|வெள்ள|சுகாதார/i;

const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** a department as it is usually named in a sentence, by its alias; a bare common word ("water", "parks") only beside "department" or "board" */
function deptSaid(text: string, w: World): { code: string; alias: string } | null {
  const t = norm(text);
  let best: { code: string; alias: string } | null = null;
  for (const [code, al] of Object.entries(DEPT_ALIASES)) {
    if (!w.depts.some((d) => d.code === code)) continue;
    for (const a of al) {
      const n = norm(a).trim();
      if (n.length < 3 || !(/[\u0B80-\u0BFF]/.test(n) ? t.includes(n) : t.includes(` ${n} `))) continue;
      const plain = /\s|^(?:police|pwd|metrowater|cmwssb|swd|swm|tnpcb|conservancy)$/.test(n) || new RegExp(` ${n} (?:department|dept|board|wing|team) `).test(t);
      if (plain && !(code === "POL-GCP" && NOT_POLICE_FILTER.test(text)) && (!best || n.length > best.alias.length)) best = { code, alias: n };
    }
  }
  return best;
}
const norm = (s: string): string => ` ${s.toLowerCase().replace(/[^a-z0-9஀-௿]+/g, " ").trim()} `;
const noOrd = (t: string): string => t.replace(/\bday of the week\b|\bby (?:week)?day\b|\b(?:which|what|each|every) (?:day|week|month)s?\b|\bmonth on month\b/gi, " ");
/** the one case a sentence asks for ("the oldest pending case", "the last severe incident", "the most serious complaint") */
const LAST_OK = "last(?! (?:(?:one|two|three|four|five|six|seven|ten|few|\\d+) )?(?:hour|week|weekend|month|night|year|day)s?\\b)";
const ONE_CASE = new RegExp(`\\b(?:the|which|what|one|single)\\b[^.?]{0,24}?\\b(?:oldest|latest|newest|most recent|${LAST_OK}|most (?:serious|severe|urgent|critical)|worst|longest (?:pending|open)|first(?! (?:two|three|four|five|\\d)))\\s+(?:[a-z-]+\\s+){0,3}?(?:case|incident|complaint|event|report|accident|murder|theft|fire|one)\\b(?!s)(?![\\s,-]+(?:[a-z,-]+\\s+){0,3}(?:cases|incidents|complaints|reports|events|spots|deaths|problems|issues|list|count|number|total|trend|updates?|details?)\\b)`, "i");
/** The plan as the records know it: unknown codes go, and what the sentence plainly says and the plan left out is put in. */
export function checkPlan(p: Plan, w: World, text: string, o: { last?: Plan | null } = {}): Plan {
  const queries = p.queries.slice(0, 3).map((q): Query => {
    const zones = [...new Set(q.zones.filter((z) => w.zones.some((x) => x.n === z)))].slice(0, 15);
    const depts = [...new Set(q.depts.filter((d) => w.depts.some((x) => x.code === d)))];
    const group = isTopic(q.group) ? q.group : null;
    const cats = group ? [] : [...new Set(q.cats.filter((c) => w.cats.some((x) => x.code === c)))];
    const place = q.place && /^(?:[=~+][^<>\u0000-\u001f]{2,160}|[\p{L}\p{M}\p{N} .,'()\/&-]{2,80})$/u.test(q.place.trim()) && !w.zones.some((z) => z.name.toLowerCase() === q.place!.trim().toLowerCase()) ? q.place.trim() : null;
    const take = q.take != null && q.take >= 1 ? Math.min(99, Math.round(q.take)) : null;
    const rank = q.rank != null && q.rank >= 1 && q.rank <= 30 ? Math.round(q.rank) : null;
    const words = [...new Set(q.words.map((x) => x.trim().toLowerCase()).filter((x) => /^[\p{L}\p{M}\p{N} '-]{3,40}$/u.test(x)))].slice(0, 6);
    const hour = (v: number | null, hi: number) => (v != null && v >= 0 && v <= hi ? Math.round(v) : null);
    const cf = hour(q.clock_from, 23), ct = hour(q.clock_to, 24);
    const per = q.by && q.per && q.per !== q.by && q.of === "incidents" ? q.per : null;
    const older = q.older_days != null && q.older_days >= 1 && q.older_days <= 179 ? Math.round(q.older_days) : null;
    const not = [...new Set(q.not.map((x) => x.trim()).filter((x) => w.depts.some((d) => d.code === x) || w.cats.some((c) => c.code === x) || w.zones.some((z) => String(z.n) === x)))].slice(0, 8);
    return { ...q, not, older_days: q.of === "incidents" ? older : null, ward: q.ward != null && q.ward >= 1 && q.ward <= 200 ? Math.round(q.ward) : null, clock_from: cf != null && ct != null && cf !== ct && ct - cf < 24 ? cf : null, clock_to: cf != null && ct != null && cf !== ct && ct - cf < 24 ? ct : null, per, zones, depts, group, cats, place, take, rank: rank && rank > 1 ? rank : null, words, item: q.item ? clip(q.item, 40) || null : null,
      taluk: q.taluk && w.taluks.some((t) => t.code === q.taluk) ? q.taluk : null, sev: [...new Set(q.sev)] };
  });
  // "the highest and the second highest" are two; "not the second" is not the second
  const both = queries.length === 1 && /(?<!\b(?:second|2nd|third|3rd) )\b(?:highest|most|first|top|worst|lowest|least)\b[^.?]{0,24}\b(?:and|&)\b[^.?]{0,12}\b(?:second|2nd)\b|\b(?:second|2nd)\s+\S+\s+(?:and|&)\s+(?:the\s+)?(?:highest|worst|first|top|most|lowest|least)\b/i.test(text);
  const ord = both || /\bnot (?:the )?(?:second|2nd|third|3rd|fourth|fifth)\b/i.test(text) ? null : ordinalAsked(text), n = countAsked(noNames(text)) ?? latestOf(text);
  const said = `${text} ${p.understood}`;
  // (a click's plan is checked with no sentence: it is kept as it was built)
  const bySentence = !!text.trim();
  // (days of the week and weekends are read by run.ts timeOf from these words)
  const dayWords = (t: string): string | null => noOrd(t).match(/\b(?:last |this |past )?(?:weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(?:last night|overnight)\b/i)?.[0] ?? null;
  // the time a sentence says, read by code, for requests that came without any ("in the last 48 hours", "this month", "compared to last week")
  const untimed = queries.every((x) => !x.time?.said && !x.time?.from);
  let codeTime: { said: string; before: boolean } | null = null;
  // (a Tamil sentence is read in the request's English first: "ரெண்டு வாரத்துல" is two weeks there)
  // (a split by the day of the week, or two days set side by side, is no one day; "daily trend" and "monthly" say how it is split, not over which time)
  const bySplit = queries.some((x) => x.by === "day" || x.by === "weekday" || x.by === "month" || x.by === "hour");
  const twoDays = (said.match(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekdays?|weekends?)\b/gi) ?? []).map((x) => x.toLowerCase().replace(/s$/, "")).filter((x, k, a) => a.indexOf(x) === k).length > 1;
  if (bySentence && untimed) for (const t0 of /[\u0B80-\u0BFF]/.test(text) ? [p.understood, text] : [text, p.understood]) {
    const t = bySplit ? t0.replace(/\b(?:daily|weekly|monthly|hourly|(?:day|week|month|hour) by (?:day|week|month|hour)|(?:day|week|month)[- ]?wise|per (?:day|week|month|hour)|by (?:day|week|month|hour)|each (?:day|week|month))\b|தினசரி|தினமும்|நாள்வாரி\S*|மாதாந்திர\S*|மாதவாரி\S*/gi, " ") : t0;
    // ("day of the week" and "pending for more than a month" are no time window)
    const spec = readPeriod(dateWords(noOrd(olderSaid(t) ? t.replace(/\b(?:more than|over|older than|longer than|beyond|at least)\s+\S+\s+(?:day|week|month)s?\b/gi, " ") : t)));
    if (spec.kind === "compare") { codeTime = { said: WINDOW_WORDS[spec.key].en, before: true }; break; }
    // (the dashboard's own window, written into the request by the model, is no time anybody said)
    if (t0 !== text && spec.kind === "window" && spec.key === "daily") continue;
    if (spec.kind !== "none" && spec.kind !== "now" && spec.kind !== "unheld") { codeTime = { said: clip(t, 200), before: false }; break; }
    const dw = twoDays || queries.some((x) => x.by === "weekday") ? null : dayWords(t);
    if (dw) { codeTime = { said: dw, before: false }; break; }
  }
  let gap: string | null = null;
  const opens = queries.filter((x) => x.status === "open" || x.status === "overdue" || x.measure === "open" || x.measure === "overdue");
  for (const q of queries) {
    // the fire service is no department of these records (a model once took its "FWD" for it): fire incidents, whoever handles them, and said so
    if (bySentence && q.of === "incidents" && FIRE_SERVICE.test(said) && !w.depts.some((d) => /\bfire\b/i.test(d.name))) { q.depts = []; q.group = null; q.cats = w.cats.some((c) => c.code === "FIRE_EXPLOSION") ? ["FIRE_EXPLOSION"] : q.cats; q.words = []; gap = "fire service as a department"; }
    // what is set apart by name ("other than the police", "except Adyar") is left out, never what is counted
    if (bySentence && queries.length === 1 && q.of === "incidents") {
      for (const [code, al] of Object.entries(DEPT_ALIASES)) if (w.depts.some((d) => d.code === code) && LEFT_OUT.test(text) && al.some((a) => a.length >= 3 && negated(text, a.toLowerCase().replace(/[^a-z0-9\u0B80-\u0BFF ]/g, "").trim()))) { if (!q.not.includes(code)) q.not = [...q.not, code].slice(0, 8); q.depts = q.depts.filter((d) => d !== code); }
      for (const z of w.zones) if (LEFT_OUT.test(text) && [z.name, z.ta ?? ""].some((a) => a && negated(text, a.toLowerCase()))) { if (!q.not.includes(String(z.n))) q.not = [...q.not, String(z.n)].slice(0, 8); q.zones = q.zones.filter((x) => x !== z.n); }
    }
    // the time: the words said, or carried from the turn being followed; a time the model made up with no words goes, and one it left out of the
    // request though the sentence says it ("in the last 48 hours", "this month") is put back, read by code
    if (bySentence) {
      if (q.time && !q.time.said && !q.time.from) q.time = null;
      // (several requests keep the wait and the window each was given)
      const age = q.of === "incidents" && queries.length === 1 ? olderSaid(text) ?? olderSaid(p.understood) : null;
      if (age) { q.older_days = age; if (q.time?.said && /more than|over|older|longer|beyond|at least|month|week|day/i.test(q.time.said) && !/\blast|past|yesterday|today\b/i.test(q.time.said)) q.time = null; if (!q.status) q.status = "open"; }
      else if (queries.length === 1 || !(olderSaid(text) ?? olderSaid(p.understood))) q.older_days = null;
      // "now" is the dashboard's own window, never a backlog's 90 days; but a backlog, or what is past its deadline, is all that is waiting now
      const backlog = q.of === "incidents" && (BACKLOG.test(noBacklog(text)) || ((!!q.status || /[஀-௿]/.test(text) || OF_THOSE.test(text)) && BACKLOG.test(noBacklog(p.understood)))) && (queries.length === 1 || !opens.length || opens.includes(q));
      const late = (x: Query) => x.status === "overdue" || x.measure === "overdue", timed = (x: Query) => ownTime(x) && !(x.time!.said && !x.time!.from && NOW_TIME.test(x.time!.said.trim()));
      // ("how many are open right now, and how many of them are overdue", "and how many of those are overdue now": over the window of those)
      const those = OF_THOSE.test(said);
      const whole = q.of === "incidents" && late(q) && !backlog ? (queries.length > 1 ? queries : those ? o.last?.queries ?? [] : []).find((x) => x !== q && x.of === "incidents" && !late(x) && wideKey(x, "daily") !== "quarterly" && (those || !timed(x))) : undefined;
      if (whole && timed(whole) && (!q.time || (!!q.time.said && !q.time.from && NOW_TIME.test(q.time.said.trim())))) q.time = whole.time;
      const waiting = backlog || (q.of === "incidents" && late(q) && !whole);
      if (waiting && q.time?.said && !q.time.from && NOW_TIME.test(q.time.said.trim())) q.time = null;
      if (backlog && !q.status && q.measure === "count") q.status = "open";
      const carries = !!o.last && untimed && FOLLOWS.test(text) && !nowSaidIn(text) && o.last.queries.some((x) => x.of === q.of && ownTime(x));
      if ((backlog || (waiting && nowSaidIn(text))) && !carries && !q.time && !codeTime && !q.by && !age && !q.older_days && !q.before && q.measure !== "change") q.time = { said: WINDOW_WORDS.quarterly.en, from: null, to: null, hours: null };
      // "has it come down since last week" is this week against the last one
      if (queries.length === 1 && q.of === "incidents" && q.time) { const k = againstLast(text, q.time, q.before || q.measure === "change"); if (k) { q.time = { said: WINDOW_WORDS[k].en, from: null, to: null, hours: null }; q.before = true; } }
      // a kind of jam nobody named is no limit
      if (q.of === "traffic" && strayLevel(q, p, text, o.last ?? null, queries)) q.level = null;
      // which limit of a share is the part, as the sentence says it
      if (q.of === "incidents" && q.measure === "share" && !q.by) { const part = shareOf(/[஀-௿]/.test(text) ? p.understood : text, w) ?? shareOf(p.understood, w); if (part && (part === "dept" ? q.depts.length > 0 : q.sev.length > 0 && (!!q.status || !!q.from || !!q.harm || !!q.older_days))) q.part = part; }
      if (!q.time && !codeTime && !age && !q.older_days && !waiting && /\b(?:right now|just now|now|currently|at the moment|at present)\b|இப்போ/i.test(text)) q.time = { said: "now", from: null, to: null, hours: null };
      if (!q.time && codeTime && !q.older_days) { q.time = { said: codeTime.said, from: null, to: null, hours: null }; if (codeTime.before) q.before = true; }
      // (a follow-up that names no time keeps the window of what it follows: "and in Adyar?" after a 90-day ranking was counted over 24 hours)
      if (!q.time && !q.older_days && !codeTime && o.last && untimed && FOLLOWS.test(text) && !(waiting && nowSaidIn(text))) { const l = o.last.queries.find((x) => x.of === q.of && ownTime(x)); if (l) q.time = l.time; }
      // a taluk only when a taluk is said; a locality's zone is the one it lies in, whatever the model wrote
      if (q.taluk && !/taluk|thaluk|வட்ட|தாலுகா/i.test(said)) q.taluk = null;
      if (q.place) { const pl = q.place.toLowerCase(); const hit = w.places.find((x) => x.zone && [x.name, ...x.aliases].some((a) => a.toLowerCase() === pl)); if (hit?.zone) q.zones = [hit.zone]; }
      // a ward said and left out; the whole hour words the model put in as a time of their own are its clock
      if (q.of === "incidents" && q.ward == null && queries.length === 1 && q.by !== "ward") { const m = text.match(/\bward\s*(?:no\.?|number)?\s*(\d{1,3})\b|வார்டு\s*(\d{1,3})/i); const v = m ? Number(m[1] ?? m[2]) : 0; if (v >= 1 && v <= 200) q.ward = v; }
      // "the Retteri lake case" is a case at a lake, not its level
      if (queries.length === 1 && (q.of === "lakes" || (q.of === "traffic" && !TRAFFIC_W.test(text))) && /\b(?:case|incident|complaint)s?\b|புகார்|சம்பவ/i.test(text) && (q.place || q.item)) { q.of = "incidents"; q.place = q.place ?? q.item; q.item = null; q.measure = "count"; q.list = true; }
      if (q.per) { q.rank = null; q.take = null; }
      // hours of the clock said and left out ("between 6 pm and 9 pm")
      if (q.of === "incidents" && q.clock_from == null && queries.length === 1) { const c = clockSaid(text) ?? clockSaid(p.understood); if (c) { q.clock_from = c[0]; q.clock_to = c[1]; } }
      // the corporation said, with no department of its own
      if (q.of === "incidents" && !q.depts.length && queries.length === 1 && /\b(?:corporation|gcc)\b|மாநகராட்சி/i.test(text) && !/\bcorporation (?:limits?|area|schools?|hospitals?|zones?|wards?|commissioner|office|buildings?|bus(?:es)?|lorry|lorries|trucks?|parks?|grounds?|workers?|staff)\b/i.test(text) && !negated(text, "corporation|gcc|மாநகராட்சி")
        && (q.by !== "dept" || /\b(?:in|of|within) (?:the )?(?:corporation|gcc)\b|corporation(?:'s)? departments?/i.test(text))) q.depts = w.depts.filter((d) => d.code.startsWith("GCC-")).map((d) => d.code);
      // the whole corporation is its departments; every department, or every zone, is no limit
      if (q.depts.length >= w.depts.length) q.depts = [];
      if (q.zones.length >= w.zones.length) q.zones = [];
      // a department said by its usual name ("the electricity board", "metro water") and left out of the only request
      if (q.of === "incidents" && queries.length === 1 && !q.depts.length && q.by !== "dept") { const d = deptSaid(text, w); if (d && !negated(text, d.alias.replace(/[^a-z0-9\u0B80-\u0BFF ]/g, "")) && ((!q.cats.length && !q.group) || new RegExp(`${d.alias}\\s+(?:department|dept|board)`, "i").test(text) || / board$/.test(d.alias) || /^(?:police|போலீஸ்|காவல்)/.test(d.alias))) { q.depts = [d.code]; q.words = q.words.filter((x) => x.replace(d.alias, " ").replace(/\b(?:cases?|incidents?|complaints?|department|the)\b/g, " ").trim() !== "" && !d.alias.includes(x)); if (d.code === "GCC-ELE") q.cats = []; } }
      // the dead and the injured are counted in every case; a separate limit would only repeat it
      if ((q.measure === "deaths" || q.measure === "injured") && q.harm) q.harm = null;
      // who is a department (never an area), when no area is said
      if (q.of === "incidents" && q.by === "zone" && /\bwho\b|\bwhose\b|யார்|யாரு/i.test(text) && !/\b(?:areas?|zones?|wards?|where|places?|localit\w+)\b|ஏரியா|பகுதி|மண்டல|எங்க/i.test(text) && !q.depts.length) q.by = "dept";
      // one named thing split by its own kind is that thing ("Adyar by zone" is Adyar)
      if ((q.by === "zone" && q.zones.length === 1) || (q.by === "dept" && q.depts.length === 1) || (q.by === "kind" && q.cats.length === 1)) q.by = null;
      // a position, or how many, as the request says it in English
      if (q.by && !q.rank && q.take == null) { const r = both || queries.length > 1 ? null : ordinalAsked(p.understood); if (r && r > 1) q.rank = r; }
      // a position no word asks for ("2 மட்டும்", only two) is how many
      if (q.rank && q.rank > 1 && !ORD_ANY.test(said)) { q.take = q.rank; q.rank = null; }
      // how many, when nobody said it, is no limit; and a time split is shown whole (the answer is its highest, seen in the line)
      if (q.by && q.take != null && q.take > 1 && q.take < 60 && !takeSaid(text, q.take) && !takeSaid(p.understood, q.take)) q.take = null;
      if ((q.by === "hour" || q.by === "weekday" || q.by === "month" || q.by === "day") && q.take === 1) q.take = null;
      if (q.by && !["hour", "weekday", "month", "day"].includes(q.by) && !q.rank && (q.take == null || q.take === 1)) { const k = howMany(p.understood, q.by) ?? (/[a-z]{4}/i.test(text) ? howMany(text, q.by) : null); if (k) q.take = k; else if (q.take === 1 && new RegExp(`\\b(?:${plurals(NOUNS[q.by] ?? "x")})\\b`, "i").test(p.understood) && !/\bone\b/i.test(p.understood)) q.take = null; }
      // one case alone
      if (!q.by && q.of === "incidents" && q.take == null && ["count", "days_open", "latest", "severe"].includes(q.measure) && queries.length === 1 && (ONE_CASE.test(p.understood) || ONE_CASE.test(text))) { q.take = 1; q.list = true; q.measure = "count"; if (/oldest|longest/i.test(said)) q.sort = "oldest"; else if (new RegExp(`latest|newest|most recent|\\b${LAST_OK}`, "i").test(said)) q.sort = "newest"; }
      // which cases have waited longest is the list itself, the oldest first
      if (!q.by && q.list && q.measure === "days_open" && q.sort === "oldest") q.measure = "count";
      // a list cut to a number no word says is the whole list
      if (!q.by && q.take != null && !takeSaid(text, q.take) && !takeSaid(p.understood, q.take)) q.take = null;
      // "police complaints", "garbage complaints" are incidents; the citizen-complaint count only when it is said, or is all that is asked
      const citizens = CITIZEN.test(text) || (CITIZEN.test(p.understood) && /\bpeople\b|\bpublic\b|residents?|citizens?|பேர்|மக்கள்|\bper\b/i.test(text)) || (CITIZEN.test(p.understood) && !!o.last?.queries.some((x) => x.measure === "complaints" || x.from === "citizens"));
      if (q.measure === "complaints" && !citizens && (q.depts.length > 0 || q.cats.length > 0 || !!q.group || q.words.length > 0)) q.measure = "count";
      if (q.from === "citizens" && !citizens) q.from = null;
      // one kind named inside a group taken whole
      if (q.group && queries.length === 1 && !/\b(?:and|or|plus|as well as)\b|,|மற்றும்|&/i.test(said.replace(CLOCK_SPAN, " ").replace(/\b(?:in|of) [^.]*$/i, " "))) {
        const c = catIn(norm(p.understood), { strict: true }) ?? catIn(norm(text), { strict: true });
        if (c && topicCats(q.group as Topic, w.cats).includes(c) && (q.group === "CRIME" ? c !== "CRIME_VIOLENT" && !/\bcrimes?\b(?! against)/i.test(text) : !["FLOOD", "HEALTH"].includes(q.group) && !WHOLE_GROUP.test(said))) { q.group = null; q.cats = [c]; }
        else if (q.group === "CRIME" && /\bwom[ae]n\b|\bgirls?\b|பெண்/i.test(said) && w.cats.some((x) => x.code === "CRIMES_AGAINST_WOMEN")) { q.group = null; q.cats = ["CRIMES_AGAINST_WOMEN"]; q.words = []; }
      }
    }
    // a word that is a kind's own name is that kind, counted as the dashboard counts it (never only the reports that use the word)
    // murders are violent crimes whose report says so: never every death, nor an attempt (run.ts)
    // (an attempt is asked for by name, and தற்கொலை is a suicide)
    if (q.words.some((x) => /\b(?:murder|murders|murdered|homicide)\b(?![\s-]+(?:threat|suicide|bid))|(?<!தற்)கொலை/.test(x)) && !q.words.includes("hacked to death") && !q.cats.includes("SUICIDE_SELF_HARM") && !/attempt|முயற்சி/i.test(`${said} ${q.words.join(" ")}`)) { q.words = ["murder", "homicide", "hacked to death", "stabbed to death", "கொலை"]; if (w.cats.some((c) => c.code === "CRIME_VIOLENT")) { q.cats = ["CRIME_VIOLENT"]; q.group = null; } }
    if (q.words.length) {
      const among = q.group ? topicCats(q.group as Topic, w.cats) : q.cats.length ? q.cats : null;
      const k = kindOfWord(q.words[0], w, among);
      // (a whole kind's name, or a word any case may hold, is no other way of saying something narrower: "robbery" with "theft" and "stolen" beside
      // it counted every theft in one asking and none in the next)
      if (!k) q.words = q.words.filter((x, i) => i === 0 || (!kindOfWord(x, w, null) && !/^(?:stolen|stole|steal|crimes?|cases?|incidents?|complaints?|problems?|issues?|attack(?:ed|s)?|police|arrest(?:ed|s)?|report(?:ed|s)?)$/.test(x)));
      if (k) { q.words = []; q.group = null; q.cats = [k]; }
    }
    // the position asked, whatever the model wrote
    if (both && q.by) { q.take = Math.max(2, q.rank ?? 2); q.rank = null; }
    if (ord && ord > 1 && q.by && queries.length === 1 && !(q.take && q.take > 1)) { q.rank = ord; q.take = null; }
    if (q.rank && q.rank > 1) q.take = null;
    // how many: "top two", "the three worst" (a ranking or a list), never past what was said
    else if (n && queries.length === 1 && q.take == null && (q.by || q.list) && /\b(?:top|only|just|first|last|worst|best|latest|newest|oldest|recent|highest|lowest|any)\b|முதல்|டாப்|மட்டும்/i.test(text)) q.take = n;
    // police said and left out
    if (q.of === "incidents" && !q.depts.length && queries.length === 1 && q.by !== "dept" && POLICE.test(text) && !NOT_POLICE_FILTER.test(text) && !negated(text, "police|cops?|போலீஸ்|போலிஸ்|காவல்") && w.depts.some((d) => d.code === "POL-GCP")) q.depts = ["POL-GCP"];
  }
  // one area said and left out of the only query
  if (queries.length === 1 && !queries[0].zones.length && !queries[0].place && queries[0].by !== "zone") {
    // (a Tamil sentence's area is read in the request's English: "மணல் கடத்தல்" is sand, not Manali)
    const zs = zonesIn(norm(/[\u0B80-\u0BFF]/.test(text) && p.understood ? p.understood : text), w);
    if (zs.length === 1 && !/\b(?:not (?:only|just)|apart from|other than|except|excluding|besides|everywhere but|not in|outside|whole|entire|all (?:of|over)|than)\b|தவிர|முழு/i.test(text)) queries[0].zones = zs;
  }
  // why: the same limits asked three ways, so the answer can say what makes it up (a ready "why" screen knew none of the limits)
  // (a bare reason question only: never "which area has the most, and why", nor one about the screen, "why is it showing five, I asked for two")
  if (bySentence && queries.length === 1 && queries[0].of === "incidents" && WHY_START.test(text) && !/\bshow(?:ing|n)?\b|\byou\b|\bi (?:asked|said|want)|\bwhich\b|\bonly\b|\bjust\b|\binstead\b|காமி|காட்ட|எந்த|கேட்ட|மட்டும்/i.test(text) && !queries[0].rank && !(queries[0].take && queries[0].take > 1) && (!queries[0].by || queries[0].by === "kind" || queries[0].by === "zone" || queries[0].by === "place" || queries[0].by === "day")) {
    const b: Query = { ...queries[0], by: null, per: null, rank: null, take: 5, list: false, measure: ["count", "severe", "overdue", "open", "deaths", "days_to_close", "days_open", "injured", "complaints", "resolved"].includes(queries[0].measure) ? queries[0].measure : "count", before: true };
    const oneKind = b.cats.length === 1 || b.words.length > 0, oneZone = b.zones.length === 1 || !!b.place;
    queries.splice(0, 1, { ...b, by: null, take: null }, ...(oneKind ? [] : [{ ...b, by: "kind" as const }]), { ...b, by: oneZone ? "place" as const : "zone" as const }, ...(oneKind ? [{ ...b, by: "day" as const, take: null }] : []));
  }
  // both ends of one ranking ("the two fastest and the two slowest"): the other end is put in when it was left out, each with its own number
  if (bySentence && queries.length === 2 && JSON.stringify(queries[0]) === JSON.stringify(queries[1])) queries.pop();
  if (bySentence && queries.length === 1 && queries[0].by && !queries[0].per && !queries[0].rank) {
    const k = otherEnd(text) ?? otherEnd(p.understood), q0 = queries[0], split = ["hour", "weekday", "month", "day"].includes(q0.by!);
    const whole = /\b(?:each|every|per|daily|day by day|trend|rank (?:all|the|them)|all the)\b|-wise\b/i.test(text) || (q0.take ?? 0) >= 60 || (split && !/\b(?:which|what) (?:day|hour|month|weekday|time)/i.test(text));
    if (k && !whole) {
      const raw = p.queries[0]?.take ?? null, src = otherEnd(text) ? text : p.understood;
      const many = k.na || k.nb ? 1 : raw && raw > 1 && raw < 60 && !/\bthe two\b/i.test(src) && (takeSaid(text, raw) || takeSaid(p.understood, raw)) ? raw : new RegExp(`\\b(?:${plurals(NOUNS[q0.by!] ?? "x")})\\b`, "i").test(src) && !/\bthe two\b/i.test(src) ? 3 : 1;
      // (top and bottom are no order: the fewest days to close is the top)
      const LOW = /^(?:lowest|least|fewest|minimum|min|quietest|cheapest|least expensive|coldest|coolest|shortest|smallest|driest|fastest|quickest)$/, HIGH = /^(?:highest|most|maximum|max|busiest|costliest|dearest|most expensive|priciest|hottest|warmest|longest|biggest|largest|wettest|slowest)$/;
      const first = LOW.test(k.a) && HIGH.test(k.b) ? q0.order === "least" : HIGH.test(k.a) && LOW.test(k.b) ? q0.order === "most" : !(raw != null && k.nb === raw && k.na !== raw);
      const na = k.na ?? many, nb = k.nb ?? many;
      q0.take = first ? na : nb;
      const flip = q0.measure === "highest" ? "lowest" as const : q0.measure === "lowest" ? "highest" as const : q0.measure;
      queries.push({ ...q0, measure: flip, order: q0.order === "most" ? "least" : "most", take: first ? nb : na });
    }
  }
  // one request twice is one
  const seen = new Set<string>();
  const kept = queries.filter((q) => { const k = JSON.stringify(q); if (seen.has(k)) return false; seen.add(k); return true; });
  return { ...p, understood: clip(p.understood, 300), title: clip(p.title, 90) || clip(text, 90), title_ta: clip(p.title_ta, 120) || clip(p.title, 90), gap: p.kind === "answer" ? gap ?? (bySentence ? null : p.gap) : p.gap ? clip(p.gap, 80).replace(/\s+(?:is|are|isn't|aren't)\s+not\b.*$/i, "") || null : null, queries: kept };
}

/** whether a request says (or carries) a time of its own */
export const ownTime = (q: Query): boolean => !!q.time && ((!!q.time.said && q.time.said !== "now") || !!q.time.from || (q.time.hours ?? 0) > 0);
const KEYS_UP: PeriodKey[] = ["daily", "weekly", "monthly", "quarterly"];
/**
 * The dashboard window a request with no time of its own is counted over: the dashboard's, unless it is a backlog ("which department has the most
 * overdue": 90 days, the last day holds almost none of it), a rise or a fall (the week against the week before), or a split by time.
 */
export function wideKey(q: Query, key: PeriodKey): PeriodKey {
  if (q.of !== "incidents" || ownTime(q) || q.time?.said === "now" || q.older_days) return key;
  const up = (k: PeriodKey) => (KEYS_UP.indexOf(k) > KEYS_UP.indexOf(key) ? k : key);
  if ((!!q.by && (q.measure === "overdue" || q.measure === "open" || q.status === "overdue" || q.status === "open")) || q.measure === "days_to_close" || q.measure === "days_open" || (q.list && q.sort === "oldest")) return "quarterly";
  if (q.by === "hour" || q.by === "weekday" || q.by === "month") return "quarterly";
  if (q.by === "day" || q.before || q.measure === "change") return up("weekly");
  return key;
}
/** the widest window among a plan's requests with no time of their own, so every part of one screen is counted over the same time */
export const planKey = (p: Plan, key: PeriodKey): PeriodKey => p.queries.reduce<PeriodKey>((k, q) => { const x = wideKey(q, key); return KEYS_UP.indexOf(x) > KEYS_UP.indexOf(k) ? x : k; }, key);

/** A plan read back from a screen's slots (a click, Back, a refresh), or null. */
export function planFromSlots(x: unknown): Plan | null {
  const r = KeptPlan.safeParse(x);
  return r.success && r.data.queries.length ? r.data : null;
}

/** a Tamil word a plain follow-up may hold ("ரெண்டாவது எது?", "எல்லாத்தையும் சொல்லு") */
const FOLLOW_TA = /^(?:எல்லா\S*|மட்டும்\S*|அடுத்த\S*|\S*வது\S*|ரெண்டாம்|இரண்டாம்|மூன்றாம்|ஒரு|ஒன்று|ஒண்ணு|இரண்டு|ரெண்டு|மூன்று|மூணு|நான்கு|நாலு|ஐந்து|அஞ்சு|காட்டு\S*|காமி\S*|சொல்\S*|என்ன\S*|எது\S*|எந்த|எங்க\S*|ஏரியா\S*|பகுதி\S*|இடம்|சாலை|ரோடு|அது\S*|இது\S*|அந்த|இந்த|சரி|ஓகே|முதல்|அதிக\S*|பெரிய|ப்ளீஸ்|தயவு|செய்து|லிஸ்ட்|பட்டியல்|முழு\S*|மற்ற\S*|தான்|மேல|கீழ|\d{1,2})$/;
const FOLLOW_WORD = /^(?:ok(?:ay)?|and|now|then|so|please|jarvis|hey|the|a|an|one|ones|me|them|it|its|of|those|these|that|this|what|about|which|who|is|are|was|tell|show|give|list|read|say|all|everything|every|only|just|first|next|last|after|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|seventh|7th|eighth|8th|ninth|9th|tenth|10th|one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2}|areas?|zones?|roads?|streets?|departments?|cases?|items?|highest|worst|most|more|rendu|moonu|naalu|anju|mattum|ellam|ellaam|muzhusa|aduttha|adutha|rendavadhu|moonavadhu|kaattu|sollu|enna|endha)$/;
/**
 * A follow-up code itself can make of the last plan, for a turn no model could plan (busy, no key): "tell me all", "the second", "only two",
 * and a plan whose window alone changes ("what about last week"). Null for anything else.
 */
export function followByCode(text: string, last: Plan | null, w: World | null = null): Plan | null {
  if (!last?.queries.length) return null;
  const t = ` ${text.normalize("NFC").toLowerCase().replace(/[.,!?;:…"“”()]+/g, " ").replace(/\s+/g, " ").trim()} `;
  const words = t.trim().split(" ").length;
  // a sentence that says anything of its own ("only zone 5", "what about 3rd November", "show all police cases in Adyar") is not a plain follow-up
  const tamil = /[\u0B80-\u0BFF]/.test(t);
  const over0 = (f: (q: Query) => Query): Plan => ({ ...last, title: "", title_ta: "", understood: WHOLE_SAID.test(last.understood) ? "the whole district" : "", queries: last.queries.map(f) });
  // "and in Adyar?", "only the severe ones", "what about last month": the same request with that one thing changed, when nothing else is said
  if (w && words <= 8) {
    let left = t;
    const zs = zonesIn(norm(text), w);
    const sev = /\bsevere\b|கடுமை|சிவியர்/i.test(t) ? "Severe" as const : /\bhigh\b/i.test(t) && !/highest/.test(t) ? "High" as const : null;
    const dep = last.queries.every((q) => q.of === "incidents") ? deptSaid(text, w) : null, dept = dep && !negated(text, dep.alias.replace(/[^a-z0-9\u0B80-\u0BFF ]/g, "")) ? dep : null;
    const spec = readPeriod(dateWords(text));
    const timed = spec.kind !== "none" && spec.kind !== "now" && spec.kind !== "unheld" && spec.kind !== "compare";
    if (zs.length === 1) for (const z of w.zones) if (z.n === zs[0]) for (const n of [z.name, z.ta ?? ""]) if (n) left = left.replace(n.toLowerCase(), " ");
    if (dept) left = left.replace(dept.alias, " ").replace(/\b(?:department|dept|board)\b/g, " ");
    if (sev) left = left.replace(/\bsevere\b|\bhigh\b|\bpriority\b|\bseverity\b/g, " ");
    if (timed) left = left.replace(/\b(?:last|past|this|previous|in|over|for|during|on|the|yesterday|today|hours?|days?|weeks?|months?|\d{1,3})\b/g, " ");
    left = left.replace(/\b(?:in|at|for|on|over|of|from|alone|same|too|also)\b/g, " ").replace(/\s+/g, " ").trim();
    // (a department and a place, or "all", is a question of its own)
    const plain = !(dept && (zs.length || / (?:all|every) /.test(t))) && (!left || left.split(" ").every((x) => FOLLOW_WORD.test(x)));
    if (plain && (zs.length === 1 || sev || timed || dept)) return over0((q) => ({ ...q, ...(dept ? { depts: [dept.code], ...(q.by === "dept" ? { by: null, rank: null, take: null } : {}) } : {}), ...(zs.length === 1 ? { zones: zs, place: null, ward: null, ...(q.by === "zone" ? { by: null, rank: null, take: null } : {}) } : {}), ...(sev && q.of === "incidents" ? { sev: [sev] } : {}), ...(timed ? { time: { said: clip(text, 200), from: null, to: null, hours: null } } : {}) }));
  }
  // "2 மட்டும்", "only two", in a sentence of any length (never "மண்டலம் 5 மட்டும்")
  const nOnly = t.match(/(?<!மண்டலம்|மண்டல|வார்டு|ஜோன்|zone|ward) (\d{1,2})\s*(?:மட்டும்|mattum) | (?:only|just) (\d{1,2}) /);
  if (tamil && nOnly && last.queries.some((q) => q.by || q.list)) return over0((q) => ({ ...q, rank: null, take: Math.min(20, Number(nOnly[1] ?? nOnly[2])) }));
  if (/\b(?:zone|ward)\s*\d|மண்டலம் \d|வார்டு \d/.test(t) || t.trim().split(" ").some((x) => !FOLLOW_WORD.test(x) && !FOLLOW_TA.test(x))) return null;
  const over = (f: (q: Query) => Query, title: string): Plan => ({ ...last, title: clip(title || last.title, 90), title_ta: last.title_ta, queries: last.queries.map(f) });
  if (words <= 6 && (/ (?:tell|show|give|list|read)(?: me)? (?:them )?all(?: of (?:them|it))? | all of them | everything | எல்லா\S* | muzhusa | ellaam? /.test(t))) {
    return over((q) => ({ ...q, rank: null, take: 99, ...(q.of === "traffic" && q.by === "zone" ? { by: "road" as const, measure: "delay" as const } : {}) }), "");
  }
  // "the next one?" after the worst, or after the second
  if (words <= 5 && / (?:next|aduttha|adutha|அடுத்த\S*) /.test(t) && last.queries.some((q) => q.by)) return over((q) => (q.by ? { ...q, rank: Math.min(30, (q.rank ?? q.take ?? 1) + 1), take: null } : q), "");
  const ord = words <= 5 ? Object.entries(ORD_EN).find(([w]) => t.includes(` ${w} `))?.[1] ?? ORD_TA.find(([re]) => re.test(t))?.[1] ?? null : null;
  if (ord && last.queries.some((q) => q.by)) return over((q) => (q.by ? { ...q, rank: ord, take: null } : q), "");
  if (nOnly && last.queries.some((q) => q.by || q.list)) return over((q) => ({ ...q, rank: null, take: Math.min(20, Number(nOnly[1] ?? nOnly[2])) }), "");
  const n = words <= 6 && / (?:only|just|மட்டும்|mattum) /.test(t) ? countAsked(text) ?? numberSaid(text) : null;
  if (n && n <= 20 && last.queries.some((q) => q.by || q.list)) return over((q) => ({ ...q, rank: null, take: n }), "");
  return null;
}

const TRAFFIC_W = /congest|\b(?:closed|flooded) roads?\b|\broads? (?:closed|closures?)\b|\bjam(?:s|med|ming)?\b|\btraffic\b|bottleneck|நெரிசல்|போக்குவரத்து|டிராஃபிக்|ட்ராபிக்/i;
const RANK_W = /\b(?:which|what|who|top|most|least|highest|higher|lowest|worst|best|fewest|second|third|fourth|fifth|2nd|3rd|maximum|minimum|rank|more|less|slowest|fastest|longest|busiest|busy|very)\b|எந்த|அதிக|குறைவ|மோசம|வது|டாப்|enna area|endha|athiga|adhiga/i;
const SHOW_W = /\b(?:show|list|give|tell|display|see|what are|read|how many|number of|count|any)\b|காட்டு|சொல்லு|எத்தனை|எவ்வளவு|மட்டும்|kaattu|sollu|evlo|ethana/i;
const THING_W = /\b(?:incident|case|complaint|event|accident|crime|theft|murder|fire|flood|problem|issue|report)s?\b|சம்பவ|புகார்|கேஸ்|வழக்கு|விபத்து|திருட்டு|குற்ற|பிரச்சனை|பிரச்சினை/i;
/** asks for a whole ready screen, a move, a page, a reason, a map: never made a plan by words */
const NOT_PLAIN = /\b(?:summary|summarise|summarize|brief|briefing|concentrate|focus|attention|improv|worsen|getting worse|getting better|why|reason|map|news|headline|page|open the|close (?:it|this|that|the)|go to|draft|remind|email|near|nearby|within|explain|compare|versus|task|tasks|first)\b|சுருக்க|ஏன்|வரைபட|மேப்|செய்தி|ஒப்பி|கவன/i;

/**
 * A plan from the words alone, for a turn when no model could be reached (busy, no key): the same exact shape ("second", "top two", "police
 * only", "last two days"), so a busy AI service never brings back the nearest fixed screen. Null when the words do not plainly name what is
 * counted; every limit the sentence says is put in by checkPlan. The last screen's own words are followByCode's.
 */
export function codePlan(text: string, w: World): Plan | null {
  const t = text.normalize("NFC");
  if (t.trim().split(/\s+/).length < 3 || NOT_PLAIN.test(t)) return null;
  const s = norm(t);
  const traffic = TRAFFIC_W.test(t) && !/\b(?:police|accident|complaint|case|incident|report)s?\b/i.test(t);
  // (a department left out is no filter: checkPlan puts it in what is left out)
  const dept = LEFT_OUT.test(t) ? null : deptSaid(t, w);
  const cat = catIn(s, { strict: true });
  const severe = /\bsevere|serious|critical\b|கடுமை|சிவியர்|தீவிர/i.test(t), high = !severe && /\bhigh[- ](?:priority|severity)\b/i.test(t);
  // a road named ("the delay on Anna Salai")
  const road = traffic || /\bdelay\b/i.test(t) ? t.match(/\bon (?:the )?([A-Z][\w.]*(?: [A-Z][\w.]*){0,3})/)?.[1] ?? null : null;
  // "the worst area for each department": what is ranked inside each
  const eachOf = t.match(/\b(?:for|of|in) (?:each|every) (department|area|zone|kind)/i)?.[1]?.toLowerCase() ?? null, per: Query["per"] = eachOf ? (eachOf === "department" ? "dept" : eachOf === "kind" ? "kind" : "zone") : null;
  const share = /\bshare\b|\bper ?cent(?:age)?\b|\bproportion\b/i.test(t);
  if (!traffic && !road && !per && !(THING_W.test(t) || dept || cat || severe)) return null;
  const by: Query["by"] = traffic ? (/\b(?:area|zone|place)s?\b|ஏரியா|பகுதி|மண்டல/i.test(t) ? "zone" : "road")
    : /\b(?:ward)s?\b(?!\s*\d)/i.test(t) && RANK_W.test(t) ? "ward"
    : /\b(?:area|zone)s?\b|ஏரியா|மண்டல|எந்த பகுதி/i.test(t) && RANK_W.test(t) ? "zone"
    : /\blocalit(?:y|ies)\b|\bplaces?\b/i.test(t) && RANK_W.test(t) ? "place"
    : !dept && (/\bdepartments?\b/i.test(t) || /டிபார்ட்மெண்ட்|துறை/.test(t)) && RANK_W.test(t) ? "dept"
    : /\b(?:which|what) month\b/i.test(t) ? "month"
    : /\b(?:which|what) (?:kind|type)s?\b|\bbiggest problems?\b|\btop \w+ problems?\b/i.test(t) ? "kind"
    : /\b(?:which|what) day\b/i.test(t) ? "day" : /\btime of (?:the )?day\b|\bwhat hour\b/i.test(t) ? "hour" : null;
  if (!by && !SHOW_W.test(t) && !/\bonly\b|\balone\b/i.test(t) && !dept && !severe && !share) return null;
  // a locality that is not itself an area ("Velachery")
  // (nor is a road named beside an incident: "incidents on Anna Salai" was every incident)
  const onRoad = traffic || road ? null : t.match(/\b(?:on|along) (?:the )?((?!(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[A-Z][\w.]*(?: (?:[A-Z][\w.]*|[Rr]oad|[Ss]alai|[Ss]treet|[Hh]ighway)){0,3})/)?.[1] ?? null;
  const pl = placesIn(s, w)[0] ?? onRoad, place = pl && !w.zones.some((z) => z.name.toLowerCase() === pl.toLowerCase()) ? pl : null;
  const least = /\b(?:least|fewest|lowest|smoothest|minimum)\b|குறைவ/i.test(t);
  const measure: Query["measure"] = traffic ? (by === "zone" ? "jams" : "delay") : share ? "share" : /\b(?:longest|slowest|fastest|quickest)\b.{0,20}\b(?:close|resolve|clear|clos|resolv)|\bhow long\b.{0,40}\b(?:close|resolve)/i.test(t) ? "days_to_close" : /\b(?:deaths?|died|dead)\b|இறந்|உயிரிழ/i.test(t) ? "deaths" : /\binjur|காய/i.test(t) ? "injured" : "count";
  const status: Query["status"] = /\boverdue\b|past (?:the |their )?deadline|காலக்கெடு/i.test(t) ? "overdue" : /\b(?:open|pending|unresolved|waiting)\b|நிலுவை/i.test(t) ? "open" : !traffic && /\b(?:resolved|closed)\b|\b(?:did|does|has|have)\b.{0,40}\bclose\b|தீர்க்க/i.test(t) ? "resolved" : null;
  const q: Query = { of: traffic || road ? "traffic" : "incidents", zones: road ? [] : zonesIn(s, w).slice(0, 4), place: road ? null : place, ward: null, taluk: null, depts: dept && !traffic ? [dept.code] : [], not: [], group: !traffic && /\bcrimes?\b|குற்ற/i.test(t) ? "CRIME" : null,
    cats: !traffic && cat && !/\bcrimes?\b/i.test(t) ? [cat] : [], sev: severe ? ["Severe"] : high ? ["High"] : [], status, from: null, harm: null, words: [], item: road, time: null, clock_from: null, clock_to: null, older_days: null, level: traffic && /\bclos(?:ed|ures?)\b/i.test(t) ? "closed" : traffic && /\bflooded\b/i.test(t) ? "flood" : null, measure: road && !traffic ? "delay" : measure, by: road ? "road" : by, per: by && per !== by ? per : null,
    order: least || (measure === "days_to_close" && /\b(?:fastest|quickest)\b/i.test(t)) ? "least" : "most", rank: null, take: null, list: !by, sort: /\b(?:latest|newest|recent)\b/i.test(t) ? "newest" : /\boldest\b|\b(?:waiting|pending|open)\b.{0,20}\blongest\b|\blongest (?:waiting|pending|open)\b/i.test(t) ? "oldest" : "priority", before: false };
  // (no heading of its own: the screen's is code's, from what is counted)
  return { ...checkPlan({ understood: clip(t, 300), kind: "answer", view: null, gap: null, title: "x", title_ta: "x", queries: [q] }, w, t), title: "", title_ta: "" };
}
