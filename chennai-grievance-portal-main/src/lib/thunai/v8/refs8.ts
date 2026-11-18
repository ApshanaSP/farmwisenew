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

const EN_ORD: [RegExp, number][] = [[/\b(?:first|1st)\b/i, 1], [/\b(?:second|2nd)\b(?! (?:line|street|main|avenue|cross))/i, 2], [/\b(?:third|3rd)\b/i, 3], [/\b(?:fourth|4th)\b/i, 4],
  [/\b(?:fifth|5th)\b/i, 5], [/\b(?:sixth|6th)\b/i, 6], [/\b(?:seventh|7th)\b/i, 7], [/\b(?:eighth|8th)\b/i, 8], [/\b(?:ninth|9th)\b/i, 9], [/\b(?:tenth|10th)\b/i, 10], [/\b(?:last|final)\b/i, -1]];
/** Tanglish: a number's stem with an ordinal ending ("rendavadhu", "moonaavathu"), mudhal, kadaisi */
const TG_ORD: [RegExp, number][] = [[/\b(?:mudhal|mudhalavadhu|mudhalaavadhu|mudhalavathu|modhal)\b/i, 1], [/\b(?:rend|irand|rand)(?:avadhu|aavadhu|avathu|aavathu|vadhu|vathu)\b/i, 2],
  [/\b(?:moon|mun|moond)(?:avadhu|aavadhu|avathu|aavathu|vadhu|vathu)\b/i, 3], [/\b(?:naal|naang)(?:avadhu|aavadhu|avathu|aavathu|vadhu|vathu)\b/i, 4],
  [/\b(?:anj|ainth)(?:avadhu|aavadhu|avathu|aavathu|vadhu|vathu)\b/i, 5], [/\b(?:kadaisi|kadasi|kadaisiya)\b/i, -1]];
const TA_ORD: [RegExp, number][] = [[/முதல்|முதலாவது/u, 1], [/(?:இரண்ட|ரெண்ட)ாவது|(?:இரண்ட|ரெண்ட)ாவதை/u, 2], [/(?:மூன்ற|மூண)ாவது|மூன்றாவதை|மூணாவதை/u, 3], [/(?:நான்க|நால)ாவது/u, 4], [/(?:ஐந்த|அஞ்ச)ாவது/u, 5], [/கடைசி/u, -1]];

export function ordinalOf(text: string): number | null {
  const t = text.normalize("NFC");
  for (const [re, n] of [...EN_ORD, ...TG_ORD, ...TA_ORD]) if (re.test(t)) return n;
  return null;
}

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
  const n = ordinalOf(t);
  if (n != null) {
    const k = n === -1 ? rows.length : n;
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

/** an ordinal said of a story: the ordinal right before a news word ("the third news", "rendavadhu news", "இரண்டாவது செய்தி"). "The first one" over a
 * news list stays the Stage's headline reading (the 17 Nov fix); "the news from last week" and "the story about the second bridge" name no position */
const ORD_NEWS = /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|1st|2nd|3rd|4th|5th|mudhal|mudhalavadhu|rendavadhu|rendaavadhu|randavadhu|moonavadhu|moonaavadhu|naalavadhu|anjavadhu|kadaisi)\s+(?:news|story|article|report|headline|piece|seithi|seidhi)\b|(?:முதல்|முதலாவது|இரண்டாவது|ரெண்டாவது|மூன்றாவது|மூணாவது|நான்காவது|ஐந்தாவது|கடைசி)\s*(?:செய்தி|சேதி|கட்டுரை)/iu;

/** The story on the screen a sentence names by its position, or null. */
export function newsOrdinal8(text: string, items: { id: string }[]): string | null {
  if (!items.length) return null;
  const t = text.trim();
  const at = ORD_NEWS.exec(t);
  if (!at || !(OPEN.test(t) || EXPLAIN.test(t))) return null;
  const n = ordinalOf(at[0]);
  if (n == null) return null;
  const k = n === -1 ? items.length : n;
  return items[k - 1]?.id ?? null;
}
