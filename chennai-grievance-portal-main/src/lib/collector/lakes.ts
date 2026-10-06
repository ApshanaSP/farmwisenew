/**
 * Chennai's drinking-water reservoirs, as Chennai Metro Water (CMWSSB) publishes them every morning:
 * https://cmwssb.tn.gov.in/lake-level ("Lake Storage As On dd/mm/yyyy"), one row per reservoir with its full
 * capacity, today's level and storage, inflow, outflow, rainfall and the storage on the same day last year.
 * The same page takes ?date=dd-mm-yyyy for an earlier day, which gives the trend.
 *
 * These are the real figures that replace the simulated PWD lake storage on the console. Today's page is read
 * at most once an hour; an earlier day never changes, so it is read once and kept in data/aws-cache/. robots.txt
 * allows /lake-level. When the site cannot be reached the last saved figures are shown, with their date.
 */
import fs from "fs";
import path from "path";

const URL_BASE = "https://cmwssb.tn.gov.in/lake-level";
const FILE = path.join(process.cwd(), "data", "aws-cache", "cmwssb-lakes.json");
const UA = "DistrictIQ/1.0 (Chennai Collector dashboard; reads the public lake level page once an hour)";
const TODAY_EVERY_MS = 60 * 60_000;
const HISTORY_DAYS = 14;

/** Where each reservoir is (dam or lake centre); CMWSSB publishes no coordinates. */
const PLACES: Record<string, { name: string; lat: number; lon: number }> = {
  POONDI: { name: "Poondi (Sathyamurthy Sagar)", lat: 13.1957, lon: 79.8637 },
  CHOLAVARAM: { name: "Cholavaram", lat: 13.2286, lon: 80.1489 },
  PUZHAL: { name: "Puzhal (Red Hills)", lat: 13.1689, lon: 80.1837 },
  "KANNANKOTTAI THERVOY KANDIGAI": { name: "Kannankottai Thervoy Kandigai", lat: 13.3797, lon: 79.9949 },
  CHEMBARAMBAKKAM: { name: "Chembarambakkam", lat: 13.0128, lon: 80.0592 },
  VEERANAM: { name: "Veeranam", lat: 11.3311, lon: 79.5449 }
};

export interface LakeRow {
  key: string; name: string; lat: number; lon: number;
  ftlFt: number | null; capacityMcft: number; levelFt: number | null; storageMcft: number; pct: number;
  inflow: number | null; outflow: number | null; rainMm: number | null; lastYearMcft: number | null;
}
export interface LakeDay { date: string; rows: LakeRow[]; total: { capacityMcft: number; storageMcft: number; pct: number; lastYearMcft: number | null } }
interface Saved { days: Record<string, LakeDay>; todayFetchedAt: number; error: string | null }

declare global {
  // eslint-disable-next-line no-var
  var __lakes: { saved: Saved | null; loading: Promise<void> | null } | undefined;
}
const G = (global.__lakes ??= { saved: null, loading: null });

const num = (s: string) => {
  const v = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(v) && String(s).trim() !== "-" && String(s).trim() !== "" ? v : null;
};

/** The table of one day's page; null when the page has no table (a day not published yet). */
export function parseLakePage(html: string): LakeDay | null {
  const asOn = html.match(/Lake Storage As On\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!asOn) return null;
  const date = `${asOn[3]}-${asOn[2]}-${asOn[1]}`;
  const rows: LakeRow[] = [];
  let total: LakeDay["total"] | null = null;
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (tr.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? []).map((c) => c.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());
    if (cells.length < 10) continue;
    const key = cells[0].toUpperCase();
    if (key === "TOTAL") {
      const cap = num(cells[2]), st = num(cells[4]);
      if (cap && st != null) total = { capacityMcft: cap, storageMcft: st, pct: num(cells[5]) ?? Math.round((st / cap) * 1000) / 10, lastYearMcft: num(cells[9]) };
      continue;
    }
    const p = PLACES[key];
    const cap = num(cells[2]), st = num(cells[4]);
    if (!p || !cap || st == null) continue;
    rows.push({
      key, name: p.name, lat: p.lat, lon: p.lon, ftlFt: num(cells[1]), capacityMcft: cap, levelFt: num(cells[3]), storageMcft: st,
      pct: num(cells[5]) ?? Math.round((st / cap) * 1000) / 10, inflow: num(cells[6]), outflow: num(cells[7]), rainMm: num(cells[8]), lastYearMcft: num(cells[9])
    });
  }
  if (!rows.length) return null;
  if (!total) {
    const cap = rows.reduce((a, r) => a + r.capacityMcft, 0), st = rows.reduce((a, r) => a + r.storageMcft, 0);
    total = { capacityMcft: cap, storageMcft: st, pct: Math.round((st / cap) * 1000) / 10, lastYearMcft: null };
  }
  return { date, rows, total };
}

