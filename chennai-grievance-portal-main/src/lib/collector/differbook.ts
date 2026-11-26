/**
 * The day's found differences ("Reports differ"), kept (26 Nov 2026, the owner: "I saw the Differ one a few minutes before, and after a few
 * minutes I didn't see the Differ again"). The check itself cannot be asked afresh on every load and give one answer: the grouping of the
 * news changes with every article that arrives, the model reads another set of reports each time an outlet joins a story and may word or
 * even judge it otherwise, and it is sometimes busy. So a difference, once found, is written here and stays:
 *
 *   - kept by the calendar day and by the pair of reports (their addresses, else their ids), never by a story or incident id, which every
 *     build draws again; the story and the incident it belongs to are looked up again on each read;
 *   - listed until its reports leave the window (Daily: until the day rolls over, lib/period/day.ts), whatever the grouping, the model or
 *     a new build does in the meantime;
 *   - when its reports themselves say the same thing later (an outlet corrected its report, or published a newer one with the other's
 *     figure, or withdrew it), it is not taken away: it says "resolved at 2:20 PM: the reports now agree";
 *   - in one order: the largest gap first, then the newest, then the key.
 *
 * Saved in data/aws-cache/differ-book.json, so a restart keeps it. Pure apart from that file: no database, no model.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Difference, Report } from "@/lib/collector/conflicts";

export interface BookReport { key: string; id: string; url: string | null; publisher: string; t: string }
export interface BookItem {
  /** day | field | the reports' keys */
  key: string;
  /** the story's row on the list: differences of one story when found share it, and it never changes */
  group: string;
  /** IST: when it was first listed */
  foundAt: string;
  /** the story as it was when found, shown when no story on the page holds its reports any more */
  title: string; docIds: string[]; urls: string[]; incident: string | null; outlets: number;
  diff: Difference;
  /** the report behind each claim, in the claims' order */
  reports: BookReport[];
  /** the build a report was first missing from; withdrawn when the next build has not got it either */
  missing?: string | null;
  resolved?: { at: string; why: "agree" | "withdrawn" } | null;
}

const V = 1;
const KEEP = 800;
const KEEP_DAYS = 95;
// unit tests keep it in memory only; a live probe names its own file
const FILE = () => process.env.DIFFER_BOOK_FILE || (process.env.VITEST ? null : path.join(process.cwd(), "data", "aws-cache", "differ-book.json"));

declare global {
  // eslint-disable-next-line no-var
  var __differBook: { items: Map<string, BookItem>; version: number; saving: ReturnType<typeof setTimeout> | null } | undefined;
}
function book() {
  if (global.__differBook) return global.__differBook;
  const items = new Map<string, BookItem>();
  try {
    const f = FILE();
    const j = f ? (JSON.parse(fs.readFileSync(f, "utf8")) as { v?: number; items?: BookItem[] }) : null;
    if (j?.v === V) for (const x of j.items ?? []) if (x?.key && Array.isArray(x.reports) && x.diff?.claims?.length) items.set(x.key, x);
  } catch { /* none yet */ }
  return (global.__differBook = { items, version: 0, saving: null });
}
/** Moves whenever the book changes: part of any key a list read from it is kept under. */
export const bookVersion = (): number => book().version;
export const bookItems = (): BookItem[] => [...book().items.values()];
/** tests */
export function clearBook(): void { global.__differBook = { items: new Map(), version: (global.__differBook?.version ?? 0) + 1, saving: null }; }

function changed(): void {
  const b = book();
  b.version++;
  const f = FILE();
  if (!f || b.saving) return;
  b.saving = setTimeout(() => {
    b.saving = null;
    const since = new Date(Date.now() - KEEP_DAYS * 864e5 + 330 * 60_000).toISOString().slice(0, 10);
    const keep = [...b.items.values()].filter((x) => x.foundAt.slice(0, 10) >= since).sort((x, y) => y.foundAt.localeCompare(x.foundAt)).slice(0, KEEP);
    b.items = new Map(keep.map((x) => [x.key, x]));
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(`${f}.tmp`, JSON.stringify({ v: V, items: keep }));
      fs.renameSync(`${f}.tmp`, f);
    } catch (e) { console.warn("[differ] the day's differences not saved:", (e as Error).message); }
  }, 500);
  b.saving.unref?.();
}

