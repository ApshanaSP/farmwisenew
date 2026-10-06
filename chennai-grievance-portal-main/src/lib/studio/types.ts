/**
 * Data Studio (console page 5): the shapes shared by the server engine and the page. No imports with side effects, so
 * the browser bundle can use them.
 *
 * A dataset is one table the Collector added (a file, a link or a sample). The AI reads its columns once and writes a
 * Spec (what each column means); everything after that (cleaning, places, every number on every chart) is computed by
 * code from the rows, so a figure on the page is always a count or a sum of real rows.
 */

/** What a column is for. Derived fields on each row: _d date, _z zone, _w ward, _t taluk, _p place, _la/_lo point, _o open. */
export type Role =
  | "date" | "place" | "ward" | "zone" | "taluk" | "lat" | "lon"
  | "category" | "status" | "measure" | "id" | "text" | "person" | "ignore";
export const ROLES: Role[] = ["date", "place", "ward", "zone", "taluk", "lat", "lon", "category", "status", "measure", "id", "text", "person", "ignore"];
export const ROLE_LABEL: Record<Role, string> = {
  date: "Date", place: "Place / locality", ward: "Ward", zone: "Zone", taluk: "Taluk", lat: "Latitude", lon: "Longitude",
  category: "Category", status: "Status", measure: "Number to add up", id: "Record ID", text: "Description", person: "Personal detail (hidden)", ignore: "Not used"
};

export type ColType = "number" | "date" | "text" | "bool" | "empty";

export interface ColumnProfile {
  key: string;
  header: string;
  type: ColType;
  filled: number;
  distinct: number;
  /** most frequent values (as written), up to 8 */
  top: { v: string; n: number }[];
  min: number | null;
  max: number | null;
  median: number | null;
  /** earliest and latest date (YYYY-MM-DD) for date columns */
  dmin: string | null;
  dmax: string | null;
  avgLen: number;
  sample: string[];
  /** the rules' reading of the column, before the AI */
  guess: Role;
  unit: string | null;
}

export interface ColumnSpec {
  key: string;
  header: string;
  label: string;
  role: Role;
  type: ColType;
  unit: string | null;
  /** how a measure adds up across rows */
  agg: "sum" | "avg" | "max" | null;
  /** 0..1: the AI and the rules agree (high), only one of them read it (lower) */
  conf: number;
  why: string;
}

export interface Spec {
  title: string;
  summary: string;
  /** what one row is, singular ("drain desilting work") */
  entity: string;
  entityPlural: string;
  department: string | null;
  deptName: string | null;
  columns: ColumnSpec[];
  /** status values that mean the row is still open / pending */
  openValues: string[];
  /** what "open" means for this data, after the noun: "still pending", "short of stock", "unresolved" */
  openWord?: string;
  /** the main measure column (cost, cases, stock) */
  primary: string | null;
  /**
   * For a periodic return (one row per hospital per week, per shop per month), the column that says how many: the
   * dashboard, the link and the story count it (fever cases), not the rows (which only count the reports). Null when
   * one row is one thing (one work, one complaint).
   */
  weight?: string | null;
  /**
   * For a table of one row per place (or item) per period (district x year, country x year), the column that names the
   * place: totals are read for the latest period, not added up across periods.
   */
  panelBy?: string | null;
  /** incident categories (store codes) this data is about, for linking */
  linkCategories: string[];
  questions: string[];
  by: "ai" | "rules";
  model: string | null;
}

// ----------------------------------------------------------------- detective --

export interface Issue {
  kind: "spaces" | "empty_rows" | "total_rows" | "duplicates" | "variants" | "bad_date" | "future_date" | "old_date" | "bad_number"
    | "negative" | "outlier" | "missing" | "unplaced" | "masked" | "header";
  column: string | null;
  label: string;
  count: number;
  action: "fixed" | "removed" | "flagged" | "info";
  examples: string[];
}

export interface Detective {
  /** data health before and after cleaning, 0..100 */
  before: number;
  after: number;
  rowsIn: number;
  rowsOut: number;
  issues: Issue[];
  placed: number;
  unplaced: { v: string; n: number }[];
}

