/**
 * What could be the data on a link: every table on the page, every data file it links, the news feed it points to,
 * the JSON the page loaded in the browser, and (last) its list of headlines. Each becomes a Table and a scored
 * Candidate; the best is used and the others stay a click away ("This page had 3 tables").
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
import { dataLinksIn, feedLinkIn, headlinesIn, htmlTables, parseFile, shape, type Cell, type Table } from "@/lib/studio/parse";
import type { Candidate } from "@/lib/studio/types";
import type { Captured } from "@/lib/studio/connect/browser";

export interface Found { cand: Candidate; table: Table }

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
export const tableHash = sig;

function add(out: Found[], kind: Candidate["kind"], label: string, table: Table) {
  if (!table.rows.length || !table.headers.length) return;
  const { score, why } = scoreTable(table, kind);
  // the same table reached two ways (on the page and as its CSV): keep the better kind
  const k = sig(table);
  if (out.some((f) => sig(f.table) === k)) return;
  out.push({ cand: { id: `${kind}-${out.length + 1}`, kind, label, rows: table.rows.length, cols: table.headers.length, headers: table.headers.slice(0, 30), score, why }, table });
}

function safeParse(buf: Buffer, name: string, ct: string, base: string): Table | null {
  try { return parseFile(buf, name, ct, base); } catch { return null; }
}

/** Arrays of records inside a JSON answer (the data a dashboard loads), as tables. */
function jsonTables(c: Captured): Table[] {
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
  return found.map((arr) => safeParse(Buffer.from(JSON.stringify(arr)), "data.json", "application/json", c.url)).filter((t): t is Table => !!t && t.rows.length >= 3);
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

/** Everything on the resource that could be the data, best first. Linked files and feeds are fetched (checked). */
export async function discover(r: Resource, log: (t: string) => void, cred?: Parameters<typeof fetchOnce>[1]): Promise<Found[]> {
  const out: Found[] = [];
  if (!r.html) {
    const t = safeParse(r.buf, r.name, r.contentType, r.url);
    if (t) add(out, t.format === "feed" ? "feed" : "file", t.format === "feed" ? "The news feed at the link" : `The file at the link (${t.format.toUpperCase()})`, t);
    return out;
  }
  const title = r.title ?? null;
  // the data the page loaded for itself (browser only)
  for (const c of r.json) for (const t of jsonTables(c)) add(out, "api", `Data the page loads (${new URL(c.url).pathname.split("/").filter(Boolean).slice(-2).join("/") || "JSON"})`, { ...t, caption: title });
  // the page's own tables
  htmlTables(r.html).slice(0, 12).forEach((g, i, all) => {
    const t = shape(g as Cell[][]);
    add(out, "table", all.length > 1 ? `Table ${i + 1} of ${all.length} on the page` : "The table on the page", { ...t, sheet: null, sheets: [], format: "html", caption: t.caption ?? title } as Table);
  });
  // files the page links (CSV, Excel, JSON) and its news feed
  // files the page links (CSV, Excel, JSON), fetched together with a short wait each (a dead link must not hold the run up)
  const links = dataLinksIn(r.html, r.url);
  const files = await Promise.all(links.map(async (u) => {
    try {
      const f = await fetchOnce(u, cred && new URL(u).host === cred.host ? cred : null, undefined, 12_000);
      if (isHtml(f.buf, f.contentType)) return null;
      const t = safeParse(f.buf, f.name, f.contentType, f.url);
      return t ? { f, t } : null;
    } catch (e) { log(`A linked file could not be read (${(e as Error).message.slice(0, 80)})`); return null; }
  }));
  for (const x of files) if (x) { add(out, "file", `File linked from the page: ${x.f.name}`, { ...x.t, caption: x.t.caption ?? title }); log(`Found a data file on the page: ${x.f.name}`); }
  const feed = feedLinkIn(r.html, r.url);
  if (feed && feed !== r.url) {
    try {
      const f = await fetchOnce(feed, null, undefined, 12_000);
      const t = safeParse(f.buf, f.name, f.contentType, f.url);
      if (t?.format === "feed") add(out, "feed", "The news feed the page points to", t);
    } catch { /* no feed after all */ }
  }
  // headlines: a news or notices page, as articles (never in place of a real table)
  const h = headlinesIn(r.html, r.url);
  if (h.length >= 5) {
    const t = { headers: ["Headline", "Source", "Published", "Summary", "Link"], rows: h, sheet: null, sheets: [], caption: title ? `Headlines on ${title}` : "Headlines on the page", format: "feed", truncated: 0 } as Table;
    add(out, "headlines", `${h.length} headlines on the page (articles, not a data table)`, t);
    // a page that is mostly headlines is a news page: its headlines are the data
    if (h.length >= 12 && !out.some((f) => f.cand.kind !== "headlines" && f.cand.score >= 45)) out[out.length - 1].cand.score += 22;
  }
  return out.sort((a, b) => b.cand.score - a.cand.score).slice(0, 8);
}

/** The data the run should use: the Collector's choice if it still exists, else the same table as before, else the best. */
export function choose(found: Found[], prev?: { choice?: string; candidates?: Candidate[] } | null): Found {
  if (!found.length) throw new LinkError("Nothing to read at that link: no table, data file, feed or list of headlines.", "empty");
  const was = prev?.candidates?.find((c) => c.id === prev.choice);
  if (was) {
    const same = found.find((f) => shapeKey(f.cand) === shapeKey(was)) ?? found.find((f) => f.cand.id === was.id && f.cand.kind === was.kind);
    if (same) return same;
  }
  return found[0];
}
