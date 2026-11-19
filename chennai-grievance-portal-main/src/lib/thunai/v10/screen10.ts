/**
 * v10: one screen model, the single source of truth for references (docs/jarvis/JARVIS_V10.md 4.3). The owner, 19 Nov: "It should see what is
 * on the screen." What is visible, in which order, which list is "the list", what is in focus; every reference resolves against it: "first",
 * "the last one", "that one", "the Adyar one", and the by-ear forms ("fast" for "first": Whisper's Indian English, the owner's own turn).
 *
 *   screenModel(c)          the lists on screen, the one a bare reference means first: Jarvis's Stage when it shows a list (its news or its
 *                           cases), else the console's news panel when it is open, else Ask the Map's suggested questions when they show
 *   earOrdinals(text, o)    a position said by ear, read as the position: only with a list on screen and only where a position is said ("the
 *                           fast news", "fast one", "the secand story"); "how fast", "fast track", "breakfast" stay as they are
 *   refOn(text, sm)         the item a reference names on the main list: { list, index, id }, or null
 *
 * Pure: no React, no network. The lanes (browser10.ts) read the model; v8's refs8 and newsOrdinal8 still decide the position words.
 */
import { isEnglishWord } from "../english";
import { ordinalAt } from "../v8/ord8";
import { earSim } from "./phon10";

export interface ScreenItem { id: string; title: string; source?: string | null; place?: string | null }
export type ListKind = "news" | "cases" | "suggest";
export interface ScreenList { key: "stage.news" | "stage.cases" | "panel.news" | "askmap.suggest"; kind: ListKind; items: ScreenItem[] }
export interface ScreenModel {
  /** the lists on screen, the one a bare reference means first */
  lists: ScreenList[];
  /** the item being read or opened last ("that one"), if any */
  focus: { key: ScreenList["key"]; id: string } | null;
  /** the console's page and open panel */
  page: string | null;
  panel: string | null;
}

interface StageLike { blocks: { kind: string; rows?: unknown; items?: unknown }[]; slots?: Record<string, unknown> | null }

/** Build the model from what the browser knows: the open Stage, the console's state, the news on screen (Thunai.tsx newsOnScreen). */
export function screenModel(c: { stage: StageLike | null; state: { page?: string | null; panel?: string | null }; news?: { items?: { id: string; title?: string; source?: string | null }[]; reading?: string | null };
  suggest?: string[] | null; focus?: { key: ScreenList["key"]; id: string } | null }): ScreenModel {
  const lists: ScreenList[] = [];
  const st = c.stage;
  if (st && !st.slots?.web) {
    for (const b of st.blocks) {
      if (b.kind === "NewsReader" && Array.isArray(b.items)) lists.push({ key: "stage.news", kind: "news", items: (b.items as { id: string; title?: string; source?: string | null; place?: string | null }[]).filter((x) => !/^web-\d/.test(x.id)).map((x) => ({ id: x.id, title: String(x.title ?? ""), source: x.source ?? null, place: x.place ?? null })) });
      if (b.kind === "CaseList" && Array.isArray(b.rows)) lists.push({ key: "stage.cases", kind: "cases", items: (b.rows as { id: string; title?: string; place?: string | null; zoneName?: string | null }[]).map((x) => ({ id: x.id, title: String(x.title ?? ""), place: x.place ?? x.zoneName ?? null })) });
    }
  }
  // the console's own news panel: open, and no Stage list over it (a Stage's read of one story leaves the panel's list the one meant)
  if (c.state.panel === "news" && !lists.length && c.news?.items?.length) lists.push({ key: "panel.news", kind: "news", items: c.news.items.filter((x) => !/^web-\d/.test(x.id)).map((x) => ({ id: x.id, title: String(x.title ?? ""), source: x.source ?? null })) });
  if (c.suggest?.length) lists.push({ key: "askmap.suggest", kind: "suggest", items: c.suggest.map((q, i) => ({ id: `q${i + 1}`, title: q })) });
  const focus = c.focus ?? (c.news?.reading && lists[0] ? { key: lists[0].key, id: c.news.reading } : null);
  return { lists, focus, page: c.state.page ?? null, panel: c.state.panel ?? null };
}

