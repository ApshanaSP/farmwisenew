/**
 * What could be the data on a link: every table on the page (all its pages, when it is paginated), every data file it
 * links (each sheet of a workbook, each file of a ZIP), the news feed it points to, the JSON the page's scripts load,
 * and (last) its list of headlines. Each becomes a Table and a scored Candidate. Files that differ only by a date in
 * their names are one series (series.ts). The strict gate (gate.ts) then decides which are real data.
 *
 * The score says how much a candidate looks like data a Collector would add, not like a page's furniture:
 *   kind      a file the site publishes or the JSON behind a dashboard first, then a table, a feed, headlines last
 *   size      rows and columns (a 3-row table can still win when it is the only real one)
 *   content   the share of cells that are numbers or dates, named headers
 *   place     Chennai, its zones, wards and taluks, Tamil Nadu districts in the cells or headers
 *   furniture a menu or layout table (one short word per cell, link lists, "Column 3" headers) loses points
 */
import crypto from "crypto";
import { fetchOnce, LinkError } from "@/lib/studio/fetchurl";
import { robotsAllow } from "@/lib/studio/connect/robots";
import { feedLinkIn, headlinesIn, htmlTables, parseAll, shape, type Cell, type Table } from "@/lib/studio/parse";
import { findSeries, seriesTitle } from "@/lib/studio/connect/series";
import type { Candidate } from "@/lib/studio/types";
import type { Captured } from "@/lib/studio/connect/browser";

export interface Found { cand: Candidate; table: Table }

/** What was looked at, for the Collector ("followed 14 links: 0 tables, 0 data files, 0 feeds"). */
export interface Checked { pages: number; tables: number; files: number; feeds: number; json: number; failed: { label: string; why: string }[]; bytes?: number }
export const newChecked = (): Checked => ({ pages: 0, tables: 0, files: 0, feeds: 0, json: 0, failed: [], bytes: 0 });
/** All the bytes one link may bring in (its page, linked files, explored pages): a memory cap per read. */
export const READ_BUDGET = 60 * 1024 * 1024;
/** Whether more may be read for this link: within the budget, and within the site's robots.txt (a crawl, not a download). */
export async function mayRead(url: string, checked: Checked, label: string): Promise<boolean> {
  if ((checked.bytes ?? 0) > READ_BUDGET) { checked.failed.push({ label, why: "not read: this link has already brought in 60 MB" }); return false; }
  if (!(await robotsAllow(url))) { checked.failed.push({ label, why: "robots.txt asks automated readers to stay out" }); return false; }
  return true;
}

const PLACE = /\b(chennai|madras|zone|ward|taluk|district|tamil\s*nadu|corporation|gcc|adyar|velachery|tondiarpet|royapuram|ambattur|anna\s*nagar|teynampet|kodambakkam|valasaravakkam|alandur|perungudi|sholinganallur|thiruvottiyur|manali|madhavaram|egmore|mylapore|guindy|tambaram|poonamallee|chembarambakkam|puzhal|poondi|சென்னை)\b/i;
const DATEISH = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|^\d{4}$|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
const GENERIC_HDR = /^column\s*\d+$/i;

const BASE: Record<Candidate["kind"], number> = { file: 30, api: 28, table: 22, feed: 18, headlines: 4 };

