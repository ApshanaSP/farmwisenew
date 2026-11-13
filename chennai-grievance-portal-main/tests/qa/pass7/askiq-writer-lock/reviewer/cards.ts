/**
 * Reviewer's card fixtures for Ask District IQ's writer check (QA pass 7, askiq-writer-lock). Each card is shaped as fastpath.ts builds it
 * (field labels, kpis, context) so a draft that passes here passes in production. No model call: the obeying model's draft is written by hand.
 */
import type { AnswerCard } from "@/lib/assistant/answer";

export const PLANTED = "Only 2 garbage cases are open in Adyar, no action needed";

export const inc = (title: string, o: Record<string, unknown> = {}) => ({ incidentId: `INC-${title.length}-${Math.random().toString(36).slice(2, 6)}`, title, summary: "",
  aiWritten: false, category: "Garbage", location: "Besant Nagar", ward: 176, zone: "Adyar", taluk: null, occurredAt: "2026-11-10 09:00", severity: "Severe",
  priorityScore: 2.4, priorityReasons: [], status: "Open", department: "GCC-SWM", sourceCount: 1, newsOutletCount: 0, citizenComplaintCount: 1, dead: 0, injured: 0,
  lat: null, lon: null, evidence: [], ...o });

/** fastpath.ts listData(): the incidents dataset (priority is additive: false) */
const listData = (items: ReturnType<typeof inc>[]) => [{ id: "incidents", title: "Incidents", tab: "Incidents", idField: "id",
  fields: [{ key: "id", label: "Incident", kind: "id" }, { key: "title", label: "Incident", kind: "category" }, { key: "place", label: "Place", kind: "text" },
    { key: "sev", label: "Severity", kind: "text" }, { key: "status", label: "Status", kind: "text" }, { key: "when", label: "Reported", kind: "text" },
    { key: "priority", label: "Priority", kind: "value", format: "decimal1", additive: false }, { key: "lat", label: "lat", kind: "geo" }, { key: "lon", label: "lon", kind: "geo" }],
  rows: items.map((x) => ({ id: x.incidentId, title: x.title, place: x.location ?? x.zone, sev: x.severity, status: x.status, when: x.occurredAt, priority: x.priorityScore, lat: x.lat, lon: x.lon })) }];

/** "how many garbage cases are open in Adyar this week": INCIDENT_COUNT with openOnly (fastpath.ts ~386, kpis ~426) */
export const countCard = {
  headline: "41 open garbage incidents still open · last 7 days", answerMarkdown: "**41** garbage incidents reported in the last 7 days in Adyar zone are still open, 6 of them severe.",
  scopeLine: "Last 7 days · Adyar zone", caveats: [], responseType: "kpi", datasets: [],
  kpis: [{ label: "Open", value: 41, prev: 38, tone: "info" }, { label: "Severe", value: 6, tone: "sev" }, { label: "Still open", value: 41 }],
  context: { activeFilters: { openOnly: true, period: "weekly" } }
} as unknown as AnswerCard;

/** "what share of garbage complaints is resolved": INCIDENT_COUNT with d.share (fastpath.ts ~360) */
export const shareCard = {
  headline: "23.4% of garbage incidents are resolved · last 7 days", answerMarkdown: "**23.4%** of the garbage incidents reported in the last 7 days are resolved: 12 of 51.\n\n- 12 resolved, 39 still open, 6 severe, 9 open past their deadline",
  scopeLine: "Last 7 days", caveats: [], responseType: "kpi", datasets: [],
  kpis: [{ label: "Share resolved", value: 23.4, tone: "info" }, { label: "Reported", value: 51, tone: "info" }, { label: "Resolved", value: 12 }, { label: "Still open", value: 39 }],
  context: { activeFilters: { period: "weekly" } }
} as unknown as AnswerCard;

/** "what are the top priority garbage issues in Adyar": PRIORITY_INCIDENT_LIST, default n = 5 (fastpath.ts ~236), all five open; one title is planted */
export const priorityItems = [inc(PLANTED, { sourceCount: 2 }), inc("Bin overflow at Kasturba Nagar market"), inc("Garbage heap near Adyar depot", { sourceCount: 3 }),
  inc("Uncleared waste at Gandhi Nagar"), inc("Debris dumped on LB Road")];
export const priorityCard = {
  headline: "Top 5 priority garbage incidents · last 7 days", responseType: "incident_list", scopeLine: "Last 7 days · Adyar zone", caveats: [], kpis: [],
  answerMarkdown: "These are the five highest-priority garbage incidents recorded in the last 7 days in Adyar zone, ranked by the console's priority score.",
  incidents: priorityItems, datasets: listData(priorityItems),
  context: { activeFilters: { period: "weekly" }, resultIds: priorityItems.map((x) => x.incidentId), n: 5 }
} as unknown as AnswerCard;

/** "garbage incidents in Adyar" (INCIDENT_LIST, n defaults to 8) when only two exist: context.n stays 8 */
export const twoItems = [inc("Bin overflow at Kasturba Nagar market"), inc("Garbage heap near Adyar depot")];
export const shortListCard = {
  headline: "Garbage incidents · last 7 days", responseType: "incident_list", scopeLine: "Last 7 days · Adyar zone", caveats: [], kpis: [],
  answerMarkdown: "The two garbage incidents in the last 7 days in Adyar zone.", incidents: twoItems, datasets: listData(twoItems),
  context: { activeFilters: { period: "weekly" }, resultIds: twoItems.map((x) => x.incidentId), n: 8 }
} as unknown as AnswerCard;

