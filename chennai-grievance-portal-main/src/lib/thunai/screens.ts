/**
 * Thunai's screen builders: a recipe and its slots (chosen by the model, checked by agent.ts) become a Stage document
 * (stage.ts). Code fetches the data with Ask District IQ's tools and the console's own views (data.ts `Hands`, injected so
 * this is unit-tested with fakes), computes the insights with explicit rules (insight.ts), and writes the takeaway and the
 * spoken line in English and Tamil from templates. No figure here comes from a model.
 */
import type { ToolResult } from "@/lib/assistant/types";
import { aggregate, change, largestGaps, median, peak, rank, round, share, spoken, unusualPoints, vsMedian } from "./insight";
import type { BlockT, Bilingual, CaseRowT, PointT, Recipe, ScopeT, StageDocT } from "./stage";
import type { PeriodKey, Sev, World } from "./types";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const METRICS = ["rain", "aqi", "lakes", "temp", "humidity"] as const;
export type Metric = (typeof METRICS)[number];
export const MEASURES = ["rain", "aqi", "lakes", "temp", "zone_severe", "zone_open", "zone_incidents", "zone_complaints", "zone_attention", "taluk_open",
  "dept_open", "dept_backlog", "dept_resolution", "dept_overdue", "hotspots"] as const;
export type Measure = (typeof MEASURES)[number];

export interface Slots {
  period: PeriodKey | null;
  zones: number[];
  dept: string | null;
  depts: string[];
  cat: string | null;
  taluk: string | null;
  sev: Sev | null;
  status: "open" | "overdue" | null;
  /** words to search for (news, cases), or the map question for "nearby" */
  q: string | null;
  metric: Metric | null;
  measure: Measure | null;
  by: "dept" | "zone" | null;
  order: "top" | "bottom";
  n: number | null;
  /** an incident id (case) */
  id: string | null;
  /** a station or reservoir name (readings) */
  name: string | null;
  what: "severe" | "hotspots" | "cases" | null;
  sort: "priority" | "complaints" | "time" | null;
}

export const emptySlots = (): Slots => ({ period: null, zones: [], dept: null, depts: [], cat: null, taluk: null, sev: null, status: null, q: null, metric: null,
  measure: null, by: null, order: "top", n: null, id: null, name: null, what: null, sort: null });

export interface Hands {
  tool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  severe: (s: ScopeT) => Promise<{ rows: Row[]; counts: Record<string, number>; asOf: string }>;
  news: (s: ScopeT) => Promise<{ rows: Row[]; total: number; asOf: string }>;
  map: (q: string) => Promise<Row>;
}

export interface Built { doc: StageDocT; runs: string[] }

// ------------------------------------------------------------------ words --

