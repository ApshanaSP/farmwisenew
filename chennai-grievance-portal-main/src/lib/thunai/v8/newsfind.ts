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
import { asksPrivate } from "../privacy";
import { findGap, gapPhrase, nothingLine, type GapDeps } from "../aide7/gap";
import { relativeTime } from "../web/brief";
import type { FoundStory } from "../web/serve";
import { eventForms, namingWords, newsRequest, pickStory, placeKeyMatch, rankStories, sameStory, SOFT_FLOOR, topicWords, type NewsReq, type Picked, type StoryItem } from "./news8";
import { fold, looseKey, tokensOf } from "./match";
/** a Tamil or Tanglish case ending joined on a place ("adyarla", "ataiyaril") */
const PLACE_CASE = /(?:ukku|kku|ile|ila|il|la|le|lu|oda|odu|ku)$/;

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
export interface FindAsk { q: string; lang: "en" | "ta"; screen?: ScreenStory[]; exclude?: string[];
  /** v10: a named thing heard by ear (entity10.ts): its name and the spellings a headline may have */
  entity?: { name: string; kind: string; spellings: string[] } | null;
  /** v10: a storm: the weather readings come with the news */
  weather?: boolean;
  /** v10: only the stories on the screen are candidates, found softly (a story named on screen with no news word) */
  onlyScreen?: boolean }
export interface Found { req: NewsReq; picked: Picked }

/**
 * v10: a request that names a thing by ear ("Tell me about Cyclone Aquan"), as the store spells it: its topic words (the request's own, which
 * v10's browser already wrote with the store's spelling), each word of the name glossed with every spelling the store has for it (a headline
 * that says "Akwan" matches "Akvan" at 0.9, as a Tamil word's English does). Never soft: the Collector named it. With no request of v8's shape
 * ("tell me about X" has no news word), it is a story when said with a verb that reads or tells, else a news question.
 */
export function entityRequest(req: NewsReq | null, f: Pick<FindAsk, "q" | "entity">): NewsReq | null {
  const e = f.entity;
  if (!e || !e.spellings.length) return req;
  const coreToks = [...new Set(e.spellings.flatMap((s) => tokensOf(s)).filter((w) => w.length >= 3))];
  const own = tokensOf(e.spellings[0]).filter((w) => w.length >= 3);
  const base = topicWords(f.q, null).slice(0, 12);
  const words = [...new Set([...(req?.words ?? base), ...own])].slice(0, 12);
  if (!words.length) return req;
  const gloss: Record<string, string[]> = { ...(req?.gloss ?? {}) };
  for (const w of own) gloss[w] = [...new Set([...(gloss[w] ?? []), ...coreToks])];
  const kind: NewsReq["kind"] = req?.kind ?? (/\b(?:tell|read|open|explain|brief|about|show|play)\b|\b(?:sollu|padi|kaattu|thira)\w*|சொல்|படி|காட்டு|திற|விளக்கு/iu.test(f.q) ? "story" : "ask");
  return { kind, words, outlet: req?.outlet ?? null, ref: false, gloss, ...(req?.weak ? { weak: req.weak } : {}) };
}

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

/** v10: the meaning ranker's guards (v10/sem10.ts; calibrated on v8's dev set and the build's own cases on the real store, 19 Nov) */
export const SEM_ABS = 0.835;
export const SEM_MARGIN = 0.03;
export const SEM_LEX = 0.3;

