/**
 * What Thunai does on an open Stage without the model: the instant commands ("next", "stop", "only the Adyar ones",
 * "sort by complaints", "show it as a table", "open 3", "pin this", "export"), the lane-1 acknowledgement said the moment a
 * request leaves ("Checking the severe cases."), and the Stage's own refinements and exports. Plain functions, tested.
 */
import type { BlockT, CaseRowT, StageDocT } from "./stage";
import type { Lang } from "./types";
import { DEPT_TA, ZONES, ZONE_TA_NAME } from "./lexicon";
import { asciiDigits } from "./digits";
import { catTaOfLabel } from "./narrate";
import { OPEN_VERBS, SOFT_VERBS, readPicks, readPositions, tokensOf } from "./ordinal";

/** does this "only X" name one of the district's zones? Then it is a question about a place (the follow-up frame re-scopes the open screen to it), not a text filter over the rows on show (RC-07) */
const zoneNamed = (x: string): number | null => {
  const s = x.trim().toLowerCase();
  for (const [n, z] of Object.entries(ZONES)) if (z.en.some((e) => s === e || s.startsWith(`${e} `) || s.endsWith(` ${e}`)) || z.ta.some((e) => s.startsWith(e.replace(/[்ுூ]$/, "")))) return Number(n);
  return null;
};

export type LocalCmd =
  | { op: "filter"; text: string }
  | { op: "sort"; by: "complaints" | "time" | "value" | "name" | "severity" }
  | { op: "view"; view: "table" | "map" | "chart" }
  | { op: "next" } | { op: "prev" } | { op: "stop" } | { op: "read" } | { op: "again" } | { op: "close" } | { op: "back" } | { op: "clear" }
  | { op: "pin" }
  | { op: "export"; what: "png" | "csv" | null }
  /** n is a 1-based position (LAST = the last one); several positions (ns) are refused in the reducer with a plain line; `where` is a place to find among the rows */
  | { op: "open"; n: number; ns?: number[]; where?: string }
  | { op: "draft"; n: number; first: boolean; last?: boolean; ns?: number[]; it?: boolean }
  | { op: "map"; n: number | null }
  | { op: "full" }
  | { op: "everywhere" };

const DRAFT_WORDS = new Set(["draft", "வரைவு", "வரைவை", "டிராஃப்ட்", "டிராப்ட்"]);
const DRAFT_LEAD = new Set(["an", "a", "action", "alert", "mail", "email", "letter", "for", "to", "the", "pannu", "panni", "pannunga", "பண்ணு", "செய்", "செய்யுங்கள்", "எழுது", "ezhudhu", "kudu", "கொடு"]);

/** "the one in Pallikaranai": a position given by a place, to be matched against the rows on screen (never guessed from the word "one") */
const whereOf = (words: string[]): string | null => {
  const m = words.join(" ").match(/^(?:the )?(?:one|case|complaint|incident)s? (?:in|at|from|near|of) (?:the )?(.+)$/);
  return m && m[1].length >= 3 ? m[1] : null;
};

