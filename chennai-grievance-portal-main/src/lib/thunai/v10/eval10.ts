/**
 * v10: the blind set's items, their gold, and the scorer (pure; the live runner is eval10.live.ts). docs/jarvis/JARVIS_V10.md, Part 6.
 *
 * v8's items (eval8.ts) said what a request leads to for the news, the console's screens and side talk. v10's add what the owner asked for on
 * 19 Nov: names said by ear, references against a given screen ("first", "fast", "the last one"), intelligent reading (a brief, not a recital),
 * Ask the Map by voice, every dashboard control by voice, side talk and cut-off lines that must get no answer, and the named event that is both
 * news and weather. An item names its screen from a fixed vocabulary the runner can build (`Screen10`), and its gold says what a sharp aide
 * would do. The outcome is read the same way from v9's commit and v10's (each from its own checkout).
 */
import { score8, type Gold8, type Outcome8 } from "../v8/eval8";

export type Kind10 =
  /** a storm, place, person, outlet, event or department said by ear */
  | "names"
  /** "the first one", "fast news", "the last one", "that one", "the Adyar one" against a screen that is given */
  | "screenRef"
  /** read or tell about a story: a brief that says why it matters and what the console knows, or "read it fully" */
  | "reading"
  /** a story asked for by its topic, or a news question */
  | "news"
  /** Ask the Map, by voice */
  | "map"
  /** a dashboard control, by voice */
  | "control"
  /** said to someone else in the room: silent */
  | "side"
  /** a cut-off line or one word: wait or ask, never answer as if it were a request */
  | "cutoff"
  /** a new feature (news to ground truth, the district tour, the field visit) */
  | "feature";
export type Lang10 = "en" | "ta" | "tg";

/**
 * What is on the screen before the request. One of:
 *   null                  the Overview, nothing open
 *   "newsPanel"           the console's news panel, today's stories in the panel's own order
 *   "page:<page>"         the console on a page (its id from the control inventory: overview, trends, map, briefing, ...)
 *   "askMap:<question>"   Ask the Map open, this question asked and its answer on the map
 *   "stage:<sentence>"    a Jarvis screen built from this sentence (a list of cases, the news list, readings, a ranking)
 */
export type Screen10 = string | null;

export interface Item10 {
  id: string;
  kind: Kind10;
  lang: Lang10;
  /** the request as the speech-to-text would write it, slips and all */
  text: string;
  screen?: Screen10;
  /** earlier requests, played through the same path first (named, so the gate lets them through) */
  before?: string[];
  /** heard by the open mic with no name (the addressee gate applies); false: the name was said, or typed */
  mic?: boolean;
  /** seconds since Jarvis last finished speaking (engaged within 20); null: not engaged */
  engagedSec?: number | null;
  /** the ears' language label, which can be wrong */
  heard?: "en" | "ta";
  /** the console's own language setting */
  ui?: "en" | "ta";
  gold: Gold10;
  note?: string;
}

/** Ask the Map's operations, by voice */
export type MapOp = "ask" | "followup" | "chip" | "circle" | "layer" | "shot" | "export" | "save" | "visit" | "insight" | "send" | "suggest" | "rain";
export const MAP_OPS: MapOp[] = ["ask", "followup", "chip", "circle", "layer", "shot", "export", "save", "visit", "insight", "send", "suggest", "rain"];

