/**
 * Every day of Chennai Metro Water's reservoir figures this copy has read, kept for good (28 Nov 2026: "reservoir gauges ... are only live
 * for that day. I couldn't search them for the past days").
 *
 * lakes.ts reads CMWSSB's public page (https://cmwssb.tn.gov.in/lake-level, "Lake Storage As On dd/mm/yyyy") and keeps only about three
 * weeks of it in data/aws-cache/cmwssb-lakes.json, which is all the console's cards draw. This file keeps every day it ever held, in
 * data/aws-cache/cmwssb-lakes-history.json: the build step (hooks.ts) copies new days across every hour, and backfillLakes() reads older
 * days from the same page (?date=dd-mm-yyyy; robots.txt allows /lake-level), one at a time with a gap. A day the page has not published
 * is left out, never filled in. Nothing here writes to the store.
 */
import fs from "fs";
import path from "path";
import { oncePerLake, parseLakePage, type LakeDay } from "@/lib/collector/lakes";

export const LAKE_PAGE = "https://cmwssb.tn.gov.in/lake-level";
export const LAKE_SOURCE = "Chennai Metro Water (CMWSSB) daily lake level";
const UA = "DistrictIQ/1.0 (Chennai Collector dashboard; reads the public lake level page)";

/** the file lakes.ts keeps (about three weeks) and the file kept here (every day); none under a unit test unless set */
const liveFile = (): string | null => process.env.CMWSSB_LAKES_FILE || (process.env.VITEST ? null : path.join(process.cwd(), "data", "aws-cache", "cmwssb-lakes.json"));
const historyFile = (): string | null => process.env.CMWSSB_HISTORY_FILE || (process.env.VITEST ? null : path.join(process.cwd(), "data", "aws-cache", "cmwssb-lakes-history.json"));

interface History { v: 1; source: string; url: string; days: Record<string, LakeDay> }
declare global {
  // eslint-disable-next-line no-var
  var __lakeHistory: { hist: History | null; histMtime: number; live: Record<string, LakeDay> | null; liveMtime: number } | undefined;
}
const G = (global.__lakeHistory ??= { hist: null, histMtime: 0, live: null, liveMtime: 0 });

const mtimeOf = (f: string | null): number => { try { return f ? fs.statSync(f).mtimeMs : 0; } catch { return 0; } };
const blank = (): History => ({ v: 1, source: LAKE_SOURCE, url: LAKE_PAGE, days: {} });
/** a saved day as lakes.ts writes it: a date and at least one reservoir with its storage */
const isDay = (d: unknown): d is LakeDay => !!d && typeof d === "object" && /^\d{4}-\d{2}-\d{2}$/.test(String((d as LakeDay).date)) &&
  Array.isArray((d as LakeDay).rows) && (d as LakeDay).rows.length > 0;

function history(): History {
  const f = historyFile();
  const m = mtimeOf(f);
  if (!G.hist || (m && m !== G.histMtime)) {
    let h: History | null = null;
    try { h = f && m ? (JSON.parse(fs.readFileSync(f, "utf8")) as History) : null; } catch { h = null; }
    G.hist = h && typeof h.days === "object" ? h : G.hist ?? blank();
    G.histMtime = m;
  }
  return G.hist!;
}
function live(): Record<string, LakeDay> {
  const f = liveFile();
  const m = mtimeOf(f);
  if (!G.live || (m && m !== G.liveMtime)) {
    let days: Record<string, LakeDay> = {};
    try { days = f && m ? ((JSON.parse(fs.readFileSync(f, "utf8")) as { days?: Record<string, LakeDay> }).days ?? {}) : {}; } catch { days = {}; }
    G.live = days;
    G.liveMtime = m;
  }
  return G.live!;
}
function save(h: History): void {
  G.hist = h;
  const f = historyFile();
  if (!f) return;
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f + ".tmp", JSON.stringify(h));
    fs.renameSync(f + ".tmp", f);
    G.histMtime = mtimeOf(f);
  } catch (e) {
    console.warn(`[lakehistory] could not save the reservoir history (kept in memory): ${(e as Error).message}`);
  }
}

/** Every day held: the kept history with the days lakes.ts holds now laid over it (each reservoir once a day). */
export function lakeDays(): Record<string, LakeDay> {
  const out: Record<string, LakeDay> = {};
  for (const [k, d] of Object.entries(history().days)) if (isDay(d)) out[k] = oncePerLake(d);
  for (const [k, d] of Object.entries(live())) if (isDay(d) && d.date === k) out[k] = oncePerLake(d);
  return out;
}

/** Copies the days lakes.ts holds now into the kept history (the hourly build step); returns how many were new or changed. */
export function keepLakeHistory(): number {
  const h = history();
  let n = 0;
  for (const [k, d] of Object.entries(live())) {
    if (!isDay(d) || d.date !== k) continue;
    const day = oncePerLake(d);
    if (JSON.stringify(h.days[k]) === JSON.stringify(day)) continue;
    h.days[k] = day;
    n++;
  }
  if (n) save(h);
  return n;
}

/** for tests: forget what was read */
export function forgetLakeHistory(): void { G.hist = null; G.histMtime = 0; G.live = null; G.liveMtime = 0; }

type Fetcher = (day: string) => Promise<LakeDay | null>;
const ddmmyyyy = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** One earlier day of CMWSSB's page (null: no table for that day). Throws on an HTTP error or a timeout. */
export async function fetchLakeDay(day: string): Promise<LakeDay | null> {
  const r = await fetch(`${LAKE_PAGE}?date=${ddmmyyyy(day)}`, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseLakePage(await r.text());
}

/**
 * Reads the days of from..to ("YYYY-MM-DD", inclusive) the history lacks, one at a time with `gapMs` between, and keeps each that the page
 * has for that date (a page that answers with another day's table is not kept). Stops after three failures in a row. Never throws.
 */
export async function backfillLakes(from: string, to: string, o: { gapMs?: number; fetcher?: Fetcher; log?: (t: string) => void } = {}) {
  const get = o.fetcher ?? fetchLakeDay;
  const gap = o.gapMs ?? 2000;
  const h = history();
  const run = { asked: 0, added: 0, none: [] as string[], errors: [] as string[] };
  let fails = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isDay(h.days[d])) continue;
    if (run.asked) await new Promise((r) => setTimeout(r, gap));
    run.asked++;
    try {
      const got = await get(d);
      fails = 0;
      if (got && got.date === d) { h.days[d] = oncePerLake(got); run.added++; o.log?.(`${d}: ${got.rows.length} reservoirs`); }
      else { run.none.push(d); o.log?.(`${d}: no table for this day`); }
      if (run.added && run.added % 10 === 0) save(h);
    } catch (e) {
      run.errors.push(`${d}: ${(e as Error).message}`);
      o.log?.(`${d}: FAILED ${(e as Error).message}`);
      if (++fails >= 3) break;
    }
  }
  if (run.added) save(h);
  return run;
}
