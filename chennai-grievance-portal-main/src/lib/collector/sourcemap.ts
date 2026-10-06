/**
 * Records out of a source, and the field mapping that turns them into dashboard items. Pure functions with no AI
 * and no database: the onboarding agent (onboard.ts) uses them for its preview, and every scheduled run of an
 * approved source uses them again with the stored mapping, so a source behaves the same on day 100 as in the preview.
 *
 *   RSS / Atom  each <item> / <entry>, one field per child tag (category tags joined)
 *   JSON API    the largest list of objects (or the stored path to it), flattened to dotted keys: "properties.ward"
 *   Web page    the largest group of look-alike siblings (news cards, table rows ...), found once and stored as a
 *               CSS selector; fields: "link text", "link", "heading", "time", "date in text", ".class" texts, columns
 */
import { parse, type HTMLElement } from "node-html-parser";

export type Rec = Record<string, string>;
export type FetchKind = "rss" | "json" | "html";
export type DateFormat = "auto" | "iso" | "rfc822" | "dmy" | "mdy" | "unix" | "unix_ms";

/** Which source field fills each item field (keys of a Rec). */
export interface Mapping {
  title: string | null;
  body: string[];
  url: string | null;
  published: string | null;
  dateFormat: DateFormat;
  place: string[];
  lat: string | null;
  lon: string | null;
  category: string | null;
  id: string | null;
}

/** What an approved source keeps in sources.mapping. */
export interface StoredMapping { v: 1; detected: string; recordPath: string | null; map: Mapping }

export interface MappedItem {
  title: string; url: string | null; body: string | null; published: string | null;
  place: string | null; lat: number | null; lon: number | null; category: string | null; extId: string | null;
}

export const SAMPLE = 8;
const MAX_RECORDS = 120;
const MAX_KEYS = 40;

// ------------------------------------------------------------------ text --

const unent = (s: string) => s.replace(/&#(\d{1,6});/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
export const clean = (s: string) => unent(s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"))
  .replace(/\s+/g, " ").trim();

const abs = (href: string | undefined | null, base: string) => {
  if (!href || /^(javascript|mailto|tel):/i.test(href)) return null;
  try { return new URL(href, base).toString(); } catch { return null; }
};

/** "13.08 80.27" or "13.08,80.27" also become key[0] and key[1], so a mapping can pick each coordinate. */
function addPair(rec: Rec, key: string, v: string) {
  const m = v.match(/^\s*(-?\d{1,3}\.\d+)\s*[ ,]\s*(-?\d{1,3}\.\d+)\s*$/);
  if (m) { rec[`${key}[0]`] = m[1]; rec[`${key}[1]`] = m[2]; }
}

function put(rec: Rec, key: string, v: string | null | undefined, join = false) {
  if (v == null) return;
  const s = v.length > 1500 ? v.slice(0, 1500) : v;
  if (!s) return;
  if (rec[key] != null) { if (join && !rec[key].split(", ").includes(s)) rec[key] += `, ${s}`; return; }
  if (Object.keys(rec).length >= MAX_KEYS) return;
  rec[key] = s;
  addPair(rec, key, s);
}

// ------------------------------------------------------------------- RSS --

export function rssRecords(xml: string): Rec[] {
  const out: Rec[] = [];
  for (const b of xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const rec: Rec = {};
    for (const m of b[2].matchAll(/<([a-zA-Z][\w:.-]*)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1\s*>)/g)) {
      const name = m[1].toLowerCase(), attrs = m[2] ?? "";
      const href = attrs.match(/\b(?:href|url)=["']([^"']+)["']/i)?.[1] ?? null;
      const val = m[3] != null ? clean(m[3]) : "";
      put(rec, name, val || href, name === "category" || name === "dc:subject");
    }
    if (Object.keys(rec).length) out.push(rec);
    if (out.length >= MAX_RECORDS) break;
  }
  return out;
}

// ------------------------------------------------------------------ JSON --

function flatten(o: unknown, prefix: string, depth: number, rec: Rec) {
  if (o == null) return;
  if (typeof o !== "object") return put(rec, prefix || "value", String(o));
  if (Array.isArray(o)) {
    if (!o.length) return;
    if (o.every((x) => x == null || typeof x !== "object")) {
      put(rec, prefix, o.filter((x) => x != null).join(", "));
      if (o.length <= 3 && o.every((x) => typeof x === "number")) o.forEach((x, k) => put(rec, `${prefix}[${k}]`, String(x)));
      return;
    }
    if (depth < 3) flatten(o[0], `${prefix}[0]`, depth + 1, rec);
    return;
  }
  if (depth > 3) return;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, depth + 1, rec);
}

