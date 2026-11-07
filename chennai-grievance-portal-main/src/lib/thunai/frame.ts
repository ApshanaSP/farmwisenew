/**
 * The query frame: what the last request was about, so a follow-up means something. "and in Adyar?", "why?", "the second one",
 * "compare with last month", "same for Ambattur", "only severe", "no, Anna Nagar": resolved here, in code, before the off-topic
 * check and the fast lane, from the open Stage, the recent turns and the last place. The frame stays after a cancel, so a
 * correction refines the request that was cut off. Pure.
 */
import { EXPLAIN_TA } from "./lexicon";
import { foreignIn } from "./entities";
import { singlePosition } from "./ordinal";
import { catIn, periodIn, quickScreen, sevIn, zonesIn } from "./quick";
import type { Recipe } from "./stage";
import type { StageContext } from "./stage";
import type { World } from "./types";

export interface FrameInput {
  text: string;
  /** the open Stage, if any */
  stage: StageContext | null;
  /** recent turns, oldest first */
  turns: { heard: string; did: string }[];
  lastPlace: string | null;
  /** the last request said, kept after a cancel */
  lastText: string | null;
  world: World;
}
export type Frame =
  | { kind: "screen"; recipe: Recipe; slots: Record<string, unknown>; why: string }
  | { kind: "stageOp"; op: "open" | "view" | "sort" | "filter" | "read" | "explain"; n: number | null; text: string | null; why: string }
  | { kind: "none" };

const norm = (s: string) => ` ${s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9஀-௿]+/g, " ").replace(/\s+/g, " ").trim()} `;

const PICK_NOUN = / (one|case|item|row|incident|complaint|that|thing|ஒன்று|ஒண்ணு|சம்பவம்|புகார்|கேஸ்|onnu|case-a) /;

/** A sentence that leans on what came before: it stays out of the fast lane when a Stage or a recent turn could explain it. */
export function isElliptical(text: string): boolean {
  const t = norm(text);
  const words = t.trim().split(" ").filter(Boolean);
  return ELLIPSIS_EN.test(t) || ELLIPSIS_TG.test(t) || ELLIPSIS_TA.test(text.trim()) || (words.length <= 3 && !isNewRequest(t));
}

/** the last recipe and slots: the open Stage's, else what the last sentence would have been */
function lastFrame(i: FrameInput): { recipe: Recipe; slots: Record<string, unknown>; source: "stage" | "text" } | null {
  if (i.stage) return { recipe: i.stage.recipe, slots: { ...i.stage.slots }, source: "stage" };
  const heard = i.lastText ?? i.turns[i.turns.length - 1]?.heard ?? null;
  if (!heard) return null;
  const q = quickScreen(heard, i.world, { noBail: true });
  return q ? { recipe: q.recipe, slots: { ...q.slots }, source: "text" } : null;
}

/** a follow-up's shape: short, or led by the words people use to go on from the last thing */
const ELLIPSIS_EN = /^ (and|what about|how about|same|same for|same in|also|now|then|no|not|actually|instead|only|just|in|for|at|but|ok|okay) /;
const ELLIPSIS_TA = /(^ (மற்றும்|அப்புறம்|அதே|இல்ல|இல்லை|வேண்டாம்) )|(பத்தி\?|மட்டும்|க்கு\?|ல\?|ில்\?|இல்\?|ஆ\?)/;
const ELLIPSIS_TG = /^ (appo|apram|adhe|athe|illa|venam|vendaam|sari) | (la|le|ku|mattum|pathi)\??\s*$/;
// a sentence that carries its own request (explain this issue, a report or status on something) is a new request, never "and in X?" (BUG-020)
const LIKE_NEW_REQUEST = /\b(show|open|list|display|go to|read|tell me|give me|find|make|build|compare|rank|explain|brief|report|status|update|whats going on|what s going on|what is going on|whats wrong|vilakku|vilakkam)\b|அறிக்கை|நிலவரம்/;
const isNewRequest = (t: string) => LIKE_NEW_REQUEST.test(t) || EXPLAIN_TA.test(t);

