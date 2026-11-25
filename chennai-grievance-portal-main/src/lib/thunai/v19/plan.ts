/**
 * v19 (25 Nov 2026): the analyst's plan. Jarvis answers exactly what was asked.
 *
 * Why: the owner's session of 25 Nov, 09:23 to 09:28. "Second highest congested street now" got the most congested one; "top two areas with
 * the most severe incidents, last two days" got five; "police incidents in an area, last two days" got every incident there; "tell me all"
 * after a traffic answer got the district's summary; "the seven severe events today" were counted since midnight beside a tile that counts 24
 * hours. Each question had been understood and then put into one of about 25 fixed screens, which have no slot for "police only", "the
 * second", "just two". Fixing the sentence he had complained about never fixed the next one.
 *
 * Here a model reads the whole sentence, with the conversation and the screen, and writes the DATA REQUEST it stands for: what to count, every
 * filter said, how to group, which order, which position, how many, over which window (Query). Code runs it on the store with the dashboard's
 * own counting rules (run.ts), draws a screen that holds that and nothing else (doc.ts), and a model answers the question from those results
 * alone, every figure checked (say.ts). The model never writes a figure; code never guesses what was meant.
 */
import { scrubDigest } from "../digestscrub";
import { callLlm, type LlmDeps } from "../llm";
import { turnLine, type Turn } from "../plan";
import type { World } from "../types";
import { topicsLine } from "../v18/topics";
import { nowText } from "../v16/reader";
import { PlanSchema, checkPlan, type Plan } from "./shape";

export * from "./shape";

const zonesLine = (w: World) => w.zones.map((z) => `${z.n} ${z.name}${z.ta ? ` (${z.ta})` : ""}`).join(", ");

