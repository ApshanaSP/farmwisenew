/**
 * v7: the answer writer. One streamed call writes the spoken answer from the fact sheet (prompt.ts); as each line arrives it is checked
 * (ground.ts) and, only when it passes, handed on to be spoken (`onSentence`) while the model writes the next. The repair ladder
 * (docs/jarvis/v7-research/10-grounding.md rec 3):
 *   - the first sentence fails: one more try (the same rung, told what was wrong) if there is time before the first-sentence deadline,
 *     else the next rung, else the fallback;
 *   - a later sentence fails: it is dropped and the answer ends with what passed (nothing after a dropped sentence is said: it may lean
 *     on it);
 *   - no rung sends text in its first-text time: the next rung; none left, or the deadline passes with nothing checked: the fallback,
 *     the recipe's own code line (grounded by construction), never an item list.
 * At most four sentences. Every rejected line is kept (text and problems) for the evaluation and the logs; never spoken.
 */
import type { Lang } from "../types";
import type { Rung } from "../llm";
import { checkSentence, parseLine, placesOf, type Fact7, type Problem, type Sheet7 } from "./ground";
import { userMessage, writerSystem, writerTokens } from "./prompt";
import { firstTextMs, openRung, writerRungs, type OpenRung } from "./stream";

export interface WriteInput {
  question: string;
  lang: Lang;
  sheet: Sheet7;
  /** what the screen shows, in one line (facts.ts screenNote) */
  note: string;
  /** the last answer's topic, for a follow-up */
  last?: string | null;
  /** the code line said when no checked sentence comes (v6's, cut to two sentences) */
  fallback: string;
}
export interface WriteOptions {
  user: string;
  /** epoch ms: no new model call after this; the whole answer ends by it */
  until: number;
  /** epoch ms: the first checked sentence by then, else the fallback */
  firstBy: number;
  signal?: AbortSignal;
  onSentence?: (text: string) => void;
  /** tests: the model, and the rungs */
  open?: OpenRung;
  rungs?: (need: number) => Rung[];
  now?: () => number;
  /** a model that named a gap and said nothing else: no fallback (the caller says what the gap search finds instead) */
  noFallbackOnGap?: boolean;
}
export interface Written {
  sentences: string[];
  by: "model" | "fallback";
  model: string | null;
  /** the part of the question the facts do not cover, in the model's words (null: none) */
  gap: string | null;
  rejected: { text: string; problems: Problem[]; model: string }[];
  /** ms from the start to the first checked sentence */
  firstMs: number | null;
  ms: number;
  tokens: number;
  /** model calls made (a re-ask and a next rung each count) */
  calls: number;
  hops: string[];
  facts: number;
}