/** How much a table looks like real data, and the reasons, in words. */
export function scoreTable(t: Table, kind: Candidate["kind"]): { score: number; why: string } {
  const rows = t.rows.length, cols = t.headers.length;
  let cells = 0, nums = 0, dates = 0, short = 0, place = 0;
  for (const r of t.rows.slice(0, 300)) for (const c of r) {
    if (c == null || c === "") continue;
    cells++;
    const s = String(c).trim();
    if (typeof c === "number" || /^[-+₹(]?\s*[\d,]+(\.\d+)?\s*%?\)?$/.test(s)) nums++;
    else if (DATEISH.test(s)) dates++;
    if (s.length <= 3 && typeof c !== "number" && !/^\d/.test(s)) short++;
    if (PLACE.test(s)) place++;
  }
  const hdrPlace = t.headers.some((h) => PLACE.test(h));
  const generic = t.headers.filter((h) => GENERIC_HDR.test(h)).length / Math.max(1, cols);
  const numShare = cells ? nums / cells : 0, dateShare = cells ? dates / cells : 0;
  let s = BASE[kind];
  s += Math.min(20, Math.log2(Math.max(1, rows)) * 3);
  s += cols > 40 ? -6 : Math.min(10, (cols - 1) * 2);
  s += Math.round(numShare * 16) + (dateShare > 0.05 || t.headers.some((h) => /date|year|month|week|day|time|period/i.test(h)) ? 6 : 0);
  s += place >= 2 || hdrPlace ? 8 : 0;
  if (cells && short / cells > 0.5) s -= 12;
  if (cols <= 2 && numShare < 0.1 && kind === "table") s -= 10;
  s -= Math.round(generic * 10);
  if (rows < 3) s -= 15;
  const why = [`${rows.toLocaleString("en-IN")} rows × ${cols} columns`, numShare >= 0.15 ? `${Math.round(numShare * 100)}% numbers` : "mostly text",
    dateShare > 0.05 ? "dates" : "", place >= 2 || hdrPlace ? "Chennai places" : ""].filter(Boolean).join(" · ");
  return { score: Math.max(0, Math.min(100, Math.round(s))), why };
}

const sig = (t: Table) => crypto.createHash("sha256").update(JSON.stringify([t.headers, t.rows.slice(0, 2000)])).digest("hex").slice(0, 24);
/** A candidate's identity across refreshes: its kind and headers (the same table, even with new rows). */
export const shapeKey = (c: Pick<Candidate, "kind" | "headers">) => `${c.kind}:${c.headers.map((h) => h.toLowerCase().replace(/\s+/g, " ").trim()).join("|")}`;
/** The shape's fingerprint (column names only), kept on each candidate to remember a choice. */
export const schemaHash = (headers: string[]) => crypto.createHash("sha256").update(headers.map((h) => h.toLowerCase().replace(/\s+/g, " ").trim()).join("|")).digest("hex").slice(0, 16);
export const tableHash = sig;

const TYPE: Record<Table["format"], NonNullable<Candidate["type"]>> = { excel: "xlsx", csv: "csv", json: "json", feed: "feed", html: "html", pdf: "pdf", docx: "docx", geo: "map", xml: "xml" };

export function add(out: Found[], kind: Candidate["kind"], label: string, table: Table, extra: Partial<Candidate> = {}) {
  if (!table.rows.length || !table.headers.length) return;
  const { score, why } = scoreTable(table, kind);
  // the same table reached two ways (on the page and as its CSV): keep the better kind
  const k = sig(table);
  if (out.some((f) => sig(f.table) === k)) return;
  out.push({ cand: { id: `${kind}-${out.length + 1}`, kind, label, rows: table.rows.length, cols: table.headers.length, headers: table.headers.slice(0, 30), score, why,
    type: TYPE[table.format], schema: schemaHash(table.headers), ...extra }, table });
}

function safeAll(buf: Buffer, name: string, ct: string, base: string): Table[] {
  try { return parseAll(buf, name, ct, base); } catch { return []; }
}

/** JSON a page loads that is never its data: map tiles and styles, social embeds, analytics, ads, consent, fonts. */
const NOT_DATA = /\/maps\/vt|\/vt\/|tiles?[./]|mapbox|arcgis.*\/(tile|basemap)|openstreetmap|google(apis|tagmanager|-analytics|syndication)|doubleclick|facebook|twitter|x\.com|tweet|syndication|youtube|instagram|linkedin|analytics|gtag|hotjar|clarity\.ms|recaptcha|consent|cookie|fonts?\.|translate/i;

