/**
 * Structured conversation state, saved with every assistant answer (in its payload) and read back for the next
 * question: which incidents or stories the answer listed, which one is selected, the filters in force and the kind of
 * answer. Follow-ups ("the second one", "where did it happen?", "any similar nearby?", "only Adyar") resolve against
 * this, not against the model's reading of the chat text.
 */
import type { ResponseType, Scope } from "@/lib/assistant/answer";

export interface ActiveFilters {
  period?: Scope["period"];
  zone?: number | null;
  taluk?: string | null;
  dept?: string | null;
  cat?: string | null;
  /** a topic covering several categories ("crime", "flooding") */
  topic?: string | null;
  sev?: string | null;
  openOnly?: boolean;
  /** only open ones past their deadline */
  overdue?: boolean;
}

export interface ConversationContext {
  lastIntent?: string;
  activeFilters: ActiveFilters;
  lastResponseType?: ResponseType;
  /** incidents the last answer listed, in the order shown */
  resultIds?: string[];
  /** news stories the last answer listed, in the order shown */
  storyIds?: string[];
  selectedIncidentId?: string | null;
  selectedNewsStoryId?: string | null;
  lastVisualization?: string | null;
  /** how many the last list asked for ("top 3") */
  n?: number | null;
  /** the listed items' titles, in the order shown (so the router can tell the AI what "the second one" is) */
  resultTitles?: string[];
  storyTitles?: string[];
  selectedTitle?: string | null;
}

/**
 * The previous answer's state, written for the router: the selected item and the numbered list the Collector sees, so
 * "the second one", "is it resolved?" or "the Odisha one" can be resolved by understanding, not by keywords.
 */
export function contextForRouter(c: ConversationContext | null): string {
  if (!c) return "";
  const out: string[] = [];
  if (c.selectedIncidentId) out.push(`Selected incident: ${c.selectedIncidentId}${c.selectedTitle ? ` (${c.selectedTitle})` : ""}`);
  if (c.selectedNewsStoryId) out.push(`Selected news story: ${c.selectedNewsStoryId}${c.selectedTitle ? ` (${c.selectedTitle})` : ""}`);
  const list = (label: string, ids?: string[], titles?: string[]) => {
    if (!ids?.length) return;
    const rows = ids.slice(0, 10).map((id, k) => `${k + 1}. ${id}${titles?.[k] ? `: ${titles[k].slice(0, 90)}` : ""}`);
    out.push(`${label} (numbered as shown):\n${rows.join("\n")}`);
  };
  if (String(c.lastResponseType ?? "").startsWith("news")) { list("Last news list", c.storyIds, c.storyTitles); list("Earlier incident list", c.resultIds, c.resultTitles); }
  else { list("Last incident list", c.resultIds, c.resultTitles); list("Earlier news list", c.storyIds, c.storyTitles); }
  const f = c.activeFilters ?? {};
  const filters = Object.entries(f).filter(([, v]) => v != null && v !== false && v !== "").map(([k, v]) => `${k}=${v}`).join(", ");
  if (filters) out.push(`Filters of the last answer: ${filters}`);
  return out.join("\n");
}

export const emptyContext = (): ConversationContext => ({ activeFilters: {} });

/** The context the last assistant answer saved (newest first in `turns` is not assumed: the last one with a context wins). */
export function lastContext(turns: Record<string, any>[]): ConversationContext | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const c = turns[i].context;
    if (turns[i].role === "assistant" && c && typeof c === "object" && "activeFilters" in (c as object)) return c as ConversationContext;
  }
  return null;
}

/** Filters from a console scope (what the answer covered). */
export function filtersOf(s: Scope | null | undefined, extra: Partial<ActiveFilters> = {}): ActiveFilters {
  return { period: s?.period, zone: s?.zone ?? null, taluk: s?.taluk ?? null, dept: s?.dept ?? null, cat: s?.cat ?? null, ...extra };
}
