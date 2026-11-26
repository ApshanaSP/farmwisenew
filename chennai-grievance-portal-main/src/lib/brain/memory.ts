/**
 * The conversation the brain remembers: what was asked, what was answered and the results it rested on, for each person and channel (Jarvis's
 * voice, each chat). Kept in the server for an hour; after a restart the chat's saved messages and Jarvis's own last turns fill in the words.
 */
import { digestOf } from "./format";
import type { Evidence, FinalAnswer } from "./types";

export interface Turn { at: number; user: string; answer: FinalAnswer; evidence: Evidence[] }
interface Conv { at: number; turns: Turn[] }

const TTL = 60 * 60_000, MAX = 10, CONVS = 60;
const g = globalThis as { __brainConvs?: Map<string, Conv> };
const convs = (): Map<string, Conv> => (g.__brainConvs ??= new Map());

export function recall(key: string): Turn[] {
  const c = convs().get(key);
  if (!c) return [];
  if (Date.now() - c.at > TTL) { convs().delete(key); return []; }
  return c.turns;
}
export function keep(key: string, t: Turn): void {
  const c = convs().get(key) ?? { at: 0, turns: [] };
  c.at = Date.now();
  // old results are let go (the words stay): a page of tables per turn adds up
  c.turns = [...c.turns, t].slice(-MAX).map((x, k, a) => (k < a.length - 4 ? { ...x, evidence: [] } : x));
  convs().delete(key);
  convs().set(key, c);
  while (convs().size > CONVS) convs().delete(convs().keys().next().value as string);
}
export const forget = (key: string): void => { convs().delete(key); };
export const forgetAll = (): void => convs().clear();

/** the earlier turns as the model reads them: the words, and for the last three what was read then */
export function historyOf(turns: Turn[], now = Date.now()): { user: string; assistant: string; digest?: string }[] {
  return turns.filter((t) => now - t.at < TTL).map((t, k, a) => ({
    user: t.user,
    assistant: [t.answer.say, ...(t.answer.points.length ? [t.answer.points.map((p) => `- ${p}`).join("\n")] : []), ...(t.answer.kind === "clarify" && t.answer.options.length ? [`(choices: ${t.answer.options.map((o) => o.label).join(" | ")})`] : [])].join("\n"),
    ...(k >= a.length - 3 && t.evidence.length ? { digest: digestOf(t.evidence, k === a.length - 1 ? 3600 : 1800) } : {})
  }));
}
export const pastOf = (turns: Turn[]): Evidence[] => turns.slice(-3).flatMap((t) => t.evidence);
export function lastLangOf(turns: Turn[]): "en" | "ta" | null { return turns.at(-1)?.answer.lang ?? null; }