const WHY = /^ (why|whats the reason|what is the reason|reason|cause|how come|yen|ஏன்|காரணம்|karanam)( [^ ]+){0,5} $/;
const WEEKLY = / (weekly|this week|last week|week|வாரம்|இந்த வாரம்|vaaram) /, MONTHLY = / (monthly|this month|last month|month|மாதம்|இந்த மாதம்|கடந்த மாதம்|maasam|masam) /, DAILY = / (daily|today|இன்று|இன்னைக்கு|innaiku) /, QUARTER = / (quarterly|this quarter|last quarter|quarter|காலாண்டு) /;
const PERIOD_ONLY = /^ (make it |change to |switch to |show |for |only |just |now |and |இந்த |கடந்த )*(weekly|monthly|daily|quarterly|today|this week|last week|this month|last month|this quarter|week|month|quarter|வாரம்|மாதம்|இன்று|காலாண்டு|maasam|masam|vaaram)( only| instead| mattum| view| மட்டும்)? $/;
const COMPARE_LAST = /(compare|versus|vs|against|ஒப்பிடு|oppidu|compare pannu).*(last|previous|before|earlier|கடந்த|முந்தைய|pona|poana)|(last|previous|கடந்த|pona|poana).*(compare|ஒப்பிடு|oppidu)/;
const COMPARE = /(compare|versus| vs |against|ஒப்பிடு|oppidu|compare pannu)/;
const VIEW = /(as a|as|into a|in a|to a|la|-a|ஆக)?\s*(table|chart|graph|map|டேபிள்|அட்டவணை|வரைபடம்)/;

