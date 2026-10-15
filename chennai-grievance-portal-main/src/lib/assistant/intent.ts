/**
 * What the Collector is asking for, decided in code before any model: explicit intents, so "top 3 crime types"
 * (a ranking of categories) and "top 3 priority crimes" (the incidents themselves) never take the same path, and
 * follow-ups ("the second one", "there", "only Adyar") resolve against the conversation's structured context.
 *
 * Words are matched as whole tokens (a Tamil word by its start, so case endings still match: கொலைக்கு is கொலை), never as
 * substrings: தற்கொலை (suicide) does not contain the token கொலை (murder).
 */
import type { ConversationContext } from "@/lib/assistant/context";

export const INTENTS = [
  "INCIDENT_COUNT", "INCIDENT_LIST", "PRIORITY_INCIDENT_LIST", "INCIDENT_DETAIL", "INCIDENT_RELATED", "INCIDENT_TIMELINE",
  "NEWS_TOP", "NEWS_DETAIL", "NEWS_ONLY_GAPS",
  "CATEGORY_RANKING", "TREND", "COMPARISON", "HOTSPOT", "LOCATION_SUMMARY",
  "KPI", "TABLE", "MAP", "CHART",
  "ACTION_REQUEST", "GENERAL_DISTRICT_QUERY"
] as const;
export type Intent = (typeof INTENTS)[number];

/** A topic the question names: categories it covers, in the store's codes. */
/** `narrow`: the topic is narrower than its categories; this text finds its incidents by meaning (search index). */
export interface Topic { key: string; label: string; cats: string[]; narrow?: string }

export interface Detected {
  intent: Intent;
  /** how many the question asks for ("top 3"), else null */
  n: number | null;
  topic: Topic | null;
  sev: "Severe" | "High" | null;
  /** only open ones ("pending", "unresolved", "still open") */
  openOnly: boolean;
  /** only open ones past their deadline ("overdue", "missed the deadline") */
  overdue?: boolean;
  /** closed ones, counted by when they were closed ("how many were resolved yesterday") */
  resolved?: boolean;
  /** the incident a follow-up points at, resolved from the context ("the second one", "this incident") */
  incidentId: string | null;
  /** the news story a follow-up points at */
  storyId: string | null;
  /** for INCIDENT_DETAIL: the part asked about */
  focus: "all" | "where" | "when" | "status" | "who";
  /** a follow-up that only narrows or widens the previous answer ("only Adyar", "what about last week") */
  refinement: boolean;
  /** why this intent, for the answer's sources panel */
  because: string;
  /** places compared side by side ("compare Velachery and Adyar") */
  sides?: string[];
  /** a story or incident described in words ("the Odisha worker stabbed"), to be found by meaning (set by the router) */
  find?: string | null;
  /** the period the question itself names (set by the router); else the rules' reading of the words */
  period?: "daily" | "weekly" | "monthly" | "quarterly" | null;
  /** what a count is of: deaths ("road deaths today"), citizen complaints ("how many grievances"), else incidents */
  measure?: "deaths" | "complaints" | null;
  /** compares the period with the one before ("this month vs last month"), not places */
  vsPrevious?: boolean;
}

// ------------------------------------------------------------------ tokens --

/** Lower-case word tokens; Tamil and Latin letters kept, everything else splits. */
export function tokens(text: string): string[] {
  return text.toLowerCase().normalize("NFC").split(/[^a-z0-9஀-௿]+/).filter(Boolean);
}

/**
 * Does `text` contain `phrase` as whole tokens? English: each token equal, or the last one a prefix of a word
 * ("flood" matches "flooding"); Tamil: each token must start the word (case endings may follow).
 */
