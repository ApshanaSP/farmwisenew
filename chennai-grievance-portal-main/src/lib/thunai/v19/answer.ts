/**
 * v19 (25 Nov): the analyst's screen goes up at once and its answer is said sentence by sentence as it passes the check (say.ts). Server only.
 */
import type { AgentResult } from "../agent";
import { extrasOf } from "../aide7/extras";
import type { OpenRung } from "../aide7/stream";
import type { Rung } from "../llm";
import { figuresIn } from "../numbergate";
import type { RoundOut } from "../round";
import { telemetry } from "../telemetry";
import type { StageDocT } from "../stage";
import type { Lang, World } from "../types";
import { sayAnswer } from "./say";

export interface AskAnswerCtx {
  question: string; world: World; user: string; signal?: AbortSignal; last: string | null; until: number;
  write?: { open?: OpenRung; rungs?: (need: number) => Rung[] };
  ready?: (stage: StageDocT) => void;
  sentence?: (text: string, lang: Lang) => void;
}
/** how long the first sentence may take after the screen is up, before code's own line is said */
const FIRST_MS = 3200;
const figs = (t: string) => [...new Set(figuresIn(t).map((f) => f.value).filter(Number.isFinite))];

export async function askAnswer(o: RoundOut, r: AgentResult & { stage: StageDocT }, c: AskAnswerCtx): Promise<RoundOut> {
  const lang: Lang = r.lang === "ta" ? "ta" : "en";
  const doc = r.stage;
  const x = extrasOf(doc);
  const facts = x?.ask ?? null;
  const fallback = doc.say[lang] || doc.say.en;
  // every figure of the results may be said (the server holds each sentence to them; the browser's gate lets these through)
  const known = [...new Set([...figs(facts ?? ""), ...figs(fallback)])].slice(0, 200);
  c.ready?.({ ...doc, voice: { by: "aide7", model: null, figures: known } });
  const t0 = Date.now();
  const said = facts
    ? await sayAnswer({ question: c.question, lang, facts, fallback, last: c.last, world: c.world, check: x?.askCheck ?? null },
      { user: c.user, signal: c.signal, until: c.until, firstBy: Math.min(c.until, t0 + FIRST_MS), onSentence: c.sentence ? (s) => c.sentence!(s, lang) : undefined, ...(c.write ?? {}) })
    : { sentences: [fallback], by: "code" as const, model: null, tokens: 0, calls: 0, firstMs: 0, rejected: [] as string[] };
  if (!facts) c.sentence?.(fallback, lang);
  telemetry("analyst-say", { by: said.by, model: said.model, ms: Date.now() - t0, firstMs: said.firstMs, sentences: said.sentences.length, rejected: said.rejected.length });
  if (said.rejected.length) console.info(`[jarvis analyst] not said: ${said.rejected.join(" | ").slice(0, 400)}`);
  const say = said.sentences.join(" ").replace(/\s+/g, " ").trim() || fallback;
  const stage: StageDocT = { ...doc, say: { ...doc.say, [lang]: say.slice(0, lang === "ta" ? 900 : 600) }, voice: { by: said.by === "model" ? "aide7" : "fallback", model: said.model, figures: figs(say).slice(0, 60) } };
  return { ...o, result: { ...r, say, stage }, tokens: o.tokens + said.tokens, calls: o.calls + said.calls, timing: { ...(o.timing ?? {}), ...(said.firstMs != null ? { aideFirst: t0 + said.firstMs } : {}) } };
}
