/**
 * The query frame: what the last request was about, so a follow-up means something. "and in Adyar?", "why?", "the second one",
 * "compare with last month", "same for Ambattur", "only severe", "no, Anna Nagar": resolved here, in code, before the off-topic
 * check and the fast lane, from the open Stage, the recent turns and the last place. The frame stays after a cancel, so a
 * correction refines the request that was cut off. Pure.
 */
import { EXPLAIN_TA } from "./lexicon";
import { foreignIn, resolveEntity } from "./entities";
import { singlePosition } from "./ordinal";
import { asksHowKnow, catIn, periodIn, placesIn, quickScreen, sevIn, zonesIn } from "./quick";
export { asksHowKnow };
import { buildRegister, entitiesNamed, entityAt, howKnow, pickList, type RegEntity, type Register, type RegTurn, type StageInput } from "./register";
import { RECIPES, type Recipe } from "./stage";
import type { World } from "./types";
import { keyOf, needsDates, readPeriod } from "@/lib/period/read";
// v14: a follow-up after a city screen that names a part of the city itself is the city lanes' (cityFollow)
import { cityAsk } from "@/lib/city/intent";

export interface FrameInput {
  text: string;
  /** the open Stage, if any (with the labels of its items when the browser sends them) */
  stage: StageInput | null;
  /** recent turns, oldest first (recipe, slots and result when the browser keeps them) */
  turns: RegTurn[];
  lastPlace: string | null;
  /** the last request said, kept after a cancel */
  lastText: string | null;
  world: World;
  /** the dialogue state register (register.ts); built here from the Stage and the turns when not given, without the last answer's provenance */
  register?: Register | null;
  /** now, for saying how old the records are ("how do you know?"); null leaves the age out */
  now?: number | null;
}
export type Frame =
  | { kind: "screen"; recipe: Recipe; slots: Record<string, unknown>; why: string }
  /** an operation on the open Stage; `id` is the item the register resolved ("the second one", "that Velachery one"), when it knows it */
  | { kind: "stageOp"; op: "open" | "view" | "sort" | "filter" | "read" | "explain"; n: number | null; text: string | null; why: string; id?: string | null }
  /** a line built by code, said as it is: "how do you know?" (the screen's provenance), or a question back when the words name several items */
  // (v14: "city-zone", a zone asked of a part of the city kept for the whole district: power and trains in heavy rain)
  | { kind: "reply"; text: { en: string; ta: string }; why: "howknow" | "pick-several" | "city-zone" }
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
  // a turn that kept its recipe and slots says what it was, better than reading its words again (unless a cancelled request came after it)
  const kept = i.turns[i.turns.length - 1];
  if (!i.lastText && kept?.recipe && (RECIPES as readonly string[]).includes(kept.recipe) && kept.slots && typeof kept.slots === "object") return { recipe: kept.recipe as Recipe, slots: { ...kept.slots }, source: "text" };
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

