/**
 * Jarvis v6, Phase 4: other outlets' reports of the same event. Server only.
 *
 * Candidates come only from the allowed outlets' OWN feeds and news sitemaps (domains.ts outlets), fetched in parallel through
 * fetch.ts with a per-feed cap (2.5 s) and kept 10 minutes. They are matched HERE, against the item's public words (terms.ts:
 * places, incident type, headline words) and a date window: no query leaves the server, so nothing about the incident (and
 * nothing personal) is ever sent anywhere. Duplicates are dropped (the same URL after normalising, or near-identical headlines),
 * one report per outlet, the item's own outlet left out, at most 3 others. Google News is never used (its robots.txt disallows
 * /rss) and GDELT is too slow for a spoken answer (docs/jarvis/v6-research/40-news-web.md).
 */
import { performance } from "perf_hooks";
import { normTitle, UA } from "@/lib/collector/pageread";
import { type Outlet, outletByName, outletOfUrl } from "./domains";
import { CAPS, type WebDeps, type WebStatus, caches, capsOf, clockOf, listOf, normUrl, tele, webGet } from "./fetch";
import { readArticle } from "./read";
import { placesIn, typesIn, wordsIn } from "./terms";

/** A news item or an incident's news, as the console stores it. Only these fields are read; any other field is ignored. */
export interface NewsItemInput {
  id?: string | null;
  title?: string | null;
  /** the English headline of a Tamil report (documents.title_en) */
  titleEn?: string | null;
  url?: string | null;
  /** the publisher's name ("The Hindu") and web domain */
  outlet?: string | null;
  publisherDomain?: string | null;
  /** when it was published: ISO, epoch ms, or the store's IST "YYYY-MM-DD HH:MM:SS" */
  publishedAt?: string | number | null;
  /** the place and category the monitor read (public words of the report) */
  place?: string | null;
  category?: string | null;
}

export interface FeedEntry { outletId: string; title: string; url: string; publishedAt: number | null; snippet: string }

export interface Coverage {
  outlet: string;
  outletTa: string;
  outletId: string;
  url: string;
  title: string;
  publishedAt: string | null;
  /** how well it matched (places, type, headline words) */
  score: number;
  /** "article" when its page was read; "feed" when only the feed's headline and summary are known (robots, time, a failure) */
  source: "article" | "feed";
  /** the outlet's own words: the article's main text, or the feed's headline and summary */
  text: string;
  status: WebStatus | "not_read";
}

export interface Related {
  items: Coverage[];
  /** the item's own outlet's copy in its feed (its own URL), when the stored link could not be read (a Google News link) */
  self: FeedEntry | null;
  feeds: { tried: number; ok: number; cached: number; failed: number; ms: number };
  ms: number;
}

// ------------------------------------------------------------------ feeds --

export const unxml = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Math.min(0x10ffff, Number(d))))
  .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(Math.min(0x10ffff, parseInt(h, 16))))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
export const strip = (s: string) => unxml(s).replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
export const tag = (block: string, name: string) => new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block)?.[1] ?? null;
const time = (s: string | null) => { if (!s) return null; const t = Date.parse(unxml(s)); return Number.isFinite(t) ? t : null; };

/** The entries of an RSS feed, an Atom feed or a (news) sitemap. Only http(s) links are kept. */
export function parseFeed(xml: string, outletId: string): FeedEntry[] {
  const out: FeedEntry[] = [];
  const push = (title: string | null, link: string | null, at: number | null, snippet: string | null) => {
    const url = unxml(link ?? "").trim();
    if (!/^https?:\/\//i.test(url)) return;
    const t = strip(title ?? "");
    if (!t && !snippet) return;
    out.push({ outletId, title: t.slice(0, 300), url, publishedAt: at, snippet: strip(snippet ?? "").slice(0, 600) });
  };
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0];
    push(tag(b, "title"), tag(b, "link") ?? tag(b, "guid"), time(tag(b, "pubDate") ?? tag(b, "dc:date")), tag(b, "description"));
  }
  for (const m of xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)) {
    const b = m[0];
    const href = /<link[^>]*href=["']([^"']+)["']/i.exec(b)?.[1] ?? null;
    push(tag(b, "title"), href, time(tag(b, "published") ?? tag(b, "updated")), tag(b, "summary") ?? tag(b, "content"));
  }
  if (!out.length) {
    for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
      const b = m[1];
      const loc = tag(b, "loc");
      // the address often carries the English headline ("...-velachery-wall-collapse-3-injured")
      const slug = (() => { try { return decodeURIComponent(unxml(loc ?? "").split("/").filter(Boolean).pop() ?? ""); } catch { return ""; } })()
        .replace(/\.\w+$/, "").replace(/[-_]+/g, " ").replace(/\b\d{5,}\b/g, "").trim();
      push(tag(b, "news:title") ?? (/[a-z]{3}/i.test(slug) ? slug : null), loc, time(tag(b, "news:publication_date") ?? tag(b, "lastmod")), null);
    }
  }
  return out.slice(0, 400);
}

