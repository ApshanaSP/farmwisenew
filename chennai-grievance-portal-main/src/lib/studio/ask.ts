/**
 * Questions to a dataset without a model (the Analyst's fallback): words for grouping ("by zone", "which ward", "over
 * time"), measures ("total cost", "average"), filters (a status or type named in the question, "pending", a zone
 * name, "last 30 days") and alerts ("tell me when ... more than 10"). Also checks the Collector's standing alerts.
 */
import type { AskOut } from "@/lib/studio/ai";
import type { DRow } from "@/lib/studio/clean";
import { runPlan, type Names } from "@/lib/studio/engine";
import type { ColumnProfile, Rule, RuleStatus, Spec } from "@/lib/studio/types";
import { normKey } from "@/lib/studio/values";

export function rulesAsk(question: string, spec: Spec, profile: ColumnProfile[], zoneNames: string[]): AskOut {
  const q = question.toLowerCase();
  const out: AskOut = { kind: "query", title: "", agg: "count", col: null, by: "none", by_col: null, unit: null, filters: [], chart: "kpi", sort: "desc", limit: 10,
    watch_op: null, watch_threshold: null, note: "" };
  const cols = spec.columns.filter((c) => c.role !== "person" && c.role !== "ignore");
  const mentions = (label: string) => {
    const words = label.toLowerCase().split(/[^a-z0-9஀-௿]+/).filter((w) => w.length >= 3);
    return words.length > 0 && words.every((w) => q.includes(w));
  };

  // alerts
  const watch = /\b(tell me|alert|notify|warn|watch|flag)\b.*\b(when|if|whenever)\b/.test(q);
  const th = q.match(/(more than|over|above|exceeds?|greater than|at least|>=?)\s*(\d[\d,]*)/);
  const tl = q.match(/(less than|fewer than|below|under|<=?)\s*(\d[\d,]*)/);
  if (watch && (th || tl)) {
    out.kind = "watch";
    out.watch_op = th ? (/at least|>=/.test(th[1]) ? "gte" : "gt") : (/<=/.test(tl![1]) ? "lte" : "lt");
    out.watch_threshold = Number((th ?? tl)![2].replace(/,/g, ""));
  }

  // grouping
  if (/\b(trend|over time|week by week|weekly|per week|each week|month by month|monthly|per month|daily|per day|each day|by date|timeline|time series)\b/.test(q)) {
    out.by = "time";
    out.unit = /month/.test(q) ? "month" : /daily|per day|each day/.test(q) ? "day" : "week";
  } else if (/\bward/.test(q)) out.by = "ward";
  else if (/\btaluk/.test(q)) out.by = "taluk";
  else if (/\b(zone|zones|where)\b/.test(q)) out.by = "zone";
  else if (/\b(area|areas|locality|localities|place|places|location|locations)\b/.test(q)) out.by = "place";
  else {
    const g = cols.find((c) => (c.role === "category" || c.role === "status") && (mentions(c.label) || q.includes(c.header.toLowerCase())));
    if (g && /\b(by|per|each|split|breakdown|break down|types?|kinds?|which|share|mix)\b/.test(q)) { out.by = "col"; out.by_col = g.key; }
    else if (/\b(split|breakdown|break down|types?|kinds?|categor|share|mix)\b/.test(q)) {
      const c = cols.find((x) => x.role === "category") ?? cols.find((x) => x.role === "status");
      if (c) { out.by = "col"; out.by_col = c.key; }
    }
  }

  // measure
  const measure = cols.filter((c) => c.role === "measure").find((c) => mentions(c.label) || q.includes(c.header.toLowerCase()))
    ?? (/\b(cost|amount|money|spend|spent|budget|value|rs|rupees|total)\b/.test(q) ? cols.find((c) => c.key === spec.primary) : undefined);
  if (/\b(average|avg|mean)\b/.test(q) && measure) { out.agg = "avg"; out.col = measure.key; }
  else if (/\b(highest|maximum|max|largest|biggest)\b/.test(q) && measure && out.by === "none") { out.agg = "max"; out.col = measure.key; }
  else if (/\b(total|sum|how much|cost|amount|spend|spent)\b/.test(q) && measure) { out.agg = "sum"; out.col = measure.key; }

  // filters
  if (spec.openValues.length && /\b(open|pending|not (yet )?(done|completed|closed)|unresolved|outstanding|incomplete|still)\b/.test(q)) out.filters.push({ col: "_o", op: "open", values: [] });
  else if (spec.openValues.length && /\b(closed|completed|done|resolved|finished)\b/.test(q)) out.filters.push({ col: "_o", op: "closed", values: [] });
  for (const c of cols.filter((x) => x.role === "category" || x.role === "status")) {
    const vals = profile.find((p) => p.key === c.key)?.top.map((t) => t.v) ?? [];
    const hit = vals.filter((v) => v.length >= 3 && q.includes(v.toLowerCase()) && !(c.role === "status" && out.filters.length));
    if (hit.length && !(out.by === "col" && out.by_col === c.key)) out.filters.push({ col: c.key, op: "in", values: hit });
  }
  const zs = zoneNames.filter((z) => q.includes(z.toLowerCase()) || normKey(q).includes(normKey(z)));
  const zn = q.match(/\bzone\s*(\d{1,2})\b/)?.[1];
  if (zs.length) out.filters.push({ col: "_z", op: "in", values: zs });
  else if (zn) out.filters.push({ col: "_z", op: "in", values: [zn] });
  const recent = q.match(/\b(?:last|past|previous)\s+(\d{1,3})\s*(day|week|month)s?\b/);
  if (recent) out.filters.push({ col: "_d", op: "recent_days", values: [String(Number(recent[1]) * (recent[2] === "week" ? 7 : recent[2] === "month" ? 30 : 1))] });
  else if (/\b(last|past) (week|month)\b/.test(q)) out.filters.push({ col: "_d", op: "recent_days", values: [/week/.test(q) ? "7" : "30"] });

  // chart
  if (/\b(list|show me the|which (are|were) the|table|rows)\b/.test(q) && out.by === "none") out.chart = "table";
  else if (out.by === "none") out.chart = "kpi";
  else if (out.by === "time") out.chart = "area";
  else if (/\bmap\b/.test(q)) out.chart = "map";
  else if (out.by === "col") out.chart = "donut";
  else out.chart = "hbar";
  if (/\b(least|lowest|fewest|bottom)\b/.test(q)) out.sort = "asc";
  const top = q.match(/\btop\s+(\d{1,2})\b/);
  if (top) out.limit = Number(top[1]);

  out.title = titleFor(out, spec);
  if (out.kind === "query" && out.by === "none" && !out.filters.length && out.agg === "count" && !/\b(how many|count|number of|total)\b/.test(q)) {
    out.note = "Read with simple rules (no AI model answered): try naming a zone, a type, a status, or say \"by zone\" or \"over time\".";
  }
  return out;
}