/** The follow-up, resolved; or none: the sentence stands on its own. */
export function resolveFrame(i: FrameInput): Frame {
  const raw = i.text.trim();
  if (foreignIn(raw, i.world)) return { kind: "none" }; // a follow-up about another place is a new question, which the brief turn answers (RC-01)
  const t = norm(raw);
  const last = lastFrame(i);
  const words = t.trim().split(" ").filter(Boolean);
  if (!words.length || words.length > 12) return { kind: "none" };

  // "the second one": an item on the open Stage
  if (i.stage && (PICK_NOUN.test(t) || words.length <= 3 || /^ (open|thira) |திற/.test(t))) {
    // one position read from the whole sentence: a place or any other word beside the number means this is not "open the Nth" (RC-42)
    const n = singlePosition(raw);
    if (n && i.stage.blocks.some((b) => b.ids.length >= n)) return { kind: "stageOp", op: "open", n, text: null, why: "ordinal" };
  }
  if (!last) return { kind: "none" };

  const hasNewPlace = zonesIn(t, i.world);
  const short = words.length <= 6;
  // a follow-up has a positive sign: a word that points back ("and", "same", "only", "what about", "no,"), or it is only a word or two ("Adyar?", "weekly"). Six words with no listed verb is not one:
  // "describe the flooding complaint in Adyar" is a new request, and re-scoping the open brief with it would answer a different question (RC-07)
  const POINTS_BACK = /^ (and|in|for|at|on|what about|how about|also|now|then|only|just|same|no|not|instead|ok|okay) /;
  const ellipsis = ELLIPSIS_EN.test(t) || ELLIPSIS_TG.test(t) || ELLIPSIS_TA.test(raw) || (short && POINTS_BACK.test(t) && !isNewRequest(t)) || (words.length <= 3 && !isNewRequest(t));
  const slots = { ...last.slots };

  // "why?", "why so many?", "ஏன் இந்த தாமதம்?": the reason for what is on screen (a why naming a new place is a new question)
  if (WHY.test(t) && !catIn(t)) {
    const zones = hasNewPlace.length ? hasNewPlace.slice(0, 1) : (slots.zones as number[] | undefined);
    return { kind: "screen", recipe: "why", slots: { zones: zones ?? [], cat: slots.cat ?? null, period: slots.period ?? "weekly" }, why: "why" };
  }
  // "compare with last month": the same place and topic, what changed against the period before
  if (COMPARE_LAST.test(t) && !hasNewPlace.length) {
    const period = MONTHLY.test(t) ? "monthly" : WEEKLY.test(t) ? "weekly" : QUARTER.test(t) ? "quarterly" : (slots.period as string) ?? "monthly";
    return { kind: "screen", recipe: "why", slots: { zones: (slots.zones as number[]) ?? [], cat: slots.cat ?? null, period }, why: "compare-previous" };
  }
  // "compare with Perungudi": the last place against the new one
  if (COMPARE.test(t) && hasNewPlace.length) {
    const from = ((slots.zones as number[]) ?? []).filter((z) => !hasNewPlace.includes(z));
    const zones = [...from, ...hasNewPlace].slice(0, 4);
    if (zones.length >= 2) return { kind: "screen", recipe: "compare", slots: { zones, cat: slots.cat ?? null, period: slots.period ?? "weekly" }, why: "compare-place" };
  }
  // "as a table": the open screen's own view
  if (i.stage && short && VIEW.test(t) && !hasNewPlace.length && !catIn(t)) {
    const v = /table|டேபிள்|அட்டவணை/.test(t) ? "table" : /map|வரைபடம்/.test(t) ? "map" : "chart";
    return { kind: "stageOp", op: "view", n: null, text: v, why: "view" };
  }
  // "make it monthly", "this week instead"
  if (PERIOD_ONLY.test(t)) {
    const period = periodIn(t) ?? (DAILY.test(t) ? "daily" : WEEKLY.test(t) ? "weekly" : MONTHLY.test(t) ? "monthly" : QUARTER.test(t) ? "quarterly" : null);
    if (period) return { kind: "screen", recipe: last.recipe, slots: { ...slots, period }, why: "period" };
  }
  if (!ellipsis) return { kind: "none" };

  // "and in Puzhal?" after a reservoir, a gauge named after the last reading
  if (last.recipe === "readings") {
    const named = (i.world.reservoirs.length ? i.world.reservoirs.map((r) => r.name) : ["Chembarambakkam", "Puzhal", "Poondi", "Cholavaram", "Veeranam", "Red Hills"]).find((n) => t.includes(` ${n.toLowerCase().split(" ")[0]} `));
    if (named) return { kind: "screen", recipe: "readings", slots: { ...slots, name: named }, why: "new-station" };
  }
  // "and in Adyar?", "same for Ambattur", "no, Anna Nagar"
  if (hasNewPlace.length) {
    if (last.recipe === "compare") return { kind: "screen", recipe: "compare", slots: { ...slots, zones: [...((slots.zones as number[]) ?? []), ...hasNewPlace].slice(0, 4) }, why: "add-place" };
    return { kind: "screen", recipe: last.recipe === "case" ? "cases" : last.recipe, slots: { ...slots, zones: hasNewPlace.slice(0, 1), name: null, fresh: true, ...withTopic(t, slots) }, why: "new-place" };
  }
  // "only severe", "and severe?"
  const sev = sevIn(t);
  if (sev) return { kind: "screen", recipe: last.recipe === "case" || last.recipe === "news" ? "cases" : last.recipe, slots: { ...slots, sev, ...withTopic(t, slots) }, why: "narrow-severity" };
  if (short && periodIn(t) && !catIn(t)) {
    const period = periodIn(t);
    if (period) return { kind: "screen", recipe: last.recipe, slots: { ...slots, period }, why: "period" };
  }
  // "what about flooding?", "and the rain there": a new topic, same place
  const cat = catIn(t);
  if (cat && (last.recipe === "cases" || last.recipe === "dashboard" || last.recipe === "trend" || last.recipe === "why" || last.recipe === "map")) return { kind: "screen", recipe: last.recipe, slots: { ...slots, cat }, why: "new-topic" };
  return { kind: "none" };
}

const withTopic = (t: string, slots: Record<string, unknown>) => { const c = catIn(t); return c ? { cat: c } : { cat: slots.cat ?? null }; };
