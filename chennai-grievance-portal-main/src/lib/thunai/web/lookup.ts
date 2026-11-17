/**
 * Jarvis v6, Phase 4: public questions the console cannot answer, looked up on a FIXED list of public sources. Server only.
 *
 *   the Met department    NDMA SACHET's CAP RSS (it carries IMD Chennai's warnings; the feed states public domain): a fixed
 *                         URL with no query at all, filtered here for Chennai and its districts and the day asked about;
 *   background facts      Wikipedia REST (search, then the page summary), with a non-browser User-Agent (Wikimedia's policy);
 *   what the papers say   the allowed outlets' own feeds (related.ts readFeed), filtered here.
 * There is no free open web search (Bing's API is retired; DuckDuckGo has only instant answers), so nothing else is looked up.
 *
 * Privacy: the only query that ever leaves the server is Wikipedia's, and it is BUILT FROM terms.ts's public terms (a place name
 * from the console's own lists, a cyclone's name, a weather or flood word), never from the Collector's words, a complaint, a
 * name, a phone number or an address. A question asking for a citizen's details is refused (privacy.ts asksPrivate). Every
 * answer says it came from the web and carries its sources.
 */
import { performance } from "perf_hooks";
import { UA } from "@/lib/collector/pageread";
import { asksPrivate } from "../privacy";
import { relativeTime } from "./brief";
import { injectionLike } from "./compare";
import { type WebDeps, clockOf, listOf, tele, webGet } from "./fetch";
import { readFeed, strip, tag, toMs } from "./related";
import { type Terms, placesIn, termsOf, typesIn } from "./terms";

export interface LookupSource { name: string; title: string; url: string; publishedAt: string | null; licence?: string }
export interface LookupAnswer {
  status: "ok" | "no_public_terms" | "not_public" | "nothing_found" | "unavailable";
  fromWeb: true;
  source: "sachet" | "wikipedia" | "feeds" | null;
  /** the public terms code found in the question (all that was used) */
  terms: Pick<Terms, "places" | "region" | "weather" | "types" | "cyclones" | "day">;
  /** the only text sent anywhere (Wikipedia's search), or null */
  query: string | null;
  first: { en: string; ta: string };
  en: string[];
  ta: string[];
  sources: LookupSource[];
  ms: number;
}

const FIRST = { en: "Looking that up on the web...", ta: "இணையத்தில் தேடுகிறேன்..." };
/** Wikimedia's User-Agent policy: client/version (contact) library; never a browser's. The contact comes from the owner's list. */
export const wikiUserAgent = (contact: string) => `DistrictIQ-Jarvis/1.0 (Chennai District Collectorate console${contact ? `; ${contact}` : ""}) node-bot`;

// ---------------------------------------------------------------- the Met --

interface Alert { title: string; text: string; url: string; at: number | null; author: string }
/** SACHET's author is "controlroom@ndma.gov.in (IMD Chennai)": the issuing office only, never an address read out */
export const issuer = (author: string) => (/\(([^)]{2,60})\)/.exec(author)?.[1] ?? author).replace(/\S+@\S+/g, "").replace(/\s+/g, " ").trim();
function alertsOf(xml: string): Alert[] {
  const out: Alert[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const url = strip(tag(b, "link") ?? "");
    out.push({ title: strip(tag(b, "title") ?? "").slice(0, 300), text: strip(tag(b, "description") ?? "").slice(0, 600), url: /^https?:\/\//.test(url) ? url : "",
      at: toMs(strip(tag(b, "pubDate") ?? "") || null), author: issuer(strip(tag(b, "author") ?? tag(b, "dc:creator") ?? "")) });
  }
  return out;
}
const CHENNAI_REGION = new Set(["Chennai", "Chengalpattu", "Kancheepuram", "Tiruvallur"]);

