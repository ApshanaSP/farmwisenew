/**
 * Ask District IQ over the Collector's own Data Studio datasets: "list my datasets", and a question about any of them ("hospital beds by
 * zone", "desilting works pending in Zone 9", "summarise my shelters data", then "and by zone?") answered by the Studio's own analyst
 * (studio/forAssistants.ts: the brief for a summary, else the analyst's plan counted from the rows by code). The chat model never does
 * the arithmetic. The Collector's datasets only: an officer's console does not reach them.
 */
import type { AnswerCard, Dataset } from "@/lib/assistant/answer";
import { spec } from "@/lib/assistant/datasets";
import { pickDataset, uniqueDatasets, type Asker, type StudioAnswerOut } from "@/lib/studio/forAssistants";
import type { DatasetCard, Filter } from "@/lib/studio/types";

export { uniqueDatasets };

/** "list my datasets", "what data have I added?", "show my Data Studio files". */
export const LIST_DATASETS = /\b(list|show|what|which|my|our)\b.{0,25}\b(datasets?|data ?sets?|data studio|uploaded (files|data)|studio (data|files)|files i (added|uploaded))\b|\bdata studio\b.{0,20}\b(list|what|show)\b/i;

/**
 * The dataset a question is about (studio/forAssistants.ts pickDataset), or null; `lastId` keeps a follow-up on the last answer's dataset.
 * `who` defaults to the Collector, as this was always called from the Collector's lane only: an officer's caller passes its own.
 */
export function datasetNamed(message: string, o: { who?: Asker; lastId?: string | null } = {}): DatasetCard | null {
  const p = pickDataset(message, { who: o.who ?? { role: "collector", lockDept: null }, lastId: o.lastId ?? null });
  return p ? uniqueDatasets().find((d) => d.id === p.id) ?? null : null;
}

/** What the last Data Studio answer of this chat was about, from its saved plan, so "and by zone?" stays on it with its filters. */
export function lastStudioPlan(turns: { role?: unknown; plan?: unknown }[]): { dataset: string; filters: Filter[] } | null {
  const last = [...turns].reverse().find((t) => t.role === "assistant");
  const p = last?.plan as { intent?: unknown; dataset?: unknown; filters?: unknown } | null | undefined;
  if (!p || p.intent !== "studio_query" || typeof p.dataset !== "string") return null;
  const filters = Array.isArray(p.filters) ? (p.filters as Filter[]).filter((f) => f && typeof f.col === "string" && typeof f.op === "string" && Array.isArray(f.values)).slice(0, 8) : [];
  return { dataset: p.dataset, filters };
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

/** A Studio answer as a chat card: the analyst's sentence (or the brief's verdict), its figures as a chart or a KPI, and where they came from. */
export function datasetAnswerCard(base: AnswerCard, a: StudioAnswerOut, lang: string = "en"): AnswerCard {
  const d = a.dataset, r = a.reply, p = r.panel;
  // a question in Tamil is answered in Tamil words around the same figures (Tanglish reads the English)
  const sentence = lang === "ta" ? a.sentence.ta : a.sentence.en;
  const card: AnswerCard = { ...base, scope: null, scopeLine: `Data Studio · ${d.name}${d.window ? ` · ${d.window}` : ""}`, intent: "STUDIO_QUERY" };
  card.sources.tools.push({ name: "studio_ask", args: { dataset: d.id }, ms: 0 });
  card.sources.assumptions.push(r.kind === "summary"
    ? `Summarised from the brief of your Data Studio dataset "${d.name}" (${d.rows.toLocaleString("en-IN")} rows); no AI was asked again.`
    : `Answered from your Data Studio dataset "${d.name}" (${d.rows.toLocaleString("en-IN")} rows); every figure is computed from its rows.`);
  card.sources.verifier = { checked: 0, unmatched: [], regenerated: false, template: true };
  card.chips = d.questions.slice(0, 2);
  if (r.kind === "summary") {
    card.headline = sentence.split(/(?<=[.!?])\s/)[0].replace(/\.$/, "");
    card.answerMarkdown = [sentence, ...(r.points ?? []).map((x) => `- ${x}`), r.note ?? ""].filter(Boolean).join("\n");
    card.kpis = [{ label: `Rows in ${d.name}`.slice(0, 80), value: d.rows, tone: "info" }];
    card.display = "text";
    return card;
  }
  if (!p) {
    card.headline = sentence || `"${d.name}" cannot answer that with its columns.`;
    card.answerMarkdown = card.headline;
    return card;
  }
  const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString("en-IN") : (Math.round(v * 10) / 10).toLocaleString("en-IN"));
  card.headline = (sentence || p.title).split(/(?<=[.!?])\s/)[0].replace(/\.$/, "");
  const lines = [sentence || p.title];
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
  if (a.source === "rules") card.caveats.push("Read by Data Studio's rules (the AI analyst was not available in time); the figures are computed the same way.");
  return card;
}
