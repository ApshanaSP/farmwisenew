/**
 * Jarvis v6, Phase 4: what /api/collector/thunai/news and its dev twin stream, as NDJSON events (one JSON object a line). Server only.
 *
 *   { id }        a stored news item: "first" at once ("Reading The Hindu's report..."), then a "brief" from the article alone
 *                 (target p90 4 s), then "related" and a second "brief" with the other outlets compared (target p90 8 s), "done".
 *   { question }  a public question: "first" ("Looking that up on the web..."), then "answer" (webLookup), "done".
 * The events carry spoken lines, quotes with their outlets and links for the screen: never a step, a page to open or a tool to
 * call, so nothing a page says can make Jarvis act. The article's own text is not sent to the browser.
 */
import { performance } from "perf_hooks";
import { z } from "zod";
import { isNewsMedia } from "@/lib/collector/newsmedia";
import { type SpokenBrief, briefFromCoverage, firstLine } from "./brief";
import { type CompareOptions, compareCoverage, type Source } from "./compare";
import { outletByName, outletOfUrl } from "./domains";
import { type WebDeps, listOf, tele } from "./fetch";
import { type LookupAnswer, webLookup } from "./lookup";
import { type ArticleRead, readArticle } from "./read";
import { type NewsItemInput, relatedCoverage } from "./related";
import { coverageLine, type NewsAide } from "../aide7/news";

/** v7: the sentence the Collector said and its language, so the aide answers the question asked (aide7/news.ts); never sent anywhere */
const Ask = z.object({ q: z.string().trim().min(1).max(400), lang: z.enum(["en", "ta"]) }).strict();
export const NewsBody = z.union([
  z.object({ id: z.string().regex(/^[A-Za-z0-9_:.-]{1,80}$/), ask: Ask.optional() }).strict(),
  // v6: an incident on Jarvis's screen: its own newest news report (from a news medium) is read; none, and the answer says so
  z.object({ incident: z.string().regex(/^[A-Za-z0-9_:.-]{1,80}$/), ask: Ask.optional() }).strict(),
  z.object({ question: z.string().trim().min(2).max(500) }).strict(),
  // v8: a story asked for by its topic, or a news question (the owner's examples 1 and 2): the sentence, its language, and the stories on the
  // Collector's screen in order (their ids and titles as shown); the server finds it among them and the dashboard's stored news (v8/newsfind.ts)
  z.object({ find: z.object({ q: z.string().trim().min(2).max(400), lang: z.enum(["en", "ta"]),
    screen: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9_:.-]{1,80}$/), title: z.string().max(400).nullable().optional(), source: z.string().max(300).nullable().optional() })).max(250).optional(),
    // the story already read, left out of a search for more on it
    exclude: z.array(z.string().regex(/^[A-Za-z0-9_:.-]{1,80}$/)).max(5).optional(),
    // v10: a named thing heard by ear (its name and the store's spellings of it), and a storm's weather readings wanted with the news
    entity: z.object({ name: z.string().trim().min(1).max(80), kind: z.string().max(20), spellings: z.array(z.string().trim().min(1).max(80)).max(12) }).strict().optional(),
    weather: z.boolean().optional() }).strict() }).strict()
]);
export type NewsBodyT = z.infer<typeof NewsBody>;

/** A stored news item as lib/collector/intel.ts newsDoc returns it. */
export interface StoredDoc { id: string; url: string | null; title: string | null; title_en?: string | null; publisher?: string | null; publisher_domain?: string | null;
  /** the monitor's tier ("social", "aggregator", "official", ...): a social or aggregator row is no outlet's report (newsmedia.ts) */
  publisher_tier?: string | null;
  body?: string | null; t?: string | null; place?: string | null; cat?: string | null }

