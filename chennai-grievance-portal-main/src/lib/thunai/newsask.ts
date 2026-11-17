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
export type NewsAskT = { kind: "read"; body: { id: string } | { incident: string } } | { kind: "lookup"; body: { question: string } }
  | { kind: "which"; why: "none" | "outlet" | "count"; /** the outlet's own name ("The Times of India") */ outlet?: string; n?: number };

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
// (the independent check, 17 Nov: unanchored, "I have read the report, now draft..." was a news read; "other reports from Adyar" too)
const LEAD = "^(?:(?:hey |hi |ok |okay )?jarvis |please |ok |okay |now |and |so |can you |could you |would you |just )*";
const READ_EN = [
  new RegExp(`${LEAD}(?:read|go through|read out|read me)\\b.{0,30}\\b(?:article|report|story|news report|news item|coverage|piece|write-?up)\\b`),
  /\bwhat (?:does|did|do) (?:the|this|that|their|its)?\s*(?:article|report|story|paper|papers|news|newspaper|press|media|outlet)\b.{0,20}\b(?:say|says|report|reported|write|wrote)\b/,
  /\bwhat (?:are|do|did) (?:the )?other (?:papers|newspapers|outlets|channels|media)\b/,
  /\b(?:other|more|related|wider) (?:news )?coverage\b|\bother (?:news ?papers|papers|outlets|channels|media) (?:say|saying|report|reported|wrote|write)\b/,
  /\bcompare (?:the )?(?:coverage|papers|outlets)\b/,
  /\bwhat (?:is|are) the (?:papers|media|news) saying\b/,
  new RegExp(`${LEAD}read (?:the )?(?:hindu|times of india|toi|dt next|dtnext|new indian express|nie|dinamani|dinamalar|daily thanthi|thanthi)\\b`)
];
/** a report of the console's own (an officer's, an action-taken, a weekly one): not the press */
const OWN_REPORT = /\b(?:officer'?s?|action[- ]taken|atr|status|progress|weekly|monthly|daily|quarterly|annual|inspection|field|audit|my|our|department'?s?|dept|zone|ward|sla|incident|police|fir) reports?\b/;
/** a negation: "don't read the article", "no need to read it" */
const NEGATED = /\b(?:don'?t|dont|do not|never|no need to|stop)\b|வேண்டாம்|வேணாம்|\bvenaam\b|\bvendaam\b/u;
/** a mission or a brief ("get everything ready", "prepare for heavy rain", "brief me on the cyclone"): theirs, never a look-up */
const MISSION_LIKE = /\b(?:get (?:everything |things |it |them |all )?ready|be ready|prepare|preparation|brief me|briefing|war ?room|board|mission|plan for)\b|தயார்|தயாரா/u;
const READ_TA = [
  // (சேதி: the spoken form of செய்தி, as Whisper writes "முதல் செய்தியைப் படியுங்கள்" said by a Tamil voice: the 17 Nov clip check)
  /(?:செய்தி|சேதி|கட்டுரை|அறிக்கை|ரிப்போர்ட்)(?:யை|யைப்|ஐ|யை\s)?\s*(?:படி|படிங்க|படியுங்கள்|படித்து|வாசி|வாசிங்க)/u,
  /(?:செய்தி|கட்டுரை|பத்திரிகை|பத்திரிகைகள்|நாளிதழ்|ஊடகம்|ஊடகங்கள்)(?:யில்|களில்|ல)?\s*(?:என்ன)\s*(?:சொல்|கூறு|போட்டிருக்|எழுதியிருக்|வந்திருக்)/u,
  /மற்ற\s*(?:பத்திரிகை|செய்தி|நாளிதழ்|ஊடக)/u
];
const READ_TG = [
  /\b(?:article|report|news|story)\s*(?:a\s*|ah\s*|ai\s*)?(?:padi|padinga|padichu|vaasi|vasi)\b/,
  /\b(?:news|paper|papers|article|report)\s*(?:la|le|il)\s*enna\s*(?:solr|solraanga|sollirukaanga|potrukaanga|pottirukanga|vandhirukku|irukku)\b/,
  /\bmatha (?:papers|paper|news|channels)\b/
];
/**
 * v7: "tell me about this news", "what is this story about", "explain that article": a request to be told about ONE report on the screen (the one
 * in focus, the one named by its place or outlet, else the first), said with "this/that" or an ordinal. "Tell me about the news" in general is
 * not this lane's: the news screen answers it, and the aide summarises it.
 */
const TELL_EN = [
  new RegExp(`${LEAD}(?:tell me|tell us|talk me through|brief me|fill me in)(?: (?:more|a bit|briefly))? (?:about|on) (?:this|that|the (?:first|second|third|fourth|fifth|last|top)) ?(?:news|story|article|report|headline|item|piece)\\b`),
  new RegExp(`${LEAD}(?:explain|summari[sz]e|sum up)(?: me)? (?:this|that|the (?:first|second|third|fourth|fifth|last|top)) ?(?:news|story|article|report|headline|item|piece)\\b`),
  /\bwhat(?:'s| is| was) (?:this|that) (?:news|story|article|report|headline|piece)(?: (?:item|report))? (?:about|saying)\b/,
  /\bwhat (?:is|does) (?:this|that) (?:news|story|article|report) (?:say|mean)\b/
];
const TELL_TA = [/(?:இந்த|இந்தச்|அந்த|அந்தச்)\s*(?:செய்தி|சேதி|கட்டுரை|ரிப்போர்ட்)(?:யை|யைப்|யின்)?\s*(?:பற்றி|பத்தி)?\s*(?:சொல்|விளக்கு|சுருக்கமா)/u];
const TELL_TG = [/\b(?:indha|andha|intha|antha)\s+(?:news|story|article|report|seithi)\s*(?:a\s*|ah\s*)?(?:pathi|patthi|paththi)?\s*(?:sollu|sollunga|explain pannu|enna)\b/];
const NEWSY = /\b(?:article|news report|news item|coverage|papers|newspapers?|press|outlets?|hindu|times of india|dt ?next|indian express|dinamani|dinamalar|thanthi)\b/;
const ORD: [RegExp, number][] = [
  [/\b(?:first|1st|mudhal)\b|முதல்/u, 1], [/\b(?:second|2nd|rendavathu|rendaavadhu)\b|இரண்டாவது|ரெண்டாவது/u, 2], [/\b(?:third|3rd|moonavathu|moonaavadhu)\b|மூன்றாவது/u, 3],
  [/\b(?:fourth|4th)\b|நான்காவது/u, 4], [/\b(?:fifth|5th)\b|ஐந்தாவது/u, 5], [/\b(?:sixth|6th)\b|ஆறாவது/u, 6], [/\b(?:seventh|7th)\b|ஏழாவது/u, 7],
  [/\b(?:eighth|8th)\b|எட்டாவது/u, 8], [/\b(?:ninth|9th)\b|ஒன்பதாவது/u, 9], [/\b(?:tenth|10th)\b|பத்தாவது/u, 10]
];
/** an outlet: as said, as an item's source names it (a story's source may list several outlets), and its own name to say */
const OUTLETS: [RegExp, RegExp, string][] = [
  // the second pattern is an outlet's WHOLE name as a screen lists it (one of a story's " · "-joined outlets): Hindu Tamil Thisai is not
  // The Hindu, Thanthi TV not Daily Thanthi, The Indian Express not The New Indian Express (the second check's skeptic, 17 Nov)
  [/\bhindu\b/, /^(?:the )?hindu$/i, "The Hindu"], [/\b(?:times of india|toi)\b/, /^(?:the )?times of india$/i, "The Times of India"], [/\bdt ?next\b/, /^dt ?next$/i, "DT Next"],
  [/\b(?:new indian express|nie|express)\b/, /^(?:the )?new indian express$/i, "The New Indian Express"], [/\bdinamani\b|தினமணி/u, /^dinamani$|^தினமணி$/iu, "Dinamani"],
  [/\bdinamalar\b|தினமலர்/u, /^dinamalar$|^தினமலர்$/iu, "Dinamalar"], [/\b(?:daily )?thanthi\b|தந்தி/u, /^(?:daily )?thanthi$|^தினத்தந்தி$/iu, "Daily Thanthi"]
];
/** the outlets one item lists (a story on the console's panel lists every outlet that ran it, joined by " · ") */
const namesOf = (source: string | null | undefined): string[] => String(source ?? "").split(/\s+·\s+/).map((s) => s.trim()).filter(Boolean);

// ---- a public question for the web
const WEB_CUE = /\b(?:look (?:it|this|that) up|look up|search (?:the )?(?:web|internet|online)|(?:search|check|look) online|on the (?:web|internet|net)|google (?:it|that|this)|check (?:the )?(?:web|internet|news online))\b|இணையத்தில்|இணையதளத்தில்|ஆன்லைனில்|\bnet ?la\b|\bgoogle pannu\b/u;
const FORECAST = /\b(?:met (?:department|dept|office|centre|center)|imd|india meteorological|regional meteorological|rmc|weather (?:department|office|forecast|warning|alert|report|update|bulletin)|forecast|nowcast|red alert|orange alert|yellow alert|will it rain|going to rain|rain (?:tonight|tomorrow)|(?:tonight|tomorrow)'?s? (?:rain|weather)|cyclone|depression|landfall)\b|வானிலை\s*(?:ஆய்வு|மைய|அறிக்கை|முன்னறிவிப்பு|எச்சரிக்கை)|மழை\s*(?:எச்சரிக்கை|முன்னறிவிப்பு)|புயல்|ரெட் அலர்ட்|ஆரஞ்சு அலர்ட்|நாளை மழை|இன்று இரவு மழை|\bmazhai (?:varuma|varumaa|warning|alert)\b|\bpuyal\b/u;
/** the console's own nouns: a question about them is the console's to answer, unless it asks for the web in words */
// (the independent check: the console's IMD warning level is its own metric; zones on alert, a look-up of complaints or an incident, too)
const CONSOLE = /\b(?:complaints?|grievances?|petitions?|cases|incidents?|tickets?|officers?|departments? (?:pending|backlog)|backlog|sla|overdue|readings?|rainfall (?:recorded|readings?)|zones?|wards?|taluks?|(?:warning|alert) level)\b|புகார்|சம்பவ|மனு|எச்சரிக்கை\s*நிலை|மண்டல/u;

type Pick = { id: string } | { why: "outlet"; outlet: string } | { why: "count"; n: number } | null;
const pickItem = (t: string, on: NewsOnScreen): Pick => {
  // a sources list Jarvis drew itself (newsScreen: "web-1"...) holds links, not stored reports
  const items = (on.items ?? []).filter((x) => ID.test(x.id) && !/^web-\d/.test(x.id));
  if (!items.length) return null;
  const num = /\b(?:number|no|item|article|report|story|headline)\s*(\d{1,2})\b/.exec(t);
  if (num) { const i = Number(num[1]) - 1; return items[i] ? { id: items[i].id } : { why: "count", n: items.length }; }
  for (const [re, n] of ORD) if (re.test(t)) return items[n - 1] ? { id: items[n - 1].id } : { why: "count", n: items.length };
  if (/\blast\b|கடைசி|kadaisi/u.test(t)) return { id: items[items.length - 1].id };
  // an outlet named: its report, or that it is not on the screen (never another outlet's in its place)
  for (const [said, src, name] of OUTLETS) {
    if (said.test(t)) { const x = items.find((y) => namesOf(y.source).some((n) => src.test(n))); return x ? { id: x.id } : { why: "outlet", outlet: name }; }
  }
  const r = on.reading ? items.find((x) => x.id === on.reading) : null;
  return { id: (r ?? items[0]).id };
};

/** A sentence that asks for the news to be read or for the web: what the server is sent, or null (not this lane's). */
export function newsAsk(raw: string, on: NewsOnScreen = {}): NewsAskT | null {
  const t = norm(raw);
  if (!t || t.length > 300) return null;
  // a negation, a mission or a brief is never this lane's (the independent check, 17 Nov); "brief me on this news" names one report (v7)
  const thisReport = TELL_EN.some((re) => re.test(t)) && /\b(?:this|that)\b/.test(t);
  if (NEGATED.test(t) || NEGATED.test(raw) || ((MISSION_LIKE.test(t) || MISSION_LIKE.test(raw)) && !thisReport)) return null;
  const reads = !OWN_REPORT.test(t) && (READ_EN.some((re) => re.test(t)) || READ_TA.some((re) => re.test(raw)) || READ_TG.some((re) => re.test(t)));
  // v7: "tell me about this news" is a read of the report on the screen, when there is one (else the news screen and its summary answer it)
  const tells = !reads && !OWN_REPORT.test(t) && (TELL_EN.some((re) => re.test(t)) || TELL_TA.some((re) => re.test(raw)) || TELL_TG.some((re) => re.test(t)));
  if (tells) {
    const item = pickItem(t, on);
    if (item && "id" in item) return { kind: "read", body: item };
    if (item) return { kind: "which", ...item };
    if (on.incident && ID.test(on.incident)) return { kind: "read", body: { incident: on.incident } };
    return null;
  }
  if (reads) {
    const item = pickItem(t, on);
    if (item && "id" in item) return { kind: "read", body: item };
    if (item) return { kind: "which", ...item };
    if (on.incident && ID.test(on.incident)) return { kind: "read", body: { incident: on.incident } };
    // "what are other papers saying" about nothing on screen: the web, if a public subject is named; else ask which
    if ((WEB_CUE.test(t) || FORECAST.test(t)) && !CONSOLE.test(t)) return { kind: "lookup", body: { question: raw.trim().slice(0, 500) } };
    // nothing on screen to read: "which report?" only when it plainly means the press ("the weekly report" is the planner's)
    return NEWSY.test(t) || READ_TA.some((re) => re.test(raw)) || READ_TG.some((re) => re.test(t)) ? { kind: "which", why: "none" } : null;
  }
  // the console's own records ("look up the complaints in Adyar", "incident 1234", "zones on red alert") are the console's, web words or not
  if (CONSOLE.test(t) || CONSOLE.test(raw)) return null;
  if (WEB_CUE.test(t) || WEB_CUE.test(raw) || FORECAST.test(t) || FORECAST.test(raw)) return { kind: "lookup", body: { question: raw.trim().slice(0, 500) } };
  return null;
}

/** what is said when nothing on screen is the report asked for: none open, that outlet's is not there, or fewer than asked */
export function whichLine(w: Extract<NewsAskT, { kind: "which" }>, lang: "en" | "ta"): string {
  if (w.why === "outlet") {
    // the outlet's own name, never the words heard title-cased ("a The Hindu", "a Toi" were said); a name takes no article
    const said = (w.outlet ?? "").trim();
    const name = OUTLETS.find(([re]) => re.test(norm(said)))?.[2] ?? said;
    if (!name) return lang === "ta" ? "திரையில் அந்தச் செய்தி இல்லை." : "I don't see that report on the screen.";
    return lang === "ta" ? `திரையில் ${name} செய்தி இல்லை.` : `I don't see ${name}'s report on the screen.`;
  }
  if (w.why === "count") return lang === "ta" ? `இங்கே ${w.n ?? 0} செய்திகள் மட்டுமே உள்ளன.` : `There ${w.n === 1 ? "is only 1 report" : `are only ${w.n ?? 0} reports`} here.`;
  return lang === "ta" ? "எந்தச் செய்தி? முதலில் ஒரு சம்பவத்தையோ செய்திகளையோ திறந்து, \"செய்தியைப் படி\" என்று சொல்லுங்கள்." : "Which report? Open an incident or the news first, then say \"read the article\".";
}
/** an answer that could not be had */
export const failLine = (why: string | undefined, lang: "en" | "ta"): string => {
  if (why === "no_news") return lang === "ta" ? "இந்தச் சம்பவத்துக்கு செய்தி அறிக்கை இல்லை; இது புகார்கள் மூலம் வந்தது." : "This incident has no news report; it came from complaints, not the press.";
  if (why === "not_found") return lang === "ta" ? "அந்தச் செய்தி கிடைக்கவில்லை." : "I could not find that report.";
  return lang === "ta" ? "இப்போது இணையத்திலிருந்து படிக்க முடியவில்லை." : "I couldn't read from the web just now.";
};

export interface NewsLink { outlet: string; title: string; url: string; publishedAt: string | null }

/** The Stage document for a news answer: what was said (a Note) and every source as a link (a NewsReader list). Checked; null if it fails. */
export function newsScreen(o: { lang: "en" | "ta"; kind: "read" | "lookup"; outlet: string | null; en: string[]; ta: string[]; links: NewsLink[]; now?: number }): StageDocT | null {
  const L = (en: string, ta: string) => (o.lang === "ta" ? ta : en);
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  const said = (o.lang === "ta" ? o.ta : o.en).join(" ").trim();
  const seen = new Set<string>();
  const links = o.links.filter((x) => /^https?:\/\//.test(x.url) && x.url.length <= 2000 && !seen.has(x.url) && seen.add(x.url)).slice(0, 10);
  // the title is the outlet's name, never the page's own headline: a Stage title goes back to the planner with the next sentence (the
  // independent check, 17 Nov); the headlines stay in the sources list, as on the console's own news screens
  const outlet = o.outlet ? clip(o.outlet, 60) : null;
  const titles = o.kind === "lookup" ? { en: "From the web", ta: "இணையத்திலிருந்து" }
    : { en: outlet ? `${outlet}'s report` : "The news report", ta: outlet ? `${outlet} செய்தி` : "செய்தி அறிக்கை" };
  const title = L(titles.en, titles.ta);
  const blocks: StageDocT["blocks"] = [{ kind: "Note", id: "brief", text: clip(said || L("Nothing to read out.", "படிக்க எதுவும் இல்லை."), 400) }];
  if (links.length) blocks.push({ kind: "NewsReader", id: "sources", title: L("Sources", "ஆதாரங்கள்"), total: links.length,
    items: links.map((x, i) => ({ id: `web-${i + 1}`, title: clip(x.title || x.outlet, 300), source: clip(x.outlet, 80) || null, t: x.publishedAt ? x.publishedAt.slice(0, 30) : null, place: null, incidentId: null, url: x.url })) });
  const doc = {
    v: 1, id: `news-${(o.now ?? Date.now()).toString(36)}`, recipe: "news", title, takeaway: null,
    say: { en: clip(o.en.join(" "), 600), ta: clip(o.ta.join(" "), 900) }, blocks,
    scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null }, slots: { web: true },
    sources: [...new Set(links.map((x) => clip(x.outlet, 80)))].slice(0, 10), asOf: null,
    notes: [L("From the web: read just now, nothing kept. Quotes are the outlets' own.", "இணையத்திலிருந்து: இப்போது படித்தது, எதுவும் சேமிக்கப்படவில்லை. மேற்கோள்கள் அந்தந்த ஊடகங்களுடையவை.")],
    lang: o.lang, titles
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
