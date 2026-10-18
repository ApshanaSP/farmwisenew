/**
 * Ask District IQ over the Collector's own Data Studio datasets: "list my datasets", and a question that names a dataset
 * ("hospital beds by zone", "desilting works pending in Zone 9", "dengue cases trend") answered by Studio's own analyst
 * (studio/pipeline.ts ask: the model, or its rules, picks a plan; engine.ts computes every number from the rows). The chat
 * model never does the arithmetic. The Collector's datasets only: an officer's console does not reach them.
 */
import type { AnswerCard, Dataset } from "@/lib/assistant/answer";
import { spec } from "@/lib/assistant/datasets";
import { listDatasets, getMeta } from "@/lib/studio/store";
import type { DatasetCard, PanelData } from "@/lib/studio/types";

/** "list my datasets", "what data have I added?", "show my Data Studio files". */
export const LIST_DATASETS = /\b(list|show|what|which|my|our)\b.{0,25}\b(datasets?|data ?sets?|data studio|uploaded (files|data)|studio (data|files)|files i (added|uploaded))\b|\bdata studio\b.{0,20}\b(list|what|show)\b/i;
/** The question points at the Collector's own data. */
const OWN_DATA = /\b(dataset|data ?set|my data|uploaded|data studio|studio|my file|spreadsheet|excel|csv)\b/i;

/** Words that do not tell one dataset from another. */
const GENERIC = new Set(["chennai", "data", "list", "details", "daily", "sample", "corporation", "public", "the", "and", "with", "from", "summary", "feed",
  "total", "count", "date", "name", "number", "status", "type", "report", "record", "records", "tamil", "headers", "details", "value", "notes"]);
/** Words of the console's own data (stemmed): never enough on their own to send a question to an uploaded file. */
const DISTRICT_WORDS = new Set(["complaint", "grievance", "incident", "news", "issue", "civic", "flood", "flooding", "drain", "drainage", "garbage", "road",
  "accident", "police", "zone", "ward", "department", "case", "open", "pending", "citizen", "chennai", "water", "health", "disaster", "management", "plan",
  // a department's name ("Storm Water Drain department") is the console's, not an uploaded "Storm-water drain desilting register"
  "storm", "sewage", "street", "light", "electrical",
  // market prices are AGMARKNET's, in the console ("onion price today" was once "onion is not present in this dataset")
  "price", "prices", "rate", "rates", "market", "markets", "commodity", "commodities", "mandi", "vegetable", "vegetables",
  // dengue and fever are console topics (incidents, deaths): "any dengue deaths" was once "the dataset does not contain deaths"
  "dengue", "fever", "malaria", "disease", "diseases", "death", "deaths"]);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9஀-௿]+/).filter((w) => w.length >= 4 && !GENERIC.has(w));
const stem = (w: string) => w.replace(/(ies)$/, "y").replace(/(?<!s)s$/, "");