interface FeedRead { status: WebStatus; entries: FeedEntry[]; cached: boolean; ms: number }

/** One outlet's feed, from the 10-minute cache or fetched now (2.5 s at most). A failed feed is remembered for a minute. */
export async function readFeed(outlet: Outlet, feedUrl: string, o: WebDeps = {}): Promise<FeedRead> {
  const t0 = performance.now(), now = clockOf(o);
  const key = `feed:${feedUrl}`;
  const hit = caches.feeds.get(key, now()) as { status: WebStatus; entries: FeedEntry[] } | null;
  if (hit) return { ...hit, cached: true, ms: Math.round(performance.now() - t0) };
  const caps = capsOf(o);
  const got = await webGet(feedUrl, o, { kind: "feed", userAgent: UA, accept: "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5",
    deadlineAt: t0 + Math.min(caps.feedMs, CAPS.feedMs) });
  const entries = got.status === "ok" ? parseFeed(got.body, outlet.id) : [];
  const v = { status: got.status, entries };
  caches.feeds.set(key, v, entries.reduce((n, e) => n + (e.title.length + e.snippet.length + e.url.length) * 2 + 64, 64), now(), got.status === "ok" ? undefined : 60_000);
  return { ...v, cached: false, ms: Math.round(performance.now() - t0) };
}

// ---------------------------------------------------------------- matching --

/** "YYYY-MM-DD HH:MM:SS" from the store is IST wall-clock time (lib/collector/db.ts dateStrings). */
export function toMs(t: string | number | null | undefined): number | null {
  if (t == null || t === "") return null;
  if (typeof t === "number") return Number.isFinite(t) ? t : null;
  const s = String(t).trim();
  const ist = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(s);
  const v = Date.parse(ist ? `${ist[1]}T${ist[2]}+05:30` : s);
  return Number.isFinite(v) ? v : null;
}

interface Signature { places: Set<string>; types: Set<string>; words: Set<string>; title: string; at: number }
function signature(item: NewsItemInput, now: number): Signature {
  // the public words of the report only: headline, English headline, the place and category the monitor read
  const text = [item.title, item.titleEn, item.place, item.category].filter(Boolean).join(" . ");
  const english = [item.titleEn || item.title, item.place, item.category].filter(Boolean).join(" ");
  return { places: new Set(placesIn(text).places), types: new Set(typesIn(text)), words: new Set(wordsIn(english)), title: normTitle(item.titleEn || item.title || ""),
    at: toMs(item.publishedAt) ?? now };
}

/** Share of the shorter headline's words found in the other. */
function overlap(a: Set<string>, b: Set<string>): { shared: number; share: number } {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return { shared, share: shared / Math.max(1, Math.min(a.size, b.size)) };
}

