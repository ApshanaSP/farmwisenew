/**
 * The brain's answer drawn: a Stage document for Jarvis and an answer card for Ask District IQ, both from the results' own tables, so every figure
 * on the screen is one that was read. The model only says which table and which form.
 */
import crypto from "crypto";
import type { AnswerCard, ChartSpec, ChartType, Dataset, Field } from "@/lib/assistant/answer";
import { figuresIn } from "@/lib/thunai/numbergate";
import { checkStage, type BlockT, type CaseRowT, type DrillT, type StageDocT } from "@/lib/thunai/stage";
import type { World } from "@/lib/thunai/types";
import type { BrainOut } from "./loop";
import { istWords } from "./format";
import type { Cell, Col, Evidence, Lang, Part, Rec, Show } from "./types";

const s = (v: unknown) => (v == null ? "" : String(v));
const clip = (t: unknown, n: number) => { const x = s(t).replace(/\s+/g, " ").trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^-?\d+(?:\.\d+)?$/.test(v.trim()) ? Number(v) : null);
const L = (lang: Lang, en: string, ta: string) => (lang === "ta" ? ta : en);

/** a trend asked for is drawn as a trend, first, whatever else was named (the quarterly trend of categories was once a ranking, 26 Nov) */
export function trendFirst(show: Show[], parts: Map<string, { p: Part; e: Evidence }>, question: string): Show[] {
  if (!/\b(?:trends?|over time|month by month|week by week|monthly|weekly|day by day)\b|போக்கு/i.test(question)) return show;
  const key = [...parts.entries()].find(([, v]) => v.p.of === "series" && v.p.rows.length >= 2)?.[0];
  if (!key || show.some((s) => s.from === key && (s.as === "line" || s.as === "heat"))) return show;
  return [{ as: "line", from: key }, ...show.filter((s) => s.from !== key)];
}
const partsOf = (ev: Evidence[]): Map<string, { p: Part; e: Evidence }> => new Map(ev.flatMap((e) => e.out.parts.map((p) => [p.key, { p, e }] as const)));
/** the column that names a row, and the one that measures it */
function labelCol(p: Part, want?: string | null): Col | null {
  const has = (k?: string | null) => p.cols.find((c) => c.key === k) ?? null;
  return has(want) ?? p.cols.find((c) => !["n", "rank", "id"].includes(c.key) && p.rows.some((r) => typeof r[c.key] === "string" && r[c.key])) ?? null;
}
function valueCol(p: Part, want?: string | null): Col | null {
  const numeric = (c: Col) => !["n", "rank", "id", "ward", "zone_no"].includes(c.key) && p.rows.some((r) => num(r[c.key]) != null);
  const w = p.cols.find((c) => c.key === want);
  if (w && numeric(w)) return w;
  return p.cols.find((c) => ["value", "reported", "open", "incidents", "n"].includes(c.key) && numeric(c)) ?? p.cols.find(numeric) ?? null;
}
const shownCols = (p: Part, want?: string[] | null): Col[] => {
  const w = (want ?? []).map((k) => p.cols.find((c) => c.key === k || c.label.toLowerCase() === k.toLowerCase())).filter((c): c is Col => !!c);
  const base = w.length >= 2 ? w : p.cols.filter((c) => p.rows.some((r) => r[c.key] != null && r[c.key] !== ""));
  return base.filter((c) => !["lat", "lon", "url", "t"].includes(c.key)).slice(0, 10);
};
const text = (v: Cell | undefined): string | number | null => (v == null || v === "" ? null : typeof v === "boolean" ? (v ? "Yes" : "No") : typeof v === "number" ? Math.round(v * 100) / 100 : clip(v, 300));

const caseRow = (r: Rec): CaseRowT => ({
  id: s(r.id).slice(0, 80), title: clip(r.title ?? r.incident ?? r.what, 230), sev: s(r.severity) || null, status: s(r.status).slice(0, 40) || null, zone: num(r.zone_no), zoneName: s(r.zone).slice(0, 60) || null, place: clip(r.place ?? r.place_text, 118) || null, ward: num(r.ward), dept: s(r.dept_code).slice(0, 30) || null,
  deptName: clip(r.dept ?? r.department, 78) || null, complaints: num(r.complaints) ?? 0, t: s(r.t).slice(0, 30) || null, overdue: r.overdue === true, lat: num(r.lat), lon: num(r.lon), why: clip(r.why ?? r.suggested_action, 290) || null, cat: s(r.kind_code).slice(0, 60) || null
});

