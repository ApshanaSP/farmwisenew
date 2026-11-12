/**
 * The links of a web page, read by hand or with patterns that stay linear on a hostile page: every <a> with its words, the links to data
 * files, the next page of a paginated table, the JSON a page's own scripts load. Pure functions with no imports, so the Studio's file
 * reader (parse-worker.ts, in its own process) runs them on a fetched page as well as the server (QA pass 7). Moved here from discover.ts,
 * which still exports them.
 */

/** JSON a page loads that is never its data: map tiles and styles, social embeds, analytics, ads, consent, fonts. */
export const NOT_DATA = /\/maps\/vt|\/vt\/|tiles?[./]|mapbox|arcgis.*\/(tile|basemap)|openstreetmap|google(apis|tagmanager|-analytics|syndication)|doubleclick|facebook|twitter|x\.com|tweet|syndication|youtube|instagram|linkedin|analytics|gtag|hotjar|clarity\.ms|recaptcha|consent|cookie|fonts?\.|translate/i;

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const unent = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => { if (e[0] !== "#") return ENT[e.toLowerCase()] ?? m; const c = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isInteger(c) && c >= 0 && c <= 0x10ffff ? String.fromCodePoint(c) : m; });
const linkText = (s: string) => unent(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export const FILE_EXT = /\.(csv|tsv|xlsx|xlsm|xls|ods|json|geojson|kml|kmz|xml|zip|pdf|docx)(\?|$)/i;

/** decodeURIComponent that never throws (a stray "%" in a link). */
export const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

/**
 * Each <a ...>text</a> of a page, scanned by hand (linear time even on a hostile page of unclosed tags), at most 3 MB
 * of page and 2 000 links.
 */
export function anchors(html: string): { attrs: string; inner: string }[] {
  const s = html.slice(0, 3_000_000);
  const low = s.toLowerCase();
  const out: { attrs: string; inner: string }[] = [];
  let i = 0;
  while (out.length < 2000) {
    const a = low.indexOf("<a", i);
    if (a < 0) break;
    const c = low[a + 2];
    if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r" && c !== ">") { i = a + 2; continue; }
    const gt = s.indexOf(">", a);
    if (gt < 0) break;
    const end = low.indexOf("</a>", gt);
    const stop = end < 0 || end - gt > 2000 ? Math.min(s.length, gt + 1 + 300) : end;
    out.push({ attrs: s.slice(a + 2, gt), inner: s.slice(gt + 1, stop) });
    i = end < 0 || end - gt > 2000 ? gt + 1 : end + 4;
  }
  return out;
}

/**
 * The page without its <!-- comments -->, scanned by hand. The pattern it replaces (/<!--[\s\S]*?-->/g) searched to the end of the page
 * from every "<!--" that had no "-->" after it: a 200 KB page of "<!--" held the server's thread 16 s in linksIn (QA pass 7).
 */
export function dropComments(html: string): string {
  const parts: string[] = [];
  let i = 0;
  for (;;) {
    const open = html.indexOf("<!--", i);
    if (open < 0) break;
    const close = html.indexOf("-->", open + 4);
    // no "-->" after this one, so none after any later "<!--" either: the rest stays as it is (as the pattern left it)
    if (close < 0) break;
    parts.push(html.slice(i, open));
    i = close + 3;
  }
  parts.push(html.slice(i));
  return parts.join("");
}

/** Every link on a page, with its words, absolute and without its #fragment. */
export function linksIn(html: string, base: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const a of anchors(html.length < 3_000_000 ? dropComments(html) : html)) {
    const m = [a.attrs, a.attrs, a.inner];
    const href = m[1].match(/href\s*=\s*["']([^"'#]+)["']/i)?.[1] ?? m[1].match(/href\s*=\s*([^\s>"'#]+)/i)?.[1];
    if (!href || /^(mailto|tel|javascript|data):/i.test(href)) continue;
    let url: string;
    try { url = new URL(unent(href), base).toString(); } catch { continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, text: `${linkText(m[2])} ${m[1].match(/(?:title|aria-label)\s*=\s*["']([^"']+)["']/i)?.[1] ?? ""}`.trim() });
  }
  return out;
}

/** Links to data files: by their file name, a format parameter, or the link's own words ("Download CSV"). */
export function fileLinksIn(html: string, base: string): { url: string; text: string }[] {
  return linksIn(html, base).filter((l) => {
    const h = l.url.toLowerCase();
    return FILE_EXT.test(h) || /[?&](?:format|type|output|export)=(csv|xlsx|xls|json|geojson|kml)\b/.test(h)
      || (/(^|\W)(csv|xlsx?|excel|geojson|kml)(\W|$)/i.test(l.text) && !/\.(html?|php|aspx?)(\?|$)/.test(h));
  }).slice(0, 80);
}

/** The next page of a paginated table: rel="next", or a "Next" / "›" / "»" link, or ?page=N+1 on the same path. */
export function nextPageLink(html: string, url: string): string | null {
  const rel = html.match(/<a\b[^>]*rel=["']next["'][^>]*href=["']([^"'#]+)["']|<a\b[^>]*href=["']([^"'#]+)["'][^>]*rel=["']next["']/i);
  if (rel) { try { return new URL(unent(rel[1] ?? rel[2]), url).toString(); } catch { /* below */ } }
  const here = new URL(url);
  const n = Number(here.searchParams.get("page") ?? here.searchParams.get("p") ?? 1);
  for (const l of linksIn(html, url)) {
    if (/^(next|next page|next ›|next »|›|»|>|அடுத்து)$/i.test(l.text)) return l.url;
    try {
      const u = new URL(l.url);
      if (u.pathname === here.pathname && Number(u.searchParams.get("page") ?? u.searchParams.get("p")) === n + 1) return l.url;
    } catch { /* skip */ }
  }
  return null;
}

/** JSON addresses a page's own scripts load (fetch("/api/rows.json"), axios.get(...), a .json URL in a string). */
export function scriptJsonUrls(html: string, base: string): string[] {
  const out = new Set<string>();
  // the scripts' text, scanned by hand (no backtracking on an unclosed <script>)
  const low = html.slice(0, 3_000_000).toLowerCase();
  const parts: string[] = [];
  for (let i = low.indexOf("<script"); i >= 0 && parts.length < 50; i = low.indexOf("<script", i + 7)) {
    const gt = low.indexOf(">", i), end = low.indexOf("</script>", gt);
    if (gt < 0 || end < 0) break;
    parts.push(html.slice(gt + 1, Math.min(end, gt + 1 + 400_000)));
  }
  const scripts = parts.join("\n");
  const add1 = (s: string) => { try { const u = new URL(s, base); if (u.origin === new URL(base).origin) out.add(u.toString()); } catch { /* skip */ } };
  for (const m of scripts.matchAll(/(?:fetch|axios\.get|\$\.getJSON|\.open\(\s*["']GET["']\s*,)\s*\(?\s*["'`]([^"'`\s]+)["'`]/g)) add1(m[1]);
  for (const m of scripts.matchAll(/["'`]((?:https?:\/\/[^"'`\s]+|\/[^"'`\s]*)\.json(?:\?[^"'`\s]*)?)["'`]/g)) add1(m[1]);
  return [...out].filter((u) => !NOT_DATA.test(u)).slice(0, 6);
}
