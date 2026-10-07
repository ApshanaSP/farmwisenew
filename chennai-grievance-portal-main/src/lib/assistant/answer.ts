/**
 * What an answer is, as the server sends it and the dialog draws it. Pure types and
 * helpers with no server imports, so the browser bundle can use them too.
 */
import type { Lang } from "@/lib/assistant/lang";

export type Period = "daily" | "weekly" | "monthly" | "quarterly";
export interface Scope { period: Period; zone: number | null; dept: string | null; cat: string | null; taluk: string | null; /** windows back from now: 1 with a daily period = yesterday */ offset?: number }

// ---------------------------------------------------------------- datasets --

export type Format = "integer" | "decimal1" | "decimal2" | "percent" | "rupee" | "text";
export interface Field {
  key: string;
  label: string;
  kind: "category" | "time" | "value" | "id" | "geo" | "text";
  unit?: string | null;
  format?: Format;
  /** false when a sum over rows means nothing (outlets per incident, scores, ages) */
  additive?: boolean;
}
export type Cell = string | number | boolean | null;
export type DataRow = Record<string, Cell>;

/** A table of rows an answer draws from: every chart, map and table on a card points at one. */
export interface Dataset {
  id: string;
  title: string;
  /** short name for the card's view tabs ("Localities", "Wards", "Map") */
  tab?: string;
  fields: Field[];
  rows: DataRow[];
  /** rows before any cap (the card says "showing 20 of 312") */
  total?: number;
  /** field holding the previous period's value for each `value` field: "<key>_prev" */
  hasPrev?: boolean;
  /** the usual range for a time series (descriptive: the preceding windows, never a forecast) */
  normal?: { lo: number; hi: number; basis: string } | null;
  /** clicking a mark filters the console: which field and which action */
  drill?: { field: string; action: ConsoleActionName } | null;
  /** incident id per row, for "open incident" */
  idField?: string | null;
}

// ------------------------------------------------------------------ charts --