function getPath(data: unknown, p: string): unknown {
  if (!p) return data;
  let cur: any = data;
  for (const part of p.split(".")) { if (cur == null) return undefined; cur = cur[part]; }
  return cur;
}

/** The largest list of objects within five levels (score = items x fields), and its dotted path ("" = the root). */
function findList(data: unknown): { path: string; list: unknown[] } | null {
  let best: { path: string; list: unknown[]; score: number } | null = null;
  const walk = (v: unknown, p: string, depth: number) => {
    if (Array.isArray(v)) {
      const objs = v.filter((x) => x && typeof x === "object" && !Array.isArray(x));
      if (objs.length && objs.length >= v.length * 0.8) {
        const keys = Math.min(12, Object.keys(objs[0] as object).length);
        const score = objs.length * keys;
        if (!best || score > best.score) best = { path: p, list: v, score };
      }
      return;
    }
    if (v && typeof v === "object" && depth < 5) for (const [k, x] of Object.entries(v)) walk(x, p ? `${p}.${k}` : k, depth + 1);
  };
  walk(data, "", 0);
  return best;
}

export function jsonRecords(text: string, path: string | null): { records: Rec[]; path: string | null } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { records: [], path }; }
  let list: unknown[] | null = null;
  if (path != null) { const v = getPath(data, path); if (Array.isArray(v)) list = v; }
  if (!list) {
    const f = findList(data);
    if (f) { list = f.list; path = f.path; }
    else if (data && typeof data === "object") { list = [data]; path = null; } // a single object: one record
  }
  const records = (list ?? []).slice(0, MAX_RECORDS).map((o) => { const r: Rec = {}; flatten(o, "", 0, r); return r; })
    .filter((r) => Object.keys(r).length);
  return { records, path };
}

// ------------------------------------------------------------------ HTML --

const NOISE = /(^|[\s_-])(nav|navbar|menu|footer|header|breadcrumbs?|pagination|pager|social|share|sharing|cookie|sidebar|widget|ad|ads|advert)([\s_-]|$)/i;
/** Build-generated class names (CSS modules "card__1e8p0", "css-1q2w3e", "sc-AxjAm") change when a site redeploys. */
const BUILT = /^(css|sc|jsx|svelte|emotion|tw)-/i;
const hashed = (c: string) => BUILT.test(c) || (/(__|_|-)[A-Za-z0-9]{5,}$/.test(c) && /\d/.test(c.slice(-6)));
const safeClass = (c: string) => /^[A-Za-z_][\w-]*$/.test(c) && !hashed(c);
/** A class as a field name, its build hash removed, so the name stays the same after a redeploy. */
const classKey = (c: string) =>
  /^[A-Za-z_][\w-]*$/.test(c) && !BUILT.test(c) ? c.replace(/(__|_|-)[A-Za-z0-9]{5,}$/, (m) => (/\d/.test(m) ? "" : m)) || null : null;
const sig = (e: HTMLElement) => `${e.rawTagName?.toLowerCase()}|${e.classNames.split(/\s+/).filter(safeClass).sort().slice(0, 2).join(".")}`;
const sigSel = (e: HTMLElement) => {
  const cls = e.classNames.split(/\s+/).filter(safeClass).sort().slice(0, 2);
  return `${e.rawTagName.toLowerCase()}${cls.map((c) => `.${c}`).join("")}`;
};
const elems = (e: HTMLElement) => e.childNodes.filter((n): n is HTMLElement => n.nodeType === 1) as HTMLElement[];
const txt = (e: HTMLElement | null | undefined) => (e ? clean(e.text) : "");

function inNoise(e: HTMLElement | null): boolean {
  for (let k = 0; e && k < 8; k++, e = e.parentNode as HTMLElement | null) {
    const tag = e.rawTagName?.toLowerCase();
    if (tag === "nav" || tag === "header" || tag === "footer" || tag === "aside") return true;
    if (NOISE.test(`${e.id ?? ""} ${e.classNames ?? ""}`)) return true;
  }
  return false;
}

/** A selector for `p`: up to four steps up, stopping at an id. */
function pathSel(p: HTMLElement): string {
  const parts: string[] = [];
  for (let e: HTMLElement | null = p, k = 0; e && e.rawTagName && k < 4; e = e.parentNode as HTMLElement | null, k++) {
    const tag = e.rawTagName.toLowerCase();
    if (tag === "html" || tag === "body") break;
    if (e.id && /^[A-Za-z][\w-]*$/.test(e.id) && !/\d{3,}/.test(e.id)) { parts.unshift(`#${e.id}`); break; }
    parts.unshift(sigSel(e));
  }
  return parts.join(" > ");
}

