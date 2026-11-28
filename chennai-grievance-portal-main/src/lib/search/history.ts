/**
 * The search box over the whole record (28 Nov 2026, the owner: "in the search bar on the website, I couldn't search news for the past days
 * ... air quality, vegetable prices, reservoir gauges: those data are only live for that day ... if I search for some news that was reported
 * 52 days ago, I couldn't find it").
 *
 * Why it found only today: the box took the four newest headlines that had the words (an older report was pushed out by today's), it read a
 * date in the search ("52 days ago", "3 October") as words a headline had to contain (so it found nothing), and it searched no readings at
 * all. Now one search:
 *
 *   1. reads the time it names (when.ts, the product's one reader of time words: lib/period/read.ts) and takes it out of the words;
 *   2. reads what it asks for (intent.ts): air quality, market prices, reservoirs, rain, river gauges, or news only;
 *   3. looks in every record the store and the caches hold, inside those dates when there are any:
 *        incidents   intel.search (every word, any order), first reported in the dates
 *        news        every stored report (news.ts), ranked by the words in the headline, then newest; one row per story
 *        readings    values.ts: CPCB AQI, Uzhavar Sandhai prices, CMWSSB reservoirs, IMD and CFM-DSS rain, CFM-DSS river gauges
 *
 * The officer's search (officerSearch) is locked to the department: its own grievances, news filed into its own cases, and only the readings
 * its console uses (lib/officer/insights.ts MODULES).
 */
import pool from "@/lib/collector/db";
import { asOf, search as intelSearch } from "@/lib/collector/intel";
import { uniqueDatasets } from "@/lib/assistant/studiolink";
import type { When } from "@/lib/search/when";
import { KIND_WORD, kindsForModules, readQuery } from "@/lib/search/query";
import { newsHistory, type NewsHit } from "@/lib/search/news";
import { valueHits, type ValueHit } from "@/lib/search/values";
import "@/lib/search/hooks";

export { MODULE_KINDS, kindsForModules, readQuery, type SearchQuery } from "@/lib/search/query";

const dayText = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/**
 * A dated search that found no incident and no news says what the record holds ("News is held from 23 Oct 2025 to 28 Nov 2026"), so an
 * empty answer is never read as "nothing happened". `dept`: the department's own incidents.
 */
async function heldNote(when: When, dept: string | null = null): Promise<string> {
  const q = async (sql: string, p: unknown[] = []) => ((await pool.query(sql, p)) as unknown as [Row[]])[0]?.[0] ?? {};
  const [n, i] = await Promise.all([
    q(`SELECT DATE_FORMAT(MIN(published_at), '%Y-%m-%d') AS a, DATE_FORMAT(MAX(published_at), '%Y-%m-%d') AS b FROM documents WHERE COALESCE(source_kind, 'news') = 'news'`).catch(() => ({} as Row)),
    q(`SELECT DATE_FORMAT(MIN(first_reported_at), '%Y-%m-%d') AS a, DATE_FORMAT(MAX(first_reported_at), '%Y-%m-%d') AS b FROM incidents${dept ? " WHERE lead_dept = ?" : ""}`, dept ? [dept] : []).catch(() => ({} as Row))
  ]);
  const span = (r: Row) => (r.a && r.b ? `${dayText(String(r.a))} to ${dayText(String(r.b))}` : "no dates");
  return `Nothing was found for ${when.label}. News is held from ${span(n)}; ${dept ? "the department's grievances" : "incidents"} from ${span(i)}.`;
}

/** The dates of a search as the box shows them. */
export interface WhenOut { label: string; from: string; to: string; day: string | null; partial: boolean }
const whenOut = (w: When | null): WhenOut | null => (w ? { label: w.label, from: w.from, to: w.to, day: w.day, partial: w.partial } : null);

// ------------------------------------------------------------------ the Collector --

type Row = Record<string, any>;
const NONE = { zones: [] as Row[], depts: [] as Row[], incidents: [] as Row[], incidentsTotal: 0, news: [] as Row[], sources: [] as Row[], complaints: [] as Row[] };

