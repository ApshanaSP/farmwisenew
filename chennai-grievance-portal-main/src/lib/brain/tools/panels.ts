/**
 * dashboard and briefing: every panel of the console as the Collector sees it, read by the dashboard's own functions, and the day's (or any
 * window's) full briefing: figures, the most serious incidents, departments, taluks, newspapers, stories, warnings, rain, lakes, air, beds,
 * traffic, reviews, tasks, and the action summary, each with the records it rests on.
 */
import { runTool } from "@/lib/assistant/tools";
import { insights } from "@/lib/collector/insights";
import { overview, awaitingCheck } from "@/lib/collector/intel";
import { collectionStatus, listSources } from "@/lib/collector/sources";
import { listWorkspaces } from "@/lib/collector/workspaces";
import { deptSummary } from "@/lib/collector/deptsummary";
import { plain } from "@/lib/collector/glance";
import { feedLabel } from "@/lib/collector/freshness";
import { caseRows } from "../sql";
import { agoWords, istWords, toPart } from "../format";
import { deptOf, kindsOf, talukOf, zoneName, zoneOf } from "../names";
import { periodFor, WHEN_SCHEMA, winOf, type WhenIn, type Win } from "../when";
import { ToolProblem, type BrainTool, type Evidence, type Part, type Rec, type ToolCtx, type ToolOut } from "../types";
import { caseList, casesPart, incidentsTool, sourceWords } from "./incidents";
import { alertsOut, newsTool } from "./records";
import { fromTool, readingsTool, cityTool } from "./live";
import { rehearsalState } from "@/lib/rehearsal/engine";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => Number(v ?? 0) || 0;
/** a part of a whole may be slow (a model behind it, a live feed): the rest never waits for it */
async function within<T>(ms: number, p: Promise<T>): Promise<T | null> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([p, new Promise<null>((r) => { t = setTimeout(() => r(null), ms); })]); } catch { return null; } finally { clearTimeout(t); }
}

const PANELS = ["tiles", "severe", "zones", "department", "departments", "followups", "taluks", "tasks", "bell", "alerts", "location_review", "review_queue", "hotspots", "unusual_rises", "category_trends", "where_to_concentrate", "resolution_times", "forecast", "pwd_works",
  "workspaces", "decisions", "emails_sent", "petitions", "data_sources", "feed_health", "officer_steps", "map_layers", "rain_rehearsal"] as const;

/** panels of the whole district's work: never on a department officer's console */
const COLLECTOR_PANELS = new Set(["review_queue", "workspaces", "decisions", "emails_sent", "petitions", "officer_steps", "followups", "departments"]);
interface ScopeIn { when?: WhenIn | null; zone?: unknown; dept?: unknown; kind?: unknown; taluk?: unknown }
function scopeOf(i: ScopeIn, c: ToolCtx): { w: Win; period: "daily" | "weekly" | "monthly" | "quarterly"; zone: number | null; dept: string | null; cat: string | null; taluk: string | null; words: string } {
  const dflt = c.console.period === "weekly" ? "last_7_days" : c.console.period === "monthly" ? "last_30_days" : c.console.period === "quarterly" ? "last_90_days" : "today";
  const w = winOf(i.when, c.now, dflt);
  const zone = i.zone != null && i.zone !== "" ? zoneOf(i.zone, c.world) : null, dept = c.user.lockDept ?? (i.dept ? deptOf(i.dept, c.world).code : null), taluk = i.taluk ? talukOf(i.taluk, c.world).code : null;
  const k = i.kind ? kindsOf(i.kind, c.world) : null, cat = k?.codes.length === 1 ? k.codes[0] : null;
  return { w, period: periodFor(w), zone, dept, cat, taluk, words: [zone ? `${zoneName(zone, c.world)} zone` : "", dept ?? "", k?.name ?? "", taluk ?? ""].filter(Boolean).join(", ") || "the whole district" };
}