/** The largest group of look-alike siblings carrying text (and ideally links): the page's list of records. */
function findGroup(root: HTMLElement): string | null {
  let best: { sel: string; score: number; n: number } | null = null;
  const all = root.querySelectorAll("*").slice(0, 8000);
  for (const p of all) {
    const kids = elems(p);
    if (kids.length < 3) continue;
    const groups = new Map<string, HTMLElement[]>();
    for (const k of kids) { const s = sig(k); groups.set(s, [...(groups.get(s) ?? []), k]); }
    for (const g of groups.values()) {
      if (g.length < 3) continue;
      const tag = g[0].rawTagName.toLowerCase();
      if (["script", "style", "option", "br", "meta", "link", "svg", "path", "col"].includes(tag)) continue;
      const lens = g.map((e) => Math.min(300, txt(e).length));
      const avg = lens.reduce((a, b) => a + b, 0) / g.length;
      if (avg < 15) continue;
      if (inNoise(p)) continue;
      const linked = g.filter((e) => tag === "a" || e.querySelector("a[href]")).length / g.length;
      const score = g.length ** 0.8 * Math.min(avg, 160) * (0.35 + linked) * (tag === "tr" ? 1.25 : 1);
      if (!best || score > best.score) best = { sel: `${pathSel(p)} > ${sigSel(g[0])}`, score, n: g.length };
    }
  }
  if (!best) return null;
  // the path must find the group again; otherwise fall back to the bare element selector
  const n = root.querySelectorAll(best.sel).length;
  if (n >= best.n * 0.8) return best.sel;
  const bare = best.sel.split(" > ").pop()!;
  const nb = root.querySelectorAll(bare).length;
  return nb >= best.n && nb <= best.n * 3 ? bare : best.sel;
}

const DATE_RE = new RegExp([
  String.raw`\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?`,
  String.raw`\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}(?:,?\s+\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?)?`,
  String.raw`\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?,?\s+\d{4}`,
  String.raw`(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}`
].join("|"), "i");

function htmlRecord(e: HTMLElement, base: string, headers: string[] | null): Rec {
  const rec: Rec = {};
  const tag = e.rawTagName.toLowerCase();
  if (tag === "tr") {
    const cells = elems(e).filter((c) => ["td", "th"].includes(c.rawTagName.toLowerCase()));
    cells.forEach((c, k) => {
      const h = headers?.[k] || `column ${k + 1}`;
      put(rec, h, txt(c));
      const a = c.querySelector("a[href]");
      if (a) put(rec, `${h} link`, abs(a.getAttribute("href"), base));
    });
  }
  const a = tag === "a" ? e : e.querySelector("a[href]");
  if (a) { put(rec, "link text", txt(a)); put(rec, "link", abs(a.getAttribute("href"), base)); }
  put(rec, "heading", txt(e.querySelector("h1, h2, h3, h4, h5, h6")));
  const time = e.querySelector("time");
  if (time) put(rec, "time", time.getAttribute("datetime") || txt(time));
  const full = txt(e);
  put(rec, "date in text", full.match(DATE_RE)?.[0] ?? null);
  const img = e.querySelector("img");
  if (img) put(rec, "image", abs(img.getAttribute("src") || img.getAttribute("data-src"), base));
  if (tag !== "tr") {
    let n = 0;
    for (const d of e.querySelectorAll("[class]")) {
      if (n >= 18) break;
      const c = d.classNames.split(/\s+/).map(classKey).find((x): x is string => !!x);
      if (!c) continue;
      const t = txt(d);
      if (!t || t === full || t.length > 600) continue;
      put(rec, `.${c}`, t);
      n++;
    }
  }
  put(rec, "text", full.slice(0, 800));
  return rec;
}

