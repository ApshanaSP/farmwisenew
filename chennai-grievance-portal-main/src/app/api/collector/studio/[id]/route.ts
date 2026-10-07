import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession, failed } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkRule } from "@/lib/studio/ask";
import { filterRows, runPlan } from "@/lib/studio/engine";
import { note, stream } from "@/lib/studio/http";
import { analyse, ask, chooseCandidate, draftNote, drillInto, forceIngest, namesOf, refreshDataset, remap, runDueRefreshes, setSchedule, view } from "@/lib/studio/pipeline";
import { refs } from "@/lib/studio/refs";
import { deleteDataset, dropPending, getBoard, getMeta, getPending, getRows, saveBoard, saveMeta, validId } from "@/lib/studio/store";
import { ROLES, type Filter, type Plan, type Role } from "@/lib/studio/types";
import { AiBudgetError } from "@/lib/ai/gateway";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: { id: string } };

/** The dataset with its dashboard computed (?zone= narrows every panel to one zone), or the cleaned rows (?export=csv). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (!validId(params.id)) return NextResponse.json({ error: "Unknown dataset." }, { status: 404 });
  try {
    runDueRefreshes();
    const extra = filtersOf(req.nextUrl.searchParams.get("f"));
    if (req.nextUrl.searchParams.get("export") === "csv") return exportCsv(params.id, extra);
    if (req.nextUrl.searchParams.get("rows") === "1") {
      const meta = getMeta(params.id);
      if (!meta) return NextResponse.json({ error: "Unknown dataset." }, { status: 404 });
      const p = runPlan(getRows(params.id), meta.spec, { id: "rows", title: "Rows", chart: "table", agg: "count", col: null, by: "none", byCol: null, unit: null,
        filters: [], sort: "desc", limit: 300 }, namesOf(await refs()));
      return NextResponse.json({ table: p.table });
    }
    const v = await view(params.id, extra);
    if (!v) return NextResponse.json({ error: "Unknown dataset." }, { status: 404 });
    const names = namesOf(await refs());
    const rows = getRows(params.id);
    const alerts = v.meta.rules.map((r) => checkRule(r, rows, v.meta.spec, names));
    const pinned = getBoard().filter((p) => p.datasetId === params.id).map((p) => p.plan.id);
    return NextResponse.json({ ...v, alerts, pinned });
  } catch (err) {
    return failed(err, "the dataset");
  }
}

/** The dashboard's filters from ?f= (JSON), checked; anything malformed is ignored. */
function filtersOf(raw: string | null): Filter[] {
  if (!raw) return [];
  try {
    const r = z.array(FilterSchema).max(8).safeParse(JSON.parse(raw));
    return r.success ? (r.data as Filter[]) : [];
  } catch { return []; }
}

async function exportCsv(id: string, extra: Filter[]) {
  const meta = getMeta(id);
  if (!meta) return NextResponse.json({ error: "Unknown dataset." }, { status: 404 });
  const all = getRows(id);
  const rows = extra.length ? filterRows(all, { id: "x", title: "", chart: "table", agg: "count", col: null, by: "none", byCol: null, unit: null, filters: extra, sort: "desc", limit: 0 }, namesOf(await refs())) : all;
  const cols = meta.spec.columns.filter((c) => c.role !== "ignore");
  const derived: [string, string][] = [["_z", "Zone (matched)"], ["_w", "Ward (matched)"], ["_t", "Taluk (matched)"], ["_p", "Place (matched)"]];
  const q = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    // a cell that starts with = + - @ would run as a formula in Excel: written as text
    const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [[...cols.map((c) => c.header), ...derived.map(([, h]) => h)].map(q).join(",")];
  for (const r of rows) lines.push([...cols.map((c) => (c.role === "person" ? "" : r[c.key])), ...derived.map(([k]) => r[k])].map(q).join(","));
  const name = meta.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "dataset";
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}_cleaned.csv"` }
  });
}

const Patch = z.union([
  z.object({ name: z.string().trim().min(2).max(100) }),
  z.object({ columns: z.array(z.object({ key: z.string().regex(/^c\d{1,3}$/), role: z.enum(ROLES as [Role, ...Role[]]), label: z.string().max(40).optional() })).min(1).max(60) })
]);

