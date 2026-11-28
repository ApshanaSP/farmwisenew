/**
 * Readings in the search box, for any day the record holds (28 Nov 2026, the owner: "air quality, vegetable prices, reservoir gauges: those
 * data are only live for that day. I couldn't search them for the past days").
 *
 *   air quality   CPCB / TNPCB stations, every reading the store holds (observations, metric aqi; the 24-hour average AQI each station
 *                 reports, several times a day): a day's highest per station, India's AQI category (CPCB National AQI bands)
 *   prices        Uzhavar Sandhai retail prices (tnprices.ts marketRows: agrimark.tn.gov.in, and AGMARKNET's rows before 7 Oct)
 *   reservoirs    Chennai Metro Water's daily lake level for the six reservoirs, every day kept (lakehistory.ts)
 *   rain          IMD's four Chennai stations (observations, rainfall_24h_mm) and the CFM-DSS automatic rain gauges (data/aws-cache/cfm-rain.json)
 *   river gauges  CFM-DSS river and canal gauges (observations, gauge_level_m), against each gauge's warning and danger levels
 *
 * A day with no reading says so and shows the nearest earlier one. Every hit says where its figures are from; anything from a generated
 * dataset is said to be generated. Each hit carries the rows behind it as a table, for the console's text window.
 */
import fs from "fs";
import path from "path";
import pool from "@/lib/collector/db";
import { TN_MARKET_KEYS, TN_SITE, marketRows, newestOnOrBefore, type PriceRow } from "@/lib/collector/tnprices";
import { LAKE_PAGE, LAKE_SOURCE, lakeDays } from "@/lib/search/lakehistory";
import { RESERVOIRS, commoditiesIn, type Intent, type ValueKind } from "@/lib/search/intent";
import type { LakeRow } from "@/lib/collector/lakes";
import type { When } from "@/lib/search/when";

type Row = Record<string, any>;
async function q(sql: string, params: unknown[] = []): Promise<Row[]> {
  const [r] = await pool.query(sql, params);
  return r as unknown as Row[];
}

export interface ValueHit {
  kind: ValueKind;
  /** one line: "Arumbakkam: AQI 142, Moderate" */
  title: string;
  /** the line under it: the day, the detail, the source in a word */
  sub: string;
  /** the day the figures are of (null: a span, from..to) */
  day: string | null; from: string | null; to: string | null;
  /** where the figures are from, and whether they are a generated dataset (never presented as official) */
  source: string; url: string | null; generated: boolean;
  /** the rows behind it: a Markdown table for the console's text window */
  table: { title: string; md: string } | null;
  /** the console panel that shows the same readings today */
  open: { env?: "aqi" | "lake" | "rain"; id?: string; markets?: boolean } | null;
}
export interface Values { hits: ValueHit[]; notes: string[] }

// ------------------------------------------------------------------ helpers --

const DAY = 864e5;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** "3 Oct 2026" */
export const dayText = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayShort = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const spanText = (a: string, b: string) => (a === b ? dayText(a) : `${dayShort(a)} to ${dayText(b)}`);
const n0 = (v: number) => Math.round(v).toLocaleString("en-IN");
const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString("en-IN", { maximumFractionDigits: 1 });
const n2 = (v: number) => (Math.round(v * 100) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const cell = (v: unknown) => String(v ?? "–").replace(/\|/g, "/");
const mdTable = (head: string[], rows: unknown[][]) => [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
/** the first and last calendar day of a window (its `to` is exclusive) */
export function daysOf(w: When): { a: string; b: string } {
  const last = new Date(Date.parse(`${w.to.replace(" ", "T")}Z`) - 1000).toISOString().slice(0, 10);
  return { a: w.from.slice(0, 10), b: last < w.from.slice(0, 10) ? w.from.slice(0, 10) : last };
}
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const kmBetween = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const dy = (aLat - bLat) * 111.2, dx = (aLon - bLon) * 111.2 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dx, dy);
};
const tokens = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
/** how many of the search's words name a station: a word of four letters or more that a word of the name starts with (or the other way) */
const nameScore = (name: string, words: string[]) => { const t = tokens(name); return words.filter((w) => w.length >= 4 && t.some((x) => x.startsWith(w) || (w.startsWith(x) && x.length >= 5))).length; };
const named = (name: string, words: string[]) => nameScore(name, words) > 0;
/** the stations the words name best: "Basin Bridge" is the Basin Bridge gauge, not every gauge with "Bridge" in its name */
function bestNamed<T>(list: T[], name: (x: T) => string, words: string[]): T[] {
  const scored = list.map((x) => ({ x, s: nameScore(name(x), words) }));
  const top = Math.max(0, ...scored.map((y) => y.s));
  return top > 0 ? scored.filter((y) => y.s === top).map((y) => y.x) : [];
}

/** A place the search names that is no station: a taluk or a zone, with its centre (ref_taluks, ref_wards), for the nearest station. */
async function placeOf(words: string[]): Promise<{ name: string; lat: number; lon: number } | null> {
  const w = words.filter((x) => x.length >= 4);
  if (!w.length) return null;
  const [taluks, zones] = await Promise.all([
    q(`SELECT name, aliases, lat, lon FROM ref_taluks WHERE lat IS NOT NULL`).catch(() => [] as Row[]),
    q(`SELECT zone_name AS name, AVG(centroid_lat) AS lat, AVG(centroid_lon) AS lon FROM ref_wards GROUP BY zone_name`).catch(() => [] as Row[])
  ]);
  for (const r of [...zones, ...taluks]) {
    const names = [String(r.name ?? ""), ...String(r.aliases ?? "").split(/[|,;]/)].map((x) => x.trim()).filter(Boolean);
    if (names.some((n) => named(n, w)) && Number.isFinite(Number(r.lat))) return { name: String(r.name), lat: Number(r.lat), lon: Number(r.lon) };
  }
  return null;
}

