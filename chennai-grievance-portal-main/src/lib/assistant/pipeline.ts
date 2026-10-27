/**
 * One question, start to finish:
 *
 *   code guard -> router (fast model; rules when no model is available)
 *     -> tools (the console's functions) | query plan -> compiler -> read-only SQL | console action | chart edit
 *     -> facts (code) -> composer (reasoning model) -> number verifier (regenerate once, then a template)
 *     -> chart checker -> answer card -> saved with its plan, audited.
 *
 * At most three model calls per question (router, planner, composer), plus one composer retry
 * when the verifier rejects numbers. When the provider is busy or missing, the answer still
 * comes from the tools, written by a template, and says so.
 */
import { AiBudgetError, AiBusyError, AiUnavailableError, aiStatus, generateJson, type CallInfo } from "@/lib/ai/gateway";
import { routerPrompt, routerSchemas, routerSystem, type AnswerKind } from "@/lib/ai/prompts/router";
import { sidesOf } from "@/lib/assistant/compare";
import { PLANNER_SYSTEM, plannerPrompt } from "@/lib/ai/prompts/planner";
import { ComposerLenient, ComposerSchema, composerPrompt, composerSystem, type ComposerOutput } from "@/lib/ai/prompts/composer";
import { asOf as storeAsOf, contactsFor } from "@/lib/collector/intel";
import { DEPT_CONFIG } from "@/lib/officer/departments";
import { classify } from "@/lib/collector/nlp";
import { audit, collectionStatus } from "@/lib/collector/sources";
import { feedsForAnswer, freshnessLine } from "@/lib/collector/freshness";
import { EXAMPLES, TEXT, detectLanguage, hasTamilScript, requestedCount, wantsNoVisual, wantsTable, wantsVisual, wantsVisualByNature, type Lang, type LangChoice } from "@/lib/assistant/lang";
import { ScopeSchema, describeScope, fmtAsOf, refNames, type RefNames } from "@/lib/assistant/scope";
import { ToolError, listTools, runTool, unknownSubject } from "@/lib/assistant/tools";
import { ENV_METRICS } from "@/lib/assistant/queries";
import { applyTopN, presentAll, spec, type Presentation } from "@/lib/assistant/datasets";
import { correctSpelling } from "@/lib/assistant/spell";
import { holdSync, hybridSearch, lanceWarm } from "@/lib/assistant/lance";
import { multiPart, questionParts } from "@/lib/assistant/parts";
import { warmUp } from "@/lib/assistant/embed";
import { buildFacts, factLines, slug } from "@/lib/assistant/facts";
import { aliasRowIds, contextNumbers, extractNumbers, fillFacts, misboundFacts, mismeasuredFacts, overclaims, pruneUnverified, dedupeCaveats, selfCorrections, verifyNumbers, withoutEchoedNumbers, withoutOverclaims, withoutSelfCorrections, type EntityNames } from "@/lib/assistant/verify";
import { allowedTypes, bestType, checkChart } from "@/lib/assistant/chartspec";
import { codeGuard, offlineRoute } from "@/lib/assistant/guard";
import { directTool } from "@/lib/assistant/direct";
import { loadCatalog, renderCatalog } from "@/lib/assistant/catalog";
import { CompileError, PlanSchema, compileQuery, runCompiled, type QueryPlan, type QueryResult } from "@/lib/assistant/compile";
import { helpFor, isHelpQuestion } from "@/lib/assistant/help";
import { insightByKey } from "@/lib/assistant/insightcards";
import { editFromText, isBareEdit, topNFromText } from "@/lib/assistant/edits";
import { actionCard, baseCard, clarifyCard, errorCard, notYetCard, refusalCard, resetCard, smalltalkCard, templateCard, validActions } from "@/lib/assistant/cards";
import { addMessage, ensureSession, getPin, lastCardWithData, messagePayload, recentTurns } from "@/lib/assistant/store";
import { LIMITS, forModel } from "@/lib/assistant/limits";
import { customWindow, fastPath } from "@/lib/assistant/fastpath";
import { contextForRouter, filtersOf, lastContext, type ConversationContext } from "@/lib/assistant/context";
import { detectIntent, type Detected } from "@/lib/assistant/intent";
import { deptFromWords } from "@/lib/assistant/deptwords";
import { LIST_DATASETS, datasetAnswerCard, datasetNamed, datasetsListCard } from "@/lib/assistant/studiolink";
import { ask as studioAsk } from "@/lib/studio/pipeline";
import { planFromDecision, type Decision } from "@/lib/assistant/decide";
import { agentSchemas, agentSystem, narrowToNamed, onlyNumbersFrom, runAgent, type AgentOutcome } from "@/lib/assistant/agent";
import { PolishSchema, checkPolish, polishPrompt, polishSystem } from "@/lib/assistant/polish";
import { storyArticles } from "@/lib/assistant/news";
import { examplesFor } from "@/lib/assistant/examples";
import type { AnswerCard, ChartSpec, ChartType, ConsoleAction, DataRow, Dataset, Field, Scope } from "@/lib/assistant/answer";
import type { Fact, ToolResult } from "@/lib/assistant/types";
import { orEmpty, orNull } from "@/lib/fallback";
import { NEWS_ASKED, isWarningQuestion, newsLines, warningAnswer, warningCard, warningsNow } from "@/lib/assistant/warnings";

type Row = Record<string, any>;
export type Stage = "understanding" | "fetching" | "drawing";

export interface ChatInput {
  user: string;
  sessionId: string | null;
  message: string;
  inputMode: "text" | "voice";
  language: LangChoice;
  scope: Scope;
  /** the answer a follow-up refers to (the dialog sends its last answer's id) */
  replyTo: string | null;
  /** a pinned answer to run again on the latest data */
  pinId?: number | null;
  /** one of today's insights to open as a card */
  insightKey?: string | null;
  /** a department officer's console: every answer is for this department only (from the database, never the request) */
  lockDept?: string | null;
  signal?: AbortSignal;
  stage: (s: Stage) => void;
}
export interface ChatOutput { card: AnswerCard; sessionId: string; messageId: string }

interface Route {
  /** a name that matched more than one department ("PWD"): what was assumed, shown on the card, and the other choices as chips */
  alt?: { note: string; chips: string[] } | null;
  intent: string;
  language: Lang | null;
  normalized: string;
  scope: Scope;
  /** what the router changed in the scope (a follow-up applies it to the previous answer's scope, not the console's) */
  scopeRaw: Row;
  tools: { name: string; args: Record<string, unknown> }[];
  chartEdit: { type: ChartType | null; showOnMap: boolean } | null;
  actions: Partial<ConsoleAction>[];
  clarify: string | null;
  refusal: string | null;
  assumptions: string[];
  offline: boolean;
  /** the router read the message as asking for a picture (chart, graph, map), in whatever words */
  visual?: boolean;
  /** sent to the query planner in code (a breakdown no tool offers): the tool overrides leave it alone */
  forcedQuery?: boolean;
  /** what kind of answer the router understood (router-v2); absent from the rules */
  decision?: Decision;
}


// -------------------------------------------------------------- agent mode --

/** AI_CHAT_MODE=agent: the model calls tools and reads them before the composer writes (agent.ts); otherwise the router picks one answer kind. */
const agentMode = () => (process.env.AI_CHAT_MODE ?? "").trim().toLowerCase() === "agent";
/** The agent plans with the larger model by default (AI_AGENT_ROLE=fast for the smaller, quicker one). */
const agentRole = (): "fast" | "reasoning" => ((process.env.AI_AGENT_ROLE ?? "").trim() === "fast" ? "fast" : "reasoning");

// ------------------------------------------------------------------ caches --

const cache = new Map<string, { at: number; value: unknown }>();
function cached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > 10 * 60_000) return null;
  return hit.value as T;
}
function remember(key: string, value: unknown) {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
}
const scopeKey = (s: Scope) => `${s.period}|${s.zone ?? ""}|${s.dept ?? ""}|${s.cat ?? ""}|${s.taluk ?? ""}`;

// ------------------------------------------------------------------- route --

const TOOL_ARGS: Record<string, (c: Row, s: Scope) => Record<string, unknown>> = {
  zone_profile: (c, s) => ({ scope: s, zone: c.zone ?? s.zone ?? 1 }),
  change_drivers: (_c, s) => ({ scope: s }),
  incidents: (c, s) => ({ scope: s, sev: c.sev ?? null, status: c.status ?? null, q: c.q ?? null, allTime: !!c.allTime }),
  incident_detail: (c) => ({ id: c.id ?? "" }),
  incident_story: (c, s) => ({ text: c.text ?? c.q ?? c.id ?? "", scope: s }),
  search_records: (c, s) => ({ text: c.text ?? c.q ?? "", scope: s, allTime: !!c.allTime }),
  search: (c) => ({ text: c.text ?? c.q ?? c.place ?? "" }),
  developing_stories: (c, s) => ({ scope: s, place: c.place ?? null }),
  place_breakdown: (c, s) => ({ scope: s, place: c.place ?? null }),
  contacts: (c, s) => ({ dept: c.dept ?? s.dept, zone: c.zone ?? s.zone }),
  environment: (c) => ({ metric: c.metric ?? "aqi", above: c.above ?? null, below: c.below ?? null }),
  mandi_prices: (c) => ({ commodity: c.commodity ?? null, market: c.market ?? null }),
  resolve_place: (c) => ({ text: c.text ?? c.place ?? "" }),
  source_health: () => ({}),
  map_geo: () => ({})
};
const toolArgs = (name: string, c: Row, s: Scope) => (TOOL_ARGS[name] ?? ((_: Row, sc: Scope) => ({ scope: sc })))(c, s);
// ------------------------------------------------------- department lock --

/** Tools that rank every department side by side: not on a department officer's console. */
const ALL_DEPTS = new Set(["departments", "dept_backlog"]);
const OWN_DEPT_NOTE = "Answered for your department only: a department console does not show other departments' figures.";

/**
 * A department officer's tools: each runs with their department as its filter, a ranking of all departments becomes the
 * department's own headline figures, a text search becomes a search of the department's incidents, and contacts are
 * the department's.
 */
function lockTools(tools: { name: string; args: Record<string, unknown> }[], dept: string, base: Scope, notes: string[]) {
  const out: { name: string; args: Record<string, unknown> }[] = [];
  for (const t of tools) {
    const scope = { ...((t.args.scope as Scope | undefined) ?? base), dept };
    if (ALL_DEPTS.has(t.name)) {
      notes.push(OWN_DEPT_NOTE);
      if (!out.some((x) => x.name === "overview_kpis")) out.push({ name: "overview_kpis", args: { scope } });
    } else if (t.name === "search") {
      out.push({ name: "incidents", args: { scope, sev: null, status: null, q: String(t.args.text ?? "").slice(0, 80) || null, allTime: true } });
    } else if (t.name === "contacts") {
      out.push({ ...t, args: { ...t.args, dept } });
    } else {
      out.push(t.args.scope ? { ...t, args: { ...t.args, scope } } : t);
    }
  }
  return out;
}

/** An incident another department handles is not opened from a department console. */
function otherDeptsIncident(r: ToolResult, dept: string): boolean {
  if (r.tool !== "incident_detail" && r.tool !== "incident_story") return false;
  const d = (r.data as Row | null)?.incident?.dept;
  return !!d && d !== dept;
}

/** The planner's query keeps the officer's department: filters and groupings on department columns are dropped, so the scope applies. */
function lockQuery<T extends { filters: { field: string }[]; dimensions: { field: string }[] }>(q: T): T {
  const isDept = (f: string) => /(^|\.)(lead_dept|dept_code|department)$/.test(f);
  return { ...q, filters: q.filters.filter((f) => !isDept(f.field)), dimensions: q.dimensions.filter((d) => !isDept(d.field)) };
}

const NEWS_STOP = new Set(["what", "whats", "happening", "happened", "that", "this", "about", "tell", "there", "which", "where", "when", "with", "from",
  "have", "news", "today", "chennai", "please", "know", "going", "explain", "something", "anything", "event"]);

/**
 * Whether a question the router called out of scope names a story in the last 7 days of district news: two of its own words
 * (or one long one) in a headline the search finds. "Who won the IPL?" names none and stays refused.
 */
export async function inOurNews(message: string, now: string): Promise<boolean> {
  const words = message.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 4 && !NEWS_STOP.has(w));
  if (!words.length) return false;
  const since = Date.parse(now.replace(" ", "T") + "+05:30") / 1000 - 168 * 3600;
  const found = await hybridSearch("news", message, { since }, 5).catch(orNull("pipeline:inOurNews"));
  return !!found?.some((f) => {
    const title = String(f.rec.title ?? "").toLowerCase();
    const hits = words.filter((w) => title.includes(w));
    return hits.length >= 2 || hits.some((w) => w.length >= 8);
  });
}

/** Asks whom to contact: an officer, a phone number or the person in charge (of a department or zone, never of a citizen). */
// (phrases, not single words: "number of accidents" or "not confirmed by an officer" are not contact questions)
export const CONTACT = /\b(contacts?( (of|for|details|number))?|phone (number|no)|helpline|whom to (call|contact)|who (handles|is (the )?(head|officer|incharge|in[- ]charge))|(which|what) (officer|official)s?\b|officers? (handles?|handling|responsible)|who('s| is)? responsible|responsible (officer|official|department|person)|(officers?|officials?|head|in[- ]?charge) (of|for|in)\b)|(?<!\bby (?:an? |the )?)\b(officers?|officials?|contacts?)\s*\??\s*$|தொடர்பு|அதிகாரி/i;

/** The departments a message names, best match first, by the words of their names ("health department" -> every health one). */
export function deptsNamed(message: string, n: RefNames): string[] {
  const said = message.toLowerCase();
  const skip = new Set(["and", "the", "department", "dept", "gcc", "wing", "of", "for", "services", "government", "chennai"]);
  const out: { code: string; score: number; owner: boolean }[] = [];
  for (const [code, d] of n.depts.entries()) {
    const words = `${d.name ?? ""} ${code}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !skip.has(w));
    const score = words.filter((w) => new RegExp(`\\b${w}`).test(said)).length;
    if (score) out.push({ code, score, owner: !!d.actionOwner });
  }
  return out.sort((a, b) => b.score - a.score || Number(b.owner) - Number(a.owner)).map((x) => x.code);
}

/**
 * The department to show contacts for: of those the message names, the first that has officials in the directory (several
 * share a word: "health" names three health departments, and only some of them are in the GCC directory).
 */
async function contactDept(message: string, n: RefNames): Promise<string | null> {
  // the directory files officials under the GCC departments' codes (GCC-HLT "Health Department"), which the incident
  // departments (HLT-DMS ...) do not share: both lists are matched, the directory's first
  const said = message.toLowerCase();
  const skip = /^(and|the|department|dept|gcc|wing|of|for|services)$/;
  const gcc = Object.entries(DEPT_CONFIG)
    .map(([code, c]) => ({ code, score: `${c.portalName ?? ""} ${c.short}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !skip.test(w))
      .filter((w) => new RegExp(`\\b${w}`).test(said)).length }))
    .filter((x) => x.score).sort((a, b) => b.score - a.score).map((x) => x.code);
  const names = [...new Set([...gcc, ...deptsNamed(message, n)])];
  for (const code of names.slice(0, 6)) if ((await contactsFor(code, null).catch(orEmpty("pipeline:contactDept"))).length) return code;
  return names[0] ?? null;
}

/** "reset", "start over", "new chat", "clear the conversation", "forget that": the whole message asks to start again. */
const RESET = /^\s*(reset|restart|start (over|again|afresh|fresh)|new (chat|conversation|topic)|clear( the| this)? (chat|conversation|history|context)|forget (that|everything|it)|மீண்டும் தொடங்கு|புதிதாக தொடங்கு)\s*[.!]?\s*$/i;

/** A question about a period or a count ("any … this week", "how many … today"): what a records search can answer. */
const ASKS_WHEN_OR_HOW_MANY = /\b(how many|any|count|number of|today|yesterday|this (week|month)|last (week|month|\d+ days?)|recent(ly)?|reported)\b|எத்தனை|evlo/i;

/** The turns after the last "reset" answer in the chat (all of them when there was none). */
export function sinceReset<T extends { role?: string; context?: unknown }>(turns: T[]): T[] {
  for (let k = turns.length - 1; k >= 0; k--) {
    const c = turns[k].context as { lastIntent?: string } | null | undefined;
    if (turns[k].role === "assistant" && c?.lastIntent === "reset") return turns.slice(k + 1);
  }
  return turns;
}

/** The period an answer covers when the question names none: the whole quarter, not just the console's last 24 hours. */
export const DEFAULT_PERIOD = "quarterly" as const;
const PERIOD_TEXT = { daily: "last 24 hours", weekly: "last 7 days", monthly: "last 30 days", quarterly: "last 90 days" } as const;

