/**
 * Thunai's hands on the data (server only): Ask District IQ's own tools (assistant/tools.ts, `runTool`), plus three views
 * the console already computes and the tools do not return as such:
 * - console_severe: the console's severity panel (overview().severity), so "these 6 severe cases" is exactly its list;
 * - console_news: the console's latest news (overview().allNews), newest first;
 * - ask_map: Ask the Map's own engine (lib/map/ask.ts askMap), so place-and-distance questions are answered by the same
 *   code as the console's map. No second data layer, no second spatial engine.
 */
import { overview, asOf, list } from "@/lib/collector/intel";
import { askMap, type AskResponse } from "@/lib/map/ask";
import { runTool, incRow } from "@/lib/assistant/tools";
import { countIncidents, windowRows, type IncidentFilters } from "@/lib/assistant/incidents";
import { compareOf, prevOf, spanOf, type Comparison, type PeriodKey, type PeriodSpec, type Span, type Words } from "@/lib/period/read";
import type { ToolResult } from "@/lib/assistant/types";
import { datasetIds, getMeta, getRows } from "@/lib/studio/store";
import { loadWardDataset, resolveWard } from "@/lib/wards";
import { referenceLeads } from "./world";
import { studioRow, type Lookups, type InRow } from "./complete";
import type { World } from "./types";
import type { ScopeT } from "./stage";
import { syncEpoch } from "@/lib/collector/epoch";

type Row = Record<string, unknown>;
export interface MapUser { email: string; role: "collector" | "department_officer"; lockDept: string | null }

const memo = new Map<string, { at: number; p: Promise<unknown> }>();
function once<T>(key: string, run: () => Promise<T>, ttl = 45_000): Promise<T> {
  syncEpoch(memo); // a decision empties it (RC-35)
  const now = Date.now();
  for (const [k, v] of memo) if (now - v.at > ttl) memo.delete(k);
  const hit = memo.get(key);
  if (hit) return hit.p as Promise<T>;
  const p = run();
  memo.set(key, { at: now, p });
  p.catch(() => memo.delete(key));
  return p;
}

async function consoleOverview(s: ScopeT) {
  const now = await asOf();
  return once(`ov|${now}|${s.period}|${s.zone ?? ""}|${s.dept ?? ""}|${s.cat ?? ""}|${s.taluk ?? ""}`, () => overview(s.period, s.zone, s.dept, { cat: s.cat, taluk: s.taluk }));
}

export async function consoleSevere(s: ScopeT): Promise<{ rows: Row[]; counts: Record<string, number>; asOf: string }> {
  const ov = await consoleOverview(s);
  return { rows: ov.severity.rows as Row[], counts: ov.severity.counts as Record<string, number>, asOf: await asOf() };
}

/**
 * The console's own incident list for a scope and a status ("open", "overdue"): its rows and the whole count, so a figure about the
 * list (how many are past their deadline) never comes from the 12 rows of one page. Severity order is ascending in the store, every
 * other order is descending; that is set here once so no caller can ask for "most serious first" and get the least serious.
 */
export async function consoleList(s: ScopeT, f: { sev: string | null; status: string | null; q: string | null; sort: "sev" | "t" | "c"; page?: number }) {
  const r = await list({ period: s.period, zone: s.zone, dept: s.dept, cat: s.cat, taluk: s.taluk, sev: f.sev, status: f.status, q: f.q || null,
    sort: f.sort, dir: f.sort === "sev" ? 1 : -1, page: f.page ?? 0, scope: "period" });
  // total counts the list's rows (one per group of the same problem); incidents counts the incidents in them, as the console's tiles do
  return { rows: r.rows.map((i) => incRow(i)) as Row[], total: r.total, incidents: r.incidents, asOf: await asOf() };
}

/**
 * A list and its counts over a span the console's four windows do not hold (today since midnight, yesterday, last month, a named month, "right now"),
 * read with Ask District IQ's own counting (assistant/incidents.ts), so both rules lanes give one number for one question (QA pass 7, P6-022, pass4-open-16).
 * The span's dates come from the store's now (lib/period/read.ts). `prev`: the calendar span just before it (September before October), when there is one.
 */
export interface SpanFilters { sev: string | null; status: "open" | "overdue" | null; n: number }
export interface SpanOut { span: Span; rows: Row[]; total: number; severe: number; open: number; late: number; dead: number; prev: { n: number; label: Words } | null; asOf: string }
export async function consoleSpan(spec: PeriodSpec, s: ScopeT, f: SpanFilters, lockDept: string | null = null): Promise<SpanOut | null> {
  const now = await asOf();
  const span = spanOf(spec, now);
  if (!span || (!span.range && span.hours == null)) return null;
  const inc: IncidentFilters = { period: span.key, zone: s.zone, dept: lockDept ?? s.dept, cats: s.cat ? [s.cat] : null, taluk: s.taluk,
    sev: (f.sev as IncidentFilters["sev"]) ?? null, openOnly: f.status === "open" || span.now, overdue: f.status === "overdue", range: span.range, hours: span.range ? null : span.hours };
  const before = prevOf(spec, now);
  const [w, c, late, p] = await Promise.all([windowRows(inc, now, Math.min(Math.max(f.n, 1), 30)), countIncidents(inc, now), countIncidents({ ...inc, overdue: true }, now),
    before?.range ? countIncidents({ ...inc, range: before.range }, now) : Promise.resolve(null)]);
  return { span, rows: w.rows.map((r) => incRow(r)) as Row[], total: c.n, severe: c.severe, open: c.open, late: late.n, dead: c.dead,
    prev: p && before ? { n: p.n, label: before.label } : null, asOf: now };
}