export type NewsEvent =
  | { type: "first"; en: string; ta: string }
  | { type: "brief"; stage: "article" | "coverage"; brief: SpokenBrief; status: string; ms: number }
  | { type: "related"; items: { outlet: string; title: string; url: string; publishedAt: string | null; source: "article" | "feed" }[]; feeds: { tried: number; ok: number; failed: number }; ms: number }
  | { type: "answer"; answer: LookupAnswer }
  /** v8: the story found for a request by its topic (read next), another close story to offer, the other matching stories */
  | { type: "found"; id: string; title: string; outlet: string | null; other: { id: string; title: string; outlet: string | null } | null; stories: { id: string; title: string; outlet: string | null }[] }
  /** v8: lines said as they are (nothing in the dashboard's news: what the outlets' feeds have, or that nothing was found), with links */
  | { type: "said"; en: string[]; ta: string[]; links: { outlet: string; title: string; url: string; publishedAt: string | null }[] }
  /** v9: a soft find (a story-like topic with no news word) found nothing close: nothing is said; the console's own lanes take the sentence */
  | { type: "none" }
  /** v10: a storm's weather readings, said by code after the news (v10/weather10.ts) */
  | { type: "weather"; en: string[]; ta: string[] }
  | { type: "error"; why: "not_found" | "failed" | "no_news" }
  | { type: "done"; ms: number };

export interface ServeDeps extends WebDeps, CompareOptions {
  /** the stored item (newsDoc) */
  loadDoc: (id: string) => Promise<StoredDoc | null>;
  /** an incident's newest news report's stored id (lib/thunai/newsdoc.ts incidentNewsDoc), null when it has none */
  incidentDoc?: (incident: string) => Promise<string | null>;
  /** look for other outlets' coverage too (default true) */
  related?: boolean;
  /** v7: the aide writes the spoken brief from the article (aide7/news.ts); absent, the code brief (v6) is said */
  aide?: NewsAide;
  /** v8: find a story by its topic among the screen's and the store's (v8/newsfind.ts findNews); absent, a { find } is not found */
  find?: (f: Extract<NewsBodyT, { find: unknown }>["find"]) => Promise<FoundStory | null>;
  /** v8: nothing in the dashboard: the outlets' feeds, said by code (v8/newsfind.ts feedLines) */
  feedLines?: (f: Extract<NewsBodyT, { find: unknown }>["find"], words: string[]) => Promise<{ en: string[]; ta: string[]; links: { outlet: string; title: string; url: string; publishedAt: string | null }[] }>;
  /** v10: a storm's weather readings (v10/weather10.ts weatherLines), when a find asks for them */
  weather?: () => Promise<{ en: string[]; ta: string[] } | null>;
}

/** v8: what a { find } found (v8/newsfind.ts): the request's kind and topic words, the story picked (or none), another close one, the matches */
export interface FoundStory {
  kind: "story" | "ask"; words: string[];
  pick: { id: string; title: string; outlet: string | null } | null;
  other: { id: string; title: string; outlet: string | null } | null;
  stories: { id: string; title: string; outlet: string | null }[];
  /** v9: a story-like topic with no news word: found only when close (nothing found: "none", and nothing from the outlets' feeds) */
  soft?: boolean;
}

const STORED_MIN = 200;
const asSource = (a: { outlet: string | null; outletTa?: string | null; url: string; title?: string; publishedAt: string | null; text: string }): Source =>
  ({ outlet: a.outlet, outletTa: a.outletTa ?? null, url: a.url, title: a.title, publishedAt: a.publishedAt, text: a.text });