async function dashboardRun(input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  const panel = s(input.panel), x = scopeOf(input as ScopeIn, c), scope = { period: x.period, zone: x.zone, dept: x.dept, cat: x.cat, taluk: x.taluk };
  const limit = Math.min(Math.max(n(input.limit) || 12, 1), 60);
  const base = { when: x.w.label, asOf: c.now };
  const src = ["the incident register as the dashboard reads it"];
  if (c.user.lockDept && COLLECTOR_PANELS.has(panel)) throw new ToolProblem("That panel is the Collector's. This console answers for its own department.");
  const limits = input.when ? [] : [`No time was given: the window the console shows is counted (${x.w.label}).`];
  switch (panel) {
    case "tiles": {
      const o = await overview(x.period, x.zone, x.dept, { cat: x.cat, taluk: x.taluk });
      const L: Record<string, string> = { reported: "Incidents reported", severe: "Severe events", severe_open: "Severe, still open", ongoing: "Ongoing (open) incidents", urgent: "Open and severe or high", complaints: "Open citizen complaints", complaint_inc: "Open incidents with complaints", resolved: "Resolved" };
      const cur = o.kpi.cur as Row, prev = o.kpi.prev as Row;
      return { ...base, about: `The dashboard's tiles for ${x.words}`, sources: src, limits, method: "Counted by first report time in the window (Resolved by closing time); open = not resolved, rejected or lapsed.", parts: [toPart("tiles", "Tiles", Object.keys(L).map((k) => ({ figure: L[k], key: k, value: n(cur[k]), before: n(prev[k]), change: n(cur[k]) - n(prev[k]) })), ["figure", "value", "before", "change"], { of: "kpis" })] };
    }
    case "severe": {
      const o = await overview(x.period, x.zone, x.dept, { cat: x.cat, taluk: x.taluk });
      const ids = (o.severity.rows as Row[]).map((r) => s(r.id)).slice(0, limit);
      const rows = ids.length ? await caseList(`c.id IN (${ids.map(() => "?").join(",")})`, ids, { limit: 60 }) : [];
      const at = new Map(ids.map((v, k) => [v, k]));
      rows.sort((a, b) => (at.get(String(a.id)) ?? 0) - (at.get(String(b.id)) ?? 0)).forEach((r, k) => { r.n = k + 1; });
      return { ...base, about: `The severity panel for ${x.words}`, sources: src, limits, ids, parts: [toPart("split", "By severity (open incidents)", Object.entries(o.severity.counts as Record<string, number>).map(([k, v]) => ({ severity: k, incidents: v })), ["severity", "incidents"], { of: "rank" }), casesPart("cases", "Most serious first", rows, (o.severity.rows as Row[]).length)] };
    }
    case "zones": return { ...(await incidentsTool.run({ when: input.when ?? { named: x.period === "daily" ? "today" : x.period === "weekly" ? "last_7_days" : x.period === "monthly" ? "last_30_days" : "last_90_days" }, group_by: ["zone"], rank_by: "severe", ...(x.dept ? { depts: [x.dept] } : {}) }, c)) };
    case "department": {
      // the pop-up a click on a department opens, figure for figure
      if (!x.dept) throw new ToolProblem('Say which department: {"panel":"department","dept":"..."}. For all of them use panel "departments".');
      const d = await deptSummary(x.dept, x.period, { zone: x.zone, taluk: x.taluk, cat: x.cat });
      if (!d) throw new ToolProblem(`"${x.dept}" is not a department.`);
      const f = d.figures, kp = (key: string, figure: string, value: unknown, before: unknown = null): Rec => ({ key, figure, value: n(value), before: before == null ? null : n(before) });
      if (!x.w.period) limits.push(`The pop-up counts a day, 7, 30 or 90 days: ${d.periodInfo.label ?? x.period} is given.`);
      return { ...base, about: `${d.name}${d.where ? ` (${d.where})` : ""}: ${f.reported} incidents reported, ${f.open} open, ${f.overdue} past their deadline${d.head ? `; headed by the ${d.head}` : ""}`, sources: [...src, "the department's records, the news linked to its incidents, the action list, and the instructions the Collector sent"], limits, ids: d.cases.map((r) => r.id),
        facts: [...d.summary.en.map(plain), ...(f.medianMinutes != null ? [`Half of its cases closed in the window were closed within ${Math.round(f.medianMinutes)} minutes (${Math.round((f.medianMinutes / 60) * 10) / 10} hours).`] : [])],
        parts: [
          toPart("figures", `${d.name}: the figures`, [kp("reported", "Incidents reported", f.reported, f.prevReported), kp("open", "Open", f.open, f.prevOpen), kp("severe", "Severe", f.severe, f.prevSevere), kp("severe_open", "Severe and open", f.severeOpen), kp("overdue", "Past their deadline", f.overdue), kp("resolved", "Resolved", f.resolved, f.prevResolved), kp("complaints", "Citizen complaints", f.complaints), kp("awaiting", "Waiting for the Collector", f.awaiting), kp("deaths", "Deaths", f.deaths), kp("injured", "Injured", f.injured), kp("closed_on_time", "Closed in time", d.deadline.onTime), kp("closed_late", "Closed late", d.deadline.late)], ["figure", "value", "before"], { of: "kpis" }),
          toPart("days", "The last 7 days", d.days.flatMap((y) => [{ day: y.day, series: "Reported", count: y.reported }, { day: y.day, series: "Resolved", count: y.resolved }]) as unknown as Rec[], ["day", "series", "count"], { of: "series" }),
          toPart("weeks", "The last 12 weeks", d.weeks.flatMap((y) => [{ week: y.day, series: "Reported", count: y.reported }, { week: y.day, series: "Resolved", count: y.resolved }]) as unknown as Rec[], ["week", "series", "count"], { of: "series" }),
          toPart("kinds", "By kind", d.kinds.map((r) => ({ kind: r.label, reported: r.n, open: r.open, before: r.prev })) as unknown as Rec[], ["kind", "reported", "open", "before"], { of: "rank" }),
          toPart("areas", d.areaKind === "ward" ? "By ward" : "By zone", d.areas.map((r) => ({ area: r.name, reported: r.n, open: r.open })) as unknown as Rec[], ["area", "reported", "open"], { of: "rank" }),
          toPart("severity", "By severity", d.severity.map((r) => ({ severity: r.sev, reported: r.n, open: r.open })) as unknown as Rec[], ["severity", "reported", "open"], { of: "rank" }),
          toPart("ages", "How long its open cases have waited", d.ages.map((r) => ({ waiting: r.label, open: r.n })) as unknown as Rec[], ["waiting", "open"], { of: "rank" }),
          toPart("cases", "Its most important open cases", d.cases.map((r) => ({ id: r.id, title: r.title, kind: r.type, place: r.loc, zone: r.zone, severity: r.sev, status: r.status, complaints: r.complaints, dead: r.dead, past_deadline: r.overdue ? "yes" : "no", reported_at: istWords(r.t), why: r.why })) as unknown as Rec[], ["title", "severity", "status", "kind", "place", "zone", "complaints", "dead", "past_deadline", "reported_at", "why", "id"], { of: "cases", total: f.open }),
          toPart("contacts", "Who to call", d.contacts as unknown as Rec[], Object.keys(d.contacts[0] ?? {}).filter((k) => /name|role|post|designation|phone|mobile|email|office|area|office_name/i.test(k)), {}),
          toPart("news", "News about its work", d.news.map((r) => ({ headline: r.title, newspapers: (r.outletNames ?? []).join(", "), at: istWords(r.t) })) as unknown as Rec[], ["headline", "newspapers", "at"], { total: d.newsTotal }),
          toPart("tasks", "Steps it owes", d.tasks.map((r) => ({ step: r.text, incident: r.title, owner: r.owner, due: istWords(r.due), late: r.late ? "yes" : "no", id: r.id })) as unknown as Rec[], ["step", "incident", "owner", "due", "late", "id"], {}),
          toPart("instructions", "The Collector's instructions still waiting for a reply", d.followUps.map((r) => ({ instruction: r.text, incident: r.title, due: r.due, late: r.late ? "yes" : "no", id: r.incident })) as unknown as Rec[], ["instruction", "incident", "due", "late", "id"], { total: d.followUpsTotal })
        ].filter((p) => p.rows.length),
        method: "The same figures as the department's pop-up: reported by first report time in the window; open now; past deadline by the deadline of each kind and severity; resolved by closing time." };
    }
    case "departments": case "followups": {
      // (straight from the register: the briefing's own department list is the same rule, and this is ready at once for any window)
      const cond = ["c.is_open = 1", `c.reported_at ${x.w.period && x.w.period !== "daily" ? ">" : ">="} ?`, "c.reported_at <= ?", "c.dept_code IS NOT NULL"], params: unknown[] = [x.w.from, x.w.to];
      if (x.zone) { cond.push("c.zone_no = ?"); params.push(x.zone); }
      if (x.dept) { cond.push("c.dept_code = ?"); params.push(x.dept); }
      if (x.taluk) { cond.push("c.taluk_code = ?"); params.push(x.taluk); }
      if (x.cat) { cond.push("c.kind_code = ?"); params.push(x.cat); }
      const W = cond.join(" AND ");
      const depts = await caseRows(`SELECT c.dept_code AS code, c.dept AS department, (SELECT head FROM ref_departments r WHERE r.code = c.dept_code) AS head, COUNT(*) AS open, SUM(c.is_overdue) AS past_deadline, SUM(c.severity IN ('Severe', 'High')) AS severe_or_high,
          SUM(c.awaiting_collector = 1) AS awaiting_check, SUM(c.complaints) AS complaints, ROUND(MAX(julianday('${c.now}') - julianday(c.reported_at)), 0) AS oldest_days FROM cases c WHERE ${W} GROUP BY c.dept_code ORDER BY severe_or_high DESC, past_deadline DESC, open DESC LIMIT 30`, params);
      const top = await caseRows(`SELECT * FROM (SELECT c.dept_code AS code, c.dept AS department, c.id, c.title AS incident, c.severity, CASE WHEN c.is_overdue = 1 THEN 'yes' ELSE 'no' END AS past_deadline, c.reported_at,
          ROW_NUMBER() OVER (PARTITION BY c.dept_code ORDER BY CASE c.severity WHEN 'Severe' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, c.is_overdue DESC, c.priority DESC) AS rn FROM cases c WHERE ${W}) WHERE rn <= ?`, [...params, x.dept ? 8 : 2]);
      const next = new Map((top.length ? await caseRows(`SELECT incident_id AS id, text, owner, due_at FROM (SELECT a.*, ROW_NUMBER() OVER (PARTITION BY a.incident_id ORDER BY a.status = 'In progress' DESC, a.due_at) AS k FROM actions a WHERE a.incident_id IN (${top.map(() => "?").join(",")}) AND a.status NOT IN ('Done', 'Verified')) WHERE k = 1`, top.map((r) => r.id)) : []).map((r) => [s(r.id), r]));
      const order = new Map(depts.map((d, k) => [s(d.code), k]));
      const todo: Rec[] = top.sort((a, b) => (order.get(s(a.code)) ?? 99) - (order.get(s(b.code)) ?? 99) || n(a.rn) - n(b.rn)).map((r) => ({ department: s(r.department), id: s(r.id), incident: s(r.incident), title: s(r.incident), severity: s(r.severity), past_deadline: s(r.past_deadline), reported_at: istWords(r.reported_at), next_action: s(next.get(s(r.id))?.text) || `Ask for a report on the ground`, owner: s(next.get(s(r.id))?.owner) || null, due: next.get(s(r.id))?.due_at ? istWords(next.get(s(r.id))!.due_at) : null }));
      const rows: Rec[] = depts.map((d, k) => ({ rank: k + 1, ...d }) as Rec);
      return { ...base, about: `Department follow-up for ${x.words}: ${rows.length} departments with open work`, sources: [...src, "the action list (each incident's next step, its owner and its due time)"], limits, ids: todo.map((r) => String(r.id)),
        parts: [toPart("departments", "Department-wise follow-up", rows, ["rank", "department", "head", "open", "past_deadline", "severe_or_high", "awaiting_check", "complaints", "oldest_days"], { of: "rank" }), toPart("todo", "What to follow up first in each department", todo, ["department", "incident", "severity", "past_deadline", "reported_at", "next_action", "owner", "due", "id"], { of: "cases" })],
        method: "Open incidents reported in the window, by lead department; past deadline by the deadline of each kind and severity; the follow-up is the next open step of its most serious incidents." };
    }
    case "taluks": return fromTool(await runTool("taluks", { scope: { ...scope, period: "monthly" } }), { about: "Taluks over the last 30 days (Trends page)", sources: src });
    case "tasks": {
      const o = await overview(x.period, x.zone, x.dept, { cat: x.cat, taluk: x.taluk });
      const a = await awaitingCheck({ period: x.period, zone: x.zone, dept: x.dept, cat: x.cat, taluk: x.taluk } as never, c.now);
      const rows = (o.tasks.rows as Row[]).slice(0, limit).map((r, k) => ({ n: k + 1, id: s(r.id), title: s(r.title), severity: s(r.sev), department: s(r.dept_name), place: s(r.loc), because: ((r.because as string[] | undefined) ?? []).join(", "), updated: istWords(r.updated) }));
      return { ...base, about: `My tasks: ${o.tasks.count} closures wait for the Collector's check; ${a.leftToDepts} others the departments verify themselves`, sources: src, limits, parts: [toPart("tasks", "Waiting for your check", rows, ["n", "id", "title", "severity", "department", "place", "because", "updated"], { of: "cases", total: o.tasks.count })], method: "Severe incidents a department reports as closed, and completion reports officers sent, come to the Collector; other closures are verified by the department." };
    }
    case "bell": { const o = await overview(x.period, x.zone, x.dept, { cat: x.cat, taluk: x.taluk }); return { ...base, about: "The bell: newest severe and high incidents still open", sources: src, limits, parts: [toPart("bell", "Alerts in the bell", (o.bell as unknown as Row[]).map((r, k) => ({ n: k + 1, id: s(r.id), title: s(r.title), severity: s(r.sev), place: s(r.loc), reported: istWords(r.t) })), ["n", "id", "title", "severity", "place", "reported"], { of: "cases" })] }; }
    case "alerts": return alertsOut(c);
    case "location_review": {
      const b = await insights(x.period, null, x.dept, {}, "trends");
      const r = b.review as unknown as { unplaced: Row[]; unplacedTotal: number; counts: Row | null; located: Row[]; placed: Row[]; links: number; gaps: number };
      const row = (y: Row, k: number): Rec => ({ n: k + 1, id: s(y.id), title: s(y.title), kind: s(y.type), severity: s(y.sev) || null, department: s(y.dept_name) || null, place_text: s(y.loc ?? y.place) || null, why: s((y.loc_verdict as Row | undefined)?.how ?? y.how) || null, reported: istWords(y.t) });
      return { ...base, about: `Locations needing review: ${r.unplacedTotal} open incidents whose place is not known well enough to map`, when: "the last 30 days", sources: src, parts: [toPart("unplaced", "Location needs review", r.unplaced.map(row), ["n", "id", "title", "kind", "severity", "department", "place_text", "why", "reported"], { of: "cases", total: r.unplacedTotal }),
        toPart("counts", "How the unplaced ones split", [{ group: "Place missing, needs a check (the tile)", incidents: n(r.counts?.missing) }, { group: "About the whole district, no single place", incidents: n(r.counts?.district) }, { group: "Outside Chennai", incidents: n(r.counts?.outside) }, { group: "Place found from the text", incidents: n(r.counts?.located) }, { group: "Report links waiting for review", incidents: r.links }], ["group", "incidents"]),
        ...(r.placed.length ? [toPart("placed", "Placed by the console from the report, worth a glance", r.placed.slice(0, 10).map(row), ["n", "id", "title", "why", "reported"], { of: "cases", total: r.placed.length })] : [])],
        method: "Open incidents of the last 30 days with no zone: a report about one spot whose place could not be read is listed; a notice about the whole city, or an event outside Chennai, is not." };
    }
    case "review_queue": {
      const rows = await caseRows("SELECT item_type, status, COUNT(*) AS n FROM review_queue GROUP BY 1, 2 ORDER BY 3 DESC");
      const list = await caseRows("SELECT review_id, item_type, item_id, suggestion, reason, evidence, status, created_at FROM review_queue WHERE status <> 'done' ORDER BY created_at DESC LIMIT ?", [limit]);
      return { ...base, when: "now", about: "The review queue: what the pipeline could not decide alone", sources: ["review queue of the data pipeline"], parts: [toPart("kinds", "By kind", rows.map((r) => ({ kind: s(r.item_type), status: s(r.status), items: n(r.n) })), ["kind", "status", "items"]), toPart("items", "Newest items", list.map((r) => ({ id: s(r.item_id), kind: s(r.item_type), suggestion: s(r.suggestion), reason: s(r.reason), created: istWords(r.created_at) })), ["id", "kind", "suggestion", "reason", "created"])] };
    }
    case "hotspots": return fromTool(await runTool("hotspots", { scope }), { about: "Hotspots (Trends page)", sources: src });
    case "unusual_rises": return fromTool(await runTool("unusual_rises", { scope }), { about: "Unusual rises (Trends page)", sources: src });
    case "category_trends": return fromTool(await runTool("category_trends", { scope }), { about: "Incidents by kind over 12 weeks and 6 months (Trends page)", sources: src, rows: 20 });
    case "where_to_concentrate": return fromTool(await runTool("focus_trends", { scope, days: x.w.days <= 10 ? 7 : x.w.days <= 45 ? 28 : 84 }), { about: "Where to concentrate, what is getting worse and improving", sources: src });
    case "resolution_times": {
      const t = await runTool("resolution_times", { scope }), d = t.data as { rows?: Row[]; closed?: number; avgHours?: number; onTime?: number } | null;
      const rows = [...(d?.rows ?? [])].sort((a, b) => n(b.days) - n(a.days)).map((r, k) => ({ rank: k + 1, department: s(r.name), avg_days: n(r.days), closed: n(r.n), in_time: n(r.onTime), in_time_pct: n(r.onTimePct), avg_days_before: r.prevHours == null ? null : Math.round((n(r.prevHours) / 24) * 10) / 10 }));
      return { ...base, about: `How fast each department closes its cases: ${n(d?.closed)} closed, ${Math.round((n(d?.avgHours) / 24) * 10) / 10} days on average, ${n(d?.onTime)} within the deadline (${n(d?.closed) ? Math.round((n(d?.onTime) / n(d?.closed)) * 100) : 0}%)`, sources: src, limits: [...limits, ...((t.caveats ?? []) as string[])],
        parts: [{ ...toPart("rows", "By department, slowest first", rows as unknown as Rec[], [{ key: "rank", label: "#" }, "department", { key: "avg_days", label: "Average days to close", kind: "number" }, { key: "closed", label: "Closed", kind: "number" }, { key: "in_time", label: "Closed within the deadline", kind: "number" }, { key: "in_time_pct", label: "% within the deadline", kind: "number" }, { key: "avg_days_before", label: "Average days to close, period before", kind: "number" }], { of: "rank" }) }] };
    }
    case "forecast": {
      const rows = await caseRows("SELECT location_id, issued_at, valid_from, forecast_text FROM forecasts WHERE valid_from >= ? ORDER BY issued_at DESC, valid_from LIMIT 40", [c.now.slice(0, 10)]);
      const last = rows[0]?.issued_at;
      const w = await caseRows("SELECT observed_at, value, detail FROM observations WHERE metric = 'imd_warning_level' AND observed_at >= ? ORDER BY observed_at LIMIT 8", [c.now.slice(0, 10)]);
      return { about: "Weather forecast", asOf: s(last) || null, when: "the coming days", sources: ["India Meteorological Department city forecast and district warning"], parts: [toPart("forecast", "IMD forecast by station", rows.filter((r) => r.issued_at === last).map((r) => ({ day: istWords(s(r.valid_from).slice(0, 10)), station: s(r.location_id), forecast: s(r.forecast_text) })), ["day", "station", "forecast"]), toPart("warnings", "IMD district warning by day", w.map((r) => ({ day: istWords(s(r.observed_at).slice(0, 10)), level: ["green (none)", "yellow", "orange", "red"][n(r.value)] ?? s(r.value), detail: s(r.detail) })), ["day", "level", "detail"])] };
    }
    case "pwd_works": {
      const rows = await caseRows("SELECT work_id, work_title, work_type, status, physical_progress_pct AS progress, spend_pct, overrun_pct, progress_gap_pct AS gap, sanctioned_amount_lakh AS sanctioned_lakh, expenditure_lakh AS spent_lakh, target_date, completion_date, office, taluk_code FROM pwd_works ORDER BY (status <> 'Completed') DESC, progress_gap_pct DESC LIMIT ?", [limit]);
      const t = await caseRows("SELECT status, COUNT(*) AS works, ROUND(SUM(sanctioned_amount_lakh), 1) AS sanctioned_lakh, ROUND(SUM(expenditure_lakh), 1) AS spent_lakh, SUM(target_date < date('now', '+330 minutes') AND completion_date IS NULL) AS late FROM pwd_works GROUP BY 1 ORDER BY 2 DESC");
      return { about: "PWD works", asOf: c.now, sources: ["PWD works register (project dataset)"], parts: [toPart("status", "By status", t, ["status", "works", "sanctioned_lakh", "spent_lakh", "late"], { of: "rank" }), toPart("works", "Works, the furthest behind first", rows.map((r, k) => ({ n: k + 1, ...r, target_date: istWords(r.target_date) })), ["n", "work_title", "work_type", "status", "progress", "spend_pct", "gap", "sanctioned_lakh", "spent_lakh", "target_date", "office"])] };
    }
    case "workspaces": {
      const list = await listWorkspaces(c.user.email);
      const rows: Rec[] = list.flatMap((g) => g.versions.map((v) => ({ id: n(v.id), name: g.name, version: n(v.version), saved: istWords(v.created_at), t: s(v.created_at), ago: agoWords(v.created_at, c.now), period: s((v.filters as Row)?.period), page: s((v.filters as Row)?.page), current: n(v.is_current) === 1 })));
      return { about: rows.length ? `${list.length} saved workspaces with ${rows.length} versions` : "No workspace has been saved yet", asOf: c.now, sources: ["saved workspaces"], parts: [toPart("workspaces", "Saved workspaces, newest version first", rows, ["id", "name", "version", "saved", "ago", "period", "page", "current"])], method: "Each save keeps a new version with the filters, the layout and a frozen copy of the briefing." };
    }
    case "decisions": { const rows = await caseRows("SELECT d.incident_id AS id, c.title, d.decision, d.escalate_to, d.note, d.decided_role, d.decided_at FROM collector_decisions d LEFT JOIN cases c ON c.id = d.incident_id ORDER BY d.decided_at DESC LIMIT ?", [limit]); return { about: `${rows.length} latest decisions of the Collector`, asOf: c.now, sources: ["the Collector's decision record"], parts: [toPart("decisions", "Decisions", rows.map((r) => ({ ...r, decided_at: istWords(r.decided_at) })), ["id", "title", "decision", "escalate_to", "note", "decided_at"], { of: "cases" })] }; }
    case "emails_sent": { const rows = await caseRows("SELECT o.email_id, o.incident_id, o.subject, o.mode, o.status, o.sent_at, o.created_at, o.error, (SELECT status FROM followups f WHERE f.email_id = o.email_id LIMIT 1) AS followup FROM outbound_emails o ORDER BY o.created_at DESC LIMIT ?", [limit]); return { about: `${rows.length} latest e-mails to departments`, asOf: c.now, sources: ["the console's e-mail record"], parts: [toPart("emails", "E-mails", rows.map((r) => ({ ...r, sent_at: r.sent_at ? istWords(r.sent_at) : null })), ["email_id", "incident_id", "subject", "mode", "status", "sent_at", "followup", "error"])] }; }
    case "officer_steps": { const rows = await caseRows("SELECT o.incident_id AS id, c.title, o.dept_code AS dept, o.step, o.note, o.at FROM officer_steps o LEFT JOIN cases c ON c.id = o.incident_id ORDER BY o.at DESC LIMIT ?", [limit]); return { about: "What officers did on their consoles", asOf: c.now, sources: ["officer console record"], parts: [toPart("steps", "Officer steps", rows.map((r) => ({ ...r, at: istWords(r.at) })), ["id", "title", "dept", "step", "note", "at"], { of: "cases" })] }; }
    case "petitions": {
      const rows = await caseRows("SELECT id, complaint_code, incident_id, status, area, ward_number AS ward, dept_code AS dept, category_code AS kind, urgent, petition_date, language, filed_at, due_at, created_at FROM petitions ORDER BY created_at DESC LIMIT ?", [limit]);
      const t = await caseRows("SELECT status, COUNT(*) AS petitions, SUM(urgent = 1) AS urgent FROM petitions GROUP BY 1 ORDER BY 2 DESC");
      return { about: `${t.reduce((a, r) => a + n(r.petitions), 0)} paper petitions (Manu) at the Collector's office`, asOf: c.now, sources: ["Manu desk (paper petitions read by the desk)"], limits: ["A petitioner's name, phone, address and own words are private and are not read out."], parts: [toPart("status", "By status", t, ["status", "petitions", "urgent"], { of: "rank" }), toPart("petitions", "Petitions, newest first", rows.map((r) => ({ ...r, created_at: istWords(r.created_at), filed_at: r.filed_at ? istWords(r.filed_at) : null, due_at: r.due_at ? istWords(r.due_at) : null })), ["id", "complaint_code", "incident_id", "status", "area", "ward", "dept", "kind", "urgent", "filed_at", "due_at"])] };
    }
    case "data_sources": {
      const list = (await listSources()) as unknown as Row[][] | Row[];
      const rows = (Array.isArray(list[0]) ? (list as Row[][])[0] : (list as Row[])).map((r) => ({ name: s(r.name), kind: s(r.kind), what: s(r.description), status: s(r.status), every_min: n(r.refresh_minutes), last_run: r.last_run_at ? istWords(r.last_run_at) : null, newest_record: r.newest ? istWords(r.newest) : null, records: n(r.rows ?? r.items_total), generated: r.generated ? "yes (generated test feed)" : "no" }));
      return { about: `${rows.length} data sources`, asOf: c.now, sources: ["Data sources page"], parts: [toPart("sources", "Data sources", rows, ["name", "kind", "what", "status", "every_min", "last_run", "newest_record", "records", "generated"])] };
    }
    case "feed_health": {
      const rows = await caseRows("SELECT source, kind, status, last_success_at, newest_record_at, minutes_since_success AS minutes, freshness_target_min AS target_min, rows, detail FROM source_health ORDER BY minutes_since_success DESC");
      const col = collectionStatus() as unknown as Row;
      return { about: `When each feed was last collected; last collection run ${istWords(col?.lastRun)}`, asOf: c.now, sources: ["feed health record"], parts: [toPart("feeds", "Feeds", rows.map((r) => ({ feed: feedLabel(s(r.source)), status: s(r.status), last_success: istWords(r.last_success_at), newest_record: istWords(r.newest_record_at), minutes_ago: n(r.minutes), should_be_within_min: n(r.target_min), records: n(r.rows) })), ["feed", "status", "last_success", "newest_record", "minutes_ago", "should_be_within_min", "records"])], method: "A feed is behind when its last success is more than its own target ago." };
    }
    case "map_layers": { const o = await overview(x.period, x.zone, x.dept, { cat: x.cat, taluk: x.taluk }); const L = o.map.layerCounts as Row; return { ...base, about: "What the Overview map shows", sources: src, limits, parts: [toPart("layers", "Map layers", [{ layer: "Severe", incidents: n(L.severe) }, { layer: "Citizen complaints", incidents: n(L.complaint) }, { layer: "Other open incidents", incidents: n(L.other) }, { layer: "Not placed on the map", incidents: n(o.map.unlocated) }, { layer: "All in the window", incidents: n(o.map.total) }], ["layer", "incidents"])] }; }
    case "rain_rehearsal": {
      const st = await within(10_500, rehearsalState({}));
      if (!st) return fromTool(await runTool("city_now", { topic: "all", zone: x.zone }), { about: "What heavy rain does to the city (Rain & flooding)", sources: ["the Rain & flooding rehearsal"] });
      const k = st.counts, bt = st.backtest, pct = (v: number) => Math.round(v * 1000) / 10;
      // rain amounts as the Rain view shows them: the CFM-DSS gauges' district average and wettest gauge (IMD's 4 stations only as a fallback)
      const gauged = await within(4_000, (async () => {
        const { pastRains } = await import("@/lib/rehearsal/engine");
        const { withRainData } = await import("@/lib/rehearsal/satflood");
        return new Map(withRainData(await pastRains()).rains.map((r) => [r.id, r.rain]));
      })()).catch(() => null);
      return { ...base, about: `Rain & flooding rehearsal: what heavy rain has done before, and what would flood if it came now (warning level now: ${st.trigger.level})`, when: "the heavy rains on record, and the state now", sources: ["the flood memory built from past complaints and rain days", "IMD rain and warnings", "CFM-DSS flood monitor", "CMWSSB reservoirs", "OpenStreetMap roads"],
        facts: [`${k.likely} streets are likely to flood (flooded in 3 or more heavy rains) and ${k.possible} possible (1 or 2).`, `${k.chokes} choke points, ${k.hospitalsCut} hospitals and ${k.fireCut} fire stations would have their ways cut; ${k.jobs} jobs are ready to send before the rain, ${k.done} done.`, ...st.trigger.reasons.map((r) => r.en), ...st.bulletins.slice(0, 3).map((y) => `${y.title} (${y.date})`),
          "It is a record of the past, not a forecast, and it has no setting for an amount of rain: any heavy rain (30 mm or more in a day) is taken. A single number of mm cannot be rehearsed."],
        parts: [
          toPart("rains", "The heavy rains on record, newest first", [...st.rains].sort((a, b) => b.start.localeCompare(a.start)).map((r, j) => { const g = gauged?.get(r.id); return { n: j + 1, from: istWords(r.start, false), to: istWords(r.end, false), district_average_mm: g?.mean ?? null, wettest_gauge_mm: g?.wettest?.mm ?? null, wettest_gauge: g?.wettest?.name ?? null, gauges_reporting: g?.gauges ?? null, imd_station_max_mm: r.maxMm, not_heavy_at_gauges: g?.dry ? "yes" : null, flooding_reports: r.reports, read_from: r.sources.join(", ") }; }) as unknown as Rec[], ["n", "from", "to", "district_average_mm", "wettest_gauge_mm", "wettest_gauge", "gauges_reporting", "imd_station_max_mm", "not_heavy_at_gauges", "flooding_reports", "read_from"], {}),
          toPart("accuracy", "How it did on past rains (only what was known two days before each rain was used)", bt.map((y) => ({ rain: `${istWords(y.event.start, false)} to ${istWords(y.event.end, false)}`, reports_checked: y.tested, on_marked_streets_pct: pct(y.share), on_the_same_length_of_random_streets_pct: pct(y.randomShare), times_better_than_chance: y.randomShare ? Math.round((y.share / y.randomShare) * 100) / 100 : null })) as unknown as Rec[], ["rain", "reports_checked", "on_marked_streets_pct", "on_the_same_length_of_random_streets_pct", "times_better_than_chance"], {}),
          toPart("streets", "Streets that flood most", [...st.streets].sort((a, b) => b.rains - a.rains || b.rainIncidents - a.rainIncidents).slice(0, 20).map((y, j) => ({ rank: j + 1, street: y.label, ward: y.ward, rains_flooded_in: y.rains, reports: y.rainIncidents, tier: y.tier === 2 ? "likely" : "possible" })) as unknown as Rec[], ["rank", "street", "ward", "rains_flooded_in", "reports", "tier"], { of: "rank", total: st.streets.length }),
          toPart("jobs", "Jobs before the next heavy rain", st.jobs.slice(0, 15).map((y, j) => ({ n: j + 1, job: y.en, department: y.deptName, place: y.place, why: y.why })) as unknown as Rec[], ["n", "job", "department", "place", "why"], { total: st.jobs.length }),
          toPart("departments", "Jobs by department", st.depts.map((d) => ({ department: d.name, jobs: d.jobs, done: d.done, late: d.late })) as unknown as Rec[], ["department", "jobs", "done", "late"], { of: "rank" }),
          toPart("lakes", "Lakes that matter for it", st.lakes.slice(0, 8) as unknown as Rec[], Object.keys(st.lakes[0] ?? {}).filter((y) => !/lat|lon|line|geom/i.test(y)).slice(0, 8), {})
        ].filter((y) => y.rows.length), limits,
        method: "A heavy rain is a pipeline rain day or IMD 30 mm or more; a flooding complaint within 300 m marks its street; a street that flooded in 3 or more rains is likely to flood again. The streets it marks have caught about 1.6 times what the same length of random streets catches." };
    }
  }
  throw new ToolProblem(`"${panel}" is not a panel: ${PANELS.join(", ")}. The news panels are in the news tool; what any tile means is in the guide tool.`);
}

