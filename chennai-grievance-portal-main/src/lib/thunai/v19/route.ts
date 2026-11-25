/**
 * v19 (25 Nov): which turns the analyst answers. Pure. The reader says what kind of turn it is (a chat, a move, an act on the open screen); the
 * analyst's plan says whether the records answer it and how, or that a whole ready screen is wanted. A question with any limit of its own is
 * always the analyst's: the ready screens have no slot for it.
 */
import type { Reading } from "../v16/reader";
import type { Lang } from "../types";
import type { Plan } from "./shape";

/** turns that are not a question of the records, whatever the plan says */
const NEVER: ReadonlySet<string> = new Set(["chat", "meta", "navigate", "stage_op", "repeat", "unclear", "dataset", "nearby", "general"]);
/** what the plan's "not held" may answer: a plain question of the records (an event, a visit or an outside fact has its own lanes) */
const PLAIN: ReadonlySet<string> = new Set(["cases", "ranking", "trend", "compare", "performance", "readings", "prices", "other", "situation", "summary"]);
/** an act on the analyst's own screen that asks for other data ("sort by oldest", "the next one", "only the open ones"): the analyst's again */
const ASKS_AGAIN = /\b(?:sort|order|arrange|only|just|filter|next|previous|second|third|oldest|newest|latest|which|how many|what|show|list|count)\b|மட்டும்|அடுத்த|வது|எத்தனை|எந்த/i;
/** to see the city on the map: the live city view's own (the Traffic view, flooded streets) */
const SEE_MAP = /\b(?:on|in|to) (?:the |a )?map\b|\bmap (?:it|them|this|that|view)\b|மேப்|வரைபட/i;

export function analystTakes(rd: Pick<Reading, "ask"> | null, plan: Plan | null, text: string, onAsk = false): "answer" | "not_held" | "no" | "never" {
  if (rd && NEVER.has(rd.ask) && !(rd.ask === "stage_op" && onAsk && ASKS_AGAIN.test(text) && !/\b(?:read|open|close|draft|pin|export|save|stop|back|explain)\b/i.test(text))) return "never";
  if (!plan) return "no";
  if (plan.kind === "answer" && plan.queries.length) {
    // one case told about in full is the case screen's ("tell me about the Retteri lake case")
    if (rd?.ask === "case" && plan.queries.every((q) => !q.by && !(q.take && q.take > 1) && !q.sev.length && !q.depts.length && !q.status)) return "no";
    if (SEE_MAP.test(text) && plan.queries.every((q) => q.of === "traffic") && !plan.queries.some((q) => q.rank || q.take)) return "no";
    return "answer";
  }
  if (plan.kind === "not_held" && rd && PLAIN.has(rd.ask)) return "not_held";
  return "no";
}

/** what Jarvis says for something the records do not hold: no figure, no guess */
export function notHeldReply(p: Plan, lang: Lang): string {
  const gap = (p.gap ?? "").replace(/[0-9]+/g, "").replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim();
  return lang === "ta"
    ? `டாஷ்போர்டில் ${/[஀-௿]/.test(gap) ? gap : "அந்தத் தகவல்"} இல்லை. சம்பவங்கள், போக்குவரத்து, காற்று, மழை, ஏரிகள், விலை, செய்திகள் பற்றிக் கேட்கலாம்.`
    : `The dashboard does not hold ${gap || "that"}. I can answer from its incidents, traffic, air, rain, lakes, prices and news.`;
}