const PERIOD_EN: Record<PeriodKey, string> = { daily: "today", weekly: "this week", monthly: "the last 30 days", quarterly: "the last 90 days" };
const PERIOD_TA: Record<PeriodKey, string> = { daily: "இன்று", weekly: "இந்த வாரம்", monthly: "கடந்த 30 நாட்களில்", quarterly: "கடந்த 90 நாட்களில்" };
const SEV_TA: Record<string, string> = { Severe: "கடுமையான", High: "அதிக முக்கியத்துவ", Medium: "நடுத்தர", Low: "குறைந்த" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-28 07:41:25" (IST) as "28 Oct, 7:41 AM"; dates alone as "28 Oct". */
export function when(t: unknown): string | null {
  const m = String(t ?? "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const day = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
  if (m[4] == null) return day;
  const h = Number(m[4]);
  return `${day}, ${h % 12 || 12}:${m[5]} ${h < 12 ? "AM" : "PM"}`;
}
const bi = (en: string, ta: string): Bilingual => ({ en, ta });
const zoneName = (w: World, n: number | null | undefined) => (n ? w.zones.find((z) => z.n === n)?.name ?? `Zone ${n}` : null);
const zoneTa = (w: World, n: number | null | undefined) => (n ? w.zones.find((z) => z.n === n)?.ta ?? zoneName(w, n) : null);
const catLabel = (w: World, c: string | null) => (c ? w.cats.find((x) => x.code === c)?.label ?? c : null);
const deptName = (w: World, d: string | null) => (d ? w.depts.find((x) => x.code === d)?.name ?? d : null);
const plural = (n: number, one: string, many: string) => `${spoken(n)} ${n === 1 ? one : many}`;
const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
/** Text fit to show and say: no phone numbers or e-mail addresses, no letter openings ("Respected sir, ..."). */
export function safeText(t: unknown, n: number): string {
  return clip(String(t ?? "").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "").replace(/(?:\+?91[\s-]?)?\d[\d\s-]{8,}\d/g, "")
    .replace(/^\s*(respected|dear)\s+(sir|madam|sir\/madam)[,.:\s-]*/i, "").replace(/^\s*(sir|madam)[,.:]\s*/i, ""), n);
}
/** How Thunai names an incident aloud: its own short summary, else its kind and place (never a citizen's words). */
export function spokenLabel(r: CaseRowT): string {
  if (r.why && r.why.length <= 90 && !/[.!?].+[.!?]/.test(r.why)) return r.why.replace(/\.$/, "");
  const place = r.place ?? r.zoneName;
  return r.cat ? `${r.cat}${place ? ` at ${place}` : ""}` : safeText(r.title, 90);
}
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** The scope a screen covers, in words ("Adyar · flooding · this week"). */
function scopeWords(w: World, s: ScopeT): Bilingual {
  const en = [zoneName(w, s.zone), s.taluk ? w.taluks.find((t) => t.code === s.taluk)?.name ?? s.taluk : null, deptName(w, s.dept), catLabel(w, s.cat), s.sev, PERIOD_EN[s.period]].filter(Boolean);
  const ta = [zoneTa(w, s.zone), s.taluk ? w.taluks.find((t) => t.code === s.taluk)?.ta ?? s.taluk : null, deptName(w, s.dept), catLabel(w, s.cat), s.sev ? SEV_TA[s.sev] : null, PERIOD_TA[s.period]].filter(Boolean);
  return bi(en.join(" · "), ta.join(" · "));
}

// ------------------------------------------------------------------ rows --

/** Any incident row the tools or the console return, as a Stage card (no citizen text: title, place, codes, counts). */
export function caseRow(r: Row, w: World): CaseRowT {
  const zone = num(r.zone);
  const why = r.why && typeof r.why === "object" ? clip(r.why.summary ?? r.why.why?.[0], 300) : typeof r.reasons === "string" ? clip(r.reasons, 300) : r.attention_reason ? clip(r.attention_reason, 300) : null;
  return {
    id: String(r.id), title: safeText(r.title, 240) || String(r.id), sev: r.sev ?? r.severity ?? null, status: r.status ?? null, zone,
    zoneName: r.zone_name ?? r.zoneName ?? zoneName(w, zone), place: clip(r.loc ?? r.place ?? r.place_text, 120) || null, ward: num(r.ward),
    dept: r.dept ?? null, deptName: r.dept_name ?? r.deptName ?? null, complaints: Number(r.complaints ?? 0) || 0, t: r.t ?? r.first ?? null,
    overdue: Number(r.breached) === 1 || r.overdue === true, lat: num(r.lat), lon: num(r.lon), why: why || null, cat: r.type ?? r.catLabel ?? r.cat ?? null
  };
}

function points(rows: CaseRowT[], hot = 3): PointT[] {
  return rows.map((r, i) => ({ r, i })).filter(({ r }) => r.lat != null && r.lon != null)
    .map(({ r, i }) => ({ n: i + 1, id: r.id, lat: r.lat as number, lon: r.lon as number, label: r.title, sev: r.sev, value: null, hot: i < hot }));
}

function sortRows(rows: CaseRowT[], sort: Slots["sort"]): CaseRowT[] {
  if (sort === "complaints") return [...rows].sort((a, b) => b.complaints - a.complaints);
  if (sort === "time") return [...rows].sort((a, b) => String(b.t ?? "").localeCompare(String(a.t ?? "")));
  return rows;
}

// ------------------------------------------------------------------ the builder --

interface Ctx { w: World; h: Hands; s: ScopeT; slots: Slots; heard: string; runs: string[]; sources: Set<string>; notes: string[]; asOf: string | null }

async function call(c: Ctx, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  c.runs.push(name);
  const r = await c.h.tool(name, args);
  c.sources.add(name);
  c.asOf ??= r.asOf ?? null;
  return r;
}
const scopeArg = (s: ScopeT, extra: Partial<ScopeT> = {}) => {
  const x = { ...s, ...extra };
  return { period: x.period, zone: x.zone, dept: x.dept, cat: x.cat, taluk: x.taluk };
};

type Part = { title: string; takeaway: Bilingual | null; say: Bilingual; blocks: BlockT[] };

const RECIPE: Record<Recipe, (c: Ctx) => Promise<Part>> = {
  cases, case: caseDetail, news, readings, ranking, compare, trend, why, performance, dashboard, map: mapScreen, nearby, brief, drafts, answer: async () => {
    throw new Error("the answer screen is written from the agent's own results");
  }
};

/** Build a screen. Throws only on a programming error; a tool failure becomes a Note block that says so. */
export async function buildScreen(recipe: Recipe, slots: Slots, base: ScopeT, w: World, h: Hands, heard: string, id = `st-${Date.now().toString(36)}`): Promise<Built> {
  const s: ScopeT = {
    period: slots.period ?? base.period, zone: slots.zones.length === 1 ? slots.zones[0] : slots.zones.length ? null : base.zone,
    dept: slots.dept ?? (slots.depts.length ? null : base.dept), cat: slots.cat ?? base.cat, taluk: slots.taluk ?? base.taluk, sev: slots.sev ?? null
  };
  const c: Ctx = { w, h, s, slots, heard, runs: [], sources: new Set(), notes: [], asOf: null };
  let part: Part;
  try {
    part = await RECIPE[recipe](c);
  } catch (e) {
    part = { title: heard, takeaway: null, say: bi("I could not get that data just now.", "அந்தத் தரவை இப்போது பெற முடியவில்லை."),
      blocks: [{ kind: "Note", id: "err", text: `The data could not be read: ${clip((e as Error).message, 200)}` }] };
  }
  if (!part.blocks.length) part.blocks.push({ kind: "Note", id: "empty", text: "Nothing in the data matches this, for this scope." });
  return {
    runs: c.runs,
    doc: { v: 1, id, recipe, title: clip(part.title, 200), takeaway: part.takeaway, say: part.say, blocks: part.blocks.slice(0, 6), scope: s,
      slots: slots as unknown as Record<string, unknown>, sources: [...c.sources].slice(0, 10), asOf: c.asOf, notes: c.notes.slice(0, 4) }
  };
}

// ------------------------------------------------------------------ cases --

async function cases(c: Ctx): Promise<Part> {
  const { w, s, slots } = c;
  const sev = slots.sev;
  const n = Math.min(Math.max(slots.n ?? 12, 1), 30);
  let rows: CaseRowT[]; let total: number; let source: "console-severity" | "list";
  // "the severe cases": exactly the console's severity panel for this scope
  if (sev && !slots.q && !slots.status) {
    c.runs.push("console_severe");
    const r = await c.h.severe(s);
    c.sources.add("console severity panel");
    c.asOf ??= r.asOf;
    rows = r.rows.filter((x) => x.sev === sev).map((x) => caseRow(x, w));
    total = Number(r.counts[sev] ?? rows.length);
    source = "console-severity";
  } else {
    const r = await call(c, "incidents", { scope: scopeArg(s), sev, status: slots.status === "overdue" ? "open" : slots.status, q: slots.q, sort: slots.sort === "complaints" ? "c" : slots.sort === "time" ? "t" : "sev" });
    const data = r.data as { rows: Row[]; total: number };
    rows = data.rows.map((x) => caseRow(x, w));
    if (slots.status === "overdue") rows = rows.filter((x) => x.overdue);
    total = slots.status === "overdue" ? rows.length : data.total;
    source = "list";
  }
  rows = sortRows(rows, slots.sort).slice(0, n);
  const sevWord = sev ? sev.toLowerCase() : "";
  const scope = scopeWords(w, { ...s, sev: null });
  const title = `${sev ? `${sev} cases` : slots.q ? `Cases: ${slots.q}` : "Cases"} · ${scope.en}`;
  if (!rows.length) {
    return { title, takeaway: null, say: bi(`There are no ${sevWord} cases ${PERIOD_EN[s.period]} for this view.`, `இந்தப் பார்வையில் ${PERIOD_TA[s.period]} ${sev ? SEV_TA[sev] : ""} சம்பவங்கள் இல்லை.`),
      blocks: [{ kind: "Note", id: "none", text: "No incidents match this view." }] };
  }
  const top = rows[0];
  const where = top.zoneName ?? top.place ?? "Chennai";
  const worst = spokenLabel(top);
  const overdue = rows.filter((r) => r.overdue).length;
  const shown = rows.length < total ? ` I am showing the top ${rows.length}.` : "";
  const say = bi(
    `${plural(total, `${sevWord ? `${sevWord} ` : ""}case`, `${sevWord ? `${sevWord} ` : ""}cases`)} ${PERIOD_EN[s.period]}.${shown} The worst: ${worst}${worst.includes(where) ? "" : `, ${where}`}.`,
    `${PERIOD_TA[s.period]} ${spoken(total)} ${sev ? SEV_TA[sev] + " " : ""}சம்பவங்கள். முதன்மையானது: ${worst}${worst.includes(where) ? "" : `, ${where}`}.`
  );
  const takeaway = overdue ? bi(`${overdue} of the ${rows.length} shown are past their deadline.`, `காட்டப்பட்ட ${rows.length}-இல் ${overdue} காலக்கெடுவைத் தாண்டியவை.`) : null;
  const pts = points(rows);
  const blocks: BlockT[] = [{ kind: "CaseList", id: "cases", title, source, sev, total, rows }];
  if (pts.length) blocks.push({ kind: "MapView", id: "map", title: "Where they are", rule: "Numbered as in the list; cases without an exact place are not drawn.", shade: null, points: pts, outline: s.zone ? [s.zone] : [] });
  return { title, takeaway, say, blocks };
}

async function caseDetail(c: Ctx): Promise<Part> {
  const id = c.slots.id;
  if (!id) return { title: "Incident", takeaway: null, say: bi("Which incident? Say its number on the list.", "எந்தச் சம்பவம்? பட்டியலில் அதன் எண்ணைச் சொல்லுங்கள்."), blocks: [] };
  const r = await call(c, "incident_detail", { id });
  const d = r.data as { incident: Row; reports: Row[]; officials: Row[] };
  const i = d.incident;
  const row = caseRow({ ...i, loc: i.place }, c.w);
  const what = (i.why?.what ?? []).map((x: unknown) => clip(x, 300)).slice(0, 6);
  const officials = (d.officials ?? []).slice(0, 4).map((o) => ({ name: clip(o.name, 80), role: clip(o.designation, 120) }));
  const timeline = (d.reports ?? []).slice(0, 20).map((x) => ({ t: clip(x.t, 30), source: clip(x.publisher ?? x.source, 60), text: clip(x.title ?? x.what, 300) }));
  const block: BlockT = { kind: "CaseDetail", id: "case", incident: { ...row, what, why: clip(i.why?.why?.[0], 300) || null, next: clip(i.why?.next, 300) || null,
    deadline: when(i.sla_due), officials }, timeline };
  const blocks: BlockT[] = [block];
  if (row.lat != null && row.lon != null) blocks.push({ kind: "MapView", id: "map", title: "Where", rule: null, shade: null, outline: [],
    points: [{ n: 1, id: row.id, lat: row.lat, lon: row.lon as number, label: row.title, sev: row.sev, value: null, hot: true }] });
  const open = i.open_for ? `, open for ${i.open_for}` : "";
  const say = bi(`${spokenLabel(row)}. ${row.sev ? `${row.sev}, ` : ""}${row.status ? `status ${row.status}` : ""}${open}. ${row.deptName ? `${row.deptName} handles it.` : ""}`.replace(/\s{2,}/g, " "),
    `${spokenLabel(row)}. ${row.sev ? SEV_TA[row.sev] ?? row.sev : ""} நிலை${row.status ? `, ${row.status}` : ""}. ${row.deptName ? `${row.deptName} பொறுப்பு.` : ""}`);
  return { title: row.title, takeaway: row.overdue ? bi("Past its deadline.", "காலக்கெடு தாண்டியது.") : null, say, blocks };
}

// ------------------------------------------------------------------ news --

async function news(c: Ctx): Promise<Part> {
  const { s, slots } = c;
  c.runs.push("console_news");
  const r = await c.h.news(s);
  c.sources.add("console latest news");
  c.asOf ??= r.asOf;
  const words = (slots.q ?? "").toLowerCase().split(/[^a-z஀-௿]+/).filter((x) => x.length >= 4)
    .map((x) => x.replace(/(ing|ed|s)$/, ""));
  const match = (x: Row) => !words.length || words.some((wd) => `${x.title ?? ""} ${x.original ?? ""} ${x.loc ?? ""}`.toLowerCase().includes(wd));
  let items = r.rows.filter(match).map((x) => ({
    id: String(x.id), title: clip(x.title, 300), source: clip((x.outletNames ?? [])[0] ?? x.publisher, 80) || null, t: x.t ?? null,
    place: clip(x.loc, 120) || null, incidentId: x.incident ?? null, url: typeof x.url === "string" && /^https?:\/\//.test(x.url) ? x.url : null
  }));
  // a topic the latest news does not carry: the console's search over every report
  if (words.length && items.length < 2) {
    const sr = await call(c, "search_records", { text: slots.q, scope: scopeArg(s), kinds: ["news"] }).catch(() => null);
    const found = ((sr?.data as { news?: Row[] } | undefined)?.news ?? []).map((x) => ({
      id: String(x.id ?? x.doc_id ?? x.title), title: clip(x.title, 300), source: clip(x.publisher ?? x.source, 80) || null, t: x.t ?? x.published ?? null,
      place: clip(x.place ?? x.loc, 120) || null, incidentId: x.incident ?? x.incident_id ?? null, url: typeof x.url === "string" && /^https?:\/\//.test(x.url) ? x.url : null
    }));
    if (found.length) { items = found; c.notes.push("Found by searching every news report (the latest news had none on this)."); }
  }
  items = items.slice(0, Math.min(slots.n ?? 12, 20));
  const topic = slots.q ? ` about ${slots.q}` : "";
  const title = `News${topic} · ${PERIOD_EN[s.period]}`;
  if (!items.length) return { title, takeaway: null, say: bi(`No news${topic} ${PERIOD_EN[s.period]}.`, `${PERIOD_TA[s.period]} இது பற்றி செய்தி இல்லை.`), blocks: [] };
  const linked = items.filter((x) => x.incidentId).length;
  return {
    title, takeaway: linked ? bi(`${linked} of these ${items.length} headlines are linked to an incident.`, `இந்த ${items.length} தலைப்புகளில் ${linked} ஒரு சம்பவத்துடன் இணைந்தவை.`) : null,
    say: bi(`${plural(items.length, "headline", "headlines")}${topic}. Reading them now.`, `${spoken(items.length)} தலைப்புச் செய்திகள். படிக்கிறேன்.`),
    blocks: [{ kind: "NewsReader", id: "news", title, total: words.length ? items.length : r.total, items }]
  };
}

// ------------------------------------------------------------------ readings --

const ENV: Record<Metric, { tool: string; en: string; ta: string; unit: string }> = {
  rain: { tool: "rainfall_24h_mm", en: "Rainfall in the last 24 hours", ta: "கடந்த 24 மணி நேர மழை", unit: "mm" },
  aqi: { tool: "aqi", en: "Air quality (AQI)", ta: "காற்றின் தரம்", unit: "AQI" },
  lakes: { tool: "lake_pct_full", en: "Reservoir storage", ta: "நீர்த்தேக்க இருப்பு", unit: "% full" },
  temp: { tool: "temp_max_c", en: "Maximum temperature", ta: "அதிகபட்ச வெப்பநிலை", unit: "°C" },
  humidity: { tool: "humidity_pct", en: "Relative humidity", ta: "ஈரப்பதம்", unit: "%" }
};

async function envRows(c: Ctx, m: Metric) {
  const r = await call(c, "environment", { metric: ENV[m].tool });
  return ((r.data as { rows: Row[] }).rows ?? []).filter((x) => num(x.value) != null);
}

async function readings(c: Ctx): Promise<Part> {
  const m = c.slots.metric ?? "lakes";
  const e = ENV[m];
  const rows = await envRows(c, m);
  const items = rows.map((x) => ({ id: String(x.place_id ?? x.place), name: clip(x.place, 120), value: round(Number(x.value), 1), t: x.t ?? null,
    mean28: num(x.mean28) == null ? null : round(Number(x.mean28), 1), z: num(x.zscore), anomaly: !!x.anomaly, detail: clip(x.detail, 200) || null }))
    .sort((a, b) => b.value - a.value);
  const title = `${e.en}${c.slots.name ? ` · ${c.slots.name}` : ""}`;
  if (!items.length) return { title, takeaway: null, say: bi(`There is no ${e.en.toLowerCase()} reading in the data.`, `${e.ta} அளவீடு தரவில் இல்லை.`), blocks: [] };
  const named = c.slots.name ? items.find((x) => x.name.toLowerCase().includes(c.slots.name!.toLowerCase()) || c.slots.name!.toLowerCase().includes(x.name.toLowerCase().split(" ")[0])) : null;
  const top = named ?? items[0];
  const v = m === "lakes" ? Math.round(top.value) : top.value;
  const unitWord = m === "lakes" ? "% full" : ` ${e.unit}`;
  const at = when(top.t) ?? "the latest reading";
  const say = named
    ? bi(`${top.name} is at ${spoken(v)}${unitWord}, as of ${at}.`, `${top.name}: ${spoken(v)}${m === "lakes" ? "% நிரம்பியுள்ளது" : ` ${e.unit}`}, ${at} நிலவரப்படி.`)
    : bi(`${items.length} readings. Highest: ${top.name} at ${spoken(v)}${unitWord}, as of ${at}.`, `${items.length} அளவீடுகள். அதிகம்: ${top.name}, ${spoken(v)}${m === "lakes" ? "%" : ` ${e.unit}`}, ${at} நிலவரப்படி.`);
  const vs = top.mean28 != null && top.mean28 > 0 ? change(top.value, top.mean28) : { delta: null, pct: null };
  const takeaway = vs.pct != null && Math.abs(vs.pct) >= 10
    ? bi(`${top.name} is ${spoken(Math.abs(vs.pct))}% ${vs.pct > 0 ? "above" : "below"} its 28-day average.`, `${top.name} அதன் 28 நாள் சராசரியை விட ${spoken(Math.abs(vs.pct))}% ${vs.pct > 0 ? "அதிகம்" : "குறைவு"}.`) : null;
  const blocks: BlockT[] = [{ kind: "Readings", id: "readings", title, metric: m, unit: e.unit, items: named ? [named, ...items.filter((x) => x !== named)] : items }];
  const pts = rows.filter((x) => num(x.lat) != null && num(x.lon) != null && Math.abs(Number(x.lat) - 13.05) < 0.6)
    .map((x, i) => ({ n: i + 1, id: String(x.place_id ?? x.place), lat: Number(x.lat), lon: Number(x.lon), label: clip(x.place, 120), sev: null, value: round(Number(x.value), 1), hot: String(x.place) === top.name }));
  if (pts.length >= 2) blocks.push({ kind: "MapView", id: "map", title: "Stations", rule: null, shade: null, points: pts, outline: [] });
  return { title, takeaway, say, blocks };
}

// ------------------------------------------------------------------ ranking --

async function ranking(c: Ctx): Promise<Part> {
  const { w, s, slots } = c;
  const measure: Measure = slots.measure ?? (slots.metric ? (slots.metric === "humidity" ? "rain" : slots.metric) as Measure : "zone_attention");
  const n = Math.min(Math.max(slots.n ?? 5, 1), 15);
  const order = slots.order;
  let items: Extract<BlockT, { kind: "Ranking" }>["items"] = [];
  let unit: string | null = null; let method = ""; let label = ""; let shade: Extract<BlockT, { kind: "MapView" }>["shade"] = null; let pts: PointT[] = [];
  let asWhen: string | null = null; let all: number[] = [];
  if (measure === "rain" || measure === "aqi" || measure === "lakes" || measure === "temp") {
    const m = measure as Metric;
    const rows = await envRows(c, m);
    const ranked = rank(rows, (x) => Number(x.value), n, order);
    all = rows.map((x) => Number(x.value));
    unit = ENV[m].unit; label = ENV[m].en;
    method = `Latest reading at each ${m === "lakes" ? "reservoir" : "station"} (${rows.length} reporting), ranked; the data has no zone-level gauge, so places are the stations themselves.`;
    items = ranked.map((r) => ({ key: String(r.item.place_id ?? r.item.place), label: clip(r.item.place, 120), value: round(r.value, 1), rank: r.rank, sub: when(r.item.t), zone: null,
      lat: num(r.item.lat), lon: num(r.item.lon), action: "station" as const }));
    asWhen = when(ranked[0]?.item.t);
    pts = items.filter((x) => x.lat != null && x.lon != null && Math.abs((x.lat as number) - 13.05) < 0.6)
      .map((x) => ({ n: x.rank, id: x.key, lat: x.lat as number, lon: x.lon as number, label: x.label, sev: null, value: x.value, hot: x.rank <= 3 }));
  } else if (measure.startsWith("zone_")) {
    const r = await call(c, "zones", { scope: scopeArg(s) });
    const rows = (r.data as { rows: Row[] }).rows;
    const key = { zone_severe: "severe", zone_open: "open", zone_incidents: "n", zone_complaints: "complaints", zone_attention: "score" }[measure as "zone_severe"] ?? "score";
    label = { severe: "Severe incidents", open: "Open incidents", n: "Incidents reported", complaints: "Open citizen complaints", score: "Attention score (3 × severe + high)" }[key] ?? key;
    unit = key === "score" ? "points" : "incidents";
    method = `${label} by zone, ${PERIOD_EN[s.period]}, as the console's zone table counts them.`;
    all = rows.map((x) => Number(x[key]));
    items = rank(rows, (x) => Number(x[key]), n, order).map((x) => ({ key: String(x.item.zone), label: clip(x.item.name, 120), value: x.value, rank: x.rank,
      sub: `${spoken(Number(x.item.severe))} severe · ${spoken(Number(x.item.open))} open`, zone: Number(x.item.zone), lat: null, lon: null, action: "zone" as const }));
    shade = { geo: "zone", label, values: rows.map((x) => ({ key: Number(x.zone), value: Number(x[key]) })) };
  } else if (measure === "taluk_open") {
    const r = await call(c, "taluks", { scope: scopeArg(s) });
    const rows = (r.data as { rows: Row[] }).rows ?? [];
    label = "Unresolved incidents, last 30 days"; unit = "incidents"; method = "Open incidents by revenue taluk over the last 30 days (the Trends page's taluk ranking).";
    all = rows.map((x) => Number(x.open));
    items = rank(rows, (x) => Number(x.open), n, order).map((x) => ({ key: String(x.item.code), label: clip(x.item.name, 120), value: x.value, rank: x.rank,
      sub: `${spoken(Number(x.item.severe ?? 0))} severe`, zone: null, lat: num(x.item.lat), lon: num(x.item.lon), action: "none" as const }));
  } else if (measure === "hotspots") {
    const r = await call(c, "hotspots", { scope: scopeArg(s) });
    const rows = (r.data as { rows: Row[] }).rows ?? [];
    label = "Incidents in 30 days, per hotspot"; unit = "incidents"; method = "Clusters of incidents within 250 m of each other (DBSCAN), 3 or more in the last 30 days.";
    all = rows.map((x) => Number(x.incidents_30d));
    items = rank(rows, (x) => Number(x.incidents_30d), n, order).map((x) => ({ key: String(x.item.id), label: `${clip(x.item.label, 60)} · ${clip(x.item.top_place, 50)}`, value: x.value, rank: x.rank,
      sub: `${spoken(Number(x.item.open))} open · ${clip(x.item.zone_name, 40)}`, zone: num(x.item.zone), lat: num(x.item.lat), lon: num(x.item.lon), action: "zone" as const }));
    pts = items.filter((x) => x.lat != null).map((x) => ({ n: x.rank, id: x.key, lat: x.lat as number, lon: x.lon as number, label: x.label, sev: null, value: x.value, hot: x.rank <= 3 }));
  } else {
    const d = await deptMeasures(c);
    const key = measure === "dept_backlog" ? "days" : measure === "dept_resolution" ? "closeDays" : measure === "dept_overdue" ? "overdue" : "open";
    label = { days: "Average age of open incidents", closeDays: "Average days to close", overdue: "Open past the deadline", open: "Open incidents" }[key] ?? key;
    unit = key === "days" || key === "closeDays" ? "days" : "incidents";
    method = { days: "Departments with 5 or more open incidents, by the average age of their open incidents (the console's backlog card).",
      closeDays: `Average days from first report to closing, incidents closed ${PERIOD_EN[s.period]}.`, overdue: `Open incidents past their deadline, ${PERIOD_EN[s.period]}.`,
      open: `Open incidents, ${PERIOD_EN[s.period]}.` }[key] ?? "";
    const rows = d.filter((x) => x[key] != null);
    all = rows.map((x) => Number(x[key]));
    items = rank(rows, (x) => Number(x[key]), n, order).map((x) => ({ key: String(x.item.code), label: clip(x.item.name, 120), value: round(x.value, 1), rank: x.rank,
      sub: `${spoken(Number(x.item.open ?? 0))} open`, zone: null, lat: null, lon: null, action: "dept" as const }));
  }
  const scope = scopeWords(w, s);
  const title = `${order === "top" ? "Top" : "Bottom"} ${items.length} · ${label}${measure.startsWith("zone_") || measure.startsWith("dept_") ? ` · ${scope.en}` : ""}`;
  if (!items.length) return { title, takeaway: null, say: bi("There is nothing to rank for this.", "இதற்கு வரிசைப்படுத்த எதுவும் இல்லை."), blocks: [] };
  const first = items[0];
  const vm = vsMedian(first.value, all);
  if (order === "top" && first.value === 0 && all.every((v) => v === 0)) {
    const nothing = bi(`Nothing to rank: every one of the ${all.length} reads 0${unit ? ` ${unit}` : ""}${asWhen ? ` as of ${asWhen}` : ""}.`, `வரிசைப்படுத்த எதுவும் இல்லை: ${all.length} அளவீடுகளும் 0${asWhen ? `, ${asWhen} நிலவரப்படி` : ""}.`);
    return { title, takeaway: nothing, say: measure === "rain" ? bi(`No rain in the last 24 hours at any of the ${all.length} stations${asWhen ? `, as of ${asWhen}` : ""}.`, `கடந்த 24 மணி நேரத்தில் ${all.length} நிலையங்களிலும் மழை இல்லை${asWhen ? `, ${asWhen} நிலவரப்படி` : ""}.`) : nothing,
      blocks: [{ kind: "Ranking", id: "rank", title: label, unit, method, order, items }, ...(pts.length ? [{ kind: "MapView" as const, id: "map", title: "Stations", rule: null, shade: null, points: pts, outline: [] }] : [])] };
  }
  const asOfWords = asWhen ? `, as of ${asWhen}` : "";
  const say = bi(
    `${order === "top" ? "Highest" : "Lowest"}: ${first.label}, ${spoken(first.value)}${unit && unit !== "points" ? ` ${unit}` : ""}${asOfWords}.${items[1] ? ` Then ${items.slice(1, 3).map((x) => `${x.label} ${spoken(x.value)}`).join(", ")}.` : ""}`,
    `${order === "top" ? "அதிகம்" : "குறைவு"}: ${first.label}, ${spoken(first.value)}${unit && unit !== "points" ? ` ${unit}` : ""}${asWhen ? `, ${asWhen} நிலவரப்படி` : ""}.${items[1] ? ` அடுத்து ${items.slice(1, 3).map((x) => `${x.label} ${spoken(x.value)}`).join(", ")}.` : ""}`
  );
  const takeaway = order === "top" && vm.ratio && vm.ratio >= 1.5
    ? bi(`${first.label} is ${spoken(vm.ratio)}× the median of all ${all.length}.`, `${first.label}, அனைத்து ${all.length}-இன் இடைநிலையை விட ${spoken(vm.ratio)} மடங்கு.`)
    : bi(`${first.label} leads with ${spoken(first.value)}${unit && unit !== "points" ? ` ${unit}` : ""}.`, `${first.label} முதலிடம்: ${spoken(first.value)}.`);
  const blocks: BlockT[] = [{ kind: "Ranking", id: "rank", title: label, unit, method, order, items }];
  if (shade || pts.length) blocks.push({ kind: "MapView", id: "map", title: shade ? `${label} by zone` : "On the map", rule: null, shade, points: pts, outline: items.filter((x) => x.zone).slice(0, 3).map((x) => x.zone as number) });
  const total = all.reduce((a, b) => a + b, 0);
  if (measure.startsWith("zone_") || measure === "taluk_open") {
    blocks.unshift({ kind: "Kpis", id: "kpis", title: "Key numbers", items: [
      { key: "top", label: `${first.label}`, value: first.value, unit, prev: null, delta: null, tone: "bad", spark: [] },
      { key: "total", label: "All areas together", value: total, unit, prev: null, delta: null, tone: "neutral", spark: [] },
      { key: "share", label: `${first.label}'s share`, value: share(first.value, total) ?? 0, unit: "%", prev: null, delta: null, tone: "neutral", spark: [] }
    ] });
  } else if (measure === "rain" || measure === "aqi" || measure === "lakes" || measure === "temp") {
    blocks.unshift({ kind: "Kpis", id: "kpis", title: "Key numbers", items: [
      { key: "top", label: first.label, value: first.value, unit, prev: null, delta: null, tone: "neutral", spark: [] },
      { key: "median", label: "Median of all stations", value: round(median(all) ?? 0, 1), unit, prev: null, delta: null, tone: "neutral", spark: [] },
      { key: "n", label: "Reporting", value: all.length, unit: null, prev: null, delta: null, tone: "neutral", spark: [] }
    ] });
  }
  return { title, takeaway, say, blocks };
}

/** Departments with every measure the console has for them, joined by code. */
async function deptMeasures(c: Ctx): Promise<Row[]> {
  const sc = { scope: scopeArg(c.s) };
  const [deps, backlog, res, fol] = await Promise.all([
    call(c, "departments", sc), call(c, "dept_backlog", sc), call(c, "resolution_times", sc), call(c, "dept_followups", sc).catch(() => null)
  ]);
  const by = new Map<string, Row>();
  for (const d of (deps.data as { rows: Row[] }).rows) by.set(d.code, { code: d.code, name: d.name, open: d.open, n: d.n, severe: d.severe, unverified: d.unverified });
  for (const b of (backlog.data as { rows: Row[] }).rows) by.set(b.code, { ...(by.get(b.code) ?? { code: b.code, name: b.name }), days: b.days, backlogOpen: b.n, overdueAll: b.overdue });
  for (const r of (res.data as { rows: Row[] }).rows) by.set(r.code, { ...(by.get(r.code) ?? { code: r.code, name: r.name }), closeDays: r.days, closed: r.n, onTimePct: r.onTimePct });
  for (const f of ((fol?.data as { rows: Row[] } | undefined)?.rows ?? [])) by.set(f.code, { ...(by.get(f.code) ?? { code: f.code, name: f.name }), overdue: f.overdue, serious: f.serious, awaiting: f.awaiting, complaints: f.complaints });
  return [...by.values()];
}

// ------------------------------------------------------------------ compare --

const CMP_METRICS = [
  { key: "n", label: "Reported" }, { key: "severe", label: "Severe" }, { key: "high", label: "High" }, { key: "open", label: "Open" },
  { key: "complaints", label: "Open complaints" }, { key: "overdue", label: "Past deadline" }
];

async function compare(c: Ctx): Promise<Part> {
  const { w, s, slots } = c;
  if (slots.depts.length >= 2) return compareDepts(c);
  const zones = [...new Set(slots.zones)].slice(0, 4);
  if (zones.length < 2) return { title: "Compare", takeaway: null, say: bi("Which two areas should I compare?", "எந்த இரண்டு பகுதிகளை ஒப்பிட வேண்டும்?"), blocks: [] };
  const base = { ...s, zone: null };
  const [zr, ...sides] = await Promise.all([
    call(c, "zones", { scope: scopeArg(base) }),
    ...zones.map((z) => Promise.all([call(c, "change_drivers", { scope: scopeArg(base, { zone: z }) }), call(c, "incident_series", { scope: scopeArg(base, { zone: z }) })]))
  ]) as [ToolResult, ...[ToolResult, ToolResult][]];
  const zrows = (zr.data as { rows: Row[] }).rows;
  let seriesLabels: string[] = [];
  const out = zones.map((z, i) => {
    const row = zrows.find((x) => Number(x.zone) === z) ?? {};
    const [cd, ser] = sides[i];
    const d = cd.data as { totals: Row; categories: Row[] };
    const buckets = ((ser.data as { buckets: Row[] }).buckets ?? []);
    if (!seriesLabels.length) seriesLabels = buckets.map((b) => when(b.from)?.split(",")[0] ?? "");
    return { key: String(z), label: zoneName(w, z) ?? `Zone ${z}`, zone: z,
      values: { n: Number(row.n ?? d.totals?.n ?? 0), severe: Number(row.severe ?? 0), high: Number(row.high ?? 0), open: Number(row.open ?? 0), complaints: Number(row.complaints ?? 0), overdue: Number(d.totals?.overdue ?? 0) },
      cats: (d.categories ?? []).slice(0, 6).map((x) => ({ code: String(x.code), label: clip(x.label, 80), n: Number(x.n) })),
      series: buckets.map((b) => Number(b.n)) };
  });
  const gaps = largestGaps(out, CMP_METRICS.map((m) => m.key));
  const lab = (k: string) => CMP_METRICS.find((m) => m.key === k)?.label ?? k;
  const title = `${out.map((x) => x.label).join(" vs ")} · ${PERIOD_EN[s.period]}`;
  const [a, b] = out;
  const g = gaps[0];
  const say = bi(
    `${a.label}: ${spoken(a.values.severe)} severe and ${spoken(a.values.open)} open. ${b.label}: ${spoken(b.values.severe)} severe and ${spoken(b.values.open)} open.${g ? ` The biggest gap is ${lab(g.metric).toLowerCase()}: ${g.hi} ${spoken(g.hiValue)} against ${g.lo} ${spoken(g.loValue)}.` : ""}`,
    `${zoneTa(w, a.zone)}: ${spoken(a.values.severe)} கடுமையான, ${spoken(a.values.open)} திறந்தவை. ${zoneTa(w, b.zone)}: ${spoken(b.values.severe)} கடுமையான, ${spoken(b.values.open)} திறந்தவை.${g ? ` பெரிய வேறுபாடு ${lab(g.metric)}: ${g.hi} ${spoken(g.hiValue)}, ${g.lo} ${spoken(g.loValue)}.` : ""}`
  );
  const takeaway = g ? bi(`${g.hi} had ${g.ratio ? `${spoken(g.ratio)}×` : `${spoken(g.gap)} more`} the ${lab(g.metric).toLowerCase()} of ${g.lo} ${PERIOD_EN[s.period]}.`,
    `${PERIOD_TA[s.period]} ${g.hi}, ${g.lo}-ஐ விட ${g.ratio ? `${spoken(g.ratio)} மடங்கு` : `${spoken(g.gap)} கூடுதல்`} ${lab(g.metric)}.`) : null;
  c.notes.push("Median resolution time is not kept per zone in the data; the board compares counts.");
  return { title, takeaway, say, blocks: [
    { kind: "Compare", id: "cmp", title, metrics: CMP_METRICS, sides: out, seriesLabels,
      diffs: gaps.slice(0, 6).map((x) => ({ metric: x.metric, label: lab(x.metric), hi: x.hi, lo: x.lo, ratio: x.ratio, gap: x.gap })) },
    { kind: "MapView", id: "map", title: "Both areas", rule: null, shade: { geo: "zone", label: "Severe incidents", values: zrows.map((x) => ({ key: Number(x.zone), value: Number(x.severe) })) }, points: [], outline: zones }
  ] };
}

async function compareDepts(c: Ctx): Promise<Part> {
  const d = await deptMeasures(c);
  const pick = c.slots.depts.slice(0, 4).map((code) => d.find((x) => x.code === code)).filter((x): x is Row => !!x);
  const metrics = [{ key: "open", label: "Open" }, { key: "overdue", label: "Past deadline" }, { key: "severe", label: "Severe" }, { key: "days", label: "Avg age open (days)" }, { key: "closeDays", label: "Avg days to close" }];
  const title = `${pick.map((x) => x.name).join(" vs ")} · ${PERIOD_EN[c.s.period]}`;
  if (pick.length < 2) return { title, takeaway: null, say: bi("I could not find both departments in the data.", "இரண்டு துறைகளையும் தரவில் காண முடியவில்லை."), blocks: [] };
  const sides = pick.map((x) => ({ key: String(x.code), label: clip(x.name, 80), zone: null, values: Object.fromEntries(metrics.map((m) => [m.key, Number(x[m.key] ?? 0)])), cats: [], series: [] }));
  const gaps = largestGaps(sides, metrics.map((m) => m.key));
  const g = gaps[0];
  const lab = (k: string) => metrics.find((m) => m.key === k)?.label ?? k;
  return {
    title, takeaway: g ? bi(`Largest gap: ${lab(g.metric)}, ${g.hi} ${spoken(g.hiValue)} against ${g.lo} ${spoken(g.loValue)}.`, `பெரிய வேறுபாடு: ${lab(g.metric)}, ${g.hi} ${spoken(g.hiValue)}, ${g.lo} ${spoken(g.loValue)}.`) : null,
    say: bi(sides.map((x) => `${x.label}: ${spoken(x.values.open)} open, ${spoken(x.values.overdue)} past deadline`).join(". ") + ".", sides.map((x) => `${x.label}: ${spoken(x.values.open)} திறந்தவை, ${spoken(x.values.overdue)} காலக்கெடு தாண்டியவை`).join(". ") + "."),
    blocks: [{ kind: "Compare", id: "cmp", title, metrics, sides, seriesLabels: [], diffs: gaps.slice(0, 5).map((x) => ({ metric: x.metric, label: lab(x.metric), hi: x.hi, lo: x.lo, ratio: x.ratio, gap: x.gap })) }]
  };
}

// ------------------------------------------------------------------ trend --

async function seriesBlock(c: Ctx, s: ScopeT, title: string): Promise<{ block: Extract<BlockT, { kind: "Trend" }>; values: number[]; open: number[]; labels: string[]; total: number }> {
  const r = await call(c, "incident_series", { scope: scopeArg(s) });
  const d = r.data as { buckets: Row[]; unit: string; normal: { lo: number; hi: number; mean: number } | null };
  const values = d.buckets.map((b) => Number(b.n));
  const labels = d.buckets.map((b) => (d.unit === "2h" || /hour/.test(d.unit) ? when(b.from)?.split(", ")[1] ?? "" : when(b.from)?.split(",")[0] ?? ""));
  const normal = d.normal && Number.isFinite(d.normal.hi) ? { lo: Number(d.normal.lo), hi: Number(d.normal.hi) } : null;
  const marks = unusualPoints(values, normal).slice(0, 12).map((i) => ({ i, why: normal ? `Above the usual range (${spoken(normal.lo)}–${spoken(normal.hi)})` : "More than 2 standard deviations above the mean" }));
  return { block: { kind: "Trend", id: "trend", title, unit: "incidents", labels, values, marks, normal }, values, open: d.buckets.map((b) => Number(b.open ?? 0)), labels, total: values.reduce((a, b) => a + b, 0) };
}

async function trend(c: Ctx): Promise<Part> {
  const { w, s } = c;
  const scope = scopeWords(w, { ...s, cat: null });
  const subject = catLabel(w, s.cat) ?? "Incidents";
  const t = await seriesBlock(c, s, `${subject} over time`);
  const zr = await call(c, "zones", { scope: scopeArg({ ...s, zone: null }) });
  const zrows = (zr.data as { rows: Row[] }).rows;
  const zr5 = rank(zrows, (x) => Number(x.n), 5);
  const title = `${subject} · ${scope.en}`;
  if (!t.total) return { title, takeaway: null, say: bi(`No ${subject.toLowerCase()} in this period.`, "இந்தக் காலத்தில் எதுவும் இல்லை."), blocks: [t.block] };
  const p = peak(t.values)!;
  const half = Math.floor(t.values.length / 2);
  const first = t.values.slice(0, half).reduce((a, b) => a + b, 0), second = t.values.slice(half).reduce((a, b) => a + b, 0);
  const ch = change(second, first);
  const say = bi(
    `${plural(t.total, "incident", "incidents")} of ${subject.toLowerCase()} ${PERIOD_EN[s.period]}. The peak was ${spoken(p.value)} around ${t.labels[p.i]}.${ch.pct != null ? ` The second half had ${spoken(Math.abs(ch.pct))}% ${ch.pct >= 0 ? "more" : "fewer"} than the first.` : ""}`,
    `${PERIOD_TA[s.period]} ${subject}: ${spoken(t.total)} சம்பவங்கள். உச்சம் ${t.labels[p.i]} அளவில் ${spoken(p.value)}.${ch.pct != null ? ` பின்பாதியில் ${spoken(Math.abs(ch.pct))}% ${ch.pct >= 0 ? "அதிகம்" : "குறைவு"}.` : ""}`
  );
  const takeaway = t.block.marks.length
    ? bi(`${plural(t.block.marks.length, "period was", "periods were")} above the usual range; the peak was ${spoken(p.value)} around ${t.labels[p.i]}.`, `${t.block.marks.length} காலங்கள் வழக்கத்தை விட அதிகம்; உச்சம் ${spoken(p.value)}.`)
    : ch.pct != null ? bi(`${ch.pct >= 0 ? "Rising" : "Falling"}: ${spoken(Math.abs(ch.pct))}% ${ch.pct >= 0 ? "more" : "fewer"} in the second half of the period.`, `${ch.pct >= 0 ? "ஏறுமுகம்" : "இறங்குமுகம்"}: ${spoken(Math.abs(ch.pct))}%.`) : null;
  return { title, takeaway, say, blocks: [
    { kind: "Kpis", id: "kpis", title: "Key numbers", items: [
      { key: "total", label: `${subject}, ${PERIOD_EN[s.period]}`, value: t.total, unit: null, prev: null, delta: null, tone: "neutral", spark: t.values.slice(-30) },
      { key: "peak", label: `Peak (${t.labels[p.i]})`, value: p.value, unit: null, prev: null, delta: null, tone: "bad", spark: [] },
      { key: "half", label: "Second half vs first", value: second, unit: null, prev: first, delta: ch.delta, tone: (ch.delta ?? 0) > 0 ? "bad" : "good", spark: [] }
    ] },
    t.block,
    { kind: "Ranking", id: "zones", title: `Zones with the most ${subject.toLowerCase()}`, unit: "incidents", method: `Incidents reported by zone, ${PERIOD_EN[s.period]}.`, order: "top",
      items: zr5.map((x) => ({ key: String(x.item.zone), label: clip(x.item.name, 80), value: x.value, rank: x.rank, sub: `${spoken(Number(x.item.open))} open`, zone: Number(x.item.zone), lat: null, lon: null, action: "zone" as const })) },
    { kind: "MapView", id: "map", title: "By zone", rule: null, shade: { geo: "zone", label: subject, values: zrows.map((x) => ({ key: Number(x.zone), value: Number(x.n) })) }, points: [], outline: zr5.slice(0, 3).map((x) => Number(x.item.zone)) }
  ] };
}

// ------------------------------------------------------------------ why --

async function why(c: Ctx): Promise<Part> {
  const { w, s } = c;
  const scope = scopeWords(w, s);
  const r = await call(c, "change_drivers", { scope: scopeArg(s) });
  const d = r.data as { totals: Row; rainDays: number; rainDaysPrev: number; categories: Row[]; places: Row[]; depts: Row[]; top: Row[] };
  const t = d.totals ?? {};
  const rises = [...(d.categories ?? [])].filter((x) => Number(x.delta) > 0).sort((a, b) => Number(b.delta) - Number(a.delta)).slice(0, 3);
  const ch = change(Number(t.n ?? 0), num(t.prev));
  const title = `Why · ${scope.en}`;
  const reasons: string[] = [];
  const reasonsTa: string[] = [];
  if (rises[0]) {
    reasons.push(`${rises.map((x) => `${clip(x.label, 60).toLowerCase()} rose by ${spoken(Number(x.delta))}`).join(", ")}`);
    reasonsTa.push(`${rises.map((x) => `${clip(x.label, 60)} ${spoken(Number(x.delta))} கூடியது`).join(", ")}`);
  }
  if (num(t.rainLinked)) { reasons.push(`${spoken(Number(t.rainLinked))} incidents were rain-linked over ${spoken(d.rainDays)} rain days`); reasonsTa.push(`${spoken(d.rainDays)} மழை நாட்களில் ${spoken(Number(t.rainLinked))} மழை தொடர்பானவை`); }
  if (num(t.overdue)) { reasons.push(`${spoken(Number(t.overdue))} open incidents are past their deadline`); reasonsTa.push(`${spoken(Number(t.overdue))} காலக்கெடு தாண்டியவை`); }
  const place = d.places?.[0];
  if (place) { reasons.push(`the busiest spot is ${clip(place.place, 60)} (${spoken(Number(place.n))} ${clip(place.category, 50).toLowerCase()})`); reasonsTa.push(`அதிக இடம் ${clip(place.place, 60)} (${spoken(Number(place.n))})`); }
  const head = ch.delta != null
    ? `${spoken(Number(t.n))} incidents ${PERIOD_EN[s.period]} against ${spoken(Number(t.prev))} the period before${ch.pct != null ? ` (${ch.pct >= 0 ? "up" : "down"} ${spoken(Math.abs(ch.pct))}%)` : ""}.`
    : `${spoken(Number(t.n ?? 0))} incidents ${PERIOD_EN[s.period]}.`;
  const headTa = `${PERIOD_TA[s.period]} ${spoken(Number(t.n ?? 0))} சம்பவங்கள்${num(t.prev) != null ? `, முந்தைய காலத்தில் ${spoken(Number(t.prev))}` : ""}.`;
  const text = `${head} ${reasons.length ? `Main reasons: ${reasons.join("; ")}.` : ""}`;
  const blocks: BlockT[] = [
    { kind: "Kpis", id: "kpis", title: "Key numbers", items: [
      { key: "n", label: `Reported, ${PERIOD_EN[s.period]}`, value: Number(t.n ?? 0), unit: null, prev: num(t.prev), delta: ch.delta, tone: (ch.delta ?? 0) > 0 ? "bad" : "good", spark: [] },
      { key: "severe", label: "Severe", value: Number(t.severe ?? 0), unit: null, prev: num(t.severePrev), delta: num(t.severePrev) != null ? Number(t.severe ?? 0) - Number(t.severePrev) : null, tone: "bad", spark: [] },
      { key: "overdue", label: "Past deadline (open)", value: Number(t.overdue ?? 0), unit: null, prev: null, delta: null, tone: "bad", spark: [] },
      { key: "rain", label: "Rain-linked", value: Number(t.rainLinked ?? 0), unit: null, prev: null, delta: null, tone: "neutral", spark: [] }
    ] },
    { kind: "Answer", id: "answer", title: "What drives it", text, facts: [
      ...rises.map((x) => ({ label: `${clip(x.label, 100)}: now vs before`, value: Number(x.n), unit: `(was ${spoken(Number(x.prev))})` })),
      ...(d.depts ?? []).slice(0, 2).map((x) => ({ label: `${clip(x.name, 100)}: open past deadline`, value: Number(x.overdue ?? 0), unit: null }))
    ].slice(0, 12) }
  ];
  const cats = [...(d.categories ?? [])].sort((a, b) => Number(b.delta) - Number(a.delta)).slice(0, 8);
  if (cats.length) blocks.push({ kind: "Chart", id: "chart", title: "Change by kind of incident (now minus before)", chart: "hbar", unit: "incidents", labels: cats.map((x) => clip(x.label, 80)), values: cats.map((x) => Number(x.delta)) });
  const top = (d.top ?? []).map((x) => caseRow({ ...x, sev: x.severity, why: null, reasons: x.reasons }, w));
  if (top.length) blocks.push({ kind: "CaseList", id: "top", title: "The incidents behind it", source: "list", sev: null, total: top.length, rows: top });
  return {
    title,
    takeaway: rises[0] ? bi(`${clip(rises[0].label, 60)} rose the most: ${spoken(Number(rises[0].n))} against ${spoken(Number(rises[0].prev))}.`, `${clip(rises[0].label, 60)} அதிகம் உயர்ந்தது: ${spoken(Number(rises[0].n))}, முன்பு ${spoken(Number(rises[0].prev))}.`) : null,
    say: bi(`${head} ${reasons.slice(0, 2).length ? `Mainly: ${reasons.slice(0, 2).join("; ")}.` : ""}`.trim(), `${headTa} ${reasonsTa.slice(0, 2).join("; ")}.`.trim()),
    blocks
  };
}

// ------------------------------------------------------------------ performance --

async function performance(c: Ctx): Promise<Part> {
  return c.slots.by === "zone" ? zonePerformance(c) : deptPerformance(c);
}

async function deptPerformance(c: Ctx): Promise<Part> {
  const { s } = c;
  const d = await deptMeasures(c);
  const slowest = rank(d.filter((x) => x.days != null), (x) => Number(x.days), 8);
  const totalOpen = d.reduce((a, x) => a + Number(x.open ?? 0), 0);
  const overdue = d.reduce((a, x) => a + Number(x.overdue ?? 0), 0);
  const closeDays = median(d.filter((x) => x.closeDays != null).map((x) => Number(x.closeDays)));
  const onTime = median(d.filter((x) => x.onTimePct != null).map((x) => Number(x.onTimePct)));
  const t = await seriesBlock(c, s, "Still open, by when reported");
  t.block.values = t.open;
  t.block.title = "Still open today, by when they were reported";
  t.block.marks = [];
  t.block.normal = null;
  const heatRows = slowest.slice(0, 8).map((x) => x.item);
  const cols = [{ k: "open", l: "Open" }, { k: "overdue", l: "Past deadline" }, { k: "serious", l: "Severe or high" }, { k: "awaiting", l: "Awaiting you" }, { k: "days", l: "Avg age (days)" }, { k: "closeDays", l: "Days to close" }];
  const title = `Department performance · ${PERIOD_EN[s.period]}`;
  if (!slowest.length) return { title, takeaway: null, say: bi("No department has enough open incidents to rank.", "வரிசைப்படுத்த போதுமான தரவு இல்லை."), blocks: [] };
  const [a, b, cc] = slowest;
  const say = bi(
    `Slowest: ${a.item.name}, open incidents ${spoken(a.value)} days old on average.${b ? ` Then ${b.item.name} at ${spoken(b.value)}${cc ? ` and ${cc.item.name} at ${spoken(cc.value)}` : ""}.` : ""}`,
    `மிக மெதுவானது: ${a.item.name}, திறந்த சம்பவங்கள் சராசரியாக ${spoken(a.value)} நாட்கள்.${b ? ` அடுத்து ${b.item.name} ${spoken(b.value)}${cc ? `, ${cc.item.name} ${spoken(cc.value)}` : ""}.` : ""}`
  );
  const vm = vsMedian(a.value, d.filter((x) => x.days != null).map((x) => Number(x.days)));
  return { title,
    takeaway: vm.ratio ? bi(`${a.item.name}'s open incidents are ${spoken(vm.ratio)}× older than the median department's.`, `${a.item.name}-இன் திறந்த சம்பவங்கள் இடைநிலைத் துறையை விட ${spoken(vm.ratio)} மடங்கு பழையவை.`) : null,
    say, blocks: [
      { kind: "Kpis", id: "kpis", title: "Key numbers", items: [
        { key: "open", label: `Open, ${PERIOD_EN[s.period]}`, value: totalOpen, unit: null, prev: null, delta: null, tone: "neutral", spark: [] },
        { key: "overdue", label: "Past deadline", value: overdue, unit: null, prev: null, delta: null, tone: "bad", spark: [] },
        { key: "close", label: "Median days to close", value: round(closeDays ?? 0, 1), unit: "days", prev: null, delta: null, tone: "neutral", spark: [] },
        { key: "ontime", label: "Median closed on time", value: round(onTime ?? 0, 0), unit: "%", prev: null, delta: null, tone: "neutral", spark: [] }
      ] },
      { kind: "Ranking", id: "rank", title: "Slowest departments first", unit: "days", method: "Average age of open incidents, departments with 5 or more open (the console's backlog card).", order: "top",
        items: slowest.map((x) => ({ key: String(x.item.code), label: clip(x.item.name, 120), value: round(x.value, 1), rank: x.rank,
          sub: `${spoken(Number(x.item.open ?? x.item.backlogOpen ?? 0))} open · ${spoken(Number(x.item.overdue ?? 0))} past deadline`, zone: null, lat: null, lon: null, action: "dept" as const })) },
      t.block,
      { kind: "Heat", id: "heat", title: "Department × measure (darker = worse within the column)", rows: heatRows.map((x) => clip(x.name, 80)), cols: cols.map((x) => x.l),
        cells: heatRows.map((x) => cols.map((col) => round(Number(x[col.k] ?? 0), 1))) }
    ] };
}

async function zonePerformance(c: Ctx): Promise<Part> {
  const { s, w } = c;
  const r = await call(c, "zones", { scope: scopeArg({ ...s, zone: null }) });
  const rows = (r.data as { rows: Row[] }).rows;
  const ranked = rank(rows, (x) => Number(x.score), 15);
  const t = await seriesBlock(c, { ...s, zone: null }, "Incidents reported over time");
  const cols = [{ k: "n", l: "Reported" }, { k: "severe", l: "Severe" }, { k: "high", l: "High" }, { k: "open", l: "Open" }, { k: "complaints", l: "Complaints" }];
  const tot = (k: string) => rows.reduce((a, x) => a + Number(x[k] ?? 0), 0);
  const title = `Zone performance · ${PERIOD_EN[s.period]}`;
  const [a, b] = ranked;
  if (!a) return { title, takeaway: null, say: bi("No zone data for this period.", "இந்தக் காலத்துக்கு மண்டலத் தரவு இல்லை."), blocks: [] };
  const vm = vsMedian(a.value, rows.map((x) => Number(x.score)));
  return { title,
    takeaway: vm.ratio ? bi(`${a.item.name} needs the most attention: ${spoken(vm.ratio)}× the median zone's score.`, `${zoneTa(w, Number(a.item.zone))} அதிக கவனம் தேவை: இடைநிலை மண்டலத்தை விட ${spoken(vm.ratio)} மடங்கு.`) : null,
    say: bi(`${a.item.name} needs the most attention: ${spoken(Number(a.item.severe))} severe and ${spoken(Number(a.item.open))} open.${b ? ` Then ${b.item.name}.` : ""}`,
      `${zoneTa(w, Number(a.item.zone))}: ${spoken(Number(a.item.severe))} கடுமையான, ${spoken(Number(a.item.open))} திறந்தவை.${b ? ` அடுத்து ${zoneTa(w, Number(b.item.zone))}.` : ""}`),
    blocks: [
      { kind: "Kpis", id: "kpis", title: "Key numbers", items: [
        { key: "n", label: `Reported, ${PERIOD_EN[s.period]}`, value: tot("n"), unit: null, prev: tot("n_prev") || null, delta: tot("n_prev") ? tot("n") - tot("n_prev") : null, tone: "neutral", spark: t.values.slice(-30) },
        { key: "severe", label: "Severe", value: tot("severe"), unit: null, prev: null, delta: null, tone: "bad", spark: [] },
        { key: "open", label: "Open", value: tot("open"), unit: null, prev: null, delta: null, tone: "neutral", spark: [] },
        { key: "complaints", label: "Open complaints", value: tot("complaints"), unit: null, prev: null, delta: null, tone: "neutral", spark: [] }
      ] },
      { kind: "Ranking", id: "rank", title: "Zones by attention score (worst first)", unit: "points", method: "Attention score = 3 × severe + high, as the console's 'Hotspot zones' tile.", order: "top",
        items: ranked.slice(0, 15).map((x) => ({ key: String(x.item.zone), label: clip(x.item.name, 80), value: x.value, rank: x.rank, sub: `${spoken(Number(x.item.severe))} severe · ${spoken(Number(x.item.open))} open`, zone: Number(x.item.zone), lat: null, lon: null, action: "zone" as const })) },
      { kind: "MapView", id: "map", title: "Attention score by zone", rule: null, shade: { geo: "zone", label: "Attention score", values: rows.map((x) => ({ key: Number(x.zone), value: Number(x.score) })) }, points: [], outline: ranked.slice(0, 3).map((x) => Number(x.item.zone)) },
      t.block,
      { kind: "Heat", id: "heat", title: "Zone × measure (darker = worse within the column)", rows: ranked.slice(0, 10).map((x) => clip(x.item.name, 80)), cols: cols.map((x) => x.l),
        cells: ranked.slice(0, 10).map((x) => cols.map((col) => Number(x.item[col.k] ?? 0))) }
    ] };
}

// ------------------------------------------------------------------ dashboard --

async function dashboard(c: Ctx): Promise<Part> {
  const { w, s } = c;
  const scope = scopeWords(w, { ...s, cat: null });
  const subject = catLabel(w, s.cat) ?? "Incidents";
  const [k, zr, hs, list] = await Promise.all([
    call(c, "overview_kpis", { scope: scopeArg(s) }),
    call(c, "zones", { scope: scopeArg({ ...s, zone: null }) }),
    call(c, "hotspots", { scope: scopeArg(s) }).catch(() => null),
    call(c, "incidents", { scope: scopeArg(s), sort: "sev", status: "open" })
  ]);
  const t = await seriesBlock(c, s, `${subject} over time`);
  const kd = k.data as { cur: Record<string, number>; prev: Record<string, number>; series: Record<string, number[]> };
  const zrows = (zr.data as { rows: Row[] }).rows;
  const zr5 = rank(zrows, (x) => Number(x.n), 5);
  const rows = ((list.data as { rows: Row[] }).rows ?? []).map((x) => caseRow(x, w)).slice(0, 8);
  const hot = ((hs?.data as { rows: Row[] } | undefined)?.rows ?? []).filter((x) => !s.cat || x.cat === s.cat).slice(0, 8);
  const pts: PointT[] = [...points(rows, 3), ...hot.map((x, i) => ({ n: null, id: String(x.id), lat: Number(x.lat), lon: Number(x.lon), label: `Hotspot: ${clip(x.top_place, 60)} (${spoken(Number(x.incidents_30d))} in 30 days)`, sev: null, value: Number(x.incidents_30d), hot: i === 0 }))];
  const tile = (key: string, label: string, tone: "bad" | "neutral") => ({ key, label, value: Number(kd.cur?.[key] ?? 0), unit: null, prev: num(kd.prev?.[key]), delta: num(kd.prev?.[key]) != null ? Number(kd.cur?.[key] ?? 0) - Number(kd.prev[key]) : null, tone, spark: (kd.series?.[key] ?? []).slice(-30) });
  const title = `${subject} dashboard · ${scope.en}`;
  const rep = Number(kd.cur?.reported ?? t.total);
  const prev = num(kd.prev?.reported);
  const ch = change(rep, prev);
  const topZone = zr5[0];
  return { title,
    takeaway: topZone ? bi(`${topZone.item.name} has the most: ${spoken(topZone.value)} of ${spoken(zrows.reduce((a, x) => a + Number(x.n), 0))}.`, `${zoneTa(w, Number(topZone.item.zone))} அதிகம்: ${spoken(topZone.value)}.`) : null,
    say: bi(`${spoken(rep)} ${subject.toLowerCase()} reports ${PERIOD_EN[s.period]}${ch.pct != null ? `, ${ch.pct >= 0 ? "up" : "down"} ${spoken(Math.abs(ch.pct))}% on the period before` : ""}. ${spoken(Number(kd.cur?.severe ?? 0))} severe.${topZone ? ` Most in ${topZone.item.name}.` : ""}`,
      `${PERIOD_TA[s.period]} ${subject}: ${spoken(rep)} புகார்கள், ${spoken(Number(kd.cur?.severe ?? 0))} கடுமையானவை.${topZone ? ` அதிகம் ${zoneTa(w, Number(topZone.item.zone))}.` : ""}`),
    blocks: [
      { kind: "Kpis", id: "kpis", title: "Key numbers", items: [tile("reported", "Reported", "neutral"), tile("severe", "Severe", "bad"), tile("ongoing", "Still open", "neutral"), tile("complaints", "Open complaints", "neutral")] },
      { kind: "MapView", id: "map", title: "Where", rule: "Numbered pins are the cases below; rings are hotspots (3+ incidents within 250 m in 30 days).", shade: { geo: "zone", label: subject, values: zrows.map((x) => ({ key: Number(x.zone), value: Number(x.n) })) }, points: pts, outline: [] },
      { kind: "Ranking", id: "zones", title: "Zones with the most", unit: "incidents", method: `${subject} reported by zone, ${PERIOD_EN[s.period]}.`, order: "top",
        items: zr5.map((x) => ({ key: String(x.item.zone), label: clip(x.item.name, 80), value: x.value, rank: x.rank, sub: `${spoken(Number(x.item.open))} open`, zone: Number(x.item.zone), lat: null, lon: null, action: "zone" as const })) },
      t.block,
      { kind: "CaseList", id: "cases", title: "Open cases, most serious first", source: "list", sev: null, total: Number((list.data as { total: number }).total ?? rows.length), rows }
    ] };
}

// ------------------------------------------------------------------ map --

async function mapScreen(c: Ctx): Promise<Part> {
  if (c.slots.what === "hotspots") return ranking({ ...c, slots: { ...c.slots, measure: "hotspots", n: c.slots.n ?? 8 } });
  const part = await cases({ ...c, slots: { ...c.slots, sev: c.slots.sev ?? (c.slots.what === "severe" || !c.slots.what ? "Severe" : null) } });
  // the map leads, the numbered list follows
  return { ...part, blocks: [...part.blocks].sort((a, b) => Number(b.kind === "MapView") - Number(a.kind === "MapView")) };
}

/** Distance in metres between two points (haversine). */
export function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

async function nearby(c: Ctx): Promise<Part> {
  const q = c.slots.q ?? c.heard;
  c.runs.push("ask_map");
  const r = await c.h.map(q);
  c.sources.add("Ask the Map");
  c.asOf ??= r.asOf?.data ?? null;
  const rows = ((r.rows ?? []) as Row[]).map((x) => caseRow(x, c.w));
  const feats = ((r.features ?? []) as Row[]).filter((f) => num(f.lat) != null);
  const placesNear = ((r.context?.points ?? []) as Row[]).filter((p) => num(p.lat) != null);
  const notes = ((r.trace ?? []) as Row[]).map((t) => String(t.note_en ?? ""));
  const radius = (() => {
    for (const n of notes) { const m = n.match(/within (\d+(?:\.\d+)?)\s*(km|m)\b/); if (m) return Number(m[1]) * (m[2] === "km" ? 1000 : 1); }
    return 1000;
  })();
  const headline = clip(String(r.answer?.headline ?? r.say?.en ?? "").replace(/\s*·\s*map layer ready\.?$/i, ""), 300);
  const title = clip(q, 200);
  const rule = `${notes.filter(Boolean).slice(-3).join(" ")}`.slice(0, 240) || null;
  // the places (schools, hospitals ...) next to the results, nearest first: each with its distance to the closest result
  const ranked = placesNear.map((p) => {
    let best = Infinity, to: Row | null = null;
    for (const f of feats) { const m = metres({ lat: Number(p.lat), lon: Number(p.lon) }, { lat: Number(f.lat), lon: Number(f.lon) }); if (m < best) { best = m; to = f; } }
    return { p, m: best, to };
  }).filter((x) => x.m <= radius).sort((a, b) => a.m - b.m);
  const within = ranked.length;
  ranked.splice(15);
  const blocks: BlockT[] = [];
  const pts: PointT[] = [
    ...ranked.map((x, i) => ({ n: i + 1, id: String(x.p.id), lat: Number(x.p.lat), lon: Number(x.p.lon), label: `${clip(x.p.name ?? x.p.kind, 100)} · ${spoken(x.m)} m`, sev: null, value: x.m, hot: i < 3 })),
    ...rows.slice(0, 60).filter((x) => x.lat != null).map((x) => ({ n: null, id: x.id, lat: x.lat as number, lon: x.lon as number, label: x.title, sev: x.sev, value: null, hot: false }))
  ];
  if (pts.length) blocks.push({ kind: "MapView", id: "map", title: headline || title, rule, shade: null, points: pts, outline: [] });
  if (ranked.length) {
    blocks.push({ kind: "Ranking", id: "near", title: `Nearest ${clip(ranked[0].p.layer ?? "places", 30)} to the results`, unit: "m", method: `Straight-line distance from each place to the closest result, within ${spoken(radius)} m (Ask the Map's rule).`, order: "bottom",
      items: ranked.map((x, i) => ({ key: String(x.p.id), label: clip(x.p.name ?? `${x.p.kind} (no name on the map)`, 120), value: x.m, rank: i + 1, sub: x.to ? clip(x.to.title, 120) : null, zone: null, lat: Number(x.p.lat), lon: Number(x.p.lon), action: "none" as const })) });
  }
  if (rows.length) blocks.push({ kind: "CaseList", id: "cases", title: "The incidents", source: "map", sev: null, total: Number(r.total ?? rows.length), rows: rows.slice(0, 30) });
  const nearest = ranked[0];
  const placeWord = clip(nearest?.p.layer ?? "place", 30).replace(/s$/, "");
  return {
    title, takeaway: headline ? bi(headline, headline) : null,
    say: ranked.length
      ? bi(`${plural(within, placeWord, `${placeWord}s`)} within ${spoken(radius)} metres of the results${within > ranked.length ? `; the nearest ${ranked.length} are listed` : ""}. The nearest: ${clip(nearest.p.name ?? placeWord, 80)}, ${spoken(nearest.m)} metres away.`,
        `${within} இடங்கள் ${spoken(radius)} மீட்டருக்குள். மிக அருகில்: ${clip(nearest.p.name ?? placeWord, 80)}, ${spoken(nearest.m)} மீட்டர்.`)
      : headline ? bi(headline, headline) : bi("Ask the Map found nothing for that.", "வரைபடத்தில் எதுவும் கிடைக்கவில்லை."),
    blocks
  };
}

// ------------------------------------------------------------------ brief, drafts --

async function brief(c: Ctx): Promise<Part> {
  const r = await call(c, "briefing", { scope: scopeArg(c.s) });
  const d = r.data as { headline: string[]; stats: Record<string, number>; attention: Row[]; emerging: Row[]; conditions: string | null };
  const points = [
    ...(d.headline ?? []).map((t) => ({ text: clip(t, 400), incidentId: null })),
    ...(d.attention ?? []).slice(0, 4).map((a) => ({ text: clip(`${a.title}${a.zone ? `, ${a.zone}` : ""}${a.why?.attention?.[0] ? `: ${a.why.attention[0]}` : ""}`, 400), incidentId: String(a.id) })),
    ...(d.emerging ?? []).slice(0, 2).map((e) => ({ text: clip(e.text, 400), incidentId: null })),
    ...(d.conditions ? [{ text: clip(`Conditions: ${d.conditions}`, 400), incidentId: null }] : [])
  ].slice(0, 10);
  const st = d.stats ?? {};
  return {
    title: `Briefing · ${PERIOD_EN[c.s.period]}`,
    takeaway: points[0] ? bi(points[0].text, points[0].text) : null,
    say: bi(`${points.length} points in today's brief. ${points[0]?.text ?? ""}`, `இன்றைய சுருக்கத்தில் ${points.length} குறிப்புகள். ${points[0]?.text ?? ""}`),
    blocks: [
      { kind: "Kpis", id: "kpis", title: "Key numbers", items: [
        { key: "reported", label: "Reported", value: Number(st.reported ?? 0), unit: null, prev: null, delta: num(st.change), tone: "neutral", spark: [] },
        { key: "severe", label: "Severe", value: Number(st.severe ?? 0), unit: null, prev: null, delta: null, tone: "bad", spark: [] },
        { key: "overdue", label: "Past deadline", value: Number(st.overdue ?? 0), unit: null, prev: null, delta: null, tone: "bad", spark: [] },
        { key: "newsOnly", label: "In the news only", value: Number(st.newsOnly ?? 0), unit: null, prev: null, delta: null, tone: "neutral", spark: [] }
      ] },
      { kind: "Brief", id: "brief", title: "The brief", points }
    ]
  };
}

async function drafts(): Promise<Part> {
  return { title: "Waiting for your approval", takeaway: null, say: bi("Here are the drafts waiting for your approval.", "உங்கள் ஒப்புதலுக்காகக் காத்திருக்கும் வரைவுகள் இவை."),
    blocks: [{ kind: "Drafts", id: "drafts", title: "Approval tray" }] };
}