const SMALLTALK = /^\s*(hi|hello|hey|thanks|thank you|thx|good (morning|afternoon|evening|night)|vanakkam|nandri|ok|okay|bye)\b|^\s*(வணக்கம்|நன்றி)/i;
/** the whole message is a greeting, thanks or goodbye (not "hi, how many accidents today?"); "ok" stays with the router */
export const ONLY_SMALLTALK = /^\s*(hi+|hello|hey|thanks|thank you( so much| very much)?|thx|good (morning|afternoon|evening|night)|vanakkam|nandri|bye|goodbye|வணக்கம்|நன்றி)(\s+(sir|madam|mam|there|all|team))?\s*[.!?]*\s*$/i;
/** A message that names a period (a follow-up without one keeps the previous answer's). */
const PERIOD_WORDS = /\b(today'?s?|yesterday|nethu|neththu|daily|day|days|week|weekly|month|monthly|quarter|quarterly|hours?|hrs?|24 ?h|year|since)\b|இன்று|இன்றைய|நேற்று|நேற்றைய|வார|மாத|காலாண்டு|innaiki|indha vaaram|maasam|vaaram/i;
/** The period the question's own words name, or null. */
export function periodFromWords(m: string): Scope["period"] | null {
  // "open for more than 7 days", "pending over 30 days": how long something has been open, not the period asked about
  m = m.replace(/\b(for\s+)?(more than|longer than|older than|beyond)\s+(\d+|seven|thirty|an?|one|two|three)\s+(days?|weeks?|months?)\b|\bfor\s+over\s+(\d+|seven|thirty|an?|one|two|three)\s+(days?|weeks?|months?)\b/gi, " ");
  // "what changed since yesterday": the last day against the day before
  if (/\bsince (yesterday|last night)\b/i.test(m)) return "daily";
  if (/\b(today'?s?|24 ?h(ou)?rs?|last day)\b|இன்று|இன்றைய|innaiki/i.test(m)) return "daily";
  if (/\b(this week|last week|weekly|7 days|seven days|indha week|intha week|pona week)\b|இந்த வாரம்|indha vaaram/i.test(m)) return "weekly";
  if (/\b(this month|last month|monthly|30 days|thirty days)\b|இந்த மாதம்|maasam/i.test(m)) return "monthly";
  if (/\b(quarter|quarterly|90 days|three months)\b|காலாண்டு/i.test(m)) return "quarterly";
  return null;
}
/** "why?", "but why", "reason?", "yen?", "ஏன்?": the whole message asks why, about the previous answer */
const BARE_WHY = /^\s*(but |and |so )?(why|why so|why is that|why is it so|why that|how come|reason|reasons|the reason|what is the reason|what's the reason|what are the reasons|en|yen|yenna reason|ஏன்)\s*[?.!]*\s*$/i;
/**
 * "why did that go up?", "adhu en increase aachu", "why is it so high": a short why that points back at the previous answer
 * and names no new place, period or kind of incident (it once lost the previous answer's week and explained the quarter).
 */
function whyAboutThat(m: string, namesPlace: boolean): boolean {
  if (namesPlace || m.split(/\s+/).length > 8 || PERIOD_WORDS.test(m) || classify(m)) return false;
  // ("en ivlo adhigam", "why so many": "this much" points back too)
  return /\b(why|yen|en|reason|how come)\b|ஏன்/i.test(m) && /\b(it|that|this|these|those|adhu|athu|idhu|ithu|so|ivlo|ivvalavu|evlo|this much|so many|so much)\b|அது|இது|இவ்வளவு/i.test(m);
}
/** prices and readings are the console's own data ("onion price today" was once searched for in the incident records) */
const PRICE_OR_READING = /\b(price|prices|rate|rates|cost|market|mandi|per kg|aqi|air quality|rain|rainfall|lake|lakes|reservoir|beds?|occupancy|temperature|humidity|weather)\b|விலை|மழை|ஏரி/i;
/** "Which zone needs attention now?": now / currently / right now, with no other period, is the last 7 days, not 90. */
const NOW_WORDS = /\b(now|right now|currently|at (the moment|present)|these days|latest situation)\b|இப்போது|ippo/i;

/** A question about one specific incident ("what is this murder case", "tell me about the fire at", "Adyar murder enna aachu"). */
const STORY = /\b(what (is|was|are) (this|that|the)|when (was|did) the|what time (was|did) the|tell me (more )?about|explain|details? (of|about|on)|what happened|story of|about (this|that|the) (case|incident)|update on (the|this|that))\b|enna (aachu|nadandhuchu|nadanthuchu|case)|\b(case|incident|murder|accident|fire|kolai)\s+(enna|yenna|pathi|patthi)\b|என்ன நடந்தது|(வழக்கு|சம்பவம்|கொலை|விபத்து)\s*(என்ன|பற்றி)|பற்றி (சொல்|விளக்கு)/i;
/**
 * "youtuber harish case what happened", "tell me about the Jason Samuel arrest": a story named by words the console has no
 * category or place for. Without a model its words are searched in the records and the news (search_records), never
 * answered with the newest incidents, which it once did: eight unrelated incidents for the YouTuber Harish case.
 */
const STORY_ASK = /\b(what|wat|enna)\b.{0,25}\b(happen\w*|hapen\w*|hapend|aachu|achu|nadandh?\w*|nadanth\w*)|\b(tell me|explain|details?|update)\b.{0,30}\b(case|story|about|on)\b|\b(case|story|issue)\b.{0,30}\b(what|tell|explain|update|enna|brief|summary|summari[sz]e|details?|give)\b|\b(brief|summary|summari[sz]e)\b.{0,30}\b(case|story|issue)\b|என்ன நடந்தது|பற்றி/i;
const ASK_WORDS = /\b(what|wat|happen\w*|hapen\w*|hapend|tell|me|explain|about|the|is|was|this|that|case|story|issue|enna|aachu|achu|nadandh?\w*|nadanth\w*|details?|update|on|of|please|pls|news|regarding|give|brief|summary|summari[sz]e)\b/gi;

const STORY_GENERIC = new Set(["new", "news", "latest", "recent", "recently", "today", "todays", "yesterday", "week", "month", "update", "updates", "happening",
  "going", "issue", "issues", "problem", "problems", "situation", "current", "currently", "now", "hapend", "happend", "hapened", "tell", "explain", "detail", "details"]);

const LIST_REF = /\b(first|second|third|fourth|fifth|last|\d+(st|nd|rd|th)|that one|this one|the one|same one|above|previous|it)\b/i;

/** The words to search for a story question (the question minus its asking words), or null when it is not one. */
export function storySearchText(message: string, n: RefNames): string | null {
  // ("latest news about flooding" names no story: its only unknown word is "news", a word of asking)
  // (a capitalised acronym names a story the console has no word for, "what happened in the SIR protest?", unless it is a department's)
  const deptWords = new Set([...n.depts.entries()].flatMap(([code, d]) => [code.toUpperCase(), ...d.name.toUpperCase().split(/[^A-Z]+/)]));
  const acronyms = (message.match(/\b[A-Z]{2,6}\b/g) ?? []).filter((a) => a !== "INC" && !deptWords.has(a));
  const named = [...unknownSubject(message, n).filter((w) => !STORY_GENERIC.has(w)), ...acronyms];
  // ("tell me about the second one" points at the previous list, and "what did the news say about the rains" asks for news)
  if (!STORY_ASK.test(message) || !named.length || LIST_REF.test(message) || /\bnews\b|செய்தி/i.test(message)) return null;
  const text = message.replace(ASK_WORDS, " ").replace(/[?!.,]+/g, " ").replace(/\s+/g, " ").trim();
  return text.length >= 3 ? text : null;
}

/**
 * The one subject a question names, and the category to narrow to: the subject's only kind ("road accidents"), or the kind its
 * words point to inside a broader subject ("dengue" in Health, "flooding" in Flooding); a broad subject the words do not narrow
 * ("crime", "health") has no category of its own: cat null.
 */
function oneSubject(message: string, n: RefNames): { cat: string | null; part: { label: string; codes: string[] } } | null {
  const ps = questionParts(message);
  if (ps.length !== 1 || !ps[0].codes.length) return null;
  const p = ps[0];
  if (p.codes.length === 1) return n.cats.has(p.codes[0]) ? { cat: p.codes[0], part: p } : null;
  const c = classify(message);
  return { cat: c && c.conf >= 0.6 && p.codes.includes(c.code) && n.cats.has(c.code) ? c.code : null, part: p };
}

/**
 * A question only a query answers: a grouping no console view has (by ward, week by week, by channel or source, by station,
 * hospital or street), a threshold on groups ("wards with more than 10"), or an average or total of a time or score by some
 * grouping. Zone, department and taluk counts stay with the console's own views, which the tools serve exactly.
 */
const QUERY_GROUP = /\b(per|by|each|every|for each|in each)\s+(the\s+)?(ward|channel|source|day|date|week|month|hour|weekday|street|road|locality|station|hospital|market|category|type)s?\b|\b(ward|channel|source|day|week|month|hour)[- ]?wise\b|\b(week|month|day) by (week|month|day)\b|\bweekly trend by\b|\bthrough each\b|\b(channels?|sources?) (of|for)\b/i;
const QUERY_THRESHOLD = /\b(wards?|streets?|localit(y|ies)|stations?|hospitals?|zones?|departments?|days?|weeks?)\b.{0,40}\b(more|fewer|less|over|above|under|at least)\s+than\s+\d+|\b(wards?|streets?|localit(y|ies)|stations?|days?|weeks?)\b.{0,30}\b(with|having)\b.{0,15}\b(over|above|at least|more than)\s+\d+/i;
const QUERY_MEASURE = /\b(average|avg|mean|median|total|sum)\b.{0,40}\b(hours?|days?|time|age|priority|score|delay|duration)\b.{0,40}\b(by|per|each|across|for each|in each)\b/i;
export function needsQuery(message: string): boolean {
  // a department's pace is the resolution-times view ("average time to resolve by department")
  if (/\bby (department|dept)s?\b/i.test(message) && /\b(resol\w*|clos\w*)\b/i.test(message)) return false;
  return QUERY_GROUP.test(message) || QUERY_THRESHOLD.test(message) || QUERY_MEASURE.test(message);
}

const POSITION: Record<string, number> = { first: 1, top:1, "1st": 1, leader: 1, highest: 1, second: 2, "2nd": 2, third: 3, "3rd": 3 };

/** "the first one", "the second": the zone at that place in the previous answer's ranking, in the order it was shown, or null. */
export function zoneAtRank(card: Partial<AnswerCard> | null | undefined, message: string): number | null {
  const m = message.toLowerCase().match(/\b(first|top|1st|leader|highest|second|2nd|third|3rd)\b/);
  if (!m || !card?.datasets?.length) return null;
  const id = card.chart?.dataset ?? card.table ?? card.datasets[0].id;
  const ds = card.datasets.find((d) => d.id === id) ?? card.datasets[0];
  if (!ds.rows.some((r) => r.zone != null)) return null;
  const y = card.chart?.dataset === ds.id ? card.chart.y?.[0] : undefined;
  const rows = y ? [...ds.rows].sort((a, b) => Number(b[y] ?? 0) - Number(a[y] ?? 0)) : ds.rows;
  const z = Number(rows[POSITION[m[1]] - 1]?.zone);
  return Number.isInteger(z) && z >= 1 && z <= 15 ? z : null;
}

async function zoneAtPosition(user: string, sessionId: string, message: string): Promise<number | null> {
  if (!/\b(first|top|1st|leader|highest|second|2nd|third|3rd)\b/i.test(message)) return null;
  const prev = await lastCardWithData(user, sessionId).catch(orNull("pipeline:zoneAtPosition"));
  return zoneAtRank(prev?.payload as Partial<AnswerCard> | undefined, message);
}

/** The locality a question names inside a zone ("Velachery" in Adyar zone), or null for a zone, a taluk asked for, or no place. */
function localityOf(p: Row | null, n: RefNames): string | null {
  if (!p?.place || p.zone == null || p.asked_for_taluk) return null;
  const zoneName = n.zones.get(Number(p.zone))?.name ?? "";
  return String(p.place).toLowerCase() === zoneName.toLowerCase() ? null : String(p.place);
}

function storyRoute(message: string, scope: Scope, n: RefNames): Route | null {
  const text = storySearchText(message, n);
  return text ? { intent: "tool_question", language: null, normalized: message, scope, scopeRaw: {}, tools: [{ name: "search_records", args: { text, scope } }],
    // (the AI writes the story from what was found while it is up; only without it is this the rules' answer)
    chartEdit: null, actions: [], clarify: null, refusal: null, offline: !aiStatus().available,
    assumptions: [`Read as a question about one story: "${text}" was searched in the records and the news.`] } : null;
}

const STORY_THING = /\b(case|incident|murder|killing|killed|accident|crash|fire|blaze|breach|breached|cave-in|damage|damaged|cracks|cracked|theft|robbery|snatching|burglary|collapse|death|died|attack|assault|stabbing|drowning|drowned|missing|explosion|clash|protest)\b|INC-[A-Z0-9]|கொலை|விபத்து|தீ விபத்து|வழக்கு/i;

/**
 * A follow-up that only changes where or when ("only Adyar zone", "what about last month?", "same for Zone 9", "for the whole
 * district"): short, opens like a follow-up, and names no new subject.
 */
function isRefinement(m: string, namesPlace: boolean): boolean {
  if (m.length > 60 || multiPart(m) || STORY.test(m)) return false;
  const lead = /^\s*(only|just|what about|how about|and|same (for|in)|now (for|in|show)|for|in|then|also)\b|^\s*(இப்போ|மட்டும்)|\b(mattum|ku mattum)\s*$/i.test(m);
  const where = namesPlace || /\bzone\s*\d{1,2}\b|whole district|district[- ]wide|all zones|\btaluk\b/i.test(m) || PERIOD_WORDS.test(m);
  const subject = /\b(price|rate|lake|reservoir|hospital|bed|aqi|air|rain|weather|warning|officer|contact|stor(y|ies)|news|briefing)\b/i.test(m);
  return lead && where && !subject;
}

/**
 * Whether the answer is drawn. Asked for ("as a chart", "visualise", "on the map"): always. "In words" / "no chart": never.
 * Otherwise by the question's nature: a ranking ("top 3 worst"), a comparison, a breakdown ("by zone"), a trend, where
 * things are, or several subjects side by side are drawn; one incident's story, a list of records, a single fact or a
 * count are words (and a table for a list). `routerSays`: the router read a picture into other words.
 */
function needsPicture(question: string, results: ToolResult[], routerSays: boolean): boolean {
  if (wantsNoVisual(question)) return false;
  if (wantsVisual(question)) return true;
  const story = results.some((r) => r.tool === "incident_story" || r.tool === "incident_detail");
  const severalParts = (((results.find((r) => r.tool === "category_summary")?.data as Row | undefined)?.parts as Row[] | undefined)?.length ?? 0) >= 2;
  return !story && !wantsTable(question) && (wantsVisualByNature(question) || severalParts || routerSays);
}

/** Tools whose rule match is specific enough to beat the planner. */
const PREFER_TOOL = new Set(["departments", "zones", "dept_backlog", "resolution_times", "verification_queue", "environment", "mandi_prices", "hotspots", "news_gaps",
  "developing_stories", "source_health", "taluks", "incident_series", "place_breakdown"]);

function applyScope(base: Scope, r: Row, n: RefNames): Scope {
  const s: Scope = { ...base };
  if (r.period) s.period = r.period;
  for (const k of (r.clear ?? []) as (keyof Scope)[]) (s as Row)[k] = null;
  if (r.zone != null && n.zones.has(Number(r.zone))) s.zone = Number(r.zone);
  if (r.dept && n.depts.has(r.dept)) s.dept = r.dept;
  if (r.cat && n.cats.has(r.cat)) s.cat = r.cat;
  if (r.taluk && n.taluks.has(r.taluk)) s.taluk = r.taluk;
  return s;
}

function codes(n: RefNames): string {
  const z = [...n.zones.entries()].map(([k, v]) => `${k} ${v.name}`).join(", ");
  const d = [...n.depts.entries()].filter(([, v]) => v.actionOwner).map(([k, v]) => `${k} ${v.name}`).join(", ");
  const c = [...n.cats.entries()].map(([k, v]) => `${k} ${v.label}`).join(", ");
  const t = [...n.taluks.entries()].map(([k, v]) => `${k} ${v.name}${v.note ? ` (${v.note})` : ""}`).join(", ");
  return `Zones: ${z}\nDepartments: ${d}\nCategories: ${c}\nTaluks: ${t}\nMetrics: ${Object.keys(ENV_METRICS).join(", ")}`;
}

/** One line per tool for the router (the full descriptions are for the tools' own documentation): keeps the router's prompt small. */
const BRIEF: Record<string, string> = {
  overview_kpis: "headline figures: severe, open complaints, ongoing, resolved, with the previous period",
  zones: "all zones ranked by attention score (3 x severe + high), with severe, open, open complaints; zone rankings and zone maps",
  zone_profile: "one zone in depth (zone): its rank, top open incidents with reasons, zonal officer",
  change_drivers: "why something is high or changed: the period against the one before, what rose or fell and where, rain, missed deadlines, top open",
  departments: "departments: open, reported, severe, awaiting verification",
  severity: "open incidents by severity, severity mix, top open incidents",
  verification_queue: "citizen complaints awaiting the Collector's verification",
  dept_backlog: "slowest departments by average age of open incidents",
  resolution_times: "how fast incidents are resolved: per department, resolved in the period, average hours/days from report to closing, share within the deadline",
  incidents: "list incidents (sev; status open|awaiting|unverified|verified|critical; q keyword; allTime)",
  incident_detail: "one incident by id (INC-...)",
  incident_story: "explain ONE specific incident described in words (text = the description: 'the murder case in Adyar', 'fire in Guindy yesterday'): what happened, when, status, reports",
  search_records: "find incidents AND news by what they are about, any wording, Tamil or English, typos allowed (text: 'murder in Velachery', 'deaths due to alcohol', 'stray dog attacks'); use when the question names a kind of event that is not one of the Categories, a person, or a detail",
  search: "find zones, departments or incidents by text",
  briefing: "the Collector's briefing for the period",
  dept_followups: "per department: overdue and serious incidents, next steps",
  news_gaps: "incidents in the news with no department record",
  category_trends: "weekly and monthly counts by category",
  taluks: "revenue taluks: open, severe, overdue; 30 days against the 30 before",
  hotspots: "clusters of incidents, for the map",
  place_breakdown: "location-wise: incidents by locality, ward and type in the scope's zone or taluk, or one locality (place), with a map",
  unusual_rises: "days with far more reports than usual (last 21 days)",
  developing_stories: "news stories followed over days (place optional)",
  contacts: "officials for a department (dept) and/or zone (zone), from the GCC directory",
  environment: "latest reading per place for one metric (metric; above/below): air quality, rain, temperature, IMD warning, lakes, hospital beds",
  mandi_prices: "vegetable and fruit prices at Chennai markets (commodity: one or more names, comma-separated; market: only a market the message names, never \"Chennai\"); Koyambedu does not report",
  source_health: "freshness of the data feeds",
  resolve_place: "place name to ward, zone and taluk",
  incident_series: "incidents over time in the scope, with the usual range (trend lines)"
};

function summaryOf(turns: Row[]): string {
  // compact: the last three exchanges, each tool with only the filters it used (the numbered list goes in "Previous answer")
  const set = (o: Row) => Object.entries(o ?? {}).filter(([, v]) => v != null && v !== "" && typeof v !== "object").map(([k, v]) => `${k}=${v}`).join(",");
  return turns.slice(-6).map((t) => {
    if (t.role === "user") return `Collector: ${String(t.content_text ?? "").slice(0, 200)}`;
    const tools = (t.plan?.tools ?? []).map((x: Row) => `${x.name}(${set(x.args?.scope ?? x.args ?? {})})`).join(", ");
    const chart = t.chart ? `${t.chart.type} of ${t.chart.y?.join(",")} in ${t.chart.dataset}` : String(t.display ?? "text");
    return `Assistant: ${String(t.headline ?? "").slice(0, 160)} [intent ${t.plan?.intent ?? "?"}; tools ${tools || "none"}; shown as ${chart}]`;
  }).join("\n");
}

/** The conversation for the composer: who said what, without the router's bookkeeping (a small model copies it into the answer). */
function plainSummary(turns: Row[]): string {
  return turns.slice(-4).map((t) => (t.role === "user" ? `Collector: ${String(t.content_text ?? "").slice(0, 200)}` : `Assistant: ${String(t.headline ?? "").slice(0, 160)}`)).join("\n");
}

async function llmRoute(i: ChatInput, message: string, detected: string, base: Scope, n: RefNames, turns: Row[], place: string, now: string,
  models: CallInfo[]): Promise<Route> {
  const tools = listTools({ llmOnly: true });
  const schemas = routerSchemas(tools.map((t) => t.name) as [string, ...string[]], Object.keys(ENV_METRICS) as [string, ...string[]]);
  const hint = classify(message);
  const category = hint && hint.conf >= 0.6 ? `${hint.code} (${hint.label})` : "";
  // the tool list and codes sit in the system prompt: the same for every question, so read from the prompt cache after the first
  const system = routerSystem(tools.map((t) => `${t.name}(${t.args.join(", ")}): ${BRIEF[t.name] ?? t.description}`).join("\n"), codes(n));
  // the few worked examples closest to this question (dynamic few-shot), in the message so the system prompt stays cacheable
  const examples = await examplesFor(message);
  const r = await generateJson({
    role: "fast", name: "router", schema: schemas.strict, lenient: schemas.lenient, system, temperature: 0, maxOutputTokens: 1400, user: i.user,
    abortSignal: i.signal, chat: true,
    prompt: routerPrompt({ message, detected, scopeLine: describeScope(base, n, "en"), scopeJson: JSON.stringify(base), summary: summaryOf(turns), place, category, asOf: now,
      previous: contextForRouter(lastContext(turns)), examples,
      typed: i.message.replace(/\s+/g, " ").trim() !== message ? i.message.replace(/\s+/g, " ").trim().slice(0, LIMITS.messageChars) : undefined })
  });
  models.push(r.info);
  const o = r.object;
  const scope = applyScope(base, o.scope, n);
  // a small model sometimes fills in a zone or taluk nobody named ("Top five departments" read as Zone 1): keep one only
  // when the message, the resolved place or the conversation names it
  const placed = place ? (JSON.parse(place) as Row) : null;
  // the conversation counts only for a follow-up, or a question that points back ("there", "same zone"); a new question
  // does not inherit the last answer's zone
  // ("which one is most serious" after a list of Adyar's floods once lost Adyar: "which one", "these", "them" point back too)
  const backRef = o.intent === "plan_edit" || /\b(there|that (zone|area|place|taluk)|same (zone|area|place|taluk)|this (zone|area)|over there|which (one|of (these|them|those))|among (these|them|those)|of (these|them|those)|these|those)\b|அங்கே|அங்கு|anga\b|ithula|idhula|adhula|athula/i.test(message);
  const talk = `${message} ${backRef ? turns.slice(-4).map((t) => `${t.content_text ?? ""} ${JSON.stringify(t.plan?.tools ?? [])}`).join(" ") : ""}`.toLowerCase();
  if (scope.zone != null && scope.zone !== base.zone) {
    const z = n.zones.get(scope.zone);
    const named = new RegExp(`\\bzone\\s*-?\\s*0?${scope.zone}\\b|மண்டலம்\\s*${scope.zone}\\b|"zone":${scope.zone}\\b`, "i").test(talk)
      || (!!z?.name && talk.includes(z.name.toLowerCase())) || (!!z?.nameTa && talk.includes(z.nameTa)) || Number(placed?.zone) === scope.zone;
    if (!named) { o.assumptions.push(`Zone ${scope.zone} was not named in the question, so the answer covers ${base.zone ? `Zone ${base.zone}` : "the whole district"}.`); scope.zone = base.zone; o.scope.zone = null; }
  }
  // a window in the question's own words ("last 10 days"): the lists and counts use it exactly; tools that only know the
  // console's periods use the smallest one that holds it, and say so
  let deptAlt: Route["alt"] = null;
  const cw = customWindow(message);
  if (cw) {
    if (scope.period !== cw.period) o.assumptions.push(`The ${cw.label}: figures from tools that only know fixed periods cover the ${PERIOD_TEXT[cw.period]}.`);
    scope.period = cw.period;
    o.scope.period = cw.period;
    // "yesterday": the previous day's window, for the tools as for the lists
    if (cw.offset) scope.offset = cw.offset;
  }
  // a period only when the message (or, for a follow-up, the conversation) names one: a worked example's "this week" is not the Collector's
  else if (scope.period !== base.period && !PERIOD_WORDS.test(talk)) {
    o.assumptions.push(`No period was named, so the answer covers the ${base.period === "quarterly" ? "last 90 days" : "console's period"}.`);
    scope.period = base.period;
    o.scope.period = null;
  }
  if (scope.taluk && scope.taluk !== base.taluk) {
    const t = n.taluks.get(scope.taluk);
    const named = talk.includes(scope.taluk.toLowerCase()) || (!!t?.name && talk.includes(t.name.toLowerCase())) || (!!t?.nameTa && talk.includes(t.nameTa))
      || placed?.taluk === scope.taluk || (placed?.taluk_named as Row | null)?.code === scope.taluk;
    if (!named) { scope.taluk = base.taluk; o.scope.taluk = null; }
    // a follow-up that names another place ("and in Anna Nagar?") leaves the previous answer's taluk behind, unless it names that taluk
    else if (placed && placed.taluk !== scope.taluk && !(placed.taluk_named as Row | null)?.code
      && !(t?.name && message.toLowerCase().includes(t.name.toLowerCase())) && !message.toLowerCase().includes(scope.taluk.toLowerCase())) {
      scope.taluk = base.taluk; o.scope.taluk = null;
    }
  }
  // a department filter only when the question (or, for a follow-up, the conversation) names it: "public infrastructure
  // complaints" is not "Parks & Play Fields"
  if (scope.dept && scope.dept !== base.dept) {
    const d = n.depts.get(scope.dept);
    const words = `${d?.name ?? ""} ${scope.dept}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !["and", "the", "department", "dept", "gcc", "wing"].includes(w));
    if (!words.some((w) => new RegExp(`\\b${w}`, "i").test(talk))) { scope.dept = base.dept; o.scope.dept = null; }
    else {
      // "PWD" names two departments (Buildings, Water Resources): the card says which one it covers and offers the other
      const hit = words.find((w) => new RegExp(`\\b${w}`, "i").test(talk))!;
      const siblings = [...n.depts.entries()].filter(([k, v]) => k !== scope.dept && v.actionOwner && `${v.name} ${k}`.toLowerCase().includes(hit));
      const own = words.filter((w) => w !== hit && !siblings.some(([, v]) => v.name.toLowerCase().includes(w)));
      if (siblings.length && !own.some((w) => new RegExp(`\\b${w}`, "i").test(talk)))
        deptAlt = { note: `"${hit.toUpperCase()}" can mean ${[d?.name, ...siblings.map(([, v]) => v.name)].join(" or ")}: this covers ${d?.name}.`,
          chips: siblings.slice(0, 2).map(([, v]) => message.replace(new RegExp(`\\b${hit}\\b`, "i"), v.name)) };
    }
  }
  // a department the message names by its usual short name, when the router left the filter empty ("PWD pending works list")
  if (!scope.dept && !base.dept && (o.intent === "tool_question" || o.intent === "plan_edit")) {
    const named = deptFromWords(message, n);
    if (named) {
      scope.dept = named.code;
      o.scope.dept = named.code;
      if (named.alt) deptAlt = named.alt;
    }
  }
  // A category the question names must narrow the data, or the answer would claim it without covering it.
  // ("compare crime and flooding" compares categories: no narrowing; "compare Velachery and Adyar for flooding" compares places: narrowed)
  const comparesKinds = /\b(vs\.?|versus|compare)/i.test(message) && !placed;
  if (!scope.cat && category && hint && o.intent === "tool_question" && !/\b(categor|by type|each type)/i.test(message) && !comparesKinds) {
    scope.cat = hint.code;
    o.assumptions.push(`Narrowed to ${hint.label} (named in the question).`);
  }
  return {
    intent: o.intent, language: o.language, normalized: o.normalizedQuestion || message, scope, scopeRaw: o.scope,
    tools: o.tools.slice(0, LIMITS.queriesPerQuestion).map((c) => ({ name: c.name, args: toolArgs(c.name, c, scope) })),
    chartEdit: o.chartEdit, actions: o.consoleActions, clarify: o.needsClarification ? o.clarificationQuestion : null, refusal: o.refusalReason,
    assumptions: o.assumptions, offline: false, visual: o.visual, alt: deptAlt,
    decision: {
      answer: o.answer, incidentId: o.refIncidentId?.trim().toUpperCase() || null, storyId: o.refStoryId?.trim() || null,
      // query rewriting: the description and its translation, searched together (meaning and keywords in both languages)
      find: [o.find?.trim(), o.findAlt?.trim()].filter(Boolean).join(" / ") || null,
      count: o.count != null && o.count >= 1 && o.count <= 20 ? Math.round(o.count) : null, focus: o.focus, openOnly: o.openOnly, overdueOnly: o.overdueOnly, severity: o.severity,
      options: o.clarifyOptions.map((x) => x.trim()).filter(Boolean).slice(0, 3)
    }
  };
}


/**
 * A locality the resolver placed (Velachery: zone 13, Velachery taluk) narrows the tools' scope, and a keyword that only
 * repeats its name is dropped. The taluk is added unless its code is known to be missing from some sources (its note).
 */
function placeAsScope(route: Route, p: Row, n: RefNames): Route {
  const name = String(p.place ?? "").toLowerCase();
  const named = p.taluk_named as Row | null;
  const askedTaluk = p.asked_for_taluk && named?.code && n.taluks.has(named.code) ? String(named.code) : null;
  let moved = false;
  let matched: string | null = null;
  const tools = route.tools.map((t) => {
    const s = t.args.scope as Scope | undefined;
    // a location-wise view of a locality: its zone, and the locality matched by place name (a taluk would be wider than the locality)
    if (t.name === "place_breakdown" && s && !askedTaluk && p.zone != null && (s.zone == null || s.zone === Number(p.zone))) {
      const zoneName = n.zones.get(Number(p.zone))?.name?.toLowerCase() ?? "";
      const place = (t.args.place as string | null) ?? (name && name !== zoneName ? String(p.place) : null);
      if (s.zone === Number(p.zone) && !s.taluk && place === t.args.place) return t;
      moved = true;
      if (place) matched = place;
      return { ...t, args: { ...t.args, place, scope: { ...s, zone: Number(p.zone), taluk: null } } };
    }
    // rankings across zones or taluks, and a zone's own profile, are not narrowed
    if (!s || s.zone != null || s.taluk || ["zones", "taluks", "zone_profile"].includes(t.name) || (!askedTaluk && p.zone == null)) return t;
    const q = typeof t.args.q === "string" ? t.args.q : null;
    const sameAsPlace = !!q && !!name && (q.toLowerCase().includes(name) || name.includes(q.toLowerCase()));
    moved = true;
    // "Kolathur taluk": the taluk the text names, not the locality's zone
    if (askedTaluk) return { ...t, args: { ...t.args, ...(sameAsPlace ? { q: null } : {}), scope: { ...s, zone: null, taluk: askedTaluk } } };
    // "Kolathur" is a locality (in Ayanavaram taluk) and a taluk of its own: naming another taluk than the locality's would mislead
    const otherTalukNamed = !!named && named.code !== p.taluk;
    const taluk = p.taluk && !otherTalukNamed && n.taluks.has(p.taluk) && !n.taluks.get(p.taluk)?.note ? String(p.taluk) : null;
    return { ...t, args: { ...t.args, ...(sameAsPlace ? { q: null } : {}), scope: { ...s, zone: Number(p.zone), taluk } } };
  });
  if (!moved) return route;
  const s = tools.find((t) => t.args.scope)?.args.scope as Scope;
  const note = askedTaluk ? `${named!.name} taluk.${named!.note ? ` ${named!.note}.` : ""}`
    : matched ? `${matched}: incidents whose place names it, within ${n.zones.get(Number(p.zone))?.name ?? `Zone ${p.zone}`} zone.`
      : `${p.place} read as its zone${s.taluk ? " and taluk" : ""}.`;
  return { ...route, tools, scope: s, assumptions: [...route.assumptions, note,
    ...(!askedTaluk && named && named.code !== p.taluk ? [`${named.name} is also a revenue taluk${named.note ? ` (${named.note})` : ""}; ask for "${named.name} taluk" to see it.`] : [])] };
}

function rulesRoute(message: string, base: Scope, n: RefNames, hasPlace = false, place: Row | null = null): Route {
  const o = offlineRoute(message, n);
  // "what is happening in Velachery": the place's own summary (its zone's snapshot, or the locality's breakdown), not district totals
  if (hasPlace && place?.zone != null && o.intent === "tool_question" && o.tools[0]?.name === "overview_kpis" && !/how many|evlo|count|number of|எத்தனை/i.test(message)) {
    const zoneName = n.zones.get(Number(place.zone))?.name ?? "";
    o.tools = String(place.place ?? "").toLowerCase() === zoneName.toLowerCase() ? [{ name: "zone_profile", args: { zone: Number(place.zone) } }] : [{ name: "place_breakdown", args: {} }];
  }
  const scope: Scope = o.period ? { ...base, period: o.period } : { ...base };
  // "yesterday": the previous day's window, for these tools as for the lists
  if (/\b(yesterday|nethu|neththu)\b|நேற்று/i.test(message) && !/\b(since|from) yesterday\b/i.test(message)) (scope.period = "daily", scope.offset = 1);
  const zn = Number(message.match(/\bzone\s*-?\s*(\d{1,2})\b/i)?.[1]);
  if (zn && n.zones.has(zn)) scope.zone = zn;
  // a category named in the question ("road accident trend"), by the console's own keyword classifier
  const cat = classify(message);
  if (cat && cat.conf >= 0.6 && n.cats.has(cat.code)) scope.cat = cat.code;
  // no rule matched, but the question names a category or a place ("Velachery la indha week evlo accidents?"): its incidents
  // ("Adyar incidents" with no count asked: where they are, location-wise)
  if (o.intent === "unknown" && (scope.cat !== base.cat || hasPlace)) {
    o.intent = "tool_question";
    const count = /how many|evlo|evvalo|evvalavu|count|number of|\blist\b|எத்தனை|எவ்வளவு/i.test(message);
    o.tools = [{ name: /trend|over time|per day|graph|chart/i.test(message) ? "incident_series" : hasPlace && !count ? "place_breakdown" : "incidents", args: {} }];
  }
  // "earthquakes this week", "any building fire in Adyar today?": no rule names it, but it asks about something that happens in a
  // period: the records are searched for its words, and "none recorded" is said plainly when nothing matches
  if (o.intent === "unknown" && /[a-z\u0B80-\u0BFF]{4,}/i.test(message) && (o.period || /\b(how many|any|count|number of|recorded|reported)\b|எத்தனை/i.test(message))) {
    o.intent = "tool_question";
    o.tools = [{ name: "search_records", args: { text: message } }];
  }
  return {
    intent: o.intent === "unknown" ? "unknown" : o.intent, language: null, normalized: message, scope, scopeRaw: {},
    tools: o.tools.map((t) => ({ name: t.name, args: { ...toolArgs(t.name, t.args, scope), ...t.args, ...(TOOL_ARGS[t.name] ? {} : { scope }) } })),
    chartEdit: null, actions: o.actions as Partial<ConsoleAction>[], clarify: null, refusal: null, assumptions: [], offline: true
  };
}

// ------------------------------------------------------------------ prompts --

/** Datasets as compact text for the composer: fields, then up to 12 rows as CSV for the data drawn, 5 for the rest (tokens). */
function datasetsText(datasets: Dataset[], focus: (string | null | undefined)[] = []): string {
  return datasets.map((d) => {
    const cols = d.fields.filter((f) => f.kind !== "geo");
    const { rows } = forModel(d.rows.slice(0, !focus.some(Boolean) || focus.includes(d.id) ? 12 : 5));
    const csv = rows.map((r) => cols.map((f) => String(r[f.key] ?? "").replace(/[,\n]/g, " ").slice(0, 90)).join(",")).join("\n");
    const head = `${d.id}: ${d.title} (${d.rows.length} rows${d.total != null && d.total !== d.rows.length ? ` of ${d.total}` : ""})`
      + `${d.normal ? `; usual range ${d.normal.lo}-${d.normal.hi}` : ""}`;
    return `${head}\nfields: ${cols.map((f) => `${f.key}[${f.kind}${f.unit ? `, ${f.unit}` : ""}]`).join(", ")}\n${cols.map((f) => f.key).join(",")}\n${csv}`;
  }).join("\n\n");
}

/** Facts worth showing the composer: headline figures first, then the chart's dataset, within a budget. */
function promptFacts(facts: Fact[], p: Presentation): Fact[] {
  const key = p.chart?.dataset;
  const score = (f: Fact) => /^(kpi|briefing|tasks|gaps|list|series\.(total|max|min|mean|normal|above)|env\.(warning|places|matching)|stories\.count|feeds|contacts\.count|scope)/.test(f.id) ? 0
    : key && f.id.startsWith(`${key}.`) && !/\.(rank|share)$/.test(f.id) ? 1 : key && f.id.startsWith(`${key}.`) ? 2 : /\.(total|max|min|lead|avg|change_pct)$/.test(f.id) ? 3 : 4;
  // "rows shown on the card" is layout, not a count of anything: kept for the verifier, not offered to the composer
  return [...facts].filter((f) => !/\.rows$/.test(f.id)).sort((a, b) => score(a) - score(b)).slice(0, 60);
}

function allowedActionsText(p: Presentation, results: ToolResult[], answerPeriod: string | null, consolePeriod: string): string {
  const ids = results.flatMap((r) => r.incidentIds).slice(0, 12);
  // setting the console's period only makes sense when the answer covers another period than the console shows
  // no page redirects from the chat (the Briefing page): the answer itself is the briefing
  const parts = [...(answerPeriod && answerPeriod !== consolePeriod ? [`set_period(${answerPeriod})`] : [])];
  for (const d of p.datasets) {
    if (d.drill?.action === "filter_zone") parts.push("filter_zone(zone 1-15 from DATASETS)");
    if (d.drill?.action === "filter_dept") parts.push("filter_dept(dept code from DATASETS)");
    if (d.drill?.action === "filter_taluk") parts.push("filter_taluk(taluk code from DATASETS)");
  }
  if (ids.length) parts.push(`open_incident(id one of ${ids.join(", ")})`);
  if (results.some((r) => r.tool === "developing_stories")) parts.push("open_story");
  return [...new Set(parts)].join("; ");
}

// ----------------------------------------------------------------- ad hoc --

const TABLE_HINTS: [RegExp, string[]][] = [
  [/news|outlet|headline|media|article/i, ["documents", "gaps"]],
  [/police|complaint|grievance|pwd|hospital|source|channel|response|respond/i, ["events"]],
  [/rain|aqi|air|lake|reservoir|bed|hospital|temperature|humid|gauge|inflow|weather/i, ["observations", "observation_signals"]],
  [/daily|per day|trend|history|baseline|usual/i, ["daily_counts"]],
  [/spike|unusual|anomal|rise/i, ["anomalies"]],
  [/hotspot|cluster/i, ["hotspots"]],
  [/alert|warning/i, ["alerts"]],
  [/work|budget|sanction|spend|progress|contract/i, ["pwd_works"]],
  [/festival|protest|rain day|calendar/i, ["world_calendar"]],
  [/price|mandi|market|tomato|onion|potato|vegetable/i, ["mandi_market_prices", "mandi_prices", "mandi_weekly"]],
  [/official|officer|contact|commissioner/i, ["official_contacts"]],
  [/task|action|step/i, ["actions"]],
  [/ward/i, ["ref_wards"]],
  [/facility|station|hospital/i, ["ref_facilities"]],
  [/review|queue|quality/i, ["review_queue", "data_quality"]],
  [/source|feed|fresh/i, ["source_health", "sources"]]
];
function tablesFor(q: string): string[] {
  const out = new Set(["incidents", "ref_departments", "ref_zones", "ref_taluks", "ref_categories"]);
  for (const [re, ts] of TABLE_HINTS) if (re.test(q)) ts.forEach((t) => out.add(t));
  return [...out];
}

function resultDataset(r: QueryResult): Dataset {
  const c = r.compiled;
  const fields: Field[] = [
    // readable names: "Ward" (its rows read "Ward 85"), "Incidents" for a count of incidents ("85 leads with 17 count" once headed an answer)
    ...c.dims.map((d) => ({ key: d.alias, label: d.col.name === "ward_no" ? "Ward" : d.col.d, kind: d.time ? ("time" as const) : ("category" as const) })),
    ...c.measures.map((m) => ({ key: m.alias, label: m.col ? `${m.fn} of ${m.col.d}` : c.table.name === "incidents" ? "Incidents" : c.table.name === "events" ? "Records" : "Count",
      kind: "value" as const, unit: m.col?.unit ?? null,
      format: m.fn === "avg" ? ("decimal1" as const) : ("integer" as const) })),
    ...c.measures.filter(() => !!c.previous).map((m) => ({ key: `${m.alias}_prev`, label: `${m.alias}, previous period`, kind: "value" as const, format: "integer" as const }))
  ];
  if (c.records) for (const k of Object.keys(r.rows[0] ?? {})) if (!fields.some((f) => f.key === k)) fields.push({ key: k, label: k, kind: "text" });
  const zoneDim = c.dims.find((d) => d.col.name === "zone_no");
  // a readable title: "daily_ward_counts" -> "Weekly ward counts" once the days were re-grouped by week
  const td = c.dims.find((d) => d.time);
  let title = r.purpose.includes(" ") ? r.purpose : r.purpose.replace(/_/g, " ");
  if (td?.grain === "week" || td?.grain === "month") title = title.replace(/\b(daily|per day|by day)\b/i, (m) => /daily/i.test(m) ? `${td.grain}ly` : `by ${td.grain}`);
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return {
    id: r.id, title, fields: zoneDim ? [...fields, { key: "zone", label: "Zone", kind: "id" }] : fields,
    rows: r.rows.map((x) => ({ ...(x as DataRow), ...notRecorded(c.dims, x), ...(zoneDim ? { zone: Number(x[zoneDim.alias]) } : {}),
      ...Object.fromEntries(c.dims.filter((d) => d.col.name === "ward_no" && x[d.alias] != null).map((d) => [d.alias, `Ward ${x[d.alias]}`])) })), total: r.total, hasPrev: !!c.previous,
    drill: zoneDim ? { field: "zone", action: "filter_zone" } : null
  };
}

function adhocChart(plan: QueryPlan, ds: Dataset): ChartSpec | null {
  const x = ds.fields.find((f) => f.kind === "category" || f.kind === "time");
  const y = ds.fields.find((f) => f.kind === "value" && !f.key.endsWith("_prev"));
  if (!y) return null;
  const time = ds.fields.find((f) => f.kind === "time");
  const cat = ds.fields.find((f) => f.kind === "category");
  const t: ChartType = plan.chartIntent === "trend" || time ? "line" : plan.chartIntent === "composition" && ds.rows.length <= 6 ? "donut"
    : plan.chartIntent === "geo" && ds.fields.some((f) => f.key === "zone") ? "map_zones" : ds.rows.length <= 1 ? "kpi" : "horizontal_bar";
  if (t === "kpi") return null;
  if (time && cat) return spec({ type: ds.rows.length > 60 ? "heatmap" : "line", dataset: ds.id, x: time.key, series: cat.key, y: [y.key], sort: "none", highlight: "last", title: ds.title });
  return spec({ type: t, dataset: ds.id, x: (time ?? x)?.key ?? null, y: [y.key], compare: ds.hasPrev === true, sort: time ? "none" : "desc", highlight: time ? "last" : "max", title: ds.title });
}

/** A group with no value (an incident with no ward) is labelled, not shown as "null". */
function notRecorded(dims: QueryResult["compiled"]["dims"], x: Record<string, unknown>): DataRow {
  return Object.fromEntries(dims.filter((d) => !d.time && x[d.alias] == null).map((d) => [d.alias, "Not recorded"]));
}

function adhocFacts(results: QueryResult[]): Fact[] {
  const out: Fact[] = [];
  for (const r of results) {
    const dims = r.compiled.dims;
    for (const row of r.rows.slice(0, 60)) {
      const key = dims.map((d) => slug(String(row[d.alias]))).join(".") || "all";
      const label = dims.map((d) => d.time ? `${d.grain && d.grain !== "day" ? `${d.grain} of ` : ""}${String(row[d.alias]).slice(0, 10)}`
        : `${d.col.d} ${row[d.alias] ?? "not recorded"}`).join(", ") || r.purpose;
      for (const m of r.compiled.measures) {
        const what = m.col ? `${m.fn} of ${m.col.d}` : "Count";
        const v = Number(row[m.alias]);
        if (Number.isFinite(v)) out.push({ id: `${r.id}.${key}.${m.alias}`, label: `${what}, ${label}`, value: Math.round(v * 100) / 100 });
        const p = Number(row[`${m.alias}_prev`]);
        if (Number.isFinite(p) && row[`${m.alias}_prev`] != null) out.push({ id: `${r.id}.${key}.${m.alias}.prev`, label: `${what}, ${label}, previous period`, value: p });
      }
    }
    out.push({ id: `${r.id}.groups`, label: `${r.purpose}: groups or records in all`, value: r.total });
  }
  return out;
}

/** The period an ad-hoc query covers, from its own time range ("Since 1 Jul 2026"), for the card's scope line. */
function adhocPeriod(plan: QueryPlan, lang: Lang): string | null {
  const tr = plan.queries[0]?.timeRange;
  if (!tr) return null;
  const d = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00+05:30`).toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN",
    { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const UNIT_TA: Record<string, string> = { hour: "மணி நேரம்", day: "நாட்கள்", week: "வாரங்கள்", month: "மாதங்கள்" };
  if (tr.mode === "all") return { en: "All dates", ta: "எல்லா தேதிகளும்", tanglish: "Ella dates-um" }[lang];
  if (tr.mode === "relative" && tr.last && tr.unit) return { en: `Last ${tr.last} ${tr.unit}${tr.last > 1 ? "s" : ""}`, ta: `கடந்த ${tr.last} ${UNIT_TA[tr.unit]}`,
    tanglish: `Last ${tr.last} ${tr.unit}${tr.last > 1 ? "s" : ""}` }[lang];
  if (tr.mode === "since" && tr.from) return { en: `Since ${d(tr.from)}`, ta: `${d(tr.from)} முதல்`, tanglish: `${d(tr.from)} la irundhu` }[lang];
  if (tr.mode === "between" && tr.from && tr.to) return { en: `${d(tr.from)} to ${d(tr.to)}`, ta: `${d(tr.from)} – ${d(tr.to)}`, tanglish: `${d(tr.from)} – ${d(tr.to)}` }[lang];
  return null;
}

// ------------------------------------------------------------ corrections --

/** What a correction to the router's reading can see: the question, the conversation, the place it names. */
interface FixCtx {
  i: ChatInput;
  message: string;
  names: RefNames;
  now: string;
  placeData: Row | null;
  turns: Row[];
  ctx: ConversationContext | null;
  exact: Detected;
  guard: Awaited<ReturnType<typeof codeGuard>>;
  notes: string[];
  /** a typed question (not a pinned chart re-run or an insight opened from the console) */
  typed: boolean;
  /** the conversation has an earlier answer with data, that a follow-up can change */
  prevAnswer: boolean;
  /** the question names a place and the word "incident", not one incident ("tell me about the Anna Nagar incident") */
  onlyPlace: boolean;
  /** an answer from the store, for a correction that answers the question itself */
  fast: (scope: Scope, decided?: Detected) => Promise<ChatOutput | null>;
  finish: (card: AnswerCard, plan: unknown) => Promise<ChatOutput>;
  card0: (scope: Scope | null) => AnswerCard;
}

/** The corrected route; or `done`, the finished answer (the correction answered the question itself); or null: it does not apply. */
type FixResult = Route | { done: ChatOutput } | null;

interface RouteFix {
  /** kept with the turn's plan when it applied, so a wrong answer can be traced to the correction that made it */
  name: string;
  run: (route: Route, c: FixCtx) => FixResult | Promise<FixResult>;
}

const NOT_ANSWERED = ["out_of_scope", "unsafe"];

/**
 * The code's corrections to the router's reading, in the order they run. Each is a mistake a model made in a live test, or a
 * rule the console's figures need; the comment on each says which.
 */
const ROUTE_FIXES: RouteFix[] = [
  {
    // "needs attention now": with no period of its own, "now" is the last 7 days, not the default 90 (the router keeps the default)
    name: "now-is-7-days",
    run: (route, { message, typed }) => {
      if (!(NOW_WORDS.test(message) && !PERIOD_WORDS.test(message) && route.scope?.period === DEFAULT_PERIOD && typed)) return null;
      const now7 = (s: Scope): Scope => (s.period === DEFAULT_PERIOD ? { ...s, period: "weekly" } : s);
      return { ...route, scope: now7(route.scope),
        tools: route.tools.map((t) => (t.args?.scope ? { ...t, args: { ...t.args, scope: now7(t.args.scope as Scope) } } : t)),
        assumptions: [...route.assumptions, "“Now” read as the last 7 days."] };
    }
  },
  {
    // "export all complaints": the code's guard saw a bulk request, whatever the router called it
    name: "bulk-request",
    run: (route, { guard }) => (guard?.kind === "bulk" && ![...NOT_ANSWERED, "email_followup"].includes(route.intent) ? { ...route, intent: "bulk_request" } : null)
  },
  {
    // "what is the Black Flag March?" reads like general knowledge to a router that cannot see the day's news: before refusing,
    // the district's own news is searched, and a story the question's words name is answered instead of refused
    name: "in-our-news",
    run: async (route, { message, now, typed }) => {
      if (!(route.intent === "out_of_scope" && !route.offline && typed && await inOurNews(message, now))) return null;
      return { ...route, intent: "tool_question", refusal: null,
        decision: { answer: "news_story", incidentId: null, storyId: null, find: message, count: null, focus: "all", openOnly: false, severity: null, options: [] },
        assumptions: [...route.assumptions, "Not general knowledge: it is in the district's news, so it was answered from there."] };
    }
  },
  {
    // "tomato price today": the router asked "which market?", which its instructions forbid (all Chennai markets answer it)
    name: "price-without-market",
    run: (route, { message, names, typed }) => {
      if (!((route.clarify || route.decision?.answer === "clarify") && /\b(price|prices|rate|rates|cost)\b|விலை|vilai/i.test(message) && typed)) return null;
      const rp = rulesRoute(message, route.scope, names);
      return rp.tools[0]?.name === "mandi_prices" ? { ...rp, offline: false, language: route.language,
        assumptions: ["No market was named, so every Chennai market that reported is shown."] } : null;
    }
  },
  {
    // "youtuber harish case brief me": a named case is that case's story; the router once read "brief" as the district's
    // briefing ("14,705 incidents reported district-wide")
    name: "named-case-not-briefing",
    run: (route, { message, names, typed }) => {
      if (!(typed && (["briefing", "insight_request"].includes(route.intent) || route.tools.some((t) => ["briefing", "overview_kpis"].includes(t.name))))) return null;
      if (!storySearchText(message, names)) return null;
      const r = storyRoute(message, route.scope, names);
      return r ? { ...r, language: route.language, assumptions: [...r.assumptions, "Read as a question about the case it names, not the district briefing."] } : null;
    }
  },
  {
    // "TNPCB issues": one department named, and the router ranked every department (Police first, TNPCB nowhere): that
    // department's own incidents, most important first
    name: "one-department",
    run: async (route, { message, names, i, exact, fast, typed }) => {
      if (!(route.intent === "tool_question" && route.tools.length === 1 && route.tools[0].name === "departments" && typed
        && !/\b(rank\w*|compare|vs\.?|versus|which|all|each|every|most|least|top|worst|best|slowest|fastest|by department|department[- ]?wise|other)\b/i.test(message))) return null;
      const d = deptFromWords(message, names);
      if (!d || i.lockDept) return null;
      const r = await fast({ ...route.scope, dept: d.code }, { ...exact, intent: "PRIORITY_INCIDENT_LIST", refinement: false, because: "one department's own incidents" });
      return r ? { done: r } : null;
    }
  },
  {
    // the router's understanding decides the kind of answer: one incident explained, an area overview, a list, a story, a question back
    name: "router-decision",
    run: async (route, { message, ctx, placeData, names, typed, fast, finish, card0 }) => {
      if (!(route.decision && typed && ![...NOT_ANSWERED, "bulk_request", "smalltalk", "help", "chart_edit", "console_action", "email_followup"].includes(route.intent))) return null;
      const p = planFromDecision(route, message, ctx, placeData?.zone != null ? Number(placeData.zone) : null, localityOf(placeData, names));
      if (p?.clarify) {
        const c = clarifyCard(card0(route.scope), p.clarify.question);
        c.chips = p.clarify.options;
        return { done: await finish(c, { intent: "clarify", router: true, options: p.clarify.options }) };
      }
      if (p?.fast) {
        const r = await fast(route.scope, { ...p.fast, refinement: p.fast.refinement || route.intent === "plan_edit" });
        if (r) return { done: r };
      }
      if (!p?.tools) return null;
      return { ...route, intent: "tool_question", tools: p.tools,
        assumptions: [...route.assumptions, route.decision.answer === "area_summary" ? "Read as a question about the place or topic as a whole."
          : p.tools.some((t) => t.name === "incident_story" || t.name === "incident_detail") ? "Read as a question about one incident."
            : p.tools.some((t) => t.name === "change_drivers") ? "Read as a question about what changed and why." : "Read as a question the console's tools answer."] };
    }
  },
  {
    // Tools first: when the router sends a question to the planner but a console tool clearly answers it, the tool wins
    // (its numbers are the console's); the planner stays for groupings no tool offers.
    name: "tool-before-planner",
    run: (route, { message, names, placeData }) => {
      if (!(route.intent === "adhoc_question" && !route.offline && !route.forcedQuery && !/\b(ward|channel|source|per day|daily|hourly|by hour|between|from \d)/i.test(message))) return null;
      // the rules' pick, on the router's scope: a specific tool, or the incidents list for a question naming a category or a place
      const rules = rulesRoute(message, route.scope, names, placeData?.zone != null);
      const t = rules.tools[0];
      const countOrList = /how many|evlo|evvalo|evvalavu|count|number of|\bany\b|\blist\b|\bshow\b|எத்தனை|எவ்வளவு/i.test(message)
        && !/\b(average|avg|mean|median|resolution time|per|by (zone|department|category|month|week|day))\b/i.test(message);
      return rules.intent === "tool_question" && t && (PREFER_TOOL.has(t.name) || (t.name === "incidents" && countOrList))
        ? { ...route, intent: "tool_question", scope: rules.scope, tools: [t], assumptions: [...route.assumptions, `Answered with the console's ${t.name} data.`] } : null;
    }
  },
  {
    // "only Adyar zone", "what about last month?", "same for Zone 9": a short follow-up that changes only where or when re-asks the
    // previous answer with that change (the conversation's memory), whatever new question the router read into it
    name: "follow-up-changes-scope",
    run: (route, { message, placeData, prevAnswer }) => {
      if (!(prevAnswer && isRefinement(message, !!placeData) && ![...NOT_ANSWERED, "chart_edit", "console_action", "help", "smalltalk"].includes(route.intent))) return null;
      const raw: Row = { ...route.scopeRaw };
      if (placeData?.zone != null && raw.zone == null) raw.zone = placeData.zone;
      return { ...route, intent: "plan_edit", tools: [], scopeRaw: raw, assumptions: [...route.assumptions, "Read as a follow-up: the previous answer, with this change."] };
    }
  },
  {
    // "only Zone 13" after an answer re-asks that answer for Zone 13; changing the console itself needs the message to say so
    name: "filter-is-follow-up",
    run: (route, { message, prevAnswer }) => {
      if (!(route.intent === "console_action" && prevAnswer && !/\b(console|dashboard|screen|page|open)\b|கன்சோல்|டாஷ்போர்டு/i.test(message))) return null;
      const raw: Row = { ...route.scopeRaw };
      for (const a of route.actions) {
        if (a.action === "filter_zone" && a.zone != null) raw.zone = a.zone;
        if (a.action === "filter_taluk" && a.taluk) raw.taluk = a.taluk;
        if (a.action === "filter_dept" && a.dept) raw.dept = a.dept;
        if (a.action === "filter_cat" && a.cat) raw.cat = a.cat;
        if (a.action === "set_period" && a.period) raw.period = a.period;
      }
      return { ...route, intent: "plan_edit", scopeRaw: raw, actions: [], tools: [] };
    }
  },
  {
    // "road accident trend": one category over time is incident_series; category_trends is for comparing categories
    name: "one-category-trend",
    run: (route, { message }) => (route.intent === "tool_question" && route.scope.cat && route.tools.length === 1 && route.tools[0].name === "category_trends"
      && !/\b(categor|compare|vs\.?|versus|types?|each|all)\b|வகை/i.test(message)
      ? { ...route, tools: [{ name: "incident_series", args: { scope: route.scope } }],
        assumptions: [...route.assumptions, "One category over time: answered with its incident series and usual range."] } : null)
  },
  {
    // a place is a filter, not a keyword: "Velachery" searched as text finds only incidents whose title says so
    name: "place-as-filter",
    run: (route, { placeData, names }) => (placeData && (placeData.zone != null || placeData.asked_for_taluk) && route.intent === "tool_question" ? placeAsScope(route, placeData, names) : null)
  },
  {
    // a department's name is not a category: "how is the Storm Water Drain department performing" was filtered to "Drain works site
    // safety". The category stays only when the words left after the department's name still name it.
    name: "department-not-category",
    run: (route, { message, names, typed }) => {
      if (!(route.scope.cat && typed)) return null;
      const dn = deptFromWords(message, names);
      if (!dn) return null;
      const deptName = names.depts.get(dn.code)?.name ?? "";
      const rest = message.replace(new RegExp(deptName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ").replace(/\b(department|dept)\b/gi, " ");
      const still = classify(rest);
      if (still && still.code === route.scope.cat && still.conf >= 0.6) return null;
      const cat = route.scope.cat;
      const drop = (s: Scope): Scope => (s.cat === cat ? { ...s, cat: null } : s);
      return { ...route, scope: drop(route.scope), tools: route.tools.map((t) => (t.args?.scope ? { ...t, args: { ...t.args, scope: drop(t.args.scope as Scope) } } : t)),
        assumptions: [...route.assumptions.filter((a) => !/^Narrowed to /.test(a)), `"${deptName || dn.code}" read as the department, not as a kind of incident.`] };
    }
  },
  {
    // smalltalk is greetings and thanks; "what does test data mean?" is a help question
    name: "help-not-smalltalk",
    run: (route, { message }) => (route.intent === "smalltalk" && !SMALLTALK.test(message) && isHelpQuestion(message) ? { ...route, intent: "help" } : null)
  },
  {
    // a short "make it a pie" / "show on map" after an answer is a chart edit, whatever the router called it
    name: "short-chart-edit",
    run: (route, { message, turns }) => (route.intent !== "chart_edit" && !NOT_ANSWERED.includes(route.intent) && turns.some((t) => t.role === "assistant")
      && message.length <= 40 && ((editFromText(message) && isBareEdit(message)) || topNFromText(message) != null) ? { ...route, intent: "chart_edit" } : null)
  },
  {
    // "what is this murder case in Adyar?": one specific incident, told as a story, whatever list the rules picked (a keyword
    // override for the rules only: the router's decision already says one incident or a whole place)
    name: "one-incident-story",
    run: (route, { message, onlyPlace }) => (!route.decision && ["tool_question", "adhoc_question"].includes(route.intent) && STORY.test(message) && STORY_THING.test(message) && !onlyPlace
      && !route.tools.some((t) => t.name === "incident_story" || t.name === "incident_detail")
      ? { ...route, intent: "tool_question", tools: [{ name: "incident_story", args: { text: message, scope: route.scope } }],
        assumptions: [...route.assumptions, "Read as a question about one incident: its story."] } : null)
  },
  {
    // "tell me about the Anna Nagar incident" names only a place and the word "incident": that is the place's summary
    name: "place-not-story",
    run: (route, { onlyPlace, placeData }) => (!route.decision && onlyPlace && route.tools.some((t) => t.name === "incident_story")
      ? { ...route, intent: "tool_question", tools: [{ name: "zone_profile", args: { scope: route.scope, zone: Number(placeData!.zone) } }],
        assumptions: ["Read as a question about the place, not one incident: its snapshot."] } : null)
  },
  {
    // "contact of health department", "who is the officer for PWD in Adyar": the officials' directory, never the incidents of a
    // subject the department's name happens to share ("health")
    name: "officials-to-contact",
    run: async (route, { message, names, placeData }) => {
      if (!(CONTACT.test(message) && !route.tools.some((t) => t.name === "contacts") && !NOT_ANSWERED.includes(route.intent))) return null;
      const dept = await contactDept(message, names);
      const zone = placeData?.zone != null ? Number(placeData.zone) : route.scope.zone ?? null;
      return dept || zone ? { ...route, intent: "tool_question", tools: [{ name: "contacts", args: { dept, zone } }], decision: undefined,
        assumptions: [...route.assumptions, "Read as a request for the officials to contact."] } : null;
    }
  },
  {
    // several subjects in one question ("road accidents, flooding and public-infrastructure complaints"): every part is answered,
    // side by side, instead of the data being narrowed to the one subject a single category filter can hold
    name: "several-subjects",
    run: (route, { message }) => {
      const parts = ["tool_question", "adhoc_question", "briefing", "insight_request"].includes(route.intent) && !route.forcedQuery
        && !route.tools.some((t) => ["incident_story", "incident_detail", "mandi_prices", "environment", "contacts", "change_drivers"].includes(t.name)) ? multiPart(message) : null;
      return parts ? { ...route, intent: "tool_question", scope: { ...route.scope, cat: null }, tools: [{ name: "category_summary", args: { scope: { ...route.scope, cat: null }, parts } }],
        assumptions: [...route.assumptions.filter((a) => !/^Narrowed to /.test(a)), `Answered part by part: ${parts.map((x) => x.label).join("; ")}.`] } : null;
    }
  },
  {
    // "why did flooding rise in Adyar?": the explanation of a change, narrowed to the one subject it names (its main category),
    // not a side-by-side summary that gives the figures but no reasons. (After several-subjects, which never takes a
    // change_drivers question, so the two never both apply.)
    name: "why-one-subject",
    run: (route, { message, names }) => {
      if (!(!route.scope.cat && route.tools.length === 1 && route.tools[0].name === "change_drivers")) return null;
      // (questionParts, not multiPart: multiPart returns a single subject only when it is a broad group, so "why did road
      // accidents go up?" was explained with every incident and answered "road accidents did not go up")
      const one = oneSubject(message, names);
      if (one?.cat) {
        const scope = { ...route.scope, cat: one.cat };
        return { ...route, scope, tools: [{ name: "change_drivers", args: { ...route.tools[0].args, scope } }],
          assumptions: [...route.assumptions, `Narrowed to ${names.cats.get(one.cat)?.label ?? one.part.label}.`] };
      }
      if (!one) return null;
      // a subject of several kinds ("is crime going up?"): the whole group, kind by kind, against the period before (it was once
      // narrowed to its first kind, theft, and answered as if that were all of crime)
      const scope = { ...route.scope, cat: null };
      return { ...route, scope, tools: [{ name: "category_summary", args: { scope, parts: [one.part] } }],
        assumptions: [...route.assumptions, `Answered for every kind of ${one.part.label.toLowerCase()}, against the period before.`] };
    }
  },
  {
    // "how many road accidents": a keyword that only repeats the category filter would search titles for "road accidents"
    // (they say "Road accident") and find none; the category already narrows the list. A severity or status filter only when
    // the question names one ("how many road accidents" is all of them, not the severe ones).
    name: "only-asked-filters",
    run: (route, { message, names }) => {
      const tools = route.tools.map((t) => {
        if (t.args.sev && !/\b(severe|serious|critical|high|medium|low|minor|major|grave)\b|கடுமை|தீவிர/i.test(message)) t = { ...t, args: { ...t.args, sev: null } };
        if (t.args.status && !/\b(open|pending|unresolved|ongoing|in progress|closed|resolved|awaiting|verif\w*|unverified|critical|lapsed)\b|நிலுவை/i.test(message)) t = { ...t, args: { ...t.args, status: null } };
        const q = typeof t.args.q === "string" ? t.args.q.trim() : "";
        const cat = (t.args.scope as Scope | undefined)?.cat;
        if (!q || !cat) return t;
        const label = (names.cats.get(cat)?.label ?? "").toLowerCase();
        const stem = (w: string) => w.toLowerCase().replace(/(es|s)\b/g, "").replace(/[^a-z ]+/g, " ").trim();
        const repeats = classify(q)?.code === cat || (!!label && (stem(label).includes(stem(q)) || stem(q).includes(stem(label))));
        return repeats ? { ...t, args: { ...t.args, q: null } } : t;
      });
      return tools.some((t, k) => t !== route.tools[k]) ? { ...route, tools } : null;
    }
  },
  {
    // a story needs the words that describe the incident: the question itself when the router gave none
    name: "story-words",
    run: (route, { message }) => (route.tools.some((t) => t.name === "incident_story" && !String(t.args.text ?? "").trim())
      ? { ...route, tools: route.tools.map((t) => (t.name === "incident_story" && !String(t.args.text ?? "").trim() ? { ...t, args: { ...t.args, text: message } } : t)) } : null)
  },
  {
    // a department's own console answers for that department only
    name: "department-console",
    run: (route, { i, notes }) => (i.lockDept ? { ...route, scope: { ...route.scope, dept: i.lockDept }, tools: lockTools(route.tools, i.lockDept, route.scope, notes) } : null)
  }
];

// ------------------------------------------------------------------- main --

/** Caveats for feeds an answer drew on that are behind (freshness.ts), e.g. "News last collected 6 hours ago; ...". */
export async function staleCaveats(results: { tool: string; args?: Record<string, unknown> }[], tables: string[]): Promise<string[]> {
  const stale = (await collectionStatus())?.stale ?? [];
  if (!stale.length) return [];
  const used = feedsForAnswer(results, tables, (m) => (ENV_METRICS as Record<string, { source: string }>)[m]?.source ?? null);
  return stale.filter((f) => used.includes(f.source)).map((f) => freshnessLine(f, "this answer"));
}

export async function ask(i: ChatInput): Promise<ChatOutput> {
  // the search index's background embedding pauses while a question is answered
  const release = holdSync();
  try {
    return await answer(i);
  } finally {
    release();
  }
}

async function answer(i: ChatInput): Promise<ChatOutput> {
  const started = Date.now();
  const [now, names] = await Promise.all([storeAsOf(), refNames()]);
  warmUp(now);
  lanceWarm(now);
  // `typed` is kept as the Collector wrote it; everything below reads `message`, with typos corrected toward the
  // district's vocabulary ("tomatoe prifce" -> "tomato price", "incidnets in adyr" -> "incidents in adyar")
  const typed = i.message.replace(/\s+/g, " ").trim().slice(0, LIMITS.messageChars);
  const spelled = await correctSpelling(typed).catch((e) => {
    console.warn("[assistant] spelling correction failed; the words are read as typed:", (e as Error).message);
    return { text: typed, fixes: [] as { from: string; to: string }[] };
  });
  const message = spelled.text;
  const detected = detectLanguage(typed);
  let lang: Lang = i.language !== "auto" ? i.language : detected.lang;
  // answers cover the whole quarter (the last 90 days) unless the question names a period ("today", "this week"); the
  // console's zone, department, category and taluk filters still apply
  const consoleScope = ScopeSchema.parse({ ...(i.lockDept ? { ...i.scope, dept: i.lockDept } : i.scope), period: DEFAULT_PERIOD });
  const sessionId = await ensureSession(i.user, i.sessionId, typed);
  // a "reset" in this chat cuts its memory: follow-ups read only the turns after it
  const turns = sinceReset(await recentTurns(i.user, sessionId, 10));
  const models: CallInfo[] = [];
  const notes: string[] = [];
  let route: Route | null = null;
  const card0 = (scope: Scope | null) => baseCard(lang, scope, scope ? describeScope(scope, names, lang, now) : "", now);

  const finish = async (card: AnswerCard, plan: unknown): Promise<ChatOutput> => {
    card.sources.models = models.map((m) => ({ step: m.step, provider: m.provider, model: m.model, ms: m.ms, tokens: m.inputTokens + m.outputTokens,
      inTokens: m.inputTokens, outTokens: m.outputTokens }));
    // one caveat said twice in other words (the tool's and the composer's "Porur has no filter of its own") is said once
    // (the composer often says a code caveat again in its own words: "Incidents matched by place name within Adyar zone" beside
    // "Incidents are matched to Velachery by the place name in their records, within Adyar zone": most of the words are shared)
    card.caveats = dedupeCaveats(card.caveats);
    card.sources.assumptions = [...new Set([...(route?.assumptions ?? []), ...card.sources.assumptions])]
      // a note about a period the answer did not end up covering ("covers the last 90 days" on a 24-hour answer) only confuses
      .filter((a) => !card.scope?.period || !((/^No period was named/.test(a) && card.scope.period !== "quarterly")
        || (/^“Now” read as the last 7 days/.test(a) && card.scope.period !== "weekly")))
      // an answer about one incident (its story, its next steps) has no zone or period of its own to explain
      .filter((a) => !(["actions", "incident_detail"].includes(String(card.responseType)) && card.sources.incidentIds.length === 1
        && /^(Zone \d+ was not named|No period was named|“Now” read as)/.test(a)));
    card.sources.limits = [...new Set([...notes, ...card.sources.limits])];
    // a department console has no department filter to switch
    if (i.lockDept) {
      card.consoleActions = card.consoleActions.filter((a) => a.action !== "filter_dept");
      card.autoActions = card.autoActions.filter((a) => a.action !== "filter_dept");
    }
    if (route?.offline && card.kind === "answer") card.offline = true;
    if (route?.alt && card.kind === "answer") { card.caveats = [route.alt.note, ...card.caveats]; card.chips = [...route.alt.chips, ...(card.chips ?? [])].slice(0, 4); }
    // no automatic follow-up questions: the Collector asks what they want next
    if (card.kind === "answer" || card.kind === "action") card.followUps = [];
    // every answer saves the conversation state the next question's follow-ups resolve against
    // a question back, a refusal or an error answers nothing new: the chat keeps the previous answer's state, so the next
    // follow-up ("and last month?") still refers to it
    if (!card.context && ["clarify", "refusal", "error"].includes(card.kind) && lastContext(turns)) card.context = lastContext(turns)!;
    if (!card.context) {
      const prevCtx = lastContext(turns);
      const ds = card.datasets.find((d) => d.idField && d.rows.some((r) => /^INC-/.test(String(r[d.idField!]))));
      const ids = ds ? ds.rows.map((r) => String(r[ds.idField!])).filter((x) => /^INC-/.test(x)).slice(0, 10) : [];
      const single = card.sources.incidentIds.length === 1 ? card.sources.incidentIds[0] : null;
      const titleKey = ds?.fields.find((f) => f.key === "title")?.key;
      const titles = ds && titleKey ? ds.rows.filter((r) => /^INC-/.test(String(r[ds.idField!]))).slice(0, 10).map((r) => String(r[titleKey] ?? "")) : [];
      card.context = { lastIntent: route?.intent ?? card.kind, activeFilters: filtersOf(card.scope), lastResponseType: card.display === "kpi" ? "kpi" : card.display,
        resultIds: ids.length ? ids : prevCtx?.resultIds, resultTitles: ids.length ? titles : prevCtx?.resultTitles, storyIds: prevCtx?.storyIds,
        storyTitles: prevCtx?.storyTitles, selectedIncidentId: single ?? prevCtx?.selectedIncidentId ?? null,
        selectedTitle: single ? card.headline.replace(/^Closest match:\s*/i, "") : prevCtx?.selectedTitle ?? null,
        selectedNewsStoryId: single ? null : prevCtx?.selectedNewsStoryId ?? null, lastVisualization: card.chart?.type ?? null };
    }
    // what was corrected, shown on the card ("Understood as: tomato price") and kept in the sources
    if (spelled.fixes.length && card.kind !== "refusal") {
      card.understood = message;
      card.sources.assumptions.unshift(`Read ${spelled.fixes.map((f) => `"${f.from}" as "${f.to}"`).join(", ")}.`);
    }
    await addMessage({ sessionId, role: "user", text: typed, language: lang, inputMode: i.inputMode, scope: consoleScope });
    const messageId = await addMessage({ sessionId, role: "assistant", text: card.headline, language: lang, payload: { ...card, id: undefined }, plan, scope: card.scope });
    card.id = messageId;
    // where the time went: the models' share, and everything else (data, search, saving)
    const modelMs = models.reduce((s, m) => s + m.ms, 0);
    console.info(`[assistant] answered in ${Date.now() - started} ms (models ${modelMs} ms, other ${Date.now() - started - modelMs} ms): ${card.kind}/${card.display}${card.sources.verifier && typeof card.sources.verifier === "object" && card.sources.verifier.template ? " template" : ""}`);
    await audit(i.user, "assistant:answer", "assistant_messages", messageId, null, {
      kind: card.kind, intent: route?.intent ?? null, tools: card.sources.tools.map((t) => t.name), sql: card.sources.sql.length,
      verifier: card.sources.verifier, language: lang, inputMode: i.inputMode, models: card.sources.models.map((m) => `${m.step}:${m.provider}`)
    });
    return { card, sessionId, messageId };
  };

  // 1. checks in code, before any model
  // on the words as typed, and on the corrected ones (a misspelt "delet all complaints" is still refused)
  let guard = await codeGuard(typed);
  if (message !== typed && (!guard || guard.kind === "bulk")) guard = (await codeGuard(message)) ?? guard;
  if (guard?.kind === "unsafe") return finish(refusalCard(card0(null), guard.reason), { intent: "unsafe", guard: guard.reason });
  // plainly off-topic ("who won the IPL?"): answered at once, no model, no tokens
  if (guard?.kind === "off_topic") return finish(refusalCard(card0(null), null, guard.topic), { intent: "out_of_scope", guard: guard.topic });

  // "reset", "start over", "clear the chat": the conversation's memory starts again
  if (RESET.test(message)) return finish(resetCard(card0(null)), { intent: "reset" });

  // a message that is only a greeting, thanks or goodbye ("hi", "thank you!", "வணக்கம்") is answered at once: "hi" once took 5 s
  // (a router call, the place lookup and the search index, all for a greeting)
  if (ONLY_SMALLTALK.test(typed)) return finish(smalltalkCard(card0(null), message), { intent: "smalltalk", instant: true });

  // weather warnings and alerts ("is there a cyclone warning?", "புயல் எச்சரிக்கை உள்ளதா?"): the alerts lane, whatever the router
  // would say (it once called the cyclone question out of scope, LT-15)
  if (!i.pinId && !i.insightKey && (isWarningQuestion(typed) || isWarningQuestion(message))) {
    i.stage("fetching");
    const w = await warningsNow(now).catch(orNull("pipeline:warnings"));
    if (w) {
      const card = warningCard(card0(null), w);
      // "what are newspapers saying about it?": what the papers report, with their outlets (R-09)
      if (NEWS_ASKED.test(message)) card.answerMarkdown = [card.answerMarkdown, ...newsLines(w.lane, lang === "ta" ? "ta" : lang === "tanglish" ? "tanglish" : "en")].join("\n");
      return finish(card, { intent: "warnings", tool: "alerts_lane" });
    }
  }

  // the Collector's own Data Studio datasets: listed, or one of them asked about (Studio's analyst computes the figures)
  if (!i.lockDept && !i.pinId && !i.insightKey) {
    if (LIST_DATASETS.test(message)) return finish(datasetsListCard(card0(null)), { intent: "studio_list" });
    // hospital beds over a threshold or right now are the console's live readings ("hospital beds above 90% occupancy" was once
    // answered "3 of 1,620" rows of an upload); a breakdown by zone or over time is the uploaded dataset's
    const live = /\b(hospital|hospitals|beds?|occupancy)\b/i.test(message) && /\b(above|over|more than|below|less than|under)\s*\d+\s*(%|percent)|\b(today|now|right now|currently|latest|overload\w*|over-?crowd\w*|crowded|full|capacity|shortage|available)\b/i.test(message)
      && !/\b(by|per|each)\s+(zone|taluk|ward|month|week|day)|\b(trend|over time)\b/i.test(message);
    const ds = live ? null : datasetNamed(message);
    if (ds) {
      i.stage("fetching");
      const r = await studioAsk(ds.id, message, i.user).catch((e) => { console.warn("[assistant] Data Studio answer failed:", (e as Error).message); return null; });
      if (r) return finish(datasetAnswerCard(card0(null), ds, { ...r, kind: r.kind } as Parameters<typeof datasetAnswerCard>[2]), { intent: "studio_query", dataset: ds.id });
    }
  }

  // 2. understand
  i.stage("understanding");
  // (a one-letter message names no place: the tool refuses it, and the refusal was logged as a failure)
  const placeData = message.trim().length < 2 ? null
    : await runTool("resolve_place", { text: message.slice(0, 120) }).then((r) => r.data as Row | null).catch(orNull("pipeline:resolve_place"));
  const place = placeData ? JSON.stringify(placeData) : "";
  const ctx = lastContext(turns);
  // answers from the store (lists, counts, one incident's facts, news): `decided` is the router's understanding; without
  // it the keyword rules read the message (the fallback when no model is available)
  const fast = async (scope: Scope, decided?: Detected): Promise<ChatOutput | null> => {
    const tf = Date.now();
    const fp = await fastPath({ message, lang, scope, names, now, lockDept: i.lockDept ?? null, ctx, place: placeData }, decided)
      .catch((e) => { if (i.signal?.aborted) throw e; console.warn("[assistant] fast path failed:", (e as Error).message); return null; });
    if (!fp) return null;
    console.info(`[assistant] ${fp.card.intent} answered from the store in ${Date.now() - tf} ms (${Date.now() - started} ms since the question)${decided ? " (router)" : " (rules)"}`);
    if (spelled.fixes.length) fp.card.understood = message;
    // every answer written by the AI: the store's exact answer is the draft, the model writes it as a reply, and only the numbers
    // already in it pass (otherwise the store's wording stands). The store's answer is already right, so the writer gets 5 s per
    // model (it takes 0.4-1.5 s; a 9 s limit once held an answer for 11 s on an overloaded model)
    if (aiStatus().available && fp.card.kind === "answer" && !i.signal?.aborted) {
      try {
        // a news answer is written from what its articles say, not their headlines ("what is the protest about?" was answered
        // with the headline alone): one story, its four best articles; a list, the lead article of each of the first five
        const stories = fp.card.stories ?? [];
        const one = fp.card.responseType === "news_detail";
        const byStory = stories.length ? await storyArticles(stories.slice(0, one ? 1 : 5).map((s) => s.storyId), one ? 4 : 1, one ? 1200 : 450)
          .catch((e) => { console.warn("[assistant] news articles not read:", (e as Error).message); return new Map<string, string[]>(); }) : new Map<string, string[]>();
        const articles = stories.slice(0, one ? 1 : 5).map((s) => byStory.get(s.storyId) ?? []);
        const r = await generateJson({ role: "reasoning", name: "writer", schema: PolishSchema, system: polishSystem(lang), prompt: polishPrompt(message, fp.card, articles),
          temperature: 0.3, maxOutputTokens: 700, user: i.user, abortSignal: i.signal, chat: true, timeoutMs: 5_000 });
        models.push(r.info);
        const ok = checkPolish(r.object, message, fp.card, articles);
        if ("text" in ok) {
          Object.assign(fp.card, { headline: ok.text.headline, answerMarkdown: ok.text.answerMarkdown, voiceSummary: ok.text.voiceSummary, offline: false });
          fp.card.sources.verifier = { checked: ok.checked, unmatched: [], regenerated: false, template: false };
        } else console.warn(`[assistant] writer: draft rejected (${ok.rejected}); the store's wording stands`);
      } catch (e) {
        if (i.signal?.aborted) throw e;
        console.warn(`[assistant] writer unavailable (${(e as Error).message.slice(0, 120)}); the store's wording stands`);
      }
    }
    // "what are today's important problems?" district-wide during an alert: the alert leads, after the writer, so it is never
    // dropped (R-03: on Cyclone Arnab's second day the answer listed crimes and never named the cyclone)
    if (fp.card.intent === "PRIORITY_INCIDENT_LIST" && !scope.zone && !scope.taluk && !scope.dept) {
      const w = await warningsNow(now).catch(orNull("pipeline:priority-alert"));
      if (w?.lane.banner) {
        const lead = lang === "en" ? `**Active alert: ${warningAnswer(w.lane, "en").headline}.** ${w.lane.agreementText}`
          : `**${warningAnswer(w.lane, lang === "ta" ? "ta" : "tanglish").headline}.**`;
        fp.card.answerMarkdown = `${lead}\n\n${fp.card.answerMarkdown}`;
      }
    }
    return finish(fp.card, { ...fp.plan, router: !!decided });
  };
  // exact requests need no understanding: a question naming an incident id, or the previous list as a map or table
  const exact = detectIntent(message, ctx);
  // agent mode: the model calls the tools, reads what they return and looks further before the composer writes. The rules
  // keep only exact requests (an incident id, the previous list as a map or table), and answer when the model is out.
  let agentFailed = false;
  if (agentMode() && !i.pinId && !i.insightKey && aiStatus().available) {
    if (((exact.intent === "MAP" || exact.intent === "TABLE" || exact.intent === "CHART") && exact.refinement)
      || (exact.intent === "INCIDENT_DETAIL" && /\bINC-[A-Z0-9-]{4,}/i.test(message) && message.length <= 120)) {
      const r = await fast(consoleScope);
      if (r) return r;
    }
    if (SMALLTALK.test(message) && message.length <= 30) return finish(smalltalkCard(card0(null), message), { intent: "smalltalk", agent: true });
    const agentTools = listTools({ llmOnly: true });
    const schemas = agentSchemas(agentTools.map((t) => t.name) as [string, ...string[]], Object.keys(ENV_METRICS) as [string, ...string[]]);
    const system = agentSystem(agentTools.map((t) => `${t.name}(${t.args.join(", ")}): ${BRIEF[t.name] ?? t.description}`).join("\n"), codes(names));
    const cw = customWindow(message);
    // each call's own filters on the console's; a window in the message's words ("yesterday") sets the period it names
    const callScope = (c: { period: Scope["period"] | null; zone: number | null; dept: string | null; cat: string | null; taluk: string | null }): Scope => {
      const s = applyScope(consoleScope, { period: c.period, zone: c.zone, dept: c.dept, cat: c.cat, taluk: c.taluk }, names);
      if (!c.period && cw) s.period = cw.period;
      else if (!c.period && NOW_WORDS.test(message) && !PERIOD_WORDS.test(message)) s.period = "weekly";
      if (cw?.offset && s.period === cw.period) s.offset = cw.offset;
      if (i.lockDept) s.dept = i.lockDept;
      return s;
    };
    // the one kind of incident the question names ("why is flooding high in Adyar?"): explanations and series cover it only
    const named = questionParts(message);
    const namedCat = oneSubject(message, names)?.cat ?? null;
    let narrowed = false;
    const typedClean = i.message.replace(/\s+/g, " ").trim().slice(0, LIMITS.messageChars);
    let outcome: AgentOutcome;
    try {
      outcome = await runAgent({
        message, typed: typedClean !== message ? typedClean : undefined, asOf: now, scopeLine: describeScope(consoleScope, names, "en"),
        summary: summaryOf(turns), previous: contextForRouter(ctx), place, detected: detected.lang, system,
        window: cw ? `${cw.label} (period ${cw.period}${cw.offset ? ", the window before the latest" : ""})` : "",
        llm: async (name, prompt) => {
          const r = await generateJson({ role: agentRole(), name, schema: schemas.strict, lenient: schemas.lenient, system, prompt, temperature: 0,
            maxOutputTokens: 1200, user: i.user, abortSignal: i.signal, chat: true });
          models.push(r.info);
          return r.object;
        },
        run: async (asked) => {
          const c = narrowToNamed(asked, namedCat);
          if (c !== asked) narrowed = true;
          const scope = callScope(c);
          let calls = [{ name: c.tool as string, args: toolArgs(c.tool, c, scope) }];
          if (i.lockDept) calls = lockTools(calls, i.lockDept, scope, notes);
          const t = calls[0];
          const r = await runTool(t.name, t.args);
          if (i.lockDept && otherDeptsIncident(r, i.lockDept)) throw new ToolError("that incident is handled by another department");
          return { name: t.name, args: t.args, result: r };
        },
        signal: i.signal, log: (m) => console.info(`[assistant] agent ${m}`)
      });
    } catch (e) {
      if (i.signal?.aborted) throw e;
      if (e instanceof AiBudgetError) return finish(errorCard(card0(null), e.message), { intent: "error" });
      if (!(e instanceof AiBusyError)) console.warn("[assistant] agent failed; the rules answer:", (e as Error).message);
      notes.push(e instanceof AiBusyError ? `The AI service was busy (retry in ${e.retryAfter} s), so this was answered from the data without it.`
        : `The AI step failed (${(e as Error).message.slice(0, 200)}), so this was answered from the data without it.`);
      agentFailed = true;
      outcome = null as unknown as AgentOutcome;
    }
    if (outcome) {
      if (i.language === "auto") lang = detected.lang !== "en" ? detected.lang : outcome.language === "tanglish" || (outcome.language === "ta" && !hasTamilScript(message)) ? "tanglish" : outcome.language === "ta" ? "ta" : "en";
      const agentPlan = { intent: `agent:${outcome.kind}`, normalized: outcome.question, agent: outcome.steps, errors: outcome.errors };
      const asRoute = (scope: Scope, extra: Partial<Route> = {}): Route => ({ intent: "tool_question", language: outcome.language, normalized: outcome.question, scope, scopeRaw: {},
        tools: [], chartEdit: null, actions: [], clarify: null, refusal: null, assumptions: [], offline: false, visual: outcome.visual, ...extra });
      // a figure the model wrote into its reading of the question would pass the number check: only the Collector's own stay
      const question = outcome.question && outcome.question.toLowerCase() !== message.toLowerCase() ? `${message} (${onlyNumbersFrom(outcome.question, message)})` : message;
      const composeRuns = async (runs: { name: string; args: Record<string, unknown>; result: ToolResult; ms: number }[]) => {
        const results = runs.map((r) => r.result);
        const toolLog = runs.map((r) => ({ name: r.name, args: r.args, ms: r.ms }));
        route = asRoute(results.find((r) => r.scope)?.scope ?? consoleScope, { tools: runs.map((r) => ({ name: r.name, args: r.args })),
          assumptions: narrowed && namedCat ? [`Narrowed to ${names.cats.get(namedCat)?.label ?? named[0].label} (named in the question).`] : [],
          normalized: outcome.brief ? `${onlyNumbersFrom(outcome.question, message)}\nAnalyst's reading (words only; every figure comes from FACTS): ${outcome.brief}` : onlyNumbersFrom(outcome.question, message) });
        const card = await composeStage(i, { route, results, toolLog, adhoc: null, question, message, lang, names, now, placeData, insight: null, pin: null, models, turns });
        // places compared side by side: the scope line names every side, not only the first
        const zones = [...new Set(results.map((r) => r.scope?.zone).filter((z): z is number => z != null))];
        const zoneText = (z: number) => `${names.zones.get(z)?.name ?? `Zone ${z}`} (Zone ${z})`;
        if (zones.length >= 2 && card.scopeLine.includes(zoneText(zones[0]))) card.scopeLine = card.scopeLine.replace(zoneText(zones[0]), zones.map(zoneText).join(" vs "));
        return finish(card, { ...agentPlan, scope: route.scope, tools: toolLog.map((t) => ({ name: t.name, args: t.args })) });
      };
      switch (outcome.kind) {
        case "compose":
          return composeRuns(outcome.runs);
        case "refuse": {
          // "what is the Black Flag March?" can be the district's own news, not general knowledge
          if (await inOurNews(message, now)) {
            const r = await fast(consoleScope, { ...exact, intent: "NEWS_DETAIL", find: message, refinement: false, because: "in the district's news" });
            if (r) return r;
          }
          const why = outcome.refusal ?? "";
          return finish(refusalCard(card0(null), /personal|phone|address|aadhaa?r|name/i.test(why) ? "personal data" : /delet|chang|modif|updat|data change/i.test(why) ? "data change"
            : /instruction|prompt|rule/i.test(why) ? "instructions" : null), agentPlan);
        }
        case "smalltalk":
          if (!SMALLTALK.test(message) && isHelpQuestion(message)) return finish(await helpAnswer(i, asRoute(consoleScope), message, lang, names, now, models), agentPlan);
          return finish(smalltalkCard(card0(null), message), agentPlan);
        case "help":
          return finish(await helpAnswer(i, asRoute(consoleScope), message, lang, names, now, models), agentPlan);
        case "chart_edit": {
          const edited = await chartEdit(i, asRoute(consoleScope, { intent: "chart_edit", chartEdit: { type: outcome.chartType, showOnMap: !!outcome.chartType?.startsWith("map") } }),
            lang, names, now, sessionId);
          if (edited) return finish(edited.card, { ...agentPlan, intent: "chart_edit", tools: edited.tools });
          break;
        }
        case "clarify":
          if (outcome.clarify?.question) {
            const c = clarifyCard(card0(consoleScope), outcome.clarify.question);
            if (outcome.clarify.options.length >= 2) c.chips = outcome.clarify.options;
            return finish(c, { ...agentPlan, options: outcome.clarify.options });
          }
          break;
        case "query": {
          route = asRoute(consoleScope, { intent: "adhoc_question" });
          try {
            const adhoc = await planAndRun(i, route, message, now, models);
            const card = await composeStage(i, { route, results: [], toolLog: [], adhoc, question, message, lang, names, now, placeData, insight: null, pin: null, models, turns });
            return finish(card, { ...agentPlan, adhoc: adhoc.plan });
          } catch (e) {
            if (i.signal?.aborted) throw e;
            if (!(e instanceof CompileError)) console.warn("[assistant] agent query failed:", (e as Error).message);
            notes.push("The query planner could not build a query for this; it was answered from the console's own data instead.");
          }
          break;
        }
        case "show": {
          const sh = outcome.show;
          if (!sh) break;
          const scope = callScope(sh);
          const like = asRoute(scope, { scopeRaw: { period: sh.period },
            decision: { answer: sh.kind, incidentId: sh.incidentId?.trim().toUpperCase() || null, storyId: sh.storyId?.trim() || null, find: sh.find?.trim() || null,
              count: sh.count != null && sh.count >= 1 && sh.count <= 20 ? Math.round(sh.count) : null, focus: "all", openOnly: sh.openOnly, overdueOnly: sh.overdueOnly,
              severity: sh.severity, options: [] } });
          const p = planFromDecision(like, message, ctx, placeData?.zone != null ? Number(placeData.zone) : null, localityOf(placeData, names));
          if (p?.fast) {
            const r = await fast(scope, p.fast);
            if (r) return r;
          }
          if (p?.tools) {
            const runs: { name: string; args: Record<string, unknown>; result: ToolResult; ms: number }[] = [];
            for (const t of i.lockDept ? lockTools(p.tools, i.lockDept, scope, notes) : p.tools) {
              const t0 = Date.now();
              try { runs.push({ name: t.name, args: t.args, result: await runTool(t.name, t.args), ms: Date.now() - t0 }); }
              catch (e) { if (!(e instanceof ToolError)) throw e; notes.push(`Skipped ${t.name}: ${e.message}`); }
            }
            if (runs.length) return composeRuns(runs);
          }
          break;
        }
      }
      // nothing the agent chose could answer: the console's own reading of the message does, without another model call
      route = null;
      agentFailed = true;
    }
  }
  if (!i.pinId && !i.insightKey && ((exact.intent === "INCIDENT_DETAIL" && /\bINC-[A-Z0-9-]{4,}/i.test(message) && message.length <= 120)
      || ((exact.intent === "MAP" || exact.intent === "TABLE" || exact.intent === "CHART") && exact.refinement)
      // "which one is most serious?" after a list: the top of that list, on its filters
      || (exact.intent === "PRIORITY_INCIDENT_LIST" && exact.refinement && exact.n === 1)
      // plain readings the rules get right every time: "this month vs last month", "road deaths today" (the router once sent
      // these to the planner: 22 s and three models for a count the store gives at once)
      || (exact.intent === "INCIDENT_COUNT" && (exact.vsPrevious || exact.measure === "deaths"))
      // "how many garbage complaints in Kodambakkam in the last 10 days": a count of one kind in one place is the store's; the
      // router once sent it to the planner, which failed, and the answer fell back to district-wide figures for 30 days
      || (exact.intent === "INCIDENT_COUNT" && !!exact.topic && placeData?.zone != null && message.length <= 110
        && !/\b(why|trend|compare|vs\.?|versus|rising|increas\w*|decreas\w*|chart|map|by|per|each|average|avg|percent\w*|rate|share)\b/i.test(message))
      // "incidents in ward 120 this month": the store filters by the ward number; the router once matched "Ward 120" as a
      // place name in titles and answered zero beside 24 recorded
      || (placeData?.ward_asked === true && (exact.intent === "INCIDENT_LIST" || exact.intent === "INCIDENT_COUNT") && !exact.topic
        && message.length <= 100 && !/\b(why|trend|compare|vs\.?|versus|rising|increas|decreas|chart|map)\b/i.test(message))
      // no model: the rules answer, except a question one console tool plainly answers ("which ward has the most garbage
      // complaints", "average resolution time"), which takes that tool as it does with a model
      || (!aiStatus().available && !(directTool(message) && !(turns.length && isRefinement(message, !!placeData)))
        // (one incident described in words, "when was the Porur bund breach reported", is told as its story below)
        // (places compared side by side are counted the same way each, below)
        && !sidesOf(message) && !storySearchText(message, names) && !CONTACT.test(message)
        && !(STORY.test(message) && STORY_THING.test(message) && !/\bINC-/i.test(message))))) {
    const r = await fast(consoleScope);
    if (r) return r;
  }
  // places compared side by side: split, resolved and counted the same way each, without a model
  // the AI reads every question while it is up: the keyword shortcuts below answer only when it is not (exact requests, pinned
  // charts and the AI query planner stay)
  const rulesOnly = !aiStatus().available;
  const sides = rulesOnly && !i.pinId && !i.insightKey ? sidesOf(message) : null;
  if (sides) {
    const r = await fast(consoleScope, { ...exact, intent: "COMPARISON", sides, refinement: false, because: "a comparison of places, side by side" });
    if (r) return r;
  }
  // a named kind of case ("any murder in the past 24 hrs", "rape cases this month in Anna Nagar"): the matching cases listed,
  // searched by meaning in department records and the news linked to them, or "none recorded" said plainly
  if (rulesOnly && !sides && !i.pinId && !i.insightKey && exact.topic?.narrow && !/\b(why|trend|compare|vs\.?|versus|rising|increas|decreas|how many|count|number of|per (zone|ward|month))\b/i.test(message)) {
    const r = await fast(consoleScope, { ...exact, intent: exact.intent === "PRIORITY_INCIDENT_LIST" ? exact.intent : "INCIDENT_LIST", refinement: false,
      because: `a named kind of case (${exact.topic.label}): the matching cases` });
    if (r) {
      r.card.caveats.push("Checked department records (police, complaints, PWD, hospitals) and the news reports linked to them.");
      return r;
    }
  }
  const lastId = turns.filter((t) => t.role === "assistant").slice(-1)[0]?.message_id ?? "";
  const routeKey = `${lang}|${message.toLowerCase()}|${scopeKey(consoleScope)}|${now}|${lastId}`;
  // a pin re-runs its own tools (no router): same question, same design, latest data
  const pin = i.pinId ? await getPin(i.user, i.pinId) : null;
  const pinTools = (pin?.plan?.tools ?? []) as { name: string; args: Record<string, unknown> }[];
  if (pin && pinTools.length) {
    const s = (pinTools.find((t) => t.args?.scope)?.args.scope as Scope | undefined) ?? consoleScope;
    route = { intent: "tool_question", language: null, normalized: String(pin.question), scope: s, scopeRaw: {}, tools: pinTools, chartEdit: null, actions: [],
      clarify: null, refusal: null, assumptions: ["Pinned answer, run again on the latest data."], offline: false };
  }
  // an insight opens with its own tools too; its "why it matters" travels with the card
  const insight = !route && i.insightKey ? await insightByKey(i.user, i.insightKey, i.lockDept ?? null) : null;
  if (insight) {
    const s = (insight.tools.find((t) => t.args?.scope)?.args.scope as Scope | undefined) ?? consoleScope;
    route = { intent: "tool_question", language: null, normalized: insight.question, scope: s, scopeRaw: {}, tools: insight.tools, chartEdit: null, actions: [],
      clarify: null, refusal: null, assumptions: [`From today's insights: ${insight.finding}`], offline: false };
  }
  // a question plainly answered by one console tool (the verification queue, the department backlog, news with no
  // department record): that tool, decided in code; the composer still writes the answer from its facts
  // a bare "why?" / "reason?" after an answer: what drove the previous answer's figures, on its scope (period, place, category);
  // it was once answered "I didn't understand that"
  // (an answer from the store keeps no tools in its plan: its card's scope says what it covered)
  const lastAnswer = turns.findLast((t) => t.role === "assistant");
  const prevScope = ((lastAnswer?.plan?.tools as { args?: { scope?: Scope } }[] | undefined)?.find((t) => t.args?.scope)?.args?.scope)
    ?? (lastAnswer?.scope && typeof lastAnswer.scope === "object" && (lastAnswer.scope as Scope).period ? lastAnswer.scope as Scope : undefined);
  if (rulesOnly && !route && !i.pinId && !i.insightKey && prevScope && (BARE_WHY.test(message) || whyAboutThat(message, !!placeData))) {
    // "why is the first one so high?" after a ranking of zones: that zone, as the Collector saw it (it was once explained with
    // the whole district, and answered "garbage is 100% of reports")
    const picked = await zoneAtPosition(i.user, sessionId, message);
    const s = ScopeSchema.parse(picked != null ? { ...prevScope, zone: picked } : prevScope);
    route = { intent: "tool_question", language: null, normalized: message, scope: s, scopeRaw: {}, tools: [{ name: "change_drivers", args: { scope: s } }],
      chartEdit: null, actions: [], clarify: null, refusal: null, assumptions: ["Read as: why the previous answer's figures are what they are (what changed, where, and what drove it)."], offline: false };
  }
  // "is it getting worse?" after the air quality or a price: the same readings again, against their usual level (the 28-day mean
  // or the previous report), not the incidents; after anything else, what changed and why
  const prevTools = (lastAnswer?.plan?.tools ?? []) as { name: string; args: Record<string, unknown> }[];
  if (rulesOnly && !route && !i.pinId && !i.insightKey && prevScope && message.length <= 50 && /^\s*(is|are|has|have)\s+(it|that|this|they|these|those)\b/i.test(message)
    && /\b(getting|got|becoming) (better|worse)|\b(improv|worsen)(ing|ed)\b|\b(rising|falling|going up|going down)\b/i.test(message)) {
    const reading = prevTools.find((t) => t.name === "environment" || t.name === "mandi_prices");
    const s = ScopeSchema.parse(prevScope);
    route = { intent: "tool_question", language: null, normalized: message, scope: s, scopeRaw: {}, tools: reading ? [reading] : [{ name: "change_drivers", args: { scope: s } }],
      chartEdit: null, actions: [], clarify: null, refusal: null, offline: false,
      assumptions: [reading ? "Read as: the same readings, against their usual level." : "Read as: whether the previous answer's figures are rising or falling, and why."] };
  }
  // a breakdown or a calculation no console tool offers ("dengue per ward week by week since 1 September", "complaints through
  // each channel", "wards with more than 10 flooding incidents", "average hours to close road damage by zone"): the model plans the
  // query, code compiles and runs it read-only. The rules below once took all four and answered "not recorded".
  if (!route && !i.pinId && !i.insightKey && aiStatus().available && needsQuery(message)) {
    // ("week by week" or "per month" is a grouping, not the period: it once limited "since 1 September" to the last 7 days)
    const periodWords = message.replace(/\b(week|month|day) by (week|month|day)\b|\b(per|by|each|every)\s+(day|week|month|hour)s?\b|\b(day|week|month)[- ]?wise\b/gi, " ");
    route = { intent: "adhoc_question", language: null, normalized: message, scope: { ...consoleScope, period: customWindow(periodWords)?.period ?? periodFromWords(periodWords) ?? consoleScope.period }, scopeRaw: {},
      tools: [], chartEdit: null, actions: [], clarify: null, refusal: null, offline: false, forcedQuery: true,
      assumptions: ["A breakdown no console view offers: the figures were computed with a query on the records."] };
  }
  // a named case or story ("youtuber harish case give me brief") is that story, before any keyword rule: "brief" once
  // answered it with the whole district's briefing
  if (rulesOnly && !route && !i.pinId && !i.insightKey && storySearchText(message, names)) route = storyRoute(message, consoleScope, names);
  const direct = rulesOnly && !route && !i.pinId && !i.insightKey && !(turns.length && isRefinement(message, !!placeData)) ? directTool(message) : null;
  if (direct) {
    const s = { ...consoleScope, period: periodFromWords(message) ?? consoleScope.period };
    // "which ward has the most garbage complaints": the ranking counts only the kind the question names
    if (["zones", "taluks", "departments", "place_breakdown"].includes(direct.name) && !s.cat) {
      const c = classify(message);
      if (c && c.conf >= 0.6 && names.cats.has(c.code)) s.cat = c.code;
      // "which road has the most?" after "road accidents this month": the ranking counts what the previous answer counted
      else if (prevScope?.cat && message.length <= 60 && names.cats.has(prevScope.cat)) {
        s.cat = prevScope.cat;
        if (prevScope.period && !PERIOD_WORDS.test(message)) s.period = prevScope.period;
      }
    }
    // "average resolution time for Metrowater": that department's pace (its row and the district's, side by side)
    if (direct.name === "resolution_times" && !s.dept) {
      const d = deptFromWords(message, names);
      if (d) s.dept = d.code;
    }
    // "why did flooding rise in Adyar?": the place the question names narrows the explanation to its zone
    if (direct.name === "change_drivers" && s.zone == null && placeData?.zone != null) s.zone = Number(placeData.zone);
    // "what happened in Velachery this week": the briefing for that zone
    if (direct.name === "briefing" && s.zone == null && placeData?.zone != null) s.zone = Number(placeData.zone);
    route = { intent: "tool_question", language: null, normalized: message, scope: s, scopeRaw: {}, tools: [{ name: direct.name, args: { scope: s, ...direct.args } }],
      chartEdit: null, actions: [], clarify: null, refusal: null, assumptions: [`Read as: ${direct.because}.`], offline: false };
  }
  // a kind of event the district's data has no word for ("earthquakes this week"): its words are searched in the records, and
  // "none recorded" is said plainly; the router once listed every incident of the week for it
  if (rulesOnly && !route && !i.pinId && !i.insightKey && !exact.topic && !placeData && !deptFromWords(message, names) && !turns.length
      && ["INCIDENT_LIST", "INCIDENT_COUNT", "PRIORITY_INCIDENT_LIST", "GENERAL_DISTRICT_QUERY"].includes(exact.intent) && ASKS_WHEN_OR_HOW_MANY.test(message)
      && !PRICE_OR_READING.test(message) && unknownSubject(message, names).length) {
    const s = { ...consoleScope, period: periodFromWords(message) ?? consoleScope.period };
    route = { intent: "tool_question", language: null, normalized: message, scope: s, scopeRaw: {}, tools: [{ name: "search_records", args: { text: message, scope: s } }],
      chartEdit: null, actions: [], clarify: null, refusal: null, assumptions: ["Not a kind of incident the console files: its words were searched in the records."], offline: false };
  }
  if (!route) route = cached<Route>(routeKey);
  if (!route && agentFailed) {
    // the agent was tried and could not answer: the rules, without a second wait on the model
    route = !i.pinId && !i.insightKey ? storyRoute(message, consoleScope, names) : null;
    if (!route && !i.pinId && !i.insightKey) {
      const r = await fast(consoleScope);
      if (r) { r.card.offline = true; return r; }
    }
    route ??= rulesRoute(message, consoleScope, names, placeData?.zone != null, placeData);
  }
  if (!route) {
    if (aiStatus().available) {
      try {
        route = await llmRoute(i, message, detected.lang, consoleScope, names, turns, place, now, models);
        remember(routeKey, route);
      } catch (e) {
        if (i.signal?.aborted) throw e;
        if (e instanceof AiBudgetError) return finish(errorCard(card0(null), e.message), { intent: "error" });
        if (!(e instanceof AiBusyError)) console.warn("[assistant] router failed; the rules answer:", (e as Error).message);
        notes.push(e instanceof AiBusyError ? `The AI service was busy (retry in ${e.retryAfter} s), so this was answered from the data without it.`
          : `The AI step failed (${(e as Error).message.slice(0, 200)}), so this was answered from the data without it.`);
        // the model is out: the keyword rules answer what they can from the store
        // ("youtuber harish case what happened": a story named in words is searched for, not answered with the newest incidents)
        route = !i.pinId && !i.insightKey ? storyRoute(message, consoleScope, names) : null;
        if (!route && !i.pinId && !i.insightKey) {
          const r = await fast(consoleScope);
          // (finish already added `notes` to the card's limits: pushing them again showed the note twice)
          if (r) { r.card.offline = true; return r; }
        }
        route ??= rulesRoute(message, consoleScope, names, placeData?.zone != null, placeData);
      }
    } else {
      const problem = aiStatus().problem;
      notes.push(problem ? `${problem}: this was answered from the data by rules, without the language model.`
        : "The AI service is not available right now, so this was answered from the data by rules, without the language model.");
      route = (!i.pinId && !i.insightKey ? storyRoute(message, consoleScope, names) : null) ?? rulesRoute(message, consoleScope, names, placeData?.zone != null, placeData);
    }
  }
  // the reply language: the chip, else Tamil script, else the rules' or the router's Tanglish
  if (i.language === "auto") lang = detected.lang !== "en" ? detected.lang : route.language === "tanglish" || (route.language === "ta" && !hasTamilScript(message)) ? "tanglish" : route.language === "ta" ? "ta" : "en";
  // the code's corrections to the router's reading (ROUTE_FIXES), in order; the ones that applied are kept with the plan
  const fixCtx: FixCtx = { i, message, names, now, placeData, turns, ctx, exact, guard, notes, fast, finish, card0, typed: !i.pinId && !i.insightKey,
    prevAnswer: turns.some((t) => t.role === "assistant" && t.plan?.tools?.length),
    onlyPlace: placeData?.zone != null && !/INC-[A-Z0-9]/i.test(message) && !STORY_THING.test(message.replace(/\b(case|cases|incident|incidents)\b/gi, " ")) };
  const fixes: string[] = [];
  for (const fix of ROUTE_FIXES) {
    const r = await fix.run(route, fixCtx);
    if (!r) continue;
    if ("done" in r) return r.done;
    route = r;
    fixes.push(fix.name);
  }
  if (fixes.length) console.info(`[assistant] corrections: ${fixes.join(", ")}`);
  const plan = { intent: route.intent, normalized: route.normalized, scope: route.scope, tools: route.tools, chartEdit: route.chartEdit, offline: route.offline, fixes };

  switch (route.intent) {
    case "out_of_scope":
      return finish(refusalCard(card0(null), null), plan);
    case "unsafe":
      return finish(refusalCard(card0(null), /personal|phone|address|aadhaa?r|name/i.test(route.refusal ?? "") ? "personal data"
        : /delet|chang|modif|updat|data change/i.test(route.refusal ?? "") ? "data change" : /email|mail/i.test(route.refusal ?? "") ? "email outside the official directory"
          : /instruction|prompt|rule/i.test(route.refusal ?? "") ? "instructions" : null), plan);
    case "smalltalk":
      return finish(smalltalkCard(card0(null), message), plan);
    case "email_followup":
      return finish(notYetCard(card0(null)), plan);
    case "unknown":
      return finish(clarifyCard(card0(null), { en: "I didn't understand that. Ask about incidents, complaints, news, places or departments, or try one of these:",
        ta: "இதைப் புரிந்துகொள்ள முடியவில்லை. சம்பவங்கள், புகார்கள், செய்திகள், இடங்கள் அல்லது துறைகள் பற்றிக் கேளுங்கள், அல்லது இவற்றில் ஒன்றை முயலுங்கள்:",
        tanglish: "Idhu puriyala. Incidents, complaints, news, places illa departments pathi kelunga, illa idhula onnu try pannunga:" }[lang]), plan);
    case "console_action": {
      const acts = validActions(route.actions, names, lang, []);
      return finish(actionCard(card0(route.scope), acts), plan);
    }
  }
  if (route.clarify) return finish(clarifyCard(card0(route.scope), route.clarify), plan);

  // 3. fetch
  i.stage("fetching");
  if (route.intent === "chart_edit") {
    const edited = await chartEdit(i, route, lang, names, now, sessionId);
    if (edited) return finish(edited.card, { ...plan, intent: "chart_edit", tools: edited.tools });
    // "make it a donut" after a list of incidents: there is nothing to redraw, so say so (it once said "I could not fetch data")
    if (!route.tools.length) return finish(clarifyCard(card0(null), {
      en: "The last answer has no figures to chart (it is a list or a single record). Ask for counts, for example by zone or by department, and I'll chart them.",
      ta: "கடைசி பதிலில் வரைபடமாக்கக்கூடிய எண்ணிக்கைகள் இல்லை. மண்டல வாரியாக அல்லது துறை வாரியாக எண்ணிக்கைகளைக் கேளுங்கள்.",
      tanglish: "Last answer-la chart panna figures illa. Zone-wise illa department-wise counts kelunga, chart pannidren." }[lang]), { ...plan, intent: "chart_edit" });
  }
  let tools = route.tools;
  // what the answer is about: a follow-up ("only Zone 13") is read as the question it edits
  let question = message;
  if ((route.intent === "plan_edit" || route.intent === "chart_edit") && !tools.length) {
    // the previous answer's tools, on the previous answer's scope with only the changes the follow-up asked for
    const at = turns.findLastIndex((t) => t.role === "assistant" && t.plan?.tools?.length);
    const prev = turns[at];
    const prevQ = at > 0 && turns[at - 1].role === "user" ? String(turns[at - 1].content_text ?? "") : "";
    // the router tends to echo the console's period; a follow-up keeps the previous answer's period unless it names one
    const change: Row = { ...route.scopeRaw };
    if (!PERIOD_WORDS.test(message)) delete change.period;
    tools = (prev?.plan?.tools ?? []).map((t: Row) => ({ name: t.name, args: t.args?.scope ? { ...t.args, scope: applyScope(t.args.scope as Scope, change, names) } : t.args }));
    const s = tools.find((t) => t.args.scope)?.args.scope as Scope | undefined;
    if (s) route = { ...route, scope: s };
    if (prevQ) question = `${prevQ} (${message})`;
  }
  if ((route.intent === "briefing" || route.intent === "insight_request") && !tools.some((t) => t.name === "briefing")) tools = [{ name: "briefing", args: { scope: route.scope } }, ...tools].slice(0, 3);
  if (route.intent === "bulk_request") {
    tools = [{ name: "overview_kpis", args: { scope: route.scope } }, { name: "zones", args: { scope: route.scope } }, { name: "departments", args: { scope: route.scope } }];
    notes.push(`Large requests are summarised rather than listed: at most ${LIMITS.rowsShown} records are shown in an answer and ${LIMITS.exportRows.toLocaleString("en-IN")} rows exported.`);
  }
  if (route.intent === "help") return finish(await helpAnswer(i, route, message, lang, names, now, models), plan);

  const results: ToolResult[] = [];
  const toolLog: AnswerCard["sources"]["tools"] = [];
  let adhoc: { plan: QueryPlan; results: QueryResult[] } | null = null;
  let usePlanner = route.intent === "adhoc_question" || (!tools.length && route.intent === "tool_question");
  // tools first: a tool question the router named no tool for, or a planner question a console tool clearly answers
  // ("tomato price"), takes the rules' pick; the planner is for groupings no tool offers, and is slower and less certain
  const rulesPick = usePlanner ? rulesRoute(message, route.scope, names, placeData?.zone != null) : null;
  // (a breakdown sent to the planner in code keeps it: "average hours to close road damage by zone" was answered with the zone
  // counts, which hold no times, and said "not recorded"; the rules' pick stays the fallback when the planner fails)
  if (rulesPick && rulesPick.intent === "tool_question" && rulesPick.tools.length && !route.forcedQuery
    && ((!tools.length && route.intent === "tool_question") || PREFER_TOOL.has(rulesPick.tools[0].name))) {
    tools = rulesPick.tools;
    usePlanner = false;
    route = { ...route, intent: "tool_question", scope: rulesPick.scope, assumptions: [...route.assumptions, `Answered with the console's ${tools[0].name} data.`] };
  }
  if (usePlanner) {
    if (!aiStatus().available) return finish(clarifyCard(card0(route.scope), "This question needs the query planner, which needs the AI provider (the AWS keys for Amazon Bedrock)."), plan);
    try {
      adhoc = await planAndRun(i, route, message, now, models);
    } catch (e) {
      if (i.signal?.aborted) throw e;
      if (e instanceof AiBusyError || e instanceof AiUnavailableError) return finish(errorCard(card0(route.scope), (e as Error).message), plan);
      console.warn(`[assistant] planner could not build a query: ${(e as Error).message.slice(0, 300)}`);
      // the planner could not build a query: the console's own data for the question, when the rules find some
      if (rulesPick && rulesPick.intent === "tool_question" && rulesPick.tools.length) {
        tools = rulesPick.tools;
        usePlanner = false;
        notes.push("The query planner could not build a query for this; it was answered with the console's own data instead.");
      } else {
        return finish(errorCard(card0(route.scope), { en: "I could not build a query for that question from the data I have.", ta: "என்னிடம் உள்ள தரவைக் கொண்டு இந்தக் கேள்விக்கு பதில் தயாரிக்க முடியவில்லை.",
          tanglish: "Ennoda data-la indha kelvikku query build panna mudiyala." }[lang]), { ...plan, error: (e as Error).message });
      }
    }
  }
  if (!usePlanner) {
    // a follow-up re-runs the previous answer's tools: they are locked again
    if (i.lockDept) tools = lockTools(tools, i.lockDept, route.scope, notes);
    for (const t of tools.slice(0, LIMITS.queriesPerQuestion)) {
      const t0 = Date.now();
      try {
        const r = await runTool(t.name, t.args);
        if (i.lockDept && otherDeptsIncident(r, i.lockDept)) {
          notes.push("That incident is handled by another department, so it is not shown on your department's console.");
          continue;
        }
        results.push(r);
        toolLog.push({ name: t.name, args: t.args, ms: Date.now() - t0 });
      } catch (e) {
        if (e instanceof ToolError) notes.push(`Skipped ${t.name}: ${e.message}`);
        else throw e;
      }
    }
    if (!results.length) return finish(errorCard(card0(route.scope), { en: "I could not fetch data for that question.", ta: "அந்தக் கேள்விக்கான தரவைப் பெற முடியவில்லை.",
      tanglish: "Andha kelvikku data edukka mudiyala." }[lang]), plan);
  }

  // 4. compose
  const card = await composeStage(i, { route, results, toolLog, adhoc, question, message, lang, names, now, placeData, insight, pin, models, turns });
  return finish(card, { ...plan, tools: toolLog.map((t) => ({ name: t.name, args: t.args })), adhoc: adhoc?.plan ?? null });
}

/** Step 4: the answer card from the tools' results (or the ad-hoc query's rows), written by the composer and checked. */
async function composeStage(i: ChatInput, s: { route: Route; results: ToolResult[]; toolLog: AnswerCard["sources"]["tools"]; adhoc: { plan: QueryPlan; results: QueryResult[] } | null;
  question: string; message: string; lang: Lang; names: RefNames; now: string; placeData: Row | null; insight: Awaited<ReturnType<typeof insightByKey>>;
  pin: Row | null; models: CallInfo[]; turns: Row[] }): Promise<AnswerCard> {
  const { route, results, toolLog, adhoc, question, message, lang, names, now, placeData, insight, pin, models, turns } = s;
  i.stage("drawing");
  // readings, prices and directories are not period-bound: their card says "Latest data", not the console's period
  const scope = adhoc ? route.scope : results[0]?.scope ?? null;
  const base = baseCard(lang, scope, scope ? describeScope(scope, names, lang, now) : `${TEXT.latest[lang]} · ${TEXT.asOf[lang]} ${fmtAsOf(now, lang)}`, now);
  // an ad-hoc query sets its own dates ("since July"): the card says those, not the console's period
  const adhocDates = adhoc ? adhocPeriod(adhoc.plan, lang) : null;
  if (adhocDates && base.scopeLine) base.scopeLine = base.scopeLine.replace(/^[^·]+·/, `${adhocDates} ·`);
  let p: Presentation;
  let facts: Fact[];
  let testData: boolean;
  let caveats: string[];
  // "top 3" shows three: the drawn dataset keeps exactly that many rows
  const topN = requestedCount(question) ?? requestedCount(route.normalized);
  if (adhoc) {
    const datasets = adhoc.results.map(resultDataset);
    const chart = datasets[0] ? adhocChart(adhoc.plan, datasets[0]) : null;
    p = { datasets, chart, kpis: [], table: chart ? null : datasets[0]?.id ?? null, display: chart ? (chart.type.startsWith("map") ? "map" : "chart") : "table" };
    if (datasets[0] && datasets[0].rows.length === 1 && !chart) {
      const vf = datasets[0].fields.filter((f) => f.kind === "value");
      p.kpis = vf.map((f) => ({ label: f.label, value: Number(datasets[0].rows[0][f.key]), format: f.format }));
      p.display = "kpi";
    }
    if (topN) p = applyTopN(p, topN, question);
    facts = [...adhocFacts(adhoc.results), ...buildFacts([], p.datasets)];
    testData = adhoc.results.some((r) => r.testData);
    // departmental mock data is allowed: answers do not label or count it (product decision, 12 Oct)
    caveats = adhoc.results.flatMap((r) => r.notes);
    base.sources.sql = adhoc.results.flatMap((r) => r.sql.map((s) => ({ text: s.text, params: s.params })));
    base.sources.plan = adhoc.plan;
    base.sources.rows = adhoc.results.reduce((a, r) => a + r.rows.length, 0);
    base.sources.refs = [...new Set(adhoc.results.map((r) => r.compiled.table.name))].map((t) => ({ kind: "table", name: t }));
    base.sources.assumptions.push(...adhoc.plan.assumptions);
  } else {
    p = presentAll(results, question, lang);
    if (topN) p = applyTopN(p, topN, question);
    facts = buildFacts(results, p.datasets);
    testData = results.some((r) => r.testData);
    caveats = [...new Set(results.flatMap((r) => r.caveats))];
    base.sources.tools = toolLog;
    base.sources.refs = results.flatMap((r) => r.sources);
    base.sources.incidentIds = [...new Set(results.flatMap((r) => r.incidentIds))].slice(0, 40);
    base.sources.rows = p.datasets.reduce((a, d) => a + d.rows.length, 0);
  }
  const taluk = scope?.taluk ? names.taluks.get(scope.taluk) : null;
  if (taluk?.note) caveats.push(`${taluk.name} taluk: ${taluk.note}.`);
  if (insight) {
    caveats.unshift(`Why it matters: ${insight.why}`);
    base.sources.incidentIds = [...new Set([...insight.incidentIds, ...base.sources.incidentIds])].slice(0, 40);
  }
  // a locality has no filter of its own: say the figures cover the zone (and taluk) around it, so the answer cannot claim the locality
  const loc = placeData?.place ? String(placeData.place) : null;
  const zoneName = scope?.zone != null ? names.zones.get(scope.zone)?.name ?? null : null;
  const matchedByName = results.some((r) => r.tool === "place_breakdown" && (r.data as Row | null)?.locality);
  if (loc && scope && placeData?.zone != null && scope.zone === placeData.zone && zoneName && zoneName.toLowerCase() !== loc.toLowerCase()
    && !(taluk && taluk.name.toLowerCase() === loc.toLowerCase()) && !matchedByName) {
    caveats.push(`${loc} has no filter of its own: these figures cover ${zoneName} zone (Zone ${scope.zone})${taluk ? ` within ${taluk.name} taluk` : ""}, which includes it.`);
  }
  const namedTaluk = placeData?.taluk_named as Row | null | undefined;
  if (namedTaluk && namedTaluk.code !== scope?.taluk && namedTaluk.code !== placeData?.taluk) {
    caveats.push(`${namedTaluk.name} is also a revenue taluk${namedTaluk.note ? ` (${namedTaluk.note})` : ""}; ask for "${namedTaluk.name} taluk" to see it.`);
  }
  // a feed this answer drew on that is more than twice its refresh interval behind: say which, not "the data is old"
  caveats.push(...(await staleCaveats(adhoc ? [] : results, adhoc ? adhoc.results.map((r) => r.compiled.table.name) : [])));

  let card = await compose(i, { base, route, message: question, lang, p, facts, testData, caveats, results, names, models, now, previous: plainSummary(turns), count: topN,
    parts: ((results.find((r) => r.tool === "category_summary")?.data as Row | undefined)?.parts as Row[] | undefined)?.map((x) => String(x.part)) ?? null,
    visual: needsPicture(question, results, !!route.visual || !!insight || !!pin?.chart) });
  if (insight) card = { ...card, insightKey: insight.key };
  // a pin keeps the chart the Collector chose
  if (pin?.chart && card.kind === "answer") {
    const c = checkChart(pin.chart as ChartSpec, card.datasets, card.chart).spec;
    if (c) card = { ...card, chart: c, display: c.type.startsWith("map") ? "map" : c.type === "table" ? "table" : "chart" };
  }
  if (route.intent === "bulk_request") card = bulkFinish(card, route, names, lang, message, p);
  return card;
}

// ---------------------------------------------------------------- compose --

interface ComposeCtx {
  base: AnswerCard; route: Route; message: string; lang: Lang; p: Presentation; facts: Fact[]; testData: boolean; caveats: string[];
  results: ToolResult[]; names: RefNames; models: CallInfo[]; now: string;
  /** the last few turns, so the answer can refer back to them */
  previous: string;
  /** how many items the question asked for ("top 3"), or null */
  count: number | null;
  /** the subjects of a question about several at once, each to be answered */
  parts: string[] | null;
  /** the question asks for a chart, graph, diagram or map; otherwise the card answers in words and offers the picture */
  visual: boolean;
}

async function compose(i: ChatInput, c: ComposeCtx): Promise<AnswerCard> {
  const { base, p, facts, lang } = c;
  base.datasets = p.datasets;
  base.kpis = p.kpis;
  base.testData = c.testData;
  const quotable = p.datasets.flatMap((d) => d.rows.flatMap((r) => Object.values(r).filter((v): v is string => typeof v === "string" && v.length > 12)));
  // the caveats are written by the code from the data (e.g. "1,080 of 1,228 incidents …"): a draft that repeats them is not inventing numbers
  // ward and zone numbers in the rows ("Ward 147") name a place, not a figure: the checker knows them
  const placeNumbers = p.datasets.flatMap((d) => d.fields.filter((f) => f.kind !== "value").flatMap((f) => d.rows.flatMap((r) => {
    const v = r[f.key];
    return typeof v === "number" && /zone|ward/i.test(f.key) ? [v] : typeof v === "string" ? (v.match(/^(?:Ward|Zone)\s+(\d{1,3})$/i)?.slice(1).map(Number) ?? []) : [];
  })));
  // an incident's news articles, as their text says it (incident_story): the story is told from them, and the figures they
  // state may be quoted ("detained four hours into a 24-hour agitation")
  const articles = c.results.flatMap((r) => ["incident_story", "incident_detail", "search_records"].includes(r.tool) ? ((r.data as { articles?: string[] }).articles ?? []) : []);
  const context = [...contextNumbers(c.message, base.scopeLine, c.route.normalized, ...c.caveats, ...articles), ...placeNumbers];
  quotable.push(...articles);
  const fallback = (why: string | null): AnswerCard => {
    const t = templateCard({ ...base, table: p.table, display: p.display, chart: p.chart ? checkChart(p.chart, p.datasets).spec : null, caveats: c.caveats }, p, facts, p.kpis);
    t.followUps = EXAMPLES[lang].slice(0, 3);
    t.sources.verifier = { checked: 0, unmatched: [], regenerated: false, template: true };
    if (why) t.sources.limits.push(why);
    t.consoleActions = validActions(defaultActions(p, c.results), c.names, lang, base.sources.incidentIds);
    t.visualAsked = c.visual;
    if (!c.visual) {
      const list = wantsTable(c.message) ? t.table ?? t.datasets[0]?.id ?? null : null;
      t.display = list ? "table" : "text";
      if (list) t.table = list;
    }
    return t;
  };
  if (c.route.offline || !aiStatus().available) return fallback(null);

  // semantic cache: two questions that mean the same ("Anna Nagar issues?" / "what is going on in Anna Nagar") get the same
  // decision and the same tools on the same data, so the verified answer is reused; the wording only matters without a decision
  const d = c.route.decision;
  const cache = `card|${lang}|${d ? `${d.answer}|${d.focus}|${d.count ?? ""}` : c.route.normalized.toLowerCase()}|${JSON.stringify(c.route.tools)}|${c.now}`;
  const hit = cachedCard(cache);
  if (hit) {
    hit.sources.limits = [...hit.sources.limits, "Same question on the same data as a few minutes ago: the earlier verified answer was reused."];
    return { ...hit, id: base.id };
  }

  // the card's main figure: the answer must state it, not another fact's value in its place ("0 accidents" when 4 match)
  // (an explanation of a change leads with the change and its drivers, not with the period's total)
  const explaining = c.results.some((r) => r.tool === "change_drivers");
  // ("which ward has the most complaints?" is answered by the leader, not by the place's total: no lead fact for a ranking)
  const ranking = /\bwhich\b.{0,60}\b(most|highest|least|lowest|fewest|worst|best)\b/i.test(c.message);
  const lead = !explaining && !ranking && p.kpis[0] && Number.isFinite(Number(p.kpis[0].value)) ? { label: p.kpis[0].label, value: Number(p.kpis[0].value) } : null;
  // a small figure may be written as a word ("three complaints await you"), as people write it
  const LEAD_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const statesLead = (d: ComposerOutput) => !lead || extractNumbers(`${d.headline} ${d.answerMarkdown}`, quotable)
    .some((n) => Math.abs(n.value - lead.value) < 0.01 || Math.abs(n.value - lead.value) <= Math.abs(lead.value) * 0.005)
    || (Number.isInteger(lead.value) && lead.value >= 0 && lead.value < LEAD_WORDS.length
      && new RegExp(`\\b${LEAD_WORDS[lead.value]}\\b`, "i").test(`${d.headline} ${d.answerMarkdown}`));
  // whether records are synthetic is never part of an answer (departmental mock data is allowed; no real/synthetic counts)
  const testLine = "not relevant: never mention test, synthetic or real data";
  const ctx = {
    question: c.message, normalized: c.route.normalized, scopeLine: base.scopeLine, asOf: base.asOf, testData: testLine, caveats: c.caveats,
    facts: factLines(promptFacts(facts, p)), lead: lead ? `${lead.label} = ${lead.value}` : "", datasets: datasetsText(p.datasets, [p.chart?.dataset, p.table])
      + (articles.length ? `\n\nnews articles about this incident (different reports of it; read them all and tell ONE story from them, each fact once, the latest development last; where reports differ on a figure or name, say so):\n${articles.map((a) => `- ${a}`).join("\n")}` : ""), suggested: p.chart ? JSON.stringify(p.chart) : p.display === "kpi" ? "kpi tiles" : "none",
    actions: allowedActionsText(p, c.results, base.scope?.period ?? null, i.scope.period), previous: c.previous, repair: "", count: c.count, parts: c.parts, visual: (c.visual ? "yes" : "no") as "yes" | "no"
  };
  // only the instructions this answer needs (fewer tokens against the free tiers' per-minute limits)
  const used = new Set(c.results.map((r) => r.tool));
  const need = { area: ["zone_profile", "place_breakdown", "overview_kpis", "severity", "briefing", "taluks", "zones"].some((t) => used.has(t)), why: explaining,
    story: used.has("incident_story") || used.has("incident_detail"), visual: !!c.visual };
  let draft: ComposerOutput | null = null;
  const factIds = new Set(facts.map((f) => f.id));
  const entityNames: EntityNames = { zone: new Map([...c.names.zones].map(([k, v]) => [String(k), v.name])),
    dept: new Map([...c.names.depts].map(([k, v]) => [k, v.name])), taluk: new Map([...c.names.taluks].map(([k, v]) => [k, v.name])) };
  let verdict = { ok: false, checked: 0, unmatched: [] as string[] };
  let regenerated = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await generateJson({ role: "reasoning", name: "composer", schema: ComposerSchema, lenient: ComposerLenient, system: composerSystem(lang, need), prompt: composerPrompt(ctx),
        temperature: 0.2, maxOutputTokens: 1400, user: i.user, abortSignal: i.signal, chat: true });
      c.models.push(r.info);
      draft = r.object;
      // a figure placed against the wrong zone or department ("Royapuram ... {{zone.8.open}}", Anna Nagar's) is asked again once
      const raw = `${draft.headline}\n${draft.answerMarkdown}`;
      const misbound = [...misboundFacts(raw, entityNames), ...mismeasuredFacts(raw, facts)];
      if (misbound.length && attempt === 0) {
        console.warn(`[assistant] draft put figures against the wrong place: ${misbound.join("; ")}`);
        verdict = { ok: false, checked: 0, unmatched: misbound };
        ctx.repair = `Figures were put against the wrong place or measure: ${misbound.join("; ")}. Each figure must be the fact of the zone, department or taluk its sentence names, and of the measure its words name (complaints or incidents).`;
        regenerated = true;
        continue;
      }
      // grounded citations: {{fact_id}} placeholders become the facts' exact values before anything is checked or shown
      const unknown: string[] = [];
      // a placeholder the model wrote half of ("{{departments.top") is as unknown as a wrong id: it must never reach the card
      const fill = (s: string) => { const f = fillFacts(aliasRowIds(s, factIds), facts); unknown.push(...f.unknown); if (/\{\{|\}\}/.test(f.text)) unknown.push(f.text.match(/\{\{[^\s}]*/)?.[0]?.slice(2) || "malformed placeholder"); return f.text; };
      // ("one person was reported injured 1": a figure the draft already said as a word loses its repeated digits)
      draft = { ...draft, headline: fill(draft.headline), answerMarkdown: withoutEchoedNumbers(fill(draft.answerMarkdown)), voiceSummary: withoutEchoedNumbers(fill(draft.voiceSummary)),
        caveats: draft.caveats.map(fill), chart: draft.chart ? { ...draft.chart, title: fill(draft.chart.title), subtitle: draft.chart.subtitle ? fill(draft.chart.subtitle) : draft.chart.subtitle } : null };
      if (unknown.length) {
        verdict = { ok: false, checked: 0, unmatched: unknown.map((u) => `{{${u}}}`) };
        ctx.repair = `These fact ids do not exist: ${[...new Set(unknown)].join(", ")}. Use only ids listed in FACTS.`;
        regenerated = true;
        continue;
      }
      // a draft that corrects itself ("453 vs 487 is incorrect, Royapuram is 487") passes the number check, every figure
      // being real: asked again once; a second one loses those sentences, and a headline that does it is not shown
      const corrections = selfCorrections(`${draft.headline}\n${draft.answerMarkdown}`);
      if (corrections.length) {
        console.warn(`[assistant] draft corrects itself: ${corrections[0].slice(0, 120)}`);
        if (attempt === 0) {
          verdict = { ok: false, checked: 0, unmatched: ["self-correction in the draft"] };
          ctx.repair = `The draft corrects itself ("${corrections[0].slice(0, 100)}"). State each figure once, correctly, with no corrections or remarks about the draft.`;
          regenerated = true;
          continue;
        }
        if (selfCorrections(draft.headline).length) return fallback("The draft corrected itself twice, so a template wrote this answer.");
        draft = { ...draft, answerMarkdown: withoutSelfCorrections(draft.answerMarkdown).text, voiceSummary: withoutSelfCorrections(draft.voiceSummary).text };
      }
      // an incident id in the prose, or rain given as the cause beside a "timing, not cause" caveat (R-12): asked again once,
      // then taken out by rule
      const allCaveats = [...c.caveats, ...draft.caveats];
      const over = overclaims(`${draft.headline}\n${draft.answerMarkdown}`, allCaveats, draft.answerMarkdown);
      if (over.length) {
        console.warn(`[assistant] draft overclaims: ${over.join("; ")}`);
        if (attempt === 0) {
          verdict = { ok: false, checked: 0, unmatched: over };
          ctx.repair = `Fix these: ${over.join("; ")}. Name incidents by what happened and where, never by id. Say rain coincided with the rise; never that it caused it.`;
          regenerated = true;
          continue;
        }
        draft = { ...draft, headline: withoutOverclaims(draft.headline, allCaveats), answerMarkdown: withoutOverclaims(draft.answerMarkdown, allCaveats),
          voiceSummary: withoutOverclaims(draft.voiceSummary, allCaveats) };
      }
    } catch (e) {
      if (i.signal?.aborted) throw e;
      // a redraft asked only for polish (a figure, the language) failed: the first draft, which passed the checks, stands
      if (draft && verdict.ok && statesLead(draft)) break;
      const why = regenerated ? ` while redrafting (the first draft was rejected: ${verdict.unmatched.join(", ") || "empty text"})` : "";
      return fallback(e instanceof AiBusyError ? `The AI service was busy${why}, so this answer was written from the data by a template.`
        : `The composer failed${why} (${(e as Error).message.slice(0, 160)}); answer written by a template.`);
    }
    if (!draft.headline.trim() || !draft.answerMarkdown.trim()) {
      verdict = { ok: false, checked: 0, unmatched: [] };
      ctx.repair = "The headline and answerMarkdown must not be empty.";
      regenerated = true;
      continue;
    }
    verdict = verifyNumbers([draft.headline, draft.answerMarkdown, draft.voiceSummary, draft.chart?.title ?? "", draft.chart?.subtitle ?? ""], facts, context, quotable);
    if (verdict.ok && !statesLead(draft)) {
      console.warn(`[assistant] draft did not state the lead fact (${lead!.label} = ${lead!.value})`);
      verdict = { ok: false, checked: verdict.checked, unmatched: [`lead fact ${lead!.value} not stated`] };
      ctx.repair = `State the LEAD FACT value (${lead!.label} = ${lead!.value}) as digits in the headline or first sentence.`;
      regenerated = true;
      continue;
    }
    // "which zone has the most open incidents?" answered without a single figure ("Anna Nagar tops the list"): asked again once
    if (verdict.ok && verdict.checked === 0 && attempt === 0 && facts.length
      // ("why is Royapuram so high?" was once explained with no figure at all)
      && /\b(how many|most|highest|lowest|least|fewest|top|count|number of|which|compare|vs\.?|versus|why|explain|reasons?|so (high|low|bad)|worse|better|rise|rising|fall|falling|drop)\b|எத்தனை|evlo|ethana|ஏன்/i.test(c.message)) {
      console.warn("[assistant] draft states no figure: asking again");
      ctx.repair = "The answer states no figure. Give the key figure (the leader's value, and the next ones where they matter) using {{fact_id}} placeholders.";
      regenerated = true;
      continue;
    }
    // a Tanglish question answered in plain English (a fallback model ignoring the language): asked again once
    if (verdict.ok && lang === "tanglish" && attempt === 0 && detectLanguage(`${draft.headline} ${draft.answerMarkdown}`).lang === "en") {
      console.warn("[assistant] draft not in Tanglish: asking again");
      ctx.repair = "Write headline, answerMarkdown, caveats and followUps in Tanglish (Tamil words in English letters, mixed with English terms), not in English.";
      regenerated = true;
      continue;
    }
    if (verdict.ok) break;
    console.warn(`[assistant] verifier rejected numbers: ${verdict.unmatched.join(", ")}`);
    ctx.repair = `These numbers are not in FACTS: ${verdict.unmatched.join(", ")}. Use only fact values (rounding allowed) or remove them.`;
    regenerated = true;
  }
  // the model's wording is kept without the sentences whose numbers could not be verified, when what is left still states
  // the main figure (the template's headline stands in for a dropped one)
  let pruned = 0;
  if (draft && !verdict.ok && verdict.checked > 0 && !verdict.unmatched.some((u) => u.startsWith("{{"))) {
    const sure = (t: string) => !t.trim() || verifyNumbers([t], facts, context, quotable).ok;
    const kept = pruneUnverified(draft, sure);
    if (kept) {
      const headline = kept.headline ?? fallback(null).headline;
      const next = { ...draft, headline, answerMarkdown: kept.answerMarkdown, voiceSummary: kept.voiceSummary ?? headline,
        chart: draft.chart && sure(`${draft.chart.title} ${draft.chart.subtitle ?? ""}`) ? draft.chart : null };
      const v = verifyNumbers([next.headline, next.answerMarkdown, next.voiceSummary], facts, context, quotable);
      if (v.ok && statesLead(next)) {
        console.warn(`[assistant] kept the draft without ${kept.dropped} unverified sentence(s): ${verdict.unmatched.join(", ")}`);
        draft = next;
        pruned = kept.dropped;
        verdict = v;
      }
    }
  }
  if (!draft || !verdict.ok) {
    const t = fallback(`The draft's numbers could not be verified (${verdict.unmatched.join(", ")}), so a template wrote this answer.`);
    t.sources.verifier = { checked: verdict.checked, unmatched: verdict.unmatched, regenerated, template: true };
    return t;
  }

  // a draft cut off mid-sentence ("…the most frequently reported type, with 9 cases,"): ends at its last complete sentence;
  // a line that only captions the chart ("**Chart**: Incidents by ward") goes, since the card draws it
  {
    const md = draft.answerMarkdown.split("\n").filter((l) => !/^\s*[*_]*(chart|graph|map|visual)[*_]*\s*:/i.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
    if (md !== draft.answerMarkdown.trimEnd()) draft = { ...draft, answerMarkdown: md };
    const cut = md.search(/[.!?।)*\]]["”']?\s+[^.!?।]*$/);
    // (a prose last line with no closing punctuation, "…with 49% closed on or", is cut off too; a list item may end bare)
    const last = md.split("\n").pop() ?? "";
    const unfinished = /[,;:\-–(]$/.test(md) || (!/^\s*([-*•]|\d+\.)\s/.test(last) && !/[.!?)"”'*\]]$/.test(md));
    if (unfinished && cut > 40) draft = { ...draft, answerMarkdown: md.slice(0, cut + 1).trimEnd() };
  }
  // a ranking or trend the code drew stays on the card when the model picks plain text: the picture is the evidence
  const keepCode = (draft.display === "text" || (draft.display === "kpi" && !p.kpis.length)) && !!p.chart && (p.display === "chart" || p.display === "map");
  const wantsChart = draft.display === "chart" || draft.display === "map" || keepCode;
  const checked = wantsChart ? checkChart(keepCode ? p.chart : draft.chart, p.datasets, p.chart) : { spec: null, fixes: [] as string[] };
  // the model's chart goes through the same form rules as the code's: a before -> after comparison becomes a dumbbell, a
  // share a donut, and so on (bestType); the type the data fits wins over the type the model happened to pick
  const chosen = checked.spec;
  const cds = chosen ? p.datasets.find((x) => x.id === chosen.dataset) : null;
  const best = chosen && cds ? bestType(chosen, cds, c.message) : null;
  const chart = chosen && best && best !== chosen.type ? checkChart({ ...chosen, type: best }, p.datasets, chosen).spec ?? chosen : chosen;
  let display = draft.display;
  if (wantsChart && !chart) display = p.kpis.length ? "kpi" : p.table ? "table" : "text";
  if (chart) display = chart.type.startsWith("map") ? "map" : chart.type === "table" ? "table" : chart.type === "kpi" ? "kpi" : "chart";
  if (display === "kpi" && !p.kpis.length) display = chart ? "chart" : "text";
  // the question decides: a chart or map only when it asked for a picture, a table only when it asked for a list
  if (!c.visual) display = wantsTable(c.message) && !!(p.table ?? p.datasets[0]) ? "table" : "text";
  const table = display === "table" ? p.table ?? p.datasets[0]?.id ?? null : p.table;
  const card: AnswerCard = {
    ...base, display, headline: draft.headline.trim().slice(0, 140), answerMarkdown: dedupeSentences(stripHtml(draft.answerMarkdown), draft.headline).slice(0, 1400),
    voiceSummary: draft.voiceSummary.trim().slice(0, 400), chart: display === "chart" || display === "map" || !c.visual ? chart : null, table, visualAsked: c.visual,
    // a Tanglish voice line should be in Tamil script for the Tamil voice; in English letters, the English (India) voice reads it better
    voiceLang: lang === "tanglish" && !hasTamilScript(draft.voiceSummary) ? "en-IN" : base.voiceLang,
    // the model's reason only while its own chart form stands (the form rules may have changed it)
    chartReason: chart && draft.chart && chart.type === draft.chart.type ? draft.chartReason?.trim().slice(0, 80) || null : null,
    followUps: draft.followUps.map((f) => f.trim()).filter(Boolean).slice(0, 3),
    consoleActions: validActions((draft.consoleActions.length ? draft.consoleActions
      : defaultActions(p, c.results))
      .filter((a) => a.action !== "set_period" || (a.period !== i.scope.period && a.period === base.scope?.period)), c.names, lang, base.sources.incidentIds),
    // what the figures do not cover (a locality read as its zone) stays on the card even when the draft leaves it out
    caveats: [...new Set([...c.caveats.filter((x) => /has no filter of its own|is also a revenue taluk|by the place name in their records|^Why it matters|last collected .* may be incomplete|has not been collected yet/.test(x)),
      ...draft.caveats.map((x) => x.trim()).filter(Boolean)])].slice(0, 4)
  };
  card.sources.verifier = { checked: verdict.checked, unmatched: [], regenerated, template: false };
  if (pruned) card.sources.limits.push(`${pruned} sentence(s) with figures the checker could not verify were left out.`);
  if (checked.fixes.length) card.sources.limits.push(`Chart checker: ${checked.fixes.join("; ")}.`);
  card.sources.limits.push(...c.caveats.filter((x) => !card.caveats.includes(x)));
  rememberCard(cache, card);
  return card;
}

const cardCache = new Map<string, { at: number; card: AnswerCard }>();
function cachedCard(key: string): AnswerCard | null {
  const hit = cardCache.get(key);
  return hit && Date.now() - hit.at < 10 * 60_000 ? structuredClone(hit.card) : null;
}
function rememberCard(key: string, card: AnswerCard) {
  cardCache.set(key, { at: Date.now(), card: structuredClone(card) });
  if (cardCache.size > 100) cardCache.delete(cardCache.keys().next().value!);
}

/** No raw HTML reaches the dialog: tags are dropped (markdown stays). */
const stripHtml = (s: string) => s.replace(/<\/?[a-z][^>]*>/gi, "").replace(/&lt;script/gi, "");

/** A small model sometimes says a sentence twice, or opens with the headline again: keep each sentence once. */
function dedupeSentences(md: string, headline: string): string {
  const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const seen = new Set([key(headline)]);
  const out = md.split("\n").map((line) => line.split(/(?<=[.!?])\s+/).filter((s) => {
    const k = key(s);
    if (!k) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).join(" ")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return out || md;
}

/** Console actions that fit the data when the composer proposes none: filter to the leading zone, department or taluk. */
function defaultActions(p: Presentation, results: ToolResult[]): Partial<ConsoleAction>[] {
  const out: Partial<ConsoleAction>[] = [];
  const ds = p.chart ? p.datasets.find((d) => d.id === p.chart!.dataset) : null;
  if (ds?.drill && ds.rows.length) {
    const y = p.chart!.y[0];
    const top = [...ds.rows].sort((a, b) => Number(b[y] ?? 0) - Number(a[y] ?? 0))[0];
    const v = top?.[ds.drill.field];
    if (v != null) out.push({ action: ds.drill.action, zone: ds.drill.action === "filter_zone" ? Number(v) : null, dept: ds.drill.action === "filter_dept" ? String(v) : null,
      taluk: ds.drill.action === "filter_taluk" ? String(v) : null });
  }
  const id = results.flatMap((r) => r.incidentIds)[0];
  if (id) out.push({ action: "open_incident", id });
  if (results.some((r) => r.tool === "developing_stories")) out.push({ action: "open_story" });
  return out;
}

// ------------------------------------------------------------ chart edits --

async function chartEdit(i: ChatInput, route: Route, lang: Lang, names: RefNames, now: string, sessionId: string): Promise<{ card: AnswerCard; tools: unknown[] } | null> {
  let prev = i.replyTo ? await messagePayload(i.user, i.replyTo) : null;
  if (!(prev?.payload as AnswerCard | undefined)?.datasets?.length) prev = await lastCardWithData(i.user, sessionId);
  const card = prev?.payload as AnswerCard | undefined;
  if (!card?.datasets?.length) return null;
  const fromRouter = route.chartEdit && (route.chartEdit.type || route.chartEdit.showOnMap) ? route.chartEdit : null;
  const edit = fromRouter ?? editFromText(i.message) ?? { type: null, showOnMap: false };
  const base: AnswerCard = { ...card, id: "", language: lang, sources: { ...card.sources, models: [], tools: card.sources.tools }, autoActions: [], download: null };
  const from = card.chart ?? (card.table ? { ...spec({ type: "table", dataset: card.table, title: card.headline }) } : null);
  if (!from) return null;
  // "only top 3": the previous answer's chart or table cut to its N largest, nothing asked again; it was once "I didn't understand"
  const topN = topNFromText(i.message);
  const topDs = topN ? card.datasets.find((d) => d.id === from.dataset) : null;
  const topY = from.y?.[0];
  if (topN && topDs && topY && topDs.rows.length > topN) {
    const rows = [...topDs.rows].sort((a, b) => Number(b[topY] ?? 0) - Number(a[topY] ?? 0)).slice(0, topN);
    const yLabel = topDs.fields.find((f) => f.key === topY)?.label ?? topY;
    const xKey = from.x ?? topDs.fields.find((f) => f.kind === "category" || f.kind === "text")?.key ?? null;
    const headline = { en: `Top ${topN} by ${yLabel.toLowerCase()}`, ta: `${yLabel}: முதல் ${topN}`, tanglish: `${yLabel}: top ${topN}` }[lang];
    const list = rows.map((r, k) => `${k + 1}. **${xKey ? String(r[xKey] ?? "") : `#${k + 1}`}**: ${Number(r[topY] ?? 0).toLocaleString("en-IN")}`).join("\n");
    const out: AnswerCard = { ...base, kind: "answer", datasets: card.datasets.map((d) => (d.id === topDs.id ? { ...d, rows, total: rows.length } : d)),
      chart: from.type === "table" ? null : { ...from, title: headline }, table: from.type === "table" ? from.dataset : card.table,
      display: from.type === "table" ? "table" : card.display === "map" ? "map" : "chart", headline, answerMarkdown: list, voiceSummary: headline, visualAsked: true };
    return { card: out, tools: prev?.plan?.tools ?? [] };
  }
  let target: ChartType | null = edit.type;
  if (edit.showOnMap) {
    const geoDs = card.datasets.find((d) => allowedTypes(d).some((t) => t.startsWith("map")));
    if (geoDs) {
      const mapType = allowedTypes(geoDs).find((t) => t.startsWith("map"))!;
      const next = checkChart({ ...from, dataset: geoDs.id, type: mapType }, card.datasets, null).spec;
      if (next) return { card: editedCard(base, next, lang, "map"), tools: prev?.plan?.tools ?? [] };
    }
    // no places in this data: the same measure by zone, from the zones tool
    const scope = card.scope ?? route.scope;
    const zones = await runTool("zones", { scope: i.lockDept ? { ...scope, dept: i.lockDept } : scope });
    const p = presentAll([zones], route.normalized, lang);
    const y = ["severe", "open", "complaints", "n"].find((k) => from.y.includes(k)) ?? "score";
    const yLabel = p.datasets.find((d) => d.id === p.chart!.dataset)?.fields.find((f) => f.key === y)?.label ?? y;
    const next = checkChart({ ...p.chart!, type: "map_zones", y: [y], title: `${yLabel} by zone` }, p.datasets, null).spec;
    if (!next) return null;
    const out = editedCard({ ...base, datasets: p.datasets, scope: zones.scope, scopeLine: describeScope(zones.scope!, names, lang, now) }, next, lang, "map");
    out.sources.tools = [...card.sources.tools, { name: "zones", args: { scope }, ms: 0 }];
    return { card: out, tools: [...(prev?.plan?.tools ?? []), { name: "zones", args: { scope } }] };
  }
  if (!target) return null;
  if (target === "table") return { card: { ...editedCard(base, null, lang, "table"), table: from.dataset }, tools: prev?.plan?.tools ?? [] };
  const next = checkChart({ ...from, type: target }, card.datasets, null);
  if (!next.spec) return null;
  const out = editedCard(base, next.spec, lang, next.spec.type.startsWith("map") ? "map" : "chart");
  if (next.spec.type !== target) out.caveats = [...out.caveats, { en: `A ${target.replace("_", " ")} does not fit this data, so it stays a ${next.spec.type.replace("_", " ")}.`,
    ta: `இந்தத் தரவுக்கு ${target} பொருந்தாது; ${next.spec.type} ஆகவே காட்டப்படுகிறது.`, tanglish: `Indha data-ku ${target} fit aagaadhu; ${next.spec.type} aagave kaatturen.` }[lang]];
  if (next.fixes.length) out.sources.limits = [...out.sources.limits, `Chart checker: ${next.fixes.join("; ")}.`];
  return { card: out, tools: prev?.plan?.tools ?? [] };
}

const WHAT: Record<string, string> = { horizontal_bar: "bar chart", bar: "column chart", grouped_bar: "grouped bar chart", line: "line chart", area: "area chart", donut: "donut",
  stacked_bar: "stacked bar chart", heatmap: "heat map", table: "table" };

function editedCard(base: AnswerCard, chart: ChartSpec | null, lang: Lang, display: AnswerCard["display"]): AnswerCard {
  const type = chart?.type ?? "table";
  const headline = type.startsWith("map")
    ? { en: "The same measure, on the zone map", ta: "அதே அளவீடு, மண்டல வரைபடத்தில்", tanglish: "Adhe measure, zone map-la" }[lang]
    : { en: `Same data, as a ${WHAT[type] ?? type.replace(/_/g, " ")}`, ta: `அதே தரவு, ${WHAT[type] ?? type} வடிவில்`, tanglish: `Adhe data, ${WHAT[type] ?? type}-a` }[lang];
  // a chart edit ("make it a pie", "show on map") is a request for the picture
  return { ...base, kind: "answer", display, chart, headline, answerMarkdown: base.answerMarkdown, voiceSummary: headline, followUps: base.followUps, visualAsked: true };
}

// ------------------------------------------------------------------- bulk --

function bulkFinish(card: AnswerCard, route: Route, names: RefNames, lang: Lang, message: string, p: Presentation): AnswerCard {
  const only = { en: (x: string) => `${x} only`, ta: (x: string) => `${x} மட்டும்`, tanglish: (x: string) => `${x} mattum` }[lang];
  const zones = p.datasets.find((d) => d.id === "zones")?.rows ?? [];
  const depts = p.datasets.find((d) => d.id === "departments")?.rows ?? [];
  const topZone = [...zones].sort((a, b) => Number(b.n ?? 0) - Number(a.n ?? 0))[0];
  const topDept = [...depts].sort((a, b) => Number(b.n ?? 0) - Number(a.n ?? 0))[0];
  const chips = [
    route.scope.period !== "daily" ? { en: "Last 24 hours only", ta: "கடந்த 24 மணி நேரம் மட்டும்", tanglish: "Last 24 hours mattum" }[lang] : null,
    topZone ? only(`${topZone.name}`) : null, topDept ? only(`${topDept.name}`) : null,
    { en: "Severe incidents only", ta: "கடுமையான சம்பவங்கள் மட்டும்", tanglish: "Severe incidents mattum" }[lang]
  ].filter(Boolean) as string[];
  const out = { ...card, chips };
  if (/export|download|csv|excel|ஏற்றுமதி/i.test(message)) {
    const s = route.scope;
    const q = new URLSearchParams({ period: s.period, ...(s.zone ? { zone: String(s.zone) } : {}), ...(s.dept ? { dept: s.dept } : {}) });
    out.download = { label: { en: `Download CSV (first ${LIMITS.exportRows.toLocaleString("en-IN")} incidents, no personal data)`,
      ta: `CSV பதிவிறக்கு (முதல் ${LIMITS.exportRows.toLocaleString("en-IN")} சம்பவங்கள், தனிப்பட்ட தரவு இல்லை)`,
      tanglish: `CSV download (first ${LIMITS.exportRows.toLocaleString("en-IN")} incidents, personal data illa)` }[lang], href: `/api/collector/assistant/export?${q}` };
  }
  void names;
  return out;
}

// ------------------------------------------------------------------- help --

async function helpAnswer(i: ChatInput, route: Route, message: string, lang: Lang, names: RefNames, now: string, models: CallInfo[]): Promise<AnswerCard> {
  const base = baseCard(lang, null, "", now);
  const topics = helpFor(`${message} ${route.normalized}`);
  if (!aiStatus().available || route.offline) {
    return { ...base, display: "text", headline: topics[0].split(":")[0], answerMarkdown: topics.join("\n\n"), voiceSummary: topics[0].slice(0, 300),
      followUps: EXAMPLES[lang].slice(0, 3) };
  }
  try {
    const r = await generateJson({
      role: "fast", name: "help", schema: ComposerSchema, lenient: ComposerLenient, system: composerSystem(lang), temperature: 0.2, maxOutputTokens: 900, user: i.user,
      abortSignal: i.signal, chat: true,
      prompt: composerPrompt({ question: message, normalized: route.normalized, scopeLine: "not applicable", asOf: now, testData: "no", caveats: [], lead: "",
        facts: "none (explain from the help text in DATASETS; state no numbers that are not in it)", datasets: `help:\n${topics.join("\n")}`, suggested: "none (display text)",
        actions: "", previous: "", repair: "" })
    });
    models.push(r.info);
    const d = r.object;
    const ok = verifyNumbers([d.headline, d.answerMarkdown, d.voiceSummary], [], contextNumbers(topics.join(" "), message)).ok;
    if (!ok) throw new Error("unverified numbers in help");
    return { ...base, display: "text", headline: d.headline, answerMarkdown: stripHtml(d.answerMarkdown), voiceSummary: d.voiceSummary,
      followUps: d.followUps.slice(0, 3), consoleActions: validActions(d.consoleActions, names, lang, []) };
  } catch (e) {
    if (i.signal?.aborted) throw e;
    console.warn("[assistant] help answer: the model's reply was not used; the help text is shown:", (e as Error).message);
    return { ...base, display: "text", headline: topics[0].split(":")[0], answerMarkdown: topics.join("\n\n"), voiceSummary: topics[0].slice(0, 300), followUps: EXAMPLES[lang].slice(0, 3) };
  }
}

// ---------------------------------------------------------------- planner --

async function planAndRun(i: ChatInput, route: Route, message: string, now: string, models: CallInfo[]): Promise<{ plan: QueryPlan; results: QueryResult[] }> {
  const cat = await loadCatalog();
  // the category codes a kind of incident is filtered on ("contains 'Road'" once counted road accidents as road damage)
  const n = await refNames();
  const catalog = `${renderCatalog(cat, tablesFor(`${message} ${route.normalized}`))}\n\nCategories (category_code: name): ${[...n.cats].map(([k, v]) => `${k}: ${v.label}`).join("; ")}`;
  let repair = "";
  let last: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await generateJson({
      role: "reasoning", name: "planner", schema: PlanSchema, system: PLANNER_SYSTEM, temperature: 0, maxOutputTokens: 1400, user: i.user, abortSignal: i.signal, chat: true,
      prompt: plannerPrompt({ catalog, places: "", scope: JSON.stringify(route.scope), previous: "", question: route.normalized, asOf: now, repair })
    });
    models.push(r.info);
    const plan = r.object;
    if (!plan.queries.length) throw new CompileError(plan.unsupported ?? "The data cannot answer this question.");
    try {
      const compiled = plan.queries.slice(0, LIMITS.queriesPerQuestion).map((q) => compileQuery(i.lockDept ? lockQuery(q) : q, cat, now, i.lockDept ? { ...route.scope, dept: i.lockDept } : route.scope));
      const results: QueryResult[] = [];
      for (const c of compiled) results.push(await runCompiled(c, now));
      if (results.every((x) => !x.rows.length) && attempt < 2) {
        repair = "The plan returned no rows. Check the filters (values must match the catalog's listed values) and the time range.";
        continue;
      }
      if (plan.unsupported) plan.assumptions.push(`Not answerable as asked: ${plan.unsupported}`);
      return { plan, results };
    } catch (e) {
      if (!(e instanceof CompileError) && !(e as Row)?.sqlMessage) throw e;
      last = e as Error;
      repair = (e as Error).message.slice(0, 400);
    }
  }
  throw last ?? new CompileError("The plan could not be compiled.");
}
