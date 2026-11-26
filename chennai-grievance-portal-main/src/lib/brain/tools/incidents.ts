/**
 * incidents: any count, ranking, split, trend or list of incidents, on the `cases` table (the effective status the dashboard's tiles count), so
 * the same question gives the same number as the tile. One engine for every wording: the model fills in what was asked.
 */
import { caseRows } from "../sql";
import { istWords, toPart } from "../format";
import { deptName, deptOf, kindsOf, nearPlaces, placeOf, sevOf, talukOf, zoneName, zoneOf } from "../names";
import { WHEN_SCHEMA, winOf, type WhenIn, type Win } from "../when";
import { ToolProblem, type BrainTool, type Col, type Part, type Rec, type ToolCtx, type ToolOut } from "../types";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0) || 0;

const DIMS = ["zone", "ward", "taluk", "locality", "dept", "kind", "family", "severity", "status", "day", "week", "month", "hour", "weekday", "reported_by", "officer"] as const;
type Dim = (typeof DIMS)[number];
const MEASURES = ["reported", "open", "overdue", "severe", "severe_open", "resolved", "complaints", "deaths", "injured", "avg_days_open", "avg_days_to_close", "outlets", "change", "change_pct"] as const;

const KEY: Record<Dim, { key: string; label: string; name: string }> = {
  zone: { key: "c.zone_no", label: "MAX(c.zone)", name: "Zone" }, ward: { key: "c.ward_no", label: "'Ward ' || c.ward_no || ' (' || COALESCE(MAX(c.zone), '') || ')'", name: "Ward" },
  taluk: { key: "c.taluk_code", label: "MAX(c.taluk)", name: "Taluk" }, locality: { key: "c.locality", label: "MAX(c.locality)", name: "Locality" },
  dept: { key: "c.dept_code", label: "MAX(c.dept)", name: "Department" }, kind: { key: "c.kind_code", label: "MAX(c.kind)", name: "Kind" }, family: { key: "c.family", label: "MAX(c.family)", name: "Group of kinds" },
  severity: { key: "c.severity", label: "c.severity", name: "Severity" }, status: { key: "c.status", label: "c.status", name: "Status" },
  day: { key: "substr(@t, 1, 10)", label: "substr(@t, 1, 10)", name: "Day" }, week: { key: "date(@t, 'weekday 0', '-6 days')", label: "date(@t, 'weekday 0', '-6 days')", name: "Week starting" },
  month: { key: "substr(@t, 1, 7)", label: "substr(@t, 1, 7)", name: "Month" }, hour: { key: "substr(@t, 12, 2)", label: "substr(@t, 12, 2)", name: "Hour of day" },
  weekday: { key: "strftime('%w', @t)", label: "strftime('%w', @t)", name: "Weekday" }, reported_by: { key: "c.sources", label: "c.sources", name: "Reported by" }, officer: { key: "c.officer", label: "c.officer", name: "Officer" }
};
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SOURCE_WORDS: Record<string, string> = { grievance: "citizen complaint", police: "police", pwd: "PWD", hospital: "hospital", news: "news", imd: "IMD" };
export const sourceWords = (s: unknown): string => String(s ?? "").split(/[|,;]\s*/).filter(Boolean).map((x) => SOURCE_WORDS[x.trim()] ?? x.trim()).join(" + ") || "unknown";

export interface IncIn {
  when?: WhenIn | null; date_of?: "reported" | "closed" | null;
  zones?: (string | number)[]; place?: string | null; ward?: number | null; taluks?: string[]; depts?: string[]; kinds?: string[]; severities?: string[];
  status?: string | null; reported_by?: string[]; news_only?: boolean | null; min_outlets?: number | null; min_sources?: number | null; min_complaints?: number | null; with_deaths?: boolean | null; with_injured?: boolean | null;
  words?: string[]; older_than_days?: number | null; hour_from?: number | null; hour_to?: number | null; needs_review?: boolean | null; awaiting_check?: boolean | null; in_records?: boolean | null;
  exclude?: { zones?: (string | number)[]; depts?: string[]; kinds?: string[]; severities?: string[] } | null;
  group_by?: string[]; rank_by?: string | null; order?: "most" | "least" | null; limit?: number | null; list?: boolean | null; sort?: string | null; compare?: boolean | null;
}

export interface Where { sql: string[]; params: unknown[]; words: string[]; limits: string[] }

