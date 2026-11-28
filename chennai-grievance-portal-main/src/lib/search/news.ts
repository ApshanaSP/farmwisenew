/**
 * News in the search box, over every report the store holds (28 Nov 2026). The search used to take the four newest headlines that had the
 * words, so a report of 52 days ago was pushed out by today's; and a date in the search ("52 days ago", "3 October") was read as words
 * the headline had to contain, so it found nothing at all.
 *
 * Now: every word of the subject (searchwords.ts: any order, by stem and synonyms) in the headline, its English translation (a Tamil
 * report), or the place it is about; inside the dates the search names, if any. Ranked by how many of the words are in the headline, then
 * newest first. One row per story (a story is one event's reports from every outlet), with all its reports, so the news preview opens it
 * whole. Official news media only (newsmedia.ts), as the preview shows. When the headlines give fewer than three stories, the reports'
 * own text is read too. A search with a date and no subject lists that day's news, the most-covered stories first.
 */
import pool from "@/lib/collector/db";
import { searchGroups } from "@/lib/collector/searchwords";
import { isNewsMedia } from "@/lib/collector/newsmedia";
import { redactText } from "@/lib/thunai/privacy";
import type { When } from "@/lib/search/when";

type Row = Record<string, any>;
async function q(sql: string, params: unknown[] = []): Promise<Row[]> {
  const [r] = await pool.query(sql, params);
  return r as unknown as Row[];
}

export interface NewsHit {
  /** the story's best report: its id, headline (the outlet's language), English headline of a Tamil report, outlet, link, time (IST) */
  id: string; title: string; titleEn: string | null; lang: string | null; publisher: string | null; url: string | null; t: string;
  /** the incident it is filed into, if any */ incident: string | null;
  place: string | null;
  /** the story's reports (for the news preview) and how many news outlets carried it */
  story: string | null; docIds: string[]; outlets: number;
}
/** a story past the ones shown, for the list of every match (headline, outlet, link, time) */
export interface NewsRest { id: string; title: string; titleEn: string | null; publisher: string | null; url: string | null; t: string; incident: string | null }
export interface NewsFound { items: NewsHit[]; total: number; more: boolean; rest: NewsRest[] }

const CANDIDATES = 400;

