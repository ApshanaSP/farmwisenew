/**
 * v18 round 2 (24 Nov): Chennai market prices for any day, from the Government of India's Open Government Data platform (data.gov.in), which
 * publishes AGMARKNET's daily market-wise prices through an API with a free key.
 *
 * Why: AGMARKNET's own API now asks for a CAPTCHA on every report ("Captcha key and captcha value are required", checked 24 Nov), so the
 * collector (sources.ts collectMandiMarkets) has read nothing since early October. A CAPTCHA is never got around here; the published API is
 * used instead. It needs DATA_GOV_API_KEY in the portal's .env (register free at https://data.gov.in, "My account", "Generate key").
 *
 * The data set: "Variety-wise Daily Market Prices Data of Commodity" (DATA_GOV_MANDI_RESOURCE to change it), filtered by state and arrival
 * date. Its records' field names are read whatever their case ("Market"/"market", "Modal_Price"/"modal_price"), and two filter spellings
 * are tried, because the platform's resources differ; a record that names none of Chennai's markets is left out. Prices are rupees a quintal,
 * as AGMARKNET's. NOT YET RUN against the live API from this machine (data.gov.in refused automated reads of its pages): the first run with a key
 * should be checked against the console's Environment page.
 *
 * 27 Nov: the Chennai markets' prices now come first from the TN Agricultural Marketing department's own feed (tnprices.ts, no key); this
 * data set is read as well only when DATA_GOV_API_KEY is set.
 */
import intelPool, { ops } from "@/lib/collector/db";
import type { ResultSetHeader } from "mysql2";
import { CHENNAI_MARKETS } from "@/lib/collector/sources";

type Row = Record<string, unknown>;
export const ogdKey = (): string | null => (process.env.DATA_GOV_API_KEY || "").trim() || null;
const RESOURCE = () => (process.env.DATA_GOV_MANDI_RESOURCE || "35985678-0d79-46b4-9ed6-6f13308a1d24").trim();

/** a field of a record, whatever its case or spacing ("Modal_Price", "modal_price", "Modal Price") */
function field(r: Row, name: string): unknown {
  const want = name.toLowerCase().replace(/[^a-z]/g, "");
  for (const [k, v] of Object.entries(r)) if (k.toLowerCase().replace(/[^a-z]/g, "") === want) return v;
  return undefined;
}
const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * The Chennai market a record names ("Nanganallur(Uzhavar Sandhai )", "Ambattur(Uzhavar Sandhai )"), by the same anchored names the
 * collector keeps (tnprices.ts TN_MARKETS, as sources.ts CHENNAI_MARKETS): a market that only starts like one ("Ambattur" alone) is not it.
 * 27 Nov: "Anna Nagar" and "K.K. Nagar" are no longer Chennai markets here: data.gov.in's are in Madurai and Tiruchirappalli.
 */
export function marketOf(name: unknown): string | null {
  const t = String(name ?? "").trim();
  if (!t) return null;
  return CHENNAI_MARKETS.find((m) => m.re.test(t))?.key ?? null;
}
/** the districts Chennai's markets are in (Chennai, Chengalpattu, Kancheepuram, Thiruvallur), as the data set may spell them */
const CHENNAI_DISTRICT = /^(?:chennai|chengalpa?t?tu|chengalpet|kanch[ie]{1,2}puram|th?iruv[ae]ll?(?:ur|ore))$/;
export const chennaiDistrict = (v: unknown): boolean => CHENNAI_DISTRICT.test(String(v ?? "").toLowerCase().replace(/[^a-z]/g, ""));
/** a record's own arrival date ("20/11/2026", as data.gov.in writes it; "2026-11-20") as "2026-11-20", else null */
export function arrivalDay(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  return ymd ? `${ymd[1]}-${ymd[2]}-${ymd[3]}` : null;
}
/** (27 Nov: `group` and `arrival` (tonnes) are given by the agrimark collector, tnprices.ts; data.gov.in rows leave them empty) */
export interface OgdRow { market: string; commodity: string; variety: string; min: number | null; max: number | null; modal: number; group?: string | null; arrival?: number | null }
/**
 * v18 round 3: the records that are a Chennai market's own report for the day asked: Tamil Nadu, one of the four districts, its own arrival
 * date that day (never another day's record the filter let through), a market named as the collector names it, and a modal price.
 */