/** by ear: the words Indian English speakers' ordinals come back as from the speech-to-text, to the ordinal (only where a position is said) */
const EAR_ORD: [string, string[]][] = [
  ["first", ["fast", "farst", "fust", "frist", "fist", "furst", "fursht"]],
  ["second", ["secand", "sekand", "secant", "sekond", "seccond", "sekend", "segand"]],
  ["third", ["thurd", "tird", "therd", "thard", "tard", "turd"]],
  ["fourth", ["forth", "fort", "fourt", "foruth", "forthe"]],
  ["fifth", ["fift", "fith", "fifty", "pifth", "fipth"]],
  ["last", ["laast", "lasht", "lust"]]
];
const EAR_MAP = new Map<string, string>(EAR_ORD.flatMap(([o, ws]) => ws.map((w) => [w, o] as [string, string])));
/** after the by-ear word: a list's noun, "one", a verb or the end (the position is said); before it: "the", "that", "this", or a verb */
const AFTER = /^(?:news|story|stories|article|report|headline|item|one|case|complaint|question|stop|seithi|seidhi|onnu|open|read|please|padinga|padi|thiranga)$/;
const BEFORE = /^(?:the|that|this|open|read|play|tell|about|explain)$/;

/**
 * A position said by ear, read as the position, with a list on screen. "Tell me about the fast news" -> "Tell me about the first news".
 * Never without a list ("fast" is fast), never where no position is said ("how fast is the drain work", "fast track the Adyar case").
 */
export function earOrdinals(text: string, o: { list: boolean }): string {
  if (!o.list) return text;
  const parts = text.split(/(\s+)/);
  const words = parts.map((p) => p.toLowerCase().replace(/[^a-z]/g, ""));
  for (let i = 0; i < parts.length; i++) {
    const w = words[i];
    if (!w || /\s/.test(parts[i])) continue;
    let ord = EAR_MAP.get(w) ?? null;
    // a word that is no English word and sounds like an ordinal ("sekkand", "thirdu")
    if (!ord && w.length >= 4 && !isEnglishWord(w)) for (const [o2] of EAR_ORD) if (o2 !== "last" && earSim(w, o2) >= 0.9) { ord = o2; break; }
    if (!ord) continue;
    const prev = words.slice(0, i).filter(Boolean).at(-1) ?? "";
    const next = words.slice(i + 1).filter(Boolean)[0] ?? "";
    // "fifty" is a number unless said as a position ("the fifty news" is the fifth only with a list's noun after it)
    if (w === "fifty" && !AFTER.test(next)) continue;
    // a by-ear form that is itself an English word ("fort", "fast", "fist") is a position only with a list's word after it: at a sentence's end it
    // is what was said ("Any news from the Fort?", "Any update on the fast?": v10 review 2, finding 25); "secand", "thurd" may end one
    const end = next === "" && !isEnglishWord(w);
    if (!(BEFORE.test(prev) && (AFTER.test(next) || end)) && !(prev === "the" && AFTER.test(next))) continue;
    parts[i] = parts[i].replace(/[A-Za-z]+/, (m) => (m[0] === m[0].toUpperCase() ? ord![0].toUpperCase() + ord!.slice(1) : ord!));
  }
  return parts.join("");
}

/** The item a reference names on the main list, by its position (ord8's reading, by-ear forms first), or null. */
export function refOn(text: string, sm: ScreenModel): { list: ScreenList; index: number; id: string } | null {
  const list = sm.lists[0];
  if (!list || !list.items.length) return null;
  const at = ordinalAt(earOrdinals(text, { list: true }));
  if (!at) return null;
  const k = at.n === -1 ? list.items.length : at.n;
  if (k < 1 || k > list.items.length) return null;
  return { list, index: k - 1, id: list.items[k - 1].id };
}