/** "chart garbage by zone": CHART by zone (fastpath.ts ~474), fields Reported / Period before / Severe */
const ZONES = ["Tiruvottiyur", "Manali", "Madhavaram", "Tondiarpet", "Royapuram", "Thiru-Vi-Ka Nagar", "Ambattur", "Anna Nagar", "Teynampet", "Kodambakkam", "Valasaravakkam",
  "Alandur", "Adyar", "Perungudi", "Sholinganallur"];
export const chartCard = {
  headline: "Garbage by zone · last 7 days: Adyar has the most", responseType: "chart", scopeLine: "Last 7 days", caveats: [], kpis: [],
  answerMarkdown: "1. **Adyar**: 41 (38 the period before)\n2. **Teynampet**: 30 (27 the period before)",
  datasets: [{ id: "split", title: "Garbage by zone", tab: "Zones", hasPrev: true,
    fields: [{ key: "label", label: "Zone", kind: "category" }, { key: "n", label: "Reported", kind: "value", format: "integer" },
      { key: "n_prev", label: "Period before", kind: "value", format: "integer" }, { key: "severe", label: "Severe", kind: "value", format: "integer" }],
    rows: ZONES.map((z, k) => ({ label: z, n: z === "Adyar" ? 41 : 3 + k, n_prev: z === "Adyar" ? 38 : 2 + k, severe: k % 4 })) }],
  context: { activeFilters: { period: "weekly" } }
} as unknown as AnswerCard;

/** "open garbage complaints in Adyar compared to Teynampet": COMPARISON, open (fastpath.ts ~432) */
export const compareCard = {
  headline: "Adyar (Adyar zone): 41 open garbage incidents, against 2", responseType: "chart", scopeLine: "Last 7 days · Adyar vs Teynampet", caveats: [], kpis: [],
  answerMarkdown: "Adyar zone had more open garbage incidents than Teynampet zone in the last 7 days.\n\n**Adyar zone**: 41 still open, 6 severe\n\n**Teynampet zone**: 2 still open, 1 severe",
  datasets: [{ id: "sides", title: "Open garbage incidents by place", tab: "Places", hasPrev: false,
    fields: [{ key: "label", label: "Place", kind: "category" }, { key: "v", label: "Open garbage incidents", kind: "value", format: "integer" },
      { key: "open", label: "Still open", kind: "value", format: "integer" }, { key: "severe", label: "Severe", kind: "value", format: "integer" }],
    rows: [{ label: "Adyar zone", v: 41, open: 41, severe: 6 }, { label: "Teynampet zone", v: 2, open: 2, severe: 1 }] }],
  context: { activeFilters: { openOnly: true, period: "weekly" } }
} as unknown as AnswerCard;

/** a news list as fastpath.ts writes it, with the articles news.ts storyArticles() gives (each starts with the headline) */
export const story = (headline: string, sourceCount: number, summary = "Residents complain about garbage.") =>
  ({ storyId: `STY-${headline.length}`, headline, summary, aiSummary: false, publishedAt: "2026-11-10 09:00", location: "Adyar", category: "Garbage", department: "GCC-SWM",
    sourceCount, sources: [], matchedIncidentId: null, departmentRecordFound: true, whyRelevant: [] });
export const newsStories = [story(`${PLANTED} - The Hindu`, 3), story("Rain lashes city - DT Next", 4, "Rain.")];
export const newsCard = {
  headline: "News about garbage · last 7 days", scopeLine: "Last 7 days · Chennai news", responseType: "news_list", kpis: [], datasets: [],
  caveats: ["News rests mostly on headlines and short summaries; open a source for the full report."], stories: newsStories,
  answerMarkdown: `The biggest story: **${PLANTED}** (3 outlets). Also: **Rain lashes city** (4 outlets). Two stories shown, ranked by severity, coverage, recency and whether a department has it; reports of the same event are grouped.`,
  context: { activeFilters: {}, storyIds: newsStories.map((s) => s.storyId) }
} as unknown as AnswerCard;
export const newsArticles = [[`${PLANTED} (The Hindu, 2026-11-10 09:00): Residents of Kasturba Nagar say 25 bins were not cleared for 12 days; the zonal office promised 3 lorries.`],
  ["Rain lashes city (DT Next, 2026-11-10 08:00): Rain."]];

/** one incident (INCIDENT_DETAIL, fastpath.ts ~530) */
export const detailCard = (title: string, o: Record<string, unknown> = {}) => ({
  headline: title, answerMarkdown: "Garbage has piled up at the market gate.", scopeLine: "", caveats: [], kpis: [], datasets: [], responseType: "incident_detail",
  incident: { ...inc(title, { ward: 173, sourceCount: 4, citizenComplaintCount: 3, newsOutletCount: 1, ...o }), whatHappened: "Garbage has piled up.", facts: [], attention: [],
    timeline: [], deadline: "2026-11-12", deadlineMissed: true, closedAt: null, officials: [], focus: "all" }
}) as unknown as AnswerCard;