/** the words that point at an item and the verbs of explaining: taken out before a position is read ("that second one", "explain the third one") */
const POINTING = new Set(["that", "this", "the", "andha", "antha", "indha", "intha", "anda", "adhu", "idhu", "athu", "ithu", "அந்த", "இந்த", "அது", "இது"]);
// (விளக்கு after தெரு or மின் is a street light, not "explain": BUG-032)
const EXPLAIN_PICK = / (?<!(?:theru|street|min|current|kambam|lamp|தெரு|மின்) )(explain|vilakku|vilakkunga|vilakkam|vilakkama|vilakki|tell me about|tell me more about|whats wrong with|what is wrong with|whats going on with|what is going on with|enna aachu|ennachu)(?= )|(?<!(?:தெரு|மின்) )(?<![஀-௿])(விளக்கு|விளக்குங்க|விளக்குங்கள்|விளக்கம்|விளக்கமா|விளக்கி)(?![஀-௿])/;
const EXPLAIN_WORDS = /\b(explain|vilakku|vilakkunga|vilakkam|vilakkama|vilakki|pannu|pannunga|tell me about|tell me more about|whats wrong with|what is wrong with|whats going on with|what is going on with|enna aachu|ennachu)\b|(?<![஀-௿])(விளக்கு|விளக்குங்க|விளக்குங்கள்|விளக்கம்|விளக்கமா|விளக்கி)(?![஀-௿])/g;
const stripPointing = (raw: string): string => raw.toLowerCase().replace(/[’']/g, "").replace(EXPLAIN_WORDS, " ").split(/[^\p{L}\p{M}\p{N}-]+/u).filter((w) => w && !POINTING.has(w)).join(" ");
/** a position, the last one too ("the last one", "kadaisi", "கடைசி"): 1-based, -1 the last */
// (the Tanglish ordinal with an object ending, "rendavadha", "moonavadhai", read as its plain form, "rendavadhu")
const tgOrdinal = (s: string) => s.replace(/(aa?vadh|aa?vath)(?:a|ai|ae|e)(?![a-z])/g, "$1u");
const positionIn = (s0: string): number | null => { const s = tgOrdinal(s0); return /^(?:one|onnu|onu|ஒன்னு|ஒண்ணு|ஒன்று)$/.test(s.trim()) ? null : singlePosition(s) ?? (/^(?:last|final|kadaisi|kadasi|கடைசி|கடைசியை)(?: (?:one|onnu|case|ஒன்னு|கேஸ்))?$/.test(s.trim()) ? -1 : null); };
/** "that Velachery one", "andha Velachery onnu", "the Adyar case", "the one in Velachery", "வேளச்சேரி ஒன்னு": the words between the pointer and the noun */
// (read on the sentence with the pointing words and the verb of explaining taken out)
const NAMED_ONE = /^ (.{3,40}?) (?:one|onnu|onu|ஒன்னு|ஒண்ணு|ஒன்று|case|complaint|incident|wala|vala|வாலா)(?: (?:pls|please|jarvis))? $|^ (?:one|case|complaint|incident) (?:in|at|from|near|of) (.{3,40}) $|^ (.{3,40}?)(?: la| le)? (?:irukura|irukkura|ulla|iruka|இருக்குற|இருக்கிற|உள்ள) (?:onnu|case|ஒன்னு|கேஸ்) $/;
/** "that one", "this one", "andha onnu", "அது": the item in focus, or the only one */
const THAT_ONE = /^ (?:that|this|that one|this one|andha onnu|indha onnu|antha onnu|intha onnu|adhu|idhu|athu|ithu|அது|இது|அந்த ஒன்னு|இந்த ஒன்னு|அந்த ஒண்ணு|இந்த ஒண்ணு|அதை|இதை) $/;

/** What an item that is not a case means when picked: a zone's or a department's cases, a gauge's reading; a why for a zone explained. */
function pickScreen(e: RegEntity, explain: boolean, slots: Record<string, unknown>, w: World): Frame | null {
  const zone = e.zone ?? zonesIn(norm(e.label), w)[0] ?? null;
  const named = e.dept || e.zone != null ? null : resolveEntity(e.label, w);
  const dept = e.dept ?? w.depts.find((d) => d.code === e.id)?.code ?? (named?.kind === "entity" && named.entity.kind === "dept" && !named.entity.noRecords ? named.entity.id : null);
  const period = (slots.period as string | undefined) ?? "weekly";
  if (e.kind === "Readings") return { kind: "screen", recipe: "readings", slots: { ...slots, name: e.label }, why: "pick-reading" };
  if (zone != null) return explain
    ? { kind: "screen", recipe: "why", slots: { zones: [zone], cat: slots.cat ?? null, period }, why: "pick-explain" }
    : { kind: "screen", recipe: "cases", slots: { zones: [zone], cat: slots.cat ?? null, period, sort: "priority", n: 15, fresh: true }, why: "pick-zone" };
  if (dept) return { kind: "screen", recipe: "cases", slots: { dept, status: "open", period, sort: "priority", n: 15, fresh: true }, why: "pick-dept" };
  return null;
}
/** an item picked on the Stage: a case (or a news item) is opened or explained there; anything else becomes the screen it stands for */
function picked(reg: Register, e: RegEntity | null, n: number, explain: boolean, slots: Record<string, unknown>, w: World, why: string): Frame | null {
  if (e && (e.kind === "Ranking" || e.kind === "Compare" || e.kind === "Readings")) return pickScreen(e, explain, slots, w);
  if (!e && reg.primary && reg.primary !== "CaseList" && reg.primary !== "CaseDetail" && reg.primary !== "NewsReader") return null;
  return { kind: "stageOp", op: explain ? "explain" : "open", n, text: null, why, id: e?.id ?? null };
}

/** The time a follow-up names that is not one of the console's windows (last week, yesterday, last month): its slots, or "none" when no lane can count it there. */
function spanSlots(raw: string, recipe: Recipe): Record<string, unknown> | "none" | null {
  const spec = readPeriod(raw);
  if (spec.kind === "none" || spec.kind === "window") return null;
  if (spec.kind === "unheld" || !needsDates(spec)) return "none";
  if (spec.kind === "day" && spec.back === 0) return { period: "daily" };
  // a past window (yesterday, last week, last month) said as a follow-up goes on to the planner, as on main: carried onto the last list, the
  // list's tiles said the current window's figures for it (QA pass 4, open-baseline-11: "open" 32 where the week holds 0). When unsure, as before
  void recipe; void keyOf;
  return "none";
}

/** The follow-up, resolved; or none: the sentence stands on its own. */
export function resolveFrame(i: FrameInput): Frame {
  const raw = i.text.trim();
  if (foreignIn(raw, i.world)) return { kind: "none" }; // a follow-up about another place is a new question, which the brief turn answers (RC-01)
  const t = norm(raw);
  const reg = i.register ?? buildRegister(i.stage, i.turns, null);
  // "how do you know?": the last answer's provenance, read aloud; with nothing shown yet it is not a follow-up
  if (asksHowKnow(raw) && (i.stage || reg.last)) return { kind: "reply", text: howKnow(reg, i.now ?? null), why: "howknow" };
  const last = lastFrame(i);
  const words = t.trim().split(" ").filter(Boolean);
  if (!words.length || words.length > 12) return { kind: "none" };

  // "the second one", "andha rendavadhu", "explain the third one": an item on the open Stage
  const explain = EXPLAIN_PICK.test(t);
  if (i.stage && (PICK_NOUN.test(t) || words.length <= 3 || /^ (open|thira) |திற/.test(t) || explain)) {
    // one position read from the whole sentence (the pointing words and the verb of explaining aside): a place or any other word beside the number
    // means this is not "open the Nth" (RC-42)
    const n = positionIn(stripPointing(raw)) ?? (explain ? null : singlePosition(raw));
    if (n && (pickList(reg).length >= Math.abs(n) || i.stage.blocks.some((b) => b.ids.length >= Math.abs(n)))) {
      const f = picked(reg, entityAt(reg, n), n, explain, last?.slots ?? {}, i.world, "ordinal");
      if (f) return f;
    }
    // "that one", "explain this one": the item in focus, or the only one on screen (an open case is "it" already)
    const bare = ` ${stripPointing(raw).replace(/\b(open|thira|one|onnu|ஒன்னு|ஒண்ணு)\b/g, " ").trim()} `;
    if (THAT_ONE.test(t) || THAT_ONE.test(` ${t.replace(/^ (open|thira|explain|vilakku) /, " ").trim()} `) || (explain && bare.trim() === "")) {
      if (reg.recipe === "case") { if (explain) return { kind: "stageOp", op: "explain", n: null, text: null, why: "deictic", id: pickList(reg)[0]?.id ?? null }; }
      else {
        const list = pickList(reg);
        const k = list.length === 1 ? 1 : reg.focus != null && reg.focus >= 1 && reg.focus <= list.length ? reg.focus : null;
        if (k) { const f = picked(reg, list[k - 1], k, explain, last?.slots ?? {}, i.world, "deictic"); if (f) return f; }
      }
    }
    // "that Velachery one", "the one in Adyar": an item named by its place or kind, when the words name exactly one on screen
    const named = NAMED_ONE.exec(` ${stripPointing(raw).replace(/^(open|thira) /, "").trim()} `);
    const part = named ? (named[1] ?? named[2] ?? named[3] ?? "").trim() : "";
    // a few words that name it, never a request of its own ("show me the flooding case" is a new question)
    if (part && !positionIn(part) && part.split(" ").length <= 4 && !LIKE_NEW_REQUEST.test(part)) {
      const byWords = entitiesNamed(reg, part);
      const hits = byWords.length ? byWords : entitiesNamed(reg, "", zonesIn(` ${part} `, i.world));
      if (hits.length === 1) { const f = picked(reg, hits[0], hits[0].n, explain, last?.slots ?? {}, i.world, "named"); if (f) return f; }
      if (hits.length > 1) return { kind: "reply", why: "pick-several", text: {
        en: `Several of these are about ${part}. Say the number of the one you want.`,
        ta: `இதுல ${part} பத்தி பல இருக்கு. எந்த எண்ணுன்னு சொல்லுங்க.` } };
      // a place no item on screen is about: not "and in X?", which would re-scope the whole screen to it
      // (only for a place: "the severe one" with nothing to pick by still narrows the screen as before)
      if (pickList(reg).length && (zonesIn(` ${part} `, i.world).length || placesIn(` ${part} `, i.world).length)) return { kind: "none" };
    }
  }
  if (!last) return { kind: "none" };

  const hasNewPlace = zonesIn(t, i.world);
  const short = words.length <= 6;
  // a follow-up has a positive sign: a word that points back ("and", "same", "only", "what about", "no,"), or it is only a word or two ("Adyar?", "weekly"). Six words with no listed verb is not one:
  // "describe the flooding complaint in Adyar" is a new request, and re-scoping the open brief with it would answer a different question (RC-07)
  const POINTS_BACK = /^ (and|in|for|at|on|what about|how about|also|now|then|only|just|same|no|not|instead|ok|okay) /;
  const ellipsis = ELLIPSIS_EN.test(t) || ELLIPSIS_TG.test(t) || ELLIPSIS_TA.test(raw) || (short && POINTS_BACK.test(t) && !isNewRequest(t)) || (words.length <= 3 && !isNewRequest(t));
  const slots = { ...last.slots };
  // v14 (21 Nov review of v13: routing 4 and 11, scenarios 1): a city screen reads no severity, period or span, and only live traffic reads a
  // zone, so a follow-up that re-scoped it rebuilt the same screen with the same line ("only severe", "this week instead", "what about
  // Adyar?" or "In Adyar zone" after the flood streets or power in heavy rain), and "why?" gave the week's reasons for every complaint
  if (last.recipe === "city") return cityFollow(i, t, raw, slots, hasNewPlace, ellipsis, short);

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
  // "same for last week", "and yesterday?": a time with its own dates is counted over them where a lane can (a list, a brief); anywhere else it is
  // the planner's, never answered with the nearest window (RC-06)
  const nextRecipe: Recipe = last.recipe === "case" ? "cases" : last.recipe;
  const span = !periodIn(t) ? spanSlots(raw, nextRecipe) : null;
  // "and in Adyar?", "same for Ambattur", "no, Anna Nagar"
  if (hasNewPlace.length) {
    if (span === "none") return { kind: "none" };
    if (last.recipe === "compare") return { kind: "screen", recipe: "compare", slots: { ...slots, zones: [...((slots.zones as number[]) ?? []), ...hasNewPlace].slice(0, 4) }, why: "add-place" };
    return { kind: "screen", recipe: nextRecipe, slots: { ...slots, zones: hasNewPlace.slice(0, 1), name: null, fresh: true, ...withTopic(t, slots), ...(span ?? {}) }, why: "new-place" };
  }
  // "only severe", "and severe?"
  const sev = sevIn(t);
  if (sev) return span === "none" ? { kind: "none" } : { kind: "screen", recipe: last.recipe === "case" || last.recipe === "news" ? "cases" : last.recipe, slots: { ...slots, sev, ...withTopic(t, slots), ...(span ?? {}) }, why: "narrow-severity" };
  if (short && span && !catIn(t)) return span === "none" ? { kind: "none" } : { kind: "screen", recipe: nextRecipe, slots: { ...slots, ...span }, why: "span" };
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

/** v14: the complaints each part of the city has a record of (power and trains in heavy rain have none: theirs is the rains' record) */
const CITY_CAT: Record<string, string> = { traffic: "TRAFFIC_OBSTRUCTION", flood: "FLOOD_WATERLOGGING" };
/** v14: said when a zone is asked of a part of the city kept for the whole district, never the district's screen again under the zone's name */
const CITY_NO_ZONE: Record<string, { en: string; ta: string }> = {
  power: { en: "Power in heavy rain is kept for the whole district, not zone by zone: the map's Power tab shows each ward that lost power.",
    ta: "கனமழையில் மின்சாரப் பதிவு மாவட்டம் முழுவதற்கும் மட்டுமே, மண்டல வாரியாக இல்லை: வரைபடத்தின் மின்சாரம் பகுதி மின்சாரம் போன ஒவ்வொரு வார்டையும் காட்டும்." },
  metro: { en: "Trains in heavy rain are kept line by line, not zone by zone: the map's Metro tab shows each line that ran late.",
    ta: "கனமழையில் ரயில் பதிவு வழித்தட வாரியாக மட்டுமே, மண்டல வாரியாக இல்லை: வரைபடத்தின் மெட்ரோ பகுதி தாமதமான ஒவ்வொரு வழித்தடத்தையும் காட்டும்." }
};

/**
 * v14 (21 Nov review of v13: routing 4 and 11, scenarios 1): a follow-up said after a city screen (live traffic, the flood streets, the rain,
 * power or trains in heavy rain). A zone ("what about Adyar?", "In Adyar zone"): live traffic in that zone, the zone's flooding complaints
 * (v13's rule for "the flooded streets in Adyar"), its rain gauge, its whole picture, or for power and trains a line that says they are kept
 * for the whole district. A severity or a period ("only severe", "this week instead"): that part's complaints with it, where it has a kind
 * of complaint. "why?", a comparison, and a follow-up that names a part of the city itself ("and the traffic in Adyar?") are the planner's
 * or the city lanes' (none). Never a city screen with a slot its data does not read.
 */
function cityFollow(i: FrameInput, t: string, raw: string, slots: Record<string, unknown>, place: number[], ellipsis: boolean, short: boolean): Frame {
  const q = String(slots.q ?? "all");
  const cat = CITY_CAT[q] ?? null;
  const zones = Array.isArray(slots.zones) ? (slots.zones as number[]).slice(0, 1) : [];
  const cases = (extra: Record<string, unknown>, why: string): Frame => ({ kind: "screen", recipe: "cases", slots: { cat, zones, period: "weekly", sort: "priority", n: 15, fresh: true, ...extra }, why });
  if (WHY.test(t) || COMPARE_LAST.test(t) || COMPARE.test(t)) return { kind: "none" };
  // "as a table": the open screen's own view, as on any screen
  if (i.stage && short && VIEW.test(t) && !place.length && !catIn(t)) {
    const v = /table|டேபிள்|அட்டவணை/.test(t) ? "table" : /map|வரைபடம்/.test(t) ? "map" : "chart";
    return { kind: "stageOp", op: "view", n: null, text: v, why: "view" };
  }
  if (cityAsk(raw)) return { kind: "none" };
  if (PERIOD_ONLY.test(t)) {
    const period = periodIn(t) ?? (DAILY.test(t) ? "daily" : WEEKLY.test(t) ? "weekly" : MONTHLY.test(t) ? "monthly" : QUARTER.test(t) ? "quarterly" : null);
    return period && cat ? cases({ period }, "city-period") : { kind: "none" };
  }
  if (!ellipsis) return { kind: "none" };
  const span = !periodIn(t) ? spanSlots(raw, "cases") : null;
  if (place.length) {
    if (span === "none") return { kind: "none" };
    const z = place.slice(0, 1), named = catIn(t);
    if (named) return { kind: "screen", recipe: "cases", slots: { cat: named, zones: z, period: "weekly", sort: "priority", n: 15, fresh: true, ...(span ?? {}) }, why: "city-place" };
    // (live traffic reads a zone, its worst jam and its trouble spot too: lib/city/now.ts, routing 0; so "what about Adyar?" after the most
    // congested road is Adyar's most congested road)
    if (q === "traffic") return { kind: "screen", recipe: "city", slots: { q: "traffic", zones: z, focus: slots.focus === "worst-jam" || slots.focus === "repeat" ? slots.focus : null, rain: null, fresh: true }, why: "new-place" };
    if (q === "flood") return cases({ zones: z, ...(span ?? {}) }, "city-place");
    if (q === "rain") return { kind: "screen", recipe: "readings", slots: { metric: "rain", zones: z }, why: "city-place" };
    if (q === "all") return { kind: "screen", recipe: "situation", slots: { zones: z, period: "daily", fresh: true }, why: "city-place" };
    const line = CITY_NO_ZONE[q];
    return line ? { kind: "reply", text: line, why: "city-zone" } : { kind: "none" };
  }
  const sev = sevIn(t);
  if (sev) return cat && span !== "none" ? cases({ sev, ...(periodIn(t) ? { period: periodIn(t) } : {}), ...(span ?? {}) }, "city-severity") : { kind: "none" };
  const period = short && !catIn(t) ? periodIn(t) : null;
  return period && cat ? cases({ period }, "city-period") : { kind: "none" };
}