// ------------------------------------------------------------------ air quality --

const AQI_URL = "https://airquality.cpcb.gov.in/ccr/";
/** India's National Air Quality Index categories (CPCB) */
export function aqiBand(v: number): string {
  return v <= 50 ? "Good" : v <= 100 ? "Satisfactory" : v <= 200 ? "Moderate" : v <= 300 ? "Poor" : v <= 400 ? "Very Poor" : "Severe";
}
const stationName = (s: string) => s.replace(/,\s*Chennai\s*-\s*(TNPCB|CPCB)\s*$/i, " ($1)").trim();

async function airQuality(it: Intent, when: When | null): Promise<Values> {
  const notes: string[] = [];
  const all = await q(`SELECT place_id AS id, MAX(place_name) AS name, AVG(lat) AS lat, AVG(lon) AS lon,
      DATE_FORMAT(MIN(observed_at), '%Y-%m-%d') AS first, DATE_FORMAT(MAX(observed_at), '%Y-%m-%d') AS last
    FROM observations WHERE metric = 'aqi' GROUP BY place_id`);
  if (!all.length) return { hits: [], notes: ["The store holds no air-quality readings."] };
  const first = all.map((s) => String(s.first)).sort()[0], last = all.map((s) => String(s.last)).sort().at(-1)!;
  let pick = bestNamed(all, (s) => String(s.name), it.words);
  let near: string | null = null;
  if (!pick.length && it.words.length) {
    const p = await placeOf(it.words);
    if (p) {
      const best = [...all].filter((s) => Number.isFinite(Number(s.lat))).sort((a, b) => kmBetween(p.lat, p.lon, a.lat, a.lon) - kmBetween(p.lat, p.lon, b.lat, b.lon))[0];
      if (best) { pick = [best]; near = `There is no air-quality station in ${p.name}; the nearest is ${stationName(String(best.name))}, ${n1(kmBetween(p.lat, p.lon, best.lat, best.lon))} km away.`; }
    }
  }
  if (near) notes.push(near);
  const stations = pick.length ? pick : all;
  const ids = stations.map((s) => String(s.id));
  const byId = new Map(all.map((s) => [String(s.id), stationName(String(s.name))]));
  // the days read: the window; one day with a week before it (a day with no reading shows the nearest earlier one); no date: the whole record
  const one = when?.day ?? null;
  const from = one ? `${addDays(one, -7)} 00:00:00` : when?.from ?? null, to = when?.to ?? null;
  const rows = await q(`SELECT place_id AS id, DATE_FORMAT(observed_at, '%Y-%m-%d') AS d, MAX(value) AS hi, MIN(value) AS lo, COUNT(*) AS n
    FROM observations WHERE metric = 'aqi' AND place_id IN (?)${from ? " AND observed_at >= ? AND observed_at < ?" : ""} GROUP BY place_id, d ORDER BY d`,
    from ? [ids, from, to] : [ids]);
  const src = { source: "CPCB / TNPCB monitoring stations (CPCB's live AQI map)", url: AQI_URL, generated: false };
  const held = `Readings are held from ${dayText(first)} to ${dayText(last)}.`;
  if (!rows.length) return { hits: [], notes: [...notes, `No air-quality reading ${when ? `for ${when.label}` : "found"}. ${held}`] };
  const head = (r: Row) => `AQI ${n0(r.hi)}, ${aqiBand(Number(r.hi))}`;
  const range = (r: Row) => (Number(r.n) > 1 ? `highest of ${r.n} readings (${n0(r.lo)} to ${n0(r.hi)}), 24-hour averages` : "24-hour average");
  const hits: ValueHit[] = [];

  if (it.order) {
    // the worst (or cleanest) station-days of the window
    const inWin = one ? rows.filter((r) => r.d === one) : rows;
    const sorted = [...inWin].sort((a, b) => (it.order === "asc" ? a.hi - b.hi : b.hi - a.hi));
    const days = when ? daysOf(when) : { a: first, b: last };
    for (const r of sorted.slice(0, 3)) hits.push({ kind: "aqi", title: `${byId.get(String(r.id))}: ${head(r)}`, sub: `${dayText(r.d)} · ${range(r)}`, day: r.d, from: null, to: null, ...src,
      table: null, open: { env: "aqi", id: String(r.id) } });
    const t = { title: `Air quality, ${it.order === "asc" ? "cleanest" : "worst"} days: ${spanText(days.a, days.b)}`,
      md: `${it.order === "asc" ? "Lowest" : "Highest"} daily AQI first. ${held}\n\n` + mdTable(["Day", "Station", "Highest AQI", "Category", "Lowest", "Readings"],
        sorted.slice(0, 40).map((r) => [dayText(r.d), byId.get(String(r.id)), n0(r.hi), aqiBand(Number(r.hi)), n0(r.lo), r.n])) + `\n\nSource: ${src.source}, ${AQI_URL}` };
    hits.forEach((h) => (h.table = t));
    return { hits, notes };
  }

  const single = one ?? (when ? null : last);
  if (single) {
    // one day: each station's highest reading that day, or its nearest earlier day
    const list: { r: Row; shown: string }[] = [];
    for (const id of ids) {
      const mine = rows.filter((r) => String(r.id) === id && r.d <= single);
      const r = mine.find((x) => x.d === single) ?? mine.at(-1);
      if (r) list.push({ r, shown: r.d });
    }
    if (!list.length) return { hits: [], notes: [...notes, `No air-quality reading on ${dayText(single)}. ${held}`] };
    list.sort((a, b) => b.r.hi - a.r.hi);
    const t = { title: `Air quality on ${dayText(single)}`, md: `Each station's highest 24-hour average AQI that day (CPCB National AQI categories). ${held}\n\n` +
      mdTable(["Station", "Highest AQI", "Category", "Lowest", "Readings", "Day"], list.map(({ r }) => [byId.get(String(r.id)), n0(r.hi), aqiBand(Number(r.hi)), n0(r.lo), r.n, dayText(r.d)])) +
      `\n\nSource: ${src.source}, ${AQI_URL}` };
    for (const { r, shown } of list.slice(0, list.length > 4 ? 3 : 4))
      hits.push({ kind: "aqi", title: `${byId.get(String(r.id))}: ${head(r)}`, sub: `${shown === single ? dayText(shown) : `No reading on ${dayText(single)}; ${dayText(shown)}`} · ${range(r)}${near && pick.length === 1 ? " · nearest station" : ""}`,
        day: shown, from: null, to: null, ...src, table: t, open: { env: "aqi", id: String(r.id) } });
    if (list.length > 4) hits.push({ kind: "aqi", title: `All ${list.length} air-quality stations on ${dayText(single)}`, sub: `Worst ${byId.get(String(list[0].r.id))} ${n0(list[0].r.hi)}, best ${byId.get(String(list.at(-1)!.r.id))} ${n0(list.at(-1)!.r.hi)}`,
      day: single, from: null, to: null, ...src, table: t, open: { env: "aqi" } });
    return { hits, notes };
  }

  // a span: each station's worst and best day, and the average of its daily highs
  const { a, b } = daysOf(when!);
  const per = ids.map((id) => ({ id, rs: rows.filter((r) => String(r.id) === id) })).filter((x) => x.rs.length);
  if (!per.length) return { hits: [], notes: [...notes, `No air-quality reading in ${when!.label}. ${held}`] };
  per.sort((x, y) => Math.max(...y.rs.map((r) => r.hi)) - Math.max(...x.rs.map((r) => r.hi)));
  const days = [...new Set(rows.map((r) => String(r.d)))].sort();
  const t = { title: `Air quality, ${spanText(a, b)}`, md: `Each station's highest 24-hour average AQI per day. ${held}\n\n` +
    mdTable(["Day", ...per.map((p) => byId.get(p.id) ?? p.id)], days.map((d) => [dayText(d), ...per.map((p) => { const r = p.rs.find((x) => x.d === d); return r ? n0(r.hi) : "–"; })])) +
    `\n\nSource: ${src.source}, ${AQI_URL}` };
  for (const p of per.slice(0, per.length > 4 ? 3 : 4)) {
    const worst = p.rs.reduce((m, r) => (r.hi > m.hi ? r : m)), best = p.rs.reduce((m, r) => (r.hi < m.hi ? r : m));
    hits.push({ kind: "aqi", title: `${byId.get(p.id)}: AQI ${n0(best.hi)} to ${n0(worst.hi)}, ${when!.label}`,
      sub: `Worst ${n0(worst.hi)} (${aqiBand(Number(worst.hi))}) on ${dayShort(worst.d)} · best ${n0(best.hi)} on ${dayShort(best.d)} · average of daily highs ${n0(avg(p.rs.map((r) => Number(r.hi))))} · ${p.rs.length} days`,
      day: null, from: a, to: b, ...src, table: t, open: { env: "aqi", id: p.id } });
  }
  if (per.length > 4) hits.push({ kind: "aqi", title: `All ${per.length} air-quality stations, ${when!.label}`, sub: "Each station's highest AQI per day, in a table", day: null, from: a, to: b, ...src, table: t, open: { env: "aqi" } });
  return { hits, notes };
}