/** The Collector's search: the whole district, any date (or the dates it names). */
export async function collectorSearch(text: string, o: { now?: string } = {}) {
  const now = o.now ?? (await asOf());
  const q = readQuery(text, now);
  const it = q.intent;
  const subject = it.text;
  // a search of readings alone ("AQI Alandur 3 October") still looks for incidents and news with its words; a date alone lists that day's
  const skipInc = it.newsOnly || (!subject && !q.when);
  const [found, news, values] = await Promise.all([
    skipInc ? Promise.resolve(NONE) : intelSearch(subject, { from: q.when?.from ?? null, to: q.when?.to ?? null, news: false }),
    newsHistory(subject, q.when, { limit: 6 }),
    valueHits(it, q.topic, q.when, now)
  ]);
  const t = subject.toLowerCase();
  const datasets = t.length >= 2 ? uniqueDatasets().filter((d) => d.name.toLowerCase().includes(t)).slice(0, 3).map((d) => ({ id: d.id, name: d.name, rows: d.rows })) : [];
  // zones, departments and sources are found by their names: a search of a date alone names none
  const named = !!subject;
  const notes = [...values.notes];
  if (q.when && !found.incidents.length && !news.items.length && !values.hits.length) notes.unshift(await heldNote(q.when));
  return {
    zones: named ? found.zones : [], depts: named ? found.depts : [], sources: named ? found.sources : [], complaints: found.complaints,
    incidents: found.incidents, incidentsTotal: Number(found.incidentsTotal ?? found.incidents.length),
    news: news.items, newsTotal: news.total, newsMore: news.more, newsRest: news.rest,
    values: values.hits, notes,
    datasets,
    when: whenOut(q.when), unread: q.unread, topic: subject, now
  };
}
export type CollectorSearch = Awaited<ReturnType<typeof collectorSearch>>;

// ------------------------------------------------------------------ the officer --

export interface OfficerDeps {
  /** the department's grievances with the words, of the last 90 days (lib/officer/data.ts search) */
  recent: (text: string) => Promise<Row[]>;
  /** the department's grievances with the words (none: every one) first reported in from..to, resolved ones too */
  inRange: (text: string | null, from: string, to: string) => Promise<Row[]>;
}

/**
 * The officer's search, locked to the department: its grievances (the last 90 days, or the dates the search names), the news filed into its
 * own cases, and the readings its console uses (`modules`, MODULES of insights.ts). Readings of another kind are named in the notes, not shown.
 */
export async function officerSearch(dept: { code: string; short: string }, modules: readonly string[], text: string, deps: OfficerDeps, o: { now?: string } = {}) {
  const now = o.now ?? (await asOf());
  const q = readQuery(text, now);
  const it = q.intent;
  const subject = it.text;
  const mine = kindsForModules(modules);
  const kinds = it.kinds.filter((k) => mine.includes(k));
  const withheld = it.kinds.filter((k) => !mine.includes(k));
  const rows = it.newsOnly || (!subject && !q.when) ? Promise.resolve([] as Row[])
    : q.when ? deps.inRange(subject || null, q.when.from, q.when.to) : deps.recent(subject);
  const [list, news, values] = await Promise.all([
    rows,
    newsHistory(subject, q.when, { limit: 4, dept: dept.code }),
    kinds.length ? valueHits(it, q.topic, q.when, now, kinds) : Promise.resolve({ hits: [] as ValueHit[], notes: [] as string[] })
  ]);
  const notes = [...values.notes, ...withheld.map((k) => `${KIND_WORD[k]} readings are not part of the ${dept.short} console.`)];
  if (q.when && !list.length && !news.items.length && !values.hits.length && !withheld.length) notes.unshift(await heldNote(q.when, dept.code));
  return { rows: list, news: news.items, newsTotal: news.total, values: values.hits, notes, when: whenOut(q.when), unread: q.unread, topic: subject, now };
}
export type OfficerSearch = Awaited<ReturnType<typeof officerSearch>>;

export type { NewsHit, ValueHit, When };
