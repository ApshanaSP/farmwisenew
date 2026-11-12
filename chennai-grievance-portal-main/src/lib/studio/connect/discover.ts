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
import { MAX_ROWS, parseAllAsync, type Table } from "@/lib/studio/parse";
import { ParseLimitError, readPage } from "@/lib/studio/parse-pool";
import type { Page } from "@/lib/studio/parse-worker";
import { FILE_EXT, NOT_DATA, safeDecode } from "@/lib/studio/connect/links";
import { findSeries, seriesTitle } from "@/lib/studio/connect/series";
import type { Candidate } from "@/lib/studio/types";
import type { Captured } from "@/lib/studio/connect/browser";

// the page helpers live in links.ts (pure, so the file reader runs them too); callers still import them from here
export { FILE_EXT, anchors, dropComments, fileLinksIn, linksIn, nextPageLink, safeDecode, scriptJsonUrls } from "@/lib/studio/connect/links";

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

/**
 * Every table in a fetched file, read in the Studio's file reader (off the server's thread, under its limits: parse-pool.ts); none when
 * it is not a table. A file stopped by a limit is said (ParseLimitError), not taken for one with no table. Pictures and scans are not
 * read with OCR here, as before.
 */
async function safeAll(buf: Buffer, name: string, ct: string, base: string): Promise<Table[]> {
  try { return await parseAllAsync(buf, name, ct, base, { ocr: false }); } catch (e) { if (e instanceof ParseLimitError) throw e; return []; }
}

/** Arrays of records inside a JSON answer (the data a dashboard loads), as tables. */
async function jsonTables(c: Captured): Promise<Table[]> {
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
  const out: Table[] = [];
  // a JSON answer the reader stopped (a limit) is left out, as one that holds no table
  for (const arr of found) out.push(...(await safeAll(Buffer.from(JSON.stringify(arr)), "data.json", "application/json", c.url).catch(() => [])));
  return out.filter((t) => t.rows.length >= 3);
}

export interface Resource { buf: Buffer; name: string; contentType: string; url: string; html: string | null; json: Captured[]; title: string | null }

/** Is it a web page (and not a file, a feed or JSON)? */
export function isHtml(buf: Buffer, ct: string): boolean {
  const head = buf.subarray(0, 4000).toString("utf8").trimStart();
  return /html/i.test(ct) || /^<(!doctype|html)/i.test(head);
}