/** one drawing as a Stage block (null: nothing to draw) */
export function blockOf(sh: Show, p: Part, i: number, lang: Lang, w: World, e?: Evidence): BlockT | null {
  const id = `b${i}`, title = clip(sh.title || p.title, 150);
  const rows = p.rows.slice(0, sh.limit ?? 60);
  if (!rows.length) return null;
  // the last block's own records: a zone's or a department's cases in the same window (the old screens' drill, built by code)
  const drillFor = (r: Rec): DrillT | null => {
    const z = num(r.zone_key), k = s(r.kind_key), d = s(r.dept_key);
    const period = periodOf(e);
    if (z && z >= 1 && z <= 15) return { recipe: "cases", slots: { zones: [z], ...(period ? { period } : {}), fresh: true }, label: `${s(r.zone)}` };
    if (/^[A-Z_]{3,40}$/.test(k)) return { recipe: "cases", slots: { cat: k, ...(period ? { period } : {}), fresh: true }, label: s(r.kind) };
    if (/^[A-Z0-9-]{2,20}$/.test(d)) return { recipe: "cases", slots: { dept: d, ...(period ? { period } : {}), fresh: true }, label: s(r.dept) };
    return null;
  };
  switch (sh.as) {
    case "kpis": {
      const lc = labelCol(p, sh.label ?? "figure"), vc = valueCol(p, sh.value ?? "value");
      if (!lc || !vc) return null;
      const items = rows.map((r) => { const v = num(r[vc.key]), b = num(r.before); return v == null ? null : { key: clip(s(r.key) || s(r[lc.key]), 38), label: clip(r[lc.key], 78), value: v, unit: vc.unit ?? null, prev: b, delta: b == null ? null : v - b, tone: "neutral" as const, spark: [], pct: b ? Math.round(((v - b) / b) * 100) : null }; }).filter((x): x is NonNullable<typeof x> => !!x).slice(0, 8);
      return items.length ? { kind: "Kpis", id, title, items } : null;
    }
    case "cases": {
      const cs = rows.filter((r) => /^INC-/.test(s(r.id))).map(caseRow);
      if (cs.length && cs.length >= rows.length * 0.6) return { kind: "CaseList", id, title, source: "search", sev: null, total: p.total ?? cs.length, rows: cs.slice(0, 60) };
      return tableBlock(sh, p, id, title);
    }
    case "news": {
      const items = rows.filter((r) => s(r.headline) || s(r.title)).map((r) => ({ id: s(r.id).slice(0, 118) || `n${Math.random().toString(36).slice(2, 8)}`, title: clip(r.headline ?? r.title, 290), source: clip(r.outlet ?? r.newspapers ?? r.newspaper, 78) || null, t: /^\d{4}-/.test(s(r.t)) ? s(r.t).slice(0, 30) : null, place: clip(r.place, 118) || null,
        incidentId: /^INC-/.test(s(r.incident)) ? s(r.incident) : null, url: /^https?:\/\//.test(s(r.url)) ? s(r.url).slice(0, 1900) : null, summary: clip([s(r.published) ? `${L(lang, "Reported", "வெளியான நேரம்")}: ${s(r.published)}` : "", s(r.summary)].filter(Boolean).join(". "), 580) || null }));
      return items.length ? { kind: "NewsReader", id, title, total: p.total ?? items.length, items: items.slice(0, 30) } : tableBlock(sh, p, id, title);
    }
    case "timeline": {
      const items = rows.map((r) => ({ t: clip(r.time ?? r.published ?? r.reported ?? r.at ?? "", 40), text: clip(r.what ?? r.headline ?? r.title ?? r.detail, 290), by: clip(r.newspapers ?? r.by ?? r.outlet, 110) || null, stage: clip(r.stage ?? r.kind, 60) || null })).filter((x) => x.text);
      return items.length ? { kind: "Timeline", id, title, items: items.slice(0, 40) } : null;
    }
    case "bars": case "donut": {
      const lc = labelCol(p, sh.label), vc = valueCol(p, sh.value);
      if (!lc || !vc) return tableBlock(sh, p, id, title);
      const xs = rows.map((r) => ({ label: clip(r[lc.key], 78), v: num(r[vc.key]), r })).filter((x): x is { label: string; v: number; r: Rec } => x.v != null && !!x.label).slice(0, sh.as === "donut" ? 8 : 25);
      if (!xs.length) return null;
      if (sh.as === "donut") return { kind: "Chart", id, title, chart: "donut", unit: vc.unit ?? null, labels: xs.map((x) => x.label), values: xs.map((x) => x.v) };
      const order = xs.length > 1 && xs[0].v < xs.at(-1)!.v ? "bottom" : "top";
      return { kind: "Ranking", id, title, unit: clip(vc.unit ?? vc.label.toLowerCase(), 28), method: clip(`${vc.label}${e?.out.when ? `, ${e.out.when}` : ""}`, 230), order, items: xs.map((x, k) => ({ key: clip(s(x.r[`${lc.key}_key`]) || x.label, 58), label: clip(x.label, 118), value: x.v, rank: k + 1, sub: subOf(x.r, vc.key, p), zone: num(x.r.zone_key) ?? num(x.r.zone_no), lat: num(x.r.lat), lon: num(x.r.lon), action: "none" as const, drill: drillFor(x.r) })) };
    }
    case "line": {
      const lc = labelCol(p, sh.label), vc = valueCol(p, sh.value);
      if (!lc || !vc) return tableBlock(sh, p, id, title);
      const sc = sh.series ? p.cols.find((c) => c.key === sh.series) : p.cols.find((c) => c.key !== lc.key && ["kind", "zone", "dept", "severity", "status", "reading", "family"].includes(c.key) && new Set(p.rows.map((r) => s(r[c.key]))).size > 1);
      if (sc) return linesBlock(p, lc, sc, vc, id, title);
      const xs = p.rows.map((r) => ({ l: clip(r[lc.key], 38), v: num(r[vc.key]) })).filter((x): x is { l: string; v: number } => x.v != null);
      return xs.length ? { kind: "Trend", id, title, unit: clip(vc.unit ?? vc.label.toLowerCase(), 28) || "incidents", labels: xs.slice(-120).map((x) => x.l), values: xs.slice(-120).map((x) => x.v), marks: [], normal: null } : null;
    }
    case "heat": {
      const lc = labelCol(p, sh.label), vc = valueCol(p, sh.value);
      const sc = (sh.series ? p.cols.find((c) => c.key === sh.series) : null) ?? p.cols.find((c) => c.key !== lc?.key && p.rows.some((r) => typeof r[c.key] === "string"));
      if (!lc || !vc || !sc) return tableBlock(sh, p, id, title);
      const tot = new Map<string, number>(), cols = [...new Set(p.rows.map((r) => s(r[sc.key])))].slice(0, 10);
      for (const r of p.rows) tot.set(s(r[lc.key]), (tot.get(s(r[lc.key])) ?? 0) + (num(r[vc.key]) ?? 0));
      const names = [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k);
      return { kind: "Heat", id, title, rows: names.map((x) => clip(x, 78)), cols: cols.map((x) => clip(x, 78)), cells: names.map((n) => cols.map((c) => p.rows.filter((r) => s(r[lc.key]) === n && s(r[sc.key]) === c).reduce((a, r) => a + (num(r[vc.key]) ?? 0), 0))) };
    }
    case "map": {
      const pts = rows.filter((r) => num(r.lat) != null && num(r.lon) != null).map((r, k) => ({ n: k + 1, id: clip(s(r.id) || `p${k}`, 118), lat: num(r.lat)!, lon: num(r.lon)!, label: clip(r.title ?? r.name ?? r.place ?? r.area, 158), sev: s(r.severity) || null, value: num(r.value ?? r.count), hot: r.severity === "Severe" }));
      return pts.length ? { kind: "MapView", id, title, rule: null, shade: null, points: pts.slice(0, 200), outline: [] } : tableBlock(sh, p, id, title);
    }
    default: return tableBlock(sh, p, id, title);
  }
  void w;
}
function periodOf(e?: Evidence): "daily" | "weekly" | "monthly" | "quarterly" | null {
  const n = s((e?.input.when as Record<string, unknown> | undefined)?.named);
  return n === "today" ? "daily" : n === "last_7_days" ? "weekly" : n === "last_30_days" ? "monthly" : n === "last_90_days" ? "quarterly" : null;
}
function subOf(r: Rec, value: string, p: Part): string | null {
  const bits = p.cols.filter((c) => c.key !== value && ["open", "severe", "overdue", "before", "change_pct", "deaths", "zone", "at", "detail"].includes(c.key) && r[c.key] != null && r[c.key] !== "" && r[c.key] !== 0).slice(0, 3)
    .map((c) => (c.key === "change_pct" ? `${Number(r.change_pct) > 0 ? "+" : ""}${r.change_pct}%` : c.key === "zone" || c.key === "at" ? s(r[c.key]) : `${s(r[c.key])} ${c.label.toLowerCase().replace(/^reported, /, "in ")}`));
  return bits.length ? clip(bits.join(" · "), 155) : null;
}
function tableBlock(sh: Show, p: Part, id: string, title: string): BlockT | null {
  const cols = shownCols(p, sh.columns);
  if (!cols.length) return null;
  return { kind: "Table", id, title, cols: cols.map((c) => ({ key: c.key.slice(0, 40), label: clip(c.label.charAt(0).toUpperCase() + c.label.slice(1), 60), unit: c.unit ? clip(c.unit, 20) : null, num: p.rows.some((r) => typeof r[c.key] === "number") })), total: p.total ?? p.rows.length,
    rows: p.rows.slice(0, sh.limit ?? 60).map((r) => ({ id: /^INC-/.test(s(r.id)) ? s(r.id) : /^INC-/.test(s(r.incident)) ? s(r.incident) : null, url: /^https?:\/\//.test(s(r.url)) ? s(r.url).slice(0, 1900) : null, cells: cols.map((c) => text(r[c.key])) })) };
}
function linesBlock(p: Part, lc: Col, sc: Col, vc: Col, id: string, title: string): BlockT | null {
  const labels = [...new Set(p.rows.map((r) => s(r[lc.key])))];
  const tot = new Map<string, number>();
  for (const r of p.rows) tot.set(s(r[sc.key]), (tot.get(s(r[sc.key])) ?? 0) + (num(r[vc.key]) ?? 0));
  const names = [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
  if (!labels.length || !names.length) return null;
  return { kind: "Lines", id, title, unit: vc.unit ?? vc.label.toLowerCase(), labels: labels.slice(0, 60).map((x) => clip(x, 38)), series: names.map((n) => ({ name: clip(n, 60), values: labels.slice(0, 60).map((l) => p.rows.filter((r) => s(r[lc.key]) === l && s(r[sc.key]) === n).reduce((a, r) => a + (num(r[vc.key]) ?? 0), 0)) })) };
}

/** what is drawn when the model named nothing but records were read: the first list, ranking or timeline of the last result */
export function defaultShow(ev: Evidence[], channel: "voice" | "chat"): Show[] {
  const last = [...ev].reverse().find((e) => e.out.parts.some((p) => p.rows.length));
  if (!last) return [];
  const p = last.out.parts.find((x) => x.of && x.of !== "kpis" && x.rows.length) ?? last.out.parts.find((x) => x.rows.length)!;
  const as: Show["as"] = p.of === "cases" ? "cases" : p.of === "news" ? "news" : p.of === "timeline" ? "timeline" : p.of === "series" ? "line" : p.of === "kpis" ? "kpis" : p.of === "rank" ? (p.cols.some((c) => c.kind === "number") ? "bars" : "table") : "table";
  void channel;
  return [{ as, from: p.key }];
}

export const figs = (t: string): number[] => [...new Set(figuresIn(t).map((f) => f.value).filter(Number.isFinite))];

/** tools whose last result is drawn when the answer named nothing to draw */
const WORTH_SEEING = new Set(["contacts", "prices", "readings", "studio", "facilities", "city"]);
const PICTURE = new Set(["Ranking", "Chart", "Trend", "Heat", "Kpis", "MapView"]);

/** the Stage document of an answer; null when there is nothing to put on a screen (a one-line answer is spoken only) */
export function stageOf(o: BrainOut, question: string, w: World, ctx: { period: "daily" | "weekly" | "monthly" | "quarterly"; zone: number | null; dept: string | null; cat: string | null; taluk: string | null }): StageDocT | null {
  const a = o.answer, lang = a.lang;
  if (a.kind !== "answer") return null;
  const parts = partsOf(o.evidence);
  // (nothing named to draw: the list a person would want to see beside the words, an officer's numbers, the prices, the readings)
  const asked = trendFirst(a.show, parts, question);
  const shows = asked.length ? asked : o.evidence.length && (a.points.length === 0 || WORTH_SEEING.has(o.evidence.at(-1)!.tool)) ? defaultShow(o.evidence, "voice").map((s) => ({ ...s, limit: 12 })) : [];
  const blocks: BlockT[] = [];
  blocks.push({ kind: "Answer", id: "say", title: L(lang, "In short", "சுருக்கமாக"), text: clip(a.say, 2390), facts: [] });
  const drawn: BlockT[] = [];
  shows.forEach((sh, i) => { const hit = parts.get(sh.from); const b = hit ? blockOf(sh, hit.p, i, lang, w, hit.e) : null; if (b && drawn.length < 13) drawn.push(b); });
  // the words and the first picture side by side (Stage.tsx brainSpans), the points under them, then the rest
  if (drawn[0] && PICTURE.has(drawn[0].kind)) blocks.push(drawn.shift()!);
  if (a.points.length) blocks.push({ kind: "Brief", id: "points", title: L(lang, "Key points", "முக்கியக் குறிப்புகள்"), points: a.points.slice(0, 12).map((t) => ({ text: clip(t, 395), ...(lang === "ta" ? { ta: clip(t, 395) } : {}), incidentId: null })) });
  blocks.push(...drawn.slice(0, 14 - blocks.length));
  const used = [...new Set(shows.map((sh) => parts.get(sh.from)?.e).filter((e): e is Evidence => !!e))];
  const from = used.length ? used : o.evidence;
  const when = from.map((e) => e.out.when).find(Boolean) ?? null;
  const say = clip(a.say, lang === "ta" ? 2390 : 1590);
  const title = clip(a.title || question, 190);
  const limits = [...new Set(from.flatMap((e) => e.out.limits ?? []))].filter((x) => !/^No time was given/.test(x)).slice(0, 3).map((x) => clip(x, 295));
  const doc: StageDocT = {
    v: 1, id: `b-${crypto.randomUUID().slice(0, 12)}`, recipe: "answer", title, takeaway: null, say: { en: clip(a.say, 1590), ta: clip(a.say, 2390) }, blocks,
    scope: { period: ctx.period, zone: ctx.zone, dept: ctx.dept, cat: ctx.cat, taluk: ctx.taluk, sev: null }, when: when ? { en: clip(when, 155), ta: clip(when, 195), from: null, to: null } : null,
    slots: { q: clip(question, 200) }, sources: [...new Set(from.flatMap((e) => e.out.sources))].map((x) => clip(x, 78)).slice(0, 10), asOf: from.map((e) => e.out.asOf).filter(Boolean).sort().at(-1)?.slice(0, 40) ?? null, notes: limits, lang,
    titles: { en: title, ta: title }, voice: { by: "aide7", model: o.model, figures: [...new Set([...figs(say), ...figs(a.say), ...a.points.flatMap(figs)])].slice(0, 200) }
  };
  const ok = checkStage(doc);
  if (ok.ok) return ok.doc;
  console.warn(`[brain] screen not drawn: ${ok.why}`);
  // a drawing that does not fit is left out; the answer itself stays
  const plain = checkStage({ ...doc, blocks: blocks.filter((b) => b.kind === "Answer" || b.kind === "Brief") });
  return plain.ok ? plain.doc : null;
}

// --------------------------------------------------------------- chat card --

const fieldsOf = (p: Part, cols: Col[]): Field[] => cols.map((c) => ({ key: c.key, label: c.label.charAt(0).toUpperCase() + c.label.slice(1), kind: c.key === "id" ? "id" : p.rows.some((r) => typeof r[c.key] === "number") && !["n", "rank"].includes(c.key) ? "value" : ["day", "week", "month", "hour", "time"].includes(c.key) ? "time" : "category", unit: c.unit ?? null, format: p.rows.some((r) => typeof r[c.key] === "number" && !Number.isInteger(r[c.key])) ? "decimal1" : "integer" }));
const CHART: Partial<Record<Show["as"], ChartType>> = { bars: "horizontal_bar", line: "line", donut: "donut", heat: "heatmap", map: "map_points" };

export function cardOf(o: BrainOut, base: AnswerCard, w: World): AnswerCard {
  const a = o.answer, lang = a.lang;
  const parts = partsOf(o.evidence);
  const asked = trendFirst(a.show, parts, o.question ?? "");
  const shows = asked.length ? asked : o.evidence.length && !a.points.length && a.kind === "answer" ? defaultShow(o.evidence, "chat") : [];
  const datasets: Dataset[] = [];
  let chart: ChartSpec | null = null, table: string | null = null;
  const incidents: string[] = [];
  const md: string[] = [];
  const kpis: AnswerCard["kpis"] = [];
  for (const sh of shows) {
    const hit = parts.get(sh.from);
    if (!hit) continue;
    const { p } = hit;
    if (sh.as === "kpis") { const lc = labelCol(p, sh.label ?? "figure"), vc = valueCol(p, sh.value ?? "value"); if (lc && vc) for (const r of p.rows.slice(0, 8)) { const v = num(r[vc.key]); if (v != null) kpis.push({ label: clip(r[lc.key], 60), value: v, prev: num(r.before), unit: vc.unit ?? null }); } continue; }
    if (sh.as === "timeline" || sh.as === "news" || sh.as === "cases" || sh.as === "table") { md.push(mdTable(sh, p, lang)); for (const r of p.rows) for (const k of [r.id, r.incident]) if (/^INC-/.test(s(k))) incidents.push(s(k)); }
    const cols = shownCols(p, sh.columns);
    const id = sh.from.replace(/\W/g, "_");
    if (!datasets.some((d) => d.id === id)) datasets.push({ id, title: sh.title || p.title, fields: fieldsOf(p, [...cols, ...(p.rows.some((r) => num(r.lat) != null) ? [{ key: "lat", label: "lat" }, { key: "lon", label: "lon" }] : [])]).map((f) => (f.key === "lat" || f.key === "lon" ? { ...f, kind: "geo" as const } : f)), rows: p.rows.slice(0, sh.limit ?? 120) as Dataset["rows"], total: p.total, idField: p.cols.some((c) => c.key === "id") ? "id" : null });
    const ct = CHART[sh.as];
    if (ct && !chart) {
      const lc = labelCol(p, sh.label), vc = valueCol(p, sh.value);
      const sc = sh.series ? p.cols.find((c) => c.key === sh.series) ?? null : null;
      if (lc && vc) chart = { type: ct, dataset: id, title: sh.title || p.title, subtitle: null, x: sh.as === "line" && sc ? lc.key : lc.key, y: [vc.key], series: sc?.key ?? null, compare: false, normalBand: false, threshold: null, highlight: "none", callout: false, sort: sh.as === "line" ? "none" : "desc", topN: 12, labels: [] };
    } else if (!table && (sh.as === "table" || sh.as === "cases")) table = id;
  }
  // the chart's dataset must hold the fields it draws
  if (chart) { const d = datasets.find((x) => x.id === chart!.dataset); const keys = new Set(d?.fields.map((f) => f.key)); if (!d || !keys.has(chart.y[0]) || !keys.has(chart.x ?? "")) { const hit = [...parts.values()].find((x) => x.p.key.replace(/\W/g, "_") === chart!.dataset); if (d && hit) d.fields = fieldsOf(hit.p, hit.p.cols.filter((c) => !["lat", "lon", "url", "t"].includes(c.key))); } }
  const answerMarkdown = [a.say, a.points.length ? a.points.map((t) => `- ${t}`).join("\n") : "", ...md].filter(Boolean).join("\n\n");
  const ev = o.evidence;
  return {
    ...base, kind: a.kind === "clarify" ? "clarify" : a.kind === "refuse" ? "refusal" : "answer", language: lang, display: chart ? (chart.type.startsWith("map") ? "map" : "chart") : kpis.length ? "kpi" : "text", headline: clip(a.kind === "answer" ? a.title || firstOf(a.say) : firstOf(a.say), 160), answerMarkdown: a.kind === "answer" ? answerMarkdown : a.say, voiceSummary: clip(a.say, 900), voiceLang: lang === "ta" ? "ta-IN" : "en-IN",
    chart, visualAsked: !!chart || kpis.length > 0, datasets, kpis: kpis.slice(0, 8), table: null, chips: a.kind === "clarify" ? a.options.map((x) => x.request) : [], scopeLine: ev.map((e) => e.out.when).filter(Boolean)[0] ?? "", asOf: ev.map((e) => e.out.asOf).filter(Boolean).sort().at(-1) ?? base.asOf,
    caveats: [...new Set(ev.flatMap((e) => e.out.limits ?? []))].filter((x) => !/^No time was given/.test(x)).slice(0, 4),
    consoleActions: [...new Set(incidents)].slice(0, 3).map((x) => ({ action: "open_incident" as const, label: "", id: x })),
    sources: { ...base.sources, tools: ev.map((e) => ({ name: e.tool, args: e.input, ms: e.ms })), refs: [...new Set(ev.flatMap((e) => e.out.sources))].map((x) => ({ kind: "source", name: x })), rows: ev.reduce((n, e) => n + e.out.parts.reduce((m, p) => m + p.rows.length, 0), 0), incidentIds: [...new Set(ev.flatMap((e) => e.out.ids ?? []))].slice(0, 40),
      models: [{ step: "brain", provider: "anthropic", model: o.model, ms: o.ms, tokens: o.tokens.input + o.tokens.output, inTokens: o.tokens.input, outTokens: o.tokens.output }], verifier: { checked: figs(answerMarkdown).length, unmatched: [], regenerated: o.repaired.length > 0, template: false }, assumptions: [], limits: ev.map((e) => e.out.method ?? "").filter(Boolean).slice(0, 4) }
  };
  void w;
}
const firstOf = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-Z\p{Lo}"])/u)[0] ?? t;
function mdTable(sh: Show, p: Part, lang: Lang): string {
  const rows = p.rows.slice(0, sh.limit ?? (sh.as === "timeline" ? 25 : 15));
  if (!rows.length) return "";
  const head = `**${sh.title || p.title}**${p.total != null && p.total > rows.length ? ` (${rows.length} ${L(lang, "of", "/")} ${p.total})` : ""}`;
  if (sh.as === "timeline") return [head, ...rows.map((r) => `- **${s(r.time ?? r.published ?? r.reported)}**: ${clip(r.what ?? r.headline, 220)}${s(r.newspapers ?? r.by) ? ` (${s(r.newspapers ?? r.by)})` : ""}`)].join("\n");
  if (sh.as === "news") return [head, ...rows.map((r, k) => `${k + 1}. ${clip(r.headline ?? r.title, 200)} (${[s(r.outlet ?? r.newspaper ?? r.newspapers), s(r.published)].filter(Boolean).join(", ")})`)].join("\n");
  if (sh.as === "cases") return [head, ...rows.map((r, k) => `${k + 1}. **${clip(r.title, 160)}**: ${[s(r.severity), s(r.status), s(r.place) || s(r.zone), s(r.dept ?? r.department), s(r.reported_at ?? r.first_reported ?? r.reported), s(r.newspapers) ? `${s(r.outlets)} newspapers: ${s(r.newspapers)}` : ""].filter(Boolean).join(" · ")}`)].join("\n");
  const cols = shownCols(p, sh.columns).filter((c) => c.key !== "id").slice(0, 7);
  const esc = (v: unknown) => clip(text(v as Cell) ?? "-", 120).replace(/\|/g, "/");
  return [head, "", `| ${cols.map((c) => esc(c.label)).join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${cols.map((c) => esc(r[c.key])).join(" | ")} |`)].join("\n");
}
export { istWords };