export async function findNews(f: FindAsk, d: { world: Pick<World, "zones" | "places">; stories?: () => Promise<StoryItem[]>;
  /** v10: the meaning of the request against the candidates (v10/sem10.ts semScores, passed by the news route and the runners); absent: none asked */
  sem?: ((q: string, items: StoryItem[]) => Promise<Map<string, number> | null>) | null }): Promise<Found | null> {
  // v10 (the second review of v9): what the console refuses for privacy (a victim's name, address, details) is never found, read or handed to a model
  if (asksPrivate(f.q)) return null;
  const screen = (f.screen ?? []).filter((x) => x && /^[A-Za-z0-9_:.-]{1,80}$/.test(x.id));
  // v10: a thing named by ear comes with the store's spellings of it (entityRequest); without one, v8's reading of the sentence
  let req = f.entity ? entityRequest(newsRequest(f.q, { onScreen: screen.length > 0 }), f) : newsRequest(f.q, { onScreen: screen.length > 0 });
  // v10: a story named on screen with no news word: the request's own topic words, found softly among the screen's stories only
  // (v10 review 2, round 2, news-1: with a soft request's guards: a word that names it, neither a place, the event nor a kind of thing, else
  // nothing is found and the console's view takes it: "Open Adyar", "open the Royapuram protest", "அடையாறு திறங்க" read a story there)
  if (!req && f.onlyScreen && screen.length) {
    const words = topicWords(f.q, null).slice(0, 12);
    const { event, which } = namingWords(f.q, words);
    if (!which.length) return null;
    req = { kind: "story", words, outlet: null, ref: false, soft: true, which, ...(event.length ? { event } : {}) };
  }
  if (!req) return null;
  // v10 (the second review of v9): a soft request's naming word is never one of the district's places, as its world spells them ("open the
  // Pattinapakkam fire" names a place and an event: the console's view, as "open the Adyar fire" is); none left, nothing is found softly
  if (req.soft && req.which?.length) {
    const keys = placesOf(d.world).map((p) => looseKey(fold(p).replace(/\s+/g, ""))).filter((k) => k.length >= 4);
    const which = req.which.filter((w) => ![w, w.replace(PLACE_CASE, "")].some((v) => {
      const k = looseKey(v);
      return k.length >= 4 && keys.some((pk) => placeKeyMatch(k, pk));
    }));
    if (!which.length) return null;
    req = { ...req, which };
  }
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
  // (v10: a story named on screen with no news word is looked for on the screen alone)
  const items = (f.onlyScreen ? onScreen : [...onScreen, ...stored.filter((s) => !seen.has(s.id))]).filter((x) => !skip.has(x.id));
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
  // (v10 dev2: the outlet asked for leads its event: "what Daily Thanthi wrote on ..." is Daily Thanthi's report of it)
  const picked = pickStory(ranked, f.lang, floor, req.outlet);
  // v10: nothing found by the words: the request's meaning (a Tamil request about an English headline), under the lexical guards; never for a thing
  // named by ear (its spellings are the evidence), a soft find, a search for more on a story, or the screen alone
  // (asked only when the caller passes it: the news route and the runners; a unit test or another caller never starts the model)
  if (!picked.pick && !req.soft && !f.entity && !f.onlyScreen && !f.exclude?.length && d.sem) {
    const sem = await d.sem(f.q, items.slice(0, 400)).catch(() => null);
    const order = sem ? [...sem.entries()].filter(([id]) => items.some((x) => x.id === id)).sort((a, b) => b[1] - a[1]) : [];
    const best = order[0] ? items.find((x) => x.id === order[0][0]) ?? null : null;
    if (best && order[0][1] >= SEM_ABS) {
      const memo = new Map<StoryItem, Set<string>>();
      const next = order.find(([id]) => { const it = items.find((x) => x.id === id); return !!it && it.id !== best.id && !sameStory(it, best, memo); });
      const lex = ranked.find((r) => r.item.id === best.id);
      const tamil = /[஀-௿]/u.test(f.q);
      // (the place veto: a district place the request names that the story lacks; rankStories caps such a story at 0.3)
      const places = placesOf(d.world);
      const placeWords = req.words.filter((w) => places.some((p) => keySimLoose(w, p)));
      // (v10 review 2, round 2, news-6: and the ranking's own place veto, which sees a place with its case ending or said in two words, "அடையாறில்",
      // "Adyarla", "அண்ணா நகரில்": an exact key alone did not, and the meaning read a story at another place)
      const vetoed = !!lex?.placeVetoed || (placeWords.length > 0 && rankStories({ words: placeWords, outlet: null }, [best], { places })[0]?.hits !== placeWords.length);
      if (order[0][1] - (next?.[1] ?? 0) >= SEM_MARGIN && (tamil || (lex?.score ?? 0) >= SEM_LEX && (lex?.hits ?? 0) > 0) && !vetoed)
        return { req, picked: { pick: best, score: lex?.score ?? 0, other: null, close: false, stories: [best] } };
    }
  }
  return { req, picked };
}
/** a request word that names a district place (its loose key equal to a place's, or a place word's, four letters or more) */
const keySimLoose = (w: string, place: string): boolean => {
  const k = looseKey(w);
  return k.length >= 4 && tokensOf(place).some((p) => looseKey(p) === k);
};