/** Arrays of records inside a JSON answer (the data a dashboard loads), as tables. */
function jsonTables(c: Captured): Table[] {
  if (NOT_DATA.test(c.url)) return [];
  let doc: unknown;
  try { doc = JSON.parse(c.text); } catch { return []; }
  const found: unknown[][] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 4 || found.length >= 4) return;
    if (Array.isArray(v)) {
      if (v.length >= 3 && v.filter((x) => x && typeof x === "object" && !Array.isArray(x)).length >= v.length * 0.8) { found.push(v); return; }
      if (v.length >= 3 && v.every((x) => Array.isArray(x))) { found.push(v); return; }
      return;
    }
    if (v && typeof v === "object") for (const x of Object.values(v as Record<string, unknown>)) walk(x, depth + 1);
  };
  walk(doc, 0);
  return found.flatMap((arr) => safeAll(Buffer.from(JSON.stringify(arr)), "data.json", "application/json", c.url)).filter((t) => t.rows.length >= 3);
}

export interface Resource { buf: Buffer; name: string; contentType: string; url: string; html: string | null; json: Captured[]; title: string | null }

/** Is it a web page (and not a file, a feed or JSON)? */
export function isHtml(buf: Buffer, ct: string): boolean {
  const head = buf.subarray(0, 4000).toString("utf8").trimStart();
  return /html/i.test(ct) || /^<(!doctype|html)/i.test(head);
}