/** Near-identical headlines (the same report syndicated or re-filed). */
export function sameHeadline(a: string, b: string): boolean {
  const x = normTitle(a), y = normTitle(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const wa = new Set(x.split(" ").filter((w) => w.length > 2)), wb = new Set(y.split(" ").filter((w) => w.length > 2));
  const o = overlap(wa, wb);
  return o.shared >= 4 && o.share >= 0.85;
}

/** How well a feed entry matches the item: 0 for no match. Places and type must agree, or the headlines share enough words. */
export function matchScore(sig: Signature, e: FeedEntry): number {
  const text = `${e.title} . ${e.snippet}`;
  const places = placesIn(text).places.filter((p) => sig.places.has(p));
  const types = typesIn(text).filter((t) => sig.types.has(t));
  const words = overlap(sig.words, new Set(wordsIn(text)));
  const place = places.length > 0, type = types.length > 0;
  const ok = (place && type) || (words.shared >= 3 && (place || type)) || (words.shared >= 4 && words.share >= 0.6);
  if (!ok) return 0;
  return places.length * 3 + types.length * 2 + Math.min(words.shared, 6);
}

/** Within two days of the item (a report filed late the next day still counts); an entry without a date is kept. */
const WINDOW = 2 * 864e5;
const inWindow = (sig: Signature, e: FeedEntry) => e.publishedAt == null || Math.abs(e.publishedAt - sig.at) <= WINDOW;

// --------------------------------------------------------------- coverage --

export interface RelatedOptions extends WebDeps {
  /** read the matched articles too (default true); else only the feeds' headlines and summaries */
  read?: boolean;
  /** other outlets at most (default 3) */
  max?: number;
  /** the whole step's budget in ms (default 7 s: with the article read first, an answer within the 8 s target) */
  budgetMs?: number;
}

/**
 * Other outlets' reports of the item's event, from the allowed outlets' own feeds, matched locally. Never throws. With `read`, each
 * match's article is read through readArticle (robots, caps), in parallel, within the budget; a match that cannot be read keeps
 * its feed headline and summary as its text.
 */
export async function relatedCoverage(item: NewsItemInput, o: RelatedOptions = {}): Promise<Related> {
  const t0 = performance.now(), now = clockOf(o)();
  const list = listOf(o);
  const budget = Math.min(o.budgetMs ?? 7_000, 7_000);
  const own = outletByName(item.outlet, item.publisherDomain, list) ?? (item.url ? outletOfUrl(item.url, list) : null);
  const sig = signature(item, now);
  const ownUrl = item.url ? normUrl(item.url) : null;

  const jobs = list.outlets.flatMap((out) => out.feeds.map((f) => ({ out, f })));
  const reads = await Promise.all(jobs.map(({ out, f }) => readFeed(out, f, o).then((r) => ({ out, r }))));
  const feeds = { tried: jobs.length, ok: reads.filter((x) => x.r.status === "ok").length, cached: reads.filter((x) => x.r.cached).length,
    failed: reads.filter((x) => x.r.status !== "ok").length, ms: Math.round(performance.now() - t0) };

  let self: FeedEntry | null = null;
  const scored: { e: FeedEntry; out: Outlet; score: number }[] = [];
  for (const { out, r } of reads) {
    for (const e of r.entries) {
      if (ownUrl && normUrl(e.url) === ownUrl) continue;
      // the item's own outlet: only its own copy (a Google News link's publisher URL), never "another outlet"
      if (own && out.id === own.id) { if (!self && item.title && sameHeadline(e.title, item.title)) self = e; continue; }
      if (!inWindow(sig, e) || outletOfUrl(e.url, list)?.id !== out.id) continue;
      const score = matchScore(sig, e);
      if (score > 0) scored.push({ e, out, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || (b.e.publishedAt ?? 0) - (a.e.publishedAt ?? 0));
  // duplicates: the same URL after normalising, or the same headline; then one per outlet
  const picked: typeof scored = [];
  for (const c of scored) {
    if (picked.some((p) => p.out.id === c.out.id || normUrl(p.e.url) === normUrl(c.e.url) || sameHeadline(p.e.title, c.e.title))) continue;
    picked.push(c);
    if (picked.length >= Math.min(o.max ?? 3, 3)) break;
  }

  const left = () => budget - (performance.now() - t0);
  const items: Coverage[] = await Promise.all(picked.map(async ({ e, out, score }): Promise<Coverage> => {
    const base: Coverage = { outlet: out.name, outletTa: out.nameTa, outletId: out.id, url: e.url, title: e.title, publishedAt: e.publishedAt ? new Date(e.publishedAt).toISOString() : null,
      score, source: "feed", text: [e.title, e.snippet].filter(Boolean).join(". "), status: "not_read" };
    if (o.read === false || left() < 500) return base;
    const art = await readArticle(e.url, { ...o, caps: { ...(o.caps ?? {}), totalMs: Math.min(capsOf(o).totalMs, Math.max(500, left())) } });
    if (art.status !== "ok") return { ...base, status: art.status };
    return { ...base, source: "article", text: art.text, status: "ok", publishedAt: art.publishedAt ?? base.publishedAt, title: art.title || base.title, url: art.url };
  }));
  const ms = Math.round(performance.now() - t0);
  tele(o, "web_related", { ms, count: items.length, calls: feeds.tried, ok: feeds.failed === 0, hit: feeds.cached > 0 });
  return { items, self, feeds, ms };
}
