/**
 * v7: the aide. Between the screen a turn built and the voice: which turns it answers, and the answer itself (facts -> writer -> checker ->
 * the gap, if any, from the dashboard's news and then the outlets' feeds). The screen is not changed, except that a gap's reports are
 * added as links ("From the news") when there is room, and the screen carries what was said (`voice`). Server only.
 *   JARVIS_ANSWER=v6   the aide is off: v6's lines, and the browser reads the items as before
 *   JARVIS_AIDE_WEB=0  no look-up for a gap (the gap is said as not known)
 *   JARVIS_AIDE_FIRST_MS  the first checked sentence's deadline (default 3500 ms after the screen is ready), then the fallback
 *   JARVIS_AIDE=0      no writer (the recipe's own line), v7's routing kept: for the understanding runs, which score where a question goes
 */
import { claudeConfigured } from "@/lib/ai/claude";
import type { AgentResult } from "../agent";
import { figuresIn } from "../numbergate";
import type { BlockT, StageDocT } from "../stage";
import type { Lang, World } from "../types";
import { buildSheet, extrasOf } from "./facts";
import { gazetteer, type Gazetteer } from "./gazetteer";
import { causeGap, findGap, gapFacts, gapPhrase, gapWords, nothingLine, type GapDeps, type GapFound } from "./gap";
import type { Fact7, Sheet7 } from "./ground";
import { fallbackLines, writeAnswer, type Written, type WriteOptions } from "./writer";

export const answerStyle = (v: string | undefined = process.env.JARVIS_ANSWER): "v7" | "v6" => ((v ?? "").trim().toLowerCase() === "v6" ? "v6" : "v7");
const webOn = () => (process.env.JARVIS_AIDE_WEB ?? "").trim() !== "0";
const firstMs = () => { const n = Number(process.env.JARVIS_AIDE_FIRST_MS); return Number.isFinite(n) && n >= 800 && n <= 15_000 ? n : 3500; };

