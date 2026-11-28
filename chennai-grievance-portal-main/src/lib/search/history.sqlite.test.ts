/**
 * The search box over the whole record, on an isolated in-memory store through the AWS store's MySQL -> SQLite translation (28 Nov 2026,
 * the owner: "if I search for some news that was reported 52 days ago, I couldn't find it ... air quality, vegetable prices, reservoir
 * gauges ... I couldn't search them for the past days"). Each kind is searched on a past day; the officer's search is locked to its
 * department. The price list, the reservoir history and the CFM-DSS rain file are fixtures in a temporary folder.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const pool = {
  query: async (sql: string, params: unknown[] = []) => {
    const [s, p] = expand(translate(sql), params);
    let st;
    for (let tries = 0; !st; tries++) {
      try {
        st = h.db.prepare(s);
      } catch (e) {
        const msg = String((e as Error).message);
        if (/no such table/i.test(msg)) return [[]];
        const col = /no such column: i\.(\w+)/.exec(msg)?.[1];
        if (col && tries < 60) { h.db.exec(`ALTER TABLE incidents ADD COLUMN ${col}`); continue; }
        throw e;
      }
    }
    return /^\s*(SELECT|WITH)/i.test(s) ? [st.all(...(p as never[]))] : [{ affectedRows: Number(st.run(...(p as never[])).changes) }];
  }
};
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t, OPS_DB: "district_intel_ops", TITLE: "i.title", CLUSTER: "COALESCE(i.cluster_id, i.incident_id)" }));
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/assistant/studiolink", () => ({ uniqueDatasets: () => [] }));

// the fixture files: the Uzhavar Sandhai price list, Chennai Metro Water's kept days and today's file, the CFM-DSS rain gauges
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "diq-search-"));
process.env.TN_PRICES_FILE = path.join(DIR, "tn-prices.json");
process.env.CMWSSB_HISTORY_FILE = path.join(DIR, "cmwssb-lakes-history.json");
process.env.CMWSSB_LAKES_FILE = path.join(DIR, "cmwssb-lakes.json");
process.env.CFM_RAIN_FILE = path.join(DIR, "cfm-rain.json");

const { collectorSearch, officerSearch } = await import("./history");
const { forgetTn } = await import("@/lib/collector/tnprices");
const { forgetLakeHistory, keepLakeHistory, lakeDays } = await import("./lakehistory");
const { searchIndexes } = await import("./hooks");

// Saturday 28 Nov 2026, 10 AM IST: 52 days ago is 7 Oct
const NOW = "2026-11-28 10:00:00";

const lake = (key: string, name: string, pct: number, storage: number, cap: number) => ({ key, name, lat: 13, lon: 80, ftlFt: 85.4, capacityMcft: cap, levelFt: 75.71,
  storageMcft: storage, pct, inflow: null, outflow: 187, rainMm: null, lastYearMcft: 3028 });
const lakeDay = (date: string, chem: number) => ({ date, rows: [lake("CHEMBARAMBAKKAM", "Chembarambakkam", chem, Math.round(36.45 * chem), 3645), lake("PUZHAL", "Puzhal (Red Hills)", 68.9, 2274, 3300)],
  total: { capacityMcft: 6945, storageMcft: Math.round(36.45 * chem) + 2274, pct: 50, lastYearMcft: null } });

beforeAll(() => {
  const cell = (c: string, lo: number, hi: number) => [c, "", lo * 100, hi * 100, ((lo + hi) / 2) * 100, null, "Vegetables"];
  fs.writeFileSync(process.env.TN_PRICES_FILE!, JSON.stringify({ v: 1, source: "test", unit: "rupees a quintal", days: {
    "2026-11-10": { Nanganallur: { at: "2026-11-11 13:00:00", rows: [cell("Tomato", 20, 30), cell("Onion", 40, 50)] }, Ambattur: { at: "2026-11-11 13:00:00", rows: [cell("Tomato", 22, 32)] } },
    "2026-11-12": { Nanganallur: { at: "2026-11-13 13:00:00", rows: [cell("Tomato", 30, 40)] } }
  } }));
  fs.writeFileSync(process.env.CMWSSB_HISTORY_FILE!, JSON.stringify({ v: 1, source: "test", url: "test", days: { "2026-11-01": lakeDay("2026-11-01", 38.6), "2026-11-03": lakeDay("2026-11-03", 39.2) } }));
  fs.writeFileSync(process.env.CMWSSB_LAKES_FILE!, JSON.stringify({ days: { "2026-11-20": lakeDay("2026-11-20", 41.0) }, todayFetchedAt: 0, error: null }));
  fs.writeFileSync(process.env.CFM_RAIN_FILE!, JSON.stringify({ gauges: [{ id: "G1", name: "Tondiarpet", inChennai: true }, { id: "G2", name: "Adyar", inChennai: true }],
    rain: { "2026-11-27": { G1: { p: 4, h: { "0": 5, "6": 7 } }, G2: { p: 4, h: { "0": 0.5 } } } } }));
});

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, cluster_id TEXT, category_label TEXT, category_code TEXT, lead_dept TEXT, zone_no INTEGER, zone_name TEXT,
      ward_no INTEGER, taluk_code TEXT, place_text TEXT, lat REAL, lon REAL, severity_level TEXT, status_std TEXT, is_open INTEGER, verified INTEGER, citizen_complaints INTEGER,
      first_reported_at TEXT, priority_score REAL, last_update_at TEXT);
    CREATE TABLE documents (doc_id TEXT PRIMARY KEY, story_id TEXT, title TEXT, title_en TEXT, lang TEXT, summary TEXT, body TEXT, url TEXT, publisher TEXT, publisher_domain TEXT,
      publisher_tier TEXT, source_kind TEXT, published_at TEXT, is_district INTEGER, place_text TEXT, linked_incident_id TEXT);
    CREATE INDEX ix_documents_published_at ON documents (published_at);
    CREATE TABLE observations (metric TEXT, value REAL, unit TEXT, place_type TEXT, place_id TEXT, place_name TEXT, lat REAL, lon REAL, ward_no INTEGER, zone_no INTEGER,
      taluk_code TEXT, observed_at TEXT, period TEXT, source TEXT, quality TEXT, is_synthetic INTEGER, detail TEXT);
    CREATE INDEX ix_observations_metric ON observations (metric);
    CREATE TABLE ref_departments (code TEXT, name TEXT, org TEXT, head TEXT, route TEXT, action_owner INTEGER);
    CREATE TABLE ref_wards (ward_no INTEGER, zone_no INTEGER, zone_name TEXT, taluk_code TEXT, centroid_lat REAL, centroid_lon REAL);
    CREATE TABLE ref_taluks (taluk_code TEXT, name TEXT, aliases TEXT, lat REAL, lon REAL);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT, decided_by TEXT, decided_at TEXT);
    CREATE TABLE dept_assignments (incident_id TEXT, dept_code TEXT, status TEXT);
    CREATE TABLE officer_steps (step_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, step TEXT, note TEXT, actor TEXT, report_id TEXT, at TEXT);
    CREATE TABLE sources (source_id INTEGER PRIMARY KEY, name TEXT, kind TEXT);
    CREATE TABLE events (event_id TEXT, incident_id TEXT, source TEXT, source_record_id TEXT);
    INSERT INTO ref_departments VALUES ('GCC-SWD', 'Storm Water Drains', 'GCC', 'SE', '', 1), ('POL-GCP', 'Greater Chennai Police', 'Police', 'Commissioner', '', 1);
    INSERT INTO ref_wards VALUES (64, 6, 'Thiru. Vi. Ka. Nagar', 'TLK-PER', 13.12, 80.21), (160, 12, 'Alandur', 'TLK-ALD', 13.0, 80.2);
    INSERT INTO ref_taluks VALUES ('TLK-ALD', 'Alandur', 'Alandur|Nanganallur', 13.0, 80.2);`);
  return db;
}
function inc(id: string, dept: string, title: string, at: string) {
  const [label, code] = dept === "POL-GCP" ? ["Crime", "CRIME"] : ["Drainage", "DRAINAGE_SEWAGE"];
  h.db.prepare(`INSERT INTO incidents (incident_id, title, category_label, category_code, lead_dept, zone_no, zone_name, ward_no, place_text, severity_level, status_std, is_open, verified,
    citizen_complaints, first_reported_at, priority_score, last_update_at) VALUES (?, ?, ?, ?, ?, 6, 'Thiru. Vi. Ka. Nagar', 64, 'Kolathur', 'Medium', 'Open', 1, 0, 0, ?, 1, ?)`)
    .run(id, title, label, code, dept, at, at);
}
function doc(id: string, o: { story?: string; title: string; en?: string; lang?: string; publisher: string; domain?: string | null; tier?: string; at: string; incident?: string; body?: string }) {
  h.db.prepare(`INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'news', ?, 1, ?, ?)`).run(id, o.story ?? null, o.title, o.en ?? (o.lang === "ta" ? null : o.title), o.lang ?? "en",
    o.title, o.body ?? null, `https://example.org/${id}`, o.publisher, o.domain === undefined ? "thehindu.com" : o.domain, o.tier ?? "established", o.at, "Kolathur", o.incident ?? null);
}
function obs(metric: string, id: string, name: string, at: string, v: number, o: { lat?: number; lon?: number; source?: string; detail?: string; syn?: number } = {}) {
  h.db.prepare(`INSERT INTO observations (metric, value, unit, place_type, place_id, place_name, lat, lon, observed_at, period, source, quality, is_synthetic, detail)
    VALUES (?, ?, '', 'facility', ?, ?, ?, ?, ?, 'day', ?, 'ok', ?, ?)`).run(metric, v, id, name, o.lat ?? null, o.lon ?? null, at, o.source ?? "cpcb", o.syn ?? 0, o.detail ?? null);
}

beforeEach(() => {
  h.db = fresh();
  forgetTn();
  forgetLakeHistory();
  // 7 Oct (52 days ago): the drain collapse in Kolathur, in English and in Tamil, filed into Storm Water Drains' case; a police case the same day
  inc("I-OLD", "GCC-SWD", "Drain collapse – Kolathur", "2026-10-07 10:00:00");
  inc("I-NEW", "GCC-SWD", "Drain overflow – Kolathur", "2026-11-25 09:00:00");
  inc("I-POL", "POL-GCP", "Chain snatching – Kolathur", "2026-10-07 12:00:00");
  doc("D-OLD", { story: "S-OLD", title: "Stormwater drain collapses in Kolathur", publisher: "The Hindu", at: "2026-10-07 11:00:00", incident: "I-OLD" });
  doc("D-OLD2", { story: "S-OLD", title: "கொளத்தூரில் மழைநீர் வடிகால் இடிந்தது", en: "Stormwater drain collapses in Kolathur", lang: "ta", publisher: "Dinamani", domain: "dinamani.com", at: "2026-10-07 13:00:00" });
  doc("D-SOC", { title: "Kolathur drain collapse video", publisher: "Facebook", domain: "facebook.com", tier: "social", at: "2026-10-07 14:00:00" });
  doc("D-POL", { title: "Chain snatching in Kolathur", publisher: "The Hindu", at: "2026-10-07 15:00:00", incident: "I-POL" });
  // six newer reports with the same words: the old search showed the four newest, so the report of 7 Oct never came up
  for (let k = 1; k <= 6; k++) doc(`D-N${k}`, { title: `Drain work in Kolathur, update ${k}`, publisher: "The Hindu", at: `2026-11-2${k} 09:00:00` });
  // a Tamil report, found by its English translation
  doc("D-TA", { title: "வேளச்சேரியில் வெள்ளம்", en: "Flooding in Velachery", lang: "ta", publisher: "Dinamani", domain: "dinamani.com", at: "2026-09-15 08:00:00" });
  // air quality: Velachery and Manali (CPCB)
  obs("aqi", "CPCB-velachery", "Velachery Res. Area, Chennai - CPCB", "2026-10-03 06:00:00", 98, { lat: 12.99, lon: 80.22 });
  obs("aqi", "CPCB-velachery", "Velachery Res. Area, Chennai - CPCB", "2026-10-03 18:00:00", 112, { lat: 12.99, lon: 80.22 });
  obs("aqi", "CPCB-velachery", "Velachery Res. Area, Chennai - CPCB", "2026-10-15 06:00:00", 180, { lat: 12.99, lon: 80.22 });
  obs("aqi", "CPCB-manali", "Manali, Chennai - CPCB", "2026-10-03 06:00:00", 150, { lat: 13.16, lon: 80.26 });
  obs("aqi", "CPCB-manali", "Manali, Chennai - CPCB", "2026-10-10 06:00:00", 260, { lat: 13.16, lon: 80.26 });
  obs("aqi", "CPCB-manali", "Manali, Chennai - CPCB", "2026-11-02 06:00:00", 300, { lat: 13.16, lon: 80.26 });
  // IMD's 24-hour rain at 8:30 AM is the day before's rain day
  obs("rainfall_24h_mm", "IMD-43278", "Chennai-Nungambakkam", "2026-11-27 08:30:00", 12.5, { source: "imd" });
  obs("rainfall_24h_mm", "IMD-43278", "Chennai-Nungambakkam", "2026-11-28 08:30:00", 3, { source: "imd" });
  // CFM-DSS river gauges
  obs("gauge_level_m", "CFM-106", "Basin Bridge", "2026-11-26 06:30:00", 1.62, { source: "cfm", detail: "warning 2.652, danger 1.952; danger stage below warning stage" });
  obs("gauge_level_m", "CFM-107", "Aminjikarai Bridge", "2026-11-26 06:30:00", 10.79, { source: "cfm", detail: "warning 11.0, danger 12.0" });
});

describe("news: every report the store holds, on any day", () => {
  it("a report of 52 days ago is found, with its story's reports, its outlets and its date", async () => {
    const r = await collectorSearch("kolathur drain 52 days ago", { now: NOW });
    expect(r.when).toMatchObject({ day: "2026-10-07", label: "7 Oct 2026 (52 days ago)" });
    expect(r.topic).toBe("kolathur drain");
    expect(r.news.map((n) => n.story ?? n.id)).toEqual(["S-OLD"]);
    // the story's newest report leads (the Tamil one); the incident is the story's, filed through the English report
    expect(r.news[0]).toMatchObject({ id: "D-OLD2", t: "2026-10-07 13:00:00", outlets: 2, incident: "I-OLD", titleEn: "Stormwater drain collapses in Kolathur" });
    expect([...r.news[0].docIds].sort()).toEqual(["D-OLD", "D-OLD2"]);
    // a social-media post is no news report
    expect(JSON.stringify(r.news)).not.toContain("D-SOC");
    // the incidents of that day with the words
    expect(r.incidents.map((i) => i.id)).toEqual(["I-OLD"]);
  });

  it("with no date, the best matches first and every other match listed: the old report is not pushed out", async () => {
    const r = await collectorSearch("kolathur drain", { now: NOW });
    expect(r.news).toHaveLength(6);
    expect(r.newsTotal).toBe(7);
    expect(r.news[0].id).toBe("D-N6");
    expect(r.newsRest.some((n) => n.id === "D-OLD" || n.id === "D-OLD2")).toBe(true);
  });

  it("a day with no subject lists that day's stories, the most covered first", async () => {
    const r = await collectorSearch("news 52 days ago", { now: NOW });
    expect(r.incidents).toEqual([]);
    expect(r.news.map((n) => n.story ?? n.id)).toEqual(["S-OLD", "D-POL"]);
  });

  it("a Tamil report is found by its English translation and by its Tamil words", async () => {
    const en = await collectorSearch("velachery flooding", { now: NOW });
    expect(en.news[0]).toMatchObject({ id: "D-TA", title: "வேளச்சேரியில் வெள்ளம்", titleEn: "Flooding in Velachery", lang: "ta" });
    const ta = await collectorSearch("வேளச்சேரி", { now: NOW });
    expect(ta.news.map((n) => n.id)).toEqual(["D-TA"]);
  });

  it("a date before the record says what is held", async () => {
    const r = await collectorSearch("pothole 4 months ago", { now: NOW });
    expect(r.news).toEqual([]);
    expect(r.notes[0]).toMatch(/^Nothing was found for July 2026 \(4 months ago\)\. News is held from 15 Sept? 2026 to 26 Nov 2026; incidents from 7 Oct 2026 to 25 Nov 2026\.$/);
  });
});

describe("air quality on a past day", () => {
  it("a station and a day: its highest reading that day, with India's AQI category", async () => {
    const r = await collectorSearch("AQI Velachery 3 October", { now: NOW });
    expect(r.values).toHaveLength(1);
    expect(r.values[0]).toMatchObject({ kind: "aqi", day: "2026-10-03", generated: false, title: "Velachery Res. Area (CPCB): AQI 112, Moderate" });
    expect(r.values[0].sub).toContain("highest of 2 readings (98 to 112)");
    expect(r.values[0].table?.md).toContain("| Velachery Res. Area (CPCB) | 112 | Moderate |");
  });

  it("a place with no station: the nearest station, said so", async () => {
    const r = await collectorSearch("AQI Alandur 3 October", { now: NOW });
    expect(r.values[0].title).toMatch(/^Velachery Res\. Area/);
    expect(r.notes[0]).toMatch(/^There is no air-quality station in Alandur; the nearest is Velachery Res\. Area \(CPCB\), [\d.]+ km away\.$/);
  });

  it("a day with no reading shows the nearest earlier one, and says so", async () => {
    const r = await collectorSearch("AQI Manali 5 October", { now: NOW });
    expect(r.values[0]).toMatchObject({ title: "Manali (CPCB): AQI 150, Moderate", day: "2026-10-03" });
    expect(r.values[0].sub).toMatch(/^No reading on 5 Oct 2026; 3 Oct 2026/);
  });

  it("worst AQI last month: October's worst station-day, not November's", async () => {
    const r = await collectorSearch("worst AQI last month", { now: NOW });
    expect(r.when?.label).toBe("last month (October)");
    expect(r.values[0]).toMatchObject({ title: "Manali (CPCB): AQI 260, Poor", day: "2026-10-10" });
    expect(r.values.map((v) => v.day)).not.toContain("2026-11-02");
  });
});

describe("market prices on a past day or span", () => {
  it("tomato price 10 Nov: the low and high across the markets, rupees a kilo", async () => {
    const r = await collectorSearch("tomato price 10 Nov", { now: NOW });
    expect(r.values[0]).toMatchObject({ kind: "price", day: "2026-11-10", title: "Tomato: Rs 20 to 32 a kg on 10 Nov 2026" });
    expect(r.values[0].sub).toContain("Middle price Rs 26 at 2 markets");
    expect(r.values[0].source).toMatch(/agrimark\.tn\.gov\.in/);
  });

  it("a day with no report: the nearest earlier report, said so", async () => {
    const r = await collectorSearch("தக்காளி விலை 11 Nov", { now: NOW });
    expect(r.values[0]).toMatchObject({ day: "2026-11-10" });
    expect(r.values[0].sub).toMatch(/^No report on 11 Nov 2026; the nearest earlier report is of 10 Nov 2026\./);
  });

  it("a span: the first and last day's middle price", async () => {
    const r = await collectorSearch("tomato price between 10 Nov and 12 Nov", { now: NOW });
    expect(r.values[0]).toMatchObject({ from: "2026-11-10", to: "2026-11-12", title: "Tomato: Rs 20 to 40 a kg, 10 Nov to 12 Nov 2026" });
    expect(r.values[0].sub).toMatch(/^Middle price Rs 26 on 10 Nov, Rs 35 on 12 Nov \(\+35%\)/);
  });
});

describe("reservoirs on a past day", () => {
  it("a reservoir and a day from the kept history", async () => {
    const r = await collectorSearch("Chembarambakkam level 1 Nov", { now: NOW });
    expect(r.values).toHaveLength(1);
    expect(r.values[0]).toMatchObject({ kind: "lake", day: "2026-11-01", title: "Chembarambakkam: 38.6% full on 1 Nov 2026", url: "https://cmwssb.tn.gov.in/lake-level" });
  });

  it("a day not published: the nearest earlier day, said so", async () => {
    const r = await collectorSearch("Chembarambakkam level 2 Nov", { now: NOW });
    expect(r.values[0]).toMatchObject({ day: "2026-11-01" });
    expect(r.values[0].sub).toMatch(/^No figures for 2 Nov 2026; 1 Nov 2026 · /);
  });

  it("the days lakes.ts holds now are kept with the history (the build step), so none leaves the search", () => {
    expect(Object.keys(lakeDays()).sort()).toEqual(["2026-11-01", "2026-11-03", "2026-11-20"]);
    expect(keepLakeHistory()).toBe(1);
    const kept = JSON.parse(fs.readFileSync(process.env.CMWSSB_HISTORY_FILE!, "utf8"));
    expect(Object.keys(kept.days).sort()).toEqual(["2026-11-01", "2026-11-03", "2026-11-20"]);
    expect(keepLakeHistory()).toBe(0);
  });
});

describe("rain and river gauges", () => {
  it("rain yesterday: IMD's figure read this morning, and the wettest CFM-DSS gauge", async () => {
    const r = await collectorSearch("rain Nungambakkam yesterday", { now: NOW });
    const imd = r.values.find((v) => v.source.startsWith("India Meteorological"));
    expect(imd).toMatchObject({ title: "Nungambakkam: 3 mm, rain day 27 Nov 2026", day: "2026-11-27" });
    const all = await collectorSearch("rain yesterday", { now: NOW });
    expect(all.values.map((v) => v.title)).toContain("Rain gauges, rain day 27 Nov 2026: wettest Tondiarpet, 12 mm");
  });

  it("a gauge named by both its words is that gauge, not every bridge", async () => {
    const r = await collectorSearch("Basin Bridge river level", { now: NOW });
    expect(r.values.map((v) => v.title)).toEqual(["Basin Bridge: 1.62 m on 26 Nov 2026"]);
    const a = await collectorSearch("Aminjikarai river level", { now: NOW });
    expect(a.values[0].sub).toContain("below warning level");
  });
});

describe("the officer lock", () => {
  const calls: unknown[][] = [];
  const deps = {
    recent: async (t: string) => { calls.push(["recent", t]); return []; },
    inRange: async (t: string | null, from: string, to: string) => { calls.push(["range", t, from, to]); return [{ id: "I-OLD" }]; }
  };
  beforeEach(() => { calls.length = 0; });

  it("the department's grievances of the dates searched, and only the news filed into its own cases", async () => {
    const r = await officerSearch({ code: "GCC-SWD", short: "Storm Water Drains" }, ["weather", "lakes"], "kolathur 52 days ago", deps, { now: NOW });
    expect(calls).toEqual([["range", "kolathur", "2026-10-07 00:00:00", "2026-10-08 00:00:00"]]);
    expect(r.rows).toEqual([{ id: "I-OLD" }]);
    expect(r.news.map((n) => n.story ?? n.id)).toEqual(["S-OLD"]);
    expect(JSON.stringify(r.news)).not.toContain("Chain snatching");
    const pol = await officerSearch({ code: "POL-GCP", short: "Police" }, ["police"], "kolathur 52 days ago", deps, { now: NOW });
    expect(pol.news.map((n) => n.id)).toEqual(["D-POL"]);
  });

  it("no date: the last 90 days, as before", async () => {
    await officerSearch({ code: "GCC-SWD", short: "Storm Water Drains" }, ["weather"], "kolathur drain", deps, { now: NOW });
    expect(calls).toEqual([["recent", "kolathur drain"]]);
  });

  it("readings only of the kinds its console uses; another kind is named, not shown", async () => {
    const swd = await officerSearch({ code: "GCC-SWD", short: "Storm Water Drains" }, ["weather", "lakes"], "AQI Velachery 3 October", deps, { now: NOW });
    expect(swd.values).toEqual([]);
    expect(swd.notes).toEqual(["Air-quality readings are not part of the Storm Water Drains console."]);
    const pcb = await officerSearch({ code: "TNPCB", short: "TNPCB" }, ["air"], "AQI Velachery 3 October", deps, { now: NOW });
    expect(pcb.values.map((v) => v.title)).toEqual(["Velachery Res. Area (CPCB): AQI 112, Moderate"]);
    const water = await officerSearch({ code: "CMWSSB", short: "Metrowater" }, ["lakes"], "Chembarambakkam level 1 Nov", deps, { now: NOW });
    expect(water.values.map((v) => v.title)).toEqual(["Chembarambakkam: 38.6% full on 1 Nov 2026"]);
  });
});

describe("the build step's indexes", () => {
  it("adds the metric-and-time index and the incidents' day index once; a column already indexed is left alone", () => {
    expect(searchIndexes(h.db)).toEqual(["ix_search_observations_metric_observed_at", "ix_search_incidents_first_reported_at"]);
    expect(searchIndexes(h.db)).toEqual([]);
    const ix = h.db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'observations'").all().map((x) => String((x as { name: string }).name));
    expect(ix.sort()).toEqual(["ix_observations_metric", "ix_search_observations_metric_observed_at"]);
    const plan = h.db.prepare("EXPLAIN QUERY PLAN SELECT * FROM observations WHERE metric = 'aqi' AND observed_at >= '2026-10-01' AND observed_at < '2026-11-01'").all();
    expect(JSON.stringify(plan)).toContain("ix_search_observations_metric_observed_at");
  });
});