export function chennaiRows(recs: Row[], day: string): OgdRow[] {
  const out: OgdRow[] = [];
  for (const r of recs) {
    const state = field(r, "state");
    if (state != null && String(state).toLowerCase().replace(/[^a-z]/g, "") !== "tamilnadu") continue;
    if (!chennaiDistrict(field(r, "district"))) continue;
    if (arrivalDay(field(r, "arrival_date")) !== day) continue;
    const market = marketOf(field(r, "market"));
    const modal = num(field(r, "modal_price"));
    if (!market || modal == null) continue;
    out.push({ market, commodity: String(field(r, "commodity") ?? "").trim().slice(0, 96), variety: String(field(r, "variety") ?? "").trim().slice(0, 96),
      min: num(field(r, "min_price")), max: num(field(r, "max_price")), modal });
  }
  return out;
}
/** "2026-11-20" as data.gov.in writes dates, "20/11/2026" */
const ddmmyyyy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** a refused key (HTTP 401 / 403, or the platform's own words for it): the one data.gov.in error a scheduled run stops on */
const KEY_REFUSED = /HTTP 40[13]\b|api[-_ ]?key|not authori[sz]ed|invalid key|forbidden/i;
export const isOgdKeyError = (e: unknown): boolean => (e as { name?: string } | null)?.name === "OgdKeyError";
function ogdError(message: string): Error {
  const e = new Error(KEY_REFUSED.test(message) ? `${message}: check DATA_GOV_API_KEY` : message);
  if (KEY_REFUSED.test(message)) e.name = "OgdKeyError";
  return e;
}
/** records asked for at a time, and the most one day of Tamil Nadu may hold (more means the platform did not apply the filters) */
const PAGE = 2000, MOST = 40_000, MOST_PAGES = 60;

type Page = { ok: true; records: Row[]; total: number | null } | { ok: false; error: string };
async function page(url: string, offset: number, signal?: AbortSignal): Promise<Page> {
  const r = await fetch(`${url}&offset=${offset}`, { headers: { Accept: "application/json" }, signal: signal ?? AbortSignal.timeout(20_000) });
  if (!r.ok) return { ok: false, error: `data.gov.in HTTP ${r.status}` };
  const j = await r.json().catch(() => null) as { records?: Row[]; total?: unknown; status?: string; message?: string; error?: unknown } | null;
  if (!j || j.error || j.status === "error" || !Array.isArray(j.records)) return { ok: false, error: `data.gov.in: ${String(j?.error ?? j?.message ?? "no records list in its answer")}` };
  const total = j.total == null || j.total === "" || !Number.isFinite(Number(j.total)) ? null : Number(j.total);
  return { ok: true, records: j.records, total };
}

/**
 * Every record data.gov.in holds for Tamil Nadu on the day, page by page (&offset=) until the platform's `total` is reached (or, without
 * one, a short page). Two filter spellings are tried: one the platform refuses (HTTP 400) or ignores (a whole data set's worth back) is not
 * its spelling. Throws when the day could not be read (an HTTP error, a timeout, a page lost midway, no spelling applied), so a failure is
 * never taken for "no prices that day"; [] only when the platform answered, filtered, with none.
 */
async function fetchDay(day: string, key: string, signal?: AbortSignal): Promise<Row[]> {
  const base = `https://api.data.gov.in/resource/${encodeURIComponent(RESOURCE())}?api-key=${encodeURIComponent(key)}&format=json&limit=${PAGE}`;
  const tries = [`&filters[State]=${encodeURIComponent("Tamil Nadu")}&filters[Arrival_Date]=${encodeURIComponent(ddmmyyyy(day))}`,
    `&filters[state.keyword]=${encodeURIComponent("Tamil Nadu")}&filters[arrival_date]=${encodeURIComponent(ddmmyyyy(day))}`];
  const unfiltered = (n: number) => `data.gov.in sent ${n} records for one day: its filters were not applied`;
  let failed = "", unsure = "", answered = false;
  for (const f of tries) {
    const first = await page(base + f, 0, signal);
    if (!first.ok) { if (/HTTP 400\b/.test(first.error)) unsure ||= first.error; else failed ||= first.error; continue; }
    if (first.total != null && first.total > MOST) { unsure ||= unfiltered(first.total); continue; }
    if (!first.records.length) { answered = true; continue; }
    const out = [...first.records];
    let offset = first.records.length, lastCount = first.records.length;
    for (let n = 1; first.total != null ? offset < first.total : lastCount >= PAGE; n++) {
      if (n >= MOST_PAGES || out.length > MOST) throw ogdError(out.length > MOST ? unfiltered(out.length) : `data.gov.in: more than ${MOST_PAGES} pages for ${day}; left unread`);
      const next = await page(base + f, offset, signal);
      if (!next.ok) throw ogdError(`${next.error} (page ${n + 1} of ${day})`);
      if (!next.records.length) break;
      out.push(...next.records);
      offset += next.records.length;
      lastCount = next.records.length;
    }
    return out;
  }
  if (failed) throw ogdError(failed);
  if (!answered) throw ogdError(unsure || "data.gov.in did not answer");
  return [];
}

/** v18 round 3: the days data.gov.in answered with no Chennai market report, and until when they are not asked again (markets report late) */
const emptyDays = new Map<string, number>();
const EMPTY_MS = 3 * 3600_000;
/** the days being read from data.gov.in now */
const reading = new Map<string, Promise<{ seen: number; added: number }>>();
/** the days of from..to that data.gov.in answered with no Chennai report within the last 3 hours (oldest first) */
export function ogdEmptyDays(from: string, to: string): string[] {
  const now = Date.now();
  return [...emptyDays].filter(([d, until]) => until > now && d >= from && d <= to).map(([d]) => d).sort();
}
/** for tests: forget the days remembered as empty and the reads under way */
export function forgetOgdDays(): void { emptyDays.clear(); reading.clear(); }

/**
 * One day's prices at Chennai's markets, read from data.gov.in and kept in mandi_market_prices (the same table the AGMARKNET collector wrote,
 * so every page reads them alike). Returns how many rows it kept. Nothing when no key is set. Throws when the day could not be read; a day
 * read with no Chennai report is remembered for 3 hours (missingDays leaves it out).
 */
export async function ogdMarketDay(day: string, signal?: AbortSignal): Promise<{ seen: number; added: number }> {
  const key = ogdKey();
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { seen: 0, added: 0 };
  // v18 round 3: a day being read already (an answer that stopped waiting, the collector) is that same read, never a second one
  const on = reading.get(day);
  if (on) return on;
  const job = Promise.resolve().then(async () => {
    const rows = chennaiRows(await fetchDay(day, key, signal), day);
    if (!rows.length) { emptyDays.set(day, Date.now() + EMPTY_MS); return { seen: 0, added: 0 }; }
    emptyDays.delete(day);
    return { seen: rows.length, added: await keepDay(day, rows) };
  });
  reading.set(day, job);
  void job.then(() => reading.delete(day), () => reading.delete(day));
  return job;
}

const INSERT = () => `INSERT INTO ${ops("mandi_market_prices")} (date, market, commodity, variety, cmdt_group, min_price, max_price, modal_price, arrival)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE min_price = VALUES(min_price), max_price = VALUES(max_price), modal_price = VALUES(modal_price),
         cmdt_group = COALESCE(VALUES(cmdt_group), cmdt_group), arrival = COALESCE(VALUES(arrival), arrival), fetched_at = NOW()`;
/**
 * A day's rows in one transaction on one connection (the AWS store sends its changes once, at COMMIT, not once a row; a failed row keeps
 * none of the day). Where the store gives no connection, row by row on the pool as before. Returns how many rows were new.
 * 27 Nov: exported for the agrimark collector (tnprices.ts), which keeps its rows the same way.
 */
export async function keepDay(day: string, rows: OgdRow[]): Promise<number> {
  const sql = INSERT();
  const args = (x: OgdRow) => [day, x.market, x.commodity, x.variety, x.group ?? null, x.min, x.max, x.modal, x.arrival ?? null];
  let added = 0;
  if (typeof (intelPool as { getConnection?: unknown }).getConnection !== "function") {
    for (const x of rows) { const [r] = await intelPool.query<ResultSetHeader>(sql, args(x)); if (r?.affectedRows === 1) added++; }
    return added;
  }
  const conn = await intelPool.getConnection();
  try {
    await conn.beginTransaction();
    for (const x of rows) { const [r] = await conn.query<ResultSetHeader>(sql, args(x)); if (r?.affectedRows === 1) added++; }
    await conn.commit();
    return added;
  } catch (e) {
    await conn.rollback().catch(() => undefined);
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * The days of a window with no market report kept yet (at most `max`, newest first), for an on-demand read. A day data.gov.in answered with
 * no Chennai report in the last 3 hours is left out, so it is not asked again on every question.
 */
export async function missingDays(from: string, to: string, max = 7): Promise<string[]> {
  const [rows] = await intelPool.query(`SELECT DISTINCT DATE_FORMAT(date, '%Y-%m-%d') AS d FROM ${ops("mandi_market_prices")} WHERE date >= ? AND date <= ?`, [from, to]) as unknown as [Row[]];
  const have = new Set(rows.map((r) => String(r.d)));
  const now = Date.now();
  for (const [d, until] of emptyDays) if (until <= now) emptyDays.delete(d);
  const out: string[] = [];
  for (let t = Date.parse(`${to}T00:00:00Z`); t >= Date.parse(`${from}T00:00:00Z`) && out.length < max; t -= 864e5) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (!have.has(d) && !((emptyDays.get(d) ?? 0) > now)) out.push(d);
  }
  return out;
}

/** What data.gov.in gave for the days an answer asked it for. */
export interface OgdOutcome {
  /** the days asked (newest first) */
  tried: string[];
  /** of them, the days it answered with no Chennai market report */
  none: string[];
  /** the days whose read failed, and the first failure's words */
  failed: string[];
  error: string | null;
  /** the days not answered within the wait: still being read in the background, kept for the next question */
  late: string[];
  /** a day came back with Chennai rows (kept in the store) */
  fetched: boolean;
}

/**
 * v18 round 3: the days read from data.gov.in for an answer, which waits for them `waitMs` at most (2.5 s): a read still going on then
 * finishes in the background and its rows are kept for the next question. Each day's real outcome is reported, never "read" for a call that
 * failed or did not answer.
 */
export async function ogdReadDays(days: string[], waitMs = 2500,
  read: (day: string) => Promise<{ seen: number }> = (d) => ogdMarketDay(d, AbortSignal.timeout(30_000))): Promise<OgdOutcome> {
  const state: ({ seen: number } | { error: string } | null)[] = days.map(() => null);
  const all = Promise.allSettled(days.map((d, i) => read(d).then(
    (r) => { state[i] = { seen: r?.seen ?? 0 }; },
    (e) => { state[i] = { error: String((e as Error)?.message || e || "failed") }; })));
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([all, new Promise<void>((res) => { timer = setTimeout(res, waitMs); })]);
  clearTimeout(timer);
  const pick = (f: (s: (typeof state)[number]) => boolean) => days.filter((_, i) => f(state[i]));
  const failed = pick((s) => !!s && "error" in s);
  const late = pick((s) => s === null);
  const firstError = state.find((s): s is { error: string } => !!s && "error" in s)?.error ?? null;
  return {
    tried: days, none: pick((s) => !!s && "seen" in s && s.seen === 0), failed, late,
    error: firstError ?? (late.length ? `data.gov.in did not answer within ${waitMs / 1000} s` : null),
    fetched: state.some((s) => !!s && "seen" in s && s.seen > 0)
  };
}
