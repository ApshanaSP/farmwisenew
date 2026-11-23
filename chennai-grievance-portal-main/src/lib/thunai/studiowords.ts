/**
 * The words that tell a question about the Collector's own Data Studio datasets from a question about the console's data (pure: the
 * server's dataset picker, lib/studio/forAssistants.ts, and the browser's Studio-page gate, Thunai.tsx, read the same lists).
 *
 * The console's own words ("complaints", "flooding", "dengue", "prices") are never enough on their own to send a question to an uploaded
 * file: "any dengue deaths" was once answered "the dataset does not contain deaths", and "onion price today" "onion is not present in this
 * dataset". A word only the file has ("desilting", "shelters", "ration"), "my data", or the file's name is.
 */

/** The question points at the Collector's own data. */
// "my data", and also "my flood inundation spots data", "our shelters file": up to four words between "my"/"our" and the noun
export const OWN_DATA = /\b(dataset|data ?set|(?:my|our) (?:[a-z0-9-]+ ){0,4}(?:data|dataset|file|sheet|spreadsheet)|uploaded|data studio|studio data|spreadsheet|excel|csv|(?:this|that|the) (?:data|file|sheet|register|table))\b/i;

/** A follow-up on the last answer ("and in Adyar?", "only the pending ones", "by zone?", "what about last month"). */
export const FOLLOW_UP = /^(and|also|only|just|now|what about|how about|same|those|them|of these|of those|in that|for that|by|per|each|split|break (?:it|that|them)? ?down)\b|^(மேலும்|அதில்|அவற்றில்)/i;
const POINTS_BACK = /\b(it|that|those|them|these|this one)\b|அதில்|அவற்றில்|இதில்/i;

/** Words that do not tell one dataset from another. */
export const GENERIC = new Set(["chennai", "data", "list", "details", "daily", "sample", "corporation", "public", "the", "and", "with", "from", "summary", "feed",
  "total", "count", "date", "name", "number", "status", "type", "report", "record", "records", "tamil", "headers", "value", "notes", "what", "which", "where",
  "when", "show", "tell", "give", "many", "much", "have", "there", "this", "that", "these", "those", "about", "does", "file", "dataset", "datasets", "studio",
  "uploaded", "please", "jarvis", "most", "least", "highest", "lowest", "average", "each", "more", "less", "than", "into", "over", "under", "only", "also",
  // a time names no dataset ("any dengue deaths this week" is not the fever return's "Week" column)
  "today", "week", "weeks", "weekly", "month", "months", "monthly", "year", "years", "yearly", "days", "yesterday", "tomorrow", "last", "this", "next"]);

/** Words of the console's own data (stemmed below): never enough on their own to send a question to an uploaded file. */
export const DISTRICT_WORDS = new Set(["complaint", "grievance", "incident", "news", "issue", "civic", "flood", "flooding", "drain", "drainage", "garbage", "road",
  "accident", "police", "zone", "ward", "department", "case", "open", "pending", "citizen", "chennai", "water", "health", "disaster", "management", "plan",
  // a department's name ("Storm Water Drain department") is the console's, not an uploaded "Storm-water drain desilting register"
  "storm", "sewage", "street", "light", "electrical",
  // market prices are AGMARKNET's, in the console
  "price", "prices", "rate", "rates", "market", "markets", "commodity", "commodities", "mandi", "vegetable", "vegetables",
  // dengue and fever are console topics (incidents, deaths)
  "dengue", "fever", "malaria", "disease", "diseases", "death", "deaths",
  // the console's live readings and briefs
  "severe", "overdue", "briefing", "traffic", "rain", "rainfall", "reservoir", "lake", "lakes", "weather", "power", "metro", "cyclone", "warning"]);

export const stem = (w: string) => w.replace(/(ies)$/, "y").replace(/(?<!s)s$/, "");
const DISTRICT_STEMS = new Set([...DISTRICT_WORDS].map(stem));
/** a word (stemmed or not) that is the console's own */
export const districtWord = (w: string) => DISTRICT_WORDS.has(w) || DISTRICT_STEMS.has(w) || DISTRICT_STEMS.has(stem(w));

/** every word of four letters or more, lower case, English or Tamil letters */
const allWords = (s: string) => String(s ?? "").toLowerCase().split(/[^a-z0-9஀-௿]+/).filter((w) => w.length >= 4);
/** the words that can tell datasets apart, stemmed */
export const keyWords = (s: string): string[] => [...new Set(allWords(s).filter((w) => !GENERIC.has(w)).map(stem))];
/** the console's own words in a sentence, stemmed */
export const districtWordsIn = (s: string): string[] => [...new Set(allWords(s).map(stem).filter(districtWord))];

/** Words that ask about a dataset rather than name one ("summarise this file", "key insights in my data"), stemmed as keyWords stems them. */
const ASKING = new Set(["summarise", "summarize", "summarising", "summarizing", "overview", "insight", "highlight", "explain", "analyse", "analyze", "breakdown",
  "brief", "point", "finding", "takeaway", "stand", "main", "says", "describe", "look", "find", "anything", "interesting", "important", "know", "need",
  // OWN_DATA's own words for a file
  "spreadsheet", "excel", "sheet", "table", "register"]);

/** A follow-up shape: it starts like one, or it is short and points back ("how many of them are pending?"). */
export function followUp(text: string): boolean {
  const t = String(text ?? "").trim();
  return FOLLOW_UP.test(t) || (t.split(/\s+/).length <= 6 && POINTS_BACK.test(t));
}

/**
 * On the Data Studio page, with a dataset open: is this sentence about that dataset (the browser answers it from the dataset's own engine,
 * as the Studio's analyst column did), or must it reach Jarvis's server round, which knows the district and every dataset? About the open
 * dataset when it says "my data" or "this file", names a word of the dataset's name or of its suggested questions, follows straight on from
 * an answer about it, or names nothing at all ("what is the average?"). A district question ("how many severe complaints in Adyar today?")
 * and one naming another dataset ("what does my desilting register say?") go through; the server still has the open one (studioOpen).
 */
export function aboutOpenDataset(said: string, open: { name: string; questions?: string[] }, o: { afterStudioAnswer?: boolean } = {}): boolean {
  const mine = new Set([keyWords(open.name), ...(open.questions ?? []).slice(0, 8).map(keyWords)].flat());
  const words = keyWords(said);
  if (words.some((w) => mine.has(w) && !districtWord(w))) return true;
  // "my data", "this file": the open dataset's, unless a word in it names something else ("what does the shelters dataset say?" with the
  // desilting register open is the shelters file's: only the server knows every dataset). The words that ask rather than name do not count
  if (OWN_DATA.test(said) && !words.some((w) => !mine.has(w) && !districtWord(w) && !ASKING.has(w))) return true;
  if (o.afterStudioAnswer && followUp(said)) return true;
  // nothing in it that could name something else: no word of the console's and no word that is not this dataset's
  return !words.some((w) => !mine.has(w)) && !districtWordsIn(said).some((w) => !mine.has(w));
}