// ---------------------------------------------------------------- briefing --

const TOPIC_DEFAULT = ["CRIME", "FLOOD", "DRAINAGE", "ROADS_TRAFFIC", "WASTE_SANITATION", "HEALTH", "PUBLIC_SAFETY", "STRUCTURES_LAND", "WORKS"];
/** a subject as it is said */
const topicName = (t: string, c: ToolCtx): string => { if (/infra/i.test(t)) return "public infrastructure"; try { return kindsOf(t, c.world).name; } catch { return t; } };
/** "public infrastructure" as the brief means it */
export const INFRA = ["ROAD_DAMAGE", "PUBLIC_WORKS", "CIVIC_FACILITIES", "BUILDING_SAFETY", "STREETLIGHT_ELECTRICAL", "DRAINAGE_SEWAGE", "DRAIN_WORKS_SAFETY", "WATER_SUPPLY", "SANITATION_TOILETS", "ENCROACHMENT", "TREES_PARKS"];

async function briefingRun(input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  const x = scopeOf(input as ScopeIn, c), w = x.w;
  const when = (input.when ?? { named: x.period === "daily" ? "today" : x.period === "weekly" ? "last_7_days" : x.period === "monthly" ? "last_30_days" : "last_90_days" }) as WhenIn;
  const topN = Math.min(Math.max(n(input.serious) || 3, 1), 10);
  const lim = { ...(x.zone ? { zones: [x.zone] } : {}), ...(x.dept ? { depts: [x.dept] } : {}), ...(x.taluk ? { taluks: [x.taluk] } : {}), ...(x.cat ? { kinds: [x.cat] } : {}) };
  const topics = ((input.topics as string[] | undefined) ?? []).filter(Boolean);
  const whole = !topics.length;
  const p = (k: string, o: ToolOut | null, pick: string, title: string, rows = 8): Part[] => { const q = o?.parts.find((y) => y.key === pick); return q && q.rows.length ? [{ ...q, key: k, title, rows: q.rows.slice(0, rows), total: q.total ?? q.rows.length }] : []; };
  const inc = (i: Record<string, unknown>) => incidentsTool.run({ when, ...lim, ...i }, c);
  const topicCodes = topics.map((t) => ({ name: topicName(t, c), kinds: /infra/i.test(t) ? INFRA : [t] }));
  const only = topics.length ? { kinds: [...new Set(topicCodes.flatMap((t) => t.kinds))] } : {};
  const [tot, byZone, byKind, byTaluk, serious, fol, news, differ, missing, st, al, rain, lakes, air, beds, traffic, rev, tasks, acts, perTopic] = await Promise.all([
    inc({ compare: true, ...only }), inc({ group_by: ["zone"], rank_by: "severe", limit: 5, ...only }), inc({ group_by: ["kind"], limit: 8, ...only }), inc({ group_by: ["taluk"], rank_by: "open", limit: 5, ...only }),
    inc({ list: true, sort: "severity", limit: topN, ...only }),
    within(6000, dashboardRun({ panel: "followups", when, zone: x.zone, dept: x.dept }, c)),
    within(5000, newsTool.run({ view: "latest", when, limit: 8 }, c)), whole ? within(5000, newsTool.run({ view: "differ", when }, c)) : null, whole ? within(4000, newsTool.run({ view: "missing_from_records", when: w.days <= 1 ? { named: "last_7_days" } : when, min_outlets: 1, limit: 5 }, c)) : null,
    whole ? within(6000, newsTool.run({ view: "stories", when, limit: 5 }, c)) : null, whole ? within(4000, alertsOut(c)) : null,
    whole ? within(3000, readingsTool.run({ metrics: ["rain"] }, c)) : null, whole ? within(3000, readingsTool.run({ metrics: ["lake_pct_full"] }, c)) : null, whole ? within(3000, readingsTool.run({ metrics: ["air"] }, c)) : null, whole ? within(3000, readingsTool.run({ metrics: ["beds"] }, c)) : null,
    whole ? within(6000, cityTool.run({ topic: "traffic", zone: x.zone }, c)) : null,
    whole ? within(5000, dashboardRun({ panel: "location_review", when }, c)) : null, within(5000, dashboardRun({ panel: "tasks", when, zone: x.zone, dept: x.dept }, c)),
    actionRows(w, lim, c), Promise.all(topicCodes.map(async (t) => ({ t, o: await inc({ kinds: t.kinds, list: true, limit: 3, sort: "severity" }), z: await inc({ kinds: t.kinds, group_by: ["zone"], limit: 3 }), k: t.kinds.length > 1 || !/^[A-Z_]+$/.test(t.name) ? await inc({ kinds: t.kinds, group_by: ["kind"], limit: 5 }) : null })))
  ]);
  const ids = (serious.parts.find((y) => y.key === "cases")?.rows ?? []).map((r) => String(r.id));
  const parts: Part[] = [
    ...p("figures", tot, "tot", topics.length > 1 ? `The figures of ${topicCodes.map((t) => t.name).join(", ")} TOGETHER` : "The figures", 10),
    ...(topics.length ? perTopic.flatMap(({ t, o, z, k }, j) => {
      const tr = (o.parts.find((y) => y.key === "tot")?.rows ?? []) as Rec[];
      const val = (key: string) => tr.find((r) => r.key === key);
      return [{ key: `topic${j + 1}`, title: `${t.name}`, of: "kpis" as const, cols: [{ key: "figure", label: "Figure" }, { key: "value", label: "Value", kind: "number" as const }, { key: "before", label: "Before", kind: "number" as const }], rows: ["reported", "severe", "open", "overdue", "resolved", "deaths", "injured"].map((y) => val(y)).filter((y): y is Rec => !!y) },
        ...(k ? p(`topic${j + 1}_kinds`, k, "by", `${t.name}: by kind`, 5) : []), ...p(`topic${j + 1}_zones`, z, "by", `${t.name}: most affected zones`, 3), ...p(`topic${j + 1}_cases`, o, "cases", `${t.name}: the most serious`, 3)];
    }) : []),
    ...p("serious", serious, "cases", `The ${topN} most serious incidents`, topN),
    { ...toPart("actions", "Action summary: what to do now", acts, ["n", "action", "owner", "due", "incident", "id", "why"], { of: null }) },
    ...p("zones", byZone, "by", "Zones with the most severe incidents", 5), ...p("kinds", byKind, "by", "What was reported most", 8), ...p("taluks", byTaluk, "by", "Taluks with the most unresolved incidents", 5),
    ...p("departments", fol, "departments", "Departments with the most to follow up", 6), ...p("news", news, "news", "In the newspapers", 8), ...p("differ", differ, "differ", "Reports that differ", 4), ...p("missing", missing, "cases", "In the news, in no department application", 5),
    ...p("stories", st, "stories", "Developing stories", 5), ...p("warnings", al, "warnings", "Warnings", 4), ...p("rain", rain, "readings", "Rain in 24 hours (mm)", 4), ...p("lakes", lakes, "readings", "Lakes and reservoirs (% full)", 6), ...p("air", air, "readings", "Air quality (AQI)", 4), ...p("beds", beds, "readings", "Hospital beds", 9),
    ...p("jams", traffic, "rows", "Live traffic", 5), ...p("review", rev, "unplaced", "Locations needing review", 5), ...p("tasks", tasks, "tasks", "Waiting for your check", 5)
  ];
  const tr = (tot.parts.find((y) => y.key === "tot")?.rows ?? []) as Rec[];
  const apps = await recordCounts(w, lim, c);
  if (apps.rows.length) parts.push(apps);
  return {
    about: `${whole ? "Full briefing" : `Summary of ${topicCodes.map((t) => t.name).join(", ")}`} for ${x.words}: ${tr[0]?.value ?? 0} incidents reported${topics.length > 1 ? " in all of these together" : ""}`, when: `${w.label}${w.prev ? `; compared with ${w.prev.label}` : ""}`, asOf: c.now, ids, parts,
    facts: [...(al ? [`Warnings: ${al.about}`, ...(al.facts ?? []).slice(0, 2)] : []), ...(beds?.facts ?? []), ...(traffic?.facts ?? []).slice(0, 5), ...(news ? [news.about] : []), ...(missing ? [missing.about] : []), ...(differ ? [differ.about] : []), ...(st ? [st.about] : []), ...(rev ? [rev.about] : []), ...(tasks ? [tasks.about] : [])],
    sources: [...new Set([tot, news, al, rain, lakes, air, beds, traffic].flatMap((o) => o?.sources ?? []))],
    method: `Every section is read by the same functions the dashboard's panels use, over the same window; serious incidents are ranked by severity, then open first, then priority.${whole ? " To give it: say covers, in this order and in flowing sentences, the figures and the change; the most serious incidents; what must be done now and by whom; what the newspapers report (name two or three stories and their papers) and any that differ or are missing from the records; warnings, rain, lakes and air; hospital beds; roads; what waits for the Collector (tasks, locations to review). points hold one line for each section that has something." : ""}`,
    limits: [...new Set([...(rain?.limits ?? []), ...(air?.limits ?? []), ...(beds?.limits ?? [])])].slice(0, 4)
  };
}

