/**
 * Reading a publisher's page politely, shared by the console's article view (fulltext.ts) and Jarvis's web reader (lib/thunai/web):
 * one crawler identity, one robots.txt parser, one Readability extraction. No network and no database here: the callers fetch.
 */

/** robots.txt token (chennai_news_pipeline/config.yaml) */
export const AGENT = "ChennaiDistrictNewsDataset";
export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 (compatible; ChennaiDistrictNewsDataset/1.0)";

// ------------------------------------------------------------- robots.txt --

export interface Rule { allow: boolean; path: string }
/** The rules for our crawler (its own group, else "*"), longest match wins, as Google and Python's parser read them. */
export function robotsRules(txt: string): { rules: Rule[]; sitemaps: string[] } {
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
export function allowed(rules: Rule[], url: string): boolean {
  let p: string;
  try { const u = new URL(url); p = u.pathname + u.search; } catch { return false; }
  let best: Rule | null = null;
  for (const r of rules) {
    const re = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(p) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

// -------------------------------------------------------------- headlines --

/** Headline key: lower case, letters and digits only (Tamil kept), publisher suffix removed (as the pipeline). */
export function normTitle(t: string): string {
  return String(t ?? "").normalize("NFC").toLowerCase().replace(/\s+[-|–]\s+[^-|–]{2,40}$/, "").replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").trim();
}

// ----------------------------------------------------------------- extract --

/** What Readability found on a page: the main text (whitespace tidied), its title and the page's own metadata. */
export interface Readable { title: string; text: string; publishedTime: string | null; siteName: string | null; byline: string | null; /** the article's cleaned HTML (Readability's content) */ html: string }

/** The article in a page, by Mozilla Readability (Firefox's Reader View) on a light DOM (linkedom); null when none. */
export async function readable(html: string, url: string): Promise<Readable | null> {
  const [{ parseHTML }, { Readability }] = await Promise.all([import("linkedom"), import("@mozilla/readability")]);
  try {
    const { document } = parseHTML(html);
    try { Object.defineProperty(document, "baseURI", { value: url }); } catch { /* read-only on some builds */ }
    const art = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
    if (!art) return null;
    const text = String(art.textContent ?? "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
    return { title: String(art.title ?? "").trim(), text, publishedTime: art.publishedTime ? String(art.publishedTime) : null,
      siteName: art.siteName ? String(art.siteName) : null, byline: art.byline ? String(art.byline) : null, html: String(art.content ?? "") };
  } catch {
    return null;
  }
}
