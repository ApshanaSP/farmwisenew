/**
 * 28 Nov: the dashboard tool. The owner: "When I asked Jarvis to create a comparative dashboard of two areas, with its incidents, news, etc.,
 * it didn't create a summary of those. It just gave a textual answer"; "When I ask to create a dashboard, the dashboard should be created with
 * the AI summary plus the visualization, and include all the things that were asked".
 *
 * It builds Jarvis's own dashboard screens with code (lib/thunai: the comparison dashboard, recipes/board.ts, and the summary dashboard,
 * recipes/summary.ts), over any window, with only the subject and the parts asked, and hands the model the dashboard's own figures, so the
 * summary it writes is checked against exactly what the screen shows (ground.ts). By voice the screen opens with that summary on top
 * (brainturn.ts); in the chat the figures are drawn as the answer's table and chart (render.ts cardOf).
 */
import { checkScreen } from "@/lib/thunai/agent";
import { BOARD_PARTS } from "@/lib/thunai/board";
import { serverHands } from "@/lib/thunai/data";
import { detectLang } from "@/lib/thunai/normalise";
import { periodIn } from "@/lib/thunai/quick";
import { buildScreen } from "@/lib/thunai/screens";
import type { BlockT, ScopeT, StageDocT } from "@/lib/thunai/stage";
import { daySpec, hoursSpec, istWall, turnWhen } from "@/lib/thunai/v18/when";
import { isTopic } from "@/lib/thunai/v18/topics";
import type { PeriodKey, PeriodSpec } from "@/lib/period/read";
import { whenFit } from "../fit";
import { toPart } from "../format";
import { deptOf, kindsOf, placeOf, sevOf, zoneOf } from "../names";
import { WHEN_SCHEMA, type WhenIn } from "../when";
import { ToolProblem, type BrainTool, type Part, type ToolCtx, type ToolOut } from "../types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const squash = (x: string) => x.toLowerCase().normalize("NFC").replace(/[^a-z0-9஀-௿]+/g, "");
const PERIODS: Record<string, PeriodKey> = { today: "daily", last_7_days: "weekly", last_30_days: "monthly", last_90_days: "quarterly" };

/** the window the model named, as the screens read it: one of the console's four, or a span of its own; null: read the Collector's words */
export function windowOfWhen(w: WhenIn | null, nowIst: string): { period?: PeriodKey; span?: PeriodSpec } | null {
  if (!w) return null;
  if (w.named && PERIODS[w.named]) return { period: PERIODS[w.named] };
  if (w.named === "yesterday") return { span: { kind: "day", back: 1 } };
  if (w.named === "last_24_hours") return { span: hoursSpec(24) };
  if (w.named === "last_week" || w.named === "last_month" || w.named === "last_quarter") return { span: { kind: "last", unit: w.named.slice(5) as "week" | "month" | "quarter" } };
  if (w.named === "this_week") return { period: "weekly" };
  if (w.named === "this_month") return { period: "monthly" };
  if (w.named === "this_quarter") return { period: "quarterly" };
  if (w.last_days) return w.last_days === 7 ? { period: "weekly" } : w.last_days === 30 ? { period: "monthly" } : w.last_days === 90 ? { period: "quarterly" } : { span: { kind: "hours", hours: w.last_days * 24, n: w.last_days, unit: "day" } };
  if (w.last_hours) return w.last_hours === 168 ? { period: "weekly" } : { span: hoursSpec(w.last_hours) };
  if (w.from || w.to) {
    const a = daySpec(s(w.from ?? w.to).slice(0, 10)), b = daySpec(s(w.to ?? w.from).slice(0, 10));
    if (a?.kind === "days" && b?.kind === "days") return { span: { kind: "days", from: a.from, to: b.to } };
  }
  void nowIst;
  return null;
}

/** a place as said: a zone by its name or number, else a locality the gazetteer knows, else the closest zone (or the tool says which it can be) */
function sideOf(v: string, c: ToolCtx): { zone: number } | { place: string } {
  const w = c.world;
  if (w.zones.some((z) => squash(z.name) === squash(v) || (z.ta && squash(z.ta) === squash(v))) || /^(?:zone\s*)?\d{1,2}$/i.test(v.trim())) return { zone: zoneOf(v, w) };
  const p = placeOf(v, w);
  if (p) return { place: p.name };
  return { zone: zoneOf(v, w) };
}

