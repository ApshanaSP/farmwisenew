/**
 * Page 2, the Collector's daily briefing: what happened, told as a story. Figures come from the store by rules; the
 * AI notes are the pipeline's (district_intel briefing_notes: the opening, a brief per department about the last 24
 * hours, the news digest, health and law notes), each written only from computed facts with every number checked.
 * A section without its note falls back to rule-based text, so the page never depends on the AI.
 */
import { RowDataPacket } from "mysql2";
import intelPool from "@/lib/collector/db";
import { PERIODS, explain, periodWindow, type Period } from "@/lib/collector/intel";

type Row = Record<string, any>;
async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(sql, params);
  return r as unknown as T[];
}
const safe = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);
const n = (v: unknown) => Number(v ?? 0);

export interface BookScope { period: Period; zone: number | null; dept: string | null; cat: string | null; taluk: string | null }

/** Filters for incidents (no time window). */
function filters(s: BookScope, a = "i") {
  const parts: string[] = [], params: unknown[] = [];
  if (s.zone) (parts.push(`${a}.zone_no = ?`), params.push(s.zone));
  if (s.dept) (parts.push(`${a}.lead_dept = ?`), params.push(s.dept));
  if (s.cat) (parts.push(`${a}.category_code = ?`), params.push(s.cat));
  if (s.taluk) (parts.push(`${a}.taluk_code = ?`), params.push(s.taluk));
  return { sql: parts.length ? " AND " + parts.join(" AND ") : "", params };
}

const CRIME = ["CRIME_VIOLENT", "CRIMES_AGAINST_WOMEN", "CRIME_PROPERTY", "SUICIDE_SELF_HARM", "DRUGS_LIQUOR", "PUBLIC_ORDER", "ROAD_ACCIDENT", "MISSING_PERSON"];
const SEV_ORDER = "FIELD(i.severity_level, 'Severe', 'High', 'Medium', 'Low')";
const INC = `i.incident_id AS id, i.title, i.category_label AS type, i.category_code AS cat, i.lead_dept AS dept, dp.name AS dept_name,
  i.zone_no AS zone, i.zone_name, i.ward_no AS ward, i.place_text AS loc, i.severity_level AS sev, i.status_std AS status, i.is_open AS open,
  i.citizen_complaints AS complaints, i.source_count, i.sources, i.member_count, i.priority_score AS priority, i.sla_breached AS breached,
  i.severity_reasons, i.priority_reasons, i.attention_reason, i.outlet_count, i.media_only, i.dead, i.injured, i.lat, i.lon,
  i.ai_summary, i.ai_attention, i.ai_next_step, DATE_FORMAT(i.first_reported_at, '%Y-%m-%d %H:%i:%s') AS t`;
const FROM = `FROM incidents i LEFT JOIN ref_departments dp ON dp.code = i.lead_dept`;

