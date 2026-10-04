/**
 * Dynamic few-shot examples for the router: a bank of worked questions and the decision each should get. For every new
 * question the few closest by meaning (the same local multilingual e5 model the search uses, so English, Tamil and
 * Tanglish match each other) are shown to the router, instead of one long fixed list of patterns in every prompt.
 * Fewer tokens, and the examples the router sees are the ones that matter for this question.
 */
import { embed } from "@/lib/assistant/embed";

interface Example { q: string; a: string }

/** The bank: what the Collector asks, and the router fields that answer it (only the ones that matter). */
export const EXAMPLES: Example[] = [
  { q: "explain about the Anna Nagar issue", a: `answer area_summary, scope.zone 8 (no single incident is named: an overview, not a list)` },
  { q: "what is happening in Adyar", a: `answer area_summary, scope.zone 13` },
  { q: "Anna Nagar la enna problem?", a: `language tanglish, answer area_summary, scope.zone 8` },
  { q: "அண்ணா நகர் பிரச்சனை என்ன?", a: `language ta, answer area_summary, scope.zone 8` },
  { q: "why is Adyar so high this week", a: `answer explain_why, scope.zone 13, scope.period weekly` },
  { q: "what changed since last week", a: `answer explain_why, scope.period weekly` },
  { q: "is the flooding situation getting better", a: `answer explain_why, scope.cat FLOODING` },
  { q: "what should I focus on today", a: `answer explain_why, scope.period daily` },
  { q: "show severe incidents today", a: `answer incident_list, severity Severe, scope.period daily` },
  { q: "top 5 priority incidents", a: `answer priority_list, count 5` },
  { q: "top 3 crime types this month", a: `answer category_ranking, count 3, scope.period monthly (kinds of incident, not the incidents)` },
  { q: "how many road accidents this quarter", a: `answer incident_count, scope.cat ROAD_ACCIDENT, scope.period quarterly` },
  { q: "explain the second one", a: `answer incident_explain, refIncidentId = item 2 of the last incident list` },
  { q: "is it resolved?", a: `answer incident_explain, focus status, refIncidentId = the selected incident` },
  { q: "which department handles it", a: `answer incident_explain, focus who, refIncidentId = the selected incident` },
  { q: "where did it happen", a: `answer incident_explain, focus where, refIncidentId = the selected incident` },
  { q: "tell me about the fire in Guindy yesterday", a: `answer incident_explain, find "fire in Guindy", scope.zone 13, scope.period daily` },
  { q: "what is this murder case in Velachery", a: `answer incident_explain, find "murder in Velachery", scope.zone 13` },
  { q: "any similar cases nearby?", a: `answer incident_related, refIncidentId = the selected incident` },
  { q: "how did it unfold", a: `answer incident_timeline, refIncidentId = the selected incident` },
  { q: "top news today", a: `answer news_list, scope.period daily` },
  { q: "about that odisha worker news", a: `answer news_story, find "Odisha guest worker stabbed"` },
  { q: "tell me more about the first story", a: `answer news_story, refStoryId = item 1 of the last news list` },
  { q: "news with no department record", a: `answer news_gaps` },
  { q: "what should we do about it", a: `answer actions, refIncidentId = the selected incident` },
  { q: "what about last week?", a: `intent plan_edit, answer other, scope.period weekly (the previous answer again, for last week)` },
  { q: "only Zone 13", a: `intent plan_edit, answer other, scope.zone 13` },
  { q: "the Anna Nagar issue", a: `when the last list shows several Anna Nagar incidents: answer clarify, clarificationQuestion "Which Anna Nagar issue do you mean?", clarifyOptions with 2-3 complete questions; with no list: answer area_summary, scope.zone 8` },
  { q: "zones ranked by severe incidents", a: `answer other, tools zones` },
  { q: "open complaints by department this month", a: `answer other, tools departments, scope.period monthly` },
  { q: "theft cases trend over the last month", a: `answer other, tools incident_series, scope.cat CRIME_PROPERTY, scope.period monthly` },
  { q: "where are complaints clustering", a: `answer other, tools hotspots` },
  { q: "onion price at K.K. Nagar market", a: `answer other, tools mandi_prices commodity Onion market "K.K. Nagar"` },
  { q: "any hospital beds above 85%", a: `answer other, tools environment metric bed_occupancy_pct above 85` },
  { q: "which parts of Velachery have the most incidents", a: `answer other, tools place_breakdown place "Velachery", scope.zone 13` },
  { q: "what does test data mean", a: `intent help` }
];

let bank: Promise<Float32Array[]> | null = null;
const vectors = () => (bank ??= embed(EXAMPLES.map((e) => `query: ${e.q}`)).then(({ vecs, dim }) =>
  EXAMPLES.map((_, k) => vecs.subarray(k * dim, (k + 1) * dim))).catch((e) => { bank = null; throw e; }));

const cos = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** The `k` worked examples closest in meaning to the question, as lines for the router's prompt ("" when the model is not ready). */
export async function examplesFor(question: string, k = 4): Promise<string> {
  try {
    const [vs, q] = await Promise.all([vectors(), embed([`query: ${question.slice(0, 300)}`])]);
    const qv = q.vecs;
    return vs.map((v, i) => ({ i, s: cos(v, qv) })).sort((a, b) => b.s - a.s).slice(0, k)
      .map(({ i }) => `- "${EXAMPLES[i].q}" -> ${EXAMPLES[i].a}`).join("\n");
  } catch {
    return "";
  }
}
