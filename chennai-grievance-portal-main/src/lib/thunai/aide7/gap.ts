/**
 * v7: the part of a question the dashboard does not cover ("CM Vijay is visiting Adyar": the dashboard has Adyar, not the visit). Only that
 * part is looked for, and only in two places, in this order:
 *   1. the dashboard's own news reports (the console's search over every stored report: `search_records`, kinds news);
 *   2. the allowed outlets' own feeds (v6's reader, web/related.ts readFeed: fetched by their fixed address, no query, under the owner's
 *      allow/deny list, robots.txt, the caps and the 10-minute cache).
 * Nothing leaves the server but those fixed feed requests: no search query is built, so no word of the Collector's, no complaint and no
 * name reaches any site. A report matches when its headline (or the feed's own snippet) holds the gap's distinctive words. What is found
 * becomes facts for one more checked sentence that names the outlet and when; nothing found is said plainly, in the question's own words.
 * Neither is ever filled in by a model. (Research: docs/jarvis/v7-research/20-structured-qa.md rec 2.)
 */
import { relativeTime } from "../web/brief";
import { injectionLike } from "../web/compare";
import { listOf, type WebDeps } from "../web/fetch";
import { readFeed } from "../web/related";
import type { Lang, World } from "../types";
import type { Fact7 } from "./ground";

export interface GapHit { outlet: string; outletTa: string | null; title: string; url: string | null; at: number | null; from: "dashboard" | "web" }
export interface GapDeps {
  /** the district's own names, left out of a gap's search words */
  world?: Pick<World, "zones" | "places"> | null;
  /** the dashboard's own stored news, searched by the gap's words (the console's search; server only) */
  dashboardNews?: (words: string[]) => Promise<GapHit[]>;
  /** the outlets' feed entries (the default reads every allowed feed through v6's reader) */
  feeds?: () => Promise<GapHit[]>;
  web?: WebDeps;
  now?: () => number;
}

const STOP = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "to", "of", "in", "on", "at", "for", "and", "or", "about", "what", "who", "when", "where", "why", "how", "will",
  "would", "should", "could", "can", "do", "does", "did", "any", "there", "this", "that", "these", "those", "today", "tomorrow", "yesterday", "visit", "visiting", "know", "tell", "me",
  "my", "our", "his", "her", "their", "its", "it", "has", "have", "had", "with", "from", "by", "up", "news", "report", "reports", "say", "says", "said", "i", "we", "you", "nothing", "anything",
  "something", "part", "dashboard", "console", "data", "the", "ah", "la", "pathi", "enna", "sollu", "irukka", "irukku"]);
/**
 * the gap's distinctive words that the Collector said (a word the model added is not looked for), less the district's own place names: a place
 * alone matches every report about it ("Adyar" found a park and a restaurant sale for "the cause of the rise in Adyar": the Claude pilot, 17 Nov)
 */