/** the limits asked, as SQL over cases c, and in words */
export function whereOf(i: IncIn, c: ToolCtx): Where {
  const w = c.world, sql: string[] = [], params: unknown[] = [], words: string[] = [], limits: string[] = [];
  const add = (s: string, ...p: unknown[]) => { sql.push(s); params.push(...p); };
  const inList = (col: string, xs: unknown[], not = false) => add(`${not ? `COALESCE(${col}, '') NOT` : col} IN (${xs.map(() => "?").join(", ")})`, ...xs);
  const base = { zone: null as number | null };
  if (i.zones?.length) { const zs = i.zones.map((z) => zoneOf(z, w)); inList("c.zone_no", zs); words.push(`in ${zs.map((z) => `${zoneName(z, w)} zone`).join(" and ")}`); base.zone = zs[0]; }
  if (i.ward) { add("c.ward_no = ?", i.ward); words.push(`in ward ${i.ward}`); }
  if (i.taluks?.length) { const ts = i.taluks.map((t) => talukOf(t, w)); inList("c.taluk_code", ts.map((t) => t.code)); words.push(`in ${ts.map((t) => `${t.name} taluk`).join(" and ")}`); }
  if (i.place?.trim()) {
    const p = placeOf(i.place, w);
    const names = [...new Set([i.place, ...(p ? [p.name, ...p.aliases] : [])].map((x) => x.toLowerCase().replace(/[^a-z0-9஀-௿ ]+/g, " ").replace(/\s+/g, " ").trim()).filter((x) => x.length >= 3))].slice(0, 8);
    const hay = "(' ' || REPLACE(REPLACE(REPLACE(LOWER(COALESCE(c.place, '') || ' , ' || COALESCE(c.title, '')), '.', ' '), ',', ' '), '  ', ' '))";
    add(`(${names.map(() => `${hay} LIKE ?`).join(" OR ")})${p?.zone ? " AND (c.zone_no = ? OR c.zone_no IS NULL)" : ""}`, ...names.map((x) => `% ${x.replace(/[%_]/g, "")}%`), ...(p?.zone ? [p.zone] : []));
    words.push(`naming ${p?.name ?? i.place}`);
    limits.push(p ? `${p.name} is a locality${p.zone ? ` in ${zoneName(p.zone, w)} zone` : ""}: incidents are matched by that name in their place or headline.`
      : `"${i.place}" is not in the gazetteer, so it is matched as words in the place and headline.${nearPlaces(i.place, w).length ? ` Close names: ${nearPlaces(i.place, w).join(", ")}.` : ""}`);
  }
  const lock = c.user.lockDept;
  if (lock) { add("c.dept_code = ?", lock); words.push(`of ${deptName(lock, w)}`); limits.push("This console answers for its own department only."); }
  else if (i.depts?.length) { const ds = i.depts.map((d) => deptOf(d, w)); inList("c.dept_code", ds.map((d) => d.code)); words.push(`led by ${ds.map((d) => d.name).join(" or ")}`); }
  if (i.kinds?.length) { const ks = i.kinds.map((k) => kindsOf(k, w)); inList("c.kind_code", [...new Set(ks.flatMap((k) => k.codes))]); words.push(`of ${ks.map((k) => k.name).join(" or ")}`); }
  if (i.severities?.length) { const ss = [...new Set(i.severities.map(sevOf))]; inList("c.severity", ss); words.push(`rated ${ss.join(" or ")}`); }
  const st = i.status?.trim().toLowerCase();
  if (st) {
    if (["open", "unresolved", "pending", "ongoing", "active", "not resolved"].includes(st)) { add("c.is_open = 1"); words.push("still open"); }
    else if (["overdue", "late", "past deadline", "delayed"].includes(st)) { add("c.is_overdue = 1"); words.push("open and past their deadline"); }
    else if (["resolved", "closed", "completed"].includes(st)) { add("c.is_resolved = 1"); words.push("resolved"); }
    else if (/verif|awaiting/.test(st)) { add("(c.awaiting_collector = 1 OR c.status = 'Awaiting verification')"); words.push("awaiting verification"); }
    else { add("LOWER(c.status) = ?", st); words.push(`with status ${i.status}`); }
  }
  for (const r of i.reported_by ?? []) {
    const k = r.toLowerCase();
    if (/citizen|complaint|grievance|portal/.test(k)) { add("c.complaints > 0"); words.push("reported by citizens"); }
    else if (/police/.test(k)) { add("c.police_reports > 0"); words.push("with a police report"); }
    else if (/pwd|public works/.test(k)) { add("c.sources LIKE '%pwd%'"); words.push("with a PWD record"); }
    else if (/hospital/.test(k)) { add("c.sources LIKE '%hospital%'"); words.push("with a hospital record"); }
    else if (/news|paper|media/.test(k)) { add("c.outlets > 0"); words.push("reported in the news"); }
    else throw new ToolProblem(`"${r}" is not a source: citizens, police, pwd, hospital or news.`);
  }
  if (i.news_only != null) { add("c.news_only = ?", i.news_only ? 1 : 0); words.push(i.news_only ? "seen only in the news (in no department record)" : "with a department record"); }
  if (i.in_records === false && i.news_only == null) { add("c.news_only = 1"); words.push("missing from every department application"); }
  if (i.min_outlets) { add("c.outlets >= ?", i.min_outlets); words.push(`carried by ${i.min_outlets} or more news outlets`); }
  if (i.min_sources) { add("c.source_count >= ?", i.min_sources); words.push(`reported by ${i.min_sources} or more sources`); }
  if (i.min_complaints) { add("c.complaints >= ?", i.min_complaints); words.push(`with ${i.min_complaints} or more citizen complaints`); }
  if (i.with_deaths) { add("c.dead > 0"); words.push("with deaths"); }
  if (i.with_injured) { add("c.injured > 0"); words.push("with people injured"); }
  if (i.needs_review) { add("c.needs_review = 1"); words.push("needing a location or grouping check"); }
  if (i.awaiting_check) { add("c.awaiting_collector = 1"); words.push("waiting for the Collector's check"); }
  if (i.older_than_days) { add("c.reported_at < ?", new Date(Date.parse(`${c.now.replace(" ", "T")}Z`) - i.older_than_days * 864e5).toISOString().slice(0, 19).replace("T", " ")); words.push(`reported more than ${i.older_than_days} days ago`); }
  if (i.hour_from != null && i.hour_to != null) {
    const [a, b] = [i.hour_from, i.hour_to];
    add(a < b ? "(CAST(substr(c.reported_at, 12, 2) AS INT) >= ? AND CAST(substr(c.reported_at, 12, 2) AS INT) < ?)" : "(CAST(substr(c.reported_at, 12, 2) AS INT) >= ? OR CAST(substr(c.reported_at, 12, 2) AS INT) < ?)", a, b);
    words.push(`between ${a}:00 and ${b}:00`);
  }
  if (i.words?.length) {
    const ways = i.words.map((x) => x.toLowerCase().trim()).filter((x) => x.length >= 2).slice(0, 8);
    const text = "LOWER(COALESCE(c.title, '') || ' ' || COALESCE(c.place, '') || ' ' || COALESCE((SELECT COALESCE(x.summary, '') || ' ' || COALESCE(x.ai_summary, '') || ' ' || COALESCE(x.title, '') FROM incidents x WHERE x.incident_id = c.id), ''))";
    add(`(${ways.map((x) => `(${x.split(/\s+/).map(() => `HAS_WORD(${text}, ?) = 1`).join(" AND ")})`).join(" OR ")})`, ...ways.flatMap((x) => x.split(/\s+/)));
    words.push(`mentioning ${ways.map((x) => `"${x}"`).join(" or ")}`);
    limits.push("Matched by the words in the headline, place and summary; another wording of the same thing may be missed (the search tool also finds by meaning).");
  }
  const x = i.exclude;
  if (x?.zones?.length) { const zs = x.zones.map((z) => zoneOf(z, w)); add(`COALESCE(c.zone_no, 0) NOT IN (${zs.map(() => "?").join(", ")})`, ...zs); words.push(`outside ${zs.map((z) => zoneName(z, w)).join(" and ")}`); }
  if (x?.depts?.length) { const ds = x.depts.map((d) => deptOf(d, w)); inList("c.dept_code", ds.map((d) => d.code), true); words.push(`not of ${ds.map((d) => d.name).join(" or ")}`); }
  if (x?.kinds?.length) { const ks = x.kinds.map((k) => kindsOf(k, w)); inList("c.kind_code", ks.flatMap((k) => k.codes), true); words.push(`other than ${ks.map((k) => k.name).join(", ")}`); }
  if (x?.severities?.length) inList("c.severity", x.severities.map(sevOf), true);
  return { sql, params, words, limits };
}

