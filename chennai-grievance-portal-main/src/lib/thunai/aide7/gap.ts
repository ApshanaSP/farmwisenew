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
import type { Lang } from "../types";
import type { Fact7 } from "./ground";

export interface GapHit { outlet: string; outletTa: string | null; title: string; url: string | null; at: number | null; from: "dashboard" | "web" }
export interface GapDeps {
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
/** the gap's distinctive words that the Collector said (a word the model added is not looked for) */
export function gapWords(gap: string, question: string): string[] {
  const q = ` ${question.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")} `;
  return [...new Set(gap.toLowerCase().replace(/['’]s\b/g, "").split(/[^\p{L}\p{M}\p{N}]+/u).filter((w) => w.length >= 2 && !STOP.has(w) && q.includes(` ${w}`)))].slice(0, 6);
}

/** "visit" said in the question is part of what is asked: a report must carry it too when the question names an event */
const EVENT = /\b(visit\w*|inaugurat\w*|meet\w*|review\w*|protest\w*|strike\w*|rally|announce\w*|launch\w*|open\w*|tour\w*)\b/i;

/** Does a report's text hold the gap's words? Every name word, and the event word when the question names one. */
export function matches(text: string, words: string[], question: string): boolean {
  const t = ` ${text.toLowerCase()} `;
  const named = words.filter((w) => t.includes(w));
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

/** The gap as the Collector said it: the question's own words (their casing kept) that the gap names, in the question's order */
export function gapPhrase(gap: string, question: string): string {
  const want = new Set(gap.toLowerCase().replace(/['’]s\b/g, "").split(/[^\p{L}\p{M}\p{N}]+/u).filter((w) => w.length >= 2 && !STOP_PHRASE.has(w)));
  return question.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")).filter((w) => w && want.has(w.toLowerCase().replace(/['’]s$/, ""))).slice(0, 6).join(" ");
}
const STOP_PHRASE = new Set(["the", "a", "an", "is", "are", "was", "of", "in", "on", "at", "to", "and", "or", "what", "who", "should", "know", "tell", "me", "about", "any", "there", "this", "that"]);

/** Look for the gap: the dashboard's news first, the outlets' feeds only when it has nothing. At most three reports, newest first. */
export async function findGap(gap: string, question: string, d: GapDeps = {}): Promise<GapFound> {
  const t0 = Date.now();
  const words = gapWords(gap, question);
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
