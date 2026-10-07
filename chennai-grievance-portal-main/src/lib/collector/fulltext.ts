/**
 * The full text of a news report, fetched when the Collector opens it and the monitor kept only a headline.
 *
 * The same polite method as the pipeline (district_intel/dintel/fulltext.py), as one crawler:
 *   - a direct publisher link is read if the site's robots.txt allows the crawler;
 *   - a Google News link is never followed (news.google.com's robots.txt disallows it): the headline is looked up in
 *     the publisher's own news sitemap, listed in its robots.txt for this purpose, and that page is read instead.
 * The article is taken out of the page by Mozilla Readability (Firefox's Reader View) on a light DOM (linkedom).
 * Only recognised news media (newsrel.isNewsMedia). Each answer is cached on disk (data/aws-cache/news-fulltext.json),
 * robots.txt and sitemaps in memory for an hour, so a report is fetched at most once.
 */
import fs from "fs";
import path from "path";
import { isNewsMedia } from "@/lib/collector/newsrel";

const AGENT = "ChennaiDistrictNewsDataset"; // robots.txt token (chennai_news_pipeline/config.yaml)
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 (compatible; ChennaiDistrictNewsDataset/1.0)";
const CACHE = path.join(process.cwd(), "data", "aws-cache", "news-fulltext.json");
const HOUR = 3600_000;

export type FullStatus = "full" | "not_in_sitemap" | "robots_disallowed" | "no_text" | "not_media" | "unreachable";
export interface FullText { status: FullStatus; url: string | null; text: string | null; at: number }

declare global {
  // eslint-disable-next-line no-var
  var __fulltext: { cache: Record<string, FullText> | null; sites: Map<string, Site>; busy: Map<string, Promise<FullText>> } | undefined;
}
const g = (global.__fulltext ??= { cache: null, sites: new Map(), busy: new Map() });

function cache(): Record<string, FullText> {
  if (g.cache) return g.cache;
  try { g.cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch { g.cache = {}; }
  return g.cache!;
}
function remember(id: string, v: FullText) {
  // a headline not yet in the sitemap may appear later: only a settled answer is kept for good
  if (v.status === "not_in_sitemap" || v.status === "unreachable") v = { ...v, at: Date.now() };
  cache()[id] = v;
  try { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(g.cache)); } catch { /* read-only disk */ }
}

async function get(url: string, ms = 12_000): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-IN,ta;q=0.8" }, signal: AbortSignal.timeout(ms), redirect: "follow" });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- robots.txt --

