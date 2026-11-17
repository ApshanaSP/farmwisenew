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
import { type SpokenBrief, briefFromCoverage, firstLine } from "./brief";
import { type CompareOptions, compareCoverage, type Source } from "./compare";
import { outletByName, outletOfUrl } from "./domains";
import { type WebDeps, listOf, tele } from "./fetch";
import { type LookupAnswer, webLookup } from "./lookup";
import { type ArticleRead, readArticle } from "./read";
import { type NewsItemInput, relatedCoverage } from "./related";

export const NewsBody = z.union([
  z.object({ id: z.string().regex(/^[A-Za-z0-9_:.-]{1,80}$/) }).strict(),
  // v6: an incident on Jarvis's screen: its own newest news report (from a news medium) is read; none, and the answer says so
  z.object({ incident: z.string().regex(/^[A-Za-z0-9_:.-]{1,80}$/) }).strict(),
  z.object({ question: z.string().trim().min(2).max(500) }).strict()
]);
export type NewsBodyT = z.infer<typeof NewsBody>;

/** A stored news item as lib/collector/intel.ts newsDoc returns it. */
export interface StoredDoc { id: string; url: string | null; title: string | null; title_en?: string | null; publisher?: string | null; publisher_domain?: string | null;
  body?: string | null; t?: string | null; place?: string | null; cat?: string | null }

export type NewsEvent =
  | { type: "first"; en: string; ta: string }
  | { type: "brief"; stage: "article" | "coverage"; brief: SpokenBrief; status: string; ms: number }
  | { type: "related"; items: { outlet: string; title: string; url: string; publishedAt: string | null; source: "article" | "feed" }[]; feeds: { tried: number; ok: number; failed: number }; ms: number }
  | { type: "answer"; answer: LookupAnswer }
  | { type: "error"; why: "not_found" | "failed" | "no_news" }
  | { type: "done"; ms: number };

export interface ServeDeps extends WebDeps, CompareOptions {
  /** the stored item (newsDoc) */
  loadDoc: (id: string) => Promise<StoredDoc | null>;
  /** an incident's newest news report's stored id (lib/thunai/newsdoc.ts incidentNewsDoc), null when it has none */
  incidentDoc?: (incident: string) => Promise<string | null>;
  /** look for other outlets' coverage too (default true) */
  related?: boolean;
}

const STORED_MIN = 200;
const asSource = (a: { outlet: string | null; outletTa?: string | null; url: string; title?: string; publishedAt: string | null; text: string }): Source =>
  ({ outlet: a.outlet, outletTa: a.outletTa ?? null, url: a.url, title: a.title, publishedAt: a.publishedAt, text: a.text });

/** The events for one request, in order. Never throws (a failure is an "error" event). */
export async function* newsEvents(asked: NewsBodyT, d: ServeDeps): AsyncGenerator<NewsEvent> {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  let body: Exclude<NewsBodyT, { incident: string }>;
  if ("incident" in asked) {
    let id: string | null = null;
    try { id = d.incidentDoc ? await d.incidentDoc(asked.incident) : null; } catch { yield { type: "error", why: "failed" }; return; }
    if (!id) { yield { type: "error", why: "no_news" }; return; }
    body = { id };
  } else body = asked;
  if ("question" in body) {
    yield { type: "first", en: "Looking that up on the web...", ta: "இணையத்தில் தேடுகிறேன்..." };
    yield { type: "answer", answer: await webLookup(body.question, d) };
    yield { type: "done", ms: ms() };
    return;
  }
  let doc: StoredDoc | null = null;
  try { doc = await d.loadDoc(body.id); } catch { yield { type: "error", why: "failed" }; return; }
  if (!doc) { yield { type: "error", why: "not_found" }; return; }
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
  yield { type: "brief", stage: "article", status: primary.status, brief: briefFromCoverage({ primary: pBrief, comparison: first }, d), ms: ms() };

  if (relP) {
    const rel = await relP;
    yield { type: "related", items: rel.items.map((x) => ({ outlet: x.outlet, title: x.title, url: x.url, publishedAt: x.publishedAt, source: x.source })),
      feeds: { tried: rel.feeds.tried, ok: rel.feeds.ok, failed: rel.feeds.failed }, ms: ms() };
    if (rel.items.length) {
      const sources = [...(pText ? [asSource({ outlet: pOutlet, outletTa: pOutletTa, url: primary.url, title: pTitle, publishedAt: pWhen, text: pText })] : []),
        ...rel.items.map((x) => asSource(x))];
      const cmp = await compareCoverage(sources, d);
      yield { type: "brief", stage: "coverage", status: primary.status, brief: briefFromCoverage({ primary: pBrief, related: rel.items, comparison: cmp }, d), ms: ms() };
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
