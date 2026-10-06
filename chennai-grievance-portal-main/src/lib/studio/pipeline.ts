/**
 * One run of the Studio's seven agents over a file: Reader, Profiler (AI), Data Detective, Geo-locator, Designer,
 * Linker, Storyteller (AI). Each step reports as it goes (the page animates the run from these events); a step that
 * needs a model falls back to the rules when none answers, so a file is never refused because the AI is busy.
 */
import { classify } from "@/lib/collector/nlp";
import { askAI, briefAI, checkPlan, noteAI, understandAI } from "@/lib/studio/ai";
import { rulesAsk } from "@/lib/studio/ask";
import { rulesBrief } from "@/lib/studio/brief";
import { clean } from "@/lib/studio/clean";
import { designDashboard, panelColumn, periodicWeight } from "@/lib/studio/dashboard";
import { answerText, describeFilter, runPlan, type Names } from "@/lib/studio/engine";
import { drill } from "@/lib/studio/drill";
import { computeInsights } from "@/lib/studio/insights";
import { crossLink } from "@/lib/studio/link";
import { parseFile, type Table } from "@/lib/studio/parse";
import { placeRows } from "@/lib/studio/place";
import { profileTable } from "@/lib/studio/profile";
import { refs as loadRefs, type Refs } from "@/lib/studio/refs";
import { mergeSpec, respec, rulesSpec } from "@/lib/studio/spec";
import { getMeta, getRows, getSource, newId, saveDataset, saveMeta, saveSource } from "@/lib/studio/store";
import { buildFacts, rulesStory } from "@/lib/studio/story";
import { ROLE_LABEL, type Brief, type DatasetMeta, type Insight, type Filter, type PanelData, type Plan, type Role, type RunEvent, type SourceInfo, type Spec, type StepKey, type StepLog } from "@/lib/studio/types";
import { fmtDay, normKey } from "@/lib/studio/values";
import type { AiBusyError } from "@/lib/ai/gateway";

type Emit = (e: RunEvent) => void;

/**
 * A news feed gets a Topic column: each headline classified with the console's own English / Tamil keyword lists
 * (the same as items from added sources), so the feed can be split by topic and linked with incidents.
 */
function withTopics(t: Table): Table {
  if (t.format !== "feed") return t;
  return {
    ...t, headers: [...t.headers, "Topic"],
    rows: t.rows.map((r) => [...r, classify(`${r[0] ?? ""}. ${r[3] ?? ""}`)?.label ?? "General news"])
  };
}

export function namesOf(r: Refs): Names {
  const byName = new Map<string, number>();
  for (const z of r.zones.values()) byName.set(normKey(z.name), z.zone);
  return {
    zone: (z) => r.zones.get(z)?.name ?? `Zone ${z}`,
    taluk: (t) => r.taluks.get(t)?.name ?? t,
    zoneOf: (v) => {
      const n = String(v).match(/\b(\d{1,2})\b/)?.[1];
      if (n && Number(n) >= 1 && Number(n) <= 15) return Number(n);
      return byName.get(normKey(String(v).replace(/\bzone\b/gi, ""))) ?? null;
    }
  };
}

const why = (e: unknown) => {
  const m = (e as Error)?.message ?? String(e);
  if ((e as AiBusyError)?.retryAfter != null || /busy|rate|429|quota/i.test(m)) return "the AI models are busy right now";
  if (/No AI provider/i.test(m)) return "no AI model is configured";
  return "the AI did not answer in time";
};

export interface IngestInput {
  buf: Buffer;
  file: string;
  kind: SourceInfo["kind"];
  url: string | null;
  contentType?: string;
  /** the page's own address (after redirects), for its relative links */
  base?: string;
  name?: string | null;
  user: string;
}