// ------------------------------------------------------------------ prices --

const STAPLES = ["Tomato", "Onion", "Small Onion", "Potato", "Brinjal", "Green Chilli"];
const PRICE_SOURCE = "Uzhavar Sandhai retail prices, TN Agricultural Marketing & Agri Business (agrimark.tn.gov.in); AGMARKNET before 7 Oct 2026";
const kg = (quintal: number | null) => (quintal == null ? null : quintal / 100);
const rs = (v: number | null) => (v == null ? "–" : `Rs ${n1(v)}`);

async function prices(it: Intent, topic: string, when: When | null, now: string): Promise<Values> {
  const notes: string[] = [];
  const today = now.slice(0, 10);
  const market = TN_MARKET_KEYS.find((k) => it.words.some((w) => k.toLowerCase().startsWith(w) || w.startsWith(k.toLowerCase()))) ?? null;
  if (/koyambedu|கோயம்பேடு/i.test(topic)) notes.push("Koyambedu is the wholesale market: it publishes no daily price feed. These are the Uzhavar Sandhai farmer markets' retail prices.");
  let a: string, b: string;
  if (when) ({ a, b } = daysOf(when));
  else { const d = await newestOnOrBefore(today, market); if (!d) return { hits: [], notes: [...notes, "No market prices are held."] }; a = b = d; }
  let rows = await marketRows(a, b, market);
  let note: string | null = null;
  if (!rows.length && a === b) {
    const d = await newestOnOrBefore(a, market);
    if (d) { note = `No report on ${dayText(a)}; the nearest earlier report is of ${dayText(d)}.`; rows = await marketRows(d, d, market); a = b = d; }
  }
  if (!rows.length) return { hits: [], notes: [...notes, `No market prices for ${when?.label ?? "that day"}${market ? ` at ${market}` : ""}.`] };
  const known = [...new Set(rows.map((r) => r.commodity))];
  let wanted = commoditiesIn(topic, known);
  const generic = !wanted.length;
  if (generic) wanted = STAPLES.filter((s) => known.includes(s));
  const src = { source: PRICE_SOURCE, url: TN_SITE, generated: false };
  const where = market ? ` at ${market}` : "";
  const hits: ValueHit[] = [];
  const one = a === b;
  const mk = (c: string) => rows.filter((r) => r.commodity === c);
  const sub0 = note ? `${note} · ` : "";

  if (one) {
    const dayTable = (c: string | null) => {
      const list = c ? mk(c) : rows;
      if (c) return { title: `${c} prices on ${dayText(a)}${where}`, md: `Rupees a kilo at each Uzhavar Sandhai market.\n\n` +
        mdTable(["Market", "Variety", "Low", "High", "Middle"], list.sort((x, y) => (x.modal - y.modal)).map((r) => [r.market, r.variety || "–", rs(kg(r.min)), rs(kg(r.max)), rs(kg(r.modal))])) + `\n\nSource: ${PRICE_SOURCE}, ${TN_SITE}` };
      const by = new Map<string, PriceRow[]>();
      for (const r of list) (by.get(r.commodity) ?? by.set(r.commodity, []).get(r.commodity)!).push(r);
      return { title: `Market prices on ${dayText(a)}${where}`, md: `Rupees a kilo: the lowest and highest price across the markets, and the average of their middle prices.\n\n` +
        mdTable(["Item", "Low", "High", "Middle (average)", "Markets"], [...by.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([k, rs0]) => [k, rs(kg(Math.min(...rs0.map((r) => r.min ?? r.modal)))),
          rs(kg(Math.max(...rs0.map((r) => r.max ?? r.modal)))), rs(kg(avg(rs0.map((r) => r.modal)))), new Set(rs0.map((r) => r.market)).size])) + `\n\nSource: ${PRICE_SOURCE}, ${TN_SITE}` };
    };
    for (const c of wanted.slice(0, generic ? 3 : 4)) {
      const cr = mk(c);
      if (!cr.length) continue;
      const lo = Math.min(...cr.map((r) => r.min ?? r.modal)), hi = Math.max(...cr.map((r) => r.max ?? r.modal));
      const byMarket = [...cr].sort((x, y) => x.modal - y.modal);
      const cheap = byMarket[0], dear = byMarket.at(-1)!;
      const order = it.order === "desc" ? `dearest ${dear.market} ${rs(kg(dear.modal))}, cheapest ${cheap.market} ${rs(kg(cheap.modal))}` : `cheapest ${cheap.market} ${rs(kg(cheap.modal))}, dearest ${dear.market} ${rs(kg(dear.modal))}`;
      hits.push({ kind: "price", title: `${c}: ${lo === hi ? rs(kg(lo)) : `Rs ${n1(kg(lo)!)} to ${n1(kg(hi)!)}`} a kg on ${dayText(a)}${where}`,
        sub: `${sub0}Middle price ${rs(kg(avg(cr.map((r) => r.modal))))} at ${new Set(cr.map((r) => r.market)).size} market${new Set(cr.map((r) => r.market)).size === 1 ? "" : "s"}${cr.length > 1 && cheap.market !== dear.market ? ` · ${order}` : ""} · Uzhavar Sandhai, retail`,
        day: a, from: null, to: null, ...src, table: dayTable(c), open: { markets: true } });
    }
    if (generic) hits.unshift({ kind: "price", title: `Market prices on ${dayText(a)}${where}`, sub: `${sub0}${known.length} items at the Uzhavar Sandhai markets, rupees a kilo`,
      day: a, from: null, to: null, ...src, table: dayTable(null), open: { markets: true } });
    return { hits, notes };
  }

  // a span: the average of the markets' middle prices by day
  for (const c of wanted.slice(0, generic ? 3 : 4)) {
    const cr = mk(c);
    if (!cr.length) continue;
    const days = [...new Set(cr.map((r) => r.d))].sort();
    const perDay = days.map((d) => { const x = cr.filter((r) => r.d === d); return { d, mid: avg(x.map((r) => r.modal)), lo: Math.min(...x.map((r) => r.min ?? r.modal)), hi: Math.max(...x.map((r) => r.max ?? r.modal)), n: new Set(x.map((r) => r.market)).size }; });
    const f = perDay[0], l = perDay.at(-1)!;
    const dear = perDay.reduce((m, x) => (x.mid > m.mid ? x : m)), cheap = perDay.reduce((m, x) => (x.mid < m.mid ? x : m));
    const change = f.mid ? Math.round(((l.mid - f.mid) / f.mid) * 100) : 0;
    hits.push({ kind: "price", title: `${c}: Rs ${n1(kg(Math.min(...perDay.map((x) => x.lo)))!)} to ${n1(kg(Math.max(...perDay.map((x) => x.hi)))!)} a kg, ${spanText(a, b)}${where}`,
      sub: `Middle price ${rs(kg(f.mid))} on ${dayShort(f.d)}, ${rs(kg(l.mid))} on ${dayShort(l.d)} (${change > 0 ? "+" : ""}${change}%) · dearest ${dayShort(dear.d)}, cheapest ${dayShort(cheap.d)} · ${days.length} days with reports`,
      day: null, from: a, to: b, ...src,
      table: { title: `${c} prices, ${spanText(a, b)}${where}`, md: `Rupees a kilo by day: the lowest and highest price across the markets, and the average of their middle prices.\n\n` +
        mdTable(["Day", "Low", "High", "Middle (average)", "Markets"], perDay.map((x) => [dayText(x.d), rs(kg(x.lo)), rs(kg(x.hi)), rs(kg(x.mid)), x.n])) + `\n\nSource: ${PRICE_SOURCE}, ${TN_SITE}` },
      open: { markets: true } });
  }
  return { hits, notes };
}

