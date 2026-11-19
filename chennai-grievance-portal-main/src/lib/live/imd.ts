/**
 * Live lane, IMD: the district warning for Chennai, read on this server every 10 minutes instead of waiting for the
 * hourly build (GitHub dataload -> AWS, 30-90 minutes behind). Same sources and the same rules as the IMD collector
 * (imd_weather_collector.py collect_gis_warnings / collect_rmc_warnings / collect_nowcast) and the same rows as the
 * pipeline's loader (district_intel/dintel/loaders/environment.py):
 *
 *   day warnings  IMD's GIS warning layer (the WFS feature for CHENNAI, the WMS legend for its colours, the GIS page for
 *                 the warning names and day labels): today and the next four days. When the GIS service fails, RMC
 *                 Chennai's district pages (Day_1..Day_5) are read instead.
 *   nowcast       RMC Chennai's district nowcast (issued about every 3 hours, valid a few hours).
 *
 * Each is an `observations` row (metric imd_warning_level, 0 green .. 3 red, at the day's midnight or the nowcast's
 * issue time) laid over the build in memory, and the imd_warning_level row of observation_signals follows the newest
 * one. So the alerts lane, the briefing, the map and Ask District IQ see a new warning within 10 minutes. The next
 * hourly build carries the same rows; a build loaded later gets them again from the onBuild hook. Nothing is saved:
 * the in-memory build only. The warning's incident card (an `events` row) still comes with the hourly build.
 *
 * Station readings (rainfall at 8:30 AM and 5:30 PM) are published twice a day, so they stay with the hourly build.
 */
import type { DatabaseSync as DB } from "node:sqlite";
import { onBuild, withCurrentBuild } from "@/lib/aws/store";
import { bumpDataEpoch } from "@/lib/collector/epoch";
import { istNow, live, markLive } from "@/lib/live/state";

const GIS_PAGE = "https://mausam.imd.gov.in/responsive/districtWiseWarningGIS.php";
const GIS_WFS = "https://reactjs.imd.gov.in/geoserver/wfs";
const GIS_WMS = "https://reactjs.imd.gov.in/geoserver/imd/wms";
const GIS_LAYER = "imd:Warnings_StateDistrict_Merged";
const RMC_WARN = (n: number) => `https://mausam.imd.gov.in/imd_latest/contents/districtwise-warning_mc.php?id=26&day=Day_${n}`;
const RMC_NOWCAST = "https://mausam.imd.gov.in/imd_latest/contents/districtwisewarnings_mc.php?id=26";
const DISTRICT = "CHENNAI";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) DistrictIQ/1.0 (Chennai Collector dashboard; reads the public IMD warning every 10 minutes)";

/** how often IMD is read; a cached reading older than KEEP_MS is never laid over a newer build */
export const EVERY_MS = 10 * 60_000;
const KEEP_MS = 30 * 60_000;

// IMD's own colour hex values (imd_weather_collector.py HEX_NAMES) and the loader's levels (environment.py WARN_LEVEL)
const HEX_NAMES: Record<string, string> = {
  "#008000": "Green", "#078C03": "Green", "#FFFF00": "Yellow", "#F2E205": "Yellow",
  "#FFA500": "Orange", "#F28705": "Orange", "#FF0000": "Red", "#F20505": "Red"
};
const LEVEL: Record<string, number> = { Green: 0, Yellow: 1, Orange: 2, Red: 3 };
const COLOUR = ["no warning", "Yellow", "Orange", "Red"];
const CENTROID = [13.0827, 80.2707] as const;

export interface Warn {
  kind: "day" | "nowcast";
  /** the row's observed_at, IST "YYYY-MM-DD HH:MM:SS": the day's midnight, or the nowcast's issue time */
  at: string;
  level: number;
  text: string;
  /** when IMD issued it, IST */
  issued: string | null;
}

// ------------------------------------------------------------------ parsing --

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