// ------------------------------------------------------------------- keys --

/** A report by its address (however it is written), else by its id: the same report in two builds. */
export function reportKey(url: string | null | undefined, id: string): string {
  const u = String(url ?? "").trim();
  if (!/^https?:\/\//i.test(u)) return `id:${id}`;
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|amp$)/i.test(k)) x.searchParams.delete(k);
    const q = x.searchParams.toString();
    return `${x.hostname.replace(/^(www|m|amp)\./i, "").toLowerCase()}${x.pathname.replace(/\/(amp\/?)?$/i, "")}${q ? `?${q}` : ""}`;
  } catch { return `id:${id}`; }
}
const hash = (s: string) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
/** What a report says, as the checks read it: a verdict is kept by this, so a build that gives the same text another id keeps it. */
export const textHash = (r: Pick<Report, "publisher" | "head" | "original" | "summary" | "lead">): string =>
  hash([r.publisher, r.head, r.original ?? "", r.summary.slice(0, 240), r.lead.replace(/\s+/g, " ").slice(0, 480)].join("\n").toLowerCase());
const refKey = (r: Pick<Report, "id" | "url">) => reportKey(r.url, r.id);
const fieldKey = (f: string) => f.trim().toLowerCase();

/** The size of a difference: between the largest and the smallest figure the claims state (none, or dates and names: 0). */
export function gapOf(d: Pick<Difference, "field" | "claims">): number {
  if (/date|time|name|place/i.test(d.field)) return 0;
  const v = d.claims.map((c) => {
    const m = c.says.replace(/,(?=\d)/g, "").match(/\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : WORD[(c.says.toLowerCase().match(/[a-z]+/g) ?? []).find((w) => WORD[w] != null) ?? ""] ?? NaN;
  }).filter((n) => Number.isFinite(n));
  return v.length >= 2 ? Math.max(...v) - Math.min(...v) : 0;
}
const WORD: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, twenty: 20 };

// ------------------------------------------------------------------ finding --

export interface FoundStory { title: string; docIds: string[]; incident: string | null; outlets: number }

/** Writes a story's differences into the book. Returns how many are new. The same pair of reports on the same fact is one entry, and stays as first found. */
export function found(story: FoundStory, diffs: Difference[], reports: Map<string, Report>, now: string): number {
  const b = book();
  let n = 0;
  for (const d of diffs) {
    const rs = d.claims.map((c) => {
      const r = reports.get(c.docId);
      return { key: r ? refKey(r) : `id:${c.docId}`, id: c.docId, url: r?.url ?? null, publisher: c.publisher, t: c.t };
    });
    const keys = [...new Set(rs.map((r) => r.key))].sort();
    if (keys.length < 2) continue;
    const day = rs.map((r) => r.t).sort()[0].slice(0, 10);
    const same = [...b.items.values()].find((x) => fieldKey(x.diff.field) === fieldKey(d.field) && x.reports.filter((r) => keys.includes(r.key)).length >= 2);
    if (same) continue;
    const key = `${day}|${fieldKey(d.field)}|${hash(keys.join(" "))}`;
    const urls = story.docIds.map((id) => reports.get(id)).filter((r): r is Report => !!r).map(refKey);
    // a story already on the list (it holds a report of one of its differences) keeps its row
    const group = [...b.items.values()].find((x) => x.reports.some((r) => keys.includes(r.key)))?.group ?? `D-${hash(key)}`;
    b.items.set(key, { key, group, foundAt: now, title: story.title, docIds: story.docIds.slice(0, 60), urls: [...new Set([...urls, ...keys])].slice(0, 60), incident: story.incident,
      outlets: story.outlets, diff: { ...d }, reports: rs, missing: null, resolved: null });
    n++;
  }
  if (n) changed();
  return n;
}

// --------------------------------------------------------------- resolution --

const clock = (t: string) => { const h = Number(t.slice(11, 13)); return `${h % 12 || 12}:${t.slice(14, 16)} ${h < 12 ? "AM" : "PM"}`; };
/** "resolved at 2:20 PM: the reports now agree" */
export const resolvedText = (r: NonNullable<BookItem["resolved"]>): string =>
  `resolved at ${clock(r.at)}: ${r.why === "agree" ? "the reports now agree" : "a report was withdrawn"}`;

