/**
 * The id handover (the integration review, 27 Nov): a filing is the website's case INC-W-<code> until the hourly pipeline imports it as
 * GRV-<code> inside an incident of its own. The work done on the INC-W case (officer steps and reports, the Collector's decisions,
 * instructions and follow-ups, the petition's link) must follow the filing to that id, or it is orphaned. And a petition the pipeline
 * imported keeps the department, kind, channel and urgency the desk gave it.
 *
 * On a build as the AWS store makes it: an in-memory database with the durable store attached as `durable` (lib/aws/store.ts buildDb), so
 * the moved rows land in the durable file, where they are saved.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[], []] }, ops: (t: string) => t, TITLE: "i.title" }));

const { websiteCases, adoptPipelineIds, caseIdFor } = await import("./cases");

let db: DatabaseSync;
const one = (sql: string, ...p: unknown[]) => db.prepare(sql).get(...(p as never[])) as Record<string, any>;
const all = (sql: string, ...p: unknown[]) => db.prepare(sql).all(...(p as never[])) as Record<string, any>[];
const wrap = { all: async (sql: string, p: unknown[] = []) => db.prepare(sql).all(...(p as never[])) as Record<string, any>[], run: async (sql: string, p: unknown[] = []) => void db.prepare(sql).run(...(p as never[])) };

const ONLINE = "2026-119FJQ", PETITION = "2026-559YXF";
const W = caseIdFor(ONLINE), PIPE = "INC-20261109-5D433C", PIPE_P = "INC-20261109-A6AD90";

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(`ATTACH DATABASE ':memory:' AS durable`);
  // the build (main)
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, category_code TEXT, category_label TEXT, family TEXT, lead_dept TEXT, depts_involved TEXT, first_reported_at TEXT, last_update_at TEXT,
      ward_no INT, zone_no INT, zone_name TEXT, taluk_code TEXT, lat REAL, lon REAL, place_text TEXT, member_count INT, sources TEXT, channels TEXT, citizen_complaints INT, status_std TEXT,
      is_open INT, severity_level TEXT, severity_score REAL, severity_reasons TEXT, sla_hours REAL, sla_due_at TEXT, priority_score REAL, attention_flag INT, attention_reason TEXT, title TEXT,
      recurrence_90d INT);
    CREATE TABLE events (event_id TEXT PRIMARY KEY, source TEXT, source_record_id TEXT, incident_id TEXT, channel TEXT, lead_dept TEXT, title TEXT);
    CREATE TABLE incident_members (incident_id TEXT, event_id TEXT, source TEXT, source_record_id TEXT, channel TEXT, reported_at TEXT, title TEXT);
    CREATE TABLE incident_timeline (event_id TEXT, at TEXT, step TEXT, status_std TEXT, actor TEXT, note TEXT, source TEXT, incident_id TEXT);
    CREATE TABLE ref_wards (ward_no INT PRIMARY KEY, zone_no INT, zone_name TEXT, taluk_code TEXT, centroid_lat REAL, centroid_lon REAL);
    INSERT INTO ref_wards VALUES (70, 6, 'Thiru-Vi-Ka-Nagar', 'TLK-PER', 13.11, 80.23);
    CREATE TABLE ref_categories (category_code TEXT PRIMARY KEY, label TEXT, family TEXT);
    INSERT INTO ref_categories VALUES ('DRAINAGE_SEWAGE', 'Drainage & sewage', 'DRAINAGE'), ('OTHER', 'Other', 'OTHER');`);
  // the durable store (attached)
  db.exec(`
    CREATE TABLE durable.officer_steps (step_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, step TEXT, note TEXT, report_id INT, actor TEXT, at TEXT);
    CREATE TABLE durable.officer_reports (report_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, remarks TEXT, photo_dir TEXT, photos TEXT, sent_at TEXT);
    CREATE TABLE durable.collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, note TEXT, decided_role TEXT, decided_at TEXT);
    CREATE TABLE durable.outbound_emails (email_id INTEGER PRIMARY KEY, incident_id TEXT, subject TEXT);
    CREATE TABLE durable.followups (followup_id INTEGER PRIMARY KEY, email_id INT, incident_id TEXT, summary TEXT, status TEXT);
    CREATE TABLE durable.dept_assignments (incident_id TEXT PRIMARY KEY, dept_code TEXT);
    CREATE TABLE durable.audit_log (log_id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, table_name TEXT NOT NULL, record_id TEXT, before_value TEXT, after_value TEXT);
    CREATE TABLE durable.petitions (id INTEGER PRIMARY KEY, status TEXT, complaint_code TEXT, incident_id TEXT, attached INT DEFAULT 0, dept_code TEXT, category_code TEXT, urgent INT,
      problem TEXT, request TEXT, language TEXT, ward_number INT, area TEXT, mobile TEXT, filed_at TEXT, due_at TEXT, recurrence INT);`);
  // the work done in the first hour, on the website's case
  db.exec(`
    INSERT INTO durable.officer_steps (incident_id, dept_code, step, at) VALUES ('${W}', 'GCC-SWD', 'approve', '2026-11-09 11:00:00'), ('${W}', 'GCC-SWD', 'close', '2026-11-09 12:00:00');
    INSERT INTO durable.officer_reports (incident_id, dept_code, remarks, photo_dir, photos) VALUES ('${W}', 'GCC-SWD', 'Drain cleared', 'd1', '["1.jpg"]');
    INSERT INTO durable.collector_decisions (incident_id, decision, decided_role, decided_at) VALUES ('${W}', 'resolve', 'department_officer', '2026-11-09 12:00:00');
    INSERT INTO durable.outbound_emails (incident_id, subject) VALUES ('${W}', 'Clear the drain');
    INSERT INTO durable.followups (email_id, incident_id, summary, status) VALUES (1, '${W}', 'Completion report with photos from SWD', 'pending');
    INSERT INTO durable.dept_assignments VALUES ('${W}', 'GCC-SWD');
    INSERT INTO durable.audit_log (actor, action, table_name, record_id) VALUES ('swd@x', 'officer:close', 'officer_steps', '${W}');`);
});

/** the hourly pipeline's build: the online complaint inside an incident of its own */
const pipelineHas = (code: string, inc: string, o: Record<string, unknown> = {}) => {
  const r = { incident_id: inc, category_code: "OTHER", category_label: "Other", family: "OTHER", lead_dept: "GCC-SWD", depts_involved: "GCC-SWD", first_reported_at: "2026-11-09 10:00:00",
    ward_no: 70, member_count: 1, sources: "grievance", channels: "citizen_app", citizen_complaints: 1, status_std: "Open", is_open: 1, severity_level: "Low", severity_score: 20,
    sla_hours: 360, sla_due_at: "2026-11-24 10:00:00", priority_score: 30, attention_flag: 0, title: "Drain blocked", ...o };
  const k = Object.keys(r);
  db.prepare(`INSERT INTO incidents (${k.join(", ")}) VALUES (${k.map(() => "?").join(", ")})`).run(...(Object.values(r) as never[]));
  db.prepare(`INSERT INTO events (event_id, source, source_record_id, incident_id, channel, lead_dept) VALUES (?, 'grievance', ?, ?, 'citizen_app', ?)`).run(`GRV-${code}`, code, inc, String(r.lead_dept));
  db.prepare(`INSERT INTO incident_members (incident_id, event_id, source, source_record_id, channel) VALUES (?, ?, 'grievance', ?, 'citizen_app')`).run(inc, `GRV-${code}`, code);
};

