/**
 * BE-001 end to end on an isolated in-memory store (no team data, no real key): the job route refuses requests
 * without the key, and with it routes news complaints to the department, auditing each assignment added or withdrawn
 * as "District IQ news monitor". SQL goes through the AWS store's own MySQL -> SQLite translation.
 */
import { DatabaseSync } from "node:sqlite";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ db: null as any, writes: [] as string[] }));

vi.mock("@/lib/collector/db", async () => {
  const d = await import("@/lib/aws/dialect");
  d.setDatabaseNames(["district_intel", "district_intel_ops"]);
  const query = async (sql: string, params: unknown[] = []) => {
    const [s, p] = d.expand(d.translate(sql), params);
    const st = h.db.prepare(s);
    if (/^\s*(SELECT|WITH)\b/i.test(s)) return [st.all(...p)];
    h.writes.push(s.trim().split(/\s+/).slice(0, 3).join(" "));
    const r = st.run(...p);
    return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
  };
  return {
    default: { query }, INTEL_DB: "district_intel", OPS_DB: "district_intel_ops",
    TITLE: "i.title", CLUSTER: "i.incident_id", ops: (t: string) => `\`district_intel_ops\`.\`${t}\``
  };
});

import { POST } from "./route";

const KEY = "test-job-key-for-this-test-only";
const post = (key?: string) =>
  POST(new NextRequest("http://localhost/api/collector/jobs/route-news", { method: "POST", headers: key == null ? {} : { "x-job-key": key } }));

async function seed() {
  const db = new DatabaseSync(":memory:");
  (await import("@/lib/aws/dialect")).registerFunctions(db);
  db.exec(`
    CREATE TABLE metrics (metric TEXT, value TEXT);
    INSERT INTO metrics VALUES ('as_of', '"2026-10-12T10:00:00"');
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, lead_dept TEXT, category_label TEXT, category_code TEXT, zone_name TEXT,
      is_open INTEGER, media_only INTEGER, first_reported_at TEXT);
    CREATE TABLE documents (doc_id TEXT, linked_incident_id TEXT, report_type TEXT, is_incident INTEGER);
    CREATE TABLE dept_assignments (incident_id TEXT PRIMARY KEY, dept_code TEXT, contact_id INTEGER, officer_name TEXT,
      officer_designation TEXT, officer_phone TEXT, reason TEXT, status TEXT DEFAULT 'Assigned', assigned_by TEXT, assigned_at TEXT);
    CREATE TABLE official_contacts (contact_id INTEGER, dept_code TEXT, name TEXT, designation TEXT, phone TEXT, "rank" INTEGER);
    CREATE TABLE ref_departments (code TEXT, head TEXT);
    CREATE TABLE audit_log (log_id INTEGER PRIMARY KEY, at TEXT, actor TEXT, action TEXT, table_name TEXT, record_id TEXT, before_value TEXT, after_value TEXT);
    INSERT INTO incidents VALUES ('INC-1', 'GCC-SWM', 'Garbage', 'SOLID_WASTE', 'Adyar', 1, 1, '2026-10-11 09:00:00');
    INSERT INTO incidents VALUES ('INC-2', 'GCC-SWM', 'Garbage', 'SOLID_WASTE', 'Adyar', 1, 1, '2026-10-11 09:00:00');
    INSERT INTO documents VALUES ('d1', 'INC-1', 'civic_complaint', 1);
    INSERT INTO documents VALUES ('d2', 'INC-2', 'announcement', 0);
    INSERT INTO official_contacts VALUES (7, 'GCC-SWM', 'A. Officer', 'Superintending Engineer', '044-1', 1);
    INSERT INTO ref_departments VALUES ('GCC-SWM', 'Chief Engineer (SWM)');
    -- an automatic assignment that no longer qualifies, and one an officer acknowledged (left alone)
    INSERT INTO dept_assignments (incident_id, dept_code, reason, status, assigned_by) VALUES ('INC-2', 'GCC-SWM', 'old', 'Assigned', 'District IQ news monitor');
    INSERT INTO dept_assignments (incident_id, dept_code, reason, status, assigned_by) VALUES ('INC-9', 'GCC-SWM', 'old', 'Acknowledged', 'District IQ news monitor');
  `);
  return db;
}

describe("news routing job (BE-001)", () => {
  beforeEach(async () => {
    h.db = await seed();
    h.writes = [];
    process.env.REFRESH_API_KEY = KEY;
  });

  it("refuses a missing or wrong key and writes nothing", async () => {
    for (const k of [undefined, "", "wrong", KEY + "x"]) expect((await post(k)).status).toBe(401);
    expect(h.writes).toEqual([]);
  });

  it("refuses everything when the server has no key", async () => {
    process.env.REFRESH_API_KEY = "";
    expect((await post("")).status).toBe(401);
    expect((await post("anything")).status).toBe(401);
    expect(h.writes).toEqual([]);
  });

  it("routes with the key, auditing each assignment added and withdrawn", async () => {
    const res = await post(KEY);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, candidates: 1, added: 1, withdrawn: 1 });
    const rows = h.db.prepare(`SELECT incident_id, status, officer_name, assigned_by FROM dept_assignments ORDER BY incident_id`).all();
    expect(rows).toEqual([
      { incident_id: "INC-1", status: "Assigned", officer_name: "A. Officer", assigned_by: "District IQ news monitor" },
      { incident_id: "INC-9", status: "Acknowledged", officer_name: null, assigned_by: "District IQ news monitor" }
    ]);
    const log = h.db.prepare(`SELECT actor, action, table_name, record_id, before_value, after_value FROM audit_log ORDER BY log_id`).all();
    expect(log.map((l: any) => [l.actor, l.action, l.table_name, l.record_id])).toEqual([
      ["District IQ news monitor", "withdraw_assignment", "dept_assignments", "INC-2"],
      ["District IQ news monitor", "assign", "dept_assignments", "INC-1"]
    ]);
    expect(JSON.parse(log[0].before_value)).toMatchObject({ incident_id: "INC-2", status: "Assigned" });
    expect(JSON.parse(log[1].after_value)).toMatchObject({ incident_id: "INC-1", dept_code: "GCC-SWM", officer_name: "A. Officer" });

    // a second run changes nothing and audits nothing
    const again = await post(KEY);
    expect(await again.json()).toEqual({ ok: true, candidates: 1, added: 0, withdrawn: 0 });
    expect(h.db.prepare(`SELECT COUNT(*) AS n FROM audit_log`).get().n).toBe(2);
  });
});
