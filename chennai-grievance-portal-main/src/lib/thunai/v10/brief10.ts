/**
 * v10 (docs/jarvis/JARVIS_V10.md 4.5; research 40 §3 and §5.4): "read" is a brief, not a recital. The owner, 19 Nov: "When I ask to read, it's
 * simply like reading, not make it more powerful and understand."
 *
 *   brief   at most four short sentences, inverted pyramid: (1) what happened, where and when, in the asked language; (2) why it matters to the
 *           district; (3) what the console's own records say about it (ground10.ts: the open cases of that kind at that place, the oldest's
 *           age, the department holding them; the rain gauges for a storm); (4) one question offering at most two next steps (said by code).
 *           v7's aide pattern: the facts come from code (the article's sentences as the outlet's, the console's as [dashboard]), ONE streamed
 *           model call writes (1)-(3) citing them, and ground.ts checks every sentence before it is spoken; a sentence that fails is never said.
 *           A missing console sentence is said by code; with no model, or nothing checked, a code template says the same parts.
 *   full    "read it fully": the whole story. In its own language, its paragraphs as written (no model). In the other language, the model says
 *           it a few sentences at a time, each sentence checked against the one it renders, spoken as each part passes.
 *
 * The answer is in the asked language whatever the story's own (a Tamil story asked in English is briefed in English, and the other way round).
 * Privacy: the article is the outlet's; the console's facts are counts, places, kinds, departments and ages; no citizen's words reach a model.
 * Server only. The Tamil example lines and frames are MODEL-DRAFTED and need a Tamil speaker's review.
 */
import { figuresIn } from "../numbergate";
import { redactText } from "../privacy";
import type { StageDocT } from "../stage";
import type { Lang } from "../types";
import { noUrls, relativeTime } from "../web/brief";
import { gazOf } from "../aide7";
import { buildSheet } from "../aide7/facts";
import type { AideExtras } from "../aide7/extras";
import { tamilFormsOf } from "../aide7/gazetteer";
import type { Fact7, Sheet7 } from "../aide7/ground";
import { writeAnswer, type WriteOptions } from "../aide7/writer";
import { consoleFacts, consoleLine, consoleOn, groundLines, offerLine, offerOf, plainDept, type Console10, type ConsoleDeps, type OfferPayload, type Story10 } from "./ground10";

// ------------------------------------------------------------------ the instructions (fixed bytes: cached) --

export const BRIEF_SYSTEM_EN = `You are Jarvis, the spoken aide to the District Collector of Chennai. The Collector asked you to read a news report. Do not read it out: brief it, the way a trusted senior aide briefs a busy officer in person: short, calm, specific.

Write the brief from the FACTS only. The facts marked with an outlet's name are what that outlet reported; the facts marked [dashboard] are the console's own records.

THE BRIEF: at most three short sentences, in this order, then stop.
1. What happened, where and when, as the outlet's report: "The Hindu reports that ...". Name the place, and say the time as the facts say it.
2. Why it matters to Chennai district: whom or what in the district it touches (the people, the area, the service), from the facts. If no fact says why it matters, leave this sentence out.
3. What the console's own records say about it, from the [dashboard] facts only: how many open cases there are there, how long the oldest has been open, and which department holds them; or the rain gauges, for a storm. Say it with the words "cases", "complaints", "department" or "gauges", as the facts do. If the facts say the console has none, say so, and that few reports may only mean few were filed.
Never ask a question and never offer anything: Jarvis adds the offer itself.

RULES
1. Use only the FACTS. Every figure, name, place, department, news outlet and time you say must be in the facts you cite on that line. Add nothing of your own: no outside knowledge, no guesses, no causes the facts do not state, no forecasts.
2. Never read the report out: no headline word for word, no run of the report's own sentences. Say its point in your own plain words.
3. Each sentence under 22 words, one idea a sentence. Name at most two places in the whole brief.
4. Figures in digits, exactly as the facts give them. Never work out a new number.
5. Times as the facts say them ("this morning", "on Monday", "12 days"). Never a date, a weekday or a clock time the facts do not give.
6. Say "after" or "along with", never "because", "due to" or "caused", unless a fact itself states the cause.
7. A claim, a demand or an allegation belongs to whoever made it: name the outlet or the speaker before the claim.
8. Plain spoken text: no markdown, no lists, no brackets other than the fact marks, no symbols.
9. Answer in the language asked, whatever the report's own language. For Tamil: polite spoken Tamil in Tamil script, as an officer speaks it; place, department and outlet names in their usual Tamil form; never "sir" or "madam". For English: plain English, the report's Tamil names spelt in English letters.
10. Vary your wording, and never reuse the example sentences below.

OUTPUT: these lines and nothing else.
GAP: none
S: <the first sentence> [F1,F3]
S: <the next sentence> [F5]
The GAP line comes first and says "none". Each S line is one sentence, then the ids of every fact it uses.

EXAMPLE (an illustration only: its facts are not today's)
FACTS:
F1 [DT Next] DT Next reported this morning: Sewage overflows near Koyambedu bus stand for a week
F2 [DT Next] DT Next wrote: Commuters said sewage had been flowing onto the road near the bus stand's east gate since last week.
F3 [DT Next] DT Next wrote: Traders said the smell had driven customers away.
F4 [dashboard] The story's place: Koyambedu, in Anna Nagar zone
F5 [dashboard] Open drainage and sewage cases at Koyambedu on the console now: 3
F6 [dashboard] The oldest of these open cases has been open 9 days
F7 [dashboard] All of these open cases are held by Metro Water (CMWSSB)
A good brief:
GAP: none
S: DT Next reports that sewage has been running onto the road at Koyambedu bus stand since last week. [F1,F2,F4]
S: Commuters at the east gate are wading through it, and traders say customers are staying away. [F2,F3]
S: The console has 3 open sewage cases at Koyambedu, the oldest 9 days, all with Metro Water. [F5,F6,F7]
A bad brief (it reads the report out): "DT Next: Sewage overflows near Koyambedu bus stand for a week. Commuters said sewage had been flowing onto the road."`;

