/**
 * 27 Nov: Chennai's vegetable and fruit prices from the Tamil Nadu Department of Agricultural Marketing & Agri Business
 * (agrimark.tn.gov.in). Every Uzhavar Sandhai (the state's farmer-to-consumer markets) enters its day's prices on that site, and its
 * public price page reads them back one market and one day at a time (POST /home/getPrice_dir/DD-MM-YYYY/<district>/<market>). These are
 * the same numbers AGMARKNET used to show for these markets (checked row for row on 6 Oct and 26 Nov).
 *
 * Why: AGMARKNET's API now asks for a CAPTCHA on every report (never got around here) and no data.gov.in key is set, so nothing had been
 * read since 6 Oct. This page needs no key, no sign-in and no CAPTCHA; robots.txt does not exist (nothing is disallowed). It is read
 * politely: one market at a time with a gap, a 20 s timeout, a browser User-Agent that also names this dashboard, and only the days that
 * may still change (a day is settled once it was read after noon of the next day).
 *
 * What they are: Uzhavar Sandhai farmer-market RETAIL prices in rupees a kilo (a low and a high price per item; the middle is taken as
 * the modal price, as AGMARKNET did for these markets), not wholesale mandi prices. Koyambedu, the wholesale market, has no such feed.
 * Kept here in the store's unit: rupees a quintal (x 100) and arrivals in tonnes, under AGMARKNET's own item names, so the earlier
 * series carry on.
 *
 * Where they are kept (the copies that do not save to AWS): data/aws-cache/tn-prices.json, the source of truth on every copy. The
 * durable store's mandi_market_prices only keeps what a saving copy sends to AWS: rows a copy that does not save writes there survive its
 * 5-minute reloads (they are laid over each reload) but not a restart, and every reload copies them again. So the rows go to the table
 * only on a copy whose store keeps them (MySQL, or AWS_STORE_SAVE=1), and every read here merges the file with the table (marketRows).
 * The hosted copy's image carries the PC's file under /seed/aws-cache: it is merged in at the first read (start.sh copies the seed
 * only into an empty Modal disk).
 */
import fs from "fs";
import path from "path";
import { bumpDataEpoch } from "@/lib/collector/epoch";

export const TN_SITE = "https://agrimark.tn.gov.in";
export const TN_SOURCE = "TN Department of Agricultural Marketing & Agri Business (agrimark.tn.gov.in)";
export const TN_WHAT = "Uzhavar Sandhai farmer-market retail prices, Rs per kg";
export const TN_NAME = "Tamil Nadu market prices (Uzhavar Sandhai)";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 DistrictIQ/1.0 (Chennai Collector dashboard; reads the public Uzhavar Sandhai price page once a day)";

export interface TnMarket {
  key: string;
  /** agrimark's district and market ids (POST /home/getUSList, district=<id>) */
  dist: number; us: number; district: string;
  /** the Corporation zone the market is in (null: outside the Corporation) */
  zone: number | null; area: "Chennai city" | "Suburbs";
  /** the market's name as data.gov.in and AGMARKNET write it ("Nanganallur(Uzhavar Sandhai )") */
  re: RegExp;
}
/**
 * The Uzhavar Sandhai markets in and around Chennai. Chennai district itself has none on agrimark; these are the two inside the
 * Corporation, then the nearest suburban ones in Chengalpattu, Kancheepuram and Tiruvallur. The "Anna Nagar" and "K.K. Nagar" markets
 * the AGMARKNET collector kept were Madurai's and Tiruchirappalli's (matched by name across the state) and are left out of every read.
 */