/** The search's news. `text`: the subject (no time words). `dept`: only reports filed into that department's incidents (the officer lock). */
export async function newsHistory(text: string, when: When | null, o: { limit?: number; dept?: string | null } = {}): Promise<NewsFound> {
  const limit = Math.max(1, Math.min(20, o.limit ?? 6));
  const groups = String(text ?? "").trim() ? searchGroups(text) : [];
  if (!groups.length && !when) return { items: [], total: 0, more: false, rest: [] };
  const base: string[] = ["COALESCE(d.source_kind, 'news') = 'news'"];
  const bp: unknown[] = [];
  if (when) { base.push("d.published_at >= ? AND d.published_at < ?"); bp.push(when.from, when.to); }
  if (o.dept) { base.push("d.linked_incident_id IN (SELECT i.incident_id FROM incidents i WHERE i.lead_dept = ?)"); bp.push(o.dept); }
  // the headline, its English translation, the place it is about
  const cols = ["d.title", "d.title_en", "d.place_text"];
  const like = (g: string[], cs: string[]) => `(${g.flatMap(() => cs.map((c) => `${c} LIKE ?`)).join(" OR ")})`;
  const likeP = (g: string[], cs: string[]) => g.flatMap((x) => cs.map(() => `%${x}%`));
  const head = groups.length ? groups.map((g) => `(CASE WHEN ${like(g, ["d.title", "d.title_en"])} THEN 1 ELSE 0 END)`).join(" + ") : "0";
  const headP = groups.flatMap((g) => likeP(g, ["d.title", "d.title_en"]));
  // the candidates are read narrow (id, story, outlet, rank) and only the reports shown are read whole: a word in most headlines ("chennai")
  // sorted 20,000 wide rows (245 ms on the 28 Nov build; 23,000 reports)
  const narrow = (score: string) => `SELECT d.doc_id AS id, d.story_id AS story, d.publisher, d.publisher_domain AS domain, d.publisher_tier AS tier, ${score} AS score
    FROM documents d`;
  let rows: Row[];
  /** more matches than were read: the total is "at least" */
  let capped = false;
  if (groups.length) {
    const w = [...base, ...groups.map((g) => like(g, cols))];
    rows = await q(`${narrow(head)} WHERE ${w.join(" AND ")} ORDER BY score DESC, d.published_at DESC LIMIT ${CANDIDATES}`,
      [...headP, ...bp, ...groups.flatMap((g) => likeP(g, cols))]);
    capped = rows.length >= CANDIDATES;
  } else {
    // a day's news with no subject: Chennai's stories, the most-covered first (each story's reports in the dates, counted once)
    const by = await q(`SELECT COALESCE(d.story_id, d.doc_id) AS k, COUNT(*) AS n, MAX(d.published_at) AS p FROM documents d
      WHERE ${[...base, "COALESCE(d.is_district, 1) = 1"].join(" AND ")} GROUP BY k ORDER BY n DESC, p DESC LIMIT ${CANDIDATES}`, bp);
    const rank = new Map(by.map((r, k) => [String(r.k), k]));
    const docs = by.length ? await q(`${narrow("0")} WHERE ${[...base, "COALESCE(d.is_district, 1) = 1"].join(" AND ")} AND COALESCE(d.story_id, d.doc_id) IN (?)
      ORDER BY d.published_at DESC`, [...bp, by.map((r) => String(r.k))]) : [];
    rows = docs.sort((a, b) => (rank.get(String(a.story ?? a.id)) ?? 1e9) - (rank.get(String(b.story ?? b.id)) ?? 1e9));
    capped = by.length >= CANDIDATES;
  }
  let stories = byStory(rows.filter((r) => isNewsMedia(r.publisher, r.domain, r.tier)));
  // few headlines with the words: the reports' own text too (a full article names streets and people its headline does not), by the words
  // themselves (no synonyms: "garbage" read as "dump" in a whole article found unrelated reports). The whole text of every report is read
  // only inside dates of a week or so; otherwise the summaries (28 Nov build: a month of whole text took 200 ms, 23,000 reports hold 22 MB)
  if (groups.length && stories.length < 3) {
    const seen = new Set(rows.map((r) => String(r.id)));
    const short = when ? Date.parse(`${when.to.replace(" ", "T")}Z`) - Date.parse(`${when.from.replace(" ", "T")}Z`) <= 8 * 864e5 : false;
    const textCols = short ? ["d.summary", "d.body"] : ["d.summary"];
    const own = groups.map((g) => [...new Set(g.slice(0, 2))]);
    // (ORDER BY +published_at: sorted after the scan, not read through the date index row by row: 300 ms against 20 ms on the 28 Nov build)
    const body = await q(`${narrow("0")} WHERE ${[...base, ...own.map((g) => like(g, textCols))].join(" AND ")} ORDER BY ${when ? "" : "+"}d.published_at DESC LIMIT 120`,
      [...bp, ...own.flatMap((g) => likeP(g, textCols))]);
    const extra = body.filter((r) => !seen.has(String(r.id)) && isNewsMedia(r.publisher, r.domain, r.tier));
    if (extra.length) { rows = [...rows, ...extra]; stories = byStory(rows.filter((r) => isNewsMedia(r.publisher, r.domain, r.tier))); }
  }
  // the reports shown, and the next 40 for the list of every match, read whole
  const want = stories.slice(0, limit + 40).map((s) => String(s.row.id));
  const full = want.length ? await q(`SELECT d.doc_id AS id, d.title, d.title_en, d.lang, d.url, d.linked_incident_id AS incident, d.place_text AS place,
      DATE_FORMAT(d.published_at, '%Y-%m-%d %H:%i:%s') AS t FROM documents d WHERE d.doc_id IN (?)`, [want]) : [];
  const byId = new Map(full.map((r) => [String(r.id), r]));
  stories = stories.map((s) => ({ ...s, row: { ...s.row, ...(byId.get(String(s.row.id)) ?? {}) } }));
  const top = stories.slice(0, limit);
  // every report of each story shown, for the preview (it lists every outlet's report)
  const keys = top.map((s) => s.story).filter(Boolean) as string[];
  const members = keys.length
    ? await q(`SELECT d.doc_id AS id, d.story_id AS story, d.publisher, d.publisher_domain AS domain, d.publisher_tier AS tier, d.linked_incident_id AS incident FROM documents d
        WHERE d.story_id IN (?) ORDER BY d.published_at LIMIT 600`, [keys])
    : [];
  const items = top.map((s): NewsHit => {
    const mine = s.story ? members.filter((m) => m.story === s.story && isNewsMedia(m.publisher, m.domain, m.tier)) : [];
    const ids = [...new Set([s.row.id, ...mine.map((m) => String(m.id))])].slice(0, 60);
    const outlets = new Set((mine.length ? mine : [s.row]).map((m) => String(m.publisher ?? "").trim()).filter(Boolean)).size || 1;
    const r = s.row;
    return {
      id: String(r.id), title: redactText(String(r.title ?? "")), titleEn: r.title_en ? redactText(String(r.title_en)) : null, lang: r.lang ?? null,
      // the incident a report of the story is filed into (the one shown may be another outlet's report of it)
      publisher: r.publisher ?? null, url: r.url ?? null, t: String(r.t), incident: r.incident ?? mine.find((m) => m.incident)?.incident ?? null, place: r.place ?? null,
      story: s.story, docIds: ids, outlets
    };
  });
  const rest = stories.slice(limit, limit + 40).map(({ row: r }): NewsRest => ({ id: String(r.id), title: redactText(String(r.title ?? "")),
    titleEn: r.title_en ? redactText(String(r.title_en)) : null, publisher: r.publisher ?? null, url: r.url ?? null, t: String(r.t), incident: r.incident ?? null }));
  return { items, total: stories.length, more: capped, rest };
}

/** One entry per story, in the order the rows came (best first): its first row is its best report. */
function byStory(rows: Row[]): { story: string | null; row: Row }[] {
  const out: { story: string | null; row: Row }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const k = String(r.story ?? r.id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ story: r.story ? String(r.story) : null, row: r });
  }
  return out;
}
