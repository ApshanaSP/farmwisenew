/**
 * The readings and the city: hospital beds, air, rain, lakes, weather, river gauges (readings); live traffic, flooding, power and trains (city);
 * market prices; officials and their phone numbers (contacts); hospitals, police stations, lakes and other places (facilities); places and
 * distances (map); the Collector's own uploaded datasets (studio).
 */
import { runTool } from "@/lib/assistant/tools";
import type { ToolResult } from "@/lib/assistant/types";
import { askMap } from "@/lib/map/ask";
import { mayUse } from "@/lib/studio/forAssistants";
import { getMeta } from "@/lib/studio/store";
import { studioSql, studioTables, type StudioTable } from "../studiosql";
import { redact } from "@/lib/thunai/privacy";
import { caseRows } from "../sql";
import { agoWords, istWords, toPart } from "../format";
import { deptOf, talukOf, zoneName, zoneOf } from "../names";
import { WHEN_SCHEMA, winOf, type WhenIn } from "../when";
import { ToolProblem, type BrainTool, type Col, type Part, type Rec, type ToolCtx, type ToolOut } from "../types";
import { casesPart, caseList } from "./incidents";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100) / 100);

// ---------------------------------------------------------------- readings --

const HOSPITAL = ["total_beds", "occupied_beds", "bed_occupancy_pct", "opd_count", "emergency_cases", "disease_cases", "doctors_on_roll", "nurses_on_roll", "medicine_status", "ambulance_available", "health_alert_level", "vaccination_pct"];
const METRIC: Record<string, { label: string; unit: string; source: string; note?: string }> = {
  bed_occupancy_pct: { label: "Beds occupied", unit: "%", source: "hospital MIS" }, occupied_beds: { label: "Beds occupied", unit: "beds", source: "hospital MIS" }, total_beds: { label: "Total beds", unit: "beds", source: "hospital MIS" },
  opd_count: { label: "Outpatients", unit: "patients", source: "hospital MIS" }, emergency_cases: { label: "Emergency cases", unit: "cases", source: "hospital MIS" }, disease_cases: { label: "Disease cases", unit: "cases", source: "hospital MIS" },
  doctors_on_roll: { label: "Doctors on roll", unit: "staff", source: "hospital MIS" }, nurses_on_roll: { label: "Nurses on roll", unit: "staff", source: "hospital MIS" }, medicine_status: { label: "Medicine stock (0 critical, 1 low, 2 available)", unit: "", source: "hospital MIS" },
  ambulance_available: { label: "Ambulance available (1 yes)", unit: "", source: "hospital MIS" }, health_alert_level: { label: "Health alert level (0-3)", unit: "", source: "hospital MIS" }, vaccination_pct: { label: "Vaccination", unit: "%", source: "hospital MIS" },
  aqi: { label: "Air quality index", unit: "AQI", source: "CPCB air quality stations" }, rainfall_24h_mm: { label: "Rain in 24 hours", unit: "mm", source: "IMD rain gauges (8:30 and 17:30)" }, temp_max_c: { label: "Highest temperature", unit: "°C", source: "IMD" }, temp_min_c: { label: "Lowest temperature", unit: "°C", source: "IMD" },
  temp_departure_c: { label: "Temperature above or below normal", unit: "°C", source: "IMD" }, humidity_pct: { label: "Humidity", unit: "%", source: "IMD" }, imd_warning_level: { label: "IMD warning level (0 green, 1 yellow, 2 orange, 3 red)", unit: "", source: "IMD district warning" },
  lake_pct_full: { label: "Lake storage", unit: "% full", source: "CMWSSB reservoir page (daily)" }, lake_storage_mcft: { label: "Lake storage", unit: "mcft", source: "CMWSSB reservoir page (daily)" }, lake_outflow_cusec: { label: "Lake outflow", unit: "cusec", source: "CMWSSB reservoir page (daily)" },
  reservoir_inflow_cusec: { label: "Reservoir inflow", unit: "cusec", source: "CFM-DSS (Chennai Flood Monitoring)" }, gauge_level_m: { label: "River gauge level", unit: "m", source: "CFM-DSS (Chennai Flood Monitoring)", note: "These gauge readings are marked suspect by the source." }
};
const GROUPS: Record<string, string[]> = { hospital: HOSPITAL, beds: ["total_beds", "occupied_beds", "bed_occupancy_pct"], lakes: ["lake_pct_full", "lake_storage_mcft", "lake_outflow_cusec"], weather: ["temp_max_c", "temp_min_c", "humidity_pct", "rainfall_24h_mm"], rain: ["rainfall_24h_mm"], air: ["aqi"], rivers: ["gauge_level_m", "reservoir_inflow_cusec"] };