/** the next open step of the most urgent open incidents, then the closures to check and the news to bring into the records */
async function actionRows(w: Win, lim: Record<string, unknown>, c: ToolCtx): Promise<Rec[]> {
  const cond = ["c.is_open = 1", "c.reported_at >= ?", "c.reported_at <= ?"], params: unknown[] = [w.from, w.to];
  if (lim.zones) { cond.push("c.zone_no = ?"); params.push((lim.zones as number[])[0]); }
  if (lim.depts) { cond.push("c.dept_code = ?"); params.push((lim.depts as string[])[0]); }
  if (lim.taluks) { cond.push("c.taluk_code = ?"); params.push((lim.taluks as string[])[0]); }
  const rows = await caseRows(`SELECT c.id, c.title, c.severity, c.dept, c.place, c.attention, c.is_overdue, (SELECT a.text FROM actions a WHERE a.incident_id = c.id AND a.status NOT IN ('Done', 'Verified') ORDER BY a.status = 'In progress' DESC, a.due_at LIMIT 1) AS act,
      (SELECT a.owner FROM actions a WHERE a.incident_id = c.id AND a.status NOT IN ('Done', 'Verified') ORDER BY a.status = 'In progress' DESC, a.due_at LIMIT 1) AS owner, (SELECT a.due_at FROM actions a WHERE a.incident_id = c.id AND a.status NOT IN ('Done', 'Verified') ORDER BY a.status = 'In progress' DESC, a.due_at LIMIT 1) AS due
    FROM cases c WHERE ${cond.join(" AND ")} ORDER BY CASE c.severity WHEN 'Severe' THEN 0 WHEN 'High' THEN 1 ELSE 2 END, c.priority DESC LIMIT 6`, params);
  return rows.map((r, k) => ({ n: k + 1, action: s(r.act) || `Ask ${s(r.dept)} for a report on the ground`, owner: s(r.owner) || s(r.dept), due: r.due ? istWords(r.due) : null, incident: s(r.title).slice(0, 110), id: s(r.id), why: s(r.attention).slice(0, 140) || (n(r.is_overdue) ? "past its deadline" : s(r.severity)) }));
}