// ------------------------------------------------------------------ reservoirs --

async function reservoirs(it: Intent, topic: string, when: When | null, now: string): Promise<Values> {
  const notes: string[] = [];
  const days = lakeDays();
  const dates = Object.keys(days).sort();
  const keys = RESERVOIRS.filter(([, re]) => re.test(topic)).map(([k]) => k);
  const src = { source: LAKE_SOURCE, url: LAKE_PAGE, generated: false };
  const hits: ValueHit[] = [];
  // a lake Chennai Metro Water does not publish (Porur, Velachery ...): only the store's own figures, which may be a generated dataset
  const other = keys.length ? [] : it.words.filter((w) => w.length >= 4 && !/^(lake|lakes|eri|tank|reservoir)/.test(w));
  if (other.length) {
    const like = other.map(() => "place_name LIKE ?").join(" OR ");
    const st = await q(`SELECT place_id AS id, MAX(place_name) AS name, MAX(is_synthetic) AS syn, MAX(source) AS src FROM observations
      WHERE metric = 'lake_pct_full' AND source <> 'cmwssb' AND (${like}) GROUP BY place_id LIMIT 3`, other.map((w) => `%${w}%`)).catch(() => [] as Row[]);
    for (const s of st) {
      const w = when ? daysOf(when) : null;
      const rs0 = await q(`SELECT DATE_FORMAT(observed_at, '%Y-%m-%d') AS d, value AS v FROM observations WHERE metric = 'lake_pct_full' AND place_id = ?${w ? " AND observed_at >= ? AND observed_at < ?" : ""}
        ORDER BY observed_at`, w ? [s.id, when!.from, when!.to] : [s.id]);
      if (!rs0.length) continue;
      const last = rs0.at(-1)!;
      const gen = Number(s.syn) === 1;
      hits.push({ kind: "lake", title: `${s.name}: ${n1(last.v)}% full on ${dayText(last.d)}${gen ? " (generated data)" : ""}`,
        sub: gen ? "From the generated PWD dataset, not an official reading: Chennai Metro Water publishes only its six reservoirs" : `${rs0.length} readings held`,
        day: last.d, from: null, to: null, source: gen ? "Generated PWD lake dataset (test data, not official)" : String(s.src ?? "store"), url: null, generated: gen,
        table: { title: `${s.name}${gen ? " (generated data)" : ""}`, md: `${gen ? "**Generated test data, not an official reading.**\n\n" : ""}` + mdTable(["Day", "% full"], rs0.map((r) => [dayText(r.d), n1(r.v)])) }, open: { env: "lake", id: String(s.id) } });
    }
  }
  // a lake named that no record holds: said, and Chennai Metro Water's six are shown
  if (other.length && !hits.length) notes.push(`No level is held for “${other.join(" ")}”: Chennai Metro Water publishes figures for its six reservoirs only, shown here.`);
  if (!dates.length) return { hits, notes: [...notes, "No Chennai Metro Water reservoir figures are held."] };
  const held = `Chennai Metro Water's figures are held from ${dayText(dates[0])} to ${dayText(dates.at(-1)!)}.`;
  const want = keys.length ? keys : null;
  const rowsOf = (d: string): LakeRow[] => (days[d]?.rows ?? []).filter((r) => !want || want.includes(r.key));
  const head = ["Reservoir", "% full", "Storage (mcft)", "Capacity (mcft)", "Level (ft)", "Full level (ft)", "Inflow (cusec)", "Outflow (cusec)", "Rain (mm)", "Same day last year (mcft)"];
  const line = (r: LakeRow) => [r.name, n1(r.pct), n0(r.storageMcft), n0(r.capacityMcft), r.levelFt == null ? "–" : n2(r.levelFt), r.ftlFt == null ? "–" : n2(r.ftlFt),
    r.inflow == null ? "–" : n0(r.inflow), r.outflow == null ? "–" : n0(r.outflow), r.rainMm == null ? "–" : n1(r.rainMm), r.lastYearMcft == null ? "–" : n0(r.lastYearMcft)];
  const one = when?.day ?? (when ? null : dates.filter((d) => d <= now.slice(0, 10)).at(-1) ?? dates.at(-1)!);
  if (one) {
    const shown = days[one] ? one : dates.filter((d) => d < one).at(-1) ?? null;
    if (!shown) return { hits, notes: [...notes, `No reservoir figures on or before ${dayText(one)}. ${held}`] };
    const note = shown === one ? "" : `No figures for ${dayText(one)}; ${dayText(shown)} · `;
    const list = rowsOf(shown).sort((x, y) => (it.order === "asc" ? x.pct - y.pct : y.pct - x.pct));
    const t = { title: `Chennai's reservoirs on ${dayText(shown)}`, md: `As Chennai Metro Water published them for ${dayText(shown)}. ${held}\n\n` + mdTable(head, rowsOf(shown).map(line)) +
      (days[shown].total && !want ? `\n\nAll six together: ${n0(days[shown].total.storageMcft)} of ${n0(days[shown].total.capacityMcft)} mcft (${n1(days[shown].total.pct)}% full).` : "") + `\n\nSource: ${LAKE_SOURCE}, ${LAKE_PAGE}?date=${shown.slice(8, 10)}-${shown.slice(5, 7)}-${shown.slice(0, 4)}` };
    if (!want && days[shown].total) {
      const tt = days[shown].total;
      hits.push({ kind: "lake", title: `Chennai's ${rowsOf(shown).length} reservoirs: ${n1(tt.pct)}% full on ${dayText(shown)}`,
        sub: `${note}${n0(tt.storageMcft)} of ${n0(tt.capacityMcft)} mcft${tt.lastYearMcft != null ? ` · ${n0(tt.lastYearMcft)} mcft on the same day last year` : ""} · Chennai Metro Water`,
        day: shown, from: null, to: null, ...src, table: t, open: { env: "lake" } });
    }
    for (const r of list.slice(0, want ? 6 : 3))
      hits.push({ kind: "lake", title: `${r.name}: ${n1(r.pct)}% full on ${dayText(shown)}`,
        sub: `${note}${n0(r.storageMcft)} of ${n0(r.capacityMcft)} mcft${r.levelFt != null ? ` · level ${n2(r.levelFt)} ft${r.ftlFt != null ? ` of ${n2(r.ftlFt)}` : ""}` : ""}${r.inflow != null || r.outflow != null ? ` · in ${r.inflow == null ? "–" : n0(r.inflow)}, out ${r.outflow == null ? "–" : n0(r.outflow)} cusec` : ""}${r.lastYearMcft != null ? ` · ${n0(r.lastYearMcft)} mcft a year before` : ""}`,
        day: shown, from: null, to: null, ...src, table: t, open: { env: "lake", id: `CMWSSB-${r.key.replace(/\s+/g, "_")}` } });
    return { hits, notes };
  }
  // a span: each reservoir's first and last day in it
  const { a, b } = daysOf(when!);
  const inSpan = dates.filter((d) => d >= a && d <= b);
  if (!inSpan.length) return { hits, notes: [...notes, `No reservoir figures in ${when!.label}. ${held}`] };
  const names = [...new Set(inSpan.flatMap((d) => rowsOf(d).map((r) => r.key)))];
  const series = names.map((k) => ({ k, rs: inSpan.map((d) => ({ d, r: rowsOf(d).find((x) => x.key === k) })).filter((x) => x.r) as { d: string; r: LakeRow }[] }))
    .sort((x, y) => (it.order === "asc" ? x.rs.at(-1)!.r.pct - y.rs.at(-1)!.r.pct : y.rs.at(-1)!.r.pct - x.rs.at(-1)!.r.pct));
  const t = { title: `Chennai's reservoirs, ${spanText(a, b)}`, md: `Per cent full by day, as Chennai Metro Water published it. ${held}\n\n` +
    mdTable(["Day", ...series.map((s) => s.rs[0].r.name)], inSpan.map((d) => [dayText(d), ...series.map((s) => { const x = s.rs.find((y) => y.d === d); return x ? n1(x.r.pct) : "–"; })])) + `\n\nSource: ${LAKE_SOURCE}, ${LAKE_PAGE}` };
  for (const s of series.slice(0, want ? 6 : 4)) {
    const f = s.rs[0], l = s.rs.at(-1)!;
    const d = Math.round((l.r.pct - f.r.pct) * 10) / 10;
    hits.push({ kind: "lake", title: `${l.r.name}: ${n1(f.r.pct)}% to ${n1(l.r.pct)}% full, ${spanText(f.d, l.d)}`,
      sub: `${d === 0 ? "No change" : `${d > 0 ? "Up" : "Down"} ${n1(Math.abs(d))} points`} · ${n0(f.r.storageMcft)} to ${n0(l.r.storageMcft)} mcft of ${n0(l.r.capacityMcft)} · ${s.rs.length} days held · Chennai Metro Water`,
      day: null, from: f.d, to: l.d, ...src, table: t, open: { env: "lake", id: `CMWSSB-${s.k.replace(/\s+/g, "_")}` } });
  }
  return { hits, notes };
}

