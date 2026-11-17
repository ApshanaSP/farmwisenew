/**
 * v7: the aide. Between the screen a turn built and the voice: which turns it answers, and the answer itself (facts -> writer -> checker ->
 * the gap, if any, from the dashboard's news and then the outlets' feeds). The screen is not changed, except that a gap's reports are
 * added as links ("From the news") when there is room, and the screen carries what was said (`voice`). Server only.
 *   JARVIS_ANSWER=v6   the aide is off: v6's lines, and the browser reads the items as before
 *   JARVIS_AIDE_WEB=0  no look-up for a gap (the gap is said as not known)
 *   JARVIS_AIDE_FIRST_MS  the first checked sentence's deadline (default 3500 ms after the screen is ready), then the fallback
 */
import { claudeConfigured } from "@/lib/ai/claude";
import type { AgentResult } from "../agent";
import { figuresIn } from "../numbergate";
import type { BlockT, StageDocT } from "../stage";
import type { Lang, World } from "../types";
import { buildSheet, extrasOf } from "./facts";
import { gazetteer, type Gazetteer } from "./gazetteer";
import { findGap, gapFacts, gapPhrase, nothingLine, type GapDeps, type GapFound } from "./gap";
import type { Sheet7 } from "./ground";
import { writeAnswer, type Written, type WriteOptions } from "./writer";

export const answerStyle = (v: string | undefined = process.env.JARVIS_ANSWER): "v7" | "v6" => ((v ?? "").trim().toLowerCase() === "v6" ? "v6" : "v7");
const webOn = () => (process.env.JARVIS_AIDE_WEB ?? "").trim() !== "0";
const firstMs = () => { const n = Number(process.env.JARVIS_AIDE_FIRST_MS); return Number.isFinite(n) && n >= 800 && n <= 15_000 ? n : 3500; };

/** The screens that answer a question: the aide always says their point (a news list, a brief, a case, a comparison, a why). */
const ASKED = new Set(["case", "situation", "explain", "why", "changed", "compare", "news", "brief", "advise", "insight", "performance", "ranking", "trend", "answer"]);
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
  if (!forced && !aideReady()) return false;
  if (lane === "direct" || lane === "refuse") return false;
  return ASKED.has(r.stage.recipe) || QUESTION.test(question);
}

const gazCache = new WeakMap<World, Gazetteer>();
export const gazOf = (w: World): Gazetteer => { let g = gazCache.get(w); if (!g) { g = gazetteer(w); gazCache.set(w, g); } return g; };

export interface AideCtx {
  question: string;
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
export interface AideOut { result: AgentResult; written: Written; sheet: Sheet7; gap: (GapFound & { said: string[] }) | null }

/** The fallback said when the model gives nothing checked: the recipe's own line (v6's), without an announcement of a reading. */
const fallbackOf = (doc: StageDocT, lang: Lang) => doc.say?.[lang] || doc.say?.en || "";

export async function aideAnswer(r: AgentResult & { stage: StageDocT }, ctx: AideCtx): Promise<AideOut> {
  const now = ctx.now ?? Date.now;
  const t0 = now();
  const lang: Lang = r.lang === "ta" ? "ta" : "en";
  const doc = r.stage;
  const gaz = gazOf(ctx.world);
  const sheet = buildSheet(doc, lang, gaz, t0, extrasOf(doc));
  // the screen goes up now; the browser's number gate may let through any figure of the facts (the server checks each sentence against them)
  const factFigures = [...new Set(sheet.facts.flatMap((f) => [...figuresIn([f.text, ...(f.times ?? [])].join(" ; ")).map((x) => x.value), ...(f.nums ?? [])]).filter(Number.isFinite))].slice(0, 200);
  ctx.ready?.({ ...doc, voice: { by: "aide7", model: null, figures: factFigures } });
  const emit = (s: string) => ctx.emit?.(s, lang);
  const until = t0 + Math.min(9000, ctx.untilMs ?? 9000);
  const written = await writeAnswer({ question: ctx.question, lang, sheet, note: sheet.note, last: ctx.last ?? null, fallback: fallbackOf(doc, lang) },
    { user: ctx.user, until, firstBy: Math.min(until, t0 + firstMs()), signal: ctx.signal, onSentence: emit, noFallbackOnGap: true, ...(ctx.write ?? {}), now });
  const said = [...written.sentences];
  let gap: AideOut["gap"] = null;
  let links: BlockT | null = null;
  // the code's hint stands in for a gap the writer did not name, unless what was said already speaks of it
  const spoke = ` ${said.join(" ").toLowerCase()} `;
  const hinted = !written.gap && ctx.gapHint?.length && !ctx.gapHint.some((w) => w.length >= 3 && spoke.includes(w)) ? ctx.gapHint.join(" ") : null;
  if (hinted) written.gap = hinted;
  if (written.gap) {
    const found = webOn() && now() < until - 2500 ? await findGap(written.gap, ctx.question, { dashboardNews: ctx.dashboardNews, feeds: ctx.feeds, now }).catch(() => null) : null;
    const extra: string[] = [];
    if (found?.status === "ok" && found.hits.length) {
      // one more checked answer, about the gap only, from what the reports say
      const facts = gapFacts(found.hits, now());
      const gs: Sheet7 = { facts, lang, gaz, shown: [] };
      const head = found.hits[0];
      const w2 = await writeAnswer({ question: `${ctx.question} (only this part: ${written.gap})`, lang, sheet: gs, note: "The screen will list these reports as links.", fallback: lang === "ta" ? `${head.outletTa ?? head.outlet} இதைப் பற்றி செய்தி வெளியிட்டிருக்கிறது; இணைப்பு திரையில் உள்ளது.` : `${head.outlet} has a report on that; the link is on the screen.` },
        { user: ctx.user, until, firstBy: Math.min(until, now() + 3500), signal: ctx.signal, onSentence: emit, ...(ctx.write ?? {}), now });
      extra.push(...w2.sentences);
      written.tokens += w2.tokens; written.calls += w2.calls; written.rejected.push(...w2.rejected);
      links = { kind: "NewsReader", id: "aide-gap", title: lang === "ta" ? "செய்திகளிலிருந்து" : "From the news", total: found.hits.length,
        items: found.hits.map((h, i) => ({ id: `gap-${i}`, title: h.title.slice(0, 300), source: h.outlet, t: h.at != null ? new Date(h.at).toISOString() : null, place: null, incidentId: null, url: h.url && /^https?:\/\//.test(h.url) ? h.url.slice(0, 2000) : null })) };
    } else {
      const line = nothingLine(found?.phrase ?? gapPhrase(written.gap, ctx.question), lang);
      emit(line);
      extra.push(line);
    }
    said.push(...extra);
    gap = found ? { ...found, said: extra } : { status: "nothing", words: [], hits: [], ms: 0, phrase: gapPhrase(written.gap, ctx.question), said: extra };
  }
  const say = said.join(" ").trim() || fallbackOf(doc, lang);
  const figures = [...new Set(figuresIn(say).map((f) => f.value).filter(Number.isFinite))].slice(0, 60);
  const stage: StageDocT = { ...doc, say: { ...doc.say, [lang]: say }, voice: { by: written.by === "fallback" && !gap ? "fallback" : "aide7", model: written.model, figures },
    blocks: links && doc.blocks.length < 6 ? [...doc.blocks, links] : doc.blocks };
  return { result: { ...r, say, stage }, written, sheet, gap };
}
