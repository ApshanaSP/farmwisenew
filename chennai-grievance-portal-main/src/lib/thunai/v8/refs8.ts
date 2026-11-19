/**
 * v8: references to what is on the screen (docs/jarvis/v8-research/10-understanding.md recs 3 and 4).
 *
 *   ordinalOf(text)          the position a sentence names: "the second", "3rd", "rendavadhu", "ரெண்டாவது", "kadaisi" (-1: the last). A count
 *                            ("rendu news", "two cases") and a street ("Second Line Beach") name none.
 *   stageRef8(text, rows)    a case on the list: by its position with an open or explain verb, or by its place or words ("the Teynampet one",
 *                            "andha Kasimedu case", "the one about the tree"): { op, n }. A new request ("the cases in Teynampet this month")
 *                            or a place none of them is in names none.
 *   newsOrdinal8(text, ids)  a story on the screen by its position ("open the third news", "rendavadhu news ah padinga"): its id.
 * Pure.
 */
import { rankStories, pickStory, topicWords } from "./news8";
import { ordinalAt, ordinalOf, ordinalsAt, type OrdinalAt } from "./ord8";

// (v9: the ordinal reader is ord8.ts, past the fifth and in all three languages; kept exported here for the callers that had it)
export { ordinalOf };

const OPEN = /\b(?:open|show(?: me)?|pull up|bring up|go to|read|play)\b|\b(?:thira|thiranga|open pannu|open pannunga|kaattu|kaattunga|padi|padinga)\b|திற|காட்டு|படி/iu;
const EXPLAIN = /\b(?:tell me about|tell me more about|explain|what about|brief me on|what is|what's)\b|\b(?:pathi sollu|pathi sollunga|sollunga|sollu|vilakku)\b|சொல்|விளக்கு/iu;
/** "the X one", "the one in/at/from/about X", "andha X case" */
const WHERE = /\bthe\s+([\p{L}\p{M}\s.'’-]{2,40}?)\s+one\b|\bthe one (?:in|at|from|about|near|on)\s+(?:the\s+)?([\p{L}\p{M}\s.'’-]{2,40}?)[.?!]*$|\b(?:andha|antha|that)\s+([\p{L}\p{M}\s.'’-]{2,30}?)\s+(?:case|one|complaint|incident)\b/iu;
/** a new request's own words: a period, "cases in", a count: not a reference */
const NEW_REQUEST = /\b(?:cases|complaints|incidents) (?:in|at|from|of)\b|\b(?:this|last|next) (?:week|month|year|quarter)\b|\btoday\b|\byesterday\b/i;
/** a count, not a position: "the first two", "show the first five", "read the first three" (v7's list commands: the review, 18 Nov) */
const COUNT = /\b(?:first|last|top)\s+(?:two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b|\b(?:mudhal|kadaisi)\s+(?:rendu|moonu|naalu|anju)\b|(?:முதல்|கடைசி)\s*(?:இரண்டு|மூன்று|நான்கு|ஐந்து)/iu;
/** the thing counted is not a case on the list ("the second chart", "the third column") */
const NOT_A_CASE = /\b(?:chart|graph|column|page|row|table|map|tab|panel|story|news|article|headline|report|zone|ward|department)s?\b/i;

export interface RowRef { id: string; title: string; place?: string | null; zoneName?: string | null; deptName?: string | null }

/** A case on the list the sentence points at, and what to do with it; null when it points at none. */
export function stageRef8(text: string, rows: RowRef[]): { op: "open" | "explain"; n: number } | null {
  if (!rows.length) return null;
  const t = text.trim();
  if (NEW_REQUEST.test(t) || COUNT.test(t) || NOT_A_CASE.test(t)) return null;
  const op: "open" | "explain" = EXPLAIN.test(t) && !/\bopen\b|திற|thira/iu.test(t) ? "explain" : "open";
  const verb = OPEN.test(t) || EXPLAIN.test(t);
  // a reference needs a verb that opens or tells ("Is the Kasimedu one done?" asks about it: the planner's)
  if (!verb) return null;
  // v10 (the second review of v9): the first position said as one, among all the sentence names ("First, open the third one")
  const ats = ordinalsAt(t);
  if (ats.length) {
    // v9 (the review, 19 Nov): a position said as one: "the third", "the 3rd one", "number 3", "ஏழாவது சம்பவத்தை"; never a date ("on the 15th",
    // v10: "for the 21st") and never a position of something else ("the second chart" is NOT_A_CASE's); v10: a case word counts only near it
    // (a case word anywhere made "ஏழாம் தேதி வந்த புகார்களைக் காட்டுங்க" the 7th case: the second review)
    const at = ats.find((a) => positionSaid(a) && !dated(a)
      && (a.next == null || a.acc || ONE_AFTER.test(a.next) || VERB_AFTER.test(a.next) || CASE_AFTER.test(a.next) || caseNear(a)));
    if (!at) return null;
    const k = at.n === -1 ? rows.length : at.n;
    return k >= 1 && k <= rows.length ? { op, n: k } : null;
  }
  const m = WHERE.exec(t);
  const what = (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
  if (!what) return null;
  const words = topicWords(what, null).filter((w) => !/^(?:case|cases|one|complaint|incident|issue|problem)$/.test(w));
  if (!words.length) return null;
  const items = rows.map((r, i) => ({ id: r.id, title: `${r.title} ${r.place ?? ""} ${r.zoneName ?? ""} ${r.deptName ?? ""}`, onScreen: i + 1 }));
  const ranked = rankStories({ words, outlet: null }, items);
  const pick = pickStory(ranked.map((x) => ({ ...x, score: x.score - (x.item.onScreen != null ? 0.1 : 0) })));
  if (!pick.pick) return null;
  return { op, n: rows.findIndex((r) => r.id === pick.pick!.id) + 1 };
}

/** a news word right after the position ("the third news", "rendavadhu news", "இரண்டாவது செய்தி", "ஏழாவது செய்தியைத்", "எட்டாவது நியூஸ்");
 * (v9, the review: not "item", the console's word for a Stage's rows: "open the second item" is a case)
 * (v10 review 2, round 2, news-4 and news-4b: with its spoken Tanglish case, "rendavadhu newsa padinga", "storya", "seithiya"; and the press's
 * English in Tamil letters with any ending, as news8.ts reads it: நியூஸை, ஹெட்லைனை, ஆர்டிகிளை, ஸ்டோரியை, ரிப்போர்ட்டை) */
const NEWS_AFTER = /^(?:news|story|stori|article|report|headline|piece|seithi|seidhi|seythi|sethi)(?:a|ah|aa|ai|ae|ya|yah|yai|ye|u|la|le|il)?$|^(?:செய்தி|சேதி|கட்டுரை|நியூஸ|ஹெட்லைன|ஸ்டோரி|ஆர்டிகிள|ஆர்ட்டிக்கிள|ரிப்போர்ட)/u;
/** "one" right after it ("the seventh one", "kadaisi onnu", "ஏழாவது ஒண்ணைப்", "கடைசி ஒன்னைப்"), or a verb ("the seventh, open it", "seventh padinga") */
const ONE_AFTER = /^(?:one|onnu|onna|onnai|onnaiya|ஒண்ணு|ஒண்ணை|ஒண்ணைப்|ஒண்ணைத்|ஒன்னு|ஒன்னை|ஒன்னைப்|ஒன்னைத்|ஒன்று|ஒன்றை|ஒன்றைப்|ஒன்றைத்)$/u;
const VERB_AFTER = /^(?:open|read|play|please|padi\w*|thira\w*|sollu\w*|kaattu\w*)$|^(?:திற|படி|சொல்|காட்டு)/u;
/** a case word after the position, or anywhere ("the second case", "ரெண்டாவது சம்பவத்தை", "the second Adyar case") */
const CASE_AFTER = /^(?:case|cases|complaint|complaints|incident|incidents|petition|grievance)$|^(?:சம்பவ|புகார்|கேஸ்|மனு)/u;
const CASE_WORD = /\b(?:case|complaint|incident|petition|grievance)s?\b|சம்பவ|புகார்|கேஸ்|மனு/iu;
/** the console's own things: a position near one of them is its, never a story on the news panel ("zone number 3", "open the Adyar complaints") */
const CONSOLE_WORD = /\b(?:zones?|wards?|complaints?|cases?|incidents?|petitions?|map|maps|pages?|charts?|graphs?|departments?|taluks?|districts?|rows?|columns?|tabs?)\b|புகார்|சம்பவ|மண்டல|வார்டு/iu;
/** the words before a date ("on the 15th", "by the 3rd", v10: "for the 21st"): no position */
const DATE_BEFORE = /^(?:on|by|from|since|till|until|before|after|of|dated|for)$/;
/** v10: a date by the words before it ("on the 15th": "the" before the number, "on" before that; "on 15th") */
const dated = (at: OrdinalAt): boolean => at.kind !== "number" && (DATE_BEFORE.test(at.prev ?? "") || (at.prev === "the" && DATE_BEFORE.test(at.prev2 ?? "")));
/** v10: a case word right after the position or one word on ("the second Adyar case") */
const caseNear = (at: OrdinalAt): boolean => [at.words[at.i + 1], at.words[at.i + 2]].some((w) => !!w && CASE_AFTER.test(w));
/** a position said as one (the review, 19 Nov: "wait a second", "First, open ...", "zone number 3" were stories): an English ordinal after
 * "the"/"that"/"this"; "number 7" at the start, after a verb or after a news word; a Tamil or Tanglish ordinal as it is. v10 (the second
 * review): an English ordinal with Tanglish "onnu" after it ("last onnu padinga", "7th onnu kaattunga": Tanglish drops the article), and
 * "number 7" after "show me" / "read me" */
const positionSaid = (at: OrdinalAt): boolean =>
  at.kind === "ta" ? true
    : at.kind === "en" ? /^(?:the|that|this)$/.test(at.prev ?? "") || /^(?:onnu|onna|onnai|ஒண்ணு|ஒண்ணை)$/u.test(at.next ?? "")
      : at.prev == null || /^(?:open|read|play|show|explain|news|story|article|report|headline|item|seithi|padi\w*|thira\w*)$|^(?:செய்தி|திற|படி)/u.test(at.prev)
        || (at.prev === "me" && /^(?:show|read|open|play|give)$/.test(at.prev2 ?? ""));
/** v10: "ward number 5", "zone number 3", "வார்டு எண் 5": the console's own numbering, never a story's position */
const consoleNumber = (at: OrdinalAt): boolean => at.kind === "number" && !!at.prev && CONSOLE_WORD.test(at.prev);

/**
 * The story on the screen a sentence names by its position, or null. A position with a news word after it, on any news on screen. v9, on the
 * console's own news panel (`panel`: no Stage open): "the seventh one", "the last one", "read me the last one", "ஏழாவதைத் திறங்க" (the
 * position alone, or with "one" or a verb after it: v8's holdout h-reference-1, -2). Over Jarvis's own news list "read the first one" stays the
 * Stage's headline reading (the 17 Nov fix). Never a count ("the first two"), a period ("the news from last week"), a street or a floor ("the
 * fire on the ninth floor"), or another noun ("the story about the second bridge").
 */
export function newsOrdinal8(text: string, items: { id: string }[], o: { panel?: boolean } = {}): string | null {
  if (!items.length) return null;
  const t = text.trim();
  if (!(OPEN.test(t) || EXPLAIN.test(t)) || COUNT.test(t)) return null;
  // v10 (the second review of v9): the first position said as one among all the sentence names ("Wait a second, read the third news"), never a
  // date ("on the 3rd", "for the 21st"), never the console's own numbering ("ward number 5 news")
  for (const at of ordinalsAt(t)) {
    if (dated(at) || consoleNumber(at)) continue;
    const noun = at.next != null && NEWS_AFTER.test(at.next) && (at.kind !== "en" || positionSaid(at) || at.prev == null || VERB_BEFORE.test(at.prev));
    // (v9, the review: on the panel, the position alone only when said as one, and never near the console's own things)
    const bare = o.panel === true && positionSaid(at) && !CONSOLE_WORD.test(t) && (at.next == null || at.acc || ONE_AFTER.test(at.next) || VERB_AFTER.test(at.next));
    if (!noun && !bare) continue;
    const k = at.n === -1 ? items.length : at.n;
    return items[k - 1]?.id ?? null;
  }
  return null;
}
/** v10: a verb right before an English position with a news word after it ("read fifth news") */
const VERB_BEFORE = /^(?:open|read|play|show|explain|padi\w*|thira\w*)$/;
