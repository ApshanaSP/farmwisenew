/**
 * The short AI write-ups the Collector reads on the Briefing and Trends pages: the day's key points (incidents,
 * grievances, news, weather, all in one), a department's brief, what is behind the rising problems, and what is behind
 * one unusual spike, recurring hotspot or category trend, each with suggested next steps.
 *
 * Every write-up is built only from facts computed from the store, and checked: every number in the text must be one
 * of the facts' numbers, else it is written again once and then left out (the page keeps its rule-based text). Results
 * are keyed on the facts themselves, so a write-up is reused until the data behind it changes (memory and
 * data/aws-cache/aibrief.json).
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { RowDataPacket } from "mysql2";
import { generateJson } from "@/lib/ai/gateway";
import intelPool, { TITLE } from "@/lib/collector/db";
import { PERIODS, asOf, awaitingCheck, newsStories, periodWindow, type Period } from "@/lib/collector/intel";
import { pctChange, unusualEnough } from "@/lib/reference/metrics";
import { categories } from "@/lib/collector/nlp";
import { numbersHold, when } from "@/lib/collector/analysis";
import type { PatternDetail } from "@/lib/collector/insights";
import { orEmpty } from "@/lib/fallback";
import { alertLane, type AlertLane } from "@/lib/collector/alerts";

type Row = Record<string, any>;
async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(sql, params);
  return r as unknown as T[];
}
const n = (v: unknown) => Number(v ?? 0);
const one = (s: unknown, max = 160) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// ------------------------------------------------------------------- cache --

const FILE = path.join(process.cwd(), "data", "aws-cache", "aibrief.json");
interface Stored { o: unknown; model: string; at: string }
declare global {
  // eslint-disable-next-line no-var
  var __aibrief: { cache: Map<string, Stored> | null; busy: Map<string, Promise<Stored | null>> } | undefined;
}
const g = (global.__aibrief ??= { cache: null, busy: new Map() });
function cache(): Map<string, Stored> {
  if (g.cache) return g.cache;
  try { g.cache = new Map(Object.entries(JSON.parse(fs.readFileSync(FILE, "utf8")))); } catch { g.cache = new Map(); }
  return g.cache!;
}
function remember(key: string, s: Stored) {
  const c = cache();
  c.set(key, s);
  while (c.size > 1500) c.delete(c.keys().next().value!);
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(c))); } catch { /* read-only disk */ }
}
/** "02:04 PM", IST: when a write-up was made. */
const stamp = () => new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

/** Is this write-up already made (a page can show it without waiting)? */
export function cachedFor(kind: string, facts: string) {
  return cache().get(keyOf(kind, facts)) ?? null;
}
const keyOf = (kind: string, facts: string) => `${kind}|${crypto.createHash("sha1").update(facts).digest("hex").slice(0, 20)}`;

/**
 * One checked JSON write-up from the facts. `text` gives every string of the answer whose numbers must be in the
 * facts; `ok` any further check. Null when no model answered or the answer failed the checks twice.
 */
export async function aiJson<T>(c: {
  kind: string; system: string; facts: string; schema: z.ZodType<T>; user: string;
  text: (o: T) => string; ok?: (o: T) => boolean; maxOutputTokens?: number; temperature?: number;
}): Promise<{ o: T; model: string; at: string } | null> {
  const key = keyOf(c.kind, c.facts);
  const hit = cache().get(key);
  if (hit) return hit as { o: T; model: string; at: string };
  if (g.busy.has(key)) return g.busy.get(key)! as Promise<{ o: T; model: string; at: string } | null>;
  const run = (async () => {
    for (let k = 0; k < 2; k++) {
      try {
        const r = await generateJson({ role: "fast", name: c.kind, schema: c.schema, system: c.system, temperature: k ? 0 : c.temperature ?? 0.2,
          // background work: Gemini, never the chat's Groq allowance (pages show rule text until it is ready)
          maxOutputTokens: c.maxOutputTokens ?? 1400, user: c.user, prefer: "gemini", background: true, timeoutMs: 45_000,
          prompt: k ? `${c.facts}\n\nYour last answer used a number that is not in these facts, or left out what was asked. Use only numbers from the facts.` : c.facts });
        const o = r.object as T;
        if (!numbersHold(c.text(o), c.facts) || (c.ok && !c.ok(o))) continue;
        const s: Stored = { o, model: r.info.model, at: stamp() };
        remember(key, s);
        return s;
      } catch (e) {
        console.warn(`[aibrief] ${c.kind}: ${(e as Error).message.slice(0, 200)}`);
        return null;
      }
    }
    return null;
  })().finally(() => g.busy.delete(key));
  g.busy.set(key, run);
  return run as Promise<{ o: T; model: string; at: string } | null>;
}