export function hasPhrase(toks: string[], phrase: string): boolean {
  const p = tokens(phrase);
  if (!p.length) return false;
  for (let i = 0; i + p.length <= toks.length; i++) {
    let ok = true;
    for (let j = 0; j < p.length && ok; j++) {
      const w = toks[i + j], q = p[j];
      const tamil = /[஀-௿]/.test(q);
      ok = tamil || j === p.length - 1 ? w.startsWith(q) : w === q;
      // an English word must not be a different word that merely starts the same ("fire" is not "firearm"; "rain" not "rainwater" is fine)
      if (ok && !tamil && j === p.length - 1 && w !== q && !/^(s|es|ed|ing|ings|er|ers|y|ies|ly)$/.test(w.slice(q.length))) ok = false;
    }
    if (ok) return true;
  }
  return false;
}
const any = (toks: string[], phrases: string[]) => phrases.some((p) => hasPhrase(toks, p));

// ------------------------------------------------------------------ topics --

/** Topics by meaning; each lists its words (English, Tamil, Tanglish) and the categories it covers. */
const TOPICS: (Topic & { words: string[] })[] = [
  { key: "suicide", label: "suicide", cats: ["SUICIDE_SELF_HARM"], words: ["suicide", "suicides", "self harm", "self-harm", "தற்கொலை", "tharkolai", "tarkolai"] },
  // narrower than its categories: found by meaning, so a rape case is never answered with every crime against women
  { key: "rape", label: "rape and sexual assault", cats: ["CRIMES_AGAINST_WOMEN", "CRIME_VIOLENT"], narrow: "rape, sexual assault, sexually assaulted, molestation, POCSO case",
    words: ["rape", "rapes", "raped", "rape case", "rape cases", "sexual assault", "sexually assaulted", "molestation", "molested", "pocso", "கற்பழிப்பு", "பாலியல் வன்கொடுமை", "பாலியல் வன்முறை"] },
  { key: "women", label: "crimes against women", cats: ["CRIMES_AGAINST_WOMEN"], words: ["crimes against women", "harassment", "molest", "pocso", "dowry", "பாலியல்", "வரதட்சணை"] },
  // narrower than its category ("violent crime" holds assaults too): the incidents are found by meaning within it
  { key: "murder", label: "murder", cats: ["CRIME_VIOLENT"], narrow: "murder, killed, hacked or stabbed to death, body found", words: ["murder", "murders", "murdered", "killing", "killed", "hacked to death", "stabbed to death", "கொலை", "kolai"] },
  { key: "violent", label: "violent crime", cats: ["CRIME_VIOLENT"], words: ["stabbing", "assault", "attack", "violent crime", "violent crimes", "தாக்குதல்"] },
  { key: "theft", label: "theft and robbery", cats: ["CRIME_PROPERTY"], words: ["theft", "thefts", "robbery", "snatching", "burglary", "fraud", "திருட்டு", "கொள்ளை", "thiruttu", "kollai"] },
  { key: "crime", label: "crime", cats: ["CRIME_VIOLENT", "CRIMES_AGAINST_WOMEN", "CRIME_PROPERTY", "DRUGS_LIQUOR", "MISSING_PERSON", "POLICE_OTHER"],
    words: ["crime", "crimes", "criminal", "law and order", "குற்றம்", "kuttram"] },
  { key: "accident", label: "road accidents", cats: ["ROAD_ACCIDENT"], words: ["accident", "accidents", "road accident", "road death", "road deaths", "road fatality",
    "road fatalities", "hit and run", "crash", "collision", "விபத்து", "vibathu", "vibaththu"] },
  // workers overcome by gas in a drain, sewer or tank: the news check files them under drainage (derive.ts), never as disease
  { key: "gas", label: "gas and asphyxiation", cats: ["DRAINAGE_SEWAGE", "DRAIN_WORKS_SAFETY"], narrow: "workers died of poisonous gas or asphyxiation in a drain, sewer, manhole or septic tank",
    words: ["gas poisoning", "poisonous gas", "toxic gas", "toxic fumes", "asphyxiation", "asphyxiated", "suffocated", "manhole death", "manhole deaths",
      "septic tank", "sewer death", "sewer deaths", "விஷவாயு", "விஷ வாயு"] },
  { key: "fire", label: "fires", cats: ["FIRE_EXPLOSION"], words: ["fire", "fires", "blaze", "explosion", "தீ", "theeppidi"] },
  { key: "flood", label: "flooding", cats: ["FLOOD_WATERLOGGING", "FLOOD_RELIEF", "WATERBODY_INFRA", "FLOOD_RISK_SIGNAL"],
    words: ["flood", "flooding", "waterlogging", "waterlogged", "inundation", "lake", "bund", "வெள்ளம்", "மழைநீர்", "vellam"] },
  { key: "disease", label: "dengue and disease", cats: ["VECTOR_DISEASE"], words: ["dengue", "fever", "malaria", "disease", "cholera", "டெங்கு", "காய்ச்சல்"] },
  { key: "garbage", label: "garbage", cats: ["SOLID_WASTE"], words: ["garbage", "waste", "trash", "குப்பை", "kuppai"] },
  { key: "water", label: "drinking water", cats: ["WATER_SUPPLY"], words: ["drinking water", "water supply", "water shortage", "குடிநீர்"] },
  { key: "drainage", label: "drainage and sewage", cats: ["DRAINAGE_SEWAGE"], words: ["drainage", "sewage", "drain", "கழிவுநீர்"] },
  { key: "roads", label: "roads", cats: ["ROAD_DAMAGE"], words: ["pothole", "potholes", "road damage", "damaged road", "பள்ளம்"] },
  { key: "lights", label: "street lights and electrical", cats: ["STREETLIGHT_ELECTRICAL", "DARK_SPOT_SAFETY"], words: ["streetlight", "street light", "street lights", "power cut", "electrical", "மின்"] },
  { key: "protest", label: "protests", cats: ["PUBLIC_ORDER"], words: ["protest", "protests", "agitation", "blockade", "மறியல்", "போராட்டம்"] },
  { key: "missing", label: "missing persons", cats: ["MISSING_PERSON"], words: ["missing person", "missing", "காணவில்லை"] },
  { key: "drugs", label: "drugs and liquor", cats: ["DRUGS_LIQUOR"], words: ["drugs", "ganja", "liquor", "arrack", "கஞ்சா"] },
  { key: "building", label: "unsafe buildings", cats: ["BUILDING_SAFETY"], words: ["building collapse", "wall collapse", "unsafe building", "collapse"] },
  { key: "dogs", label: "stray animals", cats: ["STRAY_ANIMALS"], words: ["stray dog", "stray dogs", "dog bite", "stray", "நாய்"] }
];