/** The events for one request, in order. Never throws (a failure is an "error" event). */
export async function* newsEvents(asked: NewsBodyT, d: ServeDeps): AsyncGenerator<NewsEvent> {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  let body: Exclude<NewsBodyT, { incident: string } | { find: unknown }>;
  let ask = "ask" in asked ? asked.ask ?? null : null;
  // v10: a storm's weather readings, read while the story is found and read, said after it
  const weatherP = "find" in asked && asked.find.weather && d.weather ? d.weather().catch(() => null) : null;
  const weatherEvent = async (): Promise<NewsEvent | null> => { const w = weatherP ? await weatherP : null; return w && (w.en.length || w.ta.length) ? { type: "weather", en: w.en, ta: w.ta } : null; };
  if ("find" in asked) {
    // v8: the story the Collector named by its topic, else (a news question with nothing in the dashboard) what the outlets' feeds have
    let f: FoundStory | null = null;
    try { f = d.find ? await d.find(asked.find) : null; } catch { yield { type: "error", why: "failed" }; return; }
    if (!f) { yield { type: "error", why: "not_found" }; return; }
    if (!f.pick && f.soft) { yield { type: "none" }; yield { type: "done", ms: ms() }; return; }
    if (!f.pick) {
      const said = d.feedLines ? await d.feedLines(asked.find, f.words).catch(() => null) : null;
      if (!said) { yield { type: "error", why: "not_found" }; return; }
      yield { type: "said", ...said };
      // (a storm with nothing in the news still has its readings)
      const w = await weatherEvent();
      if (w) yield w;
      yield { type: "done", ms: ms() };
      return;
    }
    yield { type: "found", id: f.pick.id, title: f.pick.title, outlet: f.pick.outlet, other: f.other, stories: f.stories };
    ask = { q: asked.find.q, lang: asked.find.lang };
    body = { id: f.pick.id, ask };
  } else if ("incident" in asked) {
    let id: string | null = null;
    try { id = d.incidentDoc ? await d.incidentDoc(asked.incident) : null; } catch { yield { type: "error", why: "failed" }; return; }
    if (!id) { yield { type: "error", why: "no_news" }; return; }
    body = { id, ...(ask ? { ask } : {}) };
  } else body = asked;
  if ("question" in body) {
    yield { type: "first", en: "Looking that up on the web...", ta: "இணையத்தில் தேடுகிறேன்..." };
    yield { type: "answer", answer: await webLookup(body.question, d) };
    yield { type: "done", ms: ms() };
    return;
  }
  let doc: StoredDoc | null = null;
  try { doc = await d.loadDoc(body.id); } catch { yield { type: "error", why: "failed" }; return; }
  // v7 review (privacy): `documents` holds more than news (social posts, aggregators' copies), and v7 sends the stored body to the writer
  // model (aide7/news.ts). Only a news outlet's report is read (newsmedia.ts, as the console's news lists keep it); any other row is
  // answered as a missing document, so an id is no way to have another row read out or sent to a model
  if (!doc || !isNewsMedia(doc.publisher, doc.publisher_domain, doc.publisher_tier)) { yield { type: "error", why: "not_found" }; return; }
  const list = listOf(d);
  const outlet = outletByName(doc.publisher, doc.publisher_domain, list) ?? (doc.url ? outletOfUrl(doc.url, list) : null);
  const outletName = outlet?.name ?? (doc.publisher ? String(doc.publisher) : null);
  yield { type: "first", ...firstLine(outletName, outlet?.nameTa ?? null) };

  const publishedAt = (() => { const s = doc.t ? String(doc.t) : ""; const v = Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? `${s.replace(" ", "T")}+05:30` : s); return Number.isFinite(v) ? new Date(v).toISOString() : null; })();
  const item: NewsItemInput = { id: doc.id, title: doc.title, titleEn: doc.title_en ?? null, url: doc.url, outlet: outletName, publisherDomain: doc.publisher_domain ?? null,
    publishedAt, place: doc.place ?? null, category: doc.cat ?? null };
  // the other outlets' feeds are read while the article is (both within the 8 s target)
  const relP = d.related === false ? null : relatedCoverage(item, d);

  let primary: ArticleRead | { status: "stored" | "no_link"; outlet: string | null; outletTa: string | null; url: string; title: string; publishedAt: string | null; text: string };
  const stored = String(doc.body ?? "").trim();
  if (stored.length >= STORED_MIN) primary = { status: "stored", outlet: outletName, outletTa: outlet?.nameTa ?? null, url: doc.url ?? "", title: doc.title ?? "", publishedAt, text: stored.slice(0, 20_000) };
  else if (doc.url) primary = await readArticle(doc.url, d);
  else primary = { status: "no_link", outlet: outletName, outletTa: outlet?.nameTa ?? null, url: "", title: doc.title ?? "", publishedAt, text: "" };
  // a Google News link (denied): the publisher's own copy, if its feed has the same headline
  if (primary.status === "denied" && relP) {
    const self = (await relP).self;
    if (self) primary = await readArticle(self.url, d);
  }
  const pTitle = primary.title || doc.title || "";
  const pOutlet = primary.outlet ?? outletName, pOutletTa = primary.outletTa ?? outlet?.nameTa ?? null;
  const pWhen = primary.publishedAt ?? publishedAt;
  const pText = primary.status === "ok" || primary.status === "stored" ? primary.text : "";
  const first = await compareCoverage(pText ? [asSource({ outlet: pOutlet, outletTa: pOutletTa, url: primary.url, title: pTitle, publishedAt: pWhen, text: pText })] : [], { ...d, model: false });
  const pBrief = { outlet: pOutlet, outletTa: pOutletTa, url: primary.url || doc.url || "", title: pTitle, publishedAt: pWhen, status: primary.status };
  const codeBrief = briefFromCoverage({ primary: pBrief, comparison: first }, d);
  // v7: the aide writes the brief in the asked language from the article's own sentences, each sentence sent as it passes its check; the other
  // language keeps the code brief (shown, not said)
  let aideLines: string[] | null = null;
  if (d.aide && ask) {
    for await (const lines of d.aide({ question: ask.q, lang: ask.lang, outlet: pOutlet, outletTa: pOutletTa, title: pTitle, publishedAt: pWhen, text: pText, fallback: codeBrief[ask.lang].join(" ") })) {
      aideLines = lines;
      yield { type: "brief", stage: "article", status: primary.status, brief: { ...codeBrief, [ask.lang]: lines }, ms: ms() };
    }
  }
  if (!aideLines) yield { type: "brief", stage: "article", status: primary.status, brief: codeBrief, ms: ms() };
  // v10: a storm's readings after its story
  { const w = await weatherEvent(); if (w) yield w; }

  if (relP) {
    const rel = await relP;
    yield { type: "related", items: rel.items.map((x) => ({ outlet: x.outlet, title: x.title, url: x.url, publishedAt: x.publishedAt, source: x.source })),
      feeds: { tried: rel.feeds.tried, ok: rel.feeds.ok, failed: rel.feeds.failed }, ms: ms() };
    if (rel.items.length) {
      const sources = [...(pText ? [asSource({ outlet: pOutlet, outletTa: pOutletTa, url: primary.url, title: pTitle, publishedAt: pWhen, text: pText })] : []),
        ...rel.items.map((x) => asSource(x))];
      const cmp = await compareCoverage(sources, d);
      const cov = briefFromCoverage({ primary: pBrief, related: rel.items, comparison: cmp }, d);
      // v7: after the aide's answer, one line names the other outlets (their links are on the screen); nothing said twice
      const line = aideLines && ask ? coverageLine(rel.items.map((x) => ({ outlet: x.outlet, outletTa: x.outletTa ?? null })), ask.lang) : null;
      yield { type: "brief", stage: "coverage", status: primary.status, brief: aideLines && ask ? { ...cov, [ask.lang]: [...aideLines, ...(line ? [line] : [])] } : cov, ms: ms() };
    }
  }
  tele(d, "web_news", { ms: ms(), why: primary.status, count: 0 });
  yield { type: "done", ms: ms() };
}

/** NDJSON: each event a line, sent as soon as it is ready (the first line at once). */
export function ndjson(events: AsyncGenerator<NewsEvent>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        const { value, done } = await events.next();
        if (done) { ctrl.close(); return; }
        ctrl.enqueue(enc.encode(`${JSON.stringify(value)}\n`));
      } catch {
        ctrl.enqueue(enc.encode(`${JSON.stringify({ type: "error", why: "failed" })}\n`));
        ctrl.close();
      }
    },
    async cancel() { await events.return(undefined); }
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