/**
 * The write-ups are made for the hour ("to 12:00 PM"), not the minute: the store's as-of time follows the clock, and a
 * minute in the facts changed the cache key every minute, so each view of the Briefing asked Gemini for a new write-up
 * (about 2,900 tokens and 7 s) and the page stayed on "pending". New data still makes a new write-up.
 */
export const briefHour = (now: string) => `${now.slice(0, 13)}:00:00`;

const STYLE = `Use only the facts given. Every number, name, place and date you write must appear in the facts; never estimate or
add figures, and never invent a cause. Plain, formal Indian English for a senior officer: short complete sentences, no markdown,
no bullet symbols, no IDs or department codes in the text (use names). Write dates as the facts do ("6 Oct"), never 2026-10-06.
Write every number in digits exactly as the facts give it (67, not sixty-seven; 24 hours, not twenty-four).`;

// ------------------------------------------------------------------- scope --

export interface BriefScope { period: Period; zone: number | null; dept: string | null; taluk: string | null }

function filters(s: BriefScope, a = "i") {
  const parts: string[] = [], params: unknown[] = [];
  if (s.zone) (parts.push(`${a}.zone_no = ?`), params.push(s.zone));
  if (s.dept) (parts.push(`${a}.lead_dept = ?`), params.push(s.dept));
  if (s.taluk) (parts.push(`${a}.taluk_code = ?`), params.push(s.taluk));
  return { sql: parts.length ? " AND " + parts.join(" AND ") : "", params };
}

const SEV_ORDER = "FIELD(i.severity_level, 'Severe', 'High', 'Medium', 'Low')";
const SRC: Record<string, string> = { grievance: "citizen complaints", police: "police", pwd: "PWD", news: "news", hospital: "hospital", imd: "IMD" };
const INC = `i.incident_id AS id, ${TITLE} AS title, i.category_label AS type, i.place_text AS loc, i.zone_name, dp.name AS dept_name,
  i.severity_level AS sev, i.status_std AS status, i.is_open AS open, COALESCE(i.dead, 0) AS dead, COALESCE(i.injured, 0) AS injured,
  i.citizen_complaints AS complaints, i.sources, i.outlet_count, i.sla_breached AS breached, DATE_FORMAT(i.first_reported_at, '%Y-%m-%d %H:%i:%s') AS t`;
const FROM = `FROM incidents i LEFT JOIN ref_departments dp ON dp.code = i.lead_dept`;

/** One incident as a line of facts. */
const incLine = (i: Row) => `- [${i.id}] ${when(i.t)} · ${one(i.title, 140)} · ${i.type} · ${[i.loc, i.zone_name].filter(Boolean).join(", ") || "Chennai"} · ` +
  `${i.sev}${n(i.dead) ? ` · ${n(i.dead)} dead` : ""}${n(i.injured) ? ` · ${n(i.injured)} injured` : ""}${n(i.complaints) ? ` · ${n(i.complaints)} citizen complaints` : ""}` +
  ` · ${i.status}${n(i.breached) && n(i.open) ? " (past deadline)" : ""} · ${i.dept_name ?? "department not set"} · from ${String(i.sources ?? "").split("|").map((x) => SRC[x] ?? x).join(", ")}`;

// --------------------------------------------------------------- key points --

export const TOPICS = ["Lives lost", "Safety", "Grievances", "News", "Civic services", "Weather & water", "Rising", "For you"] as const;
export type Topic = (typeof TOPICS)[number];
export interface DayPoint { topic: Topic; text: string; ta: string | null; ref: string | null }
export interface DayBrief { headline: string; headlineTa: string | null; points: DayPoint[]; model: string; at: string }