/** The screens that answer a question: the aide always says their point (a news list, a brief, a case, a comparison, a why). */
const ASKED = new Set(["focus", "case", "situation", "explain", "why", "changed", "compare", "news", "brief", "advise", "insight", "performance", "ranking", "trend", "answer"]);
/** A sentence shaped as a question or a request to be told: the aide answers it whatever screen it built. */
const QUESTION = /\?|^\s*(?:what|why|how|which|who|when|where|is|are|was|were|does|did|do|can|should|tell|explain|summari[sz]e|brief|describe|compare|give me (?:a|the) (?:summary|picture|update|status)|status|update)\b|\b(?:tell me|what about|what's|whats|how is|how are|why is|why are|any update|the status|the issue|the problem|the situation)\b|என்ன|ஏன்|எப்படி|எங்கே|யார்|எவ்வளவு|சொல்லு|சொல்லுங்க|சொல்லுங்கள்|விளக்கு|\b(?:enna|yen|epdi|evlo|sollu|sollunga|pathi)\b/iu;

/**
 * Is any model configured for the writer at all (a Groq or Gemini key, or Claude on with a key under its ceiling)? With none, the aide steps
 * aside and the turn is v6's. With keys but no allowance left, the aide still runs and says the recipe's own line (its fallback), with no item
 * read out.
 */
export const aideReady = (): boolean => !!(process.env.GROQ_API_KEY ?? "").trim() || !!(process.env.GEMINI_API_KEY ?? "").trim() || claudeConfigured();

/** Does this turn get the aide's answer? A screen built for a question, never a command, a control or a refusal. `forced`: a test's own writer. */
export function aideWanted(r: AgentResult | null | undefined, question: string, lane: string, forced = false): boolean {
  if (answerStyle() === "v6" || !r || r.kind !== "do" || !r.stage) return false;
  // JARVIS_AIDE=0: v7's routing with the recipe's own line (the understanding runs: they score where a question goes, not what is said)
  if (!forced && (process.env.JARVIS_AIDE ?? "").trim() === "0") return false;
  if (!forced && !aideReady()) return false;
  if (lane === "direct" || lane === "refuse") return false;
  // v11: the planner's answer from THE DISTRICT NOW is already the data speaking, checked sentence by sentence (agent.ts keepChecked)
  if (r.note === "v11:district-now") return false;
  // v12 (21 Nov, routing RC5 and RC7): the city screen on one spot or one past rain says code's own line for it (lib/city/pick.ts spotLine and
  // clusterLine, lib/city/now.ts's rain line), every figure the spot's or the rain's own; the aide would rewrite it from the district's facts
  // (3.5 s on the 06:40 "repeating traffic" turn)
  // v13 (21 Nov review, finding 1 8): every city screen, the plain one too: its say is code's own line from the shared city data (lib/city/now.ts),
  // and the aide's writer and gap search made "Where are the flooded roads?" slow (up to 8 s with the outlet feeds, past the client deadline)
  if (r.stage.recipe === "city") return false;
  // v16 (22 Nov): the focus screen says code's own answer (recipes/focus.ts districtSay and its shapes): the writer's rewrites of 22 Nov lost
  // the point (a roads question answered with backlog counts, "zero areas improving", a gap line for Velachery), and its 1-2 s came on top
  if (r.stage.recipe === "focus") return false;
  // v16 (the browser drive): "that incident alone" is the case screen with code's own brief of it (screens.ts briefIssue); the writer's rewrite
  // came 3.5 s after the screen (first words at 5.3 s) and said less ("A crime report at Tondiarpet")
  if (r.note === "reader:first_case:one") return false;
  return ASKED.has(r.stage.recipe) || QUESTION.test(question);
}

const gazCache = new WeakMap<World, Gazetteer>();
export const gazOf = (w: World): Gazetteer => { let g = gazCache.get(w); if (!g) { g = gazetteer(w); gazCache.set(w, g); } return g; };

export interface AideCtx {
  question: string;
  /** v16: the reader understood the question as one about the dashboard's data: no outside gap is looked for or said (the 22 Nov probe:
   * "The dashboard has nothing on I'm going to Adyar tomorrow") */
  noGap?: boolean;
  world: World;
  user: string;
  signal?: AbortSignal;
  /** the last answer's words, for a follow-up */
  last?: string | null;
  /** each checked sentence, the moment it passes (the round streams it to the voice) */
  emit?: (sentence: string, lang: Lang) => void;
  /** the screen, the moment its facts are ready and before a word is written (carrying the facts' figures for the browser's gate) */
  ready?: (stage: StageDocT) => void;
  /** how long the whole answer may take (the round's budget left), ms */
  untilMs?: number;
  /** the outside part code found in the question (asks7.ts: a public office or event), looked for when the writer names no gap itself */
  gapHint?: string[] | null;
  now?: () => number;
  /** the dashboard's own news search, for a gap (round.ts gives the console's search_records) */
  dashboardNews?: GapDeps["dashboardNews"];
  /** tests: the writer's model and rungs, the feeds */
  write?: Pick<WriteOptions, "open" | "rungs">;
  feeds?: GapDeps["feeds"];
}
export interface AideOut { result: AgentResult; written: Written; sheet: Sheet7; gap: (GapFound & { said: string[]; /** the reports as the checker held the gap's sentences to them */ facts?: Fact7[] }) | null }

/** v11: the gap's phrase is the whole question again (five words or more, nearly all of the question's), not a part of it */
export function echoesQuestion(phrase: string, question: string): boolean {
  const words = (s: string) => s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w && w !== "whether" && w !== "that");
  const p = words(phrase), q = words(question);
  // only a gap about the dashboard's own data: a news gap ("who won the by-election in Kolathur", "CM Vijay visiting Adyar") keeps its honest
  // "nothing found"; the phrase is the question's own words (a whole clause of it), not a part the writer named
  if (p.length < 4 || !q.length || !/\b(?:departments?|dept|zones?|complaints?|cases?|incidents?|prices?|deadline|overdue|backlog|slowest|fastest|rain\w*|lakes?|reservoirs?|traffic|aqi|air|power|metro)\b/i.test(phrase)) return false;
  return p.filter((w) => q.includes(w)).length / p.length >= 0.8;
}