/** Rename ({ name }), or correct what columns mean ({ columns }: re-runs the agents, streamed). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const meta = validId(params.id) ? getMeta(params.id) : null;
  if (!meta) return NextResponse.json({ error: "Unknown dataset." }, { status: 404 });
  const b = Patch.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  if ("name" in b.data) {
    saveMeta({ ...meta, name: b.data.name, updatedAt: new Date().toISOString() });
    await note(s.email, "studio:rename", meta.id, { name: b.data.name });
    return NextResponse.json({ ok: true });
  }
  const changes = b.data.columns;
  return stream(async (emit) => {
    const id = await remap(params.id, changes, s.email, emit);
    await note(s.email, "studio:remap", id, { columns: changes.map((c) => `${c.key}=${c.role}`) });
    return id;
  });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const meta = validId(params.id) ? getMeta(params.id) : null;
  if (!meta) return NextResponse.json({ error: "Unknown dataset." }, { status: 404 });
  deleteDataset(params.id);
  await note(s.email, "studio:delete", params.id, { name: meta.name });
  return NextResponse.json({ ok: true });
}

const FilterSchema = z.object({ col: z.string().max(10), op: z.enum(["eq", "neq", "in", "contains", "gte", "lte", "open", "closed", "recent_days", "latest"]), values: z.array(z.string().max(80)).max(20) });
const PlanSchema = z.object({
  id: z.string().max(40), title: z.string().max(120), chart: z.enum(["kpi", "bar", "hbar", "line", "area", "donut", "treemap", "map", "table"]),
  agg: z.enum(["count", "sum", "avg", "max", "min", "distinct"]), col: z.string().max(10).nullable(), by: z.enum(["none", "col", "zone", "ward", "taluk", "place", "time"]),
  byCol: z.string().max(10).nullable(), unit: z.enum(["day", "week", "month", "year"]).nullable(),
  filters: z.array(FilterSchema).max(10),
  sort: z.enum(["desc", "asc", "key"]), limit: z.number().int().min(1).max(300)
});
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ask"), question: z.string().trim().min(2).max(400) }),
  z.object({ action: z.literal("pin"), plan: PlanSchema }),
  z.object({ action: z.literal("preview"), plan: PlanSchema }),
  z.object({ action: z.literal("drill"), plan: PlanSchema, key: z.union([z.string().max(80), z.number()]).nullable(), filters: z.array(FilterSchema).max(8).default([]) }),
  z.object({ action: z.literal("note"), plan: PlanSchema, key: z.union([z.string().max(80), z.number()]).nullable(), filters: z.array(FilterSchema).max(8).default([]) }),
  z.object({ action: z.literal("unpin"), planId: z.string().max(40) }),
  z.object({ action: z.literal("add-panel"), plan: PlanSchema }),
  z.object({ action: z.literal("remove-panel"), planId: z.string().max(40) }),
  z.object({ action: z.literal("watch"), text: z.string().trim().min(4).max(300), plan: PlanSchema, op: z.enum(["gt", "gte", "lt", "lte"]), threshold: z.number() }),
  z.object({ action: z.literal("unwatch"), ruleId: z.string().max(40) }),
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("analyse") }),
  z.object({ action: z.literal("choose"), candidate: z.string().max(40) }),
  z.object({ action: z.literal("schedule"), every: z.number().int().min(30).max(10080).nullable() })
]);
/** Actions on a run the Relevance gate stopped (no dataset yet): resume it anyway, or drop it. */
const PendingAction = z.object({ action: z.enum(["force", "discard"]) });