const DaySchema = z.object({
  headline: z.string().describe("one sentence: the period in one line"),
  points: z.array(z.object({
    topic: z.enum(TOPICS),
    text: z.string().describe("1 or 2 sentences, at most 40 words"),
    ref: z.string().describe("the [INC-...] id the point is mainly about, without brackets, else empty")
  })).describe("4 to 7 points, most important first"),
  headline_ta: z.string().describe("the headline in Tamil"),
  points_ta: z.array(z.string()).describe("each point's text in Tamil, same order")
});

const DAY_SYSTEM = `You are the chief of staff to the District Collector of Chennai. From the facts of the period, write the key points
the Collector must know: one consolidated report of everything that came in (incidents, citizen grievances, news, weather and
water), so the Collector needs to read nothing else.
${STYLE}
headline: one sentence that sums up the period (calmer or busier than before, and the single most important thing). When the
facts start with an "Active alert", the headline names it (its name or hazard) and says what the official sources say.
points: 4 to 7, the most important first. An active alert is the first point (topic Weather & water). Then: lives lost and severe incidents (say what happened and where), then anything
spreading or unusual, then what citizens complained about most and where, then what the news is reporting that matters to the
district, then weather or water risk if any, then what waits for the Collector. Merge related facts into one point; never repeat a
fact in two points; leave out what is routine. Each point names the places and what happened, with the numbers from the facts.
topic: Lives lost (deaths), Safety (crime, accidents, fire), Grievances (citizen complaints), News, Civic services (water, power,
roads, garbage, drains), Weather & water, Rising (spikes and trends), For you (verification, decisions).
ref: the incident id in square brackets in the facts that the point is mainly about, else empty.
headline_ta and points_ta: the same in Tamil, one Tamil text for each point, in the same order.`;

/**
 * The alerts lane as the brief's first facts (R-02: on Cyclone Arnab's second day the key points never named it, because
 * the brief saw only "No IMD warning"). `must` holds the words the headline has to carry: the event's name, else its hazard.
 */
export function alertFacts(lane: AlertLane | null): { lines: string[]; must: string[] } {
  if (!lane?.banner) return { lines: [], must: [] };
  const hazard = lane.event?.hazard ? lane.event.hazard.replace("_", " ") : null;
  const lines = [`Active alert (lead with this): ${one(lane.banner.title, 120)}. ${one(lane.agreementText, 300)}`];
  for (const st of lane.stale)
    lines.push(`Not reporting during the alert: ${st.label}${st.hours != null ? `, silent ${Math.round(st.hours)} hours` : ""}.`);
  const must = [lane.event?.name, hazard].filter((w): w is string => !!w && w.length > 2);
  return { lines, must };
}
/** Whether a headline carries the alert (case-insensitive, whole word). */
export const namesAlert = (text: string, must: string[]) =>
  !must.length || must.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text));