/** "Up or down from last month": the window back from now against the one of the same length just before it, counted as Ask District IQ counts (countIncidents). */
export interface CompareOut { cmp: Comparison; n: number; prev: number; severe: number; open: number; asOf: string }
export async function consoleCompare(key: PeriodKey, s: ScopeT, f: { sev: string | null; status: "open" | "overdue" | null }, lockDept: string | null = null): Promise<CompareOut | null> {
  const now = await asOf();
  const cmp = compareOf(key, now);
  if (!cmp) return null;
  const c = await countIncidents({ period: key, zone: s.zone, dept: lockDept ?? s.dept, cats: s.cat ? [s.cat] : null, taluk: s.taluk, sev: (f.sev as IncidentFilters["sev"]) ?? null,
    openOnly: f.status === "open", overdue: f.status === "overdue" }, now);
  return { cmp, n: c.n, prev: c.prev, severe: c.severe, open: c.open, asOf: now };
}

export async function consoleNews(s: ScopeT): Promise<{ rows: Row[]; total: number; asOf: string }> {
  const ov = await consoleOverview(s);
  return { rows: (ov.allNews ?? []) as Row[], total: ov.allNewsTotal ?? 0, asOf: await asOf() };
}

export async function mapAnswer(q: string, user: MapUser, signal?: AbortSignal): Promise<AskResponse> {
  return askMap({ text: q, plan: null, prev: null, context: { zone: null, taluk: null, incidentId: null, drawn: null, ward: null }, user, reword: false, signal });
}

export interface Hands {
  tool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  severe: (s: ScopeT) => ReturnType<typeof consoleSevere>;
  list?: typeof consoleList;
  news: (s: ScopeT) => ReturnType<typeof consoleNews>;
  map: (q: string) => Promise<AskResponse>;
  dataset?: (name: string) => Promise<{ name: string; rows: InRow[]; total: number } | null>;
  lookups?: (w: World) => Lookups;
  /** a list and its counts over a span with its own dates (today, last month, right now); absent: the screen says it cannot */
  span?: (spec: PeriodSpec, s: ScopeT, f: SpanFilters) => Promise<SpanOut | null>;
  /** a window against the one before it ("up or down from last month") */
  compare?: (key: PeriodKey, s: ScopeT, f: { sev: string | null; status: "open" | "overdue" | null }) => Promise<CompareOut | null>;
}

/** ward -> zone from the GCC ward boundaries, the point's ward by polygon, the gazetteer, each category's lead department. */
function lookups(w: World): Lookups {
  const leads = referenceLeads();
  const wards = new Map<number, { zone: number; name: string }>();
  try {
    for (const f of loadWardDataset().features ?? []) {
      if (f.wardNo && f.zoneNumber) wards.set(f.wardNo, { zone: f.zoneNumber, name: w.zones.find((z) => z.n === f.zoneNumber)?.name ?? f.zoneName ?? `Zone ${f.zoneNumber}` });
    }
  } catch { /* no boundaries file: wards stay blank */ }
  return {
    wardZone: (ward) => wards.get(ward) ?? null,
    pointWard: (lat, lon) => {
      const r = resolveWard(lat, lon);
      if (r.status !== "resolved" || r.ambiguous) return null;
      const z = wards.get(r.wardNo);
      return { ward: r.wardNo, zone: z?.zone ?? r.zoneNumber, zoneName: z?.name ?? r.zoneName };
    },
    placeZone: (place) => {
      const q = place.trim().toLowerCase();
      const hit = w.places.filter((p) => p.zone != null && (p.name.toLowerCase() === q || p.aliases.some((a) => a.toLowerCase() === q)));
      const zones = new Set(hit.map((p) => p.zone));
      if (zones.size !== 1) return null;
      const zone = hit[0].zone as number;
      return { zone, name: w.zones.find((z) => z.n === zone)?.name ?? `Zone ${zone}` };
    },
    catLead: (cat) => {
      const c = w.cats.find((x) => x.code === cat || x.label === cat);
      const lead = c ? leads[c.code] : null;
      if (!lead) return null;
      return { code: lead, name: w.depts.find((d) => d.code === lead)?.name ?? lead };
    }
  };
}

/** A Data Studio dataset by name, its rows read as a table "complete this data" understands (columns matched by their names). */
async function studioDataset(name: string): Promise<{ name: string; rows: InRow[]; total: number } | null> {
  const q = name.toLowerCase();
  const id = datasetIds().find((x) => { const m = getMeta(x); return m && (m.name ?? "").toLowerCase().includes(q); });
  if (!id) return null;
  const meta = getMeta(id)!;
  const all = getRows(id);
  const rows = all.slice(0, 30).map((raw, i): InRow => studioRow(raw as unknown as Record<string, unknown>, i));
  return { name: String(meta.name ?? name), rows, total: all.length };
}

export function serverHands(user: MapUser, signal?: AbortSignal): Hands {
  return { tool: (n, a) => runTool(n, a), severe: consoleSevere, list: consoleList, news: consoleNews, map: (q) => mapAnswer(q, user, signal), dataset: studioDataset, lookups,
    span: (spec, s, f) => consoleSpan(spec, s, f, user.lockDept), compare: (key, s, f) => consoleCompare(key, s, f, user.lockDept) };
}