const AGG = `COUNT(*) AS reported, SUM(c.is_open) AS open, SUM(c.is_overdue) AS overdue, SUM(c.severity = 'Severe') AS severe, SUM(c.severity = 'Severe' AND c.is_open = 1) AS severe_open, SUM(c.is_resolved) AS resolved,
  SUM(CASE WHEN c.is_open = 1 THEN c.complaints ELSE 0 END) AS complaints, SUM(c.dead) AS deaths, SUM(c.injured) AS injured, MAX(c.outlets) AS outlets,
  ROUND(AVG(CASE WHEN c.is_open = 1 THEN julianday(@now) - julianday(c.reported_at) END), 1) AS avg_days_open,
  ROUND(AVG(CASE WHEN c.is_resolved = 1 AND c.resolved_at >= c.reported_at THEN julianday(c.resolved_at) - julianday(c.reported_at) END), 1) AS avg_days_to_close`;

const rangeSql = (w: Win, col: string, prev = false): { sql: string; params: string[] } => {
  const from = prev ? w.prev!.from : w.from, to = prev ? w.prev!.to : w.to;
  const gt = w.period && w.period !== "daily" ? ">" : ">=";
  return { sql: `${col} ${gt} ? AND ${col} ${prev && (w.open || w.period) ? (w.period && w.period !== "daily" ? "<=" : "<") : "<="} ?`, params: [from, to] };
};