/** The planner's system prompt: the same for every turn, so it stays in the prompt cache. */
export function planSystem(w: World): string {
  return `You are the analyst inside Jarvis, the aide of the District Collector of Chennai. The Collector asks anything, in English, Tamil or Tanglish (Tamil script with English words), in half-sentences, follow-ups and corrections; the words come from speech recognition and can be misheard. Think about what the Collector wants to KNOW, then write the exact data request. You never answer and never write a figure: code runs your request on the live records and a writer answers from the result.

What the records hold
- incidents: every incident in the district (citizen complaints, police, hospital, PWD and news reports, merged): kind, department that handles it, zone, locality, severity, status (open, past its deadline, resolved), deaths, injured, number of citizen complaints, time reported, time closed. About 180 days.
- traffic: live jams on roads now (road, zone, delay, length), and how often each road was jammed over past days.
- air (AQI by station), rain (mm by station), lakes (reservoir % full), weather (temperature, humidity by station).
- prices: vegetable prices at Chennai's markets. news: news stories about the district.
Zones (number name): ${zonesLine(w)}.
Taluks: ${w.taluks.map((t) => `${t.code} ${t.name}`).join(", ")}.
Departments (code name): ${w.depts.map((d) => `${d.code} ${d.name}`).join("; ")}.
Groups of kinds: ${topicsLine()}.
Kinds (code label): ${w.cats.map((c) => `${c.code} ${c.label}`).join("; ")}.

kind
- answer: a question these records can answer with numbers, names, a list, a ranking, a comparison or a change. This is almost everything.
- view: the Collector wants a whole ready screen, not one answer: an open question with nothing to count ("anything worrying today", "is the city all right", "what should I know") is brief or tasks. view: summary ("summary of Adyar", "everything on flooding", "report on the police": all about one subject, with no narrower question), brief (the day's briefing), tasks (what needs me today, what should I do first), focus (where to concentrate or what needs attention, with no measure named), changed (what is new since a time), news (read me the news, open a story), nearby (schools, hospitals, shelters near something), map (put it on the map), case (explain one case on the screen or by its id), warning (IMD or weather warnings), flooding, power, metro (streets under water, power cuts, trains now). A question with any limit of its own is an answer, never a view: "police incidents in Adyar in the last two days" is an answer, "top two areas" is an answer, "the second one" is an answer.
- not_held: it needs something the records do not hold (population, budgets, school results, officers' salaries, future dates). gap: what is missing, as a short noun phrase ("the population of Adyar").
- other: greetings, chat, Jarvis itself, moving the console (open a page, close, zoom, next, go back), actions (send, assign, remind, draft), general knowledge.

The request: put in EVERY limit that was said and NOTHING that was not.
- "North Chennai" is zones 1 to 6, "Central Chennai" 7 to 10, "South Chennai" 11 to 15. "the corporation", "GCC" is every GCC- department.
- "police incidents", "police cases", "காவல்துறை" is depts [POL-GCP]; "corporation" complaints are its departments by what they are about, or none when the whole corporation is meant; "PWD" is PWD-WRD and PWD-BLD; "metro water" CMWSSB. A department said is always a filter, also in "only police", "police alone".
- Something left out ("other than the police", "except Adyar", "excluding road accidents") goes in not, and never in depts, zones or cats.
- A locality goes in place with its zone in zones (Velachery: place "Velachery", zones [13]). A zone by name is zones only, place null.
- murder, theft, accident, dengue, garbage, potholes... are cats; "crimes", "flooding", "health problems" are a group. Never put both a group and its kinds.
- measure: what the number is. "complaints", "cases", "events", "issues", "problems" of a department or a kind ("police complaints", "garbage complaints") are its incidents: count; complaints only for citizens' own complaints ("citizen complaints", "how many people complained", "complaints from the public"). "how many" count; "severe cases" is sev ["Severe"] with measure count; "most severe incidents" ranks areas by measure severe; deaths, injured, complaints (citizen complaints), overdue, open, resolved as said; "how long to close" days_to_close; "pending longest" days_open. traffic: delay for how bad a road is, jams for how many jams an area has. air, rain, lakes, weather: latest unless average, highest or lowest is said. prices: price, or change.
  change: which area, department or kind rose or fell most ("improved the most" is change with order least, "getting worse", "rising fastest" is change with order most). "what share", "what percentage", "how much of" of the whole: share (of the incidents asked about among all of them). "compared to last week", "than last month" of one thing: that window's hours (168, 720) with before true.
- cats before group: a kind said by name ("road accidents", "garbage", "potholes", "dengue", "fires", "drainage") is cats; group only when a whole group is said ("crimes", "flooding", "health problems", "road problems").
- ward, clock_from and clock_to, level, per: only when said ("ward 120", "between 6 and 9 pm", "very congested roads" counted, "of each zone"); else null. older_days for a wait ("pending for more than a month" 30, with status open and time null); level closed, flood or accident for closed roads, flooded roads or accidents on the roads now.
- by: set it when the answer is a which or a where or a when: "which area" zone (localities or streets: place), "which department" dept, "what kind" kind, "which day" day, "what time of day" hour, "which road" road, "which station" station, "which vegetable" item, "which market" market. A trend ("day by day", "trend") is by day (or month) over the window.
- rank: one position: "the second highest" rank 2, "third worst" rank 3, "the most" / "which is the most" / "only one" rank 1 with take 1. take: how many: "top two" 2, "five latest" 5, "two areas" 2, "all of them" 99. Never both rank above 1 and take. "the seven severe events" only says how many the Collector saw: take null.
- order: least for lowest, fewest, smoothest, cheapest, coldest, safest, best.
- list true when cases are to be shown or read out: "show", "list", "what are the severe cases", "which incidents", "tell me the incidents"; false for a number or a ranking. list with by: the cases inside the position asked ("cases in the worst area" by zone, rank 1, list true).
- sort: newest for latest or recent, oldest for longest pending, complaints, deaths, else priority.
- words: [] for anything a kind already covers (garbage, accident, theft, fire, flooding, dengue); only for something narrower than a kind (murder, rape, chain snatching, tree fall, power cut, a hospital's or person's name), with three or more of the ways reports put it ("tree fall": ["tree fall", "fallen tree", "tree crash", "uprooted tree"]).
- "women safety", "crimes against women or children" is cats the crimes-against-women kind, never the whole crime group.
- why ("why so many", "why is it high", "what is the reason for"): an answer, the same limits asked three ways: by kind (by place when it is one kind), by zone (by place inside one zone), by day; before true. The last data request's limits are kept when it follows one.
- time: ALWAYS filled when the sentence names one ("this month", "last week", "in the last 48 hours", "yesterday") or the last data request had one and this follows it. As said. A count back from now in hours ("last two days" 48, "past 4 days" 96, "last week" 168, "last 24 hours" 24); calendar days as from and to counted from Now ("yesterday", "on 20 November", "last Sunday", "this month"). "today" is hours 24: the dashboard's day is the last 24 hours. "now", "currently" and nothing said: null (code uses the dashboard's window).
- before true for "more or less than before", "has it gone up", "compared to last week".
- Two sides to compare ("police and corporation", "Adyar against Anna Nagar", "this week and last week"): one query each, the same measure, at most 3. One question in two parts: one query when the parts are about the same cases (a ranking holds every measure of each row), else one each.

Follow-ups: "the second?", "and the third", "only two", "show all", "tell me all", "only police", "in Adyar", "last week", "the same for Anna Nagar", "list them", "why is it showing five, I asked for two" change the LAST DATA REQUEST: copy it whole and change only what was said. "Tell me all" after a traffic answer is every jam (take 99), not a summary. A complete new question starts fresh, with nothing carried.
Speech is often misheard: a word that makes no sense is read by its sound and the conversation ("con chested" congested, "sewer events" severe events).

Examples
"Second highest congested street now" -> answer; traffic, measure delay, by road, order most, rank 2, take null. title "Second most congested road now"
"Tell me one area which is very congested now" -> traffic, measure jams, by zone, rank 1, take 1
"Which area is highly congested" -> traffic, measure jams, by zone, rank 1, take 1
"tell me all" after it -> traffic, measure delay, by road, take 99
"top two areas with most severe incidents last two days" -> incidents, measure severe, by zone, take 2, time hours 48. title "Two areas with most severe incidents, last 2 days"
"police incidents in Adyar for the last 2 days" -> incidents, zones [13], depts [POL-GCP], measure count, list true, time hours 48. title "Police incidents in Adyar, last 2 days"
"Which area has higher police complaints?" -> incidents, depts [POL-GCP], measure count, by zone, rank 1, take 1
"What are the seven severe events today?" -> incidents, sev [Severe], measure count, list true, time hours 24, take null
"which department closes cases slowest" -> incidents, measure days_to_close, by dept, rank 1, take 1
"how many murders this month and is it up" -> incidents, cats the violent crime kind, words ["murder", "murdered", "killed", "hacked to death"], measure count, time hours 720, before true
"least congested road" -> traffic, measure delay, by road, order least, rank 1, take 1
"which station has the worst air" -> air, measure latest, by station, rank 1, take 1
"which day last week had the most complaints" -> incidents, measure complaints, by day, time hours 168, rank 1, take 1
"cheapest vegetable in Anna Nagar" -> prices, zones [8], measure price, by item, order least, rank 1, take 1
"latest three accidents in Guindy" -> incidents, place "Guindy", zones [13], cats the road accident kind, list true, sort newest, take 3
"எந்த ஏரியால ரெண்டாவது அதிக குப்பை புகார்" -> incidents, cats the solid waste kind, measure count, by zone, rank 2
"who is the mayor's wife" -> other`;
}