/** The fallback said when the model gives nothing checked: the recipe's own line (v6's), without an announcement of a reading. */
const fallbackOf = (doc: StageDocT, lang: Lang) => fallbackLines(doc.say?.[lang] || doc.say?.en || "").join(" ");

/** v12 (21 Nov): the turn was cancelled (a barge-in, Esc): stop as an abort, which withAide passes on and nothing is said for */
const stopIf = (s?: AbortSignal) => { if (s?.aborted) throw new DOMException("the turn was cancelled", "AbortError"); };

export async function aideAnswer(r: AgentResult & { stage: StageDocT }, ctx: AideCtx): Promise<AideOut> {
  const now = ctx.now ?? Date.now;
  const t0 = now();
  const lang: Lang = r.lang === "ta" ? "ta" : "en";
  const doc = r.stage;
  const gaz = gazOf(ctx.world);
  // (the question goes with the facts: a sentence saying there is nothing on it may use the Collector's own words)
  const sheet = { ...buildSheet(doc, lang, gaz, t0, extrasOf(doc)), question: ctx.question };
  // the screen goes up now; the browser's number gate may let through any figure of the facts (the server checks each sentence against them)
  const factFigures = [...new Set(sheet.facts.flatMap((f) => [...figuresIn([f.text, ...(f.times ?? [])].join(" ; ")).map((x) => x.value), ...(f.nums ?? [])]).filter(Number.isFinite))].slice(0, 200);
  ctx.ready?.({ ...doc, voice: { by: "aide7", model: null, figures: factFigures } });
  const emit = (s: string) => ctx.emit?.(s, lang);
  const until = t0 + Math.min(9000, ctx.untilMs ?? 9000);
  const written = await writeAnswer({ question: ctx.question, lang, sheet, note: sheet.note, last: ctx.last ?? null, fallback: fallbackOf(doc, lang) },
    { user: ctx.user, until, firstBy: Math.min(until, t0 + firstMs()), signal: ctx.signal, onSentence: emit, noFallbackOnGap: true, ...(ctx.write ?? {}), now });
  const said = [...written.sentences];
  if (ctx.noGap) written.gap = null;
  let gap: AideOut["gap"] = null;
  let gapFacts7: Fact7[] = [];
  let links: BlockT | null = null;
  // a cause or a why is no gap: the record answers it (the writer says it shows what moved, not why); nothing is looked up for it
  if (written.gap && causeGap(written.gap)) written.gap = null;
  // the code's hint stands in for a gap the writer did not name, or named only in words of its own ("the Chief Minister's visit" for "CM":
  // the Claude pilot), unless what was said already speaks of it
  const spoke = ` ${said.join(" ").toLowerCase()} `;
  const ownWords = written.gap ? gapWords(written.gap, ctx.question, ctx.world) : [];
  const hinted = (!written.gap || !ownWords.length) && ctx.gapHint?.length && !ctx.gapHint.some((w) => w.length >= 3 && spoke.includes(w)) ? ctx.gapHint.join(" ") : null;
  if (hinted) written.gap = hinted;
  // a reply that was only a cause "gap" left nothing said (its fallback was held for the gap): the recipe's own line, said now (the review, 18 Nov)
  if (!said.length && !written.gap) {
    const fb = fallbackLines(doc.say?.[lang] || doc.say?.en || "");
    for (const s of fb) emit(s);
    said.push(...fb);
    if (fb.length) written.by = "fallback";
  }
  if (written.gap) {
    // v12 (21 Nov): the turn's signal goes to the look-up, and a cancelled turn stops here as an abort (withAide in round.ts passes it on), so
    // nothing more is fetched or written for an answer the Collector will never see, and no "nothing found" line is said for it (RC7)
    stopIf(ctx.signal);
    const found = webOn() && now() < until - 2500 ? await findGap(written.gap, ctx.question, { dashboardNews: ctx.dashboardNews, feeds: ctx.feeds, now, world: ctx.world, signal: ctx.signal }).catch(() => null) : null;
    stopIf(ctx.signal);
    const extra: string[] = [];
    if (found?.status === "ok" && found.hits.length) {
      // one more checked answer, about the gap only, from what the reports say
      const facts = gapFacts(found.hits, now());
      const gs: Sheet7 = { facts, lang, gaz, shown: [], question: ctx.question };
      gapFacts7 = facts;
      const head = found.hits[0];
      const w2 = await writeAnswer({ question: `${ctx.question} (only this part: ${written.gap})`, lang, sheet: gs, note: "The screen will list these reports as links.", fallback: lang === "ta" ? `${head.outletTa ?? head.outlet} இதைப் பற்றி செய்தி வெளியிட்டிருக்கிறது; இணைப்பு திரையில் உள்ளது.` : `${head.outlet} has a report on that; the link is on the screen.` },
        { user: ctx.user, until, firstBy: Math.min(until, now() + 3500), signal: ctx.signal, onSentence: emit, ...(ctx.write ?? {}), now });
      extra.push(...w2.sentences);
      written.tokens += w2.tokens; written.calls += w2.calls; written.rejected.push(...w2.rejected);
      links = { kind: "NewsReader", id: "aide-gap", title: lang === "ta" ? "செய்திகளிலிருந்து" : "From the news", total: found.hits.length,
        items: found.hits.map((h, i) => ({ id: `gap-${i}`, title: h.title.slice(0, 300), source: h.outlet, t: h.at != null ? new Date(h.at).toISOString() : null, place: null, incidentId: null, url: h.url && /^https?:\/\//.test(h.url) ? h.url.slice(0, 2000) : null })) };
    } else {
      // what was searched decides what is claimed: the dashboard and the latest news, the dashboard alone (no look-up), or the feeds unreadable
      const searched = found?.status === "nothing" ? "news" : found?.status === "unavailable" ? "unavailable" : "dashboard";
      const phrase = found?.phrase ?? gapPhrase(written.gap, ctx.question);
      // v11: after an answer, a line that only repeats the Collector's whole question back ("Nothing in the dashboard or the latest news mentions
      // Which department has the most cases past the deadline.", the 20 Nov probe) says nothing: the answer already said what the data shows
      if (!(said.length && echoesQuestion(phrase, ctx.question))) {
        const line = nothingLine(phrase, lang, searched);
        emit(line);
        extra.push(line);
      }
    }
    said.push(...extra);
    gap = found ? { ...found, said: extra, facts: gapFacts7 } : { status: "nothing", words: [], hits: [], ms: 0, phrase: gapPhrase(written.gap, ctx.question), said: extra };
  }
  // v12: an answer finished after the turn was cancelled is not handed back as given (the round would send RUN_FINISHED and the route record it)
  stopIf(ctx.signal);
  const say = said.join(" ").trim() || fallbackOf(doc, lang);
  const figures = [...new Set(figuresIn(say).map((f) => f.value).filter(Number.isFinite))].slice(0, 60);
  const stage: StageDocT = { ...doc, say: { ...doc.say, [lang]: say }, voice: { by: written.by === "fallback" && !gap ? "fallback" : "aide7", model: written.model, figures },
    blocks: links && doc.blocks.length < 6 ? [...doc.blocks, links] : doc.blocks };
  return { result: { ...r, say, stage }, written, sheet, gap };
}