/** "Nov 18, 2026" or "November 18, 2026" -> "2026-11-18" */
export function labelDate(s: string): string | null {
  const m = /^([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),\s*(\d{4})$/.exec(s.trim());
  const mo = m && MONTHS[m[1].toLowerCase()];
  return m && mo ? `${m[3]}-${pad(mo)}-${pad(Number(m[2]))}` : null;
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** An ISO time (UTC "Z" or with an offset) as IST wall-clock "YYYY-MM-DD HH:MM:SS". */
export function toIst(s: string): string | null {
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** IMD's HTML fragment as text, the collector's way: line breaks and paragraph ends become "; ". */
export function htmlText(fragment: string): string {
  const t = fragment
    .replace(/<\s*\/?\s*br\s*\/?\s*>/gi, "; ")
    .replace(/<\/p\s*>/gi, "</p>; ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (all, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? all)
    .replace(/\s+/g, " ");
  return t.replace(/(\s*;\s*)+/g, "; ").replace(/^[\s;]+|[\s;]+$/g, "");
}

const colourName = (hex: string) => {
  const h = (hex || "").toUpperCase();
  return h === "" || h === "#FFFFFF" ? "" : HEX_NAMES[h] ?? h;
};

/** The GIS service's three answers -> five day warnings (collect_gis_warnings). Throws when a part is missing. */
export function parseGis(page: string, legend: string, wfs: string): Warn[] {
  const cat = /var category\s*=\s*\{([\s\S]*?)\}/.exec(page);
  const categories = Object.fromEntries([...(cat?.[1] ?? "").matchAll(/"(\d+)"\s*:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const labels = new Map<number, string>();
  for (const m of page.matchAll(/for="rb(\d)">\s*([A-Z][a-z]{2} \d{1,2}, \d{4})\s*</g)) {
    const d = labelDate(m[2]);
    if (d) labels.set(Number(m[1]), d);
  }
  let codes: Record<string, string> = Object.fromEntries([...legend.matchAll(/'(\d+)','(#[0-9A-Fa-f]{6})'/g)].map((m) => [m[1], m[2]]));
  if (!Object.keys(codes).length) {
    // the style's JSON legend since 5 Oct 2026: rules titled "... - <code>" with a polygon fill
    const rules = (JSON.parse(legend)?.Legend?.[0]?.rules ?? []) as { title?: string; symbolizers?: { Polygon?: { fill?: string } }[] }[];
    codes = {};
    for (const r of rules) {
      const m = /-\s*(\d+)\s*$/.exec(String(r.title ?? ""));
      const fill = r.symbolizers?.[0]?.Polygon?.fill;
      if (m && fill) codes[m[1]] = fill;
    }
  }
  const feats = ((JSON.parse(wfs)?.features ?? []) as { properties: Record<string, unknown> }[])
    .map((f) => f.properties).filter((p) => String(p?.District ?? "").toUpperCase() === DISTRICT);
  if (!Object.keys(categories).length || !Object.keys(codes).length || !feats.length)
    throw new Error(`IMD GIS: missing parts (categories ${Object.keys(categories).length}, colours ${Object.keys(codes).length}, features ${feats.length})`);
  const p = feats[0];
  const base = String(p.Date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) throw new Error(`IMD GIS: no date (${String(p.Date)})`);
  const issued = p.updated_at ? toIst(String(p.updated_at)) : null;
  const out: Warn[] = [];
  for (let n = 1; n <= 5; n++) {
    const day = labels.get(n) ?? addDays(base, n - 1);
    const names = String(p[`Day_${n}`] ?? "").split(",").map((c) => c.trim()).filter(Boolean).map((c) => categories[c] ?? `code ${c}`);
    const extra = String(p[`Day${n}_text`] ?? "").trim();
    const colour = colourName(codes[String(p[`Day${n}_Color`] ?? "")] ?? "");
    out.push({ kind: "day", at: `${day} 00:00:00`, level: LEVEL[colour] ?? 0, text: [names.join(", "), extra].filter(Boolean).join("; "), issued });
  }
  return out;
}

/** The JSON array that starts at `from` in a page (strings and nesting respected). */
function jsonArrayAt(html: string, from: number): unknown[] {
  let depth = 0, inStr = false, esc = false;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if ((c === "]" || c === "}") && --depth === 0) return JSON.parse(html.slice(from, i + 1)) as unknown[];
  }
  throw new Error("map areas not closed");
}

/** CHENNAI's area on an RMC map page (_rmc_area). */
export function rmcArea(html: string): Record<string, unknown> {
  const i = html.indexOf('"areas": [');
  if (i < 0) throw new Error("map areas not found");
  const areas = jsonArrayAt(html, i + '"areas": '.length) as Record<string, unknown>[];
  const area = areas.find((a) => String(a?.title ?? "").trim().toUpperCase() === DISTRICT);
  if (!area) throw new Error("CHENNAI not in map");
  return area;
}

/** A colour the page's own legend lists, by name; "" when the legend does not list it (_legend_colour). */
function legendColour(html: string, hex: unknown): string {
  const m = /legend\s*:\s*\{/.exec(html);
  const block = m ? html.slice(m.index, m.index + 2000) : "";
  const legend = new Set([...block.matchAll(/"color"\s*:\s*"(#[0-9A-Fa-f]{6})"/g)].map((x) => x[1].toUpperCase()));
  const h = String(hex ?? "").toUpperCase();
  return legend.has(h) ? HEX_NAMES[h] ?? h : "";
}

/** One RMC Chennai district-warning page (Day_n) -> that day's warning (_rmc_warning_row). */
export function parseRmcDay(html: string, n: number): Warn {
  const labels = new Map<number, string>();
  for (const m of html.matchAll(/<input[^>]*value="Day_(\d)"[^>]*>\s*([A-Za-z]+ \d{1,2}, \d{4})/g)) {
    const d = labelDate(m[2]);
    if (d) labels.set(Number(m[1]), d);
  }
  const area = rmcArea(html);
  const balloon = String(area.balloonText ?? "");
  const up = /Updated on\s*:\s*(\d{4}-\d{2}-\d{2})/.exec(balloon);
  const day = labels.get(n);
  if (!day || !up) throw new Error("date label or 'Updated on' missing");
  const text = htmlText(balloon.replace(/<p>\s*Updated on[\s\S]*?<\/p>/, "")).replace(new RegExp(`^${DISTRICT}\\s*:?\\s*;?\\s*`, "i"), "");
  const colour = legendColour(html, area.color);
  return { kind: "day", at: `${day} 00:00:00`, level: LEVEL[colour] ?? 0, text, issued: `${up[1]} 00:00:00` };
}

/** RMC Chennai's district nowcast page -> the nowcast, or null when it carries no issue or validity time (collect_nowcast). */
export function parseNowcast(html: string): Warn | null {
  const area = rmcArea(html);
  const info = htmlText(String(area.info || area.balloonText || "")).replace(new RegExp(`^${DISTRICT}\\s*;?\\s*`, "i"), "");
  const mi = /Time of issue\s*:\s*(\d{4}-\d{2}-\d{2})\s*;?\s*(\d{3,4})\s*Hrs/i.exec(info);
  const mv = /Valid up\s*to\s*:\s*(\d{3,4})\s*Hrs/i.exec(info);
  if (!mi || !mv) return null;
  const ti = mi[2].padStart(4, "0");
  const at = `${mi[1]} ${ti.slice(0, 2)}:${ti.slice(2)}:00`;
  const colour = legendColour(html, area.color);
  return { kind: "nowcast", at, level: LEVEL[colour] ?? 0, text: info.slice(0, mi.index).replace(/^[\s;]+|[\s;]+$/g, ""), issued: at };
}

// ----------------------------------------------------------------- fetching --

async function get(url: string): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25_000);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store", headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9" } });
    if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

async function gisWarnings(): Promise<Warn[]> {
  const q = (base: string, p: Record<string, string>) => `${base}?${new URLSearchParams(p)}`;
  const [page, legend, wfs] = await Promise.all([
    get(GIS_PAGE),
    get(q(GIS_WMS, { service: "WMS", version: "1.1.1", request: "GetLegendGraphic", layer: GIS_LAYER, format: "application/json", env: "day:Day1_Color" })),
    get(q(GIS_WFS, { service: "WFS", version: "1.1.0", request: "GetFeature", typename: "imd:district_warnings_india", outputFormat: "application/json", CQL_FILTER: `District='${DISTRICT}'` }))
  ]);
  return parseGis(page, legend, wfs);
}

async function rmcWarnings(): Promise<Warn[]> {
  const out: Warn[] = [];
  for (let n = 1; n <= 5; n++) {
    try { out.push(parseRmcDay(await get(RMC_WARN(n)), n)); } catch { /* that day is skipped, as the collector does */ }
  }
  if (!out.length) throw new Error("IMD RMC: no day page could be read");
  return out;
}

/** Today's and the next days' warnings plus the nowcast, from IMD now. Throws only when nothing at all could be read. */
export async function fetchImd(): Promise<Warn[]> {
  const errors: string[] = [];
  let days: Warn[] = [];
  try {
    days = await gisWarnings();
  } catch (e) {
    errors.push((e as Error).message);
    try { days = await rmcWarnings(); } catch (e2) { errors.push((e2 as Error).message); }
  }
  let now: Warn | null = null;
  try { now = parseNowcast(await get(RMC_NOWCAST)); } catch (e) { errors.push(`nowcast: ${(e as Error).message}`); }
  // the pipeline keeps one row per observed_at, the last issued (environment.py drop_duplicates keep="last")
  const rows = new Map<string, Warn>();
  for (const w of [...days, ...(now ? [now] : [])]) rows.set(w.at, w);
  if (!rows.size) throw new Error(errors.join("; ") || "IMD answered with no warning for Chennai");
  return [...rows.values()];
}

// ----------------------------------------------------------- laying it over --

type Row = Record<string, any>;
const has = (db: DB, table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info(?)`).get(table) as Row).n > 0;

export interface Applied {
  /** rows added or changed */ changed: number;
  /** the warning whose level is new or changed, the highest first: what the console's toast says */ raised: Warn[];
}

/**
 * Lays the warnings over one build: each replaces the build's imd_warning_level row at the same time (or is added), and
 * observation_signals' imd_warning_level row follows the newest one at or before now. Only changed rows are written.
 */
export function applyImd(db: DB, rows: Warn[], now = istNow()): Applied {
  const out: Applied = { changed: 0, raised: [] };
  if (!rows.length || !has(db, "observations")) return out;
  // the build's own district row says which ward and zone the district centroid falls in; the live rows say the same
  const ref = db.prepare(`SELECT ward_no, zone_no FROM observations WHERE source = 'imd' AND metric = 'imd_warning_level' AND ward_no IS NOT NULL LIMIT 1`).get() as Row | undefined;
  const find = db.prepare(`SELECT value, detail FROM observations WHERE source = 'imd' AND metric = 'imd_warning_level' AND observed_at = ?`);
  const del = db.prepare(`DELETE FROM observations WHERE source = 'imd' AND metric = 'imd_warning_level' AND observed_at = ?`);
  const ins = db.prepare(`INSERT INTO observations (metric, value, unit, place_type, place_id, place_name, lat, lon, ward_no, zone_no, taluk_code,
      observed_at, period, source, quality, is_synthetic, detail)
    VALUES ('imd_warning_level', ?, '0=green..3=red', 'district', 'CHENNAI', 'Chennai district', ?, ?, ?, ?, NULL, ?, 'day', 'imd', 'ok', 0, ?)`);
  db.exec("BEGIN");
  try {
    for (const w of rows) {
      const had = find.all(w.at) as Row[];
      if (had.length === 1 && Number(had[0].value) === w.level && String(had[0].detail ?? "") === w.text) continue;
      const before = had.length ? Math.max(...had.map((h) => Number(h.value) || 0)) : null;
      del.run(w.at);
      ins.run(w.level, CENTROID[0], CENTROID[1], ref?.ward_no ?? null, ref?.zone_no ?? null, w.at, w.text);
      out.changed++;
      // a level that went up, or a new reading that is a warning (a new nowcast saying "no warning" is not news)
      if ((before == null && w.level > 0) || (before != null && before !== w.level)) out.raised.push(w);
    }
    if (out.changed && has(db, "observation_signals")) {
      const cur = db.prepare(`SELECT value, detail, observed_at FROM observations WHERE source = 'imd' AND metric = 'imd_warning_level' AND observed_at <= ?
        ORDER BY observed_at DESC LIMIT 1`).get(now) as Row | undefined;
      if (cur) db.prepare(`UPDATE observation_signals SET value = ?, detail = ?, observed_at = ? WHERE metric = 'imd_warning_level'`)
        .run(cur.value, cur.detail, cur.observed_at);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  out.raised.sort((a, b) => b.level - a.level || a.at.localeCompare(b.at));
  return out;
}

const hhmm = (at: string) => {
  const [h, m] = at.slice(11, 16).split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
};
const dayName = (at: string) => new Date(`${at.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** The toast line for a changed warning: "IMD nowcast for Chennai: Orange (Heavy Rain), issued 4:00 PM". */
export function warnNote(w: Warn): string {
  const what = w.level > 0 ? `${COLOUR[w.level]}${w.text ? ` (${w.text})` : ""}` : "no warning";
  return w.kind === "nowcast"
    ? `IMD nowcast for Chennai: ${what}, issued ${hhmm(w.at)}`
    : `IMD warning for Chennai on ${dayName(w.at)}: ${what}`;
}

// ------------------------------------------------------------------- the lane --

declare global {
  // eslint-disable-next-line no-var
  var __liveImd: { rows: Warn[] | null; fetchedAt: number; lastTry: number; busy: boolean; appliedTo: string | null } | undefined;
}
const g = (global.__liveImd ??= { rows: null, fetchedAt: 0, lastTry: 0, busy: false, appliedTo: null });
const fresh = () => g.rows && Date.now() - g.fetchedAt < KEEP_MS ? g.rows : null;

// a build loaded later (the next hourly build) gets the live rows before it is served; quietly: they are not news there
onBuild("live-imd@1", (db) => {
  const rows = fresh();
  if (rows) applyImd(db, rows);
});

async function layOver(rows: Warn[], announce: boolean): Promise<void> {
  const r = await withCurrentBuild((db, buildId) => ({ ...applyImd(db, rows), buildId }));
  if (!r) return;
  g.appliedTo = r.buildId;
  if (announce) console.log(`[live] IMD warning read: ${rows.length} rows, ${r.changed} new or changed on build ${r.buildId}${r.raised.length ? ` (${warnNote(r.raised[0])})` : ""}`);
  if (!r.changed) return;
  if (announce && r.raised.length) markLive("imd", warnNote(r.raised[0]), r.raised[0].level > 0);
  else bumpDataEpoch(); // new rows the console should read, nothing worth a toast
}

/**
 * Called every minute by the server's job runner (lib/scheduler.ts): reads IMD when 10 minutes have passed, and lays
 * the last reading over a build that arrived since. AWS store only (the MySQL backend has no in-memory build).
 */
export async function liveImdTick(): Promise<void> {
  if (process.env.DATA_BACKEND !== "aws" || process.env.LIVE_LANE === "off" || g.busy) return;
  const s = live();
  if (Date.now() - g.lastTry >= EVERY_MS) {
    g.busy = true;
    g.lastTry = Date.now();
    try {
      const rows = await fetchImd();
      g.rows = rows;
      g.fetchedAt = Date.now();
      const nowRow = [...rows].filter((w) => w.at <= istNow()).sort((a, b) => b.at.localeCompare(a.at))[0];
      Object.assign(s.imd, { checkedAt: istNow(), ok: true, error: null, issued: nowRow?.issued ?? null, level: nowRow?.level ?? null, text: nowRow?.text ?? null });
      await layOver(rows, true);
    } catch (e) {
      Object.assign(s.imd, { checkedAt: istNow(), ok: false, error: (e as Error).message.slice(0, 300) });
      console.warn(`[live] IMD warning not read: ${(e as Error).message}`);
    } finally {
      g.busy = false;
    }
    return;
  }
  const rows = fresh();
  if (!rows) return;
  // a new hourly build was swapped in after its hooks ran: lay the reading over it again (normally already there)
  const cur = await withCurrentBuild((_db, id) => id);
  if (cur && cur !== g.appliedTo) await layOver(rows, false);
}