/** A command on the open Stage that needs no model, or null (the sentence goes to the agent). */
export function localStageCommand(raw: string): LocalCmd | null {
  const t = asciiDigits(raw).toLowerCase().replace(/[.!?,]+$/g, "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (/^(next|next one|aduthathu|adutha|அடுத்தது|அடுத்து)$/.test(t)) return { op: "next" };
  if (/^(previous|prev|back one|munnadi|முந்தையது)$/.test(t)) return { op: "prev" };
  if (/^(stop|stop reading|pause|quiet|niruthu|நிறுத்து|போதும்|podhum)$/.test(t)) return { op: "stop" };
  if (/^(again|say (it|that) again|repeat( that)?|once more|innoru vaati|மீண்டும்)$/.test(t)) return { op: "again" };
  if (/^(read (them|it|these|this|all)( out| aloud)?|read out|padi|படி|படிங்க|vaasi)$/.test(t)) return { op: "read" };
  if (/^(close( (this|it|the stage|the screen))?|done|that's all|moodu|மூடு)$/.test(t)) return { op: "close" };
  if (/^(go back|back|previous screen|pinnadi|பின்னால்)$/.test(t)) return { op: "back" };
  if (/^(clear( the)? filter|show (all|everything)( again)?|ellam kaattu|எல்லாம் காட்டு)$/.test(t)) return { op: "clear" };
  if (/^((for |in )?(all of chennai|the whole (district|city)|whole chennai|everywhere)|muzhu chennai|முழு சென்னை|மாவட்டம் முழுவதும்)$/.test(t)) return { op: "everywhere" };
  if (/^(pin (this|it)( screen)?((?: to| on)(?: the)? (?:overview|dashboard|front page|home))?|pin pannu|overview-?(?:la|ku) pin pannu|பின் செய்|முகப்பில் பின் செய்)$/.test(t)) return { op: "pin" };
  if (/^(full screen|bigger|expand( it)?)$/.test(t)) return { op: "full" };
  if (/(எக்ஸ்போர்ட்|ஏற்றுமதி|export pannu|download pannu)/.test(t) && t.split(" ").length <= 5) return { op: "export", what: /png|படம்/.test(t) ? "png" : /csv/.test(t) ? "csv" : null };
  const exp = t.match(/^(export|download)( this| it| the screen)?( as)?( (a )?(png|image|picture|csv|excel|data|table))?( pannu)?$/);
  if (exp) return { op: "export", what: /png|image|picture/.test(t) ? "png" : /csv|excel|data|table/.test(t) ? "csv" : null };
  const view = t.match(/^(?:show|switch|make|change|put)?(?: (?:it|this|that))?(?: (?:to|as|into|on))?(?: an?)? ?(table|map|chart|graph|bars?)(?: view)?(?:-?aa? (?:kaattu|maathu))?$/);
  if (view) return { op: "view", view: view[1] === "table" ? "table" : view[1] === "map" ? "map" : "chart" };
  // Tanglish: "complaints vechu sort pannu", "time-a vechu sort pannu"
  const sortTa = t.match(/^(complaints?|time|date|value|name|severity)(?:-?a)? (?:vechu|padi) (?:sort|order|varisai) ?(?:pannu|panni kaattu)?$/);
  if (sortTa) return { op: "sort", by: /complaint/.test(sortTa[1]) ? "complaints" : /time|date/.test(sortTa[1]) ? "time" : sortTa[1] === "name" ? "name" : sortTa[1] === "severity" ? "severity" : "value" };
  const sort = t.match(/^(?:sort|order|rank)(?: (?:them|it|these))?(?: by)? (complaints?|time|date|newest|latest|value|name|severity|worst)$/);
  if (sort) return { op: "sort", by: /complaint/.test(sort[1]) ? "complaints" : /time|date|newest|latest/.test(sort[1]) ? "time" : /name/.test(sort[1]) ? "name" : /severity|worst/.test(sort[1]) ? "severity" : "value" };
  const only = t.match(/^(?:only|just|show only|show just|keep only)(?: the)? (.+?)(?: ones| cases| items| incidents)?(?: mattum)?$/) ?? t.match(/^(.+?) (?:mattum|மட்டும்)$/);
  if (only && only[1].length >= 3 && !/\b(severe|critical|high|medium|low|open|week|month|today|quarter)\b|கடுமை|அவசர|திறந்த|வாரம்|மாதம்|இன்று/.test(only[1])) return { op: "filter", text: only[1].replace(/^(?:ones?|cases?|items?|incidents?) (?:in|at|from|of) /, "").replace(/^(in|at|from|la|il)\s+/, "").replace(/\s+(la|il|ones)$/, "").trim() };
  const mapIt = t.match(/^show (?:(?:number )?(\d{1,2}|this|it)) on the (?:main )?map$/);
  if (mapIt) return { op: "map", n: mapIt[1] && /\d/.test(mapIt[1]) ? Number(mapIt[1]) : null };
  if (/\b(zone|ward|taluk)\b|மண்டலம்|வார்டு/.test(t)) return null;
  const words = tokensOf(t);
  const verbAt = words.findIndex((w) => OPEN_VERBS.has(w));
  if (verbAt >= 0 && words.length <= 9) {
    const rest = words.filter((w, i) => i !== verbAt && !OPEN_VERBS.has(w) && !SOFT_VERBS.has(w));
    const ns = readPositions(rest);
    if (ns) return ns.length === 1 ? { op: "open", n: ns[0] } : { op: "open", n: ns[0], ns };
    const where = whereOf(rest);
    if (where) return { op: "open", n: 0, where };
  }
  const draftAt = words.findIndex((w) => DRAFT_WORDS.has(w));
  if (draftAt >= 0 && words.length <= 10) {
    const rest = words.filter((w, i) => i !== draftAt && !(DRAFT_LEAD.has(w) && (i < draftAt || w !== "to")));
    let lead = 0;
    while (lead < rest.length && (rest[lead] === "for" || rest[lead] === "to" || rest[lead] === "the")) lead++;
    const body = rest.slice(lead);
    if (body.length === 1 && /^(it|this|that)$/.test(body[0])) return { op: "draft", n: 0, first: false, it: true };
    // one reader for the count words of every language (ordinal.ts): "first three", "last two", "கடைசி இரண்டு", "mudhal moonu" are counts; "first and third" is two cases
    const pk = readPicks(body, { count: true });
    if (pk?.kind === "first") return { op: "draft", n: pk.n, first: true };
    if (pk?.kind === "last") return { op: "draft", n: pk.n, first: false, last: true };
    if (pk) return pk.ns.length === 1 ? { op: "draft", n: pk.ns[0], first: false } : { op: "draft", n: pk.ns[0], first: false, ns: pk.ns };
  }
  return null;
}

// ------------------------------------------------------------------ the reducer --

/** Everything the open Stage holds, in one place: what is shown, what came before, and how each block is viewed. */
export interface StageModel {
  doc: StageDocT | null;
  back: StageDocT[];
  views: Record<string, string>;
  filter: string | null;
  /** the item being read aloud */
  narr: number;
}
/** What a command asks the world to do. The reducer only describes these; the component carries them out. */
export type StageEffect =
  | { fx: "stopVoice" } | { fx: "closed" }
  | { fx: "say"; en: string; ta: string; speak: boolean }
  | { fx: "readFrom"; i: number }
  | { fx: "rebuild"; recipe: StageDocT["recipe"]; slots: Record<string, unknown>; label: { en: string; ta: string }; clearConsole?: boolean }
  | { fx: "pin" } | { fx: "export"; what: "png" | "csv" | null } | { fx: "draft"; ids: string[] } | { fx: "mapItem"; id: string | null } | { fx: "full" } | { fx: "scrollMap" } | { fx: "earcon" };

export const stageEmpty: StageModel = { doc: null, back: [], views: {}, filter: null, narr: 0 };

/**
 * One command on the Stage: the next model and the effects, in order. Pure: it speaks and fetches nothing, and reads only what it
 * is given, so a digest made right after it is right. "open" and the like ask for a rebuild: the new screen arrives through
 * pushScreen.
 */
/** A position of the reader (ordinal.ts) as a 1-based place in a list of this length: 3 is the third; -1 is the last, -2 the one before it. */
const fromEnd = (p: number, len: number): number => (p < 0 ? len + p + 1 : p);
const say = (en: string, ta: string): StageEffect => ({ fx: "say", en, ta, speak: true });
const outOfRange = (have: number, asked: number): StageEffect => have
  ? say(`There ${have === 1 ? "is only 1 item" : `are only ${have} items`} here${asked > 0 ? `, so there is no number ${asked}` : ""}.`, `இங்கே ${have} உருப்படிகள் மட்டுமே உள்ளன${asked > 0 ? `, ${asked}-வது இல்லை` : ""}.`)
  : say("There is nothing here to pick from.", "இங்கே தேர்ந்தெடுக்க எதுவும் இல்லை.");

export function stageReducer(m: StageModel, cmd: LocalCmd): { m: StageModel; fx: StageEffect[] } {
  const doc = m.doc;
  if (!doc) return { m, fx: [] };
  switch (cmd.op) {
    case "stop": return { m, fx: [{ fx: "stopVoice" }] };
    case "next": return { m, fx: [{ fx: "readFrom", i: m.narr + 1 }] };
    case "prev": return { m, fx: [{ fx: "readFrom", i: m.narr - 1 }] };
    case "again": return { m, fx: [{ fx: "readFrom", i: m.narr }] };
    case "read": return { m, fx: [doc.blocks.every((b) => b.kind === "Note") ? { fx: "rebuild", recipe: doc.recipe, slots: doc.slots, label: { en: doc.title, ta: doc.title } } : { fx: "readFrom", i: 0 }] };
    case "close": return { m: stageEmpty, fx: [{ fx: "stopVoice" }, { fx: "closed" }] };
    case "back": {
      const prev = m.back[m.back.length - 1];
      if (!prev) return { m: stageEmpty, fx: [{ fx: "stopVoice" }, { fx: "closed" }] };
      return { m: { ...m, doc: prev, back: m.back.slice(0, -1), views: {}, filter: null, narr: 0 }, fx: [{ fx: "stopVoice" }, { fx: "say", en: prev.say.en, ta: prev.say.ta, speak: true }] };
    }
    case "clear": return { m, fx: [{ fx: "rebuild", recipe: doc.recipe, slots: doc.slots, label: { en: doc.title, ta: doc.title } }] };
    case "everywhere": return { m, fx: [{ fx: "rebuild", recipe: doc.recipe, slots: { ...doc.slots, zones: [], dept: null, cat: null, taluk: null, fresh: true }, label: { en: "All of Chennai", ta: "முழு சென்னை" }, clearConsole: true }] };
    case "pin": return { m, fx: [{ fx: "pin" }, { fx: "earcon" }, { fx: "say", en: "Pinned this screen.", ta: "இந்தத் திரையைப் பின் செய்தேன்.", speak: true }] };
    case "export": return { m, fx: [{ fx: "export", what: cmd.what }, { fx: "earcon" }, { fx: "say", en: cmd.what === "png" ? "Saved a picture of this screen." : "Exported this screen's data as CSV.", ta: "ஏற்றுமதி செய்தேன்.", speak: true }] };
    case "view": {
      const b = doc.blocks.find((x) => (cmd.view === "map" ? x.kind === "Ranking" && x.items.some((i) => i.zone != null || i.lat != null) : ["Ranking", "Trend", "Chart", "Compare"].includes(x.kind)));
      const fx: StageEffect[] = [{ fx: "earcon" }, { fx: "say", en: `Showing it as a ${cmd.view}.`, ta: "மாற்றினேன்.", speak: false }];
      if (!b && cmd.view === "map") fx.unshift({ fx: "scrollMap" });
      return { m: b ? { ...m, views: { ...m.views, [b.id]: cmd.view } } : m, fx };
    }
    case "sort": return { m: { ...m, doc: sortStage(doc, cmd.by) }, fx: [{ fx: "earcon" }, { fx: "say", en: `Sorted by ${cmd.by}.`, ta: "வரிசைப்படுத்தினேன்.", speak: false }] };
    case "filter": {
      const r = filterStage(doc, cmd.text);
      // "only Adyar" on a screen whose rows do not name it (a brief, a ranking): the Collector named a place, so the screen is rebuilt for it, and never told that nothing mentions it (RC-07)
      const named = !r.kept ? zoneNamed(cmd.text) : null;
      if (named != null) return { m, fx: [{ fx: "rebuild", recipe: doc.recipe, slots: { ...doc.slots, zones: [named], fresh: true }, label: { en: cmd.text, ta: cmd.text }, clearConsole: false }] };
      if (!r.kept) return { m, fx: [{ fx: "say", en: `None of these mention ${cmd.text}.`, ta: `"${cmd.text}" எதிலும் இல்லை.`, speak: true }] };
      return { m: { ...m, doc: r.doc, filter: cmd.text }, fx: [{ fx: "say", en: `${r.kept} of the ${r.of} shown are about ${cmd.text}.`, ta: `${r.of}-இல் ${r.kept} மட்டும்.`, speak: true }] };
    }
    case "open": {
      const ids = caseIds(doc);
      if (cmd.ns && cmd.ns.length > 1) return { m, fx: [say("I can open one case at a time. Which one?", "ஒரு நேரத்தில் ஒரு சம்பவத்தைத்தான் திறக்க முடியும். எது?")] };
      let at = cmd.n;
      if (cmd.where) {
        const rows = doc.blocks.flatMap((b) => (b.kind === "CaseList" ? b.rows : []));
        const hit = rows.filter((r) => has([r.title, r.place, r.zoneName, r.deptName, r.cat], cmd.where as string));
        if (!hit.length) return { m, fx: [say(`None of these cases mention ${cmd.where}.`, `"${cmd.where}" எந்தச் சம்பவத்திலும் இல்லை.`)] };
        if (hit.length > 1) return { m, fx: [say(`${hit.length} of these cases mention ${cmd.where}. Say the number of the one you want.`, `${hit.length} சம்பவங்கள் "${cmd.where}" என்று உள்ளன. எந்த எண் என்று சொல்லுங்கள்.`)] };
        at = ids.indexOf(hit[0].id) + 1;
      }
      const k = fromEnd(at, ids.length);
      if (k < 1 || k > ids.length) return { m, fx: [outOfRange(ids.length, at)] };
      const id = ids[k - 1];
      return { m, fx: [{ fx: "rebuild", recipe: "case", slots: { id }, label: { en: `Opening case ${k}`, ta: `${k}-வது சம்பவத்தைத் திறக்கிறேன்` } }] };
    }
    case "draft": {
      const ids = caseIds(doc);
      if (cmd.it) return { m, fx: [doc.recipe === "case" && ids.length ? { fx: "draft", ids: ids.slice(0, 1) } : say("Which case should I draft for? Say its number.", "எந்தச் சம்பவத்துக்கு வரைவு? எண்ணைச் சொல்லுங்கள்.")] };
      if (cmd.first) return { m, fx: [{ fx: "draft", ids: ids.slice(0, cmd.n) }] };
      if (cmd.last) return cmd.n > ids.length ? { m, fx: [outOfRange(ids.length, cmd.n)] } : { m, fx: [{ fx: "draft", ids: ids.slice(ids.length - cmd.n) }] };
      if (doc.recipe === "case") return { m, fx: [{ fx: "draft", ids: ids.slice(0, 1) }] };
      const want = cmd.ns ?? [cmd.n];
      const bad = want.find((p) => fromEnd(p, ids.length) < 1 || fromEnd(p, ids.length) > ids.length);
      if (bad !== undefined) return { m, fx: [outOfRange(ids.length, bad)] };
      return { m, fx: [{ fx: "draft", ids: [...new Set(want.map((p) => ids[fromEnd(p, ids.length) - 1]))] }] };
    }
    case "map": {
      const ids = caseIds(doc);
      return { m: stageEmpty, fx: [{ fx: "stopVoice" }, { fx: "closed" }, { fx: "mapItem", id: (cmd.n ? ids[cmd.n - 1] : ids[0]) ?? null }] };
    }
    case "full": return { m, fx: [{ fx: "full" }] };
  }
}

/** A new screen arrives: what was shown goes on the back stack. */
export const pushScreen = (m: StageModel, doc: StageDocT, push = true): StageModel => ({ doc, back: m.doc && push ? [...m.back, m.doc].slice(-8) : m.back, views: {}, filter: null, narr: 0 });

/**
 * What the screen shows now, for the planner's next round: small (at most 400 tokens), never a source of figures (the server
 * reads figures only from its own tool results), and built from the same document the browser shows.
 */
export function stageDigest(m: StageModel, focus: number | null = null): string | null {
  const d = m.doc;
  if (!d) return null;
  const items = d.blocks.map((b) => {
    if (b.kind === "CaseList") return `cases(${b.total}): ${b.rows.slice(0, 8).map((r, i) => `${i + 1}=${r.id} ${r.title.slice(0, 40)}`).join("; ")}`;
    if (b.kind === "NewsReader") return `news: ${b.items.slice(0, 6).map((x, i) => `${i + 1}=${x.title.slice(0, 40)}`).join("; ")}`;
    if (b.kind === "Ranking") return `ranking: ${b.items.slice(0, 6).map((x) => x.label.slice(0, 24)).join(", ")}`;
    if (b.kind === "Compare") return `compare: ${b.sides.map((s) => s.label).join(" vs ")}`;
    return b.kind;
  }).join(" | ");
  return JSON.stringify({ recipe: d.recipe, title: d.title.slice(0, 80), slots: Object.fromEntries(Object.entries(d.slots).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length))), filter: m.filter, views: m.views, focus, items }).slice(0, 1400);
}

/** Lane 1: what Thunai says the moment the request leaves, from the words alone (no figures). */
export function ackFor(text: string, lang: Lang): string {
  const t = text.toLowerCase();
  const pick = (en: string, ta: string) => (lang === "ta" ? ta : en);
  if (/news|headline|செய்தி|seithi/.test(t)) return pick("Getting the news.", "செய்திகளைப் பெறுகிறேன்.");
  if (/severe|critical|serious|கடுமை|urgent/.test(t)) return pick("Checking the severe cases.", "கடுமையான சம்பவங்களைப் பார்க்கிறேன்.");
  if (/compare|versus|\bvs\b|ஒப்பிடு/.test(t)) return pick("Putting them side by side.", "ஒப்பிட்டுப் பார்க்கிறேன்.");
  if (/rain|reservoir|lake|full|மழை|ஏரி|நீர்|air|aqi|காற்று/.test(t)) return pick("Reading the gauges.", "அளவீடுகளைப் பார்க்கிறேன்.");
  if (/department|dept|slowest|performance|துறை/.test(t)) return pick("Checking department performance.", "துறைகளின் செயல்பாட்டைப் பார்க்கிறேன்.");
  if (/school|hospital|near|within|km|metre|அருகில்/.test(t)) return pick("Asking the map.", "வரைபடத்தில் தேடுகிறேன்.");
  if (/why|reason|ஏன்/.test(t)) return pick("Looking at what changed.", "என்ன மாறியது என்று பார்க்கிறேன்.");
  if (/brief|சுருக்கம்/.test(t)) return pick("Preparing your brief.", "சுருக்கத்தைத் தயார் செய்கிறேன்.");
  if (/dashboard|trend|moved|map|hotspot|top|worst|most/.test(t)) return pick("Building that screen.", "திரையை உருவாக்குகிறேன்.");
  return pick("On it.", "பார்க்கிறேன்.");
}

/**
 * The acknowledgement with the places in it ("Comparing Adyar with Anna Nagar"): code-templated from the sentence's own zone
 * names, never a figure. "" when the sentence names no zones (ackFor's line is used).
 */
export function ackTemplated(text: string, lang: Lang, w: { zones: { n: number; name: string; ta?: string | null }[] }): string {
  const low = text.toLowerCase();
  const named = w.zones.filter((z) => low.includes(z.name.toLowerCase()) || (z.ta && text.includes(z.ta)));
  if (!named.length) return "";
  const nm = (z: { name: string; ta?: string | null }) => (lang === "ta" ? z.ta ?? z.name : z.name);
  if (/compare|versus|\bvs\b|ஒப்பிடு|oppidu/.test(low) && named.length >= 2) {
    return lang === "ta" ? `${nm(named[0])}, ${nm(named[1])} ஒப்பிடுகிறேன்.` : `Comparing ${nm(named[0])} with ${nm(named[1])}.`;
  }
  return lang === "ta" ? `${nm(named[0])} பார்க்கிறேன்.` : `Looking at ${nm(named[0])}.`;
}

// ------------------------------------------------------------------ refinements --

const has = (hay: (string | null | undefined)[], needle: string) => hay.some((h) => (h ?? "").toLowerCase().includes(needle.toLowerCase()));

/** Keep the items that mention the words (a place, a department, a kind); a block with nothing left keeps a note. */
export function filterStage(d: StageDocT, text: string): { doc: StageDocT; kept: number; of: number } {
  let kept = 0, of = 0;
  const blocks = d.blocks.map((b): BlockT => {
    switch (b.kind) {
      case "CaseList": { const rows = b.rows.filter((r) => has([r.title, r.place, r.zoneName, r.deptName, r.cat], text)); kept += rows.length; of += b.rows.length; return { ...b, rows }; }
      case "NewsReader": { const items = b.items.filter((x) => has([x.title, x.place, x.source], text)); kept += items.length; of += b.items.length; return { ...b, items }; }
      case "Ranking": { const items = b.items.filter((x) => has([x.label, x.sub], text)); kept += items.length; of += b.items.length; return { ...b, items }; }
      case "Readings": { const items = b.items.filter((x) => has([x.name], text)); kept += items.length; of += b.items.length; return { ...b, items }; }
      default: return b;
    }
  });
  // the map keeps the pins of the items kept (by id), renumbered as the list now is, or those whose label matches
  const keptIds = blocks.flatMap((b) => (b.kind === "CaseList" ? b.rows.map((r) => r.id) : b.kind === "Ranking" ? b.items.map((x) => x.key) : []));
  const mapped = blocks.map((b): BlockT => b.kind !== "MapView" ? b : {
    ...b, points: b.points.filter((p) => keptIds.includes(p.id) || has([p.label], text)).map((p) => (p.n != null && keptIds.includes(p.id) ? { ...p, n: keptIds.indexOf(p.id) + 1 } : p))
  });
  const nice = text.replace(/(^|\s)(\p{Ll})/gu, (_, s0: string, c: string) => s0 + c.toUpperCase());
  return { doc: { ...d, blocks: mapped, title: `${d.title} · ${nice}`.slice(0, 200) }, kept, of };
}

export function sortStage(d: StageDocT, by: "complaints" | "time" | "value" | "name" | "severity"): StageDocT {
  const SEV: Record<string, number> = { Severe: 0, High: 1, Medium: 2, Low: 3 };
  const blocks = d.blocks.map((b): BlockT => {
    if (b.kind === "CaseList") {
      const rows = [...b.rows].sort((x, y) => by === "complaints" ? y.complaints - x.complaints : by === "time" ? String(y.t ?? "").localeCompare(String(x.t ?? ""))
        : by === "name" ? x.title.localeCompare(y.title) : (SEV[x.sev ?? ""] ?? 9) - (SEV[y.sev ?? ""] ?? 9));
      return { ...b, rows };
    }
    if (b.kind === "Ranking") return { ...b, items: [...b.items].sort((x, y) => (by === "name" ? x.label.localeCompare(y.label) : b.order === "top" ? y.value - x.value : x.value - y.value)) };
    if (b.kind === "Readings") return { ...b, items: [...b.items].sort((x, y) => (by === "name" ? x.name.localeCompare(y.name) : y.value - x.value)) };
    if (b.kind === "NewsReader" && by === "time") return { ...b, items: [...b.items].sort((x, y) => String(y.t ?? "").localeCompare(String(x.t ?? ""))) };
    return b;
  });
  return { ...d, blocks };
}

/** The items Thunai reads aloud one by one, with the key the Stage highlights while each is read. */
const ORDINAL_EN = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];
const ORDINAL_TA = ["முதலாவது", "இரண்டாவது", "மூன்றாவது", "நான்காவது", "ஐந்தாவது", "ஆறாவது", "ஏழாவது", "எட்டாவது", "ஒன்பதாவது", "பத்தாவது"];
const ord = (i: number, lang: Lang) => (lang === "ta" ? ORDINAL_TA[i] ?? `${i + 1}-வது` : ORDINAL_EN[i] ?? `Number ${i + 1}`);