/** A page that draws itself with JavaScript: a large page with almost no readable text. */
export function jsShell(html: string): boolean {
  if (!/<script\b/i.test(html) && !/id=["'](root|app|__next)["']/i.test(html)) return false;
  return visibleText(html).length < 1500;
}

const BLOCKS = ["script", "style", "noscript", "svg", "template"];
const isWord = (c: string | undefined) => c != null && /\w/.test(c);

/**
 * The text a page shows: its script, style, noscript, svg and template blocks dropped, its tags made spaces, its white space collapsed.
 * The same as html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
 * .trim(), which jsShell ran on the server's thread for every page a link opens, but scanned by hand: the first two patterns searched to
 * the end of the page from every "<script" with no "</script>" after it and from every "<" with no ">" after it (a 200 KB page of "<!--"
 * took 20 s; QA pass 7). Each close is searched for once per position reached, so the time is linear.
 */
export function visibleText(html: string): string {
  // 1. the blocks: from "<name" (a whole word, any case) to the first "</name>" after it; a block with no close is left as it is
  const kept: string[] = [];
  const closeAt = new Map<string, number>();
  let from = 0;
  for (let p = html.indexOf("<"); p >= 0; p = html.indexOf("<", p + 1)) {
    // every block's name starts with s, n or t (any case): other "<" are passed over without a copy
    const c1 = html.charCodeAt(p + 1) | 32;
    if (c1 !== 115 && c1 !== 110 && c1 !== 116) continue;
    const name = BLOCKS.find((n) => html.slice(p + 1, p + 1 + n.length).toLowerCase() === n && !isWord(html[p + 1 + n.length]));
    if (!name) continue;
    let c = closeAt.get(name);
    if (c === undefined || (c >= 0 && c < p)) {
      const re = new RegExp(`</${name}>`, "gi");
      re.lastIndex = p + 1 + name.length;
      c = re.exec(html)?.index ?? -1;
      closeAt.set(name, c);
    }
    // no close after this one, so none after a later one either: those stay as text, as the pattern left them
    if (c < 0) continue;
    kept.push(html.slice(from, p));
    from = c + name.length + 3;
    p = from - 1;
  }
  kept.push(html.slice(from));
  const s = kept.join("");
  // 2. a tag: "<", at least one character, the first ">" after it; with no ">" left, no later "<" starts a tag either
  const out: string[] = [];
  let at = 0;
  for (let p = s.indexOf("<"); p >= 0; p = s.indexOf("<", p + 1)) {
    const gt = s.indexOf(">", p + 1);
    if (gt < 0) break;
    if (gt === p + 1) continue; // "<>" is not a tag
    out.push(s.slice(at, p), " ");
    at = gt + 1;
    p = gt;
  }
  out.push(s.slice(at));
  // 3. white space: these patterns are linear
  return out.join("").replace(/\s+/g, " ").trim();
}


/** A linked file read: every table it holds, as candidates (a workbook's sheets, a ZIP's files each their own). */
async function readLinkedFile(out: Found[], url: string, words: string, page: string, cred: Parameters<typeof fetchOnce>[1], checked: Checked, log: (t: string) => void, extra: Partial<Candidate> = {}) {
  try {
    if (!(await mayRead(url, checked, safeDecode(new URL(url).pathname.split("/").pop() || url)))) return null;
    const f = await fetchOnce(url, cred && new URL(url).host === cred.host ? cred : null, undefined, 20_000);
    checked.bytes = (checked.bytes ?? 0) + f.buf.length;
    if (isHtml(f.buf, f.contentType)) { checked.failed.push({ label: f.name, why: "a web page, not a file" }); return null; }
    const tables = await safeAll(f.buf, f.name, f.contentType, f.url);
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
    const tables = await safeAll(r.buf, r.name, r.contentType, r.url);
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
  // the page's tables, links, feed and headlines, read in the file reader: the patterns that find them took 15 s or more on a crafted
  // 200 KB page (a run of "<!--"), on the server's own thread (QA pass 7)
  const page = await readPage(r.html, r.url).catch((e): Page => {
    // a page the reader had to stop (a limit) holds nothing to offer; the Collector is told why, with what else the link brought
    if (!(e instanceof ParseLimitError)) throw e;
    checked.failed.push({ label: r.title || r.name, why: e.message.replace(/^This file/, "This page") });
    log(`The page could not be read: ${e.message.replace(/^This file/, "it").slice(0, 120)}`);
    return { tables: [], feed: null, headlines: [], files: [], scripts: [], next: null };
  });
  // the data the page loaded for itself (browser), or the JSON its scripts name (no browser needed)
  for (const c of r.json) for (const t of await jsonTables(c)) { checked.json++; add(out, "api", `Data the page loads (${new URL(c.url).pathname.split("/").filter(Boolean).slice(-2).join("/") || "JSON"})`, { ...t, caption: title }, { url: c.url, source: r.url, type: "api" }); }
  if (opts.sniff !== false && !r.json.length) {
    for (const u of page.scripts) {
      try {
        if (!(await mayRead(u, checked, new URL(u).pathname))) continue;
        const f = await fetchOnce(u, cred && new URL(u).host === cred.host ? cred : null, "application/json", 15_000);
        checked.bytes = (checked.bytes ?? 0) + f.buf.length;
        for (const t of await jsonTables({ url: f.url, text: f.buf.toString("utf8"), status: 200 })) {
          checked.json++;
          add(out, "api", `Data the page loads (${new URL(f.url).pathname.split("/").filter(Boolean).slice(-2).join("/")})`, { ...t, caption: title }, { url: f.url, source: r.url, type: "api" });
          log(`The page's script loads its data from ${new URL(f.url).pathname}: read it.`);
        }
      } catch { /* not data after all */ }
    }
  }
  // the page's own tables (a paginated one: every page of it)
  const tables = page.tables.slice(0, 12);
  checked.tables += tables.length;
  for (const [i, shaped] of tables.entries()) {
    if (!shaped) continue;
    let t: Table = { ...shaped, caption: shaped.caption ?? title };
    if (i === 0 && opts.paginate !== false && t.rows.length >= 5) t = await paginate(t, page.next, r.url, cred, log);
    add(out, "table", tables.length > 1 ? `Table ${i + 1} of ${tables.length} on the page` : "The table on the page", t, { url: r.url, source: r.url, type: "html" });
  }
  // files the page links: a series of dated files is one candidate; the others are read one by one
  const files = page.files;
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
        const t0 = (await safeAll(f.buf, f.name, f.contentType, f.url))[0];
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
  const feed = page.feed;
  if (feed && feed !== r.url) {
    try {
      const f = await fetchOnce(feed, null, undefined, 12_000);
      const t = (await safeAll(f.buf, f.name, f.contentType, f.url))[0];
      if (t?.format === "feed") { checked.feeds++; add(out, "feed", "The news feed the page points to", t, { url: f.url, source: r.url, type: "feed" }); }
    } catch { /* no feed after all */ }
  }
  // headlines: a news or notices page, as articles (never in place of a real table)
  const h = page.headlines;
  if (h.length >= 5) {
    const t = { headers: ["Headline", "Source", "Published", "Summary", "Link"], rows: h, sheet: null, sheets: [], caption: title ? `Headlines on ${title}` : "Headlines on the page", format: "feed", truncated: 0 } as Table;
    add(out, "headlines", `${h.length} headlines on the page (articles, not a data table)`, t, { url: r.url, source: r.url, type: "html" });
  }
  return out.sort((a, b) => b.cand.score - a.cand.score);
}

/** A paginated table: the next pages' rows appended while their columns match (at most 20 pages). */
async function paginate(t: Table, first: string | null, url: string, cred: Parameters<typeof fetchOnce>[1], log: (t: string) => void): Promise<Table> {
  let next = first;
  const seen = new Set([url]);
  const rows = [...t.rows];
  let pages = 1, cut = 0;
  // at most MAX_ROWS rows in all, as any table: 20 pages of 50 000 rows each built a million on the server (QA pass 7 reviewer)
  while (next && !seen.has(next) && pages < 20 && rows.length < MAX_ROWS && new URL(next).origin === new URL(url).origin) {
    seen.add(next);
    if (!(await robotsAllow(next))) break;
    try {
      const f = await fetchOnce(next, cred && new URL(next).host === cred.host ? cred : null, "text/html", 15_000);
      // read in the file reader, as the first page was
      const p = await readPage(f.buf.toString("utf8"), f.url);
      const g = p.tables.find((x) => x && x.headers.join("|") === t.headers.join("|"));
      if (!g) break;
      const room = MAX_ROWS - rows.length;
      rows.push(...g.rows.slice(0, room));
      cut += Math.max(0, g.rows.length - room);
      pages++;
      next = p.next;
    } catch { break; }
  }
  if (pages > 1) log(`The table runs over ${pages} pages: read all ${rows.length.toLocaleString("en-IN")} rows.`);
  return pages > 1 ? { ...t, rows, part: `${pages} pages`, truncated: t.truncated + cut } : t;
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