/** how many records of each application the window's incidents were built from */
async function recordCounts(w: Win, lim: Record<string, unknown>, c: ToolCtx): Promise<Part> {
  const cond = ["c.reported_at >= ?", "c.reported_at <= ?"], params: unknown[] = [w.from, w.to];
  if (lim.zones) { cond.push("c.zone_no = ?"); params.push((lim.zones as number[])[0]); }
  if (lim.depts) { cond.push("c.dept_code = ?"); params.push((lim.depts as string[])[0]); }
  const rows = await caseRows(`SELECT m.source, COUNT(*) AS records, COUNT(DISTINCT m.incident_id) AS incidents FROM incident_members m JOIN cases c ON c.id = m.incident_id WHERE ${cond.join(" AND ")} GROUP BY 1 ORDER BY 2 DESC`, params);
  return toPart("applications", "Source and application records behind it", rows.map((r) => ({ application: sourceWords(r.source), records: n(r.records), incidents: n(r.incidents) })), ["application", "records", "incidents"]);
}

// ---------------------------------------------------------------- evidence --

async function evidenceRun(input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  const all: Evidence[] = [...c.past, ...c.turn];
  const lastBrief = [...all].reverse().find((e) => e.tool === "briefing");
  // the briefing's sources asked for before any briefing: today's is read now, and said so
  const fresh: Evidence[] = s(input.of) === "briefing" && !lastBrief ? [{ id: "r0", tool: "briefing", input: {}, ms: 0, out: await briefingRun({}, c) }] : [];
  const feeds = s(input.of) === "briefing" ? await within(4000, dashboardRun({ panel: "feed_health" }, c)) : null;
  const pick = fresh.length ? fresh : s(input.of) === "briefing" && lastBrief ? [lastBrief] : c.past.length ? c.past.slice(-6) : c.turn;
  const ids = [...new Set(pick.flatMap((e) => [...(e.out.ids ?? []), ...e.out.parts.filter((p) => p.of === "cases").flatMap((p) => p.rows.map((r) => String(r.id ?? "")).filter((x) => /^INC-/.test(x)))]))].slice(0, 40);
  if (!pick.length) throw new ToolProblem("Nothing has been answered yet in this conversation, so there is no source to show. Say which figure, tile or briefing is meant, or run the briefing first.");
  const recs = ids.length ? await caseRows(`SELECT m.incident_id AS incident, m.source, m.source_record_id, m.reported_at, m.title FROM incident_members m WHERE m.incident_id IN (${ids.map(() => "?").join(",")}) ORDER BY m.incident_id, m.reported_at LIMIT 160`, ids) : [];
  const docs = ids.length ? await caseRows(`SELECT linked_incident_id AS incident, doc_id, publisher, title, title_en, lang, published_at, url FROM documents WHERE linked_incident_id IN (${ids.map(() => "?").join(",")}) ORDER BY published_at DESC LIMIT 40`, ids) : [];
  const news = pick.flatMap((e) => e.out.parts.filter((p) => p.of === "news").flatMap((p) => p.rows));
  return {
    about: `What the ${s(input.of) === "briefing" ? "briefing" : "last answer"} was built from`, asOf: c.now, sources: [...new Set(pick.flatMap((e) => e.out.sources))], ids,
    facts: pick.flatMap((e) => [`${e.tool}: ${e.out.about}${e.out.when ? ` (${e.out.when})` : ""}. Read from ${e.out.sources.join("; ")}.${e.out.method ? ` ${e.out.method}` : ""}${e.out.asOf ? ` Data as of ${istWords(e.out.asOf)}.` : ""}`]),
    parts: [
      toPart("sources", "Every source used", [...new Map(pick.flatMap((e) => e.out.sources.map((y) => [y, { source: y, used_for: e.out.about.slice(0, 120), window: e.out.when ?? null, as_of: e.out.asOf ? istWords(e.out.asOf) : null }]))).values()], ["source", "used_for", "window", "as_of"]),
      ...pick.flatMap((e) => e.out.parts.filter((p) => p.key === "applications" || p.key.endsWith(".applications"))).slice(0, 1).map((p) => ({ ...p, key: "applications" })),
      ...(feeds?.parts[0] ? [{ ...feeds.parts[0], key: "feeds", title: "Each feed, when it was last collected" }] : []),
      toPart("records", "Application records", recs.map((r) => ({ incident: s(r.incident), application: sourceWords(r.source), record: s(r.source_record_id), reported: istWords(r.reported_at), title: s(r.title).slice(0, 120) })), ["incident", "application", "record", "reported", "title"], { total: recs.length }),
      ...(docs.length || news.length ? [toPart("newspapers", "Newspaper reports", [...docs.map((r) => ({ id: s(r.doc_id), newspaper: s(r.publisher), headline: s((r.lang !== "en" && r.title_en) || r.title), published: istWords(r.published_at), incident: s(r.incident) })), ...news.slice(0, 20).map((r) => ({ id: s(r.id), newspaper: s(r.outlet), headline: s(r.headline), published: s(r.published), incident: s(r.incident) || null }))].filter((r, k, a) => a.findIndex((y) => y.id === r.id) === k).slice(0, 40), ["newspaper", "headline", "published", "incident", "id"], { of: "news" })] : [])
    ],
    limits: fresh.length ? ["No briefing had been given in this conversation: today's was read now, and these are its sources."] : [],
    method: "These are the records the figures were counted from, kept from the answer itself; nothing is looked up again."
  };
}