async function dayFacts(s: BriefScope) {
  const now = briefHour(await asOf());
  const f = filters(s);
  const win = periodWindow(s.period, now), prev = periodWindow(s.period, now, "i.first_reported_at", 1);
  const W = `${win.sql}${f.sql}`, WP = [...win.params, ...f.params];
  const whole = !s.zone && !s.dept && !s.taluk;
  const [tot, before, serious, gKinds, gZones, gTop, overdue, awaiting, depts, spikes, warn, env, scopeName] = await Promise.all([
    q(`SELECT COUNT(*) AS n, SUM(i.severity_level = 'Severe') AS severe, SUM(COALESCE(i.dead, 0)) AS dead, SUM(COALESCE(i.injured, 0)) AS injured,
              SUM(i.citizen_complaints) AS complaints, SUM(i.citizen_complaints > 0) AS ginc, SUM(i.media_only) AS news_only, SUM(i.is_open) AS open
       FROM incidents i WHERE ${W}`, WP),
    q(`SELECT COUNT(*) AS n FROM incidents i WHERE ${prev.sql}${f.sql}`, [...prev.params, ...f.params]),
    q(`SELECT ${INC} ${FROM} WHERE ${W} AND (COALESCE(i.dead, 0) > 0 OR i.severity_level = 'Severe')
       ORDER BY COALESCE(i.dead, 0) DESC, ${SEV_ORDER}, i.priority_score DESC LIMIT 10`, WP),
    q(`SELECT i.category_label AS label, SUM(i.citizen_complaints) AS n FROM incidents i WHERE ${W} AND i.citizen_complaints > 0
       GROUP BY 1 ORDER BY n DESC LIMIT 5`, WP),
    q(`SELECT i.zone_name AS name, SUM(i.citizen_complaints) AS n FROM incidents i WHERE ${W} AND i.citizen_complaints > 0 AND i.zone_name IS NOT NULL
       GROUP BY 1 ORDER BY n DESC LIMIT 3`, WP),
    q(`SELECT ${INC} ${FROM} WHERE ${W} AND i.citizen_complaints > 0 ORDER BY i.citizen_complaints DESC, ${SEV_ORDER} LIMIT 5`, WP),
    q(`SELECT COUNT(*) AS n FROM incidents i WHERE i.is_open = 1 AND i.sla_breached = 1 AND i.citizen_complaints > 0${f.sql}`, f.params),
    // My Tasks' figure (metrics.ts awaiting_check), not every open item flagged for the Collector
    awaitingCheck({ period: s.period, zone: s.zone, dept: s.dept, cat: null, taluk: s.taluk }, now).then((t) => [{ n: t.n, left: t.leftToDepts }]),
    q(`SELECT dp.name, COUNT(*) AS n, SUM(i.severity_level = 'Severe') AS severe ${FROM} WHERE ${W} GROUP BY dp.name ORDER BY n DESC LIMIT 5`, WP),
    q(`SELECT a.category_code AS cat, a.zone_no AS zone, a.observed, a.ratio, a.kind, a.rise_days, DATE_FORMAT(a.date, '%Y-%m-%d') AS day
       FROM anomalies a WHERE a.date > DATE(?) - INTERVAL 3 DAY ${s.zone ? "AND a.zone_no = ?" : ""} ORDER BY a.ratio DESC LIMIT 4`, s.zone ? [now, s.zone] : [now]).catch(orEmpty("aibrief:178")),
    q(`SELECT value, detail FROM observation_signals WHERE metric = 'imd_warning_level' ORDER BY value DESC LIMIT 1`).catch(orEmpty("aibrief:179")),
    q(`SELECT metric, ROUND(AVG(value), 1) AS v FROM (
         SELECT o.metric, o.place_id, o.value, ROW_NUMBER() OVER (PARTITION BY o.metric, o.place_id ORDER BY o.observed_at DESC) rn
         FROM observations o WHERE o.metric IN ('rainfall_24h_mm', 'aqi', 'lake_pct_full') AND o.observed_at <= ?) x WHERE rn = 1 GROUP BY metric`, [now]).catch(orEmpty("aibrief:182")),
    scopeLabel(s)
  ]);
  const alert = alertFacts(await alertLane(now).catch((e) => (console.warn(`[aibrief] alerts lane: ${(e as Error).message}`), null)));
  const zn = new Map((await q(`SELECT DISTINCT zone_no, zone_name FROM ref_wards`)).map((z) => [n(z.zone_no), String(z.zone_name)]));
  const catLabel = new Map(categories().map((c) => [c.code, c.label]));
  const T = tot[0] ?? {};
  const ch = pctChange(n(T.n), n(before[0]?.n)); // none on a small base (metrics.ts)
  const envV = Object.fromEntries(env.map((e) => [e.metric, Number(e.v)]));
  const news = whole ? (await newsStories(s.period, now).catch(() => [] as Awaited<ReturnType<typeof newsStories>>))
    .sort((a, b) => b.outletNames.length - a.outletNames.length || String(b.t).localeCompare(String(a.t))).slice(0, 8) : [];
  const lines = [
    `Scope: ${scopeName}. Period: ${PERIODS[s.period].label.toLowerCase()} (to ${when(now)}).`,
    ...alert.lines,
    `Incidents reported: ${n(T.n)}${ch == null ? "" : ` (${ch === 0 ? "the same as" : `${Math.abs(ch)}% ${ch > 0 ? "more than" : "fewer than"}`} the period before, which had ${n(before[0]?.n)})`}.` +
      ` Severe: ${n(T.severe)}. Deaths: ${n(T.dead)}. Injured: ${n(T.injured)}. Still open: ${n(T.open)}. Seen only in the news, no department record: ${n(T.news_only)}.`,
    serious.length ? "Deaths and severe incidents:" : "No death or severe incident.",
    ...serious.map(incLine),
    `Citizen grievances: ${n(T.complaints)} complaints about ${n(T.ginc)} problems.` +
      (gKinds.length ? ` Most about: ${gKinds.map((k) => `${k.label} (${n(k.n)})`).join(", ")}.` : "") +
      (gZones.length ? ` Most from: ${gZones.map((z) => `${z.name} (${n(z.n)})`).join(", ")}.` : ""),
    ...(gTop.length ? ["Grievances with the most complaints:", ...gTop.map(incLine)] : []),
    `Open grievances past their deadline (any date): ${n(overdue[0]?.n)}.`,
    depts.length ? `By department: ${depts.map((d) => `${d.name ?? "unassigned"} ${n(d.n)}${n(d.severe) ? ` (${n(d.severe)} severe)` : ""}`).join("; ")}.` : "",
    spikes.filter(unusualEnough).length ? `Unusual rises: ${spikes.filter(unusualEnough).map((a) => `${catLabel.get(a.cat) ?? a.cat} in ${zn.get(n(a.zone)) ?? "the district"}: ${n(a.observed)} reports ` +
      `${a.kind === "slow_rise" ? `in ${n(a.rise_days)} days to ${when(a.day)}` : `on ${when(a.day)}`}, ${Math.round(n(a.ratio))} times the usual`).join("; ")}.` : "",
    news.length ? "In the news (district-relevant stories, most covered first):" : "",
    ...news.map((x) => `- ${one(x.title, 150)} · ${x.outletNames.length} outlet${x.outletNames.length === 1 ? "" : "s"}${x.loc ? ` · ${x.loc}` : ""}` +
      `${x.incident ? ` · in our records [${x.incident}]${x.complaints ? ` with ${x.complaints} citizen complaints` : ""}` : " · news only, no department record"}`),
    [warn[0] && n(warn[0].value) >= 1 ? `IMD warning: ${one(warn[0].detail, 200)}` : "No IMD warning.",
      envV.rainfall_24h_mm != null ? `Rain in 24 h: ${envV.rainfall_24h_mm} mm.` : "", envV.aqi != null ? `Air quality: AQI ${Math.round(envV.aqi)}.` : "",
      envV.lake_pct_full != null ? `Drinking-water reservoirs: ${envV.lake_pct_full}% full.` : ""].filter(Boolean).join(" "),
    `Closed work waiting for the Collector's check in My Tasks (severe incidents and officers' reports): ${n(awaiting[0]?.n)}; other closures verified by the departments: ${n(awaiting[0]?.left)}.`
  ].filter(Boolean);
  return { facts: lines.join("\n"), mustName: alert.must, ids: new Set([...serious, ...gTop].map((i) => String(i.id)).concat(news.map((x) => x.incident).filter(Boolean) as string[])) };
}

