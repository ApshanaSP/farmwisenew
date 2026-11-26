/**
 * What was on the page today stays on it until the day rolls over (26 Nov 2026, the owner: items were there, and a few minutes later were not).
 * A new build, or the ten-minute refresh, can drop an article from the news list without the article having changed: its labels flip (is it
 * district news, its category, the outlet's tier), the incident it was linked to is drawn again, its story is regrouped so that it follows
 * another report's verdict, or it is missing from one build. So the reports listed during the day are written down (by their address), and one
 * that is missing from the next answer is looked up:
 *
 *   - the news desk has since read it as none of the Collector's business: it is in "Left out", with its reason (a correction, shown);
 *   - it was given a date before today, or its headline became a listing: let go (a correction);
 *   - it is gone from the store in two builds running: let go (withdrawn);
 *   - otherwise it stays where it was listed.
 *
 * Kept in data/aws-cache/news-day.json, by the desk's day (lib/period/day.ts). No model and no database here.
 */
import fs from "fs";
import path from "path";
import { reportKey } from "@/lib/collector/differbook";
import { dayKey, dayWindow, istClock } from "@/lib/period/day";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Side = "kept" | "left";
interface Entry { side: Side; row: Row; /** the build it was first missing from */ missing?: string | null }
interface Day { day: string; items: Map<string, Entry>; saving: ReturnType<typeof setTimeout> | null }

const V = 1;
const FILE = () => process.env.NEWS_DAY_FILE || (process.env.VITEST ? null : path.join(process.cwd(), "data", "aws-cache", "news-day.json"));
declare global {
  // eslint-disable-next-line no-var
  var __newsDay: Day | undefined;
}
function day(key: string): Day {
  if (!global.__newsDay) {
    const items = new Map<string, Entry>();
    let was = "";
    try {
      const f = FILE(), j = f ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
      if (j?.v === V) { was = String(j.day); for (const [k, e] of j.items as [string, Entry][]) items.set(k, e); }
    } catch { /* none yet */ }
    global.__newsDay = { day: was, items, saving: null };
  }
  const d = global.__newsDay;
  if (d.day !== key) { d.day = key; d.items.clear(); }
  return d;
}
/** tests */
export function clearDayNews(): void { global.__newsDay = { day: "", items: new Map(), saving: null }; }

function save(d: Day): void {
  const f = FILE();
  if (!f || d.saving) return;
  d.saving = setTimeout(() => {
    d.saving = null;
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(`${f}.tmp`, JSON.stringify({ v: V, day: d.day, items: [...d.items.entries()] }));
      fs.renameSync(`${f}.tmp`, f);
    } catch (e) { console.warn("[news] the day's list not saved:", (e as Error).message); }
  }, 2000);
  d.saving.unref?.();
}

export const newsKey = (r: Row): string => reportKey(r.url, String(r.doc_id));

export interface DayLook {
  /** the reports as the store has them now, whatever their labels (by id or address) */
  find: (ids: string[], urls: string[]) => Promise<Row[]>;
  /** what the news desk says of a report: skip, act, know, or null when it has not read it */
  verdict: (r: Row) => "act" | "know" | "skip" | null;
  /** a headline that is a daily listing or round-up, never shown */
  listing: (r: Row) => boolean;
  build: () => Promise<string>;
}

/**
 * The lists with the day's own reports put back, and the day's record brought up to date. `from` is where the asked window begins: a longer
 * period holds today too.
 */
export async function keepDay(lists: { kept: Row[]; left: Row[] }, now: string, from: string, look: DayLook): Promise<{ kept: Row[]; left: Row[] }> {
  const key = dayKey(now);
  // (only for the day it is: a probe or a report of another day reads the store as it is)
  if (!process.env.VITEST && key !== dayKey(istClock())) return lists;
  const start = dayWindow(now).from;
  const d = day(key);
  const here = new Map<string, Side>();
  for (const r of lists.left) here.set(newsKey(r), "left");
  for (const r of lists.kept) here.set(newsKey(r), "kept");
  const gone = [...d.items.entries()].filter(([k, e]) => !here.has(k) && String(e.row.t) <= now);
  let changed = false;
  if (gone.length) {
    const fresh = new Map<string, Row>();
    for (const r of await look.find(gone.map(([, e]) => String(e.row.doc_id)), gone.map(([, e]) => e.row.url).filter(Boolean).map(String))) if (!fresh.has(newsKey(r))) fresh.set(newsKey(r), r);
    const build = await look.build();
    for (const [k, e] of gone) {
      const r = fresh.get(k);
      if (!r) {
        if (e.missing != null && e.missing !== build) { d.items.delete(k); changed = true; continue; }
        if (e.missing == null) { e.missing = build; changed = true; }
        // (the incident it was linked to may not be in this build)
        lists[e.side].push({ ...e.row, linked_incident_id: null });
        continue;
      }
      if (String(r.t) < start || look.listing(r)) { d.items.delete(k); changed = true; continue; }
      const v = look.verdict(r);
      const side: Side = v === "skip" ? "left" : v ? "kept" : e.side;
      lists[side].push(r);
      here.set(k, side);
    }
    const newest = (a: Row, b: Row) => String(b.t).localeCompare(String(a.t)) || String(a.doc_id).localeCompare(String(b.doc_id));
    lists.kept.sort(newest);
    lists.left.sort(newest);
  }
  if (from <= start) for (const side of ["left", "kept"] as const) for (const r of lists[side]) {
    if (String(r.t) < start) continue;
    const k = newsKey(r), had = d.items.get(k);
    if (had && had.side === side && had.row.doc_id === r.doc_id && (had.missing == null || !here.has(k))) continue;
    d.items.set(k, { side, row: r, missing: here.has(k) ? null : had?.missing ?? null });
    changed = true;
  }
  if (changed) save(d);
  return lists;
}

// ---------------------------------------------------------------- stories --

/**
 * The developing stories listed today that the newest list has not got: the model picks them again from all the news whenever one report
 * joins, and may leave one out that nothing has happened to. `docs` names a story's reports; a story any of whose reports is in the new list
 * is that list's (it was joined with another, or goes on). `record` false (the rules' list, while no model answers): the day's are put back, the
 * list's own are not written down.
 */
export interface StoryDay<T> { day: string; items: Map<string, T> }
export function keepStories<T extends { id: string; last: string }>(bag: StoryDay<T> | undefined, list: T[], docs: (s: T) => string[], now: string, record = true): { bag: StoryDay<T>; list: T[]; changed: boolean } {
  const key = dayKey(now), start = dayWindow(now).from;
  const b: StoryDay<T> = bag && bag.day === key ? bag : { day: key, items: new Map() };
  const have = new Set(list.flatMap(docs));
  const back = [...b.items.values()].filter((s) => !docs(s).some((x) => have.has(x)) && s.last <= now);
  let changed = b !== bag;
  if (record) {
    for (const [k, s] of b.items) if (docs(s).some((x) => have.has(x)) && !list.includes(s)) { b.items.delete(k); changed = true; }
    for (const s of list) if (s.last >= start && b.items.get(s.id) !== s) { b.items.set(s.id, s); changed = true; }
  }
  return { bag: b, list: back.length ? [...list, ...back] : list, changed };
}