/** A topic by its key (a follow-up keeps the previous answer's topic). */
export function topicByKey(key: string | null | undefined): Topic | null {
  const t = TOPICS.find((x) => x.key === key);
  return t ? { key: t.key, label: t.label, cats: t.cats, narrow: t.narrow } : null;
}

/** A topic's words (English, Tamil, Tanglish), for matching headlines. */
export function topicWords(key: string): string[] {
  return TOPICS.find((t) => t.key === key)?.words ?? [];
}

/** Words of the road: "the pedestrian killed in Kodungaiyur" was searched as a murder. */
const ROAD = ["pedestrian", "pedestrians", "accident", "accidents", "crash", "collision", "lorry", "truck", "bus", "bike", "motorcycle", "two-wheeler",
  "two wheeler", "vehicle", "car", "auto", "run over", "hit by", "mowed down", "motorist", "rider", "cyclist", "விபத்து", "vibathu"];
const MURDER_ONLY = ["murder", "murders", "murdered", "hacked to death", "stabbed to death", "கொலை", "kolai"];

export function topicOf(toks: string[]): Topic | null {
  for (const t of TOPICS) if (any(toks, t.words)) {
    // "killed" on the road is a road accident; it names a murder only with no road words, or with the word murder itself
    if (t.key === "murder" && any(toks, ROAD) && !any(toks, MURDER_ONLY)) {
      const a = TOPICS.find((x) => x.key === "accident")!;
      return { key: a.key, label: a.label, cats: a.cats, narrow: a.narrow };
    }
    return { key: t.key, label: t.label, cats: t.cats, narrow: t.narrow };
  }
  return null;
}

