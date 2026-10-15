/**
 * The same scope gives the same numbers everywhere: a KPI tile, the list it opens, and the snapshot beside it. On an
 * isolated in-memory store through the AWS store's MySQL -> SQLite translation, with grouped incidents (cluster_id) and
 * a Collector decision on top of the pipeline's status.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const pool = {
  query: async (sql: string, params: unknown[] = []) => {
    const [s, p] = expand(translate(sql), params);
    const st = h.db.prepare(s);
    return /^\s*(SELECT|WITH)/i.test(s) ? [st.all(...(p as never[]))] : [{ affectedRows: Number(st.run(...(p as never[])).changes) }];
  }
};
vi.mock("@/lib/collector/db", () => ({
  default: pool, ops: (t: string) => t, OPS_DB: "district_intel_ops", TITLE: "i.title", CLUSTER: "COALESCE(i.cluster_id, i.incident_id)"
}));
vi.mock("@/lib/db", () => ({ default: pool }));

const { kpiBlock, list, snapCommon } = await import("./intel");

const ist = (hoursAgo: number) => new Date(Date.now() + 330 * 60_000 - hoursAgo * 3600_000).toISOString().slice(0, 19).replace("T", " ");

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, cluster_id TEXT, category_label TEXT, category_code TEXT, family TEXT,
      lead_dept TEXT, zone_no INTEGER, zone_name TEXT, ward_no INTEGER, taluk_code TEXT, place_text TEXT, lat REAL, lon REAL,
      severity_level TEXT, status_std TEXT, is_open INTEGER, verified INTEGER, citizen_complaints INTEGER, outlet_count INTEGER, sources TEXT,
      source_count INTEGER, channels TEXT, first_reported_at TEXT, summary TEXT, priority_score REAL, sla_breached INTEGER, hours_open REAL,
      severity_reasons TEXT, priority_reasons TEXT, attention_reason TEXT, officer TEXT, media_only INTEGER, awaiting_collector INTEGER,
      police_reports INTEGER, last_update_at TEXT, ai_summary TEXT, ai_attention TEXT, ai_next_step TEXT);
    CREATE TABLE ref_departments (code TEXT, name TEXT);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT,
      decided_by TEXT, decided_at TEXT);
    CREATE TABLE dept_assignments (incident_id TEXT);
    CREATE TABLE outbound_emails (email_id INTEGER PRIMARY KEY, incident_id TEXT, created_at TEXT);
    CREATE TABLE incident_members (incident_id TEXT, source TEXT);
    CREATE TABLE documents (doc_id TEXT, story_id TEXT, linked_incident_id TEXT, publisher TEXT);
    CREATE TABLE metrics (metric TEXT, value TEXT);
    INSERT INTO ref_departments VALUES ('GCC-SWD', 'Storm Water Drains');`);
  const ins = db.prepare(`INSERT INTO incidents (incident_id, title, cluster_id, lead_dept, zone_no, zone_name, severity_level, status_std, is_open,
    verified, citizen_complaints, first_reported_at, sla_breached, media_only, awaiting_collector, last_update_at, priority_score)
    VALUES (?, ?, ?, 'GCC-SWD', 9, 'Teynampet', ?, 'Open', 1, 0, ?, ?, ?, 0, 0, ?, 1)`);
  // two reports of one drain in one area (one group), two other open incidents, one past its deadline
  ins.run("INC-1", "Drain overflow", "G-1", "Severe", 2, ist(3), 1, ist(3));
  ins.run("INC-2", "Drain overflow again", "G-1", "High", 1, ist(2), 0, ist(2));
  ins.run("INC-3", "Garbage", null, "Medium", 0, ist(5), 1, ist(5));
  ins.run("INC-4", "Streetlight", null, "Low", 3, ist(6), 0, ist(6));
  // outside the 24-hour window
  ins.run("INC-5", "Old one", null, "Severe", 1, ist(40), 1, ist(40));
  return db;
}

const S = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null };
const L = { period: "daily" as const, zone: null, dept: null, sev: null, cat: null, taluk: null, place: null, q: null,
  sort: "t" as const, dir: -1, page: 0, scope: "period" as const };

describe("tiles, lists and snapshot agree on one scope", () => {
  beforeEach(() => { h.db = fresh(); });

  it("the ongoing tile and its list count the same incidents, even when two are one group", async () => {
    const now = ist(0);
    const k = await kpiBlock(S, now);
    const l = await list({ ...L, status: "open" });
    expect(k.cur.ongoing).toBe(4);
    expect(l.incidents).toBe(k.cur.ongoing);
    expect(l.total).toBe(3); // rows: the two drain reports are one row
    expect(l.complaints).toBe(k.cur.complaints);
  });

  it("past-deadline and severe numbers match their lists", async () => {
    const now = ist(0);
    const snap = await snapCommon(S, now);
    expect(snap.overdue).toBe((await list({ ...L, status: "overdue" })).incidents);
    expect((await kpiBlock(S, now)).cur.severe).toBe((await list({ ...L, sev: "Severe", status: null })).incidents);
  });

  it("a Collector's 'resolve' takes the incident out of every open number at once", async () => {
    h.db.exec(`INSERT INTO collector_decisions (incident_id, decision, decided_at) VALUES ('INC-3', 'resolve', '${ist(1)}')`);
    const now = ist(0);
    const [k, snap, open, overdue] = await Promise.all([kpiBlock(S, now), snapCommon(S, now), list({ ...L, status: "open" }),
      list({ ...L, status: "overdue" })]);
    expect(k.cur.ongoing).toBe(3);
    expect(open.incidents).toBe(3);
    expect(snap.overdue).toBe(1);
    expect(overdue.incidents).toBe(1);
    expect(k.cur.resolved).toBe(1);
    expect((await list({ ...L, status: "Resolved" })).incidents).toBe(1);
  });
});