export interface Gold10 extends Gold8 {
  /** a cut-off line or a lone word: silent, or a question back, are both right; an answer or an action is not */
  waitOrAsk?: boolean;
  /** the n-th story counted from the end of the screen's list (1: the last) */
  storyFromEnd?: number;
  /** a "did you mean <X>?" question back counts as right when it names what `story`, `newsAbout` or `entity` match */
  confirmOk?: boolean;
  /** the named thing the request means, as a pattern its canonical name matches ("Akvan|Akwan"); scored on what was opened, listed or asked */
  entity?: string;
  /** a storm or a weather event: the weather readings come too (rain gauges, the forecast, relief centres) */
  weather?: boolean;
  /** intelligent reading: the spoken brief carries these ("place": where; "console": what the console's own records say about it; "next": an
   * offered next step) */
  brief?: ("place" | "console" | "next")[];
  /** "read it fully": the whole story, not a brief */
  full?: boolean;
  /** the language the story is read in */
  readLang?: "en" | "ta";
  /** Ask the Map: the operation, and what it must carry (a place, a radius in km, a format, a layer, "next" or "replay" for a shot) */
  map?: { op: MapOp; place?: string; km?: number; format?: "csv" | "geojson"; layer?: string; shot?: "next" | "replay" | "previous"; question?: string };
  /** a dashboard control, by its id in the control inventory */
  control?: string;
  /** a draft made (to the tray), nothing sent */
  draft?: boolean;
  /** nothing sent, approved or deleted (a send asks for the Collector's own yes) */
  never?: boolean;
}

/** what one request led to, read off the browser's lanes and the server's result (v8's, with what v10 adds) */
export interface Outcome10 extends Outcome8 {
  /** a question back that names a candidate ("Cyclone Akvan?") */
  confirm?: string | null;
  /** the weather readings came with the answer */
  weather?: boolean;
  /** the spoken brief's parts found by the checks: "place", "console", "next"; and whether the whole story was read */
  briefHas?: string[];
  full?: boolean;
  readLang?: "en" | "ta" | null;
  /** Ask the Map operations done, in order */
  mapOps?: { op: string; place?: string | null; km?: number | null; format?: string | null; layer?: string | null; shot?: string | null; question?: string | null }[];
  /** dashboard controls operated (their inventory ids) */
  controls?: string[];
  /** a draft made, and anything sent, approved or deleted */
  drafted?: boolean;
  sent?: boolean;
}

export interface Score10 { ok: boolean; langOk: boolean | null; misses: string[] }
export interface Seen10 { caseIds?: string[]; cases?: { id: string; words: string }[]; storyIds?: string[] }

const re = (p: string) => new RegExp(p, "iu");
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.25, b * 0.15);