// ------------------------------------------------------------------- words --

const NEWS = ["news", "headline", "headlines", "press", "media", "newspaper", "newspapers", "reported in the news", "story", "stories", "செய்தி", "seithi"];
const NEWS_ONLY = ["only in the news", "news only", "news-only", "no department record", "not in any department", "missing from department", "not recorded by"];
const INCIDENT_NOUNS = ["incident", "incidents", "case", "cases", "event", "events", "issue", "issues", "complaint", "complaints", "problem", "problems",
  "grievance", "grievances", "petition", "petitions", "pending work", "pending works", "open work", "backlog", "சம்பவம்", "புகார்", "வழக்கு"];
/** a count of citizens' complaints, not of incidents */
const COMPLAINT_WORDS = ["complaint", "complaints", "grievance", "grievances", "petition", "petitions", "புகார்"];
/** a count of people who died */
const DEATH_WORDS = ["death", "deaths", "died", "dead", "fatal", "fatality", "fatalities", "lives lost", "lost their lives", "killed", "உயிரிழ", "இறந்", "பலி", "uyirizhappu"];
/** "this month vs last month", "compared with last week": the period against the one before */
const VS_PREVIOUS = /\b(vs\.?|versus|compared? (to|with)|against)\s+(the\s+)?(last|previous|prior|past)\s+(day|week|month|quarter|period)\b|\b(than|from)\s+(last|the previous)\s+(week|month|quarter)\b/i;
const RANKING = ["types", "type of", "kinds", "kind of", "categories", "category", "most common", "which type", "which kind", "breakdown", "by category", "by type"];
const PRIORITY = ["top", "priority", "most important", "important", "most serious", "serious", "severe", "critical", "worst", "biggest", "urgent", "major",
  "முக்கிய", "mukkiya", "gambhir"];
const COUNT = ["how many", "number of", "count", "total", "evlo", "evvalo", "எத்தனை", "எவ்வளவு"];
const LIST = ["show", "list", "give me", "what are", "tell me", "display", "any", "kaattu", "sollu", "காட்டு"];
const ACTION = ["what should we do", "what should i do", "what do we do", "what needs action", "what requires action", "needs action", "requires action",
  "action items", "action item", "what action", "which action", "next steps", "next step", "how should we respond", "how do we handle", "recommend", "recommendation"];
const RELATED = ["similar", "related", "nearby", "near by", "around there", "around it", "same area", "same place", "close to", "other such", "like this", "like that"];
const TIMELINE = ["timeline", "how did it unfold", "how it unfolded", "sequence", "what happened next", "history of", "step by step"];
const DETAIL = ["explain", "more about", "tell me more", "details", "detail", "what happened", "what is this", "describe", "elaborate", "enna aachu", "என்ன நடந்தது"];
/** asks for an explanation of a place or topic, not a list: the model writes it from the tools' facts */
const EXPLAIN = ["explain", "why", "tell me about", "tell about", "tell me more about", "summarise", "summarize", "summary", "overview", "situation", "what is going on", "what's going on",
  "whats going on", "what is happening", "what's happening", "analyse", "analyze", "analysis", "brief me", "describe", "elaborate", "yen", "ஏன்", "விளக்கு"];