export function htmlRecords(html: string, base: string, selector: string | null): { records: Rec[]; path: string | null } {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });
  let sel = selector ?? findGroup(root);
  if (!sel) return { records: [], path: null };
  let els: HTMLElement[] = [];
  try { els = root.querySelectorAll(sel); } catch { /* found again below */ }
  // the site changed its layout since the source was approved: find the list again (no AI; the field names are layout-free)
  if (!els.length && selector) {
    const again = findGroup(root);
    if (again) { sel = again; els = root.querySelectorAll(again); }
  }
  let headers: string[] | null = null;
  if (els[0]?.rawTagName.toLowerCase() === "tr") {
    const table = els[0].closest("table");
    const hr = table?.querySelector("thead tr") ?? table?.querySelector("tr");
    const th = hr ? elems(hr).filter((c) => c.rawTagName.toLowerCase() === "th") : [];
    if (th.length) headers = th.map((c) => txt(c).slice(0, 40) || null).map((h, k) => h ?? `column ${k + 1}`);
    els = els.filter((r) => r.querySelector("td")); // header rows carry only th
  }
  const records = els.slice(0, MAX_RECORDS).map((e) => htmlRecord(e, base, headers)).filter((r) => Object.keys(r).length > 1);
  return { records, path: sel };
}

/** A sign-in form on the page: where it posts and the names of its user and password fields. */
export function loginForm(html: string, base: string): { loginUrl: string; userField: string; passField: string } | null {
  const root = parse(html, { blockTextElements: { script: false, style: false } });
  const pw = root.querySelector("input[type=password]");
  if (!pw) return null;
  const form = pw.closest("form");
  const inputs = (form ?? root).querySelectorAll("input");
  const user = inputs.find((i) => {
    const t = (i.getAttribute("type") || "text").toLowerCase();
    return ["text", "email", "tel"].includes(t) && i.getAttribute("name");
  });
  return {
    loginUrl: abs(form?.getAttribute("action") || base, base) ?? base,
    userField: user?.getAttribute("name") || "username",
    passField: pw.getAttribute("name") || "password"
  };
}

/** The site's own feed, announced in the page head. */
export function feedLink(html: string, base: string): string | null {
  const m = html.slice(0, 200_000).match(/<link\b[^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i);
  const href = m?.[0].match(/href=["']([^"']+)["']/i)?.[1];
  return href ? abs(href, base) : null;
}

export function extractRecords(kind: FetchKind, text: string, base: string, path: string | null): { records: Rec[]; path: string | null } {
  if (kind === "rss") return { records: rssRecords(text), path: null };
  if (kind === "json") return jsonRecords(text, path);
  return htmlRecords(text, base, path);
}

// --------------------------------------------------------------- mapping --

/** Every field in the records with how many records fill it and a sample value. */
export function fieldsOf(records: Rec[]): { key: string; filled: number; sample: string }[] {
  const seen = new Map<string, { filled: number; sample: string }>();
  for (const r of records) for (const [k, v] of Object.entries(r)) {
    const s = seen.get(k);
    if (s) s.filled++;
    else seen.set(k, { filled: 1, sample: v.slice(0, 160) });
  }
  return [...seen].map(([key, s]) => ({ key, ...s }));
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

/** A date in IST from a source value; `fmt` settles 05/10/2026 (dmy, the Indian order, or mdy). */
export function parseWhen(v: string | null | undefined, fmt: DateFormat = "auto"): Date | null {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;
  if (/^\d{10}(\.\d+)?$/.test(s) && (fmt === "auto" || fmt === "unix")) return new Date(Number(s) * 1000);
  if (/^\d{13}$/.test(s) && (fmt === "auto" || fmt === "unix_ms")) return new Date(Number(s));
  const num = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?\.?m?\.?)?/i);
  if (num && fmt !== "iso") {
    let [a, b] = [Number(num[1]), Number(num[2])];
    if (fmt === "mdy" || (fmt === "auto" && b > 12 && a <= 12)) [a, b] = [b, a];
    const y = Number(num[3]) < 100 ? 2000 + Number(num[3]) : Number(num[3]);
    let h = Number(num[4] ?? 0);
    if (num[7]?.toLowerCase() === "p" && h < 12) h += 12;
    if (num[7]?.toLowerCase() === "a" && h === 12) h = 0;
    const iso = `${y}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}T${String(h).padStart(2, "0")}:${num[5] ?? "00"}:${num[6] ?? "00"}+05:30`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) || b > 12 ? null : d;
  }
  // a date with no time zone is Chennai time
  const plain = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?$/);
  if (plain) { const d = new Date(`${plain[1]}T${plain[2] ?? "00:00"}${plain[2]?.length === 5 ? ":00" : ""}+05:30`); return Number.isNaN(d.getTime()) ? null : d; }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  const w = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if (!w) return null;
  const m = MONTHS[w[2].slice(0, 4).toLowerCase()] ?? MONTHS[w[2].slice(0, 3).toLowerCase()];
  return m == null ? null : new Date(`${w[3]}-${String(m + 1).padStart(2, "0")}-${w[1].padStart(2, "0")}T00:00:00+05:30`);
}

