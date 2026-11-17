/**
 * v6, Phase 4: when a sentence asks Jarvis to read the news or to look something up on the web, and what goes on its screen.
 *
 *   newsAsk(text, on)   "read the article", "what does the report say", "what are other papers saying", "read The Hindu's report",
 *                       "the second article", Tamil and Tanglish the same: the news item (a news list on screen) or the incident (its
 *                       case screen) the server reads ({ id } or { incident }). "Look it up", "search the web", "what did the Met
 *                       department say about tonight's rain", "will it rain tonight": a public question ({ question }), only
 *                       when it asks for the web or for a forecast or warning, never for the console's own complaints or readings.
 *   newsScreen(...)     the Stage document for the answer: the spoken lines as a Note, the links in a NewsReader list (the panels
 *                       the Stage already draws), "From the web" in its notes. Nothing a page said becomes a step or a button.
 *
 * Pure: no network, no React. The client (Thunai.tsx newsTurn) streams /news and calls these.
 */
import { type StageDocT, checkStage } from "./stage";

export type NewsBodyOut = { id: string } | { incident: string } | { question: string };
export type NewsAskT = { kind: "read"; body: { id: string } | { incident: string } } | { kind: "lookup"; body: { question: string } } | { kind: "which" };

/** What is on Jarvis's screen that a "read the article" can mean. */
export interface NewsOnScreen {
  /** the incident whose case screen is open */
  incident?: string | null;
  /** the news list on screen, in order (NewsReader items: their id is the stored document's) */
  items?: { id: string; source: string | null; title?: string }[];
  /** the item being read aloud now (the Stage's highlight), if any */
  reading?: string | null;
}