export function gapWords(gap: string, question: string, world?: Pick<World, "zones" | "places"> | null): string[] {
  const q = ` ${question.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")} `;
  const place = new Set((world ? [...world.zones.map((z) => z.name), ...world.places.flatMap((p) => [p.name, ...p.aliases])] : [])
    .flatMap((n) => n.toLowerCase().split(/[^\p{L}\p{N}]+/u)).filter((x) => x.length >= 3));
  const words = [...new Set(gap.toLowerCase().replace(/['’]s\b/g, "").split(/[^\p{L}\p{M}\p{N}]+/u).filter((w) => w.length >= 2 && !STOP.has(w) && !place.has(w) && q.includes(` ${w}`)))].slice(0, 6);
  // one short word alone ("cm") is no search: it would match any headline that holds it (the Haiku dev run, 17 Nov: "CM Royapuram ku eppo varaaru")
  return words.length === 1 && [...words[0]].length < 4 ? [] : words;
}
/** a "gap" that is a cause or a why: the record answers it (it shows what moved, not why); nothing outside is looked for */
export const causeGap = (gap: string): boolean => /\b(?:cause[sd]?|why|reasons?|drove|driv(?:e|es|ing|en)|behind (?:it|the)|explain(?:s|ed)?)\b/i.test(gap);

/** "visit" said in the question is part of what is asked: a report must carry it too when the question names an event */
const EVENT = /\b(visit\w*|inaugurat\w*|meet\w*|review\w*|protest\w*|strike\w*|rally|announce\w*|launch\w*|open\w*|tour\w*)\b/i;

/** Does a report's text hold the gap's words? Every name word, and the event word when the question names one. */
export function matches(text: string, words: string[], question: string): boolean {
  const t = ` ${text.toLowerCase()} `;
  // whole words ("cm" is not in "CMWSSB" or "Acme"); a longer word may carry an ending ("visit" in "visits")
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const named = words.filter((w) => new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${esc(w)}${[...w].length < 5 ? "(?![\\p{L}\\p{M}\\p{N}])" : ""}`, "u").test(t));
  if (named.length < Math.min(2, words.length) || !named.length) return false;
  const ev = question.match(EVENT)?.[1]?.toLowerCase().slice(0, 5);
  return !ev || t.includes(ev);
}

const defaultFeeds = (o: WebDeps = {}) => async (): Promise<GapHit[]> => {
  const list = listOf(o);
  const reads = await Promise.all(list.outlets.flatMap((out) => out.feeds.map((f) => readFeed(out, f, o).then((r) => ({ out, r })).catch(() => null))));
  // not one feed read: the news could not be searched (never "nothing in the news")
  if (!reads.some((x) => x?.r.status === "ok")) throw new Error("no news feed could be read");
  return reads.flatMap((x) => (x ? x.r.entries.map((e) => ({ outlet: x.out.name, outletTa: x.out.nameTa, title: `${e.title}${e.snippet ? ` . ${e.snippet}` : ""}`, url: e.url, at: e.publishedAt, from: "web" as const })) : []));
};

export interface GapFound { status: "ok" | "nothing" | "no-words" | "unavailable"; words: string[]; hits: GapHit[]; ms: number; /** the gap in the question's own words and casing */ phrase: string }

/**
 * The gap as the Collector said it, for the nothing line (said by code, never by a model):
 *  - the writer's gap as written when every word that carries meaning in it is one the Collector said ("the CM Vijay's visit to Adyar"), with
 *    "what did X say" said as "what X said";
 *  - else the clause of the question that holds the gap's words, as a clause ("that CM Vijay is visiting Adyar"), never a heap of its words
 *    ("CM Vijay Adyar": the Haiku dev run, 17 Nov);
 *  - else nothing (the line then says "that").
 */
export function gapPhrase(gap: string, question: string): string {
  const clean = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const base = (w: string) => w.toLowerCase().replace(/['’]s$/, "");
  const qWords = question.split(/\s+/).map(clean).filter(Boolean);
  const qLow = qWords.map(base);
  // the same word, or the same start (5 letters in English, 3 in Tamil: "visit" / "visiting", "வருவது" / "வருகிறாரா")
  const stem = (w: string) => ([...w].some((c) => /[஀-௿]/u.test(c)) ? [...w].slice(0, 3).join("") : w.slice(0, 5));
  const said = (w: string) => qLow.some((x) => x === w || x.startsWith(stem(w)));
  const g = gap.replace(/\s+/g, " ").trim().replace(/[.?!,;:]+$/, "");
  const gWords = g.split(" ").map(clean).filter(Boolean);
  const content = gWords.map(base).filter((w) => [...w].length >= 2 && !FUNC.has(w));
  if (content.length && content.every(said)) {
    // the Collector's casing for a word they said exactly ("cm vijay visiting" -> "CM Vijay visiting")
    const cased = g.split(" ").map((t) => { const i = qLow.indexOf(clean(t).toLowerCase()); return i >= 0 && clean(t).toLowerCase() === qWords[i].toLowerCase() ? t.replace(clean(t), qWords[i]) : t; }).join(" ");
    return reported(cased);
  }
  const clauses = question.split(/[,;?.!]+/).map((c) => c.trim()).filter(Boolean);
  const clause = clauses.find((c) => c.split(/\s+/).map(clean).map(base).some((w) => content.includes(w) || content.some((x) => w.startsWith(stem(x)))));
  if (!clause) return "";
  return /^(?:what|who|whom|when|where|why|how|which|whether|is|are|was|were|will|did|does|do|has|have|can)\b/i.test(clause) || !/\b(?:is|are|was|were|will|has|have|had)\b/i.test(clause) ? reported(clause) : `that ${clause}`;
}
/** words that carry no meaning of their own in a gap (its words must be the Collector's: these may be the writer's) */
const FUNC = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "of", "in", "on", "at", "to", "and", "or", "what", "who", "when", "where", "why", "how", "whether",
  "should", "know", "tell", "me", "about", "any", "there", "this", "that", "did", "does", "do", "has", "have", "had", "will", "would", "can", "his", "her", "its", "their", "itself",
  "with", "from", "by", "for", "up", "s"]);
const PAST: Record<string, string> = { say: "said", do: "did", announce: "announced", decide: "decided", order: "ordered", promise: "promised", plan: "planned", want: "wanted", tell: "told" };
/** "what did the Governor say about the floods" said as "what the Governor said about the floods" */
const reported = (s: string) => s.replace(/^(what|who|when|where|why|how)\s+(?:did|does|do)\s+(.+?)\s+(say|do|announce|decide|order|promise|plan|want|tell)\b/i,
  (_m, wh: string, subj: string, verb: string) => `${wh} ${subj} ${PAST[verb.toLowerCase()] ?? verb}`);

/** Look for the gap: the dashboard's news first, the outlets' feeds only when it has nothing. At most three reports, newest first. */
export async function findGap(gap: string, question: string, d: GapDeps = {}): Promise<GapFound> {
  const t0 = Date.now();
  const words = gapWords(gap, question, d.world);
  const phrase = gapPhrase(gap, question);
  if (!words.length) return { status: "no-words", words, hits: [], ms: 0, phrase };
  const now = (d.now ?? Date.now)();
  const fresh = (h: GapHit) => h.at == null || now - h.at < 4 * 86_400_000;
  const pick = (hs: GapHit[]) => hs.filter((h) => fresh(h) && !injectionLike(h.title) && matches(h.title, words, question)).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 3);
  const own = d.dashboardNews ? pick(await d.dashboardNews(words).catch(() => [])) : [];
  if (own.length) return { status: "ok", words, hits: own, ms: Date.now() - t0, phrase };
  let read = true;
  const web = pick(await (d.feeds ?? defaultFeeds(d.web))().catch(() => { read = false; return [] as GapHit[]; }));
  return { status: web.length ? "ok" : read ? "nothing" : "unavailable", words, hits: web, ms: Date.now() - t0, phrase };
}

/** The reports found, as facts (their headline is what the outlet said, said as such) */
export function gapFacts(hits: GapHit[], now: number, first = 1): Fact7[] {
  return hits.map((h, i) => {
    const iso = h.at != null ? new Date(h.at).toISOString() : null;
    const en = relativeTime(iso, now, "en"), ta = relativeTime(iso, now, "ta");
    return { id: `F${first + i}`, src: h.from === "web" ? `web:${h.outlet}` : h.outlet, text: `${h.outlet}${en ? ` (${en})` : ""}${h.from === "web" ? ", from its own news feed" : ", in the dashboard's news"}: ${h.title.slice(0, 200)}`,
      times: [en, ta].filter((x): x is string => !!x), names: h.outletTa ? [h.outletTa] : [] };
  });
}

/**
 * Nothing found: said plainly, the gap in the Collector's own words (never the model's), and claiming only what was searched: the dashboard and
 * the latest news ("news"), the dashboard alone (the look-up off or out of time, "dashboard"), or the dashboard with the feeds unreadable.
 */
export function nothingLine(phrase: string, lang: Lang, searched: "news" | "dashboard" | "unavailable" = "news"): string {
  const what = phrase.trim();
  if (lang === "ta") {
    const about = what ? `${what} பற்றி ` : "அதைப் பற்றி ";
    return searched === "news" ? `${about}டாஷ்போர்டிலும் சமீபத்திய செய்திகளிலும் எதுவும் இல்லை.`
      : searched === "unavailable" ? `${about}டாஷ்போர்டில் எதுவும் இல்லை; செய்தி ஊட்டங்களை இப்போது படிக்க முடியவில்லை.` : `${about}டாஷ்போர்டில் எதுவும் இல்லை.`;
  }
  const it = what || "that";
  return searched === "news" ? `Nothing in the dashboard or the latest news mentions ${it}.`
    : searched === "unavailable" ? `The dashboard has nothing on ${it}, and the news feeds could not be read just now.` : `The dashboard has nothing on ${it}.`;
}
