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
import { ordinalAt, ordinalOf } from "./ord8";

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

/** a news word right after the position ("the third news", "rendavadhu news", "இரண்டாவது செய்தி", "ஏழாவது செய்தியைத்") */
const NEWS_AFTER = /^(?:news|story|stories|article|report|headline|piece|item|seithi|seidhi|seythi|sethi|seithiya|seidhiya)$|^(?:செய்தி|சேதி|கட்டுரை)/u;
/** "one" right after it ("the seventh one", "kadaisi onnu", "ஏழாவது ஒண்ணைப்"), or a verb ("the seventh, open it", "seventh padinga") */
const ONE_AFTER = /^(?:one|onnu|onna|onnai|onnaiya|ஒண்ணு|ஒண்ணை|ஒண்ணைப்|ஒண்ணைத்|ஒன்று|ஒன்றை|ஒன்றைப்|ஒன்றைத்)$/u;
const VERB_AFTER = /^(?:open|read|play|please|padi\w*|thira\w*|sollu\w*|kaattu\w*)$|^(?:திற|படி|சொல்|காட்டு)/u;

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
  const at = ordinalAt(t);
  if (!at) return null;
  const noun = at.next != null && NEWS_AFTER.test(at.next);
  const bare = o.panel === true && (at.next == null || at.acc || ONE_AFTER.test(at.next) || VERB_AFTER.test(at.next));
  if (!noun && !bare) return null;
  const k = at.n === -1 ? items.length : at.n;
  return items[k - 1]?.id ?? null;
}