interface Rule { allow: boolean; path: string }
/** The rules for our crawler (its own group, else "*"), longest match wins, as Google and Python's parser read them. */
function robotsRules(txt: string): { rules: Rule[]; sitemaps: string[] } {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  const sitemaps: string[] = [];
  let cur: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [k, v] = [m[1].toLowerCase(), m[2].trim()];
    if (k === "sitemap") { sitemaps.push(v); continue; }
    if (k === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (cur && (k === "allow" || k === "disallow") && v) cur.rules.push({ allow: k === "allow", path: v });
  }
  const mine = groups.find((x) => x.agents.some((a) => AGENT.toLowerCase().includes(a) && a !== "*")) ?? groups.find((x) => x.agents.includes("*"));
  return { rules: mine?.rules ?? [], sitemaps };
}
function allowed(rules: Rule[], url: string): boolean {
  let p: string;
  try { const u = new URL(url); p = u.pathname + u.search; } catch { return false; }
  let best: Rule | null = null;
  for (const r of rules) {
    const re = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(p) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

// ---------------------------------------------------------------- sitemaps --

interface Site { at: number; rules: Rule[] | null; entries: Map<string, string>; slugs: [Set<string>, string][] }

/** Headline key: lower case, letters and digits only (Tamil kept), publisher suffix removed (as the pipeline). */
export function normTitle(t: string): string {
  return String(t ?? "").normalize("NFC").toLowerCase().replace(/\s+[-|–]\s+[^-|–]{2,40}$/, "").replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").trim();
}
const words = (s: string) => new Set(s.split(" ").filter((w) => w.length > 2));
/** Share of the shorter headline's words found in the other, with four shared words at least. */
function similar(a: Set<string>, b: Set<string>): number {
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common >= 4 ? common / Math.max(1, Math.min(a.size, b.size)) : 0;
}
const unxml = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();

async function site(domain: string): Promise<Site> {
  const hit = g.sites.get(domain);
  if (hit && Date.now() - hit.at < HOUR) return hit;
  const s: Site = { at: Date.now(), rules: null, entries: new Map(), slugs: [] };
  g.sites.set(domain, s);
  const hosts = domain.split(".").length === 2 ? [`https://www.${domain}`, `https://${domain}`] : [`https://${domain}`];
  let txt: string | null = null;
  for (const h of hosts) if ((txt = await get(`${h}/robots.txt`, 8000)) != null) break;
  if (txt == null) return s; // no robots.txt: nothing is read from this site
  const r = robotsRules(txt);
  s.rules = r.rules;
  // news sitemaps first; a site naming none gets its first few (a sitemap index is followed to its newest children)
  const todo = r.sitemaps.filter((m) => /news/i.test(m)).concat(r.sitemaps.filter((m) => !/news/i.test(m))).slice(0, 6);
  let read = 0;
  while (todo.length && read < 5) {
    const m = todo.shift()!;
    if (!allowed(s.rules, m)) continue;
    read++;
    const xml = await get(m, 10_000);
    if (!xml) continue;
    if (/<sitemapindex/i.test(xml)) {
      const kids = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((x) => unxml(x[1]));
      todo.unshift(...kids.slice(0, 2));
      continue;
    }
    for (const u of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
      const loc = u[1].match(/<loc>([\s\S]*?)<\/loc>/i)?.[1];
      if (!loc) continue;
      const url = unxml(loc);
      const title = u[1].match(/<news:title>([\s\S]*?)<\/news:title>/i)?.[1];
      if (title) s.entries.set(normTitle(unxml(title)), url);
      // the address often carries the English headline ("...-chennai-lake-four-children-drown")
      const slug = decodeURIComponent(url.split("/").filter(Boolean).pop() ?? "").replace(/\.\w+$/, "").replace(/[-_]+/g, " ").toLowerCase();
      s.slugs.push([words(slug), url]);
    }
  }
  return s;
}

function find(s: Site, title: string, english: string | null): string | null {
  const k = normTitle(title);
  if (s.entries.has(k)) return s.entries.get(k)!;
  let best: [number, string | null] = [0, null];
  const a = words(k);
  for (const [t, u] of s.entries) { const v = similar(a, words(t)); if (v > best[0]) best = [v, u]; }
  if (best[0] >= 0.85) return best[1];
  if (english) {
    const e = words(normTitle(english));
    for (const [w, u] of s.slugs) { const v = similar(e, w); if (v > best[0]) best = [v, u]; }
    if (best[0] >= 0.8) return best[1];
  }
  return null;
}

// ----------------------------------------------------------------- extract --

async function extract(html: string, url: string): Promise<string | null> {
  const [{ parseHTML }, { Readability }] = await Promise.all([import("linkedom"), import("@mozilla/readability")]);
  try {
    const { document } = parseHTML(html);
    try { Object.defineProperty(document, "baseURI", { value: url }); } catch { /* read-only on some builds */ }
    const art = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
    const text = String(art?.textContent ?? "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
    return text.length >= 200 ? text.slice(0, 20_000) : null;
  } catch {
    return null;
  }
}

/** The full text of one report: from the cache, or fetched now (several requests for one report share one fetch). */
export async function fullText(doc: { id: string; url: string | null; title: string; title_en?: string | null; publisher?: string | null;
  publisher_domain?: string | null; publisher_tier?: string | null }): Promise<FullText> {
  const known = cache()[doc.id];
  if (known && (known.status === "full" || known.status === "robots_disallowed" || known.status === "no_text" || known.status === "not_media" ||
    Date.now() - known.at < 6 * HOUR)) return known;
  if (g.busy.has(doc.id)) return g.busy.get(doc.id)!;
  const run = (async (): Promise<FullText> => {
    if (!isNewsMedia(doc.publisher, doc.publisher_domain, doc.publisher_tier)) return { status: "not_media", url: null, text: null, at: Date.now() };
    const direct = doc.url && !/news\.google\.com/i.test(doc.url) ? doc.url : null;
    const domain = String(doc.publisher_domain || (direct ? new URL(direct).hostname : "")).replace(/^www\./, "");
    if (!domain || !domain.includes(".")) return { status: "unreachable", url: null, text: null, at: Date.now() };
    const s = await site(domain);
    if (!s.rules) return { status: "unreachable", url: null, text: null, at: Date.now() };
    const url = direct ?? find(s, doc.title, doc.title_en ?? null);
    if (!url) return { status: "not_in_sitemap", url: null, text: null, at: Date.now() };
    if (!allowed(s.rules, url)) return { status: "robots_disallowed", url, text: null, at: Date.now() };
    const html = await get(url);
    if (!html) return { status: "unreachable", url, text: null, at: Date.now() };
    const text = await extract(html, url);
    return { status: text ? "full" : "no_text", url, text, at: Date.now() };
  })().then((v) => { remember(doc.id, v); return v; }).finally(() => g.busy.delete(doc.id));
  g.busy.set(doc.id, run);
  return run;
}