export const TN_MARKETS: TnMarket[] = [
  { key: "Nanganallur", dist: 35, us: 5, district: "Chengalpattu", zone: 12, area: "Chennai city", re: /^nanganallur\s*\(/i },
  { key: "Ambattur", dist: 3, us: 17, district: "Tiruvallur", zone: 7, area: "Chennai city", re: /^ambattur\s*\(/i },
  { key: "Pallavaram", dist: 35, us: 2, district: "Chengalpattu", zone: null, area: "Suburbs", re: /^pallavaram\s*\(/i },
  { key: "Medavakkam", dist: 35, us: 4, district: "Chengalpattu", zone: null, area: "Suburbs", re: /^medavakkam\s*\(/i },
  { key: "Keelkattalai", dist: 35, us: 7, district: "Chengalpattu", zone: null, area: "Suburbs", re: /^keel\s*kat+alai\s*\(/i },
  { key: "Guduvancheri", dist: 35, us: 9, district: "Chengalpattu", zone: null, area: "Suburbs", re: /^guduvancheri\s*\(/i },
  { key: "Kundrathur", dist: 2, us: 12, district: "Kancheepuram", zone: null, area: "Suburbs", re: /^kundrathur\s*\(/i },
  { key: "Padappai", dist: 2, us: 10, district: "Kancheepuram", zone: null, area: "Suburbs", re: /^padappai\s*\(/i }
];
export const TN_MARKET_KEYS = TN_MARKETS.map((m) => m.key);

// ------------------------------------------------------------------ names --

/** agrimark's item names (lower case, single spaces) to AGMARKNET's spellings, which the stored series and the staples order use */
const NAMES: Record<string, [string, string?]> = {
  "big onion": ["Onion"], "small onion": ["Small Onion"], "onion leaf": ["Onion Leaf"], chilli: ["Green Chilli"], "bajji chilli": ["Bajji Chilli"],
  bhendi: ["Bhindi(Ladies Finger)"], "ribbed gourd": ["Ridgeguard(Tori)"], "snake gourd": ["Snakeguard"], "bottle gourd": ["Bottle gourd"],
  "bitter gourd": ["Bitter gourd"], radish: ["Raddish"], avarai: ["Green Avare(W)"], ginger: ["Ginger(Green)"], "cluster beans": ["Cluster beans"],
  "ash gourd": ["Ashgourd"], "elephant foot yam": ["Elephant Yam(Suran)/Amorphophallus"], "mango (veg)": ["Mango(Raw-Ripe)"], amla: ["Amla(Nelli Kai)"],
  "banana (veg)": ["Banana - Green"], "banana (green banana)": ["Banana - Green", "Green Banana"], "banana flower": ["Banana Flower"], "banana stem": ["Banana Stem"],
  "banana leaf": ["Banana Leaf"], greens: ["Amaranthus"], "coriander leaf": ["Coriander(Leaves)"], "curry leaf": ["Curry Leaf"], "mint leaf": ["Mint(Pudina)"],
  garlic: ["Garlic"], cowpea: ["Cowpea(Veg)"], mochai: ["Indian Beans(Seam)"], colacasia: ["Colacasia"], kovvaikai: ["Thondekai"],
  karunaikizhangu: ["Yam(Ratalu)"], cucumber: ["Cucumbar(Kheera)"], "sweet lime": ["Mousambi(Sweet Lime)"], pinapple: ["Pineapple"], pineapple: ["Pineapple"],
  watermelon: ["Water Melon"], rose: ["Rose(Local)"], marigold: ["Marigold(Calcutta)"], sapota: ["Chikoos(Sapota)"], pappaya: ["Papaya"], papaya: ["Papaya"],
  "knol khol": ["Knool Khol"], peas: ["Green Peas"], "sweet corn": ["Sweet Corn"], "chow chow": ["Chow Chow"], sundaikai: ["Sundaikai"]
};
/** AGMARKNET's name for small onion ("Onion Green") reads as spring onion: the earlier rows are shown under the clear name too */
const RENAME: Record<string, string> = { "onion green": "Small Onion" };
/** groups as AGMARKNET kept them for these items (the rest are vegetables) */
const GROUP: Record<string, string> = {
  Apple: "Fruits", Grapes: "Fruits", Guava: "Fruits", Orange: "Fruits", Papaya: "Fruits", Pineapple: "Fruits", Pomegranate: "Fruits", "Chikoos(Sapota)": "Fruits",
  "Mousambi(Sweet Lime)": "Fruits", "Water Melon": "Fruits", "Musk Melon": "Fruits", "Tender Coconut": "Fruits", "Amla(Nelli Kai)": "Fruits", Jackfruit: "Fruits",
  Jasmine: "Flowers", "Rose(Local)": "Flowers", "Marigold(Calcutta)": "Flowers", Tuberose: "Flowers", Chrysanthemum: "Flowers", Crossandra: "Flowers",
  Beans: "Pulses", "Green Peas": "Pulses", Groundnut: "Oil Seeds", "Sweet Corn": "Cereals", Coconut: "Spices"
};
const cap = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** An agrimark item name as [commodity, variety, group]: "Tomato (Bangalore)" -> Tomato, Bangalore; "Banana (Poovan)" -> Banana (Poovan). */
export function tnItem(name: string): [string, string, string] {
  const t = name.replace(/\s+/g, " ").trim();
  const low = t.toLowerCase();
  const whole = NAMES[low];
  let commodity: string, variety = "";
  if (whole) [commodity, variety = ""] = [whole[0], whole[1] ?? ""];
  else {
    const m = /^(.+?)\s*\(\s*(.+?)\s*\)$/.exec(t);
    const base = (m ? m[1] : t).trim(), extra = m ? m[2].trim() : "";
    const b = NAMES[base.toLowerCase()];
    if (/^banana$/i.test(base) && extra) commodity = `Banana (${cap(extra.replace(/\s*banana$/i, "").toLowerCase())})`; // the fruit kinds differ 2x in price: never averaged
    else { commodity = b ? b[0] : cap(base.toLowerCase()); variety = extra ? cap(extra.toLowerCase()) : ""; }
  }
  const group = GROUP[commodity] ?? (/^Banana \(/.test(commodity) ? "Fruits" : "Vegetables");
  return [commodity.slice(0, 96), variety.slice(0, 96), group];
}
/** a stored item name as the console shows it ("Onion Green" -> "Small Onion") */
export const shownName = (c: string): string => RENAME[c.toLowerCase()] ?? c;

/** [commodity, variety, min, max, modal, arrival, group]: rupees a quintal, tonnes */
export type TnCell = [string, string, number | null, number | null, number, number | null, string | null];

const price = (v: unknown): number | null => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return String(v ?? "").trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * One market's answer for one day. null: the market has not entered that day (the site answers `null`, or an empty list). Throws on an
 * answer that is not a price list (an error page), so a failure is never taken for "no report". An item whose low price is above its high
 * price (an entry slip: "1110" to "130") is left out, as AGMARKNET left it out.
 */
export function parsePriceList(body: string): TnCell[] | null {
  const t = body.replace(/^﻿/, "").trim();
  if (t === "" || t === "null" || t === "[]" || t === "{}") return null;
  let j: unknown;
  try { j = JSON.parse(t); } catch { throw new Error(`not a price list (${t.slice(0, 60).replace(/\s+/g, " ")})`); }
  if (j == null) return null;
  const list = (j as { price_list?: unknown }).price_list;
  if (list == null || (Array.isArray(list) && !list.length)) return null;
  if (typeof list !== "object" || Array.isArray(list)) throw new Error("not a price list (no price_list object)");
  const out = new Map<string, TnCell>();
  for (const [name, v] of Object.entries(list as Record<string, { qty?: unknown; min?: unknown; max?: unknown }>)) {
    let lo = price(v?.min), hi = price(v?.max);
    if (lo == null && hi == null) continue;
    lo ??= hi; hi ??= lo;
    if (lo! > hi!) continue;
    const [commodity, variety, group] = tnItem(name);
    if (!commodity) continue;
    const qty = price(v?.qty);
    const key = `${commodity}\u0000${variety}`;
    if (out.has(key)) continue; // two spellings of one item in one list: the first is kept (the table's key is the item and its variety)
    out.set(key, [commodity, variety, lo! * 100, hi! * 100, Math.round(((lo! + hi!) / 2) * 100 * 100) / 100, qty == null ? null : Math.round(qty) / 1000, group]);
  }
  return [...out.values()];
}

// ------------------------------------------------------------------ fetch --

const ddmmyyyy = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;

/** One market's prices for one day from agrimark.tn.gov.in (null: not entered). Throws on an HTTP error, a timeout or an error page. */
export async function fetchMarketDay(day: string, m: Pick<TnMarket, "dist" | "us" | "key">, timeoutMs = 20_000): Promise<TnCell[] | null> {
  const r = await fetch(`${TN_SITE}/home/getPrice_dir/${ddmmyyyy(day)}/${m.dist}/${m.us}`, {
    method: "POST",
    headers: { "User-Agent": UA, Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest", Referer: `${TN_SITE}/` },
    cache: "no-store", signal: AbortSignal.timeout(timeoutMs)
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parsePriceList(await r.text());
}

// ------------------------------------------------------------------ cache --

interface Entry { at: string; rows: TnCell[] }
interface Saved { v: 1; source: string; unit: string; days: Record<string, Record<string, Entry>> }
const KEEP_DAYS = 400;
const file = (): string | null => process.env.TN_PRICES_FILE || (process.env.VITEST ? null : path.join(process.cwd(), "data", "aws-cache", "tn-prices.json"));
/** the hosted copy's image holds the PC's file here (deploy/modal: data/aws-cache staged into /seed/aws-cache) */
const seedFile = (): string | null => process.env.TN_PRICES_SEED ?? (process.env.VITEST ? null : "/seed/aws-cache/tn-prices.json");

declare global {
  // eslint-disable-next-line no-var
  var __tnPrices: { saved: Saved | null; mtime: number; seeded: boolean } | undefined;
}
const G = (global.__tnPrices ??= { saved: null, mtime: 0, seeded: false });
const blank = (): Saved => ({ v: 1, source: TN_SOURCE, unit: "rupees a quintal (the site's rupees a kilo x 100); arrivals in tonnes", days: {} });

function readFileSaved(f: string): Saved | null {
  try {
    const j = JSON.parse(fs.readFileSync(f, "utf8")) as Saved;
    return j && typeof j.days === "object" ? j : null;
  } catch { return null; }
}
/** the newer reading of a day at a market wins (a later read of a day that was still open) */
function mergeInto(to: Saved, from: Saved): number {
  let n = 0;
  for (const [d, byM] of Object.entries(from.days ?? {})) for (const [k, e] of Object.entries(byM ?? {})) {
    const cur = to.days[d]?.[k];
    if (!e || !Array.isArray(e.rows) || (cur && cur.at >= e.at)) continue;
    (to.days[d] ??= {})[k] = e;
    n++;
  }
  return n;
}

/** The kept prices (read again when the file changed on disk: the backfill script, another copy's sync). */
export function loadTn(): Saved {
  const f = file();
  if (!f) return (G.saved ??= blank());
  let mtime = 0;
  try { mtime = fs.statSync(f).mtimeMs; } catch { /* not there yet */ }
  if (!G.saved || (mtime && mtime !== G.mtime)) {
    const had = !!G.saved;
    G.saved = (mtime ? readFileSaved(f) : null) ?? G.saved ?? blank();
    G.mtime = mtime;
    // written by someone else (the backfill script, the hosted copy's disk sync): the reads kept by the caches start again
    if (had) bumpDataEpoch();
  }
  if (!G.seeded) {
    G.seeded = true;
    const s = seedFile();
    const seed = s && path.resolve(s) !== path.resolve(f) && fs.existsSync(s) ? readFileSaved(s) : null;
    if (seed && mergeInto(G.saved!, seed)) saveTn(G.saved!);
  }
  return G.saved!;
}

export function saveTn(s: Saved): void {
  G.saved = s;
  const f = file();
  if (!f) return;
  const days = Object.keys(s.days).sort();
  for (const d of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) delete s.days[d];
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f + ".tmp", JSON.stringify(s));
    fs.renameSync(f + ".tmp", f);
    G.mtime = fs.statSync(f).mtimeMs;
  } catch (e) {
    console.warn(`[tnprices] could not save ${path.basename(f)} (kept in memory): ${(e as Error).message}`);
  }
}
/** for tests: forget what was loaded */
export function forgetTn(): void { G.saved = null; G.mtime = 0; G.seeded = false; }

/** India's wall clock as the store writes it ("2026-11-27 06:00:12") */
const istStamp = (ms = Date.now()) => new Date(ms + 330 * 60_000).toISOString().replace("T", " ").slice(0, 19);
export const addDays = (d: string, n: number): string => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** a day's prices can still change until noon of the next day (a market that enters late); a reading after that is final */
export const settled = (day: string, at: string): boolean => at >= `${addDays(day, 1)} 12:00:00`;

// -------------------------------------------------------------- collector --

export interface TnRun {
  /** calls made, calls answered (prices or "not entered"), rows read, rows new to the file */
  calls: number; answered: number; seen: number; added: number;
  /** one line per call that failed ("Ambattur, 26 Nov: HTTP 503"), in the order they failed */
  errors: string[];
  /** the newest day any market reported */
  newest: string | null;
  /** the days read (oldest first) */
  days: string[];
}
type Fetcher = (day: string, m: TnMarket) => Promise<TnCell[] | null>;

/** whether this copy's store keeps what it writes (MySQL, or the one AWS copy that saves): the only copy that writes the table */
export async function storeKeeps(): Promise<boolean> {
  if (process.env.DATA_BACKEND !== "aws") return true;
  try { return (await import("@/lib/aws/store")).savesToAws(); } catch { return false; }
}

const wait = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());
/** failed calls in a row, with none answered yet this run, after which the run stops */
const STOP_AFTER_FAILS = 3;

/**
 * Reads the days of from..to (IST; default the last 15 days) that are not settled yet, every market in turn with `gapMs` between calls,
 * keeps them in the file after each day, and (where the store keeps its writes, `mirror` not false) in mandi_market_prices. A day is read
 * once more until it is settled; a failed call is said in `errors` and tried again next run. Never throws for a market's answer.
 */
export async function collectTnPrices(o: { from?: string; to?: string; gapMs?: number; mirror?: boolean; fetcher?: Fetcher; force?: boolean;
  log?: (t: string) => void; markets?: TnMarket[] } = {}): Promise<TnRun> {
  const today = istStamp().slice(0, 10);
  const to = o.to ?? today, from = o.from ?? addDays(to, -14);
  const get: Fetcher = o.fetcher ?? ((d, m) => fetchMarketDay(d, m));
  const gap = o.gapMs ?? 1000;
  const markets = o.markets ?? TN_MARKETS;
  const run: TnRun = { calls: 0, answered: 0, seen: 0, added: 0, errors: [], newest: null, days: [] };
  const s = loadTn();
  const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
  const mirrored: string[] = [];
  let shown = false, stopped = false;
  for (let d = from; d <= to && !stopped; d = addDays(d, 1)) {
    let changed = false;
    for (const m of markets) {
      const cur = s.days[d]?.[m.key];
      if (cur && !o.force && settled(d, cur.at)) continue;
      if (run.calls) await wait(gap);
      run.calls++;
      try {
        const got = await get(d, m);
        const at = istStamp();
        run.answered++;
        // a day that had prices and now answers "not entered" keeps the prices it had (a site's passing gap never wipes a day)
        const rows = got == null && cur?.rows.length ? cur.rows : got;
        const before = new Set((cur?.rows ?? []).map((r) => `${r[0]}\u0000${r[1]}`));
        if (JSON.stringify(cur?.rows ?? []) !== JSON.stringify(rows ?? [])) shown = true;
        (s.days[d] ??= {})[m.key] = { at, rows: rows ?? [] };
        changed = true;
        if (rows?.length) {
          run.seen += rows.length;
          run.added += rows.filter((r) => !before.has(`${r[0]}\u0000${r[1]}`)).length;
          if (!run.newest || d > run.newest) run.newest = d;
        }
        o.log?.(`${d} ${m.key}: ${rows == null ? "not entered" : `${rows.length} items`}`);
      } catch (e) {
        const msg = (e as Error)?.name === "TimeoutError" ? "no answer in 20 s" : String((e as Error)?.message ?? e).slice(0, 160);
        run.errors.push(`${m.key}, ${short(d)}: ${msg}`);
        o.log?.(`${d} ${m.key}: FAILED ${msg}`);
        // 27 Nov review: a site that answers none of the first calls (down, or refusing this copy's address: the hosted copy abroad) is
        // not asked the rest of the run's up to 120 calls, 20 s each; the next run tries again
        if (!run.answered && run.errors.length >= STOP_AFTER_FAILS) {
          run.errors[run.errors.length - 1] += `; stopped after ${run.calls} calls with no answer`;
          stopped = true;
          break;
        }
      }
    }
    if (changed) { run.days.push(d); saveTn(s); if (Object.values(s.days[d] ?? {}).some((e) => e.rows.length)) mirrored.push(d); }
  }
  if (o.mirror !== false && mirrored.length && await storeKeeps()) {
    await mirrorToStore(mirrored).catch((e) => run.errors.push(`saving to the store: ${String((e as Error)?.message ?? e).slice(0, 160)}`));
  }
  // new figures: the dashboard's and Jarvis's kept reads start again (they are kept by the data's version, which a file does not move)
  if (shown) bumpDataEpoch();
  return run;
}

/**
 * The file's rows of `days` (default: every day it holds) into mandi_market_prices, only where the table lacks them or holds other figures,
 * each day in one transaction (ogdprices.keepDay). Run only where the store keeps its writes: a copy that does not save would only carry
 * them over each reload until it restarts. Returns how many rows were written.
 */
export async function mirrorToStore(days?: string[]): Promise<number> {
  const s = loadTn();
  const list = (days ?? Object.keys(s.days)).filter((d) => s.days[d]).sort();
  if (!list.length) return 0;
  const [{ default: pool, ops }, { keepDay }] = await Promise.all([import("@/lib/collector/db"), import("@/lib/collector/ogdprices")]);
  const marks = TN_MARKET_KEYS.map(() => "?").join(", ");
  const [have] = await pool.query(`SELECT DATE_FORMAT(date, '%Y-%m-%d') AS d, market, commodity, variety, min_price, max_price, modal_price
    FROM ${ops("mandi_market_prices")} WHERE date >= ? AND date <= ? AND market IN (${marks})`, [list[0], list.at(-1), ...TN_MARKET_KEYS]) as unknown as [Record<string, unknown>[]];
  const held = new Map(have.map((r) => [`${r.d}\u0000${r.market}\u0000${r.commodity}\u0000${r.variety}`.toLowerCase(), `${Number(r.min_price)}|${Number(r.max_price)}|${Number(r.modal_price)}`]));
  let n = 0;
  for (const d of list) {
    const rows = Object.entries(s.days[d]).flatMap(([market, e]) => e.rows
      .filter((c) => held.get(`${d}\u0000${market}\u0000${c[0]}\u0000${c[1]}`.toLowerCase()) !== `${Number(c[2])}|${Number(c[3])}|${Number(c[4])}`)
      .map((c) => ({ market, commodity: c[0], variety: c[1], min: c[2], max: c[3], modal: c[4], arrival: c[5], group: c[6] })));
    if (!rows.length) continue;
    await keepDay(d, rows);
    n += rows.length;
  }
  return n;
}

// ------------------------------------------------------------------ reads --

export interface PriceRow { d: string; market: string; commodity: string; variety: string; grp: string | null; min: number | null; max: number | null; modal: number; arrival: number | null }
const numOr = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * Every price row of from..to (inclusive, "YYYY-MM-DD") at the Chennai markets (or one of them): the file's rows, and the store's for a day
 * and market the file does not hold (AGMARKNET's rows up to 6 Oct; what a saving copy kept). Rows of a market not in TN_MARKETS (the
 * Madurai and Tiruchirappalli "Anna Nagar" and "K.K. Nagar") are never returned. Oldest first.
 */
export async function marketRows(from: string, to: string, market: string | null = null): Promise<PriceRow[]> {
  const keys = market ? TN_MARKET_KEYS.filter((k) => k.toLowerCase() === market.toLowerCase()) : TN_MARKET_KEYS;
  if (!keys.length || from > to) return [];
  const s = loadTn();
  const out: PriceRow[] = [];
  const inFile = new Set<string>();
  for (const d of Object.keys(s.days)) {
    if (d < from || d > to) continue;
    for (const k of keys) {
      const e = s.days[d][k];
      if (!e?.rows.length) continue;
      inFile.add(`${d}\u0000${k}`);
      for (const c of e.rows) out.push({ d, market: k, commodity: shownName(c[0]), variety: c[1], grp: c[6], min: c[2], max: c[3], modal: c[4], arrival: c[5] });
    }
  }
  for (const r of await storeRows(from, to, keys)) {
    const k = TN_MARKET_KEYS.find((x) => x.toLowerCase() === String(r.market).toLowerCase());
    const modal = numOr(r.modal);
    if (!k || modal == null || inFile.has(`${r.d}\u0000${k}`)) continue;
    out.push({ d: String(r.d), market: k, commodity: shownName(String(r.commodity)), variety: String(r.variety ?? ""), grp: r.grp == null ? null : String(r.grp),
      min: numOr(r.lo), max: numOr(r.hi), modal, arrival: numOr(r.arrival) });
  }
  return out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.market.localeCompare(b.market) || a.commodity.localeCompare(b.commodity)));
}

async function storeRows(from: string, to: string, keys: string[]): Promise<Record<string, unknown>[]> {
  try {
    const { default: pool, ops } = await import("@/lib/collector/db");
    const [rows] = await pool.query(`SELECT DATE_FORMAT(date, '%Y-%m-%d') AS d, market, commodity, variety, cmdt_group AS grp, min_price AS lo, max_price AS hi,
        modal_price AS modal, arrival FROM ${ops("mandi_market_prices")} WHERE date >= ? AND date <= ? AND market IN (${keys.map(() => "?").join(", ")})`,
      [from, to, ...keys]) as unknown as [Record<string, unknown>[]];
    return rows ?? [];
  } catch (e) {
    console.warn(`[tnprices] market prices in the store could not be read: ${(e as Error).message}`);
    return [];
  }
}

export interface PriceSpan { from: string | null; to: string | null; fetched: string | null }
/** The first and last day with a price report (at one market, or any Chennai market), and when prices were last read. */
export async function marketSpan(market: string | null = null): Promise<PriceSpan> {
  const keys = market ? TN_MARKET_KEYS.filter((k) => k.toLowerCase() === market.toLowerCase()) : TN_MARKET_KEYS;
  if (!keys.length) return { from: null, to: null, fetched: null };
  const s = loadTn();
  let lo: string | null = null, hi: string | null = null, at: string | null = null;
  for (const [d, byM] of Object.entries(s.days)) for (const k of keys) {
    const e = byM[k];
    if (!e) continue;
    if (!at || e.at > at) at = e.at;
    if (!e.rows.length) continue;
    if (!lo || d < lo) lo = d;
    if (!hi || d > hi) hi = d;
  }
  try {
    const { default: pool, ops } = await import("@/lib/collector/db");
    const [[r]] = await pool.query(`SELECT DATE_FORMAT(MIN(date), '%Y-%m-%d') AS a, DATE_FORMAT(MAX(date), '%Y-%m-%d') AS b, DATE_FORMAT(MAX(fetched_at), '%Y-%m-%d %H:%i:%s') AS f
      FROM ${ops("mandi_market_prices")} WHERE market IN (${keys.map(() => "?").join(", ")})`, keys) as unknown as [Record<string, unknown>[]];
    if (r?.a && (!lo || String(r.a) < lo)) lo = String(r.a);
    if (r?.b && (!hi || String(r.b) > hi)) hi = String(r.b);
    if (r?.f && (!at || String(r.f) > at)) at = String(r.f);
  } catch { /* the file alone */ }
  return { from: lo, to: hi, fetched: at };
}

/** The newest day on or before `day` with a price report (at one market, or any Chennai market), from the file and the store. */
export async function newestOnOrBefore(day: string, market: string | null = null): Promise<string | null> {
  const keys = market ? TN_MARKET_KEYS.filter((k) => k.toLowerCase() === market.toLowerCase()) : TN_MARKET_KEYS;
  if (!keys.length) return null;
  const s = loadTn();
  let best: string | null = null;
  for (const [d, byM] of Object.entries(s.days)) if (d <= day && (!best || d > best) && keys.some((k) => byM[k]?.rows.length)) best = d;
  try {
    const { default: pool, ops } = await import("@/lib/collector/db");
    const [[r]] = await pool.query(`SELECT DATE_FORMAT(MAX(date), '%Y-%m-%d') AS d FROM ${ops("mandi_market_prices")} WHERE date <= ? AND market IN (${keys.map(() => "?").join(", ")})`,
      [day, ...keys]) as unknown as [Record<string, unknown>[]];
    if (r?.d && (!best || String(r.d) > best)) best = String(r.d);
  } catch { /* the file alone */ }
  return best;
}

/** the days of from..to the file holds a market's report for (a data.gov.in read is not asked for them) */
export function fileDays(from: string, to: string): Set<string> {
  const s = loadTn();
  return new Set(Object.keys(s.days).filter((d) => d >= from && d <= to && Object.values(s.days[d]).some((e) => e.rows.length)));
}

/** A day's report at each market, as the file holds it, for a table (the Studio's link adapter): the newest day on or before `to`. */
export function fileDay(to?: string): { day: string; rows: (PriceRow & { qtyKg: number | null })[] } | null {
  const s = loadTn();
  const days = Object.keys(s.days).filter((d) => (!to || d <= to) && TN_MARKET_KEYS.some((k) => s.days[d][k]?.rows.length)).sort();
  const day = days.at(-1);
  if (!day) return null;
  const rows = TN_MARKET_KEYS.flatMap((k) => (s.days[day][k]?.rows ?? []).map((c) => ({ d: day, market: k, commodity: shownName(c[0]), variety: c[1], grp: c[6],
    min: c[2], max: c[3], modal: c[4], arrival: c[5], qtyKg: c[5] == null ? null : Math.round(c[5] * 1000) })));
  return { day, rows };
}