/** Ask the data, pin a panel to the board, add or remove a dashboard panel, set or drop an alert, fetch a link again. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const body = await req.json().catch(() => ({}));
  const pend = PendingAction.safeParse(body);
  if (pend.success && validId(params.id)) {
    if (!getPending(params.id)) return NextResponse.json({ error: "That stopped run is no longer waiting. Add the data again." }, { status: 404 });
    if (pend.data.action === "discard") { dropPending(params.id, !getMeta(params.id)); return NextResponse.json({ ok: true }); }
    return stream(async (emit) => {
      const id = await forceIngest(params.id, s.email, emit);
      await note(s.email, "studio:use-anyway", id, {});
      return id;
    });
  }
  const meta = validId(params.id) ? getMeta(params.id) : null;
  if (!meta) return NextResponse.json({ error: "Unknown dataset." }, { status: 404 });
  const b = Action.safeParse(body);
  if (!b.success) return NextResponse.json({ error: b.error.issues[0]?.message ?? "Unknown action." }, { status: 400 });
  const a = b.data;
  try {
    switch (a.action) {
      case "ask": {
        if (!checkRateLimit(`studio-ask:${s.userId}`, 40, 300).allowed) return NextResponse.json({ error: "Too many questions in a few minutes. Try again shortly." }, { status: 429 });
        return NextResponse.json(await ask(params.id, a.question, s.email));
      }
      case "pin": {
        const board = getBoard().filter((p) => !(p.datasetId === meta.id && p.plan.id === a.plan.id));
        board.unshift({ id: `pin_${Date.now().toString(36)}`, datasetId: meta.id, datasetName: meta.name, plan: a.plan as Plan, at: new Date().toISOString() });
        saveBoard(board);
        await note(s.email, "studio:pin", meta.id, { panel: a.plan.title });
        return NextResponse.json({ ok: true, pins: board.length });
      }
      case "preview": {
        const names = namesOf(await refs());
        return NextResponse.json({ panel: runPlan(getRows(meta.id), meta.spec, { ...(a.plan as Plan), limit: Math.max(a.plan.limit, a.plan.chart === "map" ? 300 : 12) }, names) });
      }
      case "drill":
        return NextResponse.json(await drillInto(meta.id, a.plan as Plan, a.key, a.filters as Filter[]));
      case "note": {
        if (!checkRateLimit(`studio-note:${s.userId}`, 20, 300).allowed) return NextResponse.json({ error: "Too many drafts in a few minutes. Try again shortly." }, { status: 429 });
        const n = await draftNote(meta.id, a.plan as Plan, a.key, a.filters as Filter[], s.email);
        await note(s.email, "studio:note", meta.id, { finding: a.plan.title, key: a.key });
        return NextResponse.json(n);
      }
      case "unpin": {
        saveBoard(getBoard().filter((p) => !(p.datasetId === meta.id && (p.plan.id === a.planId || p.id === a.planId))));
        return NextResponse.json({ ok: true });
      }
      case "add-panel": {
        const plan = { ...(a.plan as Plan), id: a.plan.id.startsWith("q_") ? a.plan.id : `q_${Date.now().toString(36)}` };
        saveMeta({ ...meta, panels: [...meta.panels.filter((p) => p.id !== plan.id), plan], updatedAt: new Date().toISOString() });
        await note(s.email, "studio:add-panel", meta.id, { panel: plan.title });
        const names = namesOf(await refs());
        return NextResponse.json({ ok: true, panel: runPlan(getRows(meta.id), meta.spec, plan, names) });
      }
      case "remove-panel": {
        saveMeta({ ...meta, panels: meta.panels.filter((p) => p.id !== a.planId), updatedAt: new Date().toISOString() });
        return NextResponse.json({ ok: true });
      }
      case "watch": {
        const rule = { id: `r_${Date.now().toString(36)}`, text: a.text, plan: a.plan as Plan, op: a.op, threshold: a.threshold, createdAt: new Date().toISOString(), by: "ai" as const };
        saveMeta({ ...meta, rules: [...meta.rules, rule].slice(-12), updatedAt: new Date().toISOString() });
        await note(s.email, "studio:watch", meta.id, { rule: a.text });
        const names = namesOf(await refs());
        return NextResponse.json({ ok: true, status: checkRule(rule, getRows(meta.id), meta.spec, names) });
      }
      case "unwatch": {
        saveMeta({ ...meta, rules: meta.rules.filter((r) => r.id !== a.ruleId), updatedAt: new Date().toISOString() });
        return NextResponse.json({ ok: true });
      }
      case "analyse": {
        if (!checkRateLimit(`studio-analyse:${s.userId}`, 12, 300).allowed) return NextResponse.json({ error: "Too many analyses in a few minutes. Try again shortly." }, { status: 429 });
        const brief = await analyse(meta.id, s.email);
        await note(s.email, "studio:analyse", meta.id, { by: brief.by, items: brief.items.length });
        return NextResponse.json({ brief });
      }
      case "refresh": {
        if (meta.source.kind !== "link" || !meta.source.url) return NextResponse.json({ error: "Only data added by a link can be fetched again." }, { status: 400 });
        return stream(async (emit) => {
          const id = await refreshDataset(meta.id, s.email, emit);
          await note(s.email, "studio:refresh", id, {});
          return id;
        });
      }
      case "choose":
        return stream(async (emit) => {
          const id = await chooseCandidate(meta.id, a.candidate, s.email, emit);
          await note(s.email, "studio:choose", id, { candidate: a.candidate });
          return id;
        });
      case "schedule": {
        setSchedule(meta.id, a.every);
        await note(s.email, "studio:schedule", meta.id, { every: a.every });
        return NextResponse.json({ ok: true });
      }
    }
  } catch (err) {
    if (err instanceof AiBudgetError) return NextResponse.json({ error: err.message }, { status: 429 });
    return failed(err, "the dataset");
  }
}