/** One copy of each dataset name (the newest), so an uploaded file added twice is listed once. */
export function uniqueDatasets(): DatasetCard[] {
  const seen = new Set<string>();
  return listDatasets().filter((d) => {
    const k = d.name.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The dataset a question names (by its name's words, with a column it mentions or "my data"), or null. */
export function datasetNamed(message: string): DatasetCard | null {
  const said = new Set(words(message).map(stem));
  const own = OWN_DATA.test(message);
  let best: { d: DatasetCard; score: number } | null = null;
  for (const d of uniqueDatasets()) {
    const named = [...new Set(words(d.name).map(stem))].filter((w) => said.has(w));
    const nameHits = named.length;
    if (!nameHits) continue;
    // the district's own words ("complaints", "news", "flooding") name the console's data: an uploaded file called "Public
    // Grievances and Complaints" answers only when the question says it is about the Collector's own data, or names a word
    // only that file has ("desilting", "metro", "ration")
    if (!own && named.every((w) => DISTRICT_WORDS.has(w) || DISTRICT_WORDS.has(stem(w)) || [...DISTRICT_WORDS].some((x) => stem(x) === w))) continue;
    const meta = getMeta(d.id);
    const colHits = (meta?.spec.columns ?? []).filter((c) => c.role !== "ignore" && c.role !== "person" && words(c.label).map(stem).some((w) => said.has(w))).length;
    // a name word and a column it holds ("hospital ... beds"), or the dataset called by name ("my metro stations data")
    if (!(colHits > 0 || own || nameHits >= 2)) continue;
    const score = nameHits * 2 + Math.min(colHits, 3) + (own ? 1 : 0);
    if (!best || score > best.score) best = { d, score };
  }
  return best?.d ?? null;
}

/** "list my datasets": what the Collector has added, newest first. */
export function datasetsListCard(base: AnswerCard): AnswerCard {
  const all = uniqueDatasets();
  const ds: Dataset = { id: "datasets", title: "Your Data Studio datasets", tab: "Datasets",
    fields: [{ key: "name", label: "Dataset", kind: "category" }, { key: "rows", label: "Rows", kind: "value", format: "integer" },
      { key: "department", label: "Department", kind: "text" }, { key: "updated", label: "Updated", kind: "text" }],
    rows: all.map((d) => ({ name: d.name, rows: d.rows, department: d.department ?? "", updated: d.updatedAt.slice(0, 10) })) };
  const head = all.length ? `${all.length} dataset${all.length === 1 ? "" : "s"} in Data Studio` : "No datasets in Data Studio yet";
  return { ...base, headline: head, display: all.length ? "table" : "text", table: all.length ? "datasets" : null, datasets: all.length ? [ds] : [],
    answerMarkdown: all.length ? [`${head}, newest first:`, ...all.slice(0, 8).map((d) => `- **${d.name}**: ${d.rows.toLocaleString("en-IN")} rows${d.department ? ` (${d.department})` : ""}`),
      all.length > 8 ? `…and ${all.length - 8} more in the table.` : ""].filter(Boolean).join("\n")
      : "Add a file, a link or a sample on the Data Studio page, then ask about it here.",
    scope: null, scopeLine: "Data Studio", chips: all.slice(0, 2).map((d) => `Summarise my ${d.name} data`) };
}

/** A Studio answer as a chat card: the analyst's sentence, its figures as a chart or a KPI, and where they came from. */
export function datasetAnswerCard(base: AnswerCard, d: DatasetCard, r: { answer?: string | null; panel?: PanelData; note?: string | null; window?: string | null;
  by: "ai" | "rules"; kind: string }): AnswerCard {
  const p = r.panel;
  const card: AnswerCard = { ...base, scope: null, scopeLine: `Data Studio · ${d.name}${r.window ? ` · ${r.window}` : ""}`, intent: "STUDIO_QUERY" };
  card.sources.tools.push({ name: "studio_ask", args: { dataset: d.id }, ms: 0 });
  card.sources.assumptions.push(`Answered from your Data Studio dataset "${d.name}" (${d.rows.toLocaleString("en-IN")} rows); every figure is computed from its rows.`);
  card.sources.verifier = { checked: 0, unmatched: [], regenerated: false, template: true };
  if (!p) {
    card.headline = r.note || `"${d.name}" cannot answer that with its columns.`;
    card.answerMarkdown = card.headline;
    return card;
  }
  const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString("en-IN") : (Math.round(v * 10) / 10).toLocaleString("en-IN"));
  card.headline = (r.answer ?? p.title).split(/(?<=[.!?])\s/)[0].replace(/\.$/, "");
  const lines = [r.answer ?? p.title];
  if (p.labels.length > 1) lines.push(...p.labels.slice(0, 5).map((l, k) => `- ${l}: **${fmt(p.values[k])}**${p.unit ? ` ${p.unit}` : ""}`));
  if (r.note) lines.push(r.note);
  card.answerMarkdown = lines.join("\n");
  if (p.labels.length > 1) {
    card.datasets = [{ id: "studio", title: p.title, tab: "Data", fields: [{ key: "label", label: "Group", kind: p.plan.by === "time" ? "time" : "category" },
      { key: "value", label: p.title, kind: "value", format: ({ pct: "percent", money: "rupee", int: "integer", dec: "decimal1" } as const)[p.format] ?? "integer", unit: p.unit }],
      rows: p.labels.map((l, k) => ({ label: l, value: p.values[k] })) }];
    card.chart = spec({ type: p.plan.by === "time" ? "line" : p.labels.length > 6 ? "horizontal_bar" : "bar", dataset: "studio", x: "label", y: ["value"], title: p.title,
      ...(p.plan.by === "time" ? {} : { sort: "desc" as const, highlight: "max" as const }) });
    card.display = "chart";
  } else if (p.kpi) {
    card.kpis = [{ label: p.kpi.label, value: p.kpi.value, tone: "info" }];
    card.display = "kpi";
  }
  if (r.by === "rules") card.caveats.push("Read by Data Studio's rules (the AI analyst was not available); the figures are computed the same way.");
  return card;
}