const CASE_COLS: Col[] = [{ key: "n", label: "#" }, { key: "id", label: "Incident", kind: "id" }, { key: "title", label: "What" }, { key: "severity", label: "Severity" }, { key: "status", label: "Status" }, { key: "kind", label: "Kind" },
  { key: "place", label: "Place" }, { key: "zone", label: "Zone" }, { key: "dept", label: "Department" }, { key: "reported_at", label: "Reported", kind: "time" }, { key: "complaints", label: "Complaints", kind: "number" },
  { key: "outlets", label: "News outlets", kind: "number" }, { key: "reported_by", label: "Reported by" }, { key: "deaths", label: "Deaths", kind: "number" }, { key: "injured", label: "Injured", kind: "number" }, { key: "overdue", label: "Past deadline" }, { key: "why", label: "Why it ranks" }];

export async function caseList(where: string, params: unknown[], o: { sort?: string | null; limit?: number } = {}): Promise<Rec[]> {
  const sort = (o.sort ?? "priority").toLowerCase();
  const order = /newest|latest|recent/.test(sort) ? "c.reported_at DESC" : /oldest|longest|waiting/.test(sort) ? "c.reported_at ASC" : /complaint/.test(sort) ? "c.complaints DESC, c.priority DESC" : /death|dead|casualt/.test(sort) ? "c.dead DESC, c.injured DESC, c.priority DESC"
    : /outlet|news/.test(sort) ? "c.outlets DESC, c.priority DESC" : /sever|serious/.test(sort) ? "CASE c.severity WHEN 'Severe' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, c.is_open DESC, c.priority DESC" : "c.is_open DESC, c.priority DESC, c.reported_at DESC";
  const rows = await caseRows(`SELECT c.* FROM cases c WHERE ${where} ORDER BY ${order} LIMIT ?`, [...params, Math.min(Math.max(o.limit ?? 10, 1), 60)]);
  return rows.map((r, k) => ({ n: k + 1, id: String(r.id), title: String(r.title ?? r.kind ?? ""), severity: r.severity as string, status: r.status as string, kind: r.kind as string, kind_code: r.kind_code as string, place: (r.place ?? null) as string | null, zone: (r.zone ?? null) as string | null,
    zone_no: (r.zone_no ?? null) as number | null, ward: (r.ward_no ?? null) as number | null, taluk: (r.taluk ?? null) as string | null, dept: (r.dept ?? null) as string | null, dept_code: (r.dept_code ?? null) as string | null, reported_at: istWords(r.reported_at), t: String(r.reported_at ?? ""),
    complaints: n(r.complaints), outlets: n(r.outlets), reported_by: sourceWords(r.sources), deaths: n(r.dead), injured: n(r.injured), overdue: n(r.is_overdue) === 1, open: n(r.is_open) === 1, resolved_at: r.resolved_at ? istWords(r.resolved_at) : null,
    due_at: r.due_at ? istWords(r.due_at) : null, lat: (r.lat ?? null) as number | null, lon: (r.lon ?? null) as number | null, why: String(r.attention || r.priority_why || "").slice(0, 160) }));
}
export const casesPart = (key: string, title: string, rows: Rec[], total?: number): Part => ({ key, title, cols: CASE_COLS, rows, total, of: "cases" });