const ID = /^[A-Za-z0-9_:.-]{1,80}$/;
const norm = (t: string) => t.toLowerCase().replace(/[’']/g, "'").replace(/[.?!,;]+/g, " ").replace(/\s+/g, " ").trim();

// ---- reading a report (a news item or an incident's own news report)
const READ_EN = [
  /\b(?:read|go through)\b.{0,30}\b(?:article|report|story|news report|news item|coverage|piece|write-?up)\b/,
  /\bwhat (?:does|did|do) (?:the|this|that|their|its)?\s*(?:article|report|story|paper|papers|news|newspaper|press|media|outlet)\b.{0,20}\b(?:say|says|report|reported|write|wrote)\b/,
  /\bwhat (?:are|do|did) (?:the )?other (?:papers|newspapers|outlets|channels|reports|media|sources)\b/,
  /\b(?:other|more|related|wider) (?:coverage|reports|reporting)\b/,
  /\bcompare (?:the )?(?:coverage|reports|reporting|papers)\b/,
  /\bwhat (?:is|are) the (?:papers|media|news) saying\b/,
  /\bread (?:the )?(?:hindu|times of india|toi|dt next|dtnext|new indian express|nie|dinamani|dinamalar|daily thanthi|thanthi)\b/
];
const READ_TA = [
  /(?:செய்தி|கட்டுரை|அறிக்கை|ரிப்போர்ட்)(?:யை|யைப்|ஐ|யை\s)?\s*(?:படி|படிங்க|படியுங்கள்|படித்து|வாசி|வாசிங்க)/u,
  /(?:செய்தி|கட்டுரை|பத்திரிகை|பத்திரிகைகள்|நாளிதழ்|ஊடகம்|ஊடகங்கள்)(?:யில்|களில்|ல)?\s*(?:என்ன)\s*(?:சொல்|கூறு|போட்டிருக்|எழுதியிருக்|வந்திருக்)/u,
  /மற்ற\s*(?:பத்திரிகை|செய்தி|நாளிதழ்|ஊடக)/u
];
const READ_TG = [
  /\b(?:article|report|news|story)\s*(?:a\s*|ah\s*|ai\s*)?(?:padi|padinga|padichu|vaasi|vasi)\b/,
  /\b(?:news|paper|papers|article|report)\s*(?:la|le|il)\s*enna\s*(?:solr|solraanga|sollirukaanga|potrukaanga|pottirukanga|vandhirukku|irukku)\b/,
  /\bmatha (?:papers|paper|news|channels)\b/
];
const NEWSY = /\b(?:article|news report|news item|coverage|papers|newspapers?|press|outlets?|hindu|times of india|dt ?next|indian express|dinamani|dinamalar|thanthi)\b/;
const ORD: [RegExp, number][] = [
  [/\b(?:first|1st|mudhal)\b|முதல்/u, 1], [/\b(?:second|2nd|rendavathu|rendaavadhu)\b|இரண்டாவது|ரெண்டாவது/u, 2], [/\b(?:third|3rd|moonavathu|moonaavadhu)\b|மூன்றாவது/u, 3],
  [/\b(?:fourth|4th)\b|நான்காவது/u, 4], [/\b(?:fifth|5th)\b|ஐந்தாவது/u, 5], [/\b(?:sixth|6th)\b|ஆறாவது/u, 6], [/\b(?:seventh|7th)\b|ஏழாவது/u, 7],
  [/\b(?:eighth|8th)\b|எட்டாவது/u, 8], [/\b(?:ninth|9th)\b|ஒன்பதாவது/u, 9], [/\b(?:tenth|10th)\b|பத்தாவது/u, 10]
];
const OUTLETS: [RegExp, RegExp][] = [
  [/\bhindu\b/, /hindu/i], [/\b(?:times of india|toi)\b/, /times of india/i], [/\bdt ?next\b/, /dt ?next/i], [/\b(?:new indian express|nie|express)\b/, /indian express/i],
  [/\bdinamani\b|தினமணி/u, /dinamani|தினமணி/i], [/\bdinamalar\b|தினமலர்/u, /dinamalar|தினமலர்/i], [/\b(?:daily )?thanthi\b|தந்தி/u, /thanthi|தந்தி/i]
];

// ---- a public question for the web
const WEB_CUE = /\b(?:look (?:it|this|that) up|look up|search (?:the )?(?:web|internet|online)|(?:search|check|look) online|on the (?:web|internet|net)|google (?:it|that|this)|check (?:the )?(?:web|internet|news online))\b|இணையத்தில்|இணையதளத்தில்|ஆன்லைனில்|\bnet ?la\b|\bgoogle pannu\b/u;
const FORECAST = /\b(?:met (?:department|dept|office|centre|center)|imd|india meteorological|regional meteorological|rmc|weather (?:department|office|forecast|warning|alert|report|update|bulletin)|forecast|nowcast|red alert|orange alert|yellow alert|will it rain|going to rain|rain (?:tonight|tomorrow)|(?:tonight|tomorrow)'?s? (?:rain|weather)|cyclone|depression|landfall)\b|வானிலை\s*(?:ஆய்வு|மைய|அறிக்கை|முன்னறிவிப்பு|எச்சரிக்கை)|மழை\s*(?:எச்சரிக்கை|முன்னறிவிப்பு)|புயல்|ரெட் அலர்ட்|ஆரஞ்சு அலர்ட்|நாளை மழை|இன்று இரவு மழை|\bmazhai (?:varuma|varumaa|warning|alert)\b|\bpuyal\b/u;
/** the console's own nouns: a question about them is the console's to answer, unless it asks for the web in words */
const CONSOLE = /\b(?:complaints?|grievances?|petitions?|cases|incidents?|tickets?|officers?|departments? (?:pending|backlog)|backlog|sla|overdue|readings?|rainfall (?:recorded|readings?))\b|புகார்|சம்பவ|மனு/u;

const pickItem = (t: string, on: NewsOnScreen): { id: string } | null => {
  // a sources list Jarvis drew itself (newsScreen: "web-1"...) holds links, not stored reports
  const items = (on.items ?? []).filter((x) => ID.test(x.id) && !/^web-\d/.test(x.id));
  if (!items.length) return null;
  const num = /\b(?:number|no|item|article|report|story|headline)\s*(\d{1,2})\b/.exec(t);
  if (num) { const i = Number(num[1]) - 1; return items[i] ? { id: items[i].id } : null; }
  for (const [re, n] of ORD) if (re.test(t)) return items[n - 1] ? { id: items[n - 1].id } : null;
  if (/\blast\b|கடைசி|kadaisi/u.test(t)) return { id: items[items.length - 1].id };
  for (const [said, src] of OUTLETS) if (said.test(t)) { const x = items.find((y) => src.test(y.source ?? "")); if (x) return { id: x.id }; }
  const r = on.reading ? items.find((x) => x.id === on.reading) : null;
  return { id: (r ?? items[0]).id };
};

/** A sentence that asks for the news to be read or for the web: what the server is sent, or null (not this lane's). */
export function newsAsk(raw: string, on: NewsOnScreen = {}): NewsAskT | null {
  const t = norm(raw);
  if (!t || t.length > 300) return null;
  const reads = READ_EN.some((re) => re.test(t)) || READ_TA.some((re) => re.test(raw)) || READ_TG.some((re) => re.test(t));
  if (reads) {
    const item = pickItem(t, on);
    if (item) return { kind: "read", body: item };
    if (on.incident && ID.test(on.incident)) return { kind: "read", body: { incident: on.incident } };
    // "what are other papers saying" about nothing on screen: the web, if a public subject is named; else ask which
    if (WEB_CUE.test(t) || FORECAST.test(t)) return { kind: "lookup", body: { question: raw.trim().slice(0, 500) } };
    // nothing on screen to read: "which report?" only when it plainly means the press ("the weekly report" is the planner's)
    return NEWSY.test(t) || READ_TA.some((re) => re.test(raw)) || READ_TG.some((re) => re.test(t)) ? { kind: "which" } : null;
  }
  if (WEB_CUE.test(t) || WEB_CUE.test(raw)) return { kind: "lookup", body: { question: raw.trim().slice(0, 500) } };
  if ((FORECAST.test(t) || FORECAST.test(raw)) && !CONSOLE.test(t) && !CONSOLE.test(raw)) return { kind: "lookup", body: { question: raw.trim().slice(0, 500) } };
  return null;
}

/** "Which report?" when nothing on screen is a report */
export const whichLine = { en: "Which report? Open an incident or the news first, then say \"read the article\".", ta: "எந்தச் செய்தி? முதலில் ஒரு சம்பவத்தையோ செய்திகளையோ திறந்து, \"செய்தியைப் படி\" என்று சொல்லுங்கள்." };
/** an answer that could not be had */
export const failLine = (why: string | undefined, lang: "en" | "ta"): string => {
  if (why === "no_news") return lang === "ta" ? "இந்தச் சம்பவத்துக்கு செய்தி அறிக்கை இல்லை; இது புகார்கள் மூலம் வந்தது." : "This incident has no news report; it came from complaints, not the press.";
  if (why === "not_found") return lang === "ta" ? "அந்தச் செய்தி கிடைக்கவில்லை." : "I could not find that report.";
  return lang === "ta" ? "இப்போது இணையத்திலிருந்து படிக்க முடியவில்லை." : "I couldn't read from the web just now.";
};

export interface NewsLink { outlet: string; title: string; url: string; publishedAt: string | null }

/** The Stage document for a news answer: what was said (a Note) and every source as a link (a NewsReader list). Checked; null if it fails. */
export function newsScreen(o: { lang: "en" | "ta"; kind: "read" | "lookup"; title: string | null; en: string[]; ta: string[]; links: NewsLink[]; now?: number }): StageDocT | null {
  const L = (en: string, ta: string) => (o.lang === "ta" ? ta : en);
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  const said = (o.lang === "ta" ? o.ta : o.en).join(" ").trim();
  const seen = new Set<string>();
  const links = o.links.filter((x) => /^https?:\/\//.test(x.url) && x.url.length <= 2000 && !seen.has(x.url) && seen.add(x.url)).slice(0, 10);
  const title = o.kind === "lookup" ? L("From the web", "இணையத்திலிருந்து") : clip(o.title || L("The news report", "செய்தி அறிக்கை"), 200);
  const blocks: StageDocT["blocks"] = [{ kind: "Note", id: "brief", text: clip(said || L("Nothing to read out.", "படிக்க எதுவும் இல்லை."), 400) }];
  if (links.length) blocks.push({ kind: "NewsReader", id: "sources", title: L("Sources", "ஆதாரங்கள்"), total: links.length,
    items: links.map((x, i) => ({ id: `web-${i + 1}`, title: clip(x.title || x.outlet, 300), source: clip(x.outlet, 80) || null, t: x.publishedAt ? x.publishedAt.slice(0, 30) : null, place: null, incidentId: null, url: x.url })) });
  const doc = {
    v: 1, id: `news-${(o.now ?? Date.now()).toString(36)}`, recipe: "news", title, takeaway: null,
    say: { en: clip(o.en.join(" "), 600), ta: clip(o.ta.join(" "), 900) }, blocks,
    scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null }, slots: { web: true },
    sources: [...new Set(links.map((x) => clip(x.outlet, 80)))].slice(0, 10), asOf: null,
    notes: [L("From the web: read just now, nothing kept. Quotes are the outlets' own.", "இணையத்திலிருந்து: இப்போது படித்தது, எதுவும் சேமிக்கப்படவில்லை. மேற்கோள்கள் அந்தந்த ஊடகங்களுடையவை.")],
    lang: o.lang, titles: { en: o.kind === "lookup" ? "From the web" : clip(o.title || "The news report", 200), ta: o.kind === "lookup" ? "இணையத்திலிருந்து" : clip(o.title || "செய்தி அறிக்கை", 200) }
  };
  const c = checkStage(doc);
  return c.ok ? c.doc : null;
}

/** Read an NDJSON body, one event a line, as each line arrives. */
export async function readNdjson(body: ReadableStream<Uint8Array> | null, on: (e: Record<string, unknown>) => void, live: () => boolean = () => true): Promise<void> {
  if (!body) return;
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (!live()) { await reader.cancel().catch(() => undefined); return; }
    if (value) buf += dec.decode(value, { stream: !done });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try { on(JSON.parse(line) as Record<string, unknown>); } catch { /* a broken line is skipped */ }
    }
    if (done) break;
  }
  const last = buf.trim();
  if (last) { try { on(JSON.parse(last) as Record<string, unknown>); } catch { /* */ } }
}

export type ReportRef = { source?: string | null; docId?: string | null; t?: string | null };
/** The newest news report's stored id among an incident's reports (the server's newsdoc.ts reads them); null for complaints alone. */
export function newestNewsDoc(reports: ReportRef[] | null | undefined): string | null {
  const news = (reports ?? []).filter((r) => r.source === "news" && typeof r.docId === "string" && r.docId);
  news.sort((a, b) => String(b.t ?? "").localeCompare(String(a.t ?? "")));
  return news[0]?.docId ?? null;
}