async function scopeLabel(s: BriefScope) {
  const parts: string[] = [];
  if (s.zone) parts.push(String((await q(`SELECT zone_name FROM ref_wards WHERE zone_no = ? LIMIT 1`, [s.zone]))[0]?.zone_name ?? `Zone ${s.zone}`) + " zone");
  if (s.taluk) parts.push(String((await q(`SELECT name FROM ref_taluks WHERE taluk_code = ?`, [s.taluk]))[0]?.name ?? s.taluk) + " taluk");
  if (s.dept) parts.push(String((await q(`SELECT name FROM ref_departments WHERE code = ?`, [s.dept]))[0]?.name ?? s.dept));
  return parts.join(", ") || "Chennai district";
}

export async function dayBrief(s: BriefScope, user: string): Promise<DayBrief | null> {
  const { facts, ids, mustName } = await dayFacts(s);
  const r = await aiJson({
    kind: "day2", system: DAY_SYSTEM, facts, schema: DaySchema, user, maxOutputTokens: 2600,
    text: (o) => [o.headline, ...o.points.map((p) => p.text)].join(" "),
    // an active alert leads: the headline names it, or the write-up is asked again
    ok: (o) => o.points.length >= 3 && o.headline.trim().length > 20 && namesAlert(o.headline, mustName)
  });
  if (!r) return null;
  const ta = r.o.points_ta.length === r.o.points.length ? r.o.points_ta : null;
  return {
    headline: r.o.headline.trim(), headlineTa: ta && r.o.headline_ta.trim() ? r.o.headline_ta.trim() : null,
    points: r.o.points.slice(0, 7).map((p, k) => ({ topic: p.topic, text: p.text.trim(), ta: ta?.[k]?.trim() || null,
      ref: ids.has(p.ref.replace(/[[\]]/g, "").trim()) ? p.ref.replace(/[[\]]/g, "").trim() : null })),
    model: r.model, at: r.at
  };
}

