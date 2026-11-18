/**
 * v8: which model a planner turn gets (docs/jarvis/v8-research/50-claude-models.md, "Which model a turn gets").
 *
 *   1. No model for what code settles (the lanes before the planner): most turns, and their speed does not change.
 *   2. The fast model (Haiku 5.5 when the owner's key works, else the Groq ladder) for the planner's ordinary turns.
 *   3. The deep model (Sonnet 5.5, `JARVIS_DEEP_MODEL`; `off` or `0` turns it off) for a hard or unclear turn: an analysis question (why,
 *      compare, explain, what changed), a long or many-part request, or a reference the code could not bind with a screen or a conversation
 *      behind it; and once more, when the fast plan came back asking a question, as "other", or with nothing usable, and there is time.
 * One deep call per turn at most. JARVIS_UNDERSTAND=v7 turns the deep model off. Pure.
 */
import { understandV8 } from "./flag8";

export const DEEP_DEFAULT = "claude-sonnet-5-5";

/** the deep model's id, or null (switched off, or v7) */
export function deepModel(): string | null {
  if (!understandV8()) return null;
  const v = (process.env.JARVIS_DEEP_MODEL ?? "").trim();
  if (/^(?:off|0|none|false)$/i.test(v)) return null;
  return v || DEEP_DEFAULT;
}

const REF = /\b(?:that|this|it|those|these|them|the other|same)\b|\b(?:adhu|idhu|andha|indha|athu|ithu)\b|அது|இது|அந்த|இந்த/iu;
const PARTS = /\b(?:and|then|also|plus|after that|as well)\b|,|மற்றும்|அப்புறம்/iu;

/** Is this planner turn hard or unclear enough for the deep model? */
export function deepTurn(text: string, o: { analysis: boolean; context: boolean }): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (o.analysis) return true;
  if (words >= 14) return true;
  if (words >= 8 && PARTS.test(text)) return true;
  if (o.context && REF.test(text) && words <= 10) return true;
  return false;
}

/** the fast plan was no answer: a question back, "other", or nothing usable (a greeting's chat is an answer) */
export const escalate = (kind: string | null | undefined, text: string): boolean =>
  kind === "clarify" || kind === "other" || kind === "none" || (kind === "chat" && !/^\s*(?:hi|hello|hey|thanks|thank you|good (?:morning|evening|afternoon)|vanakkam|வணக்கம்|நன்றி)\b/i.test(text));
