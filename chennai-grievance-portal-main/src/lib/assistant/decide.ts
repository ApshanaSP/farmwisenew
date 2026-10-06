/**
 * The router's decision (router-v2), checked against the conversation and turned into what to run: an answer from the
 * store (lists, counts, one incident's facts, news), tools for the composer (explanations, area overviews), or a question
 * back. No imports with side effects: it is unit-tested directly.
 */
import type { AnswerKind } from "@/lib/ai/prompts/router";
import type { Scope } from "@/lib/assistant/answer";
import type { ConversationContext } from "@/lib/assistant/context";
import { detectIntent, type Detected } from "@/lib/assistant/intent";

/** Words that name a period ("recent" is not one: the fast path reads it as the last day, whatever period the router copied). */
const NAMES_PERIOD = /\b(today|tonight|yesterday|daily|day|days|week|weekly|month|monthly|quarter|quarterly|hours?|24 ?h|year|since)\b|இன்று|நேற்று|வார|மாத|காலாண்டு|innaiki|vaaram|maasam/i;

/** The parts of a route the decision reads. */
export interface RouteLike {
  intent: string;
  scope: Scope;
  scopeRaw: Record<string, any>;
  tools: { name: string; args: Record<string, unknown> }[];
  clarify: string | null;
  decision?: Decision;
}

/** The router's understanding of what to answer, checked against the conversation before use. */
export interface Decision {
  answer: AnswerKind;
  incidentId: string | null;
  storyId: string | null;
  find: string | null;
  count: number | null;
  focus: Detected["focus"];
  openOnly: boolean;
  severity: "Severe" | "High" | null;
  options: string[];
}

export const FAST_OF: Partial<Record<AnswerKind, Detected["intent"]>> = {
  incident_list: "INCIDENT_LIST", priority_list: "PRIORITY_INCIDENT_LIST", incident_count: "INCIDENT_COUNT", category_ranking: "CATEGORY_RANKING",
  incident_related: "INCIDENT_RELATED", incident_timeline: "INCIDENT_TIMELINE", news_list: "NEWS_TOP", news_story: "NEWS_DETAIL",
  news_gaps: "NEWS_ONLY_GAPS", actions: "ACTION_REQUEST"
};

/**
 * The router's decision, checked against the conversation: an id it names must be one the Collector was shown (or wrote),
 * never one it made up. Returns what to run: a fast answer from the store (lists, counts, news, one incident's facts),
 * tools for the composer (explanations, area overviews), or a clarifying question.
 */
export function planFromDecision(route: RouteLike, message: string, ctx: ConversationContext | null, placeZone: number | null):
  { fast?: Detected; tools?: RouteLike["tools"]; clarify?: { question: string; options: string[] } } | null {
  const d = route.decision;
  if (!d) return null;
  const shown = new Set([...(ctx?.resultIds ?? []), ctx?.selectedIncidentId ?? ""].filter(Boolean));
  const written = message.match(/\bINC-[A-Z0-9-]{4,40}\b/i)?.[0]?.toUpperCase() ?? null;
  const incidentId = d.incidentId && (shown.has(d.incidentId) || d.incidentId === written) ? d.incidentId : written;
  const stories = new Set([...(ctx?.storyIds ?? []), ctx?.selectedNewsStoryId ?? ""].filter(Boolean));
  const storyId = d.storyId && stories.has(d.storyId) ? d.storyId : null;
  const rules = detectIntent(message, ctx);
  const base: Detected = { ...rules, n: d.count ?? rules.n, sev: d.severity ?? rules.sev, openOnly: d.openOnly || rules.openOnly, incidentId, storyId,
    focus: d.focus, refinement: false, find: d.find, because: "understood by the router",
    // a period only when the words name one (or a follow-up changes it): the router copying the chat's default 90 days into
    // "recent news" is not the Collector asking for 90 days
    period: route.scopeRaw?.period && (NAMES_PERIOD.test(message) || route.intent === "plan_edit") ? route.scopeRaw.period : null };
  switch (d.answer) {
    case "clarify":
      return d.options.length >= 2 ? { clarify: { question: route.clarify || "Which one do you mean?", options: d.options } } : null;
    case "incident_explain":
      // one fact about the selected incident ("is it resolved?", "where?"): a short answer from the record
      if (incidentId && d.focus !== "all") return { fast: { ...base, intent: "INCIDENT_DETAIL" } };
      if (incidentId) return { tools: [{ name: "incident_story", args: { text: incidentId, scope: route.scope } }] };
      if (d.find) return { tools: [{ name: "incident_story", args: { text: d.find, scope: route.scope } }] };
      return null;
    case "area_summary": {
      // a zone's snapshot holds what an overview needs: its rank, the top open incidents with the reasons they matter, the officer
      const zone = route.scope.zone ?? placeZone;
      const extra = route.tools.filter((t) => !["zone_profile", "place_breakdown", "incidents", "search"].includes(t.name)).slice(0, 1);
      if (zone) return { tools: [{ name: "zone_profile", args: { scope: { ...route.scope, zone }, zone } }, ...extra] };
      if (route.tools.length) return { tools: route.tools };
      return { tools: [{ name: "overview_kpis", args: { scope: route.scope } }, { name: "severity", args: { scope: route.scope } }] };
    }
    case "explain_why":
      // one evidence pack (this period against the one before, what moved and where, rain, deadlines, the top open) for one explanation
      return { tools: [{ name: "change_drivers", args: { scope: route.scope.zone == null && placeZone != null ? { ...route.scope, zone: placeZone } : route.scope } }] };
    case "incident_related":
    case "incident_timeline":
      return incidentId ?? ctx?.selectedIncidentId ? { fast: { ...base, intent: FAST_OF[d.answer]!, incidentId: incidentId ?? ctx!.selectedIncidentId! } } : null;
    case "news_story":
      return storyId || d.find ? { fast: { ...base, intent: "NEWS_DETAIL" } } : { fast: { ...base, intent: "NEWS_TOP" } };
    case "actions":
      return { fast: { ...base, intent: "ACTION_REQUEST", incidentId: incidentId ?? (ctx?.selectedIncidentId && /\b(it|this|that)\b/i.test(message) ? ctx.selectedIncidentId : null) } };
    default: {
      // "top 3 severe", "the worst ones": the most important, not the newest
      const ranked = d.answer === "incident_list" && /\b(top|most|worst|biggest|highest|serious|important|critical|major)\b|முக்கிய/i.test(message);
      const intent = ranked ? "PRIORITY_INCIDENT_LIST" : FAST_OF[d.answer];
      if (intent) return { fast: { ...base, intent } };
      // "what about last week?" after a list or news answer: the same answer, with the change
      const last = ctx?.lastIntent as Detected["intent"] | undefined;
      if (route.intent === "plan_edit" && last && Object.values(FAST_OF).includes(last) && last !== "NEWS_DETAIL" && last !== "INCIDENT_TIMELINE")
        return { fast: { ...base, intent: last, refinement: true, n: base.n ?? ctx?.n ?? null } };
      return null;
    }
  }
}