const MAX_SENTENCES = 4;
const MAX_OUT = 320;
/** a model's preamble, a heading, or its echo of the prompt ("Here is the answer:", "FACTS:", "F1 [dashboard] ...", "QUESTION: ...") */
const JUNK = /^(?:(?:here(?:'s| is)|sure|okay|ok|certainly|answer|output|spoken answer|response)\b[^.!?]*:?\s*$|[A-Z][A-Z ]{1,20}:\s*$|(?:QUESTION|ANSWER IN|SCREEN|FACTS|EARLIER IN THIS CONVERSATION)\s*:|F\d{1,3}\s+\[)/i;
/** a re-ask needs this much time before the first-sentence deadline to be worth making */
const REASK_MS = 1200;

/** The fallback line: the recipe's own words (grounded by construction), at most four sentences, never an announcement that items will be read. */
export function fallbackLines(say: string): string[] {
  const s = say.replace(/\s*(?:Reading them now|I'll read them|Here they are)\.?/gi, "").replace(/\s*படிக்கிறேன்\.?/gu, "").replace(/\s+/g, " ").trim();
  return (s.match(/[^.!?।]+[.!?।]+(?:\s|$)|[^.!?।]+$/gu) ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 4);
}

export async function writeAnswer(input: WriteInput, o: WriteOptions): Promise<Written> {
  const now = o.now ?? Date.now;
  const t0 = now();
  const open = o.open ?? openRung;
  const out: Written = { sentences: [], by: "model", model: null, gap: null, rejected: [], firstMs: null, ms: 0, tokens: 0, calls: 0, hops: [], facts: input.sheet.facts.length };
  let retry: string | null = null;
  const prompt0 = userMessage({ question: input.question, lang: input.lang, note: input.note, facts: input.sheet.facts, last: input.last });
  const rungs = (o.rungs ?? writerRungs)(writerTokens(prompt0, MAX_OUT, input.lang));
  let reasked = false;
  for (let i = 0; i < rungs.length && !out.sentences.length; ) {
    if (o.signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (now() >= o.firstBy || now() >= o.until) { out.hops.push("deadline"); break; }
    const rung = rungs[i];
    const label = `${rung.provider}/${rung.model}`;
    const prompt = retry ? userMessage({ question: input.question, lang: input.lang, note: input.note, facts: input.sheet.facts, last: input.last, retry }) : prompt0;
    const stop = new AbortController();
    const signal = o.signal ? AbortSignal.any([o.signal, stop.signal]) : stop.signal;
    // what this try has said and seen
    let buf = "", gotText = false, ended = false, firstFail: { text: string; problems: Problem[] } | null = null;
    const places = new Set<string>();
    const said: string[] = [];
    const line = (raw: string) => {
      if (ended) return;
      const l = raw.trim();
      if (!l) return;
      const gap = l.match(/^GAP\s*[:：]\s*(.*)$/i);
      if (gap) { const g = gap[1].trim().replace(/[.。]$/, ""); out.gap = /^(?:none|nil|no gap|n\/a|-)?$/i.test(g) ? null : g.slice(0, 160); return; }
      // a preamble, a heading or the facts echoed back is no sentence of the answer: never spoken, never a failure
      if (JUNK.test(l)) return;
      if (said.length >= MAX_SENTENCES) { ended = true; stop.abort(); return; }
      const r = checkSentence(l, input.sheet, places);
      if (!r.ok) {
        out.rejected.push({ text: r.text || parseLine(l).text, problems: r.problems, model: label });
        if (!said.length) firstFail = { text: r.text, problems: r.problems };
        // nothing after a dropped sentence is said
        ended = true; stop.abort();
        return;
      }
      said.push(r.text);
      for (const p of placesOf(r.text, input.sheet.gaz)) places.add(p);
      if (out.firstMs == null) out.firstMs = now() - t0;
      out.sentences.push(r.text);
      o.onSentence?.(r.text);
    };
    const onText = (t: string) => {
      gotText = true;
      buf += t;
      let k: number;
      while ((k = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, k); buf = buf.slice(k + 1); line(l); }
    };
    // the rung's first text, the first-sentence deadline and the whole answer's: whichever comes first stops it
    const tFirst = setTimeout(() => { if (!gotText) stop.abort(); }, Math.max(200, Math.min(firstTextMs(rung.provider), o.firstBy - now())));
    const tFirstBy = setTimeout(() => { if (!said.length) stop.abort(); }, Math.max(0, o.firstBy - now()));
    const tUntil = setTimeout(() => stop.abort(), Math.max(0, o.until - now()));
    out.calls++;
    let completed = false;
    try {
      const done = await open(rung, { name: "jarvis_aide", system: writerSystem(input.lang), prompt, maxOutputTokens: MAX_OUT, user: o.user, signal, timeoutMs: Math.max(1000, o.until - now()) }, onText);
      completed = true;
      out.tokens += done.tokens;
      // the last line has no newline after it; a reply cut off at its token limit leaves an unfinished line, which is not said
      if (done.stop !== "max_tokens" && done.stop !== "length") line(buf);
      out.hops.push(label);
      out.model = done.model;
    } catch (e) {
      if (o.signal?.aborted) throw e;
      out.hops.push(`${label}:${stop.signal.aborted ? (gotText ? "stopped" : "no-text") : "failed"}`);
      if (said.length) out.model = rung.model;
    } finally {
      clearTimeout(tFirst); clearTimeout(tFirstBy); clearTimeout(tUntil);
    }
    if (out.sentences.length) break;
    // a whole reply that names only a gap is the answer (the facts cover nothing asked): the gap search takes over, no other model is asked
    if (completed && out.gap && !firstFail) break;
    // the first sentence failed: once, the same rung is told what was wrong, if there is time; otherwise the next rung
    const failed = firstFail as { text: string; problems: Problem[] } | null;
    if (failed && !reasked && o.firstBy - now() > REASK_MS) {
      reasked = true;
      retry = `"${failed.text.slice(0, 160)}": ${failed.problems.map((p) => p.detail).join("; ")}`;
      continue;
    }
    retry = null;
    i++;
  }
  if (!out.sentences.length && !(o.noFallbackOnGap && out.gap)) {
    out.by = "fallback";
    out.sentences = fallbackLines(input.fallback);
    for (const s of out.sentences) o.onSentence?.(s);
    if (out.sentences.length && out.firstMs == null) out.firstMs = now() - t0;
  }
  out.ms = now() - t0;
  return out;
}

/** The facts an answer's sentences cite (for the record of a turn). */
export const citedIn = (lines: string[], facts: Fact7[]): Fact7[] => {
  const ids = new Set(lines.flatMap((l) => parseLine(l).cites));
  return facts.filter((f) => ids.has(f.id));
};