/** A new dataset from a file, a link or a sample. Returns its id. */
export async function ingest(inp: IngestInput, emit: Emit): Promise<string> {
  const id = newId();
  const t0 = Date.now();
  emit({ t: "step", step: "read", state: "run", detail: `Opening ${inp.file}` });
  const table = withTopics(parseFile(inp.buf, inp.file, inp.contentType, inp.base ?? inp.url ?? undefined));
  const source: SourceInfo = { kind: inp.kind, file: inp.file, url: inp.url, sheet: table.sheet, sheets: table.sheets, bytes: inp.buf.length, caption: table.caption };
  const readLog: StepLog = { step: "read", ms: Date.now() - t0, by: "code", model: null,
    detail: `${table.rows.length.toLocaleString("en-IN")} rows · ${table.headers.length} columns${table.sheet ? ` · sheet "${table.sheet}"` : ""}` };
  emit({ t: "step", step: "read", state: "done", detail: readLog.detail, by: "code", ms: readLog.ms });
  if (table.caption) emit({ t: "log", text: `Title above the table kept as context: "${table.caption.slice(0, 120)}"` });
  if (table.sheets.length > 1) emit({ t: "log", text: `Workbook has ${table.sheets.length} sheets; read the largest, "${table.sheet}".` });
  if (table.truncated) emit({ t: "log", text: `Only the first ${table.rows.length.toLocaleString("en-IN")} rows were read (${table.truncated.toLocaleString("en-IN")} more in the file).` });
  if (!table.rows.length) throw new Error("The file has a header but no rows.");
  saveSource(id, inp.buf);
  return run({ id, table, source, name: inp.name ?? null, user: inp.user, prior: null, steps: [readLog], sample: inp.kind === "sample" }, emit);
}

/** The same file again with the Collector's corrections to what columns mean. */
export async function remap(id: string, changes: { key: string; role: Role; label?: string }[], user: string, emit: Emit): Promise<string> {
  const meta = getMeta(id);
  const buf = getSource(id);
  if (!meta || !buf) throw new Error("This dataset's original file is no longer here.");
  const table = withTopics(parseFile(buf, meta.source.file, "", meta.source.url ?? undefined));
  emit({ t: "step", step: "read", state: "done", detail: `${table.rows.length.toLocaleString("en-IN")} rows · ${table.headers.length} columns`, by: "code", ms: 0 });
  const prior = respec(meta.spec, meta.profile, changes);
  return run({ id, table, source: meta.source, name: meta.name, user, prior, steps: [], sample: meta.sample, createdAt: meta.createdAt, rules: meta.rules }, emit);
}

/** A link's file fetched again: the same reading of the columns when the header is unchanged. */
export async function refreshFrom(id: string, buf: Buffer, user: string, emit: Emit): Promise<string> {
  const meta = getMeta(id);
  if (!meta) throw new Error("Unknown dataset.");
  const table = withTopics(parseFile(buf, meta.source.file, "", meta.source.url ?? undefined));
  emit({ t: "step", step: "read", state: "done", detail: `${table.rows.length.toLocaleString("en-IN")} rows · ${table.headers.length} columns (fetched again)`, by: "code", ms: 0 });
  const same = table.headers.length === meta.profile.length && table.headers.every((h, i) => h === meta.profile[i]?.header);
  saveSource(id, buf);
  return run({ id, table, source: { ...meta.source, bytes: buf.length }, name: meta.name, user, prior: same ? meta.spec : null, steps: [], sample: meta.sample,
    createdAt: meta.createdAt, rules: meta.rules }, emit);
}

interface RunCtx {
  id: string; table: Table; source: SourceInfo; name: string | null; user: string; prior: Spec | null; steps: StepLog[]; sample: boolean;
  createdAt?: string; rules?: DatasetMeta["rules"];
}