const WHERE = ["where", "location", "which area", "which place", "exact place", "எங்கே", "enga"];
const WHEN = ["when", "what time", "which day", "எப்போது", "eppo"];
const STATUS = ["status", "resolved", "is it closed", "still open", "progress", "nilai"];
const WHO = ["who is handling", "which department", "who handles", "responsible", "officer"];
const THIS = ["this", "that", "it", "this one", "that one", "the incident", "this incident", "that incident", "this case", "that case", "there", "the case", "same"];
const TREND = ["trend", "over time", "per day", "daily count", "rising", "increase", "decrease", "graph over"];
const COMPARE = ["compare", "comparison", "versus", "vs", "against last", "compared with"];
const HOTSPOT = ["hotspot", "hotspots", "cluster", "clusters"];
const MAP = ["map", "on the map", "show on map", "make it a map", "make that a map"];
const CHART = ["chart", "graph", "pie", "bar chart", "donut", "visualise", "visualize", "plot"];
const TABLE = ["as a table", "in a table", "table"];
/** past the deadline: "overdue", "missed deadline", "delayed", "beyond the SLA" (Tanglish "late aagudhu") */
export const OVERDUE = /\b(overdue|over-due|past (their |the |its )?(deadline|due date|sla)|missed (the |their )?deadline|deadline (missed|crossed|passed)|beyond (the )?(sla|deadline)|sla breach(ed)?|breached|delayed|late aag)/i;
const OPEN_ONLY = ["pending", "unresolved", "still open", "open ones", "not resolved", "not closed", "open complaints", "open complaint",
  "open grievances", "open incidents", "open cases", "open issues", "open work", "backlog", "நிலுவை"];
/** closed work: "resolved", "closed", "completed", "fixed", "solved", "disposed of" (not "unresolved" / "not closed") */
const RESOLVED = /\b(resolved|closed|completed|fixed|solved|cleared|disposed)\b|தீர்க்கப்பட்ட|முடிக்கப்பட்ட/i;
const ORDINALS: [string[], number][] = [[["first", "1st", "top one", "முதல்"], 0], [["second", "2nd", "இரண்டாவது"], 1], [["third", "3rd", "மூன்றாவது"], 2],
  // "the last 24 hours" is a period: only "the last one" / "last incident" point at the end of a list
  [["fourth", "4th"], 3], [["fifth", "5th"], 4], [["last one", "last incident", "last case", "last story", "bottom one"], -1]];

const WORD_N: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, moonu: 3, rendu: 2, anju: 5 };

/** "top 3", "3 most serious", "top three": the number asked for. */
export function countAsked(text: string): number | null {
  const t = text.toLowerCase();
  // "last 3 days" is a period, not a count
  const m = t.match(/\b(?:top|first|best|worst|latest|last|most)\s*-?\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|moonu|rendu|anju)\b(?!\s*(?:days?|hours?|hrs?|h\b|weeks?|months?|years?|mins?|minutes?))/)
    ?? t.match(/\b(\d{1,2}|three|five|ten)\s+(?:most|top|highest|priority|serious|severe|important|worst|latest|recent|big)/);
  if (!m) return null;
  const v = /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_N[m[1]] ?? null;
  return v && v >= 1 && v <= 20 ? v : null;
}