async function readingsRun(input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  const asked = ((input.metrics as string[] | undefined) ?? []).flatMap((m) => GROUPS[m] ?? [m]);
  const metrics = [...new Set(asked)].filter((m) => METRIC[m]);
  if (!metrics.length) throw new ToolProblem(`Name one or more readings: ${Object.keys(METRIC).join(", ")}; or a group: ${Object.keys(GROUPS).join(", ")}.`);
  const place = s(input.place).trim().toLowerCase(), when = (input.when ?? null) as WhenIn | null, byDay = input.by_day === true;
  const where = ["o.metric IN (" + metrics.map(() => "?").join(", ") + ")", "o.value IS NOT NULL"], params: unknown[] = [...metrics];
  if (place) {
    const ws = place.replace(/\b(hospital|lake|reservoir|station|tank|the|government|govt)\b/g, " ").split(/[^a-z0-9]+/).filter((x) => x.length >= 3);
    const alias: Record<string, string> = { "red": "puzhal", "redhills": "puzhal", "gh": "rajiv", "rggh": "rajiv" };
    const q = ws.length ? ws.map((w) => alias[w] ?? w) : [place];
    where.push(`(${q.map(() => "LOWER(o.place_name) LIKE ?").join(" OR ")})`); params.push(...q.map((x) => `%${x}%`));
  }
  const future = metrics.every((m) => m === "imd_warning_level");
  if (!future) { where.push("o.observed_at <= ?"); params.push(c.now); }
  const known = new Map<string, string>();
  if (!when && !byDay) {
    // the latest of each, with the one before it
    const rows = await caseRows(`SELECT o.metric, o.place_name, o.value, o.unit, o.observed_at, o.zone_no, o.lat, o.lon, o.source, o.detail, o.is_synthetic,
        (SELECT AVG(p.value) FROM observations p WHERE p.metric = o.metric AND p.place_id = o.place_id AND p.observed_at > datetime(o.observed_at, '-7 days') AND p.observed_at < o.observed_at) AS avg7
      FROM observations o JOIN (SELECT metric, place_id, MAX(observed_at) AS m FROM observations WHERE metric IN (${metrics.map(() => "?").join(", ")}) ${future ? "" : "AND observed_at <= ?"} GROUP BY 1, 2) l ON l.metric = o.metric AND l.place_id = o.place_id AND l.m = o.observed_at
      WHERE ${where.join(" AND ")} ORDER BY o.place_name`, [...metrics, ...(future ? [] : [c.now]), ...params]);
    if (!rows.length) throw new ToolProblem(`No reading of ${metrics.join(", ")} is held${place ? ` for "${s(input.place)}"` : ""}. Places: ${(await caseRows(`SELECT DISTINCT place_name FROM observations WHERE metric IN (${metrics.map(() => "?").join(", ")}) LIMIT 40`, metrics)).map((r) => r.place_name).join(", ")}.`);
    const latest = rows.map((r) => s(r.observed_at)).sort().at(-1)!;
    const synth = rows.some((r) => Number(r.is_synthetic) === 1 || /hospital|pwd/.test(s(r.source)));
    const stale = rows.filter((r) => Date.parse(`${c.now.replace(" ", "T")}Z`) - Date.parse(`${s(r.observed_at).slice(0, 19).replace(" ", "T")}Z`) > 36 * 36e5);
    let part: Part;
    if (metrics.length > 1) {
      // one row a place, one column a reading
      const by = new Map<string, Rec>();
      for (const r of rows) { const k = s(r.place_name); const row = by.get(k) ?? ({ place: k, at: istWords(r.observed_at) } as Rec); row[s(r.metric)] = num(r.value); by.set(k, row); }
      const list = [...by.values()];
      const key = metrics.includes("bed_occupancy_pct") ? "bed_occupancy_pct" : metrics[0];
      list.sort((a, b) => Number(b[key] ?? -1) - Number(a[key] ?? -1));
      if (metrics.includes("total_beds") && metrics.includes("occupied_beds")) {
        const tb = list.reduce((x, r) => x + Number(r.total_beds ?? 0), 0), ob = list.reduce((x, r) => x + Number(r.occupied_beds ?? 0), 0);
        list.forEach((r) => { r.free_beds = r.total_beds != null && r.occupied_beds != null ? Number(r.total_beds) - Number(r.occupied_beds) : null; });
        known.set("beds", `All ${list.length} hospitals: ${ob} of ${tb} beds occupied (${Math.round((ob / Math.max(1, tb)) * 1000) / 10}%), ${tb - ob} free.`);
      }
      part = toPart("readings", "Latest readings", list, [{ key: "place", label: "Place" }, ...metrics.map((m) => ({ key: m, label: METRIC[m].label, unit: METRIC[m].unit, kind: "number" as const })), ...(list.some((r) => r.free_beds != null) ? [{ key: "free_beds", label: "Free beds", kind: "number" as const }] : []), { key: "at", label: "Read at" }], { of: "rank" });
    } else {
      const m = metrics[0];
      const list = rows.map((r) => ({ place: s(r.place_name), value: num(r.value), avg_last_7_days: num(r.avg7), at: istWords(r.observed_at), zone: r.zone_no ? zoneName(Number(r.zone_no), c.world) : null, detail: s(r.detail).slice(0, 120) || null, lat: r.lat as number, lon: r.lon as number }) as Rec).sort((a, b) => Number(b.value) - Number(a.value)).map((r, k) => ({ rank: k + 1, ...r }) as Rec);
      part = toPart("readings", METRIC[m].label, list, [{ key: "rank", label: "#" }, { key: "place", label: "Place" }, { key: "value", label: METRIC[m].label, unit: METRIC[m].unit, kind: "number" }, { key: "avg_last_7_days", label: "Average of the 7 days before", unit: METRIC[m].unit, kind: "number" }, { key: "zone", label: "Zone" }, { key: "at", label: "Read at" }, { key: "detail", label: "Detail" }], { of: "rank" });
      part.rows.forEach((r, k) => { r.lat = list[k].lat; r.lon = list[k].lon; });
    }
    const limits = [...(stale.length ? [`${stale.length} of these readings are old: ${stale.slice(0, 4).map((r) => `${s(r.place_name)} was last read ${istWords(r.observed_at)} (${agoWords(r.observed_at, c.now)})`).join("; ")}. Say so; never call them "now".`] : []), ...metrics.map((m) => METRIC[m].note).filter(Boolean) as string[],
      ...(synth && metrics.some((m) => HOSPITAL.includes(m)) ? ["The hospital feed is the project's generated hospital MIS data (9 government hospitals, one reading a day)."] : [])];
    return { about: `${metrics.length > 1 ? "Latest readings" : METRIC[metrics[0]].label} at ${part.rows.length} places`, parts: [part], facts: [...known.values()], asOf: latest, when: "the latest reading of each", limits, sources: [...new Set(metrics.map((m) => METRIC[m].source))] };
  }
  const w = winOf(when, c.now, "last_7_days");
  where.push("o.observed_at >= ?", "o.observed_at <= ?"); params.push(w.from, w.to);
  // the newest reading in the window stands beside its average: "how full" is the newest, never the mean of two days
  const newest = new Map((await caseRows(`SELECT * FROM (SELECT o.metric, o.place_name AS place, o.value, o.unit, ROW_NUMBER() OVER (PARTITION BY o.metric, o.place_name ORDER BY o.observed_at DESC) AS rn FROM observations o WHERE ${where.join(" AND ")}) WHERE rn = 1 LIMIT 400`, params)).map((r) => [`${s(r.metric)}|${s(r.place)}`, r]));
  const agg = await caseRows(`SELECT o.metric, o.place_name AS place, ROUND(AVG(o.value), 1) AS average, MAX(o.value) AS highest, MIN(o.value) AS lowest, COUNT(*) AS readings, MIN(o.observed_at) AS first_at, MAX(o.observed_at) AS last_at FROM observations o WHERE ${where.join(" AND ")} GROUP BY 1, 2 ORDER BY 1, 3 DESC LIMIT 120`, params);
  const parts: Part[] = [toPart("over", `Over ${w.label}`, agg.map((r, k) => ({ rank: k + 1, reading: METRIC[s(r.metric)].label, ...r, latest: num(newest.get(`${s(r.metric)}|${s(r.place)}`)?.value), unit: s(newest.get(`${s(r.metric)}|${s(r.place)}`)?.unit) || null, last_at: istWords(r.last_at) })), ["rank", ...(metrics.length > 1 ? ["reading"] : []), "place", "latest", "unit", "last_at", "average", "highest", "lowest", "readings"], { of: "rank" })];
  if (byDay) {
    const days = await caseRows(`SELECT substr(o.observed_at, 1, 10) AS d, o.metric, ROUND(AVG(o.value), 1) AS average, MAX(o.value) AS highest, MIN(o.value) AS lowest FROM observations o WHERE ${where.join(" AND ")} GROUP BY 1, 2 ORDER BY 1 LIMIT 200`, params);
    parts.push(toPart("days", "Day by day", days.map((r) => ({ day: istWords(r.d, false), day_key: s(r.d), reading: METRIC[s(r.metric)].label, average: num(r.average), highest: num(r.highest), lowest: num(r.lowest) })), ["day", ...(metrics.length > 1 ? ["reading"] : []), "average", "highest", "lowest"], { of: "series" }));
  }
  if (!agg.length) throw new ToolProblem(`No reading of ${metrics.join(", ")} falls in ${w.label}. The latest reading is found by leaving out the time.`);
  return { about: `${metrics.map((m) => METRIC[m].label).join(", ")} over ${w.label}`, when: w.label, parts, asOf: c.now, sources: [...new Set(metrics.map((m) => METRIC[m].source))] };
}