// ------------------------------------------------------------- department --

export interface DeptBrief { brief: string; watch: string; model: string; at: string }
const DeptSchema = z.object({
  brief: z.string().describe("2 or 3 sentences"),
  watch: z.string().describe("one sentence: what to watch or do next, or empty")
});
const DEPT_SYSTEM = `You brief the District Collector of Chennai on ONE department's period.
${STYLE}
brief: 2 or 3 sentences: what the department received (the kinds of problems and where), then the most serious matters by name
and place. If people died, say what happened, where, and how many. Do not list every incident.
watch: one sentence on what the Collector should watch or ask the department to do next (past-deadline work, repeated
problems, deaths), only if the facts support it; else empty.`;

export async function deptBrief(s: BriefScope, dept: string, user: string): Promise<DeptBrief | null> {
  const now = briefHour(await asOf());
  const win = periodWindow(s.period, now);
  const f = filters({ ...s, dept });
  const W = `${win.sql}${f.sql}`, WP = [...win.params, ...f.params];
  const [tot, kinds, rows, name] = await Promise.all([
    q(`SELECT COUNT(*) AS n, SUM(i.severity_level = 'Severe') AS severe, SUM(COALESCE(i.dead, 0)) AS dead, SUM(COALESCE(i.injured, 0)) AS injured,
              SUM(i.is_open) AS open, SUM(i.is_open = 1 AND i.sla_breached = 1) AS overdue, SUM(i.citizen_complaints) AS complaints FROM incidents i WHERE ${W}`, WP),
    q(`SELECT i.category_label AS label, COUNT(*) AS n FROM incidents i WHERE ${W} GROUP BY 1 ORDER BY n DESC LIMIT 4`, WP),
    q(`SELECT ${INC} ${FROM} WHERE ${W} ORDER BY COALESCE(i.dead, 0) DESC, ${SEV_ORDER}, i.citizen_complaints DESC, i.first_reported_at DESC LIMIT 15`, WP),
    q(`SELECT name FROM ref_departments WHERE code = ?`, [dept])
  ]);
  const T = tot[0] ?? {};
  if (!n(T.n)) return null;
  const facts = [
    `Department: ${name[0]?.name ?? dept}. Period: ${PERIODS[s.period].label.toLowerCase()} (to ${when(now)}).`,
    `Received: ${n(T.n)} incidents. Severe: ${n(T.severe)}. Deaths: ${n(T.dead)}. Injured: ${n(T.injured)}. Still open: ${n(T.open)}, ${n(T.overdue)} past deadline. Citizen complaints: ${n(T.complaints)}.`,
    `Kinds: ${kinds.map((k) => `${k.label} (${n(k.n)})`).join(", ")}.`,
    "Incidents, most serious first:", ...rows.map(incLine)
  ].join("\n");
  const r = await aiJson({ kind: "dept2", system: DEPT_SYSTEM, facts, schema: DeptSchema, user, maxOutputTokens: 600,
    text: (o) => `${o.brief} ${o.watch}`, ok: (o) => o.brief.trim().length > 30 });
  return r ? { brief: r.o.brief.trim(), watch: r.o.watch.trim(), model: r.model, at: r.at } : null;
}