export const label = (d: Dim, v: unknown, c: Pick<ToolCtx, "world">): string => {
  if (v == null || v === "") return d === "zone" ? "No zone on record" : "Not recorded";
  if (d === "weekday") return DAYS[Number(v)] ?? String(v);
  if (d === "hour") { const h = Number(v); return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`; }
  if (d === "day") return istWords(String(v), false);
  if (d === "week") return istWords(String(v), false);
  if (d === "month") return istWords(`${v}-01`, true).replace(/^1 /, "");
  if (d === "reported_by") return sourceWords(v);
  if (d === "zone" && /^\d+$/.test(String(v))) return zoneName(Number(v), c.world);
  return String(v);
};

async function run(input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  const i = input as IncIn;
  const dims = (i.group_by ?? []).filter((d): d is Dim => (DIMS as readonly string[]).includes(d)).slice(0, 2);
  const wrong = (i.group_by ?? []).filter((d) => !(DIMS as readonly string[]).includes(d));
  if (wrong.length) throw new ToolProblem(`Cannot group by ${wrong.join(", ")}: use ${DIMS.join(", ")}.`);
  // the papers' incidents that no department application holds have one list, the dashboard's (two counts of it were once said side by side)
  if (i.news_only && !dims.length) throw new ToolProblem('What the newspapers carry and no department application holds is the dashboard\'s list: call news {"view":"missing_from_records"} (min_outlets 2 = more than one newspaper) and use its figures only.');
  const w = winOf(i.when, c.now, "last_90_days");
  const closed = i.date_of === "closed";
  const col = closed ? "c.resolved_at" : "c.reported_at";
  const wh = whereOf(i, c);
  const limits = [...wh.limits];
  if (!i.when) limits.push(`No time was given: ${w.label} is counted.`);
  const held = (await caseRows("SELECT MIN(reported_at) AS a FROM cases"))[0]?.a as string | undefined;
  if (held && w.to < held) throw new ToolProblem(`The records begin on ${istWords(held.slice(0, 10))}: nothing is held for ${w.label}.`);
  if (held && w.from < held && w.label !== "everything on record") limits.push(`The records begin on ${istWords(held.slice(0, 10))}, so the window is counted from there.`);
  const cur = rangeSql(w, col), closedOnly = closed ? ["c.is_resolved = 1"] : [];
  const base = [cur.sql, ...closedOnly, ...wh.sql].join(" AND "), params = [...cur.params, ...wh.params];
  const agg = AGG.replace(/@now/g, `'${c.now}'`);
  const what = `incidents ${wh.words.join(", ")}`.trim();
  const [t] = await caseRows(`SELECT ${agg} FROM cases c WHERE ${base}`, params);
  let prev: Row | null = null;
  if (w.prev && (i.compare !== false || i.rank_by === "change" || i.rank_by === "change_pct")) {
    if (!held || w.prev.from >= held.slice(0, 10)) {
      const p = rangeSql(w, col, true);
      prev = (await caseRows(`SELECT ${agg} FROM cases c WHERE ${[p.sql, ...closedOnly, ...wh.sql].join(" AND ")}`, [...p.params, ...wh.params]))[0] ?? null;
    } else if (i.compare) limits.push(`The records do not reach the time before (${w.prev.label}), so there is no comparison.`);
  }
  const num = (r: Row | null, k: string) => (r?.[k] == null ? null : n(r[k]));
  // (a limit that decides a figure makes it say nothing: "open only" with "resolved 0" was once said to be "none was resolved")
  const only = /open|unresolved|pending|ongoing|active|overdue|late|deadline/i.test(i.status ?? "") ? "open" : /resolved|closed/i.test(i.status ?? "") ? "resolved" : null;
  const skip = new Set<string>([...(only === "open" ? ["resolved", "avg_days_to_close"] : only === "resolved" ? ["open", "overdue", "complaints", "avg_days_open"] : [])]);
  const kp = (["reported", "severe", "open", "overdue", "resolved", "complaints", "deaths", "injured"] as const).filter((k) => !skip.has(k) && !(only === "open" && k === "open"));
  const KW: Record<string, string> = { reported: closed ? "Closed in the window" : only === "open" ? "Still open (unresolved), of those reported in the window" : only === "resolved" ? "Resolved, of those reported in the window" : "Incidents reported", severe: "Severe", open: "Still open (unresolved)", overdue: "Open past deadline", resolved: closed ? "Resolved in the window" : "Of those reported, already resolved", complaints: "Open citizen complaints", deaths: "Deaths", injured: "Injured" };
  const totals: Part = { key: "tot", title: "Totals", of: "kpis", cols: [{ key: "figure", label: "Figure" }, { key: "value", label: "Value", kind: "number" }, { key: "before", label: w.prev?.label ?? "Before", kind: "number" }],
    rows: kp.filter((k) => !closed || ["reported", "severe", "deaths", "injured"].includes(k)).map((k) => ({ figure: KW[k], key: k, value: num(t, k) ?? 0, before: num(prev, k) })) };
  const avgO = num(t, "avg_days_open"), avgC = num(t, "avg_days_to_close");
  if (avgO != null && t?.avg_days_open != null && !skip.has("avg_days_open")) totals.rows.push({ figure: "Average days the open ones have waited", key: "avg_days_open", value: avgO, before: null });
  if (avgC != null && t?.avg_days_to_close != null && !skip.has("avg_days_to_close")) totals.rows.push({ figure: "Average days to close (the resolved ones)", key: "avg_days_to_close", value: avgC, before: null });
  // the Resolved tile counts by closing time, whenever the case was reported: both are given, each under its own name
  if (!closed && !only && !i.news_only) {
    const cl = async (prevSide: boolean) => { const p = rangeSql(w, "c.resolved_at", prevSide); return n((await caseRows(`SELECT COUNT(*) AS n FROM cases c WHERE ${[p.sql, "c.is_resolved = 1", ...wh.sql].join(" AND ")}`, [...p.params, ...wh.params]))[0]?.n); };
    totals.rows.push({ figure: "Cases of any report date that were closed in the window (the Resolved tile)", key: "closed", value: await cl(false), before: prev ? await cl(true) : null });
  }
  const parts: Part[] = [totals];
  const ids: string[] = [];
  const total = n(t?.reported);
  if (dims.length) {
    const sel = dims.map((d, k) => `${KEY[d].key.replace(/@t/g, col)} AS k${k}, ${KEY[d].label.replace(/@t/g, col)} AS l${k}`).join(", ");
    const by = dims.map((d) => KEY[d].key.replace(/@t/g, col)).join(", ");
    const read = (where: string, p: unknown[]) => caseRows(`SELECT ${sel}, ${agg} FROM cases c WHERE ${where} GROUP BY ${by} LIMIT 1500`, p);
    const rows = await read(base, params);
    const timeDim = dims.some((d) => ["day", "week", "month", "hour", "weekday"].includes(d));
    let before: Map<string, Row> | null = null;
    if (prev && w.prev && !timeDim) {
      const p = rangeSql(w, col, true);
      before = new Map((await read([p.sql, ...closedOnly, ...wh.sql].join(" AND "), [...p.params, ...wh.params])).map((r) => [dims.map((_, k) => String(r[`k${k}`])).join("|"), r]));
    }
    const wide = dims.some((d) => d === "reported_by");
    let out: Rec[] = rows.map((r) => {
      const b = before?.get(dims.map((_, k) => String(r[`k${k}`])).join("|"));
      const was = b ? n(b.reported) : before ? 0 : null, now = n(r.reported);
      return { ...Object.fromEntries(dims.flatMap((d, k) => [[d, label(d, r[`l${k}`] ?? r[`k${k}`], c)], [`${d}_key`, r[`k${k}`] as string | number | null]])), reported: now, open: n(r.open), overdue: n(r.overdue), severe: n(r.severe), severe_open: n(r.severe_open), resolved: n(r.resolved),
        complaints: n(r.complaints), deaths: n(r.deaths), injured: n(r.injured), avg_days_open: r.avg_days_open == null ? null : n(r.avg_days_open), avg_days_to_close: r.avg_days_to_close == null ? null : n(r.avg_days_to_close),
        ...(was != null ? { before: was, change: now - was, change_pct: was >= 1 ? Math.round(((now - was) / was) * 100) : null } : {}) } as Rec;
    });
    if (wide) out = merged(out, dims);
    const rankBy = (MEASURES as readonly string[]).includes(String(i.rank_by)) ? String(i.rank_by) : "reported";
    const named = out.filter((r) => !/^(No zone on record|Not recorded)$/.test(String(r[dims[0]])));
    const none = out.filter((r) => /^(No zone on record|Not recorded)$/.test(String(r[dims[0]])));
    const dirn = i.order === "least" ? 1 : -1;
    if (timeDim && !i.rank_by) named.sort((a, b) => dims.map((d) => String(a[`${d}_key`]).localeCompare(String(b[`${d}_key`]))).find((x) => x !== 0) ?? 0);
    else named.sort((a, b) => dirn * ((Number(a[rankBy] ?? -1e9)) - (Number(b[rankBy] ?? -1e9))) || dirn * (n(a.severe) - n(b.severe)) || String(a[dims[0]]).localeCompare(String(b[dims[0]])));
    if (none.length) limits.push(`${none.reduce((s, r) => s + n(r.reported), 0)} of them have no ${KEY[dims[0]].name.toLowerCase()} on record and are left out of the ranking.`);
    const lim = Math.min(Math.max(i.limit ?? (timeDim && dims.length > 1 ? 400 : timeDim ? 120 : dims.length > 1 ? 120 : 25), 1), 400);
    const shown = named.slice(0, lim).map((r, k) => ({ rank: k + 1, ...r }) as Rec);
    const cols: Col[] = [...(timeDim && !i.rank_by ? [] : [{ key: "rank", label: "#" }]), ...dims.map((d) => ({ key: d, label: KEY[d].name })), { key: "reported", label: closed ? "Closed" : only === "open" ? "Still open" : only === "resolved" ? "Resolved" : "Reported", kind: "number" as const },
      ...(closed || only ? [] : [{ key: "open", label: "Still open", kind: "number" as const }, { key: "overdue", label: "Past deadline", kind: "number" as const }]), { key: "severe", label: "Severe", kind: "number" as const },
      ...(closed || only === "resolved" ? [] : [...(only ? [] : [{ key: "resolved", label: "Resolved", kind: "number" as const }]), { key: "complaints", label: "Open complaints", kind: "number" as const }]), { key: "deaths", label: "Deaths", kind: "number" as const }, { key: "injured", label: "Injured", kind: "number" as const },
      { key: "avg_days_open", label: "Avg days open", kind: "number" as const }, { key: "avg_days_to_close", label: "Avg days to close", kind: "number" as const },
      ...(before ? [{ key: "before", label: `Reported, ${w.prev!.label}`, kind: "number" as const }, { key: "change", label: "Change", kind: "number" as const }, { key: "change_pct", label: "Change %", kind: "number" as const }] : [])];
    if (only === "open") cols.splice(cols.findIndex((x) => x.key === "severe"), 0, { key: "overdue", label: "Past deadline", kind: "number" });
    parts.push({ key: "by", title: `By ${dims.map((d) => KEY[d].name.toLowerCase()).join(" and ")}${i.rank_by ? `, ranked by ${rankBy.replace(/_/g, " ")} (${i.order === "least" ? "lowest" : "highest"} first)` : ""}`, cols, rows: shown, total: named.length, of: timeDim ? "series" : "rank",
      note: [rankBy === "reported" ? "" : `ranked by ${rankBy}`, (() => { const k = timeDim && !i.rank_by ? 0 : named.filter((r) => Number(r[rankBy] ?? 0) === Number(named[0]?.[rankBy] ?? 0)).length; return k >= 2 ? `the first ${k} tie at ${Number(named[0]?.[rankBy] ?? 0)}` : ""; })()].filter(Boolean).join("; ") || null });
  }
  if (i.list || (!dims.length && i.list !== false && total > 0 && total <= 12)) {
    const rows = await caseList(base, params, { sort: i.sort, limit: i.limit ?? 10 });
    ids.push(...rows.map((r) => String(r.id)));
    parts.push(casesPart("cases", `The incidents${i.sort ? `, ${i.sort} first` : ", most urgent first"}`, rows, total));
  }
  return {
    about: `${total} ${what}${closed ? ", by when they were closed" : ""}`, when: `${w.label}${prev && w.prev ? `; compared with ${w.prev.label}` : ""}`, parts, ids, asOf: c.now, limits,
    sources: ["the incident register (citizen complaints, police, PWD, hospital and news reports joined into incidents; table incidents with the Collector's decisions)"],
    method: `An incident is counted ${closed ? "by the time it was closed as resolved" : "by its first report time"}. Open = not resolved, rejected or lapsed, as on the dashboard tiles; past deadline = open and past the deadline of its kind and severity; complaints = citizen complaints on open incidents.`
  };
}

/** the same sources listed in another order are one */
function merged(rows: Rec[], dims: readonly string[]): Rec[] {
  const m = new Map<string, Rec>();
  for (const r of rows) {
    const k = dims.map((d) => (d === "reported_by" ? String(r[d]).split(" + ").sort().join(" + ") : String(r[d]))).join("|");
    const had = m.get(k);
    if (!had) m.set(k, { ...r });
    else for (const key of ["reported", "open", "overdue", "severe", "severe_open", "resolved", "complaints", "deaths", "injured"]) had[key] = n(had[key]) + n(r[key]);
  }
  return [...m.values()];
}

const arr = (description: string, items: Record<string, unknown> = { type: "string" }) => ({ type: "array", items, description });
export const incidentsTool: BrainTool = {
  name: "incidents",
  description: "Count, rank, split, compare over time or list incidents (cases, complaints, crimes, accidents, floods... everything departments, citizens and the news reported), with any mix of limits. Gives totals (reported, severe, open, overdue, resolved, complaints, deaths, injured) with the window before, the split asked (group_by one or two things: zone x month, kind x week...) and, with list: true, the incidents themselves. Same rules as the dashboard's tiles. Use it for: how many, which area/taluk/department/kind has the most or least, unresolved by taluk last month, quarterly trend of categories (group_by [\"month\",\"kind\"]), resolution time, share, what rose, the most serious cases, cases in more than one newspaper missing from the department applications (min_outlets 2, news_only true).",
  doing: { en: "Counting the incidents", ta: "சம்பவங்களை எண்ணுகிறேன்" },
  input: {
    type: "object", additionalProperties: false,
    properties: {
      when: WHEN_SCHEMA,
      date_of: { type: "string", enum: ["reported", "closed"], description: "closed = count what was closed in the window (the Resolved tile); default reported" },
      zones: arr("zone numbers or names", { type: ["integer", "string"] }), place: { type: "string", description: "a locality, road or spot that is not itself a zone or taluk" }, ward: { type: "integer" }, taluks: arr("taluk names or codes"),
      depts: arr("department codes or names (PWD alone = PWD-WRD and PWD-BLD)"), kinds: arr("kind codes or group names (CRIME, FLOOD, ROADS_TRAFFIC, WORKS...)"), severities: arr("Severe, High, Medium, Low"),
      status: { type: "string", description: "open (= unresolved), overdue, resolved, awaiting verification, or a status by name" }, reported_by: arr("only those reported by: citizens, police, pwd, hospital, news"),
      news_only: { type: "boolean", description: "true: only in the news, in no department application; false: has a department record" }, min_outlets: { type: "integer", description: "at least this many news outlets (2 = more than one newspaper)" }, min_sources: { type: "integer" }, min_complaints: { type: "integer" },
      with_deaths: { type: "boolean" }, with_injured: { type: "boolean" }, words: arr("a thing narrower than any kind (murder, tree fall, school): the word and its other usual English words"),
      older_than_days: { type: "integer" }, hour_from: { type: "integer" }, hour_to: { type: "integer" },
      exclude: { type: "object", additionalProperties: false, properties: { zones: arr("", { type: ["integer", "string"] }), depts: arr(""), kinds: arr(""), severities: arr("") } },
      group_by: arr("one or two things to split by", { type: "string", enum: [...DIMS] }), rank_by: { type: "string", enum: [...MEASURES], description: "what the split is ranked by; left out: reported, or time order for days/months" }, order: { type: "string", enum: ["most", "least"] },
      limit: { type: "integer", description: "rows wanted: 'top two' 2; left out: all" }, list: { type: "boolean", description: "true to get the incidents themselves" }, sort: { type: "string", enum: ["priority", "severity", "newest", "oldest", "complaints", "deaths", "outlets"] },
      compare: { type: "boolean", description: "false to skip the window before" }
    }
  },
  run
};