// -------------------------------------------------------------------- city --

/** any of the console's own tool results as tables and facts */
export function fromTool(r: ToolResult, o: { about: string; sources?: string[]; rows?: number; keys?: string[] }): ToolOut {
  const parts: Part[] = [];
  const data = redact(r.data) as Row | Row[] | null;
  const walk = (k: string, v: unknown) => {
    if (!Array.isArray(v) || !v.length || typeof v[0] !== "object") return;
    const rows = v.slice(0, o.rows ?? 30) as Row[];
    const cols = [...new Set(rows.flatMap((x) => Object.keys(x)))].filter((x) => rows.some((y) => y[x] != null && (typeof y[x] !== "object" || Array.isArray(y[x]))) && !/^(lat|lon|path|geometry|url|summary|body)$/.test(x)).slice(0, 14);
    const p = toPart(k, k.replace(/_/g, " "), rows, cols, { total: v.length });
    p.rows.forEach((y, i) => { for (const g of ["lat", "lon", "id"]) if (rows[i][g] != null && y[g] === undefined) y[g] = rows[i][g] as string | number; });
    if (rows.some((x) => /^INC-/.test(s(x.id)))) p.of = "cases";
    parts.push(p);
  };
  if (Array.isArray(data)) walk("rows", data);
  else for (const [k, v] of Object.entries(data ?? {})) if (!o.keys || o.keys.includes(k)) walk(k, v);
  return { about: o.about, parts: parts.slice(0, 6), facts: r.facts.slice(0, 45).map((f) => `${f.label}: ${f.value}${f.unit ? ` ${f.unit}` : ""}`), sources: o.sources ?? r.sources.map((x) => x.detail ?? x.name), asOf: r.asOf, limits: r.caveats, ids: r.incidentIds };
}