// ------------------------------------------------------------------ trends --

export interface Step { who: string; what: string }
export interface TrendBrief { what: string; falling: string; next: Step[]; model: string; at: string }
const StepSchema = z.object({ who: z.string().describe("department or office"), what: z.string().describe("one concrete action, at most 25 words") });
const TrendSchema = z.object({
  what: z.string().describe("2 or 3 sentences, at most 70 words"),
  falling: z.string().describe("one sentence, or empty"),
  next: z.array(StepSchema).describe("1 to 3 steps")
});
const TREND_SYSTEM = `You are the analyst of the District Collector of Chennai. From the problem counts of the last 4 full weeks against the 4
weeks before, and the incidents behind each rising problem, explain what is happening.
${STYLE}
what: 2 or 3 sentences, at most 70 words, on which problems are rising and what is actually happening on the ground: the kinds of incidents behind
the rise (read the incident titles), where they concentrate, and whether one cause or place explains it. Not just a list of
areas and percentages.
falling: one sentence on what fell, or empty.
next: 1 to 3 suggested next steps, each a department or office and one concrete action that answers the rise.`;

export async function trendBrief(user: string): Promise<TrendBrief | null> {
  const now = briefHour(await asOf());
  const MON = "(DATE(?) - INTERVAL WEEKDAY(?) DAY)";
  const [cats, zones] = await Promise.all([
    q(`SELECT i.category_code AS cat, i.category_label AS label, SUM(i.first_reported_at >= ${MON} - INTERVAL 28 DAY) AS recent,
              SUM(i.first_reported_at < ${MON} - INTERVAL 28 DAY) AS before_
       FROM incidents i WHERE i.first_reported_at >= ${MON} - INTERVAL 56 DAY AND i.first_reported_at < ${MON} GROUP BY 1, 2`,
      [now, now, now, now, now, now, now, now]),
    q(`SELECT i.category_code AS cat, i.zone_name AS zone, SUM(i.first_reported_at >= ${MON} - INTERVAL 28 DAY) - SUM(i.first_reported_at < ${MON} - INTERVAL 28 DAY) AS d
       FROM incidents i WHERE i.first_reported_at >= ${MON} - INTERVAL 56 DAY AND i.first_reported_at < ${MON} AND i.zone_name IS NOT NULL GROUP BY 1, 2`,
      [now, now, now, now, now, now, now, now])
  ]);
  const rows = cats.map((c) => ({ cat: String(c.cat), label: String(c.label), recent: n(c.recent), before: n(c.before_), chg: n(c.before_) ? Math.round(((n(c.recent) - n(c.before_)) / n(c.before_)) * 100) : null }))
    .filter((c) => c.before >= 5);
  const rising = rows.filter((c) => (c.chg ?? 0) >= 10).sort((a, b) => (b.recent - b.before) - (a.recent - a.before)).slice(0, 4);
  const falling = rows.filter((c) => (c.chg ?? 0) <= -10).sort((a, b) => (a.recent - a.before) - (b.recent - b.before)).slice(0, 3);
  if (!rising.length && !falling.length) return null;
  const examples = await Promise.all(rising.map((c) => q(`SELECT ${INC} ${FROM} WHERE i.category_code = ? AND i.first_reported_at >= ${MON} - INTERVAL 28 DAY
      AND i.first_reported_at < ${MON} ORDER BY ${SEV_ORDER}, i.member_count DESC, i.first_reported_at DESC LIMIT 8`, [c.cat, now, now, now, now])));
  const facts = [
    `Last 4 full weeks against the 4 weeks before, district-wide (to ${when(now)}).`,
    ...rising.flatMap((c, k) => {
      const z = zones.filter((x) => x.cat === c.cat && n(x.d) > 0).sort((a, b) => n(b.d) - n(a.d)).slice(0, 3);
      return [`RISING: ${c.label}: ${c.recent} against ${c.before} (+${c.chg}%).${z.length ? ` Zones adding most: ${z.map((x) => `${x.zone} (+${n(x.d)})`).join(", ")}.` : ""}`,
        "  Incidents behind it:", ...examples[k].map((i) => `  ${incLine(i)}`)];
    }),
    ...falling.map((c) => `FALLING: ${c.label}: ${c.recent} against ${c.before} (${c.chg}%).`)
  ].join("\n");
  const r = await aiJson({ kind: "trend3", system: TREND_SYSTEM, facts, schema: TrendSchema, user, maxOutputTokens: 900,
    text: (o) => [o.what, o.falling, ...o.next.map((x) => x.what)].join(" "), ok: (o) => o.what.trim().length > 40 });
  return r ? { what: r.o.what.trim(), falling: r.o.falling.trim(), next: r.o.next.filter((x) => x.what.trim()).slice(0, 3), model: r.model, at: r.at } : null;
}