export interface Holds {
  /** a claim is in this report's text */
  claim: (says: string, r: Report) => boolean;
  /** the claims still differ (two outlets, two answers) */
  differ: (claims: { publisher: string; says: string }[], field: string) => boolean;
  /** the count a report states for a field, when it states one */
  count: (field: string, r: Report) => { v: number; says: string } | null;
}

/**
 * Looks at the entries' reports as they are now (`byKey`: this build's reports by reportKey; `story`: the other reports of the story it is in)
 * and marks the ones whose reports agree. Only on evidence in the reports: an unreadable or re-worded text, a regrouped story, a model that now
 * says otherwise or does not answer take nothing away. A report that is gone counts as withdrawn only when a second build has not got it.
 */
export function settle(items: BookItem[], byKey: Map<string, Report>, storyOf: (x: BookItem) => Report[], h: Holds, now: string, build: string): void {
  let touched = false;
  for (const x of items) {
    const gone = x.reports.filter((r) => !byKey.has(r.key));
    if (gone.length) {
      if (x.resolved) continue;
      if (!x.missing) { x.missing = build; touched = true; continue; }
      if (x.missing === build) continue;
      const left = x.diff.claims.filter((_, k) => byKey.has(x.reports[k].key));
      if (left.length >= 2 && h.differ(left, x.diff.field)) continue;
      x.resolved = { at: now, why: "withdrawn" };
      touched = true;
      continue;
    }
    if (x.missing) { x.missing = null; touched = true; }
    // a report that came back (a build had lost it) was never withdrawn
    if (x.resolved?.why === "withdrawn") { x.resolved = null; touched = true; }
    if (x.resolved) continue;
    const others = storyOf(x);
    const says = x.diff.claims.map((c, k) => {
      const r = byKey.get(x.reports[k].key)!;
      // the outlet's own newer report of the story, when it states the fact as a count
      const newer = others.filter((o) => o.publisher === c.publisher && o.t > c.t).sort((a, b) => b.t.localeCompare(a.t)).map((o) => h.count(x.diff.field, o)).find(Boolean);
      if (newer) return newer.says;
      if (h.claim(c.says, r)) return c.says;
      // its text changed: it counts as corrected only when it now says what another of them says
      const now2 = x.diff.claims.find((o, j) => j !== k && o.says !== c.says && h.claim(o.says, r));
      return now2 ? now2.says : c.says;
    });
    if (says.every((s, k) => s === x.diff.claims[k].says)) continue;
    if (!h.differ(x.diff.claims.map((c, k) => ({ publisher: c.publisher, says: says[k] })), x.diff.field)) { x.resolved = { at: now, why: "agree" }; touched = true; }
  }
  if (touched) changed();
}

// --------------------------------------------------------------- the list --

const oldest = (x: BookItem) => x.reports.map((r) => r.t).sort()[0] ?? "";
const newest = (x: BookItem) => x.reports.map((r) => r.t).sort().slice(-1)[0] ?? "";

/** The differences whose reports are all inside the window, in the list's one order: the largest gap first, then the newest, then the key; settled ones last. */
export function listed(from: string, to: string): BookItem[] {
  return bookItems().filter((x) => oldest(x) >= from && newest(x) <= to)
    .sort((a, b) => Number(!!a.resolved) - Number(!!b.resolved) || gapOf(b.diff) - gapOf(a.diff) || newest(b).localeCompare(newest(a)) || a.key.localeCompare(b.key));
}
/** The differences any of these reports are part of, whatever the window (the incident pop-up, the news preview). */
export function about(ids: Iterable<string>, keys: Iterable<string>): BookItem[] {
  const i = new Set(ids), k = new Set(keys);
  return bookItems().filter((x) => x.reports.some((r) => i.has(r.id) || k.has(r.key)))
    .sort((a, b) => gapOf(b.diff) - gapOf(a.diff) || newest(b).localeCompare(newest(a)) || a.key.localeCompare(b.key));
}

/** An entry as the page shows it: with its "resolved" line, and the claims on this build's report ids. */
export function shown(x: BookItem, byKey?: Map<string, Report>): Difference {
  return { ...x.diff, claims: x.diff.claims.map((c, k) => ({ ...c, docId: byKey?.get(x.reports[k].key)?.id ?? c.docId })), resolved: x.resolved ? resolvedText(x.resolved) : null };
}