// -------------------------------------------------------------------- plans --

export type Agg = "count" | "sum" | "avg" | "max" | "min" | "distinct";
export type ChartKind = "kpi" | "bar" | "hbar" | "line" | "area" | "donut" | "treemap" | "map" | "table";
export type GroupBy = "none" | "col" | "zone" | "ward" | "taluk" | "place" | "time";
export type FilterOp = "eq" | "neq" | "in" | "contains" | "gte" | "lte" | "open" | "closed" | "recent_days" | "latest";

export interface Filter {
  /** a column key, or a derived field: _z zone, _w ward, _t taluk, _p place, _d date */
  col: string;
  op: FilterOp;
  values: string[];
}

/** One question to the data: what to count, split how, filtered how, drawn how. Run by engine.ts, never by a model. */
export interface Plan {
  id: string;
  title: string;
  chart: ChartKind;
  agg: Agg;
  /** the column the measure reads (null for a count of rows) */
  col: string | null;
  by: GroupBy;
  byCol: string | null;
  unit: "day" | "week" | "month" | "year" | null;
  filters: Filter[];
  sort: "desc" | "asc" | "key";
  limit: number;
}

export type Format = "int" | "dec" | "money" | "pct";

export interface PanelData {
  id: string;
  plan: Plan;
  title: string;
  subtitle: string;
  chart: ChartKind;
  labels: string[];
  values: number[];
  /** zone number, ward number, taluk code, place name or date key, per label */
  keys: (string | number)[];
  geo: "zone" | "ward" | "taluk" | "place" | null;
  points: { name: string; lat: number; lon: number; v: number }[];
  total: number;
  /** rows the plan matched */
  rows: number;
  format: Format;
  unit: string | null;
  kpi: { value: number; label: string; sub: string; spark: number[]; delta: number | null; tone: Tone } | null;
  table: { cols: { key: string; label: string }[]; rows: Record<string, string | number | null>[] } | null;
  note: string | null;
}

export type Tone = "sev" | "high" | "info" | "low" | "violet" | "teal";

// -------------------------------------------------------------------- story --

export interface Fact {
  id: string;
  kind: "size" | "top" | "concentration" | "trend" | "open" | "age" | "category" | "measure" | "outlier" | "link" | "overlap" | "time_link" | "lowlying" | "quality";
  text: string;
  tone: Tone;
  /** the chart that shows it */
  plan: Plan | null;
}

export interface Finding {
  id: string;
  title: string;
  body: string;
  next: string | null;
  tone: Tone;
  facts: string[];
  plan: Plan | null;
  by: "ai" | "rules";
}

export interface LinkIncident { id: string; title: string; zone: string | null; severity: string; open: boolean; when: string; news: boolean }

export interface LinkResult {
  /** place: compared zone by zone; time: the data has no places, compared week by week */
  mode: "place" | "time";
  level: "zone" | "ward";
  /** what was compared, in words ("open drain works per zone") */
  dsLabel: string;
  incLabel: string;
  category: { codes: string[]; label: string; by: "ai" | "rules" };
  window: { from: string; to: string; basis: "dataset" | "latest" };
  rho: number;
  strength: "strong" | "moderate" | "weak" | "none";
  n: number;
  pairs: { key: number; name: string; ds: number; inc: number }[];
  overlap: { key: number; name: string; ds: number; inc: number }[];
  incidents: number;
  open: number;
  news: number;
  overdue: number;
  sample: LinkIncident[];
  /** weekly link over time (when the data has dates): weeks compared and rho */
  time: { rho: number; weeks: number; lag: number; label: string; series: { week: string; ds: number; inc: number }[] } | null;
  lowlying: { rho: number; n: number } | null;
}

export interface Story {
  headline: string;
  lede: string;
  findings: Finding[];
  facts: Fact[];
  by: "ai" | "rules";
  model: string | null;
  /** every number in the AI's words was found in the facts it cited */
  verified: boolean;
  dropped: number;
}

// ----------------------------------------------------------------- insights --