// ----------------------------------------------------------------- pattern --

export interface PatternBrief { what: string; cause: string; next: (Step & { why: string })[]; model: string; at: string }
const PatternSchema = z.object({
  what: z.string().describe("3 or 4 sentences"),
  cause: z.string().describe("one sentence on a likely common cause the reports themselves state, or empty"),
  next: z.array(StepSchema.extend({ why: z.string().describe("the evidence, at most 15 words") })).describe("2 or 3 steps")
});
const PATTERN_SYSTEM = `You are the analyst of the District Collector of Chennai. From ONE pattern (an unusual spike of reports, a recurring
hotspot, or a problem's trend) and the incidents behind it, explain what is really happening and what to do.
${STYLE}
The counts, the chart and the places are already on the Collector's screen: do not repeat them. Explain them.
what: 3 or 4 sentences: what the reports are actually about (read every incident title and name the real problems, e.g.
"motors seized for illegal drawing of water", "supply suspended for pipeline work"; never just the category name), whether they
are one problem at one place or separate events, what links them if anything, and whether it is still going on or settled.
cause: one sentence, only when the reports themselves name a shared cause (works, rain, a pipeline, a festival); else empty.
next: 2 or 3 suggested next steps, specific to these incidents: who (department or office), what to do (a site inspection at the
named place, a lasting repair, a joint drive, a review meeting), and why (the evidence). Never only "monitor the situation".`;

export async function patternBrief(d: PatternDetail, user: string): Promise<PatternBrief | null> {
  const days = d.series.filter((x) => x.n || x.hl).map((x) => `${x.label}${x.hl ? "*" : ""}: ${x.n}`).join(", ");
  const facts = [
    `${d.kind === "spike" ? "Unusual spike" : d.kind === "hotspot" ? "Recurring hotspot" : "Problem trend"}: ${d.title} (${d.when}).`,
    ...d.stats.map((s) => `${s.l}: ${s.v}.`),
    ...d.lead,
    `${d.seriesTitle} (* = the highlighted period; days with none left out): ${days}.`,
    d.places.length ? `Places: ${d.places.map((p) => `${p.name} (${p.n})`).join(", ")}.` : "",
    d.next ? `Standard procedure for this kind of problem: ${d.next}.` : "",
    "Incidents, newest first:", ...(d.incidents as Row[]).slice(0, 24).map((i) => incLine({ ...i, dead: i.dead ?? 0, injured: i.injured ?? 0 }))
  ].filter(Boolean).join("\n");
  const r = await aiJson({ kind: `pat2-${d.kind}`, system: PATTERN_SYSTEM, facts, schema: PatternSchema, user, maxOutputTokens: 900,
    text: (o) => [o.what, o.cause, ...o.next.flatMap((x) => [x.what, x.why])].join(" "), ok: (o) => o.what.trim().length > 40 && o.next.length > 0 });
  return r ? { what: r.o.what.trim(), cause: r.o.cause.trim(), next: r.o.next.filter((x) => x.what.trim()).slice(0, 3), model: r.model, at: r.at } : null;
}