export const CHART_TYPES = ["bar", "horizontal_bar", "stacked_bar", "grouped_bar", "dumbbell", "line", "area", "small_multiples", "donut", "rose", "treemap", "gauge", "heatmap", "kpi",
  "table", "map_zones", "map_wards", "map_points", "map_hotspots"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export interface ChartSpec {
  type: ChartType;
  dataset: string;
  /** the finding, as a sentence */
  title: string;
  subtitle: string | null;
  /** category or time field */
  x: string | null;
  /** value fields; all share one unit (no dual axis) */
  y: string[];
  /** field that splits the values into series (stacked, grouped, lines, heatmap rows) */
  series: string | null;
  /** faded previous-period marks, when the dataset has them */
  compare: boolean;
  normalBand: boolean;
  threshold: { value: number; label: string } | null;
  /** "max" | "min" | "last" | "none" | a category value */
  highlight: string;
  callout: boolean;
  sort: "desc" | "asc" | "none";
  topN: number;
  /** category labels in the reply language */
  labels: { from: string; to: string }[];
}

// --------------------------------------------------------- console actions --

export const CONSOLE_ACTIONS = ["filter_zone", "filter_dept", "filter_taluk", "filter_cat", "set_period", "open_incident", "open_story",
  "open_briefing", "save_briefing", "show_on_map"] as const;
export type ConsoleActionName = (typeof CONSOLE_ACTIONS)[number];
export interface ConsoleAction {
  action: ConsoleActionName;
  label: string;
  zone?: number | null;
  dept?: string | null;
  taluk?: string | null;
  cat?: string | null;
  period?: Period | null;
  id?: string | null;
}

// ------------------------------------------------------------------- cards --

export interface Kpi { label: string; value: number; prev?: number | null; unit?: string | null; format?: Format; tone?: "sev" | "high" | "low" | "info" }

export interface AnswerSources {
  tools: { name: string; args: Record<string, unknown>; ms: number }[];
  /** the compiled SELECTs of an ad-hoc answer, with their parameters */
  sql: { text: string; params: unknown[] }[];
  plan: unknown | null;
  refs: { kind: string; name: string; detail?: string }[];
  rows: number;
  incidentIds: string[];
  models: { step: string; provider: string; model: string; ms: number; tokens: number; inTokens?: number; outTokens?: number }[];
  verifier: { checked: number; unmatched: string[]; regenerated: boolean; template: boolean };
  assumptions: string[];
  limits: string[];
}

export type Display = "chart" | "kpi" | "table" | "text" | "map";

// ------------------------------------------------------- structured answers --
// Incident and news answers carry their records, so the dialog draws incident cards, an incident's story and news
// stories instead of a generic summary. Every field comes from the store (the "what happened" line is the pipeline's
// number-checked AI text when it exists, else the rule-based summary); nothing here is written by the chat model.

export interface EvidenceItem {
  kind: string;
  /** "News report", "Police record", "Citizen complaint"... */
  label: string;
  title: string | null;
  publisher?: string | null;
  url: string | null;
  t: string | null;
}

export interface IncidentItem {
  incidentId: string;
  title: string;
  /** what happened, 1-2 sentences */
  summary: string;
  /** true when the summary is the pipeline's AI text (written from the incident's facts, numbers checked) */
  aiWritten: boolean;
  category: string;
  location: string | null;
  ward: number | null;
  zone: string | null;
  taluk: string | null;
  occurredAt: string | null;
  severity: string;
  priorityScore: number | null;
  priorityReasons: string[];
  status: string;
  department: string | null;
  sourceCount: number;
  newsOutletCount: number;
  citizenComplaintCount: number;
  dead: number;
  injured: number;
  lat: number | null;
  lon: number | null;
  evidence: EvidenceItem[];
}

export interface TimelineStep { t: string; step: string; actor: string | null; note: string | null }

export interface IncidentDetail extends IncidentItem {
  /** 2-4 sentences from the linked records */
  whatHappened: string;
  /** short facts: injured, people affected, road blocked... */
  facts: string[];
  /** why it needs the Collector's attention (the pipeline's reasons; empty when it does not) */
  attention: string[];
  timeline: TimelineStep[];
  deadline: string | null;
  deadlineMissed: boolean;
  closedAt: string | null;
  officials: { name: string; designation: string | null; office: string | null }[];
  /** the part the question asked about ("where did it happen?") */
  focus: "all" | "where" | "when" | "status" | "who";
}

export interface NewsStory {
  storyId: string;
  headline: string;
  /** 2-3 sentences */
  summary: string;
  aiSummary: boolean;
  publishedAt: string | null;
  location: string | null;
  category: string | null;
  department: string | null;
  /** independent outlets that carried the story */
  sourceCount: number;
  sources: { publisher: string | null; title: string; url: string | null; t: string | null }[];
  matchedIncidentId: string | null;
  departmentRecordFound: boolean;
  whyRelevant: string[];
}

export interface ActionItem { text: string; owner: string | null; due: string | null; from: string }
export interface ActionGroup { incidentId: string | null; title: string; items: ActionItem[] }

export type ResponseType = "incident_list" | "incident_detail" | "news_list" | "news_detail" | "kpi" | "category_ranking" | "actions" | "chart" | "map" | "table" | "text";

export interface AnswerCard {
  id: string;
  kind: "answer" | "refusal" | "clarify" | "error" | "action";
  language: Lang;
  display: Display;
  headline: string;
  /** the question after typo correction, when it was corrected ("Understood as: tomato price") */
  understood?: string | null;
  /** the question asked for a chart, graph or map; otherwise the card answers in words and draws its chart only on "Visualise" */
  visualAsked?: boolean;
  /** markdown without HTML; the dialog renders it safely */
  answerMarkdown: string;
  voiceSummary: string;
  voiceLang: "en-IN" | "ta-IN";
  chart: ChartSpec | null;
  /** why this chart suits the question, in a few words (the composer's, else the form rules') */
  chartReason?: string | null;
  datasets: Dataset[];
  kpis: Kpi[];
  /** dataset shown as a table (list answers) */
  table: string | null;
  followUps: string[];
  /** narrowing chips (large requests) or example questions (refusals) */
  chips: string[];
  consoleActions: ConsoleAction[];
  /** console actions applied as soon as the answer arrives (the Collector asked for them) */
  autoActions: ConsoleAction[];
  /** set when the card opened one of today's insights: its 👍/👎 ranks insights */
  insightKey?: string | null;
  caveats: string[];
  scope: Scope | null;
  scopeLine: string;
  asOf: string;
  testData: boolean;
  sources: AnswerSources;
  /** a download the answer offers, e.g. a capped CSV export */
  download?: { label: string; href: string } | null;
  offline?: boolean;
  /** which response component draws the answer (absent on answers saved before structured answers: the generic card) */
  responseType?: ResponseType;
  /** the explicit intent the question was read as (intent.ts) */
  intent?: string;
  incidents?: IncidentItem[];
  incident?: IncidentDetail | null;
  stories?: NewsStory[];
  actions?: ActionGroup[];
  /** the conversation state after this answer, read back for the next question's follow-ups */
  context?: import("@/lib/assistant/context").ConversationContext;
}

export const emptySources = (): AnswerSources => ({
  tools: [], sql: [], plan: null, refs: [], rows: 0, incidentIds: [], models: [], verifier: { checked: 0, unmatched: [], regenerated: false, template: false },
  assumptions: [], limits: []
});