/** What kind of finding an insight is: the label on its card. */
export type InsightLabel =
  | "Backlog" | "Delay" | "Turnaround" | "Service gap" | "Bright spot" | "Hotspot" | "Rising" | "Falling" | "Local pattern"
  | "Concentration" | "Magnitude" | "Anomaly" | "Linked" | "Growth" | "Pattern" | "Data gap";

/**
 * One finding computed from the rows by insights.ts: a sentence with its numbers, a headline number, a small picture
 * of the evidence and the chart mark that opens its rows. The AI only chooses among these and explains them.
 */
export interface Insight {
  id: string;
  label: InsightLabel;
  tone: Tone;
  /** how much it matters to the Collector, 0..100 (rules' estimate; the AI re-orders) */
  score: number;
  /** the fact in one sentence, every number in it computed */
  text: string;
  /** a short rules title, used when no AI writes one */
  title: string;
  metric: { value: string; caption: string };
  /** a few bars of evidence (the leader highlighted), or a weekly series */
  bars: { label: string; value: number; hi?: boolean; fmt: string }[];
  series: number[];
  plan: Plan | null;
  key: string | number | null;
  /** who should act (a department or "the zonal officer") */
  owner: string | null;
}

export type Priority = "act" | "watch" | "note";

/** An insight as the brief shows it: the AI's title, why it matters and the step to take. */
export interface BriefItem extends Insight { headline: string; why: string; action: string | null; priority: Priority; by: "ai" | "rules" }

export interface Brief {
  /** the one-line verdict on the data */
  verdict: string;
  /** three bullets: the situation in brief */
  summary: string[];
  items: BriefItem[];
  /** what the Collector could ask the department */
  questions: string[];
  /** how many insights were computed (the brief shows the ones that matter) */
  considered: number;
  by: "ai" | "rules";
  model: string | null;
  dropped: number;
  at: string;
}

// ------------------------------------------------------------------ dataset --

export interface StepLog { step: StepKey; ms: number; detail: string; by: "ai" | "rules" | "code"; model: string | null }
export type StepKey = "read" | "understand" | "clean" | "place" | "design" | "link" | "story";
export const STEPS: { key: StepKey; agent: string; doing: string }[] = [
  { key: "read", agent: "Reader", doing: "Reading the file" },
  { key: "understand", agent: "Profiler", doing: "Understanding every column" },
  { key: "clean", agent: "Data Detective", doing: "Checking and cleaning the data" },
  { key: "place", agent: "Geo-locator", doing: "Placing rows on the district map" },
  { key: "design", agent: "Designer", doing: "Designing the dashboard" },
  { key: "link", agent: "Linker", doing: "Connecting to district incidents" },
  { key: "story", agent: "Insight Analyst", doing: "Finding what the Collector should act on" }
];

export interface Rule {
  id: string;
  text: string;
  plan: Plan;
  op: "gt" | "gte" | "lt" | "lte";
  threshold: number;
  createdAt: string;
  by: "ai" | "rules";
}
export interface RuleStatus { id: string; text: string; ok: boolean; hits: { label: string; value: number }[]; total: number }

export interface SourceInfo {
  kind: "file" | "link" | "sample";
  file: string;
  url: string | null;
  sheet: string | null;
  sheets: string[];
  bytes: number;
  /** title rows above the header ("GCC SWD dept, desilting status as on 30.09.2026") */
  caption: string | null;
}

export interface DatasetMeta {
  id: string;
  name: string;
  source: SourceInfo;
  createdAt: string;
  updatedAt: string;
  rows: number;
  cols: number;
  window: { from: string | null; to: string | null };
  spec: Spec;
  profile: ColumnProfile[];
  detective: Detective;
  panels: Plan[];
  link: LinkResult | null;
  story: Story | null;
  /** the AI brief over the computed insights (older datasets: built when first opened) */
  brief?: Brief | null;
  rules: Rule[];
  steps: StepLog[];
  sample: boolean;
}

/** A dataset in the list (no rows, no profile). */
export interface DatasetCard {
  id: string;
  name: string;
  kind: SourceInfo["kind"];
  file: string;
  rows: number;
  health: number;
  department: string | null;
  updatedAt: string;
  link: LinkResult["strength"] | null;
  sample: boolean;
}