function load(): Saved {
  if (G.saved) return G.saved;
  try { G.saved = JSON.parse(fs.readFileSync(FILE, "utf8")) as Saved; } catch { G.saved = { days: {}, todayFetchedAt: 0, error: null }; }
  return G.saved!;
}
function save(s: Saved) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + ".tmp", JSON.stringify(s));
    fs.renameSync(FILE + ".tmp", FILE);
  } catch { /* kept in memory */ }
}

async function page(date?: string): Promise<LakeDay | null> {
  const url = date ? `${URL_BASE}?date=${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(0, 4)}` : URL_BASE;
  const r = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`CMWSSB lake level: HTTP ${r.status}`);
  return parseLakePage(await r.text());
}

/** Reads today's page (at most hourly) and any missing day of the last two weeks; never throws. */
async function refresh(today: string): Promise<void> {
  const s = load();
  try {
    if (Date.now() - s.todayFetchedAt > TODAY_EVERY_MS || !s.days[today]) {
      const d = await page();
      s.todayFetchedAt = Date.now();
      if (d) s.days[d.date] = d;
    }
    const t0 = Date.parse(today + "T00:00:00Z");
    for (let k = 1; k <= HISTORY_DAYS; k++) {
      const day = new Date(t0 - k * 864e5).toISOString().slice(0, 10);
      if (s.days[day]) continue;
      const d = await page(day).catch(() => null);
      if (d && d.date === day) s.days[day] = d;
    }
    // two weeks and a little more is all the console shows
    for (const k of Object.keys(s.days)) if (Date.parse(k) < t0 - (HISTORY_DAYS + 7) * 864e5) delete s.days[k];
    s.error = null;
  } catch (e) {
    s.error = (e as Error).message;
  }
  save(s);
}

export interface LakeStation { id: string; name: string; zone: null; lat: number; lon: number; times: string[]; series: number[];
  capacity: number; storage: number[]; levelFt: number | null; ftlFt: number | null; inflow: number | null; outflow: number | null; lastYear: number | null }
export interface Lakes { source: string; asOn: string | null; stations: LakeStation[]; total: LakeDay["total"] & { times: string[]; series: number[] } | null; error: string | null }

/**
 * The reservoirs for the console: one station per reservoir with its % full by day, and the six together
 * (storage over capacity, as CMWSSB totals them). `now` is the dashboard's clock (IST, "YYYY-MM-DD hh:mm:ss").
 * Waits for a refresh only when nothing is saved yet; otherwise answers at once and refreshes in the background.
 */
export async function cmwssbLakes(now: string, days = 10): Promise<Lakes | null> {
  const today = now.slice(0, 10);
  const s = load();
  const stale = Date.now() - s.todayFetchedAt > TODAY_EVERY_MS;
  if (stale || !s.days[today]) {
    G.loading ??= refresh(today).finally(() => { G.loading = null; });
    if (!Object.keys(s.days).length) await G.loading;
  }
  const dates = Object.keys(s.days).filter((d) => d <= today).sort().slice(-days);
  if (!dates.length) return null;
  const last = s.days[dates[dates.length - 1]];
  const stations: LakeStation[] = last.rows.map((r) => {
    const hist = dates.map((d) => s.days[d].rows.find((x) => x.key === r.key)).filter(Boolean) as LakeRow[];
    const at = dates.filter((d) => s.days[d].rows.some((x) => x.key === r.key));
    return { id: `CMWSSB-${r.key.replace(/\s+/g, "_")}`, name: r.name, zone: null, lat: r.lat, lon: r.lon, times: at, series: hist.map((h) => h.pct),
      capacity: r.capacityMcft, storage: hist.map((h) => h.storageMcft), levelFt: r.levelFt, ftlFt: r.ftlFt, inflow: r.inflow, outflow: r.outflow, lastYear: r.lastYearMcft };
  });
  return {
    source: URL_BASE, asOn: last.date, stations, error: s.error,
    total: { ...last.total, times: dates, series: dates.map((d) => s.days[d].total.pct) }
  };
}
