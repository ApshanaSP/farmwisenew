/**
 * Jarvis v6, Phase 4: read one news article on the server. Server only.
 *
 * The page comes through fetch.ts (allow-list, robots.txt, SSRF checks on every hop, a pinned connection, 2 MB / 4 s / 6 s caps);
 * the main text is taken out by Mozilla Readability on linkedom (fulltext.ts `readable`, the same code the console's article view
 * uses). Links in the page are never followed. The result is kept in memory for 10 minutes (fetch.ts caches), never on disk.
 */
import { performance } from "perf_hooks";
import { readable, UA } from "@/lib/collector/pageread";
import { outletOfUrl } from "./domains";
import { CAPS, type WebDeps, type WebStatus, caches, capsOf, clockOf, listOf, normUrl, tele, webGet } from "./fetch";

export interface ArticleRead {
  status: WebStatus;
  /** the outlet's name from the allow-list ("The Hindu"), or null for a host that is not a news outlet (a government page) */
  outlet: string | null;
  outletTa: string | null;
  outletId: string | null;
  /** the page read (after redirects) */
  url: string;
  host: string;
  /** ISO time the page says it was published, or null */
  publishedAt: string | null;
  title: string;
  /** the main text, at most MAX_TEXT characters; empty unless status is "ok" */
  text: string;
  words: number;
  ms: number;
  cached: boolean;
}

export const MAX_TEXT = 20_000;
const MIN_TEXT = 200;

/** Lines that are a site's furniture, not the report (Dinamalar's "ADDED :" stamps, breadcrumbs, prompts to subscribe). */
const FURNITURE = /^(?:added|updated|published|last updated)\s*:|^(?:home|முகப்பு)\s*[>›»/]|^(?:also read|read more|read also|subscribe|follow us|click here|download the app|copyright|©)|^(?:இதையும் படிக்க|மேலும் படிக்க)/i;
export function tidyText(text: string): string {
  return text
    // two sentences glued where a site dropped the space ("named.According to the FIR"): a line break, so a quote stays verbatim
    .replace(/([a-z஀-௿]{2}[.!?]["”’]?)(?=[A-Z][a-z])/g, "$1\n")
    .split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l && !FURNITURE.test(l)).join("\n").slice(0, MAX_TEXT);
}

const BLOCK_END = /<\/(?:p|div|h[1-6]|li|ul|ol|blockquote|section|article|header|footer|figure|figcaption|table|tr|td|th|pre|aside|dd|dt)>/gi;
/** The text of Readability's HTML with a line break after every block (its textContent runs paragraphs together). */
export async function blockText(html: string): Promise<string> {
  if (!html) return "";
  const { parseHTML } = await import("linkedom");
  const { document } = parseHTML(`<!doctype html><html><body>${html.replace(/<(?:br|hr)\s*\/?>/gi, "\n").replace(BLOCK_END, "$&\n")}</body></html>`);
  return String(document.body?.textContent ?? "");
}

/** The published time the page itself states (Open Graph / JSON-LD / <time>), as ISO, or null. */
export function pagePublished(html: string, fromReadability: string | null): string | null {
  const cands = [fromReadability,
    /<meta[^>]+(?:property|name|itemprop)=["'](?:article:published_time|og:published_time|datePublished|pubdate|publish-date)["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1],
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["'](?:article:published_time|datePublished)["']/i.exec(html)?.[1],
    /"datePublished"\s*:\s*"([^"]+)"/i.exec(html)?.[1],
    /<time[^>]+datetime=["']([^"']+)["']/i.exec(html)?.[1]];
  for (const c of cands) {
    if (!c) continue;
    const t = Date.parse(c.trim());
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return null;
}

const wordCount = (s: string) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;

/**
 * Reads one article: `{ outlet, url, publishedAt, title, text, words, ms, status }`. Never throws. http(s) only, allowed hosts only,
 * robots.txt honoured, at most 5 redirects, 2 MB, 4 s to the first byte, 6 s in all (o.caps can only be set tighter by a test).
 */
export async function readArticle(url: string, o: WebDeps = {}): Promise<ArticleRead> {
  const t0 = performance.now();
  const list = listOf(o), now = clockOf(o);
  const key = normUrl(url);
  const hit = caches.pages.get(key, now()) as ArticleRead | null;
  if (hit) {
    const ms = Math.round(performance.now() - t0);
    tele(o, "web_read", { why: hit.status, ms, cached: true, count: hit.words, host: hit.host || undefined });
    return { ...hit, ms, cached: true };
  }
  const caps = capsOf(o);
  const got = await webGet(url, o, { kind: "page", userAgent: UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", deadlineAt: t0 + Math.min(caps.totalMs, CAPS.totalMs) });
  const outlet = outletOfUrl(got.finalUrl, list) ?? outletOfUrl(url, list);
  const base: ArticleRead = { status: got.status, outlet: outlet?.name ?? null, outletTa: outlet?.nameTa ?? null, outletId: outlet?.id ?? null, url: got.finalUrl || url,
    host: got.host, publishedAt: null, title: "", text: "", words: 0, ms: 0, cached: false };
  const finish = (r: ArticleRead): ArticleRead => {
    r.ms = Math.round(performance.now() - t0);
    tele(o, "web_read", { why: r.status, ms: r.ms, cached: false, count: r.words, host: r.host || undefined });
    // only a page that was read is kept (10 minutes): a refusal or a failure is tried again next time
    if (r.status === "ok") caches.pages.set(key, { ...r }, r.text.length * 2 + r.title.length * 2 + 256, now());
    return r;
  };
  if (got.status !== "ok") return finish(base);
  const head = got.body.slice(0, 400).trimStart();
  if (!/html|xml/i.test(got.contentType) && !/^<(?:!doctype|html|\?xml)/i.test(head)) return finish({ ...base, status: "not_text" });
  const art = await readable(got.body, got.finalUrl);
  const text = tidyText((art?.html ? await blockText(art.html) : "") || (art?.text ?? ""));
  const title = (art?.title ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const publishedAt = pagePublished(got.body, art?.publishedTime ?? null);
  if (text.length < MIN_TEXT) return finish({ ...base, status: "no_text", title, publishedAt });
  return finish({ ...base, status: "ok", title, publishedAt, text, words: wordCount(text) });
}