export const dashboardTool: BrainTool = {
  name: "dashboard",
  description: "One panel of the console exactly as it stands, for the window and filters the console shows or the ones given: tiles; severe (severity panel); zones; department (one department in full, the pop-up: give dept; its figures, last 7 days, 12 weeks, kinds, areas, contacts, cases, news, steps owed); departments or followups (department-wise follow-up report with the next step of each); taluks; tasks (My tasks); bell; alerts (warnings in force and why shown); location_review (Locations needing review); review_queue; hotspots; unusual_rises; category_trends (12 weeks, 6 months); where_to_concentrate; resolution_times; forecast (IMD forecast and warnings for the coming days); pwd_works; workspaces; decisions; emails_sent; petitions (Manu); data_sources; feed_health (when each feed was last collected); officer_steps; map_layers; rain_rehearsal.",
  doing: { en: "Reading the dashboard", ta: "டாஷ்போர்டைப் படிக்கிறேன்" },
  input: { type: "object", additionalProperties: false, required: ["panel"], properties: { panel: { type: "string", enum: [...PANELS] }, when: WHEN_SCHEMA, zone: { type: ["integer", "string"] }, dept: { type: "string" }, kind: { type: "string" }, taluk: { type: "string" }, limit: { type: "integer" } } },
  run: dashboardRun
};
export const briefingTool: BrainTool = {
  name: "briefing",
  description: "The whole picture in one call: today's (or any window's) district briefing, or a summary of an area, department, taluk or of named subjects. Returns the figures with the change, the most serious incidents, the action summary, zones, taluks, kinds, departments to follow up, newspapers, reports that differ, news missing from the records, developing stories, warnings, rain, lakes, air, hospital beds, live traffic, locations to review, tasks, and the application records behind it. For 'summary of today', 'brief me', 'what is happening', 'weekly summary of flooding, road accidents and public infrastructure' (topics: [\"FLOOD\", \"ROAD_ACCIDENT\", \"public infrastructure\"]). When the Collector asks for a summary or briefing of the day, cover every section that has something, not only the severe incidents.",
  doing: { en: "Putting the briefing together", ta: "சுருக்கத்தைத் தொகுக்கிறேன்" },
  input: { type: "object", additionalProperties: false, properties: { when: WHEN_SCHEMA, topics: { type: "array", items: { type: "string" }, description: "kind codes, group names or \"public infrastructure\"; left out: everything" }, serious: { type: "integer", description: "how many most serious incidents (default 3)" }, zone: { type: ["integer", "string"] }, dept: { type: "string" }, taluk: { type: "string" } } },
  run: briefingRun
};
export const evidenceTool: BrainTool = {
  name: "evidence",
  description: "Where the last answer, or the last briefing, came from: every source, the window, the rule, the application records (police, citizen, PWD, hospital record numbers) and newspaper reports behind it. For 'what is the source', 'how do you know', 'where did you get this', 'show every source and application record used to create this briefing'.",
  doing: { en: "Finding the sources", ta: "ஆதாரங்களைத் தேடுகிறேன்" },
  input: { type: "object", additionalProperties: false, properties: { of: { type: "string", enum: ["last_answer", "briefing"] } } },
  run: evidenceRun
};
export { TOPIC_DEFAULT };