async function cityRun(input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  const topic = s(input.topic) || "traffic", zone = input.zone != null && input.zone !== "" ? zoneOf(input.zone, c.world) : null;
  const r = await runTool("city_now", { topic, zone, ...(input.rank ? { rank: input.rank } : {}) });
  const out = fromTool(r, { about: `The city now: ${topic}${zone ? ` in ${zoneName(zone, c.world)} zone` : ""}` });
  out.when = topic === "traffic" ? "live now" : "now, and what past heavy rains show";
  if (topic === "traffic") out.method = "TomTom's live incidents: very congested, congested and slow stretches, closed and flooded roads, accidents and road works; delay in minutes; the responsible department from the cause.";
  if (c.user.lockDept) out.limits = [...(out.limits ?? []), "Shown to every department: it is about the city's roads."];
  if (topic === "traffic") {
    const road = s(input.road).toLowerCase();
    const live = !road || out.parts.some((p) => p.rows.some((x) => Object.values(x).some((v) => typeof v === "string" && v.toLowerCase().includes(road))));
    // a road with no live jam: what was kept of it is read instead of "nothing held"
    const past = ((input.when ?? null) as WhenIn | null) ?? (live ? null : { named: "last_30_days" });
    if (past && past.named !== "today") {
      const w = winOf(past, c.now);
      const rows = await caseRows(`SELECT road, name, zone_name, COUNT(DISTINCT day) AS days_seen, SUM(seen) AS times_seen, SUM(very) AS very_congested, SUM(closed) AS closed, SUM(flooded) AS flooded, SUM(accidents) AS accidents, ROUND(MAX(max_delay_s) / 60.0, 1) AS worst_delay_min FROM traffic_days WHERE day >= ? AND day <= ?${zone ? " AND zone = ?" : ""}${road ? " AND LOWER(road || ' ' || name) LIKE ?" : ""} GROUP BY 1, 2, 3 ORDER BY times_seen DESC LIMIT 20`, [w.from.slice(0, 10), w.to.slice(0, 10), ...(zone ? [zone] : []), ...(road ? [`%${road}%`] : [])]);
      const held = await caseRows("SELECT MIN(day) AS a, MAX(day) AS b FROM traffic_days");
      out.parts = [toPart("roads", `Roads that jammed most, ${w.label}`, rows.map((x, k) => ({ rank: k + 1, ...x })), ["rank", "road", "name", "zone_name", "days_seen", "times_seen", "very_congested", "closed", "flooded", "accidents", "worst_delay_min"], { of: "rank" })];
      out.facts = live ? [] : [`No live jam, closure or accident is reported on a road matching "${s(input.road)}" right now; this is what was kept of it.`]; out.when = w.label; out.about = `Traffic kept over ${w.label}`;
      out.limits = [`The website keeps live traffic every 10 minutes since ${istWords(held[0]?.a)}; earlier days are not held.`];
      out.method = "Every 10 minutes the live jams are kept; a road is counted each time it was seen congested.";
    } else if (road) {
      for (const p of out.parts) p.rows = p.rows.filter((x) => Object.values(x).some((v) => typeof v === "string" && v.toLowerCase().includes(road)));
      out.parts = out.parts.filter((p) => p.rows.length);
      if (!out.parts.length) out.facts = [`No live jam, closure or accident is reported on a road matching "${s(input.road)}" right now.`, ...(out.facts ?? []).slice(0, 6)];
    }
  }
  return out;
}