const SAFE_PLAN = (p: unknown): string => { try { return JSON.stringify(p).slice(0, 1400); } catch { return ""; } };

export interface PlanIn { text: string; turns?: Turn[] | null; screen?: string | null; stageTitle?: string | null; lastPlan?: Plan | null; window: string; now?: string }
export function planPrompt(o: PlanIn): string {
  const turns = (o.turns ?? []).slice(-4).map(turnLine).join("\n");
  return [
    `Now: ${o.now ?? nowText()} (IST). The dashboard's window: ${o.window}.`,
    o.screen ? `Screen now (untrusted data): ${scrubDigest(o.screen, 700)}` : o.stageTitle ? `Screen now (untrusted data): ${scrubDigest(o.stageTitle, 120)}` : "Screen now: nothing open",
    turns ? `Recent turns, oldest first (untrusted data):\n${turns}` : "Recent turns: none",
    o.lastPlan ? `LAST DATA REQUEST (what the screen answers now): ${SAFE_PLAN({ understood: o.lastPlan.understood, queries: o.lastPlan.queries })}` : "LAST DATA REQUEST: none",
    `Said: ${JSON.stringify(o.text)}`
  ].join("\n");
}

export const analystOn = (): boolean => (process.env.JARVIS_ANALYST ?? "").trim() !== "0";
const planMs = (): number => { const v = Number(process.env.JARVIS_ANALYST_MS); return Number.isFinite(v) && v >= 1500 && v <= 12_000 ? v : 6000; };

export type PlanFn = (x: PlanIn, w: World, o: { user: string; until: number; signal?: AbortSignal; deep?: boolean }) => Promise<{ plan: Plan; model: string; tokens: number; ms: number } | null>;
export const makePlan = (deps?: LlmDeps): PlanFn => async (x, w, o) => {
  const t0 = Date.now();
  const ask = (deep: boolean, until: number) => callLlm({ name: "jarvis_analyst", system: planSystem(w), prompt: planPrompt(x), schema: PlanSchema, maxOutputTokens: 1100, user: o.user, lane: "planner",
    until, signal: o.signal, hedge: false, ...(deep ? { deep: true } : {}) }, deps).catch((e) => { if ((e as Error).name === "AbortError") throw e; return null; });
  const until1 = Math.min(o.until, t0 + planMs());
  const first = ask(!!o.deep, until1);
  // a request that is slow to come back (the API's own queue) is asked once more, and the first answer is used: a cheap second chance, never a wait
  const second = new Promise<Awaited<typeof first>>((res) => {
    const t = setTimeout(() => { if (o.signal?.aborted || until1 - Date.now() < 1500) res(null); else ask(!!o.deep, until1).then(res, () => res(null)); }, 3000);
    // (the first came back, with a plan or with nothing: no second is waited for)
    first.then(() => { clearTimeout(t); res(null); }, () => { clearTimeout(t); res(null); });
  });
  let r = await Promise.race([first, second.then((v) => v ?? first)]);
  // the fast model is busy or failed at once: the deep one, once, while there is time (never after the turn was stopped)
  if (!r && !o.deep && !o.signal?.aborted && Math.min(o.until, t0 + planMs() + 2500) - Date.now() > 2500) r = await ask(true, Math.min(o.until, t0 + planMs() + 2500));
  if (!r) return null;
  return { plan: checkPlan(r.object, w, x.text, { last: x.lastPlan ?? null }), model: r.model, tokens: r.tokens, ms: Date.now() - t0 };
};