/** Hours between two IST timestamps ("2026-10-28 07:41:25"), or null. */
export function hoursBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  const p = (x: string | null | undefined) => (x ? Date.parse(`${x.replace(" ", "T").slice(0, 19)}+05:30`) : NaN);
  const a = p(from), b = p(to);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? (b - a) / 3_600_000 : null;
}
const ageWords = (h: number | null, lang: Lang) => (h == null ? null : lang === "ta"
  ? h < 1 ? "ஒரு மணி நேரத்துக்குள்" : h < 48 ? `${Math.round(h)} மணி நேரமாக` : `${Math.round(h / 24)} நாட்களாக`
  : h < 1 ? "under an hour" : h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`);

/** What the problem is, in a few words: the incident's own short summary, else its kind and place (never an id or a citizen's words). */
export function problemOf(r: CaseRowT, lang: Lang = "en"): string {
  if (r.why && r.why.length <= 110 && !/[.!?].+[.!?]/.test(r.why)) return r.why.replace(/\.$/, "");
  const t = r.title.replace(/\bINC-[A-Z0-9-]+\b/g, "").replace(/\s+/g, " ").trim();
  if (t.length <= 90) return t;
  // a long title is not read: the kind of problem and the place (the kind in Tamil in a Tamil line)
  return r.cat ? (lang === "ta" ? `${catTaOfLabel(r.cat) ?? r.cat}${r.place ? `, ${r.place}` : ""}` : `${r.cat}${r.place ? ` at ${r.place}` : ""}`) : t.slice(0, 90);
}

/**
 * One case as an aide would brief it: where, what, how long and why it matters, who has it. No ids, no complaint text.
 * "First, in Royapuram: wall collapse at Chetpet. Open 22 hours and past its deadline. PWD Water Resources has it."
 */
/** a ranking's unit in Tamil (the units the ranking screens use) */
export const UNIT_TA: Record<string, string> = { incidents: "சம்பவங்கள்", days: "நாட்கள்", hours: "மணி நேரம்", "₹/kg": "ரூபாய்/கிலோ", mm: "மி.மீ", "% full": "% நிரம்பியது" };
export function caseBrief(r: CaseRowT, i: number, asOf: string | null, lang: Lang): string {
  const what = problemOf(r, lang);
  const where = r.zoneName && !what.toLowerCase().includes(r.zoneName.toLowerCase()) ? r.zoneName : null;
  const age = ageWords(hoursBetween(r.t, asOf), lang);
  if (lang === "ta") {
    const whereTa = r.zone != null && ZONE_TA_NAME[r.zone] ? ZONE_TA_NAME[r.zone] : where; // the zone's and the department's Tamil names, by number and code (lexicon.ts); a name it does not know stays as it is
    return [`${ord(i, lang)}${whereTa && !what.includes(whereTa) ? `, ${whereTa}` : ""}: ${what}.`, age ? `${age} திறந்துள்ளது${r.overdue ? ", காலக்கெடு தாண்டிவிட்டது" : ""}.` : r.overdue ? "காலக்கெடு தாண்டிவிட்டது." : "",
      r.complaints > 0 ? `${r.complaints} புகார்கள் வந்துள்ளன.` : "", r.deptName ? `${(r.dept && DEPT_TA[r.dept]) || r.deptName} பொறுப்பு.` : ""].filter(Boolean).join(" ");
  }
  const state = age ? `Open ${age}${r.overdue ? " and past its deadline" : ""}.` : r.overdue ? "Past its deadline." : "";
  return [`${ord(i, lang)}${where ? `, in ${where}` : ""}: ${what}.`, state, r.complaints > 0 ? `${r.complaints} ${r.complaints === 1 ? "citizen has" : "citizens have"} complained.` : "",
    r.deptName ? `${r.deptName} has it.` : ""].filter(Boolean).join(" ");
}

/**
 * The items Thunai reads aloud one by one, with the key the Stage highlights and the lead-in said before the item's own
 * words (so the highlight follows the voice inside the headline).
 */
export function narrationOf(d: StageDocT, lang: Lang): { key: string; text: string; lead: string }[] {
  for (const b of d.blocks) {
    if (b.kind === "NewsReader") return b.items.map((x, i) => {
      const lead = lang === "ta" ? `${ord(i, lang)}${x.source ? `, ${x.source}` : ""}: ` : `${i === 0 ? "First" : i === b.items.length - 1 ? "And finally" : "Next"}${x.source ? `, from ${x.source}` : ""}: `;
      return { key: x.id, lead, text: `${lead}${x.title}.` };
    });
    // a Tamil reading of a brief reads each point in Tamil where it has one (the sentences the code builds), the record's own title as it is (RC-15, PB-207)
    if (b.kind === "Brief") return b.points.map((p, i) => ({ key: `brief-${i}`, lead: "", text: lang === "ta" ? p.ta ?? p.text : p.text })).filter((x, i) => !(lang === "ta" && b.points[i].ta === "")); // ta "": the pipeline AI wrote it in English only, so a Tamil reading leaves it out
  }
  const list = d.blocks.find((b) => b.kind === "CaseList");
  if (list && list.kind === "CaseList") return list.rows.slice(0, 10).map((r, i) => ({ key: r.id, lead: "", text: caseBrief(r, i, d.asOf, lang) }));
  const rank = d.blocks.find((b) => b.kind === "Ranking");
  if (rank && rank.kind === "Ranking") return rank.items.slice(0, 8).map((x) => {
      // in Tamil the zone and the department are said by their Tamil names (a zone by its number, a department by its code), the unit in Tamil
      const label = lang !== "ta" ? x.label : x.action === "zone" && x.zone != null && ZONE_TA_NAME[x.zone] ? ZONE_TA_NAME[x.zone] : x.action === "dept" && DEPT_TA[x.key] ? DEPT_TA[x.key] : x.label;
      const unit = rank.unit && rank.unit !== "points" ? (lang === "ta" ? UNIT_TA[rank.unit] ?? rank.unit : rank.unit) : "";
      return { key: x.key, lead: "", text: `${x.rank === 1 ? (lang === "ta" ? "முதலிடம்" : "Top") : `${lang === "ta" ? "இடம்" : "Number"} ${x.rank}`}: ${label}, ${x.value}${unit ? ` ${unit}` : ""}.` };
    });
  return [];
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // a cell a spreadsheet would run as a formula is quoted as text
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The Stage's data as CSV, one section per block (the numbers exactly as shown). */
export function toCsv(d: StageDocT): string {
  const out: string[] = [`# ${d.title}`, `# as of ${d.asOf ?? "unknown"}; sources: ${d.sources.join(", ")}`];
  const table = (title: string, cols: string[], rows: unknown[][]) => { out.push("", `# ${title}`, cols.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))); };
  for (const b of d.blocks) {
    if (b.kind === "CaseList") table(b.title, ["#", "id", "title", "severity", "status", "zone", "place", "department", "complaints", "reported", "past deadline"],
      b.rows.map((r, i) => [i + 1, r.id, r.title, r.sev, r.status, r.zoneName, r.place, r.deptName, r.complaints, r.t, r.overdue ? "yes" : "no"]));
    else if (b.kind === "Ranking") table(b.title, ["rank", "name", `value${b.unit ? ` (${b.unit})` : ""}`, "detail"], b.items.map((x) => [x.rank, x.label, x.value, x.sub]));
    else if (b.kind === "Kpis") table(b.title, ["measure", "value", "unit", "before", "change"], b.items.map((x) => [x.label, x.value, x.unit, x.prev, x.delta]));
    else if (b.kind === "Readings") table(b.title, ["place", `value (${b.unit})`, "time", "28-day mean"], b.items.map((x) => [x.name, x.value, x.t, x.mean28]));
    else if (b.kind === "Compare") table(b.title, ["measure", ...b.sides.map((s) => s.label)], b.metrics.map((m) => [m.label, ...b.sides.map((s) => s.values[m.key])]));
    else if (b.kind === "Trend") table(b.title, ["period", b.unit], b.labels.map((l, i) => [l, b.values[i]]));
    else if (b.kind === "Chart") table(b.title, ["label", b.unit ?? "value"], b.labels.map((l, i) => [l, b.values[i]]));
    else if (b.kind === "Heat") table(b.title, ["", ...b.cols], b.rows.map((r, i) => [r, ...b.cells[i]]));
    else if (b.kind === "NewsReader") table(b.title, ["#", "headline", "source", "time", "incident"], b.items.map((x, i) => [i + 1, x.title, x.source, x.t, x.incidentId]));
    else if (b.kind === "Brief") table(b.title, ["#", "point"], b.points.map((p, i) => [i + 1, p.text]));
    else if (b.kind === "Answer") table(b.title, ["fact", "value", "unit"], b.facts.map((f) => [f.label, f.value, f.unit]));
    else if (b.kind === "Findings") table(b.title, ["finding", "value", "unit", "method", "n", "caveat"], b.items.map((f) => [f.title, f.value, f.unit, f.method, f.n, f.caveat]));
    else if (b.kind === "Filled") table(b.title, ["id", "title", ...b.cols.flatMap((c) => [c.label, `${c.label} source`])], b.rows.map((r) => [r.id, r.title, ...r.cells.flatMap((c) => [c.v, c.src])]));
  }
  return out.join("\n");
}

/** The case ids on the Stage in order, for "open 3" and "draft for the first three". */
export function caseIds(d: StageDocT): string[] {
  const list = d.blocks.find((b) => b.kind === "CaseList");
  if (list && list.kind === "CaseList") return list.rows.map((r) => r.id);
  const det = d.blocks.find((b) => b.kind === "CaseDetail");
  if (det && det.kind === "CaseDetail") return [det.incident.id];
  const news = d.blocks.find((b) => b.kind === "NewsReader");
  if (news && news.kind === "NewsReader") return news.items.map((x) => x.incidentId).filter((x): x is string => !!x);
  return [];
}