/** A page that draws itself with JavaScript: a large page with almost no readable text. */
export function jsShell(html: string): boolean {
  const text = html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length < 1500 && (/<script\b/i.test(html) || /id=["'](root|app|__next)["']/i.test(html));
}

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

/** Every link on a page, with its words, absolute and without its #fragment. */
export function linksIn(html: string, base: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const a of anchors(html.length < 3_000_000 ? html.replace(/<!--[\s\S]*?-->/g, "") : html)) {
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

/** A linked file read: every table it holds, as candidates (a workbook's sheets, a ZIP's files each their own). */
async function readLinkedFile(out: Found[], url: string, words: string, page: string, cred: Parameters<typeof fetchOnce>[1], checked: Checked, log: (t: string) => void, extra: Partial<Candidate> = {}) {
  try {
    if (!(await mayRead(url, checked, safeDecode(new URL(url).pathname.split("/").pop() || url)))) return null;
    const f = await fetchOnce(url, cred && new URL(url).host === cred.host ? cred : null, undefined, 20_000);
    checked.bytes = (checked.bytes ?? 0) + f.buf.length;
    if (isHtml(f.buf, f.contentType)) { checked.failed.push({ label: f.name, why: "a web page, not a file" }); return null; }
    const tables = safeAll(f.buf, f.name, f.contentType, f.url);
    if (!tables.length) { checked.failed.push({ label: f.name, why: "could not be read as a table (damaged, or not a table)" }); return null; }
    checked.files++;
    for (const t of tables) add(out, "file", t.part ? `${f.name} · ${t.part}` : f.name, { ...t, caption: t.caption ?? (words || null) },
      { url: f.url, source: page, bytes: f.buf.length, updated: null, ...extra });
    log(`Found a data file: ${f.name}${tables.length > 1 ? ` (${tables.length} tables inside)` : ""}`);
    return tables;
  } catch (e) {
    const name = safeDecode(new URL(url).pathname.split("/").pop() || url);
    checked.failed.push({ label: name, why: (e as Error).message.slice(0, 140) });
    log(`A linked file could not be read: ${name} (${(e as Error).message.slice(0, 80)})`);
    if (e instanceof LinkError && e.code === "private") throw e;
    return null;
  }
}

/** Everything on the resource that could be the data, best first. Linked files and feeds are fetched (checked). */
export async function discover(r: Resource, log: (t: string) => void, cred?: Parameters<typeof fetchOnce>[1], checked: Checked = newChecked(), opts: { paginate?: boolean; sniff?: boolean } = {}): Promise<Found[]> {
  const out: Found[] = [];
  if (!r.html) {
    const tables = safeAll(r.buf, r.name, r.contentType, r.url);
    checked.files += tables.length ? 1 : 0;
    for (const t of tables) {
      const feed = t.format === "feed";
      if (feed) checked.feeds++;
      add(out, feed ? "feed" : "file", feed ? "The news feed at the link" : t.part ? `${r.name} · ${t.part}` : `The file at the link (${(TYPE[t.format] ?? t.format).toUpperCase()})`, t,
        { url: r.url, source: null, bytes: r.buf.length });
    }
    return out;
  }
  checked.pages++;
  const title = r.title ?? null;
  // the data the page loaded for itself (browser), or the JSON its scripts name (no browser needed)
  for (const c of r.json) for (const t of jsonTables(c)) { checked.json++; add(out, "api", `Data the page loads (${new URL(c.url).pathname.split("/").filter(Boolean).slice(-2).join("/") || "JSON"})`, { ...t, caption: title }, { url: c.url, source: r.url, type: "api" }); }
  if (opts.sniff !== false && !r.json.length) {
    for (const u of scriptJsonUrls(r.html, r.url)) {
      try {
        if (!(await mayRead(u, checked, new URL(u).pathname))) continue;
        const f = await fetchOnce(u, cred && new URL(u).host === cred.host ? cred : null, "application/json", 15_000);
        checked.bytes = (checked.bytes ?? 0) + f.buf.length;
        for (const t of jsonTables({ url: f.url, text: f.buf.toString("utf8"), status: 200 })) {
          checked.json++;
          add(out, "api", `Data the page loads (${new URL(f.url).pathname.split("/").filter(Boolean).slice(-2).join("/")})`, { ...t, caption: title }, { url: f.url, source: r.url, type: "api" });
          log(`The page's script loads its data from ${new URL(f.url).pathname}: read it.`);
        }
      } catch { /* not data after all */ }
    }
  }
  // the page's own tables (a paginated one: every page of it)
  const tables = htmlTables(r.html).slice(0, 12);
  checked.tables += tables.length;
  for (const [i, g] of tables.entries()) {
    let t: Table;
    try { t = { ...shape(g as Cell[][]), sheet: null, sheets: [], format: "html", caption: null } as Table; } catch { continue; }
    t.caption = t.caption ?? title;
    if (i === 0 && opts.paginate !== false && t.rows.length >= 5) t = await paginate(t, r.html, r.url, cred, log);
    add(out, "table", tables.length > 1 ? `Table ${i + 1} of ${tables.length} on the page` : "The table on the page", t, { url: r.url, source: r.url, type: "html" });
  }
  // files the page links: a series of dated files is one candidate; the others are read one by one
  const files = fileLinksIn(r.html, r.url);
  const { series, rest } = findSeries(files.map((f) => ({ url: f.url, name: f.text })));
  for (const s of series) {
    const newest = s.files[s.files.length - 1];
    log(`Found a series: ${s.files.length} files named "${s.pattern}", ${s.from} to ${s.to}.`);
    const before = out.length;
    const read = await readLinkedFile(out, newest.url, seriesTitle(s), r.url, cred, checked, log, { series: { pattern: s.pattern, files: s.files, from: s.from, to: s.to }, updated: newest.date });
    // the oldest is read too, to check the pattern holds (the same columns)
    if (read && s.files.length > 1) {
      try {
        const f = await fetchOnce(s.files[0].url, null, undefined, 20_000);
        const t0 = safeAll(f.buf, f.name, f.contentType, f.url)[0];
        if (t0 && schemaHash(t0.headers) !== schemaHash(read[0].headers)) {
          log(`The oldest file of "${s.pattern}" has other columns: the series is offered as its newest file only.`);
          for (const f of out.slice(before)) f.cand.series = null;
        }
      } catch { /* the newest alone */ }
    }
    for (const f of out.slice(before)) if (f.cand.series) f.cand.label = `${seriesTitle(s)} · ${s.files.length} files`;
  }
  const restFiles = rest.filter((l) => files.some((f) => f.url === l.url));
  for (const l of restFiles.slice(0, 20)) await readLinkedFile(out, l.url, files.find((f) => f.url === l.url)?.text ?? "", r.url, cred, checked, log, {});
  if (restFiles.length > 20) checked.failed.push({ label: `${restFiles.length - 20} more files`, why: "not opened: only the first 20 files of a page are read; pick from these or link a file directly" });
  // the news feed the page points to
  const feed = feedLinkIn(r.html, r.url);
  if (feed && feed !== r.url) {
    try {
      const f = await fetchOnce(feed, null, undefined, 12_000);
      const t = safeAll(f.buf, f.name, f.contentType, f.url)[0];
      if (t?.format === "feed") { checked.feeds++; add(out, "feed", "The news feed the page points to", t, { url: f.url, source: r.url, type: "feed" }); }
    } catch { /* no feed after all */ }
  }
  // headlines: a news or notices page, as articles (never in place of a real table)
  const h = headlinesIn(r.html, r.url);
  if (h.length >= 5) {
    const t = { headers: ["Headline", "Source", "Published", "Summary", "Link"], rows: h, sheet: null, sheets: [], caption: title ? `Headlines on ${title}` : "Headlines on the page", format: "feed", truncated: 0 } as Table;
    add(out, "headlines", `${h.length} headlines on the page (articles, not a data table)`, t, { url: r.url, source: r.url, type: "html" });
  }
  return out.sort((a, b) => b.cand.score - a.cand.score);
}

/** A paginated table: the next pages' rows appended while their columns match (at most 20 pages). */
async function paginate(t: Table, html: string, url: string, cred: Parameters<typeof fetchOnce>[1], log: (t: string) => void): Promise<Table> {
  let next = nextPageLink(html, url);
  const seen = new Set([url]);
  const rows = [...t.rows];
  let pages = 1;
  while (next && !seen.has(next) && pages < 20 && new URL(next).origin === new URL(url).origin) {
    seen.add(next);
    if (!(await robotsAllow(next))) break;
    try {
      const f = await fetchOnce(next, cred && new URL(next).host === cred.host ? cred : null, "text/html", 15_000);
      const page = f.buf.toString("utf8");
      const g = htmlTables(page).map((x) => { try { return shape(x as Cell[][]); } catch { return null; } }).find((x) => x && x.headers.join("|") === t.headers.join("|"));
      if (!g) break;
      rows.push(...g.rows);
      pages++;
      next = nextPageLink(page, f.url);
    } catch { break; }
  }
  if (pages > 1) log(`The table runs over ${pages} pages: read all ${rows.length.toLocaleString("en-IN")} rows.`);
  return pages > 1 ? { ...t, rows, part: `${pages} pages` } : t;
}

/** The data the run should use: the Collector's choice if it still exists, else the same table as before, else the best. */
export function choose(found: Found[], prev?: { choice?: string; candidates?: Candidate[] } | null): Found {
  if (!found.length) throw new LinkError("Nothing to read at that link: no table, data file, feed or list of headlines.", "empty");
  const was = prev?.candidates?.find((c) => c.id === prev.choice);
  if (was) {
    const same = (was.schema ? found.find((f) => f.cand.schema === was.schema && f.cand.kind === was.kind) : null)
      ?? found.find((f) => shapeKey(f.cand) === shapeKey(was)) ?? found.find((f) => f.cand.id === was.id && f.cand.kind === was.kind);
    if (same) return same;
  }
  return found[0];
}