/** a dashboard's own figures, as tables the model reads and a chat card draws */
export function partsOfDoc(d: StageDocT): { parts: Part[]; facts: string[]; ids: string[] } {
  const parts: Part[] = [], facts: string[] = [], ids: string[] = [];
  const lang = d.lang === "ta" ? "ta" : "en";
  if (d.takeaway?.[lang]) facts.push(d.takeaway[lang]);
  for (const b of d.blocks as BlockT[]) {
    switch (b.kind) {
      case "Compare": {
        parts.push(toPart("sides", b.title, b.sides.map((x) => ({ side: x.label, ...x.values })), [{ key: "side", label: "Side" }, ...b.metrics.map((m) => ({ key: m.key, label: m.label, kind: "number" as const }))], { of: "rank" }));
        const kinds = b.sides.flatMap((x) => x.cats.map((k) => ({ side: x.label, kind: k.label, incidents: k.n })));
        if (kinds.length) parts.push(toPart("kinds", "By kind, each side", kinds, ["side", "kind", { key: "incidents", label: "incidents", kind: "number" }]));
        const depts = b.sides.flatMap((x) => (x.depts ?? []).map((k) => ({ side: x.label, department: k.label, incidents: k.n })));
        if (depts.length) parts.push(toPart("departments", "By department, each side", depts, ["side", "department", { key: "incidents", label: "incidents", kind: "number" }]));
        const from = b.sides.flatMap((x) => (x.from ?? []).map((k) => ({ side: x.label, record: k.label, incidents: k.n })));
        if (from.length) parts.push(toPart("reported_by", "Who reported them, each side", from, ["side", "record", { key: "incidents", label: "incidents", kind: "number" }]));
        for (const g of b.diffs) facts.push(`${g.label}: ${g.hi} ${g.ratio ? `${g.ratio} times` : `${g.gap} more than`} ${g.lo}.`);
        break;
      }
      case "Kpis": parts.push(toPart("figures", b.title, b.items.map((k) => ({ figure: k.label, value: k.value, before: k.prev })), ["figure", { key: "value", label: "value", kind: "number" }, { key: "before", label: "the window before", kind: "number" }], { of: "kpis" })); break;
      case "Brief": for (const p of b.points) facts.push(lang === "ta" ? p.ta || p.text : p.text); break;
      case "Chart": parts.push(toPart(b.id, b.title, b.labels.map((l, i) => ({ name: l, incidents: b.values[i] })), ["name", { key: "incidents", label: b.unit ?? "value", kind: "number" }], { of: "rank" })); break;
      case "Trend": parts.push(toPart(b.id, b.title, b.labels.map((l, i) => ({ day: l, incidents: b.values[i] })), ["day", { key: "incidents", label: "incidents", kind: "number" }], { of: "series" })); break;
      case "Ranking": parts.push(toPart(b.id, b.title, b.items.map((x) => ({ name: x.label, value: x.value, detail: x.sub })), ["name", { key: "value", label: b.unit ?? "value", kind: "number" }, "detail"], { of: "rank" })); break;
      case "CaseList": {
        parts.push(toPart(b.id.replace(/-/g, "_"), b.title, b.rows.map((r) => ({ id: r.id, title: r.title, severity: r.sev, status: r.status, place: r.place, zone: r.zoneName, dept: r.deptName, complaints: r.complaints, t: r.t })),
          ["id", "title", "severity", "status", "place", "zone", "dept", { key: "complaints", label: "complaints", kind: "number" }, { key: "t", label: "reported", kind: "time" }], { of: "cases", total: b.total }));
        ids.push(...b.rows.map((r) => r.id));
        break;
      }
      case "NewsReader": parts.push(toPart(b.id.replace(/-/g, "_"), b.title, b.items.map((x) => ({ id: x.id, headline: x.title, outlet: x.source, published: x.t, place: x.place, url: x.url, summary: x.summary })), ["id", "headline", "outlet", "published", "place", "url"], { of: "news", total: b.total })); break;
      case "Readings": parts.push(toPart(b.id, b.title, b.items.map((x) => ({ station: x.name, value: x.value, unit: b.unit, detail: x.detail, at: x.t })), ["station", { key: "value", label: b.unit, unit: b.unit, kind: "number" }, "detail", "at"])); break;
      case "Answer": if (b.facts.length) parts.push(toPart(b.id, b.title, b.facts.map((f) => ({ item: f.label, value: f.value, unit: f.unit })), ["item", { key: "value", label: "value", kind: "number" }, "unit"])); else if (b.text) facts.push(`${b.title}: ${b.text}`); break;
      case "Table": parts.push(toPart(b.id, b.title, b.rows.map((r) => Object.fromEntries(b.cols.map((c, i) => [c.key, r.cells[i]]))), b.cols.map((c) => ({ key: c.key, label: c.label })))); break;
      default: break;
    }
  }
  return { parts: parts.filter((p) => p.rows.length), facts: [...new Set(facts)].slice(0, 16), ids: [...new Set(ids)].slice(0, 40) };
}