async function pricesRun(input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  const item = s(input.item).trim() || null, market = s(input.market).trim() || null, when = (input.when ?? null) as WhenIn | null;
  const last = (await caseRows("SELECT MAX(date) AS d, MAX(fetched_at) AS f FROM mandi_market_prices"))[0] ?? {};
  const w = when ? winOf(when, c.now) : null;
  const where = ["1 = 1"], params: unknown[] = [];
  if (item) { where.push("LOWER(commodity) LIKE ?"); params.push(`%${item.toLowerCase().replace(/(?:oes|ies|es|s)$/, (m) => (m === "ies" ? "" : m === "oes" ? "o" : ""))}%`); }
  if (market) { where.push("LOWER(market) LIKE ?"); params.push(`%${market.toLowerCase().replace(/[.\s]+/g, "%")}%`); }
  if (w) { where.push("date >= ?", "date <= ?"); params.push(w.from.slice(0, 10), w.to.slice(0, 10)); }
  else { where.push("date = (SELECT MAX(x.date) FROM mandi_market_prices x WHERE x.market = mandi_market_prices.market AND x.commodity = mandi_market_prices.commodity)"); }
  const rows = await caseRows(`SELECT commodity, market, date, ROUND(modal_price / 100.0, 1) AS price_per_kg, ROUND(min_price / 100.0, 1) AS low, ROUND(max_price / 100.0, 1) AS high, cmdt_group FROM mandi_market_prices WHERE ${where.join(" AND ")} ORDER BY commodity, price_per_kg LIMIT ${item ? 200 : 400}`, params);
  if (!rows.length) {
    const items = (await caseRows("SELECT DISTINCT commodity FROM mandi_market_prices ORDER BY 1")).map((r) => r.commodity).join(", ");
    throw new ToolProblem(`No price is held for ${item ?? "that"}${market ? ` at ${market}` : ""}${w ? ` in ${w.label}` : ""}. The newest market day held is ${istWords(last.d)}. Items: ${items.slice(0, 900)}.`);
  }
  const by = new Map<string, Row[]>();
  for (const r of rows) by.set(s(r.commodity), [...(by.get(s(r.commodity)) ?? []), r]);
  const avg = [...by.entries()].map(([k, rs]) => ({ item: k, average_rs_per_kg: Math.round((rs.reduce((x, r) => x + Number(r.price_per_kg), 0) / rs.length) * 10) / 10, cheapest: `${rs[0].market} ${rs[0].price_per_kg}`, dearest: `${rs.at(-1)!.market} ${rs.at(-1)!.price_per_kg}`, markets: new Set(rs.map((r) => r.market)).size, date: istWords(rs.map((r) => s(r.date)).sort().at(-1)) }));
  if (market && !item) rows.sort((a, b) => Number(a.price_per_kg) - Number(b.price_per_kg));
  const daysOld = Math.round((Date.parse(`${c.now.slice(0, 10)}T00:00:00Z`) - Date.parse(`${s(last.d)}T00:00:00Z`)) / 864e5);
  return { about: `Market prices${item ? ` of ${item}` : ""}${market ? ` at ${market}` : ""}`, when: w ? w.label : `the newest market day of each (${istWords(last.d)})`, asOf: s(last.f) || null, sources: ["AGMARKNET (data.gov.in), Uzhavar Sandhai farmer markets in and around Chennai"], parts: [...(market && !item ? [] : [toPart("items", "By item (Rs per kg)", avg.slice(0, 60), ["item", "average_rs_per_kg", "cheapest", "dearest", "markets", "date"], { of: "rank", total: avg.length })]),
    ...(item || market ? [toPart("markets", "By market (Rs per kg)", rows.slice(0, 60).map((r, k) => ({ rank: k + 1, ...r, date: istWords(r.date) })), ["rank", "commodity", "market", "price_per_kg", "low", "high", "date"], { of: "rank", total: rows.length })] : [])],
    limits: daysOld > 3 ? [`The newest market day held is ${istWords(last.d)}, ${daysOld} days ago: AGMARKNET has not been read since. Say the date; never call it today's price.`] : [], method: "Modal (most common) price, turned from Rs per quintal into Rs per kg." };
}

// ---------------------------------------------------------------- contacts --

async function contactsRun(input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  const about = s(input.about).trim(), zone = input.zone != null && input.zone !== "" ? zoneOf(input.zone, c.world) : null;
  let dept: { code: string; name: string } | null = null;
  const limits: string[] = [];
  if (s(input.dept)) { try { dept = deptOf(input.dept, c.world); } catch (e) { if (!/pwd|public works/i.test(s(input.dept))) throw e; } }
  const pwd = /pwd|public works|water resources/i.test(`${s(input.dept)} ${about}`) || !!dept?.code.startsWith("PWD");
  const cond: string[] = [], params: unknown[] = [];
  if (dept && !dept.code.startsWith("PWD")) { cond.push("dept_code = ?"); params.push(dept.code); }
  if (zone) { cond.push("zone_no = ?"); params.push(zone); }
  const words = about.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 3 && !/^(contact|contacts|details|detail|number|numbers|phone|mobile|email|officer|officers|official|officials|department|who|the|for|give|pwd|head|charge|incharge|get|call)$/.test(x));
  if (words.length && !dept && !pwd) { cond.push(`(${words.map(() => "LOWER(name || ' ' || designation || ' ' || COALESCE(office, '') || ' ' || COALESCE(grp, '') || ' ' || COALESCE(region, '')) LIKE ?").join(" OR ")})`); params.push(...words.map((x) => `%${x}%`)); }
  const COLS: (Col | string)[] = [{ key: "n", label: "#" }, "name", "designation", "office", "department", "zone", "phone", "email"];
  let gcc = pwd && !zone && !dept ? [] : await caseRows(`SELECT name, designation, office, dept_code, zone_no, phone, email, grp, retrieved_on FROM official_contacts ${cond.length ? `WHERE ${cond.join(zone && dept ? " OR " : " AND ")}` : ""} ORDER BY ${zone ? "zone_no IS NULL, " : ""}rank, contact_id LIMIT 40`, params);
  if (dept?.code.startsWith("PWD") && !zone) gcc = [];
  const parts: Part[] = [];
  const row = (r: Row, k: number): Rec => ({ n: k + 1, name: s(r.name), designation: s(r.designation), office: s(r.office) || null, department: r.dept_code ? c.world.depts.concat(c.world.bodies ?? []).find((d) => d.code === r.dept_code)?.name ?? s(r.dept_code) : s(r.grp) || null, zone: r.zone_no ? `${s(r.zone_no)} ${zoneName(Number(r.zone_no), c.world)}` : null, phone: s(r.phone) || null, email: s(r.email) || null });
  if (gcc.length) parts.push(toPart("officials", "Officials (GCC Who's who)", gcc.map(row), COLS, { of: "contact" }));
  if (pwd || (!gcc.length && !dept)) {
    const tk = s(input.taluk) ? talukOf(input.taluk, c.world) : null;
    const want = [...(tk ? ["LOWER(taluk_codes_covered || ' ' || COALESCE(taluks, '')) LIKE ?"] : []), ...(pwd ? (dept ? ["dept_code = ?"] : []) : words.length ? [`(${words.map(() => "LOWER(office_name || ' ' || wing || ' ' || officer_name || ' ' || designation || ' ' || COALESCE(taluks, '')) LIKE ?").join(" OR ")})`] : [])];
    const offs = await caseRows(`SELECT office_name, wing, officer_name AS name, designation, phone, email, dept_code, taluks FROM ref_offices ${want.length ? `WHERE ${want.join(" AND ")}` : ""} LIMIT 30`, [...(tk ? [`%${tk.name.toLowerCase()}%`] : []), ...(pwd ? (dept ? [dept.code] : []) : words.map((x) => `%${x}%`))]);
    if (offs.length) { parts.push(toPart("pwd", "PWD offices", offs.map((r, k) => ({ n: k + 1, name: s(r.name), designation: s(r.designation), office: s(r.office_name), wing: s(r.wing), taluks: s(r.taluks), phone: s(r.phone), email: s(r.email) })), ["n", "name", "designation", "office", "wing", "taluks", "phone", "email"], { of: "contact" })); limits.push("PWD office names, phones and e-mails come from the project's PWD dataset (sample values, not published numbers): say so when giving them."); }
  }
  if (dept) {
    const [d] = await caseRows("SELECT name, org, head, route FROM ref_departments WHERE code = ?", [dept.code]);
    if (d) parts.push(toPart("dept", "Department and escalation", [{ department: s(d.name), organisation: s(d.org), head: s(d.head), escalation: s(d.route) }], ["department", "organisation", "head", "escalation"]));
    if (!gcc.length && !parts.some((p) => p.key === "pwd")) limits.push(`No named officer with a phone is held for ${dept.name}: only the post of its head and the escalation route. The GCC control room (1913) takes calls at any hour.`);
  }
  if (!parts.length || (!gcc.length && !parts.some((p) => p.key === "pwd" || p.key === "dept"))) {
    const all = await caseRows("SELECT name, designation, office, dept_code, zone_no, phone, email, grp FROM official_contacts ORDER BY rank, contact_id LIMIT 48");
    parts.push(toPart("officials", "Every official held", all.map(row), COLS, { of: "contact" }));
    limits.push(`No official matches "${about || s(input.dept)}": the whole directory is given. Tahsildars, revenue officers, police, Metrowater and electricity officers are not in the directory.`);
  }
  const p = s((await caseRows("SELECT MAX(retrieved_on) AS d FROM official_contacts"))[0]?.d);
  return { about: `Officials${dept ? ` of ${dept.name}` : ""}${zone ? ` for ${zoneName(zone, c.world)} zone` : ""}${about && !dept ? ` matching "${about}"` : ""}`, parts, limits, asOf: null, sources: ["Greater Chennai Corporation Who's who page", ...(parts.some((x) => x.key === "pwd") ? ["PWD office directory (project dataset)"] : [])], facts: [`The GCC directory was read on ${istWords(p)}.`] };
}

