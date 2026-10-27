/**
 * Exploring a site whose page holds no data itself: its own links, two clicks deep at most and 30 pages at most,
 * the links that say data first ("Downloads", "Reports", "Statistics", "CSV", "அறிக்கை", "புள்ளிவிவரம்"), and its
 * sitemap.xml. Each page is read the same way as the link (discover.ts): every request through the SSRF guard, at
 * the polite rate, within robots.txt. It stops at the first page that has real data.
 */
import { robotsAllow } from "@/lib/studio/connect/robots";
import { FILE_EXT, READ_BUDGET, discover, isHtml, linksIn, safeDecode, type Checked, type Found } from "@/lib/studio/connect/discover";
import { gateA } from "@/lib/studio/connect/gate";
import { fetchOnce, type Credentials } from "@/lib/studio/fetchurl";

export const EXPLORE = { maxPages: 30, maxDepth: 2 } as const;

const DATA_WORDS = /\b(data|dataset|datasets|download|downloads|report|reports|statistics|statistical|stats|csv|xls|xlsx|excel|pdf|dashboard|open data|catalog(ue)?|resources?|tables?|abstract|figures|mis|progress|status)\b|அறிக்கை|புள்ளிவிவரம்|தரவு|பதிவிறக்க/i;
const NEVER = /\b(login|log in|sign in|signin|register|logout|privacy|terms|cookie|contact|feedback|careers?|tenders?|gallery|photos?|videos?|facebook|twitter|instagram|youtube|whatsapp|share|print|rss|feed|sitemap\.html|accessibility|screen reader|skip to)\b/i;

/** How strongly a link's words and address promise data (0: not worth a visit). */
export function dataRank(l: { url: string; text: string }): number {
  if (NEVER.test(l.text) || NEVER.test(new URL(l.url).pathname)) return 0;
  let s = 0;
  if (DATA_WORDS.test(l.text)) s += 3;
  if (DATA_WORDS.test(safeDecode(new URL(l.url).pathname).replace(/[/_-]/g, " "))) s += 2;
  return s;
}

/** Addresses the site lists in its sitemap.xml (the first 500). */
async function sitemap(origin: string): Promise<string[]> {
  try {
    if (!(await robotsAllow(`${origin}/sitemap.xml`))) return [];
    const f = await fetchOnce(`${origin}/sitemap.xml`, null, "application/xml", 8_000);
    return [...f.buf.toString("utf8").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]).slice(0, 500);
  } catch { return []; }
}

/** Follow the site's own links from a page with no data, until a page with real data is found. */
export async function explore(start: { html: string; url: string }, opts: { cred: Credentials | null; log: (t: string) => void; checked: Checked; linkIsFeed: boolean }): Promise<Found[]> {
  const { log, checked } = opts;
  const origin = new URL(start.url).origin;
  const seen = new Set<string>([start.url.replace(/#.*$/, "")]);
  type Q = { url: string; text: string; depth: number; rank: number };
  const queue: Q[] = [];
  const push = (links: { url: string; text: string }[], depth: number) => {
    for (const l of links) {
      let u: URL;
      try { u = new URL(l.url); } catch { continue; }
      if (u.origin !== origin || FILE_EXT.test(u.pathname)) continue;
      const key = u.toString().replace(/#.*$/, "");
      if (seen.has(key)) continue;
      const rank = dataRank(l);
      if (rank <= 0) continue;
      seen.add(key);
      queue.push({ url: key, text: l.text, depth, rank });
    }
    queue.sort((a, b) => a.depth - b.depth || b.rank - a.rank);
  };
  push(linksIn(start.html, start.url), 1);
  const fromMap = (await sitemap(origin)).map((u) => ({ url: u, text: safeDecode(u.split("/").pop() ?? "").replace(/[_-]/g, " ") }));
  push(fromMap, 1);
  if (!queue.length) { log("The page has no links that lead to data on its own site."); return []; }
  log(`No data on the page itself: following ${Math.min(queue.length, EXPLORE.maxPages)} of the site's own links that look like data (two clicks deep at most).`);
  const out: Found[] = [];
  let pages = 0;
  while (queue.length && pages < EXPLORE.maxPages) {
    const q = queue.shift()!;
    if (!(await robotsAllow(q.url))) { checked.failed.push({ label: q.url, why: "robots.txt asks automated readers to stay out" }); continue; }
    if ((checked.bytes ?? 0) > READ_BUDGET) { checked.failed.push({ label: q.url, why: "not read: this link has already brought in 60 MB" }); break; }
    pages++;
    let f;
    try { f = await fetchOnce(q.url, opts.cred && new URL(q.url).host === opts.cred.host ? opts.cred : null, "text/html,*/*;q=0.5", 15_000); } catch (e) {
      checked.failed.push({ label: q.url, why: (e as Error).message.slice(0, 120) });
      continue;
    }
    checked.bytes = (checked.bytes ?? 0) + f.buf.length;
    if (!isHtml(f.buf, f.contentType)) {
      // a link without a file name that sends a file all the same
      const got = await discover({ ...f, html: null, json: [], title: null }, log, opts.cred, checked);
      got.forEach((g) => { g.cand.source = start.url; });
      out.push(...got);
    } else {
      const html = f.buf.toString("utf8");
      const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
      log(`Looked at "${(title ?? new URL(f.url).pathname).slice(0, 70)}" (${q.depth === 1 ? "one click" : "two clicks"} from the link).`);
      const got = await discover({ ...f, html, json: [], title }, log, opts.cred, checked);
      out.push(...got);
      if (q.depth < EXPLORE.maxDepth) push(linksIn(html, f.url), q.depth + 1);
    }
    if (out.some((x) => gateA(x, opts.linkIsFeed).ok)) break;
  }
  log(`Followed ${pages} ${pages === 1 ? "link" : "links"} on the site.`);
  return out;
}