function titleFor(o: AskOut, spec: Spec): string {
  const m = o.agg === "count" ? spec.entityPlural : `${o.agg === "sum" ? "Total" : o.agg === "avg" ? "Average" : o.agg === "max" ? "Highest" : "Lowest"} ${spec.columns.find((c) => c.key === o.col)?.label.toLowerCase() ?? "value"}`;
  const by = o.by === "time" ? ` per ${o.unit ?? "week"}` : o.by === "col" ? ` by ${spec.columns.find((c) => c.key === o.by_col)?.label.toLowerCase() ?? "type"}` : o.by !== "none" ? ` by ${o.by}` : "";
  const open = o.filters.some((f) => f.op === "open") ? "Open " : "";
  const t = `${open}${m}${by}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Which groups cross a standing alert's line right now. */
export function checkRule(rule: Rule, rows: DRow[], spec: Spec, names: Names): RuleStatus {
  const res = runPlan(rows, spec, { ...rule.plan, limit: 300, chart: rule.plan.by === "none" ? "kpi" : "hbar" }, names);
  const cmp = (v: number) => (rule.op === "gt" ? v > rule.threshold : rule.op === "gte" ? v >= rule.threshold : rule.op === "lt" ? v < rule.threshold : v <= rule.threshold);
  const hits = res.kpi ? (cmp(res.kpi.value) ? [{ label: rule.plan.title, value: res.kpi.value }] : [])
    : res.labels.map((l, i) => ({ label: l, value: res.values[i] })).filter((h) => cmp(h.value));
  return { id: rule.id, text: rule.text, ok: hits.length === 0, hits: hits.slice(0, 12), total: hits.length };
}
