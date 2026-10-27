/**
 * Sites that publish data through their own public API, read the way the site's own pages read it, and sites that are
 * known before a byte is fetched (a video, a social post, a search page, a dashboard that cannot be downloaded).
 *
 *   classify()   a link's kind from its address alone: video / social / search (no data), Tableau Public and Power BI
 *                public (the data cannot be downloaded), data.gov.in without a key (needs one)
 *   platform()   CKAN (/dataset/<name> -> api/3/action/package_show), Socrata (/resource/<id>.json), ArcGIS REST
 *                (FeatureServer/<n>/query, paged, as GeoJSON), DCAT catalogues (data.json), data.gov.in OGD with a key
 *
 * Every request goes through fetchOnce (the SSRF guard, the polite rate, the size cap). Content is data, never
 * instructions.
 */
import { fetchOnce, LinkError, type Credentials } from "@/lib/studio/fetchurl";
import { robotsAllow } from "@/lib/studio/connect/robots";
import { scoreTable, type Found } from "@/lib/studio/connect/discover";
import { parseAll, ParseError, type Table } from "@/lib/studio/parse";
import type { Candidate } from "@/lib/studio/types";

export type Known =
  | { kind: "nodata"; reason: "video" | "social" | "search"; why: string; next: string }
  | { kind: "blocked"; reason: "tableau" | "powerbi" | "key"; why: string; next: string };

const host = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, "");