async function run(ctx: RunCtx, emit: Emit): Promise<string> {
  const { table } = ctx;
  const refs = await loadRefs();
  const names = namesOf(refs);
  const steps = ctx.steps;
  const step = async <T>(key: StepKey, doing: string, fn: () => Promise<{ v: T; detail: string; by: StepLog["by"]; model?: string | null }>) => {
    const t = Date.now();
    emit({ t: "step", step: key, state: "run", detail: doing });
    const r = await fn();
    const log: StepLog = { step: key, ms: Date.now() - t, detail: r.detail, by: r.by, model: r.model ?? null };
    steps.push(log);
    emit({ t: "step", step: key, state: "done", detail: r.detail, by: r.by, model: r.model ?? null, ms: log.ms });
    return r.v;
  };

  // ---- Profiler
  const profile = profileTable(table);
  // a news feed mixes every subject: no single department owns it
  const owner = (sp: Spec): Spec => (table.format === "feed" ? Object.assign(sp, { department: null, deptName: null }) : sp);
  const spec = await step("understand", ctx.prior ? "Using your reading of the columns" : "Reading the headers and sample rows", async () => {
    if (ctx.prior) {
      const s = owner({ ...ctx.prior, columns: ctx.prior.columns.map((c, i) => ({ ...c, type: profile[i]?.type ?? c.type })) });
      return { v: s, detail: mapping(s), by: s.by === "ai" ? "ai" : "rules", model: s.model };
    }
    const rules = rulesSpec(profile, ctx.source.file, ctx.source.caption, refs);
    try {
      const { spec: ai, info } = await understandAI({ file: ctx.source.file, caption: ctx.source.caption, sheet: ctx.source.sheet, rows: table.rows.length, profile,
        sample: table.rows.slice(0, 10), refs, user: ctx.user });
      const s = owner(mergeSpec(ai, profile, rules, refs, `${info.provider}/${info.model}`));
      return { v: s, detail: mapping(s), by: "ai", model: s.model };
    } catch (e) {
      console.warn("[studio] profiler fell back to rules:", (e as Error).message?.slice(0, 160));
      emit({ t: "log", text: `Read by rules instead of AI: ${why(e)}.` });
      return { v: owner(rules), detail: mapping(owner(rules)), by: "rules" };
    }
  });
  for (const c of spec.columns.filter((x) => x.role !== "ignore").slice(0, 12)) emit({ t: "log", text: `${c.header} → ${ROLE_LABEL[c.role]}${c.unit ? ` (${c.unit})` : ""}` });

  // ---- Data Detective
  const cleaned = await step("clean", "Looking for duplicates, typos, bad dates and outliers", async () => {
    const c = clean(table, spec);
    const fixes = c.detective.issues.filter((i) => i.action !== "info");
    const detail = fixes.length ? fixes.slice(0, 3).map((i) => short(i.label, i.count)).join(" · ") : "No problems found";
    return { v: c, detail, by: "code" };
  });
  for (const i of cleaned.detective.issues.filter((x) => x.action !== "info").slice(0, 8))
    emit({ t: "log", text: `${i.action === "fixed" ? "Fixed" : i.action === "removed" ? "Removed" : "Flagged"}: ${i.label} (${i.count})${i.examples[0] ? ` — e.g. ${i.examples[0]}` : ""}` });
  const rows = cleaned.rows;

  // ---- Geo-locator
  await step("place", "Matching places to wards, zones and taluks", async () => {
    const r = await placeRows(rows, spec, refs, cleaned.detective, cleaned.minDate);
    const has = spec.columns.some((c) => ["place", "ward", "zone", "taluk", "lat"].includes(c.role));
    const detail = !has
      ? (r.placed ? `${r.placed.toLocaleString("en-IN")} of ${rows.length.toLocaleString("en-IN")} name a Chennai place in their text · ${r.zones} zones` : "No place column, and no Chennai place named in the text")
      : `${r.placed.toLocaleString("en-IN")} of ${rows.length.toLocaleString("en-IN")} rows on the map · ${r.zones} zones${r.wards ? ` · ${r.wards} wards` : ""}`;
    return { v: r, detail, by: "code" };
  });
  if (cleaned.detective.unplaced.length) emit({ t: "log", text: `Not in the Chennai gazetteer: ${cleaned.detective.unplaced.slice(0, 4).map((u) => u.v).join(", ")}` });
  // a periodic return (the same number of rows on every report date): count its cases, not its rows
  spec.weight = periodicWeight(rows, spec);
  // a period table (district x year): totals are read for the latest period
  spec.panelBy = panelColumn(rows, spec);
  if (spec.panelBy && !spec.weight && spec.primary && !spec.openValues.length) spec.weight = spec.primary;
  if (spec.panelBy) emit({ t: "log", text: `One row per ${spec.columns.find((c) => c.key === spec.panelBy)?.label.toLowerCase()} per period: totals are read for the latest period, not added across periods.` });
  else if (spec.weight) emit({ t: "log", text: `A periodic return: one row per place per report date, so "${spec.columns.find((c) => c.key === spec.weight)?.label}" is counted, not the rows.` });

  // ---- Designer
  const prev = ctx.prior && getMeta(ctx.id);
  const panels = await step("design", "Choosing the right chart for each question", async () => {
    const p = designDashboard(rows, spec, cleaned.window);
    // panels the Collector added by asking stay on the dashboard
    const extra = (prev?.panels ?? []).filter((x) => x.id.startsWith("q_"));
    const kpis = p.filter((x) => x.chart === "kpi").length;
    return { v: [...p, ...extra], detail: `${kpis} headline cards · ${p.length - kpis} charts${p.some((x) => x.chart === "map") ? " · a map" : ""}`, by: "code" };
  });

  // ---- Linker
  const link = await step("link", "Comparing with 6 months of district incidents", async () => {
    try {
      const l = await crossLink(rows, spec, cleaned.window, refs);
      if (!l) return { v: null, detail: rows.some((r) => r._z != null || r._d != null) ? "No clear link with district incidents" : "No places or dates to compare with incidents", by: "code" };
      const what = l.mode === "place"
        ? (l.strength === "none" ? `No clear link with ${l.incLabel.toLowerCase()}` : `${cap(l.strength)} link with ${l.incLabel.toLowerCase()} · ρ ${l.rho.toFixed(2)} over ${l.n} zones`)
        : `Moves with ${l.time?.label.toLowerCase()} week by week · ρ ${l.time?.rho.toFixed(2)}`;
      return { v: l, detail: what, by: "code" };
    } catch (e) {
      console.warn("[studio] link failed", e);
      return { v: null, detail: "Could not read the incidents store", by: "code" };
    }
  });
  if (link?.overlap.length) emit({ t: "log", text: `Shared hotspots: ${link.overlap.map((o) => o.name).join(", ")}` });
  if (link?.sample.length) emit({ t: "log", text: `${link.sample.length} matching incidents ready to open (${link.sample.filter((s) => s.open).length} still open)` });

  // ---- Insight Analyst: every angle computed, then the AI picks what matters and writes the brief
  const story = rulesStory(buildFacts(rows, spec, cleaned.detective, link, cleaned.window, names), spec, link);
  const brief = await step("story", "Mining backlogs, delays, gaps, hotspots and trends", async () => {
    const ins = computeInsights(rows, spec, cleaned.detective, link, cleaned.window, names);
    emit({ t: "log", text: `${ins.length} insights computed: ${[...new Set(ins.map((x) => x.label))].slice(0, 6).join(", ")}` });
    const b = await writeBrief(ins, spec, rows.length, cleaned.window, ctx.user, (m) => emit({ t: "log", text: m }));
    const detail = `${b.items.length} insights chosen from ${ins.length}${b.by === "ai" ? ` · every number checked${b.dropped ? ` · ${b.dropped} dropped` : ""}` : " · by rules"}`;
    return { v: b, detail, by: b.by, model: b.model };
  });
  emit({ t: "log", text: `Verdict: ${brief.verdict}` });

  const now = new Date().toISOString();
  const meta: DatasetMeta = {
    id: ctx.id, name: ctx.name || spec.title, source: ctx.source, createdAt: ctx.createdAt ?? now, updatedAt: now,
    rows: rows.length, cols: table.headers.length, window: cleaned.window, spec, profile, detective: cleaned.detective, panels, link, story, brief,
    rules: ctx.rules ?? [], steps, sample: ctx.sample
  };
  saveDataset(meta, rows);
  return ctx.id;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function mapping(s: Spec): string {
  const pick = (r: Role) => s.columns.find((c) => c.role === r);
  const parts = (["date", "place", "ward", "zone", "status", "category"] as Role[]).map((r) => pick(r)).filter(Boolean).map((c) => `${ROLE_LABEL[c!.role].split(" /")[0]}: ${c!.header}`);
  const prim = s.columns.find((c) => c.key === s.primary);
  if (prim) parts.push(`Measure: ${prim.header}`);
  return `One row = one ${s.entity}${s.deptName ? ` · ${s.deptName}` : ""} · ${parts.slice(0, 4).join(" · ")}`;
}

function short(label: string, n: number): string {
  const l = label.replace(/\(.*?\)/g, "").split(":").pop()!.trim().toLowerCase();
  return `${n.toLocaleString("en-IN")} ${l.length > 46 ? l.slice(0, 44) + "…" : l}`;
}

/** The brief over computed insights: the AI's when a model answers and its numbers check, else the rules'. */
async function writeBrief(ins: Insight[], spec: Spec, rows: number, window: DatasetMeta["window"], user: string, log: (m: string) => void): Promise<Brief> {
  const rules = rulesBrief(ins, spec);
  if (ins.length < 2) return rules;
  try {
    const b = await briefAI({ spec, insights: ins, rules, rows, window, user });
    if (b.by !== "ai") log("The AI's numbers did not check out: the brief is written by rules.");
    return b;
  } catch (e) {
    log(`Brief written by rules: ${why(e)}.`);
    return rules;
  }
}

/** The insights and brief computed again over the stored rows (a dataset added before the brief existed, or "re-analyse"). */
export async function analyse(id: string, user: string): Promise<Brief> {
  const meta = getMeta(id);
  if (!meta) throw new Error("Unknown dataset.");
  const rows = getRows(id);
  const names = namesOf(await loadRefs());
  const ins = computeInsights(rows, meta.spec, meta.detective, meta.link, meta.window, names);
  const brief = await writeBrief(ins, meta.spec, rows.length, meta.window, user, (m) => console.info(`[studio] ${m}`));
  // the leaner dashboard, for a dataset designed before it (panels the Collector added are kept)
  const panels = [...designDashboard(rows, meta.spec, meta.window), ...meta.panels.filter((p) => p.id.startsWith("q_"))];
  saveMeta({ ...meta, brief, panels });
  return brief;
}

// --------------------------------------------------------------------- reading --

export interface DatasetView {
  meta: Omit<DatasetMeta, "profile"> & { profile: DatasetMeta["profile"] };
  panels: PanelData[];
  /** the dashboard's own filters (chosen by clicking: a zone, a type, a week), each in words */
  focus: { filters: Filter[]; chips: string[] };
  brief: Brief;
  /** the brief is the rules' quick one: the page asks for the AI's (analyse) */
  briefStale: boolean;
}

/**
 * The dataset with every dashboard panel computed under the dashboard's filters. The map keeps every zone (so another
 * zone can be picked) but follows the other filters.
 */
export async function view(id: string, extra: Filter[]): Promise<DatasetView | null> {
  const meta = getMeta(id);
  if (!meta) return null;
  const rows = getRows(id);
  const refs = await loadRefs();
  const names = namesOf(refs);
  const panels = meta.panels.map((p) => runPlan(rows, meta.spec, { ...p, filters: [...p.filters, ...(p.chart === "map" ? extra.filter((f) => f.col !== "_z") : extra)] }, names));
  const brief = meta.brief ?? rulesBrief(computeInsights(rows, meta.spec, meta.detective, meta.link, meta.window, names), meta.spec);
  return { meta, panels, focus: { filters: extra, chips: extra.map((f) => describeFilter(meta.spec, f, names)) }, brief, briefStale: !meta.brief };
}

/** One mark of a chart opened (see drill.ts). */
export async function drillInto(id: string, plan: Plan, key: string | number | null, extra: Filter[]) {
  const meta = getMeta(id);
  if (!meta) throw new Error("Unknown dataset.");
  return drill(meta, getRows(id), plan, key, extra, namesOf(await loadRefs()));
}

/** A draft note to the department about a drilled finding. */
export async function draftNote(id: string, plan: Plan, key: string | number | null, extra: Filter[], user: string) {
  const meta = getMeta(id);
  if (!meta) throw new Error("Unknown dataset.");
  const d = await drill(meta, getRows(id), plan, key, extra, namesOf(await loadRefs()));
  return noteAI({ spec: meta.spec, label: d.label === plan.title ? plan.title : `${d.label} (${plan.title.toLowerCase()})`, facts: d.facts, user });
}

/** A question to one dataset: the AI's plan (or the rules'), run by the engine. */
export async function ask(id: string, question: string, user: string) {
  const meta = getMeta(id);
  if (!meta) throw new Error("Unknown dataset.");
  const rows = getRows(id);
  const refs = await loadRefs();
  const names = namesOf(refs);
  const zones = [...refs.zones.values()].map((z) => z.name);
  let out, by: "ai" | "rules" = "ai", model: string | null = null;
  try {
    const r = await askAI({ question, spec: meta.spec, profile: meta.profile, zones, user });
    out = r.out;
    model = `${r.info.provider}/${r.info.model}`;
  } catch (e) {
    console.warn("[studio] analyst fell back to rules:", (e as Error).message?.slice(0, 120));
    out = rulesAsk(question, meta.spec, meta.profile, zones);
    by = "rules";
  }
  if (out.kind === "unsupported") return { kind: "unsupported" as const, note: out.note || "These columns cannot answer that.", by, model };
  const plan: Plan = checkPlan(out, meta.spec, `q_${Date.now().toString(36)}`);
  const panel = runPlan(rows, meta.spec, plan, names);
  return {
    kind: out.kind, plan, panel, answer: answerText(panel, meta.spec), note: out.note && !/\d/.test(out.note) ? out.note.slice(0, 200) : null, by, model,
    watch: out.kind === "watch" && out.watch_op && out.watch_threshold != null ? { op: out.watch_op, threshold: out.watch_threshold } : null,
    window: meta.window.from ? `${fmtDay(meta.window.from)} – ${fmtDay(meta.window.to)}` : null
  };
}
