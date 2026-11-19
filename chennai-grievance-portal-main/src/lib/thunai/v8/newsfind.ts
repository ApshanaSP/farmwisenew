/**
 * v8, server: a story asked for by its topic, or a news question, looked for among the stories on the Collector's screen and the dashboard's
 * stored news of the last week (the owner's examples 1 and 2). The matching is news8.ts's (pure); this file only gathers the candidates.
 *
 * Only news outlets' reports are candidates (newsmedia.ts, as the console's news lists and the news reader keep them): a social post or an
 * aggregator's copy is never offered or read. Nothing leaves the server here: the store is read locally; the outlets' feeds (for a news
 * question the dashboard has nothing on) are read by v7's gap path, by their fixed addresses, with no query built from the Collector's words.
 */
import intelPool from "@/lib/collector/db";
import { syncEpoch } from "@/lib/collector/epoch";
import { asOf } from "@/lib/collector/intel";
import { isNewsMedia } from "@/lib/collector/newsmedia";
import type { RowDataPacket } from "mysql2";
import type { World } from "../types";
import { findGap, gapPhrase, nothingLine, type GapDeps } from "../aide7/gap";
import { relativeTime } from "../web/brief";
import type { FoundStory } from "../web/serve";
import { eventForms, newsRequest, pickStory, rankStories, SOFT_FLOOR, type NewsReq, type Picked, type StoryItem } from "./news8";

const brief = (x: StoryItem | null) => (x ? { id: x.id, title: String(x.titleEn || x.title).slice(0, 300), outlet: x.outlets?.[0] ?? null } : null);

/** What the news route needs of a find: the request's kind and words, the pick, another close story, the distinct matches (at most 5); v9:
 * `soft`, a story-like topic with no news word (nothing found: the console's own lanes take it, nothing is said) */
export async function foundStory(f: FindAsk, d: Parameters<typeof findNews>[1]): Promise<FoundStory | null> {
  const r = await findNews(f, d);
  if (!r) return null;
  return { kind: r.req.kind, words: r.req.words, pick: brief(r.picked.pick), other: brief(r.picked.other), stories: r.picked.stories.map((s) => brief(s)!).slice(0, 5), ...(r.req.soft ? { soft: true } : {}) };
}

/**
 * Nothing in the dashboard's news: the outlets' own feeds (v7's gap path: their fixed addresses, no query sent), said by code as the outlet
 * and when, its headline as its own words; nothing there either, the plain line (claiming only what was searched).
 */
export async function feedLines(f: FindAsk, words: string[], d: { world: Pick<World, "zones" | "places">; gap?: GapDeps; now?: () => number }):
  Promise<{ en: string[]; ta: string[]; links: { outlet: string; title: string; url: string; publishedAt: string | null }[] }> {
  const topic = words.join(" ");
  const phrase = gapPhrase(topic, f.q) || topic;
  if (!words.length) return { en: [nothingLine(phrase, "en", "dashboard")], ta: [nothingLine(phrase, "ta", "dashboard")], links: [] };
  const g = await findGap(topic, f.q, { ...(d.gap ?? {}), world: d.world as World, dashboardNews: async () => [] });
  if (g.status === "ok" && g.hits.length) {
    const now = (d.now ?? Date.now)();
    const lines = g.hits.slice(0, 2).map((h) => {
      const iso = h.at != null ? new Date(h.at).toISOString() : null;
      const en = relativeTime(iso, now, "en"), ta = relativeTime(iso, now, "ta");
      const t = h.title.split(" . ")[0].slice(0, 160);
      return { en: `${h.outlet}${en ? `, ${en},` : ""} reports: "${t}".`, ta: `${h.outletTa ?? h.outlet}${ta ? ` (${ta})` : ""} செய்தி: "${t}".`,
        link: { outlet: h.outlet, title: t, url: h.url ?? "", publishedAt: iso } };
    });
    return { en: ["The dashboard's news has nothing on that; the outlets' own feeds do.", ...lines.map((x) => x.en)],
      ta: ["டாஷ்போர்டின் செய்திகளில் இது இல்லை; செய்தித்தாள்களின் ஊட்டங்களில் உள்ளது.", ...lines.map((x) => x.ta)], links: lines.map((x) => x.link).filter((x) => x.url) };
  }
  const searched = g.status === "unavailable" ? "unavailable" : "news";
  return { en: [nothingLine(phrase, "en", searched)], ta: [nothingLine(phrase, "ta", searched)], links: [] };
}

export interface ScreenStory { id: string; title?: string | null; source?: string | null }
export interface FindAsk { q: string; lang: "en" | "ta"; screen?: ScreenStory[]; exclude?: string[] }
export interface Found { req: NewsReq; picked: Picked }

/** the district's own place names, for the place veto (a place named that a story does not mention is never that story) */
export const placesOf = (w: Pick<World, "zones" | "places">): string[] => [...new Set([...w.zones.map((z) => z.name), ...w.places.flatMap((p) => [p.name, ...(p.aliases ?? [])])])].filter((n) => n && n.length >= 4);