async function facilitiesRun(input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  const type = s(input.type).toLowerCase().replace(/s$/, "").replace(/\s+/g, "_"), about = s(input.about).toLowerCase();
  const tk = s(input.taluk) ? talukOf(input.taluk, c.world) : null;
  const types = (await caseRows("SELECT type, COUNT(*) AS n FROM ref_facilities GROUP BY 1")).map((r) => s(r.type));
  const t = types.find((x) => x === type || x.includes(type) || type.includes(x));
  const cond = ["1 = 1"], params: unknown[] = [];
  if (type) { if (!t) throw new ToolProblem(`No list of "${type}" is held. Kinds of place: ${types.join(", ")}. Schools, shelters, roads and other map layers are answered by the map tool.`); cond.push("f.type = ?"); params.push(t); }
  if (tk) { cond.push("f.taluk_code = ?"); params.push(tk.code); }
  for (const x of about.split(/[^a-z0-9]+/).filter((y) => y.length >= 3).slice(0, 4)) { cond.push("LOWER(f.name || ' ' || COALESCE(f.address, '')) LIKE ?"); params.push(`%${x}%`); }
  const rows = await caseRows(`SELECT f.facility_id AS id, f.name, f.type, tk.name AS taluk, f.capacity, f.specialties, f.address, f.lat, f.lon, f.basin FROM ref_facilities f LEFT JOIN ref_taluks tk ON tk.taluk_code = f.taluk_code WHERE ${cond.join(" AND ")} ORDER BY f.name LIMIT 80`, params);
  return { about: `${rows.length} ${t ? t.replace(/_/g, " ") : "place"}${rows.length === 1 ? "" : "s"}${tk ? ` in ${tk.name} taluk` : ""}`, asOf: null, sources: ["the district's facility list"], parts: [toPart("places", "Places", rows.map((r, k) => ({ n: k + 1, ...r, lat: r.lat as number, lon: r.lon as number })), ["n", "name", "type", "taluk", "capacity", "specialties", "address", "basin"], { of: "place" })] };
}