async function metAnswer(terms: Terms, o: WebDeps, base: Omit<LookupAnswer, "status" | "en" | "ta" | "sources" | "ms" | "source" | "query">): Promise<Omit<LookupAnswer, "ms">> {
  const list = listOf(o), now = clockOf(o)();
  const src = list.sources.sachet;
  const got = await webGet(src.url, o, { kind: "feed", userAgent: UA, accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.5" });
  if (got.status !== "ok") return { ...base, status: "unavailable", source: "sachet", query: null, en: ["The Met department's alert feed could not be reached just now."], ta: ["வானிலை எச்சரிக்கை தளத்தை இப்போது அணுக முடியவில்லை."], sources: [] };
  // Chennai and its districts (the places asked about are in Chennai: SACHET writes district names), within the day asked about
  const want = new Set([...terms.region.filter((r) => CHENNAI_REGION.has(r)), ...(terms.places.length || !terms.region.length ? ["Chennai"] : [])]);
  // today or tomorrow: what was issued in the last 30 hours; yesterday: 12-48 hours ago; no day said: the last 48 hours
  const from = now - (terms.day === 0 || terms.day === 1 ? 30 : 48) * 3600_000, to = terms.day === -1 ? now - 12 * 3600_000 : now + 3600_000;
  const alerts = alertsOf(got.body)
    .filter((a) => a.at == null || (a.at >= from && a.at <= to))
    .filter((a) => { const r = placesIn(`${a.author} ${a.title} ${a.text}`).region; return r.some((x) => want.has(x)) || /\bimd chennai\b/i.test(a.author); })
    .filter((a) => !injectionLike(`${a.title} ${a.text}`))
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    // the same warning re-issued minutes apart is said once (the newest)
    .filter((a, i, all) => all.findIndex((x) => (x.text || x.title).toLowerCase() === (a.text || a.title).toLowerCase()) === i)
    .slice(0, 2);
  if (!alerts.length) {
    return { ...base, status: "nothing_found", source: "sachet", query: null, en: [`From the web: the Met department's alerts on ${src.name} carry no warning for Chennai for that time.`],
      ta: [`இணையத்திலிருந்து: ${src.nameTa} இல் அந்த நேரத்துக்கு சென்னைக்கு எந்த எச்சரிக்கையும் இல்லை.`], sources: [{ name: src.name, title: "SACHET CAP feed", url: src.url, publishedAt: null, licence: "public domain (as the feed states)" }] };
  }
  const en: string[] = [], ta: string[] = [];
  alerts.forEach((a, i) => {
    const iso = a.at ? new Date(a.at).toISOString() : null;
    const when = relativeTime(iso, now), whenTa = relativeTime(iso, now, "ta");
    const quote = (a.text || a.title).replace(/\s+/g, " ").trim();
    const who = /imd/i.test(a.author) ? a.author : "the Met department";
    en.push(i === 0 ? `From the web: ${who}'s latest alert on ${src.name}${when ? `, ${when}` : ""}, says: ${quote}` : `An earlier alert${when ? `, ${when}` : ""}: ${quote}`);
    ta.push(i === 0 ? `இணையத்திலிருந்து: ${src.nameTa} இல் வானிலை ஆய்வு மையத்தின் சமீபத்திய எச்சரிக்கை${whenTa ? `, ${whenTa}` : ""}: ${quote}` : `முந்தைய எச்சரிக்கை${whenTa ? `, ${whenTa}` : ""}: ${quote}`);
  });
  return { ...base, status: "ok", source: "sachet", query: null, en, ta,
    sources: alerts.map((a) => ({ name: a.author || src.name, title: a.title, url: a.url || src.url, publishedAt: a.at ? new Date(a.at).toISOString() : null, licence: "public domain (as the feed states)" })) };
}

// ------------------------------------------------------------- Wikipedia --

/** The search words, from public terms only: a cyclone's name, else a place of ours, with a flood or cyclone word when asked. */
export function wikiQuery(terms: Terms): string | null {
  if (terms.cyclones.length) return `Cyclone ${terms.cyclones[0]}`;
  const place = terms.places[0] ?? terms.region[0];
  if (!place) return null;
  const topic = terms.types.includes("flood") || terms.weather.includes("flood") ? "floods" : terms.weather.includes("cyclone") ? "cyclone" : "";
  return `${place}${topic ? ` ${topic}` : ""}`.slice(0, 60);
}

async function wikiAnswer(terms: Terms, o: WebDeps, base: Omit<LookupAnswer, "status" | "en" | "ta" | "sources" | "ms" | "source" | "query">): Promise<Omit<LookupAnswer, "ms">> {
  const list = listOf(o);
  const src = list.sources.wikipedia;
  const q = wikiQuery(terms);
  const none = (status: LookupAnswer["status"], en: string, ta: string) => ({ ...base, status, source: "wikipedia" as const, query: q, en: [en], ta: [ta], sources: [] });
  if (!q) return none("no_public_terms", "I can look up only public places and events on the web.", "இணையத்தில் பொது இடங்களையும் நிகழ்வுகளையும் மட்டுமே தேட முடியும்.");
  const ua = wikiUserAgent(list.contact);
  const search = await webGet(`${src.url}/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=3`, o, { kind: "api", userAgent: ua, accept: "application/json" });
  if (search.status !== "ok") return none("unavailable", "Wikipedia could not be reached just now.", "விக்கிப்பீடியாவை இப்போது அணுக முடியவில்லை.");
  let key: string | null = null;
  try { key = (JSON.parse(search.body) as { pages?: { key?: string }[] }).pages?.[0]?.key ?? null; } catch { key = null; }
  if (!key || !/^[^/?#\s]{1,200}$/.test(key)) return none("nothing_found", "Wikipedia has nothing on that.", "விக்கிப்பீடியாவில் இதைப் பற்றி எதுவும் இல்லை.");
  const sum = await webGet(`${src.url}/api/rest_v1/page/summary/${encodeURIComponent(key)}`, o, { kind: "api", userAgent: ua, accept: "application/json" });
  if (sum.status !== "ok") return none("unavailable", "Wikipedia could not be reached just now.", "விக்கிப்பீடியாவை இப்போது அணுக முடியவில்லை.");
  let page: { title?: string; extract?: string; timestamp?: string; content_urls?: { desktop?: { page?: string } } } = {};
  try { page = JSON.parse(sum.body); } catch { page = {}; }
  const sentencesOf = String(page.extract ?? "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=[A-Z])/).filter((s) => !injectionLike(s));
  const text = sentencesOf.slice(0, 2).join(" ");
  if (!text) return none("nothing_found", "Wikipedia has nothing on that.", "விக்கிப்பீடியாவில் இதைப் பற்றி எதுவும் இல்லை.");
  const url = page.content_urls?.desktop?.page ?? `${src.url}/wiki/${encodeURIComponent(key)}`;
  return { ...base, status: "ok", source: "wikipedia", query: q, en: [`From the web, according to Wikipedia: ${text}`], ta: [`இணையத்திலிருந்து, விக்கிப்பீடியாவின்படி: ${text}`],
    sources: [{ name: "Wikipedia", title: String(page.title ?? key).slice(0, 200), url, publishedAt: page.timestamp ?? null, licence: "CC BY-SA 4.0" }] };
}

// ------------------------------------------------------------------ feeds --

async function feedsAnswer(terms: Terms, o: WebDeps, base: Omit<LookupAnswer, "status" | "en" | "ta" | "sources" | "ms" | "source" | "query">): Promise<Omit<LookupAnswer, "ms">> {
  const list = listOf(o), now = clockOf(o)();
  const reads = await Promise.all(list.outlets.flatMap((out) => out.feeds.map((f) => readFeed(out, f, o).then((r) => ({ out, r })))));
  const from = now - (terms.day === -1 ? 48 : 30) * 3600_000;
  const hits = reads.flatMap(({ out, r }) => r.entries.map((e) => ({ out, e })))
    .filter(({ e }) => e.publishedAt == null || e.publishedAt >= from)
    .filter(({ e }) => {
      const text = `${e.title} . ${e.snippet}`;
      const places = placesIn(text).places, types = typesIn(text);
      const placeOk = !terms.places.length || terms.places.some((p) => places.includes(p));
      const typeOk = !terms.types.length || terms.types.some((t) => types.includes(t));
      return placeOk && typeOk && (terms.places.length > 0 || terms.types.length > 0);
    })
    .filter(({ e }) => !injectionLike(e.title))
    .sort((a, b) => (b.e.publishedAt ?? 0) - (a.e.publishedAt ?? 0));
  const seen = new Set<string>();
  const top = hits.filter(({ out }) => (seen.has(out.id) ? false : (seen.add(out.id), true))).slice(0, 3);
  if (!top.length) return { ...base, status: reads.some(({ r }) => r.status === "ok") ? "nothing_found" : "unavailable", source: "feeds", query: null,
    en: ["From the web: the outlets' latest reports carry nothing on that."], ta: ["இணையத்திலிருந்து: செய்தித்தாள்களின் சமீபத்திய செய்திகளில் இதைப் பற்றி எதுவும் இல்லை."], sources: [] };
  const en = top.map(({ out, e }, i) => { const w = relativeTime(e.publishedAt ? new Date(e.publishedAt).toISOString() : null, now); return `${i === 0 ? "From the web: " : ""}${out.name} reported${w ? ` ${w}` : ""}: ${e.title}`; });
  const ta = top.map(({ out, e }, i) => { const w = relativeTime(e.publishedAt ? new Date(e.publishedAt).toISOString() : null, now, "ta"); return `${i === 0 ? "இணையத்திலிருந்து: " : ""}${out.nameTa}${w ? ` ${w}` : ""} வெளியிட்ட செய்தி: ${e.title}`; });
  return { ...base, status: "ok", source: "feeds", query: null, en, ta,
    sources: top.map(({ out, e }) => ({ name: out.name, title: e.title, url: e.url, publishedAt: e.publishedAt ? new Date(e.publishedAt).toISOString() : null })) };
}

// ------------------------------------------------------------------ route --

const BACKGROUND = /\b(what|who|which) (?:is|was|were|are)\b|\bhistory\b|\btell me about\b|\bbackground\b|என்றால் என்ன|பற்றி சொல்|வரலாறு/i;
const NEWSY = /\b(news|report\w*|papers?|newspapers?|media|outlets?|coverage)\b|செய்தி|பத்திரிகை/i;

/**
 * A public question answered from the allowed sources, with `fromWeb: true` and its sources. Never throws. The question's own words
 * are never sent: only terms.ts's public terms decide what is read, and only Wikipedia gets a query (built from them).
 */
export async function webLookup(question: string, o: WebDeps = {}): Promise<LookupAnswer> {
  const t0 = performance.now();
  const q = String(question ?? "").slice(0, 500);
  const t = termsOf(q);
  const terms = { places: t.places, region: t.region, weather: t.weather, types: t.types, cyclones: t.cyclones, day: t.day };
  const base = { fromWeb: true as const, terms, first: FIRST };
  const finish = (a: Omit<LookupAnswer, "ms">): LookupAnswer => {
    const ms = Math.round(performance.now() - t0);
    tele(o, "web_lookup", { why: a.status, kind: a.source ?? "none", ms, count: a.sources.length });
    return { ...a, ms };
  };
  if (asksPrivate(q)) return finish({ ...base, status: "not_public", source: null, query: null, en: ["I look up only public information on the web, never a citizen's details."], ta: ["இணையத்தில் பொதுத் தகவல்களை மட்டுமே தேடுவேன்; குடிமக்களின் விவரங்களை அல்ல."], sources: [] });
  const weatherAsk = t.weather.length > 0 && !t.cyclones.length && !(BACKGROUND.test(q) && t.places.length && !t.weather.some((w) => w === "met" || w === "alert" || w === "rain"));
  try {
    if (weatherAsk) return finish(await metAnswer(t, o, base));
    if (t.cyclones.length || (BACKGROUND.test(q) && !NEWSY.test(q) && (t.places.length || t.region.length))) return finish(await wikiAnswer(t, o, base));
    if (t.places.length || t.types.length) return finish(await feedsAnswer(t, o, base));
  } catch {
    return finish({ ...base, status: "unavailable", source: null, query: null, en: ["The web lookup failed just now."], ta: ["இணையத் தேடல் இப்போது தோல்வியடைந்தது."], sources: [] });
  }
  return finish({ ...base, status: "no_public_terms", source: null, query: null, en: ["I can look up only public things on the web: weather warnings, places and events in the news."],
    ta: ["இணையத்தில் பொதுவானவற்றை மட்டுமே தேட முடியும்: வானிலை எச்சரிக்கைகள், இடங்கள், செய்திகளில் வந்த நிகழ்வுகள்."], sources: [] });
}