function ordinal(toks: string[]): number | null {
  for (const [words, k] of ORDINALS) if (any(toks, words)) return k;
  const m = toks.join(" ").match(/\b(?:number|no|#)\s*(\d{1,2})\b/);
  return m ? Number(m[1]) - 1 : null;
}

// ----------------------------------------------------------------- detect --

/**
 * The intent of `message`, given the conversation so far. Pure: no database, no model, so it is fast and testable.
 * Returns GENERAL_DISTRICT_QUERY when no explicit pattern fits; the existing router then takes over.
 */
const BREAKDOWN = /\b(by|per|across|each|every)\s+(department|departments|dept|depts|zone|zones|taluk|taluks|ward|wards|area|areas|division|divisions)\b|\b(department|dept|zone|taluk|ward|area)[ -]?wise\b|\b(department|dept|zone|taluk)s?\s+(ranking|rankings|rank|league table)\b|\brank(ing)?\s+(of\s+)?(the\s+)?(departments|zones|taluks)\b/;

export function detectIntent(message: string, ctx: ConversationContext | null = null): Detected {
  const toks = tokens(message);
  const t = toks.join(" ");
  const topic = topicOf(toks);
  const n = countAsked(message);
  const sev = any(toks, ["severe", "critical", "most serious"]) ? "Severe" : any(toks, ["high severity", "serious"]) ? "High" : null;
  const openOnly = any(toks, OPEN_ONLY);
  const overdue = OVERDUE.test(message);
  const resolved = !openOnly && !overdue && RESOLVED.test(message) && !/\b(un|not |n't )(resolved|closed|completed|fixed|solved)/i.test(message);
  const deaths = any(toks, DEATH_WORDS) && !any(toks, ["death threat", "death threats"]);
  const measure: Detected["measure"] = deaths ? "deaths" : any(toks, COMPLAINT_WORDS) ? "complaints" : null;
  const base = { n, topic, sev: sev as Detected["sev"], openOnly, overdue, resolved, incidentId: null, storyId: null, focus: "all" as Detected["focus"], refinement: false,
    measure };
  const mk = (intent: Intent, because: string, extra: Partial<Detected> = {}): Detected => ({ ...base, intent, because, ...extra });
  const explicitId = message.match(/\bINC-[A-Z0-9-]{4,40}\b/i)?.[0]?.toUpperCase() ?? null;

  // a pointer at an earlier result: "the second one", "this incident", "there"
  const ord = ordinal(toks);
  const short = toks.length <= 14;
  const pointsBack = short && (any(toks, THIS) || ord != null);
  const fromList = ord != null && ctx?.resultIds?.length ? ctx.resultIds[ord === -1 ? ctx.resultIds.length - 1 : ord] ?? null : null;
  const fromStories = ord != null && ctx?.storyIds?.length ? ctx.storyIds[ord === -1 ? ctx.storyIds.length - 1 : ord] ?? null : null;
  const lastWasNews = ctx?.lastResponseType === "news_list" || ctx?.lastResponseType === "news_detail";
  const selected = explicitId ?? (lastWasNews ? null : fromList) ?? (pointsBack && !lastWasNews ? ctx?.selectedIncidentId ?? null : null);

  // 1. asked for action: recommendations only then
  if (any(toks, ACTION)) return mk("ACTION_REQUEST", "asks what to do", { incidentId: selected ?? (pointsBack ? ctx?.selectedIncidentId ?? null : null) });

  // 2. news
  const newsWord = any(toks, NEWS);
  if (lastWasNews && (fromStories || (pointsBack && ctx?.selectedNewsStoryId)) && !any(toks, RELATED))
    return mk("NEWS_DETAIL", "points at a story in the last news answer", { storyId: fromStories ?? ctx?.selectedNewsStoryId ?? null });
  if (any(toks, NEWS_ONLY)) return mk("NEWS_ONLY_GAPS", "news with no department record");
  if (newsWord && !any(toks, COUNT)) return mk("NEWS_TOP", topic ? `news about ${topic.label}` : "top news");

  // 3. follow-ups on one incident
  if (selected) {
    if (any(toks, RELATED)) return mk("INCIDENT_RELATED", "similar incidents near the selected one", { incidentId: selected });
    if (any(toks, TIMELINE)) return mk("INCIDENT_TIMELINE", "how the selected incident unfolded", { incidentId: selected });
    if (any(toks, MAP) && !explicitId && ctx?.resultIds?.length) return mk("MAP", "the previous answer on a map", { refinement: true });
    const focus = any(toks, WHERE) ? "where" : any(toks, WHEN) ? "when" : any(toks, WHO) ? "who" : any(toks, STATUS) ? "status" : "all";
    if (explicitId || ord != null || any(toks, DETAIL) || focus !== "all")
      return mk("INCIDENT_DETAIL", explicitId ? "names an incident id" : ord != null ? "points at an incident in the last list" : "asks about the selected incident",
        { incidentId: selected, focus });
  }
  if (any(toks, RELATED) && ctx?.selectedIncidentId && short)
    return mk("INCIDENT_RELATED", "similar incidents near the selected one", { incidentId: ctx.selectedIncidentId });

  // 4. pictures of the previous answer
  if (short && ctx && any(toks, MAP) && !topic) return mk("MAP", "the previous answer on a map", { refinement: true });
  if (short && ctx && any(toks, CHART) && !topic) return mk("CHART", "the previous answer as a chart", { refinement: true });
  if (short && ctx && any(toks, TABLE) && !topic) return mk("TABLE", "the previous answer as a table", { refinement: true });

  // 5. incidents: ranking of kinds, a count, the priority list, a plain list
  const incidenty = !!topic || any(toks, INCIDENT_NOUNS);
  // "explain the Anna Nagar issue", "why is flooding up in Adyar": an explanation, not a list (a list word still lists)
  if (any(toks, EXPLAIN) && !any(toks, ["list", "show", "display", "kaattu", "காட்டு"]) && !any(toks, COUNT) && n == null)
    return mk("GENERAL_DISTRICT_QUERY", "asks for an explanation; the model writes it from the facts");
  // a breakdown by department, zone, taluk or ward is a grouped count (the router's grouped tools and a chart), not a list
  if (BREAKDOWN.test(t)) return mk("GENERAL_DISTRICT_QUERY", "asks for a breakdown by department, zone, taluk or ward");
  if (incidenty && any(toks, RANKING)) return mk("CATEGORY_RANKING", "asks which kinds, not which incidents");
  // "this month vs last month complaints": the period against the one before (a count that states both), not two places
  if ((incidenty || deaths) && VS_PREVIOUS.test(message)) return mk("INCIDENT_COUNT", "compares the period with the one before", { vsPrevious: true });
  if (incidenty && any(toks, COUNT)) return mk("INCIDENT_COUNT", "asks how many");
  // "road deaths today", "gas poisoning deaths this week": how many people died (a list word still lists the incidents)
  if (deaths && (topic || incidenty || any(toks, ["people", "persons", "workers", "road"])) && !any(toks, LIST))
    return mk("INCIDENT_COUNT", "asks how many people died");
  if (any(toks, HOTSPOT)) return mk("HOTSPOT", "asks where incidents cluster");
  if (any(toks, TREND)) return mk("TREND", "asks how a count moves over time");
  if (any(toks, COMPARE)) return mk("COMPARISON", "asks for a comparison");
  if (incidenty && (n != null || any(toks, PRIORITY))) return mk("PRIORITY_INCIDENT_LIST", "asks for the most important incidents themselves");
  if (incidenty && any(toks, LIST)) return mk("INCIDENT_LIST", "asks to see incidents");

  // 6. a follow-up that only narrows or widens the previous incident or news answer ("only Adyar", "what about last week")
  if (ctx && ["incident_list", "news_list", "kpi", "category_ranking"].includes(String(ctx.lastResponseType)) && short &&
      /^(only|just|what about|how about|and|same for|now for|for|in)\b/.test(t))
    return mk((ctx.lastIntent as Intent) ?? "GENERAL_DISTRICT_QUERY", "narrows the previous answer", { refinement: true });

  if (incidenty) return mk("INCIDENT_LIST", "names a kind of incident");
  return mk("GENERAL_DISTRICT_QUERY", "no explicit pattern; the router decides");
}

/** Intents this module answers itself; the rest go to the existing router and tools. */
export const HANDLED: Intent[] = ["INCIDENT_COUNT", "INCIDENT_LIST", "PRIORITY_INCIDENT_LIST", "INCIDENT_DETAIL", "INCIDENT_RELATED", "INCIDENT_TIMELINE",
  "NEWS_TOP", "NEWS_DETAIL", "NEWS_ONLY_GAPS", "CATEGORY_RANKING", "ACTION_REQUEST", "COMPARISON"];