describe("the id handover: the work on a website case follows the filing to the build's id", () => {
  it("every row on INC-W moves to the pipeline's incident, in the durable store; the audit log keeps its history", async () => {
    pipelineHas(ONLINE, PIPE);
    expect(await adoptPipelineIds(wrap)).toBe(1);
    for (const t of ["officer_steps", "officer_reports", "collector_decisions", "outbound_emails", "followups", "dept_assignments"]) {
      expect(all(`SELECT DISTINCT incident_id AS id FROM durable.${t}`), t).toEqual([{ id: PIPE }]);
    }
    expect(one(`SELECT COUNT(*) AS n FROM durable.officer_steps WHERE incident_id = ?`, PIPE).n).toBe(2);
    expect(one(`SELECT record_id FROM durable.audit_log ORDER BY log_id`).record_id).toBe(W);
    // the handover itself is audited: the old id, the new one and what moved, so the work's own audit rows (on INC-W) can be followed
    const h = one(`SELECT actor, action, record_id, before_value, after_value FROM durable.audit_log WHERE action = 'case:handover'`);
    expect(h).toMatchObject({ action: "case:handover", record_id: PIPE });
    expect(JSON.parse(h.before_value)).toEqual({ incident_id: W });
    expect(JSON.parse(h.after_value)).toEqual({ incident_id: PIPE, complaint_code: ONLINE,
      rows: { officer_steps: 2, officer_reports: 1, collector_decisions: 1, outbound_emails: 1, followups: 1, dept_assignments: 1 } });
    // a second run moves nothing and audits nothing
    expect(await adoptPipelineIds(wrap)).toBe(0);
    expect(one(`SELECT COUNT(*) AS n FROM durable.audit_log WHERE action = 'case:handover'`).n).toBe(1);
  });

  it("runs as the first build step, and a second run moves nothing (idempotent)", async () => {
    pipelineHas(ONLINE, PIPE);
    await websiteCases(db);
    expect(all(`SELECT DISTINCT incident_id AS id FROM durable.officer_steps`)).toEqual([{ id: PIPE }]);
    // the pipeline holds the filing: no INC-W case is added next to it
    expect(one(`SELECT COUNT(*) AS n FROM incidents WHERE incident_id = ?`, W).n).toBe(0);
    expect(await adoptPipelineIds(wrap)).toBe(0);
    expect(one(`SELECT COUNT(*) AS n FROM durable.officer_steps WHERE incident_id = ?`, PIPE).n).toBe(2);
  });

  it("a build step told not to hand over (a build not served yet) leaves the rows for the run on the served build", async () => {
    pipelineHas(ONLINE, PIPE);
    await websiteCases(db, { handover: false });
    expect(all(`SELECT DISTINCT incident_id AS id FROM durable.officer_steps`)).toEqual([{ id: W }]);
    await websiteCases(db);
    expect(all(`SELECT DISTINCT incident_id AS id FROM durable.officer_steps`)).toEqual([{ id: PIPE }]);
  });

  it("nothing moves while the build still holds the website's case, or has no case for the filing", async () => {
    expect(await adoptPipelineIds(wrap)).toBe(0); // no event for the filing yet
    db.prepare(`INSERT INTO incidents (incident_id, lead_dept) VALUES (?, 'GCC-SWD')`).run(W);
    db.prepare(`INSERT INTO events (event_id, source, source_record_id, incident_id) VALUES (?, 'grievance', ?, ?)`).run(`GRV-${ONLINE}`, ONLINE, W);
    expect(await adoptPipelineIds(wrap)).toBe(0);
    // an event pointing at an incident the build does not have
    db.exec(`DELETE FROM incidents; DELETE FROM events`);
    db.prepare(`INSERT INTO events (event_id, source, source_record_id, incident_id) VALUES (?, 'grievance', ?, 'INC-GONE')`).run(`GRV-${ONLINE}`, ONLINE);
    expect(await adoptPipelineIds(wrap)).toBe(0);
    expect(one(`SELECT COUNT(*) AS n FROM durable.officer_steps WHERE incident_id = ?`, W).n).toBe(2);
  });

  it("a case keyed table keeps the row the new id already has", async () => {
    pipelineHas(ONLINE, PIPE);
    db.exec(`INSERT INTO durable.dept_assignments VALUES ('${PIPE}', 'GCC-ENG')`);
    await adoptPipelineIds(wrap);
    expect(all(`SELECT * FROM durable.dept_assignments`)).toEqual([{ incident_id: PIPE, dept_code: "GCC-ENG" }]);
  });

  it("a petition attached to the website case follows it, and so do its petition links", async () => {
    pipelineHas(ONLINE, PIPE);
    db.exec(`INSERT INTO durable.petitions (status, complaint_code, incident_id, attached, dept_code, category_code, urgent, problem, ward_number, filed_at, due_at)
      VALUES ('filed', '2026-777PET', '${W}', 1, 'GCC-SWD', 'DRAINAGE_SEWAGE', 0, 'Drain blocked again', 70, '2026-11-09 13:00:00', '2026-11-24 13:00:00')`);
    await websiteCases(db);
    expect(one(`SELECT incident_id FROM durable.petitions WHERE complaint_code = '2026-777PET'`).incident_id).toBe(PIPE);
    // and the petition joins that case in this build (it is not in the pipeline yet)
    expect(one(`SELECT incident_id FROM events WHERE source_record_id = '2026-777PET'`).incident_id).toBe(PIPE);
    expect(one(`SELECT member_count FROM incidents WHERE incident_id = ?`, PIPE).member_count).toBe(2);
  });

  it("the build without durable attached (a single database) works the same", async () => {
    const solo = new DatabaseSync(":memory:");
    solo.exec(`CREATE TABLE incidents (incident_id TEXT PRIMARY KEY); CREATE TABLE events (event_id TEXT, source TEXT, source_record_id TEXT, incident_id TEXT);
      CREATE TABLE officer_steps (incident_id TEXT, step TEXT); INSERT INTO incidents VALUES ('${PIPE}');
      INSERT INTO events VALUES ('GRV-${ONLINE}', 'grievance', '${ONLINE}', '${PIPE}'); INSERT INTO officer_steps VALUES ('${W}', 'approve');`);
    const w2 = { all: async (sql: string, p: unknown[] = []) => solo.prepare(sql).all(...(p as never[])) as Record<string, any>[], run: async (sql: string, p: unknown[] = []) => void solo.prepare(sql).run(...(p as never[])) };
    expect(await adoptPipelineIds(w2)).toBe(1);
    expect(solo.prepare(`SELECT incident_id FROM officer_steps`).get()).toEqual({ incident_id: PIPE });
  });
});

