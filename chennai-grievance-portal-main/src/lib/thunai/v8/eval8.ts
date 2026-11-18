/**
 * v8: the understanding sets' items, their gold, and the scorer (pure; the live runner is eval8.live.ts).
 *
 * An item is one spoken request in its setting: what the screen shows (`screen`), what was said before (`before`), whether the open mic heard
 * it with no name (`mic`, the addressee gate applies) and how long since Jarvis last spoke (`engagedSec`), the language the ears labelled it
 * (`heard`) and the console's own language setting (`ui`). Its gold says what a sharp aide would do: stay silent, answer in a language, open
 * or read a particular story, build a particular kind of screen, open a particular case, ask back, or say plainly that it is outside.
 *
 * The outcome is read the same way from v7's code and v8's: the browser's lanes (v8/browser.ts) and the server's round (round.ts).
 */
export type Kind8 = "owner" | "newsTopic" | "newsAsk" | "reference" | "followup" | "side" | "lang" | "command" | "question" | "outside";
export type Lang8 = "en" | "ta" | "tg";

export interface Item8 {
  id: string;
  kind: Kind8;
  /** the language the request is said in: English, Tamil (script), Tanglish (romanised Tamil) */
  lang: Lang8;
  text: string;
  /** what is on screen before it: "newsPanel" (the console's news panel), else a sentence the fast lane builds a Jarvis screen from */
  screen?: string | null;
  /** earlier requests, each played through the same path first (named, so the gate lets them through) */
  before?: string[];
  /** heard by the open mic (the addressee gate applies); false: typed or named */
  mic?: boolean;
  /** seconds since Jarvis's last turn ended (engaged within 20); null: not engaged */
  engagedSec?: number | null;
  /** the ears' language label (Whisper's), which can be wrong */
  heard?: "en" | "ta";
  /** the console's language setting */
  ui?: "en" | "ta";
  gold: Gold8;
  /** why this item is here (free text, for the reader) */
  note?: string;
}

export interface Gold8 {
  /** said to someone else: no answer, no action */
  silent?: boolean;
  /** the reply's language */
  lang?: "en" | "ta";
  /** one story opened or read: its title (or English title) matches this pattern (case-insensitive) */
  story?: string;
  /** a news answer or screen whose stories (or sources) include one matching this pattern */
  newsAbout?: string;
  /** "nothing found" after a search is right too (with newsAbout) */
  orNothing?: boolean;
  /** the screen's recipe, any of these */
  recipe?: string[];
  /** a zone in the answer's scope or slots (its name) */
  zone?: string;
  /** a console page moved to */
  page?: string;
  /** the n-th case of the screen before opened or explained */
  caseN?: number;
  /** the case opened or explained is one whose zone, place or title holds this word */
  caseWhere?: string;
  /** the n-th story of the screen before (Jarvis's news list or the console's news panel) opened or read */
  storyN?: number;
  /** a question back is right */
  clarify?: boolean;
  /** outside the district and absent from the dashboard's news: refused or "nothing on that" */
  outside?: boolean;
  /** anything but a refusal, a "cannot", silence or no answer (a request that must be acted on) */
  acted?: boolean;
}

/** what one request led to, read off the browser's lanes and the server's result */
export interface Outcome8 {
  silent: boolean;
  why: string | null;
  /** the browser lane or the server's lane */
  lane: string;
  lang: "en" | "ta" | null;
  kind: string | null;
  recipe: string | null;
  zones: string[];
  pages: string[];
  /** the story opened or read (its title and English title) */
  story: string | null;
  /** its stored id */
  storyId: string | null;
  /** the stories a news screen or a news answer listed */
  stories: string[];
  /** the case opened or explained */
  caseId: string | null;
  /** the reply's words (a refusal, a question, a chat line, the screen's line) */
  reply: string | null;
  /** a news search said nothing was found */
  nothing: boolean;
  ms: number;
  model: string | null;
  error?: string;
  /** ANSWER=1: what Jarvis would say (the aide's checked sentences, a news brief, a code line), and the facts they were written from */
  spoken?: string[];
  facts?: string[];
}

export const emptyOutcome = (): Outcome8 => ({ silent: false, why: null, lane: "none", lang: null, kind: null, recipe: null, zones: [], pages: [], story: null, storyId: null, stories: [], caseId: null, reply: null, nothing: false, ms: 0, model: null });

export interface Score8 { ok: boolean; langOk: boolean | null; misses: string[] }