/** The Tamil turn's: the same, with the good brief said in spoken Tamil (MODEL-DRAFTED, not checked by a Tamil speaker). */
export const BRIEF_SYSTEM_TA = `${BRIEF_SYSTEM_EN}
The same good brief in Tamil:
GAP: none
S: கோயம்பேடு பேருந்து நிலையத்தில் போன வாரத்திலிருந்து கழிவுநீர் சாலையில் ஓடுவதாக டிடி நெக்ஸ்ட் செய்தி வெளியிட்டிருக்கிறது. [F1,F2,F4]
S: கிழக்கு வாயிலில் பயணிகள் அதில் நடந்து போகிறார்கள்; வாடிக்கையாளர்கள் வருவதில்லை என்று வியாபாரிகள் சொல்கிறார்கள். [F2,F3]
S: கன்சோலில் கோயம்பேட்டில் 3 கழிவுநீர் புகார்கள் திறந்த நிலையில் உள்ளன, பழையது 9 நாட்களாக, எல்லாமே சென்னை குடிநீர் வாரியம் வசம். [F5,F6,F7]
`;

export const FULL_SYSTEM_EN = `You are Jarvis, the spoken aide to the District Collector of Chennai. The Collector asked to hear a news report in full, in a language other than the report's own. Say the report's sentences given in FACTS in the language asked, in order, one spoken sentence for each fact.

RULES
1. Say faithfully what each sentence says, nothing more and nothing less. Keep every figure, name, place, time and quote as the fact gives it; names in the asked language's usual form.
2. Never add, explain, comment or summarise. A quote or a claim stays its speaker's: "residents said", "the official said".
3. One S line for each fact, citing that fact, in the facts' order. Under 30 words a line.
4. Plain spoken text: no markdown, no brackets other than the fact marks, no symbols.
5. For Tamil: polite spoken Tamil in Tamil script, as an officer speaks it. For English: plain English, Tamil names spelt in English letters.

OUTPUT: these lines and nothing else.
GAP: none
S: <the first fact, said in the asked language> [F1]
S: <the second fact, said in the asked language> [F2]`;
export const FULL_SYSTEM_TA = `${FULL_SYSTEM_EN}
For Tamil, for example: "Residents said water had stood on three streets for two days." is said:
S: மூன்று தெருக்களில் இரண்டு நாட்களாகத் தண்ணீர் தேங்கியிருப்பதாகக் குடியிருப்பவர்கள் சொன்னார்கள். [F1]
`;
export const briefSystem = (lang: Lang) => (lang === "ta" ? BRIEF_SYSTEM_TA : BRIEF_SYSTEM_EN);
export const fullSystem = (lang: Lang) => (lang === "ta" ? FULL_SYSTEM_TA : FULL_SYSTEM_EN);

// ------------------------------------------------------------------ helpers --