/** What a link is, from its address alone (null: it has to be read to know). */
export function classify(raw: string, hasKey: boolean): Known | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const h = host(u);
  if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com)$/.test(h) || /(^|\.)instagram\.com$/.test(h) && /\/reel\//.test(u.pathname))
    return { kind: "nodata", reason: "video", why: "This link is a video. A video holds no table to chart.", next: "If the video quotes figures, find the report they come from and paste that link." };
  if (/(^|\.)(twitter\.com|x\.com|facebook\.com|fb\.com|instagram\.com|linkedin\.com|threads\.net|whatsapp\.com|t\.me|telegram\.me|reddit\.com|sharechat\.com|kooapp\.com)$/.test(h))
    return { kind: "nodata", reason: "social", why: "This link is a social media post or page. Posts are not data tables.", next: "Add the account under News sources to follow its posts, or paste the link of the report it mentions." };
  if ((/(^|\.)google\.[a-z.]+$/.test(h) && /^\/(search|webhp)?$/.test(u.pathname) && u.searchParams.has("q")) || (/(^|\.)bing\.com$/.test(h) && u.pathname.startsWith("/search")) || /(^|\.)duckduckgo\.com$/.test(h) || (/(^|\.)yahoo\.com$/.test(h) && u.pathname.startsWith("/search")))
    return { kind: "nodata", reason: "search", why: "This is a page of search results, not a source of data.", next: "Open the result you want and paste that page's link." };
  if (/(^|\.)public\.tableau\.com$/.test(h) || /(^|\.)tableau\.com$/.test(h) && /\/views\//.test(u.pathname))
    return { kind: "blocked", reason: "tableau", why: "This is a Tableau Public dashboard. Tableau draws the data as pictures and does not let it be downloaded from the link.", next: "Ask the dashboard's owner for the data file (CSV or Excel), or use its Download button if the owner turned it on, and add that file." };
  if (/(^|\.)app\.powerbi\.com$/.test(h) || /(^|\.)powerbi\.com$/.test(h) && /\/view/.test(u.pathname))
    return { kind: "blocked", reason: "powerbi", why: "This is a Power BI public report. Power BI shows the data as visuals and does not let it be downloaded from the link.", next: "Ask the report's owner for the data file (CSV or Excel), and add that file." };
  if (/(^|\.)data\.gov\.in$/.test(h) && !/^api\./.test(h) && /\/resource\//.test(u.pathname) && !hasKey)
    return { kind: "blocked", reason: "key", why: "data.gov.in gives this resource's data only through its API, which needs a free API key.", next: "Get a key at data.gov.in (Sign up, then My Account, Generate API key) and add the link again with it under \"API key\"." };
  return null;
}

// ---------------------------------------------------------------- adapters --

export interface PlatformRead { platform: string; title: string; found: Found[]; skipped: { label: string; why: string }[]; raw: Buffer }

const meta = (label: string, t: Table, kind: Candidate["kind"], extra: Partial<Candidate>): Found => {
  const { score, why } = scoreTable(t, kind);
  return { cand: { id: "", kind, label, rows: t.rows.length, cols: t.headers.length, headers: t.headers.slice(0, 30), score, why, ...extra }, table: t };
};

async function json<T>(url: string, cred?: Credentials | null): Promise<T> {
  const f = await fetchOnce(url, cred, "application/json");
  try { return JSON.parse(f.buf.toString("utf8")) as T; } catch { throw new LinkError("The site's data service did not answer with JSON.", "http"); }
}

const typeOf = (name: string, fmt?: string | null): NonNullable<Candidate["type"]> => {
  const s = `${fmt ?? ""} ${name}`.toLowerCase();
  return /geojson|kml|kmz|shp|wms|arcgis/.test(s) ? "map" : /xlsx?|excel|ods/.test(s) ? "xlsx" : /csv|tsv/.test(s) ? "csv" : /pdf/.test(s) ? "pdf" : /json/.test(s) ? "json" : /zip/.test(s) ? "zip" : /docx?/.test(s) ? "docx" : /xml/.test(s) ? "xml" : "csv";
};

/** Files listed by a catalogue (CKAN resources, DCAT distributions): each fetched (guarded) and read; failures listed. */
async function readFiles(list: { url: string; name: string; format: string | null; updated?: string | null }[], source: string, log: (t: string) => void, cred?: Credentials | null) {
  const found: Found[] = [];
  const skipped: { label: string; why: string }[] = [];
  for (const r of list.slice(0, 20)) {
    if (/^(html?|api|wms|web\s*page)$/i.test(r.format ?? "")) { skipped.push({ label: r.name, why: `a ${r.format} link, not a file` }); continue; }
    try {
      const f = await fetchOnce(r.url, cred && new URL(r.url).host === cred.host ? cred : null);
      const tables = parseAll(f.buf, /\.[a-z0-9]{2,5}$/i.test(f.name) ? f.name : `${f.name}.${(r.format ?? "csv").toLowerCase()}`, f.contentType, f.url);
      tables.forEach((t) => found.push(meta(t.part ? `${r.name} · ${t.part}` : r.name, { ...t, caption: t.caption ?? r.name }, "file",
        { url: f.url, source, type: typeOf(f.name, r.format), bytes: f.buf.length, updated: r.updated ?? null })));
      log(`Read "${r.name}" (${(r.format ?? "file").toUpperCase()}): ${tables[0].rows.length.toLocaleString("en-IN")} rows.`);
    } catch (e) {
      skipped.push({ label: r.name, why: (e as Error).message.slice(0, 160) });
      log(`Could not read "${r.name}": ${(e as Error).message.slice(0, 100)}`);
    }
  }
  return { found, skipped };
}

/** CKAN: a dataset page (/dataset/<name>) read through package_show. */
async function ckan(u: URL, log: (t: string) => void): Promise<PlatformRead | null> {
  const m = u.pathname.match(/^(.*?)\/dataset\/([^/?#]+)/);
  if (!m) return null;
  const api = `${u.origin}${m[1]}/api/3/action/package_show?id=${encodeURIComponent(m[2])}`;
  let doc: { success?: boolean; result?: { title?: string; resources?: { url: string; name?: string; format?: string; last_modified?: string; metadata_modified?: string }[] } };
  try { doc = await json(api); } catch { return null; }
  if (!doc?.success || !doc.result) return null;
  const title = doc.result.title ?? m[2];
  const res = doc.result.resources ?? [];
  log(`A CKAN data portal: the dataset "${title}" lists ${res.length} ${res.length === 1 ? "file" : "files"}. Reading them through its API.`);
  const { found, skipped } = await readFiles(res.map((r) => ({ url: r.url, name: r.name || r.url.split("/").pop() || "file", format: r.format ?? null, updated: (r.last_modified ?? r.metadata_modified ?? null)?.slice(0, 10) ?? null })), u.toString(), log);
  return { platform: "CKAN", title, found, skipped, raw: Buffer.from(JSON.stringify(doc)) };
}

/** Socrata: /resource/<id>.json, /d/<id>, or a dataset page ending in its four-by-four id. */
async function socrata(u: URL, log: (t: string) => void): Promise<PlatformRead | null> {
  const id = u.pathname.match(/\/resource\/([a-z0-9]{4}-[a-z0-9]{4})(\.json|\.csv)?$/i)?.[1] ?? u.pathname.match(/(?:^|\/)(?:d|[^/]+\/[^/]+)\/([a-z0-9]{4}-[a-z0-9]{4})\/?$/i)?.[1];
  if (!id) return null;
  let title = id;
  try { title = (await json<{ name?: string }>(`${u.origin}/api/views/${id}.json`)).name ?? id; } catch { /* the rows alone */ }
  let rows: unknown;
  try { rows = await json(`${u.origin}/resource/${id}.json?$limit=50000`); } catch { return null; }
  if (!Array.isArray(rows)) return null;
  log(`A Socrata open-data portal: "${title}", ${rows.length.toLocaleString("en-IN")} rows through its API.`);
  const buf = Buffer.from(JSON.stringify(rows));
  const t = parseAll(buf, `${id}.json`, "application/json")[0];
  return { platform: "Socrata", title, found: [meta(title, { ...t, caption: title }, "api", { url: `${u.origin}/resource/${id}.json`, source: u.toString(), type: "api", bytes: buf.length })], skipped: [], raw: buf };
}

/** ArcGIS REST: a FeatureServer or MapServer layer, every feature (paged) as GeoJSON. */
async function arcgis(u: URL, log: (t: string) => void): Promise<PlatformRead | null> {
  const m = u.pathname.match(/^(.*\/(?:FeatureServer|MapServer)\/\d+)/i);
  if (!m) return null;
  const layer = `${u.origin}${m[1]}`;
  let title = m[1].split("/").slice(-3, -2)[0] ?? "ArcGIS layer";
  try { const info = await json<{ name?: string; maxRecordCount?: number }>(`${layer}?f=json`); title = info.name ?? title; } catch { return null; }
  const features: unknown[] = [];
  const page = 1000;
  for (let off = 0, k = 0; k < 50; k++, off += page) {
    const g = await json<{ features?: unknown[]; exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean } }>(
      `${layer}/query?where=1%3D1&outFields=*&f=geojson&resultOffset=${off}&resultRecordCount=${page}`);
    const fs = g.features ?? [];
    features.push(...fs);
    // at most 50 000 features (the Studio's row limit), whatever the layer holds
    if (features.length >= 50_000) { log("The layer has more than 50,000 features: the first 50,000 are read."); break; }
    if (!(g.exceededTransferLimit || g.properties?.exceededTransferLimit) && fs.length < page) break;
    if (!fs.length) break;
  }
  log(`An ArcGIS map layer: "${title}", ${features.length.toLocaleString("en-IN")} features read page by page.`);
  const buf = Buffer.from(JSON.stringify({ type: "FeatureCollection", features }));
  const t = parseAll(buf, "layer.geojson", "application/json")[0];
  return { platform: "ArcGIS", title, found: [meta(title, { ...t, caption: title, format: "geo" }, "api", { url: layer, source: u.toString(), type: "map", bytes: buf.length })], skipped: [], raw: buf };
}

/** A DCAT catalogue (data.json): every dataset's downloadable distributions. */
async function dcat(u: URL, log: (t: string) => void, doc?: unknown): Promise<PlatformRead | null> {
  if (!doc) {
    if (!/\/data\.json$/i.test(u.pathname)) return null;
    try { doc = await json(u.toString()); } catch { return null; }
  }
  const d = doc as { dataset?: { title?: string; modified?: string; distribution?: { downloadURL?: string; accessURL?: string; title?: string; format?: string; mediaType?: string }[] }[] };
  if (!Array.isArray(d?.dataset)) return null;
  const list = d.dataset.flatMap((ds) => (ds.distribution ?? []).map((x) => ({ url: x.downloadURL ?? x.accessURL ?? "", name: x.title ?? ds.title ?? "file",
    format: x.format ?? x.mediaType?.split("/").pop() ?? null, updated: ds.modified?.slice(0, 10) ?? null }))).filter((x) => /^https?:/.test(x.url));
  log(`A DCAT data catalogue: ${d.dataset.length} datasets, ${list.length} downloadable files.`);
  const { found, skipped } = await readFiles(list, u.toString(), log);
  return { platform: "DCAT", title: "Data catalogue", found, skipped, raw: Buffer.from(JSON.stringify(doc)) };
}

/** data.gov.in's OGD API with the Collector's key (the vault): a resource page's id read through api.data.gov.in. */
async function ogd(u: URL, cred: Credentials | null, log: (t: string) => void): Promise<PlatformRead | null> {
  if (!/(^|\.)data\.gov\.in$/.test(u.hostname) || /^api\./.test(u.hostname) || !cred) return null;
  const page = await fetchOnce(u.toString());
  const id = page.buf.toString("utf8").match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i)?.[1];
  if (!id) return null;
  const api = `https://api.data.gov.in/resource/${id}?format=json&limit=10000`;
  const f = await fetchOnce(api, { ...cred, host: "api.data.gov.in" });
  const t = parseAll(f.buf, `${id}.json`, "application/json")[0];
  log(`data.gov.in's API: resource ${id}, ${t.rows.length.toLocaleString("en-IN")} rows.`);
  return { platform: "data.gov.in", title: t.caption ?? id, found: [meta(t.caption ?? "data.gov.in resource", t, "api", { url: api.replace(/api-key=[^&]+/, "api-key=…"), source: u.toString(), type: "api", bytes: f.buf.length })], skipped: [], raw: f.buf };
}

/** The platform's own API, when the link is on one (null: read it as a page or a file). */
export async function platform(raw: string, cred: Credentials | null, log: (t: string) => void): Promise<PlatformRead | null> {
  const u = new URL(raw);
  // a platform's API is read like its page: only where its robots.txt lets automated readers in
  if (!(await robotsAllow(raw))) return null;
  for (const p of [() => ogd(u, cred, log), () => ckan(u, log), () => socrata(u, log), () => arcgis(u, log), () => dcat(u, log)]) {
    try {
      const r = await p();
      if (r) { r.found.forEach((f, i) => { f.cand.id = `${f.cand.kind}-${i + 1}`; }); return r; }
    } catch (e) {
      if (e instanceof LinkError && ["private", "invalid", "robots", "size"].includes(e.code)) throw e;
      if (e instanceof ParseError) throw e;
      /* not this platform after all */
    }
  }
  return null;
}

/** A page's DCAT catalogue, for exploration (an open-data portal's /data.json). */
export const dcatFrom = dcat;