async function boardRun(input: Row, c: ToolCtx): Promise<ToolOut> {
  const w = c.world;
  const mode = s(input.mode) === "summary" ? "summary" : "compare";
  const said = (Array.isArray(input.places) ? input.places : []).map(s).filter(Boolean).slice(0, 4);
  const sides = said.map((x) => sideOf(x, c));
  const zones = sides.flatMap((x) => ("zone" in x ? [x.zone] : []));
  const places = sides.flatMap((x) => ("place" in x ? [x.place] : []));
  const lock = c.user.lockDept;
  const depts = lock ? [] : (Array.isArray(input.departments) ? input.departments : []).map((x) => deptOf(x, w).code).slice(0, 4);
  if (mode === "compare" && zones.length + places.length < 2 && depts.length < 2) throw new ToolProblem("A comparison needs two to four places (zones or localities) or departments in places or departments. Ask the Collector which, if the conversation does not say.");
  if (mode === "summary" && !zones.length && !places.length && !depts.length && !input.kind && !lock) throw new ToolProblem("Name what the dashboard is of: a place, a department or a kind. The day's whole picture is the briefing tool.");
  const k = input.kind ? kindsOf(input.kind, w) : null;
  const topic = k && k.codes.length > 1 ? s(input.kind).toUpperCase().replace(/[\s-]+/g, "_") : null;
  const sev = input.severity ? sevOf(input.severity) : null;
  const parts = (Array.isArray(input.parts) ? input.parts : []).map(s).filter((p) => (BOARD_PARTS as readonly string[]).includes(p));
  // the window: the one the model named, else the Collector's own words (the rules' reading of "the last 3 days", "this week"), else the console's
  const now = istWall(Date.now());
  const named = windowOfWhen(whenFit(input.when), now);
  const text = c.text ?? "";
  const span = named?.span ?? (named?.period ? null : turnWhen(text, null, now));
  const period: PeriodKey = named?.period ?? (span ? "weekly" : periodIn(` ${text.toLowerCase()} `) ?? ((["daily", "weekly", "monthly", "quarterly"] as const).find((p) => p === c.console.period) ?? "weekly"));
  const raw: Row = {
    recipe: mode, zones, ...(places.length ? (mode === "compare" ? { places } : { place: places[0] }) : {}), ...(mode === "compare" && depts.length >= 2 ? { depts } : depts.length ? { dept: depts[0] } : {}),
    ...(topic && isTopic(topic) ? { family: topic } : k ? { cat: k.codes[0] } : {}), ...(sev === "Severe" || sev === "High" ? { sev } : {}),
    ...(["open", "overdue", "resolved"].includes(s(input.status)) ? { status: s(input.status) } : {}), ...(parts.length ? { parts } : {}), period, fresh: true
  };
  const sc = checkScreen(raw, w, null);
  if (!sc) throw new ToolProblem("That dashboard cannot be built: check the places and departments named.");
  const slots = { ...sc.slots, ...(span ? { span } : {}) };
  const hands = serverHands({ email: c.user.email, role: c.user.role, lockDept: lock }, c.signal);
  const base: ScopeT = { period, zone: null, dept: lock, cat: null, taluk: null, sev: null };
  const lang = c.lang ?? (detectLang(text) === "ta" ? "ta" : "en");
  const { doc } = await buildScreen(sc.recipe, slots, base, w, hands, text || mode, undefined, lang);
  const b0 = doc.blocks[0];
  if (doc.blocks.length === 1 && b0?.kind === "Note") throw new ToolProblem(b0.text);
  const got = partsOfDoc(doc);
  const when = doc.when?.[lang] ?? doc.title.split(" · ").at(-1) ?? null;
  return {
    about: `The ${mode === "compare" ? "comparison" : "summary"} dashboard "${doc.title}", built by code; its figures are below`, parts: got.parts, facts: got.facts, ids: got.ids,
    sources: doc.sources.length ? doc.sources : ["incidents (window)"], method: "Counted by the dashboard's own rules over the window's own bounds, against the window of the same length just before it.", limits: doc.notes,
    asOf: doc.asOf, when,
    // (by voice the dashboard itself opens with the answer; the chat draws its tables)
    screen: c.channel === "voice" ? { recipe: doc.recipe, slots: doc.slots, doc } : null
  };
}

export const boardTool: BrainTool = {
  name: "board",
  description: "Build a DASHBOARD: mode compare = two to four places (zones or localities) or departments side by side (\"compare A and B\", \"A vs B\", \"comparative dashboard of A and B\"); mode summary = the dashboard of one place, department or kind (\"dashboard of X\", \"summary of X\", \"overall summary of X\", \"weekly report for X\"). Over any window. Only the subject asked (severity Severe for severe incidents; a kind or group) and only the parts asked (news only -> parts [\"news\"]); nothing narrowed -> leave parts out for the overall set (incidents, complaints, reports, news, vegetable prices, air quality, rain). It returns the dashboard's own figures; by voice the dashboard opens with your answer.",
  doing: { en: "Building the dashboard", ta: "டாஷ்போர்டு தயாராகிறது" },
  input: { type: "object", additionalProperties: false, required: ["mode"], properties: {
    mode: { type: "string", enum: ["compare", "summary"] },
    places: { type: "array", items: { type: "string" }, description: "zones or localities as said (compare: 2 to 4; summary: 1, or none for a department or a kind)" },
    departments: { type: "array", items: { type: "string" }, description: "department codes or names (compare: 2 to 4; summary: 1)" },
    severity: { type: "string", enum: ["Severe", "High"] },
    kind: { type: "string", description: "a kind code or a group of kinds (CRIME, FLOOD...)" },
    status: { type: "string", enum: ["open", "overdue", "resolved"] },
    parts: { type: "array", items: { type: "string", enum: [...BOARD_PARTS] }, description: "only what was asked; leave out for the overall set" },
    when: WHEN_SCHEMA
  } },
  run: boardRun
};