/** The dashboard's stored news of the last `days` days, newest first: news outlets' reports only (at most 3,000). */
// (a decision or a store write empties it, as every timed cache over the store: the data epoch, RC-35; the QA gate, 19 Nov)
const storeCache = { v: null as { at: number; asOf: string; days: number; rows: StoryItem[] } | null, clear() { this.v = null; } };
export async function storeStories(days = 7): Promise<StoryItem[]> {
  const now = await asOf();
  syncEpoch(storeCache);
  // the same week's stories for a minute (the store changes on its own schedule; a request a second must not re-read 3,000 rows: the review, 18 Nov)
  const c = storeCache.v;
  if (c && c.asOf === now && c.days === days && Date.now() - c.at < 60_000) return c.rows;
  const rows = await readStore(now, days);
  storeCache.v = { at: Date.now(), asOf: now, days, rows };
  return rows;
}
async function readStore(now: string, days: number): Promise<StoryItem[]> {
  const until = now || new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");
  const since = new Date(Date.parse(`${until.replace(" ", "T")}+05:30`) - days * 86_400_000 + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");
  const [rows] = await intelPool.query<RowDataPacket[]>(
    `SELECT d.doc_id AS id, d.title, d.title_en, d.publisher, d.publisher_domain, d.publisher_tier, d.place_text AS place, d.story_id AS story,
            DATE_FORMAT(d.published_at, '%Y-%m-%d %H:%i') AS t
     FROM documents d WHERE d.source_kind = 'news' AND d.published_at > ? AND d.published_at <= ? ORDER BY d.published_at DESC LIMIT 3000`, [since, until]);
  return (rows as Record<string, unknown>[])
    .filter((r) => isNewsMedia(r.publisher as string | null, r.publisher_domain as string | null, r.publisher_tier as string | null))
    .map((r) => ({ id: String(r.id), title: String(r.title ?? ""), titleEn: (r.title_en as string | null) ?? null, outlets: r.publisher ? [String(r.publisher)] : [],
      place: (r.place as string | null) ?? null, story: (r.story as string | null) ?? null, t: (r.t as string | null) ?? null }));
}

/**
 * Find what a request asks for. `screen`: the stories on the Collector's screen, in order (their titles as the browser shows them). Null: the
 * sentence is not a story by its topic nor a news question.
 */
/** the floor for a search again on the story just found */
export const MORE_FLOOR = 0.35;

export async function findNews(f: FindAsk, d: { world: Pick<World, "zones" | "places">; stories?: () => Promise<StoryItem[]> }): Promise<Found | null> {
  const screen = (f.screen ?? []).filter((x) => x && /^[A-Za-z0-9_:.-]{1,80}$/.test(x.id));
  const req = newsRequest(f.q, { onScreen: screen.length > 0 });
  if (!req) return null;
  const stored = await (d.stories ?? storeStories)().catch(() => [] as StoryItem[]);
  const byId = new Map(stored.map((s) => [s.id, s]));
  // the screen's stories first (their own titles, and the store's English title when it has one), then the rest of the store. A panel row
  // is read by its first stored report; when that report's headline is not the one the row shows (a merged cluster: the live dev re-check,
  // 19 Nov), the stored report whose headline it is stands in, else the row's own title alone (never another story's words)
  const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  let byTitle: Map<string, StoryItem> | null = null;
  const titled = (t: string): StoryItem | null => {
    if (!byTitle) { byTitle = new Map(); for (const s of stored) for (const k of [norm(s.title), norm(s.titleEn)]) if (k && !byTitle.has(k)) byTitle.set(k, s); }
    return byTitle.get(norm(t)) ?? null;
  };
  const own = (x: (typeof screen)[number]): StoryItem => {
    const bare = { id: x.id, title: String(x.title ?? ""), outlets: x.source ? String(x.source).split(/\s+·\s+/) : [] };
    const s = byId.get(x.id);
    if (!x.title) return s ?? bare;
    if (s && (norm(s.title) === norm(x.title) || norm(s.titleEn) === norm(x.title))) return { ...s, title: String(x.title) };
    return titled(String(x.title)) ?? bare;
  };
  const onScreen: StoryItem[] = screen.map((x, i) => ({ ...own(x), onScreen: i + 1 }));
  const seen = new Set(onScreen.map((x) => x.id));
  // a search for more on a story leaves out the report already read (its other outlets' reports are what is wanted)
  const skip = new Set(f.exclude ?? []);
  const items = [...onScreen, ...stored.filter((s) => !seen.has(s.id))].filter((x) => !skip.has(x.id));
  // within one event, the report in the request's own language (the real run, 18 Nov: a Tamil headline was read in the English voice)
  // "what else is in the news about it": the topic is the one just found, so another outlet's report of it that words it differently is enough (a
  // lower floor; the place veto still holds: the live dev re-check, 19 Nov)
  // (v9: a soft request, no news word said, takes only a close story that has the event itself: SOFT_FLOOR, and a hit on "protest", not the
  // place alone)
  const floor = req.soft ? SOFT_FLOOR : f.exclude?.length ? MORE_FLOOR : undefined;
  let ranked = rankStories(req, items, { places: placesOf(d.world) });
  if (req.soft && req.event?.length) {
    // (and a word that names it: "open the NEET protest" read an AIADMK protest on "protest" alone; the review, 19 Nov)
    const ev = { words: req.event, outlet: null, gloss: eventForms(req) ?? undefined };
    const named = { words: req.which ?? [], outlet: null, gloss: req.gloss };
    ranked = ranked.filter((r) => r.score < SOFT_FLOOR || ((rankStories(ev, [r.item])[0]?.hits ?? 0) > 0 && (!named.words.length || (rankStories(named, [r.item])[0]?.hits ?? 0) > 0)));
  }
  return { req, picked: pickStory(ranked, f.lang, floor) };
}