const re = (p: string) => new RegExp(p, "i");
/** a refusal or a "cannot" said back (not an answer to a request that should have been acted on) */
const REFUSAL = /\b(?:cannot|can't|can not|I'm not able|not able to|I don't have|I have no data|no data on|not in the (?:console|data|dashboard)|outside)\b|முடியாது|இல்லை\.?$|தரவு இல்லை/i;

/** Score one outcome against its gold. Every field the gold sets must hold; the language is scored on its own as well. */
export interface Seen8 { caseIds?: string[]; cases?: { id: string; words: string }[]; storyIds?: string[] }
export function score8(g: Gold8, o: Outcome8, seen: Seen8 | string[] = {}): Score8 {
  const sn: Seen8 = Array.isArray(seen) ? { caseIds: seen } : seen;
  const caseIds = sn.caseIds ?? [];
  const misses: string[] = [];
  if (g.silent) {
    if (!o.silent) misses.push("answered side talk");
    return { ok: misses.length === 0, langOk: null, misses };
  }
  if (o.silent) misses.push(`silent (${o.why ?? "gate"})`);
  const langOk = g.lang ? o.lang === g.lang : null;
  if (g.lang && !langOk) misses.push(`lang ${o.lang ?? "none"} != ${g.lang}`);
  if (g.story && !(o.story && re(g.story).test(o.story))) misses.push(`story: got ${o.story ? JSON.stringify(o.story.slice(0, 60)) : "none"}`);
  if (g.newsAbout) {
    const hit = [o.story ?? "", ...o.stories].some((s) => s && re(g.newsAbout as string).test(s));
    if (!hit && !(g.orNothing && o.nothing)) misses.push("news: no matching story");
  }
  if (g.recipe && !(o.recipe && g.recipe.includes(o.recipe))) misses.push(`recipe ${o.recipe ?? "none"} not in ${g.recipe.join("|")}`);
  if (g.zone && !o.zones.some((z) => z.toLowerCase() === g.zone!.toLowerCase())) misses.push(`zone ${g.zone} not in [${o.zones.join(", ")}]`);
  if (g.page && !o.pages.includes(g.page)) misses.push(`page ${g.page} not in [${o.pages.join(", ")}]`);
  if (g.caseN != null) {
    const want = caseIds[g.caseN - 1];
    if (!want || o.caseId !== want) misses.push(`case ${o.caseId ?? "none"} != #${g.caseN}`);
  }
  if (g.caseWhere) {
    const row = (sn.cases ?? []).find((x) => x.id === o.caseId);
    if (!row || !row.words.toLowerCase().includes(g.caseWhere.toLowerCase())) misses.push(`case ${o.caseId ?? "none"} not in ${g.caseWhere}`);
  }
  if (g.storyN != null) {
    const want = (sn.storyIds ?? [])[g.storyN - 1];
    if (!want || o.storyId !== want) misses.push(`story ${o.storyId ?? "none"} != #${g.storyN}`);
  }
  if (g.clarify && o.kind !== "clarify") misses.push(`not asked back (${o.kind ?? "none"})`);
  if (g.outside && !(o.kind === "refuse" || o.nothing || (o.reply != null && REFUSAL.test(o.reply)))) misses.push("outside: not refused or said absent");
  if (g.acted) {
    const refused = o.kind === "refuse" || o.kind === "none" || o.kind == null || (o.kind === "chat" && o.reply != null && REFUSAL.test(o.reply));
    if (refused) misses.push(`not acted on (${o.kind ?? "none"})`);
  }
  return { ok: misses.length === 0, langOk, misses };
}

export interface Tally8 { n: number; ok: number; langN: number; langOk: number }
export function tally8(rows: { kind: string; lang: string; ok: boolean; langOk: boolean | null }[]): { all: Tally8; byKind: Record<string, Tally8>; byLang: Record<string, Tally8> } {
  const t = (xs: typeof rows): Tally8 => ({ n: xs.length, ok: xs.filter((x) => x.ok).length, langN: xs.filter((x) => x.langOk != null).length, langOk: xs.filter((x) => x.langOk === true).length });
  const group = (k: "kind" | "lang") => Object.fromEntries([...new Set(rows.map((r) => r[k]))].sort().map((v) => [v, t(rows.filter((r) => r[k] === v))]));
  return { all: t(rows), byKind: group("kind"), byLang: group("lang") };
}

/** Check a set file's shape: every item has an id, a kind, a language, words and a gold with at least one field. Returns the problems. */
export function checkSet(items: unknown[]): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const KINDS = new Set(["owner", "newsTopic", "newsAsk", "reference", "followup", "side", "lang", "command", "question", "outside"]);
  for (const [i, x] of items.entries()) {
    const it = x as Partial<Item8>;
    const at = `item ${i} (${it.id ?? "?"})`;
    if (!it.id || typeof it.id !== "string") out.push(`${at}: no id`);
    else if (ids.has(it.id)) out.push(`${at}: duplicate id`); else ids.add(it.id);
    if (!it.kind || !KINDS.has(it.kind)) out.push(`${at}: bad kind`);
    if (!it.lang || !["en", "ta", "tg"].includes(it.lang)) out.push(`${at}: bad lang`);
    if (!it.text || typeof it.text !== "string" || it.text.length > 300) out.push(`${at}: bad text`);
    if (!it.gold || typeof it.gold !== "object" || !Object.keys(it.gold).length) out.push(`${at}: no gold`);
    for (const k of ["story", "newsAbout"] as const) {
      const p = it.gold?.[k];
      if (p != null) { try { new RegExp(p, "i"); } catch { out.push(`${at}: bad pattern in ${k}`); } }
    }
  }
  return out;
}