// ------------------------------------------------------------------ rain --

const IMD_URL = "https://mausam.imd.gov.in/chennai/";
const CFM_URL = "https://chennaifloodmonitor.tn.gov.in/";
interface RainCacheFile { gauges?: { id: string; name: string; inChennai?: boolean }[]; rain?: Record<string, Record<string, { p?: number; h?: Record<string, number> }>> }
const rainFile = () => process.env.CFM_RAIN_FILE || (process.env.VITEST ? null : path.join(process.cwd(), "data", "aws-cache", "cfm-rain.json"));
let rainMemo: { m: number; c: RainCacheFile | null } | null = null;
function rainCache(): RainCacheFile | null {
  const f = rainFile();
  if (!f) return null;
  let m = 0;
  try { m = fs.statSync(f).mtimeMs; } catch { return null; }
  if (rainMemo?.m === m) return rainMemo.c;
  let c: RainCacheFile | null = null;
  try { c = JSON.parse(fs.readFileSync(f, "utf8")) as RainCacheFile; } catch { c = null; }
  rainMemo = { m, c: c && typeof c.rain === "object" && Array.isArray(c.gauges) ? c : null };
  return rainMemo.c;
}

/** A rain day is IMD's: 8:30 AM that day to 8:30 AM the next (IMD's 24-hour figure read at 8:30 AM the next day; the CFM-DSS gauges the same). */
async function rain(it: Intent, when: When | null, now: string): Promise<Values> {
  const notes: string[] = [];
  const today = now.slice(0, 10);
  const imdAll = await q(`SELECT place_id AS id, MAX(place_name) AS name, DATE_FORMAT(MIN(observed_at), '%Y-%m-%d') AS first, DATE_FORMAT(MAX(observed_at), '%Y-%m-%d') AS last
    FROM observations WHERE metric = 'rainfall_24h_mm' GROUP BY place_id`);
  const cache = rainCache();
  const cfmDays = cache ? Object.keys(cache.rain ?? {}).sort() : [];
  const lastImd = imdAll.length ? addDays(imdAll.map((s) => String(s.last)).sort().at(-1)!, -1) : null;
  const latest = [lastImd, cfmDays.at(-1) ?? null].filter(Boolean).sort().at(-1) ?? null;
  if (!latest) return { hits: [], notes: ["The store holds no rain readings."] };
  let a: string, b: string;
  if (when) ({ a, b } = daysOf(when)); else a = b = latest > today ? today : latest;
  const pickImd = bestNamed(imdAll, (s) => String(s.name), it.words);
  const imd = pickImd.length ? pickImd : imdAll;
  const imdRows = imd.length ? await q(`SELECT place_id AS id, DATE_FORMAT(observed_at, '%Y-%m-%d') AS d, MAX(value) AS v FROM observations
      WHERE metric = 'rainfall_24h_mm' AND place_id IN (?) AND observed_at >= ? AND observed_at < ? GROUP BY place_id, d ORDER BY d`,
    [imd.map((s) => String(s.id)), `${addDays(a, 1)} 00:00:00`, `${addDays(b, 2)} 00:00:00`]) : [];
  const nameOf = new Map(imdAll.map((s) => [String(s.id), String(s.name).replace(/^Chennai-/, "")]));
  // the CFM-DSS gauges in Chennai that reported (3 or 4 of their 4 sample times) on the day
  const gauges = (cache?.gauges ?? []).filter((g) => g.inChennai !== false);
  const pickG = bestNamed(gauges, (g) => g.name, it.words);
  const gl = pickG.length ? pickG : gauges;
  const cfmTotals = gl.map((g) => {
    let mm = 0, days = 0;
    for (const d of cfmDays) { if (d < a || d > b) continue; const x = cache!.rain![d]?.[g.id]; if (!x || Number(x.p ?? 0) < 3) continue; days++; mm += Object.values(x.h ?? {}).reduce((s, v) => s + Number(v || 0), 0); }
    return { g, mm: Math.round(mm * 10) / 10, days };
  }).filter((x) => x.days > 0).sort((x, y) => y.mm - x.mm);
  const span = a === b ? `rain day ${dayText(a)}` : `rain days ${spanText(a, b)}`;
  const hits: ValueHit[] = [];
  const imdBy = imd.map((s) => ({ s, rs: imdRows.filter((r) => String(r.id) === String(s.id)) })).filter((x) => x.rs.length);
  if (imdBy.length) {
    const t = { title: `IMD rain, ${span}`, md: `Rain in the 24 hours to 8:30 AM, IMD's Chennai stations, by the rain day it fell on (8:30 AM to 8:30 AM).\n\n` +
      mdTable(["Rain day", ...imdBy.map((x) => nameOf.get(String(x.s.id)) ?? String(x.s.id))], [...new Set(imdRows.map((r) => String(r.d)))].sort().map((d) => [dayText(addDays(d, -1)), ...imdBy.map((x) => { const r = x.rs.find((y) => y.d === d); return r ? n1(r.v) : "–"; })])) +
      `\n\nSource: India Meteorological Department, ${IMD_URL}` };
    const tot = imdBy.map((x) => ({ x, mm: x.rs.reduce((s, r) => s + Number(r.v), 0) })).sort((p, q2) => q2.mm - p.mm);
    for (const { x, mm } of tot.slice(0, 2))
      hits.push({ kind: "rain", title: `${nameOf.get(String(x.s.id))}: ${n1(mm)} mm, ${span}`, sub: `IMD station · ${a === b ? "24 hours to 8:30 AM next day" : `${x.rs.length} days`}`,
        day: a === b ? a : null, from: a === b ? null : a, to: a === b ? null : b, source: "India Meteorological Department (IMD), Chennai stations", url: IMD_URL, generated: false, table: t, open: { env: "rain", id: String(x.s.id) } });
  }
  if (cfmTotals.length) {
    const top = cfmTotals[0];
    const wet = cfmTotals.filter((x) => x.mm >= 1).length;
    const t = { title: `CFM-DSS rain gauges, ${span}`, md: `Rain at each Chennai automatic rain gauge that reported, ${a === b ? "8:30 AM to 8:30 AM next day" : "over the rain days it reported"}.\n\n` +
      mdTable(["Gauge", "Rain (mm)", "Days reported"], cfmTotals.slice(0, 80).map((x) => [x.g.name, n1(x.mm), x.days])) + `\n\nSource: Chennai Flood Monitor (TN WRD CFM-DSS), ${CFM_URL}` };
    hits.push({ kind: "rain", title: pickG.length ? `${top.g.name}: ${n1(top.mm)} mm, ${span}` : `Rain gauges, ${span}: wettest ${top.g.name}, ${n1(top.mm)} mm`,
      sub: pickG.length && cfmTotals.length === 1 ? `CFM-DSS automatic rain gauge · ${a === b ? "8:30 AM to 8:30 AM next day" : `${top.days} days reported`} · Chennai Flood Monitor`
        : `${cfmTotals.length} CFM-DSS gauge${cfmTotals.length === 1 ? "" : "s"} reported · ${wet} had 1 mm or more · Chennai Flood Monitor`,
      day: a === b ? a : null, from: a === b ? null : a, to: a === b ? null : b, source: "Chennai Flood Monitor (TN WRD CFM-DSS) automatic rain gauges", url: CFM_URL, generated: false, table: t, open: null });
  }
  if (!hits.length) notes.push(`No rain readings for ${when?.label ?? dayText(a)}.`);
  return { hits, notes };
}