export interface Pin { id: string; datasetId: string; datasetName: string; plan: Plan; at: string }

/** Events streamed while a dataset is processed (NDJSON). */
export type RunEvent =
  | { t: "step"; step: StepKey; state: "run" | "done" | "skip"; detail: string; by?: "ai" | "rules" | "code"; model?: string | null; ms?: number }
  | { t: "log"; text: string }
  | { t: "done"; id: string }
  | { t: "error"; message: string };

// ------------------------------------------------------------------ helpers --

/** Indian-style number formatting: lakh and crore for money, grouping for the rest. */
export function fmtNum(v: number | null | undefined, format: Format = "int", unit: string | null = null, compact = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (format === "money") {
    const a = Math.abs(v), s = v < 0 ? "−" : "";
    // compact (headline cards): ₹100.5 Cr, ₹12.3 L; in sentences: Rs 100.5 crore, Rs 12.3 lakh
    if (a >= 1e7) return compact ? `${s}₹${trim(a / 1e7)} Cr` : `${s}Rs ${trim(a / 1e7)} crore`;
    if (a >= 1e5) return compact ? `${s}₹${trim(a / 1e5)} L` : `${s}Rs ${trim(a / 1e5)} lakh`;
    return `${s}${compact ? "₹" : "Rs "}${Math.round(a).toLocaleString("en-IN")}`;
  }
  if (format === "pct") return `${trim(v)}%`;
  const n = format === "dec" || !Number.isInteger(v) ? (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-IN") : trim(v)) : v.toLocaleString("en-IN");
  if (unit && /^Rs\s/.test(unit)) return `Rs ${n} ${unit.slice(3)}`;
  return unit && !/^(count|rows?|nos?\.?|numbers?)$/i.test(unit) ? `${n} ${unit}` : n;
}
function trim(x: number): string {
  const r = Math.abs(x) >= 100 ? Math.round(x) : Math.abs(x) >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100;
  return r.toLocaleString("en-IN");
}

/**
 * The open word as an adjective after the noun ("complaints needing attention") and as a predicate ("complaints need
 * attention"): the profiler may write either "still pending" or "needs attention".
 */
export function openPhrase(spec: Pick<Spec, "openWord">): { adj: string; are: string } {
  const w = (spec.openWord || "still open").trim();
  const m = w.match(/^(needs|requires|awaits|lacks)\b(.*)$/i);
  if (!m) return { adj: w, are: `are ${w}` };
  const v = m[1].toLowerCase(), rest = m[2];
  const ing: Record<string, string> = { needs: "needing", requires: "requiring", awaits: "awaiting", lacks: "lacking" };
  return { adj: `${ing[v]}${rest}`, are: `${v.slice(0, -1)}${rest}` };
}

export function pluralize(word: string): string {
  if (!word) return "rows";
  if (/(s|x|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

// ------------------------------------------------------------- drill & attention --

/** What one mark of a chart (or a headline card, or an attention item) stands for, opened. */
export interface DrillResult {
  label: string;
  title: string;
  /** the subset, as filters: "focus the dashboard on this" adds them */
  filters: Filter[];
  /** the filters in words */
  chips: string[];
  rows: number;
  value: number;
  format: Format;
  unit: string | null;
  measure: string;
  /** share of the chart's total (%), the ratio to the chart's average mark, and the rank among the marks */
  share: number | null;
  vsAvg: number | null;
  rank: { pos: number; of: number } | null;
  breakdowns: PanelData[];
  table: PanelData["table"];
  incidents: LinkIncident[];
  /** sentences with the numbers above, for the AI's draft note */
  facts: string[];
}

/** One thing on the dashboard that needs the Collector's attention, and what opens when it is clicked. */
export interface AttentionItem {
  id: string;
  kind: "hotspot" | "waiting" | "rising" | "outlier" | "linked" | "share";
  tone: Tone;
  title: string;
  detail: string;
  plan: Plan;
  key: string | number | null;
}

export interface DraftNote { to: string; subject: string; body: string; actions: string[]; by: "ai" | "rules"; model: string | null }