export async function briefingBook(s: BookScope, now: string, opening: { en: string; ta: string | null } | null) {
  const f = filters(s);
  const win = periodWindow(s.period, now), prev = periodWindow(s.period, now, "i.first_reported_at", 1);
  const W = `${win.sql}${f.sql}`, WP = [...win.params, ...f.params];
  const P = `${prev.sql}${f.sql}`, PP = [...prev.params, ...f.params];
  const whole = !s.zone && !s.dept && !s.cat && !s.taluk;
  const cw = periodWindow(s.period, now, "i.first_reported_at", 0, Math.max(PERIODS[s.period].hours, 24 * 7));
  const closed = periodWindow(s.period, now, "i.closed_at");
  const wk = periodWindow(s.period, now, "i.first_reported_at", 0, 168), pwk = periodWindow(s.period, now, "i.first_reported_at", 1, 168);

  const [tiles, tilesPrev, awaiting, critical, deptRows, deptItems, zones, zoneKinds, notes, warn, beds, law, lawPrev, kinds, oldest,
    resolved, resolvedTop, catNow, catPrev, disease, diseasePrev, diseaseZones] = await Promise.all([
    q(`SELECT COUNT(*) AS n, SUM(i.severity_level = 'Severe') AS severe, SUM(COALESCE(i.dead, 0)) AS dead, SUM(COALESCE(i.injured, 0)) AS injured,
              SUM(i.media_only) AS news_only FROM incidents i WHERE ${W}`, WP),
    q(`SELECT COUNT(*) AS n FROM incidents i WHERE ${P}`, PP),
    q(`SELECT COUNT(*) AS n FROM incidents i WHERE i.is_open = 1 AND i.awaiting_collector = 1${f.sql}`, f.params),
    q(`SELECT ${INC} ${FROM} WHERE ${cw.sql}${f.sql} AND i.is_open = 1 AND i.severity_level = 'Severe'
       ORDER BY COALESCE(i.dead, 0) DESC, i.priority_score DESC LIMIT 4`, [...cw.params, ...f.params]),
    // departments: only what came in during the period
    q(`SELECT i.lead_dept AS code, dp.name, dp.head, COUNT(*) AS n, SUM(i.severity_level = 'Severe') AS severe, SUM(COALESCE(i.dead, 0)) AS dead
       ${FROM} WHERE ${W} GROUP BY i.lead_dept, dp.name, dp.head ORDER BY severe DESC, n DESC`, WP),
    q(`SELECT * FROM (SELECT ${INC}, ROW_NUMBER() OVER (PARTITION BY i.lead_dept ORDER BY ${SEV_ORDER}, COALESCE(i.dead, 0) DESC, i.first_reported_at DESC) AS rk
       ${FROM} WHERE ${W}) x WHERE rk <= 4`, WP),
    q(`SELECT i.zone_no AS zone, i.zone_name AS name, COUNT(*) AS n, SUM(i.severity_level = 'Severe') AS severe
       FROM incidents i WHERE ${W} AND i.zone_no IS NOT NULL GROUP BY i.zone_no, i.zone_name ORDER BY severe DESC, n DESC LIMIT 6`, WP),
    q(`SELECT zone, label FROM (SELECT i.zone_no AS zone, i.category_label AS label, ROW_NUMBER() OVER (PARTITION BY i.zone_no ORDER BY COUNT(*) DESC) AS rn
       FROM incidents i WHERE ${W} AND i.zone_no IS NOT NULL GROUP BY i.zone_no, i.category_label) x WHERE rn <= 2`, WP),
    safe(q(`SELECT section, item_key, text_en, text_ta, extra, written_for FROM briefing_notes`)),
    q(`SELECT value, detail FROM observation_signals WHERE metric = 'imd_warning_level' ORDER BY value DESC LIMIT 1`),
    q(`SELECT place_name AS name, value FROM observation_signals WHERE metric = 'bed_occupancy_pct' AND value >= 85 ORDER BY value DESC LIMIT 4`),
    q(`SELECT i.category_code AS cat, i.category_label AS label, COUNT(*) AS n FROM incidents i WHERE ${W} AND i.category_code IN (?) GROUP BY 1, 2`, [...WP, CRIME]),
    q(`SELECT i.category_code AS cat, COUNT(*) AS n FROM incidents i WHERE ${P} AND i.category_code IN (?) GROUP BY 1`, [...PP, CRIME]),
    q(`SELECT i.category_label AS label, SUM(i.citizen_complaints) AS n FROM incidents i WHERE ${W} AND i.citizen_complaints > 0
       GROUP BY 1 ORDER BY n DESC LIMIT 4`, WP),
    q(`SELECT ${INC}, DATEDIFF(?, i.first_reported_at) AS days ${FROM} WHERE i.is_open = 1 AND i.citizen_complaints > 0${f.sql}
       AND i.first_reported_at > (? - INTERVAL 180 DAY) ORDER BY i.first_reported_at LIMIT 1`, [now, ...f.params, now]),
    q(`SELECT COUNT(*) AS n FROM incidents i WHERE ${closed.sql}${f.sql} AND i.status_std = 'Resolved'`, [...closed.params, ...f.params]),
    q(`SELECT ${INC} ${FROM} WHERE ${closed.sql}${f.sql} AND i.status_std = 'Resolved' AND i.severity_level IN ('Severe', 'High')
       ORDER BY i.severity_level = 'Severe' DESC, i.priority_score DESC LIMIT 3`, [...closed.params, ...f.params]),
    q(`SELECT i.category_code AS cat, i.category_label AS label, COUNT(*) AS n FROM incidents i WHERE ${W} GROUP BY 1, 2`, WP),
    q(`SELECT i.category_code AS cat, COUNT(*) AS n FROM incidents i WHERE ${P} GROUP BY 1`, PP),
    q(`SELECT COUNT(*) AS n FROM incidents i WHERE ${wk.sql}${f.sql} AND i.category_code = 'VECTOR_DISEASE'`, [...wk.params, ...f.params]),
    q(`SELECT COUNT(*) AS n FROM incidents i WHERE ${pwk.sql}${f.sql} AND i.category_code = 'VECTOR_DISEASE'`, [...pwk.params, ...f.params]),
    q(`SELECT i.zone_name AS zone, COUNT(*) AS n FROM incidents i WHERE ${wk.sql}${f.sql} AND i.category_code = 'VECTOR_DISEASE'
       AND i.zone_name IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 3`, [...wk.params, ...f.params])
  ]);

  // ---- AI notes (the pipeline's, district-wide, last 24 hours)
  const daily = s.period === "daily";
  const ai = (section: string, key = "") => {
    const x = notes.find((r) => r.section === section && String(r.item_key ?? "") === key);
    return x ? { en: String(x.text_en), ta: x.text_ta ? String(x.text_ta) : null, writtenFor: x.written_for ? String(x.written_for) : null } : null;
  };

  // ---- the day in numbers (only four)
  const T = tiles[0] ?? {};
  const reported = n(T.n), before = n(tilesPrev[0]?.n);
  const change = before ? Math.round(((reported - before) / before) * 100) : null;
  const deaths = n(T.dead), severe = n(T.severe);
  const warning = warn[0] && n(warn[0].value) >= 1 ? { level: n(warn[0].value), text: String(warn[0].detail ?? "") } : null;

  // ---- district status, by fixed rules (not the AI)
  const reasons: string[] = [];
  let level: "normal" | "watchful" | "alert" = "normal";
  if (warning && warning.level >= 2) (level = "alert", reasons.push(`IMD ${warning.level >= 3 ? "red" : "orange"} warning`));
  if (deaths >= 3) (level = "alert", reasons.push(`${deaths} deaths`));
  if (severe >= 15) (level = "alert", reasons.push(`${severe} severe incidents`));
  if (level !== "alert") {
    if (deaths >= 1) (level = "watchful", reasons.push(`${deaths} death${deaths === 1 ? "" : "s"}`));
    if (severe >= 5) (level = "watchful", reasons.push(`${severe} severe incidents`));
    if (warning?.level === 1) (level = "watchful", reasons.push("IMD yellow warning"));
  }

  // ---- departments: what came in, with the incidents themselves
  const departments = deptRows.map((d) => ({
    code: d.code as string, name: (d.name ?? d.code) as string, head: d.head as string | null, n: n(d.n), severe: n(d.severe), dead: n(d.dead),
    items: deptItems.filter((x) => x.dept === d.code).map((x) => ({ id: x.id as string, title: (x.title || x.type) as string, type: x.type as string,
      zone: x.zone_name as string | null, loc: x.loc as string | null, sev: x.sev as string, status: x.status as string, t: x.t as string, dead: n(x.dead) })),
    ai: daily && whole ? ai("departments", d.code) : null
  }));

  // ---- where it is happening
  const where = zones.map((z) => ({ zone: n(z.zone), name: z.name as string, n: n(z.n), severe: n(z.severe),
    kinds: zoneKinds.filter((k) => n(k.zone) === n(z.zone)).map((k) => String(k.label)) }));

  // ---- news: the AI digest, else the most-covered Chennai incident stories
  const digest = notes.filter((x) => x.section === "news");
  const newsIds = digest.map((x) => String(x.item_key));
  const docs = newsIds.length
    ? await q(`SELECT d.doc_id AS id, d.title, d.url, d.publisher, d.outlet_count AS outlets, d.linked_incident_id AS incident,
                      DATE_FORMAT(d.published_at, '%Y-%m-%d %H:%i:%s') AS t, i.media_only
               FROM documents d LEFT JOIN incidents i ON i.incident_id = d.linked_incident_id WHERE d.doc_id IN (?)`, [newsIds])
    : await q(`SELECT x.* FROM (SELECT d.doc_id AS id, d.title, d.url, d.publisher, d.outlet_count AS outlets, d.linked_incident_id AS incident,
                      DATE_FORMAT(d.published_at, '%Y-%m-%d %H:%i:%s') AS t, i.media_only,
                      ROW_NUMBER() OVER (PARTITION BY d.story_id ORDER BY d.outlet_count DESC) rn
               FROM documents d LEFT JOIN incidents i ON i.incident_id = d.linked_incident_id
               WHERE d.source_kind = 'news' AND d.is_district = 1 AND d.is_incident = 1 AND d.published_at > (? - INTERVAL 36 HOUR)) x
               WHERE x.rn = 1 ORDER BY x.outlets DESC, x.t DESC LIMIT 6`, [now]);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const news: Row[] = newsIds.length
    ? digest.map((x) => {
        const d = byId.get(String(x.item_key));
        const e = x.extra ? JSON.parse(String(x.extra)) : {};
        return d ? { ...d, line: String(x.text_en), why: e.why ?? null, group: e.group ?? "incident", rank: e.rank ?? 0, noRecord: n(d.media_only) === 1 } : null;
      }).filter(Boolean).sort((a, b) => (a as Row).rank - (b as Row).rank) as Row[]
    : docs.map((d) => ({ ...d, line: null, why: null, group: "incident", noRecord: n(d.media_only) === 1 }) as Row);

  // ---- law and order: what rose and what fell, in words
  const lawPrevBy = new Map(lawPrev.map((r) => [r.cat, n(r.n)]));
  const lawRows = CRIME.map((c) => {
    const r = law.find((x) => x.cat === c);
    return { cat: c, label: (r?.label as string | undefined) ?? LABELS[c] ?? c, now: n(r?.n), prev: lawPrevBy.get(c) ?? 0 };
  }).filter((r) => r.now || r.prev);

  // ---- good news: resolved, and kinds of trouble that fell
  const prevCat = new Map(catPrev.map((r) => [r.cat, n(r.n)]));
  const falling = catNow.map((r) => ({ label: r.label as string, now: n(r.n), prev: prevCat.get(r.cat) ?? 0 }))
    .filter((r) => r.prev >= 5 && r.now < r.prev).sort((a, b) => (a.now - a.prev) / a.prev - (b.now - b.prev) / b.prev).slice(0, 3);

  const situation = daily && whole ? ai("situation") : null;
  return {
    status: { level, reasons, warning },
    glance: { ai: situation, opening: situation ? null : opening,
      tiles: { reported, change, severe, deaths, injured: n(T.injured), awaiting: n(awaiting[0]?.n), newsOnly: n(T.news_only) } },
    critical: critical.map((i) => ({ ...i, why: explain(i), dead: n(i.dead), injured: n(i.injured) }) as Row & { why: ReturnType<typeof explain>; dead: number; injured: number }),
    departments, where, news, newsAi: newsIds.length > 0,
    health: { ai: ai("health"), beds: beds.map((b) => ({ name: String(b.name), pct: Math.round(n(b.value)) })),
      disease: { now: n(disease[0]?.n), prev: n(diseasePrev[0]?.n), zones: diseaseZones.map((z) => String(z.zone)) } },
    law: { ai: ai("law"), rising: lawRows.filter((r) => r.now > r.prev), falling: lawRows.filter((r) => r.now < r.prev) },
    citizens: { kinds: kinds.map((k) => ({ label: String(k.label), n: n(k.n) })),
      oldest: oldest[0] ? { id: oldest[0].id as string, title: (oldest[0].title || oldest[0].type) as string, zone: oldest[0].zone_name as string | null, days: n(oldest[0].days) } : null },
    good: { resolved: n(resolved[0]?.n), serious: resolvedTop.map((i) => ({ id: i.id as string, title: (i.title || i.type) as string, zone: i.zone_name as string | null })), falling }
  };
}

const LABELS: Record<string, string> = { CRIME_VIOLENT: "Violent crime", CRIMES_AGAINST_WOMEN: "Crimes against women & children", CRIME_PROPERTY: "Theft, snatching & fraud",
  SUICIDE_SELF_HARM: "Suicide & self-harm", DRUGS_LIQUOR: "Drugs & illicit liquor", PUBLIC_ORDER: "Protests & public nuisance", ROAD_ACCIDENT: "Road accident",
  MISSING_PERSON: "Missing person" };

export type BriefingBook = Awaited<ReturnType<typeof briefingBook>>;
