/**
 * What a chart or a finding is good for, and what a chart shows in one sentence from its own numbers. Pure functions
 * over the computed panels (no rows, no model), shared by the dataset page and the simple dashboards.
 */
import { fmtNum, type InsightLabel, type PanelData } from "@/lib/studio/types";

/** What a finding of each kind is good for, in a few words. */
export const HELPS: Partial<Record<InsightLabel, string>> = {
  Backlog: "Shows work piling up, so it can be cleared before it grows",
  Delay: "Flags the longest waits to chase first",
  Turnaround: "Shows how fast things get done, place by place",
  "Service gap": "Shows where the service falls short of the rest",
  "Bright spot": "Shows what works well, to copy elsewhere",
  Hotspot: "Shows where to send teams first",
  Rising: "An early warning of a growing problem",
  Falling: "Confirms what is improving",
  "Local pattern": "Shows a pattern tied to particular places",
  Concentration: "Shows whether a few places carry most of the load",
  Magnitude: "Shows the scale of the problem",
  Anomaly: "Catches an unusual value worth checking",
  Linked: "Connects this data with the district's incidents",
  Growth: "Shows the direction over time",
  Pattern: "Shows a regular pattern to plan around",
  "Data gap": "Shows what the data is missing before it is trusted",
  Ranking: "Ranks so the worst get attention first",
  Capacity: "Shows how much headroom is left",
  Change: "Shows what changed since the last reading",
  Drivers: "Shows what drives the total",
  "Unusual change": "Catches an unusual jump early",
  "Change point": "Marks when things changed, to ask why",
  "Steady share": "Shows a share that holds steady",
  Seasonality: "Helps plan ahead for the busy season",
  Correlation: "Shows two measures that move together",
  "Target gap": "Shows how far it is from the target",
  "Outlier peer": "Shows places far off their peers",
  Freshness: "Shows how up to date the data is"
};

/** What a chart shows, in one sentence, from its own numbers. */
export function describePanel(p: PanelData): string {
  const f = (v: number) => fmtNum(v, p.format, p.unit, true);
  const n = p.values.length;
  if (!n) return p.note ?? "No values to show.";
  const addsUp = p.plan.agg === "count" || p.plan.agg === "sum";
  const total = p.values.reduce((a, b) => a + b, 0);
  if (p.plan.by === "time" || p.chart === "line" || p.chart === "area") {
    const first = p.values[0], last = p.values[n - 1];
    const peak = Math.max(...p.values), at = p.values.indexOf(peak);
    const ch = first ? Math.round(((last - first) / Math.abs(first)) * 100) : null;
    const dir = ch == null ? "" : ch > 5 ? `, up ${ch}%` : ch < -5 ? `, down ${Math.abs(ch)}%` : ", about level";
    return `From ${p.labels[0]} to ${p.labels[n - 1]}: ${f(first)} to ${f(last)}${dir}. Highest was ${f(peak)} ${/^\d{1,2} [A-Z]/.test(p.labels[at]) ? "on" : "in"} ${p.labels[at]}.`;
  }
  if (p.chart === "map") {
    const i = p.values.indexOf(Math.max(...p.values));
    const placeWord = p.geo === "ward" ? "wards" : p.geo === "place" ? "places" : p.geo === "taluk" ? "taluks" : "zones";
    return i >= 0 && p.labels[i] ? `${p.labels[i]} has the most (${f(p.values[i])}) of the ${n} ${placeWord} on the map.` : `${n} ${placeWord} on the map.`;
  }
  if (p.chart === "table") return p.table?.rows.length ? `${p.table.rows.length} rows, the largest first.` : "No rows.";
  // a ranking or a split: the leader, and how much of the whole the leaders hold
  // the catch-all bucket ("Others (5)") is never the leader or the lowest: it is many items added together
  const named = p.values.map((v, i) => [v, i] as const).filter(([, i]) => !/^others?\b/i.test(p.labels[i] ?? ""));
  const order = (named.length ? named : p.values.map((v, i) => [v, i] as const)).sort((a, b) => b[0] - a[0]);
  const [v0, i0] = order[0];
  if (p.chart === "donut" || p.chart === "treemap") {
    return addsUp && total > 0 ? `${p.labels[i0]} is the largest part: ${Math.round((v0 / total) * 100)}% of ${f(total)}.` : `${p.labels[i0]} is the largest part (${f(v0)}).`;
  }
  const low = order[order.length - 1];
  if (addsUp && total > 0 && n >= 4) {
    const top3 = order.slice(0, 3).reduce((a, b) => a + b[0], 0);
    return `${p.labels[i0]} leads with ${f(v0)} (${Math.round((v0 / total) * 100)}% of the total); the top 3 hold ${Math.round((top3 / total) * 100)}%.`;
  }
  return n >= 2 ? `${p.labels[i0]} is highest (${f(v0)}); ${p.labels[low[1]]} is lowest (${f(low[0])}).` : `${p.labels[i0]}: ${f(v0)}.`;
}

/** What a chart is good for, from what it is drawn by. */
export function helpsOf(p: PanelData): string {
  const t = `${p.title} ${p.plan.byCol ?? ""}`.toLowerCase();
  if (p.chart === "map") return "Shows where to send teams first";
  if (p.plan.by === "time" || p.chart === "line" || p.chart === "area") return "Shows whether it is getting better or worse";
  if (p.plan.by === "zone" || p.plan.by === "ward" || p.plan.by === "taluk" || p.plan.by === "place") return "Ranks areas so the worst get attention first";
  if (/status|stage|progress/.test(t)) return "Shows how much is still pending";
  if (p.chart === "donut" || p.chart === "treemap") return "Shows which type is the biggest share, to plan resources";
  if (p.chart === "table") return "The figures themselves, largest first";
  if (p.plan.by === "col") return "Shows which kind is biggest, so effort goes where the load is";
  return "Compares the items side by side, to see which stands out";
}