/** Inside Chennai district and its neighbours: a source's own coordinates outside this box are not used for the map. */
export const nearChennai = (lat: number | null | undefined, lon: number | null | undefined) =>
  lat != null && lon != null && lat >= 12.6 && lat <= 13.6 && lon >= 79.7 && lon <= 80.6;

const toNum = (v: string | undefined) => { const n = v == null ? NaN : Number(String(v).trim()); return Number.isFinite(n) ? n : null; };

/** One record through the mapping. Null when the record has no title. */
export function applyMapping(r: Rec, m: Mapping): MappedItem | null {
  const title = (m.title ? r[m.title] : null)?.trim();
  if (!title) return null;
  const body = m.body.map((k) => r[k]).filter((v) => v && v !== title).join(" — ") || null;
  const when = parseWhen(m.published ? r[m.published] : null, m.dateFormat);
  const place = m.place.map((k) => r[k]).filter(Boolean).join(", ") || null;
  let lat = m.lat ? toNum(r[m.lat]) : null, lon = m.lon ? toNum(r[m.lon]) : null;
  if (lat != null && lon != null && Math.abs(lat) > 40 && Math.abs(lon) < 40) [lat, lon] = [lon, lat]; // [lon, lat] order (GeoJSON)
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) { lat = null; lon = null; }
  const url = m.url ? r[m.url] ?? null : null;
  return {
    title: title.slice(0, 480), url: url && /^https?:\/\//i.test(url) ? url : null, body: body?.slice(0, 6000) ?? null,
    published: when ? when.toISOString() : null, place, lat, lon,
    category: m.category ? r[m.category] ?? null : null, extId: m.id ? r[m.id] ?? null : null
  };
}

/** Rule-based mapping from the field names: used when no AI provider answers, and as the hint the AI starts from. */
export function guessMapping(fields: { key: string; filled: number }[]): Mapping {
  const keys = fields.map((f) => f.key);
  const find = (...res: RegExp[]) => { for (const re of res) { const k = keys.find((x) => re.test(x)); if (k) return k; } return null; };
  const title = find(/^(title|headline|heading)$/i, /(^|\.)(title|headline|subject)$/i, /^link text$/i, /(^|\.)name$/i, /^text$/i);
  const body = [find(/^(description|summary|content|content:encoded|body|details|message)$/i, /(^|\.)(description|summary|details|message|remarks)$/i)]
    .filter((k): k is string => !!k && k !== title);
  return {
    title,
    body,
    url: find(/^(link|url|href)$/i, /(^|\.)(link|url|href)$/i),
    published: find(/^(pubdate|published|updated|dc:date|time|date)$/i, /(date|time|published|created|updated|reported)/i, /^date in text$/i),
    dateFormat: "auto",
    place: [find(/(^|\.)(location|place|area|locality|address|ward|zone|district|city|station|village|taluk)(_?name)?$/i)].filter((k): k is string => !!k),
    lat: find(/(^|\.)(lat|latitude)$/i, /coordinates\[1\]$/i, /point\[0\]$/i),
    lon: find(/(^|\.)(lon|lng|long|longitude)$/i, /coordinates\[0\]$/i, /point\[1\]$/i),
    category: find(/^category$/i, /(^|\.)(category|type|kind|event_type|incident_type)$/i),
    id: find(/^(guid|id|uid)$/i, /(^|\.)(id|guid|uuid)$/i)
  };
}

/** A stored mapping, checked; null when there is none (sources added before the agent use the generic readers). */
export function readStored(v: unknown): StoredMapping | null {
  if (v == null || v === "") return null;
  try {
    const o = typeof v === "string" ? JSON.parse(v) : v;
    if (o?.v !== 1 || !o.map || typeof o.map !== "object") return null;
    const m = o.map;
    const s = (x: unknown) => (typeof x === "string" && x ? x : null);
    const list = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string" && !!y).slice(0, 4) : []);
    const fmts: DateFormat[] = ["auto", "iso", "rfc822", "dmy", "mdy", "unix", "unix_ms"];
    return {
      v: 1, detected: String(o.detected ?? ""), recordPath: typeof o.recordPath === "string" ? o.recordPath : null,
      map: { title: s(m.title), body: list(m.body), url: s(m.url), published: s(m.published), dateFormat: fmts.includes(m.dateFormat) ? m.dateFormat : "auto",
        place: list(m.place), lat: s(m.lat), lon: s(m.lon), category: s(m.category), id: s(m.id) }
    };
  } catch {
    return null;
  }
}