// ------------------------------------------------------------------ river gauges --

async function riverGauges(it: Intent, when: When | null): Promise<Values> {
  const all = await q(`SELECT place_id AS id, MAX(place_name) AS name, DATE_FORMAT(MIN(observed_at), '%Y-%m-%d') AS first, DATE_FORMAT(MAX(observed_at), '%Y-%m-%d') AS last
    FROM observations WHERE metric = 'gauge_level_m' GROUP BY place_id`);
  if (!all.length) return { hits: [], notes: ["The store holds no river gauge readings."] };
  const pick = bestNamed(all, (s) => String(s.name), it.words);
  const list = pick.length ? pick : all;
  const last = all.map((s) => String(s.last)).sort().at(-1)!, first = all.map((s) => String(s.first)).sort()[0];
  const one = when?.day ?? (when ? null : last);
  const from = one ? `${addDays(one, -7)} 00:00:00` : when!.from, to = one ? `${addDays(one, 1)} 00:00:00` : when!.to;
  const rows = await q(`SELECT place_id AS id, DATE_FORMAT(observed_at, '%Y-%m-%d') AS d, MAX(value) AS hi, COUNT(*) AS n, MAX(detail) AS detail FROM observations
    WHERE metric = 'gauge_level_m' AND place_id IN (?) AND observed_at >= ? AND observed_at < ? GROUP BY place_id, d ORDER BY d`, [list.map((s) => String(s.id)), from, to]);
  const held = `Gauge readings are held for ${dayText(first)} to ${dayText(last)} (CFM-DSS reports some days only).`;
  if (!rows.length) return { hits: [], notes: [`No river gauge reading ${when ? `in ${when.label}` : ""}. ${held}`] };
  const name = new Map(all.map((s) => [String(s.id), String(s.name)]));
  const marks = (detail: unknown) => { const m = /warning\s+([\d.]+).*?danger\s+([\d.]+)/i.exec(String(detail ?? "")); return m ? { warn: Number(m[1]), danger: Number(m[2]) } : null; };
  const state = (v: number, k: { warn: number; danger: number } | null) => (!k || k.danger < k.warn ? "" : v >= k.danger ? " · above danger level" : v >= k.warn ? " · above warning level" : " · below warning level");
  const pickRows = one ? list.map((s) => rows.filter((r) => String(r.id) === String(s.id) && r.d <= one).at(-1)).filter(Boolean) as Row[] : rows;
  const best = new Map<string, Row>();
  for (const r of pickRows) { const k = String(r.id); if (!best.has(k) || r.hi > best.get(k)!.hi) best.set(k, r); }
  const sorted = [...best.values()].sort((x, y) => y.hi - x.hi);
  const src = { source: "Chennai Flood Monitor (TN WRD CFM-DSS) river and canal gauges", url: CFM_URL, generated: false };
  const t = { title: `River and canal gauges, ${one ? dayText(one) : when!.label}`, md: `Each gauge's highest level ${one ? "that day (or its last earlier reading)" : "in the span"}, in metres, with its warning and danger levels as CFM-DSS gives them. ${held}\n\n` +
    mdTable(["Gauge", "Highest (m)", "Day", "Warning (m)", "Danger (m)"], sorted.map((r) => { const k = marks(r.detail); return [name.get(String(r.id)), n2(r.hi), dayText(r.d), k ? n2(k.warn) : "–", k ? n2(k.danger) : "–"]; })) +
    `\n\nSource: ${src.source}, ${CFM_URL}` };
  const hits: ValueHit[] = sorted.slice(0, pick.length ? 4 : 3).map((r) => ({ kind: "gauge" as const, title: `${name.get(String(r.id))}: ${n2(r.hi)} m on ${dayText(r.d)}`,
    sub: `${when?.day && r.d !== when.day ? `No reading on ${dayText(when.day)} · ` : !when ? "Latest reading · " : ""}highest of ${r.n} reading${Number(r.n) === 1 ? "" : "s"} that day${state(Number(r.hi), marks(r.detail))} · CFM-DSS gauge`,
    day: r.d, from: null, to: null, ...src, table: t, open: null }));
  return { hits, notes: [] };
}

// ------------------------------------------------------------------ all --

/** The readings a search asks for (`kinds`: those the caller may show; the officer's are its department's). Each kind on its own: one that fails says so. */
export async function valueHits(it: Intent, topic: string, when: When | null, now: string, kinds: ValueKind[] = it.kinds): Promise<Values> {
  const run: Record<ValueKind, () => Promise<Values>> = {
    aqi: () => airQuality(it, when),
    price: () => prices(it, topic, when, now),
    lake: () => reservoirs(it, topic, when, now),
    rain: () => rain(it, when, now),
    gauge: () => riverGauges(it, when)
  };
  const done = await Promise.all(it.kinds.filter((k) => kinds.includes(k)).map((k) => run[k]().catch((e) => {
    console.warn(`[search] ${k} readings could not be read: ${(e as Error)?.message ?? e}`);
    return { hits: [], notes: [`The ${k === "aqi" ? "air-quality" : k === "price" ? "market price" : k === "lake" ? "reservoir" : k === "rain" ? "rain" : "river gauge"} readings could not be read just now.`] } as Values;
  })));
  return { hits: done.flatMap((d) => d.hits), notes: done.flatMap((d) => d.notes) };
}
