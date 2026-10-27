/**
 * One metric, one number on every page (LT-07, LT-37): My Tasks on the Overview and "waiting for your check" in the
 * Briefing are the same rule (metrics.ts awaiting_check, intel.ts awaitingCheck), on an isolated in-memory store
 * through the AWS store's MySQL -> SQLite translation. Before, the Briefing counted every open item flagged for the
 * Collector (128) while My Tasks showed 0.
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
process.env.SACHET_OFF = "1";

const { awaitingCheck, kpiBlock, list } = await import("./intel");
const { briefingBook } = await import("./briefbook");
const { METRICS, caption, changeWords, labelled, pctChange } = await import("@/lib/reference/metrics");

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
      police_reports INTEGER, last_update_at TEXT, closed_at TEXT, dead INTEGER, injured INTEGER, member_count INTEGER,
      ai_summary TEXT, ai_attention TEXT, ai_next_step TEXT);
    CREATE TABLE ref_departments (code TEXT, name TEXT, head TEXT);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT, decided_by TEXT, decided_at TEXT);
    CREATE TABLE dept_assignments (incident_id TEXT);
    CREATE TABLE documents (doc_id TEXT, story_id TEXT, linked_incident_id TEXT, publisher TEXT, title TEXT, title_en TEXT, url TEXT, outlet_count INTEGER,
      published_at TEXT, source_kind TEXT, is_district INTEGER, is_incident INTEGER, report_type TEXT);
    CREATE TABLE observation_signals (metric TEXT, value REAL, detail TEXT, place_name TEXT);
    CREATE TABLE observations (source TEXT, metric TEXT, value REAL, detail TEXT, place_name TEXT, observed_at TEXT);
    CREATE TABLE briefing_notes (section TEXT, item_key TEXT, text_en TEXT, text_ta TEXT, extra TEXT, written_for TEXT);
    CREATE TABLE metrics (metric TEXT, value TEXT);
    CREATE TABLE incident_members (incident_id TEXT, source TEXT);
    CREATE TABLE outbound_emails (email_id INTEGER PRIMARY KEY, incident_id TEXT, created_at TEXT);
    ATTACH ':memory:' AS information_schema;
    CREATE TABLE information_schema.tables (table_schema TEXT, table_name TEXT);
    INSERT INTO ref_departments VALUES ('GCC-SWD', 'Storm Water Drains', 'Superintending Engineer');`);
  const ins = db.prepare(`INSERT INTO incidents (incident_id, title, cluster_id, lead_dept, zone_no, zone_name, category_code, category_label, severity_level,
    status_std, is_open, verified, citizen_complaints, first_reported_at, sla_breached, media_only, awaiting_collector, last_update_at, priority_score)
    VALUES (?, ?, ?, 'GCC-SWD', 9, 'Teynampet', 'DRAINAGE_SEWAGE', 'Drainage', ?, ?, 1, 0, ?, ?, 0, 0, ?, ?, 1)`);
  // closed by the department, waiting for a check: two reports of one severe drain (one task), a medium one (left to the
  // department), and one the Collector has already verified
  ins.run("INC-1", "Drain overflow", "G-1", "Severe", "Awaiting verification", 2, ist(30), 1, ist(3));
  ins.run("INC-2", "Drain overflow again", "G-1", "Severe", "Awaiting verification", 1, ist(30), 1, ist(2));
  ins.run("INC-3", "Garbage", null, "Medium", "Awaiting verification", 1, ist(30), 1, ist(4));
  ins.run("INC-4", "Collapsed slab", null, "Severe", "Awaiting verification", 1, ist(30), 1, ist(5));
  // flagged for the Collector but with no citizen complaint: the old Briefing figure counted it
  ins.run("INC-5", "Police report", null, "High", "Open", 0, ist(10), 1, ist(10));
  db.exec(`INSERT INTO collector_decisions (incident_id, decision, decided_at) VALUES ('INC-4', 'verify', '${ist(1)}')`);
  return db;
}

const S = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null };

describe("one rule for 'waiting for your check' (LT-07)", () => {
  beforeEach(() => { h.db = fresh(); });

  it("My Tasks counts severe closures once per group; the rest are left to departments", async () => {
    expect(await awaitingCheck(S, ist(0))).toEqual({ n: 1, leftToDepts: 1 });
  });

  it("the Briefing shows the same figure as My Tasks", async () => {
    const now = ist(0);
    const [tasks, book] = await Promise.all([awaitingCheck(S, now), briefingBook({ ...S }, now, null)]);
    expect(book.glance.tiles.awaiting).toBe(tasks.n);
    expect(book.glance.tiles.leftToDepts).toBe(tasks.leftToDepts);
  });

  it("the severe tile and the severe list give one number (LT-37)", async () => {
    const now = ist(0);
    h.db.exec(`UPDATE incidents SET first_reported_at = '${ist(2)}'`);
    const k = await kpiBlock(S, now);
    expect(k.cur.severe).toBe((await list({ period: "daily", zone: null, dept: null, sev: "Severe", status: null, cat: null, taluk: null, place: null, q: null,
      sort: "t", dir: -1, page: 0, scope: "period" })).incidents);
    expect(k.cur.severe).toBe(3);
  });
});

describe("every figure says what it counts and over which window (LT-08)", () => {
  it("past deadline: the tile's 24 hours and the any-date figure are told apart", () => {
    expect(labelled("past_deadline", "daily")).toBe("Past deadline, still open · reported in the last 24 hours");
    expect(labelled("past_deadline_any", "daily")).toBe("Past deadline, any date · any date");
    expect(caption("awaiting_check", "weekly")).toMatch(/updated in the last 7 days$/);
    for (const m of Object.values(METRICS)) expect(m.measure.length).toBeGreaterThan(5);
  });
  it("no percentage on a small base (LT-10)", () => {
    expect(pctChange(26, 3)).toBeNull();
    expect(changeWords(26, 3, "incidents")).toBe("26 incidents, against 3 in the period before");
    expect(pctChange(120, 100)).toBe(20);
    expect(changeWords(120, 100)).toBe("up 20% on the period before");
  });
});