async function mapRun(input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  const q = s(input.question).trim();
  if (q.length < 4) throw new ToolProblem("Give the whole place question, with the places named.");
  const r = await askMap({ text: q, plan: null, prev: null, context: { zone: null, taluk: null, incidentId: null, drawn: null, ward: null }, user: { email: c.user.email, role: c.user.role, lockDept: c.user.lockDept }, reword: false, signal: c.signal });
  if (r.kind !== "answer" || !r.answer) throw new ToolProblem("The map could not place that question: name the places and what is looked for near them (schools, hospitals, shelters, police stations, lakes, flooding, incidents...) with a distance.");
  const rows = (r.rows as unknown as Row[]).slice(0, 25);
  const ids = rows.map((x) => s(x.id)).filter((x) => /^INC-/.test(x));
  const parts: Part[] = [];
  if (ids.length) { const cs = await caseList(`c.id IN (${ids.map(() => "?").join(",")})`, ids, { limit: 25 }); const o = new Map(ids.map((x, k) => [x, k])); cs.sort((a, b) => (o.get(String(a.id)) ?? 0) - (o.get(String(b.id)) ?? 0)).forEach((x, k) => { x.n = k + 1; }); parts.push(casesPart("cases", r.answer.headline, cs, r.total)); }
  const ex = r.extra as unknown as Record<string, unknown>;
  const groups = ex.groups as Row[] | undefined;
  if (groups?.length) parts.push(toPart("groups", "By area", groups.slice(0, 25).map((g, k) => ({ rank: k + 1, area: s(g.label), count: Number(g.n), lat: g.lat as number, lon: g.lon as number })), ["rank", "area", "count"], { of: "rank", total: groups.length }));
  const near = ex.nearest as { pairs?: { id: string | null; to: Row[] }[] } | undefined;
  if (near?.pairs?.length) parts.push(toPart("nearest", "Nearest", near.pairs.flatMap((p) => p.to.map((x) => ({ for: p.id, place: s(x.name), metres: Math.round(Number(x.m)), lat: x.lat as number, lon: x.lon as number }))).slice(0, 25), ["place", "metres", "for"], { of: "place" }));
  const pts = r.context.points ?? [];
  if (pts.length && !near) parts.push(toPart("points", "Places on the map", pts.slice(0, 40).map((x, k) => ({ n: k + 1, name: x.name, kind: x.kind, layer: x.layer, lat: x.lat, lon: x.lon })), ["n", "name", "kind", "layer"], { of: "place", total: pts.length }));
  return { about: r.answer.headline, asOf: c.now, sources: ["Ask the Map: incident places, GCC wards and zones, OpenStreetMap places and roads"], parts, facts: [r.answer.meaning, ...(r.trace ?? []).slice(0, 6).map((x) => x.note_en)].filter(Boolean) as string[], ids, method: "Straight-line distances on the map; only incidents placed exactly are pinned.", limits: r.unplaced.length ? [`${r.unplaced.length} incidents have no exact place and are not measured.`] : [],
    steps: input.show === false || c.channel === "chat" ? [] : [{ a: "map", q }] };
}

async function studioRun(input: Record<string, unknown>, c: ToolCtx): Promise<ToolOut> {
  const who = { role: c.user.role, lockDept: c.user.lockDept };
  if (!mayUse(who as never)) throw new ToolProblem("The Data Studio is the Collector's own.");
  const tables = studioTables(who);
  if (!tables.length) return { about: "No file has been added to the Data Studio yet", parts: [], sources: ["Data Studio"] };
  const hiddenOf = (ts: StudioTable[]) => ts.filter((t) => t.hidden.length).map((t) => `${t.tag}: the column ${t.hidden.join(", ")} holds personal details and is not read.`);
  const colsPart = (t: StudioTable): Part => toPart(`cols_${t.tag.toLowerCase()}`, `${t.tag} ${t.name}: its columns`, t.cols.map((x) => ({ column: x.key, label: x.label, type: x.type, filled: x.filled, blank: x.blank, distinct: x.distinct, lowest: x.min ?? null, highest: x.max ?? null, most_common: x.top ?? null })) as unknown as Rec[], ["column", "label", "type", "filled", "blank", "distinct", "lowest", "highest", "most_common"], { total: t.cols.length });
  if (!s(input.sql)) {
    const want = s(input.dataset).toLowerCase();
    const picked = want ? tables.filter((t) => t.tag.toLowerCase() === want || t.name.toLowerCase().includes(want) || want.includes(t.name.toLowerCase())) : tables;
    const ts = picked.length ? picked : tables;
    const meta = ts.map((t) => ({ tag: t.tag, file: t.name, rows: t.rows, one_row_is: t.entity, window: t.window, columns: t.cols.length, about: t.summary, added: istWords(getMeta(t.id)?.createdAt?.slice(0, 19).replace("T", " ")) }));
    return { about: `The Collector's own files in the Data Studio: ${tables.length}`, asOf: c.now, sources: ts.map((t) => `the uploaded file "${t.name}" (Data Studio)`), parts: [toPart("files", "Files in the Data Studio", meta as unknown as Rec[], ["tag", "file", "rows", "one_row_is", "window", "columns", "about", "added"]), ...ts.slice(0, 3).map(colsPart)], limits: hiddenOf(ts),
      method: "To count or list from a file, call studio with sql on its table (D1, D2...)." };
  }
  const r = studioSql(s(input.sql), who);
  const keys = Object.keys(r.rows[0] ?? {});
  return { about: `${s(input.why) || "From the uploaded file"}: ${r.rows.length}${r.more ? "+" : ""} row${r.rows.length === 1 ? "" : "s"}`, asOf: c.now, when: r.tables.map((t) => t.window).filter(Boolean).join("; ") || null, sources: r.tables.map((t) => `the uploaded file "${t.name}" (Data Studio, ${t.rows} rows)`),
    parts: r.rows.length ? [toPart("rows", s(input.why) || "From the file", r.rows, keys, { of: r.rows.length > 1 && keys.length >= 2 ? (/^(?:day|week|month|date)$/i.test(keys[0]) ? "series" : "rank") : null, total: r.more ? undefined : r.rows.length })] : [], limits: [...(r.rows.length ? [] : ["No row of the file matches."]), ...hiddenOf(r.tables)], method: `Read from the file's own rows: ${s(input.sql).slice(0, 400)}` };
}