const TAMIL = /[஀-௿]/u;
const tamilShare = (s: string) => { const l = s.match(/\p{L}/gu)?.length ?? 0; return l ? (s.match(/[஀-௿]/gu)?.length ?? 0) / l : 0; };
const end = (s: string) => { const t = s.replace(/\s+/g, " ").trim(); return /[.!?…]["”’]?$/u.test(t) ? t : `${t}.`; };
/** the console's words a console sentence says (a figure of the count with them, or a "none" of them) */
const CONSOLE_WORDS = /\b(?:cases?|complaints?|department|incidents?)\b|புகார்|சம்பவ|துறை/iu;

/** Is this the brief's console sentence (the eval's recogniser: a console figure with its words, a "none", the console named, the gauges)? */
export function consoleish(s: string, c: Pick<Console10, "n" | "gauges">): boolean {
  if (/\bconsole\b|கன்சோல்/iu.test(s)) return true;
  if (c.gauges && /\bgauges?\b|மழைமானி/iu.test(s)) return true;
  if (c.n == null) return false;
  if (c.n === 0) return CONSOLE_WORDS.test(s) && /\bno\b|\bnone\b|இல்லை/iu.test(s);
  return CONSOLE_WORDS.test(s) && figuresIn(s).some((f) => f.value === c.n);
}

/** A minimal screen for the story: the facts come from the extras alone (as aide7/news.ts). */
const storyDoc = (s: Story10, lang: Lang): StageDocT => ({
  v: 1, id: `brief10-${Date.now().toString(36)}`, recipe: "answer", title: s.outlet ? `${s.outlet}'s report` : "The news report", takeaway: null, say: { en: "", ta: "" },
  blocks: [], scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null }, slots: {}, sources: [], asOf: null, notes: [], lang
});

/** The brief's fact sheet: the article's (as the outlet's), the headline in English for a Tamil one asked in English, the console's. */
export function briefSheet(s: Story10, c: Console10, lang: Lang, d: Pick<ConsoleDeps, "world">, now: number): Sheet7 {
  const lines: NonNullable<AideExtras["lines"]> = [];
  if (lang === "en" && TAMIL.test(s.title) && s.titleEn) lines.push({ text: `${s.outlet ?? "The report"}'s headline in English: ${s.titleEn}`, src: s.outlet ?? "the news" });
  for (const f of consoleFacts(c)) lines.push({ text: f.text, rank: f.rank, src: "dashboard" });
  const x: AideExtras = { article: { outlet: s.outlet, outletTa: s.outletTa, title: s.title, publishedAt: s.publishedAt, text: s.text }, lines };
  const sheet = buildSheet(storyDoc(s, lang), lang, gazOf(d.world), now, x);
  // the headline is not read out word for word (the copy check holds a sentence to it)
  return { ...sheet, shown: [...sheet.shown, s.title, ...(s.titleEn ? [s.titleEn] : [])] };
}

/** The code's brief (no model, or nothing checked): the same parts, from code fields. */
export function briefTemplate(s: Story10, c: Console10, lang: Lang, now: number): string[] {
  const ta = lang === "ta";
  const when = relativeTime(s.publishedAt, now, lang);
  const p = c.place;
  const tamilTitle = TAMIL.test(s.title);
  let what: string;
  if (!ta) {
    const head = tamilTitle ? s.titleEn ?? (c.topic && p ? `a ${c.topic.en} problem at ${p.name}` : s.title) : s.title;
    what = `${s.outlet ?? "A report"} reports${when ? ` ${when}` : ""}: ${end(head)}`;
  } else {
    const who = s.outletTa ?? s.outlet ?? "ஒரு செய்தி";
    what = !tamilTitle && c.topic && p ? `${who} ${when ? `${when} ` : ""}${p.nameTa ?? p.name} பகுதியில் ${c.topic.ta} பிரச்சினை குறித்துச் செய்தி வெளியிட்டிருக்கிறது.`
      : `${who} ${when ? `${when} ` : ""}வெளியிட்ட செய்தி: ${end(s.title)}`;
  }
  let why = "";
  if (p) {
    const dept = c.topic && c.dept && c.n ? c.dept : null;
    why = ta ? `இது ${p.level === "place" && p.zoneTa ? `${p.zoneTa} மண்டலத்தின் ${p.nameTa ?? p.name} பகுதியைப்` : p.level === "zone" ? `${p.zoneTa ?? p.name} மண்டலத்தைப்` : `${p.nameTa ?? p.name} பகுதியைப்`} பற்றியது${dept ? `; அங்கே ${c.topic!.ta} பணி ${dept.ta} பொறுப்பு` : ""}.`
      : `It touches ${p.name}${p.level === "place" && p.zoneName ? ` in ${p.zoneName} zone` : p.level === "zone" ? " zone" : ""}${dept ? `, where ${c.topic!.en} falls to ${plainDept(dept.en)}` : ""}.`;
  } else if (c.storm) why = ta ? "இது மாவட்டம் முழுவதற்கும் மழை, வெள்ளக் கண்காணிப்புக்கு முக்கியம்." : "It matters for the whole district's rain and flood watch.";
  return [what, why, consoleLine(c, lang)].filter(Boolean);
}

/** Each sentence a writer hands on, as it comes. */
async function* streamed(run: (push: (s: string) => void) => Promise<unknown>): AsyncGenerator<string> {
  const q: string[] = [];
  let wake: (() => void) | null = null, done = false;
  const p = run((s) => { q.push(s); wake?.(); }).catch(() => undefined).finally(() => { done = true; wake?.(); });
  for (;;) {
    while (q.length) yield q.shift() as string;
    if (done) break;
    await new Promise<void>((r) => { wake = r; });
    wake = null;
  }
  await p;
}

// ------------------------------------------------------------------ "read it fully" --

/** a page's furniture, never read out */
const FURNITURE = /^(?:also read|read more|read also|subscribe|click here|follow us|advertisement|sponsored|published|updated|posted|by\s+\p{Lu}[\p{L}.]*\s*$|©)/iu;
const FULL_CHARS = 6000;
const CROSS_CHARS = 3000;
/** The story's text as spoken sentences: no links, no page furniture, a long sentence cut at its clauses. */
export function spokenSentences(text: string): string[] {
  const out: string[] = [];
  for (const raw of noUrls(redactText(text)).replace(/\s+/g, " ").split(/(?<=[.!?।])\s+(?=["“‘(\p{Lu}஀-௿\d])/u)) {
    const s = raw.trim();
    if (!s || FURNITURE.test(s) || s.split(" ").length < 3) continue;
    if (s.length <= 400) { out.push(s); continue; }
    let rest = s;
    while (rest.length > 400) { const k = Math.max(rest.lastIndexOf("; ", 400), rest.lastIndexOf(", ", 400)); const at = k > 120 ? k + 1 : 400; out.push(rest.slice(0, at).trim()); rest = rest.slice(at).trim(); }
    if (rest) out.push(rest);
  }
  return out;
}
const capped = (xs: string[], chars: number) => { let n = 0; const lines: string[] = []; for (const x of xs) { if (n + x.length > chars && lines.length) return { lines, cut: true }; lines.push(x); n += x.length; } return { lines, cut: false }; };
const minutes = (lines: string[], lang: Lang) => Math.max(1, Math.ceil(lines.join(" ").split(/\s+/).length / (lang === "ta" ? 100 : 150)));
const fullHeader = (s: Story10, lang: Lang, m: number, cross: boolean) => (lang === "ta"
  ? `${s.outletTa ?? s.outlet ?? "இந்தச் செய்தி"} முழுமையாக${cross ? ", தமிழில்" : ""}: சுமார் ${m} நிமிடம் ஆகும்; நிறுத்த வேண்டுமென்றால் "நிறுத்து" என்று சொல்லுங்கள்.`
  : `${s.outlet ? `${s.outlet}'s report` : "The report"}, in full${cross ? ", in English" : ""}: about ${m} ${m === 1 ? "minute" : "minutes"}. Say stop any time.`);
const REST = { en: "That is the first part; the full report is linked on the screen.", ta: "இது முதல் பகுதி மட்டும்; முழுச் செய்தியின் இணைப்பு திரையில் உள்ளது." };
const NO_TEXT = { en: "I couldn't get the report's full text; its link is on the screen.", ta: "இந்தச் செய்தியின் முழு உரை கிடைக்கவில்லை; அதன் இணைப்பு திரையில் உள்ளது." };
const NO_TRANSLATE = { en: "I can't put the whole report into English just now; its link is on the screen.", ta: "முழுச் செய்தியையும் இப்போது தமிழில் சொல்ல முடியவில்லை; அதன் இணைப்பு திரையில் உள்ளது." };

// ------------------------------------------------------------------ the aide --

export interface Brief10Deps extends ConsoleDeps {
  user: string;
  signal?: AbortSignal;
  /** tests: the writer's model and rungs (no model at all: `rungs: () => []`, and the code says the brief) */
  write?: Pick<WriteOptions, "open" | "rungs">;
  now?: () => number;
}
export interface BriefAsk10 { question: string; lang: Lang; story: Story10; console: Console10 }
export interface NewsBrief10 {
  /** what the console holds on the story (read while the article is) */
  console: (s: Story10) => Promise<Console10>;
  /** the brief: each yield is every sentence said so far (the last is the offer) */
  brief: (a: BriefAsk10) => AsyncGenerator<string[]>;
  /** the whole story in the asked language: each yield is every line said so far */
  full: (a: { question: string; lang: Lang; story: Story10 }) => AsyncGenerator<string[]>;
  /** news to ground truth: what the console holds on the story, said by code */
  ground: (c: Console10, o: OfferPayload, lang: Lang) => string[];
  /** the next steps offered (the browser keeps them for the next turn) */
  offer: (s: Story10, c: Console10) => OfferPayload;
}

export function newsBrief10(d: Brief10Deps): NewsBrief10 {
  const now = () => (d.now ?? Date.now)();
  return {
    console: (s) => consoleOn(s, d),
    offer: (s, c) => offerOf(s, c),
    ground: (c, o, lang) => groundLines(c, o, lang),
    async *brief(a) {
      const t0 = now();
      const { story, lang, console: c } = a;
      const sheet = briefSheet(story, c, lang, d, t0);
      const cLine = consoleLine(c, lang);
      const said: string[] = [];
      let hasConsole = false;
      // (1) and (2) as they pass; a third only when it is the console's (else the code's console sentence is the third)
      const take = (s: string) => {
        if (said.length >= 3) return false;
        const ic = consoleish(s, c);
        if (said.length >= 2 && !hasConsole && !ic && cLine) return false;
        if (ic) hasConsole = true;
        said.push(s);
        return true;
      };
      for await (const s of streamed((push) => writeAnswer({ question: a.question, lang, sheet, note: "The screen shows the report's link.", fallback: "", system: briefSystem(lang) },
        { user: d.user, until: t0 + 9000, firstBy: t0 + 4000, signal: d.signal, onSentence: push, ...(d.write ?? {}), now }))) {
        if (take(s)) yield [...said];
      }
      if (d.signal?.aborted) return;
      // nothing checked (no model, a refusal, the deadline): the code's brief
      if (!said.length) for (const s of briefTemplate(story, c, lang, t0)) if (take(s)) yield [...said];
      if (cLine && !hasConsole) { said.push(cLine); yield [...said]; }
      said.push(offerLine(offerOf(story, c), lang));
      yield [...said];
    },
    async *full(a) {
      const { story, lang } = a;
      const all = spokenSentences(story.text ?? "");
      if (!all.length) { yield [NO_TEXT[lang]]; return; }
      const own: Lang = tamilShare(all.join(" ")) > 0.3 ? "ta" : "en";
      if (own === lang) {
        // its own language: the headline (unless the text starts with it) and the paragraphs as written, no model
        const head = story.title && !all[0].startsWith(story.title.slice(0, 40)) ? [end(story.title)] : [];
        const { lines, cut } = capped(all, FULL_CHARS);
        yield [fullHeader(story, lang, minutes(lines, lang), false), ...head, ...lines, ...(cut ? [REST[lang]] : [])];
        return;
      }
      // the other language: the model says it a few sentences at a time, each checked against the sentence it renders
      const { lines, cut } = capped(all, CROSS_CHARS);
      const said = [fullHeader(story, lang, minutes(lines, own), true), ...(lang === "en" && story.titleEn && TAMIL.test(story.title) ? [end(story.titleEn)] : [])];
      yield [...said];
      const gaz = gazOf(d.world);
      let any = false;
      for (let i = 0; i < lines.length; i += 3) {
        if (d.signal?.aborted) return;
        const part = lines.slice(i, i + 3);
        const facts: Fact7[] = part.map((text, k) => ({ id: `F${k + 1}`, src: story.outlet ?? "the news", doc: "article", text, names: [...new Set([...(story.outletTa ? [story.outletTa] : []), ...tamilFormsOf(text, gaz)])], cause: true, rank: true }));
        const sheet: Sheet7 = { facts, lang, gaz, shown: [] };
        const t = now();
        for await (const s of streamed((push) => writeAnswer({ question: `Say these sentences of ${story.outlet ?? "the"} report in ${lang === "ta" ? "Tamil" : "English"}, in order.`, lang, sheet, note: "The screen shows the report's link.", fallback: "", system: fullSystem(lang), maxOut: 700 },
          { user: d.user, until: t + 12_000, firstBy: t + 6000, signal: d.signal, onSentence: push, ...(d.write ?? {}), now }))) {
          any = true;
          said.push(s);
          yield [...said];
        }
        if (!any) { said.push(NO_TRANSLATE[lang]); yield [...said]; return; }
      }
      if (cut) { said.push(REST[lang]); yield [...said]; }
    }
  };
}