describe("a petition the pipeline imported keeps what the desk gave it", () => {
  const petition = (o: Record<string, unknown> = {}) => {
    const r = { status: "filed", complaint_code: PETITION, incident_id: caseIdFor(PETITION), attached: 0, dept_code: "CMWSSB", category_code: "DRAINAGE_SEWAGE", urgent: 1,
      problem: "Sewage overflowing on the street", ward_number: 70, area: "Perambur", filed_at: "2026-11-09 10:00:00", due_at: "2026-11-11 10:00:00", ...o };
    const k = Object.keys(r);
    db.prepare(`INSERT INTO durable.petitions (${k.join(", ")}) VALUES (${k.map(() => "?").join(", ")})`).run(...(Object.values(r) as never[]));
  };

  it("department, kind, Manu channel, at least High when urgent, and the petitioner's deadline", async () => {
    petition();
    pipelineHas(PETITION, PIPE_P, { lead_dept: "GCC-GAD", depts_involved: "GCC-GAD" });
    await websiteCases(db);
    expect(one(`SELECT * FROM incidents WHERE incident_id = ?`, PIPE_P)).toMatchObject({
      lead_dept: "CMWSSB", depts_involved: "CMWSSB", category_code: "DRAINAGE_SEWAGE", category_label: "Drainage & sewage", channels: "manu", severity_level: "High",
      attention_flag: 1, priority_score: 90, sla_due_at: "2026-11-11 10:00:00", sla_hours: 48
    });
    expect(one(`SELECT channel, lead_dept FROM events WHERE event_id = ?`, `GRV-${PETITION}`)).toEqual({ channel: "manu", lead_dept: "CMWSSB" });
    expect(one(`SELECT channel FROM incident_members WHERE event_id = ?`, `GRV-${PETITION}`).channel).toBe("manu");
    // no second case for the petition
    expect(one(`SELECT COUNT(*) AS n FROM incidents`).n).toBe(1);
    // the petition's own link follows too (it was INC-W): the scans show on the pipeline's case
    expect(one(`SELECT incident_id FROM durable.petitions`).incident_id).toBe(PIPE_P);
  });

  it("a non-urgent petition keeps the pipeline's severity and a sooner deadline of the case's own", async () => {
    petition({ urgent: 0, due_at: "2026-11-30 10:00:00" });
    pipelineHas(PETITION, PIPE_P, { lead_dept: "GCC-GAD", severity_level: "Medium" });
    await websiteCases(db);
    expect(one(`SELECT lead_dept, severity_level, sla_due_at, attention_flag FROM incidents`)).toEqual({ lead_dept: "CMWSSB", severity_level: "Medium", sla_due_at: "2026-11-24 10:00:00", attention_flag: 0 });
  });

  it("a case that holds other reports too is the pipeline's to judge: left alone", async () => {
    petition();
    pipelineHas(PETITION, PIPE_P, { lead_dept: "GCC-GAD", member_count: 2 });
    db.prepare(`INSERT INTO incident_members (incident_id, event_id, source, source_record_id, channel) VALUES (?, 'GRV-2026-000OTH', 'grievance', '2026-000OTH', 'citizen_app')`).run(PIPE_P);
    await websiteCases(db);
    expect(one(`SELECT lead_dept, channels, severity_level FROM incidents`)).toEqual({ lead_dept: "GCC-GAD", channels: "citizen_app", severity_level: "Low" });
  });

  it("the petition's paper work done on its INC-W case follows it to the pipeline's case", async () => {
    petition();
    db.exec(`INSERT INTO durable.officer_steps (incident_id, dept_code, step, at) VALUES ('${caseIdFor(PETITION)}', 'CMWSSB', 'approve', '2026-11-09 11:00:00')`);
    pipelineHas(PETITION, PIPE_P, { lead_dept: "GCC-GAD" });
    await websiteCases(db);
    expect(one(`SELECT incident_id FROM durable.petitions`).incident_id).toBe(PIPE_P);
    expect(one(`SELECT incident_id FROM durable.officer_steps WHERE dept_code = 'CMWSSB'`).incident_id).toBe(PIPE_P);
    // and the department that approved it sees it: the case is the petition's department's again
    expect(one(`SELECT lead_dept FROM incidents WHERE incident_id = ?`, PIPE_P).lead_dept).toBe("CMWSSB");
  });
});