/** Score one outcome against its gold: every field the gold sets must hold; the language is scored on its own as well. */
export function score10(g: Gold10, o: Outcome10, seen: Seen10 = {}): Score10 {
  // a cut-off line: silence or a question back; never an answer, an action, a screen
  if (g.waitOrAsk) {
    const ok = o.silent || o.kind === "clarify";
    return { ok, langOk: null, misses: ok ? [] : [`answered a cut-off line (${o.kind ?? o.lane})`] };
  }
  // a named thing asked back ("Cyclone Akvan?"): right when the gold allows it and the question names the thing meant
  if (g.confirmOk && o.confirm) {
    const pats = [g.entity, g.story, g.newsAbout].filter((p): p is string => !!p);
    const ok = pats.some((p) => re(p).test(o.confirm as string));
    const langOk = g.lang ? o.lang === g.lang : null;
    const misses = [...(ok ? [] : [`asked back about ${JSON.stringify(o.confirm.slice(0, 60))}`]), ...(g.lang && !langOk ? [`lang ${o.lang ?? "none"} != ${g.lang}`] : [])];
    return { ok: misses.length === 0, langOk, misses };
  }
  // v8's own fields first (silence, language, story, news, recipe, zone, page, case, position, question back, outside, acted)
  const storyIds = seen.storyIds ?? [];
  const g8: Gold8 = { ...g };
  const base = score8(g8, o, seen);
  if (g.silent) return base;
  const misses = [...base.misses];
  if (g.storyFromEnd != null) {
    const want = storyIds[storyIds.length - g.storyFromEnd];
    if (!want || o.storyId !== want) misses.push(`story ${o.storyId ?? "none"} != #${g.storyFromEnd} from the end`);
  }
  if (g.entity) {
    const named = [o.story ?? "", ...o.stories, o.confirm ?? "", o.reply ?? ""].some((s) => s && re(g.entity as string).test(s));
    if (!named) misses.push(`entity ${g.entity} not reached`);
  }
  if (g.weather && !o.weather) misses.push("no weather readings");
  for (const part of g.brief ?? []) if (!(o.briefHas ?? []).includes(part)) misses.push(`brief: no ${part}`);
  if (g.full && !o.full) misses.push("not read in full");
  if (g.readLang && o.readLang !== g.readLang) misses.push(`read in ${o.readLang ?? "none"} != ${g.readLang}`);
  if (g.map) {
    const m = g.map;
    const hit = (o.mapOps ?? []).find((x) => x.op === m.op
      && (m.place == null || (x.place != null && re(m.place).test(x.place)))
      && (m.km == null || (x.km != null && near(x.km, m.km)))
      && (m.format == null || x.format === m.format)
      && (m.layer == null || (x.layer != null && re(m.layer).test(x.layer)))
      && (m.shot == null || x.shot === m.shot)
      && (m.question == null || (x.question != null && re(m.question).test(x.question))));
    if (!hit) misses.push(`map ${m.op}${m.place ? ` ${m.place}` : ""}${m.km != null ? ` ${m.km} km` : ""}${m.format ? ` ${m.format}` : ""}${m.layer ? ` ${m.layer}` : ""}${m.shot ? ` ${m.shot}` : ""} not done (did: ${(o.mapOps ?? []).map((x) => x.op).join(",") || "none"})`);
  }
  if (g.control && !(o.controls ?? []).includes(g.control)) misses.push(`control ${g.control} not operated (did: ${(o.controls ?? []).join(",") || "none"})`);
  if (g.draft && !o.drafted) misses.push("no draft made");
  if ((g.never || g.draft) && o.sent) misses.push("sent without the Collector's yes");
  return { ok: misses.length === 0, langOk: base.langOk, misses };
}

/** Check a set file's shape (no item is read for its words): ids, kinds, languages, text, a gold with a field, patterns that compile, screens
 * from the vocabulary, map operations from the list. Returns the problems. */
export function checkSet10(items: unknown[], o: { controls?: string[] } = {}): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const KINDS = new Set<Kind10>(["names", "screenRef", "reading", "news", "map", "control", "side", "cutoff", "feature"]);
  const controls = o.controls ? new Set(o.controls) : null;
  for (const [i, x] of items.entries()) {
    const it = x as Partial<Item10>;
    const at = `item ${i} (${it.id ?? "?"})`;
    if (!it.id || typeof it.id !== "string") out.push(`${at}: no id`);
    else if (ids.has(it.id)) out.push(`${at}: duplicate id`); else ids.add(it.id);
    if (!it.kind || !KINDS.has(it.kind)) out.push(`${at}: bad kind`);
    if (!it.lang || !["en", "ta", "tg"].includes(it.lang)) out.push(`${at}: bad lang`);
    if (!it.text || typeof it.text !== "string" || it.text.length > 300) out.push(`${at}: bad text`);
    if (it.screen != null && !(it.screen === "newsPanel" || /^(?:page|askMap|stage):.+/.test(it.screen))) out.push(`${at}: bad screen`);
    if (!it.gold || typeof it.gold !== "object" || !Object.keys(it.gold).length) { out.push(`${at}: no gold`); continue; }
    for (const k of ["story", "newsAbout", "entity"] as const) {
      const p = it.gold[k];
      if (p != null) { try { new RegExp(p, "iu"); } catch { out.push(`${at}: bad pattern in ${k}`); } }
    }
    if (it.gold.map && !MAP_OPS.includes(it.gold.map.op)) out.push(`${at}: bad map op`);
    if (it.gold.control && controls && !controls.has(it.gold.control)) out.push(`${at}: unknown control ${it.gold.control}`);
  }
  return out;
}