export const readingsTool: BrainTool = {
  name: "readings",
  description: "Measured readings, latest or over a time: hospital (bed occupancy, free beds, total beds, outpatients, emergencies, disease cases, doctors, nurses, medicine, ambulances at the 9 government hospitals), air quality by station, rain by gauge, temperature, humidity, lakes and reservoirs (% full, mcft, outflow), reservoir inflow, river gauges, IMD warning level by day. Groups: beds, hospital, lakes, rain, air, weather, rivers.",
  doing: { en: "Reading the gauges", ta: "அளவீடுகளைப் பார்க்கிறேன்" },
  input: { type: "object", additionalProperties: false, required: ["metrics"], properties: { metrics: { type: "array", items: { type: "string", enum: [...Object.keys(GROUPS), ...Object.keys(METRIC)] } }, place: { type: "string", description: "hospital, lake, station name; left out: all" }, when: WHEN_SCHEMA, by_day: { type: "boolean" } } },
  run: readingsRun
};
export const cityTool: BrainTool = {
  name: "city",
  description: "The city on the ground: live traffic (jams, very congested roads, closed and flooded roads, accidents, delay, who should act, by zone or road; with `when`, the roads that jammed most over past days), rain and flooding (which streets flood in heavy rain, gauges, forecast), power cuts and metro/train delays in heavy rain.",
  doing: { en: "Looking at the city now", ta: "நகர நிலவரத்தைப் பார்க்கிறேன்" },
  input: { type: "object", additionalProperties: false, required: ["topic"], properties: { topic: { type: "string", enum: ["traffic", "flood", "rain", "power", "metro"] }, zone: { type: ["integer", "string"] }, road: { type: "string" }, when: WHEN_SCHEMA } },
  run: cityRun
};
export const pricesTool: BrainTool = {
  name: "prices",
  description: "Vegetable, fruit and grocery prices at Chennai's farmer markets (Rs per kg), by item and market, the newest day or over a time.",
  doing: { en: "Reading the market prices", ta: "சந்தை விலைகளைப் பார்க்கிறேன்" },
  input: { type: "object", additionalProperties: false, properties: { item: { type: "string" }, market: { type: "string" }, when: WHEN_SCHEMA } },
  run: pricesRun
};
export const contactsTool: BrainTool = {
  name: "contacts",
  description: "Officials' contact details (name, designation, office, phone, e-mail): by department (Storm Water Drain, PWD, Solid Waste...), zone (zonal officer), taluk (PWD offices) or name/designation. Official numbers are public and may be read out. Not for citizens.",
  doing: { en: "Finding the officials", ta: "அதிகாரிகளைத் தேடுகிறேன்" },
  input: { type: "object", additionalProperties: false, properties: { dept: { type: "string" }, zone: { type: ["integer", "string"] }, taluk: { type: "string" }, about: { type: "string", description: "name, designation or office words (commissioner, control room, superintending engineer...)" } } },
  run: contactsRun
};
export const facilitiesTool: BrainTool = {
  name: "facilities",
  description: "Lists of places: hospitals, police stations, lakes, canals, drains, sluices, bunds, bridges, government buildings, weather/air stations, river gauges, with taluk, capacity and address. For distances or 'near' use map.",
  doing: { en: "Finding the places", ta: "இடங்களைத் தேடுகிறேன்" },
  input: { type: "object", additionalProperties: false, properties: { type: { type: "string" }, taluk: { type: "string" }, about: { type: "string" } } },
  run: facilitiesRun
};
export const mapTool: BrainTool = {
  name: "map",
  description: "Places and distances, answered by the console's own map (Ask the Map): what is near what, within how many metres, nearest hospital/school/shelter/police station, incidents along a road, wards without something, and drawn on the Overview map. Give the whole question in English with the places named.",
  doing: { en: "Working on the map", ta: "வரைபடத்தில் பார்க்கிறேன்" },
  input: { type: "object", additionalProperties: false, required: ["question"], properties: { question: { type: "string" }, show: { type: "boolean", description: "true (default) also opens it on the console map" } } },
  run: mapRun
};
export const studioTool: BrainTool = {
  name: "studio",
  description: "The Collector's own uploaded files (Data Studio), each a table D1, D2...: with no input, the files and their columns (types, blanks, distinct values, lowest, highest, most common); with sql, one SELECT on them (SELECT SUM(total_riders) AS riders FROM D1 WHERE day = '2026-11-14'). Columns day, zone (its number), ward, taluk (its code), place, lat, lon are the console's reading of each row. For anything about what such a file holds: counts, rankings, trends, lists, blanks.",
  doing: { en: "Reading your file", ta: "உங்கள் கோப்பைப் படிக்கிறேன்" }, collectorOnly: true,
  input: { type: "object", additionalProperties: false, properties: { dataset: { type: "string", description: "its tag (D1) or name" }, sql: { type: "string", description: "one SELECT on D1, D2..." }, why: { type: "string", description: "what the rows are, in a few words" } } },
  run: studioRun
};
